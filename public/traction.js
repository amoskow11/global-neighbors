/* Admin → Traction dashboard. Loaded only for admins. index.html passes in its helpers as `app`.
   Today, then four steps (frame a unique benefit → build marketing assets → display results → find what people want), then outreach.
   traction-coach.js suggests what to do next, and traction-outreach.js has the Outreach screen. */
window.GNTraction = function(app){
  "use strict";
  var esc = app.esc, A = window.GNAssets, state = app.state;
  var T = { data:null, error:'', out:null, step:'today', tip:0, tipOff:false, cat:'', ideas:6, since:null, audience:'elder', present:false, page:0, editSprint:false, picked:{}, confirming:null, studio:null, showArchived:false };
  var LIVE = /^(localhost|127\.|\[::1\])/.test(location.hostname) ? 'https://global-neighbors.pages.dev' : location.origin;
  var DAY = 86400000;
  var METRICS = { visits:'Welcome page visits', signups:'New members', orgs:'New organizations', active:'Active members', posts:'Posts', replies:'Replies between neighbors', commitments:'Commitments', completed:'Neighbors helped' };
  var GOALS = ['visits','signups','orgs','posts','replies','commitments','completed'], DEFAULTS = { visits:100, signups:15, orgs:3, posts:10, replies:15, commitments:8, completed:5 };
  var PLACES = { 'cta:elder':'Older adults', 'cta:need':'People who need help', 'cta:offer':'People offering help', 'cta:org':'Nonprofits and NGOs' };

  function plural(n, one, many){ return n + ' ' + (n===1 ? one : many || one + 's'); }
  function link(tag){ return LIVE + '/start?src=' + tag; }
  function dateOf(ms){ return new Date(ms).toLocaleDateString(undefined, { month:'short', day:'numeric' }); }
  function pct(x){ return Math.round(100 * x) + '%'; }
  var sig = '';
  function load(quiet){
    if(!quiet) T.error = '';
    return Promise.all([app.api('GET', 'admin/traction'), app.api('GET', 'admin/outreach')]).then(function(r){
      var s = JSON.stringify([r[0].totals, r[0].current, r[0].queue, r[0].campaigns, r[0].untracked, r[0].sprint, r[0].feedback, r[1]]);
      if(quiet && s===sig && T.data) return;
      sig = s; T.data = r[0]; T.out = r[1]; T.error = ''; remember(); app.render();
    }, function(err){ if(!quiet || !T.data){ T.error = err.message; app.render(); } });
  }
  // What changed since this admin's last visit. Kept in this browser only; a gap of four hours starts a new visit.
  var remembered = false;
  function remember(){
    var k = 'gn_traction_' + state.user.id, now = T.data.now, old = null;
    try{ old = JSON.parse(localStorage.getItem(k)); }catch(err){}
    var prev = old && old.at ? (now - old.at > 4 * 3600000 ? { at:old.at, totals:old.totals } : old.prev) : null;
    if(!remembered){ T.since = prev || null; remembered = true; }
    try{ localStorage.setItem(k, JSON.stringify({ at:now, totals:T.data.totals, prev:prev })); }catch(err){}
  }

  /* ============ TRACTION COACH ============ */
  function ready(kind){ return T.data.queue.filter(function(q){ return q.kind===kind && q.people.some(function(p){ return !p.sent && !p.resting; }); }); }
  function balance(){
    var o = { asks:0, offers:0 };
    T.data.demand.forEach(function(d){ o.asks += d.openAsks; o.offers += d.openOffers; });
    return o;
  }
  // The place most stuck posts of a type come from, for a targeted asset.
  function topPlace(type){
    var n = {};
    T.data.queue.forEach(function(q){ if(q.type===type && q.place && q.place.length <= 24) n[q.place] = (n[q.place] || 0) + 1; });
    return Object.keys(n).sort(function(a, b){ return n[b] - n[a]; })[0] || '';
  }
  // Best benefit so far, once there's enough to compare.
  function winner(){ return T.data.benefits.filter(function(x){ return x.visits >= 10 && x.click.count && x.benefit !== 'custom'; }).sort(function(x, y){ return y.click.rate - x.click.rate; })[0]; }
  var H = { ready:ready, balance:balance, topPlace:topPlace, winner:winner, plural:plural, dateOf:dateOf, link:link, copy:copy, load:load, METRICS:METRICS };
  var coach = window.GNCoach(app, T, H), outreach = window.GNOutreach(app, T, H);
  // The few suggestions that are safe to show a room: no names of people or prospects.
  function moves(){ return coach.list().filter(function(x){ return !x.priv; }).slice(0, 4); }
  function follow(g){
    if(g.admin){ app.adminView(g.admin); return; }
    if(g.sprint){ T.editSprint = true; app.render(); var f = document.getElementById('tx-sname'); f.scrollIntoView({ block:'center' }); f.focus(); return; }
    if(g.step==='build'){
      T.audience = g.audience || T.audience; newStudio(T.audience, g.benefit || null, g.place || '', g.channel);
      if(g.headline) T.studio.headline = g.headline;
    } else if(g.audience) T.audience = g.audience;
    if(g.tab) T.outTab = g.tab;
    if(g.seg){ T.outSeg = g.seg; T.outConfirm = false; T.draft = null; }
    go(g.step);
    var at = g.at && document.getElementById(g.at); if(at) at.scrollIntoView();
  }
  function tip(key){ return coach.list().filter(function(x){ return x.key===key; })[0]; }
  function answer(key, status){
    var x = tip(key); if(!x) return;
    app.run(app.api('POST', 'admin/coach', { key:x.key, title:x.title.slice(0, 120), status:status, metric:x.metric || '', evergreen:!!x.evergreen }).then(function(r){
      T.out.coach.unshift(r.entry); T.tip = 0;
      app.toast(status==='done' ? 'Nice work. We’ll watch the numbers from here.' : 'OK. It will come back in two days.');
    }));
  }
  function tipButtons(x){
    var dis = state.busy ? ' disabled' : '', k = ' data-key="' + esc(x.key) + '"';
    return (x.go.href ? '<a class="btn btn-primary btn-sm" href="' + esc(x.go.href) + '" target="_blank" rel="noopener noreferrer">' + esc(x.label) + '</a>' : '<button class="btn btn-primary btn-sm" data-action="tx-do"' + k + '>' + esc(x.label) + '</button>')
      + '<button class="link-btn" data-action="tx-done"' + k + dis + '>Done</button><button class="link-btn" data-action="tx-later"' + k + dis + '>Later</button>';
  }
  // Follows the admin to every other screen and keeps moving through ideas.
  function coachBar(){
    var l = coach.list(), x = l[T.tip % l.length];
    return '<div class="tx-coach-body"><div class="tx-meta"><b>Traction coach</b> · ' + coach.CATS[x.cat] + ' · ' + x.time + '</div><h4>' + esc(x.title) + '</h4><p>' + esc(x.why) + '</p></div><div class="tx-coach-acts">' + tipButtons(x) + '</div>'
      + '<div class="tx-coach-nav"><button data-action="tx-tip" data-value="-1" aria-label="Previous suggestion">‹</button><span>' + (T.tip % l.length + 1) + ' of ' + l.length + '</span><button data-action="tx-tip" data-value="1" aria-label="Next suggestion">›</button><button data-action="tx-tip-pause" aria-label="' + (T.tipOff ? 'Resume rotating suggestions' : 'Pause rotating suggestions') + '">' + (T.tipOff ? '▶' : '❚❚') + '</button></div>';
  }
  function paintTip(by){
    var el = document.getElementById('tx-coach'), n = coach.list().length;
    T.tip = ((T.tip + by) % n + n) % n;
    if(el) el.innerHTML = coachBar();
  }
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  var timers = [setInterval(function(){
    var el = document.getElementById('tx-coach');
    if(!el || !T.data || !T.out || T.tipOff || document.hidden || (still && still.matches) || el.matches(':hover') || el.contains(document.activeElement)) return;
    paintTip(1);
  }, 16000), setInterval(function(){
    // Keep the numbers and suggestions fresh, but never while someone is typing, choosing, or confirming.
    var a = document.activeElement, root = document.getElementById('root');
    if(document.hidden || state.busy || state.modal || !T.data || !root || !root.querySelector('.tx-steps') || T.confirming || T.editSprint || outreach.busy() || root.querySelector('details[open]')) return;
    if(Object.keys(T.picked).length || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    load(true);
  }, 60000)];
  function stop(){ timers.forEach(clearInterval); }

  /* ============ TODAY ============ */
  function hero(l){
    var h = new Date().getHours(), name = String(state.user.displayName || '').trim().split(/\s+/)[0];
    var now = l.filter(function(x){ return x.live; }), quick = now.slice(0, 3).sort(function(a, b){ return parseInt(a.time, 10) - parseInt(b.time, 10); })[0], d = T.data;
    var line = now.length ? plural(now.length, 'suggestion') + ' from today’s numbers. ' + (quick ? 'A good place to start takes about ' + quick.time + '.' : '') : 'Nothing is stuck right now. Here are a few fresh ways to grow.';
    return '<section class="tx-hi"><div><h3>' + (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + esc(name) + '</h3><p>' + line + '</p><p class="tx-hi-sub">' + plural(d.totals.completed, 'neighbor') + ' helped so far, ' + plural(d.totals.signups, 'member') + ', and ' + plural(d.totals.replies, 'reply', 'replies') + ' between neighbors.</p></div><canvas id="tx-hi-street" aria-hidden="true"></canvas></section>';
  }
  function since(){
    if(!T.since || !T.since.totals) return '';
    var up = Object.keys(METRICS).filter(function(k){ return k !== 'active' && T.data.totals[k] > T.since.totals[k]; });
    return '<section class="card tx-since"><b>Since you were last here, ' + esc(dateOf(T.since.at)) + ':</b> ' + (up.length ? up.map(function(k){ return '<span><em>+' + (T.data.totals[k] - T.since.totals[k]) + '</em> ' + METRICS[k].toLowerCase() + '</span>'; }).join('') : 'no new activity yet. Reaching out is the quickest way to change that.') + '</section>';
  }
  function starter(){
    var d = T.data, sent = d.nudges.length || T.out.results.length;
    var list = [['Set your sprint goals', !!d.sprint, { sprint:true }], ['Save your first tracked asset', !!d.campaigns.length, { step:'build' }], ['Get a first visit from an asset', d.campaigns.some(function(c){ return c.visits; }), { step:'results' }],
      ['Contact a member', !!sent, { step:'outreach', tab:'members' }], ['Add a possible new user', !!T.out.leads.length, { step:'outreach', tab:'new' }]];
    starter.list = list;
    var n = list.filter(function(x){ return x[1]; }).length;
    if(n===list.length) return '';
    return '<section class="card tx-start"><div class="tx-item-top"><h3 class="viz-title">Getting started</h3><span class="tx-meta">' + n + ' of ' + list.length + ' done</span></div><ul>' + list.map(function(x, i){
      return '<li class="' + (x[1] ? 'ok' : '') + '"><i aria-hidden="true">' + (x[1] ? '✓' : '') + '</i>' + (x[1] ? '<span>' + x[0] + '<span class="tx-sr"> (done)</span></span>' : '<button class="link-btn" data-action="tx-start" data-i="' + i + '">' + x[0] + '</button>') + '</li>'; }).join('') + '</ul></section>';
  }
  function tipCard(x, big){
    return '<article class="card tx-tip' + (big ? ' big' : '') + '"><div class="tx-meta">' + coach.CATS[x.cat] + ' · ' + x.time + (x.live ? '' : ' · Fresh idea') + '</div><h4>' + esc(x.title) + '</h4><p>' + esc(x.why) + '</p><div class="tx-tip-acts">' + tipButtons(x) + '</div></article>';
  }
  function pulse(){
    var p = T.out.pulse, rows = [['week','In the last 7 days',''],['fortnight','8 to 14 days ago',''],['month','15 to 30 days ago','drifting'],['older','More than 30 days ago','dormant'],['never','No visit recorded','dormant']];
    var total = 0, max = 1; rows.forEach(function(r){ total += p[r[0]]; max = Math.max(max, p[r[0]]); });
    return '<section class="card viz-card"><h3 class="viz-title">When members were last here</h3><p class="hint" style="margin:-.3rem 0 .9rem;">' + plural(p.week, 'of ' + total + ' members was', 'of ' + total + ' members were') + ' here in the last week.</p><div class="tx-funnel">' + rows.map(function(r){
      return '<div class="tx-frow tx-pulse" data-tip="' + esc(r[1] + ': ' + plural(p[r[0]], 'member')) + '"><span>' + r[1] + '</span><span>' + (p[r[0]] ? '<i style="width:' + (100 * p[r[0]] / max).toFixed(1) + '%"></i>' : '') + '</span><b>' + p[r[0]] + '</b>' + (r[2] && p[r[0]] ? '<button class="link-btn" data-action="tx-pulse" data-value="' + r[2] + '">Reach out</button>' : '<span></span>') + '</div>'; }).join('') + '</div></section>';
  }
  function log(){
    var done = T.out.coach.filter(function(c){ return c.status==='done'; }).slice(0, 6);
    return '<section class="card viz-card"><h3 class="viz-title">What you’ve done</h3>' + (done.length ? '<ul class="tx-log">' + done.map(function(c){
      var ch = c.metric && c.value !== null && METRICS[c.metric] ? METRICS[c.metric] + ': ' + c.baseline + ' then, ' + c.value + ' now' : '';
      return '<li><div><b>' + esc(c.title) + '</b><small>' + esc(dateOf(c.at)) + (ch ? ' · ' + ch : '') + '</small></div><button class="link-btn" data-action="tx-undo" data-id="' + esc(c.id) + '">Undo</button></li>'; }).join('') + '</ul><p class="hint" style="margin-top:.6rem;">The change shows what happened next. It doesn’t prove your action caused it.</p>'
      : '<p class="res-org">Mark a suggestion done and it shows up here, with the number it was meant to move.</p>') + '</section>';
  }
  function today(){
    var begin = starter(), all = coach.list(), top = all.slice(0, 3), rest = all.slice(3).filter(function(x){ return !T.cat || x.cat===T.cat; });
    return hero(all) + since() + '<div class="tx-sec"><h3>Start here</h3><p>Ranked by what helps neighbors most right now.</p></div><div class="tx-tips top">' + top.map(function(x, i){ return tipCard(x, !i); }).join('') + '</div>'
      + '<div class="tx-today"><div>' + pulse() + (begin ? log() : '') + '</div><div>' + (begin || log()) + '</div></div>'
      + '<div class="tx-sec"><h3>More ways to grow</h3><p>New suggestions appear as your numbers change, with fresh ideas every day.</p></div><div class="toolbar">'
      + [['','All']].concat(Object.keys(coach.CATS).map(function(k){ return [k, coach.CATS[k]]; })).map(function(c){ return '<button class="chip' + (T.cat===c[0] ? ' active' : '') + '" data-action="tx-cat" data-value="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>'
      + (rest.length ? '<div class="tx-tips">' + rest.slice(0, T.ideas).map(function(x){ return tipCard(x); }).join('') + '</div>' + (rest.length > T.ideas ? '<button class="btn btn-ghost btn-sm" data-action="tx-more">Show more ideas</button>' : '') : '<div class="empty">You’ve worked through this list. New ideas arrive tomorrow.</div>');
  }

  /* ============ HEADER ============ */
  function header(){
    var s = T.data.sprint, now = T.data.now, when;
    if(!s) when = 'No sprint set yet. Results below cover the last 14 days.';
    else {
      var left = Math.ceil((s.endsAt - now) / DAY);
      when = dateOf(s.startsAt) + ' to ' + dateOf(s.endsAt - 1) + '. ' + (now < s.startsAt ? 'Starts ' + dateOf(s.startsAt) + '.' : left > 0 ? plural(left, 'day') + ' left.' : 'Finished.');
    }
    return '<div class="tx-head"><div><h3>' + esc(s ? s.name : 'Traction') + '</h3><p>' + esc(when) + '</p></div>'
      + '<div class="tx-head-actions"><button class="btn btn-ghost btn-sm" data-action="tx-edit-sprint">' + (s ? 'Edit sprint' : 'Set sprint goals') + '</button>'
      + '<button class="btn btn-ghost btn-sm" data-action="tx-refresh">Refresh</button><button class="btn btn-secondary btn-sm" data-action="tx-present">Present</button></div></div>'
      + (T.editSprint ? sprintForm() : '')
      + '<div class="tx-steps" role="tablist" aria-label="Traction screens">' + [['today','Today','☀\uFE0E'],['frame','Frame a unique benefit','1'],['build','Build marketing assets','2'],['results','Display results','3'],['want','Find what people want','4'],['outreach','Outreach','✉\uFE0E']].map(function(x){
          return '<button role="tab" aria-selected="' + (T.step===x[0]) + '" data-action="tx-step" data-step="' + x[0] + '"><i aria-hidden="true">' + x[2] + '</i><span>' + x[1] + '</span></button>'; }).join('') + '</div>'
      + (T.step==='today' ? '' : '<aside class="tx-coach" id="tx-coach" aria-label="Traction coach">' + coachBar() + '</aside>');
  }
  function dayInput(ms){ return app.localDay(new Date(ms)); }
  function sprintForm(){
    var s = T.data.sprint || { name:'Competitive sprint', startsAt:Date.now(), endsAt:Date.now() + 14 * DAY, goals:DEFAULTS };
    return '<form class="card" data-action="tx-save-sprint" style="margin-bottom:1rem;">'
      + '<div class="field"><label for="tx-sname">Sprint name</label><input id="tx-sname" maxlength="60" required value="' + esc(s.name) + '"></div>'
      + '<div class="field-row"><div class="field"><label for="tx-sfrom">First day</label><input type="date" id="tx-sfrom" required value="' + dayInput(s.startsAt) + '"></div>'
      + '<div class="field"><label for="tx-sto">Last day</label><input type="date" id="tx-sto" required value="' + dayInput(s.endsAt - 1) + '"></div></div>'
      + '<div class="section-label">Goals for the sprint</div><div class="tx-goals-grid">' + GOALS.map(function(g){
          return '<div class="field"><label for="tx-g-' + g + '">' + METRICS[g] + '</label><input type="number" min="0" max="1000000" id="tx-g-' + g + '" value="' + (s.goals[g] || '') + '" placeholder="No goal"></div>'; }).join('') + '</div>'
      + '<div class="modal-actions" style="margin-top:.2rem;"><button type="button" class="btn btn-ghost btn-sm" data-action="tx-edit-sprint">Cancel</button><button class="btn btn-primary btn-sm" type="submit"' + (state.busy ? ' disabled' : '') + '>Save sprint</button></div></form>';
  }

  /* ============ 1. FRAME ============ */
  function audienceChips(){
    return '<div class="toolbar"><span class="toolbar-label">Audience</span>' + Object.keys(A.AUDIENCES).map(function(k){
      return '<button class="chip' + (T.audience===k ? ' active' : '') + '" data-action="tx-audience" data-value="' + k + '">' + A.AUDIENCES[k] + '</button>'; }).join('') + '</div>';
  }
  function frame(){
    var cards = A.benefitsFor(T.audience).map(function(k){
      var b = A.BENEFITS[k], c = A.copyFor(T.audience, k, app.orgCount());
      var r = T.data.campaigns.filter(function(x){ return x.benefit===k && x.audience===T.audience; });
      var v = 0, cl = 0; r.forEach(function(x){ v += x.visits; cl += x.click.count; });
      return '<article class="card tx-benefit"><h4>' + esc(b.name) + '</h4>' + (c.headline ? '<p class="tx-quote">“' + esc(c.headline) + '”</p>' : '')
        + '<dl><dt>Why it’s different</dt><dd>' + esc(b.gap) + '</dd><dt>What backs it up</dt><dd>' + esc(b.built) + '</dd>'
        + '<dt>Call to action</dt><dd>' + esc(c.cta) + '</dd><dt>Results so far</dt><dd>' + (r.length ? plural(r.length, 'asset') + ', ' + plural(v, 'visit') + ', ' + plural(cl, 'click') : 'Not tested yet') + '</dd></dl>'
        + '<div class="card-actions"><button class="btn btn-primary btn-sm" data-action="tx-build" data-benefit="' + k + '">Build an asset</button></div></article>';
    }).join('');
    return '<div class="tx-sec"><h3>Frame a unique benefit</h3><p>Pick one audience and the benefit that sets you apart. Comparisons come from the competitive analysis of November 24, 2026. Each benefit becomes a headline and a call to action you can test.</p></div>'
      + audienceChips() + '<div class="tx-benefits">' + cards + '</div>';
  }

  /* ============ 2. BUILD ============ */
  function taken(){ return T.data.campaigns.map(function(c){ return c.tag; }); }
  function newStudio(aud, ben, place, channel){
    var s = { audience:aud, benefit:ben || A.benefitsFor(aud)[0], channel:channel || (T.studio ? T.studio.channel : 'flyer'), place:place === undefined ? (T.studio ? T.studio.place : '') : place };
    var c = A.copyFor(s.audience, s.benefit, app.orgCount());
    if(s.benefit==='custom' && T.studio) c = { headline:T.studio.headline, body:T.studio.body, cta:c.cta };
    s.headline = c.headline; s.body = c.body; s.cta = c.cta;
    s.tag = A.makeTag(s, taken());
    T.studio = s;
  }
  function field(id, label, value, max, area){
    return '<div class="field"><label for="tx-f-' + id + '">' + label + '<span class="tx-counter">' + max + ' max</span></label>'
      + (area ? '<textarea id="tx-f-' + id + '" data-studio="' + id + '" maxlength="' + max + '" rows="3">' + esc(value) + '</textarea>' : '<input id="tx-f-' + id + '" data-studio="' + id + '" maxlength="' + max + '" value="' + esc(value) + '">') + '</div>';
  }
  function select(id, label, opts, cur){
    return '<div class="field"><label for="tx-f-' + id + '">' + label + '</label><select id="tx-f-' + id + '" data-studio="' + id + '">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (o[0]===cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>';
  }
  function assetRow(c){
    var sub = A.CHANNELS[c.channel][0] + ' for ' + A.AUDIENCES[c.audience].toLowerCase() + (c.place ? ', ' + c.place : '') + ' · ' + c.tag + (c.archived ? ' · archived' : '');
    var act = function(a, label){ return '<button class="link-btn" data-action="' + a + '" data-id="' + esc(c.id) + '">' + label + '</button>'; };
    return '<tr><td class="tx-name"><b>' + esc(c.headline) + '</b><small>' + esc(sub) + '</small></td>'
      + '<td class="num">' + c.visits + '</td><td class="num">' + c.click.count + '</td><td class="num">' + c.signup.count + '</td>'
      + '<td><div class="safety-row" style="margin:0;gap:.7rem;">' + act('tx-copy-link', 'Copy link')
      + (A.SIZES[c.channel] ? act('tx-download', 'Download') : '') + (A.captions(c, link(c.tag)) ? act('tx-copy-text', 'Copy message') : '')
      + act('tx-archive', c.archived ? 'Restore' : 'Archive') + '</div></td></tr>';
  }
  function build(){
    if(!T.studio) newStudio(T.audience, null, '');
    var s = T.studio, cap = A.captions(s, link(s.tag)), dis = state.busy ? ' disabled' : '';
    var list = T.data.campaigns.filter(function(c){ return T.showArchived || !c.archived; }), hidden = T.data.campaigns.filter(function(c){ return c.archived; }).length;
    return '<div class="tx-sec"><h3>Build marketing assets</h3><p>Every asset gets its own link, so step 3 can show what it brought in. Saving an asset adds it to the list below.</p></div>'
      + '<div class="tx-studio"><form class="card" data-action="tx-save-asset">'
      + '<div class="field"><label>Format</label><div class="tx-formats">' + Object.keys(A.CHANNELS).map(function(k){ return '<button type="button" class="' + (s.channel===k ? 'active' : '') + '" aria-pressed="' + (s.channel===k) + '" data-action="tx-channel" data-value="' + k + '" title="' + esc(A.CHANNELS[k][1]) + '">' + A.CHANNELS[k][0] + '</button>'; }).join('') + '</div></div>'
      + select('audience', 'Audience', Object.keys(A.AUDIENCES).map(function(k){ return [k, A.AUDIENCES[k]]; }), s.audience)
      + select('benefit', 'Benefit', A.benefitsFor(s.audience).map(function(k){ return [k, A.BENEFITS[k].name]; }), s.benefit)
      + field('headline', 'Headline', s.headline, 90, true) + field('body', 'Supporting text', s.body, 220, true) + field('cta', 'Call to action', s.cta, 40)
      + field('place', 'Place (optional)', s.place, 40)
      + '<div class="field"><label for="tx-f-tag">Link tag</label><input id="tx-f-tag" data-studio="tag" maxlength="24" value="' + esc(s.tag) + '" pattern="[a-z0-9][a-z0-9_\\-]{1,23}" title="Lowercase letters, numbers, and dashes" required><p class="hint" id="tx-link">' + esc(link(s.tag)) + '</p></div>'
      + '<button class="btn btn-primary" type="submit" style="width:100%;"' + dis + '>' + (A.SIZES[s.channel] ? 'Save and download' : 'Save and copy message') + '</button>'
      + '<p class="hint" style="margin-top:.7rem;">Only promise what the site does today. Ask before posting a flyer on private property.</p></form>'
      + '<div class="tx-preview">' + (A.SIZES[s.channel] ? '<canvas id="tx-canvas" role="img" aria-label="Preview of the asset"></canvas>' : '')
      + '<pre class="tx-caption" id="tx-caption"' + (cap ? '' : ' hidden') + '>' + esc(cap || '') + '</pre></div></div>'
      + '<section class="card viz-card"><h3 class="viz-title">Your assets</h3>'
      + (list.length ? '<div class="table-scroll"><table class="activity-table"><thead><tr><th>Asset</th><th>Visits</th><th>Clicked</th><th>Joined</th><th></th></tr></thead><tbody>' + list.map(assetRow).join('') + '</tbody></table></div>'
        : '<p class="res-org">Nothing saved yet. Your first asset will show up here with its results.</p>')
      + (hidden ? '<button class="link-btn" style="margin-top:.7rem;" data-action="tx-archived">' + (T.showArchived ? 'Hide archived' : 'Show ' + hidden + ' archived') + '</button>' : '') + '</section>';
  }
  function redraw(){
    if(T.present){ drawShown(); return; }
    if(T.step==='today'){ var st = document.getElementById('tx-hi-street'); if(st && st.clientWidth) A.drawStreet(st, st.clientWidth, st.clientHeight); return; }
    var s = T.studio, cv = document.getElementById('tx-canvas');
    if(!s || T.step!=='build') return;
    if(cv) A.draw(cv, s, link(s.tag || 'preview'));
    var cap = document.getElementById('tx-caption'), l = document.getElementById('tx-link');
    if(cap) cap.textContent = A.captions(s, link(s.tag)) || '';
    if(l) l.textContent = link(s.tag);
  }
  function save(canvas, name){
    canvas.toBlob(function(blob){
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
    }, 'image/png');
  }
  function download(s){
    var cv = document.createElement('canvas');
    A.draw(cv, s, link(s.tag)).then(function(){ save(cv, 'global-neighbors-' + s.tag + '.png'); });
  }
  function copy(value, msg){
    var fail = function(){ app.toast('Couldn’t copy. Select the text and press Cmd+C or Ctrl+C.'); };
    if(navigator.clipboard) navigator.clipboard.writeText(value).then(function(){ app.toast(msg); }, fail); else fail();
  }

  /* ============ 3. RESULTS ============ */
  function delta(k){
    var d = T.data.current[k] - T.data.previous[k];
    return d===0 ? '<span>no change</span>' : '<span class="' + (d > 0 ? 'tx-up' : 'tx-down') + '">' + (d > 0 ? '▲ +' : '▼ ') + d + '</span>';
  }
  function goals(){
    var s = T.data.sprint; if(!s) return '';
    var pace = Math.max(0, Math.min(1, (T.data.now - s.startsAt) / (s.endsAt - s.startsAt)));
    return GOALS.filter(function(g){ return s.goals[g]; }).map(function(g){
      var v = T.data.now < s.startsAt ? 0 : T.data.current[g], goal = s.goals[g], at = Math.min(1, v / goal);
      return '<div class="tx-goal" data-tip="' + esc(METRICS[g] + ': ' + v + ' of ' + goal + '. An even pace would be ' + Math.round(goal * pace) + ' by now.') + '"><span>' + METRICS[g] + '</span><span class="tx-bar">' + (v ? '<i style="width:' + (100*at).toFixed(1) + '%"></i>' : '') + '<u style="left:calc(' + (100*pace).toFixed(1) + '% - 1px)"></u></span><span class="tx-num"><b>' + v + '</b> of ' + goal + '</span></div>';
    }).join('') + '<div class="tx-key"><span><i></i>So far</span><span><i class="tick"></i>Where an even pace would be</span></div>';
  }
  var STEPS = [['members','Members'],['acted','Posted or replied'],['connected','In touch with a neighbor'],['committed','In a commitment'],['helped','Completed help']];
  function leakIndex(){
    var f = T.data.funnel, best = -1, low = 2;
    for(var i = 1; i < STEPS.length; i++){ var from = f[STEPS[i-1][0]]; if(from >= 2 && f[STEPS[i][0]] / from < low){ low = f[STEPS[i][0]] / from; best = i; } }
    return best;
  }
  function funnel(){
    var f = T.data.funnel, max = Math.max(1, f.members), leak = leakIndex();
    return '<div class="tx-funnel">' + STEPS.map(function(x, i){
      var n = f[x[0]], prev = i ? f[STEPS[i-1][0]] : 0;
      return (i ? '<div class="tx-fdrop' + (i===leak ? ' leak' : '') + '">' + (prev ? pct(n / prev) + ' continue' : 'Nobody has reached this yet') + (i===leak ? ', the biggest drop-off' : '') + '</div>' : '')
        + '<div class="tx-frow" data-tip="' + esc(x[1] + ': ' + plural(n, 'member')) + '"><span>' + x[1] + '</span><span>' + (n ? '<i style="width:' + (100*n/max).toFixed(1) + '%"></i>' : '') + '</span><b>' + n + '</b></div>';
    }).join('') + '</div>';
  }
  function weekChart(key, unit){
    var series = T.data.weeks.map(function(w){ return { key:app.localDay(new Date(w.start)), value:w[key] }; });
    return app.barChart(series, function(v){ return String(Math.round(v)); }, unit, true);
  }
  function weekTable(key, label){ return app.dataTable(['7 days from', label], T.data.weeks.map(function(w){ return [dateOf(w.start), w[key]]; })); }
  function results(){
    var d = T.data, s = d.sprint, len = Math.max(1, Math.round((d.window.to - d.window.from) / DAY)), tot = d.totals, plus = function(k){ return '+' + d.current[k] + ' in this period'; };
    var north = '<section class="card tx-north"><b>' + tot.completed + '</b><span>' + (tot.completed===1 ? 'neighbor helped' : 'neighbors helped') + '</span><small>Tasks a poster confirmed as complete, all time. This is the number that matters most. ' + d.current.completed + ' in this period.</small></section>';
    var sprint = '<section class="card"><h3 class="viz-title">Sprint goals</h3>' + (s ? goals() : '<p class="res-org">Set dates and goals to track your pace.</p><button class="btn btn-primary btn-sm" style="margin-top:.8rem;" data-action="tx-edit-sprint">Set sprint goals</button>') + '</section>';
    var tiles = '<div class="stat-grid tx-tiles">'
      + app.statTile('Members', tot.signups, plus('signups')) + app.statTile('Organizations', tot.orgs, plus('orgs'))
      + app.statTile('Active members', d.current.active, 'in this period') + app.statTile('Posts', tot.posts, plus('posts'))
      + app.statTile('Replies', tot.replies, plus('replies')) + app.statTile('Commitments', tot.commitments, plus('commitments')) + '</div>';
    var charts = '<div class="viz-pair"><section class="card viz-card"><h3 class="viz-title">New members, by week</h3>' + weekChart('signups', 'joined') + weekTable('signups', 'New members') + '</section>'
      + '<section class="card viz-card"><h3 class="viz-title">Active members, by week</h3>' + weekChart('active', 'active') + weekTable('active', 'Active members') + '</section></div>';
    var fun = '<section class="card viz-card"><h3 class="viz-title">From joining to helping</h3><p class="hint" style="margin:-.3rem 0 .9rem;">People, all time. Each step includes only members who also reached the step before it.</p>' + funnel()
      + app.dataTable(['Step','Members'], STEPS.map(function(x){ return [x[1], d.funnel[x[0]]]; })) + '</section>';
    var before = '<section class="card viz-card"><h3 class="viz-title">' + (s ? 'This sprint' : 'Last ' + len + ' days') + ' against the ' + plural(len, 'day') + ' before</h3><div class="table-scroll"><table class="activity-table"><thead><tr><th></th><th>Before</th><th>Now</th><th>Change</th></tr></thead><tbody>'
      + Object.keys(METRICS).map(function(k){ return '<tr><td>' + METRICS[k] + '</td><td class="num">' + d.previous[k] + '</td><td class="num"><b>' + d.current[k] + '</b></td><td class="num">' + delta(k) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    return '<div class="tx-sec"><h3>Display results</h3><p>Live numbers, with the team’s own accounts and activity left out.</p></div>'
      + '<div class="tx-hero">' + north + sprint + '</div>'
      + '<section class="card viz-card"><div class="tx-item-top"><h3 class="viz-title">What the numbers say</h3><button class="link-btn" data-action="tx-copy-readout">Copy</button></div><ul class="tx-read">' + readout().map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></section>' + tiles + fun + charts + before + marketing() + rescueResults() + definitions()
      + '<div class="tx-head-actions" style="margin-bottom:1rem;"><button class="btn btn-secondary btn-sm" data-action="tx-results-card">Download results image</button><button class="btn btn-ghost btn-sm" data-action="tx-csv">Download CSV</button></div>';
  }
  // Plain-English summary, built only from the numbers above.
  function readout(){
    var d = T.data, s = d.sprint, c = d.current, f = d.funnel, leak = leakIndex(), out = [], len = Math.max(1, Math.round((d.window.to - d.window.from) / DAY));
    out.push('Global Neighbors has ' + plural(d.totals.signups, 'member') + ' (' + plural(d.totals.orgs, 'organization') + '), ' + plural(d.totals.posts, 'post') + ', and ' + plural(d.totals.completed, 'confirmed neighbor') + ' helped.');
    out.push((s ? 'In the first ' + plural(len, 'day') + ' of the sprint' : 'In the last ' + plural(len, 'day')) + ': ' + plural(c.visits, 'welcome page visit') + ', ' + plural(c.signups, 'new member') + ', ' + plural(c.posts, 'post') + ', and ' + plural(c.replies, 'reply', 'replies') + ' between neighbors. The ' + plural(len, 'day') + ' before: ' + d.previous.visits + ', ' + d.previous.signups + ', ' + d.previous.posts + ', and ' + d.previous.replies + '.');
    if(leak > 0) out.push('The biggest drop-off is from “' + STEPS[leak-1][1].toLowerCase() + '” (' + f[STEPS[leak-1][0]] + ') to “' + STEPS[leak][1].toLowerCase() + '” (' + f[STEPS[leak][0]] + ').');
    var w = winner(); if(w) out.push('Best benefit so far: ' + A.BENEFITS[w.benefit].name.toLowerCase() + ', with ' + w.click.count + ' of ' + plural(w.visits, 'visitor') + ' clicking to join.' + (w.visits < 30 ? ' Too few visits to call it yet.' : ''));
    var sent = 0, acted = 0; d.nudges.forEach(function(n){ sent += n.sent; acted += n.acted; });
    if(sent) out.push(plural(sent, 'suggestion') + ' sent, ' + acted + ' followed by action.');
    out.push('Next: ' + moves()[0].title + '.');
    return out;
  }
  function marketing(){
    var d = T.data, b = d.benefits.filter(function(x){ return x.visits; });
    var max = Math.max(.05, Math.ceil(20 * Math.max.apply(null, b.map(function(x){ return x.click.ci[1]; }).concat([0]))) / 20);
    var small = b.some(function(x){ return x.visits < 30; });
    var rates = '<section class="card viz-card"><h3 class="viz-title">Which benefit gets people to act</h3>'
      + (b.length ? '<p class="hint" style="margin:-.3rem 0 .8rem;">Share of visitors who clicked a sign-up button. The bar is the likely range for the true rate.' + (small ? ' Under 30 visits is too few to call a winner.' : '') + '</p><div class="tx-rates">'
          + b.map(function(x){ return app.rateRow(A.BENEFITS[x.benefit].name, x.click, x.visits, max); }).join('') + '<div class="ab-row ab-axis"><span></span><span class="ab-scale"><span>0%</span><span>' + pct(max) + '</span></span><span></span></div></div>'
        : '<p class="res-org">No visits from your assets yet. Once people scan or click, you’ll see which benefit works.</p>') + '</section>';
    var rows = d.campaigns.filter(function(c){ return c.visits; }).sort(function(x, y){ return y.visits - x.visits; }).map(function(c){ return [c.headline, A.CHANNELS[c.channel][0], c.visits, c.click, c.signup]; })
      .concat(d.untracked.map(function(u){ return [u.source ? 'Link tagged “' + u.source + '”' : 'No tag (typed or shared)', '', u.visits, u.click, u.signup]; }));
    return rates + '<section class="card viz-card"><h3 class="viz-title">Where visitors came from</h3>' + (rows.length ? '<div class="table-scroll"><table class="activity-table"><thead><tr><th>Source</th><th>Format</th><th>Visits</th><th>Clicked</th><th>Joined</th></tr></thead><tbody>'
      + rows.map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="num">' + r[2] + '</td><td class="num">' + r[3].count + ' (' + pct(r[3].rate) + ')</td><td class="num">' + r[4].count + ' (' + pct(r[4].rate) + ')</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="res-org">No visits to the welcome page yet.</p>') + '</section>';
  }
  var KIND = { match:['Invitations to unanswered posts','replied'], commit:['Reminders to commit','committed'], finish:['Reminders to confirm','confirmed'] };
  function rescueResults(){
    var n = T.data.nudges;
    return '<section class="card viz-card"><h3 class="viz-title">Did the suggestions work?</h3>' + (n.length ? '<div class="table-scroll"><table class="activity-table"><thead><tr><th>Type</th><th>Sent</th><th>Seen</th><th>Acted</th></tr></thead><tbody>'
      + n.map(function(x){ return '<tr><td>' + KIND[x.kind][0] + '</td><td class="num">' + x.sent + '</td><td class="num">' + x.seen + '</td><td class="num">' + x.acted + ' ' + KIND[x.kind][1] + '</td></tr>'; }).join('') + '</tbody></table></div><p class="hint" style="margin-top:.6rem;">“Acted” means it happened after the suggestion. It doesn’t prove the suggestion caused it.</p>'
      : '<p class="res-org">You haven’t sent any yet. Start in step 4.</p>') + '</section>';
  }
  function definitions(){
    var x = T.data.excluded;
    return '<details class="card viz-card"><summary style="cursor:pointer;font-weight:700;font-size:.92rem;">How these numbers are counted</summary><dl class="tx-def">'
      + '<dt>Neighbors helped</dt><dd>A helper committed, and the poster marked the task complete.</dd>'
      + '<dt>Left out</dt><dd>Admin accounts, and any reply, commitment, or task with an admin on either side. Right now that removes ' + plural(x.posts, 'post') + ' and ' + plural(x.replies, 'reply', 'replies') + '.</dd>'
      + '<dt>Active member</dt><dd>Opened the site while signed in at least once in the period.</dd>'
      + '<dt>Visits, clicks, and joins from marketing</dt><dd>Counted once per browser on the welcome page. Signed-in members, known bots, and browsers asking not to be tracked are skipped, so real numbers may be a little higher. A join is credited to the tag the person first arrived with.</dd>'
      + '<dt>Before and after</dt><dd>The sprint so far is compared with the same number of days right before it. Other things can change too, so treat it as a sign, not proof.</dd></dl></details>';
  }
  function csv(){
    var d = T.data, rows = [['Metric','All time','Before','This period']];
    Object.keys(METRICS).forEach(function(k){ rows.push([METRICS[k], d.totals[k], d.previous[k], d.current[k]]); });
    rows.push([], ['Funnel step','Members']); STEPS.forEach(function(x){ rows.push([x[1], d.funnel[x[0]]]); });
    rows.push([], ['7 days from','New members','Active members','Posts','Replies','Neighbors helped']); d.weeks.forEach(function(w){ rows.push([app.localDay(new Date(w.start)), w.signups, w.active, w.posts, w.replies, w.completed]); });
    rows.push([], ['Asset','Tag','Audience','Benefit','Format','Visits','Clicked','Joined']);
    d.campaigns.forEach(function(c){ rows.push([c.headline, c.tag, A.AUDIENCES[c.audience], A.BENEFITS[c.benefit].name, A.CHANNELS[c.channel][0], c.visits, c.click.count, c.signup.count]); });
    var cell = function(v){ v = String(v == null ? '' : v); if(/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(function(r){ return r.map(cell).join(','); }).join('\n')], { type:'text/csv' }));
    a.download = 'global-neighbors-traction-' + app.localDay(new Date()) + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
  }
  function headlineTiles(){
    var d = T.data, s = d.sprint;
    var g = function(k){ return s && s.goals[k] ? 'This sprint: ' + d.current[k] + ' of ' + s.goals[k] : '+' + d.current[k] + (s ? ' this sprint' : ' in 14 days'); };
    return [{ value:d.totals.completed, label:'Neighbors helped', sub:g('completed') }, { value:d.totals.commitments, label:'Commitments', sub:g('commitments') }, { value:d.totals.signups, label:'Members', sub:g('signups') }, { value:d.totals.posts, label:'Posts', sub:g('posts') }];
  }

  /* ============ 4. WHAT PEOPLE WANT ============ */
  var WHY = { match:'No reply yet', commit:'Talking, no commitment', finish:'Not confirmed' };
  function preview(q){
    return q.kind==='match' ? (q.type==='ask' ? 'You might be able to help with “' + q.title + '”' : 'A neighbor is offering something that may help you: “' + q.title + '”')
      : q.kind==='commit' ? 'Can you help with “' + q.title + '”? Commit, or let them know.' : 'Did “' + q.title + '” get done? Mark it complete so you can rate each other.';
  }
  function person(q, key, p){
    var off = p.sent || p.resting, id = 'tx-p-' + key + p.id, on = (T.picked[key] || {})[p.id];
    var note = p.sent ? 'Already sent' : p.resting ? 'Heard from you in the last 7 days' : p.reasons.join('. ');
    return '<li><input type="checkbox" id="' + esc(id) + '" data-tx-pick="' + esc(key) + '" value="' + esc(p.id) + '"' + (off ? ' disabled' : on ? ' checked' : '') + '><label for="' + esc(id) + '"><b>' + esc(p.name) + '</b>' + (p.accountType==='org' ? ' (organization)' : '') + '<small>' + esc(note) + '</small></label></li>';
  }
  function queueItem(q){
    var key = q.kind + q.postId, open = q.people.filter(function(p){ return !p.sent && !p.resting; });
    if(open.length===1 && !T.picked[key]){ T.picked[key] = {}; T.picked[key][open[0].id] = true; }   // nobody else to choose between
    var sel = T.picked[key] || {};
    var n = open.filter(function(p){ return sel[p.id]; }).length, dis = state.busy ? ' disabled' : '', send = '', body;
    if(open.length) send = '<div class="tx-send">' + (T.confirming===key && n
      ? '<p class="hint">' + (n===1 ? 'This member' : 'These ' + n + ' members') + ' will get: ' + esc(preview(q)) + '</p><button class="btn btn-ghost btn-sm" data-action="tx-cancel">Cancel</button><button class="btn btn-primary btn-sm" data-action="tx-send" data-key="' + esc(key) + '"' + dis + '>Send now</button>'
      : '<p class="hint">' + (n ? n + ' chosen' : 'Choose who to ' + (q.kind==='match' ? 'invite' : 'remind') + '.') + '</p><button class="btn btn-secondary btn-sm" data-action="tx-confirm" data-key="' + esc(key) + '"' + (n ? '' : ' disabled') + '>' + (q.kind==='match' ? 'Invite' : 'Remind') + '</button>') + '</div>';
    if(q.people.length) body = '<ul class="tx-people">' + q.people.map(function(p){ return person(q, key, p); }).join('') + '</ul>' + send;
    else if(q.kind==='match') body = '<p class="hint" style="margin-top:.7rem;">No member fits yet. <button class="link-btn" data-action="tx-find" data-type="' + q.type + '" data-place="' + esc(q.place) + '">Build an asset to find ' + (q.type==='ask' ? 'a helper' : 'someone who needs this') + (q.place ? ' in ' + esc(q.place) : '') + '</button></p>';
    else body = '<p class="hint" style="margin-top:.7rem;">They’ve turned suggestions off, so there’s no one to remind.</p>';
    return '<article class="card tx-item"><div class="tx-item-top"><h4>' + esc(q.title) + '</h4><span class="tx-why">' + WHY[q.kind] + ', ' + (q.days ? plural(q.days, 'day') : 'today') + '</span></div>'
      + '<div class="tx-meta">' + (q.type==='ask' ? 'Request' : 'Offer') + ' by ' + esc(q.poster) + ' · ' + esc(q.category) + ' · ' + esc([q.place, q.region].filter(Boolean).join(', ')) + '</div>' + body + '</article>';
  }
  function demandRow(x, max){
    var bar = function(n, cls, w){ return '<span data-tip="' + esc(x.category + ': ' + plural(n, w)) + '"><i class="' + cls + '" style="width:' + (n ? (78*n/max).toFixed(1) : 0) + '%"></i>' + n + '</span>'; };
    return '<div class="tx-dem"><span>' + esc(x.category) + '</span><span class="tx-two">' + bar(x.asks, '', 'request') + bar(x.offers, 's2', 'offer') + '</span></div>';
  }
  function want(){
    var d = T.data, rows = d.demand.filter(function(x){ return x.asks + x.offers; }).sort(function(x, y){ return (y.asks + y.offers) - (x.asks + x.offers); });
    var max = Math.max.apply(null, rows.map(function(x){ return Math.max(x.asks, x.offers); }).concat([1])), b = balance();
    var advice = b.offers > b.asks * 1.5 ? 'Helpers outnumber requests, so the next campaign should find people who need a hand.' : b.asks > b.offers * 1.5 ? 'Requests outnumber offers, so the next campaign should find helpers.' : 'Requests and offers are close to balanced.';
    var chart = '<section class="card viz-card"><h3 class="viz-title">What neighbors ask for and offer</h3>' + (rows.length ? rows.map(function(x){ return demandRow(x, max); }).join('')
        + '<div class="tx-key"><span><i></i>Requests</span><span><i class="s2"></i>Offers</span></div>'
        + '<p style="font-size:.9rem;line-height:1.5;margin-top:.8rem;">' + advice + ' Right now: ' + plural(b.asks, 'open request') + ' and ' + plural(b.offers, 'open offer') + '.</p>'
        + app.dataTable(['Category','Requests','Offers','Open requests','Open offers'], rows.map(function(x){ return [x.category, x.asks, x.offers, x.openAsks, x.openOffers]; }))
      : '<p class="res-org">No posts yet.</p>') + '</section>';
    var clicks = Object.keys(PLACES).map(function(k){ var c = d.landingClicks.filter(function(x){ return x.event===k; })[0]; return { name:PLACES[k], n:c ? c.n : 0 }; }), anyClick = clicks.some(function(c){ return c.n; });
    var kinds = { idea:['idea','ideas'], problem:['problem','problems'], category:['category request','category requests'], other:['other','other'] };
    var signals = '<section class="card viz-card"><h3 class="viz-title">What people told you</h3><dl class="tx-def"><dt>Audience buttons clicked on the welcome page</dt><dd>' + (anyClick ? clicks.map(function(c){ return c.name + ': ' + c.n; }).join(', ') : 'None yet') + '</dd>'
      + '<dt>Topics people typed in</dt><dd>' + (d.topics.length ? d.topics.map(esc).join(', ') : 'None yet') + '</dd><dt>Feedback</dt><dd>' + (d.feedback.length ? d.feedback.map(function(f){ return plural(f.n, kinds[f.kind][0], kinds[f.kind][1]) + (f.fresh ? ' (' + f.fresh + ' new)' : ''); }).join(', ') : 'None yet') + '</dd></dl></section>';
    var withPeople = d.queue.filter(function(x){ return x.people.length; }), none = d.queue.filter(function(x){ return !x.people.length; });
    return '<div class="tx-sec"><h3>Find what people want, then help them get it</h3><p>What neighbors need most, what they tell you, and who can help with the posts still waiting.</p></div>'
      + '<div class="viz-pair">' + chart + signals + '</div><div class="tx-sec" id="tx-queue" style="margin-top:1.5rem;"><h3>Posts that need a push</h3><p>Matches use each person’s own posts, skills, causes, and location. Nobody gets more than one invitation a week, and members can turn these off.</p></div>'
      + (d.queue.length ? withPeople.map(queueItem).join('') + none.map(queueItem).join('') : '<div class="empty">No post is stuck right now.</div>');
  }

  /* ============ PRESENT ============ */
  // Four screens for a room. No names, post titles, or places.
  var SCREENS = ['Frame a unique benefit','Build marketing assets','Display results','Find what people want'];
  function shown(){
    var mine = T.data.campaigns.filter(function(c){ return !c.archived && A.SIZES[c.channel] && c.channel !== 'email'; }).sort(function(x, y){ return y.visits - x.visits; }).slice(0, 3);
    [['elder','named-yes','flyer'],['need','named-yes','instagram'],['offer','spots','instagram'],['org','partners','flyer']].forEach(function(x){
      if(mine.length < 3 && !mine.some(function(m){ return m.audience===x[0] && m.benefit===x[1]; })) mine.push(Object.assign({ audience:x[0], benefit:x[1], channel:x[2], place:'', tag:'preview', sample:true }, A.copyFor(x[0], x[1], app.orgCount())));
    });
    return mine;
  }
  function screen(){
    var d = T.data, s = d.sprint, b = winner();
    if(T.page===0) return '<h2>A neighbor says yes.</h2><p class="tx-sub">Other tools tell you who lives nearby or which program exists. Here, someone commits to your request, and you can see it through.</p><div class="tx-pgrid tx-pbens">'
      + ['elder','need','offer','org'].map(function(k){ var ben = A.benefitsFor(k)[0], c = A.copyFor(k, ben, app.orgCount()); return '<div><small>' + A.AUDIENCES[k] + '</small><h3>' + esc(c.headline) + '</h3><p>' + esc(A.BENEFITS[ben].built) + '</p><em>' + esc(c.cta) + '</em></div>'; }).join('') + '</div><canvas id="tx-street" aria-hidden="true"></canvas>';
    if(T.page===1) return '<h2>Every asset is tracked.</h2><p class="tx-sub">A benefit becomes a headline, a call to action, and a QR code. Each one has its own link, so we know which message works.</p><div class="tx-pshow">'
      + shown().map(function(c, i){ return '<figure><canvas id="tx-show-' + i + '"></canvas><figcaption>' + esc(A.BENEFITS[c.benefit].name) + (c.sample ? '<br>Sample' : '<br>' + plural(c.visits, 'visit') + ', ' + plural(c.click.count, 'click')) + '</figcaption></figure>'; }).join('') + '</div>';
    if(T.page===2) return '<h2>' + esc(s ? s.name : 'Traction') + '</h2><p class="tx-sub">' + (s ? esc(dateOf(s.startsAt) + ' to ' + dateOf(s.endsAt - 1)) : 'Last 14 days') + '. Live numbers, team activity left out.</p>'
      + '<div class="tx-pgrid">' + headlineTiles().map(function(x){ return '<div><b>' + x.value + '</b><span>' + x.label + '</span><small>' + esc(x.sub) + '</small></div>'; }).join('') + '</div>'
      + '<div class="tx-pcols"><section><h3>' + (s ? 'Sprint goals' : 'New members, by week') + '</h3>' + (s ? goals() : weekChart('signups', 'joined')) + '</section><section><h3>From joining to helping</h3>' + funnel() + '</section></div>'
      + (b ? '<p class="tx-sub" style="margin-top:1.4rem;">Best benefit so far: ' + esc(A.BENEFITS[b.benefit].name.toLowerCase()) + ', with ' + b.click.count + ' of ' + plural(b.visits, 'visitor') + ' clicking to join.' + (b.visits < 30 ? ' It’s early, so this could change.' : '') + '</p>' : '');
    var rows = d.demand.filter(function(x){ return x.asks + x.offers; }).sort(function(x, y){ return (y.asks + y.offers) - (x.asks + x.offers); }).slice(0, 6);
    var max = Math.max.apply(null, rows.map(function(x){ return Math.max(x.asks, x.offers); }).concat([1])), wait = d.queue.filter(function(q){ return q.kind==='match'; }), m = wait.filter(function(q){ return q.people.length; });
    return '<h2>It tells you what to do next.</h2><p class="tx-sub">The dashboard finds where help is stuck, who could unstick it, and what to market when nobody can.</p><div class="tx-pcols" style="margin-top:2rem;"><section class="tx-pwant"><h3>What neighbors ask for and offer</h3>'
      + (rows.length ? rows.map(function(x){ return demandRow(x, max); }).join('') + '<div class="tx-key"><span><i></i>Requests</span><span><i class="s2"></i>Offers</span></div>' : '<p class="tx-sub">No posts yet.</p>') + '</section><section><h3>Next best moves</h3><ol class="tx-pmoves">'
      + moves().map(function(x){ return '<li><b>' + esc(x.title) + '</b><span>' + esc(x.why) + '</span></li>'; }).join('') + '</ol><p class="tx-sub">' + plural(wait.length, 'post') + ' waiting for a first reply, ' + m.length + ' with a likely match.</p></section></div>';
  }
  function present(){
    return '<div class="tx-present" role="dialog" aria-modal="true" aria-label="Presentation"><header><div class="wordmark"><span class="dot"></span><span>Global Neighbors</span></div><button class="btn btn-ghost btn-sm" data-action="tx-present-close">Close</button></header>'
      + '<div class="tx-screen">' + screen() + '</div><nav class="tx-pnav" aria-label="Screens">' + SCREENS.map(function(x, i){ return '<button data-action="tx-page" data-value="' + i + '"' + (i===T.page ? ' aria-current="step"' : '') + '><i>' + (i + 1) + '</i><span>' + x + '</span></button>'; }).join('') + '</nav></div>';
  }
  function drawShown(){ var st = document.getElementById('tx-street'); if(st) A.drawStreet(st, st.clientWidth, st.clientHeight); shown().forEach(function(c, i){ var cv = document.getElementById('tx-show-' + i); if(cv) A.draw(cv, c, link(c.tag)); }); }

  function render(){
    if(T.error) return '<div class="empty">' + esc(T.error) + '<div style="margin-top:.8rem;"><button class="btn btn-ghost btn-sm" data-action="tx-refresh">Try again</button></div></div>';
    if(!T.data || !T.out) return '<div class="empty">Loading…</div>';
    return header() + (T.step==='today' ? today() : T.step==='outreach' ? outreach.render() : T.step==='frame' ? frame() : T.step==='build' ? build() : T.step==='results' ? results() : want()) + (T.present ? present() : '');
  }
  function go(step){ T.step = step; T.outConfirm = false; T.confirming = null; app.render(); var el = document.querySelector('.tx-steps'); if(el && el.getBoundingClientRect().top < 0) el.scrollIntoView(); }
  function byId(el){ var id = el.getAttribute('data-id'); return T.data.campaigns.filter(function(c){ return c.id===id; })[0]; }
  function item(key){ return T.data.queue.filter(function(q){ return q.kind + q.postId===key; })[0]; }

  function click(action, el){
    var v = el.getAttribute('data-value'), c;
    if(outreach.click(action, el)) return;
    if(action==='tx-step') go(el.getAttribute('data-step'));
    else if(action==='tx-refresh'){ T.data = null; T.out = null; app.render(); load(); }
    else if(action==='tx-page'){ T.page = +v; app.render(); drawShown(); }
    else if(action==='tx-do'){ c = tip(el.getAttribute('data-key')); if(c) follow(c.go); }
    else if(action==='tx-done') answer(el.getAttribute('data-key'), 'done');
    else if(action==='tx-later') answer(el.getAttribute('data-key'), 'later');
    else if(action==='tx-undo'){ var uid = el.getAttribute('data-id'); app.run(app.api('DELETE', 'admin/coach/' + uid).then(function(){ T.out.coach = T.out.coach.filter(function(x){ return x.id !== uid; }); })); }
    else if(action==='tx-tip'){ paintTip(+v); var again = document.querySelector('#tx-coach [data-action=tx-tip][data-value="' + v + '"]'); if(again) again.focus(); }
    else if(action==='tx-tip-pause'){ T.tipOff = !T.tipOff; paintTip(0); var pb = document.querySelector('#tx-coach [data-action=tx-tip-pause]'); if(pb) pb.focus(); }
    else if(action==='tx-cat'){ T.cat = v; T.ideas = 6; app.render(); }
    else if(action==='tx-more'){ T.ideas += 9; app.render(); }
    else if(action==='tx-start') follow(starter.list[+el.getAttribute('data-i')][2]);
    else if(action==='tx-pulse') follow({ step:'outreach', tab:'members', seg:v });
    else if(action==='tx-copy-readout') copy(readout().join('\n'), 'Readout copied.');
    else if(action==='tx-edit-sprint'){ T.editSprint = !T.editSprint; app.render(); if(T.editSprint){ var f = document.getElementById('tx-sname'); f.scrollIntoView({ block:'center' }); f.focus(); } }
    else if(action==='tx-present'){ T.present = true; T.page = 0; app.render(); document.querySelector('.tx-present button').focus(); }
    else if(action==='tx-present-close'){ T.present = false; app.render(); }
    else if(action==='tx-audience'){ T.audience = v; app.render(); }
    else if(action==='tx-build'){ newStudio(T.audience, el.getAttribute('data-benefit')); go('build'); }
    else if(action==='tx-find'){ T.audience = el.getAttribute('data-type')==='ask' ? 'offer' : 'need'; var pl = el.getAttribute('data-place') || ''; newStudio(T.audience, null, pl.length <= 24 ? pl : ''); go('build'); }
    else if(action==='tx-channel'){ T.studio.channel = v; if(!T.studio.tagTouched) T.studio.tag = A.makeTag(T.studio, taken()); app.render(); }
    else if(action==='tx-copy-link') copy(link(byId(el).tag), 'Link copied.');
    else if(action==='tx-copy-text'){ c = byId(el); copy(A.captions(c, link(c.tag)), 'Message copied.'); }
    else if(action==='tx-download') download(byId(el));
    else if(action==='tx-archived'){ T.showArchived = !T.showArchived; app.render(); }
    else if(action==='tx-archive'){ c = byId(el); app.run(app.api('POST', 'admin/campaigns/' + c.id, { action:c.archived ? 'restore' : 'archive' }).then(function(){ c.archived = !c.archived; app.toast(c.archived ? 'Archived. Its link and results keep working.' : 'Restored.'); })); }
    else if(action==='tx-csv') csv();
    else if(action==='tx-results-card'){ var cv = document.createElement('canvas'), s = T.data.sprint; A.drawResults(cv, { title:s ? s.name : 'Traction so far', when:new Date().toLocaleDateString(undefined, { month:'long', day:'numeric', year:'numeric' }), tiles:headlineTiles() }).then(function(){ save(cv, 'global-neighbors-results-' + app.localDay(new Date()) + '.png'); }); }
    else if(action==='tx-confirm'){ T.confirming = el.getAttribute('data-key'); app.render(); }
    else if(action==='tx-cancel'){ T.confirming = null; app.render(); }
    else if(action==='tx-send'){
      var key = el.getAttribute('data-key'), q = item(key), ids = Object.keys(T.picked[key] || {}).filter(function(id){ return T.picked[key][id]; });
      app.run(app.api('POST', 'admin/nudges', { kind:q.kind, postId:q.postId, userIds:ids }).then(function(r){ delete T.picked[key]; T.confirming = null; app.toast('Sent to ' + plural(r.sent, 'member') + '.'); return load(); }));
    }
  }
  function submit(action){
    if(outreach.submit(action)) return;
    if(action==='tx-save-sprint'){
      var day = function(id, add){ var p = app.val(id).split('-'); return new Date(+p[0], +p[1]-1, +p[2] + (add || 0)).getTime(); }, g = {};
      GOALS.forEach(function(k){ g[k] = +app.val('tx-g-' + k) || 0; });
      app.run(app.api('POST', 'admin/sprint', { name:app.val('tx-sname'), startsAt:day('tx-sfrom'), endsAt:day('tx-sto', 1), goals:g }).then(function(){ T.editSprint = false; app.toast('Sprint saved.'); return load(); }));
    } else if(action==='tx-save-asset'){
      var s = Object.assign({}, T.studio); s.name = (A.CHANNELS[s.channel][0] + ': ' + (s.headline || '')).slice(0, 80);
      // Copying has to happen during the click, before waiting on the server.
      if(!A.SIZES[s.channel] && navigator.clipboard) navigator.clipboard.writeText(A.captions(s, link(s.tag))).catch(function(){});
      app.run(app.api('POST', 'admin/campaigns', s).then(function(r){
        var none = { count:0, rate:0, ci:[0,0] };
        T.data.campaigns.unshift(Object.assign(r.campaign, { visits:0, click:none, signup:none }));
        T.studio.tagTouched = false; T.studio.tag = A.makeTag(T.studio, taken());
        app.toast(A.SIZES[s.channel] ? 'Saved. Your image is downloading.' : 'Saved. The message is copied.');
        if(A.SIZES[s.channel]) download(s);
      }));
    }
  }
  function input(el, isChange){
    if(outreach.input(el, isChange)) return;
    var pick = el.getAttribute('data-tx-pick');
    if(pick){ if(isChange){ (T.picked[pick] = T.picked[pick] || {})[el.value] = el.checked; T.confirming = null; app.render(); var again = document.getElementById(el.id); if(again) again.focus(); } return; }
    var k = el.getAttribute('data-studio'); if(!k || !T.studio) return;
    if(k==='audience' || k==='benefit'){
      if(!isChange) return;
      if(k==='audience'){ T.audience = el.value; newStudio(el.value); } else newStudio(T.studio.audience, el.value);
      app.render(); return;
    }
    if(isChange && T.studio[k]===el.value) return;
    T.studio[k] = el.value;
    if(k==='tag') T.studio.tagTouched = true;
    if(k==='place' && !T.studio.tagTouched){ T.studio.tag = A.makeTag(T.studio, taken()); var t = document.getElementById('tx-f-tag'); if(t) t.value = T.studio.tag; }
    clearTimeout(input.t); input.t = setTimeout(redraw, 120);
  }
  function key(e){
    if(!T.present) return false;
    if(e.key==='Escape'){ T.present = false; app.render(); return true; }
    var step = e.key==='ArrowRight' || e.key==='PageDown' ? 1 : e.key==='ArrowLeft' || e.key==='PageUp' ? -1 : 0;
    if(step){ e.preventDefault(); T.page = Math.max(0, Math.min(3, T.page + step)); app.render(); drawShown(); return true; }
    return false;
  }
  return { load:load, render:render, after:redraw, stop:stop, click:click, submit:submit, input:input, key:key };
};
