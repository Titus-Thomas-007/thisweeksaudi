/* ============================================================================
 * TWS_MASCOT — yeti head companion for ThisWeekSaudi.
 *
 * A fluffy white yeti head that lives next to the Planner button in the main
 * header and reacts to what the user does. Seven moods, each driven by real
 * interactions:
 *
 *   excited   — first save of the session, plan shared
 *   happy     — 3rd save, Friday reveal
 *   love      — tapping the mascot head (petting)
 *   surprised — new events landed since last visit
 *   wink      — removing a save
 *   proud     — planner reaches 5+ events
 *   sleepy    — late-night browsing (23:00–05:00), empty planner
 *
 * Guardrails: reacts only (never interrupts), max once per trigger per
 * session, tap-to-dismiss on the Planner bubble remembered in localStorage,
 * prefers-reduced-motion disables all animation.
 * ========================================================================== */
(function () {
'use strict';

var MOODS = ['happy', 'excited', 'love', 'surprised', 'wink', 'proud', 'sleepy'];

/* ---------------- swappable character: yeti head shot ---------------- */
function renderMascotSVG() {
  /* Fluffy yeti head matching Titus's reference: a ring of fluff tufts plus an
     feTurbulence displacement filter gives the furry edge; faces stay minimal
     (small dot eyes, subtle smile) like the reference. */
  var ink = '#23201a', mouth = '#3a352c';
  var defs = '<defs><filter id="twsFur" x="-25%" y="-25%" width="150%" height="150%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="7" result="n"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="7"/>' +
    '</filter></defs>';
  // ring of fluff tufts around the head (deterministic pseudo-random sizes)
  var tufts = '', i, a, px, py, r;
  var shades = ['#f5f1e6', '#f7f3ea', '#faf6ec', '#efe9d8'];
  for (i = 0; i < 30; i++) {
    a = (i / 30) * Math.PI * 2;
    px = 32 + Math.cos(a) * 20.5;
    py = 33 + Math.sin(a) * 18.5;
    r = 3 + ((i * 37) % 30) / 10; // 3.0 - 5.9
    tufts += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + shades[i % 4] + '"/>';
  }
  // soft inner shading for depth
  var shading = '<ellipse cx="32" cy="38" rx="13" ry="10" fill="#ece4cf" opacity="0.55"/>';
  var head = '<g filter="url(#twsFur)">' + tufts +
    '<ellipse cx="32" cy="33" rx="19.5" ry="18" fill="#f5f1e6"/>' + shading + '</g>';

  function dot(cx, cy, r) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + ink + '"/>' +
      '<circle cx="' + (cx + 0.8) + '" cy="' + (cy - 0.8) + '" r="' + (r * 0.32).toFixed(2) + '" fill="#fff" opacity="0.85"/>';
  }
  function heart(cx, cy) {
    return '<path d="M' + cx + ',' + (cy + 4.5) +
      ' C' + (cx - 2) + ',' + (cy + 1.5) + ' ' + (cx - 5.5) + ',' + (cy - 0.5) + ' ' + (cx - 5.5) + ',' + (cy - 3.2) +
      ' C' + (cx - 5.5) + ',' + (cy - 5.2) + ' ' + (cx - 3.7) + ',' + (cy - 6.7) + ' ' + (cx - 2) + ',' + (cy - 6.7) +
      ' C' + (cx - 1) + ',' + (cy - 6.7) + ' ' + (cx - 0.3) + ',' + (cy - 6.2) + ' ' + cx + ',' + (cy - 5.5) +
      ' C' + (cx + 0.3) + ',' + (cy - 6.2) + ' ' + (cx + 1) + ',' + (cy - 6.7) + ' ' + (cx + 2) + ',' + (cy - 6.7) +
      ' C' + (cx + 3.7) + ',' + (cy - 6.7) + ' ' + (cx + 5.5) + ',' + (cy - 5.2) + ' ' + (cx + 5.5) + ',' + (cy - 3.2) +
      ' C' + (cx + 5.5) + ',' + (cy - 0.5) + ' ' + (cx + 2) + ',' + (cy + 1.5) + ' ' + cx + ',' + (cy + 4.5) + ' Z" fill="#e2556b"/>';
  }
  function smile(d, w) {
    return '<path d="' + d + '" stroke="' + mouth + '" stroke-width="' + (w || 1.6) + '" fill="none" stroke-linecap="round"/>';
  }
  var faces = {
    rest: dot(25.5, 30, 2.4) + dot(38.5, 30, 2.4) + smile('M28,37.5 Q32,40.5 36,37.5'),
    happy:
      '<path d="M21.5,30 Q25.5,25.8 29.5,30" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M34.5,30 Q38.5,25.8 42.5,30" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      smile('M24.5,37 Q32,45.5 39.5,37', 2),
    excited:
      '<path d="M25.5,24.5 L26.9,28.6 L31,30 L26.9,31.4 L25.5,35.5 L24.1,31.4 L20,30 L24.1,28.6 Z" fill="#d9a441"/>' +
      '<path d="M38.5,24.5 L39.9,28.6 L44,30 L39.9,31.4 L38.5,35.5 L37.1,31.4 L33,30 L37.1,28.6 Z" fill="#d9a441"/>' +
      '<ellipse cx="32" cy="40.5" rx="4.2" ry="5" fill="#4a3826"/>' +
      '<ellipse cx="32" cy="42.8" rx="2.2" ry="1.7" fill="#e08a8a"/>' +
      '<path class="m-spark" d="M11,13 l1.1,2.6 2.6,1.1 -2.6,1.1 -1.1,2.6 -1.1,-2.6 -2.6,-1.1 2.6,-1.1 Z" fill="#ffe9a8"/>' +
      '<path class="m-spark" d="M53,13 l1.1,2.6 2.6,1.1 -2.6,1.1 -1.1,2.6 -1.1,-2.6 -2.6,-1.1 2.6,-1.1 Z" fill="#ffe9a8"/>',
    love:
      heart(25.5, 30) + heart(38.5, 30) + smile('M28,37.5 Q32,40.5 36,37.5') +
      '<path class="m-float-h" d="M46,8 c-1.5,-2.2 -4.5,-2.2 -4.5,0.5 c0,2 3,3.5 4.5,5 c1.5,-1.5 4.5,-3 4.5,-5 c0,-2.7 -3,-2.7 -4.5,-0.5" fill="#e2556b" opacity="0.9"/>' +
      '<path class="m-float-h m-float-h2" d="M16,6 c-1.2,-1.8 -3.6,-1.8 -3.6,0.4 c0,1.6 2.4,2.8 3.6,4 c1.2,-1.2 3.6,-2.4 3.6,-4 c0,-2.2 -2.4,-2.2 -3.6,-0.4" fill="#e2556b" opacity="0.7"/>',
    surprised:
      dot(25.5, 30, 3.8) + dot(38.5, 30, 3.8) +
      '<ellipse cx="32" cy="40.5" rx="2.5" ry="3.4" fill="#4a3826"/>',
    wink:
      dot(25.5, 30, 2.4) +
      '<path d="M34.5,30 Q38.5,32.6 42.5,30" stroke="' + ink + '" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
      smile('M26.5,37.5 Q34,43 39.5,34.5', 1.9),
    proud:
      dot(25.5, 30, 2.4) + dot(38.5, 30, 2.4) +
      '<path d="M20.5,21.5 L30,23.3" stroke="' + ink + '" stroke-width="2.5" stroke-linecap="round"/>' +
      smile('M27.5,38.5 Q34,41.5 38,36', 1.9),
    sleepy:
      '<path d="M21.5,30 Q25.5,32.4 29.5,30" stroke="' + ink + '" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
      '<path d="M34.5,30 Q38.5,32.4 42.5,30" stroke="' + ink + '" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
      smile('M29.5,39.5 Q32,41 34.5,39.5', 1.5) +
      '<text class="m-z m-z1" x="49" y="21" font-size="10" fill="#9db4c8" font-family="sans-serif" font-weight="700">z</text>' +
      '<text class="m-z m-z2" x="54" y="11" font-size="13" fill="#9db4c8" font-family="sans-serif" font-weight="700">z</text>'
  };
  var out = '<svg class="mascot-svg" viewBox="0 0 64 64" width="54" height="54" aria-hidden="true">' +
    defs + head;
  Object.keys(faces).forEach(function (k) {
    out += '<g class="m-face m-face-' + k + '">' + faces[k] + '</g>';
  });
  return out + '</svg>';
}

/* ---------------- copy bank (no repeats within a session) ---------------- */
var COPY = {
  happy: [
    "Now that's what I call a weekend.",
    "Your planner is looking dangerously fun.",
    "I checked: this is an excellent life choice.",
    "Somewhere, your couch is getting nervous.",
    "This is the most organized you've ever been. Proud.",
    "Your future self says thanks.",
    "Weekend: upgraded.",
    "Big plans energy. I love it here."
  ],
  excited: [
    "FIRST SAVE! The weekend has officially begun!",
    "IT BEGINS! One down, many to go!",
    "Ohhh, excellent pick. EXCELLENT pick.",
    "I'm doing a tiny happy dance. You can't see it. Trust me.",
    "Plan shared! Your friends are about to be jealous.",
    "Shared! Go on, be the friend with plans.",
    "Yes! Yes! A thousand times yes!",
    "The planner has been christened!"
  ],
  love: [
    "Okay, stop it. You're making me blush.",
    "Pets accepted. Keep them coming.",
    "This is officially the best part of my day.",
    "Aww. Right back at you.",
    "Careful, I'll start following you around.",
    "Noted: favorite human."
  ],
  surprised: [
    "Whoa — {n} new {events} just landed!",
    "Wait, what? Fresh events! Go look!",
    "Did you see this? NEW stuff just dropped.",
    "Hold on — {n} new {events} since your last visit!"
  ],
  wink: [
    "Removed. No judgment. Okay, a little judgment.",
    "Gone. You'll be back. They always come back.",
    "One less plan. The couch approves.",
    "Deleted with zero regrets. (I have a few.)"
  ],
  proud: [
    "Five events. Look at you, all organized.",
    "This lineup? Chef's kiss.",
    "Someone's about to have the best weekend in Riyadh.",
    "I would frame this planner if I had hands."
  ],
  sleepy: [
    "It's late. Even I'm yawning.",
    "Nothing planned yet... wake me when it's fun.",
    "Shhh. Planning dreams in progress.",
    "Past my bedtime, but your weekend matters more."
  ]
};

/* ---------------- state + guardrails ---------------- */
var shownTrigger = {};
var usedLines = {};
MOODS.forEach(function (m) { usedLines[m] = []; });
var REDUCED = false;
try { REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

function muted() {
  try { return localStorage.getItem('tws_mascot_muted') === '1'; } catch (e) { return false; }
}
function pick(mood, vars) {
  var lines = COPY[mood] || [], used = usedLines[mood] || [];
  if (!lines.length) return '';
  if (used.length >= lines.length) { used.length = 0; }
  var i, guard = 0;
  do { i = Math.floor(Math.random() * lines.length); guard++; } while (used.indexOf(i) !== -1 && guard < 50);
  used.push(i);
  var line = lines[i];
  if (vars) Object.keys(vars).forEach(function (k) {
    line = line.split('{' + k + '}').join(vars[k]);
  });
  return line;
}
function moodClasses() {
  return MOODS.map(function (m) { return 'mascot-' + m; }).join(' ');
}
function setMood(mood) {
  var nodes = [];
  var b = document.getElementById('tws-mascot');
  if (b) nodes.push(b);
  var h = document.getElementById('tws-mascot-head');
  if (h) nodes.push(h);
  nodes.forEach(function (n) {
    MOODS.forEach(function (m) { n.classList.remove('mascot-' + m); });
    if (mood) n.classList.add('mascot-' + mood);
  });
}

/* ---------------- mounts ---------------- */
/* Planner-view bubble (full mascot row with copy) */
function mount() {
  var host = document.getElementById('tws-mascot');
  if (host) return host;
  var view = document.getElementById('view-saved');
  if (!view) return null;
  var scroll = view.querySelector('.page-scroll');
  var anchor = view.querySelector('#saved-list');
  if (!scroll || !anchor) return null;
  host = document.createElement('div');
  host.id = 'tws-mascot';
  host.className = 'tws-mascot hidden';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.innerHTML =
    '<div class="mascot-figure">' + renderMascotSVG() + '</div>' +
    '<div class="tws-mascot-bubble"></div>' +
    '<button class="tws-mascot-x" aria-label="Dismiss">×</button>';
  host.addEventListener('click', dismiss); // tap bubble to dismiss
  scroll.insertBefore(host, anchor);
  return host;
}

/* Header head: tiny yeti next to the Planner button on the main screen */
function mountHead() {
  if (document.getElementById('tws-mascot-head')) return;
  var btn = document.getElementById('btn-saved');
  if (!btn || !btn.parentNode) return;
  var head = document.createElement('span');
  head.id = 'tws-mascot-head';
  head.className = 'mascot-head';
  head.setAttribute('role', 'button');
  head.setAttribute('aria-label', 'Open Planner');
  head.setAttribute('tabindex', '0');
  head.innerHTML = '<span class="mascot-figure">' + renderMascotSVG() + '</span>';
  head.addEventListener('click', function () {
    react('love', 'head-pet');
    setTimeout(function () { btn.click(); }, 380);
  });
  head.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); }
  });
  btn.parentNode.insertBefore(head, btn.nextSibling);
}

/* ---------------- react ---------------- */
function react(mood, trigger, vars) {
  if (muted() || MOODS.indexOf(mood) === -1) return false;
  if (trigger) {
    if (shownTrigger[trigger]) return false;
    shownTrigger[trigger] = true;
  }
  mountHead();
  setMood(mood);
  var host = mount();
  if (!host) return true; // head still shows the mood
  host.classList.remove('tws-mascot-in');
  void host.offsetWidth;
  host.classList.add('tws-mascot-in');
  var bubble = host.querySelector('.tws-mascot-bubble');
  if (bubble) bubble.textContent = pick(mood, vars);
  host.classList.remove('hidden');
  var fig = host.querySelector('.mascot-figure');
  if (!REDUCED && (mood === 'excited' || mood === 'love') && fig) sparkleBurst(fig);
  return true;
}

function dismiss() {
  var host = document.getElementById('tws-mascot');
  if (host) host.classList.add('hidden');
  setMood(null);
  try { localStorage.setItem('tws_mascot_muted', '1'); } catch (e) {}
}

/* ---------------- boot signals: new events + late night ---------------- */
function bootCheck(upcomingIds) {
  if (muted()) return;
  var rp = riyadhParts();
  // sleepy: browsing between 23:00 and 05:00 Riyadh
  if (rp) {
    var hr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })).getHours();
    if (hr >= 23 || hr < 5) { react('sleepy', 'late-night'); return; }
  }
  // surprised: events appeared since last visit
  try {
    var cur = upcomingIds.slice().sort().join(',');
    var prev = localStorage.getItem('tws_seen_ids') || '';
    if (prev) {
      var prevSet = {};
      prev.split(',').forEach(function (id) { prevSet[id] = 1; });
      var fresh = upcomingIds.filter(function (id) { return !prevSet[id]; });
      if (fresh.length) {
        react('surprised', 'new-events', {
          n: fresh.length,
          events: fresh.length === 1 ? 'event' : 'events'
        });
      }
    }
    localStorage.setItem('tws_seen_ids', cur);
  } catch (e) {}
}

/* ---------------- particles ---------------- */
function spawnParticle(x, y, dx, dy, dur, size, parent) {
  var p = document.createElement('div');
  p.className = 'tws-particle';
  if (size) { p.style.width = size + 'px'; p.style.height = size + 'px'; }
  p.style.left = x + 'px';
  p.style.top = y + 'px';
  (parent || document.body).appendChild(p);
  var anim = p.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy - 70) + 'px) scale(.85)', opacity: 1, offset: 0.55 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.25)', opacity: 0.9 }
  ], { duration: dur, easing: 'cubic-bezier(.3,.7,.4,1)' });
  var cleanup = function () { if (p.parentNode) p.parentNode.removeChild(p); };
  if (anim && anim.finished && anim.finished.then) anim.finished.then(cleanup, cleanup);
  else setTimeout(cleanup, dur + 50);
}

function saveBurst(fromEl) {
  var target = document.getElementById('btn-saved');
  if (!fromEl || !target || REDUCED) return;
  var fr = fromEl.getBoundingClientRect(), tr = target.getBoundingClientRect();
  if (!fr.width && !fr.height) return;
  var sx = fr.left + fr.width / 2, sy = fr.top + fr.height / 2;
  var tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
  for (var i = 0; i < 10; i++) {
    var jx = (Math.random() - 0.5) * 44, jy = (Math.random() - 0.5) * 44;
    spawnParticle(sx, sy, (tx - sx) + jx, (ty - sy) + jy, 620 + Math.random() * 260, 6 + Math.random() * 5);
  }
}

function sparkleBurst(figureEl) {
  if (!figureEl) return;
  var r = figureEl.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (var i = 0; i < 8; i++) {
    var a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    var d = 34 + Math.random() * 22;
    spawnParticle(cx, cy, Math.cos(a) * d, Math.sin(a) * d - 18, 500 + Math.random() * 200, 4 + Math.random() * 4);
  }
}

/* ---------------- Friday weekend reveal ---------------- */
function riyadhParts() {
  try {
    var d = new Date();
    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d),
      weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short' }).format(d)
    };
  } catch (e) { return null; }
}

function fridayReveal() {
  if (muted()) return false;
  var rp = riyadhParts();
  if (!rp || rp.weekday !== 'Fri') return false;
  try {
    if (localStorage.getItem('tws_friday_seen') === rp.date) return false;
    localStorage.setItem('tws_friday_seen', rp.date);
  } catch (e) {}
  var ov = document.createElement('div');
  ov.className = 'tws-friday';
  ov.setAttribute('role', 'status');
  ov.innerHTML = '<div class="tws-friday-inner">' +
    '<div class="tws-friday-mood">' + renderMascotSVG() + '</div>' +
    '<div class="tws-friday-title">Your weekend is here</div>' +
    '<div class="tws-friday-sub">Go make it a good one</div></div>';
  try {
    var fig = ov.querySelector('.tws-friday-mood');
    if (fig) fig.classList.add('mascot-happy');
  } catch (e) {}
  var done = false;
  function close() {
    if (done) return; done = true;
    ov.classList.add('out');
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, REDUCED ? 0 : 400);
  }
  ov.addEventListener('click', close);
  document.body.appendChild(ov);
  if (!REDUCED) {
    var r = ov.getBoundingClientRect();
    for (var i = 0; i < 26; i++) {
      (function (k) {
        setTimeout(function () {
          if (!ov.parentNode) return;
          spawnParticle(
            r.left + Math.random() * r.width, r.top - 10,
            (Math.random() - 0.5) * 120, r.height * (0.35 + Math.random() * 0.3),
            1100 + Math.random() * 600, 5 + Math.random() * 5, ov
          );
        }, k * 60);
      })(i);
    }
  }
  setTimeout(close, 2500);
  return true;
}

window.TWS_MASCOT = {
  react: react,
  dismiss: dismiss,
  saveBurst: saveBurst,
  fridayReveal: fridayReveal,
  bootCheck: bootCheck,
  mountHead: mountHead,
  renderMascotSVG: renderMascotSVG,
  MOODS: MOODS
};
})();
