# Research Execution Gateway — Remote MCP v0.7.0

Live endpoint: https://mosab-research-gateway.val.run/

Free, read-only Streamable HTTP MCP server based on the Val Town official MCP template and TypeScript SDK.

## Tools
- gateway_capabilities — read providers and operational limits.
- research_round — query GitHub repository search, OpenAlex works, or Europe PMC biomedical articles with an optional single bounded fallback when results are too few or show weak title overlap.
- inspect_public_record — GitHub README, Europe PMC PMID metadata, or a bounded PMCID full-text XML excerpt.

## Production checks (2026-10-20)
MCP initialize, tools/list, tools/call, all three providers, README, PMID, PMCID XML, malicious identifier rejection and zero-result fallback were tested against the live endpoint.

## Limits and safety
Public research topics ONLY: never transmit private documents, patient details, credentials or secrets.
Only hardcoded HTTPS upstream API hosts are permitted: api.github.com, api.openalex.org and www.ebi.ac.uk.
Maximum five candidates per search and two calls per research round; upstream timeout approximately 6.5 seconds.
Val-scoped SQLite holds aggregate provider/time counters ONLY, not queries or user identities; global public quotas 12 calls/minute/provider and 120 calls/day/provider. Quotas are shared across visitors; upstream provider quotas also apply.
Repository names, index entries and abstracts are leads, not proof. A README is not a security or functionality test. An excerpt from XML is not a complete scientific appraisal.
Receipts are returned in tool responses; there is NO persistent per-query research ledger and NO background worker.
This MCP does not possess the user's ChatGPT connector permissions. The endpoint must be connected by an MCP client to become callable inside it.
The Val Town free-tier source is public. Use a restricted deployment for private data or authenticated integrations.

## How to connect
Register https://mosab-research-gateway.val.run/ as a remote Streamable HTTP MCP server in an MCP-capable client. Then explicitly enable it. Research Orchestrator's skills can route public research into its tool capabilities once available; plugin instructions alone do not install connections.

## Architecture
Gateway: bounded public retrieval, source-native links, selective original read and exact receipts.
Research Orchestrator: evidence targeting, broader discovery, independent appraisal, discrepancy analysis and calibrated stopping.
Neither successful search nor high result counts prove exhaustive coverage.


## Verified 0.7.1 refinement — material-aware source filters (2026-10-20)
Additional optional research_round argument: target_kind = general | primary_randomized_trial | dataset | android_app.
- primary_randomized_trial: Europe PMC provider-native PUB_TYPE filter, excludes titles explicitly labelled "protocol" in the indexed title. This is a **retrieval constraint**, not independently authenticated trial design.
- dataset: OpenAlex works filter type:dataset; returned records still need inspection of the repository's actual contents.
- android_app: GitHub repository search; tags descriptions mentioning BYD/DiLink/head units as specialized_vehicle_head_unit without claiming other apps work.
- incompatible provider/target pair fails closed before external requests.
- OpenAlex publication year remains explicitly labelled unverified against repository metadata; publisher/repository dates may differ.
- Original-source reading remains a separate tool; the first five results are never automatically certified as complete.
Acceptance checked against the live deployed MCP for all three target kinds and an incompatible provider; the prior general mode remains backward-compatible. Refreshing the MCP client tool schema may be needed to expose the new optional target_kind parameter.


## 0.9.0 — Automatic relevance routing (2026-10-20)
The connected research plugin now includes the `automatic-longtail-research-activation` skill. On substantive public research, its recommended workflow checks for under-indexed, rare, overlooked and specialist evidence both before searching and when new niche leads emerge later, **even if the user did not name this gateway or a skill**. This is a relevance-driven choice, not an instruction to query every provider for every user request.

The gateway MCP tool descriptions have been updated to make their intended proactive use visible to the host's tool-selection process. The current server still searches GitHub, OpenAlex and Europe PMC only and cannot intercept arbitrary ChatGPT searches or choose tools for the host. It cannot guarantee 100% activation in other conversations. The auto-routing instructions do NOT weaken the existing limits, privacy rules or source-verification requirements. A deterministic always-on enforcement guarantee requires a dedicated controlling runner/workflow that calls the router before every research operation; it is not implied by a ChatGPT skill description.


## 0.10.0 — Unified executable research entrypoint (2026-10-20)
The remote MCP now provides **research_preflight** (zero-network route/abstention check) and **research_auto** (preflight first, then bounded public source searches and optional one alternative long-tail probe). Source selection is deterministic, evidence-type-aware, and limited to GitHub, OpenAlex and Europe PMC. It abstains for specialized Islamic original sources, official laws/patents or original manuscript scans, unsupported ambiguous topics, explicit no-web requests and obvious confidential credentials/patient records. Do not submit sensitive content; public string filtering is not a privacy guarantee.

Results include actual source call receipts and metadata-level topic-anchor warnings. Arabic OCR requests visibly flag Urdu OCR datasets; unrelated clinical-study titles are flagged; special device repositories remain marked. This is **not** autonomous semantic understanding, verified software execution, known-ground-truth recall or persistent learning.

The Val Town `route_selftest.ts` Deno script passed **26/26** routing fixtures, including negative controls. Live end-to-end call checks covered GitHub, biomedical studies, Arabic manuscript datasets, explicit niche in focused mode, no-browse, sensitive-topic abstention and original README reading. The existing ChatGPT MCP connection may need a client-side tool-list refresh to make the two new methods callable from ChatGPT; deployment alone does not alter stale host tool schemas. For users wanting strict gatekeeping, their research runner must call `research_auto` as its sole search entrypoint. This server cannot force unrelated ChatGPT search or existing old conversations through it.


## 0.10.1 — Phase-1 production-hardening review (2026-10-20)
All provider search paths now reject obvious public-query secrets/identifiers before outbound requests. Provider JSON, GitHub README and Europe PMC XML are streamed with a strict byte ceiling rather than trusting a possibly missing Content-Length; MCP HTTP POST bodies >24,000 bytes are rejected with HTTP 413. Public SQLite quota buckets are pruned on demand; capped conditional UPSERT prevents counters increasing after quota exhaustion. Quotas are GLOBAL to all callers, so the public service is still subject to quota-exhaustion abuse and upstream limits. Val Town hosting and original provider infrastructure may retain telemetry even though the application's SQLite does not store query text.

Val Town regression suites: 26/26 routing and 16/16 security checks. Production diagnostic: expired test row deleted on the next provider call; regular provider call succeeded and oversize MCP HTTP body was refused. These are bounded checks, not an independent security certification or sustained load test.

**Unresolved integration:** although live tools/list currently advertises 6 methods, the current ChatGPT connector snapshot in the evaluating conversation exposes only 3. New tools require the eligible connection owner/admin to refresh or review tool actions if supported by account/workspace UI; deployment alone cannot update a frozen ChatGPT host registry. No data-sensitive material belongs on this public server.


## 0.10.4 — Hidden-corpus advisory route (20 October 2026)
- `hidden_corpus_triage` is now an MCP tool. It accepts only bounded public site identity/index/sample assertions, validates record URL domains, counts distinct work IDs, and labels mirror paths as access/discovery rather than original evidence.
- `research_preflight` returns `hidden_corpus_route` when a library/archive may be hidden behind a non-obvious domain name, and `research_auto` includes the same advisory when it must abstain for a specialist book/archive source.
- The tool **does not crawl arbitrary sites**, store research history, verify book texts or deduplicate editions against Shamilah. Website inspection requires native web/archival tools in the invoking host.
- No claim of a universal automatic ChatGPT hook. The existing GitHub/OpenAlex/Europe PMC restrictions, privacy filters, quotas and 24 KB request cap remain in force.
- Branch tests: 16/16 new deterministic cases; 26/26 routing regression; 16/16 security regression; live MCP `tools/list`, `tools/call` and three `research_preflight` scenarios passed on the feature branch before merge.
