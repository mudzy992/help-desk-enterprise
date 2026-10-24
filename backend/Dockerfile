# The digest is intentionally shared by every stage: a tag update cannot silently
# change either the compiler or runtime base. Renovation requires a reviewed diff.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS production-deps

WORKDIR /usr/app
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts && npm cache clean --force

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

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

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime

WORKDIR /usr/app

# Runtime receives only production dependencies and compiled application output.
# Prisma/Nest/TypeScript build CLIs and source schema are intentionally excluded.
COPY --chown=node:node --from=production-deps /usr/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/app/dist ./dist
COPY --chown=node:node --from=builder /usr/app/package*.json ./
# Generisano ogledalo dokumentacije za /docs rute.
COPY --chown=node:node --from=builder /usr/app/content ./content
RUN mkdir -p /usr/app/uploads && chown node:node /usr/app/uploads

ENV NODE_ENV=production
ENV PORT=10001
ENV UPLOAD_ROOT=/usr/app/uploads

EXPOSE 10001
STOPSIGNAL SIGTERM
USER node

CMD ["node", "dist/src/main.js"]
