// ===================== CONFIG =====================
const GRID = 24;
let gridCm = 20;
let selectedFreq = '2.4';
function activeDbm(p){ return selectedFreq==='5' ? (p.dbm5??p.dbm) : p.dbm; }

let wallTypeDefs = {
  drywall:   {color:'#7090b0', w:3, db:3,  label:'Drywall'},
  alvenaria: {color:'#5080a0', w:5, db:10, label:'Alvenaria'},
  concreto:  {color:'#2a4a6a', w:8, db:20, label:'Concreto'},
  vidro:     {color:'#80d8f0', w:2, db:2,  label:'Vidro'},
  custom:    {color:'#c084fc', w:4, db:5,  label:'Personalizada'},
};

// ===================== FLOORS =====================
let floors = [{name:'Térreo', walls:[], devices:[], openings:[], mpoints:[], bgImg:null}];
let currentFloor = 0;

function fl() { return floors[currentFloor]; }

function renderFloorTabs(){
  const cont = document.getElementById('floor-tabs');
  cont.innerHTML = '';
  floors.forEach((f,i)=>{
    const tab = document.createElement('div');
    tab.className = 'floor-tab' + (i===currentFloor?' active':'');
    tab.innerHTML = `<span>${f.name}</span>`;
    tab.onclick = ()=>switchFloor(i);
    cont.appendChild(tab);
  });
}

function switchFloor(i){
  currentFloor = i;
  hmapCache = null;
  renderFloorTabs();
  selectEl(null,-1);
  calcHeatmap();
  redrawAll();
  updateMpointsList();
}

// ===================== CANVAS =====================
const wrap   = document.getElementById('canvas-wrap');
const bgC    = document.getElementById('bg-canvas');
const bgImgC = document.getElementById('bg-img-canvas');
const hmC    = document.getElementById('heatmap-canvas');
const wallC  = document.getElementById('wall-canvas');
const devC   = document.getElementById('device-canvas');
const mpC    = document.getElementById('mpoint-canvas');
const lblC   = document.getElementById('label-canvas');
const intC   = document.getElementById('interact-canvas');
const ctxBg    = bgC.getContext('2d');
const ctxBgImg = bgImgC.getContext('2d');
const ctxHm    = hmC.getContext('2d');
const ctxWall  = wallC.getContext('2d');
const ctxDev   = devC.getContext('2d');
const ctxMp    = mpC.getContext('2d');
const ctxLbl   = lblC.getContext('2d');
const ctxInt   = intC.getContext('2d');

let W=0, H=0;

function resize(){
  W=wrap.clientWidth; H=wrap.clientHeight;
  [bgC,bgImgC,hmC,wallC,devC,mpC,lblC,intC].forEach(c=>{c.width=W;c.height=H});
  redrawAll();
}

let panX=0, panY=0, zoom=1;
function toWorld(sx,sy){return[(sx-panX)/zoom,(sy-panY)/zoom]}
function toScreen(wx,wy){return[wx*zoom+panX,wy*zoom+panY]}
function worldToCm(w){ return (w/GRID)*gridCm; }
function worldToM(w){ return worldToCm(w)/100; }

function redrawAll(){
  drawBg();drawBgImg();drawWalls();drawDevices();drawMpoints();drawRoomLabels();drawHeatmapLayer();
  drawDistPreview();
}

// ===================== BG =====================
function drawBg(){
  const c=ctxBg; c.clearRect(0,0,W,H);
  c.fillStyle='#0a0d14'; c.fillRect(0,0,W,H);
  const gs=GRID*zoom;
  const ox=((panX%gs)+gs)%gs, oy=((panY%gs)+gs)%gs;
  c.strokeStyle='#141824'; c.lineWidth=0.8;
  for(let x=ox-gs;x<W+gs;x+=gs){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}
  for(let y=oy-gs;y<H+gs;y+=gs){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  const gs5=gs*5;
  const ox5=((panX%gs5)+gs5)%gs5, oy5=((panY%gs5)+gs5)%gs5;
  c.strokeStyle='#1e2840'; c.lineWidth=1;
  for(let x=ox5-gs5;x<W+gs5;x+=gs5){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}
  for(let y=oy5-gs5;y<H+gs5;y+=gs5){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  if(zoom>0.4){
    c.fillStyle='#2a3a50'; c.font=`${Math.min(9*zoom,10)}px var(--font)`;
    c.textAlign='center'; c.textBaseline='top';
    for(let x=ox5-gs5;x<W+gs5;x+=gs5){
      const wx=(x-panX)/zoom;
      c.fillText(worldToM(wx).toFixed(1)+'m',x,2);
    }
    c.textAlign='right'; c.textBaseline='middle';
    for(let y=oy5-gs5;y<H+gs5;y+=gs5){
      const wy=(y-panY)/zoom;
      c.fillText(worldToM(wy).toFixed(1)+'m',W-3,y);
    }
  }
}

// ===================== BG IMAGE =====================
const bgImgCache = {};

function drawBgImg(){
  const c=ctxBgImg; c.clearRect(0,0,W,H);
  const f=fl();
  if(!f.bgImg) return;
  let img = bgImgCache[currentFloor];
  if(!img){
    img=new Image();
    img.onload=()=>{bgImgCache[currentFloor]=img; drawBgImg()};
    img.src=f.bgImg; return;
  }
  const scale = (f.bgScale||1);
  const rot   = (f.bgRot||0) * Math.PI/180;
  const alpha = (f.bgOpacity!=null ? f.bgOpacity : 35)/100;
  const[sx,sy]=toScreen(f.bgOffX||0, f.bgOffY||0);
  const sw = img.naturalWidth  * zoom * scale;
  const sh = img.naturalHeight * zoom * scale;
  c.save();
  c.globalAlpha = alpha;
  c.translate(sx + sw/2, sy + sh/2);
  c.rotate(rot);
  c.drawImage(img, -sw/2, -sh/2, sw, sh);
  c.restore();
}

// ===================== DRAW WALLS =====================
function drawWalls(){
  const c=ctxWall; c.clearRect(0,0,W,H);
  const f=fl();
  f.walls.forEach(w=>{
    const[sx1,sy1]=toScreen(w.x1,w.y1);
    const[sx2,sy2]=toScreen(w.x2,w.y2);
    const wt=wallTypeDefs[w.type]||wallTypeDefs.custom;
    c.strokeStyle=wt.color;
    c.lineWidth=wt.w*Math.max(zoom,0.4); c.lineCap='round';
    c.beginPath(); c.moveTo(sx1,sy1); c.lineTo(sx2,sy2); c.stroke();
  });
  f.openings.forEach(o=>{
    const[sx1,sy1]=toScreen(o.x1,o.y1);
    const[sx2,sy2]=toScreen(o.x2,o.y2);
    c.strokeStyle=o.type==='door'?'#a0c8f0':'#60d0ff';
    c.lineWidth=2*Math.max(zoom,0.4); c.lineCap='round';
    c.setLineDash(o.type==='door'?[6*zoom,4*zoom]:[3*zoom,3*zoom]);
    c.beginPath(); c.moveTo(sx1,sy1); c.lineTo(sx2,sy2); c.stroke(); c.setLineDash([]);
    const mx=(sx1+sx2)/2,my=(sy1+sy2)/2;
    c.font=`${11*Math.max(zoom,0.4)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif`;
    c.textAlign='center';c.textBaseline='middle';
    c.fillText(o.type==='door'?'🚪':'🪟',mx,my);
  });
}

// ===================== DRAW DEVICES =====================
const imgCache={};
function getImg(src,cb){
  if(!src){cb(null);return}
  if(imgCache[src]){cb(imgCache[src]);return}
  const i=new Image();i.onload=()=>{imgCache[src]=i;cb(i)};i.onerror=()=>cb(null);i.src=src;
}
const fallbackIcons={router:'📡',pc:'🖥',notebook:'💻',printer:'🖨',switch:'🔀'};
const DEV_COLORS={router:'#3b82f6',pc:'#22c55e',notebook:'#6366f1',printer:'#f59e0b',switch:'#06b6d4'};
function svgUri(s){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);}
const deviceSvgIcons={
  pc:svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="8" width="80" height="56" rx="7" fill="#1a2a1a" stroke="#22c55e" stroke-width="2.5"/><rect x="18" y="16" width="64" height="40" rx="3" fill="#0a1a0a"/><rect x="38" y="64" width="24" height="8" rx="2" fill="#22c55e"/><rect x="26" y="72" width="48" height="7" rx="3.5" fill="#22c55e"/></svg>`),
  notebook:svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="58" rx="7" fill="#1a1a2e" stroke="#6366f1" stroke-width="2.5"/><rect x="16" y="16" width="68" height="42" rx="3" fill="#0a0a1a"/><rect x="2" y="66" width="96" height="18" rx="7" fill="#6366f1"/><rect x="30" y="69" width="40" height="12" rx="4" fill="#1a1a2e"/></svg>`),
  printer:svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="22" y="14" width="56" height="22" rx="4" fill="#2a1a00" stroke="#f59e0b" stroke-width="2"/><rect x="10" y="34" width="80" height="40" rx="7" fill="#2a1a00" stroke="#f59e0b" stroke-width="2.5"/><rect x="22" y="62" width="56" height="24" rx="4" fill="#1a0f00" stroke="#f59e0b" stroke-width="1.5"/><rect x="30" y="70" width="40" height="5" rx="2.5" fill="#f59e0b"/><circle cx="74" cy="51" r="5" fill="#f59e0b"/></svg>`),
  switch:svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="4" y="28" width="92" height="44" rx="7" fill="#001a1a" stroke="#06b6d4" stroke-width="2.5"/><circle cx="18" cy="50" r="5" fill="#10b981"/><circle cx="32" cy="50" r="5" fill="#10b981"/><circle cx="46" cy="50" r="5" fill="#10b981"/><circle cx="60" cy="50" r="5" fill="#10b981"/><circle cx="74" cy="50" r="5" fill="#f59e0b"/><rect x="10" y="36" width="80" height="5" rx="2.5" fill="#003333"/><rect x="10" y="59" width="80" height="5" rx="2.5" fill="#003333"/></svg>`)
};
function devColor(d){return(d.type==='router'&&d.freq==='5')?'#8b5cf6':DEV_COLORS[d.type]||'#64748b';}
function fillRR(c,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.arcTo(x+w,y,x+w,y+r,r);
  c.lineTo(x+w,y+h-r); c.arcTo(x+w,y+h,x+w-r,y+h,r);
  c.lineTo(x+r,y+h); c.arcTo(x,y+h,x,y+h-r,r);
  c.lineTo(x,y+r); c.arcTo(x,y,x+r,y,r);
  c.closePath();
}

function drawDevices(){
  const c=ctxDev; c.clearRect(0,0,W,H);
  fl().devices.forEach(d=>{
    const[sx,sy]=toScreen(d.x,d.y);
    const zf=Math.max(zoom,0.35);
    const sz=24*zf, pad=6*zf, r=8*zf;
    const col=devColor(d);
    const cw=sz+pad*2, ch=sz+pad*2;
    const cx=sx-cw/2, cy=sy-ch/2;

    // anéis WiFi para roteadores
    if(d.type==='router'){
      c.save(); c.globalAlpha=0.1;
      for(let i=1;i<=3;i++){
        c.beginPath(); c.arc(sx,sy,cw/2+i*12*zf,0,Math.PI*2);
        c.strokeStyle=col; c.lineWidth=1.5; c.stroke();
      }
      c.restore();
    }

    // card de fundo
    fillRR(c,cx,cy,cw,ch,r);
    c.fillStyle='rgba(18,24,38,0.92)'; c.fill();
    c.strokeStyle=col; c.lineWidth=1.5; c.stroke();

    // ícone
    const drawEmoji=()=>{
      c.font=`${sz*0.88}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",serif`;
      c.textAlign='center'; c.textBaseline='middle';
      c.fillText(d.icon||fallbackIcons[d.type]||'❓',sx,sy);
    };
    const renderIcon=(thenLbl)=>{
      if(d.imgSrc){
        getImg(d.imgSrc,img=>{
          if(img){const is=sz*0.82;c.drawImage(img,sx-is/2,sy-is/2,is,is);}
          else drawEmoji();
          if(thenLbl)drawDeviceLbl(c,d,sx,sy,cw,ch,col);
        });
      } else {
        const svgSrc=!d.icon&&deviceSvgIcons[d.type];
        if(svgSrc){
          getImg(svgSrc,img=>{
            if(img){const is=sz*0.78;c.drawImage(img,sx-is/2,sy-is/2,is,is);}
            else drawEmoji();
            if(thenLbl)drawDeviceLbl(c,d,sx,sy,cw,ch,col);
          });
        } else {drawEmoji();if(thenLbl)drawDeviceLbl(c,d,sx,sy,cw,ch,col);}
      }
    };
    renderIcon(true);

    // badge de canal
    if(d.type==='router'&&d.channel&&d.channel!==0){
      const bw=30*zf, bh=14*zf;
      const bx=cx+cw-4, by=cy-4;
      fillRR(c,bx,by,bw,bh,bh/2);
      c.fillStyle=d.freq==='5'?'#8b5cf6':'#10b981'; c.fill();
      c.fillStyle='#fff'; c.font=`bold ${9*zf}px var(--font)`;
      c.textAlign='center'; c.textBaseline='middle'; c.fillText('ch'+d.channel,bx+bw/2,by+bh/2);
    }
  });
}
function drawDeviceLbl(c,d,sx,sy,cw,ch,col){
  const zf=Math.max(zoom,0.4);
  const lbl=d.name||d.typeLabel||d.type;
  c.font=`600 ${10*zf}px var(--font)`; c.textAlign='center';
  const tw=c.measureText(lbl).width;
  const ph=15*zf, pw=tw+14*zf;
  const px=sx-pw/2, py=sy+ch/2+3*zf;
  fillRR(c,px,py,pw,ph,ph/2);
  c.fillStyle='rgba(15,17,23,.92)'; c.fill();
  c.strokeStyle=col; c.lineWidth=0.8; c.stroke();
  c.fillStyle='#cbd5e1'; c.textBaseline='middle';
  c.fillText(lbl,sx,py+ph/2);
}

// ===================== DRAW MPOINTS =====================
function drawMpoints(){
  const c=ctxMp; c.clearRect(0,0,W,H);
  fl().mpoints.forEach((p,i)=>{
    const[sx,sy]=toScreen(p.x,p.y);
    const sel=i===selectedIdx&&selectedType==='mpoint';
    const dbm=activeDbm(p);
    const col=dbmToColor(dbm);
    c.save();
    c.shadowColor=col;c.shadowBlur=sel?14:6;
    c.beginPath();c.arc(sx,sy,sel?8:6,0,Math.PI*2);
    c.fillStyle=col;c.fill();
    c.strokeStyle='#fff';c.lineWidth=1.5;c.stroke();
    c.restore();
    c.fillStyle='#fff';c.font=`bold ${10*Math.max(zoom,0.5)}px var(--font)`;
    c.textAlign='center';c.textBaseline='bottom';
    c.fillText(dbm+'dBm',sx,sy-8);
    if(p.label){
      c.fillStyle='#94a3b8';c.font=`${9*Math.max(zoom,0.5)}px var(--font)`;
      c.fillText(p.label,sx,sy-18);
    }
  });
}

// ===================== ROOM LABELS =====================
let showRoomLabels = false;

function toggleRoomLabels(){
  showRoomLabels = !showRoomLabels;
  document.getElementById('btn-rooms').classList.toggle('active', showRoomLabels);
  drawRoomLabels();
}

function drawRoomLabels(){
  const c = ctxLbl;
  c.clearRect(0, 0, W, H);
  if(!showRoomLabels) return;

  const labels = fl().labels || [];
  if(!labels.length) return;

  const zf  = Math.max(zoom, 0.3);
  const fz  = Math.round(Math.max(10, 13 * zf));
  const pad = Math.max(5, 9 * zf);

  labels.forEach(lbl => {
    const [sx, sy] = toScreen(lbl.x, lbl.y);
    if(sx < -200 || sx > W + 200 || sy < -60 || sy > H + 60) return;

    c.font = `700 ${fz}px var(--font)`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    const tw = c.measureText(lbl.text).width;
    const ph = fz + pad * 1.8;
    const pw = tw + pad * 2.6;
    const rx = sx - pw / 2, ry = sy - ph / 2;
    const r  = ph / 2;

    // Fundo com brilho
    c.save();
    c.shadowColor = 'rgba(96,165,250,.5)';
    c.shadowBlur  = 14 * zf;
    fillRR(c, rx, ry, pw, ph, r);
    c.fillStyle = 'rgba(10,13,22,.88)';
    c.fill();
    c.restore();

    // Borda
    fillRR(c, rx, ry, pw, ph, r);
    c.strokeStyle = 'rgba(148,163,184,.4)';
    c.lineWidth = 1;
    c.stroke();

    // Texto
    c.fillStyle = '#f1f5f9';
    c.fillText(lbl.text, sx, sy);
  });
}

// ===================== TOOLS =====================
let tool='measure';
let selectedIdx=-1, selectedType=null;
let panning=false, panSX=0, panSY=0, panOX=0, panOY=0;

// ---- Ferramenta de medição de distância ----
let mdist = null;             // {x1,y1} em coords mundo quando P1 foi definido
let lastMouseW = {wx:0,wy:0}; // última posição do mouse em coords mundo

function drawDistPreview(){
  ctxInt.clearRect(0,0,W,H);
  if(tool!=='dist' || !mdist) return;

  const[sx1,sy1] = toScreen(mdist.x1, mdist.y1);
  const[sx2,sy2] = toScreen(lastMouseW.wx, lastMouseW.wy);
  const dx = lastMouseW.wx - mdist.x1, dy = lastMouseW.wy - mdist.y1;
  const distM = Math.sqrt(dx*dx+dy*dy) / GRID * (gridCm/100);

  ctxInt.save();
  // linha tracejada
  ctxInt.strokeStyle='#3b82f6'; ctxInt.lineWidth=1.5; ctxInt.lineCap='round';
  ctxInt.setLineDash([7,4]);
  ctxInt.beginPath(); ctxInt.moveTo(sx1,sy1); ctxInt.lineTo(sx2,sy2); ctxInt.stroke();
  ctxInt.setLineDash([]);
  // pontos terminais
  for(const[x,y] of [[sx1,sy1],[sx2,sy2]]){
    ctxInt.beginPath(); ctxInt.arc(x,y,4,0,Math.PI*2);
    ctxInt.fillStyle='#3b82f6'; ctxInt.fill();
    ctxInt.strokeStyle='#fff'; ctxInt.lineWidth=1; ctxInt.stroke();
  }
  // rótulo de distância no ponto médio
  const mx=(sx1+sx2)/2, my=(sy1+sy2)/2;
  const label = distM.toFixed(2)+' m';
  ctxInt.font='bold 12px var(--font)';
  const tw = ctxInt.measureText(label).width;
  ctxInt.fillStyle='rgba(15,17,23,.9)';
  ctxInt.fillRect(mx-tw/2-8, my-11, tw+16, 22);
  ctxInt.strokeStyle='#3b82f6'; ctxInt.lineWidth=1;
  ctxInt.strokeRect(mx-tw/2-8, my-11, tw+16, 22);
  ctxInt.fillStyle='#93c5fd';
  ctxInt.textAlign='center'; ctxInt.textBaseline='middle';
  ctxInt.fillText(label, mx, my);
  ctxInt.restore();
}

function measureStatusMsg(){
  const labels = { simulation: 'dBm simulado', real: 'dBm real (calibrado)' };
  return '📍 Medir: clique em qualquer ponto para ver o ' + (labels[heatmapMode] || 'dBm simulado');
}

function setFreq(f){
  selectedFreq=f;
  document.getElementById('freq-24-btn').classList.toggle('active',f==='2.4');
  document.getElementById('freq-5-btn').classList.toggle('active',f==='5');
  if(selectedType==='mpoint'&&selectedIdx>=0) selectEl('mpoint',selectedIdx);
  calcHeatmap();
  redrawAll();
  updateMpointsList();
}

function cancelDist(){
  mdist = null;
  ctxInt.clearRect(0,0,W,H);
}

function setTool(t){
  if(tool==='dist') cancelDist();
  tool=t;
  document.querySelectorAll('.tbtn[id^=btn-]').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('btn-'+t);if(el)el.classList.add('active');

  const cursors={measure:'cell', mpoint:'crosshair', dist:'crosshair'};
  intC.style.cursor=cursors[t]||'default';

  const msgs={
    measure: measureStatusMsg(),
    mpoint:'📌 Ponto Real: clique no local e informe o dBm medido in-loco',
    dist:'📏 Medir distância: clique no ponto inicial, depois no ponto final',
  };
  document.getElementById('status').textContent=msgs[t]||'';
}

// ===================== SELECTION =====================
function selectEl(type,idx){
  selectedType=type; selectedIdx=idx;
  drawMpoints();
}

function upMpointProp(prop,val){
  if(selectedType==='mpoint'&&selectedIdx>=0){
    const actualProp=(prop==='dbm')?(selectedFreq==='5'?'dbm5':'dbm'):prop;
    fl().mpoints[selectedIdx][actualProp]=val;
    drawMpoints();if(heatmapMode==='real')calcHeatmap();
    updateMpointsList();
  }
}

function deleteMpoint(){
  if(selectedType==='mpoint'&&selectedIdx>=0){
    fl().mpoints.splice(selectedIdx,1);
    selectEl(null,-1);drawMpoints();if(heatmapMode==='real')calcHeatmap();updateMpointsList();
  }
}

function updateMpointsList(){
  const f=fl();
  const el=document.getElementById('mpoints-list');
  if(!f.mpoints.length){el.textContent='Nenhum ponto adicionado.';return}
  el.innerHTML=f.mpoints.map((p,i)=>`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer" onclick="selectMpoint(${i})">
      <div style="width:10px;height:10px;border-radius:50%;background:${dbmToColor(activeDbm(p))};flex-shrink:0"></div>
      <span style="font-size:11px;color:var(--text)">${p.label||'Ponto '+(i+1)}</span>
      <span style="font-size:11px;color:var(--text3);margin-left:auto">${activeDbm(p)} dBm</span>
    </div>`).join('');
}
function selectMpoint(i){selectEl('mpoint',i);drawMpoints();}

// ===================== HIT TEST =====================
function hitMpoint(wx,wy){
  const f=fl();
  for(let i=f.mpoints.length-1;i>=0;i--){
    const p=f.mpoints[i];if((wx-p.x)**2+(wy-p.y)**2<=12**2/zoom)return i;
  }return -1;
}

function ptSegDist(px,py,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay;
  const lenSq=dx*dx+dy*dy;
  if(lenSq<1e-10) return Math.hypot(px-ax,py-ay);
  const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq));
  return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
}

// ===================== MOUSE EVENTS =====================
intC.addEventListener('contextmenu',e=>e.preventDefault());

intC.addEventListener('mousedown',e=>{
  e.preventDefault();
  const[sx,sy]=[e.offsetX,e.offsetY];
  const[wx,wy]=toWorld(sx,sy);
  if(e.button===2){panning=true;panSX=sx;panSY=sy;panOX=panX;panOY=panY;showWallTooltip(null,null,0,0);intC.style.cursor='grabbing';return}

  const f=fl();

  // ---- ferramenta de distância ----
  if(tool==='dist'){
    if(!mdist){
      mdist={x1:wx,y1:wy};
      document.getElementById('status').textContent='📏 Clique no ponto final para medir';
    } else {
      const dx=wx-mdist.x1, dy=wy-mdist.y1;
      const distM=Math.sqrt(dx*dx+dy*dy)/GRID*(gridCm/100);
      showDistPopup(sx,sy,distM,mdist.x1,mdist.y1,wx,wy);
      cancelDist();
    }
    return;
  }

  // ---- ferramenta de dBm / interferência pontual ----
  if(tool==='measure'){
    const routers=f.devices.filter(d=>d.type==='router'&&(!d.freq||d.freq==='dual'||d.freq===selectedFreq));

    let simSig=-999;
    routers.forEach(r=>{const s=computeSig(r,wx,wy,f.walls,f.openings);if(s>simSig)simSig=s});
    let calibrated=null;
    if(f.mpoints.length&&routers.length){
      const corrs=f.mpoints.map(p=>{let ms=-999;routers.forEach(r=>{const s=computeSig(r,p.x,p.y,f.walls,f.openings);if(s>ms)ms=s});return{x:p.x,y:p.y,delta:activeDbm(p)-ms}});
      let wsum=0,vsum=0;
      corrs.forEach(corr=>{const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;let pen=0;f.walls.forEach(w=>{if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))pen+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db});const eDist=dist*Math.pow(10,pen/20);const wt=1/Math.pow(eDist,2);wsum+=wt;vsum+=wt*corr.delta});
      calibrated=simSig+(wsum>0?vsum/wsum:0);
    }
    showMeasurePopup(sx,sy,simSig,calibrated,worldToM(wx),worldToM(wy));
    return;
  }

  if(tool==='mpoint'){openMpointModal(wx,wy);return;}

  const mi=hitMpoint(wx,wy);
  if(mi>=0){selectEl('mpoint',mi);return;}
  selectEl(null,-1);
});

intC.addEventListener('mousemove',e=>{
  const[sx,sy]=[e.offsetX,e.offsetY];
  const[wx,wy]=toWorld(sx,sy);
  lastMouseW={wx,wy};
  document.getElementById('hud').textContent=`📍 ${worldToM(wx).toFixed(2)} m, ${worldToM(wy).toFixed(2)} m`;
  if(panning){panX=panOX+(sx-panSX);panY=panOY+(sy-panSY);redrawAll();return;}
  if(tool==='dist') drawDistPreview();

  // Tooltip de parede/porta/janela: detecta o elemento mais próximo dentro de 8px de tela
  const hitR = 8 / zoom;
  let hovW = null, hovO = null;
  for(const w of fl().walls){
    if(ptSegDist(wx,wy,w.x1,w.y1,w.x2,w.y2) <= hitR){ hovW=w; break; }
  }
  if(!hovW){
    for(const o of fl().openings){
      if(ptSegDist(wx,wy,o.x1,o.y1,o.x2,o.y2) <= hitR){ hovO=o; break; }
    }
  }
  showWallTooltip(hovW, hovO, sx, sy);
});

intC.addEventListener('mouseleave', () => showWallTooltip(null, null, 0, 0));

intC.addEventListener('mouseup',()=>{
  if(panning){panning=false;intC.style.cursor=tool==='dist'||tool==='mpoint'?'crosshair':tool==='measure'?'cell':'default';}
});

intC.addEventListener('wheel',e=>{
  e.preventDefault();
  const f=e.deltaY<0?1.12:1/1.12;
  const[mx,my]=[e.offsetX,e.offsetY];
  panX=mx-(mx-panX)*f;panY=my-(my-panY)*f;
  zoom=Math.min(Math.max(zoom*f,0.1),10);
  redrawAll();document.getElementById('zoom-info').textContent=`Zoom: ${Math.round(zoom*100)}% | Grid: ${(gridCm/100).toFixed(2)} m`;
},{passive:false});

document.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(e.key==='Escape'){
    if(tool==='dist'&&mdist){ cancelDist(); document.getElementById('status').textContent='📏 Medir distância: clique no ponto inicial, depois no ponto final'; return; }
  }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedType==='mpoint'&&selectedIdx>=0){
    fl().mpoints.splice(selectedIdx,1);
    drawMpoints();updateMpointsList();if(heatmapMode==='real')calcHeatmap();
    selectEl(null,-1);
  }
});

// ===================== MEASURE POPUP (dBm) =====================
let measurePopup=null;
function showMeasurePopup(sx,sy,simDbm,calibDbm,mx,my){
  if(measurePopup)measurePopup.remove();
  const displayDbm=calibDbm!==null?calibDbm:simDbm;
  const col=dbmToColor(displayDbm);
  const quality=displayDbm>-55?'Excelente':displayDbm>-65?'Muito bom':displayDbm>-72?'Bom':displayDbm>-80?'Fraco':displayDbm>-90?'Muito fraco':'Sem sinal';
  const div=document.createElement('div');
  div.style.cssText=`position:absolute;left:${sx+14}px;top:${sy-12}px;background:rgba(15,17,23,.96);border:1px solid ${col};border-radius:8px;padding:9px 13px;font-size:12px;color:#e2e8f0;z-index:20;pointer-events:none;min-width:160px`;
  div.innerHTML=`
    <div style="color:${col};font-weight:700;font-size:15px;margin-bottom:4px">${displayDbm.toFixed(1)} dBm</div>
    <div style="color:#64748b;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${quality}</div>
    ${calibDbm!==null
      ?`<div style="color:#94a3b8;font-size:11px">📶 Simulado: ${simDbm.toFixed(1)} dBm</div>
        <div style="color:#10b981;font-size:11px">🎯 Calibrado: ${calibDbm.toFixed(1)} dBm</div>
        <div style="color:#64748b;font-size:10px">Δ ${(calibDbm-simDbm)>0?'+':''}${(calibDbm-simDbm).toFixed(1)} dB correção</div>`
      :`<div style="color:#94a3b8;font-size:11px">📶 Simulado (sem pontos reais)</div>`
    }
    <div style="color:#475569;font-size:10px;margin-top:4px">📍 ${mx.toFixed(2)} m, ${my.toFixed(2)} m</div>`;
  wrap.appendChild(div);measurePopup=div;
  setTimeout(()=>{div.remove();if(measurePopup===div)measurePopup=null},4000);
}

// ===================== DIST POPUP =====================
let distPopup=null;
function showDistPopup(sx,sy,distM,wx1,wy1,wx2,wy2){
  if(distPopup)distPopup.remove();
  const div=document.createElement('div');
  div.style.cssText=`position:absolute;left:${sx+14}px;top:${sy-12}px;background:rgba(15,17,23,.96);border:1px solid #3b82f6;border-radius:8px;padding:9px 13px;font-size:12px;color:#e2e8f0;z-index:20;pointer-events:none;min-width:140px`;
  const dx=wx2-wx1, dy=wy2-wy1;
  const horizM=Math.abs(worldToM(dx)), vertM=Math.abs(worldToM(dy));
  div.innerHTML=`
    <div style="color:#60a5fa;font-weight:700;font-size:16px;margin-bottom:4px">📏 ${distM.toFixed(2)} m</div>
    <div style="color:#64748b;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Distância medida</div>
    <div style="color:#94a3b8;font-size:11px">↔ Horizontal: ${horizM.toFixed(2)} m</div>
    <div style="color:#94a3b8;font-size:11px">↕ Vertical: ${vertM.toFixed(2)} m</div>`;
  wrap.appendChild(div);distPopup=div;
  setTimeout(()=>{div.remove();if(distPopup===div)distPopup=null},5000);
}

// ===================== WALL TOOLTIP =====================
let wallTooltip = null;

function showWallTooltip(wall, opening, sx, sy){
  if(!wallTooltip){
    wallTooltip = document.createElement('div');
    wrap.appendChild(wallTooltip);
  }
  if(!wall && !opening){ wallTooltip.style.display='none'; return; }

  let borderColor, inner;
  if(wall){
    const wt = wallTypeDefs[wall.type] || wallTypeDefs.custom;
    borderColor = wt.color;
    inner = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="width:22px;height:5px;border-radius:3px;background:${wt.color};flex-shrink:0"></div>
        <span style="font-weight:700;font-size:12px;color:${wt.color}">${wt.label}</span>
      </div>
      <div style="color:#94a3b8;font-size:10px">Atenuação Wi-Fi: <b style="color:#e2e8f0">−${wt.db} dB</b></div>`;
  } else {
    const isDoor = opening.type === 'door';
    borderColor = isDoor ? '#a0c8f0' : '#60d0ff';
    inner = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:14px">${isDoor ? '🚪' : '🪟'}</span>
        <span style="font-weight:700;font-size:12px;color:${borderColor}">${isDoor ? 'Porta' : 'Janela'}</span>
      </div>
      <div style="color:#94a3b8;font-size:10px">Ganho Wi-Fi: <b style="color:#e2e8f0">+${isDoor ? 3 : 1} dB</b></div>`;
  }

  wallTooltip.style.cssText = `
    position:absolute;z-index:15;pointer-events:none;display:block;
    left:${sx+16}px;top:${sy-8}px;
    background:rgba(15,17,23,.97);border:1px solid ${borderColor};
    border-radius:8px;padding:8px 12px;
    box-shadow:0 4px 18px rgba(0,0,0,.55);
  `;
  wallTooltip.innerHTML = inner;
}

// ===================== MPOINT MODAL =====================
function openMpointModal(wx,wy){
  openModal(`
    <h3>📌 Ponto de Medição Real</h3>
    <p class="hint" style="margin-bottom:12px">Informe o valor de dBm medido neste local com um celular/app (ex: WiFi Analyzer).</p>
    <div class="modal-row"><label>dBm medido</label><input type="number" id="mp-new-dbm" min="-100" max="0" value="-65"></div>
    <div class="modal-row"><label>SSID / AP</label><input type="text" id="mp-new-label" placeholder="ex: Rede_CIMAU"></div>
    <div class="modal-btns">
      <button class="mbtn" onclick="closeModal()">Cancelar</button>
      <button class="mbtn primary" onclick="confirmAddMpoint(${wx},${wy})">Adicionar</button>
    </div>
  `);
}
function confirmAddMpoint(wx,wy){
  const dbm=+document.getElementById('mp-new-dbm').value||(-65);
  const label=document.getElementById('mp-new-label').value||'';
  fl().mpoints.push({x:wx,y:wy,dbm,label});
  closeModal();drawMpoints();
  if(heatmapMode==='real')calcHeatmap();
  updateMpointsList();
  selectEl('mpoint',fl().mpoints.length-1);
}

// ===================== MODALS =====================
function openModal(html){
  document.getElementById('modal-content').innerHTML=html;
  document.getElementById('modal-box').classList.remove('wide');
  document.getElementById('modal-overlay').style.display='flex';
}
function openWideModal(html){
  document.getElementById('modal-content').innerHTML=html;
  document.getElementById('modal-box').classList.add('wide');
  document.getElementById('modal-overlay').style.display='flex';
}
function closeModal(){
  document.getElementById('modal-overlay').style.display='none';
  document.getElementById('modal-box').classList.remove('wide');
}
function closeModalOverlay(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}

// ===================== SUGGESTIONS =====================
function showSuggestions(){
  openWideModal(`
    <div style="margin-bottom:18px">
      <h3 style="margin-bottom:6px;font-size:17px">💡 Sugestões de Melhorias</h3>
      <div style="font-size:13px;color:var(--text3)">Análise baseada nas medições in-loco e simulação ITU-R P.1238 · CIMAU</div>
    </div>

    <div class="sug-floor">⚠ Pontos críticos — Térreo</div>
    <div class="sug-row bad"><span>Escada (ligação com andar de cima)</span><span class="sug-badge red">−86 / −89 dBm</span><span style="font-size:12px;color:var(--text3)">Sem sinal</span></div>
    <div class="sug-row bad"><span>Banheiro Feminino</span><span class="sug-badge red">−81 / −84 dBm</span><span style="font-size:12px;color:var(--text3)">Muito fraco</span></div>
    <div class="sug-row warn"><span>Banheiro PCD</span><span class="sug-badge yellow">−74 / −72 dBm</span><span style="font-size:12px;color:var(--text3)">Fraco</span></div>
    <div class="sug-row warn"><span>Recepção</span><span class="sug-badge yellow">−69 / −64 dBm</span><span style="font-size:12px;color:var(--text3)">Marginal</span></div>

    <div class="sug-floor">⚠ Pontos críticos — Subsolo</div>
    <div class="sug-row bad"><span>Arquivo de Fichas</span><span class="sug-badge red">−77 / −72 dBm</span><span style="font-size:12px;color:var(--text3)">Fraco</span></div>
    <div class="sug-row bad"><span>Arquivo — Sala de Reunião</span><span class="sug-badge red">−76 / −73 dBm</span><span style="font-size:12px;color:var(--text3)">Fraco</span></div>
    <div class="sug-row warn"><span>Placas Solares / Elétrica</span><span class="sug-badge yellow">−72 / −70 dBm</span><span style="font-size:12px;color:var(--text3)">Fraco</span></div>
    <div class="sug-row warn"><span>Banheiro Feminino</span><span class="sug-badge yellow">−70 / −57 dBm</span><span style="font-size:12px;color:var(--text3)">Fraco</span></div>

    <hr class="sug-divider">
    <div class="sug-floor">🛠 Recomendações</div>

    <div class="sug-rec">
      <div class="sug-rec-num">1</div>
      <div>
        <div class="sug-rec-title">Térreo — AP adicional no corredor superior (área dos banheiros)</div>
        <div class="sug-rec-body">O único AP do térreo está a mais de 8 m dos banheiros com múltiplas paredes de concreto no trajeto (−20 dB cada). O banheiro feminino mede −81 dBm, abaixo do limiar de associação da maioria dos dispositivos (−80 dBm). Instalar um AP no corredor central superior — entre os banheiros e a cozinha — eliminaria as zonas mortas da escada, banheiro PCD e banheiro feminino.</div>
        <span class="sug-gain">Melhoria estimada: +20 a +35 dB nas áreas afetadas</span>
      </div>
    </div>

    <div class="sug-rec">
      <div class="sug-rec-num">2</div>
      <div>
        <div class="sug-rec-title">Subsolo — AP na Sala de Reunião (ala superior direita)</div>
        <div class="sug-rec-body">O arquivo está a mais de 15 m do AP atual, separado por paredes de drywall e concreto, resultando em −76/−77 dBm — sinal instável para uso operacional diário. Um AP posicionado na sala de reunião ou no corredor adjacente ao arquivo cobriria toda a ala superior direita do subsolo, incluindo os dois arquivos.</div>
        <span class="sug-gain">Melhoria estimada: +20 a +30 dB no arquivo</span>
      </div>
    </div>

    <div class="sug-rec">
      <div class="sug-rec-num">3</div>
      <div>
        <div class="sug-rec-title">Subsolo — Repetidor ou AP na ala esquerda (farmácia / elétrica)</div>
        <div class="sug-rec-body">Placas solares (−72 dBm) e arquivo de fichas (−77 dBm) formam uma zona de cobertura fraca no extremo esquerdo. Um ponto de acesso próximo à área da farmácia cobriria simultaneamente a ala de licitações, farmácia e sala de controle elétrico. Alternativa mais econômica: repetidor sem fio com uplink para o AP central.</div>
        <span class="sug-gain">Melhoria estimada: +15 a +25 dB na ala esquerda</span>
      </div>
    </div>

    <div class="sug-rec">
      <div class="sug-rec-num">4</div>
      <div>
        <div class="sug-rec-title">Configurar canais fixos e não-sobrepostos</div>
        <div class="sug-rec-body">Ambos os APs estão com canal automático (0). Com múltiplos APs ativos na mesma planta, canais devem ser fixos para evitar reconfiguração dinâmica e co-channel interference:<br>• <b>2.4 GHz:</b> canais 1, 6 ou 11 (espaçamento mínimo de 5 canais entre APs vizinhos)<br>• <b>5 GHz:</b> canais 36, 40, 44 ou 48 (UNII-1, sem restrição de potência)</div>
      </div>
    </div>

    <div class="sug-rec">
      <div class="sug-rec-num">5</div>
      <div>
        <div class="sug-rec-title">Ativar Band Steering (BSS Transition — 802.11v) no Unifi</div>
        <div class="sug-rec-body">O Unifi AC Lite suporta direcionamento de banda via 802.11v. Configurar band steering para mover clientes com sinal ≥ −67 dBm para 5 GHz (maior capacidade e menos congestionamento), liberando o 2.4 GHz para dispositivos distantes ou legados que dependem da maior cobertura dessa banda.</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-top:10px">
      <button class="mbtn primary" style="font-size:13px;padding:7px 18px" onclick="closeModal()">Fechar</button>
    </div>
  `);
}

// ===================== FIT TO VIEW =====================
function fitToView(){
  const f = fl();
  const pts = [];
  f.walls.forEach(w=>{pts.push([w.x1,w.y1],[w.x2,w.y2])});
  f.openings.forEach(o=>{pts.push([o.x1,o.y1],[o.x2,o.y2])});
  f.devices.forEach(d=>{pts.push([d.x,d.y])});
  f.mpoints.forEach(p=>{pts.push([p.x,p.y])});
  if(!pts.length) return;

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pts.forEach(([x,y])=>{
    if(x<minX)minX=x; if(x>maxX)maxX=x;
    if(y<minY)minY=y; if(y>maxY)maxY=y;
  });

  const pad = 60;
  const cw = maxX-minX || 1;
  const ch = maxY-minY || 1;
  zoom = Math.min(Math.max(Math.min((W-pad*2)/cw,(H-pad*2)/ch),0.1),10);
  panX = W/2-(minX+cw/2)*zoom;
  panY = H/2-(minY+ch/2)*zoom;
  document.getElementById('zoom-info').textContent=`Zoom: ${Math.round(zoom*100)}% | Grid: ${(gridCm/100).toFixed(2)} m`;
}

// ===================== INIT =====================
window.addEventListener('resize',resize);
resize();
setTool('measure');

fetch('data.json')
  .then(r=>r.json())
  .then(d=>{
    if(d.wallTypeDefs) Object.assign(wallTypeDefs,d.wallTypeDefs);
    if(d.gridCm) gridCm=d.gridCm;
    if(d.floors){
      floors=d.floors.map(f=>({...f,bgImg:f.bgImgData||null,mpoints:f.mpoints||[]}));
      Object.keys(bgImgCache).forEach(k=>delete bgImgCache[k]);
    }
    currentFloor=0;
    renderFloorTabs();selectEl(null,-1);
    fitToView();
    calcHeatmap();
    redrawAll();updateMpointsList();
  })
  .catch(()=>renderFloorTabs());

// ===================== SIDEBAR RESIZE + TOGGLE =====================
let sidebarOpen=false;

function toggleSidebar(){
  sidebarOpen=!sidebarOpen;
  const sb=document.getElementById('sidebar');
  const btn=document.getElementById('sidebar-toggle');
  sb.classList.toggle('collapsed',!sidebarOpen);
  btn.textContent=sidebarOpen?'◀':'▶';
  btn.title=sidebarOpen?'Recolher painel':'Expandir painel';
  setTimeout(resize,220);
}

(function initSidebarResize(){
  const resizer=document.getElementById('sidebar-resizer');
  if(!resizer)return;
  let isResizing=false,startX=0,startW=0;
  resizer.addEventListener('mousedown',e=>{
    if(!sidebarOpen)return;
    isResizing=true;startX=e.clientX;
    startW=document.getElementById('sidebar').getBoundingClientRect().width;
    document.body.style.cursor='col-resize';e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!isResizing)return;
    const newW=Math.min(Math.max(startW-(e.clientX-startX),160),520);
    document.getElementById('sidebar').style.width=newW+'px';
  });
  document.addEventListener('mouseup',()=>{
    if(isResizing){isResizing=false;document.body.style.cursor='';resize();}
  });
})();
