# Product Context

## Why This Project Exists
Javier PC necesita vender catálogos de juegos por negocio (catálogo propio con precios y disponibilidad propios) sin duplicar el trabajo de mantener el catálogo base. La V2 introduce biblioteca global compartida + personalización por tenant, para escalar a más negocios sin rehacer datos.

## Target Users
- **SUPER_ADMIN (Luismi):** cura la biblioteca global, importa catálogos, gestiona tenants y plataformas globales.
- **ADMIN de tenant (ej. Javier):** gestiona su negocio: precios, disponibilidad, plataforma habilitadas, contacto; no toca la biblioteca global.
- **Cliente final (feed):** navega el catálogo del negocio (filtrado por plataforma, precio, estado).

## User Experience Goals
- Feed rápido y por-negocio; contacto/logos del tenant, nunca globales.
- Biblioteca con ficha completa y buscador/paginación server-side reales.
- Importar JSON: subir → preview con errores por registro → confirmar → resultado auditable.
- Sin candados confusos: el tenant edita su oferta con overrides (sin bloqueos visibles).

## How It Should Work
1. SUPER_ADMIN importa `library-import@2` → `BaseGame` + variantes `BaseGamePlatform` (validate → import, idempotente).
2. El tenant habilita plataformas (`TenantPlatform`) e importa/edita su catálogo (`catalog@2` o UI) → `TenantGame` por plataforma.
3. Las APIs de catálogo resuelven valor final: override → variante → identidad.
4. El feed público muestra el negocio activo con su valor final.

## Key Features
- Herencia con overrides y "borrado explícito" (tricampo) por campo.
- Oferta por plataforma (precio, dispo, tamaño, requisitos PC en su fila).
- Importadores con preview, idempotencia, procedencia y auditoría.
- Portadas gestionadas en Cloudinary (no hotlink), con auditoría de portadas (BUG-01.C).
- Soft delete/suspensión de tenants; selector global de tenant (SUPER_ADMIN).

## What Success Looks Like
- Criterios §14 de `Decisiones-Arquitectonicas-v1.md` todos verdes + catálogo de Javier idéntico post-migración + demo de herencia en checkpoint Fase 4.
