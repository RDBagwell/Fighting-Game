# Security

Dusk Duel's online play is peer to peer: the two players' browsers run the
game, and a small server pairs them up. This document describes what that
means for trust, what we defend against, and how. The server follows the
same patterns as [Netcode Pong](https://github.com/RDBagwell/netcode-pong/blob/master/SECURITY.md)
and [Chat Mafia](https://github.com/RDBagwell/Chat_Mafia_Game/blob/main/SECURITY.md).

**Reporting a vulnerability:** please open a private security advisory on
GitHub (**Security** tab → **Report a vulnerability**) rather than a public
issue.

## The P2P trust model

This is the key difference from Netcode Pong, where the server runs the
only game that counts.

**The server never runs the game.** It pairs players, holds their seats,
passes WebRTC signalling between them, and relays input packets when they
can't connect directly. It never sees or decides game state: there is no
message in [`shared/protocol.js`](shared/protocol.js) that carries a
position, health, a hit or a result the server acts on. It forwards
signalling and relayed packets without reading them.

**Each player's browser runs the whole simulation**, from the inputs of
both players
([ROLLBACK.md](docs/ROLLBACK.md)). The consequences, honestly:

| A modified client can… | …because | What limits it |
|---|---|---|
| Send any input a real controller could | Inputs are just 8 bits per frame | Nothing: input automation (a bot playing for you) can't be told apart from a person, in any online game |
| **Not** change the other player's game: their health, position or the result | The other player simulates every frame themselves, from inputs. There's no "I hit you for 9000" message to forge | Determinism: the only thing that crosses is inputs |
| Run a different simulation on its own side (infinite health on its own screen) | It's their own computer | The two simulations then disagree, and the **desync check** catches it within 30 frames (half a second): both players see a notice ([`RollbackSession.checksums`](src/engine/rollback/RollbackSession.js)) |
| Lie about the end of the match | `matchOver` only unlocks the rematch buttons; the server records nothing | There is no ranking, no record and nothing to win |
| See the opponent's inputs a few frames early | That's how rollback works: both sides have both inputs | Inputs are scheduled with a delay, so you only ever learn what they already pressed. Reacting to an input you received is the same as reacting to the move on screen |
| Delay its own inputs on purpose ("lag switch") | It controls when it sends | The rollback window (8 frames): beyond it, *both* sides stall, so lagging doesn't give the cheater frames the other side doesn't have. A peer that goes silent leaves the other player on "Waiting for your opponent's inputs…", from which they can leave at any time; a dropped connection pauses the match and forfeits it after 30 s |
| Learn the other player's IP address | WebRTC connects the two browsers directly | Unavoidable for P2P. It's in the privacy note (README); the relay hides it only when the direct path fails |

Because nothing rides on a result (no accounts, no rankings, no prizes),
this is an acceptable trade for a two-player game where single frames
matter. A ranked mode would need a referee: a server that re-simulates
each match from both players' input logs. The replay format already makes
that possible.

**Packets from the peer are untrusted.**
- [`packets.decode`](src/engine/rollback/packets.js) checks every length
  and field and drops anything malformed.
- An input for a frame far in the future or the past is ignored, and the
  input bits are just a byte.
- A peer can't make the session allocate without bound or roll back past
  its window.

**Replays are untrusted.** A loaded replay file or link is validated like a
hostile message
([`decodeReplay`](src/game/replay/replays.js)):
- zod checks the header, and every length is bounded;
- a different format or game version is refused;
- a character name like `__proto__` is refused (a test caught that one).

## Threat model (the server)

**Assets**

- Seats: a player's session token is their place in a room.
- Server availability: a small free instance.
- The privacy of signalling: an offer contains a player's IP candidates and
  must reach only their opponent.

**Attackers**

- **A player with a modified client** or raw Socket.io access, sending
  arbitrary events and payloads, forging fields, guessing tokens, flooding.
- **An outsider** guessing room codes or flooding connections and rooms.
- **A malicious web page** opening a WebSocket to the server from a
  visitor's browser (cross-site WebSocket hijacking).

**Out of scope**

- Input automation (see above).
- Volumetric DDoS, which only the host can absorb.
- Persistence: all server state is in memory, and a restart ends every
  room.

## Mitigations

### Rooms, seats and sessions

- **Seat tokens.**
  - Every seat gets a 256-bit random token (`crypto.randomBytes(32)`).
  - The server stores only its SHA-256 hash and compares hashes in
    constant time ([`server/security/random.js`](server/security/random.js)).
  - The client keeps the token in `sessionStorage`, to resume after a
    dropped connection.
  - `socket.id` is never used as identity, and tokens are never sent to
    anyone but their owner (tested).
- **Room codes.**
  - 6 characters from a 31-character unambiguous alphabet, from
    `crypto.randomInt` (about 887 million codes), shared as an invite link.
  - Joining or resuming is limited to 20 attempts per minute per IP.
  - "Not found", "full" and "already started" all return the same message.
- **Quick match.**
  - The queue pairs sockets, never a socket with itself, and never a
    socket that has disconnected (tested).
  - A dropped connection keeps its place for 15 s with a ticket, a random
    token of its own.
- **Disconnects.**
  - A player who drops pauses the match for both, with a countdown.
  - Reconnecting with the token within 30 s resumes it. After that the
    match is forfeited.
  - Leaving on purpose forfeits at once and invalidates the token.
- **Game versions.** Each client reports its game version (a hash of the
  rules and data) when it connects. A private room refuses a joiner or a
  resumed seat on a different version, and quick match pairs only players
  of the same version (tested), because two builds would desync on the
  first frame.
- **Seeds.** Each match's seed comes from `crypto.randomInt`. It only seeds
  the (cosmetic) RNG in the shared simulation.

### Signalling and relay

- **Signalling goes only to the other seat of your own room**, and only
  while the room is open (tested).
  - Offers, answers and ICE candidates are opaque strings capped at
    6,000 characters.
  - They're rate-limited to 60 per 10 s.
- **Relay.**
  - It accepts only binary frames of 9–80 bytes (the size range of a real
    input packet), only from a seated player in a match, and forwards them
    only to the other seat (tested).
  - It's covered by the per-socket event budget.

### Validation and errors

- Every client event is validated with a **strict zod schema**
  ([`shared/protocol.js`](shared/protocol.js)): unknown events, extra
  fields and wrong types are rejected.
- Errors come from a small fixed set (`ERRORS` in
  [`SocketController.js`](server/sockets/SocketController.js)). zod
  messages and stack traces never reach a client.
- The client validates what it receives with the same schemas.

### Cross-origin access

- `ALLOWED_ORIGINS` is an explicit allowlist. `*` is refused at startup,
  and production requires `https://` origins.
- Socket.io runs **WebSocket-only**, and `allowRequest` checks the upgrade's
  `Origin` header against the allowlist. Requests with no origin are
  refused. This blocks cross-site WebSocket hijacking (tested).
- Express adds CORS headers only for allow-listed origins. helmet sets a
  `default-src 'none'` CSP on the server's own responses, plus
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, and HSTS in production.

### The game page

- **CSP.** GitHub Pages can't send headers, so the build puts a CSP
  `<meta>` tag in the page ([`vite.config.js`](vite.config.js)):
  - `default-src 'self'`, `script-src 'self'` and `style-src 'self'`, so no
    inline scripts or style attributes;
  - `connect-src` narrowed to exactly the matchmaking server's `https://`
    and `wss://` origin;
  - `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`.

  The build fails on a non-`https://` or `github.io` server URL, or on an
  inline script. The Playwright tests run against this build and fail on
  any console error, so a CSP violation fails CI.
- **What CSP doesn't cover.** WebRTC's STUN requests aren't governed by
  CSP. They go to the two public STUN servers named in
  [`PeerLink.js`](src/game/online/PeerLink.js).
- **Framing.** `frame-ancestors` doesn't work in a meta tag, so the page can
  be framed. It has no accounts, forms or actions worth clickjacking.
- **DOM.** The DOM is built with `textContent`. No server-, peer- or
  replay-provided string is ever parsed as HTML.

### Abuse and denial of service

| Limit | Value |
|---|---|
| Socket.io `maxHttpBufferSize` | 8 KB (the largest legal message is a 6,000-character signalling payload) |
| Any event per socket | 300 / 2 s (relayed inputs at 60/s plus checksums and pings fit easily) |
| Session events per socket (create, join, select, rematch…) | 20 / 10 s |
| Signalling messages per socket | 60 / 10 s |
| Invalid or rate-limited events before disconnect | 20 |
| Join / resume attempts per IP | 20 / min |
| Room creation per IP | 10 / 10 min |
| New connections per IP | 30 / min, at most 20 at once (`MAX_CONNECTIONS_PER_IP`) |
| Rooms per server | 300 (`MAX_ROOMS`) |
| Cleanup | a private room nobody joined is closed after 30 min; a room with nobody connected after 2 min |

- **Rate limiters** are token buckets, pruned when full, so their memory
  stays bounded.
- **Per-IP limits** use the real client IP behind a proxy
  (`CLIENT_IP_HEADER`, `TRUST_PROXY_HOPS`).
- **Load.** The load test ([PERFORMANCE.md](docs/PERFORMANCE.md)) shows
  the cost of the worst case, every match on the relay path.

### Operations

- Every socket handler is wrapped: an exception is logged and answered with
  a generic error instead of crashing the process. `uncaughtException` and
  `unhandledRejection` are logged.
- Logs never contain tokens, signalling payloads or relayed packets.
- **Configuration.**
  - All configuration is in environment variables.
  - `.env` is gitignored, and only `.env.example` is committed.
  - There are no secrets: the server has no keys, no database and no
    accounts.
- CI runs `npm audit --omit=dev --audit-level=high`.

## Offline modes

The CPU, local versus, training, the rollback lab and the replay viewer
run entirely in the browser:
- they send nothing and open no socket;
- the lab's "network" is simulated in the page.

Replays are kept in this browser's `localStorage`, and are shared only
when the player downloads a file or copies a link.

## Tests

[`tests/server/security.test.js`](tests/server/security.test.js) and
[`tests/server/matchmaking.test.js`](tests/server/matchmaking.test.js) run
a real server with real `socket.io-client` connections. They check that:

- foreign origins, a missing origin and long-polling are refused;
- the connection and room caps hold;
- malformed payloads, extra fields and unknown events are rejected;
- an oversized frame disconnects the socket;
- relay accepts only well-formed binary packets, only to the other seat
  and only in a match;
- signalling reaches only the other seat;
- flooders are throttled, then disconnected;
- room-code guessing is limited;
- a forged or foreign token can't take a seat, and tokens never leak;
- the queue never pairs a socket with itself or with a dead socket.

[`tests/replay.test.js`](tests/replay.test.js) feeds the replay decoder
malformed, oversized and wrong-version replays.
