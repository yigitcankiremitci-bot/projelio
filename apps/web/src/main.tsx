import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { AppPrefsProvider } from "./lib/appPrefs";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppPrefsProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppPrefsProvider>
    </ThemeProvider>
  </React.StrictMode>
);
