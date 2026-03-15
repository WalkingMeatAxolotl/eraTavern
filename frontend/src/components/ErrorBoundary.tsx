import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import T from "../theme";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        height: "100vh", background: T.bg0, color: T.text, fontFamily: "monospace", padding: "40px",
      }}>
        <div style={{ color: T.danger, fontSize: "18px", marginBottom: "16px" }}>
          something went wrong
        </div>
        <div style={{
          background: T.bg2, border: `1px solid ${T.danger}`, borderRadius: "4px",
          padding: "16px", maxWidth: "600px", width: "100%", whiteSpace: "pre-wrap",
          fontSize: "13px", color: T.textSub, marginBottom: "20px", maxHeight: "300px", overflow: "auto",
        }}>
          {this.state.error.message}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            background: T.bg3, color: T.accent, border: `1px solid ${T.accentDim}`,
            padding: "8px 24px", borderRadius: "4px", cursor: "pointer", fontSize: "14px",
          }}
        >
          [retry]
        </button>
      </div>
    );
  }
}
