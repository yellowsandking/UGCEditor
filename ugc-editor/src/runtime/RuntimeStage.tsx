import { useCallback, useMemo, useState } from "react";
import type { CompiledProgram } from "../compiler/compile";

export interface RuntimeLogEntry {
  t: number;
  message: string;
}

interface Props {
  program: CompiledProgram;
  scale?: number;
}

export function RuntimeStage({ program, scale = 1 }: Props) {
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([]);

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => [...prev.slice(-50), { t: Date.now(), message }]);
  }, []);

  const onAction = useCallback(
    (actionId: string, label: string) => {
      pushLog(`action: ${actionId} (“${label}”)`);
    },
    [pushLog]
  );

  const { width, height, background } = program.canvas;

  const layerStyle = useMemo(
    () =>
      ({
        position: "relative" as const,
        width: width * scale,
        height: height * scale,
        background,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
      }),
    [width, height, background, scale]
  );

  return (
    <div className="runtime-wrap">
      <div className="runtime-stage" style={layerStyle}>
        {program.ops.map((op) => {
          if (op.kind === "rect") {
            return (
              <div
                key={op.id}
                title={op.id}
                style={{
                  position: "absolute",
                  left: op.x * scale,
                  top: op.y * scale,
                  width: op.width * scale,
                  height: op.height * scale,
                  background: op.fill,
                  borderRadius: op.radius * scale,
                  pointerEvents: "none",
                }}
              />
            );
          }
          if (op.kind === "text") {
            return (
              <div
                key={op.id}
                title={op.id}
                style={{
                  position: "absolute",
                  left: op.x * scale,
                  top: op.y * scale,
                  color: op.color,
                  fontSize: op.fontSize * scale,
                  lineHeight: 1.2,
                  whiteSpace: "pre-wrap",
                  maxWidth: width * scale - op.x * scale,
                  pointerEvents: "none",
                  fontFamily: "system-ui, sans-serif",
                }}
              >
                {op.content}
              </div>
            );
          }
          return (
            <button
              key={op.id}
              type="button"
              title={op.id}
              className="runtime-btn"
              style={{
                position: "absolute",
                left: op.x * scale,
                top: op.y * scale,
                width: op.width * scale,
                height: op.height * scale,
                fontSize: Math.min(14, op.height * scale * 0.35),
              }}
              onClick={() => onAction(op.actionId, op.label)}
            >
              {op.label}
            </button>
          );
        })}
      </div>
      <div className="runtime-log">
        <div className="runtime-log-title">运行时事件</div>
        {logs.length === 0 ? (
          <div className="muted">点击按钮触发 actionId</div>
        ) : (
          <ul>
            {logs.map((l, i) => (
              <li key={`${l.t}-${i}`}>
                <span className="log-time">{new Date(l.t).toLocaleTimeString()}</span> {l.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
