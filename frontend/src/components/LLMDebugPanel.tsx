import { useState } from "react";
import T from "../theme";

export interface LLMDebugEntry {
  timestamp: string;
  presetId: string;
  presetName: string;
  model: string;
  baseUrl: string;
  parameters: Record<string, unknown>;
  messages: { role: string; content: string }[];
  variables?: Record<string, string>;
  responseText?: string;
  error?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface Props {
  entries: LLMDebugEntry[];
  defaultExpanded?: boolean;
}

export default function LLMDebugPanel({ entries, defaultExpanded = false }: Props) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div
      style={{
        backgroundColor: T.bg0,
        border: `1px solid ${T.border}`,
        borderRadius: "4px",
        fontSize: "11px",
        fontFamily: T.fontMono,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 10px",
          backgroundColor: T.bg1,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ color: T.accent, fontWeight: "bold" }}>LLM Debug Console ({entries.length})</span>
        <span style={{ color: T.textDim }}>{collapsed ? "▸" : "▾"}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "4px 0" }}>
          {entries.length === 0 && (
            <div style={{ color: T.textDim, padding: "8px 10px" }}>暂无调用记录。执行 LLM 生成后会显示在这里。</div>
          )}
          {entries.map((entry, idx) => {
            const isExpanded = expandedIdx === idx;
            const statusColor = entry.error ? T.danger : T.success;
            const statusText = entry.error ? "ERROR" : "OK";

            return (
              <div key={idx} style={{ borderBottom: `1px solid ${T.border}` }}>
                {/* Summary line */}
                <div
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  style={{
                    display: "flex",
                    gap: "8px",
                    padding: "4px 10px",
                    cursor: "pointer",
                    color: T.textSub,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: T.textDim, minWidth: "60px", flexShrink: 0 }}>
                    {entry.timestamp || "--:--:--"}
                  </span>
                  <span style={{ color: statusColor, fontWeight: "bold", minWidth: "40px", flexShrink: 0 }}>
                    [{statusText}]
                  </span>
                  <span style={{ color: T.text, flexShrink: 0 }}>{entry.model || "(unknown)"}</span>
                  {entry.presetName && (
                    <>
                      <span style={{ color: T.textDim }}>—</span>
                      <span style={{ color: T.textSub }}>{entry.presetName}</span>
                    </>
                  )}
                  {entry.usage && (
                    <span style={{ color: T.accent, marginLeft: "auto", flexShrink: 0 }}>
                      {entry.usage.prompt_tokens ?? "?"}↑ {entry.usage.completion_tokens ?? "?"}↓
                    </span>
                  )}
                  <span style={{ color: T.accent, fontSize: "10px", flexShrink: 0 }}>{isExpanded ? "▾" : "▸"}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "6px 10px", backgroundColor: T.bg1 }}>
                    {/* Request info */}
                    <div style={{ marginBottom: "6px" }}>
                      <span style={{ color: T.accent }}>Request</span>
                      <span style={{ color: T.textDim, marginLeft: "8px" }}>{entry.baseUrl}</span>
                    </div>

                    {/* Parameters */}
                    {entry.parameters && Object.keys(entry.parameters).length > 0 && (
                      <div style={{ marginBottom: "6px" }}>
                        <span style={{ color: T.textDim }}>params: </span>
                        <span style={{ color: T.text }}>{JSON.stringify(entry.parameters)}</span>
                      </div>
                    )}

                    {/* Variables — only those referenced in prompt entries */}
                    {entry.variables && Object.keys(entry.variables).length > 0 && (
                      <div style={{ marginBottom: "6px" }}>
                        <div style={{ color: T.accent, marginBottom: "2px" }}>
                          Variables ({Object.keys(entry.variables).length})
                        </div>
                        <div style={{ padding: "4px 8px", backgroundColor: T.bg2, borderRadius: "2px" }}>
                          {Object.entries(entry.variables).map(([k, v]) => (
                            <div key={k} style={{ marginBottom: "2px" }}>
                              <span style={{ color: T.accent }}>{`{{${k}}}`}</span>
                              <span style={{ color: T.textDim }}> = </span>
                              <span style={{ color: v ? T.text : T.danger }}>{v || "(empty)"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    <div style={{ marginBottom: "6px" }}>
                      <div style={{ color: T.accent, marginBottom: "2px" }}>
                        Messages ({entry.messages?.length ?? 0})
                      </div>
                      {(entry.messages || []).map((m, mi) => (
                        <div
                          key={mi}
                          style={{
                            marginBottom: "4px",
                            padding: "4px 8px",
                            backgroundColor: T.bg2,
                            borderRadius: "2px",
                            borderLeft: `2px solid ${m.role === "system" ? T.accentDim : m.role === "assistant" ? T.success : T.accent}`,
                          }}
                        >
                          <div style={{ color: T.textDim, marginBottom: "2px" }}>[{m.role}]</div>
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              color: T.text,
                              fontSize: "11px",
                              maxHeight: "300px",
                              overflowY: "auto",
                            }}
                          >
                            {m.content}
                          </pre>
                        </div>
                      ))}
                    </div>

                    {/* Response */}
                    {entry.responseText && (
                      <div style={{ marginBottom: "6px" }}>
                        <div style={{ color: T.accent, marginBottom: "2px" }}>Response</div>
                        <pre
                          style={{
                            margin: 0,
                            padding: "4px 8px",
                            backgroundColor: T.bg2,
                            borderRadius: "2px",
                            borderLeft: `2px solid ${T.success}`,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            color: T.text,
                            fontSize: "11px",
                            maxHeight: "150px",
                            overflowY: "auto",
                          }}
                        >
                          {entry.responseText}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {entry.error && <div style={{ color: T.danger, marginBottom: "6px" }}>Error: {entry.error}</div>}

                    {/* Usage */}
                    {entry.usage && (
                      <div style={{ color: T.textDim }}>
                        Tokens: 输入 {entry.usage.prompt_tokens ?? "?"} | 输出 {entry.usage.completion_tokens ?? "?"} |
                        合计 {entry.usage.total_tokens ?? "?"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
