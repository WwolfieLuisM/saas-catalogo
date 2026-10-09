# Product Context

## Why This Project Exists
Los negocios de videojuegos (tiendas, catálogos, servicios de entrega) necesitan presencia online con catálogo gestionable. Cada negocio empezando de cero duplica el mismo software. Esta plataforma resuelve eso: un solo código multi-tenant donde cada negocio ("tenant") paga por tener su catálogo sin construir su propia plataforma. El primer caso de uso real es Javier.

## Target Users
- **Usuario final (de Javier)** — browses catálogo de juegos, busca/filtra, guarda favoritos y "Mi Lista" (pedido por mensaje). Conexión potencialmente inestable → necesita offline/cache.
- **ADMIN de tenant** — gestiona su catálogo: juegos, categorías, precios, media, importación de datos.
- **SUPER_ADMIN (Luismi)** — administra tenants, biblioteca base, y la plataforma.

## User Experience Goals
- Frontend público: "Gaming oscuro, limpio y rápido". Render rápido, pocas pesquisas, imágenes optimizadas, funciona offline con cache.
- Admin: tablas→cards en móvil, sin overflow horizontal, touch targets grandes.
- Offline: mostrar catálogo cacheado, buscar localmente, avisar "Sin conexión", sincronizar al reconectar.

## How It Should Work
1. Usuario final visita el catálogo de su tenant (ej. branding JAVIER).
2. Navega/juega busca → el frontend cachea el catálogo vía `catalog/version`.
3. Añade juegos a favoritos (marcador local) y a Mi Lista (pedido, se envía por mensaje).
4. Admin gestiona el catálogo desde `/admin` contra la API real.
5. El backend calcula precios según reglas del tenant; el frontend solo los muestra.

## Key Features
- Catálogo público: búsqueda, filtros (género/categoría/plataforma), ordenamiento.
- Detalle de juego: portada, screenshots, requisitos, plataformas, precio.
- Favoritos, Mi Lista (pedido), Mi Colección (biblioteca personal con estados).
- Cache local + offline + sincronización por versión de catálogo.
- Admin: juegos, biblioteca base, taxonomías, multimedia (Cloudinary), precios, administradores, auditoría, sesiones, import/export, configuración.
- API versionada `/api/v1` con endpoints públicos y admin.

## What Success Looks Like
- Javier opera su catálogo completo sin intervención de Luismi.
- Un segundo tenant se incorpora sin cambios de código (solo datos).
- El usuario final con mala conexión puede browse y armar su Mi Lista igualmente.
- Auditoría completa de acciones admin; aislamiento de tenant verificado.
