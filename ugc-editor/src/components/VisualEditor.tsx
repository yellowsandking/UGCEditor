import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { UgcCanvas, UgcDocument, UgcNode } from "../dsl/types";

interface Props {
  doc: UgcDocument;
  onChange: (next: UgcDocument) => void;
}

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

function boundsOf(node: UgcNode, canvas: UgcCanvas): { x: number; y: number; w: number; h: number } {
  if (node.type === "rect" || node.type === "button") {
    return { x: node.x, y: node.y, w: node.width, h: node.height };
  }
  const fs = node.fontSize ?? 16;
  const lines = node.content.split("\n");
  const lineCount = Math.max(1, lines.length);
  const h = fs * 1.25 * lineCount;
  const maxChars = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.min(canvas.width - node.x, Math.max(48, maxChars * fs * 0.55));
  return { x: node.x, y: node.y, w, h };
}

function clampPos(node: UgcNode, x: number, y: number, canvas: UgcCanvas): { x: number; y: number } {
  const b = boundsOf({ ...node, x, y } as UgcNode, canvas);
  const nx = Math.max(0, Math.min(x, canvas.width - b.w));
  const ny = Math.max(0, Math.min(y, canvas.height - b.h));
  return { x: nx, y: ny };
}

function hitTestIndex(docX: number, docY: number, nodes: UgcNode[], canvas: UgcCanvas): number | null {
  const order = nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (a.n.z ?? 0) - (b.n.z ?? 0));
  for (let k = order.length - 1; k >= 0; k--) {
    const { n, i } = order[k];
    const b = boundsOf(n, canvas);
    if (docX >= b.x && docY >= b.y && docX <= b.x + b.w && docY <= b.y + b.h) {
      return i;
    }
  }
  return null;
}

interface DragState {
  index: number;
  originClientX: number;
  originClientY: number;
  originNodeX: number;
  originNodeY: number;
  pointerId: number;
}

function EditorCanvas({
  doc,
  onChange,
  selectedIndex,
  onSelectIndex,
}: {
  doc: UgcDocument;
  onChange: (next: UgcDocument) => void;
  selectedIndex: number | null;
  onSelectIndex: (i: number | null) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const [scale, setScale] = useState(1);
  const dragRef = useRef<DragState | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (!w) return;
      setScale(Math.min(1, w / doc.canvas.width));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc.canvas.width]);

  const moveNode = useCallback((index: number, x: number, y: number) => {
    const d = docRef.current;
    const node = d.nodes[index];
    if (!node) return;
    const { x: nx, y: ny } = clampPos(node, x, y, d.canvas);
    const nodes = d.nodes.slice();
    nodes[index] = { ...node, x: nx, y: ny };
    onChange({ ...d, nodes });
  }, [onChange]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = (e.clientX - drag.originClientX) / scale;
      const dy = (e.clientY - drag.originClientY) / scale;
      moveNode(drag.index, drag.originNodeX + dx, drag.originNodeY + dy);
    };
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      try {
        stageRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [moveNode, scale]);

  const layerStyle = useMemo(
    (): CSSProperties => ({
      position: "relative",
      width: doc.canvas.width * scale,
      height: doc.canvas.height * scale,
      background: doc.canvas.background ?? "#1a1d23",
      borderRadius: 8,
      overflow: "hidden",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
      touchAction: "none",
    }),
    [doc.canvas, scale]
  );

  const sortedForPaint = useMemo(
    () =>
      doc.nodes
        .map((n, i) => ({ n, i }))
        .sort((a, b) => (a.n.z ?? 0) - (b.n.z ?? 0)),
    [doc.nodes]
  );

  return (
    <div ref={containerRef} className="editor-canvas-wrap">
      <div
        ref={stageRef}
        className="editor-canvas-stage"
        style={layerStyle}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const docX = ((e.clientX - rect.left) / rect.width) * doc.canvas.width;
          const docY = ((e.clientY - rect.top) / rect.height) * doc.canvas.height;
          const hit = hitTestIndex(docX, docY, doc.nodes, doc.canvas);
          if (hit === null) {
            onSelectIndex(null);
            return;
          }
          onSelectIndex(hit);
          const node = doc.nodes[hit];
          dragRef.current = {
            index: hit,
            originClientX: e.clientX,
            originClientY: e.clientY,
            originNodeX: node.x,
            originNodeY: node.y,
            pointerId: e.pointerId,
          };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }}
      >
        {sortedForPaint.map(({ n: node, i }) => {
          const selected = selectedIndex === i;
          const common = {
            position: "absolute" as const,
            left: node.x * scale,
            top: node.y * scale,
            cursor: "grab" as const,
            outline: selected ? "2px solid var(--accent)" : undefined,
            outlineOffset: selected ? 1 : undefined,
            zIndex: (node.z ?? 0) + 1,
          };
          if (node.type === "rect") {
            return (
              <div
                key={node.id}
                title={node.id}
                style={{
                  ...common,
                  width: node.width * scale,
                  height: node.height * scale,
                  background: node.fill ?? "#3d4555",
                  borderRadius: (node.radius ?? 0) * scale,
                }}
              />
            );
          }
          if (node.type === "text") {
            const fs = (node.fontSize ?? 16) * scale;
            return (
              <div
                key={node.id}
                title={node.id}
                style={{
                  ...common,
                  color: node.color ?? "#e8eaed",
                  fontSize: fs,
                  lineHeight: 1.2,
                  whiteSpace: "pre-wrap",
                  maxWidth: (doc.canvas.width - node.x) * scale,
                  userSelect: "none",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {node.content}
              </div>
            );
          }
          return (
            <button
              key={node.id}
              type="button"
              title={node.id}
              className="editor-canvas-btn"
              style={{
                ...common,
                width: node.width * scale,
                height: node.height * scale,
                fontSize: Math.min(14, node.height * scale * 0.35),
              }}
            >
              {node.label}
            </button>
          );
        })}
      </div>
      <p className="muted small editor-canvas-hint">
        在画布上拖动节点调整位置；点击空白取消选中。下方表单可精确改坐标与属性。
      </p>
    </div>
  );
}

export function VisualEditor({ doc, onChange }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const updateCanvas = (patch: Partial<UgcDocument["canvas"]>) => {
    onChange({ ...doc, canvas: { ...doc.canvas, ...patch } });
  };

  const updateMeta = (patch: Partial<UgcDocument["meta"]>) => {
    onChange({ ...doc, meta: { ...doc.meta, ...patch } });
  };

  const replaceNode = (index: number, node: UgcNode) => {
    const nodes = doc.nodes.slice();
    nodes[index] = node;
    onChange({ ...doc, nodes });
  };

  const removeNode = (index: number) => {
    onChange({ ...doc, nodes: doc.nodes.filter((_, i) => i !== index) });
    setSelectedIndex((si) => {
      if (si === null) return null;
      if (si === index) return null;
      return si > index ? si - 1 : si;
    });
  };

  const addNode = (type: UgcNode["type"]) => {
    const base = { id: newId(type), x: 80, y: 80, z: doc.nodes.length };
    let node: UgcNode;
    if (type === "text") {
      node = { ...base, type: "text", content: "文本" };
    } else if (type === "rect") {
      node = { ...base, type: "rect", width: 120, height: 80 };
    } else {
      node = {
        ...base,
        type: "button",
        width: 120,
        height: 40,
        label: "按钮",
        actionId: "click_" + base.id,
      };
    }
    const newIndex = doc.nodes.length;
    onChange({ ...doc, nodes: [...doc.nodes, node] });
    setSelectedIndex(newIndex);
  };

  return (
    <div className="visual-editor">
      <section className="panel">
        <h3>元数据</h3>
        <label>
          标题
          <input
            value={doc.meta.title}
            onChange={(e) => updateMeta({ title: e.target.value })}
          />
        </label>
        <label>
          描述
          <textarea
            rows={2}
            value={doc.meta.description ?? ""}
            onChange={(e) => updateMeta({ description: e.target.value || undefined })}
          />
        </label>
      </section>
      <section className="panel">
        <h3>画布</h3>
        <div className="row">
          <label>
            W
            <input
              type="number"
              value={doc.canvas.width}
              onChange={(e) => updateCanvas({ width: Number(e.target.value) })}
            />
          </label>
          <label>
            H
            <input
              type="number"
              value={doc.canvas.height}
              onChange={(e) => updateCanvas({ height: Number(e.target.value) })}
            />
          </label>
          <label>
            背景
            <input
              type="text"
              value={doc.canvas.background ?? ""}
              placeholder="#hex"
              onChange={(e) => updateCanvas({ background: e.target.value || undefined })}
            />
          </label>
        </div>
        <h3 className="canvas-preview-title">画布预览（拖动）</h3>
        <EditorCanvas
          doc={doc}
          onChange={onChange}
          selectedIndex={selectedIndex}
          onSelectIndex={setSelectedIndex}
        />
      </section>
      <section className="panel">
        <div className="panel-head">
          <h3>节点</h3>
          <div className="btn-row">
            <button type="button" onClick={() => addNode("text")}>
              + 文本
            </button>
            <button type="button" onClick={() => addNode("rect")}>
              + 矩形
            </button>
            <button type="button" onClick={() => addNode("button")}>
              + 按钮
            </button>
          </div>
        </div>
        <ul className="node-list">
          {doc.nodes.map((node, i) => (
            <li key={node.id}>
              <NodeFields node={node} onChange={(n) => replaceNode(i, n)} onRemove={() => removeNode(i)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NodeFields({
  node,
  onChange,
  onRemove,
}: {
  node: UgcNode;
  onChange: (n: UgcNode) => void;
  onRemove: () => void;
}) {
  const common = (
    <>
      <label>
        id
        <input value={node.id} onChange={(e) => onChange({ ...node, id: e.target.value })} />
      </label>
      <label>
        x
        <input
          type="number"
          value={node.x}
          onChange={(e) => onChange({ ...node, x: Number(e.target.value) })}
        />
      </label>
      <label>
        y
        <input
          type="number"
          value={node.y}
          onChange={(e) => onChange({ ...node, y: Number(e.target.value) })}
        />
      </label>
      <label>
        z
        <input
          type="number"
          value={node.z ?? 0}
          onChange={(e) => onChange({ ...node, z: Number(e.target.value) })}
        />
      </label>
    </>
  );

  return (
    <fieldset className="node-fieldset">
      <legend>
        {node.type} · {node.id}
        <button type="button" className="link-danger" onClick={onRemove}>
          删除
        </button>
      </legend>
      <div className="row">{common}</div>
      {node.type === "text" && (
        <div className="col">
          <label>
            内容
            <textarea
              rows={2}
              value={node.content}
              onChange={(e) => onChange({ ...node, content: e.target.value })}
            />
          </label>
          <div className="row">
            <label>
              fontSize
              <input
                type="number"
                value={node.fontSize ?? 16}
                onChange={(e) =>
                  onChange({ ...node, fontSize: Number(e.target.value) })
                }
              />
            </label>
            <label>
              color
              <input
                type="text"
                value={node.color ?? ""}
                onChange={(e) => onChange({ ...node, color: e.target.value || undefined })}
              />
            </label>
          </div>
        </div>
      )}
      {node.type === "rect" && (
        <div className="row">
          <label>
            width
            <input
              type="number"
              value={node.width}
              onChange={(e) => onChange({ ...node, width: Number(e.target.value) })}
            />
          </label>
          <label>
            height
            <input
              type="number"
              value={node.height}
              onChange={(e) => onChange({ ...node, height: Number(e.target.value) })}
            />
          </label>
          <label>
            fill
            <input
              type="text"
              value={node.fill ?? ""}
              onChange={(e) => onChange({ ...node, fill: e.target.value || undefined })}
            />
          </label>
          <label>
            radius
            <input
              type="number"
              value={node.radius ?? 0}
              onChange={(e) =>
                onChange({ ...node, radius: Number(e.target.value) })
              }
            />
          </label>
        </div>
      )}
      {node.type === "button" && (
        <div className="col">
          <div className="row">
            <label>
              width
              <input
                type="number"
                value={node.width}
                onChange={(e) => onChange({ ...node, width: Number(e.target.value) })}
              />
            </label>
            <label>
              height
              <input
                type="number"
                value={node.height}
                onChange={(e) => onChange({ ...node, height: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            label
            <input
              value={node.label}
              onChange={(e) => onChange({ ...node, label: e.target.value })}
            />
          </label>
          <label>
            actionId
            <input
              value={node.actionId}
              onChange={(e) => onChange({ ...node, actionId: e.target.value })}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
