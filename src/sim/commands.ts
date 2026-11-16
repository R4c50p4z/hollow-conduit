import Decimal from 'break_eternity.js';
import * as C from './config';
import { contentsOf } from './engine';
import * as F from './formulas';
import { closeRun, count, countE, countKind, countRes } from './stats';
import type { Command, CommandResult, EventParams, Kind, ReasonCode, SimState } from './types';
import { newBuilding, pushEvent, resetRun, tileAt } from './world';

const fail = (reason: ReasonCode, params?: EventParams): CommandResult => ({ ok: false, reason, params });
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

/** Why `kind` can't go at (x,y), or null if it can. */
export function canPlace(s: SimState, x: number, y: number, kind: Kind): CommandResult | null {
  const t = tileAt(s, x, y);
  if (!t) return fail('outOfBounds');
  if (t.building) return fail('occupied');
  if (t.terrain === 'burrow') return fail('burrow');
  const need = C.KINDS[kind].terrain;
  if (t.terrain !== need) return fail('needsTerrain', { kind, terrain: need });
  if (t.rot >= C.ROT_NO_BUILD) return fail('tooRotten');
  return null;
}

function spill(s: SimState, x: number, y: number) {
  const b = tileAt(s, x, y)!.building!;
  const c = contentsOf(b);
  for (let r = 0; r < 4; r++) countRes(s, 'spilled', r, c[r]);
  return c.some((v) => v > 0.01);
}

/** Apply a player command. All mutation of SimState from the UI goes through here. */
export function applyCommand(s: SimState, cmd: Command): CommandResult {
  switch (cmd.t) {
    case 'build': {
      if (cmd.kind === 'heart') return fail('oneHeart');
      const why = canPlace(s, cmd.x, cmd.y, cmd.kind);
      if (why) return why;
      const cost = nextBuildCost(s, cmd.kind);
      if (!spend(s, cost)) return fail('noEssence', { cost: cost.toString() });
      tileAt(s, cmd.x, cmd.y)!.building = newBuilding(cmd.kind, cmd.dir, cost, s.time);
      s.built[cmd.kind]++;
      count(s, 'built');
      countKind(s, 'builtByKind', cmd.kind);
      countE(s, 'spentBuild', cost);
      return OK;
    }
    case 'rotate': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b || b.kind === 'heart') return fail('nothingThere');
      b.dir = ((b.dir + 1) % 4) as typeof b.dir;
      count(s, 'rotations');
      return OK;
    }
    case 'demolish': {
      const t = tileAt(s, cmd.x, cmd.y);
      const b = t?.building;
      if (!t || !b || b.kind === 'heart') return fail('nothingThere');
      // Contents spill on demolition: you can't dodge a pressure crisis for free.
      if (spill(s, cmd.x, cmd.y)) t.rot = Math.min(1, t.rot + C.VENT_ROT);
      const refund = b.invested.mul(C.REFUND_FRACTION);
      s.essence = s.essence.add(refund);
      countE(s, 'refunded', refund);
      s.built[b.kind] = Math.max(0, s.built[b.kind] - 1);
      t.building = null;
      count(s, 'razed');
      return OK;
    }
    case 'upgrade': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b) return fail('nothingThere');
      const cost = F.tierCost(b.kind, b.tier);
      if (!spend(s, cost)) return fail('noEssence', { cost: cost.toString() });
      b.tier++;
      b.invested = b.invested.add(cost);
      count(s, 'upgrades');
      countE(s, 'spentUpgrade', cost);
      return OK;
    }
    case 'repair': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b) return fail('nothingThere');
      if (b.integrity >= 1) return fail('healthy');
      const cost = repairCost(s, cmd.x, cmd.y);
      if (!spend(s, cost)) return fail('noEssence', { cost: cost.toString() });
      b.integrity = 1;
      count(s, 'repairs');
      countE(s, 'spentRepair', cost);
      return OK;
    }
    case 'vent': {
      const t = tileAt(s, cmd.x, cmd.y);
      const b = t?.building;
      if (!t || !b || b.kind === 'heart') return fail('nothingThere');
      spill(s, cmd.x, cmd.y);
      b.store = [0, 0, 0, 0];
      b.out = [0, 0, 0, 0];
      if (b.lanes) for (const l of b.lanes) l.fill(0);
      t.rot = Math.min(1, t.rot + C.VENT_ROT);
      count(s, 'vents');
      return OK;
    }
    case 'cleanse': {
      const t = tileAt(s, cmd.x, cmd.y);
      if (!t || t.rot <= 0) return fail('noRot');
      const cost = cleanseCost(s);
      if (!spend(s, cost)) return fail('noEssence', { cost: cost.toString() });
      count(s, 'rotCleansed', t.rot);
      count(s, 'cleanses');
      countE(s, 'spentCleanse', cost);
      t.rot = 0;
      return OK;
    }
    case 'toggle': {
      const b = tileAt(s, cmd.x, cmd.y)?.building;
      if (!b || b.kind === 'heart') return fail('nothingThere');
      b.enabled = !b.enabled;
      count(s, 'seals');
      return OK;
    }
    case 'strike': {
      const here = s.leeches.filter((l) => l.x === cmd.x && l.y === cmd.y && l.hp > 0);
      if (!here.length) return fail('noLeech');
      const l = here.sort((a, b) => a.hp - b.hp)[0];
      const dmg = Math.min(l.hp, F.strikeDamage(s.mutations));
      l.hp -= dmg;
      l.lastHit = 'strike';
      count(s, 'strikes');
      count(s, 'strikeDamage', dmg);
      return OK;
    }
    case 'mutate': {
      const lvl = s.mutations[cmd.id];
      if (lvl >= C.MUTATIONS[cmd.id].max) return fail('maxed');
      const cost = F.mutationCost(cmd.id, lvl);
      if (s.mutagen.lt(cost)) return fail('noMutagen');
      s.mutagen = s.mutagen.sub(cost);
      s.mutations[cmd.id]++;
      return OK;
    }
    case 'endGrace': {
      s.graceUntil = 0;
      return OK;
    }
    case 'metamorphose': {
      const gain = F.mutagenYield(s.runEssence, s.depth);
      if (gain.lte(0)) return fail('metaThreshold', { need: C.META_THRESHOLD });
      closeRun(s, gain);
      s.mutagen = s.mutagen.add(gain);
      if (cmd.descend !== false) s.depth++;
      const seed = (s.seed * 1664525 + 1013904223) >>> 0;
      resetRun(s, seed);
      pushEvent(s, { kind: 'metamorphosis', params: { depth: s.depth, gain: gain.toString() } });
      return OK;
    }
  }
}
