/**
 * Entry point: loads the art, then starts the game at the title screen.
 * `window.__game` exposes the app to the Playwright smoke tests (read-only
 * use: they wait on scene names and the match state).
 */
import './style.css';
import { App } from './game/App.js';
import { OnlineLobbyScene } from './game/scenes/online.js';
import { ReplayViewerScene } from './game/scenes/replay.js';

const root = /** @type {HTMLElement} */ (document.getElementById('game'));
const loading = /** @type {HTMLElement} */ (root.querySelector('.loading'));
const bar = /** @type {HTMLElement} */ (loading.querySelector('.loading-bar span'));
const label = /** @type {HTMLElement} */ (loading.querySelector('.loading-label'));

const app = new App(root);
/** @type {any} */ (window).__game = app;
window.addEventListener('error', (e) => app.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => app.errors.push(String(e.reason)));

app
  .load((done, total) => {
    bar.style.width = `${Math.round((done / total) * 100)}%`;
  })
  .then(() => {
    loading.remove();
    // An invite link (?room=CODE) opens the online lobby and joins; a shared
    // replay (#replay=...) opens the replay viewer.
    const room = new URLSearchParams(location.search).get('room');
    const replay = location.hash.startsWith('#replay=') ? location.hash.slice(8) : null;
    if (replay) app.start(ReplayViewerScene.fromText(app, decodeURIComponent(replay)));
    else app.start(room ? new OnlineLobbyScene(app, { join: room.slice(0, 16) }) : undefined);
    // A replay link opened while the game is already running.
    window.addEventListener('hashchange', () => {
      if (location.hash.startsWith('#replay=')) app.setScene(ReplayViewerScene.fromText(app, decodeURIComponent(location.hash.slice(8))));
    });
  })
  .catch((err) => {
    label.textContent = `Couldn't load the game: ${err.message}`;
    throw err;
  });
