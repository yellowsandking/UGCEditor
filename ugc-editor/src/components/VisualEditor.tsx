import type { UgcDocument, UgcNode } from "../dsl/types";

interface Props {
  doc: UgcDocument;
  onChange: (next: UgcDocument) => void;
}

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}_${idSeq}`;
}

export function VisualEditor({ doc, onChange }: Props) {
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
    onChange({ ...doc, nodes: [...doc.nodes, node] });
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
