FROM ghcr.io/puppeteer/puppeteer:20.9.0
WORKDIR /app
COPY package*.json./
RUN npm install
COPY..
CMD ["node", "arena-final.js"]
