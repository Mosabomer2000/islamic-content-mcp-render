# Dormant Railway MCP restoration package (2026-11-14)

No Railway, Render, or paid Cloudflare Container deployment is initiated by these backups.

## Scope and verified facts

| Service | Runtime | Last known deployment | Preserved |
| --- | --- | --- | --- |
| WordCraft | Bun + native Linux `wordcraft-cli`; temporary document sessions | Absent | Original 19,868-character gateway source and a local-only Docker test template |
| Saffaf | Python 3.13, LibreOffice, Poppler + secret-provided bootstrap code | Absent | Redacted runtime and dependency inventory, **not** secret-provided source code |
| NotebookLM | Docker, OAuth + Google session credentials, 500 MB persistent volume at `/data` | Absent | Safe configuration names and restore checklist; **not** the credential-bearing volume |

The old WordCraft gateway is pinned to `v0.5.0`; `v0.18.1` is a newer candidate (November 2026) **not tested with the legacy gateway**. Do not change `RELEASE` without validating archive layout, SHA256 and all MCP tools.

## Test WordCraft locally

1. Copy `wordcraft-legacy-server.ts`, `Dockerfile.wordcraft` and `compose.wordcraft.test.yaml` into the same local directory.
2. Set `MCP_TOKEN` to a freshly generated high-entropy secret outside Git.
3. Run `docker compose -f compose.wordcraft.test.yaml up --build`. Only localhost port 3000 is exposed.
4. Confirm `http://127.0.0.1:3000/health`, then `http://127.0.0.1:3000/selftest`; test document operations under the token-prefixed MCP URL.
5. Stop the container after testing. Its `/tmp` documents are intentionally ephemeral.

This is a **deployment recipe, not a tested running replacement**. The test may fail due to Docker image dependencies, WordCraft archive layout, or memory limits.


## WordCraft v0.18.1 candidate (NOT deployed)

A separate `wordcraft-v0.18.1-candidate.ts` upgrades the configured release and requires an official `SHA256SUMS.txt` match before executing the downloaded archive. It uses a different temporary install directory from v0.5.0. This is a **static code candidate**; downloading and running the binary and testing the server's MCP compatibility have NOT been performed.

For a local isolated test, copy `wordcraft-v0.18.1-candidate.ts`, `Dockerfile.wordcraft.candidate`, `compose.wordcraft.candidate.yaml` and `.dockerignore` into one folder, then run `docker compose -f compose.wordcraft.candidate.yaml up --build` with a private `MCP_TOKEN`. It binds only `127.0.0.1:3001`. Verify `GET /health`, `GET /selftest`, tool discovery, document create/edit/save/download, and confirm no path traversal or session leakage. The legacy `v0.5.0` source is retained for rollback.

The experimental SHA256 check is not a substitute for independent trust in GitHub release signing, a compatible C library, or end-to-end document operation tests. Do not switch production before these pass.

## Safety

- The GitHub repository and this backup branch are public. No user secrets, profile data, OAuth state, service-role keys or embedded Saffaf bootstrap code are included.
- Never copy NotebookLM's `/data` volume to GitHub or publicly accessible object storage. A master token is equivalent to an authenticated Google account credential.
- If Saffaf is restored, preinstall LibreOffice and validate Arabic fonts/RTL output in end-to-end document tests.
- Standard Cloudflare Workers are not equivalent to Linux containers. Cloudflare Containers requires Workers Paid and incurs billed usage.
- The user must choose an approved container host/workspace and a billing policy before provisioning paid infrastructure.
