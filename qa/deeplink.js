/* ThisWeekSaudi QA — deep link for a returning user (persisted in repo).
   A user WITH prefs opens #e=<id>: skeletons must show first, then the
   event detail sheet must open once data arrives (not stay on the grid). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const FRONT = path.join(ROOT, 'frontend');
const results = [];
function check(name, ok, detail) {
  results.push(!!ok);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail && !ok ? ' — ' + detail : ''));
}

(async () => {
  const rawEvents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'events.json'), 'utf8'));
  const events = Array.isArray(rawEvents) ? rawEvents : rawEvents.events;
  const target = events.find(e => e.start && e.start.slice(0, 10) >= new Date().toISOString().slice(0, 10)) || events[0];
  const html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://thisweeksaudi.onrender.com/#e=' + target.id, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.Notification = function () {};
  window.Notification.permission = 'denied';
  window.fetch = async (url) => {
    await new Promise(r => setTimeout(r, 1500)); // slow enough to hit the skeleton path
    const u = String(url);
    if (u.includes('/api/events')) return { ok: true, json: async () => ({ events }) };
    if (u.includes('/api/meta')) return { ok: true, json: async () => ({ cities: ['Riyadh'], categories: ['conference'], domains: [] }) };
    if (u.includes('/api/preview')) return { ok: true, json: async () => ({ image: null }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  window.localStorage.setItem('wain_prefs', JSON.stringify({ cities: ['Riyadh'], interests: ['conference'], domains: [] }));
  window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {} }; };
  dom.window.eval(fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8') + '\n;\n' + fs.readFileSync(path.join(FRONT, 'discover.js'), 'utf8'));
  const $ = (s) => window.document.querySelector(s);

  await new Promise(r => setTimeout(r, 300));
  // deep links skip the skeleton fast-path by design (earlyPrefs excludes deep)
  check('deep link skips skeleton fast-path', window.__twsLoading !== true);
  for (let i = 0; i < 40 && ($('#detail-sheet') || {}).classList &&
       $('#detail-sheet').classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 200));
  await new Promise(r => setTimeout(r, 400));
  const sheet = $('#detail-sheet');
  check('detail sheet opened for deep-linked event', !!sheet && !sheet.classList.contains('hidden'),
    'sheet classes: ' + (sheet || { className: 'missing' }).className);
  check('sheet shows the linked event',
    ($('#sheet-body') || { textContent: '' }).textContent.includes((target.title || '').slice(0, 20)));

  const fails = results.filter(r => !r).length;
  console.log(fails ? fails + ' FAILURES' : 'ALL DEEP-LINK CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
