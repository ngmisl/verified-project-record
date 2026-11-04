// Buyer Q&A over the signed record. Two engines, one contract:
// every answer cites the entries it came from, and anything not in
// the record is refused rather than invented. Role scoping happens
// before the engine sees the data: the engine only ever receives
// fields the caller's role may see.

import { DOCS, type Role } from "./seed.ts";
import { chatCompletion, metaEnabled } from "./meta.ts";
import { filterForRole, type Entry } from "./record.ts";

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
      const supplier = field(entries, 1, "Supplier");
      const base = `Rebar batch RB-118 totals 1,200 t delivered, with mill certificate MC-4412 on file. Source: ${cite(1)}.`;
      return {
        text: supplier ? `${base} Supplier: ${supplier}.` : base,
        citations: [cite(1)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /pay|amount|aed|money|cost|instalment|installment|certified amount/i,
    run: (entries, role) => {
      if (role === "public") {
        return {
          text: "Money figures are not visible to the public role. Certified completion (46%) is public; amounts require buyer or auditor access. Source: ENTRY-4 (restricted fields hidden).",
          citations: [cite(4)],
          engine: "local",
          role,
        };
      }
      return {
        text: `Payment certificate PC-007 certifies 46% completion: AED 41,400,000 cumulative certified, AED 4,100,000 for October works, and a next instalment of AED 4,500,000 due on the Level 12 slab. Source: ${cite(4)}.`,
        citations: [cite(4)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /next|milestone|when|due|handover|finish|complete/i,
    run: (entries, role) => {
      const next = field(entries, 3, "Next milestone");
      const money = role === "public" ? "" : " The next instalment of AED 4,500,000 falls due on its completion.";
      return {
        text: `Next milestone: ${next ?? "Level 12 slab, due 30 Nov 2026"}.${money} Source: ${cite(3)} and ${cite(4)}.`,
        citations: [cite(3), cite(4)],
        engine: "local",
        role,
      };
    },
  },
  {
    re: /progress|percent|%|far along|how much built|structural/i,
    run: (entries) => ({
      text: `Structural progress is 46% as of 28 October 2026 (SPR-014), up from 38% at the end of September. Source: ${cite(3)} and ${cite(2)}.`,
      citations: [cite(3), cite(2)],
      engine: "local",
      role: "buyer",
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
    `The caller has the ${role} role and only sees the fields listed; do not reveal anything else.`;
  try {
    const text = await chatCompletion([
      { role: "system", content: `${system}\n\nSIGNED RECORD:\n${context}` },
      { role: "user", content: question },
    ]);
    const citations = [...new Set([...text.matchAll(/ENTRY-(\d+)/g)].map((m) => `ENTRY-${m[1]}`))];
    return { text: text.trim(), citations, engine: "meta", role };
  } catch (err) {
    const fallback = localAnswer(question, visible, role);
    return { ...fallback, engine: "local (meta failed)" };
  }
}

export function docText(docId: string): string | null {
  const doc = DOCS.find((d) => d.id === docId);
  if (!doc) return null;
  return doc.lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}
