FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY scripts/ scripts/
COPY output/ output/

# Create data directory
RUN mkdir -p scripts/data output/reports

# Install cron
RUN apk add --no-cache dcron

# Create the scan script that loads env vars
# (crond doesn't inherit container env vars, so we dump them at build/start)
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
