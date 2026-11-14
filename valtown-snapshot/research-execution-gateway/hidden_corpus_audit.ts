/** Evidence triage only: never fetches URLs, never treats submitter claims as independently verified. */
export type CorpusSample = {
  url: string;
  work_id: string;
  readable_attested: boolean;
  independently_checked?: boolean;
};
export type CorpusInput = {
  domain: string;
  site_identity_label: string;
  identity_mismatch_attested: boolean;
  collection_index_examined: boolean;
  substantial_collection_attested: boolean;
  claimed_items?: number;
  origin_relation?: "primary_holder" | "independent_transcription" | "known_mirror" | "mixed" | "catalog_only" | "unknown";
  samples: CorpusSample[];
};
function validDomain(input: string): boolean {
  return input.length <= 253 &&
    /^(?=.{4,253}$)(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(input) &&
    !input.endsWith(".local") && !input.endsWith(".internal") && !input.endsWith(".localhost");
}
export function auditHiddenCorpus(payload: CorpusInput) {
  const domain = String(payload.domain || "").trim().toLowerCase();
  if (!validDomain(domain)) return { status: "invalid_domain", independent_verification: false, no_absence_claim: true };
  const distinct = new Map<string,string>();
  let rejected = 0;
  for (const item of payload.samples || []) {
    try {
      const u = new URL(item.url);
      const host = u.hostname.toLowerCase();
      if (u.protocol !== "https:" || !!u.username || !!u.password ||
          !!u.search || !!u.hash || !(host === domain || host.endsWith("." + domain)) ||
          !item.readable_attested || !String(item.work_id || "").trim()) { rejected++; continue; }
      const key = item.work_id.trim().toLocaleLowerCase();
      if (!distinct.has(key)) distinct.set(key, u.toString());
    } catch { rejected++; }
  }
  const n = distinct.size;
  const identity = payload.identity_mismatch_attested === true;
  const index = payload.collection_index_examined === true;
  const large = payload.substantial_collection_attested === true;
  const origin = payload.origin_relation || "unknown";
  const status = index && large && identity && n >= 2
    ? "identity_mismatch_supported_by_submitted_evidence"
    : identity && n >= 1 ? "candidate_needs_independent_review"
    : "unverified_or_not_identity_mismatch";
  const utility = origin === "known_mirror" || origin === "catalog_only"
    ? "access_or_discovery_path_not_independent_text"
    : status === "identity_mismatch_supported_by_submitted_evidence" &&
      (origin === "primary_holder" || origin === "independent_transcription")
      ? "potentially_original_material_needs_comparison"
      : "unknown_or_unverified_independence";
  return {
    domain, status, work_count_attested_distinct: n, rejected_samples: rejected,
    input_claimed_items: payload.claimed_items ?? null,
    input_claim_not_audited: true, origin_as_attested: origin,
    research_utility: utility, source_urls: Array.from(distinct.values()).slice(0,6),
    independent_verification: false, no_absence_claim: true,
    next_step: "Read the original items with the appropriate web/archive tool, compare edition and text provenance, then assess rights and uniqueness.",
    warning: "No network access or originality verification is performed here. This is evidence-input triage, not automated website discovery.",
  };
}
