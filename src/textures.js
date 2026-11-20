import * as THREE from 'three';

/* ------------------------- Texture dei pavimenti ------------------------- */
function rng(seed){ let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function toTex(cv){
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function drawPlank(g, x, y, w, h, color, r, grain){
  g.fillStyle = color; g.fillRect(x, y, w, h);
  for (let i=0; i<grain; i++){
    const yy = y + r()*h, dark = r() < .6;
    g.strokeStyle = dark ? 'rgba(40,12,6,' + (.05+r()*.12) + ')' : 'rgba(255,200,170,' + (.03+r()*.06) + ')';
    g.lineWidth = .6 + r()*1.4;
    g.beginPath(); g.moveTo(x, yy);
    g.bezierCurveTo(x+w*.3, yy+(r()-.5)*4, x+w*.7, yy+(r()-.5)*4, x+w, yy+(r()-.5)*2);
    g.stroke();
  }
  g.fillStyle = 'rgba(25,10,6,.55)'; g.fillRect(x, y, 1.6, h); g.fillRect(x, y, w, 1.4);
}
function makeCherry(){
  const W = 512, cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d'), r = rng(11);
  const rows = 8, rh = W/rows, pl = 256;
  for (let i=0; i<rows; i++){
    const off = Math.floor(r()*4) * 64;
    for (let k=0; k<2; k++){
      const col = 'hsl(' + (8 + r()*7) + ',' + (52 + r()*14) + '%,' + (29 + r()*9) + '%)';
      for (const dx of [0, -W]) drawPlank(g, off + k*pl + dx, i*rh, pl, rh, col, r, 16);
    }
  }
  return cv;
}
function makeGres(){
  const CW = 600, CH = 500, cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
  const g = cv.getContext('2d'), r = rng(23);
  const rows = 5, rh = CH/rows;
  for (let i=0; i<rows; i++){
    const off = Math.floor(r()*CW);
    const col = 'hsl(' + (26 + r()*10) + ',' + (7 + r()*7) + '%,' + (36 + r()*10) + '%)';
    for (const dx of [0, -CW]){
      g.fillStyle = col; g.fillRect(off+dx, i*rh, CW, rh);
      for (let n=0; n<26; n++){
        const yy = i*rh + r()*rh;
        g.strokeStyle = r() < .6 ? 'rgba(30,24,20,' + (.05+r()*.1) + ')' : 'rgba(230,220,210,' + (.04+r()*.07) + ')';
        g.lineWidth = .6 + r()*1.8;
        g.beginPath(); g.moveTo(off+dx, yy);
        g.bezierCurveTo(off+dx+CW*.3, yy+(r()-.5)*6, off+dx+CW*.65, yy+(r()-.5)*6, off+dx+CW, yy+(r()-.5)*3);
        g.stroke();
      }
      for (let n=0; n<120; n++){
        g.fillStyle = 'rgba(' + (r()<.5?'20,16,12':'235,225,215') + ',' + (.02+r()*.04) + ')';
        g.fillRect(off+dx + r()*CW, i*rh + r()*rh, 6+r()*40, 2+r()*8);
      }
      g.fillStyle = 'rgba(28,24,22,.7)'; g.fillRect(off+dx, i*rh, 2.2, rh); g.fillRect(off+dx, i*rh, CW, 2.2);
    }
  }
  return cv;
}
function makeLiftX(){
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
  const cx = cv.getContext('2d'); cx.fillStyle = '#3a424b'; cx.fillRect(0,0,256,192);
  cx.strokeStyle = 'rgba(235,240,245,.85)'; cx.lineWidth = 6;
  cx.beginPath(); cx.moveTo(10,10); cx.lineTo(246,182); cx.moveTo(246,10); cx.lineTo(10,182); cx.stroke();
  return cv;
}
const cherryBase = toTex(makeCherry()), gresBase = toTex(makeGres()), liftBase = toTex(makeLiftX());

/* ---- Texture per muri e pavimenti (generate al volo, solo quando servono) ---- */
function wrapDraw(g, N, fn){ for (const dx of [-N,0,N]) for (const dy of [-N,0,N]) fn(dx,dy); }
function makeStucco(){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(5);
  g.fillStyle = '#f3f0ea'; g.fillRect(0,0,N,N);
  for (let i=0; i<70; i++){
    const x = r()*N, y = r()*N, rad = 30 + r()*100, a = .03 + r()*.05;
    wrapDraw(g, N, (dx,dy) => {
      const gr = g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rad);
      gr.addColorStop(0,'rgba(110,100,88,' + a + ')'); gr.addColorStop(1,'rgba(110,100,88,0)');
      g.fillStyle = gr; g.fillRect(x+dx-rad, y+dy-rad, rad*2, rad*2);
    });
  }
  for (let i=0; i<5000; i++){
    g.fillStyle = r() < .55 ? 'rgba(70,60,50,' + (.03 + r()*.07) + ')' : 'rgba(255,255,255,' + (.25 + r()*.3) + ')';
    g.fillRect(r()*N, r()*N, 1 + r()*2.2, 1 + r()*2.2);
  }
  return cv;
}
function makeSlats(){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(31);
  g.fillStyle = '#251a12'; g.fillRect(0,0,N,N);
  const sw = 32;
  for (let i=0; i<N/sw; i++){
    const x = i*sw + 1.5, w = sw - 3;
    g.fillStyle = 'hsl(' + (27 + r()*8) + ',' + (38 + r()*12) + '%,' + (44 + r()*14) + '%)'; g.fillRect(x, 0, w, N);
    for (let k=0; k<14; k++){
      const xx = x + r()*w;
      g.strokeStyle = r() < .6 ? 'rgba(50,28,12,' + (.06 + r()*.12) + ')' : 'rgba(255,225,185,' + (.05 + r()*.08) + ')';
      g.lineWidth = .6 + r()*1.2;
      g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + (r()-.5)*4, N*.3, xx + (r()-.5)*4, N*.7, xx + (r()-.5)*2, N); g.stroke();
    }
  }
  return cv;
}
function makeStoneTiles(){
  const N = 512, T = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(47);
  for (let a=0; a<2; a++) for (let b=0; b<2; b++){
    g.fillStyle = 'hsl(' + (32 + r()*8) + ',' + (7 + r()*6) + '%,' + (60 + r()*12) + '%)'; g.fillRect(a*T, b*T, T, T);
    for (let n=0; n<500; n++){
      g.fillStyle = r() < .5 ? 'rgba(60,55,48,' + (.04 + r()*.08) + ')' : 'rgba(255,252,245,' + (.05 + r()*.1) + ')';
      g.fillRect(a*T + r()*T, b*T + r()*T, 1 + r()*3, 1 + r()*3);
    }
    for (let n=0; n<3; n++){
      g.strokeStyle = 'rgba(70,64,56,' + (.05 + r()*.08) + ')'; g.lineWidth = 1 + r()*2;
      g.beginPath(); g.moveTo(a*T + r()*T, b*T + r()*T); g.bezierCurveTo(a*T + r()*T, b*T + r()*T, a*T + r()*T, b*T + r()*T, a*T + r()*T, b*T + r()*T); g.stroke();
    }
  }
  g.fillStyle = '#8d877e';
  for (let k=0; k<2; k++){ g.fillRect(k*T - 2, 0, 4, N); g.fillRect(0, k*T - 2, N, 4); }
  g.fillRect(N-2, 0, 2, N); g.fillRect(0, N-2, N, 2);
  return cv;
}
function makeMarble(){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(73);
  g.fillStyle = '#f2f2ef'; g.fillRect(0,0,N,N);
  for (let i=0; i<30; i++){
    const x = r()*N, y = r()*N, rad = 40 + r()*110;
    wrapDraw(g, N, (dx,dy) => {
      const gr = g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,rad);
      gr.addColorStop(0,'rgba(150,155,165,' + (.05 + r()*.06) + ')'); gr.addColorStop(1,'rgba(150,155,165,0)');
      g.fillStyle = gr; g.fillRect(x+dx-rad, y+dy-rad, rad*2, rad*2);
    });
  }
  const vein = (w, alpha, steps) => {
    let x = r()*N, y = r()*N, ang = r()*Math.PI*2;
    const pts = [[x,y]];
    for (let k=0; k<steps; k++){ ang += (r()-.5)*1.1; x += Math.cos(ang)*N/steps*1.6; y += Math.sin(ang)*N/steps*1.6; pts.push([x,y]); }
    wrapDraw(g, N, (dx,dy) => {
      g.strokeStyle = 'rgba(72,80,94,' + alpha + ')'; g.lineWidth = w; g.lineJoin = 'round';
      g.beginPath(); pts.forEach((p,i) => { if (i === 0) g.moveTo(p[0]+dx, p[1]+dy); else g.lineTo(p[0]+dx, p[1]+dy); }); g.stroke();
    });
  };
  for (let i=0; i<6; i++) vein(1.2 + r()*2.4, .28 + r()*.3, 16);
  for (let i=0; i<12; i++) vein(.5 + r()*.8, .15 + r()*.2, 12);
  return cv;
}
function makeBricks(){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(89);
  g.fillStyle = '#cdc7ba'; g.fillRect(0,0,N,N);
  const rh = 32, bw = 128;
  for (let row=0; row<N/rh; row++){
    const off = (row % 2) * (bw/2);
    for (let k=-1; k<N/bw + 1; k++){
      const x = k*bw + off, y = row*rh;
      g.fillStyle = 'hsl(' + (10 + r()*9) + ',' + (42 + r()*14) + '%,' + (36 + r()*11) + '%)';
      g.fillRect(x + 2, y + 2, bw - 4, rh - 4);
      for (let n=0; n<30; n++){
        g.fillStyle = r() < .5 ? 'rgba(40,15,8,' + (.06 + r()*.1) + ')' : 'rgba(255,200,170,' + (.04 + r()*.08) + ')';
        g.fillRect(x + 2 + r()*(bw-6), y + 2 + r()*(rh-6), 1 + r()*3, 1 + r()*2);
      }
    }
  }
  return cv;
}
function makeMosaicTiles(){
  const N = 512, T = 64, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(191);
  g.fillStyle = '#a69e91'; g.fillRect(0,0,N,N);
  for (let a=0; a<N/T; a++) for (let b=0; b<N/T; b++){
    g.fillStyle = 'hsl(' + (32 + r()*8) + ',' + (10 + r()*10) + '%,' + (68 + r()*10) + '%)';
    g.fillRect(a*T + 2, b*T + 2, T - 4, T - 4);
    for (let k=0; k<14; k++){
      g.fillStyle = r() < .5 ? 'rgba(70,60,50,' + (.05 + r()*.08) + ')' : 'rgba(255,250,240,' + (.06 + r()*.1) + ')';
      g.fillRect(a*T + 3 + r()*(T-8), b*T + 3 + r()*(T-8), 1 + r()*4, 1 + r()*3);
    }
  }
  return cv;
}
function makeTerracotta(){
  const N = 512, T = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(171);
  g.fillStyle = '#6a5546'; g.fillRect(0,0,N,N);
  for (let a=0; a<N/T; a++) for (let b=0; b<N/T; b++){
    const x = a*T, y = b*T;
    g.fillStyle = 'hsl(' + (24 + r()*8) + ',' + (30 + r()*10) + '%,' + (64 + r()*8) + '%)';
    g.fillRect(x + 2, y + 2, T - 4, T - 4);
    for (let k=0; k<70; k++){
      g.fillStyle = r() < .5 ? 'rgba(110,80,60,' + (.04 + r()*.07) + ')' : 'rgba(255,240,220,' + (.05 + r()*.09) + ')';
      g.fillRect(x + 3 + r()*(T-8), y + 3 + r()*(T-8), 1 + r()*4, 1 + r()*3);
    }
    g.fillStyle = 'rgba(255,220,190,.14)'; g.fillRect(x + 2, y + 2, T - 4, 2);
  }
  return cv;
}
/* Parquet a spina di pesce (listelli sfalsati a 90°): periodo di 8x8 celle, listelli di 4x1 celle */
function makeHerringbone(){
  const N = 512, C = N / 8, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(211);
  g.fillStyle = '#1d0a05'; g.fillRect(0,0,N,N);
  const strip = (cx, cy, w, h) => {
    const col = 'hsl(' + (13 + r()*6) + ',' + (60 + r()*12) + '%,' + (23 + r()*6) + '%)';
    for (const dx of [-8, 0, 8]) for (const dy of [-8, 0, 8]){
      const x = (cx + dx) * C, y = (cy + dy) * C;
      if (x > N || y > N || x + w*C < 0 || y + h*C < 0) continue;
      g.fillStyle = col; g.fillRect(x + 1, y + 1, w*C - 2, h*C - 2);
      const long = w > h;
      for (let k=0; k<10; k++){
        g.strokeStyle = r() < .6 ? 'rgba(35,8,3,' + (.05 + r()*.08) + ')' : 'rgba(255,190,140,' + (.03 + r()*.05) + ')';
        g.lineWidth = .7 + r()*1.3; g.beginPath();
        if (long){ const yy = y + 3 + r()*(h*C - 6); g.moveTo(x + 2, yy); g.lineTo(x + w*C - 2, yy + (r()-.5)*3); }
        else { const xx = x + 3 + r()*(w*C - 6); g.moveTo(xx, y + 2); g.lineTo(xx + (r()-.5)*3, y + h*C - 2); }
        g.stroke();
      }
      g.fillStyle = 'rgba(255,170,120,.10)';
      if (long) g.fillRect(x + 1, y + 1, w*C - 2, 2); else g.fillRect(x + 1, y + 1, 2, h*C - 2);
    }
  };
  for (let n=0; n<8; n++){ strip(n, n, 4, 1); strip(n + 4, n - 3, 1, 4); }
  return cv;
}
function makeStackedStone(){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(131);
  g.fillStyle = '#6f675d'; g.fillRect(0,0,N,N);
  let y = 0;
  while (y < N){
    let h = 26 + Math.floor(r()*18); if (N - y < h + 20) h = N - y;
    let x = 0;
    while (x < N){
      let w = 70 + Math.floor(r()*120); if (N - x < w + 40) w = N - x;
      g.fillStyle = 'hsl(' + (24 + r()*22) + ',' + (8 + r()*18) + '%,' + (46 + r()*24) + '%)';
      g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
      for (let k=0; k<26; k++){
        g.fillStyle = r() < .5 ? 'rgba(40,32,24,' + (.05 + r()*.09) + ')' : 'rgba(255,250,240,' + (.05 + r()*.1) + ')';
        g.fillRect(x + 2 + r()*(w-6), y + 2 + r()*(h-6), 1 + r()*5, 1 + r()*2);
      }
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 1.5, y + 1.5, w - 3, 2);
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x + 1.5, y + h - 3.5, w - 3, 2);
      x += w;
    }
    y += h;
  }
  return cv;
}
function makeMosaicParquet(){
  const N = 512, B = 128, SW = 32, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = rng(151);
  g.fillStyle = '#2a120a'; g.fillRect(0,0,N,N);
  for (let bx=0; bx<N/B; bx++) for (let by=0; by<N/B; by++){
    const vertical = (bx + by) % 2 === 0;
    for (let k=0; k<4; k++){
      const col = 'hsl(' + (8 + r()*7) + ',' + (52 + r()*14) + '%,' + (28 + r()*10) + '%)';
      const x = bx*B + (vertical ? k*SW : 0), y = by*B + (vertical ? 0 : k*SW);
      drawPlank(g, x + .5, y + .5, (vertical ? SW : B) - 1, (vertical ? B : SW) - 1, col, r, 8);
    }
  }
  return cv;
}
const TEXDEF = {
  stucco:  { name:'Stucco',               tile:1.0, rough:.95, mk:makeStucco },
  listelli:{ name:'Listelli di legno',    tile:0.8, rough:.6,  mk:makeSlats },
  pietra:  { name:'Piastrelle di pietra', tile:0.8, rough:.8,  mk:makeStoneTiles },
  marmo:   { name:'Marmo',                tile:1.6, rough:.22, mk:makeMarble },
  mattoni: { name:'Mattoni',              tile:1.0, rough:.9,  mk:makeBricks },
  spacco:  { name:'Pietra a spacco',      tile:0.8, rough:.85, mk:makeStackedStone },
  mosaico: { name:'Mosaico',              tile:0.8, rough:.8,  mk:makeMosaicTiles }
};
const texCv = {}, texBaseCache = {};
function texCanvas(k){ return texCv[k] || (texCv[k] = TEXDEF[k].mk()); }
function baseTex(k){ return texBaseCache[k] || (texBaseCache[k] = toTex(texCanvas(k))); }

export { TEXDEF, baseTex, cherryBase, gresBase, liftBase, makeHerringbone, makeMosaicParquet, makeTerracotta, texCanvas, toTex };
