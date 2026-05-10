import { DSL_VERSION, type UgcDocument } from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

const idPattern = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function validateNode(node: unknown, index: number, seenIds: Set<string>): ValidationIssue[] {
  const base = `nodes[${index}]`;
  const issues: ValidationIssue[] = [];
  if (!node || typeof node !== "object") {
    issues.push({ path: base, message: "节点必须是对象" });
    return issues;
  }
  const n = node as Record<string, unknown>;
  const id = n.id;
  if (typeof id !== "string" || !idPattern.test(id)) {
    issues.push({
      path: `${base}.id`,
      message: "id 须为非空字符串，建议字母开头，仅含字母数字与 _-",
    });
  } else if (seenIds.has(id)) {
    issues.push({ path: `${base}.id`, message: `重复的 id: ${id}` });
  } else {
    seenIds.add(id);
  }
  if (!isFiniteNumber(n.x)) issues.push({ path: `${base}.x`, message: "x 须为有限数字" });
  if (!isFiniteNumber(n.y)) issues.push({ path: `${base}.y`, message: "y 须为有限数字" });
  if (n.z !== undefined && !isFiniteNumber(n.z)) {
    issues.push({ path: `${base}.z`, message: "z 须为有限数字" });
  }

  const type = n.type;
  if (type === "text") {
    if (typeof n.content !== "string") issues.push({ path: `${base}.content`, message: "text 须含 content 字符串" });
    if (n.fontSize !== undefined && (!isFiniteNumber(n.fontSize) || n.fontSize <= 0)) {
      issues.push({ path: `${base}.fontSize`, message: "fontSize 须为正数" });
    }
  } else if (type === "rect") {
    if (!isFiniteNumber(n.width) || n.width <= 0) issues.push({ path: `${base}.width`, message: "width 须为正数" });
    if (!isFiniteNumber(n.height) || n.height <= 0) {
      issues.push({ path: `${base}.height`, message: "height 须为正数" });
    }
    if (n.radius !== undefined && (!isFiniteNumber(n.radius) || n.radius < 0)) {
      issues.push({ path: `${base}.radius`, message: "radius 须为非负数" });
    }
  } else if (type === "button") {
    if (!isFiniteNumber(n.width) || n.width <= 0) issues.push({ path: `${base}.width`, message: "width 须为正数" });
    if (!isFiniteNumber(n.height) || n.height <= 0) {
      issues.push({ path: `${base}.height`, message: "height 须为正数" });
    }
    if (typeof n.label !== "string" || !n.label.trim()) {
      issues.push({ path: `${base}.label`, message: "button 须含非空 label" });
    }
    if (typeof n.actionId !== "string" || !idPattern.test(n.actionId)) {
      issues.push({ path: `${base}.actionId`, message: "actionId 须为合法标识符" });
    }
  } else {
    issues.push({ path: `${base}.type`, message: `未知类型: ${String(type)}` });
  }
  return issues;
}

export function validateDocument(raw: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ path: "", message: "根须为 JSON 对象" }] };
  }
  const doc = raw as Record<string, unknown>;
  if (doc.version !== DSL_VERSION) {
    issues.push({
      path: "version",
      message: `version 须为 ${DSL_VERSION}`,
    });
  }
  const meta = doc.meta;
  if (!meta || typeof meta !== "object") {
    issues.push({ path: "meta", message: "须包含 meta 对象" });
  } else {
    const m = meta as Record<string, unknown>;
    if (typeof m.title !== "string" || !m.title.trim()) {
      issues.push({ path: "meta.title", message: "meta.title 须为非空字符串" });
    }
  }
  const canvas = doc.canvas;
  if (!canvas || typeof canvas !== "object") {
    issues.push({ path: "canvas", message: "须包含 canvas 对象" });
  } else {
    const c = canvas as Record<string, unknown>;
    if (!isFiniteNumber(c.width) || c.width <= 0) issues.push({ path: "canvas.width", message: "须为正数" });
    if (!isFiniteNumber(c.height) || c.height <= 0) issues.push({ path: "canvas.height", message: "须为正数" });
  }
  const nodes = doc.nodes;
  if (!Array.isArray(nodes)) {
    issues.push({ path: "nodes", message: "nodes 须为数组" });
  } else {
    const seen = new Set<string>();
    nodes.forEach((node, i) => {
      issues.push(...validateNode(node, i, seen));
    });
  }
  return { ok: issues.length === 0, issues };
}

export function parseJsonToDocument(text: string): { doc?: UgcDocument; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "JSON 解析失败" };
  }
  const v = validateDocument(parsed);
  if (!v.ok) {
    return { error: v.issues.map((i) => `${i.path}: ${i.message}`).join("\n") };
  }
  return { doc: parsed as UgcDocument };
}
