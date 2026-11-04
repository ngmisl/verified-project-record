// Muse Spark client. Two OpenAI-compatible Chat Completions providers
// serve the same Meta model:
//   nanogpt  https://nano-gpt.com/api/v1  model meta/muse-spark-1.3  key NANOGPT_API_KEY
//   meta     https://api.meta.ai/v1       model muse-spark-1.3       key MODEL_API_KEY
// MODEL_PROVIDER picks one explicitly; otherwise the first provider
// whose key is set wins (nanogpt, then meta). MODEL_API_BASE and
// MODEL_API_MODEL override the chosen provider's defaults.
//
// No key in this repo, ever. With no key the server reports mode
// "local" and every AI feature runs on the deterministic offline
// engine. No request is ever sent without a key, and at most
// MODEL_CALL_LIMIT requests (default 100) are sent per boot, so an
// exposed server cannot run up an unbounded bill.

interface Provider {
  id: "nanogpt" | "meta";
  label: string;
  keyEnv: string;
  base: string;
  model: string;
  // Muse Spark always reasons; reasoning tokens count against
  // max_tokens. "low" keeps answers fast without emptying the reply.
  extra: Record<string, unknown>;
}

const PROVIDERS: Provider[] = [
  {
    id: "nanogpt",
    label: "NanoGPT",
    keyEnv: "NANOGPT_API_KEY",
    base: "https://nano-gpt.com/api/v1",
    model: "meta/muse-spark-1.3",
    extra: { reasoning_effort: "low" },
  },
  {
    id: "meta",
    label: "Meta Model API",
    keyEnv: "MODEL_API_KEY",
    base: "https://api.meta.ai/v1",
    model: "muse-spark-1.3",
    extra: {},
  },
];

function pickProvider(): Provider | null {
  const wanted = process.env.MODEL_PROVIDER;
  if (wanted) {
    const p = PROVIDERS.find((x) => x.id === wanted);
    if (!p) throw new Error(`MODEL_PROVIDER must be one of ${PROVIDERS.map((x) => x.id).join(", ")}`);
    return process.env[p.keyEnv] ? p : null;
  }
  return PROVIDERS.find((p) => process.env[p.keyEnv]) ?? null;
}

const PROVIDER = pickProvider();
const BASE = (process.env.MODEL_API_BASE ?? PROVIDER?.base ?? "").replace(/\/$/, "");
const MODEL = process.env.MODEL_API_MODEL ?? PROVIDER?.model ?? "";
const CALL_LIMIT = Number(process.env.MODEL_CALL_LIMIT ?? 100);
// NaN or Infinity would silently remove the spend cap, so refuse to boot.
if (!Number.isSafeInteger(CALL_LIMIT) || CALL_LIMIT < 0) {
  throw new Error(`MODEL_CALL_LIMIT must be a whole number >= 0, got "${process.env.MODEL_CALL_LIMIT}"`);
}
let callsMade = 0;

export function metaEnabled(): boolean {
  return PROVIDER !== null;
}

export function metaConfig() {
  return {
    enabled: metaEnabled(),
    provider: PROVIDER?.label ?? null,
    model: PROVIDER ? MODEL : null,
    callsLeft: PROVIDER ? Math.max(0, CALL_LIMIT - callsMade) : 0,
  };
}

/** Human label for notes and logs, e.g. "meta/muse-spark-1.3 via NanoGPT". */
export function modelLabel(): string {
  return PROVIDER ? `${MODEL} via ${PROVIDER.label}` : "offline engine";
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function chatCompletion(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  if (!PROVIDER) throw new Error("no model API key is set");
  if (callsMade >= CALL_LIMIT) throw new Error(`model call budget of ${CALL_LIMIT} per boot is spent`);
  callsMade++;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env[PROVIDER.keyEnv]}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts?.temperature ?? 0,
      max_tokens: opts?.maxTokens ?? 3000,
      ...PROVIDER.extra,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    // The upstream body stays in the server log; callers only ever
    // see the status, so nothing the provider echoes reaches a browser.
    const text = await res.text().catch(() => "");
    console.error(`model API ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`model API returned HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | { text?: string }[] | null } }[];
  };
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p.text ?? "").join("") : "";
  // A reasoning model that runs out of tokens returns an empty reply
  // with finish_reason "length". Empty is a failure, never an answer.
  if (!text.trim()) throw new Error(`model returned no text (finish_reason ${choice?.finish_reason ?? "unknown"})`);
  return text;
}
