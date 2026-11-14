# Val Town → Cloudflare migration inventory
Snapshot date: **2026-11-14** (UTC date). Original account: `mosabomer`.

## Source archive
- **11 of 11** projects, **37 of 37** source files copied into `valtown-snapshot/<project>/`; GitHub tree verified (37 blobs, 11 project folders).
- Historical commits and branch histories are **not** mirrored; this is a current-source snapshot.
- Original Val Town code, runtime settings, and endpoints were **not modified**.
- GitHub repository: `Mosabomer2000/islamic-content-mcp-render`, branch `val-town-archive-20261114`.
- The existing repository is **public**. No database record exports or credentials are included.
- `midad-transcripts/tasks/` was an empty directory; Git does not track empty directories.

## Projects
| Project | Source files | Migration status |
|---|---:|---|
| midad-transcripts | 2 | Source archived; D1/FTS + secret + server-side file serving migration needed |
| bahith-bulk-domain-research | 7 | Source archived; D1 + two scheduled jobs + cheerio import migration needed |
| mawsuat-adillat-sihhat-al-islam | 6 | Source archived; content inspected: appears to be untouched Val Town starter; not a substantive site |
| research-execution-gateway | 8 | Source archived; complex MCP + D1 quota + npm imports migration needed |
| bahith-quranonlinelibrary-adapter | 4 | Source archived; separate Cloudflare candidate package prepared, not deployed |
| musannif-personal-critical-guard | 2 | Source archived; separate Cloudflare candidate package prepared, not deployed |
| bahith-mcp-smoke-20261017 | 2 | Source archived; temporary smoke-test project, production redeployment not necessary unless required |
| bahith-fasi-image-verifier | 1 | Source archived; one-off script |
| bahith-aleman-native-mcp | 3 | Source archived; D1 + six-hour synchronization needed |
| bahith-public-mcp-gateway | 1 | Source archived; separate Cloudflare candidate package prepared, not deployed |
| bahith-federated-public-mcp | 1 | Source archived; D1 quota + MCP source migration needed |

## SQLite inventory (source at inspection)
These are approximate operational row counts that can change until source writes are frozen:
- **midad-transcripts:** channels=1, videos=210, segments=21893, segment_editions=485, transcript_audits=4, transcript_review_flags=6; derived FTS index search_fts=21893. Preserve FTS rebuild logic.
- **bahith-bulk-domain-research:** jobs=300, native_articles=1059, native_categories=70, pages=1229.
- **bahith-aleman-native-mcp:** books=424, catalog_roots=27, control=1, sections=299.
- **research-execution-gateway:** gateway_quota=5.
- **bahith-federated-public-mcp:** gateway_quota=4.
- **bahith-mcp-smoke-20261017:** bahith_probe=1.

### Data migration requirements
1. Export schema, indexes, triggers and ordinary table rows using a *bearer-protected* one-time export to a secure local file (outside GitHub and outside chat). Plan FTS virtual table separately.
2. Create one or more Cloudflare D1 databases with explicit bindings, then import into a disposable staging database.
3. Compare row counts and deterministic hashes against the source; test representative records and queries before cutover.
4. Freeze Val Town writes and scheduled jobs, apply final changes, verify counts again, and enable Cloudflare writes.
5. Keep a rollback plan; never allow source and destination to independently accept writes.

No database rows have been copied to Cloudflare. Original application secret **`MIDAD_ADMIN_TOKEN`** exists on Val Town but its value cannot be retrieved by the integration. Configure an equivalent **new** Cloudflare Worker secret; do not commit credentials.

## Blob / legacy storage checks
- Project-scoped Blob storage: 0 objects across all 11 vals.
- Personal legacy global Blob storage: 0 objects.
- Personal legacy global SQLite database: 0 tables.
- Shared environment variable groups: 0.

## Active Val Town schedules (UTC)
| Project | Interval file | Val Town schedule |
|---|---|---|
| bahith-bulk-domain-research | worker.ts | every 1 hour, delay-based |
| bahith-bulk-domain-research | native.ts | cron `*/15 * * * *` |
| bahith-aleman-native-mcp | sync.ts | cron `0 */6 * * *` |

Do not enable equivalent Cloudflare scheduled tasks until the source tasks are disabled and destination database state verified.

## Cloudflare packaging created
- `cloudflare/bahith-public-mcp-gateway/`
- `cloudflare/bahith-quranonlinelibrary-adapter/`
- `cloudflare/musannif-personal-critical-guard/`

These are **unbuilt and undeployed candidates**. Authenticate Cloudflare in ChatGPT using the official [Cloudflare MCP](https://mcp.cloudflare.com/mcp) / [Cloudflare plugin](https://chatgpt.com/plugins/cloudflare). Then inspect account resources, deploy into staging, test GET and MCP initialize/tools/list/tools/call, test appropriate source data queries, and update users/callers only after passing checks.

## Not done
- No Cloudflare account resources created, no D1 import, no production Worker URL, no end-to-end verification.
- No active Val Town redirect, job, or secret changed.
- No GitHub Actions deployment credential added.
- Full Val Town git/version history is not preserved by this snapshot.

References: [Val Town official migration guide](https://docs.val.town/migration), [Cloudflare port guide](https://docs.val.town/migration/cloudflare).
