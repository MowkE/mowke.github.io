// woodstock.js
// Hover the Snoopy card and Woodstock shows up in ASCII, following your
// cursor on a lagging spring, facing the way he flies and flapping as he
// goes. Click the card to hear another quote.

{
const term = document.getElementById('term');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Samahith's ASCII Woodstock, all yellow; denser characters glow brighter
const ART = ["                 .+.", "               .: *@#*+.. .:.", "              .##  +@@@@###@.", "         .:+*#@@@+  +@@@@@@@:", "         ....:*#@#:  .#@@@@@*          ::.", "               .+@@+.   ..+@*       .+#@@#.", "                 +@@#**++*#@#:    :#@@@@@@@+.", "                  #@@@@@@@@@@@#*+#@@@@*++::++++.", "                  #@@@@@@@@@@@@@@@@@#:..::.   .:", "                 *@@@@@@@@@@@@@@@@@@##@@@@@@*+.", "               :*@@@@@@@@@@@@@@@@@@@@@@@#@@@@@*.", "            .+#@@##@@@@@@@@@@@@@@@@@@+.*@@@@+.", "          :*#@@#@+ :#@@@@@@@@@@@@@@@@*  +@@.", "       .+#@@@@@@@#. .@@@@@@@@@@@@@@@@@*  ..", "     +#@@@@@@@@@@@#+*@@@@@@@@@@@@@#@@@@+", "   .*@@@@@@@@@@@@@@@@@@@#@*.*@@@@@.:#@:                 +*", "   +@##@@@@@@@@@@@@##@@@@@. :@@@@@+ .:             :...*@@#+.", "   :#@@@@@@@@@@@@@@@@@@#+..*@@@**:.               *@@@@@@@@@@#:", "     :++*+++:::::+***+: .*@@@#:                  :@@@@@#+:....", "                        ..+#@#     :+*.          +@#@@*", "                           .#@* .+##+. +:        +@@@:", "                            *@#+@#:::+*+        :@@*.", "                       .:*. *@@@@##@@*        .+#*:", "                       :++. #@@@@@@@*.+*+.  ++:.", "                     :...:  :@#@@@@@##@@@#  :..:*:", "                            .#@@@@@@@@@@#+:*#**@@: .", "                              +#@@@@@#++*+..+: :@+ +.", "                                :+++.    : .## .@: @+", "                                           :@: +@. @+", "                                           *: .@#  @:", "                                          +@  #@+ .#", "                                          ** :@@: ::", "                                              ::"];
const bird = document.createElement('pre');
bird.className = 'woodstock'; bird.setAttribute('aria-hidden', 'true');
const tone = c => '@#'.includes(c) ? 'a' : '*+'.includes(c) ? 'b' : 'c';
bird.innerHTML = ART.map(l => l.replace(/[@#]+|[*+]+|[.:]+/g, m => `<b class="${tone(m[0])}">${m}</b>`)).join('\n');
term.appendChild(bird);

const pos = { x: 0, y: 0, vx: 0, vy: 0 }, goal = { x: 0, y: 0 };
let on = false, face = 1, raf = 0, t = 0;

term.addEventListener('pointerenter', e => {
  const r = term.getBoundingClientRect();
  goal.x = pos.x = e.clientX - r.left; goal.y = pos.y = e.clientY - r.top;
  on = true; bird.classList.add('on');
  if (!raf) raf = requestAnimationFrame(tick);
});
term.addEventListener('pointermove', e => { const r = term.getBoundingClientRect(); goal.x = e.clientX - r.left; goal.y = e.clientY - r.top; });
term.addEventListener('pointerleave', () => { on = false; bird.classList.remove('on'); });
term.addEventListener('click', () => window.__intro && window.__intro.replay());

function tick() {
  t += 1;
  // a lagging spring, so he trails the cursor like he's flying after it
  const k = reduced ? 1 : 0.08, damp = reduced ? 0 : 0.78;
  pos.vx = (pos.vx + (goal.x - 38 - pos.x) * k) * damp;
  pos.vy = (pos.vy + (goal.y - 34 - pos.y) * k) * damp;
  pos.x += pos.vx; pos.y += pos.vy;
  if (Math.abs(pos.vx) > 0.4) face = pos.vx > 0 ? 1 : -1;
  const speed = Math.hypot(pos.vx, pos.vy);
  const bob = Math.sin(t / 9) * 3;
  const bw = bird.offsetWidth / 2, bh = bird.offsetHeight / 2;   // scale about his centre so flipping keeps him in place
  bird.style.transform = `translate(${pos.x - bw}px, ${pos.y + bob - bh}px) scale(${-face * 0.44}, 0.44) rotate(${Math.max(-12, Math.min(12, pos.vy * 1.5))}deg)`;
  if (on || speed > 0.05) raf = requestAnimationFrame(tick); else raf = 0;
}
}
