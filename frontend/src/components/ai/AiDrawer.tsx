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
import T from "../../theme";
import { t } from "../../i18n/ui";
import {
  streamAssistChat,
  confirmToolCall,
  deleteAssistSession,
} from "../../api/aiAssist";
import type { ToolCallInfo, ToolCallResult } from "../../api/aiAssist";
import ToolCallMessage from "./ToolCallMessage";
import type { ToolCallStatus } from "./ToolCallMessage";

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
}

// --- Styles ---

const drawerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  paddingTop: 40,
  backgroundColor: T.bg1,
  color: T.text,
  fontSize: "13px",
  boxSizing: "border-box",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  borderBottom: `1px solid ${T.border}`,
  flexShrink: 0,
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
};

const inputAreaStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  padding: "8px 12px",
  borderTop: `1px solid ${T.border}`,
  flexShrink: 0,
};

const msgBubble = (role: string): React.CSSProperties => ({
  marginBottom: "8px",
  padding: "6px 10px",
  borderRadius: "4px",
  fontSize: "12px",
  lineHeight: "1.5",
  backgroundColor: role === "user" ? T.bg3 : "transparent",
  borderLeft: role === "assistant" ? `2px solid ${T.accent}` : undefined,
  color: T.text,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
});

// --- Component ---

export default function AiDrawer({ onEntityChanged }: AiDrawerProps) {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
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
  const buildCallbacks = useCallback(() => {
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
    };
  }, [scrollToBottom, updateLastAssistant]);

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
      // Call backend to execute/reject the tool (with optional user-edited args)
      const resp = await confirmToolCall(sessionId, callId, approved, overrideArgs);

      // Update the tool call status + result in the existing message
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
      // Notify parent that an entity was created/updated (so manager can reload list)
      if (approved && resp.success) onEntityChanged?.();
      // User can now type feedback or "继续"
    },
    [sessionId, onEntityChanged],
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
    <div style={drawerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "13px" }}>{t("ai.drawerTitle")}</span>
        <button
          onClick={() => {
            abortRef.current?.abort();
            deleteAssistSession(sessionId);
            setSessionId(crypto.randomUUID());
            setMessages([]);
            setStreamingText("");
            setIsGenerating(false);
            setInputText("");
          }}
          title={t("ai.newSession")}
          style={{
            padding: "3px 10px",
            backgroundColor: T.bg2,
            color: T.textSub,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            cursor: "pointer",
            fontSize: "11px",
          }}
        >
          [+]
        </button>
      </div>

      {/* Messages */}
      <div style={messagesStyle}>

        {messages.map((msg, i) => (
          <div key={i}>
            {/* Role label — skip for empty assistant placeholders */}
            {(msg.content || msg.toolCalls?.length) && (
              <div style={{ fontSize: "10px", color: T.textDim, marginBottom: "2px" }}>
                {msg.role === "user" ? "You" : "AI"}
              </div>
            )}

            {/* Message content */}
            {msg.content && <div style={msgBubble(msg.role)}>{msg.content}</div>}

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

        {/* Streaming text */}
        {streamingText && (
          <div>
            <div style={{ fontSize: "10px", color: T.textDim, marginBottom: "2px" }}>AI</div>
            <div style={{ ...msgBubble("assistant"), color: T.text }}>
              {streamingText}
              <span style={{ color: T.accent, animation: "blink 1s infinite" }}>▌</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={inputAreaStyle}>
        <textarea
          ref={inputRef}
          style={{
            flex: 1,
            padding: "6px 8px",
            backgroundColor: T.bg2,
            color: T.text,
            border: `1px solid ${T.border}`,
            borderRadius: "3px",
            fontSize: "12px",
            fontFamily: T.fontMono,
            resize: "none",
            minHeight: "36px",
            maxHeight: "100px",
          }}
          placeholder={t("ai.inputPlaceholder")}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={hasPending}
        />
        {isGenerating ? (
          <button
            onClick={handleStop}
            style={{
              padding: "6px 12px",
              backgroundColor: T.bg2,
              color: T.danger,
              border: `1px solid ${T.danger}`,
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "12px",
              flexShrink: 0,
            }}
          >
            [{t("ai.stop")}]
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || hasPending}
            style={{
              padding: "6px 12px",
              backgroundColor: T.bg2,
              color: inputText.trim() ? T.accent : T.textDim,
              border: `1px solid ${inputText.trim() ? T.accent : T.border}`,
              borderRadius: "3px",
              cursor: inputText.trim() ? "pointer" : "default",
              fontSize: "12px",
              flexShrink: 0,
            }}
          >
            [{t("ai.send")}]
          </button>
        )}
      </div>
    </div>
  );
}

