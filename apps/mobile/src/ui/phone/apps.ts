/**
 * Wat er op de telefoon staat.
 *
 * Bewust een lijst en geen vast rijtje knoppen in de opmaak. Er komt nog van
 * alles bij — een bank, berichten, een voertuig laten voorrijden — en dat moet
 * één regel zijn, geen verbouwing van het scherm.
 */

export type PhoneAppId =
  | 'city'
  | 'map'
  | 'nearby'
  | 'base'
  | 'craft'
  | 'shop'
  | 'pass'
  | 'profile';

export interface PhoneAppDef {
  id: PhoneAppId;
  name: string;
  icon: string;
  /**
   * Waar de app naartoe gaat. Een `route` verlaat de telefoon en opent een
   * bestaand scherm; zonder route opent hij ín de telefoon.
   */
  route?: string;
  /** Vanaf welk spelerlevel hij werkt. Ontbreekt = altijd. */
  requiredLevel?: number;
  /** Korte regel onder het icoon in het vergrendelde geval. */
  locked?: string;
}

export const PHONE_APPS: readonly PhoneAppDef[] = [
  // Eerst, want dit is de weg terug naar het spel. Zonder deze app zit je op
  // het base-scherm vast: de tabbalk die je daar vandaan haalde is weg.
  { id: 'city', name: 'Stad', icon: '🌆', route: '/(game)/city' },
  { id: 'map', name: 'Kaart', icon: '🗺️' },
  { id: 'nearby', name: 'In de buurt', icon: '👥' },
  { id: 'base', name: 'Base', icon: '🏠', route: '/(game)/base' },
  { id: 'craft', name: 'Werkbank', icon: '🪚', route: '/(game)/craft' },
  { id: 'shop', name: 'Winkel', icon: '🛒', route: '/(game)/shop' },
  { id: 'pass', name: 'Seizoen', icon: '🎟️', route: '/(game)/pass' },
  { id: 'profile', name: 'Opties', icon: '⚙️', route: '/(game)/profile' },
] as const;
