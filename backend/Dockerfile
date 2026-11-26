# The digest is intentionally shared by every stage: a tag update cannot silently
# change either the compiler or runtime base. Renovation requires a reviewed diff.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS production-deps

WORKDIR /usr/app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS builder

WORKDIR /usr/app
COPY package*.json ./
COPY prisma ./prisma/
# Build tools are devDependencies. `npm ci` is strict: lock drift or an install
# failure stops the image build; there is deliberately no `npm install` fallback.
RUN npm ci --include=dev
COPY . .

ENV DATABASE_URL="postgresql://user:pass@host:5432/db"
# W2.20 (`BA-authentication-07`): generate through the offline wrapper. Prisma's CLI
# would otherwise fetch `schema-engine` from binaries.prisma.sh even though `generate`
# only needs the WASM engine bundled in the npm package — a network dependency inside
# the image build. The wrapper fails loudly if anything ever needs the real binary.
RUN node scripts/prisma-offline.mjs generate
RUN npm run build
RUN test -f dist/src/main.js && test -f dist/src/worker.js

# Release-only image: owns Prisma CLI and migrations; API/worker runtime does not.
FROM builder AS migration
USER node
ENTRYPOINT ["node", "scripts/run-release-migrations.mjs"]

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runtime

WORKDIR /usr/app

# Runtime receives only production dependencies and compiled application output.
# Prisma/Nest/TypeScript build CLIs and source schema are intentionally excluded.
COPY --chown=node:node --from=production-deps /usr/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/app/dist ./dist
COPY --chown=node:node --from=builder /usr/app/package*.json ./
# Generisano ogledalo dokumentacije za /docs rute.
COPY --chown=node:node --from=builder /usr/app/content ./content
# npm/corepack are build/package-manager tooling, not runtime requirements.
# libssl3/libcrypto3 are raised to the patched Alpine build because the pinned
# base still ships 3.5.9-r0 (CVE-2026-95691/95692/107496/88823). The lower bound
# keeps the build working when Alpine publishes a newer patch.
RUN apk add --no-cache zlib=1.4-r0 'libssl3>=3.5.9-r1' 'libcrypto3>=3.5.9-r1' && \
    rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack && \
    mkdir -p /usr/app/uploads && chown node:node /usr/app/uploads

ENV NODE_ENV=production
ENV PORT=10001
ENV UPLOAD_ROOT=/usr/app/uploads

EXPOSE 10001
STOPSIGNAL SIGTERM
USER node

CMD ["node", "dist/src/main.js"]
