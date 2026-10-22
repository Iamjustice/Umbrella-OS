# Default stays bullseye for the existing x86 build; docker-compose.arm64.yml
# passes NODE_IMAGE=node:20-bookworm-slim for the Graviton (arm64) build.
ARG NODE_IMAGE=node:20-bullseye-slim
FROM ${NODE_IMAGE}

# Install ADB (Android Debug Bridge) and build tools
RUN apt-get update && apt-get install -y \
    android-tools-adb \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
