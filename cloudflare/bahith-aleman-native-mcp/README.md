# Bahith — Al-Eman Cloudflare Worker

Ported from the original Val Town `bahith-aleman-native-mcp` source, with its per-val SQLite adapter converted to Cloudflare D1. Original tools and endpoint behavior are preserved. The worker has a `scheduled` handler, but **no Cron Trigger has been enabled yet**. Do not activate the schedule until the old Val Town sync is stopped and source/destination reconciled.

Deployment: `npx wrangler deploy` from this directory. D1 binding: `DB`. Verify GET, `initialize`, `tools/list`, `aleman_status`, and representative book search before switching clients.
