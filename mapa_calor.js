// ===================== HEATMAP =====================
// Globals usados aqui são definidos em main.js:
// ctxHm, W, H, toWorld, wallTypeDefs, fl, GRID, gridCm

let heatmapMode = 'off';

function setHeatmapMode(mode){
  heatmapMode = mode;
  ['hm-sim-btn','hm-real-btn','hm-int-btn'].forEach(id=>document.getElementById(id).classList.remove('active'));
  if(mode==='simulation') document.getElementById('hm-sim-btn').classList.add('active');
  if(mode==='real')       document.getElementById('hm-real-btn').classList.add('active');
  if(mode==='interference') document.getElementById('hm-int-btn').classList.add('active');
  calcHeatmap();
}

function calcHeatmap(){
  const c = ctxHm;
  if(heatmapMode==='off'){c.clearRect(0,0,W,H);return}
  const f = fl();
  const routers = f.devices.filter(d=>d.type==='router');

  if(heatmapMode==='real'){drawRealHeatmap(c,f);return}
  if(!routers.length){c.clearRect(0,0,W,H);return}

  const step = 6;
  const img = c.createImageData(W,H);

  for(let py=0;py<H;py+=step){
    for(let px=0;px<W;px+=step){
      const[wx,wy] = toWorld(px,py);
      let maxSig=-999, dominantR=null;
      routers.forEach(r=>{
        const sig = computeSig(r,wx,wy,f.walls,f.openings);
        if(sig>maxSig){maxSig=sig;dominantR=r}
      });

      let rr,g,b,a;
      if(heatmapMode==='interference'){
        let intCount=0;
        routers.forEach(r=>{
          if(r===dominantR) return;
          const s = computeSig(r,wx,wy,f.walls,f.openings);
          if(s>=-80&&dominantR&&chOverlap(r.channel||0,dominantR.channel||0,r.freq||'2.4'))intCount++;
        });
        if(maxSig<-90)       {rr=15; g=17;  b=23;  a=30}
        else if(intCount===0){rr=16; g=185; b=129; a=190}
        else if(intCount===1){rr=245;g=158; b=11;  a=200}
        else                 {rr=239;g=68;  b=68;  a=210}
      } else {
        [rr,g,b,a] = sigToRGBA(maxSig);
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

// Modelo log-distance indoor: PL(d) = FSPL(1m) + 10·n·log10(d)
// FSPL(1m) = 20·log10(fMHz) − 27.55
// n=3.0 para 2.4GHz | n=3.5 para 5GHz (valores típicos indoor)
function computeSig(r,wx,wy,walls,openings){
  const dx=wx-r.x, dy=wy-r.y;
  const distPx = Math.sqrt(dx*dx+dy*dy)||0.1;
  const distM  = Math.max(distPx/GRID*(gridCm/100), 0.05);
  const n    = r.freq==='5' ? 3.5 : 3.0;
  const fMHz = r.freq==='5' ? 5500 : 2412;
  const pl   = 20*Math.log10(fMHz) - 27.55 + 10*n*Math.log10(distM);
  let sig = (r.power||17) + (r.gain||2) - pl;
  walls.forEach(w=>{
    if(segInt(r.x,r.y,wx,wy,w.x1,w.y1,w.x2,w.y2))
      sig -= (wallTypeDefs[w.type]||wallTypeDefs.custom).db;
  });
  openings.forEach(o=>{
    if(segInt(r.x,r.y,wx,wy,o.x1,o.y1,o.x2,o.y2))
      sig += o.type==='door' ? 3 : 1;
  });
  return sig;
}

// Mapa real: simulação calibrada via IDW wall-aware nos pontos medidos
function drawRealHeatmap(c,f){
  const pts = f.mpoints;
  const routers = f.devices.filter(d=>d.type==='router');
  if(!pts.length){c.clearRect(0,0,W,H);return}

  const corrections = pts.map(p=>{
    if(!routers.length) return {x:p.x,y:p.y,delta:0,measured:p.dbm};
    let maxSim=-999;
    routers.forEach(r=>{const s=computeSig(r,p.x,p.y,f.walls,f.openings);if(s>maxSim)maxSim=s});
    return {x:p.x,y:p.y,delta:p.dbm-maxSim,measured:p.dbm};
  });

  const step=6, idwPow=2;
  const img=c.createImageData(W,H);

  for(let py=0;py<H;py+=step){
    for(let px=0;px<W;px+=step){
      const[wx,wy]=toWorld(px,py);

      let simSig=-999;
      if(routers.length)
        routers.forEach(r=>{const s=computeSig(r,wx,wy,f.walls,f.openings);if(s>simSig)simSig=s});

      let wsum=0,vsum=0;
      corrections.forEach(corr=>{
        const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;
        let wallPenalty=0;
        f.walls.forEach(w=>{
          if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))
            wallPenalty+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db;
        });
        const eDist  = dist*Math.pow(10,wallPenalty/20);
        const weight = 1/Math.pow(eDist,idwPow);
        wsum+=weight; vsum+=weight*corr.delta;
      });

      let finalDbm;
      if(routers.length){
        finalDbm = simSig+(wsum>0?vsum/wsum:0);
      } else {
        let ws2=0,vs2=0;
        corrections.forEach(corr=>{
          const dist=Math.sqrt((wx-corr.x)**2+(wy-corr.y)**2)||0.001;
          let wallPenalty=0;
          f.walls.forEach(w=>{
            if(segInt(corr.x,corr.y,wx,wy,w.x1,w.y1,w.x2,w.y2))
              wallPenalty+=(wallTypeDefs[w.type]||wallTypeDefs.custom).db;
          });
          const eDist=dist*Math.pow(10,wallPenalty/20);
          const wt=1/Math.pow(eDist,idwPow);
          ws2+=wt; vs2+=wt*corr.measured;
        });
        finalDbm=ws2>0?vs2/ws2:-90;
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
  if(sig>-55) return [16,185,129,200];
  if(sig>-65) return [132,204,22,190];
  if(sig>-72) return [245,158,11,185];
  if(sig>-80) return [249,115,22,175];
  if(sig>-90) return [239,68,68,160];
  return [15,17,23,30];
}

function dbmToColor(dbm){
  if(dbm>-55) return '#10b981';
  if(dbm>-65) return '#84cc16';
  if(dbm>-72) return '#f59e0b';
  if(dbm>-80) return '#f97316';
  if(dbm>-90) return '#ef4444';
  return '#64748b';
}

// Interseção de segmentos (para detectar paredes no caminho do sinal)
function segInt(ax,ay,bx,by,cx,cy,dx,dy){
  const d1x=bx-ax,d1y=by-ay,d2x=dx-cx,d2y=dy-cy;
  const cross=d1x*d2y-d1y*d2x;
  if(Math.abs(cross)<1e-10)return false;
  const t=((cx-ax)*d2y-(cy-ay)*d2x)/cross;
  const u=((cx-ax)*d1y-(cy-ay)*d1x)/cross;
  return t>0&&t<1&&u>0&&u<1;
}

// Sobreposição de canais (para modo interferência)
function chOverlap(a,b,freq){
  if(a===0||b===0) return false;
  if(freq==='5') return a===b;
  return Math.abs(a-b)<5;
}
