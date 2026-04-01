FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/server apps/server
COPY packages/shared packages/shared

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev

COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/packages/shared/dist packages/shared/dist

EXPOSE 3000

CMD ["npm", "run", "-w", "@dice/server", "start"]
