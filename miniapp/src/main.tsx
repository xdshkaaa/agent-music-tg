import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getColorScheme } from "./lib/telegram";
import "./styles/glass.css";

const storedScheme = typeof localStorage !== "undefined" ? localStorage.getItem("miniapp-scheme") : null;
document.documentElement.setAttribute(
  "data-scheme",
  storedScheme === "light" || storedScheme === "dark" ? storedScheme : getColorScheme(),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
