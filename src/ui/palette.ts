/** Shared colours between canvas and CSS. Sepia ink base, bioluminescent accents. */
export const P = {
  void: '#07060a',
  ink: '#0b0907',
  rock: '#15110d',
  rockHi: '#211a14',
  hatch: 'rgba(217, 207, 191, 0.05)',
  bone: '#d9cfbf',
  sepia: '#8a7a63',
  dim: '#4a4036',
  ichor: '#c11f35',
  spore: '#d9a441',
  bile: '#a3b13a',
  vitriol: '#c9c2ff',
  rot: '#4f6a25',
  rotDeep: '#22300f',
  danger: '#ff3b3b',
  essence: '#f0e3c4',
} as const;

export const RES_COLOR = [P.ichor, P.spore, P.bile, P.vitriol] as const;

/**
 * Chart variants of the resource colours, validated with the dataviz palette checker on the
 * panel surface (#120e0b, dark): lightness band, chroma floor, ≥3:1 contrast and adjacent-pair
 * normal-vision ΔE ≥ 15 all pass; adjacent CVD ΔE is 7.3 (warn band), so every use carries
 * direct labels. Red↔green fails CVD as an *all-pairs* set, so per-resource time series are
 * drawn as small multiples (one series per chart) rather than four overlapping lines.
 */
export const CHART_RES = ['#e0465a', '#c9821f', '#3a9e6e', '#8a7cf0'] as const;
/** Single-series line colour for non-resource metrics. */
export const CHART_INK = '#e8dcc0';
