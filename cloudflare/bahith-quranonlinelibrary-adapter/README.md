# Bahith Quran Online Library Adapter — Cloudflare Worker

Ported source with the Val Town `npm:` import replaced by a package dependency, without changing the MCP business logic. **Candidate, not yet built, tested, or deployed to Cloudflare.**

```sh
npm install
npm run dev
npm run deploy
```

The remote source website may rate-limit or reject requests. Test its parsing behavior and original MCP tool schemas before replacing endpoints. Do not deploy until authenticated to your Cloudflare account.
