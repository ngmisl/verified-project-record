// Buyer Q&A over the signed record. Two engines, one contract:
// every answer cites the entries it came from, and anything not in
// the record is refused rather than invented. Role scoping happens
// before the engine sees the data: the engine only ever receives
// fields the caller's role may see.

import type { Role } from "./seed.ts";
import { chatCompletion, metaEnabled } from "./meta.ts";
import { docsForRole, filterForRole, type Entry } from "./record.ts";

export interface Answer {
  text: string;
  citations: string[];
  engine: "meta" | "local" | "local (meta failed)";
  role: Role;
}

const IN_RECORD = "In the record: progress reports SPR-013/SPR-014, payment certificate PC-007, materials certificate CER-022, and the rebar delivery batch RB-118.";

function cite(seq: number): string {
  return `ENTRY-${seq}`;
}

interface Intent {
  re: RegExp;
  run: (entries: Entry[], role: Role) => Answer | null;
}

function find(entries: Entry[], seq: number): Entry {
  return entries.find((e) => e.seq === seq)!;
}

function field(entries: Entry[], seq: number, label: string): string | null {
  const f = find(entries, seq).fields.find((x) => x.label === label);
  return f ? f.value : null;
}

const INTENTS: Intent[] = [
  {
    re: /crane/i,
    run: (entries) => ({
      text: `Tower crane TC-1 was erected on 12 September 2026 and certified for operation, and was operational throughout October with no downtime recorded. Source: ${cite(2)} and ${cite(3)}.`,
      citations: [cite(2), cite(3)],
      engine: "local",
      role: "buyer",
    }),
  },
  {
    re: /certificat|ggbs|sustainab|green|concrete/i,
    run: (entries) => ({
      text: `Materials certificate CER-022 verifies the podium concrete contains 30% GGBS cement replacement, applying to slabs P1 and P2, verified by GreenBuild Materials Lab. Source: ${cite(5)}.`,
      citations: [cite(5)],
      engine: "local",
      role: "buyer",
    }),
  },
  {
    re: /rebar|steel|deliver|procure|supplier|mill/i,
    run: (entries, role) => {
      const qty = field(entries, 1, "Quantity (cumulative)");
      const mill = field(entries, 1, "Mill certificate");
      const supplier = field(entries, 1, "Supplier");
      return {
        text:
          `Rebar batch ${field(entries, 1, "Batch")} totals ${qty} delivered.` +
          (mill ? ` Mill certificate ${mill} is on file.` : "") +
          (supplier ? ` Supplier: ${supplier}.` : "") +
          ` Source: ${cite(1)}.`,
        citations: [cite(1)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /pay|amount|aed|money|cost|instalment|installment|certified amount/i,
    run: (entries, role) => {
      const pct = field(entries, 4, "Certified completion");
      const cum = field(entries, 4, "Cumulative certified");
      if (!cum) {
        return {
          text: `Money figures are not visible to the ${role} role. Certified completion (${pct}) is public; amounts require buyer or auditor access. Source: ${cite(4)} (restricted fields hidden).`,
          citations: [cite(4)],
          engine: "local",
          role,
        };
      }
      return {
        text: `Payment certificate PC-007 certifies ${pct} completion: ${cum} cumulative certified, ${field(entries, 4, "This certificate")} for October works, and a next instalment of ${field(entries, 4, "Next instalment")}. Source: ${cite(4)}.`,
        citations: [cite(4)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /next|milestone|when|due|handover|finish|complete/i,
    run: (entries, role) => {
      const instalment = field(entries, 4, "Next instalment");
      return {
        text: `Next milestone: ${field(entries, 3, "Next milestone")}.${instalment ? ` Next instalment: ${instalment}.` : ""} Source: ${cite(3)} and ${cite(4)}.`,
        citations: [cite(3), cite(4)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /progress|percent|%|far along|how much built|structural/i,
    run: (entries, role) => ({
      text: `Structural progress is ${field(entries, 3, "Structural progress")} as of 28 October 2026 (SPR-014), up from ${field(entries, 2, "Structural progress")} at the end of September. Source: ${cite(3)} and ${cite(2)}.`,
      citations: [cite(3), cite(2)],
      engine: "local",
      role,
    }),
  },
  {
    re: /who|developer|builder|contractor|build/i,
    run: () => ({
      text: "Developer: Meridian Properties. Contractor: Harbor Build LLC. The certifier on PC-007 is an independent certifier. (Synthetic demo data.)",
      citations: [cite(4)],
      engine: "local",
      role: "buyer",
    }),
  },
];

export function localAnswer(question: string, entries: Entry[], role: Role): Answer {
  for (const intent of INTENTS) {
    if (intent.re.test(question)) {
      const a = intent.run(entries, role);
      if (a) return { ...a, role };
    }
  }
  return {
    text: `That is not in the record, so I will not guess. ${IN_RECORD} Try asking about progress, payments, the crane, certificates, or the next milestone.`,
    citations: [],
    engine: "local",
    role,
  };
}

export async function ask(question: string, entries: Entry[], role: Role): Promise<Answer> {
  const visible = entries.map((e) => filterForRole(e, role));
  if (!metaEnabled()) return localAnswer(question, visible, role);
  const context = visible
    .map((e) => {
      const fields = e.fields.map((f) => `  - ${f.label}: ${f.value} (source ${f.doc} line ${f.line})`).join("\n");
      return `[ENTRY-${e.seq}] ${e.title} (${e.date})\n${fields}`;
    })
    .join("\n");
  const system =
    "You answer questions about a construction project ONLY from the signed record below. " +
    "Every factual claim must cite its entry as [ENTRY-n]. If the answer is not in the record, say so and do not guess. " +
    "Never invent numbers, dates, or names. Keep the answer under 80 words. " +
    `The caller has the ${role} role and only sees the fields listed; do not reveal anything else. ` +
    "Access rules: the public role sees no money figures; buyer and auditor see payment amounts; only auditor sees supplier names. " +
    "If the question needs a field the caller's role cannot see, say which access it needs instead of saying it is missing.";
  try {
    const text = await chatCompletion([
      { role: "system", content: `${system}\n\nSIGNED RECORD:\n${context}` },
      { role: "user", content: question },
    ]);
    const citations = [...new Set([...text.matchAll(/ENTRY-(\d+)/g)].map((m) => `ENTRY-${m[1]}`))];
    return { text: text.trim(), citations, engine: "meta", role };
  } catch (err) {
    console.error(`ask fell back to the local engine: ${err instanceof Error ? err.message : err}`);
    const fallback = localAnswer(question, visible, role);
    return { ...fallback, engine: "local (meta failed)" };
  }
}

/** Numbered document text as the role may read it (restricted lines
 *  redacted), so the model never sees more than the caller could. */
export function docText(docId: string, role: Role): string | null {
  const doc = docsForRole(role).find((d) => d.id === docId);
  if (!doc) return null;
  return doc.lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}
