import { loadDotEnv } from "@/lib/util/env";

// Thin client for Alibaba Cloud Qwen via the DashScope OpenAI-compatible endpoint.
// Plain fetch keeps it dependency-light and fully under our control. All callers
// must handle failure gracefully — the engine is designed to run without the LLM.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class QwenError extends Error {}

function apiKey(): string | undefined {
  loadDotEnv();
  return process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || undefined;
}

export function qwenConfigured(): boolean {
  return Boolean(apiKey());
}

export function qwenModel(): string {
  loadDotEnv();
  return process.env.QWEN_MODEL || "qwen-plus";
}

function baseUrl(): string {
  loadDotEnv();
  return (
    process.env.QWEN_BASE_URL ||
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
  );
}

export interface QwenChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  json?: boolean;
}

export async function qwenChat(
  messages: ChatMessage[],
  opts: QwenChatOptions = {},
): Promise<string> {
  const key = apiKey();
  if (!key) throw new QwenError("No Qwen/DashScope API key configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: qwenModel(),
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 700,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new QwenError(`Qwen HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new QwenError("Qwen returned an empty completion.");
    return content;
  } catch (err) {
    if (err instanceof QwenError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new QwenError("Qwen request timed out.");
    }
    throw new QwenError(`Qwen request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Best-effort JSON parse from a model response, tolerating code fences / prose. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
