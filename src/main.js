/**
 * Entry point: loads the art, then starts the game at the title screen.
 * `window.__game` exposes the app to the Playwright smoke tests (read-only
 * use: they wait on scene names and the match state).
 */
import './style.css';
import { App } from './game/App.js';

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
    app.start();
  })
  .catch((err) => {
    label.textContent = `Couldn't load the game: ${err.message}`;
    throw err;
  });
