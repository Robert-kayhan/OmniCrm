# ---------------------------------------------------------------------------
# Omni CRM frontend
# ---------------------------------------------------------------------------

FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

FROM base AS development

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY . .

ENV NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_SOCKET_URL=http://localhost:4000

# Helps Next.js detect file changes when running inside Docker
ENV WATCHPACK_POLLING=true

EXPOSE 3000

CMD ["pnpm", "exec", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]


# ---------------------------------------------------------------------------
# Production builder
# ---------------------------------------------------------------------------

FROM base AS builder

ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN pnpm run build


# ---------------------------------------------------------------------------
# Production runtime
# ---------------------------------------------------------------------------

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/next-env.d.ts ./next-env.d.ts

USER node

EXPOSE 3000

CMD ["pnpm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]