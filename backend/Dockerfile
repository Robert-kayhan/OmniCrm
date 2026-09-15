# ---------------------------------------------------------------------------
# Omni CRM API
# Multi-stage: dependencies are installed once and the Prisma client is
# generated against the schema before tsc runs.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- build -----------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# `prisma generate` writes the TypeScript client into src/generated before tsc runs.
RUN pnpm exec prisma generate && pnpm exec tsc -p tsconfig.build.json

# --- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && apk add --no-cache tini
WORKDIR /app

# The Prisma CLI is needed at boot for `migrate deploy`, so dev dependencies
# come across too — they are small next to the engines.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# src (including the generated Prisma client) ships so `pnpm db:seed` can run
# inside the container via tsx.
COPY --from=build /app/src ./src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json prisma.config.ts ./
COPY prisma ./prisma

USER node
EXPOSE 4000

# tini reaps zombies and forwards SIGTERM so graceful shutdown actually runs.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
