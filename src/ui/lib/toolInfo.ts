import * as C from '../../sim/config';
import * as F from '../../sim/formulas';
import type { Kind, Mutations } from '../../sim';

/**
 * What a structure does at tier 0 with the current mutations, as numbers for the build-bar hint.
 * Pure (tested against formulas.ts); the UI turns it into text with `tool.<kind>`.
 */
export function toolInfo(kind: Kind, m: Mutations): Record<string, number> {
  const thr = (k: 'conduit' | 'router') => F.conduitThroughput(k, 0, 0, m);
  switch (kind) {
    case 'tap':
    case 'sporangium':
      return { rate: F.extractionRate(kind, 0, 1, 0, m) };
    case 'conduit':
    case 'reservoir':
    case 'junction':
      return { thr: thr('conduit'), cap: F.storeCap(kind, 0, m) };
    case 'router':
      return { thr: thr('router') };
    case 'digester': {
      const crafts = F.craftRate('digester', 0, 0, m);
      const wombBile = F.craftRate('reactor', 0, 0, m) * C.RECIPES.reactor.in[2];
      return { inIchor: crafts * C.RECIPES.digester.in[0], outBile: crafts * C.RECIPES.digester.out[2], wombBile };
    }
    case 'reactor': {
      const crafts = F.craftRate('reactor', 0, 0, m);
      return { inBile: crafts * C.RECIPES.reactor.in[2], inSpore: crafts * C.RECIPES.reactor.in[1], outVit: crafts * C.RECIPES.reactor.out[3] };
    }
    case 'ward':
      return { burn: C.WARD_BURN, dps: C.WARD_DPS };
    case 'cauterizer':
      return { burn: C.CAUTERIZER_BURN, clean: C.CAUTERIZER_CLEANSE };
    case 'mender':
      return { burn: C.MENDER_BURN, heal: C.MENDER_HEAL * 100 };
    default:
      return {};
  }
}
