# Dudas y diseños de arquitectura — Javier PC SaaS V2

Documento vivo. Registra lo ya decidido, lo aún dudoso y los diseños hasta que se cierre cada punto.
Plan maestro: `tasks/plan.md` · Checklist: `tasks/todo.md` · Prompt import: `tasks/library-import-prompt.md`.

---

## 1. Modelo mental del sistema (confirmado)

```
Luismi — biblioteca global (BaseGame, tenantId: null)
│
│  estanterías por plataforma: pc, ps5, ps4, xbox-series-x, xbox-one, switch...
│
├──► Javier — catálogo (TenantGame → BaseGame, con precio/disponibilidad/overrides)
├──► Cliente B — catálogo (TenantGame → mismo BaseGame)
└──► Cliente C — ...
```

- **BaseGame es la única fuente de verdad** de la biblioteca. No se duplica por tenant.
- **TenantGame** es la suscripción/presentación de un juego en un negocio: precio, disponibilidad, campos con override.
- **Valor final** (Fase 3): `TenantGame.<campo>Override ?? BaseGame.<campo>`.
- La biblioteca es de **solo lectura para tenants**. Solo SUPER_ADMIN la edita.
- Un juego que un cliente quiera y no esté en la biblioteca: o Luismi lo enriquece y lo sube, o el cliente lo crea como `PERSONALIZADO` (no compartido).

---

## 2. Decisión cerrada: import por JSON (no CSV)

**Decisión:** no se construye importador de CSV en la app.

**Flujo:**
1. Otra instancia de OpenCode limpia Excel/CSV → JSON (`library-import@1`).
2. La app solo valida (`validate`) e importa (`import`).
3. La otra OC puede iterar hasta que validate pase en verde.

**Por qué:**
- La parte difícil es limpiar datos, no parsear CSV.
- No hay UI de mapeo de columnas, encoding ni separadores.
- Validación en el servidor se mantiene (defensa en profundidad).

**Prompt entregado a la otra OC:** `backend\scripts\library-import-prompt.md` (fuera de git a propósito; no es código).

**Alcance de la otra OC:** solo genera el JSON + informe. El import en backend se hace aquí.

**Piloto de 50 (cerrado 2026-10-14):**
- Selección: primeras 50 filas en orden del CSV.
- IGDB en vivo: **autorizado solo para esos 50** (developer/publisher/platforms; CSV manda ante conflicto).
- Salida: `backend\scripts\library-import.json` + `backend\scripts\library-import-informe.md`.
- Filas sin tamaño: `status: INCOMPLETE` sin `sizeValue`/`sizeUnit` (R1.1), no placeholder.

---

## 3. Arquitectura de importación (dos importadores)

| Importador | Alcance | Estado |
|---|---|---|
| **A) Biblioteca** `library-import@1` | Crea/actualiza `BaseGame` (global) | **No existe aún** — es la Fase 4 redefinida |
| **B) Catálogo** `luismi-platform/catalog@1` | Crea/actualiza `TenantGame` en un negocio | **Ya existe** (`/admin/import/validate` + `/admin/import`) |

### 3.1 Gap actual de B
- Exige que el juego ya exista en `BaseGame` (`baseGameSlug`).
- No crea juegos nuevos en la biblioteca.
- Valida plataformas/géneros **del tenant**, no globales.

### 3.2 Diseño de A (pendiente de cerrar)
- `POST /admin/base-games/import/validate` → errores/avisos, sin escribir.
- `POST /admin/base-games/import` → backup + confirm + fingerprint (mismo patrón que B).
- Upsert por `slug` (o `ganador_igdb_id` si se decide soportarlo).
- Campos ausentes → `status: INCOMPLETE`, nunca relleno a ciego.
- **No toca `TenantGame`.**

---

## 4. Dudas abiertas — Import de biblioteca (Fase 4)

### 4.1 Taxonomía inexistente en el JSON
Si la otra OC manda `genreSlugs`/`platformSlugs`/`categorySlug` que no existen en la BD global:

| Opción | Efecto |
|---|---|
| **A** | Error en validate → hay que sembrar taxonomía antes |
| **B** | Crear automáticamente taxonomía global faltante (upsert por slug) |
| **C** | Aviso + crear solo si es plataforma/género estándar del diccionario |

**Estado:** sin decidir. Recomendación provisional: **C** (diccionario cerrado + crear lo estándar; el resto error).

### 4.2 Upsert en BaseGame por slug
| Opción | Efecto |
|---|---|
| **A** | Actualizar campos no vacíos (merge) |
| **B** | Saltar y avisar en informe |
| **C** | Error en validate si el slug ya existe |

**Estado:** sin decidir. Recomendación provisional: **A** merge (no pisar buenos datos con vacíos).

### 4.3 Medios (imágenes) en el JSON
El JSON no puede traer binarios. **Decisión 2026-10-14 (usuario: "sin portada pierde mucho"): opción B revisada** — `coverUrl` opcional en el JSON; el backend del import A la baja a Cloudinary durante la importación.

| Opción | Efecto | Estado |
|---|---|---|
| **A** | Solo texto; portadas luego a mano en `LibEditModal` | Descartada (perdía demasiado) |
| **B** | `coverUrl` (HTTPS, allowlist IGDB/Steam/PS); backend → Cloudinary `library/games/{slug}/cover` → `LibraryMedia` | **Decidida** |
| **C** | Hotlink sin subir | Rechazada (BUG-01 ya demostró el problema) |

Detalle pendiente en implementación: allowlist de hosts (anti-SSRF), reintento si la URL muere, juego se importa igualmente si falla la portada (aviso en informe). Screenshots: fuera de esta fase (solo portada).

**Estado:** decisión cerrada; prompt ya documenta `coverUrl`; falta implementar 4A.

### 4.4 Tamaño obligatorio vs `INCOMPLETE`
- Schema de catálogo (B) exige `sizeValue`/`sizeUnit`.
- Plan: campos desconocidos → marcar, no inventar.
- **Decisión comunicada y ejecutada en el piloto:** filas sin tamaño → `status: INCOMPLETE` sin `sizeValue`/`sizeUnit` (R1.1). Import A tendrá que aceptar eso; B no cambia.
- **Fuentes de tamaño para enriquecer (2026-10-14):** `pc` → **Steam**; `ps4`/`ps5` → **PlayStation Store**; xbox → Microsoft Store; switch → eShop. Sin API pública estable → best-effort; lo que no se obtenga sigue en R1.1. Origen del dato → `sizeSource` en el informe.

**Estado:** R1.1 ya ejecutado en piloto (48/50 missing_size). Enriquecer tamaños = siguiente paso, pendiente de planificar.

### 4.5 Enriquecimiento IGDB/Steam
- **Decisión:** la otra OC **sí** puede fusionar datos ya cruzados localmente (ej. 978 `MATCHED` del piloto) para completar developer/publisher/año/géneros vacíos.
- Prioridad: el CSV manda; IGDB solo rellena huecos; conflictos → aviso en informe.
- APIs en vivo desde la otra OC: **solo lo autorizado explícitamente** (piloto de 50: IGDB por `ganador_igdb_id`; portadas y tamaños según se autorice).
- ID tipo `ganador_igdb_id` en el JSON emitido: **no** (schema estricto no lo admite); lo usa la otra OC solo como clave de fetch.
- Resultado piloto: IGDB 50/50 (dev/pub 48/50, descripción 50/50, plataformas 100% de IGDB → diccionario).

**Estado:** decidido (fusionar local sí; APIs vivo bajo autorización caso a caso).

### 4.6 Enriquecimiento server-side (4.3 del plan)
- Opción dejarlo para después o que A dispare enriquecimiento en los `INCOMPLETE`.
- **Estado:** pendiente; probablemente post-Fase 4.

### 4.7 Importar por plataforma a un negocio (4.4 del plan)
- El plan lo resolvía con `TenantPlatform` (Fase 5.4), que **no existe**.
- Mientras no exista: no hay "importar solo PC a Javier" como filtro de negocio; se puede importar catálogo completo y filtrar después en UI.
- **Estado:** depende de Fase 5.4 o de definir un filtro provisional.

---

## 5. Dudas abiertas — Plataformas

### 5.1 Plataformas globales hoy (producción)
| slug | name | tenantId |
|---|---|---|
| `pc` | PC | global |
| `ps5` | PlayStation 5 | global |
| `ps4` | PS4 | **solo javier** (no global) |

Seed solo crea `pc` y `ps5` globales.

### 5.2 Lista canónica deseada (por confirmar)
El usuario quiere la biblioteca organizada como:

`pc · ps5 · ps4 · xbox-series-x · xbox-one · switch` (+ futuras)

**Pregunta:** ¿cada una va como plataforma **global** (`tenantId: null`)? ¿Alguna solo de un tenant?
**Pregunta:** ¿el `ps4` actual de javier se migra a global, o se crea un global nuevo y se re-mapea?

### 5.3 Diccionario de alias para la otra OC (cerrado en el prompt)

Canónico permitido: `pc`, `ps5`, `ps4`, `xbox-series-x`, `xbox-one`, `switch` (tabla de aliases en el prompt). Fuera de tabla → `report.platformsUnknown`, nunca slug inventado.

**Estado:** escrito en `backend\scripts\library-import-prompt.md`. Falta cerrar 5.1/5.2 (sembrar los globales que hoy no existen: `ps4` hoy es solo de javier).

### 5.4 TenantPlatform (Fase 5.4)
- `TenantPlatform(tenantId, platformId, enabled)` sobre plataformas globales.
- Filtro de conveniencia: "este negocio solo quiere PC y PS5", **no** restricción dura.
- Aún no existe; afecta a 4.4 (import por plataforma) y a 5.3 (editar plataformas del negocio).

---

## 6. Dudas abiertas — Fase 3 (Herencia) y demás

### 6.1 Fase 3 — Herencia TenantGame (sin ejecutar)
- 3.1 migración expand `*Override` → 3.2 dual-write + backfill 57 → 3.3 valor final → 3.4 UI sin candados → 3.5 contract.
- **Riesgo principal:** romper catálogo vivo. Mitigación: expand/contract, respaldo, bake time.
- **Restricción:** plan free de Neon limita a **1 snapshot**; el de Fase 0 (`pre-fase1-saas`) ya existe — ¿sustituir antes de 3.1 o crear igual?
- **Sin ejecutar; no hay dudas de diseño cerradas más allá del plan.**

### 6.2 Fase 5 — Gestión de tenants (sin ejecutar)
- Soft delete (`isActive` + `deletedAt`), nunca DELETE físico.
- Selector de tenant global en header (SUPER_ADMIN).
- **Riesgo:** escritura en tenant equivocado si el selector se desincroniza.
- 5.4 condiciona a 4.4 (ver arriba).

### 6.3 BUG-01.D — Importador multimedia
- **Sigue pendiente de decisión:** ¿hace falta respaldo restaurable de media o basta la auditoría (hecha)?
- No implementar hasta decidir.

### 6.4 Catálogo por plataforma — ejemplo RDR2 (hueco estructural, 2026-10-14)

**Modelo del usuario:** RDR2 existe en PC y PS4/PS5 → **misma identidad** (título, descripción, todo igual), pero: **requisitos solo PC**, **tamaño por plataforma**, **precio por plataforma y por negocio**. Dentro de un tenant (Javier: PC + PS4) son **dos catálogos absolutamente distintos** salvo la identidad compartida; el admin **elige catálogo** para administrar.

**Qué SÍ está contemplado hoy (schema):**
- Identidad compartida → `BaseGame` (title/slug/description/genres, `LibraryMedia`) con puente `BaseGamePlatform` ("existe en estas plataformas").
- Precio/availability **por tenant** → `TenantGame.price/priceMode/availability` (Fase 3: `override ?? BaseGame`).

**Qué NO está contemplado (4 huecos):**

| # | Hueco | Evidencia en schema |
|---|---|---|
| 1 | **Tamaño por plataforma** | `BaseGame.sizeValue/sizeUnit` (líneas 126-127): un solo tamaño; `TenantGame.sizeValue` (181-182): otro único por tenant+juego. RDR2 PC 119GB vs PS5 110GB → imposible. |
| 2 | **Requisitos solo PC** | `minimumRequirements Json?` (136, 186): un solo objeto colgado del juego, sin plataforma. En fila multiplataforma aplica "a PC y a PS4" (incorrecto). |
| 3 | **Precio por plataforma en el mismo tenant** | `@@unique([tenantId, baseGameId])` (199): **prohíbe** dos filas (PC y PS4) del mismo juego en un tenant → precio PC ≠ precio PS4 **imposible**. |
| 4 | **Catálogo elegible por el admin** | No existe noción de "catálogo = tenant × plataforma" (ver 4.7/5.4: `TenantPlatform` no existe; hoy `GamePlatform` es solo etiqueta de venta). |

**Impacto en lo ya empezado:**
- `library-import@1` emite **un** `sizeValue` por juego → en multiplataforma hay que elegir fuente (paso2: Steam si hay PC, si no PS) — aproximación provisional.
- Diseño definitivo requeriría **variantes por plataforma** en el JSON (schema bump) o inferencia PC-only para requisitos.
- Fase 3 (herencia) tendría que heredar por variante: `TenantGame.field ?? BaseGamePlatformVariante.field ?? BaseGame.field`.
- Import B (catálogo) hoy crea 1 `TenantGame` por juego → con modelo A creará 1 por (juego, plataforma).

**Opciones de modelo:**

| | **A (recomendada): fila por plataforma** | **B: fila única + oferta por plataforma** |
|---|---|---|
| Clave | `TenantGame` única pasa a `(tenantId, baseGameId, platformId)`; se elimina/relaja la unique 199 | Se mantiene `TenantGame` + tabla hija `TenantGameOffer(platformId, price, size, availability)` |
| "Elegir catálogo" | Filtro trivial por plataforma = catálogo | Vista que agrupa por hijo |
| Precio/size/requisitos | En la propia fila | En la oferta; requisitos PC quizá en oferta o en variante de biblioteca |
| Migración | Split de filas multiplataforma existentes | Tabla nueva + backfill |
| Fase 3 | Herencia natural por fila-plataforma | Herencia doble (identidad + oferta) |

**Estado:** **sin decidir.** Requiere confirmación del usuario antes de tocar schema, Fase 3 o imports. Mientras tanto: piloto sigue siendo aproximación (1 size/juego).

---

## 7. Restricciones / deuda que no se tocan

- Deuda README §15 (D1, C1, L1–L5, M2, H-4, H-7, H-17, RBAC H-2/H-3, B4/B5/B6/B9/B10): conservar IDs, no resolverlos en estas fases.
- No renombrar `BaseGame` en producción.
- No DELETE físico de tenants ni juegos.
- `.gitignore`, `ADMIN/`, `backend/scripts/` nunca se commitean.
- Sin push/deploy sin aprobación; migraciones Neon siempre con confirmación.
- No tocar proyecto Neon `Market-Place-Moa`.
- No hay importador multimedia (BUG-01.D) hasta decisión.

---

## 8. Checklist de decisiones que faltan (bloqueantes de trabajo futuro)

| # | Duda | Bloquea | Opciones | Recomendación / estado |
|---|---|---|---|---|
| 1 | Taxonomía inexistente al importar (4.1) | Fase 5 | A error / B auto-create / C diccionario+crear | **Cerrada 2026-10-14: error por registro en validate, frenar** (12.8, decisión del usuario) |
| 2 | Upsert BaseGame por slug (4.2) | Fase 5 | A merge / B saltar / C error | **Cerrada: A merge** (12.3implícito; plan Fase 5.3, no pisar buenos datos) |
| 3 | ~~Medios en JSON (4.3)~~ | — | A texto / B `coverUrl`→Cloudinary / C hotlink | **Cerrada: B** (coverUrl) |
| 4 | Lista de plataformas globales (5.1/5.2) | Seed + Fase 1 | Confirmar `ps4`, `xbox-*`, `switch` globales | **Cerrada 2026-10-14: globales las 6** (plan Fase 1.4) |
| 5 | Migrar `ps4` de javier a global o duplicar | Seed/BD | Migrar / crear global nueva | **Cerrada 2026-10-14: migrar a global** (12.4) |
| 6 | ~~Actualizar prompt con diccionario real~~ | — | — | **Hecho** (diccionario + piloto 50 + IGDB + portadas + fuentes de tamaño) |
| 7 | ¿Snapshot Neon nuevo antes de Fase 3? | Fase 3 | Sustituir el único / riesgo sin nuevo | **Cerrada 2026-10-14: sustituir, snapshot en Fase 3.1** (12.5). ✅ Ejecutado 2026-10-15: `snap-orange-violet-b8nxp2p4` "pre-fase3-borrado" (el viejo `pre-fase1-saas` borrado) |
| 8 | Orden: Fase 3 vs Fase 4 | Roadmap | 3 primero (corazón) / 4 primero (datos) | **Cerrada: plan-detallado §Índice** — herencia(F4) repuebla tras limpieza(F3), imports(F5/F6) antes que generators(F10) |
| 9 | BUG-01.D importador multimedia | — | Sí/no | **No aún** (4.3 parcialmente lo cubre) |
| 10 | Enriquecimiento server-side 4.3 del plan | Post-4 | Ahora/ después | **Después** |
| 11 | **Catálogo por plataforma RDR2 (6.4)** | Schema + Fase 3 + imports + UI | A fila por plataforma / B oferta hija | **Cerrada 2026-10-14: A = Modelo A** (Decisiones-Arquitectonicas-v1 + 12.1 `clearedFields`, 12.2 unique triple) |
| 12 | **Ofertas existentes de Javier (57)** | Fase 3 | Migrar split / borrar limpio | **Cerrada 2026-10-14: borrar y empezar limpio** (12.3, demo sin peso) |
| 13 | **Condición de ACTIVE** | Fase 5 | base / +portada obligatoria | **Cerrada 2026-10-14: portada obligatoria** (12.7) |

**Cerradas (2026-10-14):** piloto = primeras 50 del CSV; IGDB vivo solo para eses 50; salida a `backend\scripts\*.json/md`; sin tamaño → `INCOMPLETE` sin placeholder (R1.1); fuentes de tamaño Steam/PS; portadas via `coverUrl` → Cloudinary (4.3-B).

**2026-10-14 (3): §12 de `plan-detallado.md` cerrada** — tricampo `clearedFields` (12.1), unique `(tenantId, platformId, slug)` (12.2), borrar ofertas demo y arrancar limpio (12.3), ps4 a global (12.4), snapshot sustituido en 3.1 (12.5), `library-import@2` con `platformVariants[]` (12.6), ACTIVE con portada obligatoria (12.7), taxonomía desconocida → error por registro (12.8). Secundarias resueltas de paso: columnas copiadas → nullable con tabla vacía; `catalog@1` → rechazo con mensaje claro.

**Pendiente de planificar (orden propuesto):** ~~decisiones 1–2, 4–5, 8, 11~~ → ahora es ejecutar Fases 1–10 de `plan-detallado.md`; el generador regenera el JSON en Fase 10.

**Prompt de pasada 2 listo:** `backend\scripts\library-import-prompt-paso2.md` (ejecutado; pendiente de regeneración final en Fase 10 con reglas anti-OST/DLC/secuela).

---

## 9. Historial de cambios de este documento

- 2026-10-14: creación. Recoge decisiones de Fase 2 cerrada, rediseño de Fase 4 a JSON, dudas de plataformas y las 3 preguntas de la otra OC (tamaño, IGDB, alcance JSON).
- 2026-10-14 (2): piloto de 50 ejecutado (50/50, 48 `missing_size`, 0 fuera de diccionario). Cerrado: fuentes de tamaño (Steam para PC, PlayStation Store para PS4/PS5, Microsoft/eShop secundarios), R1.1 confirmada en uso, 4.3 cambiado de A a B (`coverUrl` en JSON → backend a Cloudinary), IGDB vivo solo con autorización explícita. Prompt actualizado con todo.
- 2026-10-14 (3): **§12 de `plan-detallado.md` cerrada con el usuario** (8 decisiones, ver sección 8). Plan rediseñado: Fase 3 pasa de "migrar 57" a "borrar ofertas demo + remodelar constraints con tabla vacía"; Fase 4 sin backfill; ACTIVE exige portada; contrato `library-import@2`. Plan completo por índices en `tasks/plan-detallado.md`, `todo.md` y memory-bank actualizados.
- 2026-10-15 (4): **Fases 2 + 3.1–3.3 ejecutadas.** Snapshot sustituido: `snap-orange-violet-b8nxp2p4` "pre-fase3-borrado" (borrado el viejo `pre-fase1-saas`, no servía de rollback por ser anterior a Fase 1; plan free = 1). Dump `backend/scripts/dump-fase3.json` (62/164/64/57, 0 huérfanos, conteos = BD). 3.2 en rama temp `br-silent-sunset-b8zzgmvi` verificada. **Dos decisiones del usuario (pre-3.4):** (1) **ventana de escrituras aceptada** — sin push hasta que Fases 4+ estén listas y solo con permiso; (2) **los 14 errores de tsc que abre el schema nuevo se diferían a Fases 4/6 según §13** — lista en `todo.md` item 3.5 (NO OLVIDAR: seed, games, catalog, data-transfer, media, pricing).
