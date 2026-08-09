# CodeAtlas web application.
# Build from the repository root so the frontend/ directory is in context:
#   docker build -f docker/Dockerfile -t codeatlas .

FROM node:18-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

# Copy manifests first so dependency installation stays cached.
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the application source.
COPY frontend/ ./

RUN pnpm run build

# ---------------------------------------------------------------------------

FROM node:18-alpine AS runner
WORKDIR /app

RUN npm install -g pnpm

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
