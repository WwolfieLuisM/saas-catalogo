# Active Context

## Date
2026-10-16

## Current Focus
**Fase 6.2-B cerrada** (importador de catálogo `catalog@2` + export migrado a `@2`). Gates verdes: backend 775/775 · `tsc` con **4** errores (los de Fase 6, bajados de 7) · eslint `src tests` 0 · frontend typecheck/lint 89 tests/build OK. **Próximo bloque: 6.2-C** (modelo de lectura del panel + botón que ejecute `/import/run` + cierre de los 4 `tsc` de `platformId`). El árbol sigue **sin commitear** salvo que el usuario lo pida en esta sesión.

## Recent Changes
- **Fase 5 (V2) completa 2026-10-15/16:** `library-import@2` (validate/import/SSRF/UI 5.1–5.5) + revisión en navegador (arregló el `fetch` crudo sin `/api/v1` que rompía exportar catálogo, exportar manifiesto e importar, y el `.brand` recortado).
- **6.2-A 2026-10-16:** envelope `@2` exigido; `catalog@1` y manifiesto rechazados con 400 `CATALOG_SCHEMA_UNSUPPORTED`.
- **6.2-B 2026-10-16 (esta sesión):** reescritura de `data-transfer.service.ts` al modelo de ofertas por plataforma.
  - **El spec se escribió antes que el código:** `import-export.test.ts` reescrito entero (53 tests), RED con 29 fallos, y solo entonces el servicio.
  - **Corrección importante al estado anterior:** los tests **no** estaban migrados a `@2` (solo las cadenas `schema` y el helper `offer()`); los cuerpos tenían campos v1 y había **15 tests en rojo**. La nota de `todo.md` que decía lo contrario era inexacta.
  - `analyzeEntries` → `analyzeOffers` (`catalogOfferSchema`, strictObject): identidad `(tenantId, baseGameId, platformId)` (único en BD) con fallback `(platformId, slug)` para ofertas antiguas sin `baseGameId`; plataformas **globales** (`tenantId: null`) + `TenantPlatform.enabled`; `slug` derivado `<base>-<platform>` con error si supera 50; `origin` derivado y reparado; `clearedFields` que reemplaza; `null`/ausentes no borran; `SIZE_PAIR_INVALID`; taxonomía fuera del import (se hereda de biblioteca vía `resolveGenres`/`resolveFinal`); **retiradas acotadas a las plataformas declaradas en el archivo**; `platformId` escrito en el create (cierra 3 de los 7 `tsc`).
  - Export migrado a `catalog@2`: payload estrictamente importable (sin `tenantId`/`tenant`/`version`/`games[]`), **valores crudos** (herencia no se convierte en copia), `skipped`/`notice` informativos → **roundtrip exportar→importar cerrado** (0 cambios, con test).
  - Gates: **backend 775/775** · `tsc` solo 4 (`seed.ts:246`, `games.service.ts:471,563,900` → 6.2-C) · eslint 0 · frontend typecheck 0, lint 0 (1 warning preexistente de fuentes), 89/89 tests, build OK.

## Active Decisions
- §12 completa (8 decisiones) — `plan-detallado.md` §12, `dudas.md` §8.
- **2026-10-16 (6.2-B), documentadas en `tasks/catalog-import-contrato.md` §2.1.1/§4.1/§4.2/§5.1:**
  1. **Retiradas acotadas a las plataformas del archivo.** El importador sigue siendo espejo, pero un archivo de PC no borra PS4/Xbox; las de plataformas no declaradas se conservan con aviso quantificado. Un `offers: []` no hace nada.
  2. **El export@2 excluye las ofertas que no puede representar** (sin `baseGameId` o plataforma no global) a `skipped` con motivo, en vez de emitirlas y romper su propio roundtrip.
  3. **La identidad de una oferta no se renombra nunca**: `slug` explícito distinto del de la fila emparejada → aviso y se ignora (renombrar cambia la ruta pública). Slug de otra oferta o de una personalizada → error de registro. Identidad ocupada por una oferta retirada → error pidiendo restaurarla.
  4. **`clearedFields` presente reemplaza** la lista completa (única forma de dejar de limpiar un campo); ausente → no cambia.
  5. **`origin` se recalcula y se repara**: `BIBLIOTECA` solo sin overrides ni `clearedFields`; nunca degrada a `BIBLIOTECA`.
  6. Ausentes y `null` **no** borran (a diferencia del panel, donde `description: null` significa heredar); limpiar es con `clearedFields`.
- Decisiones previas que siguen vigentes: `publishFromLibrary` sigue sin decidir (¿herencia pura en vez de copia?); `clearedFields` en `TenantGame`; slug único `(tenantId, platformId, slug)`; ACTIVE exige título+slug+desc+≥1 plataforma+≥1 size+portada; taxonomía desconocida = error por registro sin auto-crear.
- Orden: plataforma → respaldos → limpieza → herencia → importador A → importador B → TenantPlatform → tenants → validación → **generador al final**.

## Next Steps
1. **6.2-C:** modelo de lectura del panel (ofertas con plataforma y origen visibles) + **botón que ejecute `/import/run`** (hoy `configuracion/datos` solo llama a `/import/validate`: el roundtrip es técnico pero no operable) + cierre de los 4 `tsc` (`seed.ts:246`, `games.service.ts:471,563,900`).
2. **Commit:** el usuario autorizó commitear al cerrar 6.2-B en verde; **no se ha hecho todavía** (no volver a preguntar si lo pide explícitamente; sin push nunca).
3. Follow-ups post-4.4: mostrar `resolved?.title` en list/detail admin; `media.auditMedia` usa título raw; `game.shared.ts` tiene **acentos corruptos ya commiteados** (en el mensaje de `slugSchema` y en los de `assertTaxonomyRefs`): es texto visible al usuario.
4. Decisión `publishFromLibrary` + demo/revisión humana del checkpoint de Fase 4 (sigue pendiente).

## Open Questions / Blockers
- **CRUD manual (`games.service` creates) bajo Modelo A → 6.2-C:** son los 4 `tsc` restantes.
- El panel **no tiene** botón de importar catálogo (bloquea la operabilidad del importador B desde la UI).
- BUG-01.D pendiente de decisión. `LibraryMedia = 0` (sin portadas biblioteca — coherente con 12.7 exigiéndolas en imports).
- Recordatorios: rutas públicas por slug (12.2) revisar al llegar datos; contract 4.5 solo con bake time; generador = última OC.

## Session Notes
Reglas del usuario: skills según encaje · dudas cruciales antes de seguir · memory-bank+progress al final de sesión o fase · testear cada tarea · "continue" = seguir sin preguntar salvo blocker · migraciones destructivas siempre con aprobación explícita · sin push/commit sin permiso (6.2-B: commit autorizado al cerrar en verde) · NO comentarios en código · NO tocar `docs/` · NO commitear `.gitignore`/`backend/scripts/`/ADMIN · NO imprimir secretos · repo Market-Place-Moa intocado. **Lección repetida:** al tocar un fichero UTF-8 usar `edit`/`write`; un `git checkout` ya se llevó trabajo sin commitear una vez.