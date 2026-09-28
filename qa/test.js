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
  check('SW cache version bumped to tws-v3', sw.includes("const V = 'tws-v3'"));
  check('SW app shell is network-first (no stale code on phones)',
    !sw.includes('cache first, then network') && sw.includes('network first for'),
    'shell still cache-first');

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
  dom.window.eval(appSrc); // IIFE auto-boots (readyState is 'complete')
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

  // scroll position carry-over: scroll step 1 down, go to step 2, must reset
  const view = $('#view-onboard');
  window.scrollTo(0, 0); scrollCalls = [];
  const cityBtn = $$('#ob-city-list button')[0];
  cityBtn.click();
  await new Promise(r => setTimeout(r, 50));
  $('#ob-next-1').click(); // Continue → step 2
  await new Promise(r => setTimeout(r, 50));
  check('step 2 shown after city pick', !$('#ob-step-2').classList.contains('hidden'));
  check('step-2 scroll reset to top', scrollCalls.some(c => c[0] === 0 && c[1] === 0) && view.scrollTop === 0,
    JSON.stringify(scrollCalls));
  check('kicker says "2 of 2"', $('#ob-step-2 .ob-kicker').textContent.trim() === '2 of 2');
  check('step 3 still hidden on step 2', $('#ob-step-3').classList.contains('hidden'));

  // pick interests, Continue → deck directly (no step 3)
  $$('#ob-cat-grid .cat-tile')[0].click();
  $$('#ob-cat-grid .cat-tile')[1].click();
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
  const ahaHTML = $('#aha-cards').innerHTML;
  check('no emoji anywhere in aha stack', !emojiRe.test(ahaHTML), 'emoji found');

  // start swiping → home deck
  const startBtn = $('#aha-go');
  if (startBtn) { startBtn.click(); await new Promise(r => setTimeout(r, 700)); }
  check('deck view reached', $('#view-deck').classList.contains('active'));
  const cards = $$('#deck-zone .swipe-card');
  check('deck has cards', cards.length > 0, 'none');
  const deckHTML = $('#deck-zone').innerHTML;
  check('no emoji in deck cards', !emojiRe.test(deckHTML), 'emoji found');
  check('fallback cards use SVG line-icon art (no emoji)',
    $$('#deck-zone .cat-art').every(a => a.querySelector('svg') && !emojiRe.test(a.innerHTML)),
    'bad fallback art');

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

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(2); });
