# Project Brief

## Project Name
Javier — SaaS Gaming Catalog Platform

## Overview
Plataforma SaaS multi-tenant para catálogos de videojuegos, desarrollada por Luismi. Cada tenant (negocio) administra su propio catálogo: juegos, categorías, géneros, plataformas, precios, media y administradores, con aislamiento total entre tenants. "Javier" es el primer tenant/cliente; la plataforma está diseñada para incorporar futuros negocios sin duplicar código.

## Core Requirements
- Multi-tenant desde el inicio: el backend debe imponer el aislamiento, nunca confiar en un `tenantId` del frontend.
- Biblioteca base de +1000 juegos de la que cada tenant puede copiar a su catálogo.
- Roles: SUPER_ADMIN (propietario de plataforma) y ADMIN (de un tenant).
- Precios calculados en backend según reglas por tenant; el frontend nunca es la fuente de verdad.
- Frontend público con cache/offline para conexiones inestables (contexto Cuba).
- Admin completo: CRUD de catálogo, multimedia, pricing, auditoría, import/export.

## Goals
- Plataforma lista para producción desplegada en Render + Neon + Cloudinary + Cloudflare.
- Primer tenant (Javier) funcionando end-to-end: catálogo público + panel admin.
- Monetizable incorporando más tenants sin tocar el código base.

## Scope

### In Scope
- Backend Express + Prisma (Fases 1-8 del README: base, seguridad, catálogo, media, pricing, APIs).
- Frontend Next.js App Router (público + admin).
- Tests, CI (GitHub Actions), deploy (Render), backups.

### Out of Scope
- Pasarela de pagos (Mi Lista es "pedir por mensaje", no checkout online).
- App móvil nativa.
- Sistema de reseñas de usuarios finales.

## Timeline
Sin fechas formales definidas. Orden de fases fijado en README §59 (backend base → seguridad → catálogo → media → pricing → catalog API → admin API → data mgmt → frontend → admin frontend → producción).

## Stakeholders
- **Luismi** — desarrollador y propietario de la plataforma (SUPER_ADMIN).
- **Javier** — primer tenant/cliente.
- **Futuros tenants** — negocios que incorporen la plataforma.
