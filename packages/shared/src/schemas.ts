import { z } from 'zod';

/**
 * Alle payloads die tussen app en server gaan. De server valideert hiermee,
 * de client leidt er zijn types uit af — één bron van waarheid.
 */

export const guestLoginSchema = z.object({
  deviceId: z.string().min(8).max(128),
  displayName: z.string().min(2).max(24).optional(),
});
export type GuestLoginInput = z.infer<typeof guestLoginSchema>;

export const nearbySpawnsSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  radius: z.number().min(10).max(400).default(160),
});
export type NearbySpawnsInput = z.infer<typeof nearbySpawnsSchema>;

export const collectSpawnSchema = z.object({
  spawnId: z.string().min(1).max(64),
  x: z.number().finite(),
  z: z.number().finite(),
});
export type CollectSpawnInput = z.infer<typeof collectSpawnSchema>;

export const sellItemsSchema = z.object({
  itemId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(9999),
});
export type SellItemsInput = z.infer<typeof sellItemsSchema>;

export const sellAllSchema = z.object({
  /** Alleen items met deze zeldzaamheid of lager verkopen. */
  maxRarity: z
    .enum(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'])
    .default('uncommon'),
});
export type SellAllInput = z.infer<typeof sellAllSchema>;

export const placementSchema = z.object({
  itemId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
});
export type PlacementInputDto = z.infer<typeof placementSchema>;

export const buyUpgradeSchema = z.object({
  upgradeId: z.string().min(1).max(64),
});
export type BuyUpgradeInput = z.infer<typeof buyUpgradeSchema>;

export const buyPropertySchema = z.object({
  propertyId: z.string().min(1).max(64),
});
export type BuyPropertyInput = z.infer<typeof buyPropertySchema>;

export const buyVehicleSchema = z.object({
  vehicleId: z.string().min(1).max(64),
});
export type BuyVehicleInput = z.infer<typeof buyVehicleSchema>;

export const equipVehicleSchema = buyVehicleSchema;

export const claimTierSchema = z.object({
  tier: z.number().int().min(1).max(200),
  track: z.enum(['free', 'premium']),
});
export type ClaimTierInput = z.infer<typeof claimTierSchema>;

export const claimQuestSchema = z.object({
  questId: z.string().min(1).max(64),
});
export type ClaimQuestInput = z.infer<typeof claimQuestSchema>;

export const reportPositionSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  /** Afgelegde afstand sinds de vorige melding, in meters. */
  distance: z.number().min(0).max(5_000),
});
export type ReportPositionInput = z.infer<typeof reportPositionSchema>;

// ---------------------------------------------------------------------------
// Antwoordtypes (geen runtime-validatie nodig, wel gedeelde types)
// ---------------------------------------------------------------------------

export interface SpawnDto {
  id: string;
  itemId: string;
  x: number;
  z: number;
  rarity: string;
  expiresAt: number;
  districtId: string;
}

export interface InventoryEntryDto {
  itemId: string;
  quantity: number;
}

export interface PlayerStateDto {
  player: {
    id: string;
    displayName: string;
    level: number;
    xp: number;
    xpIntoLevel: number;
    xpForNext: number;
    cash: number;
    gems: number;
    propertyId: string;
    vehicleId: string;
    ownedVehicleIds: string[];
    upgrades: Record<string, number>;
    x: number;
    z: number;
  };
  vault: {
    balance: number;
    capacity: number;
    accruedAt: number;
    ratePerHour: number;
    secondsUntilFull: number;
    cappedByTime: boolean;
  };
  stats: {
    incomePerHour: number;
    baseIncomePerHour: number;
    flexScore: number;
    flexMultiplier: number;
    vaultCapacity: number;
    offlineCapHours: number;
    inventorySlots: number;
    moveSpeed: number;
    pickupRadius: number;
  };
  inventory: InventoryEntryDto[];
  placements: InventoryEntryDto[];
  /** Servertijd in ms — de client synchroniseert hierop. */
  serverTime: number;
}

export interface CollectResultDto {
  itemId: string;
  quantity: number;
  xpGained: number;
  levelUp: boolean;
  level: number;
  inventoryFull: boolean;
}

export interface SeasonStateDto {
  season: { index: number; name: string; startsAt: number; endsAt: number };
  seasonXp: number;
  tier: number;
  xpIntoTier: number;
  xpForNextTier: number;
  premium: boolean;
  premiumPriceGems: number;
  claimedFree: number[];
  claimedPremium: number[];
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
