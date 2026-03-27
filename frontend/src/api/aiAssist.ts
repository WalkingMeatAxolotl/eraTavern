/**
 * AI Assist Agent — frontend API layer.
 *
 * Communicates with the backend Agent endpoints via SSE streaming.
 * Handles: chat messages, tool call confirmations, session cleanup.
 */

// --- Types ---

export interface AssistChatParams {
  sessionId: string;
  message: string;
  targetAddon?: string;
  planMode?: boolean;
}

export interface ToolCallInfo {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult extends ToolCallInfo {
  result: string;
  auto: boolean;
}

export interface AssistDebugEntry {
  source: string;
  loop: number;
  model: string;
  baseUrl: string;
  parameters: Record<string, unknown>;
  messageCount: number;
  messages: Record<string, unknown>[];
  usage?: Record<string, unknown>;
}

export interface PlanEntity {
  entityType: string;
  id: string;
  name: string;
  note?: string;
}

export interface PlanData {
  overview: string;
  entities: PlanEntity[];
}

export interface AssistCallbacks {
  onChunk: (text: string) => void;
  onToolCallPending: (tc: ToolCallInfo) => void;
  onToolCallResult: (tc: ToolCallResult) => void;
  onDone: (fullText: string) => void;
  onError: (msg: string) => void;
  onDebug?: (entry: AssistDebugEntry) => void;
  onUsage?: (usage: Record<string, unknown>) => void;
  onModeChange?: (mode: string) => void;
  onToolConfirmResult?: (data: { callId: string; result: string; approved: boolean }) => void;
  onLLMResponse?: (data: { loop: number; text: string; toolCalls: unknown[] | null }) => void;
  onPlanPending?: (plan: PlanData & { callId: string }) => void;
}

// --- SSE parser (shared between chat and confirm) ---

async function readSSEStream(
  resp: Response,
  callbacks: AssistCallbacks,
): Promise<void> {
  if (!resp.ok) {
    callbacks.onError(`HTTP ${resp.status}`);
    return;
  }
  const body = resp.body;
  if (!body) {
    callbacks.onError("No response body");
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete line in buffer

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case "llm_chunk":
              callbacks.onChunk(data.text ?? "");
              break;
            case "tool_call_pending":
              callbacks.onToolCallPending({
                callId: data.callId,
                name: data.name,
                arguments: data.arguments,
              });
              break;
            case "tool_call_result":
              callbacks.onToolCallResult({
                callId: data.callId,
                name: data.name,
                arguments: data.arguments,
                result: data.result,
                auto: data.auto ?? false,
              });
              break;
            case "llm_done":
              callbacks.onDone(data.fullText ?? "");
              break;
            case "llm_error":
              callbacks.onError(data.detail || data.error || "Unknown error");
              break;
            case "llm_debug":
              callbacks.onDebug?.(data);
              break;
            case "llm_usage":
              callbacks.onUsage?.(data);
              break;
            case "mode_change":
              callbacks.onModeChange?.(data.mode ?? "chat");
              break;
            case "llm_response":
              callbacks.onLLMResponse?.(data);
              break;
            case "tool_confirm_result":
              callbacks.onToolConfirmResult?.(data);
              break;
            case "plan_pending":
              callbacks.onPlanPending?.(data as PlanData);
              break;
          }
        } catch {
          // skip malformed JSON
        }
        currentEvent = "";
      }
    }
  }
}

// --- Public API ---

/**
 * Send a chat message to the AI Assist Agent.
 * Returns an AbortController to cancel the request.
 */
export function streamAssistChat(
  params: AssistChatParams,
  callbacks: AssistCallbacks,
): AbortController {
  const controller = new AbortController();

  fetch("/api/llm/assist-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then((resp) => readSSEStream(resp, callbacks))
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message || "Network error");
      }
    });

  return controller;
}

/**
 * Confirm or reject a pending tool call.
 *
 * In "executing" mode the backend returns an SSE stream (auto-continues the
 * agent loop).  In "chat" mode it returns JSON (existing behaviour).
 *
 * When `callbacks` is provided and the response is SSE, the stream is read
 * with the same parser used by `streamAssistChat`.  The returned
 * AbortController can cancel the stream.
 */
export function confirmToolCall(
  sessionId: string,
  callId: string,
  approved: boolean,
  overrideArgs?: Record<string, unknown>,
  callbacks?: AssistCallbacks,
): { promise: Promise<{ success: boolean; result?: string }>; abort: AbortController } {
  const controller = new AbortController();
  const body: Record<string, unknown> = { sessionId, callId, approved };
  if (overrideArgs) body.overrideArgs = overrideArgs;

  const promise = fetch("/api/llm/assist-confirm-tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (resp) => {
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("text/event-stream") && callbacks) {
      // Executing mode — backend returns SSE stream
      await readSSEStream(resp, callbacks);
      return { success: true };
    }
    // Chat mode — plain JSON response
    return resp.json();
  });

  return { promise, abort: controller };
}

/**
 * Delete an AI Assist session (called when drawer closes).
 */
export async function deleteAssistSession(sessionId: string): Promise<void> {
  try {
    await fetch(`/api/llm/assist-session/${sessionId}`, { method: "DELETE" });
  } catch {
    // Best-effort cleanup, ignore errors
  }
}
