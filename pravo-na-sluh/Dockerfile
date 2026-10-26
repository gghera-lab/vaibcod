# «Право на слух» — образ для production: собранный Mini App + API в одном процессе.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY . .
RUN npm run build -w @pravo/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages ./packages
COPY --from=build /app/content ./content
COPY --from=build /app/docs/legal ./docs/legal
# Аудио монтируется томом или раздаётся с CDN (AUDIO_BASE_URL); в образ не копируется.
RUN mkdir -p /app/storage/audio && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
