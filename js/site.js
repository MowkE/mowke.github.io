// site.js
// Home interactions, plus the three chapter scenes. Each scene only
// renders while its section is on screen, so three WebGL canvases cost
// what one does.

import { initCells } from './bio.js';
import { initRobot } from './robot.js';
import { initCode } from './code.js';

const $ = id => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

// ── the name breathes toward the cursor ───────────────────────────
const letters = [];
document.querySelectorAll('#name .line').forEach(line => {
  const word = line.dataset.word;
  line.textContent = '';
  for (const ch of word) {
    const s = document.createElement('span');
    s.className = 'ch'; s.textContent = ch; s.setAttribute('aria-hidden', 'true');
    line.appendChild(s); letters.push(s);
  }
});
if (fine && !reduced) {
  addEventListener('pointermove', e => {
    if (scrollY > innerHeight) return;
    for (const s of letters) {
      const r = s.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const k = Math.max(0, 1 - d / 320);
      s.style.setProperty('--w', (78 + 72 * k * k).toFixed(1));
      s.style.color = k > 0.72 ? 'var(--olive)' : '';
    }
  }, { passive: true });
}

// ── the Snoopy terminal tilts under the pointer ───────────────────
const term = $('term');
if (fine && !reduced) {
  term.addEventListener('pointermove', e => {
    const r = term.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    term.style.setProperty('--ry', `${x * 14}deg`);
    term.style.setProperty('--rx', `${-y * 14}deg`);
  });
  term.addEventListener('pointerleave', () => { term.style.setProperty('--ry', '0deg'); term.style.setProperty('--rx', '0deg'); });
}

// ── nav: go dark over dark rooms, light up the current chapter ────
const nav = document.querySelector('.nav');
const navLinks = [...document.querySelectorAll('.nav-links a')];
const rooms = [
  { el: $('top'), dark: false, id: null },
  { el: $('bio'), dark: true, id: 'bio' },
  { el: $('hardware'), dark: false, id: 'hardware' },
  { el: $('software'), dark: true, id: 'software' },
];
function navState() {
  const y = 40;
  const room = rooms.find(r => { const b = r.el.getBoundingClientRect(); return b.top <= y && b.bottom > y; }) || rooms[rooms.length - 1];
  nav.classList.toggle('dark', room.dark);
  navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${room.id}`));
}
addEventListener('scroll', navState, { passive: true });
navState();

// ── scenes, started lazily and paused offscreen ───────────────────
function mount(section, make) {
  let scene = null;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !scene) scene = make();
    if (scene) scene.setActive(e.isIntersecting);
  }, { rootMargin: '200px 0px' }).observe(section);
}

mount($('bio'), () => initCells($('cells'), n => { $('cell-count').textContent = n; }));
mount($('hardware'), () => initRobot($('robot'), $('build'), {
  n: $('stage-n'), name: $('stage-name'), note: $('stage-note'), card: document.querySelector('.stage-card'),
  bar: $('build-bar'), buttons: [...document.querySelectorAll('#subnav button')],
}));
mount($('software'), () => initCode($('code')));
