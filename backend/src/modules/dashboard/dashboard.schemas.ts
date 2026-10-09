import { z } from 'zod';

export const dashboardQuerySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export interface DashboardData {
  totalGames: number;
  availableGames: number;
  unavailableGames: number;
  libraryGames: number;
  customGames: number;
  mediaErrors: number;
  orphanMedia: number;
  activeSessions: number;
  recentAuditEvents: number;
  catalogVersion: number | null;
}
