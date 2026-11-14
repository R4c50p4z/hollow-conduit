import { host } from '../game/host';
import { useUI } from '../game/store';
import { Formulas as F, type MutationId } from '../sim';
import { META_THRESHOLD, MUTATIONS, UNSPENT_MUTAGEN_BONUS } from '../sim/config';
import { fmt, fmtTime } from './format';

export function MutationsPanel() {
  useUI((u) => u.frame);
  const { set, say } = useUI();
  const s = host.state;
  const gain = F.mutagenYield(s.runEssence, s.depth);
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Metamorphosis</h2>
        <p className="sub">
          Shed this cavern. Everything physical is lost; the Heart descends one depth (hazards ×1.15, yield ×1.2) and
          mutates. Unspent mutagen strengthens the Heart by +{UNSPENT_MUTAGEN_BONUS * 100}% each.
        </p>
        <div className="meta-box">
          <div>
            <div className="big">{fmt(s.mutagen, 0)}</div>
            <div className="sub">mutagen · depth {s.depth}</div>
          </div>
          <button
            className={`act big-act ${gain.gt(0) ? 'glow' : 'poor'}`}
            onClick={() => {
              if (!confirm(`Metamorphose for ${fmt(gain, 0)} mutagen? The cavern will be lost.`)) return;
              const r = host.dispatch({ t: 'metamorphose' });
              if (!r.ok) say(r.reason);
              else set({ panel: 'none', selected: null, tool: null });
            }}
          >
            {gain.gt(0) ? `Metamorphose +${fmt(gain, 0)}` : `Needs ${fmt(META_THRESHOLD)} this cycle (${fmt(s.runEssence)})`}
          </button>
        </div>
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
                  if (!r.ok) say(r.reason);
                }}
              >
                <b>
                  {m.name} <small>{lvl}/{m.max}</small>
                </b>
                <span>{m.blurb}</span>
                <small className="cost">{maxed ? '—' : `☣ ${fmt(cost, 0)}`}</small>
              </button>
            );
          })}
        </div>
        <p className="sub">
          This cycle: {fmtTime(s.time)} · peak {fmt(s.stats.peakRate)}/s · {s.stats.ruptures} ruptures · {s.stats.leechesKilled} leeches slain
        </p>
      </div>
    </div>
  );
}

export function HelpPanel() {
  const set = useUI((u) => u.set);
  return (
    <div className="modal" onClick={() => set({ panel: 'none' })}>
      <div className="sheet help" onClick={(e) => e.stopPropagation()}>
        <h2>The Hollow</h2>
        <p>
          The <b>Heart</b> synthesises essence from what you feed it:
          <br />
          <code>E/s = M · (Π (1 + intake)^(weight·α) − 1)</code>
          <br />
          Each resource is a <i>multiplier on every other</i>. One fat line of ichor is weak; ichor <i>and</i> bile <i>and</i> vitriol is
          exponential.
        </p>
        <ul>
          <li><b>Tap</b> veins for ichor; fruit <b>spores</b> from spore beds.</li>
          <li><b>Conduits</b> carry one fluid at a time and have throughput limits. Drag to lay them.</li>
          <li><b>Digester</b>: 2 ichor → 1 bile. <b>Catalytic Womb</b>: 1 bile + 2 spore → 1 vitriol.</li>
          <li><b>Ganglion</b> splits a flow to every side not feeding it.</li>
        </ul>
        <h3>What kills you</h3>
        <ul>
          <li><b>Pressure</b> — anything backed up above 85% cracks and ruptures. Ruptures spill rot.</li>
          <li><b>Rot</b> breeds on stagnant or pressured structures and spreads along your network. Flowing structures flush it; bare rock is a firebreak. Cauterizers burn bile to scour it.</li>
          <li><b>Leeches</b> crawl from burrows, drain contents and gnaw integrity. Tap them to strike; Thorn Wards eat spores to impale them. Their strength follows your output.</li>
        </ul>
        <p className="sub">Seal a structure to stop it (valves, emergency shutdowns). Vent dumps contents — at the cost of rot.</p>
        <button className="act" onClick={() => { if (confirm('Erase everything and start over?')) { host.hardReset(); set({ panel: 'none' }); } }}>
          Erase save
        </button>
      </div>
    </div>
  );
}

export function OfflineModal() {
  const { offline, set } = useUI();
  if (!offline) return null;
  const gained = offline.essenceAfter.sub(offline.essenceBefore);
  return (
    <div className="modal" onClick={() => set({ offline: null })}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>While you slept</h2>
        <p className="sub">The cavern did not wait. {fmtTime(offline.seconds)} passed below.</p>
        <ul>
          <li>Essence {gained.gte(0) ? `+${fmt(gained)}` : `−${fmt(gained.neg())}`}</li>
          <li>{offline.waves} wave{offline.waves === 1 ? '' : 's'} · {offline.leechesKilled} leeches slain</li>
          <li className={offline.ruptures ? 'bad' : ''}>{offline.ruptures} rupture{offline.ruptures === 1 ? '' : 's'}</li>
        </ul>
        <button className="act" onClick={() => set({ offline: null })}>Descend</button>
      </div>
    </div>
  );
}
