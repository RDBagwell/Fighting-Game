/**
 * Modal panels shared by several scenes: settings (with control
 * remapping), the move list (generated from the character data), credits
 * and the how-to-play card.
 */
import { h, focusFirst } from '../ui/dom.js';
import { ACTIONS, ACTION_LABELS, PAD_BUTTON_NAMES, keyName, DEFAULT_KEYS, DEFAULT_PAD } from '../../engine/input/bindings.js';
import { summarise, formatAdvantage } from '../../engine/sim/frameData.js';
import { CREDITS } from '../data/credits.js';
import { roster } from '../data/characters/index.js';
import { howTo, parryHowTo } from '../ui/howTo.js';

/**
 * Opens a modal over the current screen. Back (Escape, the gamepad's B,
 * the button) closes it and returns focus to where it was.
 * @param {import('../App.js').App} app
 * @param {string} title
 * @param {HTMLElement} body
 * @param {() => void} [onClose]
 * @param {string} [extraClass]
 */
export function openModal(app, title, body, onClose, extraClass = '') {
  const previous = /** @type {HTMLElement | null} */ (document.activeElement);
  const close = () => {
    modal.remove();
    app.click('back');
    onClose?.();
    previous?.focus?.({ preventScroll: true });
  };
  const modal = h('div', { class: `modal menu-active ${extraClass}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-card' },
      h('div', { class: 'modal-head' },
        h('h2', {}, title),
        h('button', { class: 'btn small', 'data-back': true, onclick: close }, 'Back')),
      body));
  app.ui.append(modal);
  focusFirst(body);
  return { modal, close };
}

/**
 * @param {import('../App.js').App} app
 */
export function openCredits(app) {
  const body = h('div', { class: 'credits' },
    ...CREDITS.map((c) => h('section', {}, h('h3', {}, c.heading), ...c.lines.map((l) => h('p', {}, l)))),
    h('p', { class: 'fine' }, 'Every file, its source and licence: ASSETS.md in the repository.'));
  return openModal(app, 'Credits', body);
}

/**
 * The move list for each character, generated from the same data the
 * simulation runs on (so it can't be out of date).
 * @param {import('../App.js').App} app
 * @param {string} [first]
 */
export function openMoveList(app, first = roster[0]) {
  const sim = app.sim;
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const panel = h('div', { class: 'movelist' });
  /** @param {string} id */
  const show = (id) => {
    const ch = sim.characters[id];
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    const groups = [
      ['Normals', 'normal'],
      ['Throw', 'throw'],
      ['Specials', 'special'],
      ['Super (full meter)', 'super'],
      ['Universal: parry, guard cancel (half the meter) and burst (once a round)', 'guardCancel', 'burst'],
    ];
    /** @param {ReturnType<typeof howTo>} how @param {string} notation */
    const howCell = (how, notation) => h('td', { class: 'how' },
      h('div', { class: 'how-arrows' }, how.arrows),
      h('div', {}, h('span', { class: 'how-label' }, 'Keys '), how.keyboard),
      h('div', {}, h('span', { class: 'how-label' }, 'Pad '), how.pad),
      how.easy ? h('div', { class: 'how-easy' }, h('span', { class: 'how-label' }, 'Easy '), `${how.easy.keyboard} · ${how.easy.pad} (80% damage)`) : null,
      h('div', { class: 'notation', title: 'Numpad notation, as fighting-game players write it' }, notation));
    const rows = (/** @type {string[]} */ kinds) =>
      Object.entries(ch.moves)
        .filter(([, m]) => kinds.includes(m.kind))
        .map(([, m]) => {
          const d = summarise(m, sim.config);
          const air = m.stance === 'air';
          return h('tr', {},
            howCell(howTo(m, sim.motions, app.settings.controls), m.notation),
            h('td', {}, h('strong', {}, m.name), h('div', { class: 'desc' }, m.description ?? '')),
            h('td', { class: 'num' }, String(d.startup)),
            h('td', { class: 'num' }, m.projectile && !m.hits ? '—' : String(d.active)),
            h('td', { class: 'num' }, String(d.recovery)),
            h('td', { class: 'num' }, air || m.projectile ? '—' : formatAdvantage(d.onHit.value, d.onHit.tag)),
            h('td', { class: 'num' }, air || m.projectile || m.kind === 'throw' ? '—' : formatAdvantage(d.onBlock)),
            h('td', { class: 'num' }, String(d.damage)),
            h('td', {}, d.guard));
        });
    // The parry is a rule rather than a move: its own row, from the config.
    const pc = sim.config.parry;
    const parryRow = h('tr', {},
      howCell(parryHowTo(app.settings.controls), 'MH'),
      h('td', {}, h('strong', {}, 'Parry'), h('div', { class: 'desc' },
        `Catches a strike or projectile in its first ${pc.window} frames: standing for highs and mids, crouching for lows and mids. The hit does nothing and you act first, while they finish their move. Miss, and you are stuck for ${pc.recovery} more frames. Throws beat it.`)),
      h('td', { class: 'num' }, '1'),
      h('td', { class: 'num' }, String(pc.window)),
      h('td', { class: 'num' }, String(pc.recovery)),
      h('td', { class: 'num' }, '—'),
      h('td', { class: 'num' }, '—'),
      h('td', { class: 'num' }, '—'),
      h('td', {}, '—'));
    panel.replaceChildren(
      h('p', { class: 'char-blurb' }, h('strong', {}, `${ch.name}, ${ch.title}. `), `${ch.style}. ${ch.blurb}`),
      h('p', { class: 'fine' }, 'How to read the inputs: they are written for facing right, so → means toward your opponent. When you face left, swap left and right. ',
        '"↓ ↘ →" means roll the stick (or the keys) from down, through down-forward, to forward in one smooth motion, then press the button right at the end. ',
        '"Keys" are your Player 1 keyboard keys and "Pad" your controller buttons, as set in Settings. ',
        '"Easy" is the Special-button shortcut: the same move without the motion, at 80% damage (on touch screens, the Special button). ',
        'The small code under each (like 236M) is numpad notation, the way fighting-game players write inputs.'),
      ...groups.map(([title, ...kinds]) => h('section', {},
        h('h3', {}, title),
        h('table', {},
          h('thead', {}, h('tr', {}, ...['How to do it', 'Move', 'Startup', 'Active', 'Recovery', 'On hit', 'On block', 'Damage', 'Guard'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, ...(kinds.includes('guardCancel') ? [parryRow] : []), ...rows(kinds))))),
      h('p', { class: 'fine' }, 'Frame data is computed from the move data; tests measure every grounded move in the simulation and check it matches. Air moves’ advantage depends on how high they hit. "KD" = knocks down; the number includes the opponent getting up.'),
    );
  };
  for (const id of roster) {
    tabs.append(h('button', { class: 'btn tab', role: 'tab', 'data-id': id, onclick: () => show(id) }, sim.characters[id].name));
  }
  show(first);
  return openModal(app, 'Move list', h('div', {}, tabs, panel), undefined, 'wide');
}

/**
 * Settings, including remapping the controls.
 * @param {import('../App.js').App} app
 * @param {() => void} [onClose]
 */
export function openSettings(app, onClose) {
  const s = app.settings;
  const save = () => app.saveSettings();
  /** @param {string} label @param {boolean} value @param {(v: boolean) => void} set @param {string} [help] */
  const toggle = (label, value, set, help) => {
    const input = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: value, onchange: () => { set(input.checked); save(); } }));
    return h('label', { class: 'row check' }, input, h('span', {}, label, help ? h('small', {}, help) : null));
  };
  /** @param {string} label @param {Array<[string, string]>} options @param {string} value @param {(v: string) => void} set */
  const choice = (label, options, value, set) => {
    const sel = /** @type {HTMLSelectElement} */ (h('select', { onchange: () => { set(sel.value); save(); } }, ...options.map(([v, t]) => h('option', { value: v, selected: v === value }, t))));
    return h('label', { class: 'row' }, h('span', {}, label), sel);
  };
  const volume = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 10, step: 1, value: Math.round(s.volume * 10), 'aria-label': 'Volume',
    oninput: () => { s.volume = Number(volume.value) / 10; save(); app.click('menu'); } }));
  const musicVolume = /** @type {HTMLInputElement} */ (h('input', { type: 'range', min: 0, max: 10, step: 1, value: Math.round(s.musicVolume * 10), 'aria-label': 'Music volume',
    oninput: () => { s.musicVolume = Number(musicVolume.value) / 10; save(); } }));
  const tracks = app.music.available();

  const controls = h('div', { class: 'controls' });
  const renderControls = () => {
    /** @param {'kbA'|'kbB'} set @param {string} title */
    const keyTable = (set, title) => h('table', {},
      h('caption', {}, title),
      h('tbody', {}, ...ACTIONS.map((action) => h('tr', {},
        h('th', { scope: 'row' }, ACTION_LABELS[action]),
        h('td', {}, h('button', { class: 'btn bind', onclick: async (/** @type {Event} */ e) => {
          const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
          btn.textContent = 'Press a key… (Esc cancels)';
          const code = await app.input.captureKey();
          if (code) {
            // A key does one thing per keyboard set: take it off other actions.
            for (const a of ACTIONS) s.controls[set][a] = s.controls[set][a].filter((c) => c !== code);
            s.controls[set][action] = [code];
            save();
          }
          renderControls();
          /** @type {HTMLElement | null} */ (controls.querySelector(`[data-focus="${set}-${action}"]`))?.focus();
        }, 'data-focus': `${set}-${action}` }, s.controls[set][action].map(keyName).join(' / ')))))));
    const padTable = h('table', {},
      h('caption', {}, 'Gamepad (both pads)'),
      h('tbody', {}, ...ACTIONS.filter((a) => !['up', 'down', 'left', 'right'].includes(a)).map((action) => h('tr', {},
        h('th', { scope: 'row' }, ACTION_LABELS[action]),
        h('td', {}, h('button', { class: 'btn bind', 'data-focus': `pad-${action}`, onclick: async (/** @type {Event} */ e) => {
          const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
          if (!app.input.pads.length) {
            btn.textContent = 'Connect a gamepad first';
            return;
          }
          btn.textContent = 'Press a button… (Start cancels)';
          // Stop listening if the settings are closed before a button is pressed.
          const index = await app.input.capturePadButton(0, () => !btn.isConnected);
          if (index !== null) {
            for (const a of ACTIONS) s.controls.pad[a] = s.controls.pad[a].filter((i) => i !== index);
            s.controls.pad[action] = [index];
            save();
          }
          renderControls();
        } }, s.controls.pad[action].map((i) => PAD_BUTTON_NAMES[i] ?? `Button ${i}`).join(' / ')))))));
    controls.replaceChildren(
      h('p', { class: 'fine' }, 'In single-player modes every keyboard set and gamepad controls player 1. In local versus, player 1 uses the left keys and the first gamepad, player 2 the right keys and the second.'),
      h('div', { class: 'control-tables' }, keyTable('kbA', 'Player 1 keyboard'), keyTable('kbB', 'Player 2 keyboard'), padTable),
      h('button', { class: 'btn small', onclick: () => {
        s.controls = { kbA: structuredClone(DEFAULT_KEYS.kbA), kbB: structuredClone(DEFAULT_KEYS.kbB), pad: structuredClone(DEFAULT_PAD) };
        save();
        renderControls();
      } }, 'Reset controls to defaults'),
    );
  };
  renderControls();

  const body = h('div', { class: 'settings' },
    h('section', {}, h('h3', {}, 'Sound'),
      h('label', { class: 'row' }, h('span', {}, 'Volume'), volume),
      h('label', { class: 'row' }, h('span', {}, 'Music'), musicVolume),
      tracks.length ? null : h('p', { class: 'fine' }, 'This build has no music files (docs/AUDIO.md), so only sound effects play.'),
      toggle('Mute', s.muted, (v) => (s.muted = v))),
    h('section', {}, h('h3', {}, 'Accessibility'),
      toggle('Reduced motion', s.reducedMotion, (v) => (s.reducedMotion = v), 'No screen shake, flashes or drifting petals.'),
      toggle('Captions for sounds', s.captions, (v) => (s.captions = v), 'Text for the sounds that matter: round start, K.O., throws and escapes, supers, fireballs, clashes, knockdowns, parries, guard cancels and bursts.')),
    h('section', {}, h('h3', {}, 'Touch'),
      choice('Touch controls', [['auto', 'Automatic (touch screens)'], ['on', 'Always on'], ['off', 'Off']], s.touch, (v) => (s.touch = /** @type {'auto'} */ (v))),
      toggle('Easy specials', s.easySpecials, (v) => (s.easySpecials = v), 'A Special button: specials without the motions (80% damage).')),
    h('section', {}, h('h3', {}, 'Versus and CPU'),
      choice('CPU difficulty', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], s.cpu, (v) => (s.cpu = /** @type {'easy'} */ (v))),
      toggle('Swap gamepads in versus', s.swapPads, (v) => (s.swapPads = v))),
    h('section', {}, h('h3', {}, 'Training overlays (defaults)'),
      toggle('Hitboxes and hurtboxes', s.training.boxes, (v) => (s.training.boxes = v)),
      toggle('Frame meter', s.training.frameMeter, (v) => (s.training.frameMeter = v)),
      toggle('Input display', s.training.inputs, (v) => (s.training.inputs = v)),
      toggle('Frame data', s.training.frameData, (v) => (s.training.frameData = v))),
    h('section', { class: 'span' }, h('h3', {}, 'Controls'), controls),
  );
  return openModal(app, 'Settings', body, onClose, 'wide');
}

/**
 * How to play: the controls and the basics, for the title screen.
 * @param {import('../App.js').App} app
 */
export function openHowToPlay(app) {
  const k = app.settings.controls.kbA;
  const keys = (/** @type {import('../../engine/input/bindings.js').Action} */ a) => k[a].map(keyName).join('/');
  const body = h('div', { class: 'howto' },
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Action'), h('th', {}, 'Keyboard (P1)'), h('th', {}, 'Gamepad'), h('th', {}, 'Touch'))),
      h('tbody', {},
        h('tr', {}, h('td', {}, 'Move, jump, crouch'), h('td', {}, `${keys('up')} ${keys('left')} ${keys('down')} ${keys('right')}`), h('td', {}, 'D-pad / left stick'), h('td', {}, 'Left thumb')),
        h('tr', {}, h('td', {}, 'Light / Medium / Heavy'), h('td', {}, `${keys('L')} / ${keys('M')} / ${keys('H')}`), h('td', {}, 'X / Y / B'), h('td', {}, 'L / M / H')),
        h('tr', {}, h('td', {}, 'Throw (L+M)'), h('td', {}, keys('throw')), h('td', {}, 'A'), h('td', {}, 'Throw')),
        h('tr', {}, h('td', {}, 'Parry / guard cancel (M+H)'), h('td', {}, keys('parry')), h('td', {}, 'LB'), h('td', {}, 'Parry')),
        h('tr', {}, h('td', {}, 'Burst (L+M+H)'), h('td', {}, keys('burst')), h('td', {}, 'RT'), h('td', {}, 'Burst')),
        h('tr', {}, h('td', {}, 'Easy special'), h('td', {}, keys('SP')), h('td', {}, 'RB'), h('td', {}, 'Special')),
        h('tr', {}, h('td', {}, 'Pause'), h('td', {}, 'Esc'), h('td', {}, 'Menu / Options'), h('td', {}, 'II')))),
    h('ul', {},
      h('li', {}, 'Block by holding back (away from the opponent). Hold down-back to block lows; stand to block overheads and jump-ins.'),
      h('li', {}, 'Dash: tap forward twice. Throw: L+M close up; press L+M as you get grabbed to escape.'),
      h('li', {}, 'Parry: press M+H just before a hit lands (hold down for lows). It does nothing to you, and you can act first. Miss it and you are open for a moment; throws beat it.'),
      h('li', {}, 'Guard cancel: press M+H while blocking to strike back out of the block. Costs half your meter.'),
      h('li', {}, 'Burst: press L+M+H while being hit to break out of a combo, once a round. It can be blocked.'),
      h('li', {}, 'Specials are a direction motion, then a button. ↓ ↘ → + button: roll from down to forward (facing right: S, S+D, D on the keyboard), pressing the button at the end. → ↓ ↘ + button: forward, down, down-forward. Hold ← then → + button: hold back for about ⅔ of a second, then forward. Super, with a full meter: ↓ ↘ → twice, then Heavy. The move list shows the exact keys and buttons for each move, and the Easy shortcut (Special + a direction) for doing them without the motion.'),
      h('li', {}, 'Training mode shows hitboxes, frame data, a frame meter and your inputs: the best way to see how it all works.')));
  return openModal(app, 'How to play', body, undefined, 'wide');
}
