import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// 初始化主题 - 在渲染之前执行，避免闪烁
const savedTheme = localStorage.getItem("applyradar.web.theme");
if (savedTheme) {
  document.documentElement.setAttribute("data-theme", savedTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.documentElement.setAttribute("data-theme", "dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
