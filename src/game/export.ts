import Decimal from 'break_eternity.js';
import type { SimState } from '../sim';
import { snapshot } from '../sim';

/**
 * Statistics export for offline analysis: a JSON dump of every counter/record/run and a CSV of
 * the time series. Delivered through the Web Share sheet when available (iOS: save to Files,
 * AirDrop, Numbers…), otherwise as a download, otherwise copied to the clipboard.
 */

const plain = (v: unknown): unknown => {
  if (v instanceof Decimal) return v.lt(1e300) ? v.toNumber() : v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

export function statsJson(s: SimState): string {
  const snap = snapshot(s);
  return JSON.stringify(
    plain({
      exportedAt: new Date().toISOString(),
      game: 'hollow-conduit',
      saveVersion: s.version,
      depth: s.depth,
      cycleTime: s.time,
      essence: s.essence,
      ratePerSecond: s.rate,
      runEssence: s.runEssence,
      totalEssence: s.totalEssence,
      mutagen: s.mutagen,
      mutations: s.mutations,
      achievements: s.achievements,
      intake: s.intake,
      live: { ...snap, bottlenecks: snap.bottlenecks },
      cycle: s.stats.run,
      allTime: s.stats.life,
      records: {
        peakRate: s.stats.peakRate,
        peakEssence: s.stats.peakEssence,
        peakIntake: s.stats.peakIntake,
        peakLeeches: s.stats.peakLeeches,
        bestRate: s.stats.bestRate,
        metamorphoses: s.stats.metamorphoses,
        mutagenEarned: s.stats.mutagenEarned,
        fastestMeta: s.stats.fastestMeta,
        longestRun: s.stats.longestRun,
        offlineSeconds: s.stats.offlineSeconds,
        sessions: s.stats.sessions,
      },
      cycles: s.stats.runs,
    }),
    null,
    2,
  );
}

export function historyCsv(s: SimState): string {
  const h = s.stats.history;
  const head = ['t_s', 'rate_log10', 'essence_log10', 'intake_ichor', 'intake_spore', 'intake_bile', 'intake_vitriol', 'rot_avg', 'pressure_avg', 'integrity_avg', 'leeches', 'structures'];
  const rows = h.t.map((t, i) =>
    [t, h.rateLog[i], h.essenceLog[i], h.intake[0][i], h.intake[1][i], h.intake[2][i], h.intake[3][i], h.rot[i], h.pressure[i], h.integrity[i], h.leeches[i], h.structures[i]].join(','),
  );
  return [head.join(','), ...rows].join('\n');
}

export function cyclesCsv(s: SimState): string {
  const head = ['n', 'depth', 'duration_s', 'peak_rate_log10', 'essence_log10', 'mutagen', 'ruptures', 'kills', 'waves', 'ended_at_s'];
  const rows = s.stats.runs.map((r, i) => [i + 1, r.depth, r.duration.toFixed(1), r.peakRateLog.toFixed(3), r.essenceLog.toFixed(3), r.mutagen, r.ruptures, r.kills, r.waves, r.endedAt.toFixed(0)].join(','));
  return [head.join(','), ...rows].join('\n');
}

export type ExportResult = 'shared' | 'downloaded' | 'copied' | 'failed';

export async function exportFile(name: string, mime: string, text: string): Promise<ExportResult> {
  try {
    const file = new File([text], name, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
  } catch {
    /* fall through */
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
