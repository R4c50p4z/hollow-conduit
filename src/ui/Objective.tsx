import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { graceLeft, type SimState } from '../sim';

/**
 * Light guided tutorial: the first unmet objective, derived from lifetime stats (monotonic), so it
 * needs no save data of its own. Hidden once everything is done, or when the player dismisses it.
 */
const heartTier = (s: SimState) => s.tiles[s.heartY * s.w + s.heartX].building?.tier ?? 0;
const L = (s: SimState) => s.stats.life;

export const OBJECTIVES: { id: string; done: (s: SimState) => boolean; skip?: (s: SimState) => boolean }[] = [
  { id: 'tap', done: (s) => (L(s).builtByKind.tap ?? 0) > 0 },
  { id: 'connect', done: (s) => L(s).consumed[0] > 1 },
  { id: 'spores', done: (s) => L(s).consumed[1] > 1 },
  { id: 'digester', done: (s) => L(s).consumed[2] > 1 },
  { id: 'heart', done: (s) => heartTier(s) >= 1 || s.stats.metamorphoses > 0 },
  // Leech goals wait until the grace period is over; they come back as soon as it ends.
  { id: 'strike', done: (s) => L(s).leechesKilled > 0, skip: (s) => graceLeft(s) > 0 },
  { id: 'ward', done: (s) => (L(s).builtByKind.ward ?? 0) > 0 },
  { id: 'vitriol', done: (s) => L(s).consumed[3] > 1 },
  { id: 'meta', done: (s) => s.stats.metamorphoses > 0 },
];

export function Objective() {
  useUI((u) => u.frame);
  const t = useT();
  const { tutorial, setTutorial } = useUI();
  if (!tutorial) return null;
  const s = host.state;
  const i = OBJECTIVES.findIndex((o) => !o.done(s) && !o.skip?.(s));
  if (i < 0) return null;
  return (
    <div className="objective">
      <span className="obj-n">
        {t('obj.label')} {i + 1}/{OBJECTIVES.length}
      </span>
      <span className="obj-text">{t(`obj.${OBJECTIVES[i].id}`)}</span>
      <button className="obj-x" aria-label={t('obj.hide')} onClick={() => setTutorial(false)}>
        ✕
      </button>
    </div>
  );
}
