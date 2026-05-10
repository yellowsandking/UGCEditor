/** UGC DSL v1 — JSON document exchanged between LLM, validator, visual editor, compiler. */

export const DSL_VERSION = 1 as const;

export interface UgcMeta {
  title: string;
  description?: string;
}

export interface UgcCanvas {
  width: number;
  height: number;
  /** CSS color */
  background?: string;
}

export interface BaseNode {
  id: string;
  x: number;
  y: number;
  /** paint order */
  z?: number;
}

export interface TextNode extends BaseNode {
  type: "text";
  content: string;
  fontSize?: number;
  color?: string;
}

export interface RectNode extends BaseNode {
  type: "rect";
  width: number;
  height: number;
  fill?: string;
  radius?: number;
}

export interface ButtonNode extends BaseNode {
  type: "button";
  width: number;
  height: number;
  label: string;
  /** referenced by runtime when clicked */
  actionId: string;
}

export type UgcNode = TextNode | RectNode | ButtonNode;

export interface UgcDocument {
  version: typeof DSL_VERSION;
  meta: UgcMeta;
  canvas: UgcCanvas;
  nodes: UgcNode[];
}

export function emptyDocument(): UgcDocument {
  return {
    version: DSL_VERSION,
    meta: { title: "未命名场景" },
    canvas: { width: 640, height: 480, background: "#1a1d23" },
    nodes: [],
  };
}
