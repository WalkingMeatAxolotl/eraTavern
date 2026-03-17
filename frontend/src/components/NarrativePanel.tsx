import T from "../theme";
import { useEffect, useRef, useState, useCallback } from "react";

type LLMStatus = "idle" | "generating" | "done" | "error";

interface NarrativePanelProps {
  messages: string[];
  /** Raw output text for LLM (built from last action result) */
  llmRawOutput?: string;
  /** Whether the last action had triggerLLM: true */
  autoTriggerLLM?: boolean;
  /** Target character ID for the last action */
  targetId?: string;
  /** Preset ID override (from action def) */
  presetId?: string;
}

const LLM_BASE = "/api/llm";

export default function NarrativePanel({
  messages,
  llmRawOutput,
  autoTriggerLLM,
  targetId,
  presetId,
}: NarrativePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [llmText, setLlmText] = useState("");
  const [llmStatus, setLlmStatus] = useState<LLMStatus>("idle");
  const [llmError, setLlmError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const autoTriggeredRef = useRef(false);

  // Scroll to bottom on new messages or LLM text
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, llmText, llmStatus]);

  // Reset LLM state when messages change (new action executed)
  useEffect(() => {
    setLlmText("");
    setLlmStatus("idle");
    setLlmError("");
    autoTriggeredRef.current = false;
    abortRef.current?.abort();
  }, [messages]);

  const startGeneration = useCallback(async () => {
    if (!llmRawOutput) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLlmText("");
    setLlmStatus("generating");
    setLlmError("");

    try {
      const body: Record<string, unknown> = { rawOutput: llmRawOutput };
      if (targetId) body.targetId = targetId;
      if (presetId) body.presetId = presetId;

      const resp = await fetch(`${LLM_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Check for non-SSE error response
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        const data = await resp.json();
        setLlmError(data.message || data.error || "生成失败");
        setLlmStatus("error");
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        setLlmError("无法读取响应流");
        setLlmStatus("error");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

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
                setLlmText(accumulated);
              } else if (eventType === "llm_done") {
                accumulated = data.fullText || accumulated;
                setLlmText(accumulated);
                setLlmStatus("done");
                return;
              } else if (eventType === "llm_error") {
                setLlmError(data.detail || data.error || "生成失败");
                setLlmStatus("error");
                return;
              }
            } catch {
              // Ignore unparseable lines
            }
          }
        }
      }

      // Stream ended without llm_done — treat accumulated text as final
      if (accumulated) {
        setLlmStatus("done");
      } else {
        setLlmStatus("idle");
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      setLlmError(e instanceof Error ? e.message : "生成失败");
      setLlmStatus("error");
    }
  }, [llmRawOutput, targetId, presetId]);

  // Auto-trigger when autoTriggerLLM is set
  useEffect(() => {
    if (autoTriggerLLM && llmRawOutput && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      startGeneration();
    }
  }, [autoTriggerLLM, llmRawOutput, startGeneration]);

  const hasRawOutput = !!llmRawOutput;

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
      {/* Raw output messages */}
      {messages.length === 0 ? (
        <div style={{ color: T.textDim }}>暂无消息</div>
      ) : (
        messages.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: "2px", whiteSpace: "pre-wrap" }}>
            &gt; {msg}
          </div>
        ))
      )}

      {/* LLM section */}
      {hasRawOutput && llmStatus === "idle" && (
        <div style={{ textAlign: "center", marginTop: "8px" }}>
          <button
            onClick={startGeneration}
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

      {llmStatus === "generating" && (
        <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
          <div style={{ color: T.accent, fontSize: "11px", marginBottom: "4px" }}>
            [LLM 叙事]{!llmText && " 生成中..."}
          </div>
          {llmText && (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{llmText}</div>
          )}
        </div>
      )}

      {llmStatus === "done" && llmText && (
        <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
            <span style={{ color: T.accent, fontSize: "11px" }}>[LLM 叙事]</span>
            <button
              onClick={startGeneration}
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
          </div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: "1.6" }}>{llmText}</div>
        </div>
      )}

      {llmStatus === "error" && (
        <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "8px" }}>
          <div style={{ color: T.danger, fontSize: "12px", marginBottom: "4px" }}>
            {llmError || "LLM 生成失败"}
          </div>
          <button
            onClick={startGeneration}
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
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
