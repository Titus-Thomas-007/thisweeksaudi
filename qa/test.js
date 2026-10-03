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
  check('SW cache version bumped to tws-v9', sw.includes("const V = 'tws-v9'"));
  check('SW app shell is network-first (no stale code on phones)',
    !sw.includes('cache first, then network') && sw.includes('network first for'),
    'shell still cache-first');
  const html0 = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  check('PageSense snippet present in <head>',
    html0.includes('id="pagesenseCode"') && html0.includes('cdn.pagesense.io/js/thisweeksaudi/'),
    'snippet missing from index.html');
  check('backend accepts discovery beacon types (dview/dfilter/nearme/dmap_plot)',
    ['"dview"', '"dfilter"', '"nearme"', '"dmap_plot"'].every(t =>
      fs.readFileSync(path.join(ROOT, 'backend', 'app.py'), 'utf8').includes(t)),
    'allowlist missing new types');

  // ---- 0a. SEO endpoints + bot pages (served live from DB) ----
  const appPy = fs.readFileSync(path.join(ROOT, 'backend', 'app.py'), 'utf8');
  check('backend serves /robots.txt with sitemap reference',
    appPy.includes('@app.get("/robots.txt"') && appPy.includes('/sitemap.xml'),
    'robots.txt route missing');
  check('backend serves /sitemap.xml generated from events DB',
    appPy.includes('@app.get("/sitemap.xml"') && appPy.includes('<urlset'),
    'sitemap.xml route missing');
  check('backend serves /llms.txt for AI crawlers',
    appPy.includes('@app.get("/llms.txt"') && appPy.includes('## Upcoming events'),
    'llms.txt route missing');
  check('event bot page escapes HTML (no XSS via title/desc)',
    appPy.includes('html.escape(title, quote=True)') && appPy.includes('.replace("</", "<\\\\/")'),
    'event_page escaping missing');
  check('homepage has canonical + OG tags',
    html0.includes('rel="canonical"') && html0.includes('og:title') && html0.includes('og:image'),
    'homepage meta tags missing');

  // ---- 0a2. shared footer across views ----
  const appJs = fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8');
  const discJs = fs.readFileSync(path.join(FRONT, 'discover.js'), 'utf8');
  const discCss = fs.readFileSync(path.join(FRONT, 'discover.css'), 'utf8');
  check('siteFooterHTML defined + exported via TWS',
    appJs.includes('function siteFooterHTML()') && appJs.includes('siteFooterHTML,'),
    'footer helper missing');
  check('footer appended in mosaic + week panes and saved view',
    (discJs.match(/siteFooterHTML\(\)/g) || []).length >= 2 && appJs.includes("insertAdjacentHTML('beforeend', siteFooterHTML())"),
    'footer not wired into all views');
  check('footer opens links in new tab (rel=noopener)',
    appJs.includes('rel="noopener"') && appJs.includes('survey.zohopublic.com/zs/jXjaEm'),
    'footer links unsafe or missing');

  // ---- 0a3. filter drawer: desktop hide + dismiss robustness ----
  check('desktop drawer .hidden actually hides (opacity/visibility, not a nudge)',
    discCss.includes('#dsc-drawer.hidden{transform:translate(-50%,54%);opacity:0;visibility:hidden'),
    'desktop drawer still only nudged when closed');
  check('drawer closes on Escape',
    discJs.includes("e.key === 'Escape'") && discJs.includes('closeDrawer()'),
    'Escape handler missing');
  check('buildDrawer assigns innerHTML only after all strings built (no half-populated drawer)',
    discJs.includes("$('#dr-price').innerHTML = phtml;"),
    'buildDrawer not atomic');

  // ---- 0a4. weekend plan sharing (/p/ links) ----
  check('backend serves /p/{ids} plan pages with OG tags + noindex',
    appPy.includes('@app.get("/p/{plan_ids}"') && appPy.includes('content="noindex"') &&
    appPy.includes('Make your own weekend plan'),
    '/p/ route missing or incomplete');
  check('plan page escapes title and caps ids at 6',
    appPy.includes('html.escape(title, quote=True)') && appPy.includes('[:6]'),
    'plan page hardening missing');
  check('saved view has share-weekend-plan flow',
    appJs.includes('id="saved-share"') && appJs.includes('function sharePlan(') &&
    appJs.includes('navigator.share') && appJs.includes('tws_plan_title'),
    'share flow missing from saved view');
  check('plan_share beacon accepted by /api/analytics',
    appPy.includes('"plan_share"'), 'plan_share not in analytics allowlist');

  // ---- 0a5. reminder nudge renders above the detail sheet ----
  check('modal-overlay z-index above detail sheet (410)',
    /modal-overlay\{[^}]*z-index:700/.test(
      fs.readFileSync(path.join(FRONT, 'styles.css'), 'utf8')),
    'nudge popup still behind detail sheet');

  // ---- 0a6. thursday weekend-digest push ----
  check('digest endpoint exists, keyed, broadcasts to all subs',
    appPy.includes('@app.post("/api/push/send-weekend-digest")') &&
    appPy.includes('b.key != INGEST_KEY') &&
    /SELECT endpoint,sub FROM push_subs/.test(appPy),
    'send-weekend-digest route missing or incomplete');
  check("digest excludes last week's picks; thin weekend sends fewer, never repeats",
    appPy.includes('WHERE week < ? ORDER BY week DESC LIMIT 1') &&
    appPy.includes('not in prev_ids'),
    'dedup-against-last-week logic missing');
  check('digest payload deep-links to /#weekend with stable tag',
    appPy.includes('"url": "/#weekend"') && appPy.includes('"tag": "tws-weekend-digest"'),
    'digest payload missing weekend deep link');
  {
    // extract the 5 mascot-voice variants from the DIGEST_COPY block only,
    // render worst-case substitutions, enforce push length limits
    const start = appPy.indexOf('DIGEST_COPY = [');
    const region = appPy.slice(start, appPy.indexOf(']', start));
    const variants = [...region.matchAll(/\{"title": "((?:[^"\\]|\\.)*)",\s*"body": "((?:[^"\\]|\\.)*)"\}/g)]
      .map(x => ({title: x[1], body: x[2]}));
    const unesc = s => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const render = (t, sub) => unesc(t).replace(/\{n\}/g, sub.n).replace(/\{pick\}/g, sub.pick);
    const worst = {n: '888', pick: 'X'.repeat(50)};
    const okCount = variants.length === 5;
    const okNonEmpty = variants.every(v => v.title.trim() && v.body.trim());
    const okLen = variants.every(v => render(v.title, worst).length <= 50 && render(v.body, worst).length <= 150);
    check('5 digest copy variants, non-empty, within push limits (title<=50, body<=150)',
      okCount && okNonEmpty && okLen,
      `variants=${variants.length} nonempty=${okNonEmpty} lengths-ok=${okLen}`);
  }
  check('#weekend deep link pre-seeds discover view+filter',
    discJs.includes("location.hash === '#weekend'") && discJs.includes('__twsShowWeekend'),
    'discover.js #weekend handling missing');
  check('app.js boot + hashchange handle #weekend',
    appJs.includes("location.hash === '#weekend'") && appJs.includes('__twsShowWeekend'),
    'app.js #weekend handling missing');
  check('sw.js honors payload tag so digests replace each other',
    /d\.tag \|\|/.test(fs.readFileSync(path.join(FRONT, 'sw.js'), 'utf8')),
    'sw.js ignores payload tag');
  const appSrc0 = fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8');
  check('relDayLabel helper defined', appSrc0.includes('function relDayLabel('));
  check('weekendRange helper defined (Saudi Fri–Sat)', appSrc0.includes('function weekendRange('));
  check('buildDeck renders weekend spotlight', /function buildDeck\(\)\{[\s\S]*?renderWeekendSpot\(\)/.test(appSrc0),
    'buildDeck missing renderWeekendSpot()');
  check('weekend filter uses Fri–Sat (not Sat–Sun)',
    appSrc0.includes("const [fri, sat] = weekendRange(); // Saudi weekend: Fri–Sat") &&
    !appSrc0.includes('(6 - sat.getDay()'), 'old Sat–Sun calc still present');
  check('deck header has search button', fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8').includes('id="btn-search"'));

  // ---- 0a6. planner mascot (character-agnostic) + save burst + friday reveal ----
  const msrc = fs.readFileSync(path.join(FRONT, 'mascot.js'), 'utf8');
  const htmlIdx = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(FRONT, 'sw.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(FRONT, 'styles.css'), 'utf8');
  check('mascot.js loaded before app.js', htmlIdx.indexOf('mascot.js') !== -1 &&
    htmlIdx.indexOf('mascot.js') < htmlIdx.indexOf('app.js?v='), 'script tag missing/misordered');
  check('mascot.js in SW app shell', swSrc.includes("'/mascot.js'"), 'mascot.js not precached');
  check('TWS_MASCOT exposes react/dismiss/saveBurst/fridayReveal',
    ['react: react', 'dismiss: dismiss', 'saveBurst: saveBurst', 'fridayReveal: fridayReveal']
      .every(k => msrc.includes(k)), 'public surface incomplete');
  check('character art isolated in renderMascotSVG() (yeti head)',
    msrc.includes('function renderMascotSVG()') && msrc.includes('m-face-') &&
    msrc.includes('love:') && msrc.includes('sleepy:') && msrc.includes('m-z'),
    'yeti head missing from renderMascotSVG');
  check('copy bank covers all 7 moods, no sad',
    ['happy:', 'excited:', 'love:', 'surprised:', 'wink:', 'proud:', 'sleepy:'].every(m => {
      const body = msrc.split(m)[1].split(']')[0];
      return (body.match(/"/g) || []).length >= 8;
    }) && !/\bsad:/.test(msrc.split('var COPY')[1].split('};')[0]), 'copy bank wrong');
  check('mood system is container classes for 7 moods',
    ['happy', 'excited', 'love', 'surprised', 'wink', 'proud', 'sleepy'].every(m =>
      cssSrc.includes('.mascot-' + m + ' .mascot-figure')), 'mood CSS missing');
  check('face swapping CSS present for 7 moods',
    ['happy', 'excited', 'love', 'surprised', 'wink', 'proud', 'sleepy'].every(m =>
      cssSrc.includes('.mascot-' + m + ' .m-face-' + m)), 'face-swap CSS missing');
  check('header head mount next to Planner button',
    msrc.includes('tws-mascot-head') && msrc.includes('mountHead') &&
    cssSrc.includes('.mascot-head'), 'header head missing');
  check('dismissal remembered in localStorage (tws_mascot_muted)',
    msrc.includes("tws_mascot_muted"), 'mute memory missing');
  check('reduced-motion respected', msrc.includes('prefers-reduced-motion') && cssSrc.includes('prefers-reduced-motion'),
    'no reduced-motion handling');
  check('toggleSave passes source element for burst + reactions',
    appSrc0.includes('function toggleSave(id, srcEl)') && appSrc0.includes('TWS_MASCOT.saveBurst(srcEl)'),
    'toggleSave not wired');
  check('discover save buttons pass element', fs.readFileSync(path.join(FRONT, 'discover.js'), 'utf8').includes('toggleSave(id, sv)'),
    'discover.js not wired');
  check('friday reveal keyed once-per-day (tws_friday_seen)',
    msrc.includes('tws_friday_seen') && appSrc0.includes('TWS_MASCOT.fridayReveal()'),
    'friday reveal not wired');

  // ---- 1. boot the app in jsdom ----
  const html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  const rawEvents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'events.json'), 'utf8'));
  const events = Array.isArray(rawEvents) ? rawEvents : rawEvents.events;
  // seed added_at to today so the 72h NEW badge renders on every tile in this run
  const todayISO = new Date().toISOString().slice(0, 10);
  events.forEach(e => { e.added_at = todayISO; });
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
  const mascotSrc = fs.readFileSync(path.join(FRONT, 'mascot.js'), 'utf8');
  // single eval: jsdom drops const/let across separate eval() calls, but a real
  // browser shares the global lexical env between classic scripts — one eval mirrors that
  dom.window.eval(mascotSrc + '\n;\n' + appSrc + '\n;\n' + dscSrc); // IIFE auto-boots (readyState is 'complete')
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
  check('view switcher has 4 views (deck removed)', $$('#dsc-switch button[data-v]').length === 4,
    'found ' + $$('#dsc-switch button[data-v]').length);
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

  // ---- 3e. deck view removed from switcher (owner request 2026-09-30) ----
  const tabIds = $$('#dsc-switch button[data-v]').map(b => b.dataset.v);
  check('switcher has exactly 4 tabs', tabIds.length === 4, tabIds.join(','));
  check('switcher tabs are mosaic/week/map/stories (no deck)',
    ['mosaic','week','map','stories'].every(v => tabIds.includes(v)) && !tabIds.includes('deck'),
    tabIds.join(','));
  // a stale persisted 'deck' choice must fall back to mosaic, not a dead pane
  const fakeDeckBtn = window.document.createElement('button');
  fakeDeckBtn.dataset.v = 'deck';
  $('#dsc-switch').appendChild(fakeDeckBtn);
  fakeDeckBtn.click();
  await new Promise(r => setTimeout(r, 300));
  check("stale 'deck' view falls back to mosaic", $('#dp-mosaic').classList.contains('on'));
  fakeDeckBtn.remove();

  // ---- 3f. mosaic never leaves a gap beside a tall tile ----
  check('tall tiles require 3+ following items in their section',
    dscSrc.includes('i < items.length - 3'), 'guard missing');

  // ---- 3g. map: clustering, user-location zoom, no pin-tap flyTo ----
  check('map uses markerClusterGroup with spiderfy for same-venue pins',
    dscSrc.includes('L.markerClusterGroup') && dscSrc.includes('spiderfyOnMaxZoom'));
  check('map zooms to user location when permission granted',
    dscSrc.includes('getCurrentPosition') && dscSrc.includes("bindPopup('You are here')") &&
    dscSrc.includes('setView(ll, 11)'));
  check('pin tap does not yank the map (no flyTo in discovery code)',
    !dscSrc.includes('.flyTo('));
  check('fitBounds skipped after user touch or user-centering',
    dscSrc.includes('!DSC.touched') && dscSrc.includes('!DSC.userCentered'));

  // ---- 3h. cold-start skeleton path (source-level: jsdom boots with instant fetch) ----
  check('boot renders shell before fetch resolves (skeleton path)',
    appSrc0.includes('__twsLoading') && appSrc0.includes('enterDeck(true); // panes render shimmer skeletons'));
  check('discover exposes ready() to swap skeletons for real panes',
    dscSrc.includes('__twsDiscoverReady') && dscSrc.includes('skelMosaicHTML') &&
    dscSrc.includes('skelWeekHTML') && dscSrc.includes('skel-full'));
  check('skeleton shows warm "waking up" message', dscSrc.includes('Waking up the server'));
  check('failed load shows retry state (not endless skeletons)',
    dscSrc.includes('__twsLoadError') && dscSrc.includes('loadErrorHTML'));

  // ---- 3i. NEW badge (72h from added_at) ----
  check('new-badge helper uses 72h window on added_at',
    /72 \* 3600 \* 1000/.test(dscSrc) && dscSrc.includes('newBadgeHTML'));
  check('mosaic tiles render NEW badges', $$('#dp-mosaic .dnew').length > 0,
    'no .dnew in mosaic (added_at seeded to today in harness)');
  check('week rows render NEW badges', $$('#dp-week .dnew').length > 0, 'no .dnew in week');

  // ---- 3j. filter drawer ----
  check('filter button present in switcher', !!$('#dsc-filter'), 'missing');
  $('#dsc-filter').click();
  await new Promise(r => setTimeout(r, 100));
  check('filter button opens drawer', !$('#dsc-drawer').classList.contains('hidden'), 'drawer stayed hidden');
  check('drawer has price/date/category/city sections',
    !!$('#dr-price') && !!$('#dr-date') && !!$('#dr-cats') && !!$('#dr-cities'), 'section missing');
  $('#dsc-drawer [data-fp="free"]').click();
  await new Promise(r => setTimeout(r, 100));
  check('applying a filter marks the button active', $('#dsc-filter').classList.contains('active'), 'not active');
  check('drawer shows match count', /match/.test($('#dr-count').textContent), $('#dr-count').textContent);
  $('#dr-clear').click();
  await new Promise(r => setTimeout(r, 100));
  check('clear-all resets the filter button', !$('#dsc-filter').classList.contains('active'), 'still active');
  $('#dr-close').click();
  await new Promise(r => setTimeout(r, 100));
  check('drawer closes', $('#dsc-drawer').classList.contains('hidden'), 'drawer stayed open');

  // ---- 3k. stories swipe gestures (source-level) ----
  check('stories has touch swipe handlers',
    dscSrc.includes("addEventListener('touchstart'") && dscSrc.includes("addEventListener('touchend'"));
  check('horizontal swipe moves between stories',
    dscSrc.includes('cur.nextElementSibling') && dscSrc.includes('previousElementSibling'), 'nav missing');
  check('swipe-down at first story returns to Mosaic',
    /wrap\.scrollTop <= 4/.test(dscSrc) && dscSrc.includes("setDView('mosaic')"), 'dismiss missing');

  // ---- 3l. map: near-me button ----
  check('map has near-me button', !!$('#dmap-nearme'), 'missing');
  check('near-me re-centers on user location (no auto-open of details)',
    dscSrc.includes("$('#dmap-nearme')") && dscSrc.includes('setView(DSC.userLL, 13)') &&
    !/nearme[\s\S]{0,400}openDetail/.test(dscSrc), 'auto-open or missing');
  check('map cards show distance when location known', dscSrc.includes('km away'));

  // ---- 3m. saved: day-grouped itinerary + share (export-all removed) ----
  const svBtn = $('#dsc-switch [data-v="mosaic"]'); // ensure we're on discover home
  if(svBtn) svBtn.click();
  await new Promise(r => setTimeout(r, 200));
  const mzSave2 = $('#dp-mosaic [data-save]');
  if(mzSave2 && !mzSave2.classList.contains('saved')) mzSave2.click();
  await new Promise(r => setTimeout(r, 200));
  $('#btn-saved').click();
  await new Promise(r => setTimeout(r, 300));
  check('saved view reached', $('#view-saved').classList.contains('active'));
  check('saved events grouped by day', $$('#saved-list .sv-day').length > 0, 'no day groups');
  check('export-all (.ics) removed, share kept', !$('#saved-export-all') && !!$('#saved-share'), 'export still present or share missing');
  check('no multi-event ics builder left', !appSrc0.includes('function downloadICSList('), 'downloadICSList still present');
  window.history.back();
  await new Promise(r => setTimeout(r, 300));

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

  // ---- 14. mascot runtime: mount/react/guardrails/burst/friday (character-agnostic) ----
  const M = window.TWS_MASCOT;
  const wdoc = window.document;
  check('TWS_MASCOT present with full API',
    M && ['react','dismiss','saveBurst','fridayReveal','bootCheck','mountHead','renderMascotSVG'].every(k => typeof M[k] === 'function') &&
    Array.isArray(M.MOODS) && M.MOODS.length === 7 && M.MOODS.indexOf('sad') === -1,
    'API incomplete');
  check('mascot mounts only inside Planner view', (() => {
    const host = wdoc.getElementById('tws-mascot');
    return !host || host.closest('#view-saved');
  })(), 'mounted outside planner');
  // react: happy shows bubble + mood class
  const r1 = M.react('happy', 'qa-happy');
  const mhost = wdoc.getElementById('tws-mascot');
  check('react(happy) shows mascot with mood class + line',
    r1 && mhost && !mhost.classList.contains('hidden') &&
    mhost.classList.contains('mascot-happy') &&
    mhost.querySelector('.tws-mascot-bubble').textContent.length > 5, 'react failed');
  // guardrail: same trigger twice -> second is no-op
  check('trigger fires max once per session', M.react('happy', 'qa-happy') === false, 'repeat not blocked');
  // no-repeat copy: consecutive reacts avoid degenerate repetition
  // (earlier test flows may have consumed some lines of a mood already)
  const seen = new Set();
  for (let i = 0; i < 8; i++) { M.react('happy', 'qa-happy-' + i); seen.add(wdoc.querySelector('.tws-mascot-bubble').textContent); }
  check('copy bank avoids degenerate repetition', seen.size >= 7, 'only ' + seen.size + ' unique');
  // all 7 moods react and set classes on both bubble host and header head
  const moodsOk = M.MOODS.every(m => {
    const ok = M.react(m, 'qa-mood-' + m);
    const hh = wdoc.getElementById('tws-mascot-head');
    return ok && mhost.classList.contains('mascot-' + m) && hh && hh.classList.contains('mascot-' + m);
  });
  check('all 7 moods react on bubble + header head', moodsOk, 'mood react failed');
  // header head is mounted next to the Planner button
  check('header head mounted beside #btn-saved', (() => {
    const hh = wdoc.getElementById('tws-mascot-head');
    const btn = wdoc.getElementById('btn-saved');
    return hh && btn && hh.previousElementSibling === btn && hh.querySelector('.mascot-svg');
  })(), 'head misplaced');
  // face swap: love face group present in SVG markup
  check('SVG carries 7 mood face groups', M.MOODS.every(m => M.renderMascotSVG().includes('m-face-' + m)),
    'face groups missing');
  // dismiss remembers
  M.dismiss();
  check('dismiss hides + remembers mute',
    wdoc.getElementById('tws-mascot').classList.contains('hidden') &&
    window.localStorage.getItem('tws_mascot_muted') === '1', 'dismiss broken');
  check('muted mascot stays silent', M.react('excited', 'qa-muted') === false, 'reacted while muted');
  window.localStorage.removeItem('tws_mascot_muted');
  // save burst spawns particles (reduced-motion off in this env)
  const fakeBtn = wdoc.createElement('button');
  fakeBtn.style.cssText = 'position:fixed;left:100px;top:100px;width:40px;height:40px';
  fakeBtn.getBoundingClientRect = () => ({ left: 100, top: 100, width: 40, height: 40, right: 140, bottom: 140 });
  wdoc.body.appendChild(fakeBtn);
  M.saveBurst(fakeBtn);
  check('saveBurst spawns gold particles', wdoc.querySelectorAll('.tws-particle').length >= 5,
    'no particles');
  fakeBtn.remove();
  // friday reveal: fake a Riyadh Friday (2026-10-02 was a Friday)
  const RealDate = window.Date;
  const friNoon = new RealDate('2026-10-02T12:00:00+03:00').getTime();
  window.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [friNoon])); }
    static now() { return friNoon; }
  };
  window.localStorage.removeItem('tws_friday_seen');
  const f1 = M.fridayReveal();
  const friEl = wdoc.querySelector('.tws-friday');
  check('friday reveal shows once on Riyadh Friday',
    f1 && friEl && friEl.textContent.includes('Your weekend is here') &&
    window.localStorage.getItem('tws_friday_seen') === '2026-10-02', 'reveal failed');
  check('friday reveal does not repeat same day', M.fridayReveal() === false, 'repeated');
  if (friEl) friEl.remove();
  window.Date = RealDate;

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(2); });
