// The trusted record: a hash chain with a real digital signature on
// every entry. Tamper with any field and re-verification names the
// exact entry that broke, because the stored hash and signature no
// longer match the entry bytes.
//
// Keys are generated per boot (demo). Production uses a persistent
// developer key and anchors the head hash with OpenTimestamps; the
// anchor here is a recorded head hash labelled as a demo anchor.

import { PROJECT, DOCS, SEED_ENTRIES, type EntryInput, type Field, type Role, type SourceDoc } from "./seed.ts";

export interface Entry extends EntryInput {
  prevHash: string;
  hash: string;
  signature: string; // base64url, ECDSA P-256 over the canonical bytes
}

export interface EntryView extends Omit<Entry, "fields"> {
  fields: Field[];
  hashOk: boolean;
  sigOk: boolean;
  linkOk: boolean;
}

const enc = new TextEncoder();

function canonical(e: EntryInput, prevHash: string): string {
  // Fixed key order, no whitespace tricks: the bytes hashed are the
  // bytes signed, and both are recomputed on verify.
  return JSON.stringify({
    seq: e.seq,
    type: e.type,
    title: e.title,
    date: e.date,
    fields: e.fields.map((f) => ({
      label: f.label,
      value: f.value,
      doc: f.doc,
      line: f.line,
    })),
    prevHash,
  });
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function unb64url(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}

export interface RecordState {
  keypair: CryptoKeyPair;
  publicJwk: JsonWebKey;
  entries: Entry[];
  anchorHead: string;
  anchoredAt: string;
  tampered: boolean;
}

export async function buildRecord(): Promise<RecordState> {
  assertLineRoles(DOCS, SEED_ENTRIES);
  // Private key is non-extractable: it can sign, never leave the
  // process. The public key is always exportable for verifiers.
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keypair.publicKey);
  const state: RecordState = {
    keypair,
    publicJwk,
    entries: [],
    anchorHead: "",
    anchoredAt: "2026-11-03T12:00:00Z",
    tampered: false,
  };
  await rebuild(state);
  state.anchorHead = state.entries[state.entries.length - 1].hash;
  return state;
}

async function rebuild(state: RecordState): Promise<void> {
  let prev = "GENESIS";
  const out: Entry[] = [];
  for (const input of SEED_ENTRIES) {
    const bytes = enc.encode(canonical(input, prev));
    const hash = await sha256Hex(bytes);
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, state.keypair.privateKey, bytes);
    out.push({ ...structuredClone(input), prevHash: prev, hash, signature: b64url(new Uint8Array(sig)) });
    prev = hash;
  }
  state.entries = out;
  state.tampered = false;
}

export async function resetRecord(state: RecordState): Promise<void> {
  await rebuild(state);
  state.anchorHead = state.entries[state.entries.length - 1].hash;
}

export interface VerifyResult {
  valid: boolean;
  anchorMatch: boolean;
  headHash: string;
  entries: { seq: number; hashOk: boolean; sigOk: boolean; linkOk: boolean }[];
}

export async function verifyRecord(state: RecordState): Promise<VerifyResult> {
  const rows: VerifyResult["entries"] = [];
  let prevStored = "GENESIS";
  // Threaded recomputation: each entry's hash is recomputed over the
  // recomputed hash of its predecessor, so one edited entry diverges
  // the whole downstream chain and the head no longer matches the
  // anchor. Per-entry checks use the STORED prevHash so the exact
  // edited entry is named instead of everything downstream.
  let prevRecomputed = "GENESIS";
  let valid = true;
  for (const e of state.entries) {
    const bytes = enc.encode(canonical(e, e.prevHash));
    const hash = await sha256Hex(bytes);
    const hashOk = hash === e.hash;
    const sigOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      state.keypair.publicKey,
      unb64url(e.signature),
      bytes,
    );
    const linkOk = e.prevHash === prevStored;
    if (!hashOk || !sigOk || !linkOk) valid = false;
    rows.push({ seq: e.seq, hashOk, sigOk, linkOk });
    prevStored = e.hash;
    prevRecomputed = await sha256Hex(enc.encode(canonical(e, prevRecomputed)));
  }
  const headHash = prevRecomputed;
  return { valid, anchorMatch: headHash === state.anchorHead, headHash, entries: rows };
}

/** Demo-only tamper: change the progress figure in entry 3's stored
 *  copy without re-hashing or re-signing, exactly what a forged edit
 *  looks like. The next verify names entry 3. */
export function tamperRecord(state: RecordState): { seq: number; field: string; from: string; to: string } | null {
  const target = state.entries.find((e) => e.seq === 3);
  if (!target || state.tampered) return null;
  const field = target.fields[0];
  const from = field.value;
  field.value = "49%";
  state.tampered = true;
  return { seq: 3, field: field.label, from, to: "49%" };
}

export function filterForRole(entry: Entry, role: Role): Entry {
  return { ...entry, fields: entry.fields.filter((f) => f.roles.includes(role)) };
}

function lineVisible(doc: SourceDoc, line: number, role: Role): boolean {
  const allowed = doc.lineRoles?.[line];
  return !allowed || allowed.includes(role);
}

/** Refuses to boot if a source line is readable by a role that one of
 *  the fields it backs hides from, since the document viewer would
 *  then leak what the field filter withholds. The error lists every
 *  violating line.
 */
export function assertLineRoles(docs: SourceDoc[], entries: EntryInput[]): void {
  const leaks: string[] = [];
  for (const e of entries) {
    for (const f of e.fields) {
      const doc = docs.find((d) => d.id === f.doc);
      if (!doc || f.line < 1 || f.line > doc.lines.length) {
        leaks.push(`ENTRY-${e.seq} "${f.label}" cites missing ${f.doc} line ${f.line}`);
        continue;
      }
      for (const role of ["public", "buyer", "auditor"] as Role[]) {
        if (!f.roles.includes(role) && lineVisible(doc, f.line, role)) {
          leaks.push(`${f.doc} line ${f.line} is visible to ${role} but backs ENTRY-${e.seq} "${f.label}" (roles ${f.roles.join("/")})`);
        }
      }
    }
  }
  if (leaks.length) throw new Error(`source-line roles leak restricted fields:\n  ${leaks.join("\n  ")}`);
}

/** Source documents as the role may read them: lines it may not see
 *  are replaced by a redaction marker, so line numbers still match. */
export function docsForRole(role: Role): SourceDoc[] {
  return DOCS.map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    date: d.date,
    lines: d.lines.map((l, i) => (lineVisible(d, i + 1, role) ? l : `[redacted: not visible to the ${role} role]`)),
  }));
}

export function projectView(state: RecordState, role: Role) {
  const { contractValue, ...publicProject } = PROJECT;
  return {
    project: role === "public" ? publicProject : PROJECT,
    docs: docsForRole(role),
    role,
    publicKey: state.publicJwk,
    anchor: {
      headHash: state.anchorHead,
      anchoredAt: state.anchoredAt,
      method: "demo anchor: head hash recorded at build. Production anchors via OpenTimestamps on Bitcoin.",
    },
    entries: state.entries.map((e) => filterForRole(e, role)),
    tampered: state.tampered,
  };
}

export async function entriesWithStatus(state: RecordState, role: Role): Promise<EntryView[]> {
  const v = await verifyRecord(state);
  const bySeq = new Map(v.entries.map((r) => [r.seq, r]));
  return state.entries.map((e) => {
    const s = bySeq.get(e.seq)!;
    const filtered = filterForRole(e, role);
    return { ...filtered, hashOk: s.hashOk, sigOk: s.sigOk, linkOk: s.linkOk };
  });
}
