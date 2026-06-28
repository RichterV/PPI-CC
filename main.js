// ===================== CONFIG =====================
const GRID = 24;
let gridCm = 20;

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
  renderFloorTabs();
  selectEl(null,-1);
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
const intC   = document.getElementById('interact-canvas');
const ctxBg    = bgC.getContext('2d');
const ctxBgImg = bgImgC.getContext('2d');
const ctxHm    = hmC.getContext('2d');
const ctxWall  = wallC.getContext('2d');
const ctxDev   = devC.getContext('2d');
const ctxMp    = mpC.getContext('2d');

let W=0, H=0;

function resize(){
  W=wrap.clientWidth; H=wrap.clientHeight;
  [bgC,bgImgC,hmC,wallC,devC,mpC,intC].forEach(c=>{c.width=W;c.height=H});
  redrawAll();
}

let panX=0, panY=0, zoom=1;
function toWorld(sx,sy){return[(sx-panX)/zoom,(sy-panY)/zoom]}
function toScreen(wx,wy){return[wx*zoom+panX,wy*zoom+panY]}
function worldToCm(w){ return (w/GRID)*gridCm; }

function redrawAll(){drawBg();drawBgImg();drawWalls();drawDevices();drawMpoints();calcHeatmap();}

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
      c.fillText(Math.round(worldToCm(wx))+'cm',x,2);
    }
    c.textAlign='right'; c.textBaseline='middle';
    for(let y=oy5-gs5;y<H+gs5;y+=gs5){
      const wy=(y-panY)/zoom;
      c.fillText(Math.round(worldToCm(wy))+'cm',W-3,y);
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
  fl().devices.forEach(d=>{
    const[sx,sy]=toScreen(d.x,d.y);
    const sz=26*Math.max(zoom,0.4);
    const drawIcon=()=>{
      c.font=`${sz*0.9}px serif`;c.textAlign='center';c.textBaseline='middle';
      c.fillText(d.icon||fallbackIcons[d.type]||'❓',sx,sy);
    };
    if(d.imgSrc){
      getImg(d.imgSrc,img=>{
        if(!img){drawIcon();drawDeviceLbl(c,d,sx,sy,sz);return}
        c.drawImage(img,sx-sz/2,sy-sz/2,sz,sz);
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

// ===================== TOOLS =====================
let tool='measure';
let selectedIdx=-1, selectedType=null;
let panning=false, panSX=0, panSY=0, panOX=0, panOY=0;

function setTool(t){
  tool=t;
  document.querySelectorAll('.tbtn[id^=btn-]').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById('btn-'+t);if(el)el.classList.add('active');
  intC.style.cursor=t==='measure'?'cell':'crosshair';
  const msgs={
    measure:'📍 Medir: clique em qualquer ponto para ver o dBm simulado',
    mpoint:'📌 Ponto Real: clique no local e informe o dBm medido in-loco',
  };
  document.getElementById('status').textContent=msgs[t]||'';
}

// ===================== SELECTION =====================
function selectEl(type,idx){
  selectedType=type; selectedIdx=idx;
  document.getElementById('no-sel').style.display='none';
  document.getElementById('mpoint-props').style.display='none';
  if(type==='mpoint'){
    const p=fl().mpoints[idx];
    document.getElementById('mpoint-props').style.display='block';
    document.getElementById('mp-dbm').value=p.dbm;
    document.getElementById('mp-label').value=p.label||'';
  } else {
    document.getElementById('no-sel').style.display='block';
  }
  drawMpoints();
}

function upMpointProp(prop,val){
  if(selectedType==='mpoint'&&selectedIdx>=0){
    fl().mpoints[selectedIdx][prop]=val;
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
      <div style="width:10px;height:10px;border-radius:50%;background:${dbmToColor(p.dbm)};flex-shrink:0"></div>
      <span style="font-size:11px;color:var(--text)">${p.label||'Ponto '+(i+1)}</span>
      <span style="font-size:11px;color:var(--text3);margin-left:auto">${p.dbm} dBm</span>
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
    showMeasurePopup(sx,sy,simSig,calibrated,Math.round(worldToCm(wx)),Math.round(worldToCm(wy)));
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
  document.getElementById('hud').textContent=`📍 ${Math.round(worldToCm(wx))}cm, ${Math.round(worldToCm(wy))}cm`;
  if(panning){panX=panOX+(sx-panSX);panY=panOY+(sy-panSY);redrawAll();}
});

intC.addEventListener('mouseup',()=>{
  if(panning){panning=false;intC.style.cursor=tool==='measure'?'cell':'crosshair';}
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
  if((e.key==='Delete'||e.key==='Backspace')&&selectedType==='mpoint'&&selectedIdx>=0){
    fl().mpoints.splice(selectedIdx,1);
    drawMpoints();updateMpointsList();if(heatmapMode==='real')calcHeatmap();
    selectEl(null,-1);
  }
});

// ===================== MEASURE POPUP =====================
let measurePopup=null;
function showMeasurePopup(sx,sy,simDbm,calibDbm,cmx,cmy){
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
    <div style="color:#475569;font-size:10px;margin-top:4px">📍 ${cmx}cm, ${cmy}cm</div>`;
  wrap.appendChild(div);measurePopup=div;
  setTimeout(()=>{div.remove();if(measurePopup===div)measurePopup=null},4000);
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
  document.getElementById('modal-overlay').style.display='flex';
}
function closeModal(){document.getElementById('modal-overlay').style.display='none';}
function closeModalOverlay(e){if(e.target===document.getElementById('modal-overlay'))closeModal();}

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
  document.getElementById('zoom-info').textContent=`Zoom: ${Math.round(zoom*100)}% | Grid: ${gridCm}cm`;
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
