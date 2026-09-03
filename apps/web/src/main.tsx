import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { AppPrefsProvider } from "./lib/appPrefs";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./index.css";

// Hata sınırı EN DIŞTA: ThemeProvider ya da AppPrefsProvider'ın kendisi patlasa
// bile kullanıcı beyaz ekran yerine "yeniden dene" görebilsin.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary scope="root">
      <ThemeProvider>
        <AppPrefsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AppPrefsProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
