-- Van "aantal per soort" naar "één rij per voorwerp, met een echte plek".
--
-- Bestaande inrichting blijft behouden: een rij met aantal 3 wordt drie rijen.
-- Posities komen op (0,0) te staan; het seed-script legt ze daarna netjes neer
-- met findFreeSpot(), want alleen daar is de plattegrond van elke woning bekend.

-- 1. De oude sleutel los, zodat er meerdere rijen per item kunnen bestaan.
ALTER TABLE "Placement" DROP CONSTRAINT "Placement_pkey";

-- 2. Nieuwe kolommen.
ALTER TABLE "Placement" ADD COLUMN "id" TEXT;
ALTER TABLE "Placement" ADD COLUMN "x" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Placement" ADD COLUMN "z" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Placement" ADD COLUMN "rotation" INTEGER NOT NULL DEFAULT 0;

-- 3. Elk extra exemplaar krijgt zijn eigen rij.
INSERT INTO "Placement" ("playerId", "itemId", "quantity", "x", "z", "rotation")
SELECT p."playerId", p."itemId", 1, 0, 0, 0
FROM "Placement" p, generate_series(2, GREATEST(p."quantity", 1)) AS s
WHERE p."quantity" > 1;

-- 4. Iedereen een eigen id, dat wordt de nieuwe sleutel.
UPDATE "Placement" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "Placement" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_pkey" PRIMARY KEY ("id");

-- 5. Rijen zonder inhoud hebben nu geen betekenis meer.
DELETE FROM "Placement" WHERE "quantity" <= 0;
ALTER TABLE "Placement" DROP COLUMN "quantity";

-- 6. Opzoeken per speler.
CREATE INDEX "Placement_playerId_idx" ON "Placement"("playerId");
