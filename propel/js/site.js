// Propel download page. Every download is "coming soon": the pressed button
// says so, and a sheet rises from it with the two things you can do instead.
(function () {
  'use strict';

  // ── Which OS the hero button offers ──
  var ua = navigator.userAgent || '';
  var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var os = /Mac|iPhone|iPad/i.test(plat + ua) ? 'macOS' : /Win/i.test(plat + ua) ? 'Windows' : /Linux|X11|Android|CrOS/i.test(plat + ua) ? 'Linux' : 'macOS';
  var hero = document.getElementById('hero-dl');
  if (hero) {
    hero.querySelector('.lbl').textContent = 'Download for ' + os;
    hero.dataset.dl = 'Propel for ' + os;
  }

  // ── The sheet ──
  var sheet = document.getElementById('sheet');
  var title = document.getElementById('sheet-t');
  var mail = document.getElementById('sheet-mail');
  var closeBtn = sheet.querySelector('.sheet-x');
  var opener = null;
  var mobile = function () { return window.innerWidth < 640; };

  function place(btn) {
    sheet.classList.toggle('bottom', mobile());
    if (mobile()) { sheet.style.left = sheet.style.top = ''; return; }
    var r = btn.getBoundingClientRect();
    var w = sheet.offsetWidth, h = sheet.offsetHeight;
    var left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    var below = r.bottom + 10;
    var top = below + h <= window.innerHeight - 12 ? below : Math.max(12, r.top - 10 - h);
    sheet.style.left = left + 'px';
    sheet.style.top = top + 'px';
    sheet.style.transformOrigin = (r.left + r.width / 2 - left) + 'px ' + (top === below ? '0' : '100%');
  }

  function open(btn) {
    var name = btn.dataset.dl || 'Propel';
    var lbl = btn.querySelector('.lbl');
    if (lbl) { lbl.textContent = 'Coming soon'; }
    btn.classList.add('is-soon');
    title.textContent = name + " isn't out yet";
    mail.href = 'mailto:samahith@uw.edu?subject=' + encodeURIComponent(name) + '&body=' + encodeURIComponent('Send me the link when it ships.');
    opener = btn;
    sheet.hidden = false;
    place(btn);
    // restart the rise so a second press animates again
    sheet.style.animation = 'none'; void sheet.offsetWidth; sheet.style.animation = '';
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (opener) { opener.focus({ preventScroll: true }); opener = null; }
  }

  document.querySelectorAll('[data-dl]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); open(btn); });
  });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.addEventListener('pointerdown', function (e) {
    if (sheet.hidden) return;
    if (sheet.contains(e.target) || (opener && opener.contains(e.target))) return;
    close();
  });
  // "Watch the demo" in the sheet scrolls to the video and closes the sheet.
  var sheetDemo = document.getElementById('sheet-demo');
  if (sheetDemo) sheetDemo.addEventListener('click', function () { close(); });
  window.addEventListener('resize', function () { if (!sheet.hidden && opener) place(opener); });
  // The sheet is fixed, so it follows its button while the page scrolls and leaves with it.
  window.addEventListener('scroll', function () {
    if (sheet.hidden || !opener || mobile()) return;
    var r = opener.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { close(); } else { place(opener); }
  }, { passive: true });

  // ── Demo video: a still until pressed, so YouTube only loads for people who watch ──
  var video = document.getElementById('video');
  var play = video && video.querySelector('.video-play');
  if (play) {
    var still = play.querySelector('img');
    // Not every video has a max-resolution still; fall back to the one that always exists.
    still.addEventListener('error', function () { if (!/hqdefault/.test(still.src)) still.src = 'https://i.ytimg.com/vi/bILMYOQRC60/hqdefault.jpg'; });
    play.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/bILMYOQRC60?autoplay=1&rel=0&modestbranding=1';
      f.title = 'Propel demo';
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen = true;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      video.replaceChild(f, play);
      f.focus();
    });
  }

  // ── The window: switch between example workspaces ──
  // Each workspace mirrors the files that ship in demo-workspaces/<name>. Lines are [class, text] pairs.
  var D = 'c-dim', K = 'c-key', V = 'c-val';
  var WS = {
    'northwind-coffee': {
      label: 'The Propel editor in the Northwind Coffee workspace. A campaign post is open. The agent reports that lint passed and asks for approval to schedule the post to Instagram on Thursday at 9:00.',
      tree: [['d', '.propel'], ['d open', 'brand'], ['f i2', 'brand.yaml'], ['f i2', 'voice.md'], ['d open', 'campaigns'], ['d open i2', 'fall-harvest'], ['f i3', 'campaign.yaml'], ['f i3', 'brief.md'], ['f i3 on', 'drying-tables.instagram.post.md'], ['f i3', 'standing-order.email.md'], ['d i2', 'holiday-gifting'], ['d', 'audiences'], ['d', 'commerce'], ['d', 'finance'], ['d', 'library']],
      tabs: ['drying-tables.instagram.post.md', 'brief.md', 'snapshot.yaml'],
      code: [[[D, '---']], [[K, 'type:'], [0, ' post']], [[K, 'channel:'], [0, ' instagram']], [[K, 'campaign:'], [0, ' fall-harvest']], [[K, 'status:'], [0, ' '], [V, 'review']], [[K, 'schedule:'], [0, ' 2026-11-06 09:00']], [[D, '---']], [], [[0, 'Meet Almaz. She runs the drying tables']], [[0, 'at the washing station where our']], [[0, 'Ethiopia is processed, and she decides']], [[0, 'when a lot is done.']], [], [[0, "This week's roast is hers. 19 bags left."]], [], [[D, '#ethiopia #smallbatch #portlandmaine']]],
      me: 'Move the Ethiopia post to review and schedule it for Thursday morning.',
      agent: 'Lint passed, 0 problems. Status is now <b>review</b>. Scheduling publishes to Instagram, so it needs your approval.',
      card: { eyebrow: 'Approval', title: 'Schedule to Instagram', small: 'drying-tables.instagram.post.md · Thu 6 Nov · 9:00', acts: ['Approve', 'Reject'] },
      sys: 'checkpoint 3 saved · roll back any time',
      status: { problems: '0 problems', right: 'simulated publishing' }
    },
    'cadence': {
      label: 'The Propel editor in the Cadence workspace. The published Cadence 2.0 post is open. The agent drafted Bluesky and Threads versions and asks for approval to publish them.',
      tree: [['d', '.propel'], ['d open', 'brand'], ['f i2', 'brand.yaml'], ['f i2', 'voice.md'], ['d open', 'campaigns'], ['d open i2', 'v2-launch'], ['f i3', 'campaign.yaml'], ['f i3', 'cadence-2-0-changelog.blog.article.md'], ['f i3 on', 'v2-ships.x.post.md'], ['f i3', 'r-macapps-2-0.reddit.post.md'], ['f i3', 'retro.md'], ['d i2', 'reddit-paid-test'], ['d', 'analytics'], ['d', 'marketplace-submissions'], ['d', 'visibility']],
      tabs: ['v2-ships.x.post.md', 'retro.md', 'campaign.yaml'],
      code: [[[D, '---']], [[K, 'type:'], [0, ' post']], [[K, 'channel:'], [0, ' x']], [[K, 'campaign:'], [0, ' v2-launch']], [[K, 'status:'], [0, ' '], [V, 'published']], [[K, 'metrics:'], [0, ' { impressions: 62000, clicks: 2600 }']], [[D, '---']], [], [[0, 'Cadence 2.0.']], [], [[0, 'Two things. The overlay can live on a']], [[0, 'second display now, or on all of them']], [[0, 'at once, and it remembers which one when']], [[0, 'you unplug and replug. And there are']], [[0, 'translations under the line in 12']], [[0, 'languages.']]],
      me: 'Turn this into a Bluesky post and a Threads post.',
      agent: 'Drafted <b>v2-ships.bluesky.post.md</b> and <b>v2-ships.threads.post.md</b>: same words, cut to each limit. Lint passed. Publishing needs your approval.',
      card: { eyebrow: 'Approval', title: 'Publish to Bluesky and Threads', small: '2 drafts · @theobuilds · now', acts: ['Approve', 'Reject'] },
      sys: 'drafts saved in campaigns/v2-launch',
      status: { problems: '0 problems', right: 'simulated publishing' }
    },
    'ridgeline': {
      label: 'The Propel editor in the Ridgeline workspace. An X post about ISO 27001 is open. The agent checks that 61, 18 and 14 controls add up to 93 and asks for approval to post it on Tuesday at 8:00.',
      tree: [['d', '.propel'], ['d open', 'brand'], ['f i2', 'positioning.md'], ['f i2', 'proof.md'], ['f i2', 'objections.md'], ['d', 'calls'], ['d open', 'campaigns'], ['d open i2', 'iso-27001-launch'], ['f i3', 'campaign.yaml'], ['f i3', 'annex-a-mapping.linkedin.post.md'], ['f i3', 'iso-27001.page.md'], ['f i3', 'iso-waitlist.email.md'], ['f i3 on', 'not-a-second-product.x.post.md'], ['d i2', 'questionnaire-season'], ['d', 'people']],
      tabs: ['not-a-second-product.x.post.md', 'iso-27001.page.md', 'proof.md'],
      code: [[[D, '---']], [[K, 'type:'], [0, ' post']], [[K, 'channel:'], [0, ' x']], [[K, 'status:'], [0, ' '], [V, 'idea']], [[K, 'campaign:'], [0, ' iso-27001-launch']], [[K, 'account:'], [0, ' nadia']], [[D, '---']], [], [[0, 'We mapped ISO 27001 Annex A onto the']], [[0, 'evidence we collect for SOC 2.']], [], [[0, '61 of 93 controls: same artifact,']], [[0, 'different wording.']], [[0, '18: evidence we could collect and do not.']], [[0, '14: documents. No software writes a']], [[0, 'statement of applicability.']]],
      me: 'Check the numbers, then queue it for Tuesday at 8.',
      agent: '61 + 18 + 14 = 93, so the three groups cover every Annex A control. Lint passed. Posting from <b>@nadia</b> needs your approval.',
      card: { eyebrow: 'Approval', title: 'Post to X', small: 'not-a-second-product.x.post.md · Tue · 8:00', acts: ['Approve', 'Reject'] },
      sys: 'checkpoint 2 saved · roll back any time',
      status: { problems: '0 problems', right: 'simulated publishing' }
    },
    'brightside-dental': {
      label: 'The Propel editor in the Brightside Dental workspace. The back-to-school text message that 22 families booked from is open. The agent drafted the December last-call text in the same voice and asks for approval to send it.',
      tree: [['d', '.propel'], ['d open', 'audiences'], ['f i2', 'active-patients.csv'], ['f i2', 'lapsed-patients.csv'], ['d', 'brand'], ['d', 'calls'], ['d open', 'campaigns'], ['d open i2', 'back-to-school'], ['f i3', 'campaign.yaml'], ['f i3', 'before-the-first-day.email.md'], ['f i3', 'forms-signed-here.facebook.post.md'], ['f i3 on', 'school-form-reminder.sms.md'], ['d open i2', 'year-end-benefits'], ['f i3', 'december-last-call.sms.md'], ['d', 'people']],
      tabs: ['school-form-reminder.sms.md', 'december-last-call.sms.md', 'active-patients.csv'],
      code: [[[D, '---']], [[K, 'type:'], [0, ' sms']], [[K, 'channel:'], [0, ' sms']], [[K, 'status:'], [0, ' '], [V, 'published']], [[K, 'campaign:'], [0, ' back-to-school']], [[K, 'audience:'], [0, ' audiences/active-patients.csv']], [[K, 'metrics:'], [0, ' { replies: 38, conversions: 22 }']], [[D, '---']], [], [[D, '> '], [0, 'Hi, Kendra at Brightside Dental. Term']], [[D, '> '], [0, 'starts August 17 and a lot of schools']], [[D, '> '], [0, 'and sports teams want a dental form.']], [[D, '> '], [0, 'If yours does, send me a photo of it']], [[D, '> '], [0, 'and I will have it filled in and ready']], [[D, '> '], [0, 'when you come.']]],
      me: 'Do the same for year-end benefits: one text, no follow-up.',
      agent: 'Drafted <b>december-last-call.sms.md</b> for active-patients.csv in the same voice as the form text. Texting patients needs your approval.',
      card: { eyebrow: 'Approval', title: 'Send SMS to active patients', small: 'december-last-call.sms.md · year-end-benefits', acts: ['Approve', 'Reject'] },
      sys: 'checkpoint 5 saved · roll back any time',
      status: { problems: '0 problems', right: 'simulated publishing' }
    },
    'maya-okonkwo': {
      label: 'The Propel editor in Maya Okonkwo\'s workspace. Her resume for Lattice Health is open. The claim check finds two bullets whose numbers are not in her profile and highlights them.',
      tree: [['d', '.propel'], ['d open', 'career'], ['f i2', 'profile.md'], ['f i2', 'questions.md'], ['f i2', 'offers.csv'], ['d open i2', 'roles'], ['d open i3', 'lattice-health'], ['f i4', 'brief.md'], ['f i4 on', 'resume.md'], ['d i3', 'sightline-compute'], ['d i3', 'tenpoint-robotics'], ['d', 'meetings'], ['d', 'opportunities'], ['d', 'people']],
      tabs: ['resume.md', 'brief.md', 'profile.md'],
      code: [[[D, '---']], [[K, 'tailored_for:'], [0, ' Lattice Health, Backend Engineer']], [[K, 'checked_against:'], [0, ' career/profile.md']], [[D, '---']], [], [[0, '# Maya Okonkwo']], [], [[0, '## Selected work']], [], [[0, '- Carried the on call pager through a 14']], [[0, '  step feature store migration running']], [[0, '  1.4M ledger writes a day']], { flag: true, segs: [[0, '- Cut p99 read latency on the ledger']] }, { flag: true, segs: [[0, '  service by 63%, from 410ms to 152ms']] }, { flag: true, segs: [[0, '- Led a team of 4 engineers through the']] }, { flag: true, segs: [[0, '  cutover, 3 weeks ahead of schedule']] }, [[0, '- Maintain shardlog, an open source']], [[0, '  checkpoint inspection CLI, 2140 stars']]],
      me: 'Check my Lattice Health resume before the loop.',
      agent: 'Every number traces to career/profile.md except two bullets: <b>63%, 410ms to 152ms</b> and <b>a team of 4, 3 weeks ahead</b>. Nothing in your files says either.',
      card: { eyebrow: 'Claim check', title: '2 bullets need a source', small: 'resume.md · loop on Aug 31', acts: ['Show the lines', 'Ignore'] },
      sys: 'nothing sent · the resume stays a draft',
      status: { problems: '2 claims to check', warn: true, right: 'claim check' }
    }
  };

  var win = document.getElementById('window');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.ws-tab'));
  if (win && tabs.length) {
    var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var current = 'northwind-coffee';

    var render = function (name) {
      var w = WS[name];
      win.querySelector('.w-title').textContent = name + ' — Propel';
      var ul = win.querySelector('.w-tree ul'); ul.textContent = '';
      w.tree.forEach(function (t) { ul.appendChild(el('li', t[0], t[1])); });
      var tb = win.querySelector('.w-tabs'); tb.textContent = '';
      w.tabs.forEach(function (t, i) { tb.appendChild(el('span', i === 0 ? 'on' : '', t)); });
      var pre = win.querySelector('.w-code'); pre.textContent = '';
      w.code.forEach(function (line, i) {
        var segs = Array.isArray(line) ? line : line.segs;
        var row = line.flag ? el('span', 'c-flag') : pre;
        row.appendChild(el('i', null, String(i + 1)));
        segs.forEach(function (s) { row.appendChild(s[0] ? el('span', s[0], s[1]) : document.createTextNode(s[1])); });
        if (line.flag) { pre.appendChild(row); }
        if (i < w.code.length - 1) pre.appendChild(document.createTextNode('\n'));
      });
      var th = win.querySelector('.w-thread'); th.textContent = '';
      th.appendChild(el('div', 'msg me', w.me));
      var ag = el('div', 'msg'); ag.innerHTML = w.agent; th.appendChild(ag);   // agent copy is authored here, never user input
      var card = el('div', 'appr');
      card.appendChild(el('p', 'eyebrow', w.card.eyebrow));
      card.appendChild(el('p', 'appr-t', w.card.title));
      card.appendChild(el('p', 'small', w.card.small));
      var acts = el('div', 'appr-acts');
      acts.appendChild(el('span', 'ok', w.card.acts[0])); acts.appendChild(el('span', null, w.card.acts[1]));
      card.appendChild(acts); th.appendChild(card);
      th.appendChild(el('p', 'w-sys', w.sys));
      var st = win.querySelector('.w-status'); st.textContent = '';
      st.appendChild(el('span', null, name)); st.appendChild(el('span', null, 'main'));
      var pr = el('span'); pr.appendChild(el('span', w.status.warn ? 'dot warn' : 'dot')); pr.appendChild(document.createTextNode(w.status.problems)); st.appendChild(pr);
      st.appendChild(el('span', 'right', w.status.right));
      win.setAttribute('aria-label', w.label);
    };

    var select = function (tab, focus) {
      var name = tab.dataset.ws;
      tabs.forEach(function (t) { var on = t === tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      if (focus) tab.focus();
      if (name === current || !WS[name]) return;
      current = name;
      if (reduce) { render(name); return; }
      win.classList.add('is-swapping');
      setTimeout(function () { render(name); win.classList.remove('is-swapping'); }, 140);
    };

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
        if (j === null) return;
        e.preventDefault();
        select(tabs[(j + tabs.length) % tabs.length], true);
      });
    });
  }
})();
