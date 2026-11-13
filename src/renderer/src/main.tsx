import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initPreferences } from "./preferences";
import "./styles.css";
import "./features.css";

// Preferences are read synchronously by the first render, so load them first.
void initPreferences().then(() =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);
