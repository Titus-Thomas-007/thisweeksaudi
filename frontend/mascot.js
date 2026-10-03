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

/* ---------------- character: real fluffy yeti heads (AI-generated from Titus's reference) ---------------- */
var YETI_IMGS = {
  rest: 'img/yeti-rest.webp', happy: 'img/yeti-happy.webp', excited: 'img/yeti-excited.webp',
  love: 'img/yeti-love.webp', surprised: 'img/yeti-surprised.webp', wink: 'img/yeti-wink.webp',
  proud: 'img/yeti-proud.webp', sleepy: 'img/yeti-sleepy.webp'
};
function mascotHTML(mood) {
  var m = YETI_IMGS[mood] ? mood : 'rest';
  return '<img class="mascot-img" src="' + YETI_IMGS[m] + '" alt="yeti" draggable="false">';
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
    var img = n.querySelector('.mascot-img');
    if (img) img.src = YETI_IMGS[mood] || YETI_IMGS.rest;
  });
}

/* ---------------- pulse: face-only reaction, no bubble, no gating ----------------
   Used for high-frequency moments: every save -> smile, scrolling -> excited,
   and the ambient interval cycling the rest. Throttled per mood. */
var lastPulse = {};
function pulse(mood, throttleMs) {
  if (MOODS.indexOf(mood) === -1 || muted()) return false;
  var now = Date.now(), th = throttleMs || 20000;
  if (lastPulse[mood] && now - lastPulse[mood] < th) return false;
  lastPulse[mood] = now;
  mountHead();
  setMood(mood);
  return true;
}

/* ambient: every 15s the yeti cycles the remaining expressions while idle */
var AMBIENT = ['love', 'surprised', 'wink', 'proud', 'sleepy'];
var ambientIdx = 0, ambientTimer = null;
function startAmbient() {
  if (ambientTimer) return;
  ambientTimer = setInterval(function () {
    if (document.hidden || muted()) return;
    pulse(AMBIENT[ambientIdx % AMBIENT.length], 1000);
    ambientIdx++;
  }, 15000);
}

/* scrolling -> excitement (throttled) */
var scrollTick = 0;
function armScrollPulse() {
  var last = 0;
  window.addEventListener('scroll', function () {
    var now = Date.now();
    if (now - last < 25000 || document.hidden) return;
    last = now;
    pulse('excited', 1000);
  }, { passive: true });
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
    '<div class="mascot-figure">' + mascotHTML('rest') + '</div>' +
    '<div class="tws-mascot-bubble"></div>' +
    '<button class="tws-mascot-x" aria-label="Dismiss">×</button>';
  host.addEventListener('click', dismiss); // tap bubble to dismiss
  scroll.insertBefore(host, anchor);
  return host;
}

/* Header head: tiny yeti next to the ThisWeekSaudi logo on the main screen */
function mountHead() {
  if (document.getElementById('tws-mascot-head')) return;
  var logo = document.querySelector('.deck-nav .wordmark');
  if (!logo || !logo.parentNode) return;
  var head = document.createElement('span');
  head.id = 'tws-mascot-head';
  head.className = 'mascot-head';
  head.setAttribute('role', 'button');
  head.setAttribute('aria-label', 'Open Planner');
  head.setAttribute('tabindex', '0');
  head.innerHTML = '<span class="mascot-figure">' + mascotHTML('rest') + '</span>';
  head.addEventListener('click', function () {
    react('love', 'head-pet');
    var btn = document.getElementById('btn-saved');
    if (btn) setTimeout(function () { btn.click(); }, 380);
  });
  head.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); }
  });
  logo.parentNode.insertBefore(head, logo.nextSibling);
}

/* ---------------- react ---------------- */
function react(mood, trigger, vars) {
  if (muted() || MOODS.indexOf(mood) === -1) return false;
  if (trigger) {
    if (shownTrigger[trigger]) return false;
    shownTrigger[trigger] = true;
  }
  mountHead();
  var host = mount();
  setMood(mood);
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
    '<div class="tws-friday-mood"><img class="mascot-img" src="' + YETI_IMGS.happy + '" alt="yeti"></div>' +
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
  pulse: pulse,
  startAmbient: startAmbient,
  armScrollPulse: armScrollPulse,
  mascotHTML: mascotHTML,
  MOODS: MOODS
};
})();
