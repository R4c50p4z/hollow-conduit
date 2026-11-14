import { useEffect, useRef } from 'react';
import { host } from '../game/host';
import { audio } from '../game/audio';
import { haptic } from '../game/native';
import { useUI } from '../game/store';
import { reasonText } from '../i18n/game';
import type { Dir } from '../sim';
import { computeLayout, draw, type Layout } from './render';

/**
 * Canvas board. Draws every animation frame straight from host.state (no React re-render),
 * and translates taps/drags into sim commands.
 *
 * Gestures:
 *   - tap a leech            → strike it (active defence)
 *   - tap empty w/ tool      → build facing the chosen direction
 *   - drag with Conduit tool → lay a pipe along the finger; each segment points to the next
 *   - tap anything else      → inspect
 */
export function Board() {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const layout = useRef<Layout | null>(null);

  useEffect(() => {
    const c = cv.current!, w = wrap.current!;
    const g = c.getContext('2d')!;
    let raf = 0;
    const resize = () => {
      const r = w.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      c.width = Math.floor(r.width * dpr);
      c.height = Math.floor(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      layout.current = computeLayout(r.width, r.height, host.state);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(w);
    resize();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = layout.current;
      if (!L) return;
      if (L.T * host.state.w > L.w + 1 || L.T === 0) layout.current = computeLayout(L.w, L.h, host.state);
      const ui = useUI.getState();
      draw(g, host.state, layout.current!, {
        overlay: ui.overlay,
        selected: ui.selected,
        dpr: Math.min(3, window.devicePixelRatio || 1),
        time: now / 1000,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // --- input --------------------------------------------------------------------------------
  const drag = useRef<{ last: { x: number; y: number } | null; moved: boolean; built: boolean } | null>(null);

  const tileFrom = (e: React.PointerEvent) => {
    const L = layout.current!;
    const r = cv.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - L.ox) / L.T);
    const y = Math.floor((e.clientY - r.top - L.oy) / L.T);
    const s = host.state;
    return x >= 0 && y >= 0 && x < s.w && y < s.h ? { x, y } : null;
  };

  const setDir = (x: number, y: number, d: Dir) => {
    for (let k = 0; k < 4; k++) {
      const b = host.state.tiles[y * host.state.w + x].building;
      if (!b || b.dir === d) return;
      host.dispatch({ t: 'rotate', x, y });
    }
  };

  const onDown = (e: React.PointerEvent) => {
    const p = tileFrom(e);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const ui = useUI.getState();
    const s = host.state;
    if (s.leeches.some((l) => l.x === p.x && l.y === p.y)) {
      host.dispatch({ t: 'strike', ...p });
      drag.current = null;
      haptic('light');
      audio.play('strike');
      return;
    }
    drag.current = { last: p, moved: false, built: false };
    const t = s.tiles[p.y * s.w + p.x];
    if (ui.tool && !t.building) {
      const r = host.dispatch({ t: 'build', ...p, kind: ui.tool, dir: ui.dir });
      if (!r.ok) ui.say(reasonText(r));
      else {
        drag.current.built = true;
        audio.play('build');
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const ui = useUI.getState();
    if (!d || !d.last || ui.tool !== 'conduit') return;
    const p = tileFrom(e);
    if (!p || (p.x === d.last.x && p.y === d.last.y)) return;
    const dx = p.x - d.last.x, dy = p.y - d.last.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return; // only orthogonal steps
    const dir: Dir = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3;
    d.moved = true;
    const lastB = host.state.tiles[d.last.y * host.state.w + d.last.x].building;
    if (lastB?.kind === 'conduit') setDir(d.last.x, d.last.y, dir);
    const t = host.state.tiles[p.y * host.state.w + p.x];
    if (!t.building) {
      const r = host.dispatch({ t: 'build', ...p, kind: 'conduit', dir });
      if (!r.ok) {
        ui.say(reasonText(r));
        d.last = null;
        return;
      }
      useUI.setState({ dir });
    }
    d.last = p;
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.built) return;
    const p = tileFrom(e);
    if (!p) return;
    const ui = useUI.getState();
    const sel = ui.selected;
    ui.set({ selected: sel && sel.x === p.x && sel.y === p.y ? null : p, tool: null });
  };

  return (
    <div ref={wrap} className="board">
      <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)} />
    </div>
  );
}
