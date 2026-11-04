# Verified Project Record

**From scattered site documents to buyer-trusted proof.** A working demo of the
Aunova Trust Infrastructure idea, built for the Meta Global AI Developer
Hackathon (Startup track, theme: Build for Your World).

Off-plan buyers pay in stages against construction progress, but the proof of
that progress is scattered across site reports, procurement records,
certificates, and sales documents, and is hard to verify exactly when a
payment depends on it. This demo turns four synthetic documents into one
trusted project record: structured, permissioned, source-backed, and AI-ready.

## The demo in 30 seconds

1. **Extract** — Muse Spark (Meta Model API) reads each document into
   structured fields. Without a key, the verified fixture extraction is
   shown instead.
2. **Verify** — every field is checked against its source document and line
   before it enters the record.
3. **Sign** — each entry is hash-chained to the previous one (SHA-256) and
   signed (ECDSA P-256). Press **Tamper with entry 3** and re-verification
   names the exact entry that broke, and the head hash no longer matches
   the anchor.
4. **Anchor** — the head hash is timestamped, so the record is provable
   later. In this demo the anchor is a recorded head hash; production
   anchors via OpenTimestamps on Bitcoin.
5. **Ask** — a buyer asks the project questions and gets answers scoped to
   their access rights (public / buyer / auditor), each cited to its
   entry. Anything outside the record is refused, not guessed.

## Quick start

Zero dependencies. Requires [Bun](https://bun.sh) 1.x.

```sh
bun run server.ts
# open http://localhost:3000
```

`PORT` overrides the port. State is in memory; **Reset demo** restores the
seed. All data is synthetic: a fictional project, developer, contractor,
and documents. No client data, no real project.

## Live Meta mode (Muse Spark)

By default the demo runs fully offline: the Q&A and extraction use a
deterministic local engine over the same record, so every feature works
with no key and no network.

To run the AI features live against the Meta Model API:

```sh
export MODEL_API_KEY="..."   # create one at dev.meta.ai, never commit it
bun run server.ts
```

Optional overrides: `MODEL_API_BASE` (default `https://api.meta.ai/v1`),
`MODEL_API_MODEL` (default `muse-spark-1.3`).

**Credits warning, from Meta's own hackathon materials:** the $150 Model API
credits appear under Billing > free credits. If they are not yet applied,
your card is charged on API calls. Check the credits show as applied and set
a Spend Limit notification on the Billing page before running live mode.
This repo makes no Model API call unless `MODEL_API_KEY` is set.

## Architecture

```
server.ts            Bun server: static files + JSON API
src/seed.ts          Synthetic project, documents, entries (the fixtures)
src/record.ts        Hash chain, ECDSA signatures, verify, tamper, reset, roles
src/meta.ts          Meta Model API client (Chat Completions, OpenAI-compatible)
src/ask.ts           Buyer Q&A: local engine + Muse Spark path, role-scoped
public/              Single-page demo UI (no framework, no build step)
```

Record format per entry: `{seq, type, title, date, fields[], prevHash}`,
hashed with SHA-256 and signed with ECDSA P-256 over the canonical bytes.
Field-level roles (`public` / `buyer` / `auditor`) are enforced server-side
before any engine sees the data. Signing keys are generated per boot for
this demo; production uses a persistent developer key.

## API

| Method | Path | What |
|---|---|---|
| GET | `/api/project?role=` | Project, role-filtered entries, public key, anchor |
| GET | `/api/verify` | Per-entry hash/signature/link status + anchor match |
| GET | `/api/docs` | Source documents with numbered lines |
| POST | `/api/tamper` | Demo-only: forge one field without re-signing |
| POST | `/api/reset` | Restore the seed record |
| POST | `/api/ask` | `{question, role}` → cited answer or refusal |
| POST | `/api/extract/:docId` | AI extraction for one document |
| GET | `/api/mode` | Which engine is active, and the model in use |

## Judging criteria

- **Impact (30%)** — off-plan buyers in Dubai pay against progress they
  cannot verify. A checkable record replaces marketing claims with proof.
- **Use of Meta AI tooling (25%)** — Muse Spark via the Meta Model API
  powers extraction and buyer Q&A; the local engine is the offline
  fallback, not the product.
- **Demo (25%)** — one page, one story: verify the chain, forge an edit,
  watch it get caught, ask as three different roles. See `DEMO.md`.
- **Technical depth (20%)** — hash-chained signed entries, field-level
  verification against source lines, permissioned views, tamper
  localization, anchor mismatch detection.

## Honest limits

- Synthetic data only; nothing here describes a real project.
- Signing keys are ephemeral per boot; the anchor is a recorded head hash,
  not an OpenTimestamps proof (production design, not demo scope).
- The Meta Model API path is implemented against the official docs but was
  not exercised live during the build (no key available; no calls made).
  With a key set, `/api/mode` reports `enabled: true` and both AI features
  call Muse Spark; on any API error they fall back to the local engine
  and say so.

## License

MIT. See `LICENSE`.
