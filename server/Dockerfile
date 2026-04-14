FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_GC=1

CMD ["npm", "start"]