# Todo — Javier PC SaaS V2

Plan: `tasks/plan.md` (legado fases 0–2) · **`tasks/plan-detallado.md` (plan vigente, fases 1–10)**. Leyenda: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho.

> **2026-10-14:** las secciones "Fase 3 / 4 / 5" antiguas quedan reemplazadas por el checklist nuevo (arquitectura por plataforma). El "Importador CSV" se convierte en los importadores A (biblioteca global) y B (catálogo tenant). **§12 cerrada** — desbloqueado; ejecutar por fases con checkpoint humano.

## BUG-01 — Manifiesto multimedia y portadas (2026-10-14)

**Bug.** Exportar manifiesto multimedia produce un manifiesto inútil y la UI invita a importarlo en un endpoint que no lo acepta.

Hallazgos verificados:
- `/admin/import/validate` solo acepta catálogos: exige `games` o lista plana (`data-transfer.service.ts:233-237`). El manifiesto (`assets`) falla siempre con `IMPORT_FORMAT_INVALID`.
- El manifiesto es **solo de exportación**; no existe importador (`exportMediaManifest`, `data-transfer.service.ts:765`, sin inversa).
- El export vierte solo `publicId`, nunca `url` (`data-transfer.service.ts:787-792`).
- Estado real en producción (tenant `javier`): 57 COVER `OK` → **55 con `publicId: null`** y url hotlink de IGDB (`https://images.igdb.com/...`); solo 2 (FC 26, FC 27) son Cloudinary con `publicId`.
- La lógica de limpieza/detección de huérfanos se apoya en `publicId` (`media.service.ts:322, 363, 544-550`): los 55 hotlinks quedan invisibles ante ella.
- La página Datos mezcla los dos exports y el import de catálogo, con texto "Elige un archivo .json exportado desde la plataforma".

**Solución.**
- **A (hecho)** — `exportMediaManifest`: incluye `url`, `hosting` (`cloudinary`|`external`|`unknown`) y `provider`; añade `totals`, `tenantId` y un `notice` explícito de que no es un archivo de restauración. Mantenido el schema `media-manifest@1` (cambios aditivos).
- **B (hecho)** — `configuracion/datos/page.tsx`: tres secciones separadas (exportar catálogo / exportar manifiesto multimedia / importar catálogo) con el texto de diferencia explícito.
- **C (decidido: opción 2, pantalla visual)** — Auditoría de portadas como pantalla de administración, solo lectura. Ver diseño más abajo.
- **D (no ahora)** — No crear importador multimedia en esta fase. Primero decidir si hace falta respaldo restaurable o basta el inventario.

**Gates tras A y B.** Backend 577/577 (+2 tests nuevos). Frontend `typecheck` 0, `eslint` 0 errores (1 warning preexistente de fuentes en `layout.tsx`), `node --test` 80/80, `next build` 28 rutas.

### C — Auditoría visual de portadas (pendiente)

Pantalla dentro de Administración para revisar las portadas externas (las 55 de IGDB sin `publicId`).

Debe mostrar, como mínimo:
- Miniatura de la portada y estado de carga.
- Título del juego y tenant asociado.
- URL de origen y proveedor.
- Estado de `publicId` y ubicación en Cloudinary cuando exista.
- Resultado de validación: accesible, error, posible duplicado o revisión manual.
- Filtros por proveedor, estado y tenant.
- Resumen de cuántas portadas hay y cuántas necesitan atención.

Límites de seguridad de esta primera versión:
- Solo lectura. No subir, borrar ni reemplazar imágenes.
- No modificar registros de Neon ni recursos de Cloudinary.
- No marcar duplicado únicamente por título o URL parcial.
- Respetar los permisos administrativos existentes.
- Evitar cargar todas las imágenes a la vez (paginación / carga diferida).

Antes de implementar: inspeccionar rutas y componentes de admin existentes, proponer dónde encaja, qué endpoint de lectura necesita y cómo se validan las URLs.

- [x] BUG-01.A `exportMediaManifest` incluye `url` + distinción Cloudinary/externa (`data-transfer.service.ts`)
- [x] BUG-01.B Datos: separar export catálogo / export manifiesto / import catálogo (`configuracion/datos/page.tsx`)
- [x] BUG-01.C Auditoría visual de portadas (solo lectura; ver diseño arriba)
- [ ] BUG-01.D Decisión: ¿hace falta importador multimedia? (no implementar aún)

**Validación obligatoria.**
- [x] Pruebas de exportación y validación de formatos añadidas/actualizadas.
- [x] URLs externas se exportan aunque `publicId` sea `null`.
- [x] Un manifiesto NO se acepta accidentalmente como catálogo.
- [x] Ninguna portada actual se modifica ni elimina.
- [x] Lint, tipos, tests y builds en verde.

**Límites.** No borrar juegos ni media. No tocar datos de producción. No cambiar Cloudinary ni Neon. No adelantar `LibraryMedia`. No commit/push/deploy sin presentar el análisis y los cambios.

**Entrega.** Archivos afectados, formato del manifiesto antes/después, pruebas ejecutadas y plan de migración de portadas externas.

## Fase 0 — Salvaguardas
- [x] 0.1 Respaldo Neon actualizado (snapshot `pre-fase1-saas`, sustituye al de la limpieza de catálogo; plan free limita a 1)
- [x] 0.2 Línea base de gates en verde (BUG-01; re-ejecutada al cierre de Fase 1)

## Fase 1 — Feed
- [x] 1.1 Colección: pestaña "Todos" solo juegos con estado (`Drawers.tsx`)
- [x] 1.2 Separación Colección / Favoritos / Lista intacta (`storage.ts`) — verificado sin cambios
- [x] 1.3 Contacto dinámico por tenant, sin `NEXT_PUBLIC_WHATSAPP` (`Chrome.tsx`, `Catalog.tsx`, `deliver.ts`, `useFeed.tsx`, `catalogApi.ts`, `types/catalog.ts`)
- [x] 1.4 `TenantSettings`: phone, email, logo, socialLinks + API pública settings tenant (schema, service, route `GET /api/v1/catalog/settings`, migración aplicada en Neon, admin general con editor de redes)

## Fase 2 — Biblioteca global
- [x] 2.1 `BaseGame`: status, source, keywords, developer, publisher
- [x] 2.2 `LibraryMedia`: media maestra heredable
- [x] 2.3 UI biblioteca con ficha completa (`LibEditModal`)
- [x] 2.4 Buscador server-side + paginación (`q` expandido + `genreId`/`platformId` + debounce 300ms + Pager real)

## Plan vigente — Arquitectura por plataforma (2026-10-14) → `tasks/plan-detallado.md`

### ~~Bloqueo inicial~~ — dudas cruciales §12 ✅ cerradas 2026-10-14
- [x] 12.1 Tricampo → `clearedFields` Json en TenantGame
- [x] 12.2 Slug → unique `(tenantId, platformId, slug)`
- [x] 12.3 Ofertas de Javier (57) → **borrar y empezar limpio** (demo sin peso; biblioteca intacta)
- [x] 12.4 `ps4` de Javier → migrar fila a global
- [x] 12.5 Snapshot → sustituir `pre-fase1-saas` justo antes del borrado (Fase 3.1)
- [x] 12.6 Contrato → `library-import@2` con `platformVariants[]`
- [x] 12.7 ACTIVE → título+slug+desc+≥1 plataforma+≥1 size+**portada obligatoria**
- [x] 12.8 Taxonomía desconocida → error por registro, frenar (sin auto-crear)

### Fase 1 — Modelo por plataforma (schema)
- [x] 1.2 Schema expand: `BaseGamePlatform` con size/requirements/procedencia; `TenantGame.platformId`+`clearedFields`; `TenantPlatform` (sin tocar uniques legados) — `prisma validate`+generate OK
- [x] 1.3 Migración Neon en rama temp → verificar (5+2 col, tabla, conteos 58/62 intactos) → aprobada → aplicada a `main`
- [x] 1.4 Seed: 6 plataformas globales canónicas en `seed.ts` + `ps4` de Javier migrado a global (id conservado, vínculos 1/2 intactos) + 3 globales nuevas insertadas en Neon
- [x] 1.5 Tests de modelos nuevos: `platform-models.test.ts` (10 tests) — 664/664 verdes, tsc limpio

### Fase 2 — Respaldos y recuperación
- [x] 2.1 Snapshot: decisión 12.5 anotada + procedimiento en Apéndice A; snapshot actual `snap-proud-leaf-b8q0dezc` verificado (`neon_list_snapshots`); se sustituirá en 3.1
- [x] 2.2 Apéndice A escrito (escenarios reversión A/B + conteos pre-borrado) + dump `backend/scripts/dump-fase3.json` (TenantGame 62/164/64/57, 0 huérfanos, conteos = BD, JSON legible)

### Fase 3 — Limpieza y arranque limpio (ex-57, decisión 12.3)
- [x] 3.1 Respaldo pre-borrado: snapshot `snap-orange-violet-b8nxp2p4` "pre-fase3-borrado" (sustituye al viejo, verificado con `neon_list_snapshots`) + dump `backend/scripts/dump-fase3.json` conteos = BD (62/164/64/57)
- [x] 3.2 Borrar `TenantGame` (+ cascada) y remodelar con tabla vacía ✅ 2026-10-15 rama temp `br-silent-sunset-b8zzgmvi`: 0 ofertas, platformId NOT NULL, title/sizeValue/sizeUnit nullable (slug NO), uniques nuevos, legados drop, 24 col intactas, schema.prisma sincronizado (validate+generate)
- [x] 3.3 Verificación: BaseGame 58, LibraryMedia 0, Platform 6, Tenant 2, 0 huérfanos ✅ (rama temp; recheck post-3.4 en producción)
- [x] 3.4 Aplicar a producción ✅ 2026-10-15 (aprobación registrada: ventana aceptada + pre-3.4 resueltas) + post-mortem: 0/0/0/0 · BaseGame 58 · bgp 59 · Platform 6 · Tenant 2 · Admin 2 · 24 col · platformId NOT NULL · 3 nullable · idx 2/0
- [ ] 3.5 **NO OLVIDAR — tsc: 7 errores escritura→Fase 6 (decisión 2026-10-15, §13; cerrados los de lectura en Fase 4):** `seed.ts:246` · `games.service.ts:471,563,900` (creates sin platformId + title null; línea 900 tras quitar el guard de 4.4) · `data-transfer.service.ts:626,645,984` — el gate de Fase 6 debe cerrarlos

### Fase 4 — Herencia y personalización (Fase 3 legada rediseñada)
- [x] 4.1 Servicio de resolución `resolveFinal` (TenantGame → BaseGamePlatform → BaseGame, tricampo `clearedFields`) + tests unitarios (`resolution.test.ts` 27/27)
- [x] 4.2 ~~Dual-write + backfill de los 57~~ no aplica (12.3) — se verifica herencia pura con catálogo vacío en 4.1/4.3
- [x] 4.3 Lecturas "valor final" en APIs de catálogo/feed + tests (revisar rutas públicas por slug con plataforma, 12.2)
- [x] 4.4 UI sin candados: tenant edita vía override; biblioteca solo SUPER_ADMIN ✅ 2026-10-15 — guard `libraryLockedKeys` eliminado (slug check = todos los orígenes); `GameForm` sin `lock`, prefill desde `resolved`; test 403 ADMIN en `base-games.test.ts`; gates: vitest 704/704 · tsc backend solo 7 F6 · eslint backend OK · tsc+eslint frontend OK (pendiente: revisión manual en el demo del checkpoint)
- [ ] 4.5 Contract: retirar columnas copiadas (deploy separado, posterior)

### Fase 5 — Importador de biblioteca global (A)
- [x] 5.0 Sembrar diccionario global en `seed.ts` (14 géneros + 8 categorías del piloto) — aprobado 2026-10-15 (ejecución en BD aparte, con permiso si es prod)
- [x] 5.1 Cerrar contrato `library-import@2` contra schema real (platformVariants, ACTIVE = ...+portada obligatoria) → `tasks/library-import-contrato.md`
- [x] 5.2 `POST /admin/library-import/validate` (preview, errores por registro, taxonomía cerrada, idempotente) ✅ 2026-10-15 — `library-import/{schemas,service,route}.ts` + montaje en `app.ts`, 18 tests; 2 revisiones adversas aplicadas (bug reales y contrato actualizado)
- [x] 5.3 `POST /admin/library-import/import` (upsert merge por slug, variantes, procedencia, sin tocar TenantGame) ✅ 2026-10-15 — plan compartido con validate, transacción real con rollback testeado, auditoría por registro; portada queda pendiente hasta 5.4 (`warnings[]`)
- [x] 5.4 Media `coverUrl`: SSRF-safe → Cloudinary → LibraryMedia; fallo no bloquea ✅ 2026-10-15 — `safeGetImage` (DNS pinning + todas las IP + cada redirección + 5 MB + `image/*`) y `library-import.media.ts` (allowlist, `library/games/{slug}/cover`, 1 fila por juego, `ERROR` reintentable, degrada a `INCOMPLETE` con aviso y motivo). Nunca guarda la URL de origen
- [x] 5.5 UI panel admin — **revisión en navegador HECHO 2026-10-16** (MCP chrome-devtools operativo). Verificado: guard de auth (redirige a `/admin/login`), botón "Entrar" deshabilitado sin campos, gate de "Importar biblioteca global" oculto para admin de tenant (solo texto), flujo de importación end-to-end con el mensaje de rechazo de 6.2-A renderizado y legible, 0 errores de consola. Hallazgos y arreglos abajo.
  - [x] **BUG GRAVE (corregido 2026-10-16):** `page.tsx` usaba `fetch` crudo sin el prefijo `/api/v1` en **exportar catálogo**, **exportar manifiesto** y **validar importación** → los tres endpoints devolvían 404 (el rewrite de `next.config.ts` solo cubre `/api/v1/:path*`). **El importador de catálogo nunca funcionó en navegador**: cualquier fichero terminaba en "No se pudo contactar con el servidor", y los botones de exportar no descargaban nada. Ahora usan `adminFetch`/`adminFetchRaw`. Sin test que lo cubriera: `adminApi.test.ts` probaba `adminApi`, no estas funciones → por eso los tests estaban verdes con la app rota.
  - [x] **Bug visual (corregido 2026-10-16):** `.brand` global de `feed.css` (`height` fijo + `overflow:hidden`) se colaba en `admin.css` y **recortaba la marca del admin** (medido: caja 36px con contenido de 91px, texto 41px por fuera). Afectaba al login **y** al sidebar. Fix: `.adm .brand{height:auto;overflow:visible}` → 91px, `clipped:false`.
  - [x] **Doble scroll (corregido 2026-10-16):** con ventana baja había dos contenedores de scroll (página 1052px vs 723px ventana; sidebar 838px vs 723px) y al pasar la rueda se movían los dos. Fix: un solo contenedor (`.main` scrollea, `.app{height:100dvh;overflow:hidden}`, sidebar fijo) + `overscroll-behavior:contain` en `.nav`. Verificado: ventana sin scroll, sidebar sin scroll interno, y scrollear la nav **no** mueve el contenido.
  - [ ] **5.5-pendientes:** el selector de archivo de "Importar catálogo" sale como widget nativo sin estilos, inconsistente con el resto de la UI.
  - [ ] **Pendiente:** la UI muestra el **UUID crudo** del tenant ("Tenant actual: c5ce8dd1-…") en el sidebar y en la píldora superior; debería mostrar nombre o slug.
  - [ ] **Pendiente:** la página de Plataformas dice "Pertenecen solo a tu negocio", que **contradice** la decisión 6.1 (plataformas globales + habilitación por `TenantPlatform`). Revisar copy al implementar 7.1.
  - [x] ~~Deuda transitoria~~ **cerrada 2026-10-16 con 6.2-B:** el export ya emite `catalog@2` y el importador solo admite `@2`, así que el texto "Acepta exclusivamente el formato de catálogo exportado arriba" vuelve a ser cierto y el botón "Exportar catálogo" genera un fichero que el importador **sí** acepta. Falta el botón que ejecute la importación (→ 6.2-C).
- [x] 5.6 Tests: validate/import/media + URLs maliciosas ✅ 2026-10-15 — 43 integración + 3 piloto real + 10 SSRF; backend 760/760
- [ ] **MCP de Chrome DevTools** — config escrita 2026-10-15 en `~/.config/opencode/opencode.json` (JSON validado, servidor `chrome-devtools` tipo local, `timeout: 120000`).
  - **2026-10-16:** **RESUELTO.** El usuario instaló Chrome 155 y, tras reiniciar, la sesión **sí** recibió las herramientas. El Chrome del sistema (90, copia portable en Total Commander) **no** se usó: el MCP trae el suyo. Para las pruebas: el upload de ficheros está restringido a rutas del workspace → copiar antes a `C:\Users\Luis\AppData\Local\Temp\opencode\review\`. La ventana del navegador está limitada a ~665-723px de alto en esta máquina, así que no se puede probar a 900px+ sin maximizarla a mano.
  - **2026-10-16 (previo):** config y binario **verificados**: `npx -y chrome-devtools-mcp@latest --help` descarga y arranca (v1.11.0).
  - **Chrome del sistema: NO sirve.** Único Chrome instalado = 90.0.4430.72 en `C:\Program Files\TotalCommander2021\Tools\Chrome\chrome.exe` (copia portable dentro de Total Commander, registrada pero fuera de rutas estándar). El MCP pide 144+ (`autoConnect`), 149+ (`allowedUrlPattern`), 150+ (WebMCP): **dejar que descargue su propio Chrome**, no apuntar `--executablePath` a ese binario.
  - Si `npx` no resuelve al arrancar: ruta absoluta `C:\Program Files\nodejs\npx.cmd` (sí está en PATH en `C:\Program Files\nodejs\npx.ps1`).
  - Node ≥ 20.19 (hay 26.10 ✓). Paquete verificado en npm: `chrome-devtools-mcp` v1.11.0 (Google).
  - **Reiniciar opencode**: la config no se recarga en caliente. Ojo: si la sesión se *continúa*, el conjunto de herramientas puede no reaparecer → probar con una sesión nueva.
  - Pendiente de decidir: hay dos configs globales (`opencode.json` con `neon`+`stitch`+`chrome-devtools`, `opencode.jsonc` con `cloudinary-asset-mgmt`). Conviene unificarlas para que un servidor no "desaparezca". Además, `opencode.json` tiene claves en texto plano: no compartirlo ni commitearlo.

**Revisión adversa del import (2026-10-15) — cerrado y abierto:**
- [x] `stateFingerprint` + `409 IMPORT_PREVIEW_STALE`: doble revalidación (antes de la transacción y dentro de ella, antes de la primera escritura). Cierra el pisado silencioso y el `P2002` por alta concurrente. Patrón ya existente en `data-transfer.service.ts`. 3 tests nuevos.
- [ ] Trocear la transacción por lotes si el piloto real supera ~500 registros (§5.5 del contrato): por encima de eso la transacción única no llega. Depende del tamaño del piloto (10.2).
- [ ] La UI de 5.5 debe prever una **petición larga**: la descarga y subida de portadas es secuencial y fuera de la transacción (~1–2 min para 50 portadas). Ver si el proxy/deploy tiene timeout por debajo de eso.

**Dry-run del piloto real (2026-10-15) — resultado:**
- [x] `library-import-pilot.test.ts`: migra `backend/scripts/library-import.json` (@1, 50 juegos) a @2 según §2.6 y pasa el archivo entero por `validate` + `import`. **0 errores de registro**, taxonomía del diccionario resuelta al 100%, 50 altas + 50 auditorías + portadas pendientes. El contrato aguanta la salida real del generador (se salta solo si el fixture no está, porque `scripts/` no se commitea).
- [!] **El generador NO emite tamaño en 16 de 50 juegos (32%)** → quedan `INCOMPLETE` por §2.2 (`sizeValue 0/GB`). **DECIDIDO 2026-10-15** (`Decisiones-Arquitectonicas-v1.md` §7.1): se aceptan como `INCOMPLETE`; no se inventa ni se estima el tamaño; el cierre es (1) generador 10.1 con dato de fuente real, por variante, o (2) enriquecimiento manual desde la ficha de biblioteca (SUPER_ADMIN, tamaño + estado en un guardado). El contrato no se relaja y el importador nunca deshace lo enriquecido a mano. Fija: si 10.1 empieza a emitir tamaños, el dry-run del piloto falla y obliga a revisar la decisión.

### Fase 6 — Importador de catálogo por tenant (B, adaptado)
- [x] 6.1 Contrato `luismi-platform/catalog@2` (entrada con plataforma; `catalog@1` → rechazo con mensaje claro) - **hecho 2026-10-15**: `tasks/catalog-import-contrato.md` + `catalogImportSchema`/`catalogOfferSchema` aditivos.
- [x] 6.2 Adaptar `data-transfer` validate/import: ofertas por plataforma, plataforma habilitada, aislamiento tenant — **cerrada con 6.2-A, 6.2-B y 6.2-C.** A: envelope `@2` exigido con `400 CATALOG_SCHEMA_UNSUPPORTED`. B: `analyzeEntries` → `analyzeOffers`, identidad `(tenantId, baseGameId, platformId)` con fallback `(platformId, slug)`, `clearedFields`. C: `LibraryImportSection` + `LibraryImportView`, `previewError`/`runError` separados, y el flujo `validate → preview → backup → run → resultado` verificado en navegador. **La casilla madre seguía sin marcar.**
  - [x] **6.2-A (mínima viable) 2026-10-16:** envelope `@2` exigido + `400 CATALOG_SCHEMA_UNSUPPORTED` ante `@1`/schema/`offers` ausente. Gates 763/763, eslint 0, tsc sin errores nuevos.
- [x] **6.2-B 2026-10-16:** `analyzeEntries` → `analyzeOffers` (`catalogOfferSchema`), identidad `(tenantId, baseGameId, platformId)` con fallback `(platformId, slug)`, plataformas **globales** + `TenantPlatform.enabled`, `slug` derivado `<base>-<platform>` (error si >50), `origin` derivado, `clearedFields` que reemplaza, `null`/ausentes que no borran, `SIZE_PAIR_INVALID`, taxononomía fuera del import (hereda de biblioteca), **retiradas acotadas a las plataformas declaradas** (decisión), export migrado a `catalog@2` (valores crudos + `skipped`/`notice` → **roundtrip cerrado**), sin puentes `genre`/`platform` ni `categoryId` en el import. **Cierra 3 de los 7 tsc** (los de `data-transfer`): quedan **4** (`seed.ts:246` · `games.service.ts:471,563,900`) → 6.2-C. Gates: **backend 775/775** · `tsc` solo 4 (F6) · `eslint src tests` 0.
    - **Decisiones tomadas 2026-10-16 (documentadas en `catalog-import-contrato.md` §2.1.1, §4.1, §4.2, §5.1):** (1) borrar solo en plataformas declaradas; (2) export@2 excluye ofertas sin biblioteca con `skipped` + motivo; (3) `slug` no se renombra nunca (aviso); (4) `clearedFields` reemplaza en vez de acumular; (5) `origin` se repara a `PERSONALIZADO` si la fila tiene overrides pero dice `BIBLIOTECA`.
    - **Corrección a una nota anterior (era inexacta):** los tests **no** estaban migrados a `@2`; solo se habían cambiado las cadenas `schema` y añadido el helper `offer()`. Los cuerpos seguían con campos v1 y había **15 tests en rojo**. El fichero se reescribió completo (53 tests) antes de tocar el servicio.
    - **Descubierto al implementarlo:** el panel (`configuracion/datos`) solo llama a `/import/validate`; **no hay botón que ejecute `/import/run`**. El roundtrip técnico funciona pero no es operable desde la UI → entra en 6.2-C.
  - [ ] **6.2-C:** modelo de lectura del panel (listado de ofertas con plataforma y origen, botón importar que ejecute `/import/run`) + cierre de los **4** errores `tsc` por `platformId` (`seed.ts`, 3 creates de `games.service`).
    - **Los 4 `tsc` ya están cerrados** (verificado 2026-10-16: `tsc --noEmit` sale 0 y backend **778/778**), así que queda el botón y el modelo de lectura.
    - **Rebanada 1/3 HECHA 2026-10-16** (preview): `src/lib/admin/catalogImportView.ts` (7 tests con `node --test`) + preview cableado en `configuracion/datos`. `/import/preview` se pide **solo si el archivo ya es válido**, para no perder `details.errors` (`errorFromResponse` solo lee `code` y `message`). Renderiza contadores con `.diff` y detalle en `details.fs`. Verificado en navegador con MCP (ruta de error por registro confirmada). Gates: `tsc` 0, eslint 0, frontend **96/96**, build OK.
    - [x] Rebanada 2/3 **HECHA 2026-10-16** (ejecutar): botón "Ejecutar importación" con copia previa (`/import/backup`), `confirm: 'IMPORTAR'`, `fingerprint` y `/import/run` con **timeout de 5 min** (las portadas tardan). Confirmación con `<label>` + checkbox real (`.tgl`), `puedeEjecutar()` exige cambios **y** confirmación, y pantalla de resultado con `tituloResultado()`/`resumenEjecutado()`. Tests: 4 nuevos (`puedeEjecutar`, `resumenEjecutado`, `tituloResultado`). Gates: `tsc` 0, eslint 0 (1 warning preexistente), frontend **100/100**, build OK. **Pendiente de verificar en navegador** (el usuario pidió parar los puertos: hay que volver a levantarlos).
    - **VERIFICACIÓN EN NAVEGADOR 2026-10-16 (MCP chrome-devtools, stack local, sesión `javier-admin`).** 3 de 4 puntos en verde:
      - ✅ **Flujo backup → run → resultado:** red `POST /import/validate` 200 → `/import/preview` 200 → `/import/backup` **201** → `/import/run` **200**; pantalla "Importación aplicada · 3 ofertas creadas".
      - ✅ **`409 IMPORT_PREVIEW_STALE`:** se bumpeó `CatalogMetadata.version` entre el preview y la ejecución → `/import/run` **409** con el mensaje del backend "El catálogo cambió desde la vista previa; vuelve a comparar los cambios".
      - ✅ **Listado con plataforma real:** `/admin/juegos` pasó de `—` a **PC / PlayStation 5 / Nintendo Switch**; cabecera "Plataforma" en singular.
      - ⚠️ **Timeout de 5 min: verificado SOLO por código** (`timeoutMs: 5 min` cableado). **No ejercitado**: las importaciones de prueba no descargan portadas, así que nunca tardaron. Exercitarlo exige un host de descarga lento real. **Queda para más adelante** (decisión del usuario).
      - **BUG encontrado y corregido gracias a esta verificación:** al fallar la ejecución la UI titulaba "No se pudo calcular el plan de importación" porque `previewError` se reutilizaba para el error del run (el plan sí se había calculado). Separado en `previewError` y `runError` con su título correcto ("No se pudo ejecutar la importación"). Además se eliminó un párrafo que repetía lo que ya decía el servidor.
      - **Falso positivo descartado:** marcar el checkbox parecía saltar a `/admin`; con un clic real en el DOM la ruta no cambia. Es la automatización fallando, porque el `<input type="checkbox">` real es de **1x1px** (el control visible es un `<span class="sw">`). No se tocó código sano.
      - **Semántica de ofertas confirmada en la BD:** `bg3-pc` y `celeste-switch` vivos, **`bg3-ps5` borrado en soft** (retirada acotada a las plataformas declaradas en el archivo), `celeste-ps5` creado, los cuatro con `origin: BIBLIOTECA` derivado. El aviso al usuario: "Se conservan 2 oferta(s) de plataformas que el archivo no declara (pc, switch)".
      - **Datos de prueba que quedan en la BD de dev:** el catálogo de Javier ya tiene 3 ofertas vivas + 1 soft-deleted, 2 respaldos `PRE_IMPORT` y `CatalogMetadata.version` subido 2 veces (83 → 85). Se puede limpiar si se quiere empezar de cero.
      - Consola: el único error es el **409 esperado** del caso stale, no un fallo de la app.
    - [x] Rebanada 3/3 **HECHA 2026-10-16** (modelo de lectura): el listado de `/admin/juegos` pintaba `platforms.map(...)` y con el modelo de ofertas eso es **siempre `-`**, porque la oferta no crea puentes y la plataforma vive en `platformId`. **No se cambió `platforms`** (hay un test que asserts `platforms: []` junto a `platformId` de forma deliberada: la oferta no crea puentes). Se añadió el campo explícito **`platform`** (`TaxonomySummary | null`) resuelto desde `platformId`, más `gameView.etiquetaPlataforma()` con fallback a los puentes legacy. La columna pasó de "Plataformas" a **"Plataforma"** (una oferta es una plataforma). El badge de origen ya existía. Tests: 3 nuevos backend + 3 frontend. Gates: backend **781/781**, `tsc` 0, eslint 0; frontend **103/103**, `tsc` 0, build OK, `check-encoding` OK. **Sin verificar en navegador** (puertos parados).
    - [ ] **BLOQUEANTE — RESUELTO 2026-10-16:** la tabla **`TenantPlatform` estaba vacía** (0 filas) y no había UI para habilitar plataformas, así que toda importación fallaba con "la plataforma 'X' no está habilitada". Resuelto en dos partes: (1) siembra en `prisma/seed.ts` (upsert idempotente que habilita las 6 plataformas globales para **todos** los tenants) + 12 filas aplicadas en la BD de dev con aprobación del usuario; (2) **7.1**closed con el módulo `tenant-platforms`. Lo que sigue pendiente es **7.2** (la UI del checklist), que va con el trabajo conjunto de UI.
- [ ] 6.3 Tests actualizados (plataforma, 403 cross-tenant) — parte hecha en 6.2-A (rechazo de v1 y envelope); faltan los de plataforma habilitada y 403.

### Fase 7 — TenantPlatform + admin global
- [x] 7.1 CRUD + permisos (SUPER_ADMIN globales, tenant admin solo habilita) — **HECHA 2026-10-16, backend.** Nuevo módulo `src/modules/tenant-platforms/`: `GET /tenant-platforms` (globales + `enabled` del tenant), `PATCH /tenant-platforms/:platformId` (upsert; 404 `PLATFORM_NOT_FOUND`, 422 `PLATFORM_NOT_GLOBAL`, 403 cross-tenant), `POST /tenant-platforms` (**solo SUPER_ADMIN**, 409 `PLATFORM_SLUG_EXISTS`). Auditoría `CREATE`/`UPDATE` con `entity` PascalCase y escritura+auditoría en `$transaction`. **15 tests de integración.** Gates: backend **796/796**, `tsc` 0, eslint 0, encoding OK.
  - Reutiliza `resolveTenantId` de `games.service.ts`, el `slugSchema` canónico de `game.shared.ts` (min 3) y los códigos de `taxonomy.config.ts`. El `create` de `taxonomy` no puede crear globales porque `resolveTenantId` nunca devuelve `null`; por eso la creación global vive en este módulo y no se metió un flag `global` en el CRUD genérico compartido por categorías/géneros/plataformas.
- [ ] 7.2 UI plataformas del negocio — **aplazada**: es parte del trabajo conjunto de UI (admin + feed). Con 7.1 ya existe endpoint; solo falta el checklist visual.
- [ ] 7.3 Filtro de conveniencia en listados/imports

### Fase 8 — Gestión de tenants (Fase 5 legada)
- [x] 8.1 `Tenant.deletedAt` + soft delete backend — **commit `2c22d0e`.** `DELETE /api/v1/admin/tenants/:id` hace borrado lógico con auditoría; el listado lo oculta y `?includeDeleted=true` conserva el histórico. Migración `20261017120000_fase8_tenant_deletedat` aplicada con `prisma migrate deploy`. Verificado a mano tras aplicarla: 0 relaciones rotas en 4 direcciones. **La casilla estaba sin marcar; el trabajo sí estaba hecho.**
- [ ] 8.2 Panel Negocios: "Eliminar" separado de "Suspender"
- [ ] 8.3 Selector de tenant global en header (SUPER_ADMIN)

### Fase 9 — Validación final
- [x] 9.1 Criterios de aceptación §14 — **mapa de evidencia en `tasks/aceptacion.md` (2026-10-16).** 8 de 9 criterios tienen test que los cubre; el 9º (media reintentable) también. **Criterio 6 (migraciones conservan registros y relaciones) es el único sin test automático** y se verificó a mano en la BD tras aplicar la migración de 8.1: 0 relaciones rotas en 4 direcciones, 61 `BaseGame`, 8 `Platform`, 12 `TenantPlatform`, 2 `Tenant`, 18 `Backup`. Queda por cerrar el criterio 8 (auditorías) con la revisión de 9.3, y decidir si el 6 se acepta como verificación manual documentada o se Automatiza.
- [x] 9.2 Gates globales — **2026-10-16.** Backend `vitest` **804/804**, `tsc` 0, `eslint src tests prisma` 0. Frontend `typecheck` 0, `lint` 0 errores (1 warning preexistente de fuentes), **103/103** tests, `build` OK y **`cf:build` (OpenNext → Cloudflare) OK por primera vez** — ese build es el que corre en el auto-deploy al hacer push a `main`, así que era el gate que faltaba de verdad. `check-encoding` OK.
- [x] 9.3 Revisión de seguridad — **`tasks/seguridad-9.3.md`.** RBAC de ambos importadores correcto (biblioteca = `SUPER_ADMIN`; catálogo = `resolveTenantId` que fuerza al `ADMIN` a su tenant). Aislamiento correcto, y el payload `strictObject` cierra el IDOR por identificador. **SSRF fuerte** (DNS con todas las IP, rechazo de cualquier IP privada, **IP fijada en el socket** → cierra el DNS-rebinding, redirecciones revalidadas, tope de 5MB, Content-Type de imagen). **Hueco encontrado y corregido:** `isBlockedV6` no enumeraba prefijos IPv6 de propósito especial (NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, `2001:db8::/32`, `100::/64`, `fec0::/10`), con test nuevo. Fuera de alcance y **señalado**: `npm audit` (es gate de release), cabeceras/CORS del frontend, y dos rangos IPv4 residuales que no apuntan a red interna.

### Fase 10 — Generador (otra OC, el último)
- [ ] 10.1 Regenerar piloto contra `library-import@2` (sin OST/DLC/secuela, variantes, reqs solo PC). **Prompt canónico escrito y listo**: `tasks/generador-prompt-v2.md`, contra el contrato `library-import@2`. El generador entrega el JSON y lo valida contra un backend real (`summary.error == 0`), porque `library-import-pilot.test.ts` **se auto-migra el fixture v1 y pasa aunque el JSON siga en `@1`** — no sirve de gate para esto.
- [ ] 10.2 Validar con `validate` real e importar piloto completo

## Pasada de fidelidad del feed (2026-10-17, fuera de las fases)

Trabajo no contemplado en el plan por fases: `main` se había hecho a medias con otra herramienta y había que dejar el feed igual que la referencia. Spec en `tasks/spec-fidelidad-feed.md`.

- [x] Especificación de fidelidad extraída del HTML de referencia — 12 tokens, 19 bloques `@media`, 310 selectores, 5 cortes (700/880/1020/1280) y los comportamientos firma. **Aviso: el HTML es un híbrido de dos capas** y hay que implementar el resultado de la cascada, no la capa antigua.
- [x] Merge de `origin/main` (12 commits de otra persona) — 1 conflicto, en `admin.css`, resuelto a favor de `main` por ser el arreglo más preciso. Sin push.
- [x] Fidelidad definitiva v1 — commit `971b17d`. Detalle móvil como hoja inferior, lista móvil a una columna, menú de tres puntitos con `aria-pressed` y "Quitar estado", "Mi colección" como en la referencia, titulares al tamaño real, difuminado de cabecera recuperado, elevación y borde dorado de la tarjeta.
- [ ] **Cortes 700px y 880px sin revisar** — pendientes de UI en `tasks/ui-admin.md`.
- [ ] **Miniaturas recortadas en "Mi colección"** — pendiente de UI.
- [ ] **Requisitos que empiezan por `"texto:"`** — pendiente de **datos**, no de UI: el catálogo entrega la cadena suelta en lugar de `os`/`cpu`/`gpu`/`ram`.

**Causa raíz de por qué `main` quedó a medias:** `feed.css` tiene reglas duplicadas. El valor correcto estaba escrito y tres reglas posteriores lo pisaban. No faltaban reglas, faltaba que ganara la buena. Por eso un diff automático de CSS no sirve: ve la declaración, no quién manda.

## Reinicio del catálogo (2026-10-20, fuera de las fases)

Operación pedida por el usuario tras tener desplegadas en producción todas las fases funcionales. Registro completo, reglas y vuelta atrás en **`tasks/reinicio-catalogo.md`**.

**Reglas decididas:** R1 taxonomía global por tipo · R2 slug fijo (minúsculas, guiones, sin acentos, únicos globalmente) · R3 géneros y categorías globales, sin excepción por negocio · R4 `CatalogMetadata` se conserva (el ETag es `"v${version}"`, bajarla a 1 daría 304 y contenido viejo en caché) · R5 **el carro está parado, no se importa nada** · medios no se tocan.

- [x] **Fase A — respaldo.** Plan gratuito de Neon: **no cabe snapshot** (solo 1 y lo ocupaba `pre-fase3-borrado`, que además es anterior a las fases 4–11 y no serviría). Respaldo lógico local: `backend/scripts/respaldo-pre-reinicio-2026-10-20T02-15-10.json`, 135 KB, sha256 `fe354fac…`, 10 tablas / 376 filas.
- [x] **Fase B — vaciado.** Una transacción, 8 `DELETE` en orden de claves foráneas. 12 tablas a 0; intactos tenants, usuarios, sesiones, auditoría, respaldos, reglas de precios y metadatos. Se comprobó que una sentencia fallida revierte todo.
- [x] **Fase C — taxonomía canónica.** 35 géneros + 10 categorías + 6 plataformas, todas globales. Fusiones: `Shooter`→`Disparos`, `RPG`→`Rol`, `Plataforma`→`Plataformas`, `Cartas`→`Cartas y mesa`, `Puzle`→`Puzzle`. Restaurado `TenantPlatform` (2 negocios × 6 = 12 filas).
- [x] **Fase D — verificación.** Base: 0 slugs duplicados, todo global. Web: catálogo `0 juegos` y pie `Catálogo v 89` (la versión no bajó).
- [x] **Vuelta atrás probada.** `backend/scripts/restaurar-catalogo.mjs`, probado en `--dry-run`: lee las 10 tablas, 376 filas, sin avisos de columnas.
- [ ] **Fase D (resto) — panel de administración sin verificar.** `/admin/generos`, `/admin/categorias`, `/admin/plataformas` y los interruptores de `/admin/negocios`. Requiere sesión; la contraseña la introduce el usuario.
- [ ] **Fase E — importar.** **Parada a propósito por R5.** El catálogo está vacío a propósito.
- [ ] **El respaldo vive solo en un disco** (`backend/scripts/` está gitignorado). Decidir si pasa a git o a un sitio con respaldo — `tasks/dudas.md` #14.

## Verificación final
- [ ] Backend 654/654, frontend completo (`tsc`, `eslint`, tests, `build`, `cf:build`) en verde
