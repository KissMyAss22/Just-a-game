/** Eén plek voor kleuren en maten, zodat de hele app hetzelfde aanvoelt. */
export const theme = {
  color: {
    bg: '#0b1020',
    bgSoft: '#131a2e',
    panel: 'rgba(14, 20, 38, 0.88)',
    panelSolid: '#131c33',
    border: 'rgba(120, 140, 190, 0.22)',
    text: '#e8edf9',
    textDim: '#93a0bd',
    accent: '#4dd4ac',
    accentDim: '#1f6f5c',
    cash: '#ffd166',
    gems: '#7ab8ff',
    danger: '#ff6b6b',
    xp: '#8b7dff',
  },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  space: (n: number) => n * 4,
} as const;

export const rarityColor: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#38bdf8',
  epic: '#c084fc',
  legendary: '#fbbf24',
  mythic: '#fb7185',
};
