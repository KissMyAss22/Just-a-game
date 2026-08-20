import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { QUALITY_LEVELS, type QualityLevel } from '../game3d/city/quality';

/**
 * Instellingen die op het toestel horen en niet bij het spelaccount.
 *
 * Grafische kwaliteit is een eigenschap van de telefoon, niet van de speler:
 * dezelfde speler op een andere telefoon wil een andere stand. Daarom staat
 * dit lokaal en niet op de server.
 */

const SLEUTEL = 'instellingen.kwaliteit';
const SLEUTEL_SNELHEID = 'instellingen.loopboost';
const SLEUTEL_VLIEGEN = 'instellingen.vliegen';

/** De standen van de loopsnelheidsknop in het ontwikkelgereedschap. */
export const WALK_BOOSTS = [1, 2, 4, 8] as const;
export type WalkBoost = (typeof WALK_BOOSTS)[number];

interface SettingsState {
  quality: QualityLevel;
  /** Pas na het laden weten we de echte stand; daarvoor niets tekenen. */
  loaded: boolean;
  /**
   * Ontwikkelgereedschap. Alleen zinvol met DEV_TOOLS=1 op je eigen server:
   * zonder dat duwt de snelheidscontrole je gewoon terug.
   */
  walkBoost: WalkBoost;
  fly: boolean;
  load: () => Promise<void>;
  setQuality: (quality: QualityLevel) => Promise<void>;
  setWalkBoost: (boost: WalkBoost) => Promise<void>;
  setFly: (fly: boolean) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  quality: 'normaal',
  loaded: false,
  walkBoost: 1,
  fly: false,
  async load() {
    try {
      const [stored, boost, fly] = await Promise.all([
        AsyncStorage.getItem(SLEUTEL),
        AsyncStorage.getItem(SLEUTEL_SNELHEID),
        AsyncStorage.getItem(SLEUTEL_VLIEGEN),
      ]);
      const parsed = Number(boost);
      set({
        quality:
          stored && (QUALITY_LEVELS as string[]).includes(stored)
            ? (stored as QualityLevel)
            : 'normaal',
        walkBoost: (WALK_BOOSTS as readonly number[]).includes(parsed)
          ? (parsed as WalkBoost)
          : 1,
        fly: fly === '1',
        loaded: true,
      });
      return;
    } catch {
      // Opslag stuk of vol: dan draaien we gewoon op de standaardstanden.
    }
    set({ loaded: true });
  },
  async setQuality(quality) {
    set({ quality });
    try {
      await AsyncStorage.setItem(SLEUTEL, quality);
    } catch {
      // Niet kunnen bewaren is vervelend maar niet fataal.
    }
  },

  async setWalkBoost(boost) {
    set({ walkBoost: boost });
    try {
      await AsyncStorage.setItem(SLEUTEL_SNELHEID, String(boost));
    } catch {
      // Zie hierboven.
    }
  },

  async setFly(fly) {
    set({ fly });
    try {
      await AsyncStorage.setItem(SLEUTEL_VLIEGEN, fly ? '1' : '0');
    } catch {
      // Zie hierboven.
    }
  },
}));
