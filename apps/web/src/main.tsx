import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";
import { AppPrefsProvider } from "./lib/appPrefs";
import { I18nProvider } from "./lib/i18n";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import BaglantiSeridi from "./components/BaglantiSeridi";
import "./index.css";

// Hata sınırı EN DIŞTA: ThemeProvider ya da AppPrefsProvider'ın kendisi patlasa
// bile kullanıcı beyaz ekran yerine "yeniden dene" görebilsin.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary scope="root">
      <ThemeProvider>
        <AppPrefsProvider>
          <I18nProvider>
            <BrowserRouter>
              <App />
              {/* App'in dışında: giriş ekranı dahil her yüzeyde görünsün. */}
              <BaglantiSeridi />
            </BrowserRouter>
          </I18nProvider>
        </AppPrefsProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
