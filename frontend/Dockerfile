FROM node:22-alpine AS build

WORKDIR /usr/app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
# Build tools (vite / nest / prisma CLI) are devDependencies. Coolify passes every env var as a
# build arg, so NODE_ENV=production would make `npm ci` skip them; --include=dev keeps the build
# independent of NODE_ENV.
RUN npm ci --include=dev || npm install --include=dev

COPY . .

RUN npm run build

FROM nginx:alpine AS runtime

WORKDIR /usr/share/nginx/html

COPY --from=build /usr/app/dist ./
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 10000
