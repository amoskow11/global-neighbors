/* Traction coach: turns live numbers into suggestions, and keeps fresh ideas coming. Loaded only for admins.
   Every suggestion says why it's there. Nothing is made up: live ones quote the dashboard's own numbers. */
window.GNCoach = function(app, T, H){
  "use strict";
  var A = window.GNAssets, DAY = 86400000;
  var CATS = { help:'Turn posts into help', keep:'Keep people active', grow:'Bring people in', trust:'Build trust' };

  function seg(k){ return T.out ? T.out.segments[k].filter(function(p){ return !p.resting; }) : []; }
  function hash(s){ var h = 2166136261; for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ---------- driven by what's happening right now ---------- */
  function live(){
    var d = T.data, o = T.out, out = [], s = d.sprint, b = H.balance(), p = H.plural;
    function add(w, key, cat, title, why, label, go, metric, time, priv){ out.push({ weight:w, key:key, cat:cat, title:title, why:why, label:label, go:go, metric:metric, time:time || '5 min', live:true, priv:!!priv }); }

    var f = H.ready('finish'), c = H.ready('commit'), m = H.ready('match'), noReply = d.queue.filter(function(q){ return q.kind==='match'; });
    if(f.length) add(100, 'finish', 'help', p(f.length, 'task') + ' may already be done', 'Someone committed, and the date or a few days have passed, but the poster hasn’t confirmed it. A reminder turns finished help into a result you can count.', 'Remind the poster', { step:'want', at:'tx-queue' }, 'completed', '1 min');
    if(c.length) add(95, 'commit', 'help', p(c.length, 'conversation') + ' stopped short of a yes', 'These neighbors are talking but nobody has committed. A reminder asks the helper to commit or let the poster know.', 'Send reminders', { step:'want', at:'tx-queue' }, 'commitments', '1 min');
    if(m.length) add(92, 'match', 'help', m.length + ' of ' + p(noReply.length, 'unanswered post') + ' ' + (m.length===1 ? 'has' : 'have') + ' a likely match', 'The dashboard found members whose posts, skills, or location fit. Invite them, then watch whether a reply follows.', 'Review matches', { step:'want', at:'tx-queue' }, 'replies', '2 min');

    if(o){
      var due = o.leads.filter(function(l){ return l.followUp && l.followUp <= app.localDay(new Date()) && ['joined','notnow'].indexOf(l.status) < 0; });
      if(due.length) add(90, 'followups', 'grow', p(due.length, 'follow-up') + ' due', 'A second message is often the one that gets an answer. ' + (due.length===1 ? due[0].name + ' is' : due.length + ' prospects are') + ' waiting on you.', 'Open follow-ups', { step:'outreach', tab:'new' }, 'signups', '5 min', true);
      if(seg('welcome').length) add(88, 'welcome', 'keep', 'Welcome ' + p(seg('welcome').length, 'new member'), 'They joined in the last 14 days and haven’t posted or replied. A first week without a first step is when people leave.', 'Write to them', { step:'outreach', tab:'members', seg:'welcome' }, 'posts', '2 min');
      if(seg('waiting').length) add(86, 'waiting', 'keep', p(seg('waiting').length, 'member is', 'members are') + ' waiting for a first reply', 'Their posts have gone more than two days without one. Tell them you’re looking, and ask for a detail that would help.', 'Reassure them', { step:'outreach', tab:'members', seg:'waiting' }, 'active', '2 min');
      if(seg('drifting').length) add(80, 'drifting', 'keep', p(seg('drifting').length, 'member is', 'members are') + ' drifting away', 'Last here 15 to 45 days ago. They’re easier to bring back now than in a month.', 'Invite them back', { step:'outreach', tab:'members', seg:'drifting' }, 'active', '3 min');
      if(seg('dormant').length) add(58, 'dormant', 'keep', p(seg('dormant').length, 'member has', 'members have') + ' gone quiet', 'Not seen in over 45 days. They won’t see an in-app note, so send a short personal email.', 'Email them', { step:'outreach', tab:'members', seg:'dormant' }, 'active', '10 min');
      if(seg('firstpost').length) add(72, 'firstpost', 'keep', 'Help ' + p(seg('firstpost').length, 'visitor', 'visitors') + ' take a first step', 'They’ve been here in the last two weeks but never posted or replied.', 'Suggest a first step', { step:'outreach', tab:'members', seg:'firstpost' }, 'posts', '2 min');
      if(seg('thanks').length) add(84, 'thanks', 'keep', 'Thank ' + p(seg('thanks').length, 'person', 'people') + ' who just helped or got help', 'A thank-you brings people back, and it’s the best moment to ask for a rating.', 'Say thanks', { step:'outreach', tab:'members', seg:'thanks' }, 'active', '2 min');
      if(seg('profile').length) add(60, 'profile', 'help', p(seg('profile').length, 'active member hasn’t', 'active members haven’t') + ' listed how they can help', 'Matching works better with skills on a profile.', 'Ask for skills', { step:'outreach', tab:'members', seg:'profile' }, 'replies', '2 min');
      if(seg('champion').length) add(70, 'champion', 'grow', 'Ask ' + p(seg('champion').length, 'active member') + ' to invite a neighbor', 'People who already use the site make the most believable invitation. Their link is tracked.', 'Ask for invites', { step:'outreach', tab:'members', seg:'champion' }, 'signups', '3 min');
      var ideas = o.leads.filter(function(l){ return l.status==='idea'; }), openLeads = o.leads.filter(function(l){ return l.status !== 'notnow'; });
      if(ideas.length) add(74, 'contactleads', 'grow', 'Contact ' + (ideas.length===1 ? ideas[0].name : p(ideas.length, 'saved prospect')), 'They’re on your list but nobody has reached out yet. The message is already written.', 'Reach out', { step:'outreach', tab:'new' }, 'signups', '5 min', true);
      if(!openLeads.length) add(76, 'firstlead', 'grow', 'Add your first five prospects', 'The dashboard suggests organizations that fit what neighbors are asking for. Pick five and reach out one at a time.', 'See suggestions', { step:'outreach', tab:'new' }, 'orgs', '10 min');
    }

    if(!s) add(82, 'sprint', 'grow', 'Set your sprint goals', 'Pick dates and targets so every number here has something to be measured against.', 'Set goals', { sprint:true }, '', '2 min');
    else if(d.now >= s.startsAt && d.now < s.endsAt){
      var pace = (d.now - s.startsAt) / (s.endsAt - s.startsAt), behind = Object.keys(s.goals).map(function(g){ return { g:g, gap:Math.round(s.goals[g] * pace) - d.current[g], share:d.current[g] / s.goals[g] }; }).filter(function(x){ return x.gap > 0; }).sort(function(x, y){ return x.share - y.share; })[0];
      var DO = { visits:['Put a link where people already look', 'Build an asset', { step:'build', audience:'need' }], signups:['Reach possible new users', 'Open outreach', { step:'outreach', tab:'new' }], orgs:['Invite an organization', 'Open outreach', { step:'outreach', tab:'new' }], posts:['Help a member make a first post', 'Open outreach', { step:'outreach', tab:'members', seg:'firstpost' }],
        replies:['Match people to open posts', 'See posts', { step:'want', at:'tx-queue' }], commitments:['Move conversations to a yes', 'See posts', { step:'want', at:'tx-queue' }], completed:['Confirm finished help', 'See posts', { step:'want', at:'tx-queue' }] };
      if(behind) add(78, 'pace-' + behind.g, behind.g==='visits' || behind.g==='signups' || behind.g==='orgs' ? 'grow' : 'help', H.METRICS[behind.g] + ': ' + behind.gap + ' behind an even pace', d.current[behind.g] + ' of ' + s.goals[behind.g] + ' so far. ' + DO[behind.g][0] + '.', DO[behind.g][1], DO[behind.g][2], behind.g, '10 min');
    }

    if(b.offers > b.asks * 1.5 && b.offers > 1) add(68, 'needasks', 'grow', 'Find more people who need a hand', p(b.offers, 'open offer') + ' and only ' + p(b.asks, 'open request') + '. Helpers are waiting, so market to people who need help.', 'Build an asset', { step:'build', audience:'need', place:H.topPlace('offer') }, 'posts', '5 min');
    else if(b.asks > b.offers * 1.5 && b.asks > 1) add(68, 'needoffers', 'grow', 'Find more helpers', p(b.asks, 'open request') + ' and only ' + p(b.offers, 'open offer') + '. Market to people who can help.', 'Build an asset', { step:'build', audience:'offer', place:H.topPlace('ask') }, 'posts', '5 min');

    var live_ = d.campaigns.filter(function(x){ return !x.archived; });
    if(!live_.length) add(75, 'firstasset', 'grow', 'Make your first tracked asset', 'Pick an audience and a benefit. The flyer, link, and QR code take about a minute.', 'Build an asset', { step:'build', audience:'elder' }, 'visits', '2 min');
    live_.forEach(function(x){
      if(!x.visits && x.createdAt < d.now - 2 * DAY) add(57, 'noscan:' + x.tag.slice(0, 40), 'grow', 'No visits yet from “' + x.headline.slice(0, 50) + '”', 'It was saved ' + p(Math.floor((d.now - x.createdAt) / DAY), 'day') + ' ago. Check that it’s posted somewhere people stop, or try another spot.', 'See results', { step:'results' }, 'visits', '5 min');
      else if(x.visits >= 10 && !x.click.count) add(66, 'noclick:' + x.tag.slice(0, 40), 'grow', 'People open “' + x.headline.slice(0, 50) + '” but don’t act', x.visits + ' visits and no sign-up clicks. Try a different benefit for the same audience.', 'Try another', { step:'frame', audience:x.audience }, 'signups', '5 min');
    });
    var w = H.winner();
    if(w) add(64, 'winner:' + w.benefit, 'grow', 'Make more of “' + A.BENEFITS[w.benefit].name.toLowerCase() + '”', 'It has the highest click rate so far: ' + w.click.count + ' of ' + p(w.visits, 'visitor') + '. Try it in another format or place.', 'Build an asset', { step:'build', benefit:w.benefit, audience:Object.keys(A.AUDIENCES).filter(function(k){ return A.benefitsFor(k).indexOf(w.benefit) > -1; })[0] }, 'visits', '5 min');
    else if(d.benefits.filter(function(x){ return x.benefit !== 'custom'; }).length===1) add(56, 'secondbenefit', 'grow', 'Test a second benefit', 'You have one message out. Two let you see which gets people to act.', 'Pick another', { step:'frame' }, 'visits', '5 min');
    if(!w && d.current.visits < 20) add(55, 'morevisits', 'grow', 'Get more people to the welcome page', p(d.current.visits, 'visit') + ' in this period. Make a flyer or post for one audience and one place, then compare.', 'Build an asset', { step:'build', audience:'need' }, 'visits', '10 min');
    if(d.totals.clicks >= 5 && d.totals.clicks > 3 * d.campaigns.concat(d.untracked).reduce(function(t, x){ return t + x.signup.count; }, 0)) add(62, 'clicksnojoin', 'trust', 'People click to join, then stop', p(d.totals.clicks, 'person', 'people') + ' clicked a sign-up button, and far fewer finished. Ask someone new to sign up while you watch.', 'See results', { step:'results' }, 'signups', '15 min');
    if(d.totals.orgs < 5) add(54, 'orgs', 'grow', d.totals.orgs===1 ? 'You have one organization' : 'You have ' + p(d.totals.orgs, 'organization'), 'One group can’t reduce duplicated work alone. Start with small groups that the large referral networks overlook.', 'Find organizations', { step:'outreach', tab:'new' }, 'orgs', '15 min');
    var fresh = d.feedback.reduce(function(t, x){ return t + (x.fresh || 0); }, 0);
    if(fresh) add(73, 'feedback', 'trust', 'Read ' + p(fresh, 'new feedback note'), 'Answering feedback quickly is the cheapest way to earn a loyal member.', 'Read feedback', { admin:'feedback' }, '', '3 min');
    var ov = app.state.admin.overview;
    if(ov && ov.openReports) add(99, 'reports', 'trust', p(ov.openReports, 'safety report') + ' to review', 'Handling reports first keeps people comfortable staying.', 'Review', { admin:'reports' }, '', '5 min', true);
    if(ov && ov.pendingVerifications) add(83, 'verify', 'trust', p(ov.pendingVerifications, 'organization') + ' waiting for verification', 'A quick answer keeps a new organization engaged.', 'Review', { admin:'verifications' }, 'orgs', '5 min');
    if(ov && !ov.emailEnabled) add(50, 'email', 'trust', 'Turn on email', 'Members only hear about replies when they come back on their own. Email is the biggest missing piece for keeping people active.', 'How to set it up', { href:'https://github.com/amoskow11/global-neighbors#turning-on-email' }, 'active', '30 min');
    if(d.topics.length) add(45, 'topics', 'trust', 'Look at the topics people typed in', p(d.topics.length, 'topic') + ' didn’t fit a category. If one keeps coming up, make an asset for it.', 'See topics', { step:'want' }, 'posts', '5 min');
    return out.sort(function(x, y){ return y.weight - x.weight; });
  }

  /* ---------- fresh ideas, different every day ---------- */
  // [key, category, title, why, label, go, metric, time, months (1–12) or none]
  var IDEAS = [
    ['class-slide','grow','Show your QR slide before a class','Everyone in the room has a phone out, and the scan is tracked.','Make a slide',{ step:'build', audience:'offer', channel:'slide' },'visits','5 min'],
    ['bulletin','grow','Post one flyer on a community board','Libraries, laundromats, and coffee shops often have one. Ask first, then compare places by link.','Make a flyer',{ step:'build', audience:'elder', channel:'flyer' },'visits','20 min'],
    ['senior-center','grow','Call one senior center','Ask who coordinates rides or visits. One coordinator can speak for many older adults.','Add a prospect',{ step:'outreach', tab:'new' },'signups','15 min'],
    ['student-club','grow','Invite one student service club','Clubs need volunteer hours, and your open requests are ready-made ones.','Add a prospect',{ step:'outreach', tab:'new' },'signups','10 min'],
    ['faith','grow','Ask a faith community to share one post','Many already run meal trains and ride lists.','Add a prospect',{ step:'outreach', tab:'new' },'signups','10 min'],
    ['campus-news','grow','Pitch a short story to a student newspaper','A neighbor who got help is a better story than a new app. Get permission first.','Add a prospect',{ step:'outreach', tab:'new' },'visits','30 min'],
    ['story-post','grow','Share a story with your tracked link','Use the story format and add the link as a sticker.','Make a story',{ step:'build', audience:'offer', channel:'story' },'visits','5 min'],
    ['local-group','grow','Share in one local online group','Read its rules first, and reply to every comment that day.','Make a post',{ step:'build', audience:'need', channel:'instagram' },'visits','15 min'],
    ['text-five','grow','Text five people who might need a hand','Personal messages beat posts. Use a tracked link so you know it worked.','Write a text',{ step:'build', audience:'need', channel:'text' },'signups','10 min'],
    ['email-sig','grow','Put a tracked link in your email signature','It works quietly every day.','Make a link',{ step:'build', audience:'offer', channel:'email' },'visits','5 min'],
    ['table','grow','Run a 30-minute table at a busy spot','Bring a flyer and help people write their first post on the spot.','Make a flyer',{ step:'build', audience:'need', channel:'flyer' },'posts','45 min'],
    ['one-town','grow','Pick one town and focus on it for a week','Help needs density. Ten people in one place beat fifty spread out.','Build for one place',{ step:'build', audience:'need' },'replies','15 min'],
    ['two-headlines','grow','Run two headlines for one audience','Same place, same week, two links. Then you’ll know which one works.','Pick a benefit',{ step:'frame' },'visits','10 min'],
    ['interview','trust','Ask one older adult to try signing up while you watch','You’ll see where the words or buttons confuse people.','See results',{ step:'results' },'signups','20 min'],
    ['seed-real','help','Post one real request of your own circle','Ask a friend or relative what they need this week, and help them post it.','See demand',{ step:'want' },'posts','10 min'],
    ['reply-fast','help','Aim for a first reply within a day','A fast first reply is the strongest reason to come back.','See posts',{ step:'want', at:'tx-queue' },'replies','10 min'],
    ['call-poster','help','Call or message one person who is waiting','Ask what would make their post easier to answer.','See who’s waiting',{ step:'outreach', tab:'members', seg:'waiting' },'replies','10 min'],
    ['share-result','trust','Share your results image','Progress people can see, with numbers they can trust, builds confidence.','Open results',{ step:'results' },'visits','5 min'],
    ['thank-public','keep','Thank a helper publicly','With their permission, share one sentence about what they did.','See who helped',{ step:'outreach', tab:'members', seg:'thanks' },'active','10 min'],
    ['safety-tips','trust','Share the safety tips with a new group','It answers the first question most people have.','Make a message',{ step:'build', audience:'elder', channel:'email' },'signups','5 min'],
    ['vouch','trust','Ask one verified group to point people to the site','A familiar name makes strangers easier to trust.','Add a prospect',{ step:'outreach', tab:'new' },'orgs','15 min'],
    ['review-labels','trust','Ask three members what almost stopped them joining','Three answers will show a pattern. Fix the most common one.','See active members',{ step:'outreach', tab:'members', seg:'champion' },'signups','20 min'],
    ['s-thanks','grow','Ask who could use a hand this Thanksgiving','Meals, rides, and company are easy to ask for this week.','Make an asset',{ step:'build', audience:'elder', headline:'Could you use a hand this Thanksgiving?' },'posts','10 min',[11]],
    ['s-snow','grow','Line up snow shovelers now','Older adults plan ahead when storms are coming, and students can help.','Make an asset',{ step:'build', audience:'elder', headline:'Who will shovel when it snows?' },'posts','10 min',[11,12,1,2]],
    ['s-holiday','keep','Invite members to one holiday task','A single, dated task is easier to say yes to.','Write to members',{ step:'outreach', tab:'members', seg:'champion' },'commitments','10 min',[12]],
    ['s-break','keep','Plan for student break','Student helpers leave soon. Ask who is staying and can cover requests.','Write to members',{ step:'outreach', tab:'members', seg:'champion' },'active','10 min',[4,5,11,12]],
    ['s-tax','grow','Reach people who need a hand with paperwork','Tax season makes this a common need for older adults.','Make an asset',{ step:'build', audience:'elder', headline:'Need a hand with paperwork?' },'posts','10 min',[2,3,4]],
    ['s-move','grow','Help people with move-in','Heavy lifting and furniture are in demand.','Make an asset',{ step:'build', audience:'need', headline:'Moving? Ask for a hand.' },'posts','10 min',[8,9]],
    ['s-heat','grow','Start summer check-ins','Hot days are a good reason for a visit or a call.','Make an asset',{ step:'build', audience:'elder', headline:'A quick check-in on a hot day.' },'posts','10 min',[6,7,8]]
  ];
  function evergreen(){
    var now = new Date(), month = now.getMonth() + 1, day = app.localDay(now);
    return IDEAS.filter(function(x){ return !x[8] || x[8].indexOf(month) > -1; }).map(function(x){
      return { key:'idea:' + x[0], cat:x[1], title:x[2], why:x[3], label:x[4], go:x[5], metric:x[6], time:x[7], evergreen:true, weight:x[8] ? 30 : 10, order:hash(day + x[0]) };
    }).sort(function(x, y){ return y.weight - x.weight || x.order - y.order; });
  }

  function hidden(key){
    if(!T.out) return false;
    var last = T.out.coach.filter(function(c){ return c.key===key; })[0];
    return !!last && last.until > T.data.now;
  }
  // Live suggestions first, with fresh ideas after. There's always something to do: when every idea is used up, the oldest come back.
  function list(){
    var ev = evergreen(), all = live().concat(ev).filter(function(x){ return !hidden(x.key); });
    if(all.length < 4) all = all.concat(ev.filter(function(x){ return all.indexOf(x) < 0; }).slice(0, 4));
    return all;
  }
  return { list:list, CATS:CATS, IDEAS:IDEAS };
};
