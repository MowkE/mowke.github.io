// Burger menu (top right of home): four small pages that open as overlays.
(() => {
  const btn = document.getElementById('mn-btn'), list = document.getElementById('mn-list'), dlg = document.getElementById('mp');
  if (!btn || !list || !dlg) return;
  const setMenu = on => {
    btn.setAttribute('aria-expanded', on); btn.classList.toggle('on', on);
    if (on) { list.hidden = false; requestAnimationFrame(() => list.classList.add('in')); list.querySelector('button').focus({ preventScroll: true }); }
    else { list.classList.remove('in'); setTimeout(() => { if (!list.classList.contains('in')) list.hidden = true; }, 180); }
  };
  btn.addEventListener('click', () => setMenu(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('click', e => { if (!e.target.closest('#mn') && btn.getAttribute('aria-expanded') === 'true') setMenu(false); });

  function show(key) {
    dlg.querySelectorAll('section[data-p]').forEach(s => { const on = s.dataset.p === key; s.hidden = !on; s.querySelector('h2').id = on ? 'mp-h' : ''; });
    setMenu(false); dlg.hidden = false; document.documentElement.classList.add('sq-on');
    requestAnimationFrame(() => dlg.classList.add('in')); dlg.querySelector('.sq-close').focus({ preventScroll: true });
  }
  function hide() {
    dlg.classList.remove('in'); document.documentElement.classList.remove('sq-on');
    setTimeout(() => { dlg.hidden = true; }, 220); btn.focus({ preventScroll: true });
  }
  // Random words: one entry from the Dictionary of metarealizations per click, never the same twice in a row
  const W = window.WORDS || [], card = dlg.querySelector('.wd-card'), count = dlg.querySelector('.wd-count');
  const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let last = -1;
  function generate() {
    if (!W.length || !card) return;
    let i; do { i = Math.floor(Math.random() * W.length); } while (W.length > 1 && i === last); last = i;
    const [word, from, meaning] = W[i];
    card.classList.remove('in'); void card.offsetWidth;
    card.innerHTML = `<h3 class="${word ? '' : 'wd-blank'}">${word ? escH(word) : '<span aria-label="no word">&nbsp;</span>'}</h3>${from ? `<p class="wd-from mono">${escH(from)}</p>` : ''}<p class="wd-def">${escH(meaning)}</p>`;
    card.classList.add('in'); count.textContent = `${i + 1} of ${W.length}`;
  }
  dlg.querySelector('.wd-go')?.addEventListener('click', generate);
  list.addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) show(b.dataset.p); });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.sq-close')) hide(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!dlg.hidden) hide(); else if (btn.getAttribute('aria-expanded') === 'true') { setMenu(false); btn.focus(); }
  });
})();
