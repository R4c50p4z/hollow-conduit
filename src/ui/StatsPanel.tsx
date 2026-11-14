import Decimal from 'break_eternity.js';
import { useState, type ReactNode } from 'react';
import { cyclesCsv, exportFile, historyCsv, statsJson } from '../game/export';
import { host } from '../game/host';
import { useUI } from '../game/store';
import { useT } from '../i18n';
import { achDesc, achName, kindName, resName } from '../i18n/game';
import { ACHIEVEMENTS, ALL_KINDS, snapshot, STABLE_WINDOW, type Counters, type Kind } from '../sim';
import { ACHIEVEMENT_BONUS, ROT_TIPPING } from '../sim/config';
import { LineChart, ShareBar } from './Chart';
import { fmt, fmtDuration, fmtTime, int, num, pct } from './format';
import { CHART_RES } from './palette';

type Tab = 'now' | 'run' | 'life' | 'charts' | 'runs' | 'ach' | 'export';
const TABS: Tab[] = ['now', 'run', 'life', 'charts', 'runs', 'ach', 'export'];

const Row = ({ k, v, sub }: { k: string; v: ReactNode; sub?: boolean }) => (
  <div className={`srow ${sub ? 'sub-row' : ''}`}>
    <span>{k}</span>
    <b>{v}</b>
  </div>
);
const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="ssec">
    <h4>{title}</h4>
    {children}
  </section>
);
const sum4 = (b: number[]) => b[0] + b[1] + b[2] + b[3];
/** Per-resource breakdown row: "12.3 · 4.5 · 0 · 1.1" coloured by resource. */
const ResRow = ({ k, b, f = (v: number) => fmt(v) }: { k: string; b: number[]; f?: (v: number) => string }) => (
  <div className="srow">
    <span>{k}</span>
    <b className="resvals">
      {b.map((v, r) => (
        <span key={r} title={resName(r)}>
          <i style={{ background: CHART_RES[r] }} />
          {f(v)}
        </span>
      ))}
    </b>
  </div>
);

export function StatsPanel() {
  useUI((u) => u.frame);
  const t = useT();
  const set = useUI((u) => u.set);
  const [tab, setTab] = useState<Tab>('now');
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet stats" onClick={(e) => e.stopPropagation()}>
        <div className="stats-head">
          <h2>{t('st.title')}</h2>
          <button className="x" onClick={() => set({ panel: 'none' })}>
            ✕
          </button>
        </div>
        <div className="tabs">
          {TABS.map((id) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {id === 'export' ? t('st.export') : t(`st.tab.${id}`)}
            </button>
          ))}
        </div>
        <div className="stats-body">
          {tab === 'now' && <NowTab />}
          {tab === 'run' && <RunTab />}
          {tab === 'life' && <LifeTab />}
          {tab === 'charts' && <ChartsTab />}
          {tab === 'runs' && <RunsTab />}
          {tab === 'ach' && <AchTab />}
          {tab === 'export' && <ExportTab />}
        </div>
      </div>
    </div>
  );
}

function NowTab() {
  const t = useT();
  const s = host.state;
  const n = snapshot(s);
  const kinds = ALL_KINDS.filter((k) => k !== 'heart' && n.byKind[k] > 0);
  const st = n.stability;
  const mark = (ok: boolean) => (ok ? '✓ ' : '✗ ');
  const since = (secs: number, at?: number) =>
    at === undefined ? t('st.stab.never') : secs >= STABLE_WINDOW ? fmtDuration(secs) : `${fmtDuration(secs)} · ${t('st.stab.need', { t: fmtDuration(STABLE_WINDOW - secs) })}`;
  return (
    <>
      <Sec title={t('st.sec.stability')}>
        <p className={`verdict ${st.stable ? 'ok' : 'warn'}`}>{st.stable ? t('st.stab.verdict.ok') : t('st.stab.verdict.no')}</p>
        <Row k={mark(st.strained === 0) + t('st.stab.strained')} v={int(st.strained)} />
        <Row k={mark(st.infected === 0) + t('st.stab.infected', { p: pct(ROT_TIPPING) })} v={int(st.infected)} />
        <Row k={mark(st.sinceRupture >= STABLE_WINDOW) + t('st.stab.rupture')} v={since(st.sinceRupture, s.stats.lastRuptureAt)} />
        <Row k={mark(st.sinceSated >= STABLE_WINDOW) + t('st.stab.sated')} v={since(st.sinceSated, s.stats.lastSatedAt)} />
      </Sec>
      <Sec title={t('st.sec.heart')}>
        <Row k={t('st.rate')} v={fmt(s.rate)} />
        <Row k={t('st.essence')} v={fmt(s.essence)} />
        <Row k={t('st.runEssence')} v={fmt(s.runEssence)} />
        <Row k={t('st.alpha')} v={num(n.alpha, 2)} />
        <Row k={t('st.mult')} v={`×${num(n.mult.toNumber(), 2)}`} />
        <Row k={t('st.heartCap')} v={`${fmt(n.heartCap)}/s`} />
        {[0, 1, 2, 3].map((r) => (
          <Row
            key={r}
            sub
            k={`${t('st.intake')} · ${resName(r)}`}
            v={`${num(s.intake[r], 2)}/s · ${pct(n.heartUtil[r])} ${t('st.util')} · ${t('st.factor')} ×${fmt(n.heartFactor[r])}`}
          />
        ))}
      </Sec>
      <Sec title={t('st.sec.share')}>
        <ShareBar parts={[0, 1, 2, 3].map((r) => ({ label: resName(r), value: n.heartShare[r], color: CHART_RES[r] }))} />
      </Sec>
      <Sec title={t('st.sec.network')}>
        <Row k={t('st.structures')} v={int(n.structures)} />
        {kinds.map((k) => (
          <Row key={k} sub k={kindName(k)} v={`${int(n.byKind[k])} · ${t('st.tierSum', { n: n.tiersByKind[k] })}`} />
        ))}
        <Row k={t('st.maxTier')} v={int(n.maxTier)} />
        <Row k={t('st.flowing')} v={`${int(n.flowing)} / ${int(n.structures)}`} />
        <Row k={t('st.stagnant')} v={int(n.stagnant)} />
        <Row k={t('st.sealed')} v={int(n.sealed)} />
        <Row k={t('st.veins')} v={`${n.veinsUsed} / ${n.veinsTotal}`} />
        <Row k={t('st.beds')} v={`${n.bedsUsed} / ${n.bedsTotal}`} />
        <Row k={t('st.invested')} v={fmt(n.invested)} />
        <Row k={t('st.conduitCap')} v={`${fmt(n.conduitCapacity)}/s`} />
        <ResRow k={t('st.extraction')} b={n.extraction} f={(v) => num(v, 1)} />
        <ResRow k={t('st.transit')} b={n.transit} f={(v) => num(v, 1)} />
      </Sec>
      <Sec title={t('st.sec.health')}>
        <Row k={t('st.pressureAvg')} v={pct(n.pressureAvg)} />
        <Row k={t('st.pressureMax')} v={pct(n.pressureMax)} />
        <Row k={t('st.pressured')} v={int(n.pressured)} />
        <Row k={t('st.integrityAvg')} v={pct(n.integrityAvg)} />
        <Row k={t('st.integrityMin')} v={pct(n.integrityMin)} />
        <Row k={t('st.cracked')} v={int(n.cracked)} />
        <Row k={t('st.rotAvg')} v={pct(n.rotAvg, 1)} />
        <Row k={t('st.rotMax')} v={pct(n.rotMax)} />
        <Row k={t('st.rotTiles')} v={`${int(n.rotTiles)} / ${s.tiles.length}`} />
        <Row k={t('st.rotHeavy')} v={int(n.rotHeavy)} />
      </Sec>
      {n.bottlenecks.length > 0 && n.bottlenecks[0].pressure > 0.05 && (
        <Sec title={t('st.sec.bottlenecks')}>
          {n.bottlenecks.map((b) => (
            <Row key={`${b.x},${b.y}`} k={`${kindName(b.kind)} (${b.x + 1}, ${b.y + 1})`} v={`${pct(b.pressure)} · ${t('insp.integrity').toLowerCase()} ${pct(b.integrity)}`} />
          ))}
        </Sec>
      )}
      <Sec title={t('st.sec.threat')}>
        <Row k={t('st.leechesNow')} v={int(s.leeches.length)} />
        <Row k={t('st.leechHp')} v={fmt(n.leechHpTotal)} />
        <Row k={t('st.nextWave')} v={t('st.nextWaveDesc', { n: n.nextWaveCount, hp: fmt(n.nextLeechHp), time: fmtTime(s.waveTimer) })} />
        <Row k={t('st.entropy')} v={num(n.entropyPerMin, 2)} />
        <Row k={t('st.mutagenNow')} v={fmt(n.mutagenIfNow, 0)} />
      </Sec>
    </>
  );
}

function CountersView({ c }: { c: Counters }) {
  const t = useT();
  const prod = sum4(c.produced);
  const sunk = sum4(c.consumed) + sum4(c.refinedIn) + sum4(c.burned);
  const kinds = (m: Partial<Record<Kind, number>>) =>
    (Object.keys(m) as Kind[]).filter((k) => (m[k] ?? 0) > 0).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0));
  return (
    <>
      <Sec title={t('st.sec.flow')}>
        <Row k={t('st.time')} v={fmtDuration(c.time)} />
        <ResRow k={t('st.produced')} b={c.produced} />
        <ResRow k={t('st.consumed')} b={c.consumed} />
        <ResRow k={t('st.refinedIn')} b={c.refinedIn} />
        <ResRow k={t('st.burned')} b={c.burned} />
        <ResRow k={t('st.drained')} b={c.drained} />
        <ResRow k={t('st.spilled')} b={c.spilled} />
        <Row k={t('st.efficiency')} v={prod > 0 ? pct(sunk / prod, 1) : t('st.none')} />
        <Row k={`${t('st.crafts')} · ${kindName('digester')}`} v={int(c.crafts.digester)} />
        <Row k={`${t('st.crafts')} · ${kindName('reactor')}`} v={int(c.crafts.reactor)} />
      </Sec>
      <Sec title={t('st.sec.economy')}>
        <Row k={t('st.earned')} v={fmt(c.essenceEarned)} />
        <Row k={t('st.avgRate')} v={c.time > 0 ? fmt(c.essenceEarned.div(c.time)) : t('st.none')} />
        <Row k={t('st.spentBuild')} v={fmt(c.spentBuild)} />
        <Row k={t('st.spentUpgrade')} v={fmt(c.spentUpgrade)} />
        <Row k={t('st.spentRepair')} v={fmt(c.spentRepair)} />
        <Row k={t('st.spentCleanse')} v={fmt(c.spentCleanse)} />
        <Row k={t('st.refunded')} v={fmt(c.refunded)} />
        <Row k={t('st.heartLeeched')} v={fmt(c.heartLeeched)} />
      </Sec>
      <Sec title={t('st.sec.build')}>
        <Row k={t('st.built')} v={int(c.built)} />
        {kinds(c.builtByKind).map((k) => (
          <Row key={k} sub k={kindName(k)} v={int(c.builtByKind[k] ?? 0)} />
        ))}
        <Row k={t('st.upgrades')} v={int(c.upgrades)} />
        <Row k={t('st.razed')} v={int(c.razed)} />
        <Row k={t('st.repairs')} v={int(c.repairs)} />
        <Row k={t('st.vents')} v={int(c.vents)} />
        <Row k={t('st.cleanses')} v={int(c.cleanses)} />
        <Row k={t('st.seals')} v={int(c.seals)} />
        <Row k={t('st.rotations')} v={int(c.rotations)} />
      </Sec>
      <Sec title={t('st.sec.hazards')}>
        <Row k={t('st.ruptures')} v={int(c.ruptures)} />
        {(['pressure', 'rot', 'leech'] as const).map((cause) => (
          <Row key={cause} sub k={`${t('st.byCause')}: ${t(`st.cause.${cause}`)}`} v={int(c.rupturesByCause[cause])} />
        ))}
        {kinds(c.rupturesByKind).map((k) => (
          <Row key={k} sub k={kindName(k)} v={int(c.rupturesByKind[k] ?? 0)} />
        ))}
        <Row k={t('st.overpressure')} v={fmtDuration(c.overpressureSeconds)} />
        <Row k={t('st.rotTime')} v={fmtDuration(c.rotTileSeconds)} />
        <Row k={t('st.rotCleansed')} v={num(c.rotCleansed, 2)} />
        <Row k={t('st.rotScoured')} v={num(c.rotScoured, 2)} />
        <Row k={t('st.rotFlushed')} v={num(c.rotFlushed, 2)} />
        <Row k={t('st.entropySeeds')} v={int(c.entropySeeds)} />
      </Sec>
      <Sec title={t('st.sec.defence')}>
        <Row k={t('st.waves')} v={int(c.waves)} />
        <Row k={t('st.spawned')} v={int(c.leechesSpawned)} />
        <Row k={t('st.killed')} v={int(c.leechesKilled)} />
        <Row sub k={t('st.killsStrike')} v={int(c.killsByStrike)} />
        <Row sub k={t('st.killsWard')} v={int(c.killsByWard)} />
        <Row k={t('st.sated')} v={int(c.leechesSated)} />
        <Row k={t('st.killRate')} v={c.leechesSpawned ? pct(c.leechesKilled / c.leechesSpawned, 1) : t('st.none')} />
        <Row k={t('st.strikes')} v={int(c.strikes)} />
        <Row k={t('st.strikeDamage')} v={fmt(c.strikeDamage)} />
        <Row k={t('st.wardDamage')} v={fmt(c.wardDamage)} />
      </Sec>
    </>
  );
}

function RunTab() {
  const t = useT();
  const s = host.state;
  const st = s.stats;
  return (
    <>
      <Sec title={t('st.sec.records')}>
        <Row k={t('st.peakRate')} v={fmt(st.peakRate)} />
        <Row k={t('st.peakEssence')} v={fmt(st.peakEssence)} />
        <ResRow k={t('st.peakIntake')} b={st.peakIntake} f={(v) => num(v, 1)} />
        <Row k={t('st.peakLeeches')} v={int(st.peakLeeches)} />
        <Row k={t('st.depth')} v={int(s.depth)} />
      </Sec>
      <CountersView c={st.run} />
    </>
  );
}

function LifeTab() {
  const t = useT();
  const s = host.state;
  const st = s.stats;
  return (
    <>
      <Sec title={t('st.sec.records')}>
        <Row k={t('st.totalEssence')} v={fmt(s.totalEssence)} />
        <Row k={t('st.bestRate')} v={fmt(st.bestRate)} />
        <Row k={t('st.metamorphoses')} v={int(st.metamorphoses)} />
        <Row k={t('st.depth')} v={int(s.depth)} />
        <Row k={t('st.mutagenEarned')} v={fmt(st.mutagenEarned, 0)} />
        <Row k={t('st.fastestMeta')} v={st.fastestMeta === null ? t('st.none') : fmtDuration(st.fastestMeta)} />
        <Row k={t('st.longestRun')} v={st.longestRun ? fmtDuration(st.longestRun) : t('st.none')} />
        <Row k={t('st.offline')} v={fmtDuration(st.offlineSeconds)} />
        <Row k={t('st.sessions')} v={int(st.sessions)} />
        <Row k={t('st.achievements')} v={`${s.achievements.length} / ${ACHIEVEMENTS.length}`} />
      </Sec>
      <CountersView c={st.life} />
    </>
  );
}

function ChartsTab() {
  const t = useT();
  const [table, setTable] = useState(false);
  const h = host.state.stats.history;
  if (h.t.length < 2) return <p className="sub">{t('st.chart.empty')}</p>;
  const charts: { title: string; ys: number[]; color?: string; fmtY: (v: number) => string; yMin?: number; yMax?: number }[] = [
    { title: t('st.chart.rate'), ys: h.rateLog, fmtY: (v) => num(v, 1), yMin: 0 },
    { title: t('st.chart.essence'), ys: h.essenceLog, fmtY: (v) => num(v, 1), yMin: 0 },
    ...[0, 1, 2, 3].map((r) => ({ title: t('st.chart.intake', { res: resName(r) }), ys: h.intake[r], color: CHART_RES[r], fmtY: (v: number) => num(v, 1), yMin: 0 })),
    { title: t('st.chart.pressure'), ys: h.pressure.map((v) => v * 100), fmtY: (v) => num(v, 0), yMin: 0, yMax: 100 },
    { title: t('st.chart.integrity'), ys: h.integrity.map((v) => v * 100), fmtY: (v) => num(v, 0), yMin: 0, yMax: 100 },
    { title: t('st.chart.rot'), ys: h.rot.map((v) => v * 100), fmtY: (v) => num(v, 1), yMin: 0 },
    { title: t('st.chart.leeches'), ys: h.leeches, fmtY: (v) => num(v, 0), yMin: 0 },
    { title: t('st.chart.structures'), ys: h.structures, fmtY: (v) => num(v, 0), yMin: 0 },
  ];
  return (
    <>
      <div className="charts-head">
        <span className="sub">{t('st.chart.window', { time: fmtDuration(h.t[h.t.length - 1] - h.t[0]) })}</span>
        <button className="act" onClick={() => setTable(!table)}>
          {table ? t('st.chart') : t('st.table')}
        </button>
      </div>
      {!table ? (
        charts.map((c) => <LineChart key={c.title} xs={h.t} {...c} />)
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('st.time')}</th>
                {charts.map((c) => (
                  <th key={c.title}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.t
                .map((x, i) => (
                  <tr key={i}>
                    <td>{fmtTime(x)}</td>
                    {charts.map((c) => (
                      <td key={c.title}>{c.fmtY(c.ys[i])}</td>
                    ))}
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RunsTab() {
  const t = useT();
  const runs = host.state.stats.runs;
  if (!runs.length) return <p className="sub">{t('st.runs.empty')}</p>;
  const e = (l: number) => fmt(Decimal.pow(10, l));
  const xs = runs.map((_, i) => i + 1);
  const fx = (x: number) => t('st.runs.cycleN', { n: Math.round(x) });
  return (
    <>
    {runs.length >= 2 && (
      <>
        <LineChart title={t('st.runs.chartPeak')} xs={xs} ys={runs.map((r) => r.peakRateLog)} fmtY={(v) => num(v, 1)} fmtX={fx} yMin={0} />
        <LineChart title={t('st.runs.chartMut')} xs={xs} ys={runs.map((r) => Math.log10(1 + r.mutagen))} fmtY={(v) => num(v, 1)} fmtX={fx} yMin={0} />
        <LineChart title={t('st.runs.chartTime')} xs={xs} ys={runs.map((r) => r.duration / 60)} fmtY={(v) => num(v, 0)} fmtX={fx} yMin={0} />
        <LineChart title={t('st.runs.chartDepth')} xs={xs} ys={runs.map((r) => r.depth)} fmtY={(v) => num(v, 0)} fmtX={fx} yMin={0} />
      </>
    )}
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {(['n', 'depth', 'time', 'peak', 'total', 'mut', 'rupt', 'kills'] as const).map((k) => (
              <th key={k}>{t(`st.runs.${k}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs
            .map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.depth}</td>
                <td>{fmtTime(r.duration)}</td>
                <td>{e(r.peakRateLog)}</td>
                <td>{e(r.essenceLog)}</td>
                <td>{int(r.mutagen)}</td>
                <td>{int(r.ruptures)}</td>
                <td>{int(r.kills)}</td>
              </tr>
            ))
            .reverse()}
        </tbody>
      </table>
    </div>
    </>
  );
}

function AchTab() {
  const t = useT();
  const got = host.state.achievements;
  return (
    <>
      <p className="sub">
        {t('st.ach.progress', { n: got.length, total: ACHIEVEMENTS.length, bonus: num(got.length * ACHIEVEMENT_BONUS * 100, 0) })}
      </p>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const on = got.includes(a.id);
          return (
            <div key={a.id} className={`ach ${on ? 'on' : ''}`}>
              <b>{achName(a.id)}</b>
              <span>{achDesc(a.id)}</span>
              {!on && <small>{t('st.ach.locked')}</small>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function ExportTab() {
  const t = useT();
  const say = useUI((u) => u.say);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const go = async (name: string, mime: string, text: string) => {
    const r = await exportFile(name, mime, text);
    say(t(`st.export.${r}`));
  };
  const s = host.state;
  return (
    <div className="export">
      <button className="act" onClick={() => go(`hollow-stats-${stamp}.json`, 'application/json', statsJson(s))}>
        {t('st.export.json')}
      </button>
      <button className="act" onClick={() => go(`hollow-series-${stamp}.csv`, 'text/csv', historyCsv(s))}>
        {t('st.export.history')}
      </button>
      <button className="act" onClick={() => go(`hollow-cycles-${stamp}.csv`, 'text/csv', cyclesCsv(s))}>
        {t('st.export.cycles')}
      </button>
    </div>
  );
}
