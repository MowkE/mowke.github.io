// site.js
// The front door: the name breathes toward the cursor and the Snoopy
// terminal tilts under it. The three rooms live on their own pages.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;

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
    for (const s of letters) {
      const r = s.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const k = Math.max(0, 1 - d / 320);
      s.style.setProperty('--w', (78 + 72 * k * k).toFixed(1));
      s.style.color = k > 0.72 ? 'var(--olive)' : '';
    }
  }, { passive: true });
  const term = document.getElementById('term');
  term.addEventListener('pointermove', e => {
    const r = term.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    term.style.setProperty('--ry', `${x * 14}deg`);
    term.style.setProperty('--rx', `${-y * 14}deg`);
  });
  term.addEventListener('pointerleave', () => { term.style.setProperty('--ry', '0deg'); term.style.setProperty('--rx', '0deg'); });
}
