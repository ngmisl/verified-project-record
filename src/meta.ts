// Meta Model API client (Muse Spark). OpenAI-compatible Chat
// Completions surface, per the official docs at dev.meta.ai:
//   base URL https://api.meta.ai/v1
//   POST /v1/chat/completions
//   Authorization: Bearer $MODEL_API_KEY
//   model: muse-spark-1.3 (default, override with MODEL_API_MODEL)
//
// No key in this repo, ever. When MODEL_API_KEY is unset the server
// reports mode "local" and every AI feature runs on the deterministic
// offline engine instead. No request is ever sent without a key.

const BASE = (process.env.MODEL_API_BASE ?? "https://api.meta.ai/v1").replace(/\/$/, "");
const MODEL = process.env.MODEL_API_MODEL ?? "muse-spark-1.3";

export function metaEnabled(): boolean {
  return Boolean(process.env.MODEL_API_KEY);
}

export function metaConfig() {
  return { enabled: metaEnabled(), base: BASE, model: MODEL };
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export async function chatCompletion(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<string> {
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new Error("MODEL_API_KEY is not set");
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts?.temperature ?? 0,
      max_tokens: opts?.maxTokens ?? 400,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Model API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p) => p.text ?? "").join("");
  throw new Error("Unexpected Model API response shape");
}
