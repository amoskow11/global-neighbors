/* Outreach: (1) current members, grouped by what would bring each one back, and (2) possible new users.
   Nothing is sent until the admin picks people, reads the message, and confirms. Loaded only for admins. */
window.GNOutreach = function(app, T, H){
  "use strict";
  var esc = app.esc, plural = H.plural;
  Object.assign(T, { outTab:'members', outSeg:'', outPicked:{}, outMsg:{}, outConfirm:false, draft:null, leadForm:null, leadMsg:null, leadRemove:null, leadFilter:'open', near:null, moreOrgs:false });

  /* ============ 1. CURRENT MEMBERS ============ */
  // [name, why it matters, message, best channel, subject]
  var SEGS = {
    thanks:['Say thank you', 'Gave or got help in the last 30 days. Thanks keeps people coming back, and a rating builds trust.', 'Hi {name}, thank you for being part of a task that got done. If you haven’t rated your neighbor yet, please do. It helps the next person say yes.', 'app', 'Thank you'],
    waiting:['Waiting for a first reply', 'Their post is more than two days old with no reply. Let them know someone is looking.', 'Hi {name}, your post hasn’t had a reply yet, and we’re looking for someone who fits. Adding a time or a little more detail can help.', 'app', 'About your post on Global Neighbors'],
    welcome:['New and not started', 'Joined in the last 14 days and hasn’t posted or replied. A first step now makes a second visit likely.', 'Welcome, {name}! A good first step is one small request or offer. It takes about a minute, and you choose who you talk with.', 'app', 'Welcome to Global Neighbors'],
    drifting:['Drifting away', 'Last here 15 to 45 days ago. Easier to bring back now than later.', 'Hi {name}, it’s been a little while. Is there one thing you need this week, or one post you could help with? Come take a look.', 'email', 'Could you use a hand, or lend one?'],
    dormant:['Gone quiet', 'Not seen in over 45 days, or no visit recorded. They won’t see an in-app note, so write a personal email.', 'Hi {name}, it’s been a while since you visited Global Neighbors. Is there something you could use a hand with, or something we could do better?', 'email', 'Could you use a hand, or lend one?'],
    firstpost:['Looking, not posting', 'Visited in the last two weeks but never posted or replied.', 'Hi {name}, is there one small thing you could use help with, or one you could offer? Posting takes about a minute.', 'app', 'One small request or offer'],
    profile:['Active, no skills listed', 'They take part, but matching can’t suggest them for much yet.', 'Hi {name}, could you add the ways you can help to your profile? It lets us suggest posts that fit you.', 'app', 'A quick favor'],
    champion:['Ready to invite a neighbor', 'Active members who know how it works. They make the most believable invitation.', 'Hi {name}, thanks for being active here. Do you know a neighbor who could use a hand, or lend one? Tap this note to copy an invite link.', 'app', 'Know a neighbor who’d like this?',
      'Hi {name}, thanks for being active on Global Neighbors. Do you know a neighbor who could use a hand, or lend one? Here’s an invite link: ' + H.link('member-invite')]
  };
  function seg(k){ return T.out.segments[k]; }
  function open(k){ return seg(k).filter(function(p){ return !p.resting; }); }
  function chosen(){ var s = T.outPicked[T.outSeg] || {}; return open(T.outSeg).filter(function(p){ return s[p.id]; }); }
  function msg(k){ return T.outMsg[k] === undefined ? SEGS[k][2] : T.outMsg[k]; }
  function first(name, type){ return type==='org' ? name : name.split(' ')[0]; }

  function members(){
    var keys = Object.keys(SEGS), total = 0;
    keys.forEach(function(k){ total += open(k).length; });
    if(!T.outSeg || !seg(T.outSeg)) T.outSeg = keys.filter(function(k){ return open(k).length; })[0] || 'welcome';
    var list = '<nav class="tx-segs" aria-label="Groups of members">' + keys.map(function(k){
      var n = open(k).length, rest = seg(k).length - n;
      return '<button data-action="tx-out-seg" data-value="' + k + '"' + (T.outSeg===k ? ' aria-current="true"' : '') + (seg(k).length ? '' : ' class="none"') + '><span>' + SEGS[k][0] + (rest ? '<small>' + rest + ' contacted recently</small>' : '') + '</span><b>' + n + '</b></button>'; }).join('') + '</nav>';
    return '<div class="tx-sec"><h3>Reach out to current members</h3><p>' + (total ? plural(total, 'member') + ' could hear from you today. ' : 'Everyone has heard from you recently. ') + 'Each person is in one group and gets at most one message a week from the team.'
      + (T.out.optedOut ? ' ' + plural(T.out.optedOut, 'member has', 'members have') + ' turned suggestions off and ' + (T.out.optedOut===1 ? 'isn’t' : 'aren’t') + ' listed.' : '') + '</p></div>'
      + '<div class="tx-outgrid">' + list + group() + '</div>' + sentTable();
  }
  function group(){
    var k = T.outSeg, s = SEGS[k], people = seg(k), can = open(k), sel = T.outPicked[k] || {}, n = chosen().length, dis = app.state.busy ? ' disabled' : '';
    if(!people.length) return '<section class="card"><h4 class="tx-gh">' + s[0] + '</h4><p class="res-org">Nobody is in this group right now.</p></section>';
    var rows = people.map(function(p){
      var id = 'tx-o-' + p.id;
      return '<li><input type="checkbox" id="' + esc(id) + '" data-tx-out="' + esc(p.id) + '"' + (p.resting ? ' disabled' : sel[p.id] ? ' checked' : '') + '><label for="' + esc(id) + '"><b>' + esc(p.name) + '</b>' + (p.accountType==='org' ? ' (organization)' : '') + '<small>' + esc(p.resting ? 'Contacted recently' : p.note) + '</small></label>'
        + (p.resting ? '' : '<button class="link-btn" data-action="tx-out-email" data-id="' + esc(p.id) + '"' + dis + '>Write email</button>') + '</li>';
    }).join('');
    var one = chosen()[0] || can[0], text = msg(k), shown = one ? text.split('{name}').join(first(one.name, one.accountType)) : text;
    var bar = T.outConfirm && n
      ? '<p class="hint">Send this in-app note to ' + plural(n, 'member') + '? They’ll see: “' + esc(shown) + '”</p><button class="btn btn-ghost btn-sm" data-action="tx-out-cancel">Cancel</button><button class="btn btn-primary btn-sm" data-action="tx-out-send"' + dis + '>Send now</button>'
      : '<p class="hint">' + (n ? n + ' chosen' : 'Choose people above.') + '</p><button class="btn btn-secondary btn-sm" data-action="tx-out-confirm"' + (n ? '' : ' disabled') + '>Send in-app note</button>';
    return '<section class="card"><h4 class="tx-gh">' + s[0] + '</h4><p class="res-org">' + s[1] + (s[3]==='email' ? ' Email works best here.' : '') + '</p>'
      + (can.length > 1 ? '<button class="link-btn" style="margin-top:.6rem;" data-action="tx-out-all">' + (n===Math.min(25, can.length) ? 'Clear choices' : 'Choose ' + (can.length > 25 ? 'the first 25' : 'all ' + can.length)) + '</button>' : '')
      + '<ul class="tx-people">' + rows + '</ul>' + draftCard()
      + (can.length ? '<div class="field" style="margin-top:.9rem;"><label for="tx-outmsg">Message<span class="tx-counter">240 max</span></label><textarea id="tx-outmsg" data-studio="" data-tx-outmsg maxlength="240" rows="3">' + esc(text) + '</textarea><p class="hint">{name} becomes each person’s first name.</p></div><div class="tx-send">' + bar + '</div>' : '') + '</section>';
  }
  function draftCard(){
    var d = T.draft; if(!d || d.seg !== T.outSeg) return '';
    return '<div class="tx-draft"><b>Email draft for ' + esc(d.name) + '</b><p class="tx-meta">' + esc(d.email) + '</p><pre class="tx-caption">' + esc(d.body) + '</pre><div class="card-actions"><a class="btn btn-primary btn-sm" href="' + esc(mailto(d.email, d.subject, d.body)) + '">Open in email app</a><button class="btn btn-ghost btn-sm" data-action="tx-draft-copy">Copy message</button><button class="link-btn" data-action="tx-draft-close">Close</button></div><p class="hint" style="margin-top:.5rem;">Nothing is sent until you send it from your own email. This draft counts as this week’s contact.</p></div>';
  }
  function mailto(to, subject, body){ return 'mailto:' + encodeURIComponent(to).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.replace(/\n/g, '\r\n')); }
  function sentTable(){
    var r = T.out.results;
    return '<section class="card viz-card"><h3 class="viz-title">Did reaching out work?</h3>' + (r.length
      ? '<div class="table-scroll"><table class="activity-table"><thead><tr><th>Group</th><th>How</th><th>Contacted</th><th>Seen</th><th>Came back</th><th>Posted or replied</th></tr></thead><tbody>' + r.map(function(x){
          return '<tr><td>' + SEGS[x.segment][0] + '</td><td>' + (x.channel==='app' ? 'In-app note' : 'Email draft') + '</td><td class="num">' + x.sent + '</td><td class="num">' + (x.channel==='app' ? x.seen : '–') + '</td><td class="num">' + x.returned + '</td><td class="num">' + x.acted + '</td></tr>'; }).join('')
        + '</tbody></table></div><p class="hint" style="margin-top:.6rem;">“Came back” and “Posted or replied” mean within 14 days after. It doesn’t prove the message caused it.</p>'
      : '<p class="res-org">You haven’t contacted anyone yet. Results will show up here.</p>') + '</section>';
  }

  /* ============ 2. POSSIBLE NEW USERS ============ */
  var KINDS = { nonprofit:'Nonprofit or NGO', senior:'Senior center', student:'Student group', faith:'Faith community', library:'Library', business:'Local business', government:'City or town office', person:'Person', other:'Other' };
  var AUD = { org:'Nonprofits and NGOs', elder:'Older adults', need:'People who need help', offer:'People offering help' };
  var STATUS = { idea:'To contact', contacted:'Contacted', talking:'Talking', joined:'Joined', notnow:'Not now' };
  // Places to look: [kind, audience, title, why, map search]
  var LOOK = [
    ['senior','elder','Senior center or council on aging','One coordinator can speak for many older adults who need rides, errands, or company.','senior center'],
    ['student','offer','Student service club','Members want hours and flexible tasks.','college volunteer center'],
    ['faith','need','Faith community','Many already run meal trains and ride lists.','places of worship'],
    ['library','need','Public library','Staff meet people who need a hand, and most have a community board.','public library'],
    ['government','elder','City or town human services','They hear about needs no program covers.','human services department'],
    ['business','offer','Coffee shop or laundromat','Busy boards, and people waiting with a phone out.','coffee shop']
  ];
  function greet(l){ return l.kind==='person' ? 'Hi ' + l.name.split(' ')[0] + ',' : 'Hi ' + l.name + ' team,'; }
  function pitch(l){
    var u = H.link(l.tag), where = l.place ? ' in ' + l.place : '';
    var b = { org:'I’m with Global Neighbors, a free site where people post a small request or offer and a neighbor or organization commits to it. You could post what your clients need, find partners, and see who has said yes. Our community is new, and organizations like yours would help shape it.\n\nWould you take a look, or point me to the right person?',
      elder:'I’m with Global Neighbors, a free site where older adults and the people who care for them can ask for everyday help' + where + ', like a ride, groceries, or a hand with a phone. A neighbor commits to the request by name. Email addresses aren’t shown to other members, and there are safety tips for both sides.\n\nCould I show it to someone on your team, or leave a flyer?',
      need:'I’m with Global Neighbors, a free site where neighbors' + where + ' ask for a hand and someone commits to helping. If you know someone who could use help with an errand, a ride, or paperwork, they can post in about a minute.\n\nWould you share this link, or let me leave a flyer?',
      offer:'I’m with Global Neighbors, a free site that shows real requests from neighbors' + where + ' and how many helpers each one still needs. People pick a task that fits their week, commit, and both sides can rate each other when it’s done.\n\nWould you share it with your members?' };
    return greet(l) + '\n\n' + b[l.audience] + '\n\n' + u + '\n\nThank you!';
  }
  function emailOf(l){ var m = /[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+/.exec(l.contact); return m ? m[0] : ''; }
  function due(l){ return l.followUp && l.followUp <= app.localDay(new Date()) && l.status !== 'joined' && l.status !== 'notnow'; }
  function lead(id){ return T.out.leads.filter(function(l){ return l.id===id; })[0]; }
  function opt(map, cur){ return Object.keys(map).map(function(k){ return '<option value="' + k + '"' + (k===cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>'; }).join(''); }

  function form(){
    var f = T.leadForm, dis = app.state.busy ? ' disabled' : '';
    var inp = function(k, label, max, extra){ return '<div class="field"><label for="tx-l-' + k + '">' + label + '</label><input id="tx-l-' + k + '" data-studio="" data-tx-lead="' + k + '" maxlength="' + max + '" value="' + esc(f[k] || '') + '"' + (extra || '') + '></div>'; };
    var sel = function(k, label, map){ return '<div class="field"><label for="tx-l-' + k + '">' + label + '</label><select id="tx-l-' + k + '" data-studio="" data-tx-lead="' + k + '">' + opt(map, f[k]) + '</select></div>'; };
    return '<form class="card tx-leadform" id="tx-leadform" data-action="tx-lead-save"><h4 class="tx-gh">' + (f.id ? 'Edit prospect' : 'Add a prospect') + '</h4>'
      + '<div class="field-row">' + inp('name', 'Name', 100, ' required placeholder="Organization, group, or first name"') + sel('kind', 'Type', KINDS) + '</div>'
      + '<div class="field-row">' + sel('audience', 'Who they can reach', AUD) + inp('place', 'Place (optional)', 60) + '</div>'
      + '<div class="field-row">' + inp('contact', 'Public contact (optional)', 160, ' placeholder="Email, phone, or web page"') + sel('status', 'Stage', STATUS) + '</div>'
      + '<div class="field-row">' + inp('followUp', 'Follow up on (optional)', 10, ' type="date"') + '<div class="field"><label for="tx-l-notes">Notes (optional)</label><textarea id="tx-l-notes" data-studio="" data-tx-lead="notes" maxlength="500" rows="2">' + esc(f.notes || '') + '</textarea></div></div>'
      + '<p class="hint">Use contact details people publish themselves, and skip anything private. Only admins can see this list.</p><div class="modal-actions" style="margin-top:.6rem;"><button type="button" class="btn btn-ghost btn-sm" data-action="tx-lead-cancel">Cancel</button><button class="btn btn-primary btn-sm" type="submit"' + dis + '>Save</button></div></form>';
  }
  function leadCard(l){
    var dis = app.state.busy ? ' disabled' : '', m = emailOf(l), shown = T.leadMsg===l.id;
    var when = due(l) ? '<span class="tx-why tx-due">Follow up now</span>' : l.followUp && l.status !== 'joined' && l.status !== 'notnow' ? '<span class="tx-why">Follow up ' + esc(H.dateOf(new Date(l.followUp + 'T12:00').getTime())) + '</span>' : '';
    var acts = T.leadRemove===l.id
      ? '<span class="hint" style="margin:0;">Remove ' + esc(l.name) + ' and your notes for good?</span><button class="btn btn-ghost btn-sm" data-action="tx-lead-keep">Keep</button><button class="btn btn-danger btn-sm" data-action="tx-lead-remove" data-id="' + l.id + '"' + dis + '>Remove</button>'
      : '<button class="btn btn-secondary btn-sm" data-action="tx-lead-msg" data-id="' + l.id + '" aria-expanded="' + shown + '">' + (shown ? 'Hide message' : l.status==='idea' ? 'Write to them' : 'Show message') + '</button><button class="link-btn" data-action="tx-lead-link" data-id="' + l.id + '">Copy link</button><button class="link-btn" data-action="tx-lead-edit" data-id="' + l.id + '">Edit</button><button class="link-btn" data-action="tx-lead-ask" data-id="' + l.id + '">Remove</button>';
    return '<article class="card tx-item"><div class="tx-item-top"><h4>' + esc(l.name) + '</h4>' + when + '</div><div class="tx-meta">' + esc([KINDS[l.kind], AUD[l.audience], l.place, l.contact].filter(Boolean).join(' · ')) + '</div>'
      + (l.notes ? '<p class="tx-note">' + esc(l.notes) + '</p>' : '')
      + '<div class="tx-leadrow"><label>Stage <select data-studio="" id="tx-st-' + l.id + '" data-tx-stage="' + l.id + '"' + dis + '>' + opt(STATUS, l.status) + '</select></label><span class="tx-meta">' + plural(l.visits, 'visit') + ' and ' + plural(l.joins, 'sign-up') + ' from their link</span></div>'
      + (shown ? '<pre class="tx-caption" style="margin-top:.7rem;">' + esc(pitch(l)) + '</pre><div class="card-actions" style="margin-top:.6rem;">' + (m ? '<a class="btn btn-primary btn-sm" href="' + esc(mailto(m, 'Neighbors helping neighbors', pitch(l))) + '">Open in email app</a>' : '') + '<button class="btn ' + (m ? 'btn-ghost' : 'btn-primary') + ' btn-sm" data-action="tx-lead-copy" data-id="' + l.id + '">Copy message</button>' + (l.status==='idea' ? '<button class="btn btn-ghost btn-sm" data-action="tx-lead-done" data-id="' + l.id + '"' + dis + '>I contacted them</button>' : '') + '</div>' : '')
      + '<div class="tx-send">' + acts + '</div></article>';
  }
  // Organizations from the site's reference directory that fit what neighbors are asking for.
  function fits(){
    var have = {}, need = {}, past = {}, out = [];
    T.out.leads.forEach(function(l){ have[l.name.toLowerCase()] = 1; });
    app.orgs().forEach(function(o){ if(o.kind !== 'real') have[o.name.toLowerCase()] = 1; });
    // Requests waiting for a reply count only for organizations in the same region. Past demand is the fallback.
    T.data.queue.forEach(function(q){ if(q.kind==='match' && q.type==='ask') app.causesFor(q.category).forEach(function(c){ var k = q.region + '|' + c; (need[k] = need[k] || {})[q.postId] = q.category; }); });
    T.data.demand.forEach(function(d){ if(d.asks) app.causesFor(d.category).forEach(function(c){ (past[c] = past[c] || {})[d.category] = d.asks; }); });
    app.orgs().forEach(function(o){
      if(o.kind !== 'real' || have[o.name.toLowerCase()]) return;
      var posts = {}, cats = {}, n = 0, r = app.regionOf(o);
      o.causes.forEach(function(c){ Object.assign(posts, need[r + '|' + c]); Object.assign(cats, past[c]); });
      var waiting = Object.keys(posts).length;
      Object.keys(cats).forEach(function(k){ n += cats[k]; });
      if(!waiting && !n) return;
      var names = waiting ? Object.keys(posts).map(function(k){ return posts[k]; }).filter(function(c, i, a){ return a.indexOf(c)===i; }) : Object.keys(cats);
      out.push({ o:o, score:waiting * 1000 + (r==='Greater Boston' ? 100 : 0) + n, why:waiting ? 'Fits ' + plural(waiting, 'request') + ' waiting for a reply in ' + r + ': ' + names.slice(0, 2).join(' and ') + '.'
        : 'Works on ' + o.causes.filter(function(c){ return past[c]; }).slice(0, 2).join(' and ').toLowerCase() + '. Neighbors have made ' + plural(n, 'request') + ' like that, across all places.' });
    });
    return out.sort(function(a, b){ return b.score - a.score; });
  }
  function possible(){
    var leads = T.out.leads, count = {}, dueN = leads.filter(due).length, dis = app.state.busy ? ' disabled' : '';
    Object.keys(STATUS).forEach(function(k){ count[k] = leads.filter(function(l){ return l.status===k; }).length; });
    var filters = [['open','Active', leads.filter(function(l){ return l.status !== 'notnow' && l.status !== 'joined'; }).length]].concat(Object.keys(STATUS).map(function(k){ return [k, STATUS[k], count[k]]; }));
    var list = leads.filter(function(l){ return T.leadFilter==='open' ? l.status !== 'notnow' && l.status !== 'joined' : l.status===T.leadFilter; }).sort(function(a, b){ return (due(b) ? 1 : 0) - (due(a) ? 1 : 0); });
    if(T.near===null) T.near = H.topPlace('ask') || H.topPlace('offer') || '';
    var orgs = fits(), show = orgs.slice(0, T.moreOrgs ? 24 : 6);
    return '<div class="tx-sec tx-item-top"><div><h3>Find possible new users</h3><p>Keep a short list, reach out one at a time, and follow up. Each prospect gets their own link, so you’ll see whether it brought visits and sign-ups.</p></div><button class="btn btn-primary btn-sm" data-action="tx-lead-new">Add a prospect</button></div>'
      + (T.leadForm ? form() : '')
      + '<div class="toolbar">' + filters.map(function(f){ return '<button class="chip' + (T.leadFilter===f[0] ? ' active' : '') + '" data-action="tx-lead-filter" data-value="' + f[0] + '">' + f[1] + ' ' + f[2] + '</button>'; }).join('') + '</div>'
      + (dueN ? '<p class="tx-read" style="padding:0;margin-bottom:.8rem;"><b>' + plural(dueN, 'follow-up') + ' due.</b></p>' : '')
      + (list.length ? list.map(leadCard).join('') : '<div class="empty">' + (leads.length ? 'Nobody at this stage.' : 'Your list is empty. Add someone from the suggestions below, or add your own.') + '</div>')
      + '<div class="tx-sec" style="margin-top:1.6rem;"><h3>Organizations that fit what neighbors need</h3><p>From the site’s directory of real nonprofits, matched to what neighbors ask for. They’re listed from public information and aren’t members. Check their website for the right contact.</p></div>'
      + (show.length ? '<div class="tx-fits">' + show.map(function(x){
          return '<article class="card"><h4 class="tx-gh">' + esc(x.o.name) + '</h4><p class="tx-meta">' + esc(x.o.location) + '</p><p class="res-org">' + esc(x.why) + '</p><div class="card-actions"><button class="btn btn-secondary btn-sm" data-action="tx-lead-add" data-id="' + esc(x.o.id) + '"' + dis + '>Add to list</button><a class="link-btn" href="' + esc(x.o.website) + '" target="_blank" rel="noopener noreferrer">Website</a></div></article>'; }).join('') + '</div>'
          + (orgs.length > 6 ? '<button class="link-btn" data-action="tx-more-orgs">' + (T.moreOrgs ? 'Show fewer' : 'Show more') + '</button>' : '')
        : '<p class="res-org">No request matches a listed organization yet.</p>')
      + '<div class="tx-sec" style="margin-top:1.6rem;"><h3>Places to look nearby</h3><p>Groups that already know the people you want to reach.</p></div><div class="toolbar"><label class="toolbar-label" for="tx-near">Near</label><input id="tx-near" data-studio="" data-tx-near maxlength="40" value="' + esc(T.near) + '" placeholder="Town or neighborhood"></div>'
      + '<div class="tx-fits">' + LOOK.map(function(x, i){
          return '<article class="card"><h4 class="tx-gh">' + x[2] + '</h4><p class="res-org">' + x[3] + '</p><div class="card-actions"><button class="btn btn-secondary btn-sm" data-action="tx-lead-kind" data-value="' + i + '">Add one</button><a class="link-btn" data-tx-map="' + i + '" href="' + esc(map(i)) + '" target="_blank" rel="noopener noreferrer">Search a map</a></div></article>'; }).join('') + '</div>';
  }
  function map(i){ return 'https://www.google.com/maps/search/' + encodeURIComponent(LOOK[i][4] + (T.near ? ' near ' + T.near : '')); }

  function render(){
    if(!T.out) return '<div class="empty">Loading…</div>';
    return '<div class="seg tx-outtabs" role="tablist">' + [['members','Current members'],['new','Possible new users']].map(function(x, i){
        return '<button role="tab" aria-selected="' + (T.outTab===x[0]) + '" class="' + (T.outTab===x[0] ? 'active' : '') + '" data-action="tx-out-tab" data-value="' + x[0] + '">' + (i + 1) + '. ' + x[1] + '</button>'; }).join('') + '</div>'
      + (T.outTab==='members' ? members() : possible());
  }

  /* ============ EVENTS ============ */
  function put(saved){ var i = T.out.leads.map(function(l){ return l.id; }).indexOf(saved.id), old = i > -1 ? T.out.leads[i] : null; if(old){ saved.visits = old.visits; saved.joins = old.joins; T.out.leads[i] = saved; } else T.out.leads.unshift(saved); }
  function saveLead(id, body, msg){ app.run(app.api('POST', 'admin/leads' + (id ? '/' + id : ''), body).then(function(r){ put(r.lead); if(msg) app.toast(msg); })); }
  function inDays(n){ return app.localDay(new Date(Date.now() + n * 86400000)); }
  function showForm(f){ T.leadForm = f; app.render(); var el = document.getElementById('tx-l-name'); if(el){ el.scrollIntoView({ block:'center' }); el.focus(); } }

  function click(action, el){
    var v = el.getAttribute('data-value'), id = el.getAttribute('data-id'), l;
    if(action==='tx-out-tab'){ T.outTab = v; T.outConfirm = false; app.render(); }
    else if(action==='tx-out-seg'){ T.outSeg = v; T.outConfirm = false; T.draft = null; app.render(); }
    else if(action==='tx-out-all'){ var can = open(T.outSeg).slice(0, 25), clear = chosen().length===can.length, s = T.outPicked[T.outSeg] = {}; if(!clear) can.forEach(function(p){ s[p.id] = true; }); T.outConfirm = false; app.render(); }
    else if(action==='tx-out-confirm'){
      if(!msg(T.outSeg).trim()){ app.toast('Write a message first.'); return true; }
      if(chosen().length > 25){ app.toast('Choose up to 25 people at a time.'); return true; }
      T.outConfirm = true; app.render();
    }
    else if(action==='tx-out-cancel'){ T.outConfirm = false; app.render(); }
    else if(action==='tx-out-send') app.run(app.api('POST', 'admin/outreach', { segment:T.outSeg, channel:'app', message:msg(T.outSeg), userIds:chosen().map(function(p){ return p.id; }) }).then(function(r){ T.outPicked[T.outSeg] = {}; T.outConfirm = false; app.toast('Sent to ' + plural(r.sent, 'member') + '.'); return H.load(); }));
    else if(action==='tx-out-email'){
      var k = T.outSeg, p = seg(k).filter(function(x){ return x.id===id; })[0];
      app.run(app.api('POST', 'admin/outreach', { segment:k, channel:'email', userIds:[id] }).then(function(r){
        var text = T.outMsg[k] === undefined && SEGS[k][5] ? SEGS[k][5] : msg(k);
        T.draft = { seg:k, name:p.name, email:r.email, subject:SEGS[k][4], body:text.split('{name}').join(r.firstName) + '\n\n' + H.link('team-email').replace(/\/start.*/, '') + '\n\nIf you’d rather not get notes like this, reply and tell me, or turn off suggestions in My profile.' };
        return H.load();
      }));
    }
    else if(action==='tx-draft-copy') H.copy(T.draft.body, 'Message copied.');
    else if(action==='tx-draft-close'){ T.draft = null; app.render(); }
    else if(action==='tx-lead-new') showForm({ kind:'nonprofit', audience:'org', status:'idea', place:'' });
    else if(action==='tx-lead-kind') showForm({ kind:LOOK[+v][0], audience:LOOK[+v][1], status:'idea', place:T.near || '' });
    else if(action==='tx-lead-edit') showForm(Object.assign({}, lead(id)));
    else if(action==='tx-lead-cancel'){ T.leadForm = null; app.render(); }
    else if(action==='tx-lead-filter'){ T.leadFilter = v; app.render(); }
    else if(action==='tx-more-orgs'){ T.moreOrgs = !T.moreOrgs; app.render(); }
    else if(action==='tx-lead-add'){ var o = app.orgs().filter(function(x){ return x.id===id; })[0]; saveLead('', { name:o.name.slice(0, 100), kind:'nonprofit', audience:'org', place:o.location.slice(0, 60), contact:(o.website || '').slice(0, 160) }, 'Added to your list.'); }
    else if(action==='tx-lead-msg'){ T.leadMsg = T.leadMsg===id ? null : id; app.render(); }
    else if(action==='tx-lead-link') H.copy(H.link(lead(id).tag), 'Link copied.');
    else if(action==='tx-lead-copy') H.copy(pitch(lead(id)), 'Message copied.');
    else if(action==='tx-lead-done') saveLead(id, { status:'contacted', followUp:inDays(5) }, 'Marked as contacted. Follow up in 5 days.');
    else if(action==='tx-lead-ask'){ T.leadRemove = id; app.render(); }
    else if(action==='tx-lead-keep'){ T.leadRemove = null; app.render(); }
    else if(action==='tx-lead-remove') app.run(app.api('DELETE', 'admin/leads/' + id).then(function(){ T.out.leads = T.out.leads.filter(function(x){ return x.id !== id; }); T.leadRemove = null; app.toast('Removed.'); }));
    else return false;
    return true;
  }
  function submit(action){
    if(action !== 'tx-lead-save') return false;
    var f = T.leadForm, body = { name:f.name || '', kind:f.kind, audience:f.audience, place:f.place || '', contact:f.contact || '', notes:f.notes || '', status:f.status, followUp:f.followUp || '' };
    app.run(app.api('POST', 'admin/leads' + (f.id ? '/' + f.id : ''), body).then(function(r){ put(r.lead); T.leadForm = null; T.leadFilter = r.lead.status==='joined' || r.lead.status==='notnow' ? r.lead.status : 'open'; app.toast('Saved.'); }));
    return true;
  }
  function input(el, isChange){
    var k;
    if((k = el.getAttribute('data-tx-out'))){ if(isChange){ (T.outPicked[T.outSeg] = T.outPicked[T.outSeg] || {})[k] = el.checked; T.outConfirm = false; app.render(); var again = document.getElementById(el.id); if(again) again.focus(); } return true; }
    if(el.hasAttribute('data-tx-outmsg')){ T.outMsg[T.outSeg] = el.value; if(T.outConfirm){ T.outConfirm = false; app.render(); } return true; }
    if((k = el.getAttribute('data-tx-lead'))){ if(T.leadForm) T.leadForm[k] = el.value; return true; }
    if(el.hasAttribute('data-tx-near')){ T.near = el.value.trim(); document.querySelectorAll('[data-tx-map]').forEach(function(a){ a.href = map(+a.getAttribute('data-tx-map')); }); return true; }
    if((k = el.getAttribute('data-tx-stage'))){ if(isChange) saveLead(k, Object.assign({ status:el.value }, el.value==='contacted' && !lead(k).followUp ? { followUp:inDays(5) } : {}), 'Saved.'); return true; }
    return false;
  }
  function busy(){ return !!(T.leadForm || T.outConfirm || T.draft || T.leadRemove); }
  return { render:render, click:click, submit:submit, input:input, busy:busy, SEGS:SEGS };
};
