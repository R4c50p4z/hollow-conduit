import { useEffect, useRef, useState } from 'react';
import { tick, type SimState } from '../../sim';
import { useT } from '../../i18n';
import { fmt } from '../format';
import { computeLayout, draw } from '../render';
import { DEMOS } from './demos';

/** Runs one tutorial demo on its own little canvas with the real engine and renderer. */
export function DemoCanvas({ id }: { id: string }) {
  const t = useT();
  const cv = useRef<HTMLCanvasElement>(null);
  const [rate, setRate] = useState('0');
  useEffect(() => {
    const demo = DEMOS[id];
    const c = cv.current!;
    const g = c.getContext('2d')!;
    let s: SimState = demo.build();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastLabel = 0;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const size = () => {
      const w = c.clientWidth;
      const h = Math.round(w * Math.min(0.75, s.h / s.w));
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.height = `${h}px`;
      return { w, h };
    };
    let dims = size();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      acc += dt * demo.speed;
      let n = 0;
      while (acc >= 0.1 && n < 200) {
        tick(s, 0.1);
        demo.step?.(s);
        acc -= 0.1;
        n++;
      }
      if (s.time > demo.resetAfter || demo.done?.(s)) {
        s = demo.build();
        dims = size();
      }
      draw(g, s, computeLayout(dims.w, dims.h, s), { overlay: 'none', selected: null, dpr, time: now / 1000 });
      if (now - lastLabel > 250) {
        lastLabel = now;
        setRate(fmt(s.rate));
      }
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => (dims = size());
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [id]);
  return (
    <figure className="demo">
      <canvas ref={cv} />
      <figcaption>
        {t('tut.live')} · {t('st.rate')}: {rate}
      </figcaption>
    </figure>
  );
}
