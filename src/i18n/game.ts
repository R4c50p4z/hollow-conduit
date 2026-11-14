import Decimal from 'break_eternity.js';
import type { CommandResult, GameEvent, Kind, MutationId, Terrain } from '../sim';
import { fmt } from '../ui/format';
import { t } from './index';

/** Game-specific translation helpers: turn codes from the sim into player-facing text. */

export const kindName = (k: Kind) => t(`kind.${k}.name`);
export const kindShort = (k: Kind) => t(`kind.${k}.short`);
export const kindBlurb = (k: Kind) => t(`kind.${k}.blurb`);
export const resName = (r: number) => t(`res.${['ichor', 'spore', 'bile', 'vitriol'][r]}`);
export const terrainName = (tr: Terrain) => t(`terrain.${tr}`);
export const mutName = (id: MutationId) => t(`mut.${id}.name`);
export const mutBlurb = (id: MutationId) => t(`mut.${id}.blurb`);
export const achName = (id: string) => t(`ach.${id}.name`);
export const achDesc = (id: string) => t(`ach.${id}.desc`);

export function reasonText(r: CommandResult): string {
  if (r.ok) return '';
  const p = { ...(r.params ?? {}) } as Record<string, string | number>;
  if (typeof p.kind === 'string') p.kind = kindName(p.kind as Kind);
  if (typeof p.terrain === 'string') p.terrain = terrainName(p.terrain as Terrain).toLowerCase();
  if (p.need !== undefined) p.need = fmt(new Decimal(p.need));
  return t(`reason.${r.reason}`, p);
}

export function eventText(e: GameEvent): string {
  const p = { ...(e.params ?? {}) } as Record<string, string | number>;
  switch (e.kind) {
    case 'rupture':
      return t(p.cause === 'leech' ? 'ev.rupture.leech' : 'ev.rupture', { kind: kindName(p.kind as Kind) });
    case 'metamorphosis':
      return t('ev.metamorphosis', { depth: p.depth, gain: fmt(new Decimal(p.gain ?? 0), 0) });
    case 'achievement':
      return t('ev.achievement', { name: achName(String(p.id)) });
    default:
      return t(`ev.${e.kind}`, p);
  }
}
