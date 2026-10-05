// Time capsule: sealed 2026-10-04, opens three years later (Pacific time).
(() => {
  const OPENS = Date.parse('2029-10-04T00:00:00-07:00');
  const root = document.getElementById('capsule'); if (!root) return;
  const el = u => root.querySelector(`[data-u="${u}"]`), pad = n => String(n).padStart(2, '0');
  function tick() {
    const left = Math.max(0, OPENS - Date.now()), s = Math.floor(left / 1000);
    el('d').textContent = Math.floor(s / 86400).toLocaleString();
    el('h').textContent = pad(Math.floor(s / 3600) % 24);
    el('m').textContent = pad(Math.floor(s / 60) % 60);
    el('s').textContent = pad(s % 60);
    if (!left) { root.classList.add('open'); root.querySelector('.cap-foot').textContent = 'opened Oct 4, 2029.'; return; }
    setTimeout(tick, 1000 - (Date.now() % 1000));
  }
  tick();
})();
