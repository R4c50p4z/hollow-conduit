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
