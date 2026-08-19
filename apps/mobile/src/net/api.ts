import type {
  ActiveBoostDto,
  Appearance,
  CollectResultDto,
  InventoryEntryDto,
  PlayerStateDto,
  RecipeReadiness,
  SpawnDto,
} from '@game/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_KEY = 'jag.deviceId';
const TOKEN_KEY = 'jag.token';

/**
 * Waar draait de server?
 *
 * Staat EXPO_PUBLIC_API_URL in apps/mobile/.env, dan gebruiken we die. Anders
 * pakken we het IP van de Metro-bundler — dat is precies de computer waar ook
 * de server op draait, dus in de meeste gevallen werkt het zonder instellen.
 */
export function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured && configured.length > 0) return configured.replace(/\/+$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;

  return 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let token: string | null = null;

async function getDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_KEY, created);
  return created;
}

async function storeToken(value: string): Promise<void> {
  token = value;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  } catch {
    // SecureStore kan op sommige toestellen falen; dan maar in AsyncStorage.
    await AsyncStorage.setItem(TOKEN_KEY, value);
  }
}

async function loadToken(): Promise<string | null> {
  if (token) return token;
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    token = null;
  }
  if (!token) token = await AsyncStorage.getItem(TOKEN_KEY);
  return token;
}

async function request<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.auth !== false) {
    const bearer = await loadToken();
    if (bearer) headers.authorization = `Bearer ${bearer}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Kan de server niet bereiken op ${API_URL}. Staat hij aan en zit je telefoon op hetzelfde wifi?`,
      'network',
      0,
    );
  }

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload as { message?: string; error?: string } | null;
    throw new ApiError(
      error?.message ?? 'Er ging iets mis.',
      error?.error ?? 'unknown',
      response.status,
    );
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface LoginResult {
  token: string;
  playerId: string;
  displayName: string;
  serverTime: number;
}

export async function login(): Promise<LoginResult> {
  const deviceId = await getDeviceId();
  const result = await request<LoginResult>('/auth/guest', {
    body: { deviceId },
    auth: false,
  });
  await storeToken(result.token);
  return result;
}

/** Haalt de toestand op en logt automatisch opnieuw in als het token verlopen is. */
export async function fetchState(): Promise<PlayerStateDto> {
  try {
    return await request<PlayerStateDto>('/state');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await login();
      return request<PlayerStateDto>('/state');
    }
    throw error;
  }
}

export interface CityInfo {
  seed: number;
  cellSize: number;
  gridSize: number;
  hotDistrictId: string;
  districts: {
    id: string;
    name: string;
    tagline: string;
    bounds: [number, number, number, number];
    unlockLevel: number;
  }[];
  spawnCounts: Record<string, number>;
  serverTime: number;
}

export const fetchCity = () => request<CityInfo>('/world/city');

export const fetchSpawns = (x: number, z: number, radius = 200) =>
  request<{ spawns: SpawnDto[]; serverTime: number }>(
    `/world/spawns?x=${x.toFixed(2)}&z=${z.toFixed(2)}&radius=${Math.round(radius)}`,
  );

export interface CollectResponse extends CollectResultDto {
  name: string;
  rarity: string;
  icon: string;
  /** Waar door een boost een dubbele opbrengst uit kwam. */
  doubled: boolean;
  levelRewards: { cash: number; gems: number };
}

export const collectSpawn = (spawnId: string, x: number, z: number) =>
  request<CollectResponse>('/world/collect', { body: { spawnId, x, z } });

export const reportPosition = (x: number, z: number, distance: number) =>
  request<{ x: number; z: number; serverTime: number }>('/player/position', {
    body: { x, z, distance },
  });

export const collectVault = () =>
  request<{ collected: number; cash: number; state: PlayerStateDto }>(
    '/economy/vault/collect',
    { body: {} },
  );

export const sellAll = (maxRarity: string) =>
  request<{ earned: number; itemsSold: number; cash: number; inventory: InventoryEntryDto[] }>(
    '/economy/sell-all',
    { body: { maxRarity } },
  );

export const sellItem = (itemId: string, quantity: number) =>
  request<{ earned: number; cash: number; inventory: InventoryEntryDto[] }>('/economy/sell', {
    body: { itemId, quantity },
  });

/** Zonder x/z zoekt de server zelf de eerste vrije plek. */
export const placeItem = (
  itemId: string,
  spot?: { x: number; z: number; rotation: number },
) => request<PlayerStateDto>('/base/place', { body: { itemId, ...(spot ?? {}) } });

export const moveItem = (placementId: string, x: number, z: number, rotation: number) =>
  request<PlayerStateDto>('/base/move', { body: { placementId, x, z, rotation } });

export const storeItem = (placementId: string) =>
  request<PlayerStateDto>('/base/store', { body: { placementId } });

export interface ShopEntry {
  id: string;
  name: string;
  icon: string;
  price: number | null;
  affordable: boolean;
  [key: string]: unknown;
}

export interface ShopResponse {
  cash: number;
  upgrades: (ShopEntry & { description: string; level: number; maxLevel: number })[];
  properties: (ShopEntry & {
    tier: number;
    incomePerHour: number;
    slots: number;
    requiredLevel: number;
    owned: boolean;
    current: boolean;
    unlocked: boolean;
    price: number;
  })[];
  vehicles: (ShopEntry & {
    tier: number;
    speedMultiplier: number;
    carryBonus: number;
    requiredLevel: number;
    owned: boolean;
    current: boolean;
    unlocked: boolean;
    price: number;
  })[];
}

export const fetchShop = () => request<ShopResponse>('/shop');
export const buyUpgrade = (upgradeId: string) =>
  request<PlayerStateDto>('/shop/upgrade', { body: { upgradeId } });
export const buyProperty = (propertyId: string) =>
  request<PlayerStateDto>('/shop/property', { body: { propertyId } });
export const buyVehicle = (vehicleId: string) =>
  request<PlayerStateDto>('/shop/vehicle', { body: { vehicleId } });
export const equipVehicle = (vehicleId: string) =>
  request<PlayerStateDto>('/shop/vehicle/equip', { body: { vehicleId } });

export interface SeasonResponse {
  season: { index: number; name: string; startsAt: number; endsAt: number };
  seasonXp: number;
  tier: number;
  xpIntoTier: number;
  xpForNextTier: number;
  premium: boolean;
  premiumPriceGems: number;
  gems: number;
  claimedFree: number[];
  claimedPremium: number[];
  tiers: {
    tier: number;
    xpRequired: number;
    free: { kind: string; amount?: number; itemId?: string; vehicleId?: string }[];
    premium: { kind: string; amount?: number; itemId?: string; vehicleId?: string }[];
  }[];
  quests: {
    id: string;
    name: string;
    description: string;
    scope: 'daily' | 'weekly';
    target: number;
    progress: number;
    seasonXp: number;
    claimed: boolean;
    completed: boolean;
  }[];
  serverTime: number;
}

export const fetchSeason = () => request<SeasonResponse>('/season');

// --- craften ---------------------------------------------------------------

export interface RecipeEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  cashCost: number;
  requiredLevel: number;
  inputs: { itemId: string; quantity: number; name: string; icon: string }[];
  output: {
    itemId: string;
    quantity: number;
    name: string;
    icon: string;
    rarity: string;
    incomePerHour: number;
    flex: number;
  };
  readiness: RecipeReadiness;
}

export const fetchRecipes = () =>
  request<{ cash: number; level: number; recipes: RecipeEntry[] }>('/craft');

export const craft = (recipeId: string, times = 1) =>
  request<{
    crafted: { itemId: string; name: string; icon: string; rarity: string; quantity: number };
    state: PlayerStateDto;
  }>('/craft', { body: { recipeId, times } });

// --- boosts ----------------------------------------------------------------

export interface BoostEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  incomeBonus: number;
  spawnBonus: number;
  durationHours: number;
  priceGems: number;
  affordable: boolean;
}

export const fetchBoosts = () =>
  request<{
    gems: number;
    active: ActiveBoostDto[];
    catalog: BoostEntry[];
    serverTime: number;
  }>('/boosts');

export const buyBoost = (boostId: string) =>
  request<{ boostId: string; expiresAt: number; state: PlayerStateDto }>('/boost/buy', {
    body: { boostId },
  });

// --- rebirth ---------------------------------------------------------------

export interface LegacyPerkEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  level: number;
  maxLevel: number;
  cost: number | null;
  affordable: boolean;
}

export interface RebirthResponse {
  pending: number;
  hasLevel: boolean;
  hasGain: boolean;
  canRebirth: boolean;
  earningsNeeded: number;
  requiredLevel: number;
  minimumGain: number;
  level: number;
  lifetimeEarned: number;
  erfenis: number;
  rebirthCount: number;
  resets: string[];
  keeps: string[];
  bonuses: {
    income: number;
    sell: number;
    xp: number;
    offlineCapHours: number;
    moveSpeed: number;
    headstartCash: number;
  };
  perks: LegacyPerkEntry[];
  serverTime: number;
}

export const fetchRebirth = () => request<RebirthResponse>('/rebirth');

export const doRebirth = () =>
  request<{
    erfenisGained: number;
    headstart: number;
    rebirthCount: number;
    state: PlayerStateDto;
  }>('/rebirth', { body: { confirm: true } });

export const buyLegacyPerk = (perkId: string) =>
  request<{ perkId: string; level: number; state: PlayerStateDto }>('/rebirth/perk', {
    body: { perkId },
  });

// --- profiel ---------------------------------------------------------------

export const updateProfile = (input: { displayName?: string; appearance?: Appearance }) =>
  request<PlayerStateDto>('/player/profile', { body: input });
export const claimQuest = (questId: string) =>
  request<{ seasonXpGained: number; tier: number }>('/season/quest/claim', { body: { questId } });
export const claimTier = (tier: number, track: 'free' | 'premium') =>
  request<{ tier: number; track: string }>('/season/claim', { body: { tier, track } });
export const unlockPremium = () =>
  request<{ premium: boolean }>('/season/premium', { body: {} });
