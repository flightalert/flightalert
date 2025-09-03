FROM node:lts-alpine AS build

ENV NODE_ENV=development

WORKDIR /app

COPY package*.json .

RUN npm ci

COPY . .

RUN npm run build


FROM node:lts-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json .
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.env ./.env

CMD ["node", "dist/index.js"]
