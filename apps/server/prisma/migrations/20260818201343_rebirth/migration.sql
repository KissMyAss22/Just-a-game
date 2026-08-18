-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "erfenis" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "erfenisClaimed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifetimeEarned" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "rebirthCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerLegacy" (
    "playerId" TEXT NOT NULL,
    "perkId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerLegacy_pkey" PRIMARY KEY ("playerId","perkId")
);

-- AddForeignKey
ALTER TABLE "PlayerLegacy" ADD CONSTRAINT "PlayerLegacy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
