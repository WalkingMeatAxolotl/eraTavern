import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import s from "./ErrorBoundary.module.css";

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
      <div className={s.container}>
        <div className={s.title}>something went wrong</div>
        <div className={s.detail}>{this.state.error.message}</div>
        <button onClick={() => this.setState({ error: null })} className={s.retryBtn}>
          [retry]
        </button>
      </div>
    );
  }
}
