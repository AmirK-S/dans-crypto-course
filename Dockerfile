FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY scripts/ scripts/
COPY output/ output/

# Create data directory
RUN mkdir -p scripts/data output/reports

# Default: run the scanner once
CMD ["node", "scripts/scan.mjs"]
