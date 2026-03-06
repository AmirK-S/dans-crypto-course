#!/bin/sh

# Dump current environment variables so cron jobs can access them
env | grep -E '^(COINGECKO|TELEGRAM|OPENROUTER|NODE|PATH)' > /app/.env.cron

# Create the cron job script
cat > /app/run-scan.sh << 'SCRIPT'
#!/bin/sh
# Load env vars
set -a
. /app/.env.cron
set +a
cd /app
node scripts/scan.mjs >> /proc/1/fd/1 2>> /proc/1/fd/2
SCRIPT
chmod +x /app/run-scan.sh

# Set up crontab: 7 AM UTC daily
echo "0 7 * * * /app/run-scan.sh" | crontab -

echo "DanScan cron started — scan runs daily at 07:00 UTC"
echo "Container started at: $(date -u)"

# Run crond in foreground (container stays alive)
crond -f -l 2
