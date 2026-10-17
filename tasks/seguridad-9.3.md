# 9.3 — Revisión de seguridad (importadores y media)

> Fecha: 2026-10-16. Alcance según el plan: **RBAC de import**, **aislamiento tenant en ambos importadores** y **SSRF de media**. Método: `security-and-hardening` (superficie de confianza, activos, y controles verificados contra el código real, no contra la intención).

## Superficies y activos

| Entrada no confiable | Cruza en | Activo en riesgo |
|---|---|---|
| Fichero JSON del catálogo (`catalog@2`) | `/import/validate`, `/preview`, `/backup`, `/run` | Catálogo de cualquier tenant (precios, disponibilidad, عطado de ofertas) |
| Fichero JSON de la biblioteca (`library-import@2`) | `/library-import/validate`, `/import` | Biblioteca **global** y su multimedia |
| `coverUrl` dentro del JSON | `syncCover` → `safeGetImage` | Red interna del servidor / metadatos de la nube |
| `tenantId` en query y body | `resolveTenantId` | Aislamiento entre tenants |

## 1. RBAC de los importadores — ✅ correcto

- **Biblioteca global** (`library-import`): `router.use(authenticate, requireRoles('SUPER_ADMIN'))`. Es dato global, así que solo `SUPER_ADMIN` es lo correcto.
- **Catálogo del tenant** (`data-transfer`): solo `authenticate`, y el aislamiento lo hace `resolveTenantId`, que **fuerza al `ADMIN` a su propio tenant** y responde 403 si intenta apuntar a otro. Correcto: un admin de tenant debe poder importar en **su** catálogo.
- Cubierto por tests: cross-tenant 403 en `import-export.test.ts`, y RBAC de biblioteca en `library-import.test.ts`.

## 2. Aislamiento tenant en ambos importadores — ✅ correcto

- Ambos pasan por `resolveTenantId(auth, input.tenantId)`; no hay ninguna consulta por tenant上扬o fuera de esa resolución.
- El payload `@2` se valida con `strictObject`: **cualquier clave desconocida se rechaza**, así que no se puede inyectar un `id` de otro tenant para atacarlo por identificador (IDOR). La identidad de una oferta es `(tenant, baseGame, plataforma)`, calculada por el servidor.
- `TenantGame.platformId` se resuelve desde una plataforma **global**, nunca desde un id que venga en el fichero.

## 3. SSRF de media — ✅ fuerte, con 1 hueco encontrado y corregido

Controles verificados en `src/utils/safeUrl.ts`:

| Control | Estado |
|---|---|
| Allowlist de hosts (`COVER_ALLOWED_HOSTS`, con sufijo de subdominio) aplicada **antes** de descargar | ✅ |
| Solo `http`/`https`, **revalidado en cada salto** de redirección | ✅ |
| `localhost`, `.local`, `.internal`, `.intranet`, `.corp`, `.home`, `.lan` | ✅ |
| DNS con `all: true` y rechazo si **cualquiera** de las IP resueltas es privada o reservada | ✅ |
| IP **fijada** en el socket (`pinnedLookup`): el cliente conecta a la IP ya validada, no a lo que devuelva DNS al conectar | ✅ cierra el DNS-rebinding (el hueco TOCTOU) |
| Redirecciones limitadas a 3 (`REDIRECCIONES_EXCESIVAS`) | ✅ |
| Tope de 5 MB con aborta a mitad de la descarga | ✅ |
| `Content-Type` de imagen obligatorio (`CONTENIDO_NO_PERMITIDO`) | ✅ |
| Timeout por petición | ✅ |
| IPv4 reservados: `0/8`, `10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.0/24`, `192.168/16`, CGNAT `100.64/10`, `198.18/15`, `≥224` | ✅ |
| IPv6: `::1`, `::`, link-local `fe80`–`febf`, ULA `fc`/`fd`, IPv4-mapeada `::ffff:` | ✅ |

**Hueco encontrado y corregido (2026-10-16):** `isBlockedV6` **no enumeraba los prefijos IPv6 de propósito especial**, así que un destino como `64:ff9b::7f00:1` (NAT64 hacia `127.0.0.1`), `2002:7f00:1::` (6to4), `2001:db8::/32`, `100::/64` o `fec0::/10` **no se marcaban como privados**. Riesgo real bajo (la allowlist de hosts es la primera barrera y un atacante tendría que controlar el DNS de uno de esos hosts), pero es un agujero de defensa en profundidad. Añadidos `SPECIAL_IPV6_PREFIXES` con test que los cubre.

## Veredicto

- **1 y 2**: correctos, con tests que lo Demonstrate.
- **3**: fuerte; un hueco encontrado y corregido en el mismo día.
- **Criterio 8 de aceptación** (operaciones privilegiadas restringidas y auditadas): **verde**.

## Lo que esta revisión NO cubre (y queda dicho)

- **Dependencias**: no se ha ejecutado `npm audit` en esta fase (el plan no lo pedía en 9.3). Queda como verificación de release.
- **Cabeceras de seguridad y CORS** del frontend en Cloudflare: fuera del alcance de 9.3.
- **El hueco residual de IPv4**: `192.88.99/24` (relay 6to4 obsoleto) y `198.51.100/24` (documentación) no están enumerados. No son rutas hacia red interna, por lo que no se consideran riesgo; se dejan señalados.