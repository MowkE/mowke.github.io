// intro.js
// The site opens as the olive terminal, full screen. A quote is typed the
// way a person types (uneven rhythm, the occasional typo and backspace),
// the author appears, and then the whole terminal shrinks and flies into
// its place as the Snoopy card on the home page. Click or press any key
// to skip. Plays once per browser session.

// ── swap these for your own quotes ────────────────────────────────────
const QUOTES = [
  { text: 'The best way to predict the future is to invent it.', by: 'Alan Kay' },
  { text: 'You are much stronger than you think you are. Trust me.', by: 'Superman' },
  { text: 'I AM USING MY IMAGINATION', by: 'brakence' },
  { text: 'The greatest superpower is the ability to change yourself.', by: 'Naval Ravikant' },
  { text: 'Only those who will risk going too far can possibly find out how far one can go.', by: 'T. S. Eliot' },
];

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const seen = (() => { try { return sessionStorage.getItem('introSeen'); } catch { return null; } })();
const force = new URLSearchParams(location.search).has('intro');

if ((!seen || force) && !reduced) run();

function run() {
  try { sessionStorage.setItem('introSeen', '1'); } catch {}
  const q = QUOTES[(Math.random() * QUOTES.length) | 0];
  document.documentElement.classList.add('intro-on');
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `<div class="i-bar"><i></i><i></i><i></i><span>~/hello</span></div>
    <div class="i-body"><p class="i-q"><span class="i-pr">$ </span><span class="i-t"></span><span class="i-caret">▍</span></p><p class="i-by"></p></div>
    <button class="i-skip">skip</button>`;
  document.body.appendChild(el);
  const t = el.querySelector('.i-t'), by = el.querySelector('.i-by');
  let done = false, timer;

  const KEYS = 'qwertyuiopasdfghjklzxcvbnm';
  const near = c => KEYS[(KEYS.indexOf(c) + (Math.random() < 0.5 ? 1 : -1) + KEYS.length) % KEYS.length] || 'e';
  // build the keystroke script: mostly right, sometimes a typo that gets fixed
  const script = [];
  let typos = 0;
  for (const c of q.text) {
    if (/[a-z]/.test(c) && typos < 2 && Math.random() < 0.05) { script.push(near(c), 'PAUSE', 'BS'); typos++; }
    script.push(c);
  }
  let i = 0;
  const next = () => {
    if (done) return;
    if (i >= script.length) { by.textContent = `— ${q.by}`; by.classList.add('on'); timer = setTimeout(finish, 1300); return; }
    const k = script[i++];
    let wait = 38 + Math.random() * 55;
    if (k === 'BS') t.textContent = t.textContent.slice(0, -1), wait = 120;
    else if (k === 'PAUSE') wait = 260;
    else { t.textContent += k; if (k === ' ') wait += 30; if (/[,.]/.test(k)) wait += 220; }
    timer = setTimeout(next, wait);
  };
  timer = setTimeout(next, 500);

  function finish() {
    if (done) return; done = true; clearTimeout(timer);
    t.textContent = q.text; by.textContent = `— ${q.by}`; by.classList.add('on');
    const card = document.getElementById('term');
    if (card) card.style.visibility = 'hidden';
    const r = card ? card.getBoundingClientRect() : null;
    const from = el.getBoundingClientRect();
    el.classList.add('leaving');
    if (r) {
      const sx = r.width / from.width, sy = r.height / from.height;
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${r.left - from.left}px, ${r.top - from.top}px) scale(${sx}, ${sy})`;
      el.style.borderRadius = `${18 / Math.min(sx, sy)}px`;
    }
    setTimeout(() => {
      if (card) card.style.visibility = '';
      document.documentElement.classList.remove('intro-on');
      el.remove();
    }, 900);
  }
  const skip = () => finish();
  el.addEventListener('click', skip);
  addEventListener('keydown', skip, { once: true });
}
