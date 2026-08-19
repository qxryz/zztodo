import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyPlatformToDocument } from "./platform";
import "./styles.css";

applyPlatformToDocument();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
