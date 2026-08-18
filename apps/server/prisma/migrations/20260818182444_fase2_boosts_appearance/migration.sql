-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "appearance" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "PlayerBoost" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "boostId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerBoost_playerId_expiresAt_idx" ON "PlayerBoost"("playerId", "expiresAt");

-- AddForeignKey
ALTER TABLE "PlayerBoost" ADD CONSTRAINT "PlayerBoost_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
