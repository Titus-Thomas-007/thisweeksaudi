/* ThisWeekSaudi — Discover: 4-pane home (Mosaic / Week / Map / Stories) + Deck.
   Loads after app.js; uses the window.TWS surface it exposes (state, helpers,
   openDetail, geocode…). app.js delegates enterDeck here via __twsEnterDeck. */

(function(){
'use strict';
/* app.js exposes its internals via window.TWS (see bottom of app.js) */
var T = window.TWS || {};
var $ = T.$, $$ = T.$$, esc = T.esc, state = T.state,
    storeGet = T.storeGet, storeSet = T.storeSet,
    dstr = T.dstr, localISO = T.localISO, datePill = T.datePill,
    niceDate = T.niceDate, fmtPrice = T.fmtPrice,
    filteredEvents = T.filteredEvents, rankedEvents = T.rankedEvents,
    weekendRange = T.weekendRange, openDetail = T.openDetail,
    toggleSave = T.toggleSave, buildDeck = T.buildDeck,
    buildList = T.buildList, navTo = T.navTo, showView = T.showView,
    geocode = T.geocode, reduceMotion = T.reduceMotion,
    beacon = T.beacon, decide = T.decide, topCard = T.topCard,
    _pushHist = T._pushHist, _replaceHist = T._replaceHist,
    hist = T.hist, toast = T.toast, catLabel = T.catLabel, siteFooterHTML = T.siteFooterHTML;

var VIEWS = [
  {id:'mosaic',  label:'Mosaic'},
  {id:'week',    label:'Week'},
  {id:'map',     label:'Map'},
  {id:'stories', label:'Stories'}
];
var DSC = {
  view: (typeof storeGet === 'function' && storeGet('tws_dview')) || 'mosaic',
  shellBuilt:false, dirty:true, built:{},
  io:null, map:null, mapPlotted:false, storyIO:null,
  userLL:null, filters:{price:'all', date:'all', cat:'', city:''}
};
if(!VIEWS.some(function(v){return v.id===DSC.view;})) DSC.view = 'mosaic';

/* true while boot() is still fetching /api/events (cold start) — panes render skeletons */
function loading(){ return !!window.__twsLoading; }
function loadFailed(){ return !!window.__twsLoadError && !state.events.length; }
function loadErrorHTML(){
  return '<div class="dsc-constrain"><div class="dsc-empty"><b>Couldn\'t load events</b>' +
    'Check your connection, then try again.<br><br>' +
    '<button class="btn-gold" onclick="location.reload()" style="padding:12px 28px">Retry</button></div></div>';
}
/* event added in the last 72h → freshness badge */
function isNew(ev){
  if(!ev || !ev.added_at) return false;
  var t = new Date(String(ev.added_at).slice(0,10) + 'T00:00:00').getTime();
  if(!isFinite(t)) return false;
  var age = Date.now() - t;
  return age >= 0 && age < 72 * 3600 * 1000;
}
function newBadgeHTML(ev){ return isNew(ev) ? '<span class="dnew">New</span>' : ''; }
/* haversine km between [lat,lon] pairs — for "x km away" labels */
function kmBetween(a, b){
  var R = 6371, dLa = (b[0]-a[0]) * Math.PI/180, dLo = (b[1]-a[1]) * Math.PI/180;
  var s = Math.pow(Math.sin(dLa/2), 2) +
    Math.cos(a[0]*Math.PI/180) * Math.cos(b[0]*Math.PI/180) * Math.pow(Math.sin(dLo/2), 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}
/* discovery list = rankedEvents + drawer filters (price / date band / category / city override) */
function discoverList(){
  var f = DSC.filters;
  var cities = null; // null → fall back to prefs cities
  if(f.city === '__all') cities = [];
  else if(f.city) cities = [f.city];
  var list = state.events.filter(function(ev){
    if(state.saved.indexOf(ev.id) !== -1) return false;
    var cs = cities || state.cities;
    if(cs && cs.length && cs.indexOf(ev.city) === -1) return false;
    if(f.cat && ev.category !== f.cat) return false;
    if(state.interests.length && state.interests.indexOf(ev.category) === -1) return false;
    return true;
  });
  /* same ranking as rankedEvents: domain boost, then interest, then soonest */
  var boost = new Set(state.domains);
  list = list.map(function(ev){
    var s = 0;
    if(boost.size && (ev.domains||[]).some(function(d){ return boost.has(d); })) s += 2;
    if(state.interests.indexOf(ev.category) !== -1) s += 1;
    return {ev:ev, s:s};
  }).sort(function(a,b){
    return (b.s - a.s) || String(a.ev.date_start||'zzzz').localeCompare(b.ev.date_start||'zzzz');
  }).map(function(x){ return x.ev; });
  if(f.price === 'free') list = list.filter(function(ev){ return ev.is_free; });
  else if(f.price === 'paid') list = list.filter(function(ev){ return !ev.is_free; });
  if(f.date && f.date !== 'all'){
    var range = weekendRange(), fri = range[0], sat = range[1], wkEnd = addDays(sat, 5);
    list = list.filter(function(ev){
      var d = dstr(ev);
      if(f.date === 'weekend') return d === fri || d === sat;
      if(f.date === 'nextweek') return d > sat && d <= wkEnd;
      return d > wkEnd;
    });
  }
  return list;
}
function filtersActive(){
  var f = DSC.filters;
  return f.price !== 'all' || f.date !== 'all' || !!f.cat || !!f.city;
}
function applyFilters(){
  DSC.dirty = true; DSC.built = {};
  try{ beacon('dfilter', {f: JSON.stringify(DSC.filters)}); }catch(e){}
  buildPane(DSC.view);
  renderDrawerCounts();
  $('#dsc-filter').classList.toggle('active', filtersActive());
}

/* ---------- helpers ---------- */
function catArtFile(ev){
  var c = String(ev.category || 'other').toLowerCase().replace(/[^a-z]/g,'') || 'other';
  return 'assets/cat-' + c + '.jpg';
}
function dimgHTML(ev){
  var photo = ev.image
    ? '<img src="' + esc(ev.image) + '" alt="" loading="lazy" onerror="this.remove()">'
    : '';
  return '<div class="dimg" style="background-image:url(\'' + catArtFile(ev) + '\')">' +
    photo + '<div class="shade"></div></div>';
}
function saveBtnHTML(ev){
  var on = state.saved.indexOf(ev.id) !== -1;
  return '<button class="dsave' + (on ? ' saved' : '') + '" data-save="' + ev.id + '" aria-label="Save event">' +
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="' + (on ? 'currentColor' : 'none') + '"' +
    ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>';
}
function pillHTML(ev){
  var today = dstr(ev) === localISO(new Date());
  return '<span class="dpill' + (today ? ' today' : '') + '">' + datePill(ev) + '</span>';
}
function metaLine(ev){
  var v = esc(ev.venue || ev.city || '');
  var pr = fmtPrice(ev);
  return '<p class="v">' + v + '</p>' +
    (pr && pr !== 'TBA' ? '<p class="pr">' + esc(pr) + '</p>' : '');
}
function addDays(iso, n){
  var p = iso.split('-'), d = new Date(+p[0], +p[1]-1, +p[2]);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
var DNAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
var MNAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function dayLabel(iso){
  var p = iso.split('-'), dt = new Date(+p[0], +p[1]-1, +p[2]);
  return DNAMES[dt.getDay()] + ' · ' + MNAMES[+p[1]-1] + ' ' + (+p[2]);
}
function isWeekend(iso){
  var p = iso.split('-'), dt = new Date(+p[0], +p[1]-1, +p[2]);
  var g = dt.getDay(); return g === 5 || g === 6;
}

/* scroll-reveal within a pane */
function armReveal(pane){
  if(DSC.io) DSC.io.disconnect();
  if(typeof IntersectionObserver === 'undefined' || (reduceMotion && reduceMotion())){
    $$('[data-rv]', pane).forEach(function(el){ el.classList.add('in'); });
    return;
  }
  DSC.io = new IntersectionObserver(function(es){
    es.forEach(function(e){
      if(e.isIntersecting){ e.target.classList.add('in'); DSC.io.unobserve(e.target); }
    });
  }, {root: pane, threshold: .1});
  $$('[data-rv]:not(.in)', pane).forEach(function(el){ DSC.io.observe(el); });
}

/* ---------- shell: move deck DOM under discover ---------- */
function buildShell(){
  if(DSC.shellBuilt) return; DSC.shellBuilt = true;
  var deck = $('#view-deck');
  var nav = $('.deck-nav', deck);
  if(nav) $('#dsc-head-slot').appendChild(nav);
  var dpDeck = $('#dp-deck');
  ['#weekend-spot', '#deck-zone', '.deck-progress', '.deck-controls', '#deck-browse-all'].forEach(function(sel){
    var n = $(sel, deck); if(n) dpDeck.appendChild(n);
  });
}

/* ---------- view switching ---------- */
function setDView(id, noAnim){
  if(!VIEWS.some(function(v){return v.id===id;})) id = 'mosaic';
  DSC.view = id; storeSet('tws_dview', id);
  $$('#dsc-switch button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === id); });
  $$('.dpane').forEach(function(p){ p.classList.remove('on'); });
  var pane = $('#dp-' + id);
  if(noAnim) pane.classList.add('noanim');
  pane.classList.add('on');
  if(noAnim) setTimeout(function(){ pane.classList.remove('noanim'); }, 60);
  buildPane(id);
  if(id === 'map' && DSC.map) setTimeout(function(){ DSC.map.invalidateSize(); }, 90);
  try{ beacon('dview', {id: id}); }catch(e){}
}

function buildPane(id){
  if(DSC.built[id] && !DSC.dirty) { if(id==='mosaic'||id==='week'||id==='stories') armReveal($('#dp-'+id)); return; }
  if(id === 'mosaic') buildMosaic();
  else if(id === 'week') buildWeek();
  else if(id === 'map') buildMap();
  else if(id === 'stories') buildStories();
  else if(id === 'deck'){ if(typeof buildDeck === 'function') buildDeck(); }
  DSC.built[id] = true;
  if(id !== 'map') DSC.dirty = false;
}

/* main entry — app.js delegates enterDeck here via window.__twsEnterDeck */
function enterDiscover(first, replace){
  buildShell();
  DSC.dirty = true;
  var id = 'view-discover';
  if(first || !hist.length) _replaceHist({kind:'view', id: id});
  else if(replace) _replaceHist({kind:'view', id: id});
  else _pushHist({kind:'view', id: id});
  showView(id, first ? 'fwd' : 'back');
  setDView(DSC.view, true);
  /* cold start: after 4s of skeletons, show the warm "waking up" note */
  if(loading()) setTimeout(function(){
    if(loading()) $('#view-discover').classList.add('waking');
  }, 4000);
}
window.__twsEnterDeck = enterDiscover;
/* called by app.js boot() once /api/events resolves — rebuild panes with real data */
window.__twsDiscoverReady = function(){
  window.__twsLoading = false;
  $('#view-discover').classList.remove('waking');
  DSC.dirty = true; DSC.built = {};
  setDView(DSC.view, true);
};

/* ---------- filter drawer ---------- */
/* NOTE: all HTML is built into strings first and assigned at the end, so a
   throw (bad meta, missing helper) can never leave a half-populated drawer. */
function buildDrawer(){
  var prices = [['all','All'],['free','Free'],['paid','Paid']];
  var dates = [['all','All'],['weekend','This weekend'],['nextweek','Next week'],['later','Later']];
  var phtml = prices.map(function(p){
    return '<button data-fp="' + p[0] + '" class="' + (DSC.filters.price === p[0] ? 'on' : '') + '">' + p[1] + '</button>';
  }).join('');
  var dhtml = dates.map(function(d){
    return '<button data-fd="' + d[0] + '" class="' + (DSC.filters.date === d[0] ? 'on' : '') + '">' + d[1] + '</button>';
  }).join('');
  var cats = (state.meta.categories || []).map(function(c){ return c.key || c; });
  var chtml = '<button class="chip' + (!DSC.filters.cat ? ' on' : '') + '" data-fc="">All</button>' +
    cats.map(function(c){
      return '<button class="chip' + (DSC.filters.cat === c ? ' on' : '') + '" data-fc="' + esc(c) + '">' + esc(catLabel(c)) + '</button>';
    }).join('');
  var cities = state.meta.cities || [];
  var cihtml =
    '<button class="chip' + (!DSC.filters.city ? ' on' : '') + '" data-fcity="">My cities</button>' +
    '<button class="chip' + (DSC.filters.city === '__all' ? ' on' : '') + '" data-fcity="__all">All cities</button>' +
    cities.map(function(c){
      return '<button class="chip' + (DSC.filters.city === c ? ' on' : '') + '" data-fcity="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  $('#dr-price').innerHTML = phtml;
  $('#dr-date').innerHTML = dhtml;
  $('#dr-cats').innerHTML = chtml;
  $('#dr-cities').innerHTML = cihtml;
  renderDrawerCounts();
}
function renderDrawerCounts(){
  var el = $('#dr-count'); if(!el) return;
  var n = discoverList().length;
  el.innerHTML = '<b>' + n + '</b> event' + (n === 1 ? '' : 's') + ' match' + (filtersActive() ? ' · <button class="link-quiet" id="dr-count-clear" style="font-size:12.5px">clear filters</button>' : '');
  var cc = $('#dr-count-clear', el);
  if(cc) cc.addEventListener('click', clearFilters);
}
function clearFilters(){
  DSC.filters = {price:'all', date:'all', cat:'', city:''};
  buildDrawer();
  applyFilters();
}
function openDrawer(){
  buildDrawer();
  $('#dsc-drawer-bg').classList.remove('hidden');
  $('#dsc-drawer').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDrawer(){
  $('#dsc-drawer-bg').classList.add('hidden');
  $('#dsc-drawer').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---------- MOSAIC ---------- */
function skelMosaicHTML(){
  var t = '';
  for(var i = 0; i < 6; i++) t += '<div class="mz-tile skel' + (i === 0 ? ' hero' : '') + '"></div>';
  return '<div class="dsc-constrain"><div class="mz-sec">Loading your week…</div><div class="mz-grid">' + t + '</div>' +
    '<div class="wake-note"><b>Waking up the server</b>This can take ~30 seconds after idle. Hang tight.</div></div>';
}
function buildMosaic(){
  var pane = $('#dp-mosaic');
  if(loadFailed()){ pane.innerHTML = loadErrorHTML(); return; }
  if(loading()){ pane.innerHTML = skelMosaicHTML(); return; }
  var list = discoverList();
  var range = weekendRange(), fri = range[0], sat = range[1];
  var secs = [
    {title:'This weekend', sub:'Friday – Saturday', items:[]},
    {title:'Next week', sub:'Sunday – Thursday', items:[]},
    {title:'Later', sub:'Beyond next week', items:[]}
  ];
  list.forEach(function(ev){
    var d = dstr(ev);
    if(d === fri || d === sat) secs[0].items.push(ev);
    else if(d > sat && d <= addDays(sat, 5)) secs[1].items.push(ev);
    else secs[2].items.push(ev);
  });
  var caps = [12, 12, 12], html = '', ti = 0;
  secs.forEach(function(sec, si){
    var items = sec.items.slice(0, caps[si]);
    if(!items.length) return;
    html += '<div class="mz-sec">' + sec.title + '<small>' + sec.sub + ' · ' + sec.items.length + ' events</small></div><div class="mz-grid">';
    items.forEach(function(ev, i){
      /* tall tiles only when 3+ items follow in the same section — otherwise the
         tile's second row overhangs with black space beside it (mosaic gap) */
      var cls = (si === 0 && i === 0) ? 'hero' : ((ti % 5 === 3 && i < items.length - 3) ? 'tall' : '');
      html += '<div class="mz-tile ' + cls + '" data-ev="' + ev.id + '" data-rv style="--d:' + ((ti % 8) * 45) + 'ms">' +
        dimgHTML(ev) + saveBtnHTML(ev) +
        '<div class="mz-meta">' + pillHTML(ev) + newBadgeHTML(ev) + '<h3>' + esc(ev.title) + '</h3>' + metaLine(ev) + '</div></div>';
      ti++;
    });
    html += '</div>';
  });
  if(!ti) html = '<div class="dsc-empty"><b>Nothing matches</b>Try widening your cities or interests.</div>';
  else html += '<div style="text-align:center;margin-top:22px"><button class="link-quiet" id="dsc-browse-all">Browse all events →</button></div>';
  pane.innerHTML = '<div class="dsc-constrain">' + html + siteFooterHTML() + '</div>';
  var ba = $('#dsc-browse-all', pane);
  if(ba) ba.addEventListener('click', function(){ buildList(); navTo('view-list', 'fwd'); });
  armReveal(pane);
}

/* ---------- WEEK ---------- */
function skelWeekHTML(){
  var t = '';
  for(var i = 0; i < 6; i++)
    t += '<div class="skel-row"><div class="b skel skel-th"></div><div class="skel-lines">' +
      '<div class="b skel skel-bar" style="width:72%"></div><div class="b skel skel-bar" style="width:46%"></div></div></div>';
  return '<div class="dsc-constrain"><div style="padding:14px 2px 4px"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">Your week</div></div>' +
    t + '<div class="wake-note"><b>Waking up the server</b>This can take ~30 seconds after idle. Hang tight.</div></div>';
}
function buildWeek(){
  var pane = $('#dp-week');
  if(loadFailed()){ pane.innerHTML = loadErrorHTML(); return; }
  if(loading()){ pane.innerHTML = skelWeekHTML(); return; }
  var list = discoverList();
  var byDay = {};
  list.forEach(function(ev){
    var d = dstr(ev); if(!d) return;
    (byDay[d] = byDay[d] || []).push(ev);
  });
  var days = Object.keys(byDay).sort().slice(0, 21);
  var html = '', ri = 0;
  days.forEach(function(d){
    var items = byDay[d];
    html += '<div class="wk-day"><b>' + dayLabel(d) + '</b>' +
      (isWeekend(d) ? '<span class="we">weekend</span>' : '') +
      '<span class="dpill' + (d === localISO(new Date()) ? ' today' : '') + '">' + datePill(items[0]) + '</span></div>';
    items.forEach(function(ev){
      html += '<div class="wk-row" data-ev="' + ev.id + '" data-rv style="--d:' + ((ri % 6) * 40) + 'ms">' +
        '<div class="wk-th">' + dimgHTML(ev) + '</div>' +
        '<div class="wk-inf"><span class="dcat">' + esc(ev.category || '') + '</span>' + newBadgeHTML(ev) + '<h3>' + esc(ev.title) + '</h3>' +
        '<div class="m">' + esc(ev.venue || ev.city || '') +
        (fmtPrice(ev) && fmtPrice(ev) !== 'TBA' ? ' · <span class="pr">' + esc(fmtPrice(ev)) + '</span>' : '') +
        '</div></div>' +
        '<div class="wk-go">→</div></div>';
      ri++;
    });
  });
  if(!days.length) html = '<div class="dsc-empty"><b>Nothing matches</b>Try widening your cities or interests.</div>';
  pane.innerHTML = '<div class="dsc-constrain"><div style="padding:14px 2px 4px"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">Your week</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:4px">Everything at once, soonest first</div></div>' + html + siteFooterHTML() + '</div>';
  armReveal(pane);
}

/* ---------- MAP ---------- */
function dPinHTML(ev, i){
  /* layered backgrounds: if the remote photo fails to load, the category
     artwork underneath still shows — a pin never renders blank */
  var art = catArtFile(ev);
  var bg = ev.image
    ? 'background-image:url(\'' + ev.image.replace(/'/g,'') + '\'),url(\'' + art + '\')'
    : 'background-image:url(\'' + art + '\')';
  return '<div class="dpin" data-pini="' + i + '" style="' + bg + ';--d:' + Math.min(i * 35, 1200) + 'ms"></div>';
}
function buildMap(){
  var pane = $('#dp-map');
  if(!DSC.map){
    if(typeof L === 'undefined'){ $('#dmap-status').textContent = 'Map could not load'; return; }
    DSC.map = L.map('dmap', {zoomControl:false, attributionControl:true}).setView([24.65, 46.68], 6);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri, HERE, Garmin, OpenStreetMap contributors'
    }).addTo(DSC.map);
    /* same-venue pins cluster into a count badge; tapping expands them (spiderfy) */
    DSC.cluster = L.markerClusterGroup({
      showCoverageOnHover:false, maxClusterRadius:52, spiderfyOnMaxZoom:true,
      iconCreateFunction:function(c){
        return L.divIcon({className:'', html:'<div class="dclust">' + c.getChildCount() + '</div>', iconSize:[46,46], iconAnchor:[23,23]});
      }
    });
    DSC.map.addLayer(DSC.cluster);
    DSC.map.on('movestart', function(){ DSC.touched = true; });
    /* location permission granted → drop a "you are here" dot and zoom to them */
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){
        if(!DSC.map) return;
        var ll = [pos.coords.latitude, pos.coords.longitude];
        DSC.userLL = ll;
        L.circleMarker(ll, {radius:8, color:'#fff', weight:2, fillColor:'#2b7fff', fillOpacity:1})
          .addTo(DSC.map).bindPopup('You are here');
        DSC.userCentered = true;
        DSC.map.setView(ll, 11);
      }, function(){}, {timeout:8000, maximumAge:600000});
    }
    setTimeout(function(){ DSC.map.invalidateSize(); }, 120);
  } else {
    setTimeout(function(){ DSC.map.invalidateSize(); }, 60);
  }
  /* near-me: re-center on the user without yanking them anywhere else */
  var nm = $('#dmap-nearme');
  if(nm && !nm._wired){
    nm._wired = true;
    nm.addEventListener('click', function(){
      try{ beacon('nearme', {}); }catch(e){}
      if(DSC.userLL){ DSC.map.setView(DSC.userLL, 13); return; }
      if(navigator.geolocation){
        nm.style.opacity = '.5';
        navigator.geolocation.getCurrentPosition(function(pos){
          nm.style.opacity = '';
          var ll = [pos.coords.latitude, pos.coords.longitude];
          DSC.userLL = ll;
          DSC.map.setView(ll, 13);
        }, function(){ nm.style.opacity = ''; toast('Location unavailable'); }, {timeout:8000});
      } else toast('Location unavailable');
    });
  }
  if(loadFailed()){ $('#dmap-status').textContent = 'Could not load events'; return; }
  if(loading()){ $('#dmap-status').textContent = 'Waking up the server…'; return; }
  if(DSC.mapPlotted && !DSC.dirty) return;
  DSC.mapPlotted = true; DSC.dirty = false;
  plotDiscoverMap();
}
async function plotDiscoverMap(){
  var status = $('#dmap-status'), cards = $('#dmap-cards');
  status.style.opacity = 1; status.textContent = 'Plotting events…';
  var list = discoverList().slice(0, 150);
  if(DSC.cluster) DSC.cluster.clearLayers();
  else if(DSC._markers) DSC._markers.forEach(function(m){ DSC.map.removeLayer(m); });
  DSC._markers = []; DSC._pinEvents = [];
  cards.innerHTML = '';
  var n = 0, queue = list.slice();
  var workers = [0,1,2,3].map(function(){
    return (async function(){
      while(queue.length){
        var ev = queue.shift(), ll = null;
        try{ ll = await geocode(ev); }catch(e){}
        if(!ll || !isFinite(ll.lat) || !isFinite(ll.lon)) continue;
        if(DSC.userLL) ev._dist = kmBetween(DSC.userLL, [ll.lat, ll.lon]);
        var i = n++;
        var icon = L.divIcon({className:'', html:dPinHTML(ev, i), iconSize:[46,46], iconAnchor:[23,23]});
        var m = L.marker([ll.lat, ll.lon], {icon:icon});
        DSC.cluster.addLayer(m);
        m.on('click', function(){
          /* expand the cluster if needed so the tapped pin is the one selected */
          DSC.cluster.zoomToShowLayer(m, function(){ selectDPin(i); });
        });
        DSC._markers.push(m); DSC._pinEvents.push(ev);
        var card = document.createElement('div');
        card.className = 'dmap-card'; card.dataset.pini = i;
        card.innerHTML = '<div class="cim">' + dimgHTML(ev) + '</div>' +
          '<div class="cbd">' + pillHTML(ev) + newBadgeHTML(ev) + '<h3>' + esc(ev.title) + '</h3>' +
          '<div class="v">' + esc(ev.venue || ev.city || '') + ' · ' + esc(niceDate(ev)) +
          (ev._dist != null ? ' · <span class="dist">' + ev._dist.toFixed(1) + ' km away</span>' : '') + '</div></div>';
        card.addEventListener('click', function(){
          var evx = DSC._pinEvents[+card.dataset.pini];
          if(evx) openDetail(evx, 'discover');
        });
        cards.appendChild(card);
        if(n % 25 === 0) status.textContent = 'Plotting… ' + n;
      }
    })();
  });
  await Promise.all(workers);
  var head = $('.dmap-head', $('#dp-map'));
  if(head) head.innerHTML = '<h2>' + n + ' events on the map</h2><p>Tap a pin or a card — cards open details</p>';
  if(n && DSC._markers.length && !DSC.touched && !DSC.userCentered){
    var b = L.latLngBounds(DSC._markers.map(function(m){ return m.getLatLng(); }));
    if(b.isValid()) DSC.map.fitBounds(b.pad(0.18));
  }
  status.textContent = n ? n + ' events plotted' : 'No events to plot';
  setTimeout(function(){ status.style.opacity = 0; }, 2200);
  try{ beacon('dmap_plot', {n:n}); }catch(e){}
}
function selectDPin(i){
  var ev = DSC._pinEvents[i]; if(!ev) return;
  $$('#dmap .dpin').forEach(function(p, j){ p.classList.toggle('sel', j === i); });
  $$('#dmap-cards .dmap-card').forEach(function(c){
    var on = +c.dataset.pini === i;
    c.classList.toggle('sel', on);
    if(on) c.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
  });
  /* no map flyTo here — the map stays where the user put it; tapping a pin
     only highlights it and scrolls the card strip to the matching card */
}

/* ---------- STORIES ---------- */
function buildStories(){
  var wrap = $('#dst-wrap');
  if(loadFailed()){ wrap.innerHTML = loadErrorHTML(); return; }
  if(loading()){
    wrap.innerHTML = '<div class="dst skel-full"></div>' +
      '<div class="wake-note" style="position:absolute;left:0;right:0;bottom:40px;z-index:5"><b>Waking up the server</b>This can take ~30 seconds after idle. Hang tight.</div>';
    return;
  }
  var list = discoverList().slice(0, 40);
  if(!list.length){
    wrap.innerHTML = '<div class="dsc-empty"><b>Nothing matches</b>Try widening your cities or interests.</div>';
    return;
  }
  var html = '';
  list.forEach(function(ev, i){
    var on = state.saved.indexOf(ev.id) !== -1;
    var bars = '<div class="bars">';
    for(var b = 0; b < list.length; b++) bars += '<i class="' + (b < i ? 'done' : (b === i ? 'now' : '')) + '"></i>';
    bars += '</div>';
    html += '<div class="dst" data-si="' + i + '">' + dimgHTML(ev) + bars +
      '<div class="dst-count">' + (i+1) + ' / ' + list.length + '</div>' +
      '<div class="dst-meta">' +
      '<div class="dst-t" style="--i:0">' + pillHTML(ev) + newBadgeHTML(ev) + '</div>' +
      '<h3 class="dst-t" style="--i:1">' + esc(ev.title) + '</h3>' +
      '<p class="v dst-t" style="--i:2">' + esc(ev.venue || ev.city || '') +
      (fmtPrice(ev) && fmtPrice(ev) !== 'TBA' ? ' · <span class="pr">' + esc(fmtPrice(ev)) + '</span>' : '') + '</p>' +
      '<div class="dst-cta dst-t" style="--i:3">' +
      '<button class="p" data-story-open="' + ev.id + '">Details</button>' +
      '<button class="g" data-save="' + ev.id + '">' + (on ? '♥ Saved' : '♡ Save') + '</button>' +
      '</div></div></div>';
  });
  wrap.innerHTML = html;
  var pane = $('#dp-stories');
  var amb = $('.ambient', pane);
  if(!amb){ amb = document.createElement('div'); amb.className = 'ambient'; pane.insertBefore(amb, wrap); }
  if(DSC.storyIO) DSC.storyIO.disconnect();
  var setSeen = function(el){
    $$('.dst.seen', wrap).forEach(function(x){ x.classList.remove('seen'); });
    el.classList.add('seen');
    var ev = list[+el.dataset.si];
    if(ev) amb.style.backgroundImage = "url('" + (ev.image || catArtFile(ev)).replace(/'/g,'') + "')";
  };
  DSC.storyIO = null;
  if(typeof IntersectionObserver !== 'undefined'){
    DSC.storyIO = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting && e.intersectionRatio > .55) setSeen(e.target); });
    }, {root: wrap, threshold:[.55]});
    $$('.dst', wrap).forEach(function(el){ DSC.storyIO.observe(el); });
  }
  var first = $('.dst', wrap);
  if(first) setSeen(first);
}

/* ---------- wiring ---------- */
function initDiscover(){
  $('#dsc-switch').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    if(b.id === 'dsc-filter'){ openDrawer(); return; }
    if(b.dataset.v === DSC.view) return;
    setDView(b.dataset.v);
  });
  /* drawer controls */
  $('#dr-close').addEventListener('click', closeDrawer);
  $('#dsc-drawer-bg').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && !$('#dsc-drawer').classList.contains('hidden')) closeDrawer();
  });
  $('#dr-clear').addEventListener('click', clearFilters);
  $('#dsc-drawer').addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    if(b.dataset.fp){ DSC.filters.price = b.dataset.fp; buildDrawer(); applyFilters(); }
    else if(b.dataset.fd){ DSC.filters.date = b.dataset.fd; buildDrawer(); applyFilters(); }
    else if(b.dataset.fc !== undefined){ DSC.filters.cat = b.dataset.fc; buildDrawer(); applyFilters(); }
    else if(b.dataset.fcity !== undefined){ DSC.filters.city = b.dataset.fcity; buildDrawer(); applyFilters(); }
  });
  /* stories touch gestures: horizontal swipe = prev/next story,
     swipe-down at the first story = back to Mosaic */
  var sx = 0, sy = 0;
  var wrap = $('#dst-wrap');
  wrap.addEventListener('touchstart', function(e){
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
  }, {passive:true});
  wrap.addEventListener('touchend', function(e){
    var t = e.changedTouches[0]; if(!t) return;
    var dx = t.clientX - sx, dy = t.clientY - sy;
    var adx = Math.abs(dx), ady = Math.abs(dy);
    if(Math.max(adx, ady) < 70) return;
    if(adx > ady * 1.4){
      var cur = $('.dst.seen', wrap) || $('.dst', wrap); if(!cur) return;
      var sib = dx < 0 ? cur.nextElementSibling : cur.previousElementSibling;
      if(sib && sib.classList.contains('dst'))
        sib.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block:'start'});
    } else if(dy > 110 && wrap.scrollTop <= 4){
      setDView('mosaic');
    }
  }, {passive:true});
  $('#view-discover').addEventListener('click', function(e){
    var sv = e.target.closest('[data-save]');
    if(sv){
      e.stopPropagation();
      var id = sv.dataset.save;
      toggleSave(id);
      var on = state.saved.indexOf(id) !== -1;
      $$('#view-discover [data-save="' + id + '"]').forEach(function(x){
        x.classList.toggle('saved', on);
        var svg = x.querySelector('svg');
        if(svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
        if(x.classList.contains('g')) x.textContent = on ? '♥ Saved' : '♡ Save';
      });
      DSC.dirty = true;
      return;
    }
    var so = e.target.closest('[data-story-open]');
    if(so){
      var evs = state.events.find(function(x){ return x.id === so.dataset.storyOpen; });
      if(evs) openDetail(evs, 'discover');
      return;
    }
    var t = e.target.closest('[data-ev]');
    if(t){
      var ev = state.events.find(function(x){ return x.id === t.dataset.ev; });
      if(ev) openDetail(ev, 'discover');
    }
  });
  /* arrow-key swiping is handled by app.js (it knows the deck pane state);
     stories get their own arrows: left/up = previous, right/down = next */
  document.addEventListener('keydown', function(e){    var storiesOn = $('#view-discover').classList.contains('active') && $('#dp-stories').classList.contains('on');
    if(!storiesOn || state.sheetOpen) return;
    var dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
            : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
    if(!dir) return;
    var wrap = $('#dst-wrap'); if(!wrap) return;
    var cur = $('.dst.seen', wrap) || $('.dst', wrap); if(!cur) return;
    var sib = dir > 0 ? cur.nextElementSibling : cur.previousElementSibling;
    if(sib && sib.classList.contains('dst')){
      e.preventDefault();
      sib.scrollIntoView({behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start'});
    }
  });
}
initDiscover();

})();
