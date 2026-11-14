import Decimal from 'break_eternity.js';
import * as C from './config';
import * as F from './formulas';
import type { Command, CommandResult, Kind, SimState } from './types';
import { newBuilding, pushEvent, resetRun, tileAt } from './world';

const fail = (reason: string): CommandResult => ({ ok: false, reason });
const OK: CommandResult = { ok: true };

function spend(s: SimState, cost: Decimal): boolean {
  if (s.essence.lt(cost)) return false;
  s.essence = s.essence.sub(cost);
  return true;
}

export const cleanseCost = (s: SimState) =>
  Decimal.max(C.CLEANSE_MIN_COST, s.rate.mul(C.CLEANSE_SECONDS_OF_OUTPUT)).floor();

export function repairCost(s: SimState, x: number, y: number): Decimal {
  const b = tileAt(s, x, y)?.building;
  if (!b) return new Decimal(0);
  return Decimal.max(1, b.invested.mul(C.REPAIR_FRACTION).mul(1 - b.integrity)).ceil();
}

export function upgradeCost(s: SimState, x: number, y: number): Decimal | null {
  const b = tileAt(s, x, y)?.building;
  return b ? F.tierCost(b.kind, b.tier) : null;
}

export const nextBuildCost = (s: SimState, kind: Kind) => F.buildCost(kind, s.built[kind]);

export function canPlace(s: SimState, x: number, y: number, kind: Kind): string | null {
  const t = tileAt(s, x, y);
  if (!t) return 'Out of bounds';
  if (t.building) return 'Occupied';
  if (t.terrain === 'burrow') return 'A burrow — nothing takes root here';
  const need = C.KINDS[kind].terrain;
  if (t.terrain !== need) return `${C.KINDS[kind].name} needs ${need}`;
  if (t.rot >= C.ROT_NO_BUILD) return 'Too rotten — cleanse first';
  return null;
}

/** Apply a player command. All mutation of SimState from the UI goes through here. */
export function applyCommand(s: SimState, cmd: Command): CommandResult {
  switch (cmd.t) {
    case 'build': {
      if (cmd.kind === 'heart') return fail('There is only one Heart');
      const why = canPlace(s, cmd.x, cmd.y, cmd.kind);
      if (why) return fail(why);
      const cost = nextBuildCost(s, cmd.kind);
      if (!spend(s, cost)) return fail('Not enough essence');
      tileAt(s, cmd.x, cmd.y)!.building = newBuilding(cmd.kind, cmd.dir, cost);
      s.built[cmd.kind]++;
      return OK;
    }
    case 'rotate': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b || b.kind === 'heart') return fail('Nothing to rotate');
      b.dir = ((b.dir + 1) % 4) as typeof b.dir;
      return OK;
    }
    case 'demolish': {
      const t = tileAt(s, cmd.x, cmd.y);
      const b = t?.building;
      if (!t || !b || b.kind === 'heart') return fail('Nothing to demolish');
      // Contents spill on demolition: you can't dodge a pressure crisis for free.
      if (b.store.some((v) => v > 0.01) || b.out.some((v) => v > 0.01)) t.rot = Math.min(1, t.rot + C.VENT_ROT);
      s.essence = s.essence.add(b.invested.mul(C.REFUND_FRACTION));
      s.built[b.kind] = Math.max(0, s.built[b.kind] - 1);
      t.building = null;
      return OK;
    }
    case 'upgrade': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b) return fail('Nothing to upgrade');
      const cost = F.tierCost(b.kind, b.tier);
      if (!spend(s, cost)) return fail('Not enough essence');
      b.tier++;
      b.invested = b.invested.add(cost);
      return OK;
    }
    case 'repair': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b || b.integrity >= 1) return fail('Nothing to repair');
      if (!spend(s, repairCost(s, cmd.x, cmd.y))) return fail('Not enough essence');
      b.integrity = 1;
      return OK;
    }
    case 'vent': {
      const t = tileAt(s, cmd.x, cmd.y);
      const b = t?.building;
      if (!t || !b || b.kind === 'heart') return fail('Nothing to vent');
      b.store = [0, 0, 0, 0];
      b.out = [0, 0, 0, 0];
      t.rot = Math.min(1, t.rot + C.VENT_ROT);
      return OK;
    }
    case 'cleanse': {
      const t = tileAt(s, cmd.x, cmd.y);
      if (!t || t.rot <= 0) return fail('No rot here');
      if (!spend(s, cleanseCost(s))) return fail('Not enough essence');
      t.rot = 0;
      return OK;
    }
    case 'toggle': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b || b.kind === 'heart') return fail('Nothing to seal');
      b.enabled = !b.enabled;
      return OK;
    }
    case 'strike': {
      const here = s.leeches.filter((l) => l.x === cmd.x && l.y === cmd.y);
      if (!here.length) return fail('No leech');
      here.sort((a, b) => a.hp - b.hp)[0].hp -= F.strikeDamage(s.mutations);
      return OK;
    }
    case 'mutate': {
      const lvl = s.mutations[cmd.id];
      if (lvl >= C.MUTATIONS[cmd.id].max) return fail('Fully mutated');
      const cost = F.mutationCost(cmd.id, lvl);
      if (s.mutagen.lt(cost)) return fail('Not enough mutagen');
      s.mutagen = s.mutagen.sub(cost);
      s.mutations[cmd.id]++;
      return OK;
    }
    case 'metamorphose': {
      const gain = F.mutagenYield(s.runEssence, s.depth);
      if (gain.lte(0)) return fail(`Requires ${C.META_THRESHOLD.toExponential(0)} essence this cycle`);
      s.mutagen = s.mutagen.add(gain);
      s.depth++;
      const seed = (s.seed * 1664525 + 1013904223) >>> 0;
      resetRun(s, seed);
      pushEvent(s, { kind: 'metamorphosis', msg: `Metamorphosis → depth ${s.depth}. +${gain.toString()} mutagen` });
      return OK;
    }
  }
}
