FROM node:22-alpine AS build

WORKDIR /usr/app

COPY package*.json ./
RUN npm ci || npm install

COPY . .

# Stub: allow template to build even before real code exists
RUN npm run build || true

FROM nginx:alpine AS runtime

WORKDIR /usr/share/nginx/html

COPY --from=build /usr/app/dist ./
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 10000

