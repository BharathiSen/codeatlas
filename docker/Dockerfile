# CodeAtlas web application.
# Build from the repository root so the frontend/ directory is in context:
#   docker build -f docker/Dockerfile -t codeatlas .
#
# Node 22 matches CI (`node-version: 22`) and local development. The images ran
# node:18 until 2026-08-11, which was untested everywhere else and, being past
# end-of-life, no longer receives security updates. It was also actively limiting:
# vitest 4 declares `node: ^20 || ^22 || >=24` and could not run inside the image
# at all. See D-38.
#
# pnpm is pinned to the same major CI uses (`pnpm/action-setup` with `version: 10`).
# It has to be: `npm install -g pnpm` resolves to the newest release the *host Node*
# supports, so node:18 was silently holding pnpm at 10.x, and moving to node:22
# would otherwise have pulled pnpm 11 — which turns ignored build scripts into a
# hard `ERR_PNPM_IGNORED_BUILDS` failure. A Node bump must not smuggle in a package
# manager major.

FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@10

# Copy manifests first so dependency installation stays cached.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the application source.
COPY frontend/ ./

RUN pnpm run build

# ---------------------------------------------------------------------------
# One-shot migration image. Runs to completion before the web app starts, then
# exits — migrations are a deployment step, not something a serving process does
# on boot, because N replicas booting together would race on the same schema.
#
# It extends `builder` because that is the only stage where drizzle-kit exists.
# The runner installs --prod deliberately, and shipping a migration toolchain
# into the long-lived serving image to be used once at deploy time is the wrong
# trade; reusing builder costs no extra layers because web already builds it.
#
# Migrations live at the repository root — drizzle.config.ts writes to
# `../database/migrations`, relative to the frontend/ working directory — so they
# sit outside what the builder copies and are brought in explicitly.

FROM builder AS migrate
COPY database/ /database/
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------------------

FROM node:22-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm@10

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./

RUN pnpm install --prod --frozen-lockfile

# Runtime configuration — see .env.example for the full list.
ARG GITHUB_TOKEN
ARG GEMINI_API_KEY
ARG GEMINI_API_KEY_SECONDARY
ARG GITINGEST_API_URL
ARG REDIS_URL
ARG NEXT_PUBLIC_APP_URL

ENV GITHUB_TOKEN=$GITHUB_TOKEN
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV GEMINI_API_KEY_SECONDARY=$GEMINI_API_KEY_SECONDARY
ENV GITINGEST_API_URL=$GITINGEST_API_URL
ENV REDIS_URL=$REDIS_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "start"]
