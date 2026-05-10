import { useMemo, useRef, useState } from "react";
import { compile } from "./compiler/compile";
import { emptyDocument, type UgcDocument } from "./dsl/types";
import { parseJsonToDocument, validateDocument } from "./dsl/validator";
import { generateDslFromPrompt } from "./llm/generate";
import { RuntimeStage } from "./runtime/RuntimeStage";
import { VisualEditor } from "./components/VisualEditor";

type StepStatus = "idle" | "ok" | "err";

function downloadJsonFile(filename: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [prompt, setPrompt] = useState("做一个深色背景的欢迎界面，带标题和两个按钮：开始、分享");
  const [doc, setDoc] = useState<UgcDocument>(() => emptyDocument());
  const [jsonText, setJsonText] = useState(() => JSON.stringify(emptyDocument(), null, 2));
  const [generating, setGenerating] = useState(false);
  const [llmNote, setLlmNote] = useState<string | null>(null);
  const dslSectionRef = useRef<HTMLElement>(null);

  const validation = useMemo(() => validateDocument(doc), [doc]);
  const compiled = useMemo(() => {
    if (!validation.ok) return null;
    try {
      return compile(doc);
    } catch {
      return null;
    }
  }, [doc, validation.ok]);

  const syncJsonFromDoc = (d: UgcDocument) => {
    setDoc(d);
    setJsonText(JSON.stringify(d, null, 2));
  };

  const applyJsonFromEditor = () => {
    const r = parseJsonToDocument(jsonText);
    if (r.error) {
      alert(r.error);
      return;
    }
    if (r.doc) setDoc(r.doc);
  };

  const runLlm = async () => {
    setGenerating(true);
    setLlmNote(null);
    try {
      const next = await generateDslFromPrompt(prompt);
      syncJsonFromDoc(next);
      const hasKey = Boolean(import.meta.env.VITE_OPENAI_API_KEY?.trim());
      setLlmNote(
        hasKey
          ? "已写入下方「② DSL（JSON）」文本框（云端失败时会用本地模板）。不会自动保存到磁盘，需要请点击「下载 JSON 文件」。"
          : "已写入下方「② DSL（JSON）」文本框（本地模板）。不会自动保存到磁盘，需要请点击「下载 JSON 文件」。"
      );
      queueMicrotask(() => dslSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLlmNote(`生成失败：${msg}`);
    } finally {
      setGenerating(false);
    }
  };

  const pipeline = [
    { name: "Prompt", status: prompt.trim() ? ("ok" as StepStatus) : ("idle" as StepStatus) },
    { name: "LLM → DSL", status: llmNote ? "ok" : ("idle" as StepStatus) },
    {
      name: "Validator",
      status: validation.ok ? ("ok" as StepStatus) : ("err" as StepStatus),
    },
    { name: "Visual Editor", status: "ok" as StepStatus },
    {
      name: "Compiler",
      status: compiled ? ("ok" as StepStatus) : ("err" as StepStatus),
    },
    {
      name: "Runtime",
      status: compiled ? ("ok" as StepStatus) : ("idle" as StepStatus),
    },
  ];

  return (
    <div className="app">
      <header className="header">
        <h1>UGC 编辑器</h1>
        <p className="subtitle">Prompt → LLM → DSL(JSON) → Validator → Visual Editor → Compiler → Runtime</p>
        <nav className="pipeline">
          {pipeline.map((s, i) => (
            <span key={s.name} className={`pipe-step status-${s.status}`}>
              {i > 0 ? <span className="pipe-arrow">↓</span> : null}
              {s.name}
            </span>
          ))}
        </nav>
      </header>

      <main className="grid">
        <section className="card">
          <h2>① Prompt & LLM</h2>
          <textarea
            className="prompt-area"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的界面或玩法…"
          />
          <button type="button" className="primary" disabled={generating} onClick={() => void runLlm()}>
            {generating ? "生成中…" : "生成 DSL"}
          </button>
          {llmNote ? <p className="hint">{llmNote}</p> : null}
          <p className="muted small">
            设置环境变量 <code>VITE_OPENAI_API_KEY</code> 后重启 dev server 可调用真实模型；否则使用启发式模板。
          </p>
          <p className="muted small">
            「生成 DSL」只更新页面里的 JSON，不会在项目目录里新建文件；要得到 <code>.json</code> 文件请见右侧「下载 JSON 文件」。
          </p>
        </section>

        <section className="card stretch" ref={dslSectionRef}>
          <h2>② DSL（JSON）</h2>
          <textarea
            className="json-area"
            spellCheck={false}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <div className="btn-row">
            <button type="button" onClick={() => applyJsonFromEditor()}>
              解析 JSON 到文档
            </button>
            <button type="button" onClick={() => setJsonText(JSON.stringify(doc, null, 2))}>
              从左侧文档格式化
            </button>
            <button type="button" onClick={() => downloadJsonFile("ugc-scene.json", doc)}>
              下载 JSON 文件
            </button>
          </div>
          <div className={`validation ${validation.ok ? "ok" : "err"}`}>
            <strong>校验：</strong>
            {validation.ok ? (
              "通过"
            ) : (
              <ul>
                {validation.issues.map((issue, i) => (
                  <li key={i}>
                    <code>{issue.path || "(root)"}</code> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card stretch">
          <h2>③ 可视化编辑</h2>
          <VisualEditor doc={doc} onChange={syncJsonFromDoc} />
        </section>

        <section className="card">
          <h2>④ 编译产物</h2>
          {compiled ? (
            <pre className="pre-out">{JSON.stringify(compiled, null, 2)}</pre>
          ) : (
            <p className="muted">校验通过后可查看扁平 RenderOp 列表。</p>
          )}
        </section>

        <section className="card">
          <h2>⑤ 运行时预览</h2>
          {compiled ? (
            <RuntimeStage program={compiled} scale={0.85} />
          ) : (
            <p className="muted">请先修复 DSL 校验错误。</p>
          )}
        </section>
      </main>
    </div>
  );
}
