# Javier — SaaS Gaming Catalog Platform

Plataforma SaaS multi-tenant para catálogos de videojuegos, desarrollada por **Luismi**.

**Javier** es el primer tenant/cliente de la plataforma.

La plataforma está diseñada para poder incorporar futuros negocios sin duplicar el código.

---

## 1. Arquitectura

```text
                         ┌──────────────────────┐
                         │      Usuario         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │ Next.js / React      │
                         │ Frontend             │
                         └──────────┬───────────┘
                                    │ REST
                                    ▼
                         ┌──────────────────────┐
                         │ Express + TypeScript │
                         │ Backend API          │
                         └───────┬───────┬──────┘
                                 │       │
                    ┌────────────┘       └─────────────┐
                    ▼                                  ▼
             ┌──────────────┐                   ┌──────────────┐
             │ PostgreSQL   │                   │ Cloudinary   │
             │ Neon + Prisma│                   │ Media/CDN    │
             └──────────────┘                   └──────────────┘

                         Deploy / Infra
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
           GitHub           Render          Cloudflare
```

---

# 2. Stack

## Backend

- Node.js
- Express.js
- TypeScript
- Prisma
- PostgreSQL
- Neon
- JWT
- Zod
- Cloudinary

## Frontend

- Next.js
- React
- TypeScript
- App Router

## Infraestructura

- GitHub
- GitHub Actions
- Render
- Cloudflare
- Neon
- Cloudinary

## Desarrollo

- Git
- GitHub CLI
- OpenCode

---

# 3. Principios

## Multi-tenant desde el inicio

La plataforma no debe estar diseñada exclusivamente para Javier.

```text
Luismi
│
├── Biblioteca base
│   └── +1000 juegos
│
├── Javier
│   ├── Juegos de biblioteca
│   └── Juegos personalizados
│
├── Tenant B
│
└── Tenant C
```

Cada tenant tiene sus propios:

- juegos;
- categorías;
- géneros;
- plataformas;
- precios;
- configuración;
- media;
- administradores;
- sesiones;
- auditoría.

---

# 4. Roles

## SUPER_ADMIN

Propietario de la plataforma.

Puede:

- administrar tenants;
- administrar biblioteca base;
- administrar administradores;
- ver auditoría global según permisos;
- administrar configuraciones globales;
- realizar operaciones críticas.

## ADMIN

Administrador de un tenant.

Puede administrar únicamente su tenant:

- juegos;
- catálogo;
- categorías;
- géneros;
- plataformas;
- precios;
- media;
- importación/exportación;
- sesiones permitidas;
- configuración disponible.

El backend debe imponer el aislamiento.

Nunca confiar en un `tenantId` enviado por frontend.

---

# 5. Repositorios / estructura recomendada

```text
project/
├── backend/
│   ├── src/
│   ├── prisma/
│   ├── tests/
│   ├── Dockerfile
│   ├── package.json
│   └── README.md
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   ├── tests/
│   ├── package.json
│   └── README.md
│
├── docs/
│   ├── Backend+Db.md
│   ├── Frontend.md
│   └── README.md
│
├── .github/
│   └── workflows/
│
├── .gitignore
└── README.md
```

Si el repositorio existente utiliza otra estructura válida, conservarla y documentarla.

---

# 6. Documentos de arquitectura

Los documentos principales son:

- `Backend+Db.md` (unificado: especificación técnica + alcance multi-tenant V2)
- `Frontend.md`

Estos documentos contienen las especificaciones de implementación.

Antes de modificar una parte importante del proyecto:

1. revisar el documento correspondiente;
2. revisar el código actual;
3. verificar el contrato real;
4. evitar duplicar o contradecir decisiones existentes.

---

# 7. Backend

Ruta conceptual:

```text
/backend
```

API:

```text
/api/v1
```

Endpoints públicos principales:

```text
GET /api/v1/games
GET /api/v1/games/:id
GET /api/v1/catalog
GET /api/v1/catalog/version
GET /api/v1/catalog/sync
GET /api/v1/categories
GET /api/v1/genres
GET /api/v1/platforms
GET /api/v1/health
```

Admin:

```text
/api/v1/admin/*
```

## Catálogo público

Catálogo por tenant sin autenticación. El tenant se identifica siempre por su `slug`:

```text
GET /api/v1/catalog/version?tenant=<slug>
GET /api/v1/catalog?tenant=<slug>
GET /api/v1/catalog/sync?tenant=<slug>&since=<numero>
```

- `/version` devuelve `{ version, updatedAt }` de `CatalogMetadata` (versión `0` y `updatedAt: null` si aún no existe).
- `/` devuelve la instantánea pública completa: `{ version, updatedAt, games }`, con los juegos visibles (`availability=true`, no eliminados) ordenados por `createdAt` asc y luego `id` asc. Cada juego expone solo los campos del DTO público (§69): `id`, `title`, `slug`, `description`, `price` (número o `null`, siempre `currency: "CUP"`), `availability`, `size {value, unit, formatted}`, `releaseYear`, `category {id, name} | null`, `genres[]`, `platforms[]`, `coverImage {url, alt} | null`, `screenshots[]` y `requirements {minimum, recommended}`. Nunca se filtran `tenantId`, `priceMode`, `origin`, timestamps ni datos de auditoría.
- `/sync` compara `since` con la versión actual: si coincide responde `{ changed: false, version, updatedAt }`; si difiere (o `since` falta) responde `{ changed: true, version, updatedAt, games }` con el snapshot completo.

Estrategia de caché y consistencia:

- `/version` y `/` envían `ETag: "v<version>"` y `Cache-Control: no-cache`.
- Con `If-None-Match` coincidente responden `304` sin cuerpo; un `If-None-Match` desactualizado recibe `200` con el ETag nuevo.
- `/sync` no envía `ETag` (solo `Cache-Control: no-cache`).
- La instantánea se lee en una única transacción `RepeatableRead` para que juegos, media y taxonomía sean coherentes entre sí.

Errores:

```text
400 VALIDATION_ERROR   # falta tenant, está vacío, se envía tenantId o since no es entero
404 TENANT_NOT_FOUND   # slug inexistente o tenant inactivo
```

Versionado: las operaciones que alteran lo visible en el catálogo incrementan `version` (crear/editar/eliminar juegos visibles, publicar/restaurar, subir/borrar media de juegos visibles, crear o renombrar taxonomía del tenant, aplicar precios). Las operaciones privadas (reglas de precio, juegos ocultos, edición sin cambios públicos) no incrementan la versión.

Ejemplos:

```bash
curl "http://localhost:3000/api/v1/catalog/version?tenant=javier"
curl -H 'If-None-Match: "v5"' "http://localhost:3000/api/v1/catalog?tenant=javier"
curl "http://localhost:3000/api/v1/catalog/sync?tenant=javier&since=5"
```

---

# 8. Base de datos

Proveedor:

**Neon PostgreSQL**

ORM:

**Prisma**

Modelos principales:

```text
Tenant
TenantSettings
AdminUser
AdminSession
BaseGame
TenantGame
Category
Genre
Platform
GamePlatform
GameMedia
PricingRule
CatalogMetadata
AuditLog
```

Puede haber modelos auxiliares adicionales si son necesarios.

---

# 9. Biblioteca base

Luismi mantiene una biblioteca base de más de 1000 juegos.

Un tenant puede incorporar juegos de esta biblioteca a su catálogo.

También puede crear juegos personalizados.

Conceptualmente:

```text
BaseGame
    │
    ├── TenantGame (Javier)
    ├── TenantGame (Tenant B)
    └── TenantGame (Tenant C)
```

Un juego proveniente de biblioteca debe conservar referencia al `BaseGame`.

Un juego personalizado no necesita `BaseGame`.

---

# 10. Juegos

Un juego soporta:

- título;
- slug;
- descripción;
- precio;
- disponibilidad;
- tamaño;
- unidad de tamaño;
- año;
- categoría;
- género;
- múltiples plataformas;
- portada;
- hasta 4 screenshots;
- requisitos mínimos;
- requisitos recomendados;
- origen;
- tenant;
- auditoría;
- soft delete.

---

# 11. Requisitos

## Mínimos

- CPU
- GPU
- RAM
- OS
- DirectX
- almacenamiento

## Recomendados

- CPU
- GPU
- RAM
- OS
- DirectX
- almacenamiento

Presets:

```text
Intel i3/i5/i7/i9
AMD Ryzen 3/5/7/9
GTX
RTX
RX
Intel Arc
Other/manual
```

RAM:

```text
2 / 4 / 6 / 8 / 12 / 16 / 32 / 64 GB
```

---

# 12. Precios

Los precios son propiedad del tenant.

Las reglas se almacenan en:

```text
PricingRule
```

Ejemplo inicial de seed:

```text
1–10 GB       → 40 CUP
10.01–50 GB  → 50 CUP
50.01–100 GB → 70 CUP
100.01+ GB   → 100 CUP
```

Estos valores son configuración inicial, no valores globales obligatorios.

El backend calcula el precio.

El frontend no debe convertirse en fuente de verdad.

---

# 13. Multimedia

Proveedor:

**Cloudinary**

La base de datos guarda referencias y metadatos.

No guardar imágenes binarias en PostgreSQL.

Estructura lógica:

```text
tenants/{tenantId}/games/{slug}/cover
tenants/{tenantId}/games/{slug}/shot-1
tenants/{tenantId}/games/{slug}/shot-2
tenants/{tenantId}/games/{slug}/shot-3
tenants/{tenantId}/games/{slug}/shot-4
```

Soporta:

- upload;
- reemplazo;
- eliminación;
- manifest;
- retry;
- errores;
- detección de media huérfana.

---

# 14. Autenticación

Sistema:

```text
JWT
```

Access token:
- aproximadamente 15 minutos.

Refresh token:
- aproximadamente 30 días.

Refresh tokens:
- almacenados como hash;
- rotación;
- revocación;
- protección contra reutilización.

Frontend:
- access token en memoria;
- refresh token en cookie HttpOnly/Secure.

---

# 15. Seguridad

Implementar:

- Helmet;
- CORS;
- rate limiting;
- Zod;
- autorización;
- tenant isolation;
- validación runtime;
- manejo centralizado de errores;
- logs seguros.

Nunca almacenar en Git:

- `.env`;
- passwords;
- JWT secrets;
- Cloudinary secrets;
- tokens.

---

# 16. Frontend

Ruta conceptual:

```text
/frontend
```

Tecnología:

- Next.js;
- React;
- TypeScript;
- App Router.

Branding:

**JAVIER**

Nunca mostrar:

`Javier PC`

Concepto visual:

> Gaming oscuro, limpio y rápido.

---

# 17. Rutas públicas

```text
/
/feed
/juegos
/juegos/[slug]
/categorias/[slug]
/generos/[slug]
/plataformas/[slug]
/favoritos
/mi-lista
/mi-coleccion
/contacto
```

---

# 18. Navegación

Sidebar:

```text
Inicio
Juegos
Mi colección
Mi lista
Contacto
```

Header:

```text
JAVIER
Buscar juegos...
```

En móvil:
- drawer;
- header compacto;
- touch targets grandes.

---

# 19. Catálogo

El catálogo debe permitir:

- búsqueda;
- filtros;
- ordenamiento;
- navegación rápida.

Búsqueda:

- nombre;
- género;
- categoría;
- plataforma.

Cuando el catálogo está cacheado, preferir búsqueda local.

---

# 20. Cache

La estrategia pública es:

```text
Cache local
     ↓
catalog/version
     ↓
¿Cambió?
 ├── No → usar cache
 └── Sí → actualizar
```

Modelo:

```json
{
  "schemaVersion": 1,
  "catalogVersion": 42,
  "updatedAt": "...",
  "cachedAt": "...",
  "expiresAt": "...",
  "data": {
    "games": []
  }
}
```

Esto reduce solicitudes y mejora la experiencia con conexiones inestables.

---

# 21. Offline

Cuando exista cache:

- mostrar catálogo;
- buscar localmente;
- favoritos;
- Mi Lista;
- Mi Colección.

Mostrar aviso:

```text
Sin conexión
Mostrando el último catálogo disponible.
```

Cuando vuelva la conexión:
- verificar versión;
- sincronizar.

---

# 22. Favoritos

Favoritos y Mi Lista son diferentes.

Favoritos:
- marcador personal;
- no representa pedido.

LocalStorage:

```text
javierpc:favorites
```

Ruta:

```text
/favoritos
```

---

# 23. Mi Lista

Representa pedido/solicitud.

LocalStorage:

```text
javierpc:list
```

Soporta:
- varios juegos;
- cantidad;
- precio;
- tamaño;
- total.

Acción:

```text
Pedir por mensaje
```

No utilizar:

```text
Pedir solo este
```

---

# 24. Mi Colección

Biblioteca personal.

Estados:

```text
Todos
Favoritos
Pendiente
Jugado
Ganado
```

Persistencia local:

```text
javierpc:collection
```

---

# 25. Floating Mi Lista

Debe ser:

- circular;
- SVG;
- dorado;
- icono oscuro;
- draggable;
- persistente;
- badge de cantidad.

Aproximadamente:

Desktop:
`66 × 66`

Mobile:
`56 × 56`

Ocultar cuando Mi Lista esté vacía.

---

# 26. Detalle de juego

Mostrar:

- portada;
- screenshots;
- título;
- descripción;
- precio;
- disponibilidad;
- plataformas;
- categoría;
- género;
- tamaño;
- año;
- requisitos.

Acciones:

```text
+ Añadir a mi lista
Favorito
```

Menú de tres puntos únicamente aquí.

---

# 27. Menú de detalle

Acciones:

```text
Favorito
Pendiente
Jugado
Ganado
Quitar estado
```

No colocar este menú en las cards del catálogo.

---

# 28. SEO

Implementar:

- metadata dinámica;
- Open Graph;
- canonical;
- sitemap;
- robots.

No indexar:

```text
/admin
/admin/*
```

Indexar catálogo público.

---

# 29. Performance

Objetivos:

- primer render rápido;
- pocas peticiones;
- imágenes optimizadas;
- lazy loading;
- cache;
- Server Components;
- JavaScript reducido.

No descargar todas las imágenes automáticamente.

Cloudinary debe proporcionar thumbnails apropiados.

---

# 30. Admin

Ruta:

```text
/admin
```

Debe consumir el backend real.

Secciones:

```text
Dashboard
Juegos
Biblioteca base
Categorías
Géneros
Plataformas
Multimedia
Administradores
Auditoría
Sesiones
Negocios
Configuración
```

`Negocios` únicamente para SUPER_ADMIN.

---

# 31. Admin mobile

En móvil:

- sidebar → drawer;
- tablas → cards;
- filtros → bottom sheet;
- formularios → una columna;
- dashboard → métricas apiladas;
- touch targets grandes;
- sin overflow horizontal.

---

# 32. Configuración Admin

Debe incluir:

```text
Catálogo
Precios
Datos / importación
Multimedia
Base de datos / sistema
```

Funciones:
- versionado;
- reglas de precio;
- preview/apply;
- export;
- import;
- backup;
- restore;
- media status;
- system status.

---

# 33. Importación

Flujo:

```text
Archivo
 ↓
Validación
 ↓
Comparación
 ↓
Preview
 ↓
Backup
 ↓
Confirmación
 ↓
Import
 ↓
Auditoría
 ↓
Nueva versión
```

No realizar importaciones destructivas silenciosas.

---

# 34. Auditoría

Registrar acciones administrativas importantes.

Ejemplos:

```text
GAME_CREATED
GAME_UPDATED
GAME_DELETED
GAME_RESTORED
PRICE_RULE_CREATED
PRICE_RULE_UPDATED
PRICES_APPLIED
MEDIA_UPLOADED
MEDIA_DELETED
ADMIN_CREATED
ADMIN_DISABLED
TENANT_CREATED
IMPORT_COMPLETED
BACKUP_CREATED
RESTORE_COMPLETED
SESSION_REVOKED
```

---

# 35. API y frontend

Contrato:

```text
Next.js
   ↓
API Client
   ↓
/api/v1
   ↓
Express
   ↓
Prisma
   ↓
Neon
```

Nunca:

```text
Next.js → PostgreSQL
```

Nunca:

```text
Next.js → Prisma
```

---

# 36. Desarrollo local

## Requisitos

Instalar:

- Node.js;
- Git;
- GitHub CLI;
- OpenCode.

Comprobar:

```bash
node --version
npm --version
git --version
gh --version
```

---

# 37. Clonar repositorio

```bash
git clone <REPOSITORY_URL>
cd <PROJECT_DIRECTORY>
```

Configurar ramas según la estrategia del proyecto.

---

# 38. Variables de entorno Backend

Crear:

```text
backend/.env
```

A partir de:

```text
backend/.env.example
```

Variables esperadas:

```env
DATABASE_URL=
DIRECT_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
ACCESS_TOKEN_EXPIRES_IN=
REFRESH_TOKEN_EXPIRES_IN=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

CORS_ORIGIN=

NODE_ENV=development
PORT=3000
```

Nunca subir `.env`.

---

# 39. Variables Frontend

Crear:

```text
frontend/.env.local
```

Ejemplo:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
```

No colocar secrets aquí.

---

# 40. Instalar Backend

```bash
cd backend
npm install
```

Generar Prisma:

```bash
npm run prisma:generate
```

Ejecutar migrations:

```bash
npm run prisma:migrate
```

Seed:

```bash
npm run prisma:seed
```

Desarrollo:

```bash
npm run dev
```

---

# 41. Instalar Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abrir el dominio local indicado por Next.js.

---

# 42. Scripts Backend esperados

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:watch
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

---

# 43. Scripts Frontend esperados

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```

Los nombres pueden ajustarse si el proyecto ya tiene convenciones diferentes.

---

# 44. Prisma

Para cambios de schema:

```bash
npx prisma migrate dev --name <descripcion>
```

Generar cliente:

```bash
npx prisma generate
```

No editar producción de forma destructiva sin migration controlada.

---

# 45. Health check

Backend:

```text
GET /api/v1/health
```

Debe comprobar al menos que la API funciona y, según implementación, el estado de DB.

---

# 46. API documentation

OpenAPI/Swagger debe documentar:

- auth;
- games;
- catalog;
- library;
- categories;
- genres;
- platforms;
- media;
- pricing;
- admins;
- tenants;
- audit;
- import/export;
- system.

---

# 47. Tests

Antes de considerar una versión estable:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Backend y frontend deben pasar sus respectivos checks.

---

# 48. Git workflow

Ejemplo:

```bash
git status
git add .
git commit -m "feat: ..."
git push
```

Para crear repositorio:

```bash
gh auth login
gh auth status
```

Y si corresponde:

```bash
gh repo create <repo-name> --private --source=. --remote=origin --push
```

---

# 49. GitHub Actions

CI debe comprobar:

```text
install
 ↓
lint
 ↓
typecheck
 ↓
test
 ↓
build
```

No almacenar secrets directamente en YAML.

Utilizar GitHub Secrets.

---

# 50. Render

Backend preparado para Render.

El servidor debe utilizar:

```text
process.env.PORT
```

No asumir un puerto fijo en producción.

Configurar:

- build command;
- start command;
- environment variables;
- health check;
- migrations controladas.

---

# 51. Neon

La DB de producción utiliza Neon.

Mantener separadas:

- desarrollo;
- testing;
- producción.

Nunca ejecutar pruebas destructivas contra producción.

---

# 52. Cloudinary

Variables:

```text
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

El secret solamente existe en backend.

Frontend utiliza URLs públicas/transformadas.

---

# 53. Cloudflare

Puede utilizarse como:

- DNS;
- CDN/edge cuando corresponda;
- protección;
- caching.

No convertir Cloudflare en dependencia obligatoria del código de negocio.

---

# 54. Seguridad de tenant

Regla crítica:

```text
JWT
 ↓
AdminUser
 ↓
role + tenantId
 ↓
authorization
 ↓
service
 ↓
tenant-scoped query
```

Nunca:

```text
frontend tenantId
 ↓
DB
```

---

# 55. Regla de precios

El frontend nunca es la autoridad del precio.

```text
Frontend
 ↓
API
 ↓
PricingService
 ↓
PricingRule
 ↓
PostgreSQL
```

---

# 56. Backups

Los backups deben estar controlados.

No exponer:

- SQL console;
- credenciales;
- secretos;
- dumps privados al usuario público.

Exportar catálogo no equivale necesariamente a un dump completo de PostgreSQL.

---

# 57. Producción

Antes de deploy:

- [ ] variables de entorno configuradas;
- [ ] secrets fuera del repositorio;
- [ ] DB correcta;
- [ ] migrations revisadas;
- [ ] Cloudinary correcto;
- [ ] CORS correcto;
- [ ] JWT secrets únicos;
- [ ] rate limiting activo;
- [ ] health check;
- [ ] logs;
- [ ] tests;
- [ ] build.

---

# 58. Flujo completo de desarrollo

```text
1. Cambiar especificación
        ↓
2. Revisar Backend+Db.md / Frontend.md
        ↓
3. Implementar backend si hace falta
        ↓
4. Migration Prisma
        ↓
5. Tests backend
        ↓
6. Implementar frontend
        ↓
7. Tests frontend
        ↓
8. Typecheck
        ↓
9. Build
        ↓
10. Revisión manual
        ↓
11. Git commit
        ↓
12. Push
        ↓
13. CI
        ↓
14. Deploy
```

---

# 59. Orden recomendado para construir la plataforma

## Fase 1 — Backend base

- Express;
- TypeScript;
- Prisma;
- Neon;
- configuración;
- health;
- estructura modular.

## Fase 2 — Seguridad

- Tenant;
- AdminUser;
- JWT;
- sessions;
- RBAC;
- tenant isolation.

## Fase 3 — Catálogo

- BaseGame;
- TenantGame;
- games;
- categories;
- genres;
- platforms;
- requirements.

## Fase 4 — Media

- Cloudinary;
- cover;
- screenshots;
- manifest;
- retry;
- orphan media.

## Fase 5 — Pricing

- PricingRule;
- PricingService;
- preview;
- apply;
- audit.

## Fase 6 — Catalog API

- catalog;
- catalog version;
- caching;
- optimized responses.

## Fase 7 — Admin API

- dashboard;
- admins;
- tenants;
- sessions;
- audit;
- system.

## Fase 8 — Data management

- import;
- export;
- backup;
- restore;
- history;
- duplicate.

## Fase 9 — Frontend

- Next.js;
- layout;
- catalog;
- detail;
- favorites;
- Mi Lista;
- Mi Colección;
- offline/cache;
- SEO.

## Fase 10 — Admin frontend

- login;
- dashboard;
- games;
- library;
- pricing;
- media;
- administrators;
- audit;
- sessions;
- configuration.

## Fase 11 — Production

- tests;
- Docker;
- Render;
- GitHub Actions;
- Cloudflare;
- monitoring básico.

---

# 60. Checklist final

## Backend

- [ ] Express
- [ ] TypeScript
- [ ] Prisma
- [ ] Neon
- [ ] Multi-tenant
- [ ] SUPER_ADMIN
- [ ] ADMIN
- [ ] JWT
- [ ] Sessions
- [ ] Games
- [ ] Base library
- [ ] Categories
- [ ] Genres
- [ ] Platforms
- [ ] Requirements
- [ ] Cloudinary
- [ ] Pricing
- [ ] Catalog version
- [ ] Audit
- [ ] Import/export
- [ ] Backup/restore
- [ ] Tests
- [ ] OpenAPI
- [ ] Docker
- [ ] Render

## Frontend

- [ ] Next.js
- [ ] React
- [ ] TypeScript
- [ ] App Router
- [ ] Javier branding
- [ ] Catalog
- [ ] Search
- [ ] Filters
- [ ] Game detail
- [ ] Favorites
- [ ] Mi Lista
- [ ] Mi Colección
- [ ] Floating list
- [ ] Offline
- [ ] Cache
- [ ] Cloudinary
- [ ] Responsive
- [ ] SEO
- [ ] Admin
- [ ] Auth
- [ ] Tests
- [ ] Build

## Production

- [ ] GitHub
- [ ] GitHub Actions
- [ ] Render
- [ ] Neon
- [ ] Cloudinary
- [ ] Cloudflare
- [ ] Secrets
- [ ] Backups
- [ ] Health checks
- [ ] Logs
- [ ] Security review
- [ ] Tenant isolation review

---

# 61. Regla absoluta

**No inventar funcionalidades implementadas.**

Antes de afirmar que una parte funciona:

1. comprobar código;
2. ejecutar test cuando corresponda;
3. ejecutar typecheck;
4. ejecutar build;
5. verificar integración.

El README debe mantenerse actualizado conforme el proyecto evolucione.

---

## Autoría

Plataforma desarrollada y diseñada por:

**Luismi**

Primer tenant:

**Javier**

Arquitectura:

**Multi-tenant SaaS**
