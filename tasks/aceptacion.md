# Criterios de aceptación (§14) — mapa de evidencia

> Tarea 9.1. Fecha: 2026-10-16. Cada criterio de `tasks/Decisiones-Arquitectonicas-v1.md` §14 con **dónde está probado** y su estado.
> Regla de oro: un criterio solo está verde si hay una prueba que falla cuando el criterio se incumple. "Funciona en el navegador" no es un criterio de aceptación.

| # | Criterio | Prueba | Estado |
|---|---|---|---|
| 1 | Un tenant no puede consultar ni modificar datos privados de otro | `backups.test.ts` (ADMIN a otro tenant → 403; restore ajeno no afecta datos propios), `config.test.ts`, `catalog.test.ts`, `import-export.test.ts` (cross-tenant → 403) | ✅ |
| 2 | Una oferta por cada combinación válida de tenant, videojuego y plataforma | `import-export.test.ts` L234: `zelda` en `pc` y `ps4` → 2 ofertas con slugs derivados `zelda-pc` / `zelda-ps4`; L566 detecta duplicados de la **misma** combinación | ✅ |
| 3 | Los datos heredados y las personalizaciones se resuelven bien | `games.test.ts` → `describe('resolución de herencia (fase 4)')`: `resolved` con herencia efectiva, valores crudos conservados, `clearedFields` anula, catálogo vacío deja nulls | ✅ |
| 4 | Importadores idempotentes y que no borran por ausencia de campos | `import-export.test.ts`: "es idempotente: reimportar el mismo archivo no escribe nada", "no borra las ofertas de plataformas que el archivo no declara", "los null no borran datos buenos y los ausentes no cambian nada". `library-import.test.ts`: "no borra datos buenos: ausente o null no cambian nada" | ✅ |
| 5 | La biblioteca global no altera ofertas de los tenants | `library-import.test.ts`: "aplica create/update/skip con auditoría por registro y **sin tocar TenantGame**" | ✅ |
| 6 | Las migraciones conservan los registros y sus relaciones | **Sin test automático** (el fakeDb no ejecuta SQL). Verificado a mano en la BD de dev tras aplicar `20261017120000_fase8_tenant_deletedat`: 0 relaciones rotas en las 4 direcciones (juego→tenant, juego→plataforma, habilitación→tenant, habilitación→plataforma), 61 `BaseGame`, 8 `Platform`, 12 `TenantPlatform`, 2 `Tenant`, 2 `AdminUser`, 18 `Backup`. La migración solo añade columna nullable + índice | ⚠️ **manual** |
| 7 | Los errores de multimedia se identifican y se reintentan | `library-import.test.ts` L904 "reintenta una portada en ERROR y la deja en OK"; L747 agota los intentos y deja la portada en ERROR con aviso; L872 no vuelve a descargar si ya está OK | ✅ |
| 8 | Las operaciones privilegiadas quedan restringidas y auditadas | Auditoría en todos los módulos mutantes (`CREATE`/`UPDATE`/`DELETE`/`RESTORE` con `entity` PascalCase) + RBAC por `requireRoles`. **Revisión específica de los importadores en 9.3** | 🟡 parcial |
| 9 | Los respaldos y la recuperación se verifican | `backups.test.ts`: creation TENANT y PLATAFORMA, payload con datos del tenant, auditoría, restore, aislamiento entre tenants | ✅ |

## Cómo volver a verificarlo

```bash
cd backend
npx vitest run                                              # 803/803 cubre 1,2,3,4,5,7,9
npx prisma migrate status                                  # migraciones aplicadas, sin deriva
```

Para el criterio 6, la comprobación de integridad en la BD real es:

```sql
SELECT (SELECT count(*) FROM "TenantGame" g LEFT JOIN "Tenant" t ON t.id = g."tenantId" WHERE t.id IS NULL) AS juegos_sin_tenant,
       (SELECT count(*) FROM "TenantGame" g LEFT JOIN "Platform" p ON p.id = g."platformId" WHERE p.id IS NULL) AS juegos_sin_plataforma;
```

## Pendiente para cerrar 9.1 por completo

- [ ] Convertir el **criterio 8** en verde cerrado tras la revisión de 9.3 (RBAC de ambos importadores + aislamiento + SSRF).
- [ ] Decidir si el **criterio 6** se acepta como verificación manual documentada (recomendado: una migración SQL sobre datos reales no se puede probar con el fake) o si se añade una prueba de humo que aplique la migración contra una BD efímera. **Requiere decisión del usuario.**