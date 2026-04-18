FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/ ./

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_GC=1

CMD ["npm", "start"]
