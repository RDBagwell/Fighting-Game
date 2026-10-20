# Audio

## Sound effects

Every sound effect is generated at runtime with Web Audio
([`src/engine/audio/Sfx.js`](../src/engine/audio/Sfx.js)): a few
oscillators and filtered noise each, so there are no files to download or
license. The simulation reports events (a hit, a block, a K.O.), and
[`App.presentSounds`](../src/game/App.js) plays the sound for each one.
In an online or lab match, rollback re-simulates frames. The
[`EventPresenter`](../src/engine/rollback/EventPresenter.js) makes sure a
re-simulated hit doesn't sound twice ([ROLLBACK.md](ROLLBACK.md#7-events-vs-presentation)).

Events with a sound: `hit` and `block` (louder for bigger hits), `swing`,
`special`, `super`, `projectile`, `throw`, `tech`, `clash`, `knockdown`,
`jump`, `land`, `dash`, `round`, `fight` and `ko`. The menus have their own
clicks. The full list is `EVENT_SOUNDS` in [`src/game/audio.js`](../src/game/audio.js).

## Music

The music is Robert's own and is optional. Put these files in
`public/music/`:

| File | Plays on |
|---|---|
| `public/music/title.ogg` | Title screen, online lobby, replays list, settings |
| `public/music/select.ogg` | Character select, the VS screen, online room, lab setup |
| `public/music/stage.ogg` | Every fight: CPU, versus, training, online, the lab, the replay viewer |
| `public/music/results.ogg` | Results screens (local and online) |

- **Format.** Ogg Vorbis, looping cleanly from the end back to the start.
  Aim for about 1–2 MB a track: 96–128 kbit/s stereo is plenty under sound
  effects.
- **Missing files are fine.** The build checks which tracks exist
  (`virtual:music` in [`vite.config.js`](../vite.config.js)), and the game
  plays only those. A missing track means silence there, never a failed
  request. Settings shows a note when the build has no music at all.
- **Volume.** Settings → Sound → Music, separate from the effects volume.
  Mute silences both. Music starts after the first click or key press
  (browsers require a gesture), and fades between scenes. The same track
  carries on across scenes that share it.
- **Safari.** Older Safari versions (before 17) can't play Ogg Vorbis. If
  iOS matters, also provide `.m4a` versions. That needs a small change to
  [`Music.js`](../src/engine/audio/Music.js), which isn't done yet.
- **Credits.** Add a line to `src/game/data/credits.js` and to
  [ASSETS.md](../ASSETS.md) when the tracks go in. A test checks that only
  these four names appear in `public/music/`.

## Captions

**Settings → Accessibility → Captions for sounds** shows a short line of
text for each sound that carries information:

- round start, "Fight!";
- K.O. (and who won the round), time over;
- throws and throw escapes;
- supers, fireballs, clashes and knockdowns.

Captions are in a live region, so screen readers announce them. Hits and
blocks aren't captioned: they happen several times a second, and the hit
sparks and health bars already show them. The text is in
[`src/game/hud/Captions.js`](../src/game/hud/Captions.js).
