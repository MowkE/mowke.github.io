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
  list.addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (b) show(b.dataset.p); });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.sq-close')) hide(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!dlg.hidden) hide(); else if (btn.getAttribute('aria-expanded') === 'true') { setMenu(false); btn.focus(); }
  });
})();
