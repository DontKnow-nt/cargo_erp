# ─────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

# Install openssl for Prisma, libc6-compat for Alpine Node compatibility
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files first for layer caching
COPY web/package.json web/package-lock.json ./
COPY web/prisma ./prisma/

# Install all dependencies (including devDeps for the build step)
# --ignore-scripts prevents running postinstall (prisma generate) at this stage
RUN npm ci --ignore-scripts

# Generate Prisma client with the correct binary target for Alpine Linux
RUN npx prisma generate


# ─────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy node_modules and prisma client from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

# Copy the full web source
COPY web/ .

# Build-time env vars (non-secret, needed for Next.js build analysis only)
# Secrets like DATABASE_URL and NEXTAUTH_SECRET are injected at runtime via Cloud Run env vars
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Provide a dummy DATABASE_URL so Prisma client compiles without a real connection
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy?sslmode=require"
ENV NEXTAUTH_SECRET="build-time-placeholder-32-characters!!"
ENV NEXTAUTH_URL="http://localhost:3000"

RUN npm run build


# ─────────────────────────────────────────────
# Stage 3: Production runtime (minimal image)
# ─────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Port Cloud Run listens on (Cloud Run sets PORT env var, default 8080; Next.js uses 3000)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only what is needed to run the app (standalone output)
COPY --from=builder /app/public          ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
# Prisma schema and generated client are embedded in standalone, but copy explicitly for safety
COPY --from=deps    --chown=nextjs:nodejs /app/prisma           ./prisma

USER nextjs

EXPOSE 8080

# Cloud Run expects the app to listen on $PORT (default 8080)
CMD ["node", "server.js"]
