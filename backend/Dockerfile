FROM node:22-alpine AS builder

WORKDIR /usr/app

COPY package*.json ./
COPY prisma ./prisma/
# Build tools (vite / nest / prisma CLI) are devDependencies. Coolify passes every env var as a
# build arg, so NODE_ENV=production would make `npm ci` skip them; --include=dev keeps the build
# independent of NODE_ENV.
RUN npm ci --include=dev || npm install --include=dev
COPY . .

ENV DATABASE_URL="postgresql://user:pass@host:5432/db"
# No `|| true`: a failed generate/build must fail the deploy, not ship an image without dist/.
RUN npx prisma generate
RUN npm run build
RUN test -f dist/src/main.js && test -f dist/src/worker.js

FROM node:22-alpine

WORKDIR /usr/app

COPY --from=builder /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/dist ./dist
COPY --from=builder /usr/app/package*.json ./
COPY --from=builder /usr/app/prisma ./prisma/
COPY --from=builder /usr/app/prisma.config.ts ./prisma.config.ts

ENV NODE_ENV=production
ENV PORT=10001
ENV UPLOAD_ROOT=/usr/app/uploads

EXPOSE 10001

CMD ["node", "dist/src/main.js"]
