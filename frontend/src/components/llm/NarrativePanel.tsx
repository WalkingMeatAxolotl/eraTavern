import { useEffect, useRef, useCallback } from "react";
import { t } from "../../i18n/ui";
import type { NarrativeEntry } from "../../types/game";
import type { LLMDebugEntry } from "./LLMDebugPanel";
import s from "./NarrativePanel.module.css";

/** Per-entry LLM state, keyed by entry index */
export interface LLMState {
  text: string;
  status: string;
  error: string;
}

interface NarrativePanelProps {
  entries: NarrativeEntry[];
  llmStates: Record<number, LLMState>;
  onLlmStatesChange: React.Dispatch<React.SetStateAction<Record<number, LLMState>>>;
  onDebugEntry?: (entry: LLMDebugEntry) => void;
}

const LLM_BASE = "/api/llm";

export default function NarrativePanel({ entries, llmStates, onLlmStatesChange, onDebugEntry }: NarrativePanelProps) {
  const setLlmStates = onLlmStatesChange;
  const bottomRef = useRef<HTMLDivElement>(null);
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

  const generatingIdxRef = useRef<number | null>(null);

  const startGeneration = useCallback(
    async (idx: number) => {
      const entry = entries[idx];
      if (!entry?.llmRawOutput) return;

      // Abort previous generation and finalize its state
      abortRef.current?.abort();
      if (generatingIdxRef.current !== null && generatingIdxRef.current !== idx) {
        const oldIdx = generatingIdxRef.current;
        setLlmStates((prev) => {
          const old = prev[oldIdx];
          if (old && old.status === "generating") {
            return { ...prev, [oldIdx]: { ...old, status: old.text ? "done" : "idle" } };
          }
          return prev;
        });
      }
      generatingIdxRef.current = idx;

      const controller = new AbortController();
      abortRef.current = controller;

      updateLLM(idx, { text: "", status: "generating", error: "" });

      try {
        const body: Record<string, unknown> = { rawOutput: entry.llmRawOutput };
        if (entry.targetId) body.targetId = entry.targetId;
        if (entry.presetId) body.presetId = entry.presetId;
        if (entry.actionId) body.actionId = entry.actionId;
        // Collect previous narrative texts for {{previousNarrative}} variable
        const previousNarratives: string[] = [];
        for (let i = 0; i < idx; i++) {
          const s = llmStates[i];
          if (s && s.status === "done" && s.text) {
            previousNarratives.push(s.text);
          }
        }
        if (previousNarratives.length > 0) body.previousNarratives = previousNarratives;

        const resp = await fetch(`${LLM_BASE}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const contentType = resp.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await resp.json();
          updateLLM(idx, { error: data.message || data.error || t("llm.generateFailed"), status: "error" });
          return;
        }

        const reader = resp.body?.getReader();
        if (!reader) {
          updateLLM(idx, { error: t("llm.cannotReadStream"), status: "error" });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let debugEntry: Partial<LLMDebugEntry> = {};
        let eventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                if (eventType === "llm_debug") {
                  debugEntry = {
                    timestamp: new Date().toLocaleTimeString(),
                    presetId: data.presetId || "",
                    presetName: data.presetName || "",
                    model: data.model || "",
                    baseUrl: data.baseUrl || "",
                    parameters: data.parameters || {},
                    messages: data.messages || [],
                    variables: data.variables || {},
                  };
                } else if (eventType === "llm_chunk") {
                  accumulated += data.text || "";
                  updateLLM(idx, { text: accumulated });
                } else if (eventType === "llm_done") {
                  accumulated = data.fullText || accumulated;
                  updateLLM(idx, { text: accumulated, status: "done" });
                  if (onDebugEntry) {
                    onDebugEntry({ ...debugEntry, responseText: accumulated, usage: data.usage } as LLMDebugEntry);
                  }
                  return;
                } else if (eventType === "llm_error") {
                  updateLLM(idx, { error: data.detail || data.error || t("llm.generateFailed"), status: "error" });
                  if (onDebugEntry) {
                    onDebugEntry({ ...debugEntry, error: data.detail || data.error || t("llm.generateFailed") } as LLMDebugEntry);
                  }
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
          if (onDebugEntry) {
            onDebugEntry({ ...debugEntry, responseText: accumulated } as LLMDebugEntry);
          }
        } else {
          updateLLM(idx, { status: "idle" });
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        updateLLM(idx, { error: e instanceof Error ? e.message : t("llm.generateFailed"), status: "error" });
      }
    },
    [entries, updateLLM],
  );

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
    <div className={s.wrapper}>
      {entries.length === 0 ? (
        <div className={s.emptyText}>{t("empty.messages")}</div>
      ) : (
        entries.map((entry, idx) => {
          const llm = llmStates[idx] || { text: "", status: "idle", error: "" };
          const hasRawOutput = !!entry.llmRawOutput;
          const isLatest = idx === lastIdx;

          return (
            <div key={idx} className={s.entryBlock}>
              {/* Raw output messages */}
              {entry.raw.map((msg, mi) => (
                <div key={mi} className={s.rawMsg}>
                  &gt; {msg}
                </div>
              ))}

              {/* LLM section */}
              {hasRawOutput && llm.status === "idle" && isLatest && (
                <div className={s.idleCenter}>
                  <button onClick={() => startGeneration(idx)} className={s.generateBtn}>
                    [{t("llm.btnGenerate")}]
                  </button>
                </div>
              )}

              {llm.status === "generating" && (
                <div className={s.llmSection}>
                  <div className={s.generatingHeader}>
                    <span className={s.pulseDot} />
                    [{t("llm.generating")}]
                  </div>
                  {llm.text && (
                    <div className={s.streamText}>
                      {llm.text}
                      <span className={s.cursor}>▌</span>
                    </div>
                  )}
                </div>
              )}

              {llm.status === "done" && llm.text && (
                <div className={s.llmSection}>
                  <div className={s.doneHeader}>
                    <span className={s.narrativeLabel}>[{t("llm.narrative")}]</span>
                    {isLatest && (
                      <button onClick={() => startGeneration(idx)} className={s.regenBtn}>
                        [{t("llm.btnRegenerate")}]
                      </button>
                    )}
                  </div>
                  <div className={s.doneText}>{llm.text}</div>
                </div>
              )}

              {llm.status === "error" && (
                <div className={s.llmSection}>
                  <div className={s.errorText}>
                    {llm.error || t("llm.generateError")}
                  </div>
                  {isLatest && (
                    <button onClick={() => startGeneration(idx)} className={s.regenBtn}>
                      [{t("llm.btnRetry")}]
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
