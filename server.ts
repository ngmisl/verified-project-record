// Verified Project Record — demo server. Zero dependencies, Bun.
// Serves the single-page demo and a small JSON API over the signed
// record. State is in memory; Reset restores the seed.

import { buildRecord, resetRecord, tamperRecord, verifyRecord, projectView, entriesWithStatus, docsForRole, type RecordState } from "./src/record.ts";
import { ask, docText } from "./src/ask.ts";
import { metaConfig, metaEnabled, chatCompletion, modelLabel } from "./src/meta.ts";
import { SEED_ENTRIES, type Role } from "./src/seed.ts";

const PORT = Number(process.env.PORT ?? 3000);
// Loopback unless told otherwise: the AI routes spend model credits,
// so the demo is not reachable from the network by accident.
const HOST = process.env.HOST ?? "127.0.0.1";
// Host-header allowlist. Stops DNS rebinding: a web page cannot point
// its own domain at 127.0.0.1 and drive this server from a browser.
const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_HOSTS ?? "localhost,127.0.0.1")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

const state: RecordState = await buildRecord();

// Least privilege: a request that names no valid role is public.
const ROLES: Role[] = ["public", "buyer", "auditor"];
function roleOf(req: Request, body?: { role?: unknown }): Role {
  const q = new URL(req.url).searchParams.get("role") ?? body?.role;
  return ROLES.includes(q as Role) ? (q as Role) : "public";
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// The only files served. Nothing is resolved from the request path.
const PUBLIC_DIR = `${import.meta.dir}/public`;
const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
};

function fixtureExtraction(docId: string, role: Role) {
  const seen = new Map<string, { label: string; value: string; line: number }>();
  for (const e of SEED_ENTRIES) {
    for (const f of e.fields) {
      if (f.doc === docId && f.roles.includes(role)) seen.set(`${f.label}|${f.value}`, { label: f.label, value: f.value, line: f.line });
    }
  }
  return [...seen.values()];
}

type ExtractStatus = "match" | "differs" | "extra" | "ungrounded";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const numbers = (s: string) => (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, ""));

/** Same fact, allowing the record's normalised wording ("30 Nov") to
 *  differ from the document's ("30 November"): every number in the
 *  record value must appear in the extracted value (which may carry
 *  more, e.g. the "2" in "slab P2"), and number-free values must
 *  contain one another. */
function agrees(recordValue: string, extracted: string): boolean {
  const a = numbers(recordValue);
  if (a.length) {
    const b = numbers(extracted);
    return a.every((n) => b.includes(n));
  }
  return norm(extracted).includes(norm(recordValue)) || norm(recordValue).includes(norm(extracted));
}

async function handleExtract(docId: string, role: Role) {
  const text = docText(docId, role);
  if (!text) return json({ error: "unknown document" }, 404);
  const fixture = fixtureExtraction(docId, role);
  if (!metaEnabled()) {
    return json({
      engine: "local",
      docId,
      fields: fixture.map((f) => ({ ...f, status: "match" as ExtractStatus })),
      note: "Offline demo mode: showing the verified fixture extraction. Set NANOGPT_API_KEY (or MODEL_API_KEY) to re-extract with Muse Spark.",
    });
  }
  try {
    const labels = [...new Set(fixture.map((f) => f.label))];
    const raw = await chatCompletion([
      {
        role: "system",
        content:
          "Extract structured fields from the construction document below. Reply with ONLY a JSON array of objects: {\"label\": string, \"value\": string, \"line\": number}. " +
          "Each value must appear verbatim in the cited line; keep the full phrase. Extract money figures, percentages, dates, names, and quantities. Skip redacted lines. " +
          (labels.length ? `Use exactly these labels for the fields they describe: ${labels.join(", ")}. Other fields may use your own short labels. ` : "") +
          "No other text.",
      },
      { role: "user", content: text },
    ]);
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error("model reply is not a JSON array");
    const lines = text.split("\n").map((l) => l.replace(/^\d+\. /, ""));
    const fields = parsed
      .filter(
        (f): f is { label: string; value: string; line: number } =>
          f && typeof f.label === "string" && typeof f.value === "string" && f.value.trim() !== "" && Number.isInteger(f.line) && f.line >= 1 && f.line <= lines.length,
      )
      .map((f) => {
        // Check 1: the value is really on the line the model cited.
        // Check 2: it agrees with the signed record's field for that line.
        const recordFields = fixture.filter((x) => x.label === f.label && x.line === f.line);
        const status: ExtractStatus = !norm(lines[f.line - 1]).includes(norm(f.value))
          ? "ungrounded"
          : recordFields.length === 0
            ? "extra"
            : recordFields.some((x) => agrees(x.value, f.value))
              ? "match"
              : "differs";
        return { label: f.label, value: f.value, line: f.line, status };
      });
    return json({
      engine: "meta",
      docId,
      fields,
      note: `Extracted live by ${modelLabel()}. Each value is checked against its cited line, then against the signed record.`,
    });
  } catch (err) {
    console.error(`extract ${docId} fell back to the fixture: ${err instanceof Error ? err.message : err}`);
    return json({
      engine: "local (meta failed)",
      docId,
      fields: fixture.map((f) => ({ ...f, status: "match" as ExtractStatus })),
      note: "Live extraction failed, so the verified fixture extraction is shown instead.",
    });
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  development: false,
  maxRequestBodySize: 16 * 1024,
  // Bun closes a connection idle for 10 s by default, which cuts off a
  // live Muse Spark call mid-reply. The model fetch itself times out at 45 s.
  idleTimeout: 60,
  async fetch(req) {
    const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "").toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) return json({ error: "host not allowed" }, 421);

    // Browsers send Origin on every cross-origin POST; refuse them so no
    // other site can tamper, reset, or spend model calls from a visitor's tab.
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      let sameOrigin = origin === null;
      if (origin) {
        try {
          sameOrigin = new URL(origin).host === req.headers.get("host");
        } catch {
          sameOrigin = false;
        }
      }
      if (!sameOrigin) return json({ error: "cross-origin request refused" }, 403);
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const get = req.method === "GET" || req.method === "HEAD";
    const post = req.method === "POST";

    if (path.startsWith("/api/")) {
      if (get && path === "/api/mode") return json({ ...metaConfig(), record: "synthetic demo data" });
      if (get && path === "/api/project") return json(projectView(state, roleOf(req)));
      if (get && path === "/api/verify") {
        const v = await verifyRecord(state);
        return json({ ...v, entries: await entriesWithStatus(state, roleOf(req)) });
      }
      if (get && path === "/api/docs") return json({ docs: docsForRole(roleOf(req)) });
      if (post && path === "/api/tamper") {
        const result = tamperRecord(state);
        if (!result) return json({ error: "already tampered; reset first" }, 400);
        return json({ tampered: true, ...result, verify: await verifyRecord(state) });
      }
      if (post && path === "/api/reset") {
        await resetRecord(state);
        return json({ reset: true, verify: await verifyRecord(state) });
      }
      if (post && path === "/api/ask") {
        const body = await readBody(req);
        const question = String(body.question ?? "").slice(0, 500);
        if (!question.trim()) return json({ error: "question is required" }, 400);
        const role = roleOf(req, body);
        return json(await ask(question, state.entries, role));
      }
      if (post && path.startsWith("/api/extract/")) {
        return handleExtract(path.slice("/api/extract/".length), roleOf(req));
      }
      return json({ error: "not found" }, 404);
    }

    const asset = get ? STATIC[path] : undefined;
    if (asset) {
      return new Response(Bun.file(`${PUBLIC_DIR}/${asset.file}`), {
        headers: { ...SECURITY_HEADERS, "Content-Type": asset.type },
      });
    }
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  },
  error(err) {
    console.error(err);
    return json({ error: "internal error" }, 500);
  },
});

console.log(`Verified Project Record demo on http://${HOST}:${server.port} (mode: ${metaEnabled() ? `live, ${modelLabel()}` : "local"})`);
