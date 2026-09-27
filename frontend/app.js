/* ThisWeekSaudi — client app. No framework, one file. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ================= i18n ================= */
const STR = {
en: {
  tagline1: 'Every event in Saudi.', tagline2: 'Yours to swipe.',
  onboardSub: 'Conferences, expos, concerts, meetups — across the Kingdom. Tell us where and what, and we\'ll build your deck.',
  where: 'Where in Saudi?', detectCity: 'Detect my city', detecting: 'Detecting…',
  cityDetected: 'City detected', cityDetectFail: 'Could not detect your city',
  interests: 'What are you into?', proField: 'Professional field',
  proFieldHint: 'For conferences & meetups — pick your profession',
  build: 'Build My Deck', skip: 'Skip — show me everything', installApp: 'Install app',
  listEvent: '+ List an event',
  pickHint: 'Pick at least one city or interest',
  matchEvents: '{n} events match your picks',
  map: 'Map', saved: 'Saved', back: 'Back', allEvents: 'All events', eventMap: 'Event map',
  deckHint: 'Swipe right to save · left to pass · tap a card for details',
  deckDone: 'Deck\'s done.', deckDoneSub: 'You\'ve been through them all. Check your saved, or widen your preferences.',
  adjustPrefs: 'Adjust preferences', undo: 'Undo',
  searchPh: 'Search events…', savedSearchPh: 'Search saved events…',
  today: 'Today', thisWeek: 'This week', thisWeekend: 'This weekend', allDates: 'All dates',
  freeOnly: 'Free', field: 'Field', cityLabel: 'City',
  sortDate: 'Sort: Date', sortPrice: 'Sort: Price', sortNearest: 'Sort: Nearest',
  tonight: 'Tonight', happeningSoon: 'Happening soon', allSaved: 'All saved',
  share: 'Share', report: 'Report wrong info', reportTitle: 'What\'s wrong?',
  reportThanks: 'Thanks — we\'ll check it.', wrongDate: 'Wrong date', wrongVenue: 'Wrong venue',
  wrongPrice: 'Wrong price', cancelled: 'Event cancelled', other: 'Other',
  reportDetailPh: 'Tell us more (optional)', send: 'Send',
  register: 'Register / Event page', addCal: 'Add to calendar', gCal: 'Google Calendar',
  gMaps: 'Open in Google Maps', venue: 'Venue', price: 'Price', organizer: 'Organizer',
  via: 'via', added: 'added',
  noResults: 'No events match', noResultsHint: 'Try clearing filters or broadening your search.',
  clearFilters: 'Clear filters', recent: 'Recent searches', linkCopied: 'Link copied',
  saveStamp: 'SAVE', passStamp: 'PASS',
  relToday: 'Today', relTomorrow: 'Tomorrow', relYesterday: 'Yesterday',
  inDays: 'in {n} days', daysAgo: '{n} days ago',
  seeDetails: 'See details', checkEventPage: 'Check the event page', checkSaved: 'Swipe right on anything you like and it will live here.',
  nothingSaved: 'Nothing saved yet.', noMatchSaved: 'No saved events match your search.',
  viewEvent: 'View event', details: 'Details', needLocation: 'Location needed for nearest sort',
  eventsCount: '{n} events', ofLabel: '{a} of {b}',
},
ar: {
  tagline1: 'كل فعاليات السعودية.', tagline2: 'مرّر واكتشف.',
  onboardSub: 'مؤتمرات ومعارض وحفلات ولقاءات في جميع أنحاء المملكة. أخبرنا بالمكان والاهتمام وسنجهز لك مجموعتك.',
  where: 'وين في السعودية؟', detectCity: 'حدّد مدينتي تلقائيًا', detecting: 'جارٍ التحديد…',
  cityDetected: 'تم تحديد مدينتك', cityDetectFail: 'تعذّر تحديد مدينتك',
  interests: 'وش اهتماماتك؟', proField: 'المجال المهني',
  proFieldHint: 'للمؤتمرات واللقاءات المهنية — اختر مجالك',
  build: 'جهّز مجموعتي', skip: 'تخطَّ — اعرض كل شيء', installApp: 'ثبّت التطبيق',
  listEvent: '+ أضف فعاليتك',
  pickHint: 'اختر مدينة أو اهتمامًا واحدًا على الأقل',
  matchEvents: '{n} فعالية تطابق اختياراتك',
  map: 'الخريطة', saved: 'المحفوظة', back: 'رجوع', allEvents: 'كل الفعاليات', eventMap: 'خريطة الفعاليات',
  deckHint: 'اسحب يمين للحفظ · يسار للتجاوز · اضغط على البطاقة للتفاصيل',
  deckDone: 'خلصت المجموعة.', deckDoneSub: 'شفتها كلها. راجع المحفوظة أو وسّع اختياراتك.',
  adjustPrefs: 'عدّل التفضيلات', undo: 'تراجع',
  searchPh: 'ابحث عن فعاليات…', savedSearchPh: 'ابحث في المحفوظة…',
  today: 'اليوم', thisWeek: 'هذا الأسبوع', thisWeekend: 'نهاية الأسبوع', allDates: 'كل التواريخ',
  freeOnly: 'مجاني', field: 'المجال', cityLabel: 'المدينة',
  sortDate: 'الترتيب: التاريخ', sortPrice: 'الترتيب: السعر', sortNearest: 'الترتيب: الأقرب',
  tonight: 'الليلة', happeningSoon: 'قريبًا', allSaved: 'كل المحفوظة',
  share: 'مشاركة', report: 'الإبلاغ عن خطأ', reportTitle: 'وش الخطأ؟',
  reportThanks: 'شكرًا، سنراجعها.', wrongDate: 'التاريخ خطأ', wrongVenue: 'المكان خطأ',
  wrongPrice: 'السعر خطأ', cancelled: 'أُلغيت الفعالية', other: 'أخرى',
  reportDetailPh: 'أخبرنا بالمزيد (اختياري)', send: 'إرسال',
  register: 'التسجيل / صفحة الفعالية', addCal: 'أضف للتقويم', gCal: 'تقويم Google',
  gMaps: 'افتح في خرائط Google', venue: 'المكان', price: 'السعر', organizer: 'المنظم',
  via: 'عبر', added: 'أُضيفت',
  noResults: 'لا توجد فعاليات مطابقة', noResultsHint: 'جرّب مسح الفلاتر أو توسيع البحث.',
  clearFilters: 'مسح الفلاتر', recent: 'عمليات بحث سابقة', linkCopied: 'تم نسخ الرابط',
  saveStamp: 'حفظ', passStamp: 'تجاوز',
  relToday: 'اليوم', relTomorrow: 'غدًا', relYesterday: 'أمس',
  inDays: 'بعد {n} أيام', daysAgo: 'قبل {n} أيام',
  seeDetails: 'شاهد التفاصيل', checkEventPage: 'راجع صفحة الفعالية', checkSaved: 'اسحب يمين على أي فعالية تعجبك وستظهر هنا.',
  nothingSaved: 'لا شيء محفوظ بعد.', noMatchSaved: 'لا توجد فعاليات محفوظة تطابق بحثك.',
  viewEvent: 'عرض الفعالية', details: 'التفاصيل', needLocation: 'نحتاج موقعك للترتيب حسب الأقرب',
  eventsCount: '{n} فعالية', ofLabel: '{a} من {b}',
}};
const CAT_AR = { conference: 'مؤتمر', expo: 'معرض', workshop: 'ورشة عمل', meetup: 'لقاء', sports: 'رياضة', arts: 'فنون وثقافة', music: 'موسيقى', food: 'طعام وشراب', concert: 'حفل', comedy: 'كوميديا', festival: 'مهرجان', other: 'المزيد' };
const CAT_LABELS = {
  conference: 'Conference', expo: 'Expo', workshop: 'Workshop', meetup: 'Meetup',
  sports: 'Sports', arts: 'Arts & Culture', music: 'Music', food: 'Food & Drink',
  concert: 'Concert', comedy: 'Comedy', festival: 'Festival', other: 'More',
};
const t = (k, n, b) => {
  let s = (STR[state.lang] && STR[state.lang][k]) ?? STR.en[k] ?? k;
  if (n !== undefined) {
    if (state.lang === 'ar' && (k === 'inDays' || k === 'daysAgo') && n === 2)
      return k === 'inDays' ? 'بعد يومين' : 'قبل يومين';
    s = s.replace('{n}', n).replace('{a}', n).replace('{b}', b ?? '');
  }
  return s;
};
const catLabel = c => state.lang === 'ar' ? (CAT_AR[c] || CAT_LABELS[c] || c) : (CAT_LABELS[c] || c);
const domLabel = key => {
  const d = (state.meta && state.meta.domains || []).find(x => x.key === key);
  if (d) return state.lang === 'ar' ? d.ar : d.en;
  return key;
};
function setLang(l, rerender = true) {
  state.lang = l === 'ar' ? 'ar' : 'en';
  localStorage.setItem('wain_lang', state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  $$('.lang-btn').forEach(b => b.textContent = state.lang === 'ar' ? 'EN' : 'عربي');
  applyI18n();
  if (rerender) rerenderAll();
}
function applyI18n() {
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
}

/* ================= state ================= */
const state = {
  all: [], meta: null, lang: 'en',
  cities: new Set(), cats: new Set(), domains: new Set(),
  deck: [], idx: 0,
  saved: {},           // id -> savedAt
  imgCache: new Map(), // url -> image|null (null = tried, none)
  geoCache: new Map(), // "venue|city" -> {lat,lng}
  map: null, mapPlotted: false,
  recent: [],          // recent search strings
  undoStack: [],
  youLoc: null,
};
try { state.saved = JSON.parse(localStorage.getItem('wain_saved') || '{}'); } catch { state.saved = {}; }
try {
  const p = JSON.parse(localStorage.getItem('wain_prefs') || '{}');
  (p.cities || []).forEach(c => state.cities.add(c));
  (p.cats || []).forEach(c => state.cats.add(c));
  (p.domains || []).forEach(d => state.domains.add(d));
} catch {}
try { state.recent = JSON.parse(localStorage.getItem('wain_recent') || '[]'); } catch { state.recent = []; }
try { state.lang = localStorage.getItem('wain_lang') || 'en'; } catch {}
const saveLocal = () => {
  localStorage.setItem('wain_saved', JSON.stringify(state.saved));
  localStorage.setItem('wain_prefs', JSON.stringify({ cities: [...state.cities], cats: [...state.cats], domains: [...state.domains] }));
  localStorage.setItem('wain_recent', JSON.stringify(state.recent.slice(0, 6)));
};
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

/* ================= helpers ================= */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayNoon = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
const todayStr = () => isoOf(todayNoon());
const fmtDate = iso => {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString(state.lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' });
};
const fmtRange = (s, e) => {
  if (!s) return '';
  if (!e || e === s) return fmtDate(s);
  const sameMonth = s.slice(0, 7) === e.slice(0, 7);
  return sameMonth ? `${fmtDate(s)} – ${new Date(e + 'T12:00:00').getDate()}` : `${fmtDate(s)} – ${fmtDate(e)}`;
};
function relDay(iso) {
  if (!iso) return '';
  const days = Math.round((new Date(iso + 'T12:00:00') - todayNoon()) / 864e5);
  if (days === 0) return t('relToday');
  if (days === 1) return t('relTomorrow');
  if (days === -1) return t('relYesterday');
  if (days > 1) return t('inDays', days);
  return t('daysAgo', -days);
}
const pinSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const tagSVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>';
// Prices are stored in USD ("From $18.40"); the site is Saudi-first, so
// display SAR at the pegged rate, rounded to whole riyals.
const USD_SAR = 3.75, EUR_SAR = 4.07, GBP_SAR = 5.00;
const fmtPrice = p => p ? String(p)
  .replace(/\$(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * USD_SAR))
  .replace(/€(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * EUR_SAR))
  .replace(/£(\d+(?:\.\d+)?)/g, (_, n) => 'SAR ' + Math.round(parseFloat(n) * GBP_SAR)) : p;
const priceNum = p => { // numeric SAR value for sorting; Infinity when unknown/free-last
  if (!p) return Infinity;
  if (/free/i.test(String(p))) return 0;
  const m = String(fmtPrice(p)).match(/SAR\s*([\d,]+)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : Infinity;
};
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('api ' + r.status);
  return r.json();
}
// Privacy-friendly usage beacons: no identity, just aggregate counts.
function beacon(type, ref = '', meta = '') {
  try {
    const body = JSON.stringify({ type, ref: String(ref).slice(0, 64), meta: String(meta).slice(0, 256) });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/analytics', body);
    else fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
  } catch {}
}

/* ================= fuzzy search ================= */
const norm = s => (s || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06ff ]/g, ' ').replace(/\s+/g, ' ').trim();
const isSubseq = (tok, txt) => {
  let i = 0;
  for (const ch of txt) { if (ch === tok[i]) i++; if (i === tok.length) return true; }
  return i === tok.length;
};
// Weighted AND search: every query token must match at least one field.
function searchScore(ev, tokens) {
  const F = [
    [ev.title, 5], [ev.venue, 3], [ev.organizer, 3], [ev.city, 2],
    [domLabel(ev.domain), 2], [catLabel(ev.category), 2],
  ].map(([txt, w]) => [norm(txt), w]);
  let score = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const [txt, w] of F) {
      if (!txt) continue;
      if (txt.includes(tok)) best = Math.max(best, w * (tok.length >= 4 ? 2 : 1));
      else if (tok.length >= 3 && isSubseq(tok, txt)) best = Math.max(best, w * 0.5);
    }
    if (!best) return 0;
    score += best;
  }
  if (norm(ev.title).startsWith(tokens[0])) score += 3;
  return score;
}
function fuzzyFilter(pool, q) {
  const tokens = norm(q).split(' ').filter(x => x.length);
  if (!tokens.length) return pool.map(ev => ({ ev, score: 1 }));
  return pool
    .map(ev => ({ ev, score: searchScore(ev, tokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.ev.start || '').localeCompare(b.ev.start || ''));
}
function hi(text, q) { // highlight query tokens in escaped HTML
  let out = esc(text);
  norm(q).split(' ').filter(x => x.length > 1).forEach(tok => {
    const e = esc(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('(' + e + ')', 'gi'), '<mark>$1</mark>');
  });
  return out;
}
function pushRecent(q) {
  q = q.trim();
  if (!q) return;
  state.recent = [q, ...state.recent.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  saveLocal();
}

/* ================= view switching + history ================= */
function showView(id, mode = 'push') {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $(id);
  el.classList.add('active');
  // re-trigger the entrance animation
  if (!reducedMotion()) { el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); }
  window.scrollTo(0, 0);
  beacon('view', _viewHash(id));
  if (mode === 'push') _pushHist({ view: id });
  else if (mode === 'replace') _replaceHist({ view: id });
}
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
function rerenderAll() {
  // re-render whichever dynamic views exist after a language switch
  if ($('#view-deck').classList.contains('active')) renderStack(false);
  if ($('#view-list').classList.contains('active')) { buildListFilters(); renderList(); }
  if ($('#view-saved').classList.contains('active')) renderSaved($('#saved-search').value);
  if ($('#view-onboard').classList.contains('active')) buildOnboardChips();
  if (!$('#map-modal').classList.contains('hidden')) renderMapFilters();
  refreshOnboard();
  renderDeckProgress();
}

/* ================= onboarding ================= */
function chipToggle(parent, set, value, label, onChange) {
  const b = document.createElement('button');
  b.className = 'chip' + (set.has(value) ? ' on' : '');
  b.textContent = label;
  b.onclick = () => {
    buzz(8);
    set.has(value) ? set.delete(value) : set.add(value);
    b.classList.toggle('on');
    onChange && onChange();
    refreshOnboard();
  };
  parent.appendChild(b);
}
function skeletonChips(el, n = 8) {
  el.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'chip skeleton';
    s.style.width = (60 + Math.random() * 70) + 'px';
    s.innerHTML = '&nbsp;';
    el.appendChild(s);
  }
}
function buildOnboardChips() {
  const meta = state.meta;
  if (!meta) return;
  const cc = $('#city-chips'); cc.innerHTML = '';
  meta.cities.forEach(c => chipToggle(cc, state.cities, c, c));
  const ic = $('#interest-chips'); ic.innerHTML = '';
  meta.categories.forEach(c => chipToggle(ic, state.cats, c, catLabel(c)));
  const dc = $('#domain-chips'); dc.innerHTML = '';
  // professional domains first (by event count), entertainment last
  const prof = meta.domains.filter(d => d.key !== 'entertainment');
  const ent = meta.domains.find(d => d.key === 'entertainment');
  [...prof, ...(ent ? [ent] : [])].forEach(d =>
    chipToggle(dc, state.domains, d.key, `${state.lang === 'ar' ? d.ar : d.en} · ${d.count}`));
  $('#domain-group').style.display = prof.length ? '' : 'none';
}
async function initOnboard() {
  skeletonChips($('#city-chips')); skeletonChips($('#interest-chips')); skeletonChips($('#domain-chips'));
  const meta = state.meta = await api('/api/meta');
  buildOnboardChips();
  $('#btn-build').onclick = () => buildDeck();
  $('#btn-skip').onclick = buildList;
  $('#btn-detect').onclick = detectCity;
  refreshOnboard();
}
function filteredEvents() {
  return state.all.filter(e =>
    (!state.cities.size || state.cities.has(e.city)) &&
    (!state.cats.size || state.cats.has(e.category)) &&
    (!state.domains.size || state.domains.has(e.domain || 'business')));
}
function refreshOnboard() {
  const n = filteredEvents().length;
  const anySel = state.cities.size + state.cats.size + state.domains.size > 0;
  $('#btn-build').disabled = !anySel;
  $('#onboard-count').textContent = anySel ? t('matchEvents', n) : t('pickHint');
  saveLocal();
}
async function detectCity() {
  const btn = $('#btn-detect');
  btn.textContent = t('detecting'); btn.disabled = true;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 9000 }));
    const { latitude: lat, longitude: lon } = pos.coords;
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`);
    const j = await r.json();
    const a = j.address || {};
    const name = a.city || a.town || a.village || a.state || a.county || '';
    const nn = norm(name);
    const hit = state.meta.cities.find(c => { const cc = norm(c); return nn && (cc.includes(nn) || nn.includes(cc)); });
    if (hit && !state.cities.has(hit)) {
      state.cities.add(hit); saveLocal(); buildOnboardChips(); refreshOnboard();
      toast(`${t('cityDetected')}: ${hit}`);
    } else if (hit) toast(`${t('cityDetected')}: ${hit}`);
    else toast(t('cityDetectFail'));
  } catch { toast(t('cityDetectFail')); }
  btn.textContent = t('detectCity'); btn.disabled = false;
}
function buildDeck() {
  state.filtered = filteredEvents();
  const deck = state.filtered.filter(e => !state.saved[e.id]);
  state.deck = deck; state.idx = 0;
  state.undoStack = [];
  state.mapPlottedFor = null;
  state.mapCat = null;
  saveLocal();
  renderStack(false);
  showView('#view-deck');
  warmGeoCache(state.filtered);
}

/* ================= deck ================= */
function cardImage(el, ev) {
  const setFallback = () => {
    el.classList.add('fallback');
    el.innerHTML = `<div class="wm">${esc((ev.category || 'EV').toUpperCase().slice(0, 4))}</div>`;
  };
  const setImage = img => {
    el.classList.remove('fallback'); el.innerHTML = '';
    el.style.backgroundImage = `url("${img}")`;
  };
  if (ev.image) return setImage(ev.image);
  if (!ev.url) return setFallback();
  if (state.imgCache.has(ev.url)) {
    const img = state.imgCache.get(ev.url);
    img ? setImage(img) : setFallback();
    return;
  }
  setFallback();
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
    <div class="stamp save">${esc(t('saveStamp'))}</div>
    <div class="stamp pass">${esc(t('passStamp'))}</div>
    <div class="card-body">
      <div class="card-cats">
        <span class="cat-pill">${esc(catLabel(ev.category) || '')}</span>
        <span class="cat-pill date-pill" title="${esc(relDay(ev.start))}">${esc(fmtRange(ev.start, ev.end))}</span>
      </div>
      <h3 class="card-title">${esc(ev.title)}</h3>
      <div class="card-meta">
        ${ev.venue ? `<div class="row">${pinSVG}<span>${esc(ev.venue)} · ${esc(ev.city)}</span></div>` : `<div class="row">${pinSVG}<span>${esc(ev.city)}</span></div>`}
        <div class="row">${tagSVG}<span class="card-price">${esc(fmtPrice(ev.price) || t('seeDetails'))}</span></div>
      </div>
    </div>`;
  cardImage(el.querySelector('.card-img'), ev);
  return el;
}
// FLIP: cards that survive a re-render glide to their new slot instead of popping.
function renderStack(flip = true) {
  const stack = $('#card-stack');
  const oldRects = new Map();
  if (flip && !reducedMotion())
    stack.querySelectorAll('.swipe-card').forEach(el => { if (el.dataset.id) oldRects.set(el.dataset.id, el.getBoundingClientRect()); });
  stack.innerHTML = '';
  const empty = state.idx >= state.deck.length;
  $('#deck-empty').classList.toggle('hidden', !empty);
  renderDeckProgress();
  if (empty) { updateSavedCount(); return; }
  for (let d = 2; d >= 0; d--) {
    const ev = state.deck[state.idx + d];
    if (ev) stack.appendChild(cardEl(ev, d));
  }
  if (flip && !reducedMotion()) stack.querySelectorAll('.swipe-card').forEach(el => {
    const old = oldRects.get(el.dataset.id);
    if (!old) return;
    const r = el.getBoundingClientRect();
    const dx = old.left - r.left, dy = old.top - r.top;
    if (dx || dy) el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: el.style.transform || 'none' }],
      { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
  });
  attachDrag(stack.querySelector('.swipe-card.top'));
  updateSavedCount();
}
function renderDeckProgress() {
  const el = $('#deck-progress');
  if (!state.deck.length) { el.textContent = ''; return; }
  const a = Math.min(state.idx + 1, state.deck.length);
  el.textContent = t('ofLabel', a, state.deck.length);
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
  setTimeout(() => done && done(), reducedMotion() ? 0 : 330);
}
function decide(save) {
  const ev = topEvent();
  if (!ev) return;
  buzz(save ? 18 : 10);
  state.undoStack.push({ ev, saved: !!state.saved[ev.id] });
  if (state.undoStack.length > 8) state.undoStack.shift();
  if (save) {
    state.saved[ev.id] = Date.now();
    beacon('save', ev.id, ev.title);
    saveBurst(topCard());
  } else beacon('unsave', ev.id, 'pass');
  saveLocal();
  state.idx++;
  showUndo();
  renderStack();
}
let undoT;
function showUndo() {
  const b = $('#btn-undo');
  b.classList.remove('hidden');
  clearTimeout(undoT);
  undoT = setTimeout(() => b.classList.add('hidden'), 6000);
}
function undo() {
  const last = state.undoStack.pop();
  if (!last || state.idx === 0) return;
  buzz(12);
  state.idx--;
  if (last.saved) state.saved[last.ev.id] = Date.now();
  else delete state.saved[last.ev.id];
  beacon('undo', last.ev.id);
  saveLocal();
  if (!state.undoStack.length) $('#btn-undo').classList.add('hidden');
  renderStack();
}
// heart-dot flies from the card to the Saved badge
function saveBurst(fromEl) {
  if (reducedMotion() || !fromEl) { popBadge(); return; }
  const a = fromEl.getBoundingClientRect();
  const b = $('#btn-saved').getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly-dot';
  dot.style.left = (a.left + a.width / 2) + 'px';
  dot.style.top = (a.top + a.height / 2) + 'px';
  document.body.appendChild(dot);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const anim = dot.animate([
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * .5}px), calc(-50% + ${dy * .5 - 70}px)) scale(.85)`, opacity: 1, offset: .55 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.25)`, opacity: .85 },
  ], { duration: 620, easing: 'cubic-bezier(.3,.7,.3,1)' });
  anim.onfinish = () => { dot.remove(); popBadge(); };
}
function popBadge() {
  const badge = $('#saved-count');
  badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
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
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    const quickTap = moved < 10 && Date.now() - t0 < 350;
    if (quickTap) { el.style.transform = ''; openDetail(topEvent(), { fromCard: el }); return; }
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

/* ================= all-events list ================= */
const listF = { q: '', date: 'all', free: false, sort: 'date', domains: new Set(), cities: new Set() };
function buildList() {
  state.cities.clear(); state.cats.clear(); state.domains.clear(); saveLocal();
  state.filtered = [...state.all];
  state.mapCat = null; state.mapPlottedFor = null;
  listF.q = ''; listF.date = 'all'; listF.free = false; listF.sort = 'date';
  listF.domains.clear(); listF.cities.clear();
  $('#list-search').value = '';
  $('#sort-sel').value = 'date';
  buildListFilters();
  renderList();
  showView('#view-list');
}
function buildListFilters() {
  // date quick filters
  const dc = $('#date-chips'); dc.innerHTML = '';
  [['all', t('allDates')], ['today', t('today')], ['week', t('thisWeek')], ['weekend', t('thisWeekend')]]
    .forEach(([v, label]) => {
      const b = document.createElement('button');
      b.className = 'chip' + (listF.date === v ? ' on' : '');
      b.textContent = label;
      b.onclick = () => { buzz(8); listF.date = v; buildListFilters(); renderList(); };
      dc.appendChild(b);
    });
  const free = document.createElement('button');
  free.className = 'chip' + (listF.free ? ' on' : '');
  free.textContent = '✓ ' + t('freeOnly');
  free.onclick = () => { buzz(8); listF.free = !listF.free; buildListFilters(); renderList(); };
  dc.appendChild(free);
  // professional domain chips
  const mc = $('#domain-chips-list'); mc.innerHTML = '';
  const lab = document.createElement('span'); lab.className = 'row-label'; lab.textContent = t('field');
  mc.appendChild(lab);
  (state.meta.domains || []).forEach(d => {
    const b = document.createElement('button');
    b.className = 'chip sm' + (listF.domains.has(d.key) ? ' on' : '');
    b.textContent = state.lang === 'ar' ? d.ar : d.en;
    b.onclick = () => { buzz(8); listF.domains.has(d.key) ? listF.domains.delete(d.key) : listF.domains.add(d.key); buildListFilters(); renderList(); };
    mc.appendChild(b);
  });
  // city chips
  const cc = $('#city-chips-list'); cc.innerHTML = '';
  const lab2 = document.createElement('span'); lab2.className = 'row-label'; lab2.textContent = t('cityLabel');
  cc.appendChild(lab2);
  state.meta.cities.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip sm' + (listF.cities.has(c) ? ' on' : '');
    b.textContent = c;
    b.onclick = () => { buzz(8); listF.cities.has(c) ? listF.cities.delete(c) : listF.cities.add(c); buildListFilters(); renderList(); };
    cc.appendChild(b);
  });
}
function weekendRange() {
  const d = todayNoon(), dow = d.getDay();
  if (dow === 6) return [todayStr(), todayStr()]; // Saturday: today is the weekend
  const fri = new Date(d); fri.setDate(d.getDate() + ((5 - dow + 7) % 7));
  const sat = new Date(fri); sat.setDate(fri.getDate() + 1);
  return [isoOf(fri), isoOf(sat)];
}
const overlaps = (ev, a, b) => (ev.start || '') <= b && (ev.end || ev.start || '') >= a;
function applyListFilters(pool) {
  let evs = pool;
  if (listF.q.trim()) evs = fuzzyFilter(evs, listF.q).map(x => x.ev);
  const ts = todayStr();
  if (listF.date === 'today') evs = evs.filter(e => overlaps(e, ts, ts));
  else if (listF.date === 'week') {
    const w = new Date(todayNoon()); w.setDate(w.getDate() + 7);
    evs = evs.filter(e => overlaps(e, ts, isoOf(w)));
  } else if (listF.date === 'weekend') { const [f, s] = weekendRange(); evs = evs.filter(e => overlaps(e, f, s)); }
  if (listF.free) evs = evs.filter(e => /free/i.test(e.price || ''));
  if (listF.domains.size) evs = evs.filter(e => listF.domains.has(e.domain || 'business'));
  if (listF.cities.size) evs = evs.filter(e => listF.cities.has(e.city));
  return evs;
}
const hav = (a, b, c, d) => {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
function sortEvents(evs) {
  const arr = [...evs];
  if (listF.sort === 'price') arr.sort((a, b) => priceNum(a.price) - priceNum(b.price) || (a.start || '').localeCompare(b.start || ''));
  else if (listF.sort === 'nearest' && state.youLoc) {
    arr.sort((a, b) => {
      const ga = a._g, gb = b._g;
      if (!ga && !gb) return 0; if (!ga) return 1; if (!gb) return -1;
      return hav(state.youLoc[0], state.youLoc[1], ga.lat, ga.lng) - hav(state.youLoc[0], state.youLoc[1], gb.lat, gb.lng);
    });
  } else arr.sort((a, b) => (a.start || '').localeCompare(b.start || '') || (a.title || '').localeCompare(b.title || ''));
  return arr;
}
function eventRow(ev, q, i) {
  const r = document.createElement('div');
  r.className = 'saved-row';
  r.style.setProperty('--i', i);
  r.innerHTML = `
    <div class="saved-thumb">${esc((ev.category || 'E').slice(0, 1).toUpperCase())}</div>
    <div class="saved-info">
      <div class="saved-title">${q ? hi(ev.title, q) : esc(ev.title)}</div>
      <div class="saved-sub">${esc(relDay(ev.start))} · ${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}${ev.price ? ' · ' + esc(fmtPrice(ev.price)) : ''}</div>
      <div class="saved-sub saved-venue">${q ? hi(ev.venue || '', q) : esc(ev.venue || '')}${ev.venue ? ' · ' : ''}${esc(domLabel(ev.domain))}</div>
    </div>
    <div class="row-chev" aria-hidden="true">›</div>`;
  cardImageThumb(r.querySelector('.saved-thumb'), ev);
  r.onclick = () => openDetail(ev, { fromList: true });
  return r;
}
function renderRails() {
  const box = $('#rails');
  const showRails = !listF.q.trim() && listF.date === 'all' && !listF.free && !listF.domains.size && !listF.cities.size;
  box.innerHTML = '';
  if (!showRails) { box.style.display = 'none'; return; }
  box.style.display = '';
  const ts = todayStr();
  const mk = (label, evs) => {
    if (!evs.length) return;
    const sec = document.createElement('div');
    sec.className = 'rail';
    sec.innerHTML = `<div class="rail-title">${esc(label)}</div>`;
    const track = document.createElement('div'); track.className = 'rail-track';
    evs.slice(0, 12).forEach(ev => {
      const c = document.createElement('div');
      c.className = 'rail-card';
      c.innerHTML = `<div class="rail-thumb">${esc((ev.category || 'E').slice(0, 1).toUpperCase())}</div>
        <div class="rail-info"><div class="rail-t">${esc(ev.title)}</div>
        <div class="rail-s">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}</div></div>`;
      cardImageThumb(c.querySelector('.rail-thumb'), ev);
      c.onclick = () => openDetail(ev, { fromList: true });
      track.appendChild(c);
    });
    sec.appendChild(track);
    box.appendChild(sec);
  };
  mk(t('tonight'), state.all.filter(e => overlaps(e, ts, ts)).sort((a, b) => (a.start || '').localeCompare(b.start || '')));
  const [f, s] = weekendRange();
  mk(t('thisWeekend'), state.all.filter(e => overlaps(e, f, s) && !overlaps(e, ts, ts)).sort((a, b) => (a.start || '').localeCompare(b.start || '')));
}
function renderList() {
  renderRails();
  const list = $('#event-list');
  const evs = sortEvents(applyListFilters(state.all));
  $('#list-count').textContent = t('eventsCount', evs.length);
  if (!evs.length) {
    list.innerHTML = `<div class="saved-empty"><div style="font-weight:800;color:var(--text);margin-bottom:6px">${esc(t('noResults'))}</div>${esc(t('noResultsHint'))}<br><br><button class="chip on" id="btn-clear-f">${esc(t('clearFilters'))}</button></div>`;
    $('#btn-clear-f').onclick = () => {
      listF.q = ''; listF.date = 'all'; listF.free = false; listF.domains.clear(); listF.cities.clear();
      $('#list-search').value = ''; buildListFilters(); renderList();
    };
    return;
  }
  list.innerHTML = '';
  evs.forEach((ev, i) => list.appendChild(eventRow(ev, listF.q, i)));
}
function renderRecent() {
  const box = $('#recent-searches');
  const q = $('#list-search').value.trim();
  if (q || !state.recent.length) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<span class="row-label">${esc(t('recent'))}</span>`;
  state.recent.forEach(s => {
    const b = document.createElement('button');
    b.className = 'chip sm'; b.textContent = s;
    b.onclick = () => { $('#list-search').value = s; listF.q = s; box.classList.add('hidden'); renderList(); };
    box.appendChild(b);
  });
}
let searchT;
function onListSearch(v) {
  clearTimeout(searchT);
  searchT = setTimeout(() => {
    listF.q = v;
    renderRecent();
    renderList();
    if (v.trim()) beacon('search', '', v.trim().slice(0, 60));
  }, 220);
}

/* ================= saved ================= */
function savedRow(ev, q, i) {
  const r = document.createElement('div');
  r.className = 'saved-row';
  r.style.setProperty('--i', i);
  r.innerHTML = `
    <div class="saved-thumb">${esc((ev.category || 'E').slice(0, 1).toUpperCase())}</div>
    <div class="saved-info">
      <div class="saved-title">${q ? hi(ev.title, q) : esc(ev.title)}</div>
      <div class="saved-sub">${esc(relDay(ev.start))} · ${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}${ev.price ? ' · ' + esc(fmtPrice(ev.price)) : ''}</div>
      <div class="saved-sub saved-venue">${q ? hi(ev.venue || '', q) : esc(ev.venue || '')}${ev.venue ? ' · ' : ''}${esc(domLabel(ev.domain))}</div>
    </div>
    <button class="saved-unsave" aria-label="Remove">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`;
  cardImageThumb(r.querySelector('.saved-thumb'), ev);
  r.onclick = e => { if (!e.target.closest('.saved-unsave')) openDetail(ev, { fromSaved: true }); };
  r.querySelector('.saved-unsave').onclick = () => {
    delete state.saved[ev.id]; saveLocal(); updateSavedCount();
    beacon('unsave', ev.id);
    renderSaved($('#saved-search').value);
  };
  return r;
}
function renderSaved(filter = '') {
  const list = $('#saved-list');
  const ids = Object.keys(state.saved).sort((a, b) => state.saved[b] - state.saved[a]);
  let rows = ids.map(id => state.all.find(e => e.id === id)).filter(Boolean);
  const q = filter.trim();
  if (q) rows = fuzzyFilter(rows, q).map(x => x.ev);
  if (!rows.length) {
    list.innerHTML = `<div class="saved-empty">${q ? esc(t('noMatchSaved')) : esc(t('nothingSaved')) + '<br>' + esc(t('checkSaved'))}</div>`;
    return;
  }
  list.innerHTML = '';
  const ts = todayStr();
  const soonD = new Date(todayNoon()); soonD.setDate(soonD.getDate() + 7);
  const soon = q ? [] : rows.filter(e => overlaps(e, ts, isoOf(soonD)))
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const rest = rows.filter(e => !soon.includes(e));
  const sec = label => {
    const h = document.createElement('div');
    h.className = 'saved-sec'; h.textContent = label;
    list.appendChild(h);
  };
  if (soon.length) { sec(`🔥 ${t('happeningSoon')}`); soon.forEach((ev, i) => list.appendChild(savedRow(ev, q, i))); }
  if (!q && soon.length && rest.length) sec(t('allSaved'));
  (q ? rows : rest).forEach((ev, i) => list.appendChild(savedRow(ev, q, i)));
}
function cardImageThumb(el, ev) {
  const apply = img => { if (img && el.isConnected) { el.style.backgroundImage = `url("${img}")`; el.textContent = ''; } };
  if (ev.image) return apply(ev.image);
  if (!ev.url) return;
  if (state.imgCache.has(ev.url)) return apply(state.imgCache.get(ev.url));
  fetch('/api/preview?url=' + encodeURIComponent(ev.url)).then(r => r.json())
    .then(d => { state.imgCache.set(ev.url, d.image || null); apply(d.image); })
    .catch(() => state.imgCache.set(ev.url, null));
}

/* ================= detail sheet ================= */
async function geoFor(ev) {
  const key = `${ev.venue || ''}|${ev.city || ''}`;
  if (state.geoCache.has(key)) return state.geoCache.get(key);
  try {
    const g = await api('/api/geocode?venue=' + encodeURIComponent(ev.venue || '') + '&city=' + encodeURIComponent(ev.city || ''));
    state.geoCache.set(key, g);
    if (g && g.lat != null) ev._g = g;
    return g;
  } catch { return { lat: null, lng: null }; }
}
async function shareEvent(ev) {
  const url = location.origin + '/e/' + ev.id;
  const text = `${ev.title} — ${fmtRange(ev.start, ev.end)} · ${ev.city}`;
  beacon('share', ev.id);
  buzz(10);
  if (navigator.share) {
    try { await navigator.share({ title: ev.title, text, url }); } catch {}
    return;
  }
  window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
}
function copyLink(ev) {
  const url = location.origin + '/e/' + ev.id;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
    .then(() => toast(t('linkCopied')))
    .catch(() => window.prompt(url, url));
  beacon('share', ev.id, 'copy');
}
function gcalURL(ev) {
  const dt = s => s.replace(/-/g, '');
  const end = ev.end && ev.end !== ev.start
    ? isoOf(new Date(new Date(ev.end + 'T12:00:00').getTime() + 864e5)) : ev.start;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent(ev.title) +
    '&dates=' + dt(ev.start) + '/' + dt(end) +
    '&details=' + encodeURIComponent(ev.url || '') +
    '&location=' + encodeURIComponent([ev.venue, ev.city].filter(Boolean).join(', '));
}
async function openDetail(ev, opts = {}) {
  if (!ev) return;
  $('#sheet-backdrop').classList.remove('hidden');
  const sheet = $('#detail-sheet');
  sheet.classList.remove('hidden');
  const backBtn = $('#sheet-back'), backLabel = backBtn.querySelector('span');
  backBtn.classList.remove('hidden');
  const backName = opts.fromMap ? t('map') : opts.fromList ? t('allEvents') : opts.fromSaved ? t('saved') : t('back');
  backLabel.textContent = backName;
  backBtn.setAttribute('aria-label', t('back') + (backName === t('back') ? '' : ': ' + backName));
  backBtn.onclick = closeDetail;
  _pushHist({ modal: 'sheet', eid: ev.id });
  document.body.style.overflow = 'hidden';
  const body = $('#sheet-body');
  body.scrollTop = 0;
  const srcName = (ev.sources && ev.sources[0]) || '';
  const srcPretty = srcName ? srcName.charAt(0).toUpperCase() + srcName.slice(1) : '';
  body.innerHTML = `
    <div class="sheet-hero" id="sheet-hero"></div>
    <div class="sheet-content">
      <div class="card-cats">
        <span class="cat-pill">${esc(catLabel(ev.category) || '')}</span>
        <span class="cat-pill domain-pill">${esc(domLabel(ev.domain))}</span>
        <span class="cat-pill date-pill">${esc(fmtRange(ev.start, ev.end))} · ${esc(relDay(ev.start))}</span>
      </div>
      <h2>${esc(ev.title)}</h2>
      ${ev.description ? `<p class="sheet-desc">${esc(ev.description)}</p>` : ''}
      <div class="detail-rows">
        <div class="detail-row">${pinSVG}<div><div class="k">${esc(t('venue'))}</div>${esc(ev.venue || ev.city)}${ev.venue ? `<br><span style="color:var(--faint)">${esc(ev.city)}</span>` : ''}</div></div>
        <div class="detail-row">${tagSVG}<div><div class="k">${esc(t('price'))}</div>${esc(fmtPrice(ev.price) || t('checkEventPage'))}</div></div>
        ${ev.organizer ? `<div class="detail-row"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg><div><div class="k">${esc(t('organizer'))}</div>${esc(ev.organizer)}</div></div>` : ''}
      </div>
      <div class="sheet-actions">
        ${ev.url ? `<a class="btn go" href="${esc(ev.url)}" target="_blank" rel="noopener" id="sheet-reg">${esc(t('register'))}</a>` : ''}
        <button class="btn ghost" id="sheet-share">${esc(t('share'))}</button>
        <button class="btn ghost" id="sheet-copy">⧉</button>
        <button class="btn ghost" id="sheet-cal">${esc(t('addCal'))}</button>
        <button class="btn ghost" id="sheet-gcal">${esc(t('gCal'))}</button>
        <button class="btn ghost" id="sheet-gmaps">${esc(t('gMaps'))}</button>
        <button class="btn ghost" id="sheet-report">${esc(t('report'))}</button>
      </div>
      ${srcPretty ? `<div class="sheet-source">${esc(t('via'))} ${esc(srcPretty)}${ev.added_at ? ' · ' + esc(t('added')) + ' ' + esc(relDay(ev.added_at)) : ''}</div>` : ''}
      <div id="report-form" class="report-form hidden">
        <div class="report-title">${esc(t('reportTitle'))}</div>
        <select id="rep-issue" class="rep-input">
          <option value="wrong_date">${esc(t('wrongDate'))}</option>
          <option value="wrong_venue">${esc(t('wrongVenue'))}</option>
          <option value="wrong_price">${esc(t('wrongPrice'))}</option>
          <option value="cancelled">${esc(t('cancelled'))}</option>
          <option value="other">${esc(t('other'))}</option>
        </select>
        <textarea id="rep-detail" class="rep-input" rows="2" placeholder="${esc(t('reportDetailPh'))}"></textarea>
        <button class="btn go" id="rep-send">${esc(t('send'))}</button>
      </div>
      <div class="map-embed" id="sheet-mapwrap" style="display:none"><iframe id="sheet-map" loading="lazy" title="Venue map"></iframe></div>
    </div>`;
  const hero = $('#sheet-hero');
  cardImage(hero, ev);
  // shared-element morph: the tapped card's image flies into the sheet hero
  if (opts.fromCard && !reducedMotion()) {
    const srcImg = opts.fromCard.querySelector('.card-img');
    const bg = srcImg && srcImg.style.backgroundImage;
    const m = bg && bg.match(/url\("?(.*?)"?\)/);
    if (m && m[1] && srcImg.getBoundingClientRect().width > 0) {
      const a = srcImg.getBoundingClientRect();
      setTimeout(() => {
        if (!hero.isConnected) return;
        const b = hero.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'hero-ghost';
        ghost.style.backgroundImage = `url("${m[1]}")`;
        Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
        document.body.appendChild(ghost);
        hero.style.visibility = 'hidden';
        const anim = ghost.animate([
          { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', borderRadius: '24px' },
          { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px', borderRadius: '0px' },
        ], { duration: 300, easing: 'cubic-bezier(.32,.72,.28,1)' });
        anim.onfinish = () => { ghost.remove(); hero.style.visibility = ''; };
      }, 290); // after the sheet's slide-up finishes
    }
  }
  const reg = $('#sheet-reg');
  if (reg) reg.onclick = () => beacon('register', ev.id, ev.title);
  $('#sheet-cal').onclick = () => { downloadICS(ev); buzz(10); };
  $('#sheet-gcal').onclick = () => window.open(gcalURL(ev), '_blank');
  $('#sheet-share').onclick = () => shareEvent(ev);
  $('#sheet-copy').onclick = () => copyLink(ev);
  $('#sheet-report').onclick = () => { buzz(8); $('#report-form').classList.toggle('hidden'); };
  $('#rep-send').onclick = async () => {
    const issue = $('#rep-issue').value, detail = $('#rep-detail').value.trim();
    try {
      await api('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: ev.id, issue, detail }) });
      beacon('report', ev.id, issue);
      $('#report-form').classList.add('hidden');
      toast(t('reportThanks'));
    } catch { toast('…'); }
  };
  $('#sheet-gmaps').onclick = async () => {
    const g = await geoFor(ev);
    const q = g.lat ? `${g.lat},${g.lng}` : `${ev.venue || ''} ${ev.city} Saudi Arabia`;
    window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank');
  };
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

/* ================= map ================= */
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
    setTimeout(() => done(null), 8000);
  });
}
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
      plotMapMarkers(false);
    };
    bar.appendChild(b);
  };
  mk(null, t('allDates') === 'All dates' ? 'All' : 'الكل');
  cats.forEach(c => mk(c, catLabel(c)));
  bar.style.display = cats.length ? '' : 'none';
}
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
  const status = $('#map-status');
  status.style.opacity = '1';
  status.textContent = 'Finding you…';
  const you = await userLocation();
  state.youLayer.clearLayers();
  if (you) {
    state.youLayer.clearLayers();
    state.map.setView(you, 10);
    L.circleMarker(you, { radius: 8, color: '#4aa3ff', weight: 3, fillColor: '#4aa3ff', fillOpacity: 0.9 })
      .addTo(state.youLayer).bindPopup('You are here');
  }
  await plotMapMarkers(!you);
}
async function plotMapMarkers(refit) {
  const status = $('#map-status');
  const sig = [...state.cities].sort().join(',') + '|' + [...state.cats].sort().join(',')
    + '|' + [...state.domains].sort().join(',') + '|' + (state.mapCat || '');
  if (state.mapPlottedFor === sig) {
    onMapSearch($('#map-search').value || '');
    status.style.opacity = '0';
    return;
  }
  if (state.markers) state.markers.clearLayers();
  else state.markers = (L.markerClusterGroup
    ? L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 56 })
    : L.layerGroup()).addTo(state.map);
  state.mapPlottedFor = sig;
  state.plotted = [];
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
    state.plotted.push({ m, ev });
    const img = ev.image && /^https?:\/\//.test(ev.image)
      ? `<div class="map-pop-img" style="background-image:url(&quot;${esc(ev.image)}&quot;)"></div>` : '';
    const viewBtn = ev.url
      ? `<a class="map-pop-open primary" href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(t('viewEvent'))}</a>` : '';
    m.bindPopup(`<div class="map-pop">${img}<div class="map-pop-title">${esc(ev.title)}</div>
      <div class="map-pop-meta">${esc(fmtRange(ev.start, ev.end))} · ${esc(ev.city)}</div>
      <div class="map-pop-actions">${viewBtn}<button class="map-pop-open" data-id="${esc(ev.id)}">${esc(t('details'))}</button></div></div>`);
    m.on('popupopen', e => {
      const btn = e.popup.getElement().querySelector('button.map-pop-open');
      if (btn) btn.onclick = () => {
        const found = state.all.find(x => x.id === btn.dataset.id);
        if (found) { closeMap(); openDetail(found, { fromMap: true }); }
      };
    });
  }
  if (refit && bounds.length) state.map.fitBounds(bounds, { padding: [40, 40] });
  onMapSearch($('#map-search').value); // re-apply the search filter
  if (!$('#map-search').value.trim()) {
    const unverified = events.length - plotted;
    if (unverified > 0) status.textContent = `${plotted} of ${events.length} events have verified map locations`;
    else {
      status.textContent = `${plotted} event${plotted === 1 ? '' : 's'} plotted`;
      setTimeout(() => status.style.opacity = '0', 2200);
    }
  }
}
let mapSearchT;
function onMapSearch(v) {
  clearTimeout(mapSearchT);
  mapSearchT = setTimeout(() => {
    if (!state.plotted || !state.markers) return;
    const tokens = norm(v).split(' ').filter(x => x.length);
    const status = $('#map-status');
    let shown = 0;
    state.plotted.forEach(({ m, ev }) => {
      const hit = !tokens.length || searchScore(ev, tokens) > 0;
      const on = state.markers.hasLayer(m);
      if (hit && !on) state.markers.addLayer(m);
      if (!hit && on) state.markers.removeLayer(m);
      if (hit) shown++;
    });
    if (tokens.length) {
      status.style.opacity = '1';
      status.textContent = `${shown} match${shown === 1 ? '' : 'es'}`;
    } else status.style.opacity = '0';
  }, tokens0(v));
}
const tokens0 = v => v.trim() ? 200 : 0;
function mapSearchGo() {
  const tokens = norm($('#map-search').value).split(' ').filter(x => x.length);
  if (!tokens.length || !state.plotted) return;
  const scored = state.plotted
    .map(p => ({ p, s: searchScore(p.ev, tokens) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s)[0];
  if (scored) {
    state.map.flyTo(scored.p.m.getLatLng(), 13, { duration: .8 });
    setTimeout(() => scored.p.m.openPopup(), 850);
  }
}
function closeMap() {
  $('#map-modal').classList.add('hidden');
  document.body.style.overflow = '';
}
function closeMapUI() {
  if (_topIsModal('map')) history.back();
  else closeMap();
}

/* ================= PWA ================= */
let deferredPrompt = null;
function initPWA() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    $('#btn-install').classList.remove('hidden');
  });
  $('#btn-install').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    $('#btn-install').classList.add('hidden');
  };
}

/* ================= wire up & boot ================= */
$('#btn-pass').onclick = () => flyOut(-1, () => decide(false));
$('#btn-like').onclick = () => flyOut(1, () => decide(true));
$('#btn-undo').onclick = undo;
$('#btn-map').onclick = () => openMap();
$('#map-close').onclick = closeMapUI;
$('#btn-saved').onclick = () => { renderSaved(''); $('#saved-search').value = ''; showView('#view-saved'); };
const _inAppBack = fallback => {
  if (window.history.length > 1) history.back();
  else showView(fallback, 'replace');
};
$('#btn-saved-back').onclick = () => _inAppBack('#view-deck');
$('#btn-list-back').onclick = () => _inAppBack('#view-onboard');
$('#saved-search').oninput = e => renderSaved(e.target.value);
$('#btn-prefs').onclick = () => { initOnboard(); showView('#view-onboard', 'replace'); };
$('#btn-rebuild').onclick = () => $('#btn-prefs').click();
$('#sheet-close').onclick = closeDetail;
$('#sheet-backdrop').onclick = closeDetail;
$$('.lang-btn').forEach(b => b.onclick = () => { buzz(8); setLang(state.lang === 'ar' ? 'en' : 'ar'); });
$('#list-search').addEventListener('input', e => onListSearch(e.target.value));
$('#list-search').addEventListener('focus', renderRecent);
$('#list-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') { pushRecent(e.target.value); $('#recent-searches').classList.add('hidden'); e.target.blur(); }
});
$('#sort-sel').addEventListener('change', async e => {
  listF.sort = e.target.value; buzz(8);
  if (listF.sort === 'nearest') {
    const loc = await userLocation();
    if (!loc) { toast(t('needLocation')); e.target.value = 'date'; listF.sort = 'date'; return; }
    state.youLoc = loc;
    await geoPool(state.all, 6, null).catch(() => {});
  }
  renderList();
});
$('#map-search').addEventListener('input', e => onMapSearch(e.target.value));
$('#map-search').addEventListener('keydown', e => { if (e.key === 'Enter') mapSearchGo(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDetail(); closeMapUI(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');
  if (e.key === '/' && !typing) {
    if ($('#view-list').classList.contains('active')) { e.preventDefault(); $('#list-search').focus(); }
    else if ($('#view-saved').classList.contains('active')) { e.preventDefault(); $('#saved-search').focus(); }
    return;
  }
  if (!$('#view-deck').classList.contains('active') || !$('#detail-sheet').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') $('#btn-like').click();
  if (e.key === 'ArrowLeft') $('#btn-pass').click();
});
window.addEventListener('popstate', e => {
  const s = e.state || {};
  _histLock = true;
  try {
    _closeDetailUI();
    closeMap();
    if (s.modal === 'map') openMap(false);
    else if (s.modal === 'sheet' && s.eid) {
      const ev = (state.all || []).find(x => x.id === s.eid);
      if (ev) openDetail(ev, {});
    } else if (s.view === '#view-deck' && !(state.filtered && state.filtered.length)) {
      showView('#view-onboard', 'none');
    } else if (s.view) {
      if (s.view === '#view-list') { buildListFilters(); renderList(); }
      if (s.view === '#view-saved') renderSaved(($('#saved-search') || {}).value || '');
      showView(s.view, 'none');
    } else showView('#view-onboard', 'none');
  } finally { _histLock = false; }
});
_replaceHist({ view: '#view-onboard' });

(async function boot() {
  setLang(state.lang, false);
  applyI18n();
  initPWA();
  try {
    const data = await api('/api/events?limit=2000');
    state.all = data.events;
    await initOnboard();
    updateSavedCount();
    // deep link: /#e=<id> (the /e/<id> page redirects here for crawlers' sake)
    const m = location.hash.match(/^#e=([a-z0-9]+)/i);
    if (m) {
      const ev = state.all.find(x => x.id === m[1]);
      if (ev) {
        state.filtered = [...state.all];
        buildListFilters();
        renderList();
        showView('#view-list', 'replace');
        openDetail(ev, {});
      }
    }
  } catch (err) {
    document.body.innerHTML = '<div style="padding:60px 24px;text-align:center;color:#9aa1ad;font-family:sans-serif">Could not reach the events server.<br>Please try again in a moment.</div>';
  }
})();
