// intro.js
// The site opens as the olive terminal, full screen. A quote is typed the
// way a person types (uneven rhythm, the occasional typo and backspace),
// the author appears, and then the whole terminal shrinks and flies into
// its place as the Snoopy card on the home page. Click or press any key
// to skip. Plays on the first visit of every browser session. With reduced
// motion the quote still shows, set all at once, and fades instead of flying.

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
let lastQ = -1;

if (!seen || force) run();
else document.documentElement.classList.remove('intro-on');
// safety net: the page must never stay hidden once no intro is on screen
setInterval(() => { if (!document.getElementById('intro')) document.documentElement.classList.remove('intro-on'); }, 1000);
// clicking the Snoopy card plays it again with a different quote
window.__intro = { replay: () => { if (!document.getElementById('intro')) run({ replay: true }); } };

function run(opts = {}) {
  try { sessionStorage.setItem('introSeen', '1'); } catch {}
  let qi; do { qi = (Math.random() * QUOTES.length) | 0; } while (qi === lastQ && QUOTES.length > 1);
  lastQ = qi;
  const q = QUOTES[qi];
  if (!opts.replay) document.documentElement.classList.add('intro-on');
  const el = document.createElement('div');
  el.id = 'intro';
  el.innerHTML = `<div class="i-bar"><i></i><i></i><i></i><span>~/hello</span></div>
    <div class="i-body"><p class="i-q"><span class="i-pr">$ </span><span class="i-t"></span><span class="i-caret">▍</span></p><p class="i-by"></p></div>
    <span class="i-sound" hidden>click anywhere for sound</span><button class="i-skip">skip</button>`;
  document.body.appendChild(el);
  const t = el.querySelector('.i-t'), by = el.querySelector('.i-by');
  if (opts.replay) {
    // grow out of the card, the reverse of the ending
    const card = document.getElementById('term'), r = card.getBoundingClientRect();
    card.style.visibility = 'hidden';
    el.style.transition = 'none'; el.style.transformOrigin = '0 0';
    el.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
    el.getBoundingClientRect();
    el.style.transition = ''; el.style.transform = '';
  }

  // ── keyboard sounds, synthesized: a filtered click plus a soft thock ──
  let ac = null;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  const soundBtn = el.querySelector('.i-sound');
  if (ac && ac.state !== 'running') {
    ac.resume().catch(() => {});
    setTimeout(() => { if (ac.state !== 'running' && !done) soundBtn.hidden = false; }, 150);
  }
  const soundOn = () => ac && ac.state === 'running';
  let noise = null;
  if (ac) {
    noise = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  }
  // real keystrokes: 18 clean clicks sliced from a typing recording, one per 150 ms slot
  let sprite = null, lastSlot = -1;
  const SLOT = 0.15, SLEN = 0.13, NS = 18;
  if (ac) fetch('assets/audio/keys.mp3').then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(buf => { sprite = buf; }).catch(() => {});
  function key(kind = 'key') {
    if (!ac || ac.state !== 'running') return;
    if (sprite) {
      let i;
      if (kind === 'space') i = Math.random() < 0.5 ? 0 : 1;
      else if (kind === 'bs') i = NS - 1;
      else { do { i = 2 + ((Math.random() * (NS - 3)) | 0); } while (i === lastSlot); }
      lastSlot = i;
      const src = ac.createBufferSource(), gn = ac.createGain();
      src.buffer = sprite;
      src.playbackRate.value = (kind === 'space' ? 0.9 : 1) * (0.96 + Math.random() * 0.08);
      gn.gain.value = 0.75 + Math.random() * 0.25;
      src.connect(gn).connect(ac.destination);
      src.start(ac.currentTime, i * SLOT, SLEN);
      return;
    }
    const now = ac.currentTime, out = ac.createGain();
    out.gain.value = kind === 'space' ? 0.5 : 0.38; out.connect(ac.destination);
    // click: noise through a bandpass, pitch varies per key
    const src = ac.createBufferSource(); src.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = (kind === 'space' ? 1400 : kind === 'bs' ? 2600 : 3200) * (0.85 + Math.random() * 0.3); bp.Q.value = 1.2;
    src.connect(bp).connect(out); src.start(now);
    // thock: a short low sine drop for the body of the key
    const o = ac.createOscillator(), og = ac.createGain();
    o.frequency.setValueAtTime(kind === 'space' ? 150 : 220 + Math.random() * 60, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.05);
    og.gain.setValueAtTime(kind === 'space' ? 0.5 : 0.3, now); og.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    o.connect(og).connect(out); o.start(now); o.stop(now + 0.07);
  }
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
    if (k === 'BS') { t.textContent = t.textContent.slice(0, -1); wait = 120; key('bs'); }
    else if (k === 'PAUSE') wait = 260;
    else { t.textContent += k; key(k === ' ' ? 'space' : 'key'); if (k === ' ') wait += 30; if (/[,.]/.test(k)) wait += 220; }
    timer = setTimeout(next, wait);
  };
  if (reduced) { t.textContent = q.text; by.textContent = `— ${q.by}`; by.classList.add('on'); el.querySelector('.i-caret').hidden = true; timer = setTimeout(finish, 3400); }
  else timer = setTimeout(next, opts.replay ? 950 : 500);

  function finish() {
    if (done) return; done = true; clearTimeout(timer);
    t.textContent = q.text; by.textContent = `— ${q.by}`; by.classList.add('on');
    const card = document.getElementById('term');
    if (card) card.style.visibility = 'hidden';
    const r = card ? card.getBoundingClientRect() : null;
    const from = el.getBoundingClientRect();
    if (reduced) { el.style.transition = 'opacity 0.4s'; el.style.opacity = '0'; }
    else el.classList.add('leaving');
    if (r && !reduced) {
      const sx = r.width / from.width, sy = r.height / from.height;
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${r.left - from.left}px, ${r.top - from.top}px) scale(${sx}, ${sy})`;
      el.style.borderRadius = `${18 / Math.min(sx, sy)}px`;
    }
    setTimeout(() => { if (ac) ac.close().catch(() => {}); }, 600);
    setTimeout(() => {
      if (card) card.style.visibility = '';
      document.documentElement.classList.remove('intro-on');
      el.remove();
    }, 900);
  }
  // the first interaction unlocks sound (browsers require one); after that, interactions skip
  const interact = e => {
    if (e.target && e.target.closest && e.target.closest('.i-skip')) { finish(); return; }
    if (ac && !soundOn()) { ac.resume(); soundBtn.hidden = true; return; }
    finish();
  };
  el.addEventListener('pointerdown', interact);
  const onKey = e => { if (done) { removeEventListener('keydown', onKey); return; } interact(e); };
  addEventListener('keydown', onKey);
}
