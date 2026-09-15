# ---------------------------------------------------------------------------
# Omni CRM frontend
# Multi-stage: dependencies, then a production Next.js build, then a runtime
# image carrying only the build output and node_modules.
#
# The build-time API URL is baked into the client bundle, so it must be an
# address the browser can reach - not a compose service name.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# must be declared here to receive what docker-compose passes as build args.
# Without these the browser would fall back to the defaults in next.config.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# --chown so `next start` can write into .next/cache as the unprivileged user.
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=node:node /app/next-env.d.ts ./next-env.d.ts

# Drop privileges for the runtime process.
USER node

EXPOSE 3000

CMD ["pnpm", "run", "start", "--", "-H", "0.0.0.0", "-p", "3000"]
