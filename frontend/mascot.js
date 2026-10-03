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

/* ---------------- character: blank fluffy face + living vector features ----------------
   The head photo NEVER moves. Only the face overlay animates: eyes blink and
   look around, brows lift/angle, lips morph and "talk" while a bubble line shows.
   Mood classes (.mascot-happy etc.) pick which eyes/mouth show and how brows sit. */
var YETI_BLANK = 'img/yeti-blank.webp';
function faceSVG() {
  var ink = '#2b2620';
  function dot(cx, cy, rx, ry) {
    return '<ellipse class="m-eye" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + ink + '"/>' +
      '<circle cx="' + (cx + rx * 0.3) + '" cy="' + (cy - ry * 0.3) + '" r="' + (rx * 0.32).toFixed(2) + '" fill="#fff" opacity="0.8"/>';
  }
  function heart(cx, cy) {
    var h = 7;
    return '<path d="M' + cx + ',' + (cy + h * 0.62) +
      ' C' + (cx - h * 0.28) + ',' + (cy + h * 0.2) + ' ' + (cx - h * 0.78) + ',' + (cy - h * 0.08) + ' ' + (cx - h * 0.78) + ',' + (cy - h * 0.45) +
      ' C' + (cx - h * 0.78) + ',' + (cy - h * 0.72) + ' ' + (cx - h * 0.52) + ',' + (cy - h * 0.92) + ' ' + (cx - h * 0.28) + ',' + (cy - h * 0.92) +
      ' C' + (cx - h * 0.14) + ',' + (cy - h * 0.92) + ' ' + (cx - h * 0.04) + ',' + (cy - h * 0.85) + ' ' + cx + ',' + (cy - h * 0.75) +
      ' C' + (cx + h * 0.04) + ',' + (cy - h * 0.85) + ' ' + (cx + h * 0.14) + ',' + (cy - h * 0.92) + ' ' + (cx + h * 0.28) + ',' + (cy - h * 0.92) +
      ' C' + (cx + h * 0.52) + ',' + (cy - h * 0.92) + ' ' + (cx + h * 0.78) + ',' + (cy - h * 0.72) + ' ' + (cx + h * 0.78) + ',' + (cy - h * 0.45) +
      ' C' + (cx + h * 0.78) + ',' + (cy - h * 0.08) + ' ' + (cx + h * 0.28) + ',' + (cy + h * 0.2) + ' ' + cx + ',' + (cy + h * 0.62) + ' Z" fill="#e2556b"/>';
  }
  function star(cx, cy, r) {
    var p = [];
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      var rr = (i % 2 === 0) ? r : r * 0.42;
      p.push((cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1));
    }
    return '<polygon points="' + p.join(' ') + '" fill="#d9a441"/>';
  }
  var eyes =
    '<g class="m-eyes m-eyes-dots">' + dot(38, 43, 3.4, 4.2) + dot(62, 43, 3.4, 4.2) + '</g>' +
    '<g class="m-eyes m-eyes-joy">' +
      '<path d="M33.5,43 Q38,38.5 42.5,43" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M57.5,43 Q62,38.5 66.5,43" stroke="' + ink + '" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>' +
    '<g class="m-eyes m-eyes-heart">' + heart(38, 43) + heart(62, 43) + '</g>' +
    '<g class="m-eyes m-eyes-star">' + star(38, 43, 5.2) + star(62, 43, 5.2) + '</g>' +
    '<g class="m-eyes m-eyes-wide">' + dot(38, 43, 4.6, 5.4) + dot(62, 43, 4.6, 5.4) + '</g>' +
    '<g class="m-eyes m-eyes-wink">' + dot(38, 43, 3.4, 4.2) +
      '<path d="M57.5,43 Q62,45.8 66.5,43" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>' +
    '<g class="m-eyes m-eyes-closed">' +
      '<path d="M33.5,43 Q38,45.4 42.5,43" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M57.5,43 Q62,45.4 66.5,43" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>';
  var mouths =
    '<path class="m-mouth m-mouth-smile" d="M42,58 Q50,64 58,58" stroke="' + ink + '" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path class="m-mouth m-mouth-big" d="M40,57 Q50,68.5 60,57" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
    '<ellipse class="m-mouth m-mouth-open" cx="50" cy="60.5" rx="4.4" ry="5.2" fill="#4a3826"/>' +
    '<ellipse class="m-mouth m-mouth-o" cx="50" cy="60.5" rx="2.7" ry="3.8" fill="#4a3826"/>' +
    '<path class="m-mouth m-mouth-grin" d="M41,58 Q52,65.5 59,55" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path class="m-mouth m-mouth-smug" d="M43,59 Q52,63 58,56" stroke="' + ink + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path class="m-mouth m-mouth-sleep" d="M45,60.5 Q50,62.2 55,60.5" stroke="' + ink + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    '<ellipse class="m-mouth m-mouth-talk" cx="50" cy="60.5" rx="3.8" ry="4.6" fill="#4a3826"/>';
  var brows =
    '<rect class="m-brow m-brow-l" x="31.5" y="30" width="12.5" height="2.4" rx="1.2" fill="' + ink + '" opacity="0.75"/>' +
    '<rect class="m-brow m-brow-r" x="56" y="30" width="12.5" height="2.4" rx="1.2" fill="' + ink + '" opacity="0.75"/>';
  return '<svg class="mascot-face" viewBox="0 0 100 100" aria-hidden="true">' + brows + eyes + mouths + '</svg>';
}
function mascotHTML() {
  return '<span class="mascot-facewrap"><img class="mascot-img" src="' + YETI_BLANK + '" alt="yeti" draggable="false">' +
    faceSVG() + '</span>';
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
    if (mood && MOODS.indexOf(mood) !== -1) n.classList.add('mascot-' + mood);
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
    '<div class="mascot-figure">' + mascotHTML() + '</div>' +
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
  head.innerHTML = '<span class="mascot-figure">' + mascotHTML() + '</span>';
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
  if (!REDUCED && fig) {
    fig.classList.add('talking');
    setTimeout(function () { fig.classList.remove('talking'); }, 2400);
  }
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
    '<div class="tws-friday-mood mascot-happy"><div class="mascot-figure">' + mascotHTML() + '</div></div>' +
    '<div class="tws-friday-title">Your weekend is here</div>' +
    '<div class="tws-friday-sub">Go make it a good one</div></div>';
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
  mascotHTML: mascotHTML,
  MOODS: MOODS
};
})();
