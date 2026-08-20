/**
 * Waar je staat in je woning.
 *
 * Apart van `playerPosition`, want dat is je plek in de stad. Zou het één
 * object zijn, dan zou een rondje door je appartement je positie buiten
 * overschrijven — en de server denkt daar iets van.
 *
 * Buiten React, om dezelfde reden als de rest: dit verandert elke frame.
 */
export const homePosition = { x: 0, z: 0, facing: 0 };

/**
 * De cel waar je naar kijkt, en of daar iets neergezet mag worden.
 *
 * De 3D-laag rekent dit elke frame uit; het scherm leest het op zijn eigen
 * tempo, want een teller die zestig keer per seconde hertekent is niet af te
 * lezen en kost de hele HUD.
 */
export const homeFocus: {
  cell: { x: number; z: number } | null;
  /** Het voorwerp waar je voor staat, als dat er is. */
  placementId: string | null;
} = { cell: null, placementId: null };
