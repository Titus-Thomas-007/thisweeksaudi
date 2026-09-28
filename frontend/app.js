/* ThisWeekSaudi — swipeable events directory. Apple-HIG dark UI. */
(function(){
'use strict';

/* ---------- constants ---------- */
const PROFESSIONS = [
  { key:'engineering', label:'Engineering', domains:['tech','industry','build','energy','space','auto'] },
  { key:'medicine',    label:'Medicine',    domains:['health'] },
  { key:'business',    label:'Business',    domains:['business','finance','startup','retail','hr','marketing'] },
  { key:'design',      label:'Design',      domains:['marketing','build'] },
  { key:'education',   label:'Education',   domains:['education'] },
  { key:'law',         label:'Law',         domains:['legal','gov'] },
  { key:'other',       label:'Entertainment & Others', domains:[] }
];
const CATEGORY_ICONS = {
  arts:      '<circle cx="12" cy="12" r="9"/><path d="M12 3c3 3.5 3 6.5 0 9-3-2.5-3-5.5 0-9z"/>',
  comedy:    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  concert:   '<path d="M9 18V6l10-2v11"/><circle cx="7" cy="18" r="2.5"/><circle cx="17" cy="15" r="2.5"/>',
  conference:'<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  expo:      '<path d="M4 9l8-5 8 5v9l-8 5-8-5z"/><path d="M4 9l8 5 8-5M12 14v9"/>',
  festival:  '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3"/>',
  meetup:    '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="10" r="2.5"/><path d="M16 15.2c2.6.6 5 2.6 5 4.8"/>',
  sports:    '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.8 5.8c4 3 8.4 3 12.4 0M5.8 18.2c4-3 8.4-3 12.4 0"/>',
  workshop:  '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4L14.5 12l-2.5-2.5z"/>'
};
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- utils ---------- */
const $ = (s, r) => (r||document).querySelector(s);
const $$ = (s, r) => Array.from((r||document).querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait = ms => new Promise(r => setTimeout(r, ms));
const money = n => Number(n).toLocaleString('en-US');
function fmtPrice(ev){
  if(!ev) return 'TBA';
  if(ev.is_free) return 'Free';
  if(ev.price_min==null) return 'TBA';
  let v = Number(ev.price_min), c = (ev.currency||'').toUpperCase();
  if(!isFinite(v) || v<=0) return 'TBA';
  if(c==='USD') v = v*3.75; else if(c==='EUR') v = v*4.05; else if(c==='GBP') v = v*4.75;
  return 'SAR ' + money(Math.round(v));
}
const beacon = (t, d) => { try{
  navigator.sendBeacon('/api/analytics', JSON.stringify({type: t, ref: String((d && d.id) || '').slice(0,64), meta: JSON.stringify(d || {}).slice(0,256)}));
}catch(e){} };
window.addEventListener('error', e => beacon('jserror', {msg:String(e.message).slice(0,200)}));
function dstr(ev){ return (ev.date_start||'').slice(0,10); }
function niceDate(ev){
  if(!ev || !ev.date_start) return 'Date TBA';
  const d = new Date(ev.date_start);
  if(isNaN(d)) return 'Date TBA';
  return d.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
}
function previewURL(ev){
  if(ev.image) return ev.image;  // curated/stored image from image search
  return '/api/preview?url=' + encodeURIComponent(ev.reg_url || ev.source_url || ev.url || '');
}
function initials(title){
  const w = String(title||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return w || '•';
}
/* designed category art for events without photos — layered gradients, orbs, line icon */
const CAT_ART = {
  conference: 'linear-gradient(135deg,#1e3a8a 0%,#4c1d95 55%,#7c3aed 100%)',
  expo:       'linear-gradient(135deg,#0f766e 0%,#0e7490 55%,#22d3ee 100%)',
  workshop:   'linear-gradient(135deg,#9a3412 0%,#c2410c 55%,#f59e0b 100%)',
  meetup:     'linear-gradient(135deg,#9d174d 0%,#be185d 55%,#f472b6 100%)',
  sports:     'linear-gradient(135deg,#166534 0%,#15803d 55%,#a3e635 100%)',
  arts:       'linear-gradient(135deg,#5b21b6 0%,#7c3aed 55%,#c084fc 100%)',
  concert:    'linear-gradient(135deg,#991b1b 0%,#b91c1c 55%,#f472b6 100%)',
  comedy:     'linear-gradient(135deg,#a16207 0%,#ca8a04 60%,#fde047 100%)',
  festival:   'linear-gradient(135deg,#6d28d9 0%,#a21caf 55%,#f59e0b 100%)',
  food:       'linear-gradient(135deg,#7c2d12 0%,#c2410c 55%,#fb923c 100%)',
  other:      'linear-gradient(135deg,#292524 0%,#57534e 60%,#d4a24e 130%)'
};
function catArtHTML(category){
  const g = CAT_ART[category] || CAT_ART.other;
  const icon = CATEGORY_ICONS[category] || '<circle cx="12" cy="12" r="9"/>';
  return '<div class="cat-art" style="background:' + g + '">' +
    '<span class="orb o1"></span><span class="orb o2"></span>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></div>';
}
function catLabel(key){
  const c = state.meta.categories.find(c => c.key === key);
  return c ? c.label : key;
}
function domainLabel(key){
  const d = state.meta.domains.find(d => d.key === key);
  return d ? d.label : key;
}

/* ---------- state ---------- */
const state = {
  events: [], meta: {cities:[], categories:[], domains:[]},
  cities: [], interests: [], domains: [],
  saved: [], remind: {}, stack: [], undo: null,
  detail: null, detailFrom: 'deck', sheetOpen: false,
  fQ:'', fDate:'', fDom:'', fCity:'', sort:'date',
  recent: [],
  ob: { step:1, cities:[], cats:[], prof:null }
};
const _memStore = {};
const storeGet = k => { try{ return localStorage.getItem(k); }catch(e){ return (_memStore[k] !== undefined ? _memStore[k] : null); } };
const storeSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){ try{ _memStore[k] = String(v); }catch(_){} } };
const storeJSON = (k, fb) => { try{ const v = JSON.parse(storeGet(k) || 'null'); return (v === null || v === undefined) ? fb : v; }catch(e){ return fb; } };
state.saved = storeJSON('wain_saved', []);
if(!Array.isArray(state.saved)) state.saved = [];
state.remind = storeJSON('wain_remind', {});
if(typeof state.remind !== 'object' || state.remind === null || Array.isArray(state.remind)) state.remind = {};
state.recent = storeJSON('wain_recent', []);
if(!Array.isArray(state.recent)) state.recent = [];
let prefs = {};
try{ prefs = storeJSON('wain_prefs', {}); }catch(e){ prefs={}; }
if(typeof prefs !== 'object' || prefs === null || Array.isArray(prefs)) prefs = {};
prefs = Object.assign({cities:[], interests:[], domains:[], profession:null, ahaSeen:false}, prefs);
const savePrefs = () => storeSet('wain_prefs', JSON.stringify(prefs));
const saveSaved = () => storeSet('wain_saved', JSON.stringify(state.saved));
const saveRemind = () => storeSet('wain_remind', JSON.stringify(state.remind));
const saveRecent = () => storeSet('wain_recent', JSON.stringify(state.recent));

/* ---------- toast ---------- */
let toastT = null;
function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(()=> t.classList.add('hidden'), 2600);
}

/* ---------- boot ---------- */
let booted = false;
async function boot(){
  if(booted) return; booted = true;
  try{
    const [er, mr] = await Promise.all([
      fetch('/api/events?limit=2000'),
      fetch('/api/meta')
    ]);
    const ed = await er.json(), md = await mr.json();
    state.events = ed.events || [];
    state.meta = md || {cities:[], categories:[], domains:[]};
    // normalize backend shapes: categories arrive as plain strings, domains as {key,en,...}
    if(Array.isArray(state.meta.categories) && typeof state.meta.categories[0] === 'string')
      state.meta.categories = state.meta.categories.map(k => ({key:k, label:k.charAt(0).toUpperCase() + k.slice(1)}));
    if(Array.isArray(state.meta.domains) && state.meta.domains.length && typeof state.meta.domains[0] === 'object')
      state.meta.domains = state.meta.domains.map(d => ({key:d.key, label:d.en || d.key}));
    // events carry a singular `domain` string; expose as `domains` array for ranking/filters
    state.events.forEach(ev => { if(!ev.domains) ev.domains = ev.domain ? [ev.domain] : []; });
    // normalize backend field names: `start`/`end`/`price` -> frontend's date_start/date_end/price_min
    // also drop expired events (end date passed)
    const today = new Date(); today.setHours(0,0,0,0);
    state.events = state.events.filter(ev => {
      if(ev.end && ev.end < today.toISOString().slice(0,10)) return false;
      return true;
    });
    state.events.forEach(ev => {
      if(!ev.date_start && ev.start) ev.date_start = ev.start.length > 10 ? ev.start : ev.start + 'T00:00:00';
      if(!ev.date_end && ev.end) ev.date_end = ev.end.length > 10 ? ev.end : ev.end + 'T00:00:00';
      // parse price string: "Free", "TBA", "From $27.19"
      if(ev.price_min == null && ev.price != null){
        const p = String(ev.price).trim().toLowerCase();
        if(p === 'free'){ ev.is_free = true; }
        else if(p === 'tba' || p === ''){ ev.price_min = null; }
        else {
          const m = String(ev.price).match(/([\d,]+\.?\d*)/);
          if(m){
            ev.price_min = parseFloat(m[1].replace(/,/g,''));
            if(/\$/.test(ev.price)) ev.currency = 'USD';
            else if(/€/.test(ev.price)) ev.currency = 'EUR';
            else if(/£/.test(ev.price)) ev.currency = 'GBP';
            else ev.currency = 'SAR';
          }
        }
      }
    });
  }catch(e){
    toast('Could not load events — check your connection.');
    return;
  }
  state.cities = prefs.cities || [];
  state.interests = prefs.interests || [];
  state.domains = prefs.domains || [];
  const hasPrefs = (prefs.cities && prefs.cities.length) || (prefs.interests && prefs.interests.length);
  wireGlobal();
  wireOnboard(); wireDeck(); wireList(); wireSaved(); wireSheet(); wireMap(); wirePWA();
  const deep = location.hash.match(/#e=([\w-]+)/);
  if(deep){
    const ev = state.events.find(e => e.id === deep[1]);
    enterDeck(true);
    if(ev) openDetail(ev, 'deck');
  } else if(hasPrefs){
    enterDeck(true);
  } else {
    showView('view-onboard');
    initOnboard();
  }
  bootPush();
  beacon('pageview', {n: state.events.length});
}

/* ---------- history + direction-aware view transitions ---------- */
let hist = [];
function _pushHist(entry){
  hist.push(entry);
  try{ history.pushState({h: hist.length}, '', '#v'+hist.length); }catch(e){}
}
function _replaceHist(entry){
  if(!hist.length){
    hist.push(entry);
    try{ history.pushState({h: 1}, '', '#v1'); }catch(e){}
    return;
  }
  hist[hist.length-1] = entry;
  try{ history.replaceState({h: hist.length}, '', '#v'+hist.length); }catch(e){}
}
function showView(id, dir){
  dir = dir || 'fwd';
  $$('.view').forEach(v => v.classList.remove('active','enter-fwd','enter-back'));
  const el = document.getElementById(id);
  el.classList.add('active');
  if(!reduceMotion()){
    void el.offsetWidth;
    el.classList.add(dir === 'back' ? 'enter-back' : 'enter-fwd');
  }
  beacon('view', {id});
}
function navTo(id, dir){
  _pushHist({kind:'view', id});
  showView(id, dir || 'fwd');
}
function enterDeck(first, replace){
  buildDeck();
  if(first || !hist.length){ _replaceHist({kind:'view', id:'view-deck'}); }
  else if(replace){ _replaceHist({kind:'view', id:'view-deck'}); }
  else _pushHist({kind:'view', id:'view-deck'});
  showView('view-deck', first ? 'fwd' : 'back');
}
const mapModal = () => document.getElementById('map-modal');
window.addEventListener('popstate', () => {
  if(state.sheetOpen){ closeDetail(true); hist.pop(); return; }
  if(!mapModal().classList.contains('hidden')){ closeMap(true); hist.pop(); return; }
  hist.pop();
  const top = hist[hist.length-1];
  if(!top){ enterDeck(true); return; }
  if(top.kind === 'view'){ showView(top.id, 'back'); if(top.id==='view-deck') buildDeck(); }
  else if(top.kind === 'map'){ openMap(true); }
  else if(top.kind === 'detail'){
    const ev = state.events.find(e=>e.id===top.evId);
    if(ev) openDetail(ev, top.from, true);
  }
});

/* ---------- onboarding: 2 steps (step 3 hidden per owner request) ---------- */
function setObStep(n, back){
  state.ob.step = n;
  [1,2].forEach(i => {
    const el = $('#ob-step-'+i);
    el.classList.toggle('hidden', i !== n);
    el.classList.remove('slide-back');
    if(i === n && back && !reduceMotion()){ void el.offsetWidth; el.classList.add('slide-back'); }
  });
  $('#ob-step-3').classList.add('hidden');
  // each step must start at the top — step 1's scrolled position must not carry over
  window.scrollTo(0, 0);
  const v = document.getElementById('view-onboard');
  if(v) v.scrollTop = 0;
  const grid = document.getElementById('ob-cat-grid');
  if(grid) grid.scrollTop = 0;
  const list = document.getElementById('ob-city-list');
  if(list) list.scrollTop = 0;
}
function checkSVG(){
  return '<svg class="check" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
}
function obStep1Count(){
  const n = state.ob.cities.length;
  $('#ob-count-1').textContent = n ? n + ' selected' : '';
  $('#ob-next-1').disabled = !n;
}
function obStep2Count(){
  const n = state.ob.cats.length;
  $('#ob-count-2').textContent = n ? n + ' selected' : '';
  $('#ob-next-2').disabled = !n;
}
function renderObCities(filter){
  const box = $('#ob-city-list');
  const q = (filter||'').trim().toLowerCase();
  const cities = state.meta.cities.filter(c => !q || c.toLowerCase().includes(q));
  box.innerHTML = cities.length ? cities.map(c =>
    '<button class="ob-row' + (state.ob.cities.includes(c) ? ' on' : '') + '" data-city="' + esc(c) + '">' +
    '<span class="ob-row-label">' + esc(c) + '</span>' + checkSVG() + '</button>'
  ).join('') : '<div class="ev-empty">No cities match.</div>';
}
function renderObCats(){
  const box = $('#ob-cat-grid');
  box.innerHTML = state.meta.categories.map(c =>
    '<button class="cat-tile' + (state.ob.cats.includes(c.key) ? ' on' : '') + '" data-cat="' + esc(c.key) + '">' +
    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    (CATEGORY_ICONS[c.key] || '<circle cx="12" cy="12" r="9"/>') + '</svg>' +
    '<span class="tile-label">' + esc(c.label) + '</span></button>'
  ).join('');
}
function renderObProfs(filter){
  const box = $('#ob-prof-list');
  const q = (filter||'').trim().toLowerCase();
  const list = PROFESSIONS.filter(p => !q || p.label.toLowerCase().includes(q));
  box.innerHTML = list.length ? list.map(p =>
    '<button class="ob-row' + (state.ob.prof === p.key ? ' on' : '') + '" data-prof="' + esc(p.key) + '">' +
    '<span class="ob-row-label">' + esc(p.label) + '</span>' + checkSVG() + '</button>'
  ).join('') : '<div class="ev-empty">No professions match.</div>';
  $('#ob-count-3').textContent = state.ob.prof ? PROFESSIONS.find(p=>p.key===state.ob.prof).label : '';
}
function initOnboard(){
  state.ob = { step:1, cities: state.cities.slice(), cats: state.interests.slice(), prof: prefs.profession || null };
  setObStep(1);
  renderObCities(''); renderObCats(); renderObProfs('');
  obStep1Count(); obStep2Count();
  $('#ob-city-search').value = ''; $('#ob-prof-search').value = '';
}
function finishOnboarding(){
  const seenBefore = !!prefs.ahaSeen;
  state.cities = state.ob.cities.slice();
  state.interests = state.ob.cats.slice();
  const prof = PROFESSIONS.find(p => p.key === state.ob.prof);
  state.domains = prof ? prof.domains.slice() : [];
  prefs = { cities: state.cities, interests: state.interests, domains: state.domains,
            profession: state.ob.prof, ahaSeen: true };
  savePrefs();
  buildDeck();
  if(seenBefore || reduceMotion()){
    enterDeck(false);
    return;
  }
  navTo('view-aha', 'fwd');
  runAha();
}
function wireOnboard(){
  $('#ob-city-search').addEventListener('input', e => renderObCities(e.target.value));
  $('#ob-city-list').addEventListener('click', e => {
    const row = e.target.closest('[data-city]');
    if(!row) return;
    const c = row.getAttribute('data-city');
    const i = state.ob.cities.indexOf(c);
    if(i >= 0) state.ob.cities.splice(i,1); else state.ob.cities.push(c);
    row.classList.toggle('on', i < 0);
    obStep1Count();
  });
  $('#ob-locate').addEventListener('click', async () => {
    const btn = $('#ob-locate');
    if(!navigator.geolocation){ toast('Location not available on this device.'); return; }
    btn.disabled = true;
    const label = btn.querySelector('span');
    const orig = label.textContent;
    label.textContent = 'Locating…';
    try{
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout:8000}));
      const r = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + pos.coords.latitude +
        '&longitude=' + pos.coords.longitude + '&localityLanguage=en');
      const j = await r.json();
      const cityName = (j.city || j.locality || '').toLowerCase();
      const match = state.meta.cities.find(c => cityName.includes(c.toLowerCase()) || c.toLowerCase().includes(cityName));
      if(match){
        if(!state.ob.cities.includes(match)) state.ob.cities.push(match);
        renderObCities($('#ob-city-search').value); obStep1Count();
        toast('Found you in ' + match);
        const cont = $('#ob-next-1');
        if(cont) cont.scrollIntoView({behavior:'smooth', block:'center'});
      } else toast('Could not match your city — pick from the list.');
    }catch(e){ toast('Could not detect location.'); }
    label.textContent = orig; btn.disabled = false;
  });
  $('#ob-next-1').addEventListener('click', () => setObStep(2));
  $('#ob-back-2').addEventListener('click', () => setObStep(1, true));
  $('#ob-next-2').addEventListener('click', finishOnboarding);
  $('#ob-back-3').addEventListener('click', () => setObStep(2, true));
  $('#ob-skip-3').addEventListener('click', () => finishOnboarding());
  $('#ob-next-3').addEventListener('click', finishOnboarding);
  $('#ob-cat-grid').addEventListener('click', e => {
    const tile = e.target.closest('[data-cat]');
    if(!tile) return;
    const k = tile.getAttribute('data-cat');
    const i = state.ob.cats.indexOf(k);
    if(i >= 0) state.ob.cats.splice(i,1); else state.ob.cats.push(k);
    tile.classList.toggle('on', i < 0);
    obStep2Count();
  });
  $('#ob-prof-search').addEventListener('input', e => renderObProfs(e.target.value));
  $('#ob-prof-list').addEventListener('click', e => {
    const row = e.target.closest('[data-prof]');
    if(!row) return;
    const k = row.getAttribute('data-prof');
    state.ob.prof = (state.ob.prof === k) ? null : k;
    renderObProfs($('#ob-prof-search').value);
  });
  $('#btn-skip').addEventListener('click', () => {
    state.ob.cities = []; state.ob.cats = []; state.ob.prof = null;
    finishOnboarding();
  });
  wireInstall();
}

/* ---------- filtering + ranking ---------- */
function filteredEvents(){
  let list = state.events.filter(ev => {
    if(state.saved.includes(ev.id)) return false;
    if(state.cities.length && !state.cities.includes(ev.city)) return false;
    if(state.interests.length && !state.interests.includes(ev.category)) return false;
    return true;
  });
  return list;
}
function rankedEvents(){
  const boost = new Set(state.domains);
  return filteredEvents().map(ev => {
    let score = 0;
    if(boost.size && (ev.domains||[]).some(d => boost.has(d))) score += 2;
    if(state.interests.includes(ev.category)) score += 1;
    return {ev, score};
  }).sort((a,b) => (b.score - a.score) || (a.ev.date_start||'zzzz').localeCompare(b.ev.date_start||'zzzz'))
    .map(x => x.ev);
}

/* ---------- AHA moment ---------- */
let ahaToken = 0;
async function runAha(){
  const my = ++ahaToken;
  const stage = $('#aha-cards'), sentence = $('#aha-sentence'),
        countEl = $('#aha-count'), go = $('#aha-go'), replay = $('#aha-replay');
  stage.innerHTML = ''; sentence.classList.remove('show'); countEl.classList.remove('show');
  go.classList.add('hidden'); go.classList.remove('show');
  replay.classList.add('hidden'); replay.classList.remove('show');
  const evs = rankedEvents();
  const n = evs.length;
  const catNames = state.interests.map(catLabel);
  const cityNames = state.cities.length ? state.cities : ['Everywhere'];
  const place = state.cities.length ? 'in ' + cityNames.join(', ') : 'across Saudi Arabia';
  const what = catNames.length ? '<strong>' + esc(catNames.join(' · ')) + '</strong>' : '<strong>Everything</strong>';
  sentence.innerHTML = what + ' — ' + esc(place);
  sentence.classList.add('show');
  if(reduceMotion()){ countEl.innerHTML = '<span class="n">' + n + '</span> events this week'; countEl.classList.add('show'); go.classList.remove('hidden'); go.classList.add('show'); return; }
  await wait(380); if(my !== ahaToken) return;
  countEl.classList.add('show');
  const dur = 650, t0 = performance.now();
  await new Promise(res => {
    (function tick(t){
      if(my !== ahaToken) return res();
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1-p, 3);
      countEl.innerHTML = '<span class="n">' + Math.round(n*e) + '</span> events this week';
      if(p < 1) requestAnimationFrame(tick); else res();
    })(t0);
  });
  if(my !== ahaToken) return;
  // photo cards first so the intro stack looks its best; designed art sits behind every card
  const withImg = evs.filter(ev => ev.image);
  const cards = withImg.concat(evs.filter(ev => !ev.image)).slice(0,3);
  cards.forEach((ev, i) => {
    const d = document.createElement('div');
    d.className = 'aha-card'; d.style.zIndex = 10 - i;
    const imgUrl = previewURL(ev);
    d.innerHTML = catArtHTML(ev.category) +
      '<div class="aha-photo" style="background-image:url(\'' + imgUrl.replace(/'/g,'') + '\')"></div>' +
      '<div class="aha-card-info"><div class="t">' + esc(ev.title) + '</div>' +
      '<div class="s">' + esc(niceDate(ev)) + ' · ' + esc(ev.city||'') + '</div></div>';
    stage.appendChild(d);
    const img = new Image();
    img.onerror = () => { const p = d.querySelector('.aha-photo'); if(p) p.remove(); };
    img.src = imgUrl;
  });
  const nodes = Array.from(stage.children);
  for(let i=0; i<nodes.length; i++){
    if(my !== ahaToken) return;
    nodes[nodes.length-1-i].animate(
      [{opacity:0, transform:'translateY(70px) scale(.96)'}, {opacity:1, transform:'translateY(0) scale(1)'}],
      {duration:420, easing:'cubic-bezier(.32,.72,0,1)', fill:'forwards'});
    await wait(90);
  }
  await wait(420); if(my !== ahaToken) return;
  // fan into a mini deck
  const fan = [[0,0,0,1],[-16,-8,-7,.96],[16,-8,7,.96]];
  nodes.forEach((el, i) => {
    const f = fan[Math.min(i, fan.length-1)];
    el.animate([{transform:'translate(0,0) rotate(0) scale(1)'},
      {transform:'translate(' + f[0] + 'px,' + f[1] + 'px) rotate(' + f[2] + 'deg) scale(' + f[3] + ')'}],
      {duration:380, easing:'cubic-bezier(.32,.72,0,1)', fill:'forwards'});
  });
  await wait(460); if(my !== ahaToken) return;
  // top card lifts and settles
  const top = nodes[nodes.length-1];
  await top.animate([
    {transform:'translate(0,0) rotate(0) scale(1)'},
    {transform:'translate(0,-12px) rotate(4deg) scale(1.02)', offset:.45},
    {transform:'translate(0,0) rotate(0) scale(1)'}
  ], {duration:560, easing:'cubic-bezier(.32,.72,0,1)', fill:'forwards'}).finished.catch(()=>{});
  if(my !== ahaToken) return;
  go.classList.remove('hidden'); go.classList.add('show');
  replay.classList.remove('hidden'); replay.classList.add('show');
  await wait(900); if(my !== ahaToken) return;
  enterDeck(false, true);
}
function wireAha(){
  $('#aha-go').addEventListener('click', () => { ahaToken++; enterDeck(false, true); });
  $('#aha-replay').addEventListener('click', () => runAha());
}

/* ---------- deck ---------- */
function topCard(){ return $('.swipe-card.top'); }
function deckList(){ return state.stack; }

function buildDeck(){
  state.stack = rankedEvents();
  state.undo = null;
  renderStack();
  updateSavedBadge();
  const prog = $('#deck-progress');
  prog.textContent = state.stack.length ? '1 of ' + state.stack.length : '';
  $('#deck-empty').classList.toggle('hidden', state.stack.length > 0);
  hideUndo();
}
function updateSavedBadge(){
  const b = $('#saved-count');
  b.textContent = state.saved.length;
  b.style.display = state.saved.length ? 'flex' : 'none';
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
}
function renderStack(){
  const wrap = $('#card-stack');
  wrap.innerHTML = '';
  const vis = state.stack.slice(0, 3);
  vis.forEach((ev, depth) => wrap.appendChild(cardEl(ev, depth)));
  const top = $('.swipe-card.top', wrap);
  if(top) attachDrag(top);
}
function cardEl(ev, depth){
  const el = document.createElement('div');
  el.className = 'swipe-card' + (depth === 0 ? ' top' : '');
  el.dataset.id = ev.id;
  const s = depth === 0 ? 1 : depth === 1 ? 0.94 : 0.88;
  const y = depth * 14;
  el.style.transform = 'translateY(' + y + 'px) scale(' + s + ')';
  el.style.zIndex = 10 - depth;
  el.style.opacity = depth >= 3 ? 0 : 1;
  const imgUrl = previewURL(ev);
  el.innerHTML =
    '<div class="card-img" style="background-image:url(\'' + imgUrl.replace(/'/g,'') + '\')"></div>' +
    '<div class="card-date-pill">' + esc(niceDate(ev)).toUpperCase() + '</div>' +
    '<button class="card-bookmark' + (state.saved.includes(ev.id) ? ' saved' : '') + '" aria-label="Save">' +
    '<svg viewBox="0 0 24 24" width="19" height="19" fill="' + (state.saved.includes(ev.id) ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>' +
    '<div class="card-panel"><h3>' + esc(ev.title) + '</h3>' +
    '<div class="venue">' + esc(ev.venue || ev.city || '') + (ev.city && ev.venue ? ' · ' + esc(ev.city) : '') + '</div>' +
    '<div class="price">' + esc(fmtPrice(ev)) + '</div></div>' +
    '<div class="stamp save">SAVE</div><div class="stamp pass">PASS</div>';
  const imgDiv = $('.card-img', el);
  const probe = new Image();
  probe.onerror = () => {
    imgDiv.style.backgroundImage = 'none';
    imgDiv.classList.add('fallback');
    imgDiv.innerHTML = catArtHTML(ev.category);
    // backend retries blocked hosts every 10 min; re-check once after 11 min
    imgDiv.dataset.retryUrl = imgUrl;
    setTimeout(() => {
      if(!imgDiv.isConnected || !imgDiv.classList.contains('fallback')) return;
      const rp = new Image();
      rp.onload = () => {
        if(!imgDiv.isConnected) return;
        imgDiv.classList.remove('fallback');
        imgDiv.innerHTML = '';
        imgDiv.style.backgroundImage = 'url("' + imgUrl.replace(/"/g,'') + '")';
      };
      rp.src = imgUrl + (imgUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    }, 11 * 60 * 1000);
  };
  probe.src = imgUrl;
  $('.card-bookmark', el).addEventListener('click', e => {
    e.stopPropagation();
    toggleSave(ev.id);
    const b = e.currentTarget;
    const on = state.saved.includes(ev.id);
    b.classList.toggle('saved', on);
    b.querySelector('svg').setAttribute('fill', on ? 'currentColor' : 'none');
  });
  el.addEventListener('click', e => {
    if(e.target.closest('.card-bookmark') || el.dataset.moved) return;
    openDetail(ev, 'deck');
  });
  return el;
}
function attachDrag(el){
  let sx=0, sy=0, dx=0, dy=0, dragging=false, pid=null;
  const zone = $('#deck-zone');
  el.addEventListener('pointerdown', e => {
    if(!el.classList.contains('top')) return;
    dragging = true; pid = e.pointerId; sx = e.clientX; sy = e.clientY;
    el.classList.add('dragging'); el.setPointerCapture(pid);
  });
  el.addEventListener('pointermove', e => {
    if(!dragging || e.pointerId !== pid) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if(Math.abs(dx) + Math.abs(dy) > 6) el.dataset.moved = '1';
    const rot = dx / 14;
    el.style.transform = 'translate(' + dx + 'px,' + (dy*0.6) + 'px) rotate(' + rot + 'deg)';
    const sS = $('.stamp.save', el), sP = $('.stamp.pass', el);
    sS.style.opacity = Math.min(1, Math.max(0, dx/90));
    sP.style.opacity = Math.min(1, Math.max(0, -dx/90));
  });
  const end = e => {
    if(!dragging || e.pointerId !== pid) return;
    dragging = false;
    el.classList.remove('dragging');
    if(Math.abs(dx) > 110){ decide(dx > 0 ? 'save' : 'pass'); }
    else {
      el.style.transition = 'transform .34s cubic-bezier(.32,.72,0,1)';
      el.style.transform = 'translateY(0px) scale(1)';
      $('.stamp.save', el).style.opacity = 0;
      $('.stamp.pass', el).style.opacity = 0;
      setTimeout(() => { el.style.transition=''; delete el.dataset.moved; }, 360);
    }
    dx = dy = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
function flyOut(el, dir, done){
  const dist = Math.max(window.innerWidth, window.innerHeight);
  const anim = el.animate([
    {transform: getComputedStyle(el).transform},
    {transform: 'translate(' + (dir*dist) + 'px,-60px) rotate(' + (dir*24) + 'deg)', opacity:.9}
  ], {duration: reduceMotion() ? 1 : 340, easing:'cubic-bezier(.32,.72,0,1)', fill:'forwards'});
  const fin = () => { if(done){ const d = done; done = null; d(); } };
  if(anim.finished && typeof anim.finished.then === 'function') anim.finished.then(fin, fin);
  else anim.onfinish = fin;
}
function flySaveDot(fromRect){
  if(reduceMotion()) return;
  const target = $('#btn-saved').getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = (fromRect.left + fromRect.width/2 - 9) + 'px';
  dot.style.top = (fromRect.top + fromRect.height/2 - 9) + 'px';
  document.body.appendChild(dot);
  dot.animate([
    {transform:'translate(0,0) scale(1)', opacity:1},
    {transform:'translate(' + (target.left + target.width/2 - (fromRect.left + fromRect.width/2)) + 'px,' +
      (target.top + target.height/2 - (fromRect.top + fromRect.height/2)) + 'px) scale(.35)', opacity:.6}
  ], {duration:520, easing:'cubic-bezier(.32,.72,0,1)'}).onfinish = () => dot.remove();
}
function decide(action){
  const el = topCard();
  if(!el) return;
  const id = el.dataset.id;
  const ev = state.stack.find(e => e.id === id);
  if(!ev) return;
  const rect = el.getBoundingClientRect();
  flyOut(el, action === 'save' ? 1 : -1, () => {
    state.stack = state.stack.filter(e => e.id !== id);
    if(action === 'save' && !state.saved.includes(id)){
      state.saved.unshift(id); saveSaved(); updateSavedBadge();
      beacon('save', {id});
      flySaveDot(rect);
    }
    beacon('swipe', {id, action});
    showUndo(ev, action);
    renderStack();
    const prog = $('#deck-progress');
    prog.textContent = state.stack.length ? '1 of ' + state.stack.length : '';
    $('#deck-empty').classList.toggle('hidden', state.stack.length > 0);
  });
}
let undoTimer = null, undoTick = null;
function showUndo(ev, action){
  clearTimeout(undoTimer); clearInterval(undoTick);
  state.undo = {ev, action, left: 7};
  const pill = $('#btn-undo');
  pill.classList.remove('hidden');
  const paint = () => { pill.querySelector('span').textContent = 'Undo · ' + state.undo.left + 's'; };
  paint();
  undoTick = setInterval(() => {
    if(!state.undo) return;
    state.undo.left--;
    if(state.undo.left <= 0){ expireUndo(); } else paint();
  }, 1000);
  undoTimer = setTimeout(expireUndo, 7100);
}
function hideUndo(){
  clearTimeout(undoTimer); clearInterval(undoTick);
  state.undo = null;
  $('#btn-undo').classList.add('hidden');
}
function expireUndo(){
  // countdown elapsed: the save/pass decision stands; just dismiss the pill
  hideUndo();
}
function undo(){
  if(!state.undo) return;
  const {ev, action} = state.undo;
  if(action === 'save'){
    state.saved = state.saved.filter(id => id !== ev.id);
    saveSaved(); updateSavedBadge();
    if(state.remind[ev.id]) toggleRemind(ev.id, false);
  }
  state.stack.unshift(ev);
  hideUndo();
  renderStack();
  const prog = $('#deck-progress');
  prog.textContent = state.stack.length ? '1 of ' + state.stack.length : '';
  toast('Back in your deck');
  beacon('undo', {id: ev.id});
}
function toggleSave(id){
  const i = state.saved.indexOf(id);
  if(i >= 0){ state.saved.splice(i,1); if(state.remind[id]) toggleRemind(id, false); }
  else state.saved.unshift(id);
  saveSaved(); updateSavedBadge();
  beacon(i >= 0 ? 'unsave' : 'save', {id});
}
function wireDeck(){
  $('#btn-like').addEventListener('click', () => decide('save'));
  $('#btn-pass').addEventListener('click', () => decide('pass'));
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-saved').addEventListener('click', () => { buildSaved(); navTo('view-saved', 'fwd'); });
  $('#btn-map').addEventListener('click', () => openMap());
  $('#btn-prefs').addEventListener('click', () => { initOnboard(); navTo('view-onboard', 'back'); });
  $('#btn-rebuild').addEventListener('click', () => { initOnboard(); navTo('view-onboard', 'back'); });
  $('#deck-browse-all').addEventListener('click', () => { buildList(); navTo('view-list', 'fwd'); });
  document.addEventListener('keydown', e => {
    if(!$('#view-deck').classList.contains('active') || state.sheetOpen) return;
    if(e.key === 'ArrowRight') decide('save');
    else if(e.key === 'ArrowLeft') decide('pass');
    else if(e.key === 'ArrowUp'){ const t = topCard(); if(t) openDetail(state.stack.find(x=>x.id===t.dataset.id), 'deck'); }
  });
}

/* ---------- detail sheet ---------- */
function openDetail(ev, from, fromHist){
  state.detail = ev; state.detailFrom = from || 'deck'; state.sheetOpen = true;
  if(!fromHist) _pushHist({kind:'detail', evId: ev.id, from: state.detailFrom});
  buildSheetBody(ev);
  const sheet = $('#detail-sheet');
  sheet.classList.remove('hidden', 'closing');
  if(!reduceMotion()){ void sheet.offsetWidth; }
  $('#sheet-backdrop').classList.remove('hidden');
  const back = $('#sheet-back');
  if(state.detailFrom === 'map'){ back.classList.remove('hidden'); back.querySelector('span').textContent = 'Map'; }
  else if(state.detailFrom === 'list'){ back.classList.remove('hidden'); back.querySelector('span').textContent = 'All events'; }
  else if(state.detailFrom === 'saved'){ back.classList.remove('hidden'); back.querySelector('span').textContent = 'Saved'; }
  else back.classList.add('hidden');
  document.body.style.overflow = 'hidden';
  beacon('detail', {id: ev.id, from: state.detailFrom});
}
function closeDetail(animate){
  const sheet = $('#detail-sheet');
  const done = () => {
    sheet.classList.add('hidden');
    $('#sheet-backdrop').classList.add('hidden');
    state.sheetOpen = false; state.detail = null;
    document.body.style.overflow = '';
    if(state.detailFrom === 'map') openMap(true);
  };
  if(animate === false || reduceMotion()){ done(); return; }
  sheet.classList.add('closing');
  setTimeout(done, 240);
}
function buildSheetBody(ev){
  const body = $('#sheet-body');
  const imgUrl = previewURL(ev);
  const mapsQ = encodeURIComponent((ev.venue ? ev.venue + ', ' : '') + (ev.city || 'Saudi Arabia'));
  const isSaved = state.saved.includes(ev.id);
  const reminded = !!state.remind[ev.id];
  const desc = (ev.description || '').trim();
  body.innerHTML =
    '<div class="sheet-hero" id="sheet-hero">' +
      '<div class="hero-scrim"></div>' +
      '<div class="sheet-meta-pills" style="position:absolute;top:56px;left:22px;right:22px;padding:0">' +
        '<span class="meta-pill">' + esc(niceDate(ev)) + '</span>' +
        (ev.city ? '<span class="meta-pill">' + esc(ev.city) + '</span>' : '') +
      '</div>' +
      '<h2 class="sheet-title">' + esc(ev.title) + '</h2>' +
    '</div>' +
    '<div class="sheet-content">' +
      '<div class="detail-row">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>' +
        '<div><div class="k">Date</div><div class="v">' + esc(niceDate(ev)) + (ev.date_end && ev.date_end.slice(0,10) !== dstr(ev) ? ' — ' + esc(new Date(ev.date_end).toLocaleDateString('en-US',{month:'short',day:'numeric'})) : '') + '</div></div>' +
      '</div>' +
      '<div class="detail-row">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>' +
        '<div><div class="k">Venue</div><div class="v">' + esc(ev.venue || 'Venue TBA') + (ev.city ? ' · ' + esc(ev.city) : '') + '</div>' +
        '<a class="maps-link" href="https://www.google.com/maps/search/?api=1&query=' + mapsQ + '" target="_blank" rel="noopener">Open in Maps</a></div>' +
      '</div>' +
      '<div class="detail-row">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3 2 2.5 5 3 5 1 5 3-2.2 3-5 3-5-1-5-3"/></svg>' +
        '<div><div class="k">Price</div><div class="v" style="color:var(--gold);font-weight:600">' + esc(fmtPrice(ev)) + '</div></div>' +
      '</div>' +
      (desc ? '<p class="sheet-desc">' + esc(desc) + '</p>' : '') +
      ((ev.reg_url || ev.source_url || ev.url) ? '<a class="btn-register" href="' + esc(ev.reg_url || ev.source_url || ev.url) + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>' +
        (ev.reg_url ? 'Register / Event page' : 'Event page') + '</a>' : '') +
      '<div style="display:flex;gap:10px;margin:6px 0 4px">' +
        '<button class="btn-register" id="sheet-save-btn" style="margin:0;flex:1;width:auto">' + (isSaved ? 'Saved ✓' : 'Save this event') + '</button>' +
        '<button class="btn-register" id="sheet-remind-btn" style="margin:0;flex:1;width:auto;display:flex;align-items:center;justify-content:center;gap:8px" aria-label="Remind me">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="' + (reminded ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:' + (reminded ? 'var(--gold)' : 'inherit') + ';flex:0 0 auto"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>' +
          '<span style="font-size:14px;white-space:nowrap">' + (reminded ? 'Reminder on' : 'Remind me') + '</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="sheet-bottombar">' +
      '<button class="btn-gold" id="sheet-ics">Add to Calendar</button>' +
      '<button class="share-fab" id="sheet-share" aria-label="Share">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>' +
      '</button>' +
    '</div>';
  const hero = $('#sheet-hero', body);
  hero.style.backgroundImage = 'url("' + imgUrl.replace(/"/g,'') + '")';
  const probe = new Image();
  probe.onerror = () => { hero.classList.add('fallback'); hero.style.backgroundImage='none'; hero.insertAdjacentHTML('afterbegin', catArtHTML(ev.category)); };
  probe.src = imgUrl;
  $('#sheet-save-btn', body).addEventListener('click', () => {
    toggleSave(ev.id);
    const on = state.saved.includes(ev.id);
    $('#sheet-save-btn', body).textContent = on ? 'Saved ✓' : 'Save this event';
    toast(on ? 'Saved' : 'Removed from saved');
  });
  $('#sheet-remind-btn', body).addEventListener('click', () => toggleRemind(ev.id, !state.remind[ev.id]));
  $('#sheet-ics', body).addEventListener('click', () => downloadICS(ev));
  $('#sheet-share', body).addEventListener('click', () => shareEvent(ev));
  body.scrollTop = 0;
}
function wireSheet(){
  // close controls go through browser history so popstate owns the close path
  $('#sheet-close').addEventListener('click', () => history.back());
  $('#sheet-backdrop').addEventListener('click', () => history.back());
  $('#sheet-back').addEventListener('click', () => history.back());
  let startY = null;
  const sheet = $('#detail-sheet');
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, {passive:true});
  sheet.addEventListener('touchmove', e => {
    if(startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if(dy > 0 && $('#sheet-body').scrollTop <= 0) sheet.style.transform = 'translateY(' + Math.min(dy, 160) + 'px)';
  }, {passive:true});
  sheet.addEventListener('touchend', e => {
    if(startY === null) return;
    const dy = (e.changedTouches[0]||{}).clientY - startY;
    startY = null; sheet.style.transform = '';
    if(dy > 110) history.back();
  });
}
function downloadICS(ev){
  const dt = s => { const d = new Date(s); return isNaN(d) ? null :
    d.getUTCFullYear() + String(d.getUTCMonth()+1).padStart(2,'0') + String(d.getUTCDate()).padStart(2,'0') + 'T' +
    String(d.getUTCHours()).padStart(2,'0') + String(d.getUTCMinutes()).padStart(2,'0') + '00Z'; };
  const ds = dt(ev.date_start), de = dt(ev.date_end) || ds;
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ThisWeekSaudi//EN','BEGIN:VEVENT',
    'UID:' + ev.id + '@thisweeksaudi',
    'DTSTAMP:' + dt(new Date().toISOString()),
    ds ? 'DTSTART:' + ds : null, de ? 'DTEND:' + de : null,
    'SUMMARY:' + String(ev.title||'').replace(/[,;]/g,' '),
    'LOCATION:' + String((ev.venue||'') + ', ' + (ev.city||'')).replace(/[,;]/g,' '),
    'DESCRIPTION:' + String(ev.reg_url || ev.source_url || ev.url || '').replace(/[,;]/g,' '),
    'END:VEVENT','END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], {type:'text/calendar'}));
  a.download = 'event-' + ev.id + '.ics';
  document.body.appendChild(a); a.click(); a.remove();
  beacon('ics', {id: ev.id});
  toast('Calendar file downloaded');
}
async function shareEvent(ev){
  const url = location.origin + location.pathname + '#e=' + ev.id;
  const data = {title: ev.title, text: ev.title + ' — ' + niceDate(ev), url};
  if(navigator.share){
    try{ await navigator.share(data); beacon('share', {id: ev.id, via:'native'}); }catch(e){}
  } else {
    try{ await navigator.clipboard.writeText(url); toast('Link copied to clipboard'); beacon('share', {id: ev.id, via:'copy'}); }
    catch(e){ toast('Copy this link: ' + url); }
  }
}

/* ---------- all events list ---------- */
function buildList(){
  buildListFilters();
  renderRails();
  renderRecent();
  renderList();
}
function buildListFilters(){
  const dates = [
    {k:'', label:'All dates'}, {k:'today', label:'Today'}, {k:'weekend', label:'This weekend'},
    {k:'week', label:'This week'}, {k:'month', label:'This month'}
  ];
  $('#date-chips').innerHTML = dates.map(d =>
    '<button class="chip sm' + (state.fDate===d.k?' on':'') + '" data-fdate="' + d.k + '">' + d.label + '</button>').join('');
  $('#domain-chips-list').innerHTML = '<button class="chip sm' + (!state.fDom?' on':'') + '" data-fdom="">All topics</button>' +
    state.meta.domains.map(d =>
      '<button class="chip sm' + (state.fDom===d.key?' on':'') + '" data-fdom="' + esc(d.key) + '">' + esc(d.label.split(' &')[0]) + '</button>').join('');
  $('#city-chips-list').innerHTML = '<button class="chip sm' + (!state.fCity?' on':'') + '" data-fcity="">All cities</button>' +
    state.meta.cities.map(c =>
      '<button class="chip sm' + (state.fCity===c?' on':'') + '" data-fcity="' + esc(c) + '">' + esc(c) + '</button>').join('');
}
function renderRails(){
  const rails = $('#rails');
  const now = new Date();
  const upcoming = state.events.filter(e => !state.saved.includes(e.id) && e.date_start && new Date(e.date_start) >= now)
    .sort((a,b)=>a.date_start.localeCompare(b.date_start));
  const cheap = state.events.filter(e => !state.saved.includes(e.id) && (e.is_free || (e.price_min!=null && Number(e.price_min) <= 50)))
    .sort((a,b)=>(a.date_start||'zzzz').localeCompare(b.date_start||'zzzz'));
  const mk = (title, list) => list.length ?
    '<div class="rail"><div class="rail-title">' + esc(title) + '</div><div class="rail-track">' +
    list.slice(0,10).map((ev,i) =>
      '<button class="rail-card" data-rail="' + ev.id + '">' +
      '<div class="rail-thumb" data-thumb="' + ev.id + '">' + esc(initials(ev.title)) + '</div>' +
      '<div class="rail-info"><div class="rail-t">' + esc(ev.title) + '</div>' +
      '<div class="rail-s">' + esc(niceDate(ev)) + ' · ' + esc(ev.city||'') + '</div></div></button>').join('') +
    '</div></div>' : '';
  rails.innerHTML = mk('Happening soon', upcoming) + mk('Free & under SAR 50', cheap);
  $$('.rail-card', rails).forEach(c => c.addEventListener('click', () => {
    const ev = state.events.find(e => e.id === c.getAttribute('data-rail'));
    if(ev) openDetail(ev, 'list');
  }));
  $$('[data-thumb]', rails).forEach(t => {
    const ev = state.events.find(e => e.id === t.getAttribute('data-thumb'));
    if(!ev) return;
    const img = new Image();
    img.onload = () => { t.style.backgroundImage = 'url("' + previewURL(ev).replace(/"/g,'') + '")'; t.textContent=''; };
    img.src = previewURL(ev);
  });
}
function matchesList(ev){
  if(state.fCity && ev.city !== state.fCity) return false;
  if(state.fDom && !(ev.domains||[]).includes(state.fDom)) return false;
  if(state.fDate){
    const ds = dstr(ev), now = new Date();
    const iso = d => d.toISOString().slice(0,10);
    if(state.fDate === 'today' && ds !== iso(now)) return false;
    if(state.fDate === 'week'){
      const end = new Date(now); end.setDate(end.getDate()+7);
      if(!ds || ds < iso(now) || ds > iso(end)) return false;
    }
    if(state.fDate === 'month'){
      const end = new Date(now); end.setDate(end.getDate()+30);
      if(!ds || ds < iso(now) || ds > iso(end)) return false;
    }
    if(state.fDate === 'weekend'){
      const sat = new Date(now), sun = new Date(now);
      sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7));
      sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7));
      if(!ds || ds < iso(sat) || ds > iso(sun)) return false;
    }
  }
  if(state.fQ){
    const q = state.fQ.toLowerCase();
    const hay = (ev.title + ' ' + (ev.venue||'') + ' ' + (ev.city||'') + ' ' + (ev.description||'')).toLowerCase();
    if(!hay.includes(q)) return false;
  }
  return true;
}
function hi(text, q){
  if(!q) return esc(text);
  const i = String(text).toLowerCase().indexOf(q.toLowerCase());
  if(i < 0) return esc(text);
  return esc(String(text).slice(0,i)) + '<mark>' + esc(String(text).slice(i, i+q.length)) + '</mark>' + esc(String(text).slice(i+q.length));
}
function renderList(){
  const list = state.events.filter(matchesList);
  if(state.sort === 'date') list.sort((a,b)=>(a.date_start||'zzzz').localeCompare(b.date_start||'zzzz'));
  else if(state.sort === 'price') list.sort((a,b)=>(a.is_free?0:Number(a.price_min)||1e9)-(b.is_free?0:Number(b.price_min)||1e9));
  else if(state.sort === 'nearest' && state._geo) list.sort((a,b)=>dist(a)-dist(b));
  $('#list-count').textContent = list.length + ' event' + (list.length===1?'':'s');
  const box = $('#event-list');
  if(!list.length){ box.innerHTML = '<div class="ev-empty">No events match.<br>Try widening your filters.</div>'; return; }
  let lastSec = '';
  box.innerHTML = list.map((ev, i) => {
    const sec = state.sort === 'date' && ev.date_start
      ? new Date(ev.date_start).toLocaleDateString('en-US',{month:'long', year:'numeric'}) : '';
    const secHtml = (sec && sec !== lastSec) ? '<div class="ev-sec">' + esc(sec) + '</div>' : '';
    lastSec = sec || lastSec;
    return secHtml + eventRow(ev, i, 'list');
  }).join('');
  wireRows(box, 'list');
}
function dist(ev){
  if(!state._geo || !ev._lat) return 1e9;
  const R=6371, dLa=(ev._lat-state._geo.lat)*Math.PI/180, dLo=(ev._lon-state._geo.lon)*Math.PI/180;
  const a=Math.sin(dLa/2)**2 + Math.cos(state._geo.lat*Math.PI/180)*Math.cos(ev._lat*Math.PI/180)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function eventRow(ev, i, from){
  return '<div class="ev-row" data-row="' + ev.id + '" data-from="' + from + '" style="--i:' + Math.min(i,12) + '">' +
    '<div class="ev-thumb" data-ethumb="' + ev.id + '">' + esc(initials(ev.title)) + '</div>' +
    '<div class="ev-info"><div class="ev-title">' + hi(ev.title, state.fQ) + '</div>' +
    '<div class="ev-sub">' + esc(niceDate(ev)) + ' · ' + esc(ev.city||'') + ' · ' + esc(fmtPrice(ev)) + '</div></div>' +
    '<div class="row-chev">›</div></div>';
}
function wireRows(box, from){
  $$('.ev-row', box).forEach(r => r.addEventListener('click', () => {
    const ev = state.events.find(e => e.id === r.getAttribute('data-row'));
    if(ev) openDetail(ev, r.getAttribute('data-from') || from);
  }));
  $$('[data-ethumb]', box).forEach(t => {
    const ev = state.events.find(e => e.id === t.getAttribute('data-ethumb'));
    if(!ev) return;
    const img = new Image();
    img.onload = () => { t.style.backgroundImage = 'url("' + previewURL(ev).replace(/"/g,'') + '")'; t.textContent=''; };
    img.src = previewURL(ev);
  });
}
function renderRecent(){
  const box = $('#recent-searches');
  if(!state.recent.length){ box.classList.add('hidden'); box.innerHTML=''; return; }
  box.classList.remove('hidden');
  box.innerHTML = '<span class="row-label">Recent</span>' + state.recent.slice(0,6).map(q =>
    '<button class="chip sm" data-recent="' + esc(q) + '">' + esc(q) + '</button>').join('');
  $$('[data-recent]', box).forEach(b => b.addEventListener('click', () => {
    $('#list-search').value = b.getAttribute('data-recent');
    state.fQ = b.getAttribute('data-recent');
    renderList();
  }));
}
let listSearchT = null;
function wireList(){
  $('#btn-list-back').addEventListener('click', () => history.back());
  $('#list-search').addEventListener('input', e => {
    clearTimeout(listSearchT);
    listSearchT = setTimeout(() => {
      const q = e.target.value.trim();
      if(q && !state.recent.includes(q)){ state.recent.unshift(q); state.recent = state.recent.slice(0,8); saveRecent(); renderRecent(); }
      state.fQ = q;
      renderList();
    }, 220);
  });
  $('#date-chips').addEventListener('click', e => {
    const c = e.target.closest('[data-fdate]'); if(!c) return;
    state.fDate = c.getAttribute('data-fdate');
    $$('#date-chips .chip').forEach(x => x.classList.toggle('on', x === c));
    renderList();
  });
  $('#domain-chips-list').addEventListener('click', e => {
    const c = e.target.closest('[data-fdom]'); if(!c) return;
    state.fDom = c.getAttribute('data-fdom');
    $$('#domain-chips-list .chip').forEach(x => x.classList.toggle('on', x === c));
    renderList();
  });
  $('#city-chips-list').addEventListener('click', e => {
    const c = e.target.closest('[data-fcity]'); if(!c) return;
    state.fCity = c.getAttribute('data-fcity');
    $$('#city-chips-list .chip').forEach(x => x.classList.toggle('on', x === c));
    renderList();
  });
  $('#sort-sel').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
}

/* ---------- saved ---------- */
function buildSaved(){
  renderSaved($('#saved-search').value.trim());
}
function savedRow(ev, i){
  const id = ev.id;
  const reminded = !!state.remind[id];
  const future = ev.date_start && new Date(ev.date_start) > new Date();
  return '<div class="ev-row" data-row="' + id + '" data-from="saved" style="--i:' + Math.min(i,12) + '">' +
    '<div class="ev-thumb" data-ethumb="' + id + '">' + esc(initials(ev.title)) + '</div>' +
    '<div class="ev-info"><div class="ev-title">' + esc(ev.title) + '</div>' +
    '<div class="ev-sub">' + esc(niceDate(ev)) + ' · ' + esc(ev.city||'') + ' · ' + esc(fmtPrice(ev)) + '</div></div>' +
    '<div class="ev-actions">' +
    (future ? '<button class="remind-btn' + (reminded?' on':'') + '" data-remind="' + id + '" aria-label="Remind me">' +
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="' + (reminded?'currentColor':'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg></button>' : '') +
    '<button class="ev-unsave" data-unsave="' + id + '" aria-label="Remove">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
    '</div></div>';
}
function renderSaved(q){
  const box = $('#saved-list');
  const ql = (q||'').toLowerCase();
  const list = state.saved.map(id => state.events.find(e => e.id === id)).filter(Boolean)
    .filter(ev => !ql || (ev.title + ' ' + (ev.venue||'') + ' ' + (ev.city||'')).toLowerCase().includes(ql))
    .sort((a,b)=>(a.date_start||'zzzz').localeCompare(b.date_start||'zzzz'));
  if(!list.length){
    box.innerHTML = '<div class="ev-empty">' + (ql ? 'Nothing saved matches.' : 'Nothing saved yet.<br>Swipe right or tap the heart on anything you like.') + '</div>';
    return;
  }
  box.innerHTML = list.map((ev,i) => savedRow(ev, i)).join('');
  wireRows(box, 'saved');
  $$('[data-unsave]', box).forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    const id = b.getAttribute('data-unsave');
    if(state.remind[id]) await toggleRemind(id, false);
    state.saved = state.saved.filter(x => x !== id);
    saveSaved(); updateSavedBadge(); renderSaved($('#saved-search').value.trim());
    syncPushServer();
    toast('Removed');
  }));
  $$('[data-remind]', box).forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const id = b.getAttribute('data-remind');
    toggleRemind(id, !state.remind[id]);
    renderSaved($('#saved-search').value.trim());
  }));
}
function wireSaved(){
  $('#btn-saved-back').addEventListener('click', () => history.back());
  $('#saved-search').addEventListener('input', e => renderSaved(e.target.value.trim()));
}

/* ---------- push ---------- */
function urlB64(s){
  const b = atob(s.replace(/-/g,'+').replace(/_/g,'/'));
  const a = new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) a[i] = b.charCodeAt(i);
  return a;
}
async function bootPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    const reg = await navigator.serviceWorker.register('sw.js');
    const sub = await reg.pushManager.getSubscription();
    if(sub) syncPushServer(sub);
    // re-sync remind flags for saved events
    for(const id of state.saved){ if(state.remind[id]) await toggleRemind(id, true, true); }
  }catch(e){}
}
async function syncPushServer(sub){
  try{
    if(!sub){
      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription();
    }
    if(!sub) return;
    const ids = Object.keys(state.remind).filter(id => state.remind[id] && state.saved.includes(id));
    await fetch('/api/push/subscribe', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({subscription: sub.toJSON(), event_ids: ids})});
  }catch(e){}
}
function showInstallNudge(proceed){
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-card" style="text-align:center">' +
      '<div style="margin:0 auto 12px;width:56px;height:56px;border-radius:18px;background:linear-gradient(135deg,#f5c451,#b97c1a);display:flex;align-items:center;justify-content:center">' +
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#1a1206" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>' +
      '<div style="font-weight:700;font-size:18px;margin-bottom:8px">Get reminders that actually arrive</div>' +
      '<div style="color:var(--muted);font-size:14.5px;line-height:1.5;margin-bottom:6px">' +
        (isiOS
          ? 'On iPhone, reminders only work if ThisWeekSaudi is on your Home Screen.<br><br>Tap <b>Share</b> <span style="font-size:16px">⎙</span> → <b>Add to Home Screen</b>, open the app from there, then tap Remind me again.'
          : 'Install ThisWeekSaudi on your device for reliable day-before reminders.') +
      '</div>' +
      (deferredPrompt ? '<button class="btn-gold" id="nudge-install" style="width:100%;margin:10px 0 6px">Install ThisWeekSaudi</button>' : '') +
      '<button class="btn-register" id="nudge-continue" style="width:100%;margin:6px 0">Continue anyway</button>' +
      '<button class="link-quiet" id="nudge-close">Not now</button>' +
    '</div>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  $('#nudge-close', overlay).addEventListener('click', close);
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  $('#nudge-continue', overlay).addEventListener('click', () => { close(); proceed(); });
  const instBtn = $('#nudge-install', overlay);
  if(instBtn) instBtn.addEventListener('click', async () => {
    close();
    try{ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; }catch(e){}
    toast('Open the installed app and tap Remind me again.');
  });
}
async function toggleRemind(id, on, silent){
  if(on && !state.saved.includes(id)){ state.saved.unshift(id); saveSaved(); updateSavedBadge(); }
  // nudge: on-device reminders need the app on the Home Screen — show the how-to every time
  if(on && !silent){
    try{
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      if(!isStandalone){
        showInstallNudge(() => toggleRemind(id, on, true));
        return;
      }
    }catch(e){}
  }
  try{
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(on && !sub){
      const {public_key: key} = await fetch('/api/push/vapid-public').then(r=>r.json());
      sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey: urlB64(key)});
      try{ await Notification.requestPermission(); }catch(e){}
    }
    if(!on && sub && !Object.keys(state.remind).some(k => k !== id && state.remind[k])){
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      try{ await fetch('/api/push/unsubscribe', {method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({endpoint})}); }catch(e){}
    }
    if(on){ state.remind[id] = Date.now(); }
    else delete state.remind[id];
    saveRemind();
    await syncPushServer(sub);
    if(!silent) toast(on ? 'Reminder set' : 'Reminder off');
    beacon('remind', {id, on: !!on});
  }catch(e){
    if(!silent){
      const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      toast(isiOS ? 'Add ThisWeekSaudi to your Home Screen to enable reminders, then tap the bell again.' : 'Notifications are not available in this browser.');
    }
  }
}

/* ---------- map ---------- */
let map = null, markers = null, mapState = { plotted: 0 };
function openMap(fromHist){
  if(!fromHist) _pushHist({kind:'map'});
  mapModal().classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderMapFilters();
  setTimeout(() => {
    if(!map){
      map = L.map('map', {zoomControl: false}).setView([24.6, 46.7], 6);
      L.control.zoom({position:'bottomright'}).addTo(map);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; Esri',
        maxZoom: 19
      }).addTo(map);
      markers = L.markerClusterGroup({spiderfyOnMaxZoom: true, showCoverageOnHover: false, maxClusterRadius: 48});
      map.addLayer(markers);
      // user location dot
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos => {
          const ll = [pos.coords.latitude, pos.coords.longitude];
          L.circleMarker(ll, {radius: 8, color: '#fff', weight: 2, fillColor: '#2b7fff', fillOpacity: 1}).addTo(map)
            .bindPopup('You are here');
          // if user used "detect my location", center on them
          try{
            const prefs = storeJSON('wain_prefs', {});
            if(prefs.useGeo) map.setView(ll, 11);
          }catch(e){}
        }, () => {}, {timeout: 8000, maximumAge: 600000});
      }
      // zoom to selected city if user picked one (not geo-detect)
      try{
        const prefs = storeJSON('wain_prefs', {});
        const cities = prefs.cities || [];
        if(cities.length === 1 && !prefs.useGeo){
          fetch('/api/geocode?venue=&city=' + encodeURIComponent(cities[0]))
            .then(r => r.json()).then(j => {
              if(j && j.lat != null) map.setView([j.lat, j.lng], 11);
            }).catch(()=>{});
        }
      }catch(e){}
      map.on('popupopen', e => {
        const btn = e.popup.getElement().querySelector('[data-pop]');
        if(btn) btn.addEventListener('click', () => {
          const ev = state.events.find(x => x.id === btn.getAttribute('data-pop'));
          if(ev){ closeMap(true); openDetail(ev, 'map'); }
        });
      });
    }
    map.invalidateSize();
    plotMapMarkers($('#map-search').value.trim());
  }, 60);
  beacon('map_open', {});
}
function closeMap(fromHist){
  mapModal().classList.add('hidden');
  document.body.style.overflow = '';
}
function renderMapFilters(){
  const box = $('#map-filters');
  box.innerHTML = '<button class="chip on" data-mcat="">All</button>' +
    state.meta.categories.map(c =>
      '<button class="chip' + (mapState.cat === c.key ? ' on' : '') + '" data-mcat="' + esc(c.key) + '">' + esc(c.label) + '</button>').join('');
  $$('[data-mcat]', box).forEach(b => b.addEventListener('click', () => {
    mapState.cat = b.getAttribute('data-mcat') || null;
    $$('[data-mcat]', box).forEach(x => x.classList.toggle('on', x === b));
    plotMapMarkers($('#map-search').value.trim());
  }));
}
function mapFiltered(){
  const q = $('#map-search').value.trim().toLowerCase();
  return state.events.filter(ev => {
    // respect the user's onboarding prefs (same as the deck)
    if(state.cities.length && !state.cities.includes(ev.city)) return false;
    if(state.interests.length && !state.interests.includes(ev.category)) return false;
    if(mapState.cat && ev.category !== mapState.cat) return false;
    if(q && !(ev.title + ' ' + (ev.venue||'') + ' ' + (ev.city||'')).toLowerCase().includes(q)) return false;
    return true;
  });
}
async function plotMapMarkers(){
  const status = $('#map-status');
  status.style.opacity = 1;
  status.textContent = 'Plotting events…';
  const list = mapFiltered();
  markers.clearLayers();
  let n = 0;
  const queue = list.slice();
  const workers = Array.from({length: 4}, async () => {
    while(queue.length){
      const ev = queue.shift();
      const ll = await geocode(ev);
      if(!ll) continue;
      n++;
      const usePin = ev._imgOk;
      const icon = L.divIcon({
        className: usePin ? 'ev-pin-wrap' : 'ev-dot-wrap',
        html: usePin
          ? '<div class="ev-pin" style="background-image:url(\'' + previewURL(ev).replace(/'/g,'') + '\')"></div>'
          : '<div class="ev-dot"></div>',
        iconSize: usePin ? [38,38] : [14,14],
        iconAnchor: usePin ? [19,19] : [7,7]
      });
      const popImg = ev._imgOk
        ? '<div class="map-pop-img" style="background-image:url(\'' + previewURL(ev).replace(/'/g,'') + '\')"></div>' : '';
      const m = L.marker([ll.lat, ll.lon], {icon});
      m.bindPopup('<div class="map-pop">' + popImg +
        '<div class="map-pop-title">' + esc(ev.title) + '</div>' +
        '<div class="map-pop-meta">' + esc(niceDate(ev)) + ' · ' + esc(ev.city||'') + '</div>' +
        '<div class="map-pop-actions"><button class="map-pop-open primary" data-pop="' + ev.id + '">Details</button></div></div>',
        {closeButton: true});
      markers.addLayer(m);
      if(n % 25 === 0) status.textContent = 'Plotting… ' + n;
    }
  });
  await Promise.all(workers);
  mapState.plotted = n;
  if(n && markers.getBounds().isValid()) map.fitBounds(markers.getBounds().pad(0.15));
  status.textContent = n ? n + ' events on the map' : 'No events to plot';
  setTimeout(() => { status.style.opacity = 0; }, 2200);
  beacon('map_plot', {n});
}
const geoCache = {};
async function geocode(ev){
  const key = (ev.venue || '') + '|' + (ev.city || '');
  if(geoCache[key] !== undefined) return geoCache[key];
  try{
    const r = await fetch('/api/geocode?venue=' + encodeURIComponent(ev.venue || '') + '&city=' + encodeURIComponent(ev.city || ''));
    const j = await r.json();
    const ll = (j && j.lat != null && j.lng != null) ? {lat: j.lat, lon: j.lng} : null;
    geoCache[key] = ll;
    return ll;
  }catch(e){ geoCache[key] = null; return null; }
}
function warmGeocode(){
  // background pre-warm so the map opens fast
  const list = state.events.slice(0, 400);
  let i = 0;
  const workers = Array.from({length: 4}, async () => {
    while(i < list.length){ const ev = list[i++]; await geocode(ev); }
  });
  Promise.all(workers).catch(()=>{});
  // probe preview images so map pins know whether to use photo pins
  state.events.forEach(ev => {
    const img = new Image();
    img.onload = () => { ev._imgOk = true; };
    img.src = previewURL(ev);
  });
}
let mapSearchT = null;
function wireMap(){
  $('#map-close').addEventListener('click', () => history.back());
  $('#map-search').addEventListener('input', () => {
    clearTimeout(mapSearchT);
    mapSearchT = setTimeout(() => { if(!mapModal().classList.contains('hidden')) plotMapMarkers(); }, 300);
  });
}

/* ---------- PWA install ---------- */
let deferredPrompt = null;
function wireInstall(){
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    $('#btn-install').classList.remove('hidden');
  });
  $('#btn-install').addEventListener('click', async () => {
    if(!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $('#btn-install').classList.add('hidden');
  });
}
function wirePWA(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

/* ---------- global wiring ---------- */
function wireGlobal(){
  wireAha();
  // geolocation for "nearest" sort
  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(p => {
      state._geo = {lat: p.coords.latitude, lon: p.coords.longitude};
    }, ()=>{}, {timeout: 6000});
  }
  // warm caches after first paint
  setTimeout(warmGeocode, 2500);
}

/* ---------- go ---------- */
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
