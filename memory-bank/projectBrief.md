# Project Brief

## Project Name
Javier PC SaaS V2 — Catálogo multi-tenant con biblioteca global e importadores.

## Overview
SaaS multi-tenant de catálogos de videojuegos (Javier PC es el primer negocio): biblioteca global única (`BaseGame` + variantes por plataforma) de la que cada tenant (`TenantGame`) personaliza precio/disponibilidad/contenido por plataforma, con importadores de catálogo (JSON) y feed público por negocio.

## Core Requirements
- Biblioteca global maestra con herencia a tenants: `BaseGame` → `BaseGamePlatform` → `TenantGame` (nulo = heredar, explícito = personalizar, "limpio" = borrar heredado).
- Oferta única por (tenant, juego, plataforma): precio/dispo/tamaño/requisitos por plataforma (`Modelo A`).
- Aislamiento estricto de tenants; SUPER_ADMIN único para datos globales.
- Importadores: A) biblioteca global `library-import@2` (nunca toca `TenantGame`); B) catálogo tenant `luismi-platform/catalog@2` (ofertas por plataforma).
- Portadas en Cloudinary con protección SSRF; fallo de media no bloquea imports.
- Migraciones expand/contract sin pérdida de los 57 registros existentes; respaldo verificado previo.

## Goals
- Catálogo de Javier intacto y visible tras la migración (mismo contenido, ahora por plataforma).
- Herencia demostrable: cambio en biblioteca se propaga; overrides de tenant lo tapan.
- Imports idempotentes con preview/errores por registro y procedencia/auditoría.
- Gates siempre verdes: backend vitest+tsc, frontend tsc/lint/test/build/cf:build.

## Scope

### In Scope
- Fases 1–10 de `tasks/plan-detallado.md` (schema por plataforma → respaldos → migración 57 → herencia → importadores → TenantPlatform → tenants → validación → generador al final).

### Out of Scope
- Generador JSON automático hasta cerrar el contrato (se construye el último).
- Importador multimedia (BUG-01.D pendiente de decisión).
- Resolver deuda técnica del README §15 (IDs, L1–L5, M2, H-*); no adelantar.
- `docs/` sin modificar; tocar proyecto Neon `Market-Place-Moa`; push/deploy sin permiso.

## Timeline
- 2026-10-13: decisiones de diseño base aprobadas (plan legado).
- 2026-10-14: BUG-01 A–C, pilotos 1–2 del importador (otra OC), `Decisiones-Arquitectonicas-v1.md` (Modelo A + orden), plan detallado v1 redactado (pendiente de aprobación).
- Sin fechas fijas: avance por fases con checkpoint humano al final de cada una.

## Stakeholders
- **Usuario (Luismi):** aprueba decisiones, aprobación previa a migraciones/commits/push; espera que se le pregunten dudas cruciales antes de ejecutar.
- **Otra OC:** ejecuta prompts de scraping/import (`backend/scripts/library-import-prompt*.md`) siguiendo reglas de datos.
- SUPER_ADMIN (global) · ADMIN de tenant · visitante del feed público.
