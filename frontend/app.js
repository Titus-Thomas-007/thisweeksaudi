/* Wain — client app. No framework, one file. */
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

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error('api ' + r.status);
  return r.json();
}

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
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
  $('#btn-build').onclick = () => buildDeck(false);
  $('#btn-skip').onclick = () => buildDeck(true);
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

function buildDeck(skip) {
  if (skip) { state.cities.clear(); state.cats.clear(); }
  state.filtered = filteredEvents();
  const deck = state.filtered.filter(e => !state.saved[e.id]);
  state.deck = deck; state.idx = 0;
  state.mapPlottedFor = null; // force map replot with new prefs
  saveLocal();
  renderStack();
  showView('#view-deck');
}

/* ---------- deck ---------- */
function cardImage(el, ev) {
  const setFallback = () => {
    el.classList.add('fallback');
    el.innerHTML = `<div class="wm">${esc((ev.category || 'EV').toUpperCase().slice(0, 4))}</div>`;
  };
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
      if (d.image && el.isConnected && el.dataset.url === ev.url) {
        el.classList.remove('fallback'); el.innerHTML = '';
        el.style.backgroundImage = `url("${d.image}")`;
      }
    }).catch(() => state.imgCache.set(ev.url, null));
}

function cardEl(ev, depth) {
  const el = document.createElement('div');
  el.className = 'swipe-card';
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
        <div class="row">${tagSVG}<span class="card-price">${esc(ev.price || 'See details')}</span></div>
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
  attachDrag(stack.querySelector('.swipe-card'));
  updateSavedCount();
}

function updateSavedCount() { $('#saved-count').textContent = Object.keys(state.saved).length; }

function topCard() { return $('#card-stack .swipe-card'); }
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

async function openDetail(ev) {
  if (!ev) return;
  $('#sheet-backdrop').classList.remove('hidden');
  const sheet = $('#detail-sheet');
  sheet.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const body = $('#sheet-body');
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
        <div class="detail-row">${tagSVG}<div><div class="k">Price</div>${esc(ev.price || 'Check the event page')}</div></div>
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

function closeDetail() {
  $('#sheet-backdrop').classList.add('hidden');
  $('#detail-sheet').classList.add('hidden');
  document.body.style.overflow = '';
}

function downloadICS(ev) {
  const dt = s => s ? s.replace(/-/g, '') : '';
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wain//Events//EN', 'BEGIN:VEVENT',
    `UID:${ev.id}@wain.events`, `DTSTART;VALUE=DATE:${dt(ev.start)}`,
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
        <div class="saved-sub">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}${ev.price ? ' · ' + esc(ev.price) : ''}</div>
      </div>
      <button class="saved-unsave" aria-label="Remove">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    const thumb = r.querySelector('.saved-thumb');
    cardImageThumb(thumb, ev);
    r.onclick = e => { if (!e.target.closest('.saved-unsave')) openDetail(ev); };
    r.querySelector('.saved-unsave').onclick = () => {
      delete state.saved[ev.id]; saveLocal(); updateSavedCount(); renderSaved($('#saved-search').value);
    };
    list.appendChild(r);
  });
}

function cardImageThumb(el, ev) {
  if (!ev.url) return;
  const apply = img => { if (img && el.isConnected) { el.style.backgroundImage = `url("${img}")`; el.textContent = ''; } };
  if (state.imgCache.has(ev.url)) return apply(state.imgCache.get(ev.url));
  fetch('/api/preview?url=' + encodeURIComponent(ev.url)).then(r => r.json())
    .then(d => { state.imgCache.set(ev.url, d.image || null); apply(d.image); })
    .catch(() => state.imgCache.set(ev.url, null));
}

/* ---------- map ---------- */
async function openMap() {
  $('#map-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (!state.map) {
    state.map = L.map('map').setView([24.0, 45.0], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
  }
  setTimeout(() => state.map.invalidateSize(), 100);
  const sig = [...state.cities].sort().join(',') + '|' + [...state.cats].sort().join(',');
  if (state.mapPlottedFor === sig) { $('#map-status').style.opacity = '0'; return; }
  if (state.markers) state.markers.clearLayers();
  else state.markers = L.layerGroup().addTo(state.map);
  state.mapPlottedFor = sig;
  const events = state.filtered && state.filtered.length ? state.filtered : state.all;
  const status = $('#map-status');
  status.style.opacity = '1';
  let done = 0, plotted = 0;
  const bounds = [];
  for (const ev of events) {
    status.textContent = `Plotting events… ${done}/${events.length}`;
    const g = await geoFor(ev);
    done++;
    if (g.lat) {
      plotted++;
      bounds.push([g.lat, g.lng]);
      const m = L.circleMarker([g.lat, g.lng], {
        radius: 7, color: '#e8b44a', weight: 2, fillColor: '#e8b44a', fillOpacity: 0.85
      }).addTo(state.markers);
      m.bindPopup(`<div class="map-pop-title">${esc(ev.title)}</div>
        <div class="map-pop-meta">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}</div>
        <button class="map-pop-open" data-id="${esc(ev.id)}">View details</button>`);
      m.on('popupopen', e => {
        const btn = e.popup.getElement().querySelector('.map-pop-open');
        if (btn) btn.onclick = () => { const found = state.all.find(x => x.id === btn.dataset.id); if (found) openDetail(found); };
      });
    }
  }
  if (bounds.length) state.map.fitBounds(bounds, { padding: [40, 40] });
  status.textContent = `${plotted} events plotted`;
  setTimeout(() => status.style.opacity = '0', 2200);
}

function closeMap() {
  $('#map-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---------- wire up & boot ---------- */
$('#btn-pass').onclick = () => flyOut(-1, () => decide(false));
$('#btn-like').onclick = () => flyOut(1, () => decide(true));
$('#btn-map').onclick = openMap;
$('#map-close').onclick = closeMap;
$('#btn-saved').onclick = () => { renderSaved(''); $('#saved-search').value = ''; showView('#view-saved'); };
$('#btn-saved-back').onclick = () => showView('#view-deck');
$('#saved-search').oninput = e => renderSaved(e.target.value);
$('#btn-prefs').onclick = () => { $('#city-chips').innerHTML = ''; $('#interest-chips').innerHTML = ''; initOnboard(); showView('#view-onboard'); };
$('#btn-rebuild').onclick = () => $('#btn-prefs').click();
$('#sheet-close').onclick = closeDetail;
$('#sheet-backdrop').onclick = closeDetail;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeMap(); return; }
  if (!$('#view-deck').classList.contains('active') || !$('#detail-sheet').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') $('#btn-like').click();
  if (e.key === 'ArrowLeft') $('#btn-pass').click();
});

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
