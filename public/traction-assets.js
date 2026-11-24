/* Marketing asset studio: QR codes, copy, and canvas drawing. Loaded only when an admin opens Traction. */
(function(){
  "use strict";

  /* ============ QR CODE (byte mode, error correction M, versions 1–10) ============ */
  var ECC = [0,10,16,26,18,24,16,18,22,22,26], BLOCKS = [0,1,1,1,2,2,4,4,4,5,5], RAW = [0,26,44,70,100,134,172,196,242,292,346];
  var ALIGN = [0,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
  function gfMul(x, y){ var z = 0; for(var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
  function rsDivisor(n){
    var r = []; for(var i = 0; i < n; i++) r.push(i===n-1 ? 1 : 0);
    var root = 1;
    for(i = 0; i < n; i++){ for(var j = 0; j < n; j++){ r[j] = gfMul(r[j], root); if(j + 1 < n) r[j] ^= r[j+1]; } root = gfMul(root, 2); }
    return r;
  }
  function rsRemainder(data, div){
    var r = div.map(function(){ return 0; });
    data.forEach(function(b){ var f = b ^ r.shift(); r.push(0); div.forEach(function(c, i){ r[i] ^= gfMul(c, f); }); });
    return r;
  }
  function qr(textValue){
    var bytes = [].slice.call(new TextEncoder().encode(textValue)), v = 1, cap;
    for(; v <= 10; v++){ cap = RAW[v] - ECC[v] * BLOCKS[v]; if(bytes.length * 8 + 4 + (v < 10 ? 8 : 16) <= cap * 8) break; }
    if(v > 10) throw new Error('That link is too long for a QR code.');
    var bits = [], put = function(val, n){ for(var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(function(b){ put(b, 8); });
    put(0, Math.min(4, cap * 8 - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for(var pad = 0xEC; bits.length < cap * 8; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for(var i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // Split into blocks, add error correction, interleave.
    var nb = BLOCKS[v], ecl = ECC[v], raw = RAW[v], nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = rsDivisor(ecl), k = 0;
    for(i = 0; i < nb; i++){
      var d = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += d.length;
      var e = rsRemainder(d, div); if(i < nShort) d.push(null);
      blocks.push(d.concat(e));
    }
    var words = [];
    for(i = 0; i < blocks[0].length; i++) blocks.forEach(function(b){ if(b[i] !== null) words.push(b[i]); });
    var n = v * 4 + 17, m = [], fn = [];
    for(i = 0; i < n; i++){ m.push(new Array(n).fill(0)); fn.push(new Array(n).fill(false)); }
    function set(x, y, on){ m[y][x] = on ? 1 : 0; fn[y][x] = true; }
    for(i = 0; i < n; i++){ set(6, i, i % 2===0); set(i, 6, i % 2===0); }
    [[3,3],[n-4,3],[3,n-4]].forEach(function(c){
      for(var dy = -4; dy <= 4; dy++) for(var dx = -4; dx <= 4; dx++){
        var x = c[0] + dx, y = c[1] + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
        if(x >= 0 && x < n && y >= 0 && y < n) set(x, y, dist !== 2 && dist !== 4);
      }
    });
    var al = ALIGN[v], last = al.length - 1;
    al.forEach(function(cy, r){ al.forEach(function(cx, c){
      if((r===0 && c===0) || (r===0 && c===last) || (r===last && c===0)) return;
      for(var dy = -2; dy <= 2; dy++) for(var dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function format(mask){
      var dat = mask, rem = dat;   // level M is 00
      for(var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((dat << 10) | rem) ^ 0x5412, bit = function(i){ return (b >>> i) & 1; };
      for(i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for(i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for(i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
      for(i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
      set(8, n - 8, 1);
    }
    format(0);
    if(v >= 7){
      var rem = v; for(i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (v << 12) | rem;
      for(i = 0; i < 18; i++){ var on = (vb >>> i) & 1, a = n - 11 + i % 3, bb = Math.floor(i / 3); set(a, bb, on); set(bb, a, on); }
    }
    var idx = 0;
    for(var right = n - 1; right >= 1; right -= 2){
      if(right===6) right = 5;
      for(var vert = 0; vert < n; vert++) for(var j = 0; j < 2; j++){
        var x = right - j, up = ((right + 1) & 2)===0, y = up ? n - 1 - vert : vert;
        if(!fn[y][x] && idx < words.length * 8){ m[y][x] = (words[idx >>> 3] >>> (7 - (idx & 7))) & 1; idx++; }
      }
    }
    var MASKS = [function(x,y){return (x+y)%2;}, function(x,y){return y%2;}, function(x){return x%3;}, function(x,y){return (x+y)%3;},
      function(x,y){return (Math.floor(x/3)+Math.floor(y/2))%2;}, function(x,y){return x*y%2+x*y%3;}, function(x,y){return (x*y%2+x*y%3)%2;}, function(x,y){return ((x+y)%2+x*y%3)%2;}];
    function apply(k){ for(var y = 0; y < n; y++) for(var x = 0; x < n; x++) if(!fn[y][x] && MASKS[k](x, y)===0) m[y][x] ^= 1; }
    function penalty(){
      var p = 0, dark = 0, lines = [], x, y;
      for(y = 0; y < n; y++){ lines.push(m[y].join('')); lines.push(m.map(function(r){ return r[y]; }).join('')); }
      lines.forEach(function(s){
        (s.match(/0{5,}|1{5,}/g) || []).forEach(function(r){ p += r.length - 2; });
        for(var q = 0; q + 11 <= s.length; q++){ var w = s.substr(q, 11); if(w==='10111010000' || w==='00001011101') p += 40; }
      });
      for(y = 0; y < n; y++) for(x = 0; x < n; x++){
        dark += m[y][x];
        if(x + 1 < n && y + 1 < n && m[y][x]===m[y][x+1] && m[y][x]===m[y+1][x] && m[y][x]===m[y+1][x+1]) p += 3;
      }
      return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
    }
    var best = 0, low = Infinity;
    for(i = 0; i < 8; i++){ apply(i); format(i); var pen = penalty(); if(pen < low){ low = pen; best = i; } apply(i); }
    apply(best); format(best);
    return m;
  }

  /* ============ COPY ============ */
  // What each benefit claims, and why it stands out. Sources: the competitive analysis of Nov 24, 2026.
  var BENEFITS = {
    'named-yes':{ name:'A neighbor says yes', gap:'Nextdoor shows who lives nearby, and findhelp shows which program exists. Neither result is a named person who committed to your request.', built:'A helper commits to one specific request, and the poster sees who is coming.', short:'yes' },
    'private':{ name:'Help on your terms', gap:'Half of adults 55 and older aren’t sure apps for aging respect their privacy. Clear privacy is room to stand out.', built:'Replies open a private conversation. Emails are never shown, and posters can decline anyone.', short:'private' },
    'spots':{ name:'See where you’re needed', gap:'Helper spots and commitments didn’t appear on the Nextdoor or Idealist pages in the analysis.', built:'Every post shows how many of its 1 to 20 helper spots are still open.', short:'spots' },
    'ratings':{ name:'Build a trusted name', gap:'Two-way ratings didn’t appear on the Nextdoor, Idealist, findhelp, or CharityTracker pages in the analysis. Papa rates visits only.', built:'After a task, the poster and each helper can rate each other.', short:'stars' },
    'partners':{ name:'Find local partners', gap:'Big referral networks overlook small, informal groups. Finding the right partner was nonprofit CEOs’ top barrier in a 2014 survey.', built:'A directory searchable by cause and region, plus verified badges for registered groups.', short:'find' },
    'no-duplicate':{ name:'Stop duplicated work', gap:'CharityTracker and The Community Platform already pitch this, so use it only with nonprofits.', built:'Posts show when a request is full. Shared records between groups aren’t built yet.', short:'twice' },
    'custom':{ name:'My own message', gap:'Write your own and see how it does against the others.', built:'Only claim what the site does today.', short:'own' }
  };
  var AUDIENCES = { elder:'Older adults', need:'People who need help', offer:'People offering help', org:'Nonprofits and NGOs' };
  var CHANNELS = { flyer:['Printed flyer','Letter page with a QR code'], instagram:['Instagram post','1080 × 1080'], story:['Story','1080 × 1920'], slide:['Slide or screen','1920 × 1080 with a QR code'], email:['Email','Banner and message'], text:['Text message','Message only'] };
  function copyFor(aud, ben, orgCount){
    var C = {
      elder:{ 'named-yes':['Need a ride Thursday? A neighbor can say yes.','Ask for rides, groceries, heavy lifting, or a hand with your phone. See who’s coming and read their ratings first.','Ask for a hand'],
              'private':['Everyday help, on your terms.','Your email is never shown. Share your address only when you’re ready, and decline anyone you like.','Ask for a hand'] },
      need:{ 'named-yes':['Ask once. See who’s coming.','One post reaches neighbors, volunteers, and organizations. You see who commits, and whether you need more people.','Post what you need'],
             'private':['Ask for help. Keep the conversation private.','Only members see your post, and every reply opens a private conversation. Your email is never shown.','Post what you need'] },
      offer:{ 'spots':['Spend your hour where it’s still needed.','Find requests near you and see how many helpers each one still needs before you commit.','Offer your help'],
              'ratings':['Help a neighbor. Build a name people trust.','Pick a task that fits your week. When it’s done, you and the poster can rate each other.','Offer your help'] },
      org:{ 'partners':['Find the groups already helping your community.','Search ' + (orgCount || 'dozens of') + ' nonprofits and NGOs by cause and region. Post one request for up to 20 helpers.','Join as an organization'],
            'no-duplicate':['Stop doing the same good work twice.','Find groups serving the same people, share what you have, and see when a request is already full.','Join as an organization'] }
    };
    var c = C[aud][ben];
    return c ? { headline:c[0], body:c[1], cta:c[2] } : { headline:'', body:'', cta:C[aud][Object.keys(C[aud])[0]][2] };
  }
  function benefitsFor(aud){ return { elder:['named-yes','private'], need:['named-yes','private'], offer:['spots','ratings'], org:['partners','no-duplicate'] }[aud].concat('custom'); }
  function slug(s){ return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function makeTag(s, taken){
    var base = [s.channel==='instagram' ? 'ig' : s.channel, s.audience, BENEFITS[s.benefit].short, slug(s.place)].filter(Boolean).join('-').slice(0, 24).replace(/-$/, '');
    var t = base, n = 2;
    while(taken.indexOf(t) > -1){ t = base.slice(0, 21) + '-' + n; n++; }
    return t;
  }
  function captions(s, link){
    var where = s.place ? ' in ' + s.place : '';
    return {
      flyer:'', slide:'',
      instagram:s.headline + '\n\n' + s.body + '\n\n' + s.cta + (where ? where : '') + ': ' + link + '\n\nFree to join. 18 and older.',
      story:s.cta + ' → ' + link,
      email:'Subject: ' + s.headline + '\n\nHi,\n\n' + s.body + '\n\nGlobal Neighbors is a free help board' + where + '. It takes about 30 seconds to join:\n' + link + '\n\nYou must be 18 or older. It isn’t for emergencies.',
      text:s.headline + ' ' + s.body + ' Free: ' + link
    }[s.channel];
  }

  /* ============ DRAWING ============ */
  var SIZES = { flyer:[1700,2200], instagram:[1080,1080], story:[1080,1920], slide:[1920,1080], email:[1200,600] };
  var THEMES = {
    elder:{ bg:'#FFF4E4', ink:'#132A46', soft:'#4A5568', a:'#F3D9B5', b:'#E9C592', roof:'#D9A868', ground:'#C98F4B', lit:'#E2711D', pill:'#132A46', pillText:'#FFFFFF', arc:'#E2711D' },
    need:{ bg:'#0F4C5C', ink:'#FFFFFF', soft:'#CFE5EA', a:'#1B6477', b:'#175A6C', roof:'#0B3D4B', ground:'#0A3440', lit:'#F7A35C', pill:'#F7A35C', pillText:'#132A46', arc:'#F7A35C' },
    offer:{ bg:'#F2A35E', ink:'#132A46', soft:'#3B2A18', a:'#E58C42', b:'#DC7F33', roof:'#C46A22', ground:'#A95615', lit:'#FFF4E4', pill:'#132A46', pillText:'#FFFFFF', arc:'#132A46' },
    org:{ bg:'#132A46', ink:'#FFFFFF', soft:'#C3D2E1', a:'#21436A', b:'#1C3A5E', roof:'#0D2038', ground:'#0A1A2E', lit:'#59B6D6', pill:'#F7A35C', pillText:'#132A46', arc:'#59B6D6' }
  };
  var DISPLAY = "Newsreader, Georgia, serif", SANS = "'Public Sans', Arial, sans-serif";
  function fontsReady(){
    if(!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('600 80px Newsreader'), document.fonts.load('400 40px "Public Sans"'), document.fonts.load('700 40px "Public Sans"')]).catch(function(){});
  }
  function wrap(c, str, w){
    var out = [];
    String(str).split('\n').forEach(function(para){
      var line = '';
      para.split(/\s+/).forEach(function(word){
        var next = line ? line + ' ' + word : word;
        if(line && c.measureText(next).width > w){ out.push(line); line = word; } else line = next;
      });
      out.push(line);
    });
    return out;
  }
  // Largest size that fits the box; returns the height used.
  function fit(c, str, x, y, w, h, o){
    var size = o.max, lines;
    for(; size > o.min; size -= 2){
      c.font = o.weight + ' ' + size + 'px ' + o.family; lines = wrap(c, str, w);
      if(lines.length * size * o.lh <= h && lines.every(function(l){ return c.measureText(l).width <= w; })) break;
    }
    // A slightly smaller size is worth it when it saves a line with one leftover word.
    for(var s2 = size, base = lines.length; s2 >= Math.max(o.min, size * .76); s2 -= 2){
      c.font = o.weight + ' ' + s2 + 'px ' + o.family;
      if(wrap(c, str, w).length < base){ size = s2; break; }
    }
    c.font = o.weight + ' ' + size + 'px ' + o.family; lines = wrap(c, str, w);
    c.fillStyle = o.color; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    lines.forEach(function(l, i){ c.fillText(l, x, y + size * .82 + i * size * o.lh); });
    return lines.length * size * o.lh;
  }
  function round(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function wordmark(c, x, y, s, t){
    c.globalAlpha = .28; c.fillStyle = t.lit; c.beginPath(); c.arc(x + s*.36, y, s*.5, 0, 7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = t.bg==='#F2A35E' ? '#132A46' : '#E2711D'; c.beginPath(); c.arc(x + s*.36, y, s*.28, 0, 7); c.fill();
    c.fillStyle = t.ink; c.font = '600 ' + s + 'px ' + DISPLAY; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('Global Neighbors', x + s*1.15, y + s*.04);
    c.textBaseline = 'alphabetic';
  }
  // A street where two lit doors are joined: one neighbor asks, another says yes.
  function street(c, x, baseY, w, unit, t, arc, limit){
    var plan = [[.9,1.15,'g'],[1.15,1.6,'f'],[.8,.95,'g'],[1.3,1.35,'g'],[.75,1.75,'f'],[1.05,1.1,'g'],[1.2,1.5,'f'],[.85,1.0,'g'],[1.1,1.65,'f'],[1.25,1.2,'g'],[.8,1.4,'f'],[1.1,1.05,'g']];
    var gap = unit * .16, total = 0, n = 0;
    while(total < w && n < 40){ total += plan[n % plan.length][0] * unit + gap; n++; }
    var ask = Math.max(1, Math.floor(n * .2)), yes = Math.min(n - 2, Math.floor(n * .68)), cx = x, doors = {};
    for(var i = 0; i < n; i++){
      var p = plan[i % plan.length], hw = p[0] * unit, hh = p[1] * unit, top = baseY - hh, lit = i===ask || i===yes;
      c.fillStyle = i % 2 ? t.a : t.b; c.fillRect(cx, top, hw, hh);
      c.fillStyle = t.roof; c.beginPath();
      if(p[2]==='g'){ c.moveTo(cx - unit*.07, top); c.lineTo(cx + hw/2, top - unit*.42); c.lineTo(cx + hw + unit*.07, top); } else { c.rect(cx - unit*.04, top - unit*.09, hw + unit*.08, unit*.11); }
      c.fill();
      var dw = unit*.26, dh = unit*.46, dx = cx + hw/2 - dw/2;
      c.fillStyle = lit ? t.lit : t.roof; round(c, dx, baseY - dh, dw, dh + 2, dw*.48); c.fill();
      var rows = Math.floor((hh - unit*.62) / (unit*.36)), s = unit*.17;
      for(var r = 0; r < rows; r++) [.22,.78].forEach(function(f){
        c.fillStyle = lit && r===0 ? t.lit : t.roof; c.fillRect(cx + hw*f - s/2, top + unit*.16 + r*unit*.36, s, s);
      });
      if(lit) doors[i===ask ? 'ask' : 'yes'] = [cx + hw/2, p[2]==='g' ? top - unit*.42 : top - unit*.09];
      cx += hw + gap;
    }
    c.fillStyle = t.ground; c.fillRect(x - 4, baseY, w + 8, unit * .5);
    if(arc && doors.ask && doors.yes){
      var A = doors.ask, B = doors.yes, sy = Math.min(A[1], B[1]) - unit*.2, peak = sy - unit * 1.05;
      if(limit) peak = Math.max(peak, (limit - .25 * sy) / .75);   // the curve's highest point stays below the text
      if(sy - peak < unit * .2) return;
      c.strokeStyle = t.arc; c.lineWidth = Math.max(4, unit*.055); c.setLineDash([unit*.03, unit*.15]); c.lineCap = 'round';
      c.beginPath(); c.moveTo(A[0], A[1] - unit*.16); c.bezierCurveTo(A[0] + (B[0]-A[0])*.2, peak, A[0] + (B[0]-A[0])*.8, peak, B[0], B[1] - unit*.16); c.stroke(); c.setLineDash([]);
      [A, B].forEach(function(d){ c.fillStyle = t.arc; c.beginPath(); c.arc(d[0], d[1] - unit*.16, unit*.1, 0, 7); c.fill(); });
    }
  }
  function pill(c, label, x, y, size, t){
    c.font = '700 ' + size + 'px ' + SANS; var w = c.measureText(label).width + size * 1.9, h = size * 2.15;
    c.fillStyle = t.pill; round(c, x, y, w, h, h/2); c.fill();
    c.fillStyle = t.pillText; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(label, x + size*.95, y + h/2 + size*.04); c.textBaseline = 'alphabetic';
    return h;
  }
  function qrCard(c, link, x, y, size){
    var m = qr(link), n = m.length, pad = 4, cell = Math.floor(size / (n + pad*2)), w = cell * (n + pad*2);
    c.fillStyle = '#FFFFFF'; round(c, x, y, size, size, size*.06); c.fill();
    var ox = Math.round(x + (size - w)/2 + cell*pad), oy = Math.round(y + (size - w)/2 + cell*pad);
    c.fillStyle = '#0B1826';
    for(var r = 0; r < n; r++) for(var k = 0; k < n; k++) if(m[r][k]) c.fillRect(ox + k*cell, oy + r*cell, cell, cell);
  }
  function shortUrl(link){ return link.replace(/^https?:\/\//, '').replace(/\?.*$/, ''); }
  function drawAsset(canvas, s, link){
    var sz = SIZES[s.channel]; if(!sz) return;
    var W = canvas.width = sz[0], H = canvas.height = sz[1], c = canvas.getContext('2d'), t = THEMES[s.audience];
    var m = Math.round(W * (s.channel==='slide' || s.channel==='email' ? .06 : .085)), head = (s.headline || 'Your headline').replace(/([?.!]) (?=[A-Z])/g, '$1\n'), H1 = { weight:'600', family:DISPLAY, color:t.ink, lh:1.06 }, P = { weight:'400', family:SANS, color:t.soft, lh:1.38 };
    function h1(x, y, w, h, max, min){ H1.max = max; H1.min = min; return fit(c, head, x, y, w, h, H1); }
    function p(x, y, w, h, max, min){ if(!s.body) return 0; P.max = max; P.min = min; return fit(c, s.body, x, y, w, h, P); }
    c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
    var y, used, u;
    function eyebrow(x, yy, size){ if(!s.place) return 0; c.fillStyle = t.ink; c.font = '700 ' + size + 'px ' + SANS; c.fillText(s.place, x, yy + size*.82); return size * 1.75; }
    if(s.channel==='flyer'){
      u = 185;
      wordmark(c, m, m + 20, 62, t); y = m + 150;
      y += eyebrow(m, y, 46);
      y += h1(m, y, W - 2*m, 560, 190, 90) + 34;
      y += p(m, y, W - 2*m, 250, 58, 40) + 46;
      qrCard(c, link, m, y, 430);
      var bx = m + 490, by = y + 22;
      by += pill(c, s.cta || 'Join free', bx, by, 48, t) + 40;
      c.fillStyle = t.ink; c.font = '700 44px ' + SANS; c.fillText('Scan with your phone’s camera,', bx, by + 36); c.fillText('or visit', bx, by + 94);
      c.font = '700 40px ' + SANS; c.fillText(shortUrl(link), bx, by + 150);
      c.fillStyle = t.soft; c.font = '400 31px ' + SANS; c.fillText('Free to join. 18 and older. In an emergency, call 911.', bx, by + 214);
      street(c, 0, H - 95, W, u, t, true, y + 430 + 34);
    } else if(s.channel==='slide'){
      u = 104; street(c, 0, H - 48, W, u, t, false);
      var qs = 400, tw = W - 3*m - qs;
      wordmark(c, m, m + 4, 48, t); y = m + 95; y += eyebrow(m, y, 36);
      y += h1(m, y, tw, 330, 118, 64) + 24; y += p(m, y, tw, 130, 38, 28) + 30;
      pill(c, s.cta || 'Join free', m, y, 34, t);
      qrCard(c, link, W - m - qs, m + 60, qs);
      c.fillStyle = t.ink; c.font = '700 26px ' + SANS; c.textAlign = 'center'; c.fillText(shortUrl(link), W - m - qs/2, m + 60 + qs + 50); c.textAlign = 'left';
    } else if(s.channel==='email'){
      u = 82;
      wordmark(c, m, m + 4, 36, t); y = m + 62; y += eyebrow(m, y, 24); y += h1(m, y, W - 2*m, 190, 78, 40); street(c, 0, H - 34, W, u, t, true, y + 20);
    } else {
      var story = s.channel==='story', top = story ? 250 : m;   // stories keep clear of the app's own buttons
      u = story ? 150 : 112;
      if(story){ c.fillStyle = t.ground; c.fillRect(0, H - 262, W, 262); }
      wordmark(c, m, top + 10, story ? 54 : 44, t); y = top + (story ? 110 : 80); y += eyebrow(m, y, story ? 42 : 34);
      y += h1(m, y, W - 2*m, story ? 500 : 290, story ? 136 : 104, 54) + (story ? 34 : 20);
      y += p(m, y, W - 2*m, story ? 230 : 130, story ? 46 : 36, 26) + (story ? 44 : 24);
      var ph = pill(c, s.cta || 'Join free', m, y, story ? 42 : 32, t);
      street(c, 0, H - (story ? 260 : 52), W, u, t, true, y + ph + 22);
      if(!story){ c.font = '700 32px ' + SANS; var pw = c.measureText(s.cta || 'Join free').width + 32*1.9; c.fillStyle = t.ink; c.font = '700 27px ' + SANS; c.fillText(shortUrl(link), m + pw + 28, y + 44); }
      else { c.fillStyle = '#FFFFFF'; c.font = '700 36px ' + SANS; c.fillText(shortUrl(link), m, H - 160); }
    }
  }
  // Results card: only numbers the dashboard reported.
  function drawResults(canvas, r){
    var W = canvas.width = 1920, H = canvas.height = 1080, c = canvas.getContext('2d'), t = THEMES.need, m = 115;
    c.fillStyle = t.bg; c.fillRect(0, 0, W, H); street(c, 0, H - 55, W, 120, t, false);
    wordmark(c, m, m + 4, 48, t);
    c.fillStyle = t.soft; c.font = '400 34px ' + SANS; c.textAlign = 'right'; c.fillText(r.when, W - m, m + 16); c.textAlign = 'left';
    fit(c, r.title, m, m + 85, W - 2*m, 110, { weight:'600', family:DISPLAY, color:t.ink, lh:1.06, max:92, min:54 });
    var cw = (W - 2*m - 3*36) / 4;
    r.tiles.forEach(function(x, i){
      var tx = m + i * (cw + 36), ty = 350;
      c.fillStyle = 'rgba(255,255,255,.09)'; round(c, tx, ty, cw, 320, 26); c.fill();
      c.fillStyle = t.ink; c.font = '600 130px ' + DISPLAY; c.fillText(String(x.value), tx + 36, ty + 145);
      c.fillStyle = t.ink; c.font = '700 34px ' + SANS; wrap(c, x.label, cw - 60).forEach(function(l, k){ c.fillText(l, tx + 36, ty + 208 + k*42); });
      c.fillStyle = t.soft; c.font = '400 27px ' + SANS; c.fillText(x.sub || '', tx + 36, ty + 292);
    });
    c.fillStyle = t.soft; c.font = '400 28px ' + SANS; c.fillText('Counts members only. The team’s own accounts and activity are left out.', m, 735);
  }

  window.GNAssets = { qr:qr, BENEFITS:BENEFITS, AUDIENCES:AUDIENCES, CHANNELS:CHANNELS, SIZES:SIZES, copyFor:copyFor, benefitsFor:benefitsFor, makeTag:makeTag, captions:captions,
    draw:function(canvas, s, link){ return fontsReady().then(function(){ drawAsset(canvas, s, link); }); },
    drawStreet:function(canvas, w, h){ canvas.width = w * 2; canvas.height = h * 2; var c = canvas.getContext('2d'); street(c, 0, h * 2 - 24, w * 2, h * .62, THEMES.need, true); },
    drawResults:function(canvas, r){ return fontsReady().then(function(){ drawResults(canvas, r); }); } };
})();
