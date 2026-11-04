// Synthetic demo data. Nothing here is a real project, developer, or
// document. Every value is invented for the hackathon demo so the
// record can be inspected end to end without any client data.

export type Role = "public" | "buyer" | "auditor";

export interface Field {
  label: string;
  value: string;
  doc: string;
  line: number;
  roles: Role[];
}

export interface EntryInput {
  seq: number;
  type: "procurement" | "progress" | "payment" | "certificate";
  title: string;
  date: string;
  fields: Field[];
}

export interface SourceDoc {
  id: string;
  title: string;
  kind: string;
  date: string;
  lines: string[];
}

export const PROJECT = {
  id: "HVT-001",
  name: "Harbor View Tower",
  developer: "Meridian Properties",
  contractor: "Harbor Build LLC",
  location: "Dubai Marina, plot MA-07 (fictional)",
  units: 240,
  structure: "G+28 floors",
  handover: "Q3 2028",
  contractValue: "AED 90,000,000",
  synthetic: true,
};

export const DOCS: SourceDoc[] = [
  {
    id: "SPR-013",
    title: "Site Progress Report SPR-013",
    kind: "Progress report",
    date: "30 Sep 2026",
    lines: [
      "Site Progress Report SPR-013 — Harbor View Tower",
      "Reporting period: 1–30 September 2026. Contractor: Harbor Build LLC.",
      "Tower crane TC-1 erected on 12 September 2026 and certified for operation.",
      "Podium slab P1 poured 22 September 2026; 1,180 m3 of concrete placed.",
      "Structural progress at month end: 38%.",
      "Rebar delivered in period: 640 t (cumulative 1,200 t, batch RB-118).",
      "Supplier: Emirates Steel. Mill certificate MC-4412 received and filed.",
    ],
  },
  {
    id: "SPR-014",
    title: "Site Progress Report SPR-014",
    kind: "Progress report",
    date: "28 Oct 2026",
    lines: [
      "Site Progress Report SPR-014 — Harbor View Tower",
      "Reporting period: 1–28 October 2026. Contractor: Harbor Build LLC.",
      "Podium slab P2 poured 14 October 2026; 1,240 m3 of concrete placed.",
      "Structural progress at month end: 46%.",
      "Tower crane TC-1 operational throughout the period; no downtime recorded.",
      "Next milestone: Level 12 slab, due 30 November 2026.",
    ],
  },
  {
    id: "PC-007",
    title: "Interim Payment Certificate PC-007",
    kind: "Payment certificate",
    date: "31 Oct 2026",
    lines: [
      "Interim Payment Certificate PC-007 — Harbor View Tower",
      "Contract sum: AED 90,000,000. Certified to date: 46%.",
      "Cumulative certified amount: AED 41,400,000.",
      "This certificate: AED 4,100,000 for October 2026 works.",
      "Next instalment of AED 4,500,000 falls due on completion of the Level 12 slab.",
      "Signed: Independent Certifier, 31 October 2026.",
    ],
  },
  {
    id: "CER-022",
    title: "Materials Certificate CER-022",
    kind: "Certificate",
    date: "20 Oct 2026",
    lines: [
      "Materials Certificate CER-022 — Harbor View Tower",
      "Concrete mix used in podium slabs P1 and P2 contains 30% GGBS cement replacement.",
      "Verified by: GreenBuild Materials Lab, 20 October 2026.",
      "Applicable to structural elements P1, P2 only.",
    ],
  },
];

export const SEED_ENTRIES: EntryInput[] = [
  {
    seq: 1,
    type: "procurement",
    title: "Rebar delivery, batch RB-118",
    date: "30 Sep 2026",
    fields: [
      { label: "Batch", value: "RB-118", doc: "SPR-013", line: 6, roles: ["public", "buyer", "auditor"] },
      { label: "Quantity (cumulative)", value: "1,200 t", doc: "SPR-013", line: 6, roles: ["public", "buyer", "auditor"] },
      { label: "Supplier", value: "Emirates Steel", doc: "SPR-013", line: 7, roles: ["auditor"] },
      { label: "Mill certificate", value: "MC-4412", doc: "SPR-013", line: 7, roles: ["buyer", "auditor"] },
    ],
  },
  {
    seq: 2,
    type: "progress",
    title: "September progress: 38%",
    date: "30 Sep 2026",
    fields: [
      { label: "Structural progress", value: "38%", doc: "SPR-013", line: 5, roles: ["public", "buyer", "auditor"] },
      { label: "Tower crane TC-1", value: "Erected 12 Sep 2026, certified", doc: "SPR-013", line: 3, roles: ["public", "buyer", "auditor"] },
      { label: "Podium slab P1", value: "Poured 22 Sep 2026", doc: "SPR-013", line: 4, roles: ["public", "buyer", "auditor"] },
    ],
  },
  {
    seq: 3,
    type: "progress",
    title: "October progress: 46%",
    date: "28 Oct 2026",
    fields: [
      { label: "Structural progress", value: "46%", doc: "SPR-014", line: 4, roles: ["public", "buyer", "auditor"] },
      { label: "Podium slab P2", value: "Poured 14 Oct 2026", doc: "SPR-014", line: 3, roles: ["public", "buyer", "auditor"] },
      { label: "Next milestone", value: "Level 12 slab, due 30 Nov 2026", doc: "SPR-014", line: 6, roles: ["public", "buyer", "auditor"] },
    ],
  },
  {
    seq: 4,
    type: "payment",
    title: "Payment certificate PC-007",
    date: "31 Oct 2026",
    fields: [
      { label: "Certified completion", value: "46%", doc: "PC-007", line: 2, roles: ["public", "buyer", "auditor"] },
      { label: "Cumulative certified", value: "AED 41,400,000", doc: "PC-007", line: 3, roles: ["buyer", "auditor"] },
      { label: "This certificate", value: "AED 4,100,000", doc: "PC-007", line: 4, roles: ["buyer", "auditor"] },
      { label: "Next instalment", value: "AED 4,500,000 on Level 12 slab", doc: "PC-007", line: 5, roles: ["buyer", "auditor"] },
    ],
  },
  {
    seq: 5,
    type: "certificate",
    title: "Sustainability certificate CER-022",
    date: "20 Oct 2026",
    fields: [
      { label: "GGBS content", value: "30% cement replacement", doc: "CER-022", line: 2, roles: ["public", "buyer", "auditor"] },
      { label: "Applies to", value: "Podium slabs P1, P2", doc: "CER-022", line: 4, roles: ["public", "buyer", "auditor"] },
      { label: "Verified by", value: "GreenBuild Materials Lab", doc: "CER-022", line: 3, roles: ["public", "buyer", "auditor"] },
    ],
  },
];
