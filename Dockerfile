FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3200
EXPOSE 3200
CMD ["node", "src/server.js"]
