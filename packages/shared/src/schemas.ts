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

/** Een voorwerp in je woning neerzetten, op een echte plek. */
export const placeItemSchema = z.object({
  itemId: z.string().min(1).max(64),
  x: z.number().int().min(0).max(31),
  z: z.number().int().min(0).max(31),
  rotation: z.number().int().min(0).max(3).default(0),
});
export type PlaceItemInput = z.infer<typeof placeItemSchema>;

/** Iets wat al staat verplaatsen of draaien. */
export const moveItemSchema = z.object({
  placementId: z.string().min(1).max(64),
  x: z.number().int().min(0).max(31),
  z: z.number().int().min(0).max(31),
  rotation: z.number().int().min(0).max(3),
});
export type MoveItemInput = z.infer<typeof moveItemSchema>;

/** Terug in je rugzak. */
export const storeItemSchema = z.object({
  placementId: z.string().min(1).max(64),
});
export type StoreItemInput = z.infer<typeof storeItemSchema>;

/**
 * Wat er staat vervangen door iets uit je rugzak, op dezelfde plek.
 *
 * Dit kan ook met opbergen en daarna neerzetten, maar dan zijn het twee
 * verzoeken die allebei kunnen mislukken — en bij een volle woning lukt het
 * tweede niet meer omdat het eerste nog niet verwerkt is. Als één handeling
 * kan het niet halverwege stranden.
 */
export const swapItemSchema = z.object({
  placementId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
});
export type SwapItemInput = z.infer<typeof swapItemSchema>;

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

export const craftSchema = z.object({
  recipeId: z.string().min(1).max(64),
  /** Hoe vaak je het recept achter elkaar wilt uitvoeren. */
  times: z.number().int().min(1).max(50).default(1),
});
export type CraftInput = z.infer<typeof craftSchema>;

export const activateBoostSchema = z.object({
  boostId: z.string().min(1).max(64),
});
export type ActivateBoostInput = z.infer<typeof activateBoostSchema>;

export const appearanceSchema = z.object({
  skin: z.number().int().min(0).max(63),
  outfit: z.number().int().min(0).max(63),
  accent: z.number().int().min(0).max(63),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    appearance: appearanceSchema.optional(),
  })
  .refine((value) => value.displayName !== undefined || value.appearance !== undefined, {
    message: 'Geef een naam of een uiterlijk mee.',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const buyLegacyPerkSchema = z.object({
  perkId: z.string().min(1).max(64),
});
export type BuyLegacyPerkInput = z.infer<typeof buyLegacyPerkSchema>;

/**
 * Een rebirth gooit je hele voortgang weg. De client moet dat expliciet
 * bevestigen, zodat een losse POST nooit per ongeluk alles wist.
 */
export const rebirthSchema = z.object({
  confirm: z.literal(true),
});
export type RebirthInput = z.infer<typeof rebirthSchema>;

/**
 * Iets weggooien uit je rugzak.
 *
 * Bewust een aparte route en geen verkoop met opbrengst nul: weggooien levert
 * niets op en hoort dus niet in het grootboek, en het onderscheid maakt in de
 * logs meteen duidelijk of iemand iets kwijtraakte of verkocht.
 */
export const discardItemsSchema = z.object({
  itemId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(9999),
});
export type DiscardItemsInput = z.infer<typeof discardItemsSchema>;

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

export interface PlacedItemDto {
  id: string;
  itemId: string;
  x: number;
  z: number;
  rotation: number;
}

export interface ActiveBoostDto {
  boostId: string;
  /** Servertijd in ms waarop de boost afloopt. */
  expiresAt: number;
}

export interface PlayerStateDto {
  player: {
    id: string;
    displayName: string;
    /**
     * Je vaste seed. Bepaalt onder meer welke quests je krijgt en — sinds je
     * woning een pand in de stad is — welk huis van jou is. Geen geheim: alles
     * wat eruit volgt zie je toch al.
     */
    seed: number;
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
    appearance: { skin: number; outfit: number; accent: number };
    /** Erfenis die nog uit te geven is. */
    erfenis: number;
    /** Hoe vaak je al opnieuw begonnen bent. */
    rebirthCount: number;
    /** Alles wat je ooit hebt verdiend; wordt nooit gereset. */
    lifetimeEarned: number;
    /** Permanente voordelen: perk-id -> level. */
    legacy: Record<string, number>;
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
    /** Topsnelheid in je voertuig; ook het plafond waarop de server toetst. */
    moveSpeed: number;
    /** Hoe hard je loopt als je niet in je voertuig zit. */
    walkSpeed: number;
    pickupRadius: number;
    autoCollect: boolean;
    managerFee: number;
    doubleDropChance: number;
    legacyMultiplier: number;
    sellMultiplier: number;
    xpMultiplier: number;
    decorationBonus: number;
    slots: number;
  };
  inventory: InventoryEntryDto[];
  /**
   * Wat je in Het Verlaten Park hebt gevonden maar nog niet veilig hebt
   * gesteld. Loop je de landtong over naar de stad, dan verhuist dit naar je
   * rugzak.
   */
  parkLoot: InventoryEntryDto[];
  placements: PlacedItemDto[];
  activeBoosts: ActiveBoostDto[];
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

// ---------------------------------------------------------------------------
// Ontwikkelgereedschap
//
// Deze payloads horen bij de /dev-endpoints. Die zitten achter DEV_TOOLS=1 en
// weigeren dienst in productie, maar de invoer wordt hier net zo streng
// gevalideerd als de rest: een testknop die de server om zeep helpt is nog
// steeds een kapotte server.
// ---------------------------------------------------------------------------

/** Items in je rugzak toveren. Zonder itemId krijg je van álles. */
export const devGiveItemsSchema = z.object({
  itemId: z.string().min(1).max(64).optional(),
  quantity: z.number().int().min(1).max(999).default(1),
});
export type DevGiveItemsInput = z.infer<typeof devGiveItemsSchema>;

/** Valuta bijschrijven. Telt niet mee voor je levenslange opbrengst. */
export const devCurrencySchema = z
  .object({
    cash: z.number().int().min(0).max(1_000_000_000).default(0),
    gems: z.number().int().min(0).max(1_000_000).default(0),
    erfenis: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((value) => value.cash > 0 || value.gems > 0 || value.erfenis > 0, {
    message: 'Geef minstens één bedrag op.',
  });
export type DevCurrencyInput = z.infer<typeof devCurrencySchema>;

/** Direct naar een level springen, om te zien wat daar ontgrendelt. */
export const devLevelSchema = z.object({
  level: z.number().int().min(1).max(100),
});
export type DevLevelInput = z.infer<typeof devLevelSchema>;

/** Alle voertuigen erbij, en eventueel meteen een andere woning. */
export const devUnlockSchema = z.object({
  vehicles: z.boolean().default(true),
  propertyId: z.string().min(1).max(64).optional(),
});
export type DevUnlockInput = z.infer<typeof devUnlockSchema>;

/** Verspringen zonder dat de snelheidscontrole erover valt. */
export const devTeleportSchema = z
  .object({
    x: z.number().finite().optional(),
    z: z.number().finite().optional(),
    districtId: z.string().min(1).max(32).optional(),
  })
  .refine((value) => value.districtId !== undefined || (value.x !== undefined && value.z !== undefined), {
    message: 'Geef een wijk of een x/z op.',
  });
export type DevTeleportInput = z.infer<typeof devTeleportSchema>;

/**
 * De klok van je kluis vooruitzetten.
 *
 * Niet de echte servertijd — die blijft heilig. Dit zet alleen het moment
 * waarop voor het laatst is afgerekend naar het verleden, waarna de gewone
 * inkomstenberekening zijn werk doet. Zo test je offline-inkomen zonder een
 * nacht te wachten, én test je meteen de echte formule.
 */
export const devTimeSkipSchema = z.object({
  hours: z.number().min(0.25).max(72),
});
export type DevTimeSkipInput = z.infer<typeof devTimeSkipSchema>;

/** Items naast je neerleggen, zodat je het oprapen kunt testen. */
export const devSpawnSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
  count: z.number().int().min(1).max(40).default(12),
  radius: z.number().min(3).max(80).default(18),
});
export type DevSpawnInput = z.infer<typeof devSpawnSchema>;

/** Terug naar nul, om het spel als nieuwe speler te bekijken. */
export const devResetSchema = z.object({
  confirm: z.literal(true),
});
export type DevResetInput = z.infer<typeof devResetSchema>;
