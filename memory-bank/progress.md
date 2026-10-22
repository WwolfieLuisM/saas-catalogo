# Progress

## Last Updated
2026-10-21

## What Works
- **2026-10-21 (Fase A del plan de importación del catálogo, herramientas probadas y commiteadas):**
  - Lote 1 = **943 MATCHED nuevos** (978 − 35 ya importados; 0 exclusiones cruzan) volcado en `backend/scripts/lote1-matched.csv` (local).
  - **Muestra de 60** reproducible (semilla 20261021; 40 aleatorios + 20 de riesgo de 151) → `tasks/muestra-60-matched.csv` con enlaces y columna `correcto_SI_NO` (**aún sin revisar**).
  - `scripts/construir-import.mjs` y `scripts/validar-import.ts` genéricos (CLI con argumentos) y probados: regresión sobre `tasks/library-import-50.json` = `VALIDO — 50 registros listos`; builder con las entradas del piloto = 50/50 registros, sin avisos de prevalidación.
  - `tasks/mapa-generos-import.md`: propuesta IGDB→taxonomía (21 tokens con frecuencia real; **aún sin aprobar**).
- **2026-10-21 (bloque de tamaños y visibilidad, todo pusheado y verificado en producción):**
  - `fbcc104` + `e55ef55`: el centinela «0 GB» se traduce a `null` (`presentSize`) → la biblioteca pinta «—» (verificado en navegador: 0 «0 GB» en la página, tamaños reales intactos).
  - `867ee40`: dashboard con `gamesWithoutSize` y la fila «N juego(s) sin tamaño en la biblioteca · Completar» (primera de *Requiere atención*); verificado en producción con login.
  - `13b78b9`: **9 tamaños reales** con procedencia en `tasks/library-import-50.json` (cobertura 39/50 → **48/50**; validador en `VALIDO — 50 registros listos para importar`), script idempotente `scripts/completar-tamanos.mjs`.
  - Documentación: **`docs/enriquecimiento-datos.md`** (español): fuentes por orden de preferencia, endpoints exactos, regla de `provenance`, flujo operativo de 8 pasos y resultado.
  - Gates: backend 796/798 (los 2 = deuda `library-import-pilot`), `tsc` 0, eslint 0; frontend **108/108**, `tsc` 0, lint 0 (2 warnings preexistentes en `feed/Catalog.tsx`).
- **El importador ya opera desde el panel** (6.2-C): el usuario importó los 50 juegos (53 en biblioteca).
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
- **Fase E cerrada y Fase F lista (2026-10-22):** piloto 50 importado (biblioteca = 103, verificado en navegador: dashboard 4 sin tamaño, portada Cloudinary de Decay of Logos ok en el feed) y lotes `library-import-lote2..5.json` = 893 restantes (224/223/223/223, **VALIDO**, `75c26be`, excluyen el piloto). **Siguiente:** él importa lote2 → medir preview/run → lotes 3-5.
- **Fase 4 sigue en checkpoint:** código 4.1/4.3/4.4 ✅; pendientes demo con revisión humana, 4.5 contract (con bake time) y decisión `publishFromLibrary`.

## What's Left To Do
- [x] Fase 1 V2 · [x] Fase 2 V2 · [x] Fase 3 V2 · [x] Fase 4 V2 (4.1–4.4) · [x] **Fase 5** (`library-import@2`, revisar en navegador 2026-10-16) · [x] **6.1** contrato `catalog@2` · [x] **6.2-A** rechazo de `@1` · [x] **6.2-B** importador por plataforma + export `@2` (roundtrip cerrado) · [x] **6.2-C** panel + botón de importar (el usuario importó los 50).
- [ ] **Plan del catálogo completo (~1.723):** [x] **A** cimientos (lote 1, muestra de 60, constructor/validador genéricos, mapa de géneros) · [x] **B** enriquecimiento (Steam 943 + RAWG 157 + PCGW 130; 768 ES) · [x] **C** imágenes (941/943) · [x] **D** tamaños (847/943) · [x] **JSON lote 1** (`library-import-lote1.json`, **VALIDO 943**, `7acea2f`) · [x] **E** piloto 50 importado y verificado (103 juegos, 2026-10-22) · [~] **F** lotes 2-5 **VALIDO** (`75c26be`, 224/223/223/223, excluyen el piloto) — **él importa en orden** · [ ] **G** NEEDS_REVIEW/NO_MATCH + cola.
- [ ] **Fase 7** TenantPlatform + admin global · **8** tenants · **9** §14 + seguridad · **10** regenerar JSON (otra OC, último).
- [ ] BUG-01.D (decisión) · decisión `publishFromLibrary` · demo/revisión humana de Fase 4.

## Known Issues
- **Gate de encoding v3 (`f39c325`, `5dab9ea`):** duros (exit 1) = cirílico/griego/FFFD + parejas mojibake: cabecera U+00C0-00F4 + continuación U+0080-0xBF (NBSP/«» solo tras Â/Ã) o Latin Extended solo si CP1252 lo produce (U+0152/0153/0160/0161/0178/017D/017E). Aviso sin fallo = Latin Extended aislado y nombres eslavos tras cabecera (Göktuğ, Różalski). Sin cirílico/literales de mojibake en el propio código (el gate se auto-marcia); homóglifos en `enriquecer-steam.mjs` por `0x`-codepoints.
- **Bug del extractor ES corregido y reparado (2026-10-21):** `/OS\s*:/i` sin `\b` casaba dentro de «Gráficos:» → `os` = GPU en 37 juegos del JSON de 50; `scripts/corregir-requisitos-so.mjs` los reparó (VALIDO 50/50, rescan 0). Los enriquecedores nuevos ya llevan el `\b`.
- **Gate de la Fase E (importar) sin pasar:** `tasks/muestra-60-matched.csv` sigue sin la columna `correcto_SI_NO` rellenada — el enriquecimiento (B) no lo necesita, pero sí la importación. Categoría `estrategia` (~385 juegos) sigue en `otros` pendiente de su decisión.
- **Deuda real: `library-import-pilot.test.ts` 2 tests en rojo** (esperan 50 y el fixture local `backend/scripts/library-import.json` tiene 48); ver Next Steps 7 (cola posterior).
- ~~**`tsc`: 4 errores de Fase 6**~~ cerrados en 6.2-C (typecheck backend y frontend a 0 desde 2026-10-16).
- ~~**El panel no ejecuta la importación**~~ cerrado en 6.2-C: el usuario ya importó los 50.
- ~~Árbol sin commitear desde `321d77d`~~ cerrado: desde entonces todo está commiteado y pusheado.
- `game.shared.ts` tenía **acentos corruptos ya commiteados** (mensaje de `slugSchema` y `assertTaxonomyRefs`): comprobar si sigue así (es texto visible al usuario).
- `LibraryMedia = 0` (ninguna portada de biblioteca global aún).
- **2 fichas sin tamaño**: `starless-abyss` (sin fuente publicada) y `football-manager-2016` (JSON `null` a propósito; su valor vive en la BD).
- `node -e` arruinado en ocasiones (usar `.mjs`); sin `rg`; PowerShell sin `&&`; Neon HTTP driver sin multi-sentencia; **`websearch` nativo con 403** → usar `lite.duckduckgo.com/lite/` vía `webfetch`.
- Deuda README §15: conservar, no resolver en estas fases.

## Completed Milestones
- Fase 0 (salvaguardas) · Fase 1 (feed) · Fase 2 (biblioteca global) V1 — commiteadas.
- BUG-01 A–C.
- Decisiones: Modelo A, orden de desarrollo, importador = autoridad.
- §12: 8 dudas cruciales (2026-10-14).
- **Plan V2 Fases 1–3 ejecutadas y verificadas en producción (2026-10-15)** + 2 decisiones pre-3.4 (ventana + tsc).
- **Plan V2 Fase 4 código completo 2026-10-15** (4.1 resolveFinal · 4.3 lecturas valor final · 4.4 UI sin candados) con gates verdes; 11 errores de lectura de tsc cerrados (quedan 7 de escritura → Fase 6).
