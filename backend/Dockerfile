FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.build.json prisma7.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma7.config.ts ./
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/v1/health" || exit 1
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
