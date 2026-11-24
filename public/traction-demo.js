/* Sample data for the public dashboard demo (/#/dashboard-demo). Every person, post, and number here is made up.
   Nothing is sent or saved: changes live in this page until it's closed. */
window.GNDemo = function(){
  "use strict";
  var DAY = 86400000, now = Date.now(), n = 0;
  function id(){ return 'demo' + (++n); }
  function copy(x){ return JSON.parse(JSON.stringify(x)); }
  function rate(k, v){ var p = v ? k / v : 0, s = v ? Math.sqrt(p * (1 - p) / v) * 1.96 : 0; return { count:k, rate:p, ci:[Math.max(0, p - s), Math.min(1, p + s)] }; }
  function person(name, reasons){ return { id:id(), name:name, accountType:'person', reasons:reasons || [] }; }
  function camp(tag, aud, ben, ch, place, head, body, cta, v, c, s, age){ return { id:id(), tag:tag, name:head, audience:aud, benefit:ben, channel:ch, place:place, headline:head, body:body, cta:cta, archived:false, createdAt:now - age * DAY, visits:v, lastVisit:now, click:rate(c, v), signup:rate(s, v) }; }
  var weeks = [], S = [2,3,2,5,4,6,5,8,7,9,11,14], Ac = [6,8,7,11,12,14,13,18,20,23,26,31], Po = [1,2,2,3,3,4,4,6,5,8,9,11], Re = [1,1,2,2,4,4,5,6,8,9,12,15], Co = [0,0,1,0,1,1,2,2,3,3,4,6];
  for(var i = 0; i < 12; i++) weeks.push({ start:now - (12 - i) * 7 * DAY, signups:S[i], active:Ac[i], posts:Po[i], replies:Re[i], completed:Co[i] });
  var camps = [camp('flyer-elder', 'elder', 'named-yes', 'flyer', 'Riverside', 'Need a ride Thursday? A neighbor can say yes.', 'Ask for rides, groceries, or a hand with your phone.', 'Ask for a hand', 64, 21, 9, 12),
    camp('ig-need', 'need', 'private', 'instagram', '', 'Ask for help. Keep the conversation private.', 'Only members see your post, and every reply opens a private conversation.', 'Post what you need', 41, 6, 2, 9),
    camp('slide-class', 'offer', 'spots', 'slide', '', 'Spend your hour where it’s still needed.', 'See how many helpers each request still needs.', 'Offer your help', 33, 8, 4, 6)];
  function q(kind, type, title, cat, days, people){ return { kind:kind, postId:id(), type:type, title:title, category:cat, place:'Riverside', region:'Greater Boston', urgency:'Flexible', whenDate:null, poster:'Sample P.', days:days, people:people }; }
  var T = { now:now, sprint:{ name:'Sample growth sprint', startsAt:now - 8 * DAY, endsAt:now + 6 * DAY, goals:{ visits:200, signups:30, orgs:4, replies:30, completed:15 } }, window:{ from:now - 8 * DAY, to:now },
    totals:{ visits:151, clicks:38, signups:76, orgs:6, active:58, posts:58, replies:69, commitments:34, completed:23 }, current:{ visits:118, clicks:29, signups:21, orgs:2, active:38, posts:16, replies:22, commitments:12, completed:8 }, previous:{ visits:33, clicks:9, signups:14, orgs:1, active:29, posts:13, replies:15, commitments:7, completed:5 },
    funnel:{ members:76, acted:49, connected:41, committed:22, helped:18 }, weeks:weeks, campaigns:camps, untracked:[{ source:'', visits:13, lastVisit:now, click:rate(3, 13), signup:rate(1, 13) }],
    benefits:[['named-yes',64,21,9],['private',41,6,2],['spots',33,8,4]].map(function(b){ return { benefit:b[0], assets:1, visits:b[1], click:rate(b[2], b[1]), signup:rate(b[3], b[1]) }; }),
    demand:[['Transportation & rides',11,4,5,1],['Groceries & errands',8,7,3,3],['Elder care & companionship',6,5,2,2],['Tech & skills',4,6,1,3],['Food & meals',5,2,3,1]].map(function(d){ return { category:d[0], asks:d[1], offers:d[2], openAsks:d[3], openOffers:d[4] }; }),
    topics:['Snow shoveling'], landingClicks:[{ event:'cta:elder', n:14 },{ event:'cta:need', n:9 },{ event:'cta:offer', n:11 },{ event:'cta:org', n:4 }], feedback:[{ kind:'idea', n:5, fresh:2 },{ kind:'problem', n:2, fresh:0 }], excluded:{ replies:0, posts:0 },
    nudges:[{ kind:'match', sent:14, seen:11, acted:6 },{ kind:'commit', sent:5, seen:5, acted:3 },{ kind:'finish', sent:4, seen:4, acted:3 }],
    queue:[q('finish', 'ask', 'Ride to the library', 'Transportation & rides', 3, [person('Sample R.', ['Only the poster can mark it complete'])]),
      q('commit', 'ask', 'Help setting up a tablet', 'Tech & skills', 4, [person('Sample H.', ['In a conversation that hasn’t led to a commitment'])]),
      q('match', 'ask', 'Weekly grocery run', 'Groceries & errands', 5, [person('Sample M.', ['Offering this kind of help', 'Same town']), person('Sample J.', ['Lists driving as a skill'])]),
      q('match', 'ask', 'Company on weekday afternoons', 'Elder care & companionship', 6, [person('Sample K.', ['Same town', 'Here in the last week'])]),
      q('match', 'ask', 'Ride to an eye appointment', 'Transportation & rides', 2, [])] };
  function mem(k, name, note){ return { id:id(), name:name, accountType:'person', note:note, resting:false }; }
  var O = { segments:{ thanks:[mem('', 'Sample A.', 'Last here today'), mem('', 'Sample B.', 'Last here 2 days ago')], waiting:[mem('', 'Sample C.', 'Waiting 5 days for a reply. Last here yesterday'), mem('', 'Sample D.', 'Waiting 6 days for a reply. Last here 3 days ago')], welcome:[mem('', 'Sample E.', 'Joined today. Last here today'), mem('', 'Sample F.', 'Joined 3 days ago. Last here 2 days ago'), mem('', 'Sample G.', 'Joined 5 days ago. Last here 5 days ago')],
      drifting:[mem('', 'Sample L.', 'Last here 18 days ago'), mem('', 'Sample N.', 'Last here 25 days ago'), mem('', 'Sample O.', 'Last here 31 days ago')], dormant:[mem('', 'Sample Q.', 'Last here 52 days ago')], firstpost:[mem('', 'Sample S.', 'Last here 4 days ago'), mem('', 'Sample T.', 'Last here 6 days ago')], profile:[mem('', 'Sample U.', 'Last here yesterday')], champion:[mem('', 'Sample V.', 'Last here today'), mem('', 'Sample W.', 'Last here today')] },
    pulse:{ week:31, fortnight:15, month:14, older:11, never:5 }, optedOut:3, results:[{ segment:'welcome', channel:'app', sent:12, seen:10, returned:7, acted:5 },{ segment:'drifting', channel:'email', sent:8, seen:0, returned:3, acted:2 }],
    leads:[{ id:id(), name:'Sample Senior Center', kind:'senior', audience:'elder', place:'Riverside', contact:'desk@example.com', notes:'Ask about the monthly newsletter.', status:'contacted', followUp:'2026-01-01', tag:'demo', createdAt:now - 8 * DAY, contactedAt:now - 6 * DAY, visits:7, joins:2 },
      { id:id(), name:'Sample Student Club', kind:'student', audience:'offer', place:'', contact:'', notes:'', status:'idea', followUp:'', tag:'demo', createdAt:now - DAY, contactedAt:null, visits:0, joins:0 }],
    coach:[{ id:id(), key:'idea:class-slide', title:'Show your QR slide before a class', status:'done', metric:'visits', baseline:118, value:151, until:now + 20 * DAY, at:now - 2 * DAY }] };
  return function(method, path, b){
    b = b || {};
    var p = path.split('/'), x, list;
    function ok(v){ return Promise.resolve(copy(v)); }
    if(path==='admin/traction') return ok(T);
    if(path==='admin/outreach' && method==='GET') return ok(O);
    if(path==='admin/sprint'){ T.sprint = { name:b.name, startsAt:b.startsAt, endsAt:b.endsAt, goals:b.goals }; return ok({ sprint:T.sprint }); }
    if(path==='admin/nudges'){ T.queue.forEach(function(i){ if(i.postId===b.postId) i.people.forEach(function(w){ if(b.userIds.indexOf(w.id) > -1) w.sent = true; }); }); return ok({ sent:b.userIds.length }); }
    if(path==='admin/campaigns'){ x = camp(b.tag, b.audience, b.benefit, b.channel, b.place || '', b.headline, b.body, b.cta, 0, 0, 0, 0); T.campaigns.unshift(x); return ok({ campaign:x }); }
    if(p[1]==='campaigns'){ T.campaigns.forEach(function(c){ if(c.id===p[2]) c.archived = b.action==='archive'; }); return ok({ ok:true }); }
    if(path==='admin/outreach'){
      list = O.segments[b.segment].filter(function(m){ return b.userIds.indexOf(m.id) > -1; }); list.forEach(function(m){ m.resting = true; });
      x = O.results.filter(function(r){ return r.segment===b.segment && r.channel===b.channel; })[0];
      if(x) x.sent += list.length; else O.results.push({ segment:b.segment, channel:b.channel, sent:list.length, seen:0, returned:0, acted:0 });
      return ok({ sent:list.length, email:'sample@example.com', firstName:'Sample' });
    }
    if(p[1]==='leads'){
      if(method==='DELETE'){ O.leads = O.leads.filter(function(l){ return l.id !== p[2]; }); return ok({ ok:true }); }
      x = O.leads.filter(function(l){ return l.id===p[2]; })[0];
      if(!x){ x = { id:id(), kind:'other', audience:'org', place:'', contact:'', notes:'', status:'idea', followUp:'', tag:'demo', createdAt:now, contactedAt:null, visits:0, joins:0 }; O.leads.unshift(x); }
      Object.assign(x, b); return ok({ lead:x });
    }
    if(p[1]==='coach'){
      if(method==='DELETE'){ O.coach = O.coach.filter(function(c){ return c.id !== p[2]; }); return ok({ ok:true }); }
      x = { id:id(), key:b.key, title:b.title, status:b.status, metric:b.metric || '', baseline:T.totals[b.metric] || 0, value:b.metric ? T.totals[b.metric] : null, until:now + (b.status==='later' ? 2 : 7) * DAY, at:Date.now() };
      O.coach.unshift(x); return ok({ entry:x });
    }
    return Promise.reject(new Error('Not available in the demo.'));
  };
};
