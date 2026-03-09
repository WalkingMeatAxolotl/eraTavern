import { useEffect, useRef } from "react";

interface NarrativePanelProps {
  messages: string[];
}

export default function NarrativePanel({ messages }: NarrativePanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      style={{
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ddd",
        backgroundColor: "#1a1a2e",
        padding: "12px",
        borderRadius: "4px",
        flex: 1,
        overflowY: "auto",
        minHeight: 0,
      }}
    >
      {messages.length === 0 ? (
        <div style={{ color: "#666" }}>暂无消息</div>
      ) : (
        messages.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: "2px", whiteSpace: "pre-wrap" }}>
            &gt; {msg}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
