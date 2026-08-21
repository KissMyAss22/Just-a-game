-- Buit uit Het Verlaten Park die nog niet veilig is gesteld.
CREATE TABLE "ParkLoot" (
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ParkLoot_pkey" PRIMARY KEY ("playerId","itemId")
);

ALTER TABLE "ParkLoot" ADD CONSTRAINT "ParkLoot_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
