# Plan detallado v1 — Arquitectura por plataforma, migración, herencia e importadores

**Estado:** aprobado el 2026-10-14 — **§12 cerrada (ver abajo)**. Ejecutar por fases con checkpoint humano.
**Autoridad:** `tasks/Decisiones-Arquitectonicas-v1.md` (decisiones cerradas).
**Orden:** `tasks/generador-impprtador.md` (arquitectura → respaldo → migración → herencia → importadores → generador al final).
**Legado:** `tasks/plan.md` (fases 0–2 completadas; 3–5 rediseñadas aquí).
**Registro vivo de dudas:** `tasks/dudas.md`. Checklist ejecutable: `tasks/todo.md`.

---

## 0. Reglas de trabajo (acordadas con el usuario)

- **0.1 Skills:** cargar la skill que encaje con cada tarea (planning, memory-bank, TDD, debugging, security, etc.).
- **0.2 Dudas antes de seguir:** cada fase que arranque con una decisión sin cerrar → **preguntar antes** de implementar.
- **0.3 Memory-bank + progress:** leer al inicio de sesión; actualizar `memory-bank/activeContext.md` y `memory-bank/progress.md` al final de cada fase/sesión.
- **0.4 Testear siempre:** cada tarea se cierra con sus tests; gates al verde por fase:
  - Backend: `npx vitest run` + `npx tsc --noEmit`.
  - Frontend: `npx tsc --noEmit` + `npm run lint` + `npm run test` + `npm run build` + `npm run cf:build`.
- **0.5 Migraciones:** `neon_prepare_database_migration` (rama temp) → verificar con `run_sql` → **preguntar siempre** → `complete_database_migration`. Nunca autónomo.
- **0.6 Sin** push / deploy / commit sin aprobación previa. Convencional commits en español.
- **0.7 Expand/contract:** solo añadir en migraciones grandes; retirar columnas solo en fase contract (despliegue separado y posterior).
- **0.8 Nada destructivo** sin respaldo verificado y procedimiento de reversión (Decisiones §8).

---

## Índice de fases

| Fase | Nombre | Estado §12 | Ejecución |
|---|---|---|---|
| 1 | Modelo por plataforma (schema) | ✅ 12.1–12.4 cerradas | ✅ 2026-10-15 |
| 2 | Respaldos y recuperación | ✅ 12.5 cerrada | ✅ 2026-10-15 |
| 3 | Limpieza y arranque limpio de ofertas (ex-57) | ✅ 12.3: **borrar y empezar limpio** | ✅ 2026-10-15 (tsc → 4/6) |
| 4 | Herencia y personalización (Fase 3 legada rediseñada) | ✅ 12.1 cerrada | — |
| 5 | Importador de biblioteca global | ✅ 12.6–12.8 cerradas | — |
| 6 | Importador de catálogo por tenant (adaptado) | ✅ | — |
| 7 | TenantPlatform + admin global de plataformas | ✅ 12.4 cerrada | — |
| 8 | Gestión de tenants (Fase 5 legada) | — | — |
| 9 | Validación final y criterios de aceptación | — | — |
| 10 | Generador (otra OC) — el último | — | — |

Checkpoint humano al final de cada fase (revisión con el usuario antes de continuar).

---

## Fase 1 — Modelo por plataforma (schema expand)

**Objetivo:** schema que soporte: datos por plataforma en biblioteca, oferta por plataforma en tenant, plataformas habilitadas por tenant.

### Tarea 1.1: ~~Cerrar dudas cruciales §12.1–12.4~~ ✅ cerrada 2026-10-14
- **Decisiones:** 12.1 = `clearedFields` Json · 12.2 = unique `(tenantId, platformId, slug)` · 12.3 = borrar las ofertas de Javier y empezar limpio · 12.4 = migrar `ps4` a global.
- **Scope:** XS (docs).

### Tarea 1.2: Schema Prisma expand (aditivo, sin romper)
- **Descripción:** añadir sin eliminar nada:
  - `BaseGamePlatform`: `sizeValue Float?`, `sizeUnit SizeUnit?`, `minimumRequirements Json?`, `recommendedRequirements Json?`, `procedencia Json?` (fuente, fecha, id externo, confianza — Decisiones §7).
  - `TenantGame`: `platformId String?` (nullable, expand — se vuelve NOT NULL en Fase 3 con la tabla vacía), columnas copiadas → se dejan como están aquí (nullable las pone la Fase 3), `clearedFields Json?` (12.1).
  - Modelo `TenantPlatform(tenantId, platformId, enabled)` con unique `(tenantId, platformId)`.
  - **Conservar** uniques legados `@@unique([tenantId, slug])` y `@@unique([tenantId, baseGameId])` hasta la Fase 3 (se remodelan con la tabla vacía).
- **Criterios:** [ ] schema válido (`prisma validate`); [ ] nada eliminado ni renombrado; [ ] `BaseGame.sizeValue`/requirements **se conservan** como nivel 1 de herencia.
- **Verificación:** `npx prisma validate`; `npx tsc --noEmit` backend limpio.
- **Dependencias:** 1.1. **Files:** `backend/prisma/schema.prisma`. **Scope:** S.

### Tarea 1.3: Migración Neon del schema (rama temp)
- **Descripción:** preparar migración aditiva, verificar en rama temporal, preguntar, aplicar a `main`.
- **Criterios:** [ ] migración aplicada sin errores; [ ] tablas existentes intactas (SELECT de conteos pre/post).
- **Verificación:** `run_sql` conteos de `BaseGame`, `TenantGame`, `TenantGame` de javier antes/después idénticos.
- **Dependencias:** 1.2. **Scope:** S (procedimiento).

### Tarea 1.4: Seed de plataformas globales canónicas
- **Descripción:** en `seed.ts`, crear/garantizar globales: `pc`, `ps5`, `ps4`, `xbox-series-x`, `xbox-one`, `switch`. Migración del `ps4` de javier según 12.4.
- **Criterios:** [ ] seed idempotente; [ ] las 6 existen con `tenantId: null`; [ ] relaciones de javier no se rompen.
- **Verificación:** test de seed + SELECT de plataformas tras seed.
- **Dependencias:** 1.3, 12.4. **Files:** `backend/prisma/seed.ts`. **Scope:** S.

### Tarea 1.5: Tests de modelos nuevos
- **Descripción:** integración mínima: crear `BaseGamePlatform` con variante, crear `TenantPlatform`, constraints.
- **Criterios:** [ ] tests nuevos en verde; [ ] suite completa en verde.
- **Verificación:** `npx vitest run`.
- **Dependencias:** 1.3. **Files:** `backend/tests/integration/*`. **Scope:** S.

### ✅ Checkpoint Fase 1
- [ ] Schema aplicado en Neon · gates backend/frontend verdes · datos intactos · **revisión humana antes de Fase 2**.

---

## Fase 2 — Respaldos y recuperación

### Tarea 2.1: Sustituir snapshot (✅ decisión 12.5)
- **Descripción:** plan free limita a 1 snapshot → borrar `pre-fase1-saas` y crear el nuevo **justo antes del borrado de la Fase 3** (no ahora, para que esté fresco). Aquí solo queda el procedimiento preparado.
- **Criterios:** [x] decisión anotada; [x] snapshot creado en el momento correcto (3.1: `snap-orange-violet-b8nxp2p4`) y localizado (id en `dudas.md` + Apéndice A).
- **Verificación:** `neon_list_snapshots`.
- **Dependencias:** decisión cerrada. **Scope:** XS.

### Tarea 2.2: Procedimiento de reversión documentado + dump
- **Descripción:** documentar en este plan (apéndice A) los pasos de reversión de la Fase 3; dump de `TenantGame` y puentes (`GET` a archivo en `backend/scripts/`, nunca commiteado).
- **Criterios:** [x] apéndice A escrito (escenarios A/B + conteos); [x] dump generado y verificado legible (62×24 cols).
- **Verificación:** conteos del dump = conteos de BD ✅ (62/164/64/57 · 0 huérfanos, doble vía: script pg + MCP Neon).
- **Dependencias:** 2.1. **Scope:** S.

### ✅ Checkpoint Fase 2
- [x] Respaldo verificado + reversión documentada · **revisión humana** ✅ aprobado 2026-10-15.

---

## Fase 3 — Limpieza y arranque limpio de ofertas de Javier (ex-57)

**Contexto (decisión 12.3):** los 57 `TenantGame` de Javier son datos de demostración **sin valor de negocio** → se borran y se empieza limpio con las estructuras nuevas. La biblioteca global (`BaseGame`) **se conserva**. Al no haber filas que preservar: no hay split, ni backfill, ni dual-write — la remodelación de constraints y columnas se hace aquí con la tabla vacía.

**Alcance del borrado (confirmar explícitamente antes de ejecutar):** todos los `TenantGame` de todos los tenants (los de Javier + los 2 demo del seed) y en cascada `TenantGameGenre`, `GamePlatform`, `GameMedia`. No se toca: `BaseGame`, `BaseGamePlatform`, `LibraryMedia`, `Platform`, `Tenant`, `TenantSettings`, usuarios/sesiones. Colecciones/favoritos/lista del frontend viven en `localStorage` (`storage.ts`), no en DB → no se rompen en BD.

### Tarea 3.1: Respaldo pre-borrado
- **Descripción:** sustituir snapshot (`12.5`) + dump de `TenantGame` y tablas en cascada (no commiteado).
- **Criterios:** [x] snapshot nuevo localizado; [x] conteos del dump = conteos de BD.
- **Verificación:** `neon_list_snapshots` ✅ + SELECT conteos ✅.
- **Dependencias:** Fase 1, 12.5. **Scope:** S.

### Tarea 3.2: Borrado de ofertas + remodelación de constraints (rama temp)
- **Descripción:** con la tabla vacía: DELETE/CLEAR de `TenantGame` (+ cascada) → remodelar a estado final: `platformId` **NOT NULL** + `@@unique([tenantId, baseGameId, platformId])` + `@@unique([tenantId, platformId, slug])` → drop de los uniques legados `([tenantId, slug])` y `([tenantId, baseGameId])` → columnas copiadas de `TenantGame` pasan a **nullable (overrides)** (no destructivo: solo `DROP NOT NULL`). Sobre rama temporal.
- **Criterios:** [x] 0 `TenantGame` restantes; [x] uniques nuevos aplicados sin conflictos; [x] `BaseGame` intacto (58 pre/post); [x] ninguna columna eliminada (24/24).
- **Verificación:** queries de conteo + `information_schema` de índices/nullable ✅ (rama temp y producción).
- **Dependencias:** 3.1, 12.2. **Scope:** M.

### Tarea 3.3: Verificación completa
- **Descripción:** biblioteca global renderiza (admin biblioteca y catálogo base intactos); sin filas huérfanas de cascada.
- **Criterios:** [x] conteos `BaseGame`/`LibraryMedia` idénticos (58/0); [x] 0 huérfanos.
- **Dependencias:** 3.2.

### Tarea 3.4: Aplicar a producción (con permiso)
- **Descripción:** `complete_database_migration` **solo tras aprobación explícita**. Rollback = Apéndice A (snapshot/dump).
- **Criterios:** [x] aprobación registrada (2026-10-15: ventana aceptada + tsc diferido a 4/6, ver `todo.md` 3.5 y `dudas.md` §9); [x] post-mortem de conteos en producción (0/0/0/0 · BaseGame 58 · BaseGamePlatform 59 · Platform 6 · Tenant 2 · AdminUser 2 · 24 col · platformId NOT NULL · 3 overrides nullable · 2 índices nuevos · 0 legados).
- **Dependencias:** 3.3. **Scope:** S.

### ✅ Checkpoint Fase 3
- [x] Ofertas de demo borradas · biblioteca global intacta · constraints finales aplicados · **aprobación humana obligatoria antes del apply** ✅ 2026-10-15.
- **Nota:** `tsc` con 14 errores conocidos (schema nuevo) → diferidos a Fases 4/6 (decisión 2026-10-15, §13; lista en `todo.md` 3.5). vitest 664/664 verde.

---

## Fase 4 — Herencia y personalización (corazón; Fase 3 legada rediseñada)

Resolución: **`TenantGame` (override/limpio) → `BaseGamePlatform` (variante) → `BaseGame` (identidad)**. Nulo = heredar; explícito = personalizar; "limpio" = borrar heredado (semántica 12.1).

### Tarea 4.1: Servicio de resolución de valor final
- **Descripción:** módulo backend puro `resolveFinal(tenantGame, variant, baseGame, field)` con la jerarquía y el tricampo. Sin I/O; testable unitario.
- **Criterios:** [x] jerarquía correcta; [x] los 3 estados distinguidos (heredar/personalizar/limpiar); [x] portada resuelve `GameMedia ?? LibraryMedia`.
- **Verificación:** tests unitarios exhaustivos por campo ✅ (`tests/unit/resolution.test.ts` 27/27).
- **Dependencias:** 12.1, Fase 1. **Files:** `backend/src/modules/games/resolution.ts` (nuevo). **Scope:** M.

### Tarea 4.2: ~~Dual-write + backfill de overrides~~ ✅ no aplica (12.3: arranque limpio)
- Con la oferta de Javier borrada no hay overrides que preservar. Se sustituye por una verificación: **catálogo vacío → todo el valor final proviene de la biblioteca** (herencia pura), testeada en 4.1/4.3. Los overrides "nacen" después vía Fases 5–6.
- **Scope:** XS.

### Tarea 4.3: Lecturas "valor final" en APIs
- **Descripción:** feed, catálogo público y admin de tenant usan el servicio de resolución. Dejar dual-read.
- **Criterios:** [x] endpoints de catálogo/devolvien valor final; [x] override de tenant tapa biblioteca; [x] variante de plataforma gana a identidad.
- **Verificación:** tests de integración de API con los 3 niveles ✅ (catalog 59/59 · games 60/60 · pricing · media; catálogo vacío ⇒ herencia pura).
- **Dependencias:** 4.2. **Scope:** M.

### Tarea 4.4: UI sin candados
- **Descripción:** `GameForm.tsx` (tenant) edita vía override sin `lock`; `LibEditModal` sigue siendo solo SUPER_ADMIN sobre la biblioteca.
- **Criterios:** [x] tenant edita precio/dispo/título con override; [x] biblioteca no editable por ADMIN de tenant (403 verificado).
- **Verificación:** tests de permisos + revisión manual ✅ tests (games: PATCH título/slug sobre BIBLIOTECA → 200 override; base-games: ADMIN PATCH → 403 FORBIDDEN); revisión manual del form pendiente con el demo del checkpoint.
- **Dependencias:** 4.3. **Scope:** M.
- **Hecho 2026-10-15:** guard `LIBRARY_FIELDS_IMMUTABLE` eliminado de `updateGame` (slug uniqueness ahora aplica a todos los orígenes); `GameForm` sin `lock` (validación y payload siempre activos; prefill desde `resolved`; banner/subtítulo de candado retirados; select Origen sigue disabled); `GameItem` tipado con `platformId`/`clearedFields`/`resolved`.

### Tarea 4.5: Contract (deploy separado, posterior)
- **Descripción:** retirar columnas copiadas obsoletas de `TenantGame` **solo cuando** bake time validado. Migración propia.
- **Criterios:** [ ] valor final inalterado post-retiro; [ ] decisión de "retirar ya" aprobada.
- **Verificación:** suite completa + conteos. **Dependencias:** 4.4 + bake time. **Scope:** M.

### ✅ Checkpoint Fase 4
- [ ] Demo: cambiar campo en biblioteca se propaga; override en tenant lo tapa; variante PC distinta de PS4 · gates verdes · **revisión humana**.
- **Nota 2026-10-15:** gates verdes ✅ (vitest 704/704 · tsc backend = solo 7 errores escritura F6 · eslint backend `src tests` OK · tsc+eslint frontend OK). 4.1/4.3/4.4 completadas; 4.5 (contract) queda posterior. Pendiente: demo con revisión humana (requiere datos Fase 6+ para overrides reales) y decisión `publishFromLibrary` → ¿herencia pura (nulls) en vez de copia?

---

## Fase 5 — Importador de biblioteca global (`library-import`)

### Tarea 5.1: Cerrar contrato JSON contra el schema real
- **Descripción:** definir `library-import@2` según 12.6: variantes por plataforma (`platformVariants[]` con slug, size, requirements, procedencia), `coverUrl`, estados ACTIVE según 12.7 (**portada obligatoria**), taxonomía del diccionario (12.8: fuera de diccionario = error por registro). Documento de contrato en `tasks/`.
- **Criterios:** [x] contrato escrito con ejemplo completo; [x] condiciones ACTIVE: título+slug+descripción+≥1 plataforma+≥1 variante con size **+ portada**.
- **Verificación:** revisión + ejemplo validable mentalmente contra Prisma.
- **Dependencias:** Fase 1. **Scope:** S.
- **Hecho 2026-10-15:** `tasks/library-import-contrato.md`. Decisiones incorporadas: (a) **5.0 nuevo** — sembrar diccionario global en `prisma/seed.ts` (14 géneros + 8 categorías del piloto; 12.8 intacto) aprobado por usuario; (b) `sizeValue` NOT NULL resuelto con **derivación de variante principal (orden pc>ps5>ps4>xbox-series-x>xbox-one>switch); si no hay size en ninguna → 0+GB+INCOMPLETE**; (c) `status` nunca del archivo (solo derivado); (d) merge no destructivo incluido `null`; (e) `provenance` Json shape cerrado.

### Tarea 5.2: Endpoint `POST /admin/library-import/validate`
- **Descripción:** schema estricto (Zod), errores **por registro**, preview de cambios (create/update/skip), taxonomía fuera de diccionario → error de registro (12.8), idempotente, **nunca** toca `TenantGame`. SUPER_ADMIN.
- **Criterios:** [x] JSON válido → preview; [x] JSON con campos extra → rechazo; [x] taxonomía desconocida → marcada; [x] doble ejecución → mismo preview (fingerprint).
- **Verificación:** tests de integración (válido, campos extra, desconocido, duplicados).
- **Dependencias:** 5.1. **Files:** `backend/src/modules/library-import/` (nuevo). **Scope:** M.
- **Hecho 2026-10-15:** `library-import.schemas.ts` (envelope `strictObject` + `games: z.array(z.unknown())` y `safeParse` por registro), `library-import.service.ts` (preview sin escrituras, fingerprint `sha256` del JSON canónico, derivación de tamaño/estado, diff campo a campo), `library-import.route.ts` (SUPER_ADMIN), montado en `app.ts` con límite 5 MB. 18 tests de integración propios. Dos revisiones adversas aplicadas (bug reales: `slug` duplicado en archivo, fallback de tamaño fuera del orden de prioridad, `LibraryMedia` `ERROR` conta como portada, `resolveRequirements` autocompletaba `recommended` desde `minimum`, listas `IN` sin trocear → 500, divergencia de `trim` en el pre-check de schema). Contrato §2/§3/§4/§6 actualizado con las decisiones derivadas. Gates: vitest 722/722 · tsc solo los 7 errores F6 · eslint 0.

### Tarea 5.3: Endpoint `POST /admin/library-import/import`
- **Descripción:** upsert por slug con **merge** (no pisar buenos datos con vacíos), crea/actualiza `BaseGame` + variantes `BaseGamePlatform`, procedencia en `Json?`, auditoría, reporte por registro (created/updated/skipped/errors). Transaccional.
- **Criterios:** [x] idempotente (re-importar → 0 cambios); [x] ausentes no borran; [x] audit de cada operación; [x] 0 toques a `TenantGame`.
- **Verificación:** tests (import doble, merge de vacíos, rollback en error mitad).
- **Dependencias:** 5.2. **Scope:** M–L (partir: 5.3a upsert BaseGame, 5.3b variantes).
- **Hecho 2026-10-15:** `buildLibraryImportPlan()` compartido por `validate` e `import` (una sola fuente de cálculo, §5.1 del contrato). Import en una única `$transaction` con auditoría por registro, upsert de variantes por `platformSlug` no destructivo, reemplazo de géneros solo si el archivo los trae, `source` solo al crear, `deletedAt → null` (revive), sin autocompletar `recommendedRequirements`. El doble de test (`fakeDb`) recibió **rollback real** en `$transaction` y `update` en bridges, sin lo cual el invariante §9.5 no era testeable. Gap declarado y testeado: la portada queda pendiente hasta 5.4 (`warnings[]`, y un registro cuyo único cambio es `cover` se reporta `skip` sin tocar la fila). Gates: vitest 735/735 · tsc solo los 7 errores F6 · eslint 0.

### Tarea 5.4: Media `coverUrl` con protección SSRF
- **Descripción:** descarga backend: solo HTTPS + allowlist (igdb, steamstatic, playstation…), bloqueo IP privada, content-type imagen, límite de tamaño/tiempo, control de redirecciones, log de fallo + reintento → Cloudinary (`library/games/{slug}/cover`) → `LibraryMedia`. **Fallo no bloquea la importación** (registro como pendiente).
- **Criterios:** [x] URL válida → `publicId` en `LibraryMedia`; [x] URL privada/maliciosa → rechazada; [x] URL caída → juego importado + aviso; [x] no hotlink.
- **Verificación:** tests con URLs maliciosas (`127.0.0.1`, `169.254.x`, `file://`, redirect a interna, html como imagen).
- **Dependencias:** 5.3. **Scope:** M.
- **Hecho 2026-10-15:** `safeGetImage` en `utils/safeUrl.ts` (DNS pinning, todas las IP del hostname comprobadas, verificación en cada redirección, 10 s, 5 MB, `content-type image/*`) + `library-import.media.ts` (allowlist de hosts, subida a Cloudinary con `publicId library/games/{slug}/cover` y reintentos, una sola fila `COVER` por juego, `ERROR` reintentable, degradación a `INCOMPLETE` y aviso con el motivo). 10 tests unitarios de la descarga + 5 de integración. Nunca se guarda la URL de origen. Descarga **fuera** de la transacción y secuencial (~1–2 min para 50 portadas). Gates: vitest 758/758 · tsc solo los 7 errores F6 · eslint 0.

### Tarea 5.5: UI de import en panel de administración
- **Descripción:** subir JSON → preview tabla (por registro: create/update/skip/error) → confirmar → resultado. En `configuracion/datos` o nueva sección biblioteca.
- **Criterios:** [x] flujo completo click a click (a falta de la revisión manual en navegador, ver nota); [x] errores visibles por registro; [x] SUPER_ADMIN only.
- **Verificación:** build + revisión manual + `npm run lint`.
- **Dependencias:** 5.2, 5.3. **Scope:** M.
- **Hecho 2026-10-15:** sección nueva en `configuracion/datos` (después de "Importar catálogo", manteniendo el orden exports→imports; sin entrada nueva en el nav). `libraryImportApi.ts` + `libraryImportView.ts` (lógica pura, 8 tests con `node --test`) + `LibraryImportSection.tsx`. Solo reutiliza tokens del panel (`stats`, `bd2`, `details.fs`, `note`, `state`). Tres decisiones que no eran obvias: (1) el timeout del cliente era 15 s y el import con portadas tarda 1–2 min → `AdminRequestOptions.timeoutMs` aditivo (nada más cambia) y 5 min para el import; (2) un corte de red **no** es "no se aplicó": la UI lo muestra como **resultado desconocido** y pide revalidar, sin reintentar a ciegas; (3) el JSON que sube el usuario se valida en el cliente antes de mandarlo. **Pendiente 2026-10-15:** el flujo solo está verificado por typecheck/lint/tests/build; falta el paso manual en navegador, que es el criterio de verificación de 5.5. El **MCP de Chrome DevTools no está configurado** (verificado: ninguna de las configs lo tiene), así que ese paso sigue bloqueado; detalle y pasos exactos en `tasks/todo.md`.

### Tarea 5.6: Tests de validate/import/media + URLs maliciosas
- **Criterios:** [x] validate (preview, errores por registro, taxonomía, idempotencia, fingerprint); [x] import (merge no destructivo, variantes, géneros, revive, auditoría, rollback, `IMPORT_PREVIEW_STALE`); [x] media (OK, reintento de `ERROR`, host no permitido, descarga bloqueada/caída, subida fallida con 3 intentos, sin hotlink); [x] URLs maliciosas (`file://`, `data:`, loopback, RFC1918, `169.254.169.254`, `.internal`, DNS público→IP privada, redirección a interno, HTML como imagen, oversized, bucle de redirecciones).
- **Hecho 2026-10-15:** suite del módulo en 3 ficheros: `library-import.test.ts` (43 de integración), `library-import-pilot.test.ts` (3, con el piloto real migrado `@1`→`@2`), `safeUrl-get.test.ts` (10 de SSRF/GET). Backend total **760/760**. Se comprobó que los tests no son decorativos: desactivar el rollback del doble hace fallar el test de rollback.

### ✅ Checkpoint Fase 5
- [x] Fixture JSON importada end-to-end (los 50 juegos del piloto contra el doble de pruebas: 50 altas, 50 auditorías, portadas, taxonomía 100%).
- [x] Idempotencia demostrada por tests (reimportar → `skip` total, 0 escrituras).
- [x] Gates verdes: backend `vitest` 760/760 · `tsc` solo los 7 errores F6 · `eslint` 0 · frontend typecheck/lint/89 tests/build.
- [ ] **Revisión humana pendiente:** (a) flujo de la UI en navegador — requiere el MCP de DevTools, ya configurado pero **sin probar** (falta red para descargar Chrome); (b) importación real contra la BD con el fixture `@2` definitivo — depende del generador (10.1).

---

## Fase 6 — Importador de catálogo por tenant (adaptado a ofertas por plataforma)

### Tarea 6.1: Contrato `luismi-platform/catalog@2`
- **Descripción:** entrada con `platformSlug` obligatoria (oferta = tenant × juego × plataforma). `catalog@1` → rechazar con mensaje claro ("formato antiguo, regenera con el nuevo contrato") — no hay datos v1 que preservar (12.3).
- **Criterios:** [x] contrato escrito; [x] v1 → error explícito y limpio (especificado; la implementación es 6.2).
- **Dependencias:** Fase 3, 12.3. **Scope:** S.
- **Hecho 2026-10-15:** `tasks/catalog-import-contrato.md`. Decisiones cerradas: una entrada = **una oferta** (`baseGameSlug` + `platformSlug` singular, identidad `(tenantId, platform, slug)` con `slug` derivado `<baseGameSlug>-<platformSlug>` si no viene); **no se acepta taxonomía** (la oferta hereda la de la biblioteca; el taxonomía por tenant en ofertas es de la Fase 7); `origin` **derivado** (`BIBLIOTECA` sin overrides → `PERSONALIZADO` con al menos uno) para que el dato no pueda mentir; **el payload no puede llevar `tenantId`** (ahora es campo no permitido, antes era un aviso ignorado); plataforma **global** + habilitada en `TenantPlatform`; el importador no crea `BaseGame`, ni `Platform`, ni habilitaciones. Esquemas `catalogImportSchema`/`catalogOfferSchema` añadidos (aditivos, sin cambiar comportamiento hasta 6.2).

### Tarea 6.2: Adaptar `data-transfer` (validate/import)
- **Descripción:** `importGameEntrySchema` gana plataforma; crea `TenantGame` con `platformId`; valida plataforma habilitada del tenant; mantiene aislamiento (tenant de sesión, nunca `tenantId` del payload); preview/idempotencia/auditoría ya existentes → adaptar.
- **Criterios:** [ ] import de catálogo crea ofertas por plataforma; [ ] plataforma no habilitada → error por registro; [ ] cross-tenant → 403.
- **Verificación:** tests existentes de `data-transfer` actualizados + nuevos (plataforma, 403).
- **Dependencias:** 6.1. **Scope:** M.
- **Rebanadas (decisión 2026-10-16):** A = envelope + rechazo de v1 · B = semántica por oferta · C = modelo de lectura del panel.
- **Hecho 2026-10-16 (6.2-A, mínima viable):** `analyzeImport` exige envelope `@2` (`schema` + `offers[]`) y responde `400 CATALOG_SCHEMA_UNSUPPORTED` con mensaje de regeneración ante `@1`, schema ausente o `offers` ausente. Gates: **763/763** (32 ficheros), eslint `src tests` 0, `tsc` con los mismos 7 errores F6 heredados (ninguno nuevo).
- **Deuda transitoria explícita de A (NO es deuda oculta):** el pipeline interno sigue parseando ofertas con `importGameEntrySchema` (v1) → la semántica por oferta (`platformId` obligatorio, plataforma habilitada, `slug` derivado, `origin` derivado) **aún no está**; es trabajo de B. El **export sigue emitiendo `catalog@1`**, por lo que el roundtrip exportar→importar está roto a propósito; el test que lo cubría se reescribió como test verde que documenta la ruptura (nombre explícito) en vez de quedar `skip` sin explicación. Al migrar el export en B se recupera el roundtrip real.

### ✅ Checkpoint Fase 6
- [ ] Import de catálogo de prueba con dos plataformas → dos ofertas con precios distintos · gates verdes · **revisión humana**.

---

## Fase 7 — TenantPlatform + administración global de plataformas

### Tarea 7.1: CRUD `TenantPlatform` + permisos
- **Descripción:** SUPER_ADMIN gestiona plataformas globales; tenant admin habilita/deshabilita **solo globales** para su negocio. Regla: conveniencia, no restricción dura (Decisiones/plan legado).
- **Criterios:** [ ] ADMIN no puede crear plataforma global; [ ] habilitar/deshabilitar persiste.
- **Verificación:** tests RBAC + integración.
- **Dependencias:** Fase 1, 12.4. **Scope:** S–M.

### Tarea 7.2: UI plataformas del negocio
- **Descripción:** en edición de negocio, checklist de plataformas globales con enable.
- **Criterios:** [ ] UI operativa; [ ] refleja en 7.1.
- **Dependencias:** 7.1. **Scope:** S.

### Tarea 7.3: Filtro de conveniencia en listados/imports
- **Descripción:** biblioteca y catálogo pueden filtrar por plataformas habilitadas; import de catálogo las respeta como validación.
- **Criterios:** [ ] filtro visible; [ ] validación en import.
- **Dependencias:** 7.1, 6.2. **Scope:** S.

### ✅ Checkpoint Fase 7 · revisión humana.

---

## Fase 8 — Gestión de tenants (Fase 5 legada)

### Tarea 8.1: Soft delete + suspensión
- **Descripción:** `Tenant.deletedAt` + `isActive`; suspender ≠ eliminar; histórico preservado (Decisiones §10).
- **Criterios:** [ ] sin DELETE físico; [ ] tenant suspendido no operable pero consultable en auditoría.
- **Verificación:** tests.
- **Scope:** S–M.

### Tarea 8.2: Panel Negocios — "Eliminar" separado de "Suspender"
- **Scope:** S.

### Tarea 8.3: Selector de tenant global en header (SUPER_ADMIN, sincronizado)
- **Scope:** S.

### ✅ Checkpoint Fase 8 · revisión humana.

---

## Fase 9 — Validación final

### Tarea 9.1: Criterios de aceptación (Decisiones §14)
- [ ] Tenant aislado (consulta/escritura cruzada bloqueada).
- [ ] Una oferta por (tenant, juego, plataforma).
- [ ] Herencia + tricampo resuelven bien.
- [ ] Importadores idempotentes; ausentes no borran.
- [ ] Biblioteca global no toca ofertas de tenants.
- [ ] Migración conserva registros y relaciones.
- [ ] Errores de media identificables y reintentables.
- [ ] Operaciones privilegiadas restringidas y auditadas.
- [ ] Respaldos/recovery verificados.

### Tarea 9.2: Gates completos
- [ ] Backend vitest + tsc · Frontend tsc, lint, tests, build, cf:build — todo en verde.

### Tarea 9.3: Revisión de seguridad
- **Descripción:** con skill `security-and-hardening`: RBAC de import (SUPER_ADMIN), aislamiento tenant en ambos importadores, SSRF de media.
- **Dependencias:** 5.4, 6.2, 7.1. **Scope:** S.

---

## Fase 10 — Generador (otra OC) — **el último** (generador-impprtador.md)

### Tarea 10.1: Regenerar piloto contra `library-import@2`
- **Descripción:** actualizar prompt de la otra OC al contrato final: variantes por plataforma (tamaño Steam en variante PC, PS store en PS5…), requisitos solo en variante PC, corregir errores de pasada 2 (**nada de OST/DLC/secuela** — regla Decisiones §7), `coverUrl` mantenido. El contrato manda; el generador se adapta.
- **Requisito añadido 2026-10-15** (`Decisiones-Arquitectonicas-v1.md` §7.1): emitir `sizeValue`/`sizeUnit` **por variante** cuando la fuente real lo tenga, y **nunca** inventarlo ni sustituirlo por un tamaño equivalente (requisitos de store, DLC u otro producto — regla §7 ya aprobada). Si la fuente no lo da, el juego se queda `INCOMPLETE` y se enriquece desde la ficha de biblioteca. El piloto actual deja 16 de 50 sin tamaño; si esta pasada los cubre, el `dry-run` (`library-import-pilot.test.ts`) falla y obliga a revisar §7.1 de forma explícita.
- **Criterios:** [ ] JSON regenerado pasa `POST /admin/library-import/validate` sin errores de registro.
- **Dependencias:** Fase 5 completa, contrato cerrado. **Scope:** S (docs + una pasada de la otra OC).

### Tarea 10.2: Validar e importar el piloto completo (554 o el que se decida)
- **Verificación:** preview limpio → import en local → conteos → revisión humana.
- **Dependencias:** 10.1.

---

## Apéndice A — Reversión de la Fase 3

**Conteos pre-borrado (2026-10-15 · dump `backend/scripts/dump-fase3.json`, no commiteado · verificados = SELECT en Neon):**

| Tabla | Filas |
|---|---|
| `TenantGame` | 62 |
| `TenantGameGenre` | 164 |
| `GamePlatform` | 64 |
| `GameMedia` | 57 |
| `BaseGame` (intacto) | 58 |
| `LibraryMedia` (intacto) | 0 |
| `Platform` (intacto) | 6 |

Huérfanos pre-borrado: 0 (TenantGameGenre) · 0 (GamePlatform) · 0 (GameMedia).

1. Snapshot id: **`snap-orange-violet-b8nxp2p4` "pre-fase3-borrado"** (rama `br-misty-salad-b8xwlwmc`, creado 2026-10-15T14:15:39Z; sustituye a `snap-proud-leaf-b8q0dezc` "pre-fase1-saas", borrado — el viejo no servía de rollback por venir de antes de la Fase 1; plan free = 1 snapshot). Creado **después** de la Fase 1 y **antes** del borrado de 3.2, para que el rollback conserve el schema nuevo y los datos viejos.
2. Escenarios de reversión:
   - **A. Antes de aplicar la migración a `main`:** descartar la rama temporal (`complete_database_migration` con `apply_changes: false`). Producción queda intacta.
   - **B. Borrado ya ejecutado, hay que volver atrás:**
     1. Restaurar snapshot: `neon_restore_snapshot` con `snapshot_id` + `finalize: false` (rama temporal) → verificar en ella → `finalize_branch_restore` para sustituir `main`. La restauración revierte datos **y** schema (incluidas las migraciones posteriores al snapshot).
     2. Verificar conteos: `TenantGame` 62 · `TenantGameGenre` 164 · `GamePlatform` 64 · `GameMedia` 57 · `BaseGame` 58.
     3. **Alternativa granular** (solo si el snapshot no está disponible): reinsertar desde `dump-fase3.json` en orden `TenantGame` → `TenantGameGenre` → `GamePlatform` → `GameMedia` (los ids foráenos — tenant, baseGame, platform, category — se conservan en producción).
3. Verificación post-restauración: queries de conteo de arriba · `information_schema` con los índices legados `TenantGame_tenantId_slug_key` y `TenantGame_tenantId_baseGameId_key` presentes · smoke de admin (lista de juegos de Javier visible).

## Apéndice B — ~~Inventario de los 57~~
✅ Obsoleto por 12.3 (borrar y empezar limpio). Queda solo el conteo pre-borrado en Apéndice A.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Borrado de ofertas de demo en producción | Medio | Snapshot pre-borrado + dump + aprobación humana + rollback Apéndice A (los datos no tienen valor de negocio: decisión 12.3) |
| Semántica tricampo mal diseñada | Alto | Resolver en 4.1 con tests unitarios antes de poblar ofertas nuevas |
| Catálogo de Javier queda vacío hasta la Fase 6 | Medio (aceptado) | Explícito en 12.3: repoblar con importador B (catálogo) tras Fase 5 |
| SSRF en media | Alto | Allowlist + tests maliciosos (5.4) |
| Plan free: 1 solo snapshot | Medio | 12.5: sustituir por snapshot pre-borrado |
| Contrato JSON vs schema divergentes | Medio | Contrato se cierra **después** del schema (5.1) |

## 12. Preguntas cruciales — ✅ CERRADAS 2026-10-14 (usuario)

| # | Pregunta | **Decisión** |
|---|---|---|
| **12.1** | Tricampo "borrar valor heredado" | **`clearedFields` Json en `TenantGame`** (array de nombres de campo limpiados) |
| **12.2** | Slug con plataforma | **Unique `(tenantId, platformId, slug)`**, mismo slug por plataforma (URL pública con plataforma; revisar rutas públicas en 1.2/4.3) |
| **12.3** | Ofertas existentes de Javier (57) | **Borrar y empezar limpio** — son datos de demostración sin peso; biblioteca `BaseGame` intacta. Fase 3 rediseñada como limpieza + remodelación de constraints |
| **12.4** | `ps4` de Javier | **Migrar la fila existente a global** (`tenantId → null`) |
| **12.5** | Snapshot único | **Sustituir `pre-fase1-saas`** por snapshot pre-borrado |
| **12.6** | Contrato biblioteca | **`library-import@2` con `platformVariants[]`** |
| **12.7** | Condición de `ACTIVE` | **Título+slug+descripción+≥1 plataforma+≥1 size+portada obligatoria** (sin size → `INCOMPLETE`) |
| **12.8** | Taxonomía desconocida en import | **Error por registro en validate, frenar** (sin auto-crear) |

Secundarias resueltas de paso por 12.3: columnas copiadas de `TenantGame` → se remodelan a nullable (overrides) con la tabla vacía (sin backfill); `catalog@1` → se rechaza con mensaje claro (no hay datos v1 que preservar).

---

## 13. Índice de gates por fase

| Fase | Gates |
|---|---|
| 1 | prisma validate + backend vitest/tsc + frontend completo |
| 2 | snapshot creado + conteos de dump == BD |
| 3 | 0 ofertas · `BaseGame` intacto + aprobación humana · constraints finales (information_schema) |
| 4 | tests unitarios resolución + integración API + herencia pura con catálogo vacío |
| 5 | tests validate/import/media + fixture end-to-end local |
| 6 | tests data-transfer actualizados + 2 ofertas con precios distintos |
| 7 | tests RBAC |
| 8 | tests soft delete |
| 9 | §14 completo + gates globales + revisión seguridad |
| 10 | validate limpio del JSON regenerado |
