// Sidequest recs: one textbox, "what sidequest shld we do yo". Stored in Supabase; a note shows up only after Samahith approves it
// (see supabase/sidequests.sql). The anon key is public by design: row-level
// security only lets visitors insert unapproved notes and read approved ones.
(() => {
  const SUPABASE_URL = 'https://rslxunyxxsfgeqlbszwu.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_cYd2A90Cyo6WhZfTRdFNOA_-iqcC8Bf';   // publishable: safe in the page
  const live = SUPABASE_URL && SUPABASE_KEY;
  const api = (q, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/sidequests${q}`, { ...init,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const open = document.getElementById('sq-open'), dlg = document.getElementById('sq');
  if (!open || !dlg) return;
  if (!live) { open.hidden = true; return; }   // stays hidden until the Supabase keys are filled in
  const board = dlg.querySelector('.sq-board'), form = dlg.querySelector('form'), status = dlg.querySelector('.sq-status');
  let loaded = false;

  function render(notes) {
    if (!notes.length) { board.innerHTML = ''; return; }
    board.innerHTML = notes.map((n, i) => `<figure class="sq-note${i % 3 === 1 ? ' alt' : ''}" style="--tilt:${((i * 37) % 7 - 3) * 0.7}deg"><p>${esc(n.note)}</p></figure>`).join('');
  }
  async function load() {
    if (!live) { board.innerHTML = '<p class="sq-empty">The board isn\'t connected yet. Check back soon.</p>'; return; }
    board.innerHTML = '';
    try {
      const r = await api('?select=note,created_at&order=created_at.desc&limit=120');
      if (!r.ok) throw 0; render(await r.json()); loaded = true;
    } catch { board.innerHTML = '<p class="sq-empty">Couldn\'t load the board. Check your connection and open it again.</p>'; }
  }

  let lastFocus = null;
  function show() {
    lastFocus = document.activeElement; dlg.hidden = false; document.documentElement.classList.add('sq-on');
    requestAnimationFrame(() => dlg.classList.add('in')); form.note.focus({ preventScroll: true });
    if (!loaded) load();
  }
  function hide() {
    dlg.classList.remove('in'); document.documentElement.classList.remove('sq-on');
    setTimeout(() => { dlg.hidden = true; }, 220); lastFocus && lastFocus.focus();
  }
  open.addEventListener('click', show);
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('.sq-close')) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) hide(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.website.value) return;            // honeypot: bots fill every field
    const body = { name: 'anonymous', note: form.note.value.trim(), kind: 'together' };
    if (body.note.length < 3) { status.textContent = 'Write a few more words first.'; form.note.focus(); return; }
    if (!live) { status.textContent = "The board isn't connected yet, so this didn't send. Try again soon."; return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; status.textContent = 'Pinning…';
    try {
      const r = await api('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      if (!r.ok) throw 0;
      form.note.value = '';
      status.textContent = "Pinned. It'll show up on the board once I've read it.";
    } catch { status.textContent = "Couldn't pin that. Check your connection and try again."; }
    btn.disabled = false;
  });
})();
