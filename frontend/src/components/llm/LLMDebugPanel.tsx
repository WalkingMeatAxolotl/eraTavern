import { useState } from "react";
import { t } from "../../i18n/ui";
import clsx from "clsx";
import s from "./LLMDebugPanel.module.css";

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
  responseToolCalls?: unknown[] | null;
  error?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    [key: string]: unknown;
  };
}

interface Props {
  entries: LLMDebugEntry[];
  defaultExpanded?: boolean;
}

export default function LLMDebugPanel({ entries, defaultExpanded = false }: Props) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className={s.wrapper}>
      {/* Header */}
      <div onClick={() => setCollapsed((v) => !v)} className={s.header}>
        <span className={s.headerTitle}>LLM Debug Console ({entries.length})</span>
        <span className={s.headerArrow}>{collapsed ? "▸" : "▾"}</span>
      </div>

      {!collapsed && (
        <div className={s.body}>
          {entries.length === 0 && (
            <div className={s.emptyText}>{t("empty.debugLog")}</div>
          )}
          {entries.map((entry, idx) => {
            const isExpanded = expandedIdx === idx;
            const statusColor = entry.error ? "var(--danger)" : "var(--success)";
            const statusText = entry.error ? "ERROR" : "OK";

            return (
              <div key={idx} className={s.entry}>
                {/* Summary line */}
                <div onClick={() => setExpandedIdx(isExpanded ? null : idx)} className={s.summaryRow}>
                  <span className={s.timestamp}>{entry.timestamp || "--:--:--"}</span>
                  <span className={s.statusBadge} style={{ color: statusColor }}>[{statusText}]</span>
                  <span className={s.modelName}>{entry.model || "(unknown)"}</span>
                  {entry.presetName && (
                    <>
                      <span className={s.dash}>—</span>
                      <span className={s.presetName}>{entry.presetName}</span>
                    </>
                  )}
                  {entry.usage && (() => {
                    const cached = entry.usage.prompt_tokens_details?.cached_tokens;
                    const prompt = entry.usage.prompt_tokens ?? 0;
                    const total_in = cached ? prompt + cached : prompt;
                    return (
                      <span className={s.usage}>
                        {total_in}↑ {entry.usage.completion_tokens ?? "?"}↓
                        {cached ? ` (${cached} cached)` : ""}
                      </span>
                    );
                  })()}
                  <span className={s.expandArrow}>{isExpanded ? "▾" : "▸"}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={s.detail}>
                    {/* Request info */}
                    <div className={s.detailSection}>
                      <span className={s.detailLabel}>Request</span>
                      <span className={s.detailUrl}>{entry.baseUrl}</span>
                    </div>

                    {/* Parameters */}
                    {entry.parameters && Object.keys(entry.parameters).length > 0 && (
                      <div className={s.detailSection}>
                        <span className={s.paramLabel}>params: </span>
                        <span className={s.paramValue}>{JSON.stringify(entry.parameters)}</span>
                      </div>
                    )}

                    {/* Variables */}
                    {entry.variables && Object.keys(entry.variables).length > 0 && (
                      <div className={s.detailSection}>
                        <div className={s.detailLabelMb}>
                          Variables ({Object.keys(entry.variables).length})
                        </div>
                        <div className={s.varBox}>
                          {Object.entries(entry.variables).map(([k, v]) => (
                            <div key={k} className={s.varEntry}>
                              <span className={s.varKey}>{`{{${k}}}`}</span>
                              <span className={s.varEq}> = </span>
                              <span className={v ? undefined : s.varEmpty}>{v || "(empty)"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    <div className={s.detailSection}>
                      <div className={s.detailLabelMb}>
                        Messages ({entry.messages?.length ?? 0})
                      </div>
                      {(entry.messages || []).map((m, mi) => (
                        <div
                          key={mi}
                          className={clsx(
                            s.msgBlock,
                            m.role === "system" && s.msgBlockSystem,
                            m.role === "assistant" && s.msgBlockAssistant,
                            m.role !== "system" && m.role !== "assistant" && s.msgBlockUser,
                          )}
                        >
                          <div className={s.msgRole}>[{m.role}]</div>
                          <pre className={s.msgContent}>{m.content}</pre>
                        </div>
                      ))}
                    </div>

                    {/* Response */}
                    {(entry.responseText || entry.responseToolCalls) && (
                      <div className={s.detailSection}>
                        <div className={s.detailLabelMb}>Response</div>
                        {entry.responseText && <pre className={s.responseBlock}>{entry.responseText}</pre>}
                        {entry.responseToolCalls && Array.isArray(entry.responseToolCalls) && (
                          <pre className={s.responseBlock}>
                            {"Tool calls: " + entry.responseToolCalls.map((tc: Record<string, unknown>) => {
                              const fn = tc.function as Record<string, unknown> | undefined;
                              return fn?.name ?? "?";
                            }).join(", ")}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {entry.error && <div className={s.errorText}>Error: {entry.error}</div>}

                    {/* Usage */}
                    {entry.usage && (() => {
                      const cached = entry.usage.prompt_tokens_details?.cached_tokens;
                      const prompt = entry.usage.prompt_tokens ?? 0;
                      const total_in = cached ? prompt + cached : prompt;
                      return (
                        <div className={s.tokenLine}>
                          Tokens: {t("llm.tokenInput")} {total_in}{cached ? ` (${prompt} new + ${cached} cached)` : ""} | {t("llm.tokenOutput")} {entry.usage.completion_tokens ?? "?"}
                        </div>
                      );
                    })()}
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
