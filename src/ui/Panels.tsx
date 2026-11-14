import { host } from '../game/host';
import { useUI } from '../game/store';
import { LANGS, useT } from '../i18n';
import { mutBlurb, mutName, reasonText } from '../i18n/game';
import { Formulas as F, type MutationId } from '../sim';
import { META_THRESHOLD, MUTATIONS, UNSPENT_MUTAGEN_BONUS } from '../sim/config';
import { fmt, fmtTime, int } from './format';

export function MutationsPanel() {
  useUI((u) => u.frame);
  const t = useT();
  const { set, say } = useUI();
  const s = host.state;
  const gain = F.mutagenYield(s.runEssence, s.depth);
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('meta.title')}</h2>
        <p className="sub">{t('meta.desc', { bonus: UNSPENT_MUTAGEN_BONUS * 100 })}</p>
        <div className="meta-box">
          <div>
            <div className="big">{fmt(s.mutagen, 0)}</div>
            <div className="sub">{t('meta.depth', { depth: s.depth })}</div>
          </div>
          {gain.lte(0) && (
            <button className="act big-act poor">{t('meta.need', { need: fmt(META_THRESHOLD), have: fmt(s.runEssence) })}</button>
          )}
        </div>
        {gain.gt(0) && (
          <>
            <p className="sub">{t('meta.desc2', { gain: fmt(gain, 0) })}</p>
            <div className="meta-choice">
              {[true, false].map((descend) => (
                <button
                  key={String(descend)}
                  className={`act big-act ${descend ? 'glow' : ''}`}
                  onClick={() => {
                    if (!confirm(t('meta.confirm', { gain: fmt(gain, 0) }))) return;
                    const r = host.dispatch({ t: 'metamorphose', descend });
                    if (!r.ok) say(reasonText(r));
                    else set({ panel: 'none', selected: null, tool: null });
                  }}
                >
                  {descend ? t('meta.descend', { depth: s.depth + 1 }) : t('meta.stay', { depth: s.depth })}
                  <small>{descend ? t('meta.descendDesc') : t('meta.stayDesc')}</small>
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mutations">
          {(Object.keys(MUTATIONS) as MutationId[]).map((id) => {
            const m = MUTATIONS[id];
            const lvl = s.mutations[id];
            const cost = F.mutationCost(id, lvl);
            const maxed = lvl >= m.max;
            return (
              <button
                key={id}
                className={`mut ${!maxed && s.mutagen.gte(cost) ? '' : 'poor'}`}
                onClick={() => {
                  const r = host.dispatch({ t: 'mutate', id });
                  if (!r.ok) say(reasonText(r));
                }}
              >
                <b>
                  {mutName(id)} <small>{lvl}/{m.max}</small>
                </b>
                <span>{mutBlurb(id)}</span>
                <small className="cost">{maxed ? '—' : `☣ ${fmt(cost, 0)}`}</small>
              </button>
            );
          })}
        </div>
        <p className="sub">
          {t('meta.cycle', { time: fmtTime(s.time), peak: fmt(s.stats.peakRate), r: int(s.stats.run.ruptures), k: int(s.stats.run.leechesKilled) })}
        </p>
      </div>
    </div>
  );
}

export function HelpPanel() {
  const t = useT();
  const set = useUI((u) => u.set);
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet help" onClick={(e) => e.stopPropagation()}>
        <h2>{t('help.title')}</h2>
        <p>
          {t('help.heart')}
          <br />
          <code>E/s = M · (Π (1 + x)^(w·α) − 1)</code>
          <br />
          {t('help.product')}
        </p>
        <ul>
          <li>{t('help.l1')}</li>
          <li>{t('help.l2')}</li>
          <li>{t('help.l3')}</li>
          <li>{t('help.l4')}</li>
        </ul>
        <h3>{t('help.dangers')}</h3>
        <ul>
          <li>{t('help.d1')}</li>
          <li>{t('help.d2')}</li>
          <li>{t('help.d3')}</li>
        </ul>
        <p className="sub">{t('help.foot')}</p>
        <LangPicker />
      </div>
    </div>
  );
}

function LangPicker() {
  const { lang, setLang } = useUI();
  return (
    <div className="seg">
      {LANGS.map((l) => (
        <button key={l.id} className={`act ${lang === l.id ? 'on' : ''}`} onClick={() => setLang(l.id)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel() {
  const t = useT();
  const { set, notation, setNotation } = useUI();
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('settings.title')}</h2>
        <h3>{t('settings.language')}</h3>
        <LangPicker />
        <h3>{t('settings.notation')}</h3>
        <div className="seg">
          <button className={`act ${notation === 'suffix' ? 'on' : ''}`} onClick={() => setNotation('suffix')}>
            {t('settings.suffix')}
          </button>
          <button className={`act ${notation === 'sci' ? 'on' : ''}`} onClick={() => setNotation('sci')}>
            {t('settings.sci')}
          </button>
        </div>
        <h3>&nbsp;</h3>
        <button
          className="act danger"
          onClick={() => {
            if (confirm(t('help.eraseConfirm'))) {
              host.hardReset();
              set({ panel: 'none', selected: null, tool: null });
            }
          }}
        >
          {t('help.erase')}
        </button>
      </div>
    </div>
  );
}

export function OfflineModal() {
  const t = useT();
  const { offline, set } = useUI();
  if (!offline) return null;
  const gained = offline.essenceAfter.sub(offline.essenceBefore);
  return (
    <div className="modal" onClick={() => set({ offline: null })}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{t('off.title')}</h2>
        <p className="sub">{t('off.desc', { time: fmtTime(offline.seconds) })}</p>
        <ul>
          <li>{t('off.essence', { v: gained.gte(0) ? `+${fmt(gained)}` : `−${fmt(gained.neg())}` })}</li>
          <li>{t('off.waves', { n: offline.waves, k: offline.leechesKilled })}</li>
          <li className={offline.ruptures ? 'bad' : ''}>{t('off.ruptures', { n: offline.ruptures })}</li>
        </ul>
        <button className="act" onClick={() => set({ offline: null })}>
          {t('off.ok')}
        </button>
      </div>
    </div>
  );
}
