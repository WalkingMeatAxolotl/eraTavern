import T from "../theme";
import { useEffect, useRef, useState, useCallback } from "react";
import type { NarrativeEntry } from "../types/game";

type LLMStatus = "idle" | "generating" | "done" | "error";

interface NarrativePanelProps {
  entries: NarrativeEntry[];
}

const LLM_BASE = "/api/llm";

/** Per-entry LLM state, keyed by entry index */
interface LLMState {
  text: string;
  status: LLMStatus;
  error: string;
}

export default function NarrativePanel({ entries }: NarrativePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // LLM state per entry index
  const [llmStates, setLlmStates] = useState<Record<number, LLMState>>({});
  const abortRef = useRef<AbortController | null>(null);
  const autoTriggeredRef = useRef<Set<number>>(new Set());

  // Scroll to bottom on new entries or LLM text changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, llmStates]);

  const updateLLM = useCallback((idx: number, patch: Partial<LLMState>) => {
    setLlmStates((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] || { text: "", status: "idle", error: "" }), ...patch },
    }));
  }, []);

  const startGeneration = useCallback(async (idx: number) => {
    const entry = entries[idx];
    if (!entry?.llmRawOutput) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    updateLLM(idx, { text: "", status: "generating", error: "" });

    try {
      const body: Record<string, unknown> = { rawOutput: entry.llmRawOutput };
      if (entry.targetId) body.targetId = entry.targetId;
      if (entry.presetId) body.presetId = entry.presetId;

      const resp = await fetch(`${LLM_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await resp.json();
        updateLLM(idx, { error: data.message || data.error || "生成失败", status: "error" });
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        updateLLM(idx, { error: "无法读取响应流", status: "error" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr);
              if (eventType === "llm_chunk") {
                accumulated += data.text || "";
                updateLLM(idx, { text: accumulated });
              } else if (eventType === "llm_done") {
                accumulated = data.fullText || accumulated;
                updateLLM(idx, { text: accumulated, status: "done" });
                return;
              } else if (eventType === "llm_error") {
                updateLLM(idx, { error: data.detail || data.error || "生成失败", status: "error" });
                return;
              }
            } catch {
              // Ignore unparseable lines
            }
          }
        }
      }

      if (accumulated) {
        updateLLM(idx, { status: "done" });
      } else {
        updateLLM(idx, { status: "idle" });
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      updateLLM(idx, { error: e instanceof Error ? e.message : "生成失败", status: "error" });
    }
  }, [entries, updateLLM]);

  // Auto-trigger LLM for the latest entry
  useEffect(() => {
    if (entries.length === 0) return;
    const idx = entries.length - 1;
    const entry = entries[idx];
    if (entry.autoTriggerLLM && entry.llmRawOutput && !autoTriggeredRef.current.has(idx)) {
      autoTriggeredRef.current.add(idx);
      startGeneration(idx);
    }
  }, [entries, startGeneration]);

  // Clean up auto-triggered set when entries are cleared
  useEffect(() => {
    if (entries.length === 0) {
      autoTriggeredRef.current.clear();
      setLlmStates({});
    }
  }, [entries.length]);

  const lastIdx = entries.length - 1;

  return (
    <div
      style={{
        fontSize: "13px",
        color: T.text,
        backgroundColor: T.bg1,
        padding: "12px",
        borderRadius: "4px",
        flex: 1,
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      {entries.length === 0 ? (
        <div style={{ color: T.textDim }}>暂无消息</div>
      ) : (
        entries.map((entry, idx) => {
          const llm = llmStates[idx] || { text: "", status: "idle", error: "" };
          const hasRawOutput = !!entry.llmRawOutput;
          const isLatest = idx === lastIdx;

          return (
            <div key={idx} style={{ marginBottom: "12px" }}>
              {/* Raw output messages */}
              {entry.raw.map((msg, mi) => (
                <div key={mi} style={{ marginBottom: "2px", whiteSpace: "pre-wrap" }}>
                  &gt; {msg}
                </div>
              ))}

              {/* LLM section */}
              {hasRawOutput && llm.status === "idle" && isLatest && (
                <div style={{ textAlign: "center", marginTop: "8px" }}>
                  <button
                    onClick={() => startGeneration(idx)}
                    style={{
                      padding: "4px 16px",
                      backgroundColor: T.bg2,
                      color: T.accent,
                      border: `1px solid ${T.accentDim}`,
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px",
                    }}
                  >
                    [LLM 生成]
                  </button>
                </div>
              )}

              {llm.status === "generating" && (
                <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
                  <div style={{ color: T.accent, fontSize: "11px", marginBottom: "4px" }}>
                    [LLM 叙事]{!llm.text && " 生成中..."}
                  </div>
                  {llm.text && (
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{llm.text}</div>
                  )}
                </div>
              )}

              {llm.status === "done" && llm.text && (
                <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ color: T.accent, fontSize: "11px" }}>[LLM 叙事]</span>
                    {isLatest && (
                      <button
                        onClick={() => startGeneration(idx)}
                        style={{
                          padding: "2px 10px",
                          backgroundColor: T.bg2,
                          color: T.textSub,
                          border: `1px solid ${T.border}`,
                          borderRadius: "3px",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        [重新生成]
                      </button>
                    )}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{llm.text}</div>
                </div>
              )}

              {llm.status === "error" && (
                <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
                  <div style={{ color: T.danger, fontSize: "12px", marginBottom: "4px" }}>
                    {llm.error || "LLM 生成失败"}
                  </div>
                  {isLatest && (
                    <button
                      onClick={() => startGeneration(idx)}
                      style={{
                        padding: "2px 10px",
                        backgroundColor: T.bg2,
                        color: T.textSub,
                        border: `1px solid ${T.border}`,
                        borderRadius: "3px",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      [重试]
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      <div ref={bottomRef} />
    </div>
  );
}
