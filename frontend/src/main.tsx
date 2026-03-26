import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/shared/ErrorBoundary";
import "./global.css";

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(
  import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app,
);
