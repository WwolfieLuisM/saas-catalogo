-- CreateEnum
CREATE TYPE "SizeUnit" AS ENUM ('MB', 'GB', 'TB');

-- CreateEnum
CREATE TYPE "Origin" AS ENUM ('BIBLIOTECA', 'PERSONALIZADO');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('RULE', 'MANUAL');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Genre" ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Platform" ALTER COLUMN "tenantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "BaseGame" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sizeValue" DOUBLE PRECISION NOT NULL,
    "sizeUnit" "SizeUnit" NOT NULL,
    "releaseYear" INTEGER,
    "categoryId" TEXT,
    "minimumRequirements" JSONB,
    "recommendedRequirements" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantGame" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "baseGameId" TEXT,
    "origin" "Origin" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceMode" "PriceMode" NOT NULL DEFAULT 'RULE',
    "price" DECIMAL(65,30),
    "availability" BOOLEAN NOT NULL DEFAULT true,
    "sizeValue" DOUBLE PRECISION NOT NULL,
    "sizeUnit" "SizeUnit" NOT NULL,
    "releaseYear" INTEGER,
    "categoryId" TEXT,
    "minimumRequirements" JSONB,
    "recommendedRequirements" JSONB,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TenantGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseGameGenre" (
    "baseGameId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "BaseGameGenre_pkey" PRIMARY KEY ("baseGameId","genreId")
);

-- CreateTable
CREATE TABLE "BaseGamePlatform" (
    "baseGameId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "BaseGamePlatform_pkey" PRIMARY KEY ("baseGameId","platformId")
);

-- CreateTable
CREATE TABLE "TenantGameGenre" (
    "tenantGameId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,

    CONSTRAINT "TenantGameGenre_pkey" PRIMARY KEY ("tenantGameId","genreId")
);

-- CreateTable
CREATE TABLE "GamePlatform" (
    "tenantGameId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "GamePlatform_pkey" PRIMARY KEY ("tenantGameId","platformId")
);

-- CreateIndex
CREATE UNIQUE INDEX "BaseGame_slug_key" ON "BaseGame"("slug");

-- CreateIndex
CREATE INDEX "BaseGame_deletedAt_idx" ON "BaseGame"("deletedAt");

-- CreateIndex
CREATE INDEX "TenantGame_tenantId_deletedAt_idx" ON "TenantGame"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantGame_tenantId_slug_key" ON "TenantGame"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantGame_tenantId_baseGameId_key" ON "TenantGame"("tenantId", "baseGameId");

-- AddForeignKey
ALTER TABLE "BaseGame" ADD CONSTRAINT "BaseGame_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantGame" ADD CONSTRAINT "TenantGame_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantGame" ADD CONSTRAINT "TenantGame_baseGameId_fkey" FOREIGN KEY ("baseGameId") REFERENCES "BaseGame"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantGame" ADD CONSTRAINT "TenantGame_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseGameGenre" ADD CONSTRAINT "BaseGameGenre_baseGameId_fkey" FOREIGN KEY ("baseGameId") REFERENCES "BaseGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseGameGenre" ADD CONSTRAINT "BaseGameGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseGamePlatform" ADD CONSTRAINT "BaseGamePlatform_baseGameId_fkey" FOREIGN KEY ("baseGameId") REFERENCES "BaseGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaseGamePlatform" ADD CONSTRAINT "BaseGamePlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantGameGenre" ADD CONSTRAINT "TenantGameGenre_tenantGameId_fkey" FOREIGN KEY ("tenantGameId") REFERENCES "TenantGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantGameGenre" ADD CONSTRAINT "TenantGameGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_tenantGameId_fkey" FOREIGN KEY ("tenantGameId") REFERENCES "TenantGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlatform" ADD CONSTRAINT "GamePlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique indexes: global taxonomy slugs (tenantId IS NULL). Prisma @@unique
-- cannot express WHERE clauses; Postgres NULLS DISTINCT would otherwise allow
-- duplicate slugs among global rows.
CREATE UNIQUE INDEX "Category_global_slug_key" ON "Category"("slug") WHERE "tenantId" IS NULL;

CREATE UNIQUE INDEX "Genre_global_slug_key" ON "Genre"("slug") WHERE "tenantId" IS NULL;

CREATE UNIQUE INDEX "Platform_global_slug_key" ON "Platform"("slug") WHERE "tenantId" IS NULL;

-- Check: origin BIBLIOTECA requires baseGameId, PERSONALIZADO forbids it.
ALTER TABLE "TenantGame" ADD CONSTRAINT "TenantGame_origin_baseGameId_check" CHECK (
    ("origin" = 'BIBLIOTECA') = ("baseGameId" IS NOT NULL)
);
