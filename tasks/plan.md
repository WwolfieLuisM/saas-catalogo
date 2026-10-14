# Plan — Javier PC SaaS V2

Estado: **aprobado**. Decisiones cerradas el 2026-10-13.

## Decisiones de diseño (cerradas)

1. **Herencia con override por campo** — `BaseGame` → `TenantGame` con sobrescrituras nullable.
   ```
   valor final = TenantGame.<campo>Override si existe; si no, BaseGame.<campo>
   ```
   No copiar datos. No duplicar juegos por tenant.
2. **Tamaño** — conservar `sizeValue` + `sizeUnit` (MB/GB/TB). No migrar a `sizeGB`.
3. **Estados de colección** — mantener 3: `pending`, `played`, `won`. No añadir `playing`.
4. **`LibraryMedia`** — portada y screenshots a nivel biblioteca global, con override opcional por tenant (`GameMedia`).
5. **`BaseGame` conserva su nombre físico** — no renombrar tablas en producción. "Game Library" es el concepto, no el nombre.
6. **Orden de fases** — Feed → Biblioteca global → Herencia → CSV → Gestión de tenants.

## Principios (de PROMPT_ARQUITECTURA_V2)

- Revisar `schema.prisma` y relaciones antes de tocar nada. Nada destructivo sin migración + respaldo.
- Nunca duplicar juegos por tenant. Nunca mezclar colección con catálogo. Nunca mezclar favoritos con lista.
- `BaseGame` es la fuente de verdad del catálogo. La colección del usuario es independiente del catálogo.
- Soft delete para tenants: `isActive=false` + `deletedAt`, nunca `DELETE` físico.
- Importar catálogo por plataforma es un filtro de conveniencia, no una restricción dura.
- Importación CSV siempre pasa por validación → normalización → `BaseGame` → enriquecimiento → `TenantGame`, nunca INSERT directo.
- Ningún campo obligatorio con valor desconocido. Los incompletos se **marcan** (`INCOMPLETE`), no se descartan ni se rellenan a ciegas.
- Los precios son por tenant, no de la biblioteca.

## Fases

### BUG-01 — Manifiesto multimedia y portadas (2026-10-14, paralelo a Fase 1)

Bug verificado: el manifiesto multimedia exportaba solo `publicId` (null en 55 de 57 portadas, que son hotlinks de IGDB) y la página Datos invitaba a importarlo en un endpoint que solo acepta catálogos. Detalle, solución (A/B/C/D) y límites en `tasks/todo.md`.

- A, B y C: **hechos**. Gates: backend 611/611, frontend `typecheck` 0 / `eslint` 0 errores / 80-80 / build 28 rutas / `cf:build` OK.
- C: pantalla de solo lectura en `/admin/configuracion/multimedia/` con `GET /admin/media/audit` + `POST /admin/media/audit/check` (verificación HEAD anti-SSRF bajo demanda; miniaturas con fallback `onError`).
- D: pendiente de decisión (no importador multimedia en esta fase).

### Fase 0 — Salvaguardas
- 0.1 Respaldo Neon actualizado.
- 0.2 Línea base de gates en verde (backend 575/575, frontend 80/80, `tsc`, `eslint`, `build`, `cf:build`).

### Fase 1 — Feed (visible al cliente; menor riesgo)
- 1.1 Colección: la pestaña "Todos" lista **solo juegos con estado**, no el catálogo completo (`Drawers.tsx`).
- 1.2 Separación intacta Colección (`game-status`) / Favoritos (`favorites`) / Lista (`list`) en `storage.ts`.
- 1.3 Contacto dinámico por tenant: eliminar `NEXT_PUBLIC_WHATSAPP` de `Chrome.tsx`; nombre y contacto vienen del tenant (`TenantSettings`).
- 1.4 API pública de settings del tenant + columnas nuevas `phone`, `email`, `logo`, `socialLinks` en `TenantSettings`.

### Fase 2 — Biblioteca global (antes de meter datos)
- 2.1 `BaseGame.status` (`ACTIVE|PENDING_ENRICHMENT|INCOMPLETE`) + `source`, `keywords`, `developer`, `publisher`.
- 2.2 `LibraryMedia`: media maestra a nivel `BaseGame` (portada + screenshots), heredable.
- 2.3 UI de biblioteca con ficha completa (`LibEditModal`): título, slug, año, tamaño, descripción, géneros, plataformas, categoría, req mín/rec, multimedia.
- 2.4 Buscador server-side + paginación real en biblioteca y juegos (`q` ya soportado en `base-games.service.ts`).

### Fase 3 — Herencia TenantGame (el corazón)
- 3.1 Migración expand: columnas `*Override` nullable en `TenantGame` (o tabla de overrides). Nada se borra.
- 3.2 Dual-write + backfill en lotes de los 57 existentes.
- 3.3 Lectura "valor final" (`override ?? BaseGame`); portada hereda la de la librería salvo override.
- 3.4 Quitar candados en la UI del tenant (`GameForm.tsx` `lock`): el tenant edita todo vía override.
- 3.5 Contract en deploy separado posterior: eliminar columnas copiadas obsoletas.

### Fase 4 — Importador CSV
- 4.1 Pipeline: CSV → validación → normalización → `BaseGame` → enriquecimiento → `TenantGame`. Nunca INSERT directo.
- 4.2 Validar título, plataforma, género, categoría, tamaño. Marcar pendientes: descripción, requisitos, imágenes, metadata.
- 4.3 Enriquecimiento opcional IGDB/Steam por `ganador_igdb_id`. Slugs ≥3 caracteres.
- 4.4 Importar por plataforma a un negocio usando `TenantPlatform` como filtro (intersección).

### Fase 5 — Gestión de tenants (después de estabilizar la biblioteca)
- 5.1 `Tenant.deletedAt` + soft delete backend (`isActive=false` + `deletedAt`), nunca DELETE físico.
- 5.2 Panel Negocios: acción "Eliminar" separada de "Suspender".
- 5.3 Editar negocio: teléfono, correo, plataformas.
- 5.4 `TenantPlatform(tenantId, platformId, enabled)` sobre plataformas globales. No restricción dura.
- 5.5 Selector de tenant global en header (Context, solo SUPER_ADMIN), sincronizado entre páginas.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Herencia (Fase 3) rompe catálogo vivo | Expand/contract, dual-write, respaldo, bake time antes de contract |
| Media a nivel librería | `LibraryMedia` additive; portada actual se migra sin borrar |
| Borrar negocio | Solo soft delete |
| Renombrar `BaseGame` | No se hace |
| Contacto por tenant rompe feed | Validar tenant activo |
| CSV incompleto | Marcar `INCOMPLETE`, no insertar ciego |

## Verificación final

- Backend 575/575, frontend 80/80, `tsc --noEmit` 0, `eslint .` 0, `next build` 28 rutas, `npm run cf:build`.
- Colección solo muestra estados; favoritos y lista separados.
- Contacto y nombre por tenant, sin `NEXT_PUBLIC_WHATSAPP`.
- Herencia real: cambiar un campo en la librería se propaga a tenants sin override.
- Negocios: editar contacto/plataformas, suspender y eliminar (soft) funcionan.
