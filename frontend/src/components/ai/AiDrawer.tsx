/**
 * AiDrawer — right-side chat panel for AI Assist Agent.
 *
 * Renders a conversation with the AI, including:
 * - Context summary (what entity is being edited)
 * - User messages
 * - Assistant messages (streamed text + tool calls)
 * - Tool call results (auto-executed or user-confirmed)
 *
 * Manages a session lifecycle: created on mount, deleted on unmount.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { t } from "../../i18n/ui";
import {
  streamAssistChat,
  confirmToolCall,
  deleteAssistSession,
} from "../../api/aiAssist";
import type { AssistCallbacks, ToolCallInfo, ToolCallResult } from "../../api/aiAssist";
import ToolCallMessage from "./ToolCallMessage";
import type { ToolCallStatus } from "./ToolCallMessage";
import clsx from "clsx";
import s from "./AiDrawer.module.css";

// --- Types ---

interface ToolCallEntry {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEntry[];
}

export interface AiDrawerProps {
  onEntityChanged?: () => void;
  onDebugEntry?: (entry: Record<string, unknown>) => void;
}

// --- Think block helpers ---

/** Split text into thinking and visible parts based on <think> tags */
function splitThinkContent(text: string): { think: string; visible: string } {
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    const think = thinkMatch[1].trim();
    const visible = text.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    return { think, visible };
  }
  // Unclosed <think> tag (still streaming)
  const openMatch = text.match(/<think>([\s\S]*)/);
  if (openMatch) {
    return { think: openMatch[1].trim(), visible: "" };
  }
  return { think: "", visible: text };
}

function ThinkBlock({ content, defaultOpen }: { content: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;
  return (
    <div className={s.thinkBlock}>
      <button onClick={() => setOpen((v) => !v)} className={s.thinkToggle}>
        <span className={s.thinkArrow}>{open ? "▼" : "▶"}</span>
        {t("ai.thinkingBlock")}
      </button>
      {open && (
        <pre className={s.thinkContent}>{content}</pre>
      )}
    </div>
  );
}

// --- Component ---

export default function AiDrawer({ onEntityChanged, onDebugEntry }: AiDrawerProps) {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [agentMode, setAgentMode] = useState<"chat" | "executing">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      deleteAssistSession(sessionId);
    };
  }, [sessionId]);

  // Helper: update the last assistant message (or create one)
  const updateLastAssistant = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [...prev.slice(0, -1), updater(last)];
        }
        // Create a new assistant message
        return [...prev, updater({ role: "assistant", content: "" })];
      });
    },
    [],
  );

  // Build SSE callbacks. All events update the LAST assistant message in-place.
  const buildCallbacks = useCallback((): AssistCallbacks => {
    let accumulated = "";

    return {
      onChunk: (text: string) => {
        accumulated += text;
        setStreamingText(accumulated);
        scrollToBottom();
      },
      onToolCallPending: (tc: ToolCallInfo) => {
        const entry: ToolCallEntry = { ...tc, status: "pending" };
        updateLastAssistant((msg) => ({
          ...msg,
          toolCalls: [...(msg.toolCalls || []), entry],
        }));
        scrollToBottom();
      },
      onToolCallResult: (tc: ToolCallResult) => {
        // Try to update existing tool call (confirmed result), or append new one (auto)
        setMessages((prev) => {
          // Search all messages for this callId
          for (let i = prev.length - 1; i >= 0; i--) {
            const msg = prev[i];
            if (!msg.toolCalls) continue;
            const idx = msg.toolCalls.findIndex((t) => t.callId === tc.callId);
            if (idx >= 0) {
              // Update existing tool call with result
              const newCalls = [...msg.toolCalls];
              newCalls[idx] = {
                ...newCalls[idx],
                status: tc.auto ? "auto" : "confirmed",
                result: tc.result,
              };
              return [...prev.slice(0, i), { ...msg, toolCalls: newCalls }, ...prev.slice(i + 1)];
            }
          }
          // Not found — append to last assistant message as new auto result
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            const entry: ToolCallEntry = {
              callId: tc.callId,
              name: tc.name,
              arguments: tc.arguments,
              status: "auto",
              result: tc.result,
            };
            return [...prev.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls || []), entry] }];
          }
          return prev;
        });
        scrollToBottom();
      },
      onDone: (fullText: string) => {
        const text = fullText || accumulated;
        accumulated = "";
        // Finalize: move streaming text into the assistant message
        setStreamingText("");
        updateLastAssistant((msg) => ({ ...msg, content: text }));
        // Check if there are pending tool calls
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const hasPending = last?.toolCalls?.some((tc) => tc.status === "pending");
          if (!hasPending) setIsGenerating(false);
          return prev;
        });
        scrollToBottom();
      },
      onError: (msg: string) => {
        setIsGenerating(false);
        setStreamingText("");
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
        scrollToBottom();
      },
      onDebug: (entry: Record<string, unknown>) => {
        // Complete entry: request + response + usage all in one event
        onDebugEntry?.({ ...entry, timestamp: new Date().toLocaleTimeString() });
      },
      onModeChange: (mode: string) => {
        setAgentMode(mode as "chat" | "executing");
      },
      onToolConfirmResult: (data: { callId: string; result: string; approved: boolean }) => {
        // Update existing pending tool call with confirm result (from SSE stream)
        setMessages((prev) =>
          prev.map((msg) => {
            if (!msg.toolCalls) return msg;
            return {
              ...msg,
              toolCalls: msg.toolCalls.map((tc) =>
                tc.callId === data.callId
                  ? { ...tc, status: (data.approved ? "confirmed" : "rejected") as ToolCallStatus, result: data.result }
                  : tc,
              ),
            };
          }),
        );
        if (data.approved) onEntityChanged?.();
      },
    };
  }, [scrollToBottom, updateLastAssistant, onDebugEntry, onEntityChanged]);

  // Send a message
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isGenerating) return;

    setInputText("");
    setIsGenerating(true);
    setStreamingText("");

    // Add user message + empty assistant placeholder
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    scrollToBottom();

    abortRef.current = streamAssistChat(
      { sessionId, message: text },
      buildCallbacks(),
    );
  }, [inputText, isGenerating, sessionId, buildCallbacks, scrollToBottom]);

  // Confirm/reject a tool call
  const handleToolConfirm = useCallback(
    async (callId: string, approved: boolean, overrideArgs?: Record<string, unknown>) => {
      const callbacks = buildCallbacks();
      // After approved confirm, auto-continue — add assistant placeholder for SSE stream
      if (approved) {
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        setIsGenerating(true);
      }

      const { promise, abort } = confirmToolCall(sessionId, callId, approved, overrideArgs, callbacks);
      abortRef.current = abort;

      try {
        const resp = await promise;
        // If SSE mode, callbacks already handled everything (including tool status update).
        // If JSON mode, update manually:
        if (resp.result !== undefined) {
          setMessages((prev) =>
            prev.map((msg) => {
              if (!msg.toolCalls) return msg;
              return {
                ...msg,
                toolCalls: msg.toolCalls.map((tc) =>
                  tc.callId === callId
                    ? { ...tc, status: (approved ? "confirmed" : "rejected") as ToolCallStatus, result: resp.result }
                    : tc,
                ),
              };
            }),
          );
          if (approved && resp.success) onEntityChanged?.();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          callbacks.onError(err.message || "Network error");
        }
      }
    },
    [sessionId, onEntityChanged, buildCallbacks],
  );

  // Stop generation
  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsGenerating(false);
    if (streamingText) {
      setMessages((prev) => [...prev, { role: "assistant", content: streamingText }]);
      setStreamingText("");
    }
  }, [streamingText]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // --- Render ---

  const hasPending = messages.some((m) => m.toolCalls?.some((tc) => tc.status === "pending"));

  return (
    <div className={s.drawer}>
      {/* Header */}
      <div className={s.header}>
        <span className={s.headerTitle}>{t("ai.drawerTitle")}</span>
        <button
          onClick={() => {
            abortRef.current?.abort();
            deleteAssistSession(sessionId);
            setSessionId(crypto.randomUUID());
            setMessages([]);
            setStreamingText("");
            setIsGenerating(false);
            setInputText("");
            setAgentMode("chat");
          }}
          title={t("ai.newSession")}
          className={s.newSessionBtn}
        >
          [+]
        </button>
      </div>

      {/* Messages */}
      <div className={s.messages}>

        {/* Welcome hints when no messages */}
        {messages.length === 0 && !isGenerating && (
          <div className={s.welcome}>
            <div className={s.welcomeTitle}>{t("ai.welcomeTitle")}</div>
            {(["ai.example1", "ai.example2", "ai.example3", "ai.example4"] as const).map((key) => (
              <button
                key={key}
                className={s.welcomeExample}
                onClick={() => { setInputText(t(key)); inputRef.current?.focus(); }}
              >
                &ldquo;{t(key)}&rdquo;
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {/* Role label — skip for empty assistant placeholders */}
            {(msg.content || msg.toolCalls?.length) && (
              <div className={s.roleLabel}>
                {msg.role === "user" ? "You" : "AI"}
              </div>
            )}

            {/* Message content — separate think blocks from visible text */}
            {msg.content && (() => {
              if (msg.role === "assistant") {
                const { think, visible } = splitThinkContent(msg.content);
                return (
                  <>
                    {think && <ThinkBlock content={think} defaultOpen={false} />}
                    {visible && <div className={s.bubbleAssistant}>{visible}</div>}
                  </>
                );
              }
              return <div className={s.bubbleUser}>{msg.content}</div>;
            })()}

            {/* Tool calls */}
            {msg.toolCalls?.map((tc) => (
              <ToolCallMessage
                key={tc.callId}
                name={tc.name}
                arguments={tc.arguments}
                status={tc.status}
                result={tc.result}
                onConfirm={(overrideArgs) => handleToolConfirm(tc.callId, true, overrideArgs)}
                onReject={() => handleToolConfirm(tc.callId, false)}
                disabled={isGenerating && tc.status !== "pending"}
              />
            ))}

          </div>
        ))}

        {/* Thinking indicator — waiting for first token */}
        {isGenerating && !streamingText && (
          <div className={s.thinkingWrap}>
            <div className={s.roleLabel}>AI</div>
            <div className={s.thinkingRow}>
              <span className={s.pulseDot}>●</span>
              {t("ai.thinking")}
            </div>
          </div>
        )}

        {/* Streaming text */}
        {streamingText && (() => {
          const { think, visible } = splitThinkContent(streamingText);
          return (
            <div>
              <div className={s.roleLabel}>AI</div>
              {think && <ThinkBlock content={think} defaultOpen={true} />}
              <div className={s.bubbleAssistant}>
                {visible || (!think ? streamingText : "")}
                <span className={s.cursor}>▌</span>
              </div>
            </div>
          );
        })()}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className={s.inputArea}>
        <textarea
          ref={inputRef}
          className={s.inputTextarea}
          placeholder={agentMode === "executing" && isGenerating ? t("ai.executingHint") : t("ai.inputPlaceholder")}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={hasPending || (agentMode === "executing" && isGenerating)}
        />
        {isGenerating ? (
          <button onClick={handleStop} className={s.stopBtn}>
            [{t("ai.stop")}]
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || hasPending}
            className={clsx(s.sendBtn, inputText.trim() ? s.sendBtnActive : s.sendBtnDisabled)}
          >
            [{t("ai.send")}]
          </button>
        )}
      </div>
    </div>
  );
}
