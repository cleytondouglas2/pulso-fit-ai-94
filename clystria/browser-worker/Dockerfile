FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
RUN node --check index.mjs && chown -R node:node /app
USER node
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
EXPOSE 10000
CMD ["node","index.mjs"]
