# Builder/dependency stages are digest-pinned and share one ABI-compatible
# Debian base. Renovation requires an explicit reviewed digest diff.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS production-deps

WORKDIR /usr/app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS builder

WORKDIR /usr/app
COPY package*.json ./
COPY prisma ./prisma/
# Build tools are devDependencies. `npm ci` is strict: lock drift or an install
# failure stops the image build; there is deliberately no `npm install` fallback.
RUN npm ci --include=dev
COPY . .

ENV DATABASE_URL="postgresql://user:pass@host:5432/db"
RUN npx prisma generate
RUN npm run build
RUN test -f dist/src/main.js && test -f dist/src/worker.js
# Distroless nonroot uses UID/GID 65532 and has no shell for runtime setup.
RUN mkdir -p /usr/app/uploads && chown 65532:65532 /usr/app/uploads

# Distroless excludes shell, package manager and build CLI attack surface.
FROM gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc AS runtime

WORKDIR /usr/app
COPY --chown=65532:65532 --from=production-deps /usr/app/node_modules ./node_modules
COPY --chown=65532:65532 --from=builder /usr/app/dist ./dist
COPY --chown=65532:65532 --from=builder /usr/app/package*.json ./
COPY --chown=65532:65532 --from=builder /usr/app/content ./content
COPY --chown=65532:65532 --from=builder /usr/app/uploads ./uploads

ENV NODE_ENV=production
ENV PORT=10001
ENV UPLOAD_ROOT=/usr/app/uploads

EXPOSE 10001
STOPSIGNAL SIGTERM
USER 65532:65532

CMD ["dist/src/main.js"]
