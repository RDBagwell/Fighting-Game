/**
 * Online play: the lobby (quick match, private rooms with invite links),
 * the room (character select over the network), and the results (rematch).
 * The match itself is a NetplayScene.
 */
import { h, focusFirst } from '../ui/dom.js';
import { drawBackdrop, portrait } from './backdrop.js';
import { OnlineClient, serverUrl } from '../online/OnlineClient.js';
import { PeerLink } from '../online/PeerLink.js';
import { NetplayScene } from './netplay.js';
import { TitleScene } from './title.js';
import { roster } from '../data/characters/index.js';
import { normalizeRoomCode } from '../../../shared/protocol.js';

export const PRIVACY_NOTE = 'Online play has no accounts and stores nothing about you. To find a direct path between the two players, your browser asks public STUN servers (Google and Cloudflare) for its public address, which the other player’s browser then sees, as with any peer-to-peer connection. If no direct path works, inputs go through the matchmaking server instead. The server sees your IP address and your inputs while relaying, and keeps neither.';

/**
 * The app's one connection to the matchmaking server, made on first use.
 * @param {import('../App.js').App} app
 */
function client(app) {
  const a = /** @type {any} */ (app);
  if (!a.online) a.online = new OnlineClient(serverUrl());
  return /** @type {OnlineClient} */ (a.online);
}

/** The invite link for a room code. */
function inviteLink(/** @type {string} */ code) {
  const u = new URL(location.href);
  u.search = `?room=${code}`;
  u.hash = '';
  return u.toString();
}

export class OnlineLobbyScene {
  /**
   * @param {import('../App.js').App} app
   * @param {{ join?: string }} [o]  A room code from an invite link.
   */
  constructor(app, { join } = {}) {
    this.app = app;
    this.name = 'online-lobby';
    this.time = 0;
    this.join = join;
  }

  enter() {
    const app = this.app;
    if (!serverUrl()) {
      const screen = h('div', { class: 'screen online menu-active' },
        h('h2', {}, 'Online'),
        h('p', {}, 'This build has no matchmaking server configured, so online play is off. The rollback lab runs the same netcode against the CPU, offline.'),
        h('nav', { class: 'menu' },
          h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => app.setScene(new LabSetupScene(app)) }, 'Rollback lab'),
          h('button', { class: 'btn', 'data-back': true, onclick: () => app.setScene(new TitleScene(app)) }, 'Back')));
      app.ui.append(screen);
      focusFirst(screen);
      return;
    }
    const c = client(app);
    const status = h('p', { class: 'status', 'aria-live': 'polite' });
    const message = h('p', { class: 'fine', 'aria-live': 'polite' });
    const setStatus = () => {
      status.textContent = c.status === 'online' ? 'Connected to the matchmaking server.' : c.status === 'connecting' ? 'Connecting to the matchmaking server… (a free server can take up to a minute to wake up)' : 'Not connected. Retrying…';
    };
    setStatus();
    this.onStatus = () => setStatus();
    c.addEventListener('status', this.onStatus);
    this.onSeated = () => app.setScene(new OnlineRoomScene(app));
    c.addEventListener('seated', this.onSeated);
    this.onError = (/** @type {Event} */ e) => (message.textContent = /** @type {CustomEvent} */ (e).detail);
    c.addEventListener('error', this.onError);

    const codeInput = /** @type {HTMLInputElement} */ (h('input', { type: 'text', inputmode: 'text', autocomplete: 'off', maxlength: 9, placeholder: 'ABC-DEF', 'aria-label': 'Room code', value: this.join ?? '' }));
    const queueBox = h('div', { class: 'queue', hidden: true },
      h('p', {}, 'Looking for an opponent…'),
      h('button', { class: 'btn', onclick: async () => { await c.cancelQueue(); queueBox.hidden = true; } }, 'Cancel'));
    const joinRoom = async () => {
      const code = normalizeRoomCode(codeInput.value);
      if (!code) {
        message.textContent = 'A room code is 6 letters and numbers.';
        return;
      }
      const r = await c.joinRoom(code);
      if (r.ok) app.setScene(new OnlineRoomScene(app));
      else message.textContent = r.error;
    };
    const screen = h('div', { class: 'screen online menu-active' },
      h('h2', {}, 'Online'),
      status,
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: async () => {
          const r = await c.quickMatch();
          if (r.ok) queueBox.hidden = false;
          else message.textContent = r.error;
        } }, 'Quick match'),
        h('button', { class: 'btn', onclick: async () => {
          const r = await c.createRoom();
          if (r.ok) app.setScene(new OnlineRoomScene(app));
          else message.textContent = r.error;
        } }, 'Create a private room'),
        h('div', { class: 'join-row' }, codeInput, h('button', { class: 'btn', onclick: joinRoom }, 'Join')),
        h('button', { class: 'btn', onclick: () => app.setScene(new LabSetupScene(app)) }, 'Rollback lab (offline)'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => app.setScene(new TitleScene(app)) }, 'Back')),
      queueBox,
      message,
      h('p', { class: 'fine privacy' }, PRIVACY_NOTE));
    app.ui.append(screen);
    focusFirst(screen);
    if (this.join) {
      const go = () => (c.status === 'online' ? joinRoom() : setTimeout(go, 300));
      go();
    }
  }

  exit() {
    const c = /** @type {any} */ (this.app).online;
    if (!c) return;
    if (this.onStatus) c.removeEventListener('status', this.onStatus);
    if (this.onSeated) c.removeEventListener('seated', this.onSeated);
    if (this.onError) c.removeEventListener('error', this.onError);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, ['mack', 'kenji'], 0.6);
  }
}

/**
 * The room: waiting for the second player, then character select over the
 * network. Both players pick and press Ready; the server then picks the
 * match's seed and both browsers start the same match.
 */
export class OnlineRoomScene {
  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.app = app;
    this.name = 'online-room';
    this.time = 0;
    this.char = roster[0];
    this.ready = false;
    /** @type {PeerLink | null} */
    this.link = /** @type {any} */ (app).peerLink ?? null;
  }

  enter() {
    const app = this.app;
    const c = client(app);
    const body = h('div', { class: 'room-body' });
    const screen = h('div', { class: 'screen online menu-active' }, h('h2', {}, 'Online room'), body,
      h('nav', { class: 'menu' }, h('button', { class: 'btn', 'data-back': true, onclick: async () => { await c.leave(); this.dropLink(); app.setScene(new OnlineLobbyScene(app)); } }, 'Leave')));
    app.ui.append(screen);
    this.onRoom = () => this.draw(body);
    c.addEventListener('room', this.onRoom);
    this.draw(body);
    focusFirst(screen);
  }

  exit() {
    const c = /** @type {any} */ (this.app).online;
    if (c && this.onRoom) c.removeEventListener('room', this.onRoom);
  }

  dropLink() {
    this.link?.close();
    this.link = null;
    /** @type {any} */ (this.app).peerLink = null;
  }

  /** @param {HTMLElement} body */
  draw(body) {
    const app = this.app;
    const c = client(app);
    const r = c.room;
    if (!r) {
      body.replaceChildren(h('p', {}, 'Joining…'));
      return;
    }
    // Start finding a direct path as soon as both players are in the room.
    if (!this.link && r.status !== 'waiting' && r.status !== 'closed') {
      this.link = new PeerLink(c, r.you);
      /** @type {any} */ (app).peerLink = this.link;
    }
    if (r.status === 'closed') {
      body.replaceChildren(h('p', {}, r.reason ?? 'The room was closed.'), h('button', { class: 'btn', onclick: () => app.setScene(new OnlineLobbyScene(app)) }, 'Back to the lobby'));
      this.dropLink();
      return;
    }
    if (r.status === 'waiting') {
      const link = inviteLink(r.code);
      body.replaceChildren(
        h('p', {}, 'Send this code or link to your opponent:'),
        h('p', { class: 'room-code', 'aria-label': `Room code ${r.code.split('').join(' ')}` }, `${r.code.slice(0, 3)}-${r.code.slice(3)}`),
        h('div', { class: 'join-row' }, h('input', { type: 'text', readonly: true, value: link, 'aria-label': 'Invite link' }),
          h('button', { class: 'btn', onclick: (/** @type {Event} */ e) => { navigator.clipboard?.writeText(link); /** @type {HTMLElement} */ (e.currentTarget).textContent = 'Copied'; } }, 'Copy link')),
        h('p', { class: 'fine' }, 'Waiting for them to join…'));
      return;
    }
    if (r.status === 'playing' && r.match && this.link) {
      const match = r.match;
      const link = this.link;
      app.setScene(new NetplayScene(app, {
        kind: 'online', match, seat: r.you, client: c, link,
        onEnd: (winner, forfeit) => app.setScene(new OnlineResultsScene(app, { winner, forfeit, matchId: match.id })),
      }));
      return;
    }
    const you = r.you;
    const opp = r.seats[1 - you];
    const cards = h('div', { class: 'cards', role: 'radiogroup', 'aria-label': 'Your character' });
    for (const id of roster) {
      const ch = app.sim.characters[id];
      cards.append(h('button', { class: 'card', role: 'radio', 'aria-checked': String(r.seats[you].char === id), 'aria-label': `${ch.name} (${ch.style})`,
        onclick: () => { this.char = id; c.select(id, false); } }, portrait(app, id), h('span', { class: 'card-name' }, ch.name), h('span', { class: 'card-style' }, ch.style)));
    }
    const mine = r.seats[you];
    const pause = r.pause && r.status === 'paused' ? h('p', { class: 'warn' }, `Your opponent disconnected. Waiting ${Math.ceil(r.pause.forfeitInMs / 1000)} s…`) : null;
    body.replaceChildren(
      h('p', { class: 'fine' }, `Room ${r.code} · you are player ${you + 1}`),
      cards,
      h('button', { class: `btn ${mine.ready ? '' : 'primary'}`, onclick: () => c.select(mine.char, !mine.ready) }, mine.ready ? 'Not ready' : 'Ready'),
      h('p', {}, `Opponent: ${app.sim.characters[opp.char]?.name ?? '?'}${opp.connected ? '' : ' (disconnected)'} · ${opp.ready ? 'ready' : 'choosing'}`),
      pause,
      h('p', { class: 'fine' }, `Connection path: ${this.link?.directState === 'direct' ? 'direct (WebRTC)' : this.link?.directState === 'relay-only' ? 'relay (through the server)' : 'looking for a direct path…'}`));
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt */
  render(ctx, dt) {
    this.time += dt;
    const r = /** @type {any} */ (this.app).online?.room;
    const chars = r ? /** @type {[string, string]} */ ([r.seats[0].char, r.seats[1].char]) : /** @type {[string, string]} */ (['mack', 'kenji']);
    drawBackdrop(this.app, ctx, this.time, chars, 0.65);
  }
}

/** After an online match: rematch, change characters, or leave. */
export class OnlineResultsScene {
  /**
   * @param {import('../App.js').App} app
   * @param {{ winner: number, forfeit: boolean, matchId: number }} o
   */
  constructor(app, o) {
    this.app = app;
    this.o = o;
    this.name = 'online-results';
    this.time = 0;
  }

  enter() {
    const app = this.app;
    const c = client(app);
    const r = c.room;
    const you = r?.you ?? 0;
    const { winner, forfeit, matchId } = this.o;
    if (!forfeit) c.matchOver(matchId);
    const headline = winner === -1 ? 'Match ended' : winner === 2 ? 'Draw game' : winner === you ? 'You win!' : 'You lose';
    const sub = forfeit ? (winner === you ? 'Your opponent left or lost their connection.' : 'You left the match.') : 'Good game.';
    const waiting = h('p', { class: 'fine', 'aria-live': 'polite' });
    const screen = h('div', { class: 'screen results menu-active' },
      h('h2', { class: 'headline' }, headline), h('p', {}, sub),
      h('nav', { class: 'menu' },
        forfeit ? null : h('button', { class: 'btn primary', 'data-autofocus': true, onclick: async () => { await c.rematch(); waiting.textContent = 'Waiting for your opponent…'; } }, 'Rematch'),
        forfeit ? null : h('button', { class: 'btn', onclick: () => c.changeCharacters() }, 'Change characters'),
        h('button', { class: 'btn', 'data-back': true, onclick: async () => { await c.leave(); /** @type {any} */ (app).peerLink?.close(); /** @type {any} */ (app).peerLink = null; app.setScene(new OnlineLobbyScene(app)); } }, 'Leave')),
      waiting);
    app.ui.append(screen);
    focusFirst(screen);
    this.onRoom = (/** @type {Event} */ e) => {
      const room = /** @type {CustomEvent} */ (e).detail;
      if (!room) return;
      if (room.status === 'playing' && room.match && room.match.id !== matchId) app.setScene(new OnlineRoomScene(app));
      else if (room.status === 'select') app.setScene(new OnlineRoomScene(app));
      else if (room.status === 'closed') waiting.textContent = room.reason ?? 'The room was closed.';
      else if (room.seats[1 - room.you].rematch) waiting.textContent = 'Your opponent wants a rematch.';
    };
    c.addEventListener('room', this.onRoom);
  }

  exit() {
    const c = /** @type {any} */ (this.app).online;
    if (c && this.onRoom) c.removeEventListener('room', this.onRoom);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, ['mack', 'kenji'], 0.6);
  }
}

/** Choosing characters and the CPU for the offline rollback lab. */
export class LabSetupScene {
  /** @param {import('../App.js').App} app */
  constructor(app) {
    this.app = app;
    this.name = 'lab-setup';
    this.time = 0;
    /** @type {[string, string]} */
    this.chars = [roster[0], roster[1]];
  }

  enter() {
    const app = this.app;
    /** @param {number} side */
    const pick = (side) => {
      const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': side === 0 ? 'Your character' : 'The CPU’s character' });
      for (const id of roster) {
        group.append(h('button', { class: 'btn seg-btn', role: 'radio', 'aria-checked': String(this.chars[side] === id), onclick: (/** @type {Event} */ e) => {
          this.chars[side] = id;
          group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget)));
        } }, app.sim.characters[id].name));
      }
      return group;
    };
    const screen = h('div', { class: 'screen menu-active' },
      h('h2', {}, 'Rollback lab'),
      h('p', { class: 'tagline' }, 'Play the CPU through the real rollback netcode, with a simulated network between your copy of the game and the CPU’s. Make the network worse, switch to delay-based netcode, and watch the rollbacks happen. No second player or server needed.'),
      h('div', { class: 'row' }, h('span', {}, 'You'), pick(0)),
      h('div', { class: 'row' }, h('span', {}, 'CPU'), pick(1)),
      h('nav', { class: 'menu' },
        h('button', { class: 'btn primary', 'data-autofocus': true, onclick: () => app.setScene(new NetplayScene(app, { kind: 'lab', chars: [this.chars[0], this.chars[1]], cpu: app.settings.cpu })) }, 'Start'),
        h('button', { class: 'btn', 'data-back': true, onclick: () => app.setScene(new TitleScene(app)) }, 'Back')));
    app.ui.append(screen);
    focusFirst(screen);
  }

  /** @param {CanvasRenderingContext2D} ctx @param {number} dt */
  render(ctx, dt) {
    this.time += dt;
    drawBackdrop(this.app, ctx, this.time, this.chars, 0.6);
  }
}
