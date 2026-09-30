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
    hist = T.hist;

var VIEWS = [
  {id:'mosaic',  label:'Mosaic'},
  {id:'week',    label:'Week'},
  {id:'map',     label:'Map'},
  {id:'stories', label:'Stories'},
  {id:'deck',    label:'Deck'}
];
var DSC = {
  view: (typeof storeGet === 'function' && storeGet('tws_dview')) || 'mosaic',
  shellBuilt:false, dirty:true, built:{},
  io:null, map:null, mapPlotted:false, storyIO:null
};
if(!VIEWS.some(function(v){return v.id===DSC.view;})) DSC.view = 'mosaic';

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
}
window.__twsEnterDeck = enterDiscover;

/* ---------- MOSAIC ---------- */
function buildMosaic(){
  var list = rankedEvents();
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
      var cls = (si === 0 && i === 0) ? 'hero' : ((ti % 5 === 3) ? 'tall' : '');
      html += '<div class="mz-tile ' + cls + '" data-ev="' + ev.id + '" data-rv style="--d:' + ((ti % 8) * 45) + 'ms">' +
        dimgHTML(ev) + saveBtnHTML(ev) +
        '<div class="mz-meta">' + pillHTML(ev) + '<h3>' + esc(ev.title) + '</h3>' + metaLine(ev) + '</div></div>';
      ti++;
    });
    html += '</div>';
  });
  if(!ti) html = '<div class="dsc-empty"><b>Nothing matches</b>Try widening your cities or interests.</div>';
  else html += '<div style="text-align:center;margin-top:22px"><button class="link-quiet" id="dsc-browse-all">Browse all events →</button></div>';
  var pane = $('#dp-mosaic');
  pane.innerHTML = '<div class="dsc-constrain">' + html + '</div>';
  var ba = $('#dsc-browse-all', pane);
  if(ba) ba.addEventListener('click', function(){ buildList(); navTo('view-list', 'fwd'); });
  armReveal(pane);
}

/* ---------- WEEK ---------- */
function buildWeek(){
  var list = rankedEvents();
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
        '<div class="wk-inf"><span class="dcat">' + esc(ev.category || '') + '</span><h3>' + esc(ev.title) + '</h3>' +
        '<div class="m">' + esc(ev.venue || ev.city || '') +
        (fmtPrice(ev) && fmtPrice(ev) !== 'TBA' ? ' · <span class="pr">' + esc(fmtPrice(ev)) + '</span>' : '') +
        '</div></div>' +
        '<div class="wk-go">→</div></div>';
      ri++;
    });
  });
  if(!days.length) html = '<div class="dsc-empty"><b>Nothing matches</b>Try widening your cities or interests.</div>';
  var pane = $('#dp-week');
  pane.innerHTML = '<div class="dsc-constrain"><div style="padding:14px 2px 4px"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em">Your week</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:4px">Everything at once, soonest first</div></div>' + html + '</div>';
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
    setTimeout(function(){ DSC.map.invalidateSize(); }, 120);
  } else {
    setTimeout(function(){ DSC.map.invalidateSize(); }, 60);
  }
  if(DSC.mapPlotted && !DSC.dirty) return;
  DSC.mapPlotted = true; DSC.dirty = false;
  plotDiscoverMap();
}
async function plotDiscoverMap(){
  var status = $('#dmap-status'), cards = $('#dmap-cards');
  status.style.opacity = 1; status.textContent = 'Plotting events…';
  var list = rankedEvents().slice(0, 150);
  if(DSC._markers) DSC._markers.forEach(function(m){ DSC.map.removeLayer(m); });
  DSC._markers = []; DSC._pinEvents = [];
  cards.innerHTML = '';
  var n = 0, queue = list.slice();
  var workers = [0,1,2,3].map(function(){
    return (async function(){
      while(queue.length){
        var ev = queue.shift(), ll = null;
        try{ ll = await geocode(ev); }catch(e){}
        if(!ll || !isFinite(ll.lat) || !isFinite(ll.lon)) continue;
        var i = n++;
        var icon = L.divIcon({className:'', html:dPinHTML(ev, i), iconSize:[46,46], iconAnchor:[23,23]});
        var m = L.marker([ll.lat, ll.lon], {icon:icon}).addTo(DSC.map);
        m.on('click', function(){ selectDPin(i); });
        DSC._markers.push(m); DSC._pinEvents.push(ev);
        var card = document.createElement('div');
        card.className = 'dmap-card'; card.dataset.pini = i;
        card.innerHTML = '<div class="cim">' + dimgHTML(ev) + '</div>' +
          '<div class="cbd">' + pillHTML(ev) + '<h3>' + esc(ev.title) + '</h3>' +
          '<div class="v">' + esc(ev.venue || ev.city || '') + ' · ' + esc(niceDate(ev)) + '</div></div>';
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
  if(n && DSC._markers.length){
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
  var m = DSC._markers[i];
  if(m) DSC.map.flyTo(m.getLatLng(), Math.max(DSC.map.getZoom(), 12), {duration:.7});
}

/* ---------- STORIES ---------- */
function buildStories(){
  var wrap = $('#dst-wrap');
  var list = rankedEvents().slice(0, 40);
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
      '<div class="dst-t" style="--i:0">' + pillHTML(ev) + '</div>' +
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
    var b = e.target.closest('button'); if(!b || b.dataset.v === DSC.view) return;
    setDView(b.dataset.v);
  });
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
  document.addEventListener('keydown', function(e){
    var storiesOn = $('#view-discover').classList.contains('active') && $('#dp-stories').classList.contains('on');
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
