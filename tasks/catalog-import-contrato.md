# Contrato `luismi-platform/catalog@2`

**Fase 6.1** · 2026-10-15 · Depende de: Fase 3 (arranque limpio), decisión 12.3 (los datos `catalog@1` no se preservan) y Fase 4 (herencia de valor final).

Este contrato describe el **catálogo de ofertas de un tenant**. No toca la biblioteca global: eso es `library-import@2` (`tasks/library-import-contrato.md`). Aquí la biblioteca es solo de referencia.

---

## 1. Envelope

```json
{
  "schema": "luismi-platform/catalog@2",
  "generatedAt": "2026-10-15T00:00:00.000Z",
  "source": "catalogo-javier.csv",
  "offers": [ … ]
}
```

| Campo | Tipo | Regla |
|---|---|---|
| `schema` | string | **Obligatorio, exactamente `"luismi-platform/catalog@2"`.** |
| `generatedAt` | ISO-8601 string | Opcional, solo trazabilidad. |
| `source` | string 1–300 | Opcional, va al `AuditLog`. |
| `offers` | array | **Obligatorio, máx. 5000.** Cada elemento es **una oferta** = tenant × juego × plataforma. |
| `notice` | string | Opcional, informativo. **El importador lo ignora.** Lo emite el export para explicar sus `skipped`. |
| `skipped` | array de `{slug, reason}` | Opcional, informativo. **El importador lo ignora.** El export lo usa para decir qué ofertas dejó fuera y por qué. |

### 1.1 Rechazo de `catalog@1` (decisión 12.3)

`catalog@1` (el formato anterior, con `games[]` y `platformSlugs[]` plurales) **no se convierte ni se importa**:

```
El archivo declara "catalog@1" y este importador solo admite "luismi-platform/catalog@2".
Regenera el catálogo con el contrato nuevo: cada oferta es una entrada con una única "platformSlug".
```

El mensaje de regeneración tiene **prioridad** sobre cualquier otro problema del envelope, igual que en el importador de biblioteca. No hay datos `@1` que preservar: la Fase 3 borró las ofertas de Javier y arrancó limpio, así que no se está descartando nada.

### 1.2 Aislamiento de tenant

- El tenant es **siempre el de la sesión**. El payload **no puede** indicar `tenantId`; un `tenantId` en el archivo es un **campo no permitido**.
- Cualquier intento de leer o escribir ofertas de otro tenant es `403`.

## 2. Oferta (por entrada)

| Campo | Tipo | Regla / mapeo |
|---|---|---|
| `baseGameSlug` | slug | **Obligatorio.** Debe existir en `BaseGame` con `deletedAt IS NULL`. **El importador no crea juegos de biblioteca.** |
| `platformSlug` | slug | **Obligatorio.** Debe existir en `Platform` global **y estar habilitada** en `TenantPlatform` para el tenant de la sesión. |
| `slug` | slug 3–50 | Opcional. Si falta, se deriva `<baseGameSlug>-<platformSlug>`. Único por `(tenantId, platformId, slug)`. |
| `priceMode` | `RULE` \| `MANUAL` | Opcional, por defecto `RULE`. |
| `price` | number >0 ≤1e9 | Opcional. Con `priceMode: MANUAL` es obligatorio. |
| `availability` | boolean | Opcional, por defecto `true`. |
| `clearedFields` | array de nombres de campo | Opcional. Ver §2.1. |

### 2.1 Overrides de herencia

Los siguientes campos son **overrides**: si están ausentes o en `null`, la oferta hereda el valor final de la biblioteca (§4). Presentes, sobreescriben.

`title` · `description` · `sizeValue` · `sizeUnit` · `releaseYear` · `minimumRequirements` · `recommendedRequirements`

- `sizeValue`/`sizeUnit` van **en pareja** (uno sin otro → error de registro `SIZE_PAIR_INVALID`).
- `requirements`: objeto **estricto** con las claves `cpu, gpu, ram, os, directX, storage` (ninguna más).
- Un nombre desconocido dentro de `clearedFields` → error de registro `CLEARED_FIELD_UNKNOWN`. (Hoy el `enum` del esquema lo hace imposible deNullable; el importador no implementa ese código porque no se puede llegar. Si algún día se acepta texto libre, ahí entra.)
- `clearedFields` presente **reemplaza** la lista completa de la oferta (no se suma a la anterior): es la única forma de dejar de limpiar un campo desde el archivo. Ausente → no cambia.
- El `slug` derivado es `<baseGameSlug>-<platformSlug>`. Si supera los 50 caracteres o no es un slug válido → error de registro pidiendo un `slug` explícito.

### 2.1.1 La identidad de una oferta no se renombra (decisión 2026-10-16)

- El emparejamiento es por **`(tenantId, baseGameId, platformId)`** (único en base de datos) y, para ofertas antiguas sin `baseGameId`, por **`(tenantId, platformId, slug)`**.
- Si el archivo trae un `slug` explícito que **no** coincide con el de la fila emparejada, se **ignora con aviso**. Renombrar una oferta cambiaría su ruta pública y su URL de un lado a otro; el contrato lo declara operación manual.
- Si el `slug` pertenece a **otra** oferta → error de registro.
- Si el `slug` pertenece a una oferta **personalizada** (sin juego de biblioteca) → error de registro. El importador no rewirea ofertas a la biblioteca por sorpresa.
- Si la identidad ya la ocupa una oferta **retirada** (`deletedAt`) → error de registro pidiendo restaurarla antes.

### 2.2 Lo que `catalog@2` NO lleva (y por qué)

- **Taxonomía** (`categorySlug`, `genreSlugs`): la oferta hereda la de la biblioteca. El taxonomía por tenant en ofertas es de la **Fase 7**; hasta entonces se ajusta a mano desde el panel. (Decisión 2026-10-15: no emitir un campo que el importador no podría validar de forma honesta.)
- **`platformSlugs`** (plural del `@1`): sustituido por `platformSlug` singular. Una entrada = una oferta = una plataforma.
- **`origin`**: no se acepta del archivo. Se **deriva**: `BIBLIOTECA` si la oferta no tiene ningún override ni `clearedFields`; `PERSONALIZADO` en cuanto tenga al menos uno. Así el dato no puede mentir sobre su procedencia.
- **Media**: este importador **no** descarga ni toca imágenes. Las ofertas heredan la portada de la biblioteca.

## 3. Reglas de validación

| Código | Cuándo |
|---|---|
| `SCHEMA_INVALID` | Campo obligatorio ausente, tipo/formato inválido o **campo no permitido** dentro de la oferta. |
| `SIZE_PAIR_INVALID` | `sizeValue` sin `sizeUnit` (o al revés). |
| `CLEARED_FIELD_UNKNOWN` | Nombre en `clearedFields` que no es un campo heredable. |
| `BASE_GAME_NOT_FOUND` | `baseGameSlug` no existe en la biblioteca o está borrado lógicamente. |
| `PLATFORM_NOT_FOUND` | `platformSlug` no existe en el diccionario global de plataformas. |
| `PLATFORM_NOT_ENABLED` | La plataforma existe pero el tenant **no la tiene habilitada** (`TenantPlatform`). |
| `DUPLICATE_OFFER_IN_FILE` | El mismo `(baseGameSlug, platformSlug, slug)` aparece dos veces en el archivo. |

- Errores **por registro**: el resto del archivo se sigue procesando. Respuesta `200` con el detalle.
- Rechazo de **archivo entero** (400) solo para: envelope inválido, `schema` distinto de `@2`, o `offers` ausente/no-array.
- **Nunca se auto-crea** nada: ni juegos de biblioteca, ni plataformas, ni habilitaciones de plataforma.

## 4. Fusión e idempotencia

- **Ausente o `null` en el archivo → no cambia** lo que hay en la BD (mismo principio que §6 del contrato de biblioteca): el importador no borra datos buenos con vacíos. Limpiar es manual.
- **Identidad de la oferta:** `(tenantId, platformId, slug)`, y en la práctica `(tenantId, baseGameId, platformId)` (único en base de datos).
- Reimportar el mismo archivo sin cambios → **todas `skip`, 0 escrituras**.
- El `slug` derivado se registra en la fila: si más adelante el archivo trae `slug` explícito, se ignora con aviso (§2.1.1).

### 4.1 Retiradas acotadas a las plataformas del archivo (decisión 2026-10-16)

El importador sigue siendo un espejo, pero **solo dentro de las plataformas que el archivo declara**:

- Toda oferta activa cuya plataforma aparece en el archivo y que no llega en él → **retirada** (`deletedAt`).
- Toda oferta de una plataforma que el archivo **no** declara → **se conserva intacta**, y se emite un aviso indicando cuántas y en qué plataformas.

Motivo: con ofertas por plataforma, un archivo que solo cubre PC no puede decidir el destino de las ofertas de PS4 o Xbox. Sin este acotamiento, importar un catálogo parcial borraría el resto del negocio. Un archivo vacío en `offers` **retira todas las ofertas de todas las plataformas declaradas**, que es ninguna: no hace nada.

### 4.2 `origin` se deriva y también se repara

`origin` no se acepta del archivo (§2.2). El importador lo recalcula: `BIBLIOTECA` solo si la oferta no tiene ningún override material ni `clearedFields`; `PERSONALIZADO` en cuanto tenga uno. **Nunca se degrada** de `PERSONALIZADO` a `BIBLIOTECA`.

Consecuencia: una fila con un override material pero `origin: BIBLIOTECA` (estado que el panel y el importador no producen, pero que unSeed o una edición manual podrían dejar) se **repara** a `PERSONALIZADO` en la siguiente importación, y eso cuenta como cambio.

## 5. Endpoint

`POST /api/v1/admin/import/validate` y `POST /api/v1/admin/import/run` (los que ya existen), adaptados:

- El `tenantId` se toma de la sesión; el del payload se **ignora** y además es un campo no permitido.
- Los errores van **por registro**, prefijados con `Oferta N:`.
- `/preview` devuelve un **agregado**, no una fila por oferta: `{warnings, fingerprint, changes: {create[], update[], delete[], unchanged}}`. Cada elemento lleva `index` (posición en el archivo), `title` (puede ser `null` si la oferta hereda), `slug` y `platform`; los `update` añaden `id` y `fields[]`. Esto difiere de la redacción original de este §5 ("action/errors/changes por registro"): el agregado es lo que consume el panel y no se cambia en esta fase. El detalle por oferta existe para los errores y los avisos.
- Un `AuditLog` por importación aplicada (`IMPORT_STARTED` + `IMPORT_COMPLETED`, `entity: 'TenantGame'`).
- La operación es **transaccional**: un error de sistema revierte el lote entero, y el `fingerprint` se revalida dentro de la transacción antes de la primera escritura.

### 5.1 El export emite `catalog@2` (decisión 2026-10-16)

El export de catálogo migró de `@1` a `@2`, así que **exportar → importar vuelve a ser un roundtrip cerrado** (antes el export emitía `@1` y el importador lo rechazaba a propósito).

- El payload es **estrictamente importable**: no lleva `tenantId`, ni `tenant`, ni `version`, ni `games[]`. Solo `schema`, `generatedAt`, `source` (`catalogo-<slug del tenant>`), `notice`, `skipped` y `offers`. `tenant` y `version` quedan en el `AuditLog`.
- Exporta **valores crudos**, no el valor final resuelto: una oferta que hereda se exporta con `title: null`. Exportar el valor final convertiría la herencia en copia en el siguiente viaje.
- `clearedFields` solo se emite si no está vacío, para que el roundtrip no genere un cambio espurio.
- **Ofertas que el export no puede representar** (sin `baseGameId`, o cuya plataforma no es del catálogo global) van a `skipped` con motivo, no a `offers`. Emitirlas produciría un archivo que su propio importador rechaza.
- Un `catalog@2` exportado por un tenant **no lleva `tenantId`**: otro tenant puede importarlo (respetando sus plataformas habilitadas). Es intencionado.

## 6. Invariantes (con test)

1. Cero escrituras fuera del tenant de la sesión; ningún acceso a datos de otro tenant.
2. Una oferta por `(tenantId, platform, slug)`: el archivo no puede crear dos para la misma combinación.
3. El importador **no crea** `BaseGame`, ni `Platform`, ni filas de `TenantPlatform`.
4. Una plataforma no habilitada → error por registro, y **cero** `TenantGame` con esa plataforma.
5. Ausentes y `null` no borran.
6. Reimportar lo ya importado → `skip` total, 0 escrituras.
7. Error de sistema a mitad → rollback total.
8. Un archivo que declara `platformSlug` **no** retira ninguna oferta de una plataforma que no declara (§4.1).
9. El export → import del mismo tenant no produce cambios (roundtrip cerrado, §5.1).