# Reinicio del catálogo — 2026-10-20

Vaciar la base y reconstruirla con reglas limpias, tras tener desplegadas en producción todas las fases funcionales del plan.

Estado: **fases A–D ejecutadas y verificadas. Fase E (importar) parada a propósito.**

---

## 1. Por qué

El catálogo había acumulado suciedad de las importaciones piloto y de las pruebas de desarrollo:

| Tabla | Antes | Problema |
|---|---|---|
| `Genre` | 48 filas | 40 nombres distintos. Sinónimos conviviendo: `Puzle`/`Puzzle`, `RPG`/`Rol`, `Plataforma`/`Plataformas`, `Disparos`/`Shooter`, `Cartas`/`Cartas y mesa` |
| `Category` | 17 filas | 11 distintos. En su mayoría eran géneros otra vez |
| `Platform` | 8 filas | 6 distintos. `PC` y `PlayStation 5` duplicados, ambos huérfanos sin `global` ni negocio |
| `BaseGame` | 61 | Catálogo piloto a rehacer |
| `BaseGameGenre` | 156 | — |
| `BaseGamePlatform` | 62 | — |
| `TenantGame` | 4 | — |

Además, dev y producción comparten **una sola base Neon**, así que cada prueba en local escribía en producción. Arrancar de cero con reglas explícitas era más barato que seguir parcheando.

---

## 2. Reglas decididas por el usuario

| # | Regla | Decisión |
|---|---|---|
| **R1** | Alcance de la taxonomía | Una sola lista global por tipo. Cada negocio habilita las plataformas que usa mediante `TenantPlatform` |
| **R2** | Regla fija de slug | Minúsculas, guiones en vez de espacios, sin acentos, **únicos globalmente dentro de su tipo**. Sin excepciones |
| **R3** | Géneros y categorías | **Globales**. El negocio solo usa los que quiera. Un negocio no puede tener un género propio |
| **R4** | `CatalogMetadata` | **Se conserva, no se limpia**. Ver §4 |
| **R5** | Importar | **El carro está parado.** No generar ni importar nada hasta que el usuario lo indique |
| — | Medios | `GameMedia` y `LibraryMedia` no se tocan. Ya estaban vacíos |

### R3 resuelve la contradicción con `Decisiones-Arquitectonicas-v1.md` §4

Ese documento decía que «las categorías globales y las categorías particulares de un tenant se mantendrán diferenciadas». Ya no: **R3(a) elimina la categoría por tenant**. La columna `tenantId` de `Genre` y `Category` se queda en el esquema y se usa con `NULL` siempre. §4 ha quedado corregido.

### R2 cerró una duda que llevaba abierta desde el 2026-10-14

`dudas.md` §5.1/§5.2 describían `ps4` como «solo de javier» y la lista canónica como «por confirmar». Ambas cosas han quedado resueltas y el documento, actualizado.

---

## 3. R4 — por qué no se resetea la versión del catálogo

El ETag del feed se calcula como `` `"v${version}"` `` (`backend/src/modules/catalog/catalog.route.ts`). Al vaciar la base quedaban `Javier=89` y `Luis=3`.

Si se hubiera reiniciado a 1:

- el ETag cambiaría de `"v89"` a `"v1"`;
- los clientes que guardaron `"v89"` en caché recibirían **304 Not Modified** por parte del servidor, y servirían contenido viejo;
- `useFeed` solo vuelve a la red si la petición **falla**. Un 304 no es fallo, así que la caché ganaría.

Por eso `CatalogMetadata` queda intacto y la importación lo que hace es **subir** la versión (`planCatalogBump`): 90 y 4. Nunca bajar.

**Regla general que queda establecida:** la versión del catálogo es un contador monótono. Solo sube.

---

## 4. Qué se ejecutó

### Fase A — respaldo

El plan gratuito de Neon **no permitió crear snapshot**: solo cabe uno y ya ocupaba `snap-orange-violet-b8nxp2p4` «pre-fase3-borrado» (2026-10-15). Ese snapshot **no sirve de vuelta atrás** para esta operación, porque es anterior a las fases 4–11.

Se hizo en su lugar un respaldo lógico local:

```
backend/scripts/respaldo-pre-reinicio-2026-10-20T02-15-10.json
135 KB · sha256 fe354fac556c009fc236d662ce9b205702d566522a9e0c77639713e668184b3d
```

10 tablas: `BaseGame`, `BaseGameGenre`, `BaseGamePlatform`, `TenantGame`, `Genre`, `Category`, `Platform`, `TenantPlatform`, `CatalogMetadata`, `PricingRule`.

> **Aviso honesto:** `backend/scripts/` está en `.gitignore`, así que el respaldo **solo existe en este disco**. No está en git ni en la nube. Si este equipo muere, se pierde.

### Fase B — vaciado

Una sola transacción, en orden de claves foráneas:

```sql
DELETE FROM "TenantGame";        -- cascada: GameMedia, GamePlatform, TenantGameGenre
DELETE FROM "BaseGameGenre";
DELETE FROM "BaseGamePlatform";
DELETE FROM "BaseGame";          -- cascada: LibraryMedia
DELETE FROM "TenantPlatform";
DELETE FROM "Genre";
DELETE FROM "Category";
DELETE FROM "Platform";
```

**Comportamiento comprobado:** una sentencia fallida revierte la transacción entera. La primera ejecución falló por la columna `id` de `TenantPlatform` (tabla de unión sin `id`) y las tres sentencias previas se deshicieron solas. Confirmado el comportamiento atómico.

### Fase C — taxonomía canónica

35 géneros + 10 categorías + 6 plataformas, **todas con `tenantId = NULL`**.

**Fusiones aplicadas** (los sinónimos pasan a una sola entrada):

| Se eliminó | Quedó en |
|---|---|
| `Shooter` | `Disparos` |
| `RPG` | `Rol` |
| `Plataforma` | `Plataformas` |
| `Cartas` | `Cartas y mesa` |
| `Puzle` | `Puzzle` |

**Plataformas (6):** PC · PlayStation 4 · PlayStation 5 · Nintendo Switch · Xbox One · Xbox Series X

**Géneros (35):** Acción · Arcade · Aventura · Carreras · Cartas y mesa · Casual · Ciencia ficción · Conducción · Construcción · Deportes · Disparos · Estrategia · Estrategia en tiempo real · Fantasía · Fútbol · Granja · Hack and slash · Indie · Lucha · Mitología · MOBA · Mundo abierto · Música · Plataformas · Point and click · Por turnos · Postapocalíptico · Puzzle · Relajante · Rol · Sandbox · Simulación · Supervivencia · Táctico · Western

**Categorías (10):** Acción · Aventura · Carreras · Deportes · Otros · Puzzle · Rol · Sigilo · Simulación · Terror

`Category` se mantiene como **balde principal** de un juego (un solo valor), y `Genre` como **etiquetas** (muchos a muchos). No son la misma cosa pese a compartir nombres: la categoría es el estante, el género es la etiqueta.

Se restauró además `TenantPlatform`: los 2 negocios activos × 6 plataformas globales = **12 filas, todas `enabled=true`**. Era el estado previo y ninguna decisión lo cambiaba.

### Fase D — verificación

Base:

- `Genre` 35, `Category` 10, `Platform` 6 — **todas globales**, ninguna con `tenantId`
- **0 slugs duplicados** en los tres tipos (R2 cumplido)
- `TenantPlatform` 12 filas: Javier 6/6 y Luis 6/6 habilitadas
- 12 tablas a 0; intactos `Tenant` 2, `AdminUser` 3, `AdminSession`, `AuditLog` 200, `Backup` 19, `PricingRule` 6, `CatalogMetadata` 2, `TenantSettings` 2

Web (`https://saas-catalogo-frontend.luisiking89.workers.dev`):

- Catálogo público: **`0 juegos`** — el vaciado se ve en producción
- Pie: **`Catálogo v 89`** — la versión no bajó, la R4 se confirma en pantalla

Pendiente de verificar en el panel de administración: `/admin/generos`, `/admin/categorias`, `/admin/plataformas` y los interruptores de `/admin/negocios`. Requiere iniciar sesión; la contraseña la introduce el usuario.

---

## 5. Vuelta atrás

El único mecanismo válido es el respaldo de la Fase A.

```bash
cd backend
node --env-file=.env scripts/restaurar-catalogo.mjs backend/scripts/respaldo-pre-reinicio-2026-10-20T02-15-10.json
```

Con `--dry-run` imprime lo que haría sin escribir nada.

**Restaura** las 10 tablas del respaldo. **No toca** `Tenant`, `AdminUser`, `AdminSession`, `AuditLog`, `Backup` ni `TenantSettings`, porque no estaban vaciadas.

---

## 6. Qué queda pendiente

- **Fase E — importar.** Parada por la regla R5. No se ha generado ni importado ningún juego. El catálogo está vacío a propósito.
- **Verificación del panel de admin** de los bloques de taxonomía (§4, Fase D).
- **Decidir si el respaldo local pasa a git o a un sitio con respaldo.** Hoy vive solo en un disco.

---

## 7. Orden de ejecución para rehacer esto desde cero

1. Respaldo y verificación de su sha256.
2. Vaciar por orden de claves foráneas, en una sola transacción.
3. Recrear la taxonomía canónica **antes** de importar.
4. Restaurar `TenantPlatform`.
5. Validar en seco.
6. Importar — solo si el usuario lo autoriza.

El paso 3 **debe** ir antes del 6: el validador de importación rechaza las ofertas cuyas plataformas no están habilitadas en el negocio (`data-transfer.service.ts`). Con `TenantPlatform` vacío, la importación entera fallaría.
