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

1. **Extract** — Muse Spark (Meta's model, served via NanoGPT or the Meta
   Model API) reads each document into structured fields. Without a key,
   the verified fixture extraction is shown instead.
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

The server binds `127.0.0.1` only. To serve it on a network, set both
`HOST` and the host names visitors will use; any other `Host` header is
refused (421), which blocks DNS-rebinding attacks:

```sh
HOST=0.0.0.0 ALLOWED_HOSTS=demo.example.com bun run server.ts
```

## Live mode (Muse Spark)

By default the demo runs fully offline: the Q&A and extraction use a
deterministic local engine over the same record, so every feature works
with no key and no network.

To run the AI features live, set one provider key (never commit it):

```sh
export NANOGPT_API_KEY="..."   # NanoGPT, model meta/muse-spark-1.3
# or
export MODEL_API_KEY="..."     # Meta Model API (dev.meta.ai), model muse-spark-1.3
bun run server.ts
```

If both are set, NanoGPT wins; `MODEL_PROVIDER=nanogpt|meta` picks one
explicitly. `MODEL_API_BASE` and `MODEL_API_MODEL` override the chosen
provider's base URL and model. The engine pill in the UI and `/api/mode`
show which provider and model are live.

**Spend cap.** At most `MODEL_CALL_LIMIT` model requests (default 100) are
sent per server start; after that the AI features fall back to the local
engine and say so. An invalid value refuses to boot rather than removing
the cap. One question or extraction costs about $0.003 on Muse Spark 1.3.

**Meta credits warning, from Meta's own hackathon materials:** the $150
Model API credits appear under Billing > free credits. If they are not yet
applied, your card is charged on API calls. Check the credits show as
applied and set a Spend Limit notification on the Billing page before using
`MODEL_API_KEY`. This repo makes no model call unless one of the two keys
is set.

## Architecture

```
server.ts            Bun server: static files + JSON API
src/seed.ts          Synthetic project, documents, entries (the fixtures)
src/record.ts        Hash chain, ECDSA signatures, verify, tamper, reset, roles
src/meta.ts          Muse Spark client (NanoGPT or Meta Model API, OpenAI-compatible), spend cap
src/ask.ts           Buyer Q&A: local engine + Muse Spark path, role-scoped
public/              Single-page demo UI (no framework, no build step)
```

Record format per entry: `{seq, type, title, date, fields[], prevHash}`,
hashed with SHA-256 and signed with ECDSA P-256 over the canonical bytes.
Field-level roles (`public` / `buyer` / `auditor`) are enforced server-side
before any engine sees the data, and source-document lines that back a
restricted field are redacted for roles that may not see it (checked at
boot: the server refuses to start if a line is more visible than a field
it backs). Signing keys are generated per boot for this demo; production
uses a persistent developer key.

Hardening: loopback bind by default, `Host` allowlist, cross-origin POSTs
refused, only the four UI files are served, 16 KiB request bodies, a CSP
with no inline script or style, generic 500s with no stack traces, and
provider error bodies kept in the server log.

## API

| Method | Path | What |
|---|---|---|
| GET | `/api/project?role=` | Project, role-filtered entries and documents, public key, anchor |
| GET | `/api/verify?role=` | Per-entry hash/signature/link status + anchor match |
| GET | `/api/docs?role=` | Source documents with numbered lines, redacted for the role |
| POST | `/api/tamper` | Demo-only: forge one field without re-signing |
| POST | `/api/reset` | Restore the seed record |
| POST | `/api/ask` | `{question, role}` → cited answer or refusal |
| POST | `/api/extract/:docId?role=` | AI extraction for one document, each value checked against its cited line and the record |
| GET | `/api/mode` | Which provider and model are live, and model calls left |

A request without a valid `role` is treated as `public`.

## Judging criteria

- **Impact (30%)** — off-plan buyers in Dubai pay against progress they
  cannot verify. A checkable record replaces marketing claims with proof.
- **Use of Meta AI tooling (25%)** — Muse Spark (Meta) powers extraction
  and buyer Q&A; the local engine is the offline fallback, not the
  product.
- **Demo (25%)** — one page, one story: verify the chain, forge an edit,
  watch it get caught, ask as three different roles. See `DEMO.md`.
- **Technical depth (20%)** — hash-chained signed entries, field-level
  verification against source lines, permissioned views, tamper
  localization, anchor mismatch detection.

## Honest limits

- Synthetic data only; nothing here describes a real project.
- Signing keys are ephemeral per boot; the anchor is a recorded head hash,
  not an OpenTimestamps proof (production design, not demo scope).
- Roles are chosen by the caller (the View-as switch). They show what each
  audience is allowed to see; they are not authentication. Production
  binds the role to a signed-in identity.
- Demo state is shared: anyone who can reach the server can tamper or
  reset for every viewer.
- The live path was exercised through NanoGPT (`meta/muse-spark-1.3`) on
  2026-11-04: Q&A in all three roles and extraction. The direct Meta Model
  API path uses the same client but was not exercised (no key). On any
  API error both AI features fall back to the local engine and say so.

## License

MIT. See `LICENSE`.
