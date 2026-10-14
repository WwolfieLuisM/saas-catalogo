# Todo — Javier PC SaaS V2

Plan: `tasks/plan.md`. Leyenda: `[ ]` pendiente · `[~]` en progreso · `[x]` hecho.

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
- [ ] 0.1 Respaldo Neon actualizado
- [ ] 0.2 Línea base de gates en verde

## Fase 1 — Feed
- [~] 1.1 Colección: pestaña "Todos" solo juegos con estado (`Drawers.tsx`)
- [ ] 1.2 Separación Colección / Favoritos / Lista intacta (`storage.ts`)
- [ ] 1.3 Contacto dinámico por tenant, sin `NEXT_PUBLIC_WHATSAPP` (`Chrome.tsx`)
- [ ] 1.4 `TenantSettings`: phone, email, logo, socialLinks + API pública settings tenant

## Fase 2 — Biblioteca global
- [ ] 2.1 `BaseGame`: status, source, keywords, developer, publisher
- [ ] 2.2 `LibraryMedia`: media maestra heredable
- [ ] 2.3 UI biblioteca con ficha completa (`LibEditModal`)
- [ ] 2.4 Buscador server-side + paginación

## Fase 3 — Herencia TenantGame
- [ ] 3.1 Migración expand: `*Override` nullable en `TenantGame`
- [ ] 3.2 Dual-write + backfill de los 57
- [ ] 3.3 Lectura "valor final" (`override ?? BaseGame`)
- [ ] 3.4 Quitar candados UI tenant (`GameForm.tsx`)
- [ ] 3.5 Contract: eliminar columnas copiadas (deploy posterior)

## Fase 4 — Importador CSV
- [ ] 4.1 Pipeline validado (nunca INSERT directo)
- [ ] 4.2 Validar / marcar pendientes
- [ ] 4.3 Enriquecimiento IGDB/Steam
- [ ] 4.4 Importar por plataforma a negocio (`TenantPlatform`)

## Fase 5 — Gestión de tenants
- [ ] 5.1 `Tenant.deletedAt` + soft delete backend
- [ ] 5.2 Panel Negocios: "Eliminar" separado de "Suspender"
- [ ] 5.3 Editar negocio: teléfono, correo, plataformas
- [ ] 5.4 `TenantPlatform` sobre plataformas globales (no restricción dura)
- [ ] 5.5 Selector de tenant global en header (SUPER_ADMIN)

## Verificación final
- [ ] Backend 575/575, frontend 80/80, `tsc`, `eslint`, `build`, `cf:build` en verde
