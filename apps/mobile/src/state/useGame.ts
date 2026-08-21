import { formatMoney, getItem, type Appearance, type PlayerStateDto, type SpawnDto } from '@game/shared';
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
  /** Onbereikbaar ("netwerk") of wél antwoord maar met een fout ("server"). */
  errorKind: 'netwerk' | 'server' | null;
  state: PlayerStateDto | null;
  city: api.CityInfo | null;
  spawns: SpawnDto[];
  toasts: Toast[];
  /** serverTime - Date.now(); de app rekent nooit met de eigen klok. */
  clockOffset: number;
  busy: boolean;
  /**
   * Staat het testgereedschap aan op de server (`DEV_TOOLS=1`)?
   *
   * Dit hoort hier en niet in `useSettings`: het is geen voorkeur van de speler
   * maar een eigenschap van de server waar je mee praat. Daarmee is er ook maar
   * één plek waar die regel staat — de knop onderin en het dev-scherm lezen
   * allebei dít, en kunnen dus niet uit elkaar gaan lopen.
   *
   * Staat hij uit, dan verschijnt de knop niet. Een speler ziet dus nooit een
   * knop die niet voor hem is.
   */
  devEnabled: boolean;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  syncSpawns: () => Promise<void>;
  /**
   * Meldt je positie aan de server. `force` stuurt hem ook als je nauwelijks
   * bewogen hebt — nodig vlak voor een handeling die op je positie wordt
   * getoetst.
   */
  pushPosition: (force?: boolean) => Promise<void>;
  collect: (spawn: SpawnDto) => Promise<void>;
  claimVault: () => Promise<void>;
  sellAll: (maxRarity: string) => Promise<void>;
  /** Eén stapel (of een deel daarvan) verkopen. */
  sellItem: (itemId: string, quantity: number) => Promise<void>;
  /** Eén stapel (of een deel daarvan) weggooien; levert niets op. */
  discardItem: (itemId: string, quantity: number) => Promise<void>;
  place: (itemId: string, spot?: { x: number; z: number; rotation: number }) => Promise<boolean>;
  moveItem: (placementId: string, x: number, z: number, rotation: number) => Promise<boolean>;
  storeItem: (placementId: string) => Promise<boolean>;
  /** Vervangt wat er staat door iets uit je rugzak, op dezelfde plek. */
  swapItem: (placementId: string, itemId: string) => Promise<boolean>;
  craft: (recipeId: string, times?: number) => Promise<boolean>;
  buyBoost: (boostId: string) => Promise<boolean>;
  saveProfile: (input: { displayName?: string; appearance?: Appearance }) => Promise<boolean>;
  /** Een woning kopen. Kan alleen als je voor de deur staat. */
  buyProperty: (propertyId: string) => Promise<boolean>;
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
  errorKind: null,
  error: null,
  state: null,
  city: null,
  spawns: [],
  toasts: [],
  clockOffset: 0,
  busy: false,
  devEnabled: false,

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
    set({ status: 'boot', error: null, errorKind: null });
    try {
      await api.login();
      const [state, city] = await Promise.all([api.fetchState(), api.fetchCity()]);
      setPlayerPosition(state.player.x, state.player.z);
      set({ state, city, status: 'ready', clockOffset: state.serverTime - Date.now() });
      // Apart, en met een eigen vangnet: een server zonder deze route of met een
      // fout erop mag het opstarten niet tegenhouden. Lukt het niet, dan is er
      // gewoon geen dev-knop — dat is de veilige kant om op te falen.
      void api
        .fetchDevStatus()
        .then((dev) => set({ devEnabled: dev.enabled }))
        .catch(() => set({ devEnabled: false }));
      await get().syncSpawns();
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Onbekende fout.',
        // Of de server onbereikbaar is of juist antwoordt met een fout maakt
        // voor het zoeken alle verschil: het eerste is je netwerk, het tweede
        // niet. Zonder dit onderscheid stuurde het opstartscherm je bij een
        // serverfout de wifi-instellingen in, en daar was niets te vinden.
        errorKind: error instanceof api.ApiError && error.code === 'network' ? 'netwerk' : 'server',
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

  async pushPosition(force = false) {
    const distance = travelBuffer.meters;
    if (!force && distance < 1) return;
    travelBuffer.meters = 0;
    try {
      const result = await api.reportPosition(playerPosition.x, playerPosition.z, distance);
      // Landtong over met buit uit het park: die is nu veilig. Dat moet je
      // wél te horen krijgen — het is het moment waar de hele wandeling om
      // draait.
      if (result.banked > 0) {
        get().toast('Buit veilig', `${result.banked} uit het park in je rugzak`, 'legendary');
        await get().refresh();
      }
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
        // In het park is het nog geen bezit: dat moet je meteen weten, anders
        // denk je dat het al binnen is en loop je door.
        result.inPark
          ? 'nog niet veilig · loop terug naar de stad'
          : result.doubled
            ? `dubbele opbrengst · +${result.xpGained} xp`
            : `+${result.xpGained} xp`,
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
      // De server toetst of je bij een pandjeshuis staat, en gebruikt daarvoor
      // de positie die hij zelf heeft opgeslagen. Die komt maar elke twee
      // seconden binnen — bij looptempo is dat zo acht meter achterstand, en
      // dan sta je de verkoper aan te kijken terwijl hij zegt dat je te ver
      // weg bent. Vandaar eerst bijwerken.
      await get().pushPosition(true);
      const result = await api.sellAll(maxRarity);
      get().toast('Verkocht', `${result.itemsSold} items voor ${result.earned}`, 'legendary');
      await get().refresh();
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async sellItem(itemId, quantity) {
    if (get().busy) return;
    set({ busy: true });
    try {
      // Zie sellAll: de server kijkt naar zijn eigen kopie van je positie.
      await get().pushPosition(true);
      const item = getItem(itemId);
      const result = await api.sellItem(itemId, quantity);
      get().toast(`${quantity}x ${item.name} verkocht`, formatMoney(result.earned), item.rarity);
      // Verkopen raakt cash én rugzak; een verse toestand is goedkoper dan
      // hier twee losse velden bijhouden.
      await get().refresh();
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async discardItem(itemId, quantity) {
    if (get().busy) return;
    set({ busy: true });
    try {
      const result = await api.discardItem(itemId, quantity);
      get().applyState(result.state);
      get().toast(`${quantity}x ${getItem(itemId).name} weggegooid`);
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
    } finally {
      set({ busy: false });
    }
  },

  async buyProperty(propertyId) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      // De server toetst of je voor de deur staat aan de hand van zijn eigen
      // kopie van je positie; die eerst bijwerken. Zie sellItem.
      await get().pushPosition(true);
      get().applyState(await api.buyProperty(propertyId));
      get().toast('Verhuisd', 'Je spullen zijn mee', 'legendary');
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async place(itemId, spot) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      get().applyState(await api.placeItem(itemId, spot));
      get().toast(`${getItem(itemId).name} neergezet`, undefined, 'uncommon');
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async moveItem(placementId, x, z, rotation) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      get().applyState(await api.moveItem(placementId, x, z, rotation));
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async storeItem(placementId) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      get().applyState(await api.storeItem(placementId));
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async swapItem(placementId, itemId) {
    if (get().busy) return false;
    set({ busy: true });
    try {
      get().applyState(await api.swapItem(placementId, itemId));
      return true;
    } catch (error) {
      get().toast(error instanceof Error ? error.message : 'Mislukt');
      return false;
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
