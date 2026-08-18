import { getItem, type Appearance, type PlayerStateDto, type SpawnDto } from '@game/shared';
import { create } from 'zustand';
import * as api from '../net/api';
import { playerPosition, setPlayerPosition, travelBuffer } from './position';

export interface Toast {
  id: number;
  text: string;
  detail?: string;
  color?: string;
}

type Status = 'boot' | 'ready' | 'error';

interface GameStore {
  status: Status;
  error: string | null;
  state: PlayerStateDto | null;
  city: api.CityInfo | null;
  spawns: SpawnDto[];
  toasts: Toast[];
  /** serverTime - Date.now(); de app rekent nooit met de eigen klok. */
  clockOffset: number;
  busy: boolean;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  syncSpawns: () => Promise<void>;
  pushPosition: () => Promise<void>;
  collect: (spawn: SpawnDto) => Promise<void>;
  claimVault: () => Promise<void>;
  sellAll: (maxRarity: string) => Promise<void>;
  place: (itemId: string, quantity: number) => Promise<void>;
  unplace: (itemId: string, quantity: number) => Promise<void>;
  craft: (recipeId: string, times?: number) => Promise<boolean>;
  buyBoost: (boostId: string) => Promise<boolean>;
  saveProfile: (input: { displayName?: string; appearance?: Appearance }) => Promise<boolean>;
  rebirth: () => Promise<boolean>;
  buyLegacyPerk: (perkId: string) => Promise<boolean>;
  applyState: (state: PlayerStateDto) => void;
  toast: (text: string, detail?: string, color?: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;
/** Spawns waarvoor al een verzoek loopt, zodat we niet dubbel oppakken. */
const inFlight = new Set<string>();

export const useGame = create<GameStore>((set, get) => ({
  status: 'boot',
  error: null,
  state: null,
  city: null,
  spawns: [],
  toasts: [],
  clockOffset: 0,
  busy: false,

  applyState(state) {
    set({ state, clockOffset: state.serverTime - Date.now() });
  },

  toast(text, detail, color) {
    const toast: Toast = { id: ++toastId, text, detail, color };
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    setTimeout(() => get().dismissToast(toast.id), 2600);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async boot() {
    set({ status: 'boot', error: null });
    try {
      await api.login();
      const [state, city] = await Promise.all([api.fetchState(), api.fetchCity()]);
      setPlayerPosition(state.player.x, state.player.z);
      set({ state, city, status: 'ready', clockOffset: state.serverTime - Date.now() });
      await get().syncSpawns();
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Onbekende fout.',
      });
    }
  },

  async refresh() {
    try {
      const state = await api.fetchState();
      get().applyState(state);
    } catch (error) {
      if (error instanceof api.ApiError && error.code === 'network') return;
      get().toast('Verversen mislukt', error instanceof Error ? error.message : undefined);
    }
  },

  async syncSpawns() {
    try {
      const { spawns } = await api.fetchSpawns(playerPosition.x, playerPosition.z, 220);
      set({ spawns });
    } catch {
      // Stilzwijgend: de volgende ronde probeert het opnieuw.
    }
  },

  async pushPosition() {
    const distance = travelBuffer.meters;
    if (distance < 1) return;
    travelBuffer.meters = 0;
    try {
      await api.reportPosition(playerPosition.x, playerPosition.z, distance);
    } catch {
      // Niet erg: de server gebruikt dit alleen als referentiepunt.
    }
  },

  async collect(spawn) {
    if (inFlight.has(spawn.id)) return;
    inFlight.add(spawn.id);
    // Meteen uit beeld halen; voelt direct, en de server is de baas.
    set((s) => ({ spawns: s.spawns.filter((entry) => entry.id !== spawn.id) }));

    try {
      const result = await api.collectSpawn(spawn.id, playerPosition.x, playerPosition.z);
      get().toast(
        `${result.icon} ${result.name}${result.doubled ? ' x2' : ''}`,
        result.doubled ? `dubbele opbrengst · +${result.xpGained} xp` : `+${result.xpGained} xp`,
        result.rarity,
      );
      if (result.levelUp) {
        get().toast(`Level ${result.level}!`, `+${result.levelRewards.cash} cash`, 'legendary');
      }
      await get().refresh();
    } catch (error) {
      if (error instanceof api.ApiError) {
        // 'spawn_gone' is normaal: iemand anders was sneller, of hij verliep.
        if (error.code !== 'spawn_gone') get().toast(error.message);
        if (error.code === 'inventory_full') {
          get().toast('Rugzak vol', 'Verkoop of plaats items in je base', 'danger');
        }
      }
    } finally {
      inFlight.delete(spawn.id);
    }
  },

  async claimVault() {
    if (get().busy) return;
    set({ busy: true });
    try {
      const result = await api.collectVault();
      get().applyState(result.state);
      get().toast('Kluis geleegd', `+${result.collected}`, 'legendary');
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async sellAll(maxRarity) {
    if (get().busy) return;
    set({ busy: true });
    try {
      const result = await api.sellAll(maxRarity);
      get().toast('Verkocht', `${result.itemsSold} items voor ${result.earned}`, 'legendary');
      await get().refresh();
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async place(itemId, quantity) {
    if (get().busy) return;
    set({ busy: true });
    try {
      const state = await api.placeItem(itemId, quantity);
      get().applyState(state);
      get().toast(`${getItem(itemId).name} geplaatst`, undefined, 'uncommon');
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async unplace(itemId, quantity) {
    if (get().busy) return;
    set({ busy: true });
    try {
      const state = await api.unplaceItem(itemId, quantity);
      get().applyState(state);
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async craft(recipeId, times = 1) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const result = await api.craft(recipeId, times);
      get().applyState(result.state);
      get().toast(
        `${result.crafted.icon} ${result.crafted.name}`,
        `${result.crafted.quantity}x gemaakt`,
        result.crafted.rarity,
      );
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Craften mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async buyBoost(boostId) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const result = await api.buyBoost(boostId);
      get().applyState(result.state);
      get().toast('Boost actief', undefined, 'legendary');
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async rebirth() {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const result = await api.doRebirth();
      get().applyState(result.state);
      get().toast(
        `Rebirth #${result.rebirthCount}`,
        `+${result.erfenisGained} erfenis${result.headstart > 0 ? ` en ${result.headstart} startkapitaal` : ''}`,
        'legendary',
      );
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Rebirth mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async buyLegacyPerk(perkId) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      const result = await api.buyLegacyPerk(perkId);
      get().applyState(result.state);
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async saveProfile(input) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      get().applyState(await api.updateProfile(input));
      get().toast('Profiel opgeslagen', undefined, 'uncommon');
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Opslaan mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },
}));

/** Handig in schermen die alleen de speler nodig hebben. */
export const usePlayer = () => useGame((s) => s.state?.player ?? null);
export const useStats = () => useGame((s) => s.state?.stats ?? null);
