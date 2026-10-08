-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('COVER', 'SHOT');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('OK', 'PENDING', 'ERROR', 'ORPHAN');

-- CreateTable
CREATE TABLE "GameMedia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT,
    "publicId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'OK',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameMedia_tenantId_gameId_idx" ON "GameMedia"("tenantId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMedia_cover_key" ON "GameMedia"("tenantId", "gameId") WHERE "kind" = 'COVER';

-- CreateIndex
CREATE UNIQUE INDEX "GameMedia_shot_sortOrder_key" ON "GameMedia"("tenantId", "gameId", "sortOrder") WHERE "kind" = 'SHOT';

-- AddForeignKey
ALTER TABLE "GameMedia" ADD CONSTRAINT "GameMedia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMedia" ADD CONSTRAINT "GameMedia_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "TenantGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddConstraint: sortOrder de media siempre dentro del rango permitido (0..3)
ALTER TABLE "GameMedia" ADD CONSTRAINT "GameMedia_sortOrder_range" CHECK ("sortOrder" BETWEEN 0 AND 3);
