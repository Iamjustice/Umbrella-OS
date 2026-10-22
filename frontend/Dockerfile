# Default stays bullseye for the existing x86 build; docker-compose.arm64.yml
# passes NODE_IMAGE=node:20-bookworm-slim for the Graviton (arm64) build.
ARG NODE_IMAGE=node:20-bullseye-slim
FROM ${NODE_IMAGE}

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start"]
