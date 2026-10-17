# Progress

## Last Updated
2026-10-16

## What Works
- **Proyecto V1 (fases 0–2 originales) completadas y commiteadas (sin push)**: 5 commits (`4afb3dd`, `c0bd1b5`, `c623f5f`, `55895ac`, `321d77d`). Sin push → Render/cloudflared intactos.
- **Plan V2 (plan-detallado.md): Fases 1–3 ejecutadas 2026-10-15:**
  - F1 schema expand aplicada a producción (migration_id `43a46578…`) + seed 6 globales + ps4 global + tests (10 nuevos).
  - F2 dump pre-borrado verificado + Apéndice A de reversión.
  - F3 **borrado en producción** (62/164/64/57) + constraints finales; snapshot `snap-orange-violet-b8nxp2p4` = rollback; post-mortem: BaseGame 58 · bgp 59 · Platform 6 · Tenant 2 · Admin 2 · 24 col.
- **Fase 4 (V2) 4.1/4.3/4.4 ejecutadas 2026-10-15:**
  - 4.1 `resolveFinal` puro + tricampo `clearedFields` (`resolution.ts`, 27/27 unit).
  - 4.3 lecturas valor final: `catalog` (59/59), `games` (`loadDetails` pools + `resolved` 11 keys + `platformId`/`clearedFields` en DTO), `pricing` (computeDiff), `media` (títulos resueltos); herencia pura con catálogo vacío.
  - 4.4 UI sin candados: guard `libraryLockedKeys` eliminado (slug check = todos los orígenes), `GameForm` sin `lock` (prefill desde `resolved`, payload siempre completo), `GameItem` tipado (`platformId`/`clearedFields`/`resolved`), tests: title/slug override 200 + **403 ADMIN en base-games PATCH**.
- Gates: backend vitest **775/775** verdes (tsc: **4 errores restantes, solo escritura → 6.2-C**, ver Known Issues; eslint `src tests` 0 errores); frontend typecheck **clean** + eslint 0 errores (1 warning pre-existente de font en `layout.tsx`), tests 89/89/build verdes.
- **Fase 5 (V2) completa 2026-10-15/16:** `library-import@2` (5.1–5.6: contrato, validate, import, SSRF de portadas, UI, 43+3+10 tests) + revisión en navegador que arregló el `fetch` crudo sin prefijo `/api/v1` (rompía exportar catálogo, exportar manifiesto e importar) y la marca `.brand` recortada.
- **Fase 6.2-A/B 2026-10-16:** `catalog@1` y manifiesto rechazados (400 `CATALOG_SCHEMA_UNSUPPORTED`); importador reescrito a ofertas por plataforma (`catalogOfferSchema`, identidad `baseGameId+platformId`, plataformas globales + `TenantPlatform.enabled`, herencia pura, `origin` derivado, retiradas acotadas a las plataformas del archivo) y export migrado a `catalog@2` → **roundtrip exportar→importar cerrado con 0 cambios** (53 tests en `import-export.test.ts`).
- Pilotos de datos: 50 juegos enriquecidos (`library-import.json`, no commiteado): portadas 50/50, tamaño 34/50, ~3 fuzzy-match erróneos (reglas anti-OST/DLC/secuela para Fase 10).
- Documentación: `Decisiones-Arquitectonicas-v1.md`, `generador-impprtador.md`, `plan-detallado.md` (vigente), `plan.md`, `todo.md`, `dudas.md` §8/§9, memory-bank.

## In Progress
- **Fase 6 en 6.2-B cerrada; sigue 6.2-C:** modelo de lectura del panel + botón que ejecute `/import/run` + cierre de los 4 `tsc` de `platformId`.
- **Fase 4 sigue en checkpoint:** código 4.1/4.3/4.4 ✅; pendientes demo con revisión humana, 4.5 contract (con bake time) y decisión `publishFromLibrary`.

## What's Left To Do
- [x] Fase 1 V2 · [x] Fase 2 V2 · [x] Fase 3 V2 · [x] Fase 4 V2 (4.1–4.4) · [x] **Fase 5** (`library-import@2`, revisar en navegador 2026-10-16) · [x] **6.1** contrato `catalog@2` · [x] **6.2-A** rechazo de `@1` · [x] **6.2-B** importador por plataforma + export `@2` (roundtrip cerrado).
- [ ] **6.2-C** panel de lectura + botón de importar + 4 `tsc`.
- [ ] **Fase 7** TenantPlatform + admin global · **8** tenants · **9** §14 + seguridad · **10** regenerar JSON (otra OC, último).
- [ ] BUG-01.D (decisión) · decisión `publishFromLibrary` · demo/revisión humana de Fase 4.

## Known Issues
- **`tsc`: 4 errores (los de Fase 6,eran 7)** — los 3 de `data-transfer` cerrados en 6.2-B; quedan `seed.ts:246` · `games.service.ts:471,563,900` (creates sin `platformId` / `title` no null) → 6.2-C.
- **El panel no ejecuta la importación:** `configuracion/datos` solo llama a `/admin/import/validate`; no hay botón que llame a `/import/run` → 6.2-C.
- `game.shared.ts` tiene **acentos corruptos ya commiteados** (mensaje de `slugSchema` y los de `assertTaxonomyRefs`): es texto visible al usuario.
- **Ventana de escrituras en producción** hasta push posterior: el código desplegado no puede crear TenantGame (NOT NULL platformId). Sin push sin permiso.
- `LibraryMedia = 0` (ninguna portada de biblioteca global aún).
- `node -e` arruinado en ocasiones (usar `.mjs`); sin `rg`; PowerShell sin `&&`; Neon HTTP driver sin multi-sentencia.
- 16 juegos sin tamaño → `INCOMPLETE` (decisión §7.1) hasta Fase 10.
- Deuda README §15: conservar, no resolver en estas fases.
- **Árbol sin commitear desde `321d77d`** (Fase 1 → 6.2A). Commit autorizado por el usuario al cerrar 6.2-B en verde, **aún no hecho**.

## Completed Milestones
- Fase 0 (salvaguardas) · Fase 1 (feed) · Fase 2 (biblioteca global) V1 — commiteadas.
- BUG-01 A–C.
- Decisiones: Modelo A, orden de desarrollo, importador = autoridad.
- §12: 8 dudas cruciales (2026-10-14).
- **Plan V2 Fases 1–3 ejecutadas y verificadas en producción (2026-10-15)** + 2 decisiones pre-3.4 (ventana + tsc).
- **Plan V2 Fase 4 código completo 2026-10-15** (4.1 resolveFinal · 4.3 lecturas valor final · 4.4 UI sin candados) con gates verdes; 11 errores de lectura de tsc cerrados (quedan 7 de escritura → Fase 6).
