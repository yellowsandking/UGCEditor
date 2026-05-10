import type { UgcDocument, UgcNode } from "../dsl/types";

/** 编译产物：供运行时解释执行，不直接暴露原始 DSL 细节给渲染层。 */

export type RenderOp =
  | {
      kind: "rect";
      id: string;
      z: number;
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      radius: number;
    }
  | {
      kind: "text";
      id: string;
      z: number;
      x: number;
      y: number;
      content: string;
      fontSize: number;
      color: string;
    }
  | {
      kind: "button";
      id: string;
      z: number;
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
      actionId: string;
    };

export interface CompiledProgram {
  canvas: { width: number; height: number; background: string };
  /** 已按 z 排序 */
  ops: RenderOp[];
}

function nodeToOp(node: UgcNode): RenderOp {
  const z = node.z ?? 0;
  switch (node.type) {
    case "rect":
      return {
        kind: "rect",
        id: node.id,
        z,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        fill: node.fill ?? "#3d4451",
        radius: node.radius ?? 0,
      };
    case "text":
      return {
        kind: "text",
        id: node.id,
        z,
        x: node.x,
        y: node.y,
        content: node.content,
        fontSize: node.fontSize ?? 16,
        color: node.color ?? "#e8eaed",
      };
    case "button":
      return {
        kind: "button",
        id: node.id,
        z,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        label: node.label,
        actionId: node.actionId,
      };
  }
}

export function compile(doc: UgcDocument): CompiledProgram {
  const ops = doc.nodes.map(nodeToOp).sort((a, b) => a.z - b.z);
  return {
    canvas: {
      width: doc.canvas.width,
      height: doc.canvas.height,
      background: doc.canvas.background ?? "#1a1d23",
    },
    ops,
  };
}
