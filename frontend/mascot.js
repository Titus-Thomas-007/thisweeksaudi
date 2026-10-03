/* ============================================================================
 * TWS_MASCOT — Planner companion for ThisWeekSaudi.
 *
 * What this module owns (character-agnostic):
 *  - trigger logic + guardrails (reacts only, once per trigger per session,
 *    tap-to-dismiss remembered in localStorage, prefers-reduced-motion)
 *  - copy bank (~12 lines per mood, no repeats within a session)
 *  - mood system: container classes .mascot-happy / .mascot-excited / .mascot-sad
 *    drive all CSS animation, so ANY svg hooks in with zero CSS changes
 *  - save-burst particles (button -> #btn-saved badge flight)
 *  - Friday weekend reveal (Asia/Riyadh, once per day)
 *
 * CHARACTER ART: renderMascotSVG() below is the ONLY place that draws the
 * character. It currently returns a neutral placeholder. Swap its return value
 * for the approved character — nothing else needs to change.
 * ========================================================================== */
(function () {
'use strict';

/* ---------------- swappable character ---------------- */
function renderMascotSVG() {
  /* Fluffy white yeti (Titus-approved character): layered cream ellipses form
     the furry body; dot eyes + smile swap per mood via CSS (.m-frown/.m-tear
     only visible when .mascot-sad). Wrapper handles bounce/jump/droop. */
  return '<svg class="mascot-svg" viewBox="0 0 64 64" width="54" height="54" aria-hidden="true">' +
    '<g>' +
    '<ellipse cx="13" cy="30" rx="5" ry="8" fill="#ece5d3"/>' +
    '<ellipse cx="51" cy="30" rx="5" ry="8" fill="#ece5d3"/>' +
    '<ellipse cx="24" cy="57" rx="6.5" ry="4" fill="#e2d9c2"/>' +
    '<ellipse cx="40" cy="57" rx="6.5" ry="4" fill="#e2d9c2"/>' +
    '<ellipse cx="32" cy="34" rx="20" ry="22" fill="#f5f1e6"/>' +
    '<circle cx="20" cy="16" r="5" fill="#f7f3ea"/>' +
    '<circle cx="29" cy="10" r="5.5" fill="#faf6ec"/>' +
    '<circle cx="39" cy="11" r="5" fill="#f7f3ea"/>' +
    '<circle cx="47" cy="18" r="4.5" fill="#f5f1e6"/>' +
    '<circle cx="13" cy="26" r="4" fill="#f5f1e6"/>' +
    '<circle cx="51" cy="26" r="4" fill="#f5f1e6"/>' +
    '<circle cx="17" cy="44" r="4.5" fill="#f5f1e6"/>' +
    '<circle cx="47" cy="44" r="4.5" fill="#f5f1e6"/>' +
    '</g>' +
    '<circle class="m-eye" cx="25" cy="29" r="2.7" fill="#23201a"/>' +
    '<circle class="m-eye" cx="39" cy="29" r="2.7" fill="#23201a"/>' +
    '<circle class="m-eye-shine" cx="25.9" cy="28.1" r="0.9" fill="#fff" opacity="0.85"/>' +
    '<circle class="m-eye-shine" cx="39.9" cy="28.1" r="0.9" fill="#fff" opacity="0.85"/>' +
    '<path class="m-smile" d="M27,37 Q32,41 37,37" stroke="#3a352c" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    '<path class="m-frown" d="M27,41 Q32,37 37,41" stroke="#3a352c" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
    '<path class="m-tear" d="M21,34 q-2.2,3.4 0,5.2 q2.2,-1.8 0,-5.2" fill="#7db8e8"/>' +
    '</svg>';
}

/* ---------------- copy bank (~12 per mood, no repeats per session) ---------------- */
var COPY = {
  happy: [
    "Now that's what I call a weekend.",
    "Your planner is looking dangerously fun.",
    "I checked: this is an excellent life choice.",
    "Somewhere, your couch is getting nervous.",
    "This is the most organized you've ever been. Proud.",
    "Gold star for you. Literally — I'm gold.",
    "Your future self says thanks.",
    "Weekend: upgraded.",
    "I'm framing this planner.",
    "Big plans energy. I love it here.",
    "You + these events = correct decision.",
    "This planner slaps. (Am I using that right?)"
  ],
  excited: [
    "FIRST SAVE! The weekend has officially begun!",
    "IT BEGINS! One down, many to go!",
    "Ohhh, excellent pick. EXCELLENT pick.",
    "I'm doing a tiny happy dance. You can't see it. Trust me.",
    "Plan shared! Your friends are about to be jealous.",
    "You just made someone's weekend. Probably yours.",
    "Shared! Go on, be the friend with plans.",
    "Witnessed! This is going in the weekend hall of fame.",
    "Yes! Yes! A thousand times yes!",
    "The planner has been christened!",
    "Alert the group chat. This is happening.",
    "I felt that save in my sparkles."
  ],
  sad: [
    "So much weekend, so little plan.",
    "It's very quiet in here. Too quiet.",
    "I'm not crying, you're crying.",
    "An empty planner is just a weekend that gave up.",
    "Hello? Is anyone planning anything?",
    "I polished my glow for this.",
    "Even my sparkles are bored.",
    "All gone. Well. The couch wins again.",
    "You removed everything. Bold. Cold. Bold.",
    "I had dreams for us. Dreams.",
    "Nothing? Really? On THIS weekend?",
    "Fine. I'll just sit here. Glowing. Alone."
  ]
};

/* ---------------- state + guardrails ---------------- */
var shownTrigger = {};          // trigger key -> true (max once per trigger per session)
var usedLines = { happy: [], excited: [], sad: [] };
var REDUCED = false;
try { REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

function muted() {
  try { return localStorage.getItem('tws_mascot_muted') === '1'; } catch (e) { return false; }
}
function pick(mood) {
  var lines = COPY[mood] || [], used = usedLines[mood] || [];
  if (!lines.length) return '';
  if (used.length >= lines.length) { used.length = 0; }
  var i, guard = 0;
  do { i = Math.floor(Math.random() * lines.length); guard++; } while (used.indexOf(i) !== -1 && guard < 50);
  used.push(i);
  return lines[i];
}

/* ---------------- mount (Planner view only) ---------------- */
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
  host.addEventListener('click', dismiss); // tap mascot to dismiss
  scroll.insertBefore(host, anchor);
  return host;
}

/* ---------------- react ---------------- */
function react(mood, trigger) {
  if (muted() || !COPY[mood]) return false;
  if (trigger) {
    if (shownTrigger[trigger]) return false;
    shownTrigger[trigger] = true;
  }
  var host = mount();
  if (!host) return false;
  host.classList.remove('mascot-happy', 'mascot-excited', 'mascot-sad', 'tws-mascot-in');
  void host.offsetWidth; // restart entrance animation
  host.classList.add('mascot-' + mood, 'tws-mascot-in');
  var bubble = host.querySelector('.tws-mascot-bubble');
  if (bubble) bubble.textContent = pick(mood);
  host.classList.remove('hidden');
  if (mood === 'excited' && !REDUCED) sparkleBurst(host.querySelector('.mascot-figure'));
  return true;
}

function dismiss() {
  var host = document.getElementById('tws-mascot');
  if (host) host.classList.add('hidden');
  try { localStorage.setItem('tws_mascot_muted', '1'); } catch (e) {}
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

/* Save burst: gold particles fly from the tapped button to the Planner nav button.
   The saved-count badge pop is handled by existing CSS (.nav-badge.pop). */
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

/* Excited sparkles around the mascot figure */
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
  } catch (e) { /* storage unavailable: show once per boot */ }
  var ov = document.createElement('div');
  ov.className = 'tws-friday';
  ov.setAttribute('role', 'status');
  ov.innerHTML = '<div class="tws-friday-inner">' +
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
  renderMascotSVG: renderMascotSVG // swappable character hook
};
})();
