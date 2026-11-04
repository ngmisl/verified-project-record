# Demo script — 2 minutes, one take

Prerequisites: `bun run server.ts`, browser on http://localhost:3000.
Optional: `MODEL_API_KEY` set for the live Muse Spark path (check the $150
credits show as applied under Billing > free credits first, and set a
Spend Limit notification). The script works identically offline; the
engine pill says which mode is active.

## 0:00–0:20 — The problem, the record

> "Off-plan buyers pay against construction progress they cannot verify.
> This is one project's record: five entries from four documents, every
> field carrying its source document and line."

Show: the project header, the five entries, one field's citation
(SPR-014 line 4, 46%).

## 0:20–0:45 — Verify, then forge

Click **Re-verify**: "Record valid, five entries, anchor matches."

Click **Tamper with entry 3**: "Someone edited the progress figure from
46% to 49% without re-signing. Watch what verification says now."

Click **Re-verify**: "Entry 3 fails its hash and signature, the anchor
mismatches, and the other four entries still verify. The forgery is
caught and named — that is the product."

Click **Reset demo**.

## 0:45–1:20 — Ask as three roles

Ask: "How far along is construction?" — cited answer, ENTRY-3 and ENTRY-2.

Switch to **Public**, ask: "How much money has been certified?" —
refused: money figures need buyer or auditor access.

Switch to **Auditor**, ask the same — the certified amounts appear, cited
to ENTRY-4.

## 1:20–1:50 — AI extraction

Open source document SPR-014, click **Run AI extraction on this document**.
With a key: Muse Spark extracts the fields live, and each is checked
against the verified fixture. Offline: the fixture extraction is shown
and the note says so.

## 1:50–2:00 — Close

> "Proof, not promises. One record, checkable by everyone carrying the
> risk. Built by Aunova Technologies, DIFC."

## If something goes wrong live

- If the Model API call fails, the UI falls back to the local engine and
  labels the answer. Keep going; the record, verification, and tamper
  demo do not need the network.
- If the tamper button is greyed out, the demo is already tampered:
  press Reset demo first.
