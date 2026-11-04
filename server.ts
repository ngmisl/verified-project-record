// Verified Project Record — demo server. Zero dependencies, Bun.
// Serves the single-page demo and a small JSON API over the signed
// record. State is in memory; Reset restores the seed.

import { buildRecord, resetRecord, tamperRecord, verifyRecord, projectView, entriesWithStatus, type RecordState } from "./src/record.ts";
import { ask, docText } from "./src/ask.ts";
import { metaConfig, metaEnabled, chatCompletion } from "./src/meta.ts";
import { DOCS, SEED_ENTRIES, type Role } from "./src/seed.ts";

const PORT = Number(process.env.PORT ?? 3000);

const state: RecordState = await buildRecord();

const ROLES: Role[] = ["public", "buyer", "auditor"];
function roleOf(req: Request, body?: { role?: string }): Role {
  const url = new URL(req.url);
  const q = url.searchParams.get("role") ?? body?.role;
  return ROLES.includes(q as Role) ? (q as Role) : "buyer";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function fixtureExtraction(docId: string) {
  const seen = new Map<string, { label: string; value: string; line: number }>();
  for (const e of SEED_ENTRIES) {
    for (const f of e.fields) {
      if (f.doc === docId) seen.set(`${f.label}|${f.value}`, { label: f.label, value: f.value, line: f.line });
    }
  }
  return [...seen.values()];
}

async function handleExtract(docId: string) {
  const text = docText(docId);
  if (!text) return json({ error: "unknown document" }, 404);
  const fixture = fixtureExtraction(docId);
  if (!metaEnabled()) {
    return json({
      engine: "local",
      docId,
      fields: fixture.map((f) => ({ ...f, matched: true })),
      note: "Offline demo mode: showing the verified fixture extraction. Set MODEL_API_KEY to re-extract with Muse Spark.",
    });
  }
  try {
    const raw = await chatCompletion([
      {
        role: "system",
        content:
          "Extract structured fields from the construction document below. Reply with ONLY a JSON array of objects: {\"label\": string, \"value\": string, \"line\": number}. " +
          "Each value must appear verbatim in the cited line. Extract money figures, percentages, dates, names, and quantities. No other text.",
      },
      { role: "user", content: text },
    ]);
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { label: string; value: string; line: number }[];
    const doc = DOCS.find((d) => d.id === docId)!;
    const fields = parsed
      .filter((f) => f && typeof f.label === "string" && typeof f.value === "string" && Number.isInteger(f.line) && f.line >= 1 && f.line <= doc.lines.length)
      .map((f) => ({
        ...f,
        matched: fixture.some((x) => x.label === f.label && x.value === f.value),
      }));
    return json({ engine: "meta", docId, fields, note: `Extracted by ${process.env.MODEL_API_MODEL ?? "muse-spark-1.3"} via the Meta Model API. Matched = agrees with the verified fixture.` });
  } catch (err) {
    return json({
      engine: "local (meta failed)",
      docId,
      fields: fixture.map((f) => ({ ...f, matched: true })),
      note: `Meta extraction failed (${err instanceof Error ? err.message : err}). Showing the verified fixture extraction instead.`,
    });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/mode") return json({ ...metaConfig(), record: "synthetic demo data" });
    if (path === "/api/project") return json(projectView(state, roleOf(req)));
    if (path === "/api/verify") {
      const v = await verifyRecord(state);
      return json({ ...v, entries: await entriesWithStatus(state, roleOf(req)) });
    }
    if (path === "/api/docs") return json({ docs: DOCS });
    if (path === "/api/tamper" && req.method === "POST") {
      const result = tamperRecord(state);
      if (!result) return json({ error: "already tampered; reset first" }, 400);
      return json({ tampered: true, ...result, verify: await verifyRecord(state) });
    }
    if (path === "/api/reset" && req.method === "POST") {
      await resetRecord(state);
      return json({ reset: true, verify: await verifyRecord(state) });
    }
    if (path === "/api/ask" && req.method === "POST") {
      const body = await readBody(req);
      const question = String(body.question ?? "").slice(0, 500);
      if (!question.trim()) return json({ error: "question is required" }, 400);
      const answer = await ask(question, state.entries, roleOf(req, body as { role?: string }));
      return json(answer);
    }
    if (path.startsWith("/api/extract/") && req.method === "POST") {
      return handleExtract(path.split("/")[3] ?? "");
    }

    // Static files.
    const filePath = path === "/" ? "/index.html" : path;
    const file = Bun.file(`public${filePath}`);
    if (await file.exists()) {
      const type = filePath.endsWith(".js")
        ? "text/javascript"
        : filePath.endsWith(".css")
          ? "text/css"
          : "text/html";
      return new Response(file, { headers: { "Content-Type": type } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Verified Project Record demo on http://localhost:${server.port} (mode: ${metaEnabled() ? "meta" : "local"})`);
