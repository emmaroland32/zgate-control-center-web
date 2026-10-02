# Multi-stage build for ZGATE Control Center web (Next.js standalone output)

# 1. Install dependencies (cached on package.json + yarn.lock)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 2. Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The browser no longer calls the backend directly — it calls same-origin /api/cc and the BFF
# attaches the operator's token server-side (src/server/bff/cc-proxy.ts). Set CC_BACKEND_URL at
# RUNTIME to the address the server uses; in compose that is the internal service name.
#
# This build arg remains only as the fallback the proxy uses when CC_BACKEND_URL is unset, and it is
# the wrong value inside a container (NEXT_PUBLIC_* is inlined at build time with the URL the BROWSER
# would use). Nothing in the client bundle reads it any more.
ARG NEXT_PUBLIC_API_URL=http://localhost:8090
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Ensure public/ exists so the runtime COPY below always succeeds
RUN mkdir -p public && yarn build

# 3. Minimal runtime image from the standalone output
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3002

CMD ["node", "server.js"]
