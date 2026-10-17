# Contrato `library-import@2`

**Fase 5.1** · 2026-10-15 · Fuente de decisiones: `plan-detallado.md` §12.6–12.8 y §5 (5.1–5.6).
Autoridad: el importador es la autoridad de la **biblioteca global** (`BaseGame` + variantes + media). **Nunca toca `TenantGame`** (ofertas de tenant = Fase 6+).

---

## 1. Envelope

```json
{
  "schema": "library-import@2",
  "generatedAt": "2026-10-15T00:00:00.000Z",
  "source": "piloto_resultado.csv — origen de los datos",
  "games": [ … ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schema` | string | **Obligatorio, exactamente `"library-import@2"`.** `library-import@1` → rechazo con mensaje "regenera el JSON con el prompt v2" (sin intentar migrar). Otro valor → rechazo. |
| `generatedAt` | ISO-8601 string | Opcional. Solo trazabilidad. |
| `source` | string (1–300) | Opcional. Procedencia del archivo; va al `AuditLog` (no a `BaseGame`). |
| `games` | array de registro | **Obligatorio, máx. 5000 registros.** |

- Validación de envelope con **Zod estricto**: cualquier **campo extra a nivel envelope → rechazo 400** de todo el archivo.
- `BaseGame.source` se rellena con el literal `"library-import@2"` (columna de procedencia de la fila).

## 2. Registro (por juego) — `z.strictObject`

Campos extra **dentro de un registro → error por registro** (el resto del archivo sigue procesándose). Identidad: **`slug`** (único global en `BaseGame`).

### 2.1 Identidad y texto

| Campo | Tipo | Regla / mapeo |
|---|---|---|
| `title` | string 2–150 (trim) | **Obligatorio** → `BaseGame.title`. |
| `slug` | slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 3–50 | **Obligatorio** → `BaseGame.slug` (identidad del upsert). |
| `description` | string ≤5000, nullish | → `BaseGame.description`. **Ausente/vacío ⇒ condición ACTIVE falla** (no es error de registro). |
| `releaseYear` | int 1970–2100, nullish | → `BaseGame.releaseYear`. |
| `developer` | string ≤150, nullish | → `BaseGame.developer`. |
| `publisher` | string ≤150, nullish | → `BaseGame.publisher`. |
| `keywords` | string ≤500, nullish | → `BaseGame.keywords`. |
| `minimumRequirements` | objeto estricto (6 claves), nullish | → `BaseGame.minimumRequirements` (Json). **No** se autocompleta `recommendedRequirements` a partir de él (§6). |
| `recommendedRequirements` | objeto estricto (6 claves), nullish | → `BaseGame.recommendedRequirements` (Json). |

- Los slugs de taxonomía (`categorySlug`, `genreSlugs[]`, `platformSlug`) siguen el patrón `^[a-z0-9]+(?:-[a-z0-9]+)*$` con longitud 1–50 (el `slug` **del juego**, en cambio, es 3–50: es el identificador de `BaseGame`). `platformSlug` admite 2 caracteres porque `pc` es una plataforma válida.

### 2.2 Tamaño (decisión de diseño 2026-10-15)

| Campo | Tipo | Regla |
|---|---|---|
| `sizeValue` | number >0 ≤100000, nullish | → `BaseGame.sizeValue` si está presente. |
| `sizeUnit` | `MB\|GB\|TB`, nullish | Debe ir **en pareja** con `sizeValue` (uno sin otro → error de registro `SIZE_PAIR_INVALID`). |

**Si el registro omite el tamaño:** derivarlo de la **variante principal**: el primero de los `platformSlug` presentes en el registro que esté en el orden `pc > ps5 > ps4 > xbox-series-x > xbox-one > switch` **y tenga `sizeValue`**. Ninguna otra variante cuenta (p. ej. una variante `ps3` con tamaño no habilita la condición de tamaño). Si ninguna variante del orden tiene tamaño → se almacena `sizeValue = 0` + `sizeUnit = 'GB'` y el estado derivado es **INCOMPLETE** (columna `NOT NULL` satisfecha sin inventar datos).

- En una **actualización**, si el registro no aporta tamaño ni por campo ni por variante, se conserva el tamaño existente (§6); el `0/GB` es el valor por defecto **solo al crear**.
- **El tamaño ausente no se estima ni se sustituye** (tamaño de requisitos de store, de otro producto, ni un valor inventado): la decisión está en `Decisiones-Arquitectonicas-v1.md` §7.1. Un juego sin tamaño es `INCOMPLETE` y su cierre previsto es el generador (10.1, solo con dato de fuente real) o el enriquecimiento manual desde la ficha de biblioteca.

### 2.3 Taxonomía — diccionario global (12.8)

| Campo | Tipo | Regla |
|---|---|---|
| `categorySlug` | slug, nullish | Debe existir en `Category` con `tenantId IS NULL` y `deletedAt IS NULL`. No existe → **error de registro** `TAXONOMY_CATEGORY_UNKNOWN`. |
| `genreSlugs` | array de slug ≤50, nullish | Cada slug en `Genre` global. Desconocido → **error de registro** `TAXONOMY_GENRE_UNKNOWN` (se listan todos los desconocidos). |

- **Nunca auto-crear taxonomía** (12.8): el import no crea filas de `Category`/`Genre`/`Platform`.
- **Duplicados en el diccionario:** `tenantId IS NULL` no está protegido por el índice único `(tenantId, slug)` en Postgres (los `NULL` son distintos), así que dos filas globales con el mismo slug son legales. El import **no lo detecta**: el `seed` (5.0) y el admin de taxonomía garantizan la unicidad por construcción. De detectarse, el preview resolvería la última fila leída (comportamiento no garantizado).
- **Prerequisito 5.0 (aprobado 2026-10-15):** sembrar en `prisma/seed.ts` (upsert idempotente por slug) el diccionario que usa el piloto: **14 géneros** (`arcade, aventura, carreras, cartas, deportes, estrategia, indie, lucha, musica, plataformas, puzzle, rol, shooter, simulacion`) y **8 categorías** (`accion, aventura, deportes, puzzle, rol, sigilo, simulacion, terror`). Ejecutar el seed en la BD de destino **antes** del primer import (paso aparte del import, con permiso si es producción).

### 2.4 `platformVariants[]` (12.6) — obligatorio, `minItems: 1`

```json
"platformVariants": [
  {
    "platformSlug": "pc",
    "sizeValue": 35,
    "sizeUnit": "GB",
    "minimumRequirements": { "cpu": "…", "gpu": "…", "ram": "…", "os": "…" },
    "recommendedRequirements": { "cpu": "…", "gpu": "…", "ram": "…", "os": "…" },
    "provenance": { "source": "steam", "sourceUrl": "https://…", "confidence": 0.97, "ingestedAt": "2026-10-14", "notes": "" }
  }
]
```

| Campo | Tipo | Regla / mapeo |
|---|---|---|
| `platformSlug` | slug | **Obligatorio** → `Platform` global (12.8). Desconocido → error de registro `TAXONOMY_PLATFORM_UNKNOWN`. |
| `sizeValue` / `sizeUnit` | igual que §2.2 | → `BaseGamePlatform.sizeValue/sizeUnit` (variante gana a identidad en la resolución Fase 4). Pareja obligatoria. |
| `minimumRequirements` / `recommendedRequirements` | `requirementsSchema` (`cpu,gpu,ram,os,directX,storage`), nullish | → `BaseGamePlatform.minimumRequirements/recommendedRequirements` (Json). |
| `provenance` | objeto estricto, nullish | → `BaseGamePlatform.provenance` (Json, 12.6 "procedencia"). |

- `platformVariants` admite de 1 a **20** variantes por juego (límite propio del importador; la taxonomía global tiene 6 plataformas, así que 20 es holgado).
- `provenance`: `{ source: string 1–50 (obligatorio dentro del objeto), sourceUrl?: URL (cualquier esquema: es dato de procedencia, **no** se descarga), confidence?: number 0–1, ingestedAt?: string (YYYY-MM-DD), notes?: string ≤300 }`. Campos extra dentro de `provenance` → error de registro. Como `sourceUrl` admite esquemas opacos (`data:`, `file:`, …) y se copia verbatim a `BaseGamePlatform.provenance`, **ningún consumidor puede renderizarlo como `href`** sin validarlo antes.
- `platformSlug` repetido dentro del mismo registro → error de registro `PLATFORM_VARIANT_DUPLICATE`.
- `requirements` con cualquier clave desconocida → error de registro (objetos de requirements **no** son estrictos hoy en `game.shared.ts`; en este contrato se exigen estrictos: `cpu,gpu,ram,os,directX,storage` únicamente).

### 2.5 Portada (12.7 + 5.4)

| Campo | Tipo | Regla |
|---|---|---|
| `coverUrl` | URL **https** string, nullish | Fuente de la portada. Durante `import` se descarga (SSRF allowlist §4 de 5.4) → Cloudinary `library/games/{slug}/cover` → `LibraryMedia {kind:'COVER', sortOrder:0}`. **Fallo de descarga no bloquea**: juego importado, `LibraryMedia.status='ERROR'` o fila con `status='PENDING'` + aviso; sin portada ⇒ estado derivado INCOMPLETE. |

- `coverUrl` **no se copia a BD** como hotlink: `LibraryMedia.url` guarda la URL **de Cloudinary**.
- `validate` solo comprueba presencia/forma (la descarga ocurre en `import`).
- Las URLs se validan con el parser de WHATWG: se recorta el espacio en blanco/control del extremo antes de comprobar el esquema, así que `" https://…"` es válido y se guarda normalizada. La garantía de esquema es real: `http://`, `javascript:`, `data:` y `file://` quedan rechazados.

### 2.6 Campos que NO se aceptan

- `status` (**nunca del archivo**: solo se deriva, §3), `id`, `origin`, `price*`, `availability`, `platformSlugs` (del `@1`), `sizeValue`/`sizeUnit` sueltos **dentro de una variante con otro nombre**… todo lo no listado → **error de registro** por `strictObject`.
- Migración `@1 → @2` (tarea 10.1 / regeneración): eliminar `status`, convertir `platformSlugs: ["pc"]` → `platformVariants: [{"platformSlug":"pc"}]` (arrastrando el `sizeValue/sizeUnit` del `@1` a la variante principal y copiándolo a nivel de registro), mantener `genreSlugs`, `categorySlug`, `coverUrl`.

## 3. Estado derivado (12.7)

`BaseGame.status` se **deriva siempre**; el importador no lee `status` del archivo. Valores posibles: `ACTIVE` | `INCOMPLETE` (`PENDING_ENRICHMENT` queda fuera del alcance del import; solo Fase 10/admin).

**Las condiciones se evalúan sobre el resultado *fusionado*** (registro del archivo ∪ fila existente según §6), no solo sobre el archivo. Razón: si el archivo omite un campo, §6 lo conserva, así que la fila resultante **sí** lo tiene; derivar del archivo solo degradaría a `INCOMPLETE` un juego que en BD está completo y provocaría escrituras de `status` en cada re-import (rompiendo la idempotencia de §9.3). Consecuencia: un juego con descripción, tamaño y portada ya en BD que se reimporta con un archivo mínimo **mantiene** `ACTIVE`.

```
resultado_fusionado = archivo ∪ fila existente (§6)

ACTIVE ⟺ descripción presente y no vacía            (en el resultado fusionado)
       ∧ platformVariants ≥ 1                        (garantizado por schema)
       ∧ tamaño efectivo > 0                         (registro, o variante del orden de prioridad, o el ya existente)
       ∧ portada disponible                          (coverUrl presente en el archivo ∪ LibraryMedia COVER en estado OK)
en caso contrario ⇒ INCOMPLETE
```

- El estado del preview es **provisional en la condición de portada**: `validate` no descarga nada, así que solo comprueba que haya `coverUrl` en el archivo o una portada `OK` en BD. Si en `import` la descarga falla, 5.4 degrada el resultado a `INCOMPLETE` (§2.5).
- Una fila en `PENDING_ENRICHMENT` importada queda en `ACTIVE`/`INCOMPLETE` según lo anterior: el import **deriva siempre** el estado (§3) y por tanto abandona `PENDING_ENRICHMENT`; quien lo marque es el admin (Fase 10).
- `title` y `slug` siempre vienen del schema (obligatorios) → nunca producen INCOMPLETE, son error de registro si faltan.
- Un registro con errores de validación **no se importa** (queda en `errors[]`); no se "deja a medias".

## 4. `POST /admin/library-import/validate` (5.2)

- Auth: `authenticate` + `requireRoles('SUPER_ADMIN')`. Body: `{ "games": <archivo completo> }` (o el archivo entero como body — ver `validateImportSchema`: se envía el envelope).
- **Nunca escribe** (sin `TenantGame`, sin nada): solo lectura + cálculo.

Respuesta `data`:

```json
{
  "fingerprint": "sha256:…",
  "schema": "library-import@2",
  "summary": { "total": 50, "create": 40, "update": 5, "skip": 3, "error": 2 },
  "records": [
    { "index": 0, "slug": "redeemer", "action": "create", "status": "ACTIVE",
      "errors": [], "changes": ["+new"] },
    { "index": 7, "slug": "otro", "action": "update", "status": "INCOMPLETE",
      "errors": [], "changes": ["title", "genres"] },
    { "index": 9, "slug": "x", "action": "error", "status": null,
      "errors": [{ "code": "TAXONOMY_GENRE_UNKNOWN", "field": "genreSlugs", "message": "Género no encontrado en el diccionario global: rol" }] }
  ],
  "taxonomy": { "missingGenres": [], "missingCategories": [], "missingPlatforms": [] }
}
```

- `action ∈ create | update | skip | error`. `skip` = válido y sin diferencias con la BD (idempotencia visible).
- **Vocabulario de `changes`**: `["+new"]` cuando la fila no existe (creación); en actualización, los nombres de campo afectados por la fusión (`title`, `description`, `sizeValue`, `genres`, `platformVariants`, `cover`, `status`, `category`, `minimumRequirements`, …). `deletedAt` aparece cuando el juego estaba borrado lógicamente y el import lo revive (§5).
- **`source` no genera cambio**: `BaseGame.source` se estampa **solo al crear** la fila; en actualizaciones no se pisa la procedencia existente (no destructivo, §6). Por eso una fila admin preexistente y por lo demás idéntica da `skip`, no `update`.
- `errors[]` por registro con códigos estables: `SCHEMA_INVALID`, `SIZE_PAIR_INVALID`, `PLATFORM_VARIANT_DUPLICATE`, `DUPLICATE_SLUG_IN_FILE`, `TAXONOMY_CATEGORY_UNKNOWN`, `TAXONOMY_GENRE_UNKNOWN`, `TAXONOMY_PLATFORM_UNKNOWN`.
- **Slug duplicado dentro del mismo archivo**: la 2.ª y siguientes apariciones son error de registro (`DUPLICATE_SLUG_IN_FILE`). Sin esto, el `BaseGame.slug @unique` reventaría en `import` y el rollback total (§9.5) destruiría el resto de un archivo de 5000 registros.
- `fingerprint` = `sha256` del JSON canónico (claves ordenadas) del envelope `games`. El `import` debe devolverlo; **mismatch → 409 `FINGERPRINT_MISMATCH`** (el archivo cambió entre preview e import).
- Envelope con `schema` distinto a `@2` → 400 con mensaje de regeneración (este mensaje tiene prioridad sobre cualquier otro problema del envelope); campos extra de envelope → 400; registros inválidos → **200** con `action:"error"` por registro (errores por registro, no rechazo global).
- Doble ejecución → **mismo preview y mismo fingerprint** (criterio 5.2).
- **Techo efectivo de payload**: 5 MB (`express.json({limit:'5mb'})`, misma convención que `/admin/import`). El máximo lógico de 5000 registros solo es alcanzable con descripciones cortas; con descripciones de 5000 caracteres el límite real baja a ~300–400 registros. Para archivos mayores habría que subir el límite (coste de RAM en el parseo) o hacer chunking; fuera del alcance de 5.2.

## 5. `POST /admin/library-import/import` (5.3)

- Auth: igual que validate. Body: `{ envelope, fingerprint, stateFingerprint }` (los tres strict; las dos huellas son 64 hex).
- Re-valida **todo** internamente (no confía en el cliente):
  - si el `fingerprint` (huella del **archivo**) calculado ≠ recibido → 409 `FINGERPRINT_MISMATCH` (el archivo cambió entre preview e import);
  - si el `stateFingerprint` (huella del **estado de BD** que el preview leyó) ≠ el recalculado → 409 `IMPORT_PREVIEW_STALE`.
- **Doble revalidación del estado**, porque hay dos ventanas distintas:
  1. **Antes** de la transacción: el import vuelve a leer la biblioteca y compara con la huella que recibió. Si otro administrador tocó alguno de los juegos tocados (o los dio de alta) desde el preview → 409 sin escribir nada.
  2. **Dentro** de la transacción, antes de la primera escritura: se relee y se compara otra vez. Esto cierra la ventana de escritura, que si no permitiría que A pise con datos viejos lo que B acaba de escribir.
- `stateFingerprint` = `sha256` de un JSON canónico con: los `BaseGame` de los `slug` del archivo (id, `updatedAt`, título, descripción, año, developer, publisher, keywords, categoría, tamaño, `status`, `deletedAt`, requisitos), sus links de género, sus variantes (tamaño, requisitos, `provenance`) y sus filas `COVER` (incluidas las que **no** están en `OK`, para notar que una portada pasó de `ERROR` a `OK`). Un `slug` que **no** existe no aporta nada al digest: por eso un alta concurrente también cambia la huella y se rechaza.
- Aplica solo registros `create|update` válidos (los `error` se excluyen y se reportan), **en una única transacción**: cualquier error de sistema ⇒ rollback total (test "rollback en error mitad").
- Upsert por `slug` en `BaseGame` (incluye revivir soft-delete: `deletedAt → null`).
- Auditoría: `AuditLog` por registro (`entity:'BaseGame'`, `action:'CREATE'|'UPDATE'`, `metadata:{slug, action, schema, source, status, changes}`).
- **0 toques a `TenantGame`** (invariante con test).
- Respuesta: `{ fingerprint, summary:{create,update,skip,error}, records:[{index, slug, action, status, errors[], auditId}], warnings[] }`.

### 5.1 Una sola fuente de cálculo

`validate` e `import` **comparten `buildLibraryImportPlan()`**: el import no recalcula con otra lógica, sino que ejecuta exactamente el plan que el preview mostró. Si divergieran, el preview mentiría y la idempotencia se rompería sin que ningún test lo notara.

### 5.2 Estado derivado en la escritura

El `status` que se escribe es el **derivado** (`ACTIVE`/`INCOMPLETE`, §3), nunca el leído del archivo ni el anterior. Por eso importar un archivo sin descripción no degrada a `INCOMPLETE` un juego que ya la tenía en BD.

### 5.3 Escritura por campo (fusión no destructiva)

| Campo | Crear | Actualizar |
|---|---|---|
| `title` | del archivo | del archivo (siempre) |
| `description`, `releaseYear`, `developer`, `publisher`, `keywords` | del archivo o `null` | **solo si viene en el archivo**; ausente/`null` no toca la BD |
| `categoryId` | resuelto del `categorySlug` | solo si viene `categorySlug` |
| `sizeValue`/`sizeUnit` | tamaño fusionado (§2.2) | tamaño fusionado; si el archivo no aporta ninguno se conserva el existente |
| `status` | derivado | derivado (siempre) |
| `deletedAt` | `null` | **`null` siempre** (revive) |
| `source` | `'library-import@2'` | **no se toca** (§6) |
| `minimum`/`recommendedRequirements` | del archivo o `null` | solo si vienen; **sin autocompletar** uno desde el otro (§6) |
| `genreSlugs` | se crean los links | **reemplazan el conjunto** si vienen; ausentes no se tocan |
| `platformVariants` | se crean los links | **upsert por `platformSlug`**, no destructivo: variante en BD ausente del archivo se conserva |

### 5.4 Portada: ya no hay "pendiente" (resuelto en 5.4)

Mientras 5.4 no existió, el import no podía escribir `LibraryMedia` y un registro con `coverUrl` se reportaba `action:"skip"` con `auditId:null` más un aviso de "portada pendiente", y su `status:'ACTIVE'` era **provisional**. **Con 5.4 esto queda cerrado**: la descarga ocurre después de la transacción, la fila `LibraryMedia` se escribe (OK o ERROR), y el aviso de `warnings[]` refleja el resultado **real** de cada portada, no una intención.

Consecuencias que conviene tener presentes:

- El `skip` por portada pendiente ya no existe: `cover` es un cambio material.
- El invariante §9.3 (reimportar → 0 escrituras) se cumple también con archivos con `coverUrl`: si la portada está en `OK`, no se vuelve a descargar ni a subir.
- `warnings[]` pasó de "voy a hacerlo" a "esto falló", con el motivo (`HOST_NO_PERMITIDO`, `DESTINO_BLOQUEADO`, `HTTP_404`, `TIMEOUT`, `CONTENIDO_NO_PERMITIDO`, `DEMASIADO_GRANDE`, `SUBIDA_FALLIDA`, …). Es el campo que la UI de 5.5 debe mostrar.

### 5.5 Límite operativo del lote (timeout de transacción)

El import abre **una sola transacción** con `timeout: 120 s` / `maxWait: 10 s`, y cada registro aplica sus escrituras **de forma secuencial** (~5–7 viajes por registro, más 2 por variante). El máximo lógico de §1 (5000 registros) **no es alcanzable en una transacción**: con 2 variantes por juego serían ~30 000 viajes secuenciales. Por tanto:

- Tamaño práctico recomendado por importación: **hasta ~500 registros**. Por encima, la transacción agota el tiempo y se revierte entera (no queda nada a medias).
- El límite de 5 MB (§4) sigue siendo el techo duro de entrada.

**Pendiente (fuera de 5.3):** si el piloto completo (§10.2) resultara grande, hay que **trocear la transacción por lotes** de N registros con un reporte por lote, o agrupar las escrituras por tipo (`createMany` de variantes en bloque). Decisión a tomar con el tamaño real del piloto en la mano.

### 5.6 Lo que 5.3 NO cubre (revisado y aceptado como riesgo)

- **El doble de test no aísla la transacción.** `fakeDb.$transaction` entrega el propio `fakeDb` como `tx`, así que una regresión que usara `getPrisma()` dentro de `applyEntry` **no sería detectable**, y `createRowDelegate.create` no aplica el `@unique` de `slug`. El invariante §9.1 se cumple por construcción del código, no por el test. (`@unique` dentro de un mismo archivo sí está cubierto: `DUPLICATE_SLUG_IN_FILE`.)

## 6. Semántica de merge (5.3 — "no pisar buenos datos con vacíos")

| Regla | Detalle |
|---|---|
| Campo **ausente** o `null` en el archivo | **No cambia** lo que hay en BD (no borra). |
| Campo presente **con cadena vacía o solo espacios** (`description`, `developer`, `publisher`, `keywords`, `categorySlug`) | **Cuenta como ausente**: no pisa el valor curado ni degrada el estado. Razón: §6 se titula "no pisar buenos datos con vacíos" y una cadena vacía es un vacío; limpiar sigue siendo manual desde admin. El piloto (`library-import.json`) trae descripciones vacías, así que este caso es el normal, no el raro. |
| Campo **presente** con valor | Sobreescribe. |
| `genreSlugs` presente | **Reemplaza el conjunto** por el del archivo (set completo, determinista). Ausente → no cambia. |
| `categorySlug` presente (no-null) | Sobreescribe; `null`/ausente → no cambia. |
| `platformVariants` presente | **Upsert por `platformSlug`**: cada variante del archivo se crea/actualiza (no destructivo). Variante existente en BD **ausente del archivo → se conserva** (bajas de plataforma = acción manual en admin). Ausente el array completo → no cambia nada. |
| `coverUrl` presente | Descarga → upsert de `LibraryMedia` `kind:'COVER', sortOrder:0` (solo una portada). Ausente → no cambia la portada existente. |
| `BaseGame.source` | Se estampa **solo al crear** la fila. En actualizaciones **no** se pisa la procedencia existente. |
| `minimumRequirements` / `recommendedRequirements` | Campos independientes: el archivo nunca genera un `recommendedRequirements` que no traiga (no se autocompleta desde `minimum`). Autocompletar aquí destruiría requisitos curados, que es justo lo que §6 evita. |
| Idempotencia | Re-importar el mismo archivo tras importarlo → `skip` en todos, 0 escrituras (test). |

Nota de claridad: "no borran" aplica también a `description`/`developer`/etc.: **el `null` explícito no limpia** en `@2` (limpiar = manual desde admin).

**Alcance de esta regla:** §6 gobierna **el importador**. Los módulos `base-games` y `games` siguen usando `resolveRequirements` (`game.shared.ts`), que sí autocompleta `recommendedRequirements` desde `minimumRequirements` cuando falta el primero; es decir, un `PUT` de admin sobre la misma fila **sí** puede escribir un `recommendedRequirements` que el archivo no trae. No es una violación del contrato (que acota §6 al import), pero conviene no asumir el mismo comportamiento en ambos caminos.

**Consultas troceadas:** los `IN` de taxonomía y de `slug` se lanzan en lotes de 500 para no exceder el límite de parámetros de binding de Postgres (65535) ni degradar la consulta con un archivo de miles de registros; el orden de los resultados no se usa para decidir nada (todo va por mapa).

**Limitación conocida de la portada:** el preview solo detecta la **presencia** de una portada (`coverUrl` en el archivo ∪ `LibraryMedia` `COVER` en estado `OK`), no si la **imagen** es distinta, porque la URL de origen no se almacena (la fila guarda la URL de Cloudinary). Consecuencia: cambiar la imagen de portada de un juego ya importado **no aparece como cambio** en el preview. Se acepta por coherencia con la regla no destructiva de las variantes (bajas/cambios = manual). Si 5.4 guarda la URL de origen en el contexto de `LibraryMedia`, esta detección se podrá endurecer.

## 7. SSRF y portada (5.4, detalle en su tarea)

- Descarga con `safeGetImage` (`utils/safeUrl.ts`): solo `http(s)`, **DNS pinning** (se comprueba **todas** las IP que resuelve el hostname, no solo la primera), verificación de IP antes de **cada** redirección, máximo 3 saltos, 10 s de timeout y **5 MB de tope**. Un destino loopback, RFC1918, link-local (`169.254.169.254`), CGNAT, multicast o `::1` se rechaza **sin abrir conexión**.
- **Allowlist de hosts** además de la protección SSRF (`library-import.media.ts`): `images.igdb.com`, `media.igdb.com`, `steamstatic.com`, `cdn.akamai.steamstatic.com`, `shared.akamai.steamstatic.com`, `store.playstation.com`, `media.xbox.com` (y sus subdominios). Lista en código, ampliable. Un host fuera de la lista **no se descarga**, pero el juego se importa igual.
- `content-type` de la respuesta debe ser `image/*` (jpeg, png, webp, gif, avif): un `text/html` disfrazado de imagen se descarta.
- Éxito → `uploadImage` con `publicId` **determinista** `library/games/{slug}/cover` y reintentos (3) → `LibraryMedia {kind:'COVER', sortOrder:0, status:'OK', url: <URL de Cloudinary>, publicId}`. **Nunca se guarda la URL de origen: no hay hotlink.**
- Fallo (host no permitido, descarga bloqueada, error HTTP, no imagen, demasiado grande, subida fallida) → `LibraryMedia` con `status:'ERROR'` y `url`/`publicId` nulos, **una sola fila por juego** (si ya existía, se actualiza), aviso en `warnings[]` y **el juego baja a `INCOMPLETE`** si estaba en `ACTIVE`.
- El estado `ERROR` es deliberado y reintentable: la siguiente importación con el mismo archivo vuelve a intentar la descarga (no hay portada utilizable), y si esta vez funciona la fila pasa a `OK` y el juego vuelve a `ACTIVE`. Es el requisito "errores de media identificables y reintentables" (§9.1 del plan).
- **Coste real que introduce:** la descarga y la subida ocurren **fuera de la transacción** (nunca dentro: es E/S de red y bloquearía la transacción), **de forma secuencial** por registro. Con 50 portadas son 50 descargas + 50 subidas en serie, del orden de 1–2 minutos. El cliente (la UI de 5.5) debe prever una petición larga; si en el futuro el lote crece mucho, el orden natural sería acotar la descarga por lotes o encolar el trabajo de media.

## 8. Ejemplo completo (validable contra Prisma)

```json
{
  "schema": "library-import@2",
  "generatedAt": "2026-10-15T12:00:00.000Z",
  "source": "piloto_resultado.csv — primeras 50",
  "games": [
    {
      "title": "Hades",
      "slug": "hades",
      "description": "Roguelike de acción…",
      "releaseYear": 2020,
      "developer": "Supergiant Games",
      "publisher": "Supergiant Games",
      "keywords": "roguelike acción",
      "categorySlug": "accion",
      "genreSlugs": ["indie", "rol"],
      "sizeValue": 15,
      "sizeUnit": "GB",
      "minimumRequirements": { "cpu": "Intel Core i5-750", "gpu": "GeForce GTX 750 Ti", "ram": "4 GB", "os": "Windows 7 64-bit", "directX": "11", "storage": "15 GB" },
      "recommendedRequirements": { "cpu": "Intel Core i3-6100", "gpu": "GeForce GTX 1060", "ram": "8 GB", "os": "Windows 10 64-bit", "directX": "11", "storage": "15 GB" },
      "coverUrl": "https://images.igdb.com/igdb/image/upload/t_cover_big/co2w6y.jpg",
      "platformVariants": [
        {
          "platformSlug": "pc",
          "sizeValue": 15,
          "sizeUnit": "GB",
          "minimumRequirements": { "cpu": "Intel Core i5-750", "ram": "4 GB", "os": "Windows 7 64-bit" },
          "provenance": { "source": "steam", "sourceUrl": "https://store.steampowered.com/app/1145360/Hades/", "confidence": 0.98, "ingestedAt": "2026-10-14" }
        },
        {
          "platformSlug": "switch",
          "sizeValue": 3.5,
          "sizeUnit": "GB",
          "provenance": { "source": "nintendo", "confidence": 0.9 }
        }
      ]
    },
    {
      "title": "Juego sin tamaño",
      "slug": "sin-tamano",
      "description": "Descripción presente.",
      "genreSlugs": ["indie"],
      "platformVariants": [ { "platformSlug": "pc" } ]
    },
    {
      "title": "Juego con género desconocido",
      "slug": "genero-raro",
      "description": "…",
      "genreSlugs": ["genero-que-no-existe"],
      "platformVariants": [ { "platformSlug": "pc", "sizeValue": 1, "sizeUnit": "GB" } ]
    }
  ]
}
```

Resultados esperados:

| Registro | `action` | `status` | Explicación |
|---|---|---|---|
| `hades` | `create` | `ACTIVE` | Todo presente: descripción + 2 variantes + tamaño + `coverUrl`. |
| `sin-tamano` | `create` | `INCOMPLETE` | Sin tamaño en registro ni variante → `sizeValue=0`; sin `coverUrl`. |
| `genero-raro` | `error` | — | `TAXONOMY_GENRE_UNKNOWN`; **no se importa**; el resto sí. |

Mapeo a Prisma del registro `hades`: `BaseGame` (title, slug, description, sizeValue 15, sizeUnit GB, releaseYear, status `ACTIVE`, source `library-import@2`, keywords, developer, publisher, `categoryId`←`accion` global, min/rec Json) · `BaseGameGenre` ×2 ← `genreSlugs` globales · `BaseGamePlatform` ×2 (`pc`, `switch`) con size/requirements/provenance Json · `LibraryMedia` 1 (`COVER`, sortOrder 0, url Cloudinary tras descargar `coverUrl`).

## 9. Invariantes (con test)

1. Ninguna operación escribe en `TenantGame` / `TenantGameGenre` / `GamePlatform` / `GameMedia`.
2. `validate` no escribe nada (contadores idénticos antes/después, en **todas** las tablas, no solo `BaseGame`).
3. Re-importar lo ya importado → `skip` total, 0 escrituras.
4. Registro con error → sus filas no aparecen; los registros válidos sí se aplican.
5. Rollback total ante error de sistema a mitad de la transacción.
6. Un `slug` repetido dentro del archivo nunca llega a `import` (queda como error de registro), así que `@unique` no puede abortar un lote por un duplicado del propio archivo.
