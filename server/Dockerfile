FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY src/shared /app/src/shared
COPY src/styles /app/src/styles
COPY src/logo.png /app/src/logo.png

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_GC=1

CMD ["npm", "start"]
