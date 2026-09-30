/* ThisWeekSaudi QA — jsdom use-case pass (persisted in repo). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FRONT = path.join(ROOT, 'frontend');
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail && !ok ? ' — ' + detail : ''));
}

(async () => {
  // ---- 0. service worker: version bumped + network-first shell ----
  const sw = fs.readFileSync(path.join(FRONT, 'sw.js'), 'utf8');
  check('SW cache version bumped to tws-v4', sw.includes("const V = 'tws-v4'"));
  check('SW app shell is network-first (no stale code on phones)',
    !sw.includes('cache first, then network') && sw.includes('network first for'),
    'shell still cache-first');

  // ---- 0b. countdown + weekend helpers present; weekend chip is Fri–Sat ----
  const appSrc0 = fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8');
  check('relDayLabel helper defined', appSrc0.includes('function relDayLabel('));
  check('weekendRange helper defined (Saudi Fri–Sat)', appSrc0.includes('function weekendRange('));
  check('buildDeck renders weekend spotlight', /function buildDeck\(\)\{[\s\S]*?renderWeekendSpot\(\)/.test(appSrc0),
    'buildDeck missing renderWeekendSpot()');
  check('weekend filter uses Fri–Sat (not Sat–Sun)',
    appSrc0.includes("const [fri, sat] = weekendRange(); // Saudi weekend: Fri–Sat") &&
    !appSrc0.includes('(6 - sat.getDay()'), 'old Sat–Sun calc still present');
  check('deck header has search button', fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8').includes('id="btn-search"'));

  // ---- 1. boot the app in jsdom ----
  const html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  const rawEvents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'events.json'), 'utf8'));
  const events = Array.isArray(rawEvents) ? rawEvents : rawEvents.events;
  const dom = new JSDOM(html, { url: 'https://thisweeksaudi.onrender.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;

  // stubs
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.Notification = function () {};
  window.Notification.permission = 'default';
  window.Notification.requestPermission = async () => 'denied';
  window.navigator.geolocation = { getCurrentPosition: (ok) => ok({ coords: { latitude: 24.7, longitude: 46.7 } }) };
  Object.defineProperty(window.navigator, 'serviceWorker', { value: {
    register: async () => ({ pushManager: {} }),
    get ready() { return Promise.reject(new Error('no-sw')); },
  }});
  let scrollCalls = [];
  window.scrollTo = (x, y) => scrollCalls.push([x, y]);
  window.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/events')) return { ok: true, json: async () => ({ events }) };
    if (u.includes('/api/meta')) {
      const cities = [...new Set(events.map(e => e.city).filter(Boolean))];
      const cats = [...new Set(events.map(e => e.category).filter(Boolean))];
      return { ok: true, json: async () => ({ cities, categories: cats, domains: [] }) };
    }
    if (u.includes('/api/preview')) return { ok: true, json: async () => ({ image: null }) };
    if (u.includes('/api/geocode')) return { ok: true, json: async () => ({ lat: 24.7, lng: 46.7 }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  // image probes: pretend every probed URL loads
  const RealImage = window.Image;
  window.Image = function () {
    const img = new RealImage();
    setTimeout(() => img.onload && img.onload(), 5);
    return img;
  };
  // jsdom lacks Web Animations
  window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {} }; };

  const appSrc = fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8');
  const dscSrc = fs.readFileSync(path.join(FRONT, 'discover.js'), 'utf8');
  // single eval: jsdom drops const/let across separate eval() calls, but a real
  // browser shares the global lexical env between classic scripts — one eval mirrors that
  dom.window.eval(appSrc + '\n;\n' + dscSrc); // IIFE auto-boots (readyState is 'complete')
  await new Promise(r => setTimeout(r, 300));

  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];
  // wait for async boot (cities render after meta fetch)
  for (let i = 0; i < 50 && !$('#ob-city-list button'); i++) await new Promise(r => setTimeout(r, 100));

  // ---- 2. onboarding is now 2 steps ----
  check('onboarding step 1 visible at boot', $('#ob-step-1') && !$('#ob-step-1').classList.contains('hidden'));
  check('kicker says "1 of 2"', $('#ob-step-1 .ob-kicker').textContent.trim() === '1 of 2');
  check('step-1 dots show 2', $$('#ob-step-1 .ob-dots span').length === 2);
  check('step 3 hidden at boot', $('#ob-step-3').classList.contains('hidden') || $('#ob-step-3').hidden);

  // pick a city + categories guaranteed to hold weekend events (deterministic spotlight)
  const isoD = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const nowD = new Date();
  const friD = new Date(nowD); friD.setDate(nowD.getDate() + ((5 - nowD.getDay() + 7) % 7));
  const satD = new Date(friD); satD.setDate(friD.getDate() + 1);
  const friS = isoD(friD), satS = isoD(satD);
  const wkSeed = events.filter(e => {
    const s = (e.start||'').slice(0,10), en = (e.end||'').slice(0,10) || s;
    return s && s <= satS && en >= friS;
  });
  check('seed has weekend events for spotlight test', wkSeed.length > 0, 'none in ' + friS + '–' + satS);
  const wkCity = wkSeed.length ? wkSeed[0].city : null;
  const wkCats = wkSeed.length ? [...new Set(wkSeed.filter(e => e.city === wkCity).map(e => e.category))].slice(0, 2) : [];

  // scroll position carry-over: scroll step 1 down, go to step 2, must reset
  const view = $('#view-onboard');
  window.scrollTo(0, 0); scrollCalls = [];
  const cityBtn = $$('#ob-city-list button').find(b => b.getAttribute('data-city') === wkCity) || $$('#ob-city-list button')[0];
  cityBtn.click();
  await new Promise(r => setTimeout(r, 50));
  $('#ob-next-1').click(); // Continue → step 2
  await new Promise(r => setTimeout(r, 50));
  check('step 2 shown after city pick', !$('#ob-step-2').classList.contains('hidden'));
  check('step-2 scroll reset to top', scrollCalls.some(c => c[0] === 0 && c[1] === 0) && view.scrollTop === 0,
    JSON.stringify(scrollCalls));
  check('kicker says "2 of 2"', $('#ob-step-2 .ob-kicker').textContent.trim() === '2 of 2');
  check('step 3 still hidden on step 2', $('#ob-step-3').classList.contains('hidden'));

  // pick interests (weekend-event categories first), Continue → deck directly (no step 3)
  const catTiles = $$('#ob-cat-grid .cat-tile');
  const picked = catTiles.filter(t => wkCats.includes(t.getAttribute('data-cat')));
  (picked.length ? picked : catTiles.slice(0, 2)).slice(0, 2).forEach(t => t.click());
  $('#ob-next-2').click();
  await new Promise(r => setTimeout(r, 800));
  check('Continue on step 2 goes straight to aha/deck (step 3 skipped)',
    $('#view-aha').classList.contains('active') || $('#view-deck').classList.contains('active'));

  // ---- 3. aha cards: photos first, art behind, no emoji ----
  await new Promise(r => setTimeout(r, 400));
  const ahaCards = $$('#aha-cards .aha-card');
  check('aha stack has cards', ahaCards.length > 0, 'none');
  const firstImgs = ahaCards.slice(0, 3).map(c => c.querySelector('.aha-photo'));
  check('aha leads with photo cards', firstImgs.every(p => p && /url\(/.test(p.style.backgroundImage)),
    'top-3 missing photo divs');
  check('every aha card has art layer behind photo',
    ahaCards.every(c => c.querySelector('.cat-art')), 'some lack .cat-art');
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const relRe = /TODAY|TOMORROW|IN \d+ DAYS|ON NOW/;
  const ahaHTML = $('#aha-cards').innerHTML;
  check('no emoji anywhere in aha stack', !emojiRe.test(ahaHTML), 'emoji found');

  // start exploring → discover home (mosaic default)
  const startBtn = $('#aha-go');
  if (startBtn) { startBtn.click(); await new Promise(r => setTimeout(r, 700)); }
  check('discover view reached', $('#view-discover').classList.contains('active'));
  check('view switcher has 5 views', $$('#dsc-switch button').length === 5,
    'found ' + $$('#dsc-switch button').length);
  check('deck header moved into discover', !!$('#dsc-head-slot .deck-nav'), 'deck-nav missing');

  // ---- 3a. mosaic: tiles, hero, every tile has an image layer ----
  const tiles = $$('#dp-mosaic .mz-tile');
  check('mosaic has tiles', tiles.length > 0, 'none');
  check('mosaic has hero tile', !!$('#dp-mosaic .mz-tile.hero'), 'no hero');
  check('every mosaic tile has an image layer',
    tiles.length > 0 && tiles.every(t => {
      const d = t.querySelector('.dimg');
      return d && /url\(/.test(d.style.backgroundImage);
    }), 'some tiles lack .dimg background');
  check('mosaic tiles show countdown pills',
    $$('#dp-mosaic .dpill').length > 0 && $$('#dp-mosaic .dpill').every(p => relRe.test(p.textContent)),
    'pill text off');
  check('no emoji in mosaic', !emojiRe.test($('#dp-mosaic').innerHTML), 'emoji found');
  // tile opens detail sheet, history-back closes it
  const tileTitle = tiles[0].querySelector('h3').textContent;
  tiles[0].click();
  await new Promise(r => setTimeout(r, 200));
  check('mosaic tile opens detail sheet',
    !$('#detail-sheet').classList.contains('hidden') && $('#detail-sheet').textContent.includes(tileTitle),
    'sheet did not open');
  window.history.back();
  await new Promise(r => setTimeout(r, 300));
  check('sheet closed via history (mosaic)', $('#detail-sheet').classList.contains('hidden'));
  // save toggle from a mosaic tile
  const mzSave = $('#dp-mosaic [data-save]');
  if(mzSave){
    const wasSaved = mzSave.classList.contains('saved');
    mzSave.click();
    await new Promise(r => setTimeout(r, 100));
    check('mosaic save button toggles', mzSave.classList.contains('saved') !== wasSaved);
    mzSave.click(); // restore
    await new Promise(r => setTimeout(r, 100));
  }

  // ---- 3b. week view ----
  $('#dsc-switch button[data-v="week"]').click();
  await new Promise(r => setTimeout(r, 400));
  check('week pane active', $('#dp-week').classList.contains('on'));
  const wdays = $$('#dp-week .wk-day');
  const wrows = $$('#dp-week .wk-row');
  check('week has day headers', wdays.length > 0, 'none');
  check('week has event rows', wrows.length > 0, 'none');
  check('every week row has an image layer',
    wrows.length > 0 && wrows.every(r => r.querySelector('.dimg') && /url\(/.test(r.querySelector('.dimg').style.backgroundImage)),
    'some rows lack image');
  check('weekend days tagged', wdays.some(d => /weekend/.test(d.textContent)), 'no weekend tag');
  if(wrows.length){
    const rt = wrows[0].querySelector('h3').textContent;
    wrows[0].click();
    await new Promise(r => setTimeout(r, 200));
    check('week row opens detail sheet',
      !$('#detail-sheet').classList.contains('hidden') && $('#detail-sheet').textContent.includes(rt),
      'sheet did not open');
    window.history.back();
    await new Promise(r => setTimeout(r, 300));
  }

  // ---- 3c. stories view ----
  $('#dsc-switch button[data-v="stories"]').click();
  await new Promise(r => setTimeout(r, 400));
  check('stories pane active', $('#dp-stories').classList.contains('on'));
  const dsts = $$('#dp-stories .dst');
  check('stories has cards', dsts.length > 0, 'none');
  check('first story marked seen (animations armed)', !!$('#dp-stories .dst.seen'), 'no .seen');
  check('every story has an image layer',
    dsts.length > 0 && dsts.every(s => s.querySelector('.dimg') && /url\(/.test(s.querySelector('.dimg').style.backgroundImage)),
    'some stories lack image');
  check('stories have Details + Save CTAs',
    dsts.every(s => s.querySelector('[data-story-open]') && s.querySelector('[data-save]')), 'CTA missing');
  const stOpen = dsts[0].querySelector('[data-story-open]');
  stOpen.click();
  await new Promise(r => setTimeout(r, 200));
  check('story Details opens detail sheet', !$('#detail-sheet').classList.contains('hidden'));
  window.history.back();
  await new Promise(r => setTimeout(r, 300));

  // ---- 3d. map view (jsdom: no Leaflet → graceful message) ----
  $('#dsc-switch button[data-v="map"]').click();
  await new Promise(r => setTimeout(r, 400));
  check('map pane active', $('#dp-map').classList.contains('on'));
  check('map degrades gracefully without Leaflet',
    /could not load/i.test($('#dmap-status').textContent), $('#dmap-status').textContent);

  // ---- 3e. deck pane (moved DOM still works) ----
  $('#dsc-switch button[data-v="deck"]').click();
  await new Promise(r => setTimeout(r, 700));
  check('deck pane active', $('#dp-deck').classList.contains('on'));
  const cards = $$('#deck-zone .swipe-card');
  check('deck has cards', cards.length > 0, 'none');
  const deckHTML = $('#deck-zone').innerHTML;
  check('no emoji in deck cards', !emojiRe.test(deckHTML), 'emoji found');
  check('fallback cards use SVG line-icon art (no emoji)',
    $$('#deck-zone .cat-art').every(a => a.querySelector('svg') && !emojiRe.test(a.innerHTML)),
    'bad fallback art');

  // ---- 3f. countdown pills on deck cards ----
  const pills = $$('#deck-zone .card-date-pill').map(p => p.textContent);
  check('deck card pills show countdown label', pills.length > 0 && pills.every(t => relRe.test(t)),
    JSON.stringify(pills.slice(0, 3)));

  // ---- 3g. weekend spotlight ----
  const spot = $('#weekend-spot');
  check('weekend spotlight element exists', !!spot);
  if(spot && !spot.classList.contains('hidden')){
    const wkCards = $$('#weekend-track .wk-card');
    check('spotlight shows 1–3 weekend cards', wkCards.length >= 1 && wkCards.length <= 3,
      'count=' + wkCards.length);
    check('spotlight cards show countdown labels',
      wkCards.every(c => relRe.test(c.querySelector('.wk-s').textContent)),
      'missing rel label');
    const wkTitle = wkCards[0].querySelector('.wk-t').textContent;
    wkCards[0].click();
    await new Promise(r => setTimeout(r, 200));
    check('spotlight card opens detail sheet',
      !$('#detail-sheet').classList.contains('hidden') &&
      $('#detail-sheet').textContent.includes(wkTitle),
      'sheet did not open for ' + wkTitle);
    window.history.back(); // close sheet through the history-owned path (keeps hist consistent)
    await new Promise(r => setTimeout(r, 300));
    check('sheet closed via history', $('#detail-sheet').classList.contains('hidden'));
  } else {
    check('spotlight visible (prefs were chosen to match weekend events)', false, 'spot hidden');
  }

  // ---- 3h. deck search button → list view with search focused ----
  const btnSearch = $('#btn-search');
  check('deck header has search button', !!btnSearch);
  if(btnSearch){
    btnSearch.click();
    await new Promise(r => setTimeout(r, 400));
    check('search button opens All events list', $('#view-list').classList.contains('active'));
    check('search input focused on open', window.document.activeElement === $('#list-search'),
      'activeElement=' + (window.document.activeElement && window.document.activeElement.id));
    // search actually filters: type a query, rows shrink
    const allRows = $$('#event-list .ev-row').length;
    const si = $('#list-search');
    si.value = 'PFL MENA';
    si.dispatchEvent(new window.Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    const qRows = $$('#event-list .ev-row');
    check('search filters the list', qRows.length > 0 && qRows.length < allRows,
      'all=' + allRows + ' q=' + qRows.length);
    check('search result shows countdown', qRows.every(r => relRe.test(r.querySelector('.ev-sub').textContent.toUpperCase())),
      'ev-sub missing rel label');
    window.history.back(); // return to deck for the remind-me checks below
    await new Promise(r => setTimeout(r, 300));
  }

  // ---- 4. remind-me nudge: popup (not toast), shows every time, closable ----
  // not-installed state: matchMedia stub returns false, navigator.standalone undefined
  // open detail via the real UI path: click the top deck card
  const topCard = $('.swipe-card.top') || $('.swipe-card');
  check('deck has a clickable card', !!topCard);
  if (topCard) {
    topCard.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 200));
    const bell = $('#sheet-remind-btn');
    check('detail sheet opened with Remind me button', !!bell && !$('#detail-sheet').classList.contains('hidden'));
    bell.click();
    await new Promise(r => setTimeout(r, 150));
    check('remind-me shows POPUP modal', !!$('.modal-overlay'), 'no .modal-overlay');
    check('popup has Not now (closable)', !!$('#nudge-close'), 'no nudge-close');
    check('popup has Continue anyway', !!$('#nudge-continue'), 'no nudge-continue');
    // close via Not now, tap again → popup appears AGAIN (every-time logic)
    $('#nudge-close').click();
    await new Promise(r => setTimeout(r, 100));
    check('popup closes on Not now', !$('.modal-overlay'));
    bell.click();
    await new Promise(r => setTimeout(r, 150));
    check('popup shows again on 2nd tap (every-time nudge)', !!$('.modal-overlay'), 'blocked 2nd time');
    check('no emoji in nudge popup', !emojiRe.test($('.modal-overlay').innerHTML), 'emoji found');
    // close by tapping outside
    const pop = $('.modal-overlay');
    pop.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    check('popup closes on outside tap', !$('.modal-overlay'));
    $('#detail-sheet').classList.add('hidden');
    $('#sheet-backdrop').classList.add('hidden');
  }

  // ---- 13. map basemap + pin fallbacks (live-QA regressions, 2026-09-30) ----
  check('discovery map uses keyless Esri dark tiles (not CARTO)',
    dscSrc.includes('server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base') &&
    !dscSrc.includes('basemaps.cartocdn.com'));
  check('discovery map keeps tile attribution visible',
    dscSrc.includes('attributionControl:true') && dscSrc.includes('OpenStreetMap contributors'));
  check('pin HTML layers category art under remote photo (no blank pins)',
    dscSrc.includes("\\'),url(\\'"));
  check('stories pane has keyboard navigation (arrows)',
    dscSrc.includes("$('#dst-wrap')") && dscSrc.includes('scrollIntoView'));
  check('attribution styled subtle in discover.css',
    fs.readFileSync(path.join(FRONT, 'discover.css'), 'utf8').includes('.leaflet-control-attribution'));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(2); });
