import { DSL_VERSION, emptyDocument, type UgcDocument } from "../dsl/types";
import { validateDocument } from "../dsl/validator";

const SYSTEM = `你是 UGC 场景 DSL 生成器。只输出一个合法 JSON 对象，不要 markdown 围栏。
Schema 要点：
- version 固定为 ${DSL_VERSION}
- meta.title 字符串
- canvas: width, height, background(可选 CSS 色)
- nodes 数组，元素为下列之一：
  - { type:"text", id, x, y, z?, content, fontSize?, color? }
  - { type:"rect", id, x, y, z?, width, height, fill?, radius? }
  - { type:"button", id, x, y, z?, width, height, label, actionId }
id 与 actionId 须匹配 /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/。
坐标在 canvas 内。`;

export interface LlmOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

function mockFromPrompt(prompt: string): UgcDocument {
  const p = prompt.toLowerCase();
  const doc = emptyDocument();
  doc.meta.title = "LLM 草稿";
  doc.meta.description = prompt.slice(0, 200);

  if (p.includes("暗") || p.includes("dark") || p.includes("夜")) {
    doc.canvas.background = "#0d1117";
  }
  if (p.includes("蓝") || p.includes("blue")) {
    doc.canvas.background = "#0c1929";
  }

  doc.nodes = [
    {
      type: "rect",
      id: "bg_panel",
      x: 40,
      y: 40,
      z: 0,
      width: doc.canvas.width - 80,
      height: doc.canvas.height - 80,
      fill: "#252a33",
      radius: 12,
    },
    {
      type: "text",
      id: "title",
      x: 64,
      y: 64,
      z: 1,
      content: prompt.trim() ? `主题：${prompt.trim().slice(0, 80)}` : "在此输入创意描述",
      fontSize: 22,
      color: "#f0f3f8",
    },
    {
      type: "text",
      id: "hint",
      x: 64,
      y: 120,
      z: 1,
      content: "（离线模式：未配置 API Key 时使用启发式模板。）",
      fontSize: 14,
      color: "#9aa0a6",
    },
    {
      type: "button",
      id: "btn_play",
      x: 64,
      y: doc.canvas.height - 100,
      z: 2,
      width: 140,
      height: 44,
      label: "开始",
      actionId: "game_start",
    },
    {
      type: "button",
      id: "btn_share",
      x: 220,
      y: doc.canvas.height - 100,
      z: 2,
      width: 140,
      height: 44,
      label: "分享",
      actionId: "share",
    },
  ];

  return doc;
}

async function callOpenAiCompatible(
  prompt: string,
  opts: LlmOptions
): Promise<UgcDocument> {
  const base = opts.baseUrl ?? "https://api.openai.com/v1";
  const model = opts.model ?? "gpt-4o-mini";
  const key = opts.apiKey;
  if (!key) throw new Error("缺少 API Key");

  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回无内容");
  const parsed = JSON.parse(content) as unknown;
  const v = validateDocument(parsed);
  if (!v.ok) {
    throw new Error(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  }
  return parsed as UgcDocument;
}

/**
 * Prompt → DSL：优先调用兼容 OpenAI 的 Chat API；无 Key 时使用本地 mock。
 */
export async function generateDslFromPrompt(
  prompt: string,
  opts: LlmOptions = {}
): Promise<UgcDocument> {
  const envKey = import.meta.env.VITE_OPENAI_API_KEY;
  const key = opts.apiKey ?? envKey;
  if (!key) {
    return mockFromPrompt(prompt);
  }
  try {
    return await callOpenAiCompatible(prompt, { ...opts, apiKey: key });
  } catch {
    return mockFromPrompt(prompt);
  }
}

