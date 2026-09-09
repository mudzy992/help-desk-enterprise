FROM node:22-alpine AS builder

WORKDIR /usr/app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci || npm install
COPY . .

# Prisma generate treba DATABASE_URL u nekim setupima; placeholder je dovoljan u template-u
ENV DATABASE_URL="mysql://user:pass@host:3306/db"
RUN npx prisma generate || true
RUN npm run build || true

FROM node:22-alpine

WORKDIR /usr/app

COPY --from=builder /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/dist ./dist
COPY --from=builder /usr/app/package*.json ./
COPY --from=builder /usr/app/prisma ./prisma/

ENV NODE_ENV=production
ENV PORT=10001
ENV UPLOAD_ROOT=/usr/app/uploads

EXPOSE 10001

# Stub: real projects will have dist/src/main.js
CMD ["node", "dist/src/main.js"]

