/**
 * Grafische kwaliteit in drie standen.
 *
 * Een telefoon van vier jaar oud en een nieuwe iPhone zitten een factor tien
 * uit elkaar. In plaats van te mikken op het midden — en het op allebei matig
 * te doen — is dit één knop die de dure dingen aan- en uitzet: schaduwen,
 * antialiasing, hoe ver je kijkt en hoeveel straatmeubilair er staat.
 */
export type QualityLevel = 'laag' | 'normaal' | 'hoog';

export interface QualitySettings {
  label: string;
  hint: string;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /** Hoe ver de schaduwcamera om de speler heen reikt, in meters. */
  shadowRadius: number;
  /** Verste zichtafstand van de camera. */
  far: number;
  fogNear: number;
  fogFar: number;
  /** Vermenigvuldiger op het bereik van straatmeubilair. */
  propRange: number;
  /** Werpt straatmeubilair ook schaduw? */
  propShadows: boolean;
  /** Beeldpunten per scherm-pixel; onder 1 rendert hij kleiner en schaalt op. */
  pixelRatio: number;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  laag: {
    label: 'Laag',
    hint: 'Vloeiend op oudere toestellen. Geen schaduwen.',
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    shadowRadius: 50,
    far: 320,
    fogNear: 60,
    fogFar: 280,
    propRange: 0.6,
    propShadows: false,
    pixelRatio: 1,
  },
  normaal: {
    label: 'Normaal',
    hint: 'De aanbevolen stand: schaduwen aan, ruime zichtafstand.',
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 70,
    far: 420,
    fogNear: 100,
    fogFar: 400,
    propRange: 1,
    propShadows: false,
    pixelRatio: 1,
  },
  hoog: {
    label: 'Hoog',
    hint: 'Scherpste schaduwen en de meeste details. Vraagt het meest.',
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 90,
    far: 520,
    fogNear: 140,
    fogFar: 500,
    propRange: 1.25,
    propShadows: true,
    pixelRatio: 1,
  },
};

export const QUALITY_LEVELS: QualityLevel[] = ['laag', 'normaal', 'hoog'];
