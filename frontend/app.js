/* ThisWeekSaudi — client app. No framework, one file. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const CAT_LABELS = {
  conference: 'Conference', expo: 'Expo', workshop: 'Workshop',
  meetup: 'Meetup', sports: 'Sports', arts: 'Arts & Culture',
  music: 'Music', food: 'Food & Drink', other: 'More',
};

const state = {
  all: [], meta: null,
  cities: new Set(), cats: new Set(),
  deck: [], idx: 0,
  saved: {},           // id -> savedAt
  imgCache: new Map(), // url -> image|null (null = tried, none)
  geoCache: new Map(), // "venue|city" -> {lat,lng}
  map: null, mapPlotted: false,
};
// NOTE: localStorage keys keep the original 'wain_' prefix so saved events
// and preferences survive the ThisWeekSaudi rebrand.
try { state.saved = JSON.parse(localStorage.getItem('wain_saved') || '{}'); } catch { state.saved = {}; }
try {
  const p = JSON.parse(localStorage.getItem('wain_prefs') || '{}');
  (p.cities || []).forEach(c => state.cities.add(c));
  (p.cats || []).forEach(c => state.cats.add(c));
} catch {}

const saveLocal = () => {
  localStorage.setItem('wain_saved', JSON.stringify(state.saved));
  localStorage.setItem('wain_prefs', JSON.stringify({ cities: [...state.cities], cats: [...state.cats] }));
};

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtRange = (s, e) => {
  if (!s) return '';
  if (!e || e === s) return fmtDate(s);
  const sameMonth = s.slice(0, 7) === e.slice(0, 7);
  return sameMonth ? `${fmtDate(s)} – ${new Date(e + 'T12:00:00').getDate()}` : `${fmtDate(s)} – ${fmtDate(e)}`;
};
const pinSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const tagSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>';
// Prices are stored in USD ("From $18.40"); the site is Saudi-first, so
// display SAR at the pegged rate, rounded to whole riyals.
const USD_SAR = 3.75;
const EUR_SAR = 4.07; // approx EUR peg; display-only conversion
const GBP_SAR = 5.00; // approx GBP peg; display-only conversion
const fmtPrice = p => p ? String(p)
  .replace(/\$(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * USD_SAR))
  .replace(/€(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * EUR_SAR))
  .replace(/£(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * GBP_SAR)) : p;

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('api ' + r.status);
  return r.json();
}

function showView(id, mode = 'push') {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
  if (mode === 'push') _pushHist({ view: id });
  else if (mode === 'replace') _replaceHist({ view: id });
}

/* ---------- browser history: make the native Back button work ---------- */
// Every view and modal pushes a history entry, so Back walks the app
// instead of exiting it. _histLock suppresses pushes during programmatic
// UI sync (popstate restores, modal swaps).
let _histLock = false;
const _viewHash = id => ({ '#view-onboard': 'onboard', '#view-deck': 'deck', '#view-list': 'list', '#view-saved': 'saved' }[id] || 'onboard');
function _pushHist(s) {
  if (_histLock) return;
  try { history.pushState(s, '', '#' + (s.modal || _viewHash(s.view))); } catch (e) {}
}
function _replaceHist(s) {
  try { history.replaceState(s, '', '#' + (s.modal || _viewHash(s.view))); } catch (e) {}
}
function _topIsModal(name) {
  return !_histLock && history.state && history.state.modal === name;
}

/* ---------- onboarding ---------- */
async function initOnboard() {
  const meta = state.meta = await api('/api/meta');
  const cc = $('#city-chips');
  meta.cities.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.cities.has(c) ? ' on' : '');
    b.textContent = c;
    b.onclick = () => { state.cities.has(c) ? state.cities.delete(c) : state.cities.add(c); b.classList.toggle('on'); refreshOnboard(); };
    cc.appendChild(b);
  });
  const ic = $('#interest-chips');
  meta.categories.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.cats.has(c) ? ' on' : '');
    b.textContent = CAT_LABELS[c] || c;
    b.onclick = () => { state.cats.has(c) ? state.cats.delete(c) : state.cats.add(c); b.classList.toggle('on'); refreshOnboard(); };
    ic.appendChild(b);
  });
  $('#btn-build').onclick = () => buildDeck();
  $('#btn-skip').onclick = buildList;
  refreshOnboard();
}

function filteredEvents() {
  return state.all.filter(e =>
    (!state.cities.size || state.cities.has(e.city)) &&
    (!state.cats.size || state.cats.has(e.category)));
}

function refreshOnboard() {
  const n = filteredEvents().length;
  const anySel = state.cities.size + state.cats.size > 0;
  $('#btn-build').disabled = !anySel;
  $('#onboard-count').textContent = anySel ? `${n} event${n === 1 ? '' : 's'} match your picks` : 'Pick at least one city or interest';
  saveLocal();
}

function buildDeck() {
  state.filtered = filteredEvents();
  const deck = state.filtered.filter(e => !state.saved[e.id]);
  state.deck = deck; state.idx = 0;
  state.mapPlottedFor = null; // force map replot with new prefs
  state.mapCat = null; // reset the in-map type filter
  saveLocal();
  renderStack();
  showView('#view-deck');
  warmGeoCache(state.filtered); // preload map pins in the background
}

/* ---------- deck ---------- */
function cardImage(el, ev) {
  const setFallback = () => {
    el.classList.add('fallback');
    el.innerHTML = `<div class="wm">${esc((ev.category || 'EV').toUpperCase().slice(0, 4))}</div>`;
  };
  const setImage = (img) => {
    el.classList.remove('fallback'); el.innerHTML = '';
    el.style.backgroundImage = `url("${img}")`;
  };
  if (ev.image) return setImage(ev.image); // baked offline: instant
  if (!ev.url) return setFallback();
  if (state.imgCache.has(ev.url)) {
    const img = state.imgCache.get(ev.url);
    img ? el.style.backgroundImage = `url("${img}")` : setFallback();
    return;
  }
  setFallback(); // show placeholder until the real image arrives
  el.dataset.url = ev.url;
  fetch('/api/preview?url=' + encodeURIComponent(ev.url))
    .then(r => r.json()).then(d => {
      state.imgCache.set(ev.url, d.image || null);
      if (d.image && el.isConnected && el.dataset.url === ev.url) setImage(d.image);
    }).catch(() => state.imgCache.set(ev.url, null));
}

function cardEl(ev, depth) {
  const el = document.createElement('div');
  el.className = 'swipe-card' + (depth === 0 ? ' top' : '');
  el.dataset.id = ev.id;
  const scale = 1 - depth * 0.045, dy = depth * 12;
  el.style.transform = `translateY(${dy}px) scale(${scale})`;
  el.style.zIndex = 50 - depth;
  el.innerHTML = `
    <div class="card-img"></div>
    <div class="stamp save">SAVE</div>
    <div class="stamp pass">PASS</div>
    <div class="card-body">
      <div class="card-cats">
        <span class="cat-pill">${esc(CAT_LABELS[ev.category] || ev.category || '')}</span>
        <span class="cat-pill date-pill">${esc(fmtRange(ev.start, ev.end))}</span>
      </div>
      <h3 class="card-title">${esc(ev.title)}</h3>
      <div class="card-meta">
        ${ev.venue ? `<div class="row">${pinSVG}<span>${esc(ev.venue)} · ${esc(ev.city)}</span></div>` : `<div class="row">${pinSVG}<span>${esc(ev.city)}</span></div>`}
        <div class="row">${tagSVG}<span class="card-price">${esc(fmtPrice(ev.price) || 'See details')}</span></div>
      </div>
    </div>`;
  cardImage(el.querySelector('.card-img'), ev);
  return el;
}

function renderStack() {
  const stack = $('#card-stack');
  stack.innerHTML = '';
  const empty = state.idx >= state.deck.length;
  $('#deck-empty').classList.toggle('hidden', !empty);
  if (empty) { updateSavedCount(); return; }
  for (let d = 2; d >= 0; d--) {
    const ev = state.deck[state.idx + d];
    if (ev) stack.appendChild(cardEl(ev, d));
  }
  attachDrag(stack.querySelector('.swipe-card.top'));
  updateSavedCount();
}

function updateSavedCount() { $('#saved-count').textContent = Object.keys(state.saved).length; }

function topCard() { return $('#card-stack .swipe-card.top'); }
function topEvent() { return state.deck[state.idx]; }

function flyOut(dir, done) {
  const el = topCard();
  if (!el) return done && done();
  const w = el.offsetWidth;
  el.style.transition = 'transform .32s cubic-bezier(.3,.7,.3,1), opacity .32s';
  el.style.transform = `translate(${dir * w * 1.7}px, ${dir * 60}px) rotate(${dir * 28}deg)`;
  el.style.opacity = '0';
  setTimeout(() => done && done(), 330);
}

function decide(save) {
  const ev = topEvent();
  if (!ev) return;
  if (save) { state.saved[ev.id] = Date.now(); saveLocal(); }
  state.idx++;
  renderStack();
}

function attachDrag(el) {
  if (!el) return;
  let sx = 0, dx = 0, dragging = false, moved = 0, t0 = 0;
  const saveStamp = el.querySelector('.stamp.save'), passStamp = el.querySelector('.stamp.pass');
  el.addEventListener('pointerdown', e => {
    dragging = true; moved = 0; t0 = Date.now(); sx = e.clientX;
    el.classList.add('dragging'); el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = e.clientX - sx; moved = Math.max(moved, Math.abs(dx));
    const rot = dx / 16;
    el.style.transform = `translate(${dx}px, ${Math.abs(dx) * 0.12}px) rotate(${rot}deg)`;
    const k = Math.min(1, Math.abs(dx) / 90);
    saveStamp.style.opacity = dx > 0 ? k : 0;
    passStamp.style.opacity = dx < 0 ? k : 0;
  });
  const end = e => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const quickTap = moved < 10 && Date.now() - t0 < 350;
    if (quickTap) { el.style.transform = ''; openDetail(topEvent()); return; }
    if (Math.abs(dx) > 110) flyOut(Math.sign(dx), () => decide(dx > 0));
    else {
      el.style.transition = 'transform .3s cubic-bezier(.3,.7,.3,1)';
      el.style.transform = '';
      saveStamp.style.opacity = passStamp.style.opacity = 0;
      setTimeout(() => el.style.transition = '', 320);
    }
    dx = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------- all-events list ---------- */
function buildList() {
  state.cities.clear(); state.cats.clear(); saveLocal();
  state.filtered = [...state.all]; // "everything": list, deck state and map agree
  state.mapCat = null; state.mapPlottedFor = null;
  renderList();
  showView('#view-list');
}

function renderList() {
  const list = $('#event-list');
  const events = [...state.all].sort((a, b) =>
    (a.start || '').localeCompare(b.start || '') || (a.title || '').localeCompare(b.title || ''));
  $('#list-count').textContent = `${events.length} events`;
  if (!events.length) {
    list.innerHTML = '<div class="saved-empty">No events right now.</div>';
    return;
  }
  list.innerHTML = '';
  events.forEach(ev => {
    const r = document.createElement('div');
    r.className = 'saved-row';
    r.innerHTML = `
      <div class="saved-thumb">${esc((ev.category || 'E').slice(0, 1).toUpperCase())}</div>
      <div class="saved-info">
        <div class="saved-title">${esc(ev.title)}</div>
        <div class="saved-sub">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}${ev.price ? ' · ' + esc(fmtPrice(ev.price)) : ''}</div>
        <div class="saved-sub saved-venue">${esc(ev.venue || '')}${ev.venue && ev.category ? ' · ' : ''}${esc(CAT_LABELS[ev.category] || ev.category || '')}</div>
      </div>
      <div class="row-chev" aria-hidden="true">›</div>`;
    cardImageThumb(r.querySelector('.saved-thumb'), ev);
    r.onclick = () => openDetail(ev, { fromList: true });
    list.appendChild(r);
  });
}

/* ---------- detail sheet ---------- */
async function geoFor(ev) {
  const key = `${ev.venue || ''}|${ev.city || ''}`;
  if (state.geoCache.has(key)) return state.geoCache.get(key);
  try {
    const g = await api('/api/geocode?venue=' + encodeURIComponent(ev.venue || '') + '&city=' + encodeURIComponent(ev.city || ''));
    state.geoCache.set(key, g);
    return g;
  } catch { return { lat: null, lng: null }; }
}

async function openDetail(ev, opts = {}) {
  if (!ev) return;
  $('#sheet-backdrop').classList.remove('hidden');
  const sheet = $('#detail-sheet');
  sheet.classList.remove('hidden');
  // Back button: returns to wherever the sheet was opened from.
  // The label and accessible name both reflect the origin context.
  const backBtn = $('#sheet-back'), backLabel = backBtn.querySelector('span');
  backBtn.classList.remove('hidden');
  const backName = opts.fromMap ? 'Map' : opts.fromList ? 'List' : opts.fromSaved ? 'Saved' : 'Back';
  backLabel.textContent = backName;
  backBtn.setAttribute('aria-label', backName === 'Back' ? 'Back' : 'Back to ' + backName.toLowerCase());
  // All origins walk browser history: the sheet pushed a modal entry, so
  // Back closes it and popstate restores the map/list/saved/deck beneath.
  backBtn.onclick = closeDetail;
  // Push a modal history entry so the native Back button closes the sheet.
  _pushHist({ modal: 'sheet', eid: ev.id });
  document.body.style.overflow = 'hidden';
  const body = $('#sheet-body');
  body.scrollTop = 0;
  body.innerHTML = `
    <div class="sheet-hero" id="sheet-hero"></div>
    <div class="sheet-content">
      <div class="card-cats">
        <span class="cat-pill">${esc(CAT_LABELS[ev.category] || ev.category || '')}</span>
        <span class="cat-pill date-pill">${esc(fmtRange(ev.start, ev.end))}</span>
      </div>
      <h2>${esc(ev.title)}</h2>
      <div class="detail-rows">
        <div class="detail-row">${pinSVG}<div><div class="k">Venue</div>${esc(ev.venue || ev.city)}${ev.venue ? `<br><span style="color:var(--faint)">${esc(ev.city)}</span>` : ''}</div></div>
        <div class="detail-row">${tagSVG}<div><div class="k">Price</div>${esc(fmtPrice(ev.price) || 'Check the event page')}</div></div>
        ${ev.organizer ? `<div class="detail-row"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg><div><div class="k">Organizer</div>${esc(ev.organizer)}</div></div>` : ''}
      </div>
      <div class="sheet-actions">
        ${ev.url ? `<a class="btn go" href="${esc(ev.url)}" target="_blank" rel="noopener">Register / Event page</a>` : ''}
        <button class="btn ghost" id="sheet-cal">Add to calendar</button>
        <button class="btn ghost" id="sheet-gmaps">Open in Google Maps</button>
      </div>
      <div class="map-embed" id="sheet-mapwrap" style="display:none"><iframe id="sheet-map" loading="lazy" title="Venue map"></iframe></div>
    </div>`;
  cardImage($('#sheet-hero'), ev);
  $('#sheet-cal').onclick = () => downloadICS(ev);
  const openMaps = async () => {
    const g = await geoFor(ev);
    const q = g.lat ? `${g.lat},${g.lng}` : `${ev.venue || ''} ${ev.city} Saudi Arabia`;
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank');
  };
  $('#sheet-gmaps').onclick = openMaps;
  const g = await geoFor(ev);
  if (g.lat && body.isConnected) {
    $('#sheet-mapwrap').style.display = 'block';
    $('#sheet-map').src = `https://maps.google.com/maps?q=${g.lat},${g.lng}&z=15&output=embed`;
  }
}

function _closeDetailUI() {
  $('#sheet-backdrop').classList.add('hidden');
  $('#detail-sheet').classList.add('hidden');
  document.body.style.overflow = '';
}
// History-aware close used by the X button, backdrop, Escape, and the
// sheet back button: walks browser history when the sheet owns the top
// entry, otherwise just hides the sheet.
function closeDetail() {
  if (_topIsModal('sheet')) history.back();
  else _closeDetailUI();
}

function downloadICS(ev) {
  const dt = s => s ? s.replace(/-/g, '') : '';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ThisWeekSaudi//Events//EN', 'BEGIN:VEVENT',
    `UID:${ev.id}@thisweeksaudi`, `DTSTART;VALUE=DATE:${dt(ev.start)}`,
    ev.end && ev.end !== ev.start ? `DTEND;VALUE=DATE:${dt(ev.end)}` : null,
    `SUMMARY:${ev.title.replace(/[,;]/g, ' ')}`,
    `LOCATION:${[ev.venue, ev.city].filter(Boolean).join(', ').replace(/[,;]/g, ' ')}`,
    ev.url ? `URL:${ev.url}` : null,
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = ev.id + '.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- saved ---------- */
function renderSaved(filter = '') {
  const list = $('#saved-list');
  const ids = Object.keys(state.saved).sort((a, b) => state.saved[b] - state.saved[a]);
  const q = filter.trim().toLowerCase();
  const rows = ids.map(id => state.all.find(e => e.id === id)).filter(Boolean)
    .filter(ev => !q || `${ev.title} ${ev.venue} ${ev.city}`.toLowerCase().includes(q));
  if (!rows.length) {
    list.innerHTML = `<div class="saved-empty">${q ? 'No saved events match your search.' : 'Nothing saved yet.<br>Swipe right on anything you like and it will live here.'}</div>`;
    return;
  }
  list.innerHTML = '';
  rows.forEach(ev => {
    const r = document.createElement('div');
    r.className = 'saved-row';
    r.innerHTML = `
      <div class="saved-thumb">${esc((ev.category || 'E').slice(0, 1).toUpperCase())}</div>
      <div class="saved-info">
        <div class="saved-title">${esc(ev.title)}</div>
        <div class="saved-sub">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}${ev.price ? ' · ' + esc(fmtPrice(ev.price)) : ''}</div>
        <div class="saved-sub saved-venue">${esc(ev.venue || '')}${ev.venue && ev.category ? ' · ' : ''}${esc(CAT_LABELS[ev.category] || ev.category || '')}</div>
      </div>
      <button class="saved-unsave" aria-label="Remove">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    const thumb = r.querySelector('.saved-thumb');
    cardImageThumb(thumb, ev);
    r.onclick = e => { if (!e.target.closest('.saved-unsave')) openDetail(ev, { fromSaved: true }); };
    r.querySelector('.saved-unsave').onclick = () => {
      delete state.saved[ev.id]; saveLocal(); updateSavedCount(); renderSaved($('#saved-search').value);
    };
    list.appendChild(r);
  });
}

function cardImageThumb(el, ev) {
  const apply = img => { if (img && el.isConnected) { el.style.backgroundImage = `url("${img}")`; el.textContent = ''; } };
  if (ev.image) return apply(ev.image); // baked offline: instant
  if (!ev.url) return;
  if (state.imgCache.has(ev.url)) return apply(state.imgCache.get(ev.url));
  fetch('/api/preview?url=' + encodeURIComponent(ev.url)).then(r => r.json())
    .then(d => { state.imgCache.set(ev.url, d.image || null); apply(d.image); })
    .catch(() => state.imgCache.set(ev.url, null));
}

/* ---------- map ---------- */
// Geocode with bounded concurrency; results land in state.geoCache via geoFor.
function geoPool(events, concurrency, onProgress) {
  const queue = events.slice();
  const results = [];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const ev = queue.shift();
      let g;
      try { g = await geoFor(ev); } catch { g = { lat: null, lng: null }; }
      results.push({ ev, g });
      if (onProgress) onProgress(results.length);
    }
  });
  return Promise.all(workers).then(() => results);
}

// Fire-and-forget: warm the geocode cache right after the deck is built,
// so opening the map later feels instant.
function warmGeoCache(events) {
  if (!events || !events.length) return;
  geoPool(events, 4, null).catch(() => {});
}

function userLocation() {
  return new Promise(resolve => {
    let settled = false;
    const done = v => { if (!settled) { settled = true; resolve(v); } };
    if (!navigator.geolocation) return done(null);
    try {
      navigator.geolocation.getCurrentPosition(
        p => done([p.coords.latitude, p.coords.longitude]),
        () => done(null),
        { timeout: 7000, maximumAge: 900000 });
    } catch { return done(null); }
    setTimeout(() => done(null), 8000); // hard cap
  });
}

// ---------- map ----------
// Map-local event-type filter (single select, null = all). The map always
// starts from the deck's current event set; the chips narrow it further
// without leaving the map.
function mapBaseEvents() {
  return state.filtered && state.filtered.length ? state.filtered : state.all;
}

function renderMapFilters() {
  const bar = $('#map-filters');
  bar.innerHTML = '';
  const cats = [...new Set(mapBaseEvents().map(e => e.category).filter(Boolean))].sort();
  const mk = (val, label) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.mapCat === val ? ' on' : '');
    b.textContent = label;
    b.onclick = () => {
      if (state.mapCat === val) return;
      state.mapCat = val;
      renderMapFilters();
      plotMapMarkers(false); // replot in place, keep the user's current view
    };
    bar.appendChild(b);
  };
  mk(null, 'All');
  cats.forEach(c => mk(c, CAT_LABELS[c] || c));
  bar.style.display = cats.length ? '' : 'none';
}

// Luma-style pins: circular event-image thumbnails, gold dot when imageless.
function evIcon(ev) {
  if (ev.image && /^https?:\/\//.test(ev.image)) {
    return L.divIcon({ className: 'ev-pin-wrap',
      html: `<div class="ev-pin" style="background-image:url(&quot;${esc(ev.image)}&quot;)"></div>`,
      iconSize: [38, 38], iconAnchor: [19, 19] });
  }
  return L.divIcon({ className: 'ev-dot-wrap', html: '<div class="ev-dot"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8] });
}

async function openMap(hist = true) {
  $('#map-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (hist) _pushHist({ modal: 'map' });
  if (!state.map) {
    state.map = L.map('map').setView([24.0, 45.0], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
    state.youLayer = L.layerGroup().addTo(state.map);
  }
  setTimeout(() => state.map.invalidateSize(), 100);
  renderMapFilters();

  // Center on the user when they share their location.
  const status = $('#map-status');
  status.style.opacity = '1';
  status.textContent = 'Finding you…';
  const you = await userLocation();
  state.youLayer.clearLayers();
  if (you) {
    state.map.setView(you, 10);
    L.circleMarker(you, { radius: 8, color: '#4aa3ff', weight: 3, fillColor: '#4aa3ff', fillOpacity: 0.9 })
      .addTo(state.youLayer).bindPopup('You are here');
  }
  await plotMapMarkers(!you);
}

async function plotMapMarkers(refit) {
  const status = $('#map-status');
  const sig = [...state.cities].sort().join(',') + '|' + [...state.cats].sort().join(',')
    + '|' + (state.mapCat || '');
  if (state.mapPlottedFor === sig) { status.style.opacity = '0'; return; }
  if (state.markers) state.markers.clearLayers();
  else state.markers = (L.markerClusterGroup
    ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 56 })
    : L.layerGroup()).addTo(state.map);
  state.mapPlottedFor = sig;
  let events = mapBaseEvents();
  if (state.mapCat) events = events.filter(e => e.category === state.mapCat);
  status.style.opacity = '1';
  status.textContent = 'Plotting events…';
  const results = await geoPool(events, 6,
    n => { status.textContent = `Plotting events… ${n}/${events.length}`; });
  let plotted = 0;
  const bounds = [];
  for (const { ev, g } of results) {
    if (g.lat == null) continue;
    plotted++;
    bounds.push([g.lat, g.lng]);
    const m = L.marker([g.lat, g.lng], { icon: evIcon(ev) }).addTo(state.markers);
    const img = ev.image && /^https?:\/\//.test(ev.image)
      ? `<div class="map-pop-img" style="background-image:url(&quot;${esc(ev.image)}&quot;)"></div>` : '';
    const viewBtn = ev.url
      ? `<a class="map-pop-open primary" href="${esc(ev.url)}" target="_blank" rel="noopener">View event</a>` : '';
    m.bindPopup(`<div class="map-pop">${img}<div class="map-pop-title">${esc(ev.title)}</div>
      <div class="map-pop-meta">${esc(fmtRange(ev.start, ev.end))} \u00b7 ${esc(ev.city)}</div>
      <div class="map-pop-actions">${viewBtn}<button class="map-pop-open" data-id="${esc(ev.id)}">Details</button></div></div>`);
    m.on('popupopen', e => {
      const btn = e.popup.getElement().querySelector('button.map-pop-open');
      if (btn) btn.onclick = () => {
        const found = state.all.find(x => x.id === btn.dataset.id);
        if (found) { closeMap(); openDetail(found, { fromMap: true }); }
      };
    });
  }
  if (refit && bounds.length) state.map.fitBounds(bounds, { padding: [40, 40] });
  // Honest count: only genuinely verified venue locations get pins.
  const unverified = events.length - plotted;
  if (unverified > 0) {
    status.textContent = `${plotted} of ${events.length} events have verified map locations`;
  } else {
    status.textContent = `${plotted} event${plotted === 1 ? '' : 's'} plotted`;
    setTimeout(() => status.style.opacity = '0', 2200);
  }
}

function closeMap() {
  $('#map-modal').classList.add('hidden');
  document.body.style.overflow = '';
}
// X button on the map: walk history when the map owns the top entry.
function closeMapUI() {
  if (_topIsModal('map')) history.back();
  else closeMap();
}

/* ---------- wire up & boot ---------- */
$('#btn-pass').onclick = () => flyOut(-1, () => decide(false));
$('#btn-like').onclick = () => flyOut(1, () => decide(true));
$('#btn-map').onclick = () => openMap();
$('#map-close').onclick = closeMapUI;
$('#btn-saved').onclick = () => { renderSaved(''); $('#saved-search').value = ''; showView('#view-saved'); };
// In-app back buttons walk browser history (popstate restores the view);
// fall back to a direct view swap if history has nothing to go back to.
const _inAppBack = fallback => {
  if (window.history.length > 1) history.back();
  else showView(fallback, 'replace');
};
$('#btn-saved-back').onclick = () => _inAppBack('#view-deck');
$('#btn-list-back').onclick = () => _inAppBack('#view-onboard');
$('#saved-search').oninput = e => renderSaved(e.target.value);
$('#btn-prefs').onclick = () => { $('#city-chips').innerHTML = ''; $('#interest-chips').innerHTML = ''; initOnboard(); showView('#view-onboard', 'replace'); };
$('#btn-rebuild').onclick = () => $('#btn-prefs').click();
$('#sheet-close').onclick = closeDetail;

$('#sheet-backdrop').onclick = closeDetail;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeMapUI(); return; }
  if (!$('#view-deck').classList.contains('active') || !$('#detail-sheet').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') $('#btn-like').click();
  if (e.key === 'ArrowLeft') $('#btn-pass').click();
});

// Native Back/Forward: restore the view or modal the history entry owns.
window.addEventListener('popstate', e => {
  const s = e.state || {};
  _histLock = true;
  try {
    _closeDetailUI();
    closeMap();
    if (s.modal === 'map') {
      openMap(false);
    } else if (s.modal === 'sheet' && s.eid) {
      const ev = (state.all || []).find(x => x.id === s.eid);
      if (ev) openDetail(ev, {});
    } else if (s.view === '#view-deck' && !(state.filtered && state.filtered.length)) {
      showView('#view-onboard', 'none'); // deck state lost (e.g. after reload): fall back
    } else if (s.view) {
      if (s.view === '#view-list') renderList();
      if (s.view === '#view-saved') renderSaved(($('#saved-search') || {}).value || '');
      showView(s.view, 'none');
    } else {
      showView('#view-onboard', 'none');
    }
  } finally {
    _histLock = false;
  }
});
_replaceHist({ view: '#view-onboard' }); // boot entry: Back from the first view exits cleanly

(async function boot() {
  try {
    const data = await api('/api/events?limit=2000');
    state.all = data.events;
    await initOnboard();
    updateSavedCount();
  } catch (err) {
    document.body.innerHTML = '<div style="padding:60px 24px;text-align:center;color:#9aa1ad;font-family:sans-serif">Could not reach the events server.<br>Please try again in a moment.</div>';
  }
})();
