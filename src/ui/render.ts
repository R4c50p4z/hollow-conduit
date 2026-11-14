import { DX, DY, type Building, type SimState } from '../sim';
import { CAUTERIZER_RADIUS, PRESSURE_SAFE, WARD_RADIUS } from '../sim/config';
import type { Overlay } from '../game/store';
import { P, RES_COLOR } from './palette';

export interface Layout {
  T: number; // tile px (CSS)
  ox: number;
  oy: number;
  w: number;
  h: number;
}

export function computeLayout(cssW: number, cssH: number, s: SimState): Layout {
  const T = Math.floor(Math.min(cssW / s.w, cssH / s.h));
  return { T, ox: Math.floor((cssW - T * s.w) / 2), oy: Math.floor((cssH - T * s.h) / 2), w: cssW, h: cssH };
}

/** Deterministic per-tile hash for texture variation. */
const hash = (x: number, y: number, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// --- Background (cached) -----------------------------------------------------------------

let bgCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function background(s: SimState, L: Layout, dpr: number): HTMLCanvasElement {
  const key = `${s.seed}:${L.T}:${dpr}:${s.tiles.map((t) => t.terrain[0]).join('')}`;
  if (bgCache?.key === key) return bgCache.canvas;
  const c = document.createElement('canvas');
  c.width = L.T * s.w * dpr;
  c.height = L.T * s.h * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const T = L.T;
  g.fillStyle = P.rock;
  g.fillRect(0, 0, T * s.w, T * s.h);

  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const px = x * T, py = y * T;
      // Stone slab with uneven ink edge.
      g.fillStyle = hash(x, y) > 0.5 ? P.rockHi : '#1a1510';
      g.beginPath();
      const j = (k: number) => (hash(x, y, k) - 0.5) * T * 0.08;
      g.moveTo(px + 2 + j(1), py + 2 + j(2));
      g.lineTo(px + T - 2 + j(3), py + 2 + j(4));
      g.lineTo(px + T - 2 + j(5), py + T - 2 + j(6));
      g.lineTo(px + 2 + j(7), py + T - 2 + j(8));
      g.closePath();
      g.fill();
      // Cross-hatching
      g.strokeStyle = P.hatch;
      g.lineWidth = 1;
      const n = 3 + Math.floor(hash(x, y, 9) * 4);
      for (let k = 0; k < n; k++) {
        const a = px + hash(x, y, 10 + k) * T, b = py + hash(x, y, 20 + k) * T;
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(a + T * 0.18, b - T * 0.18);
        g.stroke();
      }
      const t = s.tiles[y * s.w + x];
      const cx = px + T / 2, cy = py + T / 2;
      if (t.terrain === 'vein') {
        g.strokeStyle = P.ichor;
        g.globalAlpha = 0.35 + 0.35 * t.richness / 1.5;
        g.lineWidth = Math.max(1.5, T * 0.05);
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(cx, cy);
          let qx = cx, qy = cy;
          for (let seg = 0; seg < 3; seg++) {
            qx += (hash(x, y, 30 + k * 5 + seg) - 0.5) * T * 0.5;
            qy += (hash(x, y, 50 + k * 5 + seg) - 0.5) * T * 0.5;
            g.lineTo(qx, qy);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = P.ichor;
        g.beginPath();
        g.arc(cx, cy, T * 0.08, 0, Math.PI * 2);
        g.fill();
      } else if (t.terrain === 'sporebed') {
        for (let k = 0; k < 9; k++) {
          g.fillStyle = k % 3 ? 'rgba(217,164,65,0.35)' : 'rgba(217,164,65,0.7)';
          g.beginPath();
          g.arc(px + T * (0.15 + 0.7 * hash(x, y, 70 + k)), py + T * (0.15 + 0.7 * hash(x, y, 90 + k)), T * (0.03 + 0.04 * hash(x, y, 110 + k)), 0, Math.PI * 2);
          g.fill();
        }
      } else if (t.terrain === 'burrow') {
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, T * 0.45);
        grd.addColorStop(0, '#000');
        grd.addColorStop(0.6, '#050304');
        grd.addColorStop(1, 'rgba(60,10,15,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(cx, cy, T * 0.42, T * 0.34, hash(x, y) * 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(193,31,53,0.35)';
        g.lineWidth = 1;
        g.stroke();
      }
    }
  }
  bgCache = { key, canvas: c };
  return c;
}

// --- Buildings ---------------------------------------------------------------------------

const domRes = (b: Building) => {
  let best = -1, v = 0;
  for (let r = 0; r < 4; r++) {
    const a = b.store[r] + b.out[r];
    if (a > v) { v = a; best = r; }
  }
  return best;
};

function tube(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, T: number) {
  g.strokeStyle = '#3a2f25';
  g.lineWidth = T * 0.34;
  g.lineCap = 'butt';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.strokeStyle = P.ink;
  g.lineWidth = T * 0.24;
  g.stroke();
}

function drawBuilding(g: CanvasRenderingContext2D, s: SimState, x: number, y: number, b: Building, L: Layout, time: number) {
  const T = L.T;
  const cx = L.ox + (x + 0.5) * T, cy = L.oy + (y + 0.5) * T;
  const ex = cx + DX[b.dir] * T * 0.5, ey = cy + DY[b.dir] * T * 0.5;
  const r = domRes(b);
  const col = r >= 0 ? RES_COLOR[r] : P.dim;

  // Pressure glow
  if (b.strained && b.kind !== 'heart') {
    const k = Math.min(1, (b.pressure - PRESSURE_SAFE * 0.8) / (1 - PRESSURE_SAFE * 0.8));
    const pulse = 0.5 + 0.5 * Math.sin(time * (4 + 8 * k));
    g.fillStyle = `rgba(255, ${Math.round(160 - 140 * k)}, 40, ${0.12 + 0.25 * k * pulse})`;
    g.fillRect(cx - T / 2, cy - T / 2, T, T);
  }

  switch (b.kind) {
    case 'conduit':
    case 'router': {
      // Draw inbound stubs from neighbours that feed us, so lines read as connected.
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
        const nb = s.tiles[ny * s.w + nx].building;
        const feeds =
          nb && (nb.kind === 'junction' || (nb.kind !== 'heart' && nb.kind !== 'router' && nx + DX[nb.dir] === x && ny + DY[nb.dir] === y));
        const routerOut = b.kind === 'router' && nb && !feeds;
        if (feeds || routerOut) tube(g, cx, cy, cx + DX[d] * T * 0.5, cy + DY[d] * T * 0.5, T);
      }
      if (b.kind === 'conduit') {
        tube(g, cx, cy, ex, ey, T);
        tube(g, cx, cy, cx - DX[b.dir] * T * 0.2, cy - DY[b.dir] * T * 0.2, T);
        const fill = b.pressure;
        if (fill > 0.001) {
          g.strokeStyle = col;
          g.globalAlpha = 0.35 + 0.65 * Math.min(1, fill * 3);
          g.lineWidth = T * (0.06 + 0.14 * Math.min(1, fill));
          g.setLineDash([T * 0.12, T * 0.14]);
          g.lineDashOffset = -time * T * Math.min(3, 0.3 + b.flowEma * 0.3);
          g.beginPath();
          g.moveTo(cx - DX[b.dir] * T * 0.5, cy - DY[b.dir] * T * 0.5);
          g.lineTo(ex, ey);
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
        }
        // Direction chevron
        g.strokeStyle = P.sepia;
        g.lineWidth = 1.5;
        const ax = cx + DX[b.dir] * T * 0.12, ay = cy + DY[b.dir] * T * 0.12;
        const px = -DY[b.dir], py = DX[b.dir];
        g.beginPath();
        g.moveTo(ax - DX[b.dir] * T * 0.1 + px * T * 0.09, ay - DY[b.dir] * T * 0.1 + py * T * 0.09);
        g.lineTo(ax, ay);
        g.lineTo(ax - DX[b.dir] * T * 0.1 - px * T * 0.09, ay - DY[b.dir] * T * 0.1 - py * T * 0.09);
        g.stroke();
      } else {
        g.fillStyle = '#3a2f25';
        g.beginPath();
        g.arc(cx, cy, T * 0.26, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = col;
        g.globalAlpha = 0.3 + 0.7 * Math.min(1, b.pressure * 2);
        g.beginPath();
        g.arc(cx, cy, T * 0.14, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      break;
    }
    case 'junction': {
      // Horizontal pipe underneath, vertical pipe arching over it.
      tube(g, cx - T * 0.5, cy, cx + T * 0.5, cy, T);
      g.fillStyle = P.rock;
      g.fillRect(cx - T * 0.2, cy - T * 0.5, T * 0.4, T);
      tube(g, cx, cy - T * 0.5, cx, cy + T * 0.5, T);
      g.strokeStyle = P.sepia;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, cy, T * 0.2, 0, Math.PI * 2);
      g.stroke();
      if (b.lanes) {
        for (let d = 0; d < 4; d++) {
          const lane = b.lanes[d];
          let lr = -1, lv = 0;
          for (let r = 0; r < 4; r++) if (lane[r] > lv) { lv = lane[r]; lr = r; }
          if (lr < 0) continue;
          g.strokeStyle = RES_COLOR[lr];
          g.lineWidth = T * 0.08;
          g.setLineDash([T * 0.1, T * 0.1]);
          g.lineDashOffset = -time * T;
          g.beginPath();
          g.moveTo(cx - DX[d] * T * 0.5, cy - DY[d] * T * 0.5);
          g.lineTo(cx + DX[d] * T * 0.5, cy + DY[d] * T * 0.5);
          g.stroke();
          g.setLineDash([]);
        }
      }
      break;
    }
    case 'tap': {
      tube(g, cx, cy, ex, ey, T);
      g.fillStyle = '#2b2119';
      g.strokeStyle = P.sepia;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + time * 0.6 * (b.enabled ? 1 : 0);
        const rr = k % 2 ? T * 0.2 : T * 0.34;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = P.ichor;
      g.beginPath();
      g.arc(cx, cy, T * 0.09, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'sporangium': {
      tube(g, cx, cy, ex, ey, T);
      g.fillStyle = '#3a2f25';
      g.fillRect(cx - T * 0.05, cy - T * 0.05, T * 0.1, T * 0.28);
      const puff = 1 + 0.05 * Math.sin(time * 2 + x);
      g.fillStyle = '#5a4122';
      g.strokeStyle = P.spore;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(cx, cy - T * 0.05, T * 0.3 * puff, T * 0.2 * puff, 0, Math.PI, 0);
      g.closePath();
      g.fill();
      g.stroke();
      for (let k = 0; k < 4; k++) {
        g.fillStyle = P.spore;
        g.beginPath();
        g.arc(cx - T * 0.18 + k * T * 0.12, cy - T * 0.12, T * 0.025, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'digester':
    case 'reactor': {
      tube(g, cx, cy, ex, ey, T);
      const isR = b.kind === 'reactor';
      const accent = isR ? P.vitriol : P.bile;
      const breathe = 1 + 0.04 * Math.sin(time * (isR ? 3 : 2) + y);
      g.fillStyle = '#2a1f17';
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      if (isR) g.ellipse(cx, cy, T * 0.38 * breathe, T * 0.3 * breathe, 0, 0, Math.PI * 2);
      else g.arc(cx, cy, T * 0.34 * breathe, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      const outFill = (b.out[0] + b.out[1] + b.out[2] + b.out[3]) / 4;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, T * 0.25);
      grd.addColorStop(0, accent);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.25 + 0.6 * Math.min(1, b.flowEma + outFill * 0.3);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, T * 0.25, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      break;
    }
    case 'ward': {
      tube(g, cx, cy, ex, ey, T);
      g.strokeStyle = P.spore;
      g.fillStyle = '#2a1f17';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + time * 0.2;
        const rr = k % 2 ? T * 0.16 : T * 0.4;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.stroke();
      break;
    }
    case 'cauterizer': {
      tube(g, cx, cy, ex, ey, T);
      g.fillStyle = '#2a1f17';
      g.strokeStyle = P.bile;
      g.lineWidth = 1.5;
      g.fillRect(cx - T * 0.25, cy, T * 0.5, T * 0.22);
      g.strokeRect(cx - T * 0.25, cy, T * 0.5, T * 0.22);
      const lit = b.store[2] > 0.01;
      if (lit) {
        const f = 0.8 + 0.2 * Math.sin(time * 12 + x * 3);
        g.fillStyle = 'rgba(200, 230, 90, 0.85)';
        g.beginPath();
        g.moveTo(cx - T * 0.18, cy);
        g.quadraticCurveTo(cx, cy - T * 0.45 * f, cx + T * 0.18, cy);
        g.fill();
      }
      break;
    }
    case 'heart': {
      const beat = 1 + 0.08 * Math.max(0, Math.sin(time * (2 + Math.min(6, Math.log10(1 + s.rate.toNumber())))) ** 8);
      const R0 = T * 0.46 * beat;
      const grd = g.createRadialGradient(cx, cy, R0 * 0.1, cx, cy, R0 * 1.6);
      grd.addColorStop(0, 'rgba(193,31,53,0.55)');
      grd.addColorStop(1, 'rgba(193,31,53,0)');
      g.fillStyle = grd;
      g.fillRect(cx - T, cy - T, T * 2, T * 2);
      g.fillStyle = '#4a0d16';
      g.strokeStyle = P.ichor;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, cy + R0 * 0.85);
      g.bezierCurveTo(cx - R0 * 1.3, cy - R0 * 0.1, cx - R0 * 0.6, cy - R0 * 1.0, cx, cy - R0 * 0.35);
      g.bezierCurveTo(cx + R0 * 0.6, cy - R0 * 1.0, cx + R0 * 1.3, cy - R0 * 0.1, cx, cy + R0 * 0.85);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(240,227,196,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(cx - R0 * 0.3, cy - R0 * 0.2);
      g.quadraticCurveTo(cx, cy + R0 * 0.1, cx + R0 * 0.1, cy + R0 * 0.5);
      g.stroke();
      break;
    }
  }

  // Tier pips
  if (b.tier > 0) {
    g.fillStyle = P.bone;
    const n = Math.min(b.tier, 5);
    for (let k = 0; k < n; k++) g.fillRect(L.ox + x * T + 3 + k * 4, L.oy + y * T + 3, 2.5, 2.5);
    if (b.tier > 5) {
      g.font = `${Math.round(T * 0.22)}px Georgia, serif`;
      g.fillText(String(b.tier), L.ox + x * T + 24, L.oy + y * T + T * 0.24);
    }
  }
  // Cracks from integrity loss
  if (b.integrity < 0.75 && b.kind !== 'heart') {
    const k = 1 - b.integrity;
    g.strokeStyle = b.integrity < 0.3 ? P.danger : P.bone;
    g.globalAlpha = 0.4 + 0.5 * k;
    g.lineWidth = 1;
    const nCr = Math.ceil(k * 5);
    for (let c = 0; c < nCr; c++) {
      let qx = L.ox + x * T + T * hash(x, y, 200 + c), qy = L.oy + y * T + T * hash(x, y, 220 + c);
      g.beginPath();
      g.moveTo(qx, qy);
      for (let seg = 0; seg < 3; seg++) {
        qx += (hash(x, y, 240 + c * 3 + seg) - 0.5) * T * 0.35;
        qy += (hash(x, y, 260 + c * 3 + seg) - 0.5) * T * 0.35;
        g.lineTo(qx, qy);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  if (!b.enabled) {
    g.strokeStyle = P.sepia;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - T * 0.2, cy - T * 0.2);
    g.lineTo(cx + T * 0.2, cy + T * 0.2);
    g.moveTo(cx + T * 0.2, cy - T * 0.2);
    g.lineTo(cx - T * 0.2, cy + T * 0.2);
    g.stroke();
  }
}

// --- Frame ---------------------------------------------------------------------------------

export interface DrawOpts {
  overlay: Overlay;
  selected: { x: number; y: number } | null;
  dpr: number;
  time: number;
}

export function draw(g: CanvasRenderingContext2D, s: SimState, L: Layout, o: DrawOpts) {
  const { T } = L;
  g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  g.fillStyle = P.void;
  g.fillRect(0, 0, L.w, L.h);
  g.drawImage(background(s, L, o.dpr), L.ox, L.oy, T * s.w, T * s.h);

  // Rot: blotches with tendrils
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const rot = s.tiles[y * s.w + x].rot;
      if (rot < 0.02) continue;
      const cx = L.ox + (x + 0.5) * T, cy = L.oy + (y + 0.5) * T;
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, T * 0.75);
      grd.addColorStop(0, `rgba(34, 48, 15, ${0.3 + 0.6 * rot})`);
      grd.addColorStop(0.6, `rgba(79, 106, 37, ${0.35 * rot})`);
      grd.addColorStop(1, 'rgba(79,106,37,0)');
      g.fillStyle = grd;
      g.fillRect(cx - T * 0.75, cy - T * 0.75, T * 1.5, T * 1.5);
      if (rot > 0.3) {
        g.strokeStyle = `rgba(140, 170, 60, ${0.25 * rot})`;
        g.lineWidth = 1;
        for (let k = 0; k < Math.ceil(rot * 4); k++) {
          g.beginPath();
          g.moveTo(cx, cy);
          g.quadraticCurveTo(cx + (hash(x, y, 300 + k) - 0.5) * T, cy + (hash(x, y, 320 + k) - 0.5) * T, cx + (hash(x, y, 340 + k) - 0.5) * T * 1.2, cy + (hash(x, y, 360 + k) - 0.5) * T * 1.2);
          g.stroke();
        }
      }
    }
  }

  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const b = s.tiles[y * s.w + x].building;
      if (b) drawBuilding(g, s, x, y, b, L, o.time);
    }

  // Leeches
  for (const l of s.leeches) {
    const cx = L.ox + (l.x + 0.5) * T, cy = L.oy + (l.y + 0.5) * T;
    const wig = o.time * (l.latched ? 9 : 4) + l.id;
    g.strokeStyle = '#8f1225';
    g.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const t0 = k / 4;
      const px = cx + (t0 - 0.5) * T * 0.6;
      const py = cy + Math.sin(wig + k * 1.2) * T * 0.08;
      g.lineWidth = T * (0.16 - k * 0.018);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + T * 0.01, py);
      g.stroke();
    }
    g.lineCap = 'butt';
    g.fillStyle = P.bone;
    g.fillRect(cx - T * 0.3 - T * 0.02, cy - T * 0.06, 2, 2);
    // HP bar
    const f = Math.max(0, l.hp / l.maxHp);
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(cx - T * 0.35, cy - T * 0.38, T * 0.7, 4);
    g.fillStyle = P.danger;
    g.fillRect(cx - T * 0.35, cy - T * 0.38, T * 0.7 * f, 4);
  }

  // Overlays
  if (o.overlay !== 'none') {
    g.font = `${Math.round(T * 0.26)}px ui-monospace, Menlo, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const t = s.tiles[y * s.w + x];
        const v = o.overlay === 'rot' ? t.rot : t.building?.kind === 'heart' ? 0 : t.building?.pressure ?? -1;
        if (v < 0 || (o.overlay === 'rot' && v < 0.01)) continue;
        const px = L.ox + x * T, py = L.oy + y * T;
        g.fillStyle = o.overlay === 'rot' ? `rgba(79,106,37,${0.25 + 0.6 * v})` : `rgba(${Math.round(80 + 175 * v)}, ${Math.round(140 - 120 * v)}, 40, ${0.25 + 0.5 * v})`;
        g.fillRect(px + 1, py + 1, T - 2, T - 2);
        g.fillStyle = P.essence;
        g.fillText(String(Math.round(v * 100)), px + T / 2, py + T / 2);
      }
    g.textAlign = 'start';
    g.textBaseline = 'alphabetic';
  }

  // Selection & radii
  if (o.selected) {
    const { x, y } = o.selected;
    const b = s.tiles[y * s.w + x]?.building;
    if (b && (b.kind === 'ward' || b.kind === 'cauterizer')) {
      const rad = b.kind === 'ward' ? WARD_RADIUS : CAUTERIZER_RADIUS;
      g.strokeStyle = b.kind === 'ward' ? 'rgba(217,164,65,0.5)' : 'rgba(163,177,58,0.5)';
      g.setLineDash([4, 4]);
      g.strokeRect(L.ox + (x - rad) * T, L.oy + (y - rad) * T, T * (rad * 2 + 1), T * (rad * 2 + 1));
      g.setLineDash([]);
    }
    g.strokeStyle = P.essence;
    g.lineWidth = 2;
    g.strokeRect(L.ox + x * T + 1, L.oy + y * T + 1, T - 2, T - 2);
  }
}
