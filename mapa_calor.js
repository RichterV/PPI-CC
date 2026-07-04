// ===================== HEATMAP =====================
// Globals de main.js: ctxHm, W, H, toWorld, wallTypeDefs, fl, GRID, gridCm

let heatmapMode = 'off';

const FORMULAS = {
  simulation: {
    math: 'PL(d) = 20·log₁₀(f) − 27.55 + 10·n·log₁₀(d)',
    tooltip: `
      <b>Modelo Log-Distance Indoor</b>
      <div class="ft-row"><span class="ft-var">PL(d)</span><span>perda de percurso total (dB)</span></div>
      <div class="ft-row"><span class="ft-var">f</span><span>frequência: 2412 MHz (2.4 GHz) · 5500 MHz (5 GHz)</span></div>
      <div class="ft-row"><span class="ft-var">d</span><span>distância AP → ponto (metros)</span></div>
      <div class="ft-row"><span class="ft-var">n</span><span>expoente indoor: 3.0 (2.4 GHz) · 3.5 (5 GHz)</span></div>
      <div class="ft-row"><span class="ft-var">−27.55</span><span>constante FSPL normalizada a 1 m</span></div>
      <div style="margin-top:8px;color:var(--text3)">Paredes atenuam o sinal no caminho AP→ponto:<br>Drywall −3 dB · Alvenaria −10 dB · Concreto −20 dB · Vidro −2 dB</div>
    `
  },
  real: {
    math: 'S(p) = Sₛᵢₘ(p) + IDW(Δ, p)',
    tooltip: `
      <b>Simulação Calibrada com IDW</b>
      <div class="ft-row"><span class="ft-var">Sₛᵢₘ(p)</span><span>sinal simulado pelo modelo log-distance no ponto p</span></div>
      <div class="ft-row"><span class="ft-var">Δᵢ</span><span>erro da âncora i: dBm_medidoᵢ − Sₛᵢₘ(pᵢ)</span></div>
      <div class="ft-row"><span class="ft-var">IDW</span><span>média de Δ ponderada por distância inversa (p=2)</span></div>
      <div style="margin-top:8px;color:var(--text3)">A física das paredes vem da simulação. O IDW ajusta o viés global com base nos pontos medidos in-loco.</div>
    `
  }
};

function setHeatmapMode(mode){
  heatmapMode = mode;
  ['hm-sim-btn','hm-real-btn'].forEach(id=>document.getElementById(id).classList.remove('active'));
  if(mode==='simulation') document.getElementById('hm-sim-btn').classList.add('active');
  if(mode==='real')       document.getElementById('hm-real-btn').classList.add('active');

  const wrap = document.getElementById('formula-wrap');
  const formula = FORMULAS[mode];
  if(formula){
    document.getElementById('formula-math').textContent = formula.math;
    document.getElementById('formula-tooltip').innerHTML = formula.tooltip;
    wrap.style.display = 'flex';
  } else {
    wrap.style.display = 'none';
  }

  if(tool === 'measure')
    document.getElementById('status').textContent = measureStatusMsg();

  calcHeatmap();
}

// ---- Renderiza em canvas reduzido e escala com suavização bilinear ----
const HMAP_SCALE = 10;

// Amostra pixelFn em coords mundo → retorna canvas offscreen (zoom-independent)
function renderHeatmap(pixelFn, wx1, wy1, ww, wh){
  const sw = Math.max(1, Math.ceil(ww / HMAP_SCALE));
  const sh = Math.max(1, Math.ceil(wh / HMAP_SCALE));

  const tmp = document.createElement('canvas');
  tmp.width = sw; tmp.height = sh;
  const tctx = tmp.getContext('2d');
  const img  = tctx.createImageData(sw, sh);

  for(let py = 0; py < sh; py++){
    for(let px = 0; px < sw; px++){
      const wx = wx1 + (px + 0.5) * ww / sw;
      const wy = wy1 + (py + 0.5) * wh / sh;
      const [r, g, b, a] = pixelFn(wx, wy);
      const idx = (py * sw + px) * 4;
      img.data[idx]=r; img.data[idx+1]=g; img.data[idx+2]=b; img.data[idx+3]=a;
    }
  }
  tctx.putImageData(img, 0, 0);

  // Amplia com suavização bilinear para o tamanho em world-units
  const out = document.createElement('canvas');
  out.width = sw * HMAP_SCALE; out.height = sh * HMAP_SCALE;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(tmp, 0, 0, out.width, out.height);
  return out;
}

// Cache do heatmap em coords mundo — só refeito quando os dados mudam
let hmapCache = null; // { canvas, wx1, wy1, ww, wh }

// Redesenha do cache para a tela — barato, chamado no zoom/pan
function drawHeatmapLayer(){
  ctxHm.clearRect(0, 0, W, H);
  if(!hmapCache) return;
  const { canvas, wx1, wy1, ww, wh } = hmapCache;
  const [sx, sy] = toScreen(wx1, wy1);
  ctxHm.save();
  // Clip ao perímetro externo para não vazar fora das paredes
  ctxHm.beginPath();
  ctxHm.rect(sx, sy, ww * zoom, wh * zoom);
  ctxHm.clip();
  ctxHm.imageSmoothingEnabled = true;
  ctxHm.imageSmoothingQuality = 'high';
  ctxHm.drawImage(canvas, sx, sy, ww * zoom, wh * zoom);
  ctxHm.restore();
}

function freqRouters(f){
  return f.devices.filter(d=>d.type==='router'&&(!d.freq||d.freq==='dual'||d.freq===selectedFreq));
}

// Bounding box das paredes externas (sem margem) → [x1,y1,x2,y2] em coords mundo
function computeBounds(f){
  let x1=Infinity, y1=Infinity, x2=-Infinity, y2=-Infinity;
  f.walls.forEach(w=>{
    x1=Math.min(x1,w.x1,w.x2); y1=Math.min(y1,w.y1,w.y2);
    x2=Math.max(x2,w.x1,w.x2); y2=Math.max(y2,w.y1,w.y2);
  });
  if(x1===Infinity) return null;
  return [x1, y1, x2, y2];
}

// ---- Cálculo principal (apenas quando dados mudam — não no zoom/pan) ----
function calcHeatmap(){
  hmapCache = null;
  if(heatmapMode === 'off'){ ctxHm.clearRect(0, 0, W, H); return; }

  const f       = fl();
  const routers = freqRouters(f);

  if(heatmapMode === 'real'){ drawRealHeatmap(f); return; }
  if(!routers.length){ ctxHm.clearRect(0, 0, W, H); return; }

  const b = computeBounds(f);
  if(!b){ ctxHm.clearRect(0, 0, W, H); return; }
  const [bx1, by1, bx2, by2] = b;
  const ww = bx2 - bx1, wh = by2 - by1;

  const cv = renderHeatmap((wx, wy) => {
    let maxSig = -999, dominantR = null;
    routers.forEach(r => {
      const sig = computeSig(r, wx, wy, f.walls, f.openings);
      if(sig > maxSig){ maxSig = sig; dominantR = r; }
    });

    return sigToRGBA(maxSig);
  }, bx1, by1, ww, wh);

  hmapCache = { canvas: cv, wx1: bx1, wy1: by1, ww, wh };
  drawHeatmapLayer();
}

// ---- Modelo Log-Distance Indoor (ITU-R P.1238) ----
// PL(d) = 20·log10(f) − 27.55 + 10·n·log10(d)
function computeSig(r, wx, wy, walls, openings){
  const dx = wx - r.x, dy = wy - r.y;
  const distM = Math.max(Math.sqrt(dx*dx + dy*dy) / GRID * (gridCm / 100), 0.05);
  const band  = r.freq==='dual' ? selectedFreq : (r.freq||'2.4');
  const n     = band === '5' ? 3.5 : 3.0;
  const fMHz  = band === '5' ? 5500 : 2412;
  const pl    = 20 * Math.log10(fMHz) - 27.55 + 10 * n * Math.log10(distM);
  // 5 GHz absorvido ~1,5× mais por paredes (ITU-R P.2040, IEEE 802.11ax study)
  const wallFactor = band === '5' ? 1.5 : 1.0;
  let sig     = (r.power || 17) + (r.gain || 2) - pl;
  walls.forEach(w => {
    if(segInt(r.x, r.y, wx, wy, w.x1, w.y1, w.x2, w.y2))
      sig -= (wallTypeDefs[w.type] || wallTypeDefs.custom).db * wallFactor;
  });
  openings.forEach(o => {
    if(segInt(r.x, r.y, wx, wy, o.x1, o.y1, o.x2, o.y2))
      sig += o.type === 'door' ? 3 : 1;
  });
  return sig;
}

// ---- Mapa Real: simulação + correção IDW por distância ----
function drawRealHeatmap(f){
  const pts     = f.mpoints;
  const routers = freqRouters(f);
  if(!pts.length){ ctxHm.clearRect(0, 0, W, H); return; }

  const corrections = pts.map(p => {
    const measured = activeDbm(p);
    if(!routers.length) return { x:p.x, y:p.y, delta:0, measured };
    let maxSim = -999;
    routers.forEach(r => {
      const s = computeSig(r, p.x, p.y, f.walls, f.openings);
      if(s > maxSim) maxSim = s;
    });
    return { x:p.x, y:p.y, delta:measured - maxSim, measured };
  });

  const idwPow = 2;
  const b = computeBounds(f);
  if(!b){ ctxHm.clearRect(0, 0, W, H); return; }
  const [bx1, by1, bx2, by2] = b;
  const ww = bx2 - bx1, wh = by2 - by1;

  const cv = renderHeatmap((wx, wy) => {
    let simSig = -999;
    if(routers.length)
      routers.forEach(r => {
        const s = computeSig(r, wx, wy, f.walls, f.openings);
        if(s > simSig) simSig = s;
      });

    let wsum = 0, vsum = 0;
    corrections.forEach(corr => {
      const dist = Math.sqrt((wx - corr.x) ** 2 + (wy - corr.y) ** 2) || 0.001;
      const w    = 1 / Math.pow(dist, idwPow);
      wsum += w; vsum += w * corr.delta;
    });

    let finalDbm;
    if(routers.length){
      finalDbm = simSig + (wsum > 0 ? vsum / wsum : 0);
    } else {
      let ws2 = 0, vs2 = 0;
      corrections.forEach(corr => {
        const dist = Math.sqrt((wx - corr.x) ** 2 + (wy - corr.y) ** 2) || 0.001;
        const w    = 1 / Math.pow(dist, idwPow);
        ws2 += w; vs2 += w * corr.measured;
      });
      finalDbm = ws2 > 0 ? vs2 / ws2 : -90;
    }

    return sigToRGBA(finalDbm);
  }, bx1, by1, ww, wh);

  hmapCache = { canvas: cv, wx1: bx1, wy1: by1, ww, wh };
  drawHeatmapLayer();
}

// ---- Helpers ----
function sigToRGBA(sig){
  if(sig > -55) return [16,  185, 129, 200];
  if(sig > -65) return [132, 204, 22,  190];
  if(sig > -72) return [245, 158, 11,  185];
  if(sig > -80) return [249, 115, 22,  175];
  if(sig > -90) return [239, 68,  68,  160];
  return               [15,  17,  23,  30];
}

function dbmToColor(dbm){
  if(dbm > -55) return '#10b981';
  if(dbm > -65) return '#84cc16';
  if(dbm > -72) return '#f59e0b';
  if(dbm > -80) return '#f97316';
  if(dbm > -90) return '#ef4444';
  return '#64748b';
}

function segInt(ax, ay, bx, by, cx, cy, dx, dy){
  const d1x = bx-ax, d1y = by-ay, d2x = dx-cx, d2y = dy-cy;
  const cross = d1x*d2y - d1y*d2x;
  if(Math.abs(cross) < 1e-10) return false;
  const t = ((cx-ax)*d2y - (cy-ay)*d2x) / cross;
  const u = ((cx-ax)*d1y - (cy-ay)*d1x) / cross;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

