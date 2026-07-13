import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getColorScheme } from "./lib/telegram";
import "./styles/glass.css";

document.documentElement.setAttribute("data-scheme", getColorScheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
