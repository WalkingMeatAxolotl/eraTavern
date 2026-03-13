import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const style = document.createElement("style");
style.textContent = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0c0c0c; overflow: hidden; }

  /* Thin subtle scrollbar — brighter on hover */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: #2a2a2a;
    border-radius: 3px;
    transition: background 0.2s;
  }
  ::-webkit-scrollbar-thumb:hover { background: #484848; }
  ::-webkit-scrollbar-thumb:active { background: #585858; }

  /* Firefox */
  * { scrollbar-width: thin; scrollbar-color: #2a2a2a transparent; }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
