import { Fragment, useState, type ReactNode } from 'react';
import { useUI } from '../../game/store';
import { LANGS, useT } from '../../i18n';
import { DemoCanvas } from './DemoCanvas';

/** Pages: an optional live demo plus short bullet lines from the dictionary (`tut.<id>.title/body`). */
export const TUTORIAL_PAGES: { id: string; demo?: string }[] = [
  { id: 'welcome', demo: 'line' },
  { id: 'build', demo: 'merge' },
  { id: 'sides', demo: 'sides' },
  { id: 'refine', demo: 'refine' },
  { id: 'split', demo: 'split' },
  { id: 'cross', demo: 'cross' },
  { id: 'pressure', demo: 'pressure' },
  { id: 'rot', demo: 'rot' },
  { id: 'leeches', demo: 'leech' },
  { id: 'upgrade' },
  { id: 'stable' },
  { id: 'meta' },
  { id: 'tools' },
];

/** `**bold**` → <b>bold</b>; nothing else. */
function rich(line: string): ReactNode {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function TutorialPanel() {
  const t = useT();
  const { set, lang, setLang } = useUI();
  const [page, setPage] = useState(0);
  const p = TUTORIAL_PAGES[page];
  const last = page === TUTORIAL_PAGES.length - 1;
  const close = () => set({ panel: 'none' });
  return (
    <div className="modal" onClick={close}>
      <div className="sheet tutorial" onClick={(e) => e.stopPropagation()}>
        <div className="tut-head">
          <span className="tut-n">
            {page + 1} / {TUTORIAL_PAGES.length}
          </span>
          <button className="x" aria-label="✕" onClick={close}>
            ✕
          </button>
        </div>
        <h2>{t(`tut.${p.id}.title`)}</h2>
        {page === 0 && (
          <div className="seg tut-lang">
            {LANGS.map((l) => (
              <button key={l.id} className={`act ${lang === l.id ? 'on' : ''}`} onClick={() => setLang(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        )}
        {p.demo && <DemoCanvas key={p.demo} id={p.demo} />}
        <ul className="tut-body">
          {t(`tut.${p.id}.body`)
            .split('\n')
            .map((line, i) => (
              <li key={i}>{rich(line)}</li>
            ))}
        </ul>
        <div className="tut-dots">
          {TUTORIAL_PAGES.map((_, i) => (
            <button key={i} className={i === page ? 'on' : ''} aria-label={String(i + 1)} onClick={() => setPage(i)} />
          ))}
        </div>
        <div className="tut-nav">
          <button className="act" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('tut.prev')}
          </button>
          <button className="act glow" onClick={() => (last ? close() : setPage(page + 1))}>
            {last ? t('tut.play') : t('tut.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
