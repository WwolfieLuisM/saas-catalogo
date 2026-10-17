-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- Index
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");