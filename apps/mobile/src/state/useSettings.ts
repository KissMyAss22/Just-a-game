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

interface SettingsState {
  quality: QualityLevel;
  /** Pas na het laden weten we de echte stand; daarvoor niets tekenen. */
  loaded: boolean;
  load: () => Promise<void>;
  setQuality: (quality: QualityLevel) => Promise<void>;
}

export const useSettings = create<SettingsState>((set) => ({
  quality: 'normaal',
  loaded: false,
  async load() {
    try {
      const stored = await AsyncStorage.getItem(SLEUTEL);
      if (stored && (QUALITY_LEVELS as string[]).includes(stored)) {
        set({ quality: stored as QualityLevel, loaded: true });
        return;
      }
    } catch {
      // Opslag stuk of vol: dan draaien we gewoon op de standaardstand.
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
}));
