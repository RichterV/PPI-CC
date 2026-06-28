// ===================== CONFIG =====================
const GRID = 24; // pixels per grid cell
let gridCm = 20; // cm per grid cell (user-adjustable)

let wallTypeDefs = {
  drywall:   {color:'#7090b0', w:3, db:3,  label:'Drywall'},
  alvenaria: {color:'#5080a0', w:5, db:10, label:'Alvenaria'},
  concreto:  {color:'#2a4a6a', w:8, db:20, label:'Concreto'},
  vidro:     {color:'#80d8f0', w:2, db:2,  label:'Vidro'},
  custom:    {color:'#c084fc', w:4, db:5,  label:'Personalizada'},
};

const devicePresets = {
  unifi_ac_lite: {power:20,gain:3,freq:'2.4',sensitivity:-73},
  unifi_ac_pro:  {power:22,gain:4,freq:'2.4',sensitivity:-73},
  unifi_u6:      {power:23,gain:5,freq:'5',  sensitivity:-75},
  tplink_dir815: {power:17,gain:2,freq:'2.4',sensitivity:-65},
  tplink_archer: {power:20,gain:3,freq:'2.4',sensitivity:-68},
  intelbras_ap:  {power:18,gain:3,freq:'2.4',sensitivity:-70},
  cisco_ap:      {power:23,gain:4,freq:'5',  sensitivity:-75},
};

const channels24 = [1,2,3,4,5,6,7,8,9,10,11];
const channels5  = [36,40,44,48,52,56,60,64,100,104,108,112,116,149,153,157,161,165];

function chOverlap(a,b,freq){
  if(a===0||b===0) return false;
  if(freq==='5') return a===b;
  return Math.abs(a-b)<5;
}

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
    tab.innerHTML = `<span ondblclick="renameFloor(${i})" title="Duplo clique para renomear">${f.name}</span>`
      + (floors.length>1?`<span class="del-f" onclick="deleteFloor(${i})">✕</span>`:'');
    tab.onclick = (e)=>{ if(e.target.classList.contains('del-f'))return; switchFloor(i); };
    cont.appendChild(tab);
  });
}

function switchFloor(i){
  saveCurrentFloorState();
  currentFloor = i;
  loadFloorState();
  renderFloorTabs();
  selectEl(null,-1);
  redrawAll();
  updateMpointsList();
}

function saveCurrentFloorState(){
  // state is already live in floors[currentFloor]
}
function loadFloorState(){ /* state is already in floors[currentFloor] */ }

function addFloor(){
  const name = prompt('Nome do andar:', `${floors.length}º Pav`);
  if(!name) return;
  floors.push({name, walls:[], devices:[], openings:[], mpoints:[], bgImg:null});
  switchFloor(floors.length-1);
}

function deleteFloor(i){
  if(!confirm(`Remover "${floors[i].name}"?`)) return;
  floors.splice(i,1);
  if(currentFloor>=floors.length) currentFloor=floors.length-1;
  renderFloorTabs(); selectEl(null,-1); redrawAll(); updateMpointsList();
}

function renameFloor(i){
  const n = prompt('Novo nome:', floors[i].name);
  if(n){ floors[i].name=n; renderFloorTabs(); }
}

// ===================== CANVAS =====================
const wrap   = document.getElementById('canvas-wrap');
const bgC    = document.getElementById('bg-canvas');
const bgImgC = document.getElementById('bg-img-canvas');
const hmC    = document.getElementById('heatmap-canvas');
const wallC  = document.getElementById('wall-canvas');
const devC   = document.getElementById('device-canvas');
const mpC    = document.getElementById('mpoint-canvas');
const uiC    = document.getElementById('ui-canvas');
const intC   = document.getElementById('interact-canvas');
const ctxBg    = bgC.getContext('2d');
const ctxBgImg = bgImgC.getContext('2d');
const ctxHm    = hmC.getContext('2d');
const ctxWall  = wallC.getContext('2d');
const ctxDev   = devC.getContext('2d');
const ctxMp    = mpC.getContext('2d');
const ctxUi    = uiC.getContext('2d');

let W=0, H=0;

function resize(){
  W=wrap.clientWidth; H=wrap.clientHeight;
  [bgC,bgImgC,hmC,wallC,devC,mpC,uiC,intC].forEach(c=>{c.width=W;c.height=H});
  redrawAll();
}

let panX=0, panY=0, zoom=1;
function toWorld(sx,sy){return[(sx-panX)/zoom,(sy-panY)/zoom]}
function toScreen(wx,wy){return[wx*zoom+panX,wy*zoom+panY]}
function snapW(v){return Math.round(v/GRID)*GRID}

function cmToWorld(cm){ return cm/gridCm * GRID; }
function worldToCm(w){ return (w/GRID)*gridCm; }

function redrawAll(){drawBg();drawBgImg();drawWalls();drawDevices();drawMpoints();calcHeatmap();drawUI()}

// ===================== BG =====================
function drawBg(){
  const c=ctxBg; c.clearRect(0,0,W,H);
  c.fillStyle='#0a0d14'; c.fillRect(0,0,W,H);
  const gs=GRID*zoom;
  const ox=((panX%gs)+gs)%gs, oy=((panY%gs)+gs)%gs;
  c.strokeStyle='#141824'; c.lineWidth=0.8;
  for(let x=ox-gs;x<W+gs;x+=gs){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}
  for(let y=oy-gs;y<H+gs;y+=gs){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  const big = 5; // major grid every 5 cells
  const gs5=gs*big;
  const ox5=((panX%gs5)+gs5)%gs5, oy5=((panY%gs5)+gs5)%gs5;
  c.strokeStyle='#1e2840'; c.lineWidth=1;
  for(let x=ox5-gs5;x<W+gs5;x+=gs5){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}
  for(let y=oy5-gs5;y<H+gs5;y+=gs5){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
  // ruler labels
  if(zoom>0.4){
    c.fillStyle='#2a3a50'; c.font=`${Math.min(9*zoom,10)}px var(--font)`;
    c.textAlign='center'; c.textBaseline='top';
    for(let x=ox5-gs5;x<W+gs5;x+=gs5){
      const wx=(x-panX)/zoom;
      const cm=Math.round(worldToCm(wx));
      c.fillText(cm+'cm',x,2);
    }
    c.textAlign='right'; c.textBaseline='middle';
    for(let y=oy5-gs5;y<H+gs5;y+=gs5){
      const wy=(y-panY)/zoom;
      const cm=Math.round(worldToCm(wy));
      c.fillText(cm+'cm',W-3,y);
    }
  }
}

// ===================== BG IMAGE =====================
const bgImgCache = {};
let bgDragging = false, bgDragSX=0, bgDragSY=0, bgDragOX=0, bgDragOY=0;
let bgCropDragging = null, bgCropStartX=0, bgCropStartY=0;

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
  // bgOffX/Y are in world coords
  const[sx,sy]=toScreen(f.bgOffX||0, f.bgOffY||0);
  const sw = img.naturalWidth  * zoom * scale;
  const sh = img.naturalHeight * zoom * scale;
  c.save();
  c.globalAlpha = alpha;
  c.translate(sx + sw/2, sy + sh/2);
  c.rotate(rot);
  c.drawImage(img, -sw/2, -sh/2, sw, sh);
  // draw dashed border when in bgadj mode
  if(tool==='bgadj'){
    c.globalAlpha=0.7;
    c.strokeStyle='#3b82f6';c.lineWidth=2/zoom;c.setLineDash([8/zoom,4/zoom]);
    c.strokeRect(-sw/2,-sh/2,sw,sh);
    c.setLineDash([]);
    // corner handles
    [[-sw/2,-sh/2],[sw/2,-sh/2],[sw/2,sh/2],[-sw/2,sh/2]].forEach(([hx,hy])=>{
      c.fillStyle='#3b82f6';c.beginPath();c.arc(hx,hy,6/zoom,0,Math.PI*2);c.fill();
    });
  }
  c.restore();
}

function bgAdjust(prop, val){
  const f=fl();
  if(prop==='opacity'){ f.bgOpacity=val; document.getElementById('bg-opacity-val').textContent=val; }
  if(prop==='scale'){   f.bgScale=val/100; document.getElementById('bg-scale-val').textContent=val; }
  if(prop==='rot'){     f.bgRot=val;  document.getElementById('bg-rot-val').textContent=val; }
  if(prop==='offx'){    f.bgOffX=val/gridCm*GRID; }
  if(prop==='offy'){    f.bgOffY=val/gridCm*GRID; }
  drawBgImg();
}

function resetBgTransform(){
  const f=fl();
  f.bgScale=1; f.bgRot=0; f.bgOffX=0; f.bgOffY=0; f.bgOpacity=35;
  syncBgControls();
  drawBgImg();
}

function syncBgControls(){
  const f=fl();
  document.getElementById('bg-opacity').value = f.bgOpacity!=null?f.bgOpacity:35;
  document.getElementById('bg-opacity-val').textContent = f.bgOpacity!=null?f.bgOpacity:35;
  document.getElementById('bg-scale').value = Math.round((f.bgScale||1)*100);
  document.getElementById('bg-scale-val').textContent = Math.round((f.bgScale||1)*100);
  document.getElementById('bg-rot').value = f.bgRot||0;
  document.getElementById('bg-rot-val').textContent = f.bgRot||0;
  document.getElementById('bg-offx').value = Math.round((f.bgOffX||0)/GRID*gridCm);
  document.getElementById('bg-offy').value = Math.round((f.bgOffY||0)/GRID*gridCm);
}

function syncBgOffsetInputs(){
  const f=fl();
  document.getElementById('bg-offx').value = Math.round((f.bgOffX||0)/GRID*gridCm);
  document.getElementById('bg-offy').value = Math.round((f.bgOffY||0)/GRID*gridCm);
}

function hitCropHandle(sx,sy){
  const f=fl();
  const img=bgImgCache[currentFloor];
  if(!img||!f.bgImg) return null;
  const scale=(f.bgScale||1);
  const[ox,oy]=toScreen(f.bgOffX||0,f.bgOffY||0);
  const sw=img.naturalWidth*zoom*scale, sh=img.naturalHeight*zoom*scale;
  const thr=10;
  const crop=f.bgCrop||{l:0,t:0,r:0,b:0};
  const lx=ox+crop.l*zoom*scale, rx=ox+sw-crop.r*zoom*scale;
  const ty=oy+crop.t*zoom*scale, by=oy+sh-crop.b*zoom*scale;
  if(Math.abs(sx-lx)<thr&&sy>ty&&sy<by) return 'l';
  if(Math.abs(sx-rx)<thr&&sy>ty&&sy<by) return 'r';
  if(Math.abs(sy-ty)<thr&&sx>lx&&sx<rx) return 't';
  if(Math.abs(sy-by)<thr&&sx>lx&&sx<rx) return 'b';
  return null;
}

async function loadBgFile(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.type==='application/pdf'){
    await loadPdfAsBg(file);
  } else {
    const fr=new FileReader();
    fr.onload=ev=>{
      fl().bgImg=ev.target.result;
      fl().bgScale=1; fl().bgRot=0; fl().bgOffX=0; fl().bgOffY=0; fl().bgOpacity=35;
      delete bgImgCache[currentFloor];
      syncBgControls();
      document.getElementById('bg-adj-sec').style.display='block';
      drawBgImg();
      setTool('bgadj');
    };
    fr.readAsDataURL(file);
  }
  e.target.value='';
}

async function loadPdfAsBg(file){
  // Dynamically load PDF.js from CDN
  if(!window.pdfjsLib){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc=
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const ab = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({data:ab}).promise;
  // Ask which page if multi-page
  let pageNum=1;
  if(pdf.numPages>1){
    const p=prompt(`PDF tem ${pdf.numPages} páginas. Qual página usar? (1–${pdf.numPages})`,1);
    pageNum=Math.min(Math.max(+p||1,1),pdf.numPages);
  }
  const page = await pdf.getPage(pageNum);
  const vp = page.getViewport({scale:3}); // render at 3x for quality
  const tmp=document.createElement('canvas');
  tmp.width=vp.width; tmp.height=vp.height;
  await page.render({canvasContext:tmp.getContext('2d'),viewport:vp}).promise;
  fl().bgImg=tmp.toDataURL('image/png');
  fl().bgScale=1; fl().bgRot=0; fl().bgOffX=0; fl().bgOffY=0; fl().bgOpacity=35;
  delete bgImgCache[currentFloor];
  syncBgControls();
  document.getElementById('bg-adj-sec').style.display='block';
  drawBgImg();
  setTool('bgadj');
  alert(`Página ${pageNum} do PDF carregada! Use "✋ Ajustar fundo" para posicionar.`);
}

function clearBgImage(){
  fl().bgImg=null;
  delete bgImgCache[currentFloor];
  ctxBgImg.clearRect(0,0,W,H);
  document.getElementById('bg-adj-sec').style.display='none';
}

// ===================== DRAW WALLS =====================
function drawWalls(){
  const c=ctxWall; c.clearRect(0,0,W,H);
  const f=fl();
  f.walls.forEach((w,i)=>{
    const[sx1,sy1]=toScreen(w.x1,w.y1);
    const[sx2,sy2]=toScreen(w.x2,w.y2);
    const wt=wallTypeDefs[w.type]||wallTypeDefs.custom;
    const sel=i===selectedIdx&&selectedType==='wall';
    if(sel){c.strokeStyle='#f59e0b44';c.lineWidth=(wt.w+8)*Math.max(zoom,0.4);c.lineCap='round';c.beginPath();c.moveTo(sx1,sy1);c.lineTo(sx2,sy2);c.stroke()}
    c.strokeStyle=sel?'#f59e0b':wt.color;
    c.lineWidth=wt.w*Math.max(zoom,0.4); c.lineCap='round';
    c.beginPath(); c.moveTo(sx1,sy1); c.lineTo(sx2,sy2); c.stroke();
    if(sel){
      [[sx1,sy1],[sx2,sy2],[(sx1+sx2)/2,(sy1+sy2)/2]].forEach(([hx,hy],hi)=>{
        c.fillStyle=hi===2?'#f59e0b88':'#f59e0b';
        c.beginPath();c.arc(hx,hy,hi===2?5:6,0,Math.PI*2);c.fill();
      });
    }
  });
  f.openings.forEach((o,i)=>{
    const[sx1,sy1]=toScreen(o.x1,o.y1);
    const[sx2,sy2]=toScreen(o.x2,o.y2);
    const sel=i===selectedIdx&&selectedType==='opening';
    c.strokeStyle=sel?'#f59e0b':(o.type==='door'?'#a0c8f0':'#60d0ff');
    c.lineWidth=2*Math.max(zoom,0.4); c.lineCap='round';
    c.setLineDash(o.type==='door'?[6*zoom,4*zoom]:[3*zoom,3*zoom]);
    c.beginPath(); c.moveTo(sx1,sy1); c.lineTo(sx2,sy2); c.stroke(); c.setLineDash([]);
    const mx=(sx1+sx2)/2,my=(sy1+sy2)/2;
    c.font=`${11*Math.max(zoom,0.4)}px serif`;c.textAlign='center';c.textBaseline='middle';
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

function drawDevices(){
  const c=ctxDev; c.clearRect(0,0,W,H);
  fl().devices.forEach((d,i)=>{
    const[sx,sy]=toScreen(d.x,d.y);
    const sel=i===selectedIdx&&selectedType==='device';
    const sz=26*Math.max(zoom,0.4);
    if(sel){c.strokeStyle='#f59e0b';c.lineWidth=2;c.strokeRect(sx-sz/2-2,sy-sz/2-2,sz+4,sz+4)}
    const drawIcon=()=>{
      c.save();
      if(sel){c.shadowColor='#f59e0b';c.shadowBlur=10}
      c.font=`${sz*0.9}px serif`;c.textAlign='center';c.textBaseline='middle';
      c.fillText(d.icon||fallbackIcons[d.type]||'❓',sx,sy);
      c.restore();
    };
    if(d.imgSrc){
      getImg(d.imgSrc,img=>{
        if(!img){drawIcon();drawDeviceLbl(c,d,sx,sy,sz);return}
        c.save();if(sel){c.shadowColor='#f59e0b';c.shadowBlur=10}
        c.drawImage(img,sx-sz/2,sy-sz/2,sz,sz);c.restore();
        drawDeviceLbl(c,d,sx,sy,sz);
      });
    } else { drawIcon(); }
    drawDeviceLbl(c,d,sx,sy,sz);
    if(d.type==='router'&&d.channel&&d.channel!==0){
      const bx=sx+sz/2+2,by=sy-sz/2-2;
      c.fillStyle=d.freq==='5'?'#8b5cf6':'#10b981';
      c.fillRect(bx,by,28,13);
      c.fillStyle='#fff';c.font=`bold ${9*Math.max(zoom,0.4)}px var(--font)`;
      c.textAlign='center';c.textBaseline='middle';c.fillText('ch'+d.channel,bx+14,by+6.5);
    }
  });
}
function drawDeviceLbl(c,d,sx,sy,sz){
  const lbl=d.name||d.typeLabel||d.type;
  c.font=`bold ${10*Math.max(zoom,0.4)}px var(--font)`;c.textAlign='center';
  const tw=c.measureText(lbl).width;
  c.fillStyle='rgba(15,17,23,.85)';c.fillRect(sx-tw/2-3,sy+sz/2+2,tw+6,13*Math.max(zoom,0.4));
  c.fillStyle='#e2e8f0';c.textBaseline='top';c.fillText(lbl,sx,sy+sz/2+3);
}

// ===================== DRAW MPOINTS =====================
function drawMpoints(){
  const c=ctxMp; c.clearRect(0,0,W,H);
  fl().mpoints.forEach((p,i)=>{
    const[sx,sy]=toScreen(p.x,p.y);
    const sel=i===selectedIdx&&selectedType==='mpoint';
    const col=dbmToColor(p.dbm);
    c.save();
    c.shadowColor=col;c.shadowBlur=sel?14:6;
    c.beginPath();c.arc(sx,sy,sel?8:6,0,Math.PI*2);
    c.fillStyle=col;c.fill();
    c.strokeStyle='#fff';c.lineWidth=1.5;c.stroke();
    c.restore();
    c.fillStyle='#fff';c.font=`bold ${10*Math.max(zoom,0.5)}px var(--font)`;
    c.textAlign='center';c.textBaseline='bottom';
    c.fillText(p.dbm+'dBm',sx,sy-8);
    if(p.label){
      c.fillStyle='#94a3b8';c.font=`${9*Math.max(zoom,0.5)}px var(--font)`;
      c.fillText(p.label,sx,sy-18);
    }
  });
}

function dbmToColor(dbm){
  if(dbm>-55) return '#10b981';
  if(dbm>-65) return '#84cc16';
  if(dbm>-72) return '#f59e0b';
  if(dbm>-80) return '#f97316';
  if(dbm>-90) return '#ef4444';
  return '#64748b';
}

// ===================== HEATMAP =====================
let heatmapMode='off';

function calcHeatmap(){
  const c=ctxHm;
  if(heatmapMode==='off'){c.clearRect(0,0,W,H);return}
  const f=fl();
  const routers=f.devices.filter(d=>d.type==='router');

  if(heatmapMode==='real'){
    drawRealHeatmap(c,f);return;
  }
  if(!routers.length){c.clearRect(0,0,W,H);return}

  const step=6;
  const img=c.createImageData(W,H);

  for(let py=0;py<H;py+=step){
    for(let px=0;px<W;px+=step){
      const[wx,wy]=toWorld(px,py);
      let maxSig=-999, dominantR=null;
      routers.forEach(r=>{
        let sig=computeSig(r,wx,wy,f.walls,f.openings);
        if(sig>maxSig){maxSig=sig;dominantR=r}
      });

      let rr,g,b,a;
      if(heatmapMode==='interference'){
        let intCount=0;
        routers.forEach(r=>{
          if(r===dominantR)return;
          const s=computeSig(r,wx,wy,f.walls,f.openings);
          if(s>=-80&&dominantR&&chOverlap(r.channel||0,dominantR.channel||0,r.freq||'2.4'))intCount++;
        });
        if(maxSig<-90){rr=15;g=17;b=23;a=30}
        else if(intCount===0){rr=16;g=185;b=129;a=190}
        else if(intCount===1){rr=245;g=158;b=11;a=200}
        else{rr=239;g=68;b=68;a=210}
      } else {
        [rr,g,b,a]=sigToRGBA(maxSig);
      }
      for(let sy=0;sy<step&&py+sy<H;sy++)
        for(let sx=0;sx<step&&px+sx<W;sx++){
          const idx=((py+sy)*W+(px+sx))*4;
          img.data[idx]=rr;img.data[idx+1]=g;img.data[idx+2]=b;img.data[idx+3]=a;
        }
    }
  }
  c.putImageData(img,0,0);
}

function computeSig(r,wx,wy,walls,openings){
  const dx=wx-r.x,dy=wy-r.y;
  const distPx=Math.sqrt(dx*dx+dy*dy)||0.1;
  const distM=Math.max(distPx/GRID*(gridCm/100),0.05);
  const n=r.freq==='5'?3.5:3.0;
  const fMHz=r.freq==='5'?5500:2412;
  const fspl=20*Math.log10(distM)+10*n*Math.log10(distM)+20*Math.log10(fMHz)-27.55;
  let sig=(r.power||17)+(r.gain||2)-fspl;
  walls.forEach(w=>{if(segInt(r.x,r.y,wx,wy,w.x1,w.y1,w.x2,w.y2))sig-=(wallTypeDefs[w.type]||wallTypeDefs.custom).db});
  openings.forEach(o=>{if(segInt(r.x,r.y,wx,wy,o.x1,o.y1,o.x2,o.y2))sig+=o.type==='door'?3:1});
  return sig;
}

// Real heatmap: hybrid model
// 1. Simulation gives shape/walls/physics (keeps walls blocking signal)
// 2. Measurement points compute a correction offset via wall-aware IDW
// 3. Final = simulated + correction → respects walls, calibrated to reality
function drawRealHeatmap(c,f){
  const pts=f.mpoints;
  const routers=f.devices.filter(d=>d.type==='router');

  // Need at least measurement points; routers optional but improve accuracy
  if(!pts.length){c.clearRect(0,0,W,H);return}

  // Pre-compute: for each measurement point, what does the simulation predict?
  // correction[i] = measured_dbm - simulated_dbm at that point
  // If no routers, we fall back to pure wall-aware IDW among mpoints
  const corrections = pts.map(p=>{
    if(!routers.length) return {x:p.x, y:p.y, delta:0, measured:p.dbm};
    let maxSim=-999;
    routers.forEach(r=>{
      const s=computeSig(r,p.x,p.y,f.walls,f.openings);
      if(s>maxSim) maxSim=s;
    });
    // delta = how much reality differs from simulation at this anchor
    return {x:p.x, y:p.y, delta:p.dbm - maxSim, measured:p.dbm};
  });

  const step=6;
  const img=c.createImageData(W,H);
  const idwPow=2;

  for(let py=0;py<H;py+=step){
    for(let px=0;px<W;px+=step){
      const[wx,wy]=toWorld(px,py);

      // 1. Simulated signal at this pixel (wall-aware)
      let simSig=-999;
      if(routers.length){
        routers.forEach(r=>{
          const s=computeSig(r,wx,wy,f.walls,f.openings);
          if(s>simSig) simSig=s;
        });
      }

      // 2. Wall-aware IDW correction from measurement points
      // Weight is reduced when walls stand between the mpoint and this pixel
      let wsum=0, vsum=0;
      corrections.forEach(corr=>{
        const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;

        // Count walls between this pixel and the correction anchor
        let wallPenalty=0;
        f.walls.forEach(w=>{
          if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))
            wallPenalty+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db;
        });

        // Wall penalty reduces the influence of this anchor on the other side
        const effectiveDist = dist * Math.pow(10, wallPenalty/20);
        const weight = 1/Math.pow(effectiveDist, idwPow);
        wsum += weight;
        vsum += weight * corr.delta;
      });

      const correction = wsum>0 ? vsum/wsum : 0;

      // 3. Final: if we have routers use calibrated sim, else use measured IDW directly
      let finalDbm;
      if(routers.length){
        finalDbm = simSig + correction;
      } else {
        // No routers: pure wall-aware IDW of measured values
        let ws2=0,vs2=0;
        corrections.forEach(corr=>{
          const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;
          let wallPenalty=0;
          f.walls.forEach(w=>{if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))wallPenalty+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db});
          const eDist=dist*Math.pow(10,wallPenalty/20);
          const wt=1/Math.pow(eDist,idwPow);
          ws2+=wt; vs2+=wt*corr.measured;
        });
        finalDbm = ws2>0 ? vs2/ws2 : -90;
      }

      const[rr,g,b,a]=sigToRGBA(finalDbm);
      for(let sy=0;sy<step&&py+sy<H;sy++)
        for(let sx=0;sx<step&&px+sx<W;sx++){
          const idx=((py+sy)*W+(px+sx))*4;
          img.data[idx]=rr;img.data[idx+1]=g;img.data[idx+2]=b;img.data[idx+3]=a;
        }
    }
  }
  c.putImageData(img,0,0);
}

function sigToRGBA(sig){
  if(sig>-55)  return [16,185,129,200];
  if(sig>-65)  return [132,204,22,190];
  if(sig>-72)  return [245,158,11,185];
  if(sig>-80)  return [249,115,22,175];
  if(sig>-90)  return [239,68,68,160];
  return [15,17,23,30];
}

function segInt(ax,ay,bx,by,cx,cy,dx,dy){
  const d1x=bx-ax,d1y=by-ay,d2x=dx-cx,d2y=dy-cy;
  const cross=d1x*d2y-d1y*d2x;
  if(Math.abs(cross)<1e-10)return false;
  const t=((cx-ax)*d2y-(cy-ay)*d2x)/cross;
  const u=((cx-ax)*d1y-(cy-ay)*d1x)/cross;
  return t>0&&t<1&&u>0&&u<1;
}

// ===================== UI OVERLAY =====================
function drawUI(){
  const c=ctxUi; c.clearRect(0,0,W,H);
  if(!drawing) return;
  const[sx1,sy1]=toScreen(startX,startY);
  const[sx2,sy2]=toScreen(curX,curY);
  const col=tool==='door'?'#a0c8f0':tool==='window'?'#60d0ff':(wallTypeDefs[wallType]||wallTypeDefs.custom).color;
  c.strokeStyle=col+'bb';c.lineWidth=(tool==='wall'?(wallTypeDefs[wallType]||wallTypeDefs.custom).w:2)*Math.max(zoom,0.4);
  c.lineCap='round';c.setLineDash([8,5]);c.beginPath();c.moveTo(sx1,sy1);c.lineTo(sx2,sy2);c.stroke();c.setLineDash([]);
  const mx=(sx1+sx2)/2,my=(sy1+sy2)/2;
  const dx=curX-startX,dy=curY-startY;
  const cmLen=Math.round(Math.sqrt(dx*dx+dy*dy)/GRID*gridCm);
  const lbl=cmLen+'cm'+(cmLen>=100?` (${(cmLen/100).toFixed(2)}m)`:'');
  const tw=c.measureText(lbl).width;
  c.fillStyle='rgba(59,130,246,.9)';c.fillRect(mx-tw/2-6,my-10,tw+12,20);
  c.fillStyle='#fff';c.font='bold 11px var(--font)';c.textAlign='center';c.textBaseline='middle';c.fillText(lbl,mx,my);
}

// ===================== TOOLS =====================
let tool='wall', wallType='alvenaria';
let drawing=false, startX=0, startY=0, curX=0, curY=0;
let selectedIdx=-1, selectedType=null;
let dragging=false, dragOffX=0, dragOffY=0;
let dragWallMode=null, dragWallIdx=-1;
let panning=false, panSX=0, panSY=0, panOX=0, panOY=0;

function setTool(t){
  tool=t;
  document.querySelectorAll('.tbtn[id^=btn-]').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('btn-'+t);if(el)el.classList.add('active');
  const cur={wall:'crosshair',door:'crosshair',window:'crosshair',select:'default',erase:'not-allowed',measure:'cell',mpoint:'crosshair'};
  intC.style.cursor=cur[t]||'crosshair';
  const msgs={
    wall:`Parede [${wallType}]: clique e arraste | Grid: ${gridCm}cm/célula`,
    door:'Porta: clique e arraste',window:'Janela: clique e arraste',
    select:'Selecionar: clique | arrastar=mover | Del=apagar | ponta parede=redimensionar',
    erase:'Apagar: clique no elemento',
    measure:'📍 Medir: clique em qualquer ponto para ver o dBm simulado',
    mpoint:'📌 Ponto Real: clique no local e informe o dBm medido in-loco'
  };
  document.getElementById('status').textContent=msgs[t]||t;
}

function setHeatmapMode(mode){
  heatmapMode=mode;
  ['hm-sim-btn','hm-real-btn','hm-int-btn'].forEach(id=>document.getElementById(id).classList.remove('active'));
  if(mode==='simulation') document.getElementById('hm-sim-btn').classList.add('active');
  if(mode==='real')       document.getElementById('hm-real-btn').classList.add('active');
  if(mode==='interference') document.getElementById('hm-int-btn').classList.add('active');
  calcHeatmap();
}

function setGridScale(v){
  gridCm=+v;
  document.getElementById('zoom-info').textContent=`Zoom: ${Math.round(zoom*100)}% | Grid: ${gridCm}cm`;
  redrawAll();
  setTool(tool);
}

// ===================== SELECTION =====================
function selectEl(type,idx){
  selectedType=type; selectedIdx=idx;
  ['no-sel','router-props','device-props','wall-props','mpoint-props'].forEach(id=>document.getElementById(id).style.display='none');
  const f=fl();
  if(type==='device'){
    const d=f.devices[idx];
    if(d.type==='router'){
      document.getElementById('router-props').style.display='block';
      document.getElementById('r-name').value=d.name||'';
      document.getElementById('r-power').value=d.power||17;document.getElementById('r-power-val').textContent=d.power||17;
      document.getElementById('r-gain').value=d.gain||2;document.getElementById('r-gain-val').textContent=d.gain||2;
      document.getElementById('r-sens').value=d.sensitivity||-70;document.getElementById('r-sens-val').textContent=d.sensitivity||-70;
      document.getElementById('r-freq').value=d.freq||'2.4';
      document.getElementById('r-model').value=d.model||'custom';
      document.getElementById('r-color').value=d.sigColor||'#3b82f6';
      document.getElementById('r-txlevel').value=d.txLevel||'medium';
      refreshChannels();document.getElementById('r-channel').value=d.channel||0;
    } else {
      document.getElementById('device-props').style.display='block';
      document.getElementById('d-name').value=d.name||'';
      document.getElementById('d-ip').value=d.ip||'';
      document.getElementById('d-type-label').value=d.typeLabel||d.type||'';
    }
  } else if(type==='wall'){
    document.getElementById('wall-props').style.display='block';
    document.getElementById('w-type').value=f.walls[idx].type;
    updateWallLen(f.walls[idx]);
  } else if(type==='opening'){
    document.getElementById('wall-props').style.display='block';
  } else if(type==='mpoint'){
    const p=f.mpoints[idx];
    document.getElementById('mpoint-props').style.display='block';
    document.getElementById('mp-dbm').value=p.dbm;
    document.getElementById('mp-label').value=p.label||'';
  } else {
    document.getElementById('no-sel').style.display='block';
  }
  drawWalls();drawDevices();drawMpoints();
}

function updateWallLen(w){
  const dx=w.x2-w.x1,dy=w.y2-w.y1;
  const cm=Math.round(Math.sqrt(dx*dx+dy*dy)/GRID*gridCm);
  document.getElementById('w-len').textContent=`Comprimento: ${cm}cm${cm>=100?' ('+((cm/100).toFixed(2))+'m)':''}`;
}

function upProp(prop,val){
  const f=fl();
  if(selectedType==='device'&&selectedIdx>=0){
    f.devices[selectedIdx][prop]=val;
    drawDevices();if(heatmapMode!=='off')calcHeatmap();
  } else if(selectedType==='wall'&&selectedIdx>=0){
    if(prop==='wtype'){f.walls[selectedIdx].type=val;drawWalls();}
  }
}

function upMpointProp(prop,val){
  const f=fl();
  if(selectedType==='mpoint'&&selectedIdx>=0){
    f.mpoints[selectedIdx][prop]=val;
    drawMpoints();if(heatmapMode==='real')calcHeatmap();
    updateMpointsList();
  }
}

function deleteMpoint(){
  const f=fl();
  if(selectedType==='mpoint'&&selectedIdx>=0){
    f.mpoints.splice(selectedIdx,1);
    selectEl(null,-1);drawMpoints();if(heatmapMode==='real')calcHeatmap();updateMpointsList();
  }
}

function updateMpointsList(){
  const f=fl();
  const el=document.getElementById('mpoints-list');
  if(!f.mpoints.length){el.textContent='Nenhum ponto adicionado.';return}
  el.innerHTML=f.mpoints.map((p,i)=>`
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer" onclick="selectMpoint(${i})">
      <div style="width:10px;height:10px;border-radius:50%;background:${dbmToColor(p.dbm)};flex-shrink:0"></div>
      <span style="font-size:11px;color:var(--text)">${p.label||'Ponto '+(i+1)}</span>
      <span style="font-size:11px;color:var(--text3);margin-left:auto">${p.dbm} dBm</span>
    </div>`).join('');
}
function selectMpoint(i){selectEl('mpoint',i);drawMpoints()}

function refreshChannels(){
  const freq=document.getElementById('r-freq').value;
  const sel=document.getElementById('r-channel');
  const cur=sel.value;
  sel.innerHTML='<option value="0">Auto</option>';
  (freq==='5'?channels5:channels24).forEach(ch=>{const o=document.createElement('option');o.value=ch;o.textContent='Canal '+ch;sel.appendChild(o)});
  sel.value=cur||0;
}

function applyPreset(model){
  const f=fl();
  if(selectedType==='device'&&selectedIdx>=0){
    const p=devicePresets[model];if(!p)return;
    Object.assign(f.devices[selectedIdx],p,{model});
    document.getElementById('r-power').value=p.power;document.getElementById('r-power-val').textContent=p.power;
    document.getElementById('r-gain').value=p.gain;document.getElementById('r-gain-val').textContent=p.gain;
    document.getElementById('r-sens').value=p.sensitivity;document.getElementById('r-sens-val').textContent=p.sensitivity;
    document.getElementById('r-freq').value=p.freq;refreshChannels();
    if(heatmapMode!=='off')calcHeatmap();
  }
}

function applyTxLevel(level){
  const map={low:14,medium:20,high:23};
  const pw=map[level]||20;
  const f=fl();
  if(selectedType==='device'&&selectedIdx>=0){f.devices[selectedIdx].txLevel=level;f.devices[selectedIdx].power=pw;}
  document.getElementById('r-power').value=pw;document.getElementById('r-power-val').textContent=pw;
  if(heatmapMode!=='off')calcHeatmap();
}

// ===================== HIT TESTS =====================
function hitDevice(wx,wy){
  const f=fl();
  for(let i=f.devices.length-1;i>=0;i--){
    const d=f.devices[i];if((wx-d.x)**2+(wy-d.y)**2<=20**2)return i;
  }return -1;
}
function hitWall(wx,wy){
  const f=fl();
  for(let i=f.walls.length-1;i>=0;i--){
    const w=f.walls[i];
    const dx=w.x2-w.x1,dy=w.y2-w.y1,len=Math.sqrt(dx*dx+dy*dy);
    if(len<1)continue;
    const t=((wx-w.x1)*dx+(wy-w.y1)*dy)/(len*len);
    if(t<0||t>1)continue;
    const px=w.x1+t*dx,py=w.y1+t*dy;
    if(Math.sqrt((wx-px)**2+(wy-py)**2)<=10/zoom)return i;
  }return -1;
}
function hitWallHandle(wx,wy,wi){
  const w=fl().walls[wi];const thr=10/zoom;
  if(Math.sqrt((wx-w.x1)**2+(wy-w.y1)**2)<=thr)return'p1';
  if(Math.sqrt((wx-w.x2)**2+(wy-w.y2)**2)<=thr)return'p2';
  const mx=(w.x1+w.x2)/2,my=(w.y1+w.y2)/2;
  if(Math.sqrt((wx-mx)**2+(wy-my)**2)<=14/zoom)return'move';
  return null;
}
function hitOpening(wx,wy){
  const f=fl();
  for(let i=f.openings.length-1;i>=0;i--){
    const o=f.openings[i];
    const dx=o.x2-o.x1,dy=o.y2-o.y1,len=Math.sqrt(dx*dx+dy*dy);
    if(len<1)continue;
    const t=((wx-o.x1)*dx+(wy-o.y1)*dy)/(len*len);
    if(t<0||t>1)continue;
    const px=o.x1+t*dx,py=o.y1+t*dy;
    if(Math.sqrt((wx-px)**2+(wy-py)**2)<=12/zoom)return i;
  }return -1;
}
function hitMpoint(wx,wy){
  const f=fl();
  for(let i=f.mpoints.length-1;i>=0;i--){
    const p=f.mpoints[i];if((wx-p.x)**2+(wy-p.y)**2<=12**2/zoom)return i;
  }return -1;
}

// ===================== MOUSE EVENTS =====================
intC.addEventListener('contextmenu',e=>e.preventDefault());

intC.addEventListener('mousedown',e=>{
  e.preventDefault();
  const[sx,sy]=[e.offsetX,e.offsetY];
  const[wx,wy]=toWorld(sx,sy);
  if(e.button===2){panning=true;panSX=sx;panSY=sy;panOX=panX;panOY=panY;intC.style.cursor='grabbing';return}

  const f=fl();
  if(tool==='measure'){
    const routers=f.devices.filter(d=>d.type==='router');
    let simSig=-999;
    routers.forEach(r=>{const s=computeSig(r,wx,wy,f.walls,f.openings);if(s>simSig)simSig=s});
    let calibrated=null;
    if(f.mpoints.length&&routers.length){
      const corrs=f.mpoints.map(p=>{let ms=-999;routers.forEach(r=>{const s=computeSig(r,p.x,p.y,f.walls,f.openings);if(s>ms)ms=s});return{x:p.x,y:p.y,delta:p.dbm-ms}});
      let wsum=0,vsum=0;
      corrs.forEach(corr=>{const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;let pen=0;f.walls.forEach(w=>{if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))pen+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db});const eDist=dist*Math.pow(10,pen/20);const wt=1/Math.pow(eDist,2);wsum+=wt;vsum+=wt*corr.delta});
      calibrated=simSig+(wsum>0?vsum/wsum:0);
    }
    const cm_x=Math.round(worldToCm(wx)),cm_y=Math.round(worldToCm(wy));
    showMeasurePopup(sx,sy,simSig,calibrated,cm_x,cm_y);
    return;
  }

  if(tool==='mpoint'){
    openMpointModal(wx,wy);
    return;
  }

  if(tool==='bgadj'){
    const f=fl();
    if(!f.bgImg) return;
    // Check if clicking a crop handle first
    const ch = hitCropHandle(sx,sy);
    if(ch!==null){ bgCropDragging=ch; bgCropStartX=sx; bgCropStartY=sy; return; }
    // Otherwise drag the image
    bgDragging=true; bgDragSX=sx; bgDragSY=sy;
    bgDragOX=f.bgOffX||0; bgDragOY=f.bgOffY||0;
    intC.style.cursor='grabbing';
    return;
  }

  if(tool==='wall'||tool==='door'||tool==='window'){
    drawing=true;startX=snapW(wx);startY=snapW(wy);curX=startX;curY=startY;return;
  }

  if(tool==='select'){
    const di=hitDevice(wx,wy);
    if(di>=0){selectEl('device',di);dragging=true;dragOffX=wx-f.devices[di].x;dragOffY=wy-f.devices[di].y;return}
    const mi=hitMpoint(wx,wy);if(mi>=0){selectEl('mpoint',mi);return}
    if(selectedType==='wall'&&selectedIdx>=0){
      const hm=hitWallHandle(wx,wy,selectedIdx);
      if(hm){dragWallMode=hm;dragWallIdx=selectedIdx;return}
    }
    const oi=hitOpening(wx,wy);if(oi>=0){selectEl('opening',oi);return}
    const wi=hitWall(wx,wy);if(wi>=0){selectEl('wall',wi);return}
    selectEl(null,-1);return;
  }

  if(tool==='erase'){
    const di=hitDevice(wx,wy);if(di>=0){f.devices.splice(di,1);drawDevices();selectEl(null,-1);if(heatmapMode!=='off')calcHeatmap();return}
    const mi=hitMpoint(wx,wy);if(mi>=0){f.mpoints.splice(mi,1);drawMpoints();selectEl(null,-1);if(heatmapMode==='real')calcHeatmap();updateMpointsList();return}
    const oi=hitOpening(wx,wy);if(oi>=0){f.openings.splice(oi,1);drawWalls();selectEl(null,-1);return}
    const wi=hitWall(wx,wy);if(wi>=0){f.walls.splice(wi,1);drawWalls();selectEl(null,-1);}
  }
});

intC.addEventListener('mousemove',e=>{
  const[sx,sy]=[e.offsetX,e.offsetY];
  const[wx,wy]=toWorld(sx,sy);
  const cm_x=Math.round(worldToCm(wx)),cm_y=Math.round(worldToCm(wy));
  document.getElementById('hud').textContent=`📍 ${cm_x}cm, ${cm_y}cm`;
  if(panning){panX=panOX+(sx-panSX);panY=panOY+(sy-panSY);redrawAll();return}

  // BG image drag
  if(bgDragging&&tool==='bgadj'){
    const f=fl();
    f.bgOffX = bgDragOX + (sx-bgDragSX)/zoom;
    f.bgOffY = bgDragOY + (sy-bgDragSY)/zoom;
    syncBgOffsetInputs();
    drawBgImg(); return;
  }

  // BG crop handle drag
  if(bgCropDragging!==null&&tool==='bgadj'){
    const f=fl();
    const img=bgImgCache[currentFloor];
    if(!img) return;
    const scale=(f.bgScale||1);
    const iw=img.naturalWidth*scale, ih=img.naturalHeight*scale;
    const dx=(sx-bgCropStartX)/zoom, dy=(sy-bgCropStartY)/zoom;
    const c=f.bgCrop||{l:0,t:0,r:0,b:0};
    // l,t,r,b are pixels to crop from each side (in image pixel space)
    const pxPerWorld = 1/scale;
    if(bgCropDragging==='l'){c.l=Math.max(0,Math.min((c.l||0)+dx*pxPerWorld, iw/scale-10))}
    if(bgCropDragging==='r'){c.r=Math.max(0,Math.min((c.r||0)-dx*pxPerWorld, iw/scale-10))}
    if(bgCropDragging==='t'){c.t=Math.max(0,Math.min((c.t||0)+dy*pxPerWorld, ih/scale-10))}
    if(bgCropDragging==='b'){c.b=Math.max(0,Math.min((c.b||0)-dy*pxPerWorld, ih/scale-10))}
    f.bgCrop=c; bgCropStartX=sx; bgCropStartY=sy;
    drawBgImg(); return;
  }

  // cursor hint for crop handles
  if(tool==='bgadj'){
    const ch=hitCropHandle(sx,sy);
    if(ch==='l'||ch==='r') intC.style.cursor='ew-resize';
    else if(ch==='t'||ch==='b') intC.style.cursor='ns-resize';
    else intC.style.cursor='grab';
  }

  if(dragWallMode&&dragWallIdx>=0){
    const w=fl().walls[dragWallIdx];
    const snx=snapW(wx),sny=snapW(wy);
    if(dragWallMode==='p1'){w.x1=snx;w.y1=sny}
    else if(dragWallMode==='p2'){w.x2=snx;w.y2=sny}
    else{const dx=snx-snapW((w.x1+w.x2)/2),dy=sny-snapW((w.y1+w.y2)/2);w.x1+=dx;w.y1+=dy;w.x2+=dx;w.y2+=dy}
    updateWallLen(w);drawWalls();if(heatmapMode!=='off')calcHeatmap();return;
  }
  if(drawing){curX=snapW(wx);curY=snapW(wy);drawUI();return}
  if(dragging&&selectedType==='device'&&selectedIdx>=0){
    fl().devices[selectedIdx].x=snapW(wx-dragOffX);fl().devices[selectedIdx].y=snapW(wy-dragOffY);
    drawDevices();if(heatmapMode!=='off')calcHeatmap();
  }
});

intC.addEventListener('mouseup',e=>{
  if(bgDragging){bgDragging=false;intC.style.cursor='grab';return}
  if(bgCropDragging!==null){bgCropDragging=null;return}
  if(panning){panning=false;const cur={wall:'crosshair',door:'crosshair',window:'crosshair',select:'default',erase:'not-allowed',measure:'cell',mpoint:'crosshair',bgadj:'grab'};intC.style.cursor=cur[tool]||'crosshair';return}
  if(dragWallMode){dragWallMode=null;dragWallIdx=-1;return}
  dragging=false;
  if(drawing){
    const[wx,wy]=toWorld(e.offsetX,e.offsetY);
    const ex=snapW(wx),ey=snapW(wy);
    if(Math.sqrt((ex-startX)**2+(ey-startY)**2)>GRID*0.5){
      const f=fl();
      if(tool==='wall')f.walls.push({x1:startX,y1:startY,x2:ex,y2:ey,type:wallType});
      else f.openings.push({x1:startX,y1:startY,x2:ex,y2:ey,type:tool});
      drawWalls();if(heatmapMode!=='off')calcHeatmap();
    }
    drawing=false;ctxUi.clearRect(0,0,W,H);
  }
});

intC.addEventListener('wheel',e=>{
  e.preventDefault();
  const f=e.deltaY<0?1.12:1/1.12;
  const[mx,my]=[e.offsetX,e.offsetY];
  panX=mx-(mx-panX)*f;panY=my-(my-panY)*f;
  zoom=Math.min(Math.max(zoom*f,0.1),10);
  redrawAll();document.getElementById('zoom-info').textContent=`Zoom: ${Math.round(zoom*100)}% | Grid: ${gridCm}cm`;
},{passive:false});

document.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;
  if(e.key==='Delete'||e.key==='Backspace'){
    const f=fl();
    if(selectedType==='device'&&selectedIdx>=0){f.devices.splice(selectedIdx,1);drawDevices();if(heatmapMode!=='off')calcHeatmap();}
    else if(selectedType==='wall'&&selectedIdx>=0){f.walls.splice(selectedIdx,1);drawWalls();}
    else if(selectedType==='opening'&&selectedIdx>=0){f.openings.splice(selectedIdx,1);drawWalls();}
    else if(selectedType==='mpoint'&&selectedIdx>=0){f.mpoints.splice(selectedIdx,1);drawMpoints();updateMpointsList();if(heatmapMode==='real')calcHeatmap();}
    selectEl(null,-1);
  }
});

// ===================== MEASURE POPUP =====================
let measurePopup=null;
function showMeasurePopup(sx,sy,simDbm,calibDbm,cmx,cmy){
  if(measurePopup)measurePopup.remove();
  const displayDbm = calibDbm!==null ? calibDbm : simDbm;
  const col=dbmToColor(displayDbm);
  const quality=displayDbm>-55?'Excelente':displayDbm>-65?'Muito bom':displayDbm>-72?'Bom':displayDbm>-80?'Fraco':displayDbm>-90?'Muito fraco':'Sem sinal';
  const div=document.createElement('div');
  div.style.cssText=`position:absolute;left:${sx+14}px;top:${sy-12}px;background:rgba(15,17,23,.96);border:1px solid ${col};border-radius:8px;padding:9px 13px;font-size:12px;color:#e2e8f0;z-index:20;pointer-events:none;min-width:160px`;
  div.innerHTML=`
    <div style="color:${col};font-weight:700;font-size:15px;margin-bottom:4px">${displayDbm.toFixed(1)} dBm</div>
    <div style="color:#64748b;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">${quality}</div>
    ${calibDbm!==null
      ? `<div style="color:#94a3b8;font-size:11px">📶 Simulado: ${simDbm.toFixed(1)} dBm</div>
         <div style="color:#10b981;font-size:11px">🎯 Calibrado: ${calibDbm.toFixed(1)} dBm</div>
         <div style="color:#64748b;font-size:10px">Δ ${(calibDbm-simDbm)>0?'+':''}${(calibDbm-simDbm).toFixed(1)} dB correção</div>`
      : `<div style="color:#94a3b8;font-size:11px">📶 Simulado (sem pontos reais)</div>`
    }
    <div style="color:#475569;font-size:10px;margin-top:4px">📍 ${cmx}cm, ${cmy}cm</div>`;
  wrap.appendChild(div); measurePopup=div;
  setTimeout(()=>{div.remove();if(measurePopup===div)measurePopup=null},4000);
}

// ===================== MPOINT MODAL =====================
function openMpointModal(wx,wy){
  const pendX=wx, pendY=wy;
  openModal(`
    <h3>📌 Ponto de Medição Real</h3>
    <p class="hint" style="margin-bottom:12px">Informe o valor de dBm medido neste local com um celular/app (ex: WiFi Analyzer).</p>
    <div class="modal-row"><label>dBm medido</label><input type="number" id="mp-new-dbm" min="-100" max="0" value="-65"></div>
    <div class="modal-row"><label>SSID / AP</label><input type="text" id="mp-new-label" placeholder="ex: Rede_CIMAU"></div>
    <div class="modal-btns">
      <button class="mbtn" onclick="closeModal()">Cancelar</button>
      <button class="mbtn primary" onclick="confirmAddMpoint(${pendX},${pendY})">Adicionar</button>
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
  document.getElementById('modal-overlay').style.display='flex';
}
function closeModal(){document.getElementById('modal-overlay').style.display='none'}
function closeModalOverlay(e){if(e.target===document.getElementById('modal-overlay'))closeModal()}

function openCustomWallModal(){
  const cw=wallTypeDefs.custom;
  openModal(`
    <h3>✏ Parede Personalizada</h3>
    <div class="modal-row"><label>Nome</label><input type="text" id="cw-name" value="${cw.label}"></div>
    <div class="modal-row"><label>Cor</label><input type="color" id="cw-color" value="${cw.color}"></div>
    <div class="modal-row"><label>Espessura px</label><input type="range" id="cw-w" min="1" max="14" value="${cw.w}"> <span id="cw-wv">${cw.w}</span></div>
    <div class="modal-row"><label>Atenuação dB</label><input type="number" id="cw-db" min="0" max="40" value="${cw.db}" style="width:175px"></div>
    <div class="modal-btns"><button class="mbtn" onclick="closeModal()">Cancelar</button><button class="mbtn primary" onclick="saveCustomWall()">Salvar</button></div>
  `);
  document.getElementById('cw-w').oninput=function(){document.getElementById('cw-wv').textContent=this.value};
}
function saveCustomWall(){
  wallTypeDefs.custom={color:document.getElementById('cw-color').value,w:+document.getElementById('cw-w').value,db:+document.getElementById('cw-db').value,label:document.getElementById('cw-name').value||'Personalizada'};
  document.getElementById('leg-custom').style.background=wallTypeDefs.custom.color;
  document.getElementById('leg-custom-label').textContent=wallTypeDefs.custom.label+` −${wallTypeDefs.custom.db}dB`;
  closeModal();drawWalls();if(heatmapMode!=='off')calcHeatmap();
}

function openAddDeviceModal(mode){
  if(mode==='router'){
    openModal(`
      <h3>📡 Adicionar Roteador / AP</h3>
      <div class="modal-row"><label>Nome</label><input type="text" id="nd-name" value="AP 1"></div>
      <div class="modal-row"><label>Modelo</label>
        <select id="nd-model">
          <option value="custom">Personalizado</option>
          <option value="unifi_ac_lite">Unifi AC Lite</option>
          <option value="unifi_ac_pro">Unifi AC Pro</option>
          <option value="unifi_u6">Unifi U6 LR</option>
          <option value="tplink_dir815">TP-Link DIR-815</option>
          <option value="tplink_archer">TP-Link Archer C6</option>
          <option value="intelbras_ap">Intelbras AP 300</option>
          <option value="cisco_ap">Cisco Aironet</option>
        </select>
      </div>
      <div class="modal-row"><label>Frequência</label>
        <select id="nd-freq" onchange="populateChannelSel('nd-channel',this.value)">
          <option value="2.4">2.4 GHz</option><option value="5">5 GHz</option><option value="dual">Dual Band</option>
        </select>
      </div>
      <div class="modal-row"><label>Canal</label><select id="nd-channel"><option value="0">Auto</option></select></div>
      <div class="modal-row"><label>Potência TX</label>
        <select id="nd-txlevel"><option value="low">Baixa ~14dBm</option><option value="medium" selected>Média ~20dBm</option><option value="high">Alta ~23dBm</option></select>
      </div>
      <div class="modal-row"><label>Imagem URL</label><input type="text" id="nd-img" placeholder="https://... ou vazio"></div>
      <div class="modal-btns"><button class="mbtn" onclick="closeModal()">Cancelar</button><button class="mbtn primary" onclick="confirmAddRouter()">Adicionar</button></div>
    `);
    populateChannelSel('nd-channel','2.4');
  } else {
    openModal(`
      <h3>➕ Adicionar Dispositivo</h3>
      <div class="modal-row"><label>Tipo</label>
        <select id="nd-dtype" onchange="this.value==='custom'?document.getElementById('nd-custom-row').style.display='block':document.getElementById('nd-custom-row').style.display='none'">
          <option value="pc">PC</option><option value="notebook">Notebook</option><option value="printer">Impressora</option><option value="switch">Switch</option><option value="custom">Personalizado</option>
        </select>
      </div>
      <div id="nd-custom-row" style="display:none">
        <div class="modal-row"><label>Nome tipo</label><input type="text" id="nd-typelabel" placeholder="ex: Câmera IP"></div>
        <div class="modal-row"><label>Emoji/ícone</label><input type="text" id="nd-icon" placeholder="📷" style="width:50px"></div>
      </div>
      <div class="modal-row"><label>Nome</label><input type="text" id="nd-dname" value="Dispositivo"></div>
      <div class="modal-row"><label>IP</label><input type="text" id="nd-dip" placeholder="192.168.1.x"></div>
      <div class="modal-row"><label>Imagem URL</label><input type="text" id="nd-dimg" placeholder="https://... ou vazio"></div>
      <div class="modal-btns"><button class="mbtn" onclick="closeModal()">Cancelar</button><button class="mbtn primary" onclick="confirmAddDevice()">Adicionar</button></div>
    `);
  }
}

function populateChannelSel(selId,freq){
  const sel=document.getElementById(selId);if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="0">Auto</option>';
  (freq==='5'?channels5:channels24).forEach(ch=>{const o=document.createElement('option');o.value=ch;o.textContent='Canal '+ch;sel.appendChild(o)});
  sel.value=cur||0;
}

function confirmAddRouter(){
  const model=document.getElementById('nd-model').value;
  const p=devicePresets[model]||{power:17,gain:2,freq:'2.4',sensitivity:-70};
  const txmap={low:14,medium:20,high:23};
  const txl=document.getElementById('nd-txlevel').value;
  const freq=document.getElementById('nd-freq').value;
  const[wx,wy]=toWorld(W/2+Math.random()*60-30,H/2+Math.random()*60-30);
  fl().devices.push({type:'router',x:snapW(wx),y:snapW(wy),name:document.getElementById('nd-name').value||'AP',model,freq,channel:+document.getElementById('nd-channel').value,power:txmap[txl]||p.power,gain:p.gain,sensitivity:p.sensitivity,txLevel:txl,sigColor:'#3b82f6',imgSrc:document.getElementById('nd-img').value.trim()||null});
  closeModal();setTool('select');selectEl('device',fl().devices.length-1);drawDevices();if(heatmapMode!=='off')calcHeatmap();
}

function confirmAddDevice(){
  const dtype=document.getElementById('nd-dtype').value;
  const[wx,wy]=toWorld(W/2+Math.random()*60-30,H/2+Math.random()*60-30);
  fl().devices.push({type:dtype==='custom'?'custom':dtype,typeLabel:dtype==='custom'?document.getElementById('nd-typelabel').value:dtype,icon:dtype==='custom'?document.getElementById('nd-icon').value:'',x:snapW(wx),y:snapW(wy),name:document.getElementById('nd-dname').value||dtype,ip:document.getElementById('nd-dip').value,imgSrc:document.getElementById('nd-dimg').value.trim()||null});
  closeModal();setTool('select');selectEl('device',fl().devices.length-1);drawDevices();
}

function openImageModal(){
  const f=fl();
  const d=selectedType==='device'&&selectedIdx>=0?f.devices[selectedIdx]:null;
  const cur=d?d.imgSrc||'':'';
  openModal(`
    <h3>🖼 Trocar Imagem</h3>
    <div class="modal-row"><label>URL</label><input type="text" id="img-url" value="${cur}" placeholder="https://..."></div>
    <div class="modal-row"><label>Upload</label><input type="file" id="img-file" accept="image/*" style="width:175px;font-size:11px" onchange="const fr=new FileReader();fr.onload=ev=>document.getElementById('img-url').value=ev.target.result;fr.readAsDataURL(this.files[0])"></div>
    <div class="modal-btns"><button class="mbtn danger" onclick="clearDeviceImg()">Remover</button><button class="mbtn" onclick="closeModal()">Cancelar</button><button class="mbtn primary" onclick="applyDeviceImg()">Aplicar</button></div>
  `);
}
function applyDeviceImg(){const f=fl();if(selectedType==='device'&&selectedIdx>=0){f.devices[selectedIdx].imgSrc=document.getElementById('img-url').value.trim()||null;drawDevices();}closeModal()}
function clearDeviceImg(){const f=fl();if(selectedType==='device'&&selectedIdx>=0){f.devices[selectedIdx].imgSrc=null;drawDevices();}closeModal()}

// ===================== EXPORT / IMPORT =====================
function exportProject(){
  const data={v:3,gridCm,wallTypeDefs,floors:floors.map(f=>({...f,bgImg:f.bgImg?'__EMBEDDED__':null,bgImgData:f.bgImg||null}))};
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');a.download='planta-rede-v3.json';a.href=URL.createObjectURL(blob);a.click();
}


function exportImg(){
  const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;
  const t=tmp.getContext('2d');
  t.drawImage(bgC,0,0);t.drawImage(bgImgC,0,0);
  if(heatmapMode!=='off')t.drawImage(hmC,0,0);
  t.drawImage(wallC,0,0);t.drawImage(devC,0,0);t.drawImage(mpC,0,0);
  const a=document.createElement('a');a.download='planta-rede.png';a.href=tmp.toDataURL('image/png');a.click();
}

function resetView(){panX=0;panY=0;zoom=1;redrawAll();document.getElementById('zoom-info').textContent=`Zoom: 100% | Grid: ${gridCm}cm`}
function clearAll(){
  if(!confirm('Limpar tudo no andar atual?'))return;
  const f=fl();f.walls=[];f.devices=[];f.openings=[];f.mpoints=[];f.bgImg=null;
  delete bgImgCache[currentFloor];
  selectedIdx=-1;selectedType=null;heatmapMode='off';
  ['hm-sim-btn','hm-real-btn','hm-int-btn'].forEach(id=>document.getElementById(id).classList.remove('active'));
  selectEl(null,-1);redrawAll();updateMpointsList();
}

// ===================== INIT =====================
window.addEventListener('resize',resize);
resize();
setTool('wall');

fetch('data.json')
  .then(r => r.json())
  .then(d => {
    if(d.wallTypeDefs) Object.assign(wallTypeDefs, d.wallTypeDefs);
    if(d.gridCm){ gridCm=d.gridCm; document.getElementById('grid-scale-sel').value=gridCm; }
    if(d.floors){
      floors=d.floors.map(f=>({...f,bgImg:f.bgImgData||null,mpoints:f.mpoints||[]}));
      Object.keys(bgImgCache).forEach(k=>delete bgImgCache[k]);
    }
    currentFloor=0;
    renderFloorTabs(); selectEl(null,-1); redrawAll(); updateMpointsList();
  })
  .catch(() => renderFloorTabs());


// ===================== SIDEBAR RESIZE + TOGGLE =====================
let sidebarOpen = false;

function toggleSidebar(){
  sidebarOpen = !sidebarOpen;
  const sb  = document.getElementById('sidebar');
  const btn = document.getElementById('sidebar-toggle');
  sb.classList.toggle('collapsed', !sidebarOpen);
  btn.textContent = sidebarOpen ? '◀' : '▶';
  btn.title = sidebarOpen ? 'Recolher painel' : 'Expandir painel';
  setTimeout(resize, 220);
}

(function initSidebarResize(){
  const resizer = document.getElementById('sidebar-resizer');
  if(!resizer) return;
  let isResizing=false, startX=0, startW=0;
  resizer.addEventListener('mousedown', e=>{
    if(!sidebarOpen) return;
    isResizing=true;
    startX=e.clientX;
    startW=document.getElementById('sidebar').getBoundingClientRect().width;
    document.body.style.cursor='col-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e=>{
    if(!isResizing) return;
    const newW = Math.min(Math.max(startW-(e.clientX-startX), 160), 520);
    document.getElementById('sidebar').style.width = newW+'px';
  });
  document.addEventListener('mouseup', ()=>{
    if(isResizing){ isResizing=false; document.body.style.cursor=''; resize(); }
  });
})();
