FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN node ace build && cd build && npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333 LOG_LEVEL=info APP_URL=http://localhost:3333
COPY --from=build /app/build ./
COPY docker-entrypoint.sh /usr/local/bin/
USER node
EXPOSE 3333
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "bin/server.js"]
