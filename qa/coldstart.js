/* ThisWeekSaudi QA — cold-start skeleton path (persisted in repo).
   Simulates a slow /api/events (Render free-tier wake) with existing prefs:
   shell must render shimmer skeletons immediately, show the warm "waking up"
   note after 4s, then swap skeletons for real panes once data arrives. */
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
  const html = fs.readFileSync(path.join(FRONT, 'index.html'), 'utf8');
  const rawEvents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'events.json'), 'utf8'));
  const events = Array.isArray(rawEvents) ? rawEvents : rawEvents.events;
  const dom = new JSDOM(html, { url: 'https://thisweeksaudi.onrender.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.Notification = function () {};
  window.Notification.permission = 'denied';
  window.fetch = async (url) => {
    await new Promise(r => setTimeout(r, 6000)); // cold start: server still waking
    const u = String(url);
    if (u.includes('/api/events')) return { ok: true, json: async () => ({ events }) };
    if (u.includes('/api/meta')) {
      const cities = [...new Set(events.map(e => e.city).filter(Boolean))];
      const cats = [...new Set(events.map(e => e.category).filter(Boolean))];
      return { ok: true, json: async () => ({ cities, categories: cats, domains: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  // returning user: prefs already in localStorage
  window.localStorage.setItem('wain_prefs', JSON.stringify({ cities: ['Riyadh'], interests: ['conference'], domains: [] }));
  window.Element.prototype.animate = function () { return { finished: Promise.resolve(), cancel() {} }; };

  const appSrc = fs.readFileSync(path.join(FRONT, 'app.js'), 'utf8');
  const dscSrc = fs.readFileSync(path.join(FRONT, 'discover.js'), 'utf8');
  dom.window.eval(appSrc + '\n;\n' + dscSrc);
  const $ = (s) => window.document.querySelector(s);
  const $$ = (s) => [...window.document.querySelectorAll(s)];

  await new Promise(r => setTimeout(r, 400)); // shell rendered, fetch still pending
  check('discover view active during cold start', $('#view-discover').classList.contains('active'));
  check('mosaic shows shimmer skeletons (not blank)', $$('#dp-mosaic .skel').length >= 4,
    'found ' + $$('#dp-mosaic .skel').length);
  check('wake note hidden before 4s', !$('#view-discover').classList.contains('waking'));

  // user taps around while still loading — each pane shows its skeleton
  $('#dsc-switch button[data-v="week"]').click();
  await new Promise(r => setTimeout(r, 100));
  check('week shows shimmer rows during load', $$('#dp-week .skel').length >= 3,
    'found ' + $$('#dp-week .skel').length);
  $('#dsc-switch button[data-v="stories"]').click();
  await new Promise(r => setTimeout(r, 100));
  check('stories shows full-bleed skeleton during load', !!$('#dp-stories .skel-full'));

  await new Promise(r => setTimeout(r, 3800)); // past the 4s wake timer, fetch still pending
  check('wake note appears after 4s ("Waking up the server")',
    $('#view-discover').classList.contains('waking') && /Waking up the server/.test($('#view-discover').textContent));

  for (let i = 0; i < 60 && window.__twsLoading !== false; i++) await new Promise(r => setTimeout(r, 200));
  check('loading flag cleared after fetch', window.__twsLoading === false);
  check('waking class removed after load', !$('#view-discover').classList.contains('waking'));

  // visiting each pane after load must show real content, never stale skeletons
  for (const v of ['mosaic', 'week', 'stories']) {
    $('#dsc-switch button[data-v="' + v + '"]').click();
    await new Promise(r => setTimeout(r, 250));
  }
  check('mosaic rebuilt with real tiles', $$('#dp-mosaic .mz-tile:not(.skel)').length > 0, 'none');
  check('week rebuilt with real rows', $$('#dp-week .wk-row').length > 0, 'none');
  check('stories rebuilt with real cards', $$('#dp-stories .dst:not(.skel-full)').length > 0, 'none');
  check('no skeletons remain in any pane', $$('#view-discover .skel').length === 0 && !$('#dp-stories .skel-full'),
    'skeletons left: ' + $$('#view-discover .skel').length);

  // filters keep working after the swap
  $('#dsc-switch button[data-v="mosaic"]').click();
  await new Promise(r => setTimeout(r, 200));
  const before = $$('#dp-mosaic .mz-tile').length;
  $('#dsc-filter').click();
  await new Promise(r => setTimeout(r, 100));
  $('#dsc-drawer [data-fd="weekend"]').click();
  await new Promise(r => setTimeout(r, 200));
  const after = $$('#dp-mosaic .mz-tile').length;
  check('date filter applies after cold-start swap', after <= before && after > 0, before + ' -> ' + after);

  const fails = results.filter(r => !r).length;
  console.log(fails ? fails + ' FAILURES' : 'ALL COLD-START CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
