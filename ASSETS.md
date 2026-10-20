# Assets

Every non-code file in the repository, where it came from and its licence.
Read this before publishing anything.

Each file is marked:

- **keep**: its source and licence are known, and it may sit in a public
  repository and ship in the game;
- **removed**: it can't sit in a public repository, and was taken out, with
  what replaced it.

`tests/assets.test.js` checks that every file the game loads
(`src/game/data/assets.js`) exists and is listed here, and that every
non-code file in the repository is listed here.

## Luiz Melo's Martial Hero packs (`public/sprites/`)

**Pixel art / character assets by Luiz Melo.** The two fighters come from
**Martial Hero** (<https://luizmelo.itch.io/martial-hero>) and **Martial
Hero 2** (<https://luizmelo.itch.io/martial-hero-2>), free ("name your own
price") on itch.io. They were in the 2022 version of this repository; the
rebuild renamed them (lower case, no spaces) and changed nothing else.

**Licence:** Creative Commons Zero v1.0 Universal (CC0). The pack pages say
the packages "can be used freely and commercially" under CC0 and that credit
isn't required but is appreciated. Credit is given anyway: here, in the
README and on the in-game credits screen. CC0 files may sit in a public
repository.

> Recorded 2026-10-20. The itch.io pages could not be opened from the
> container this was written in (its network policy blocks itch.io); the
> licence above comes from the pages' text as quoted by a web search and
> from the brief for this rebuild. **Robert: check both pages once** and
> fix this note if anything differs.

Every sheet is a strip of 200×200 frames. Mack is drawn facing right, Kenji
facing left; the game mirrors them as needed.

| File | Was | What | Source | Licence | Status |
| --- | --- | --- | --- | --- | --- |
| `public/sprites/mack/idle.png` | `assets/samuraiMack/Idle.png` | Mack standing, 8 frames | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/run.png` | `assets/samuraiMack/Run.png` | Running, 8 frames (walk and dash) | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/jump.png` | `assets/samuraiMack/Jump.png` | Rising, 2 frames | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/fall.png` | `assets/samuraiMack/Fall.png` | Falling, 2 frames | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/attack1.png` | `assets/samuraiMack/Attack1.png` | Horizontal slash, 6 frames (wind-up, then the slash with its trail) | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/attack2.png` | `assets/samuraiMack/Attack2.png` | Overhead slash, 6 frames | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/take-hit.png` | `assets/samuraiMack/Take Hit.png` | Recoil, 4 frames | Martial Hero | CC0 1.0 | keep |
| `public/sprites/mack/death.png` | `assets/samuraiMack/Death.png` | Collapse, 6 frames (knockdown; played backwards for wake-up) | Martial Hero | CC0 1.0 | keep |
| `public/sprites/kenji/idle.png` | `assets/kenji/Idle.png` | Kenji standing, 4 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/run.png` | `assets/kenji/Run.png` | Running, 8 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/jump.png` | `assets/kenji/Jump.png` | Rising, 2 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/fall.png` | `assets/kenji/Fall.png` | Falling, 2 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/attack1.png` | `assets/kenji/Attack1.png` | Long thrust, 4 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/attack2.png` | `assets/kenji/Attack2.png` | Rising cut, 4 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/take-hit.png` | `assets/kenji/Take hit.png` | Recoil, 3 frames | Martial Hero 2 | CC0 1.0 | keep |
| `public/sprites/kenji/death.png` | `assets/kenji/Death.png` | Collapse, 7 frames (knockdown; backwards for wake-up) | Martial Hero 2 | CC0 1.0 | keep |

### Animations the packs don't have

The packs have no block, crouch, dash-back, throw or projectile frames.
Rather than invent art that looks like Luiz Melo's and isn't, the game
builds honest stand-ins from the frames above, all at load time or in the
renderer, with no new files:

| Needed | Built from | How |
| --- | --- | --- |
| Crouch | The idle pose | Drawn squashed to 72% height (`src/engine/render/sprites.js`) |
| Crouching attacks | The attack frames | Squashed the same way; the hitboxes are low, so the sprite and the boxes agree |
| Block (standing and crouching) | Take-hit frame 0 | Held, with a blue tint (a recoloured copy made in code) and a guard spark |
| Hit flash | Any frame | A white silhouette made in code (`source-atop` fill) for the first frames of a hit |
| Back-dash | Jump frame 0 | Held while sliding back |
| Throw | Attack frames 0–1 / take-hit | The thrower's wind-up, the victim's recoil, then the knockdown |
| Wake-up | Death frames | Played backwards |
| Kenji's kunai (projectile) and both supers' effects | Nothing | Drawn with canvas shapes (`src/game/render/effects.js`) |

A later session could replace these with real frames from another CC0
Luiz Melo pack (see "Other packs considered" below).

## Made for this project

| File | What | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| The stage ("Dusk Shrine") | Layered parallax: sky, sun, far mountains, a shrine with a torii gate, pines, lanterns, a stone courtyard | Drawn at runtime with canvas shapes (`src/game/stage/duskShrine.js`) | Project's own | keep |
| Sound effects | Hits, blocks, whiffs, throws, KO, the round announcer's gong, menu clicks | Generated at runtime with Web Audio (`src/engine/audio/Sfx.js`) | Project's own | keep |
| Hit sparks, guard sparks, screen flash | Particles and shapes | Drawn at runtime (`src/game/render/effects.js`) | Project's own | keep |
| `public/favicon.svg` | Two crossed blades | Written by hand for this project | Project's own | keep |
| UI font | The system font (`system-ui`, monospace for numbers) | The player's operating system | Not shipped with the game | keep |
| `public/music/*.ogg` | Music: `title`, `select`, `stage`, `results` (optional; none are committed yet) | Robert's own tracks, added by him ([docs/AUDIO.md](docs/AUDIO.md)) | Robert's own | to add |
| `docs/media/*` | The README's GIF and screenshots of the lab and online play | Captured with Playwright from the real build (`tools/capture-media.mjs`) | Project's own | keep |
| `docs/screenshots/*.png` | Screenshots of this game | Captured by `npm run screenshots` (Playwright) from the real build | Project's own (they show the CC0 sprites) | keep |

## Removed in the rebuild

| File | What | Source | Licence | Status |
| --- | --- | --- | --- | --- |
| `assets/background.png` | The 1024×576 forest background | **"Oak Woods" by brullov** (<https://brullov.itch.io/oak-woods>) | Free for use in games, but **"Do not redistribute/resell it."** A public repository that serves the raw file is redistribution. | **removed**; replaced by the Dusk Shrine stage drawn in code |
| `assets/shop.png` | The animated shop (6 frames) | "Oak Woods" by brullov | As above | **removed** |
| `assets/samuraiMack/Take Hit - white silhouette.png` | A white version of Mack's take-hit frames | Martial Hero (CC0) | CC0 | **removed** (unused: the game makes the white flash for both fighters in code) |

Both Oak Woods files are still in the git history (they were committed in
2022). Purging them from the history is optional and is Robert's call; the
commands are below.

### Using the Oak Woods pack again (optional, never committed)

If Robert buys or downloads Oak Woods himself, its licence lets him use it
in his game, just not publish the raw files. The game supports that
without committing anything:

1. Put the files in `art/licensed/oak-woods/` as `background.png` (the
   pack's 1024×576 composite, or any background at least 640×360) and
   optionally `shop.png` (the 6-frame shop strip).
2. `art/licensed/` is in `.gitignore`. `vite.config.js` checks for the
   folder: `npm run dev` serves it and `npm run build` copies it into
   `dist/licensed/`, and the stage select then offers "Oak Woods" beside
   the Dusk Shrine. Without the folder nothing is requested and nothing
   changes.
3. GitHub Actions never has the folder, so the public GitHub Pages build
   never contains the files. A build Robert makes on his own machine with
   the folder present does contain them (shipping them inside a playable
   game is what the licence allows), so don't publish that `dist/` as a
   download.

### Purging the Oak Woods files from the history (optional)

This rewrites every commit, so every clone and fork must be re-cloned
afterwards, and the `v1-original` tag (which points at the 2022 commit
that contains the files) must be recreated. With
[git filter-repo](https://github.com/newren/git-filter-repo) installed, in
a **fresh clone**:

```sh
git clone https://github.com/RDBagwell/Fighting-Game.git fg-purge && cd fg-purge
git filter-repo --invert-paths --path assets/background.png --path assets/shop.png
# filter-repo rewrites v1-original too (it now points at the rewritten 2022
# commit, without the two files). Check, then push everything back:
git log --oneline v1-original -1
git remote add origin https://github.com/RDBagwell/Fighting-Game.git
git push --force --all origin
git push --force --tags origin
```

If the tag didn't come through (for example it was deleted first), recreate
it on the rewritten "finishing touches" commit:

```sh
git tag -a v1-original -m "Original 2022 tutorial-based version" <rewritten-sha>
git push --force origin v1-original
```

Open pull requests and GitHub's cached views may still reference the old
commits until GitHub garbage-collects them; GitHub Support can purge those
on request.

## Other packs considered (not used this session)

Luiz Melo has published many more character packs. Before any of them is
used, its own itch.io page must be checked; this table is what a web search
reported on 2026-10-20 (itch.io itself was blocked from the container).

| Pack | Page | Licence as reported | Could supply |
| --- | --- | --- | --- |
| Martial Hero 3 | <https://luizmelo.itch.io/martial-hero-3> | CC0 1.0 | A third martial-arts fighter |
| Medieval Warrior Pack 2 | <https://luizmelo.itch.io/medieval-warrior-pack-2> | CC0 1.0 ("can be used freely and commercially") | A sword-and-shield fighter (has a block-like guard) |
| Medieval Warrior Pack | <https://luizmelo.itch.io/medieval-warrior-pack> | Free; licence **not confirmed** by the search | |
| Huntress (and Huntress 2) | <https://luizmelo.itch.io/huntress> | CC0 1.0 | A ranged/zoning character |
| Evil Wizard (2 and 3) | <https://luizmelo.itch.io/evil-wizard> | CC0 1.0 | A boss-style or zoning character |
| Fantasy Warrior | <https://luizmelo.itch.io/fantasy-warrior> | Free; licence **not confirmed** | |
| Fantasy Martial Characters (1–3) | <https://luizmelo.itch.io/fantasy-martial-characters> | CC0, but **paid** (minimum $5) | |

None of them adds a block or crouch to Mack and Kenji themselves (each pack
is its own character), so this session keeps the stand-ins above and
leaves a third character for later.
