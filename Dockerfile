# ---------------------------------------------------------------------------
# FinTrack API container image.
#
# Only needed for hosts that build from a Dockerfile (Fly.io, Railway with
# Docker, Cloud Run). Render uses render.yaml and ignores this file.
#
# Multi-stage: the build stage keeps devDependencies and the TypeScript
# toolchain; the runtime stage ships only what the process actually needs.
# ---------------------------------------------------------------------------

# ------------------------------------------------------------ build stage ---
FROM node:22-alpine AS build

WORKDIR /app

# Copied before the source so a source-only change does not reinstall
# node_modules. The Prisma schema is needed here because `postinstall` runs
# `prisma generate`.
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev


# ---------------------------------------------------------- runtime stage ---
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Runs as the unprivileged `node` user that the base image already provides,
# so a container breakout does not land on root.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000

# Applies pending migrations, then starts the API. `migrate deploy` only ever
# rolls forward - it will not reset a production database.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
