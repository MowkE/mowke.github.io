// gate.js
// A password screen in front of the whole site. GitHub Pages is static, so
// this only keeps casual visitors out: the files themselves stay public.
// Loaded in <head> of every page so nothing shows before it decides.
(() => {
  const HASH = '6bbccf1ae393795f176990c6fc11b750ca0ae6669f4a3877ce0973583334e30e';
  let ok = false;
  try { ok = localStorage.getItem('gate') === HASH; } catch {}
  if (ok) return;
  window.__gateLocked = true;
  const root = document.documentElement;
  root.classList.add('gated');
  const css = document.createElement('style');
  css.textContent = `
    html.gated body > *:not(#gate) { visibility: hidden !important; }
    html.gated, html.gated body { overflow: hidden !important; }
    #gate { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; background: #f3f1ea; color: #17171a;
      font: 400 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
    #gate form { width: min(340px, calc(100vw - 40px)); display: grid; gap: 12px; }
    #gate h1 { margin: 0 0 4px; font: 400 44px/1 "Happy Monkey", -apple-system, sans-serif; }
    #gate p { margin: 0; color: #55544f; }
    #gate input { min-height: 44px; padding: 0 14px; border: 1.5px solid #17171a; border-radius: 12px; background: #fff; color: #17171a; font: inherit; outline: 0; }
    #gate input:focus-visible { box-shadow: 0 0 0 3px rgba(90, 97, 58, 0.35); }
    #gate button { min-height: 44px; border: 0; border-radius: 12px; background: #5a613a; color: #fff; font: 600 15px -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer;
      transition: transform 160ms cubic-bezier(0.32, 0.72, 0, 1); }
    #gate button:active { transform: scale(0.97); }
    #gate .err { color: #b3261e; min-height: 1.5em; font-size: 13.5px; }
    #gate form.shake { animation: gshake 380ms cubic-bezier(0.32, 0.72, 0, 1); }
    @keyframes gshake { 20% { translate: -8px 0; } 45% { translate: 7px 0; } 70% { translate: -4px 0; } }
    @media (prefers-reduced-motion: reduce) { #gate form.shake { animation: none; } }`;
  document.head.appendChild(css);
  const show = () => {
    if (document.getElementById('gate')) return;
    const g = document.createElement('div'); g.id = 'gate';
    g.innerHTML = `<form autocomplete="off"><h1>samahith</h1><p>This site is private for now. Enter the password to come in.</p>
      <input type="password" aria-label="Password" placeholder="Password" autofocus><button type="submit">Enter site</button><p class="err" aria-live="polite"></p></form>`;
    document.body.appendChild(g);
    const f = g.querySelector('form'), inp = g.querySelector('input'), err = g.querySelector('.err');
    inp.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inp.value.trim()));
      const h = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (h === HASH) {
        try { localStorage.setItem('gate', HASH); } catch {}
        g.remove(); root.classList.remove('gated'); window.__gateLocked = false;
        dispatchEvent(new Event('gate-open'));
      } else {
        err.textContent = 'That password is wrong. Try again.';
        f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
        inp.select();
      }
    });
  };
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
