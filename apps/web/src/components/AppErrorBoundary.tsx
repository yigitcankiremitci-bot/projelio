import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { cevirmenSuAn } from "../lib/i18n";

/**
 * Uygulamanın hata sınırı — beyaz ekranı bitiren şey.
 *
 * NEDEN VAR: React'te render sırasında fırlatılan bir hata yakalanmazsa React
 * TÜM ağacı söker; ekranda bomboş beyaz bir sayfa kalır. Kullanıcının gördüğü
 * şey "verilerim gitmiş"tir, oysa tek bir bileşende `undefined.map` çalışmıştır.
 * `.catch(() => setX([]))` desenleri bunu yakalayamaz: onlar veri getirmedeki
 * hatayı yutar, render sırasındaki hatayı değil.
 *
 * SUSPENSE BUNU YAKALAMAZ: sayfalar lazy() ile bölünmüş durumda (bkz. App.tsx).
 * Yeni bir sürüm yayımlandığında eski sekmede açık kalan uygulama, artık var
 * olmayan bir parçayı istemeye çalışır ve import() reddeder. Suspense yalnızca
 * "yükleniyor" durumunu yönetir; bu reddi sadece bir hata sınırı yakalayabilir.
 * O yüzden aşağıda bu durum ayrıca tanınıp sayfa kendiliğinden yenileniyor.
 *
 * TEMA HOOK'U KULLANMIYOR: bu bileşen ThemeProvider'ın da ÜSTÜNDE duruyor ki
 * tema katmanının kendisi patlasa bile bir şey gösterebilsin. Bu yüzden renkler
 * elle yazılmış — paletle aynı değerler (packages/shared/src/theme.ts).
 */

interface Props {
  children: ReactNode;
  /** Sınırın kapsamı: kök ("uygulama") ya da tek bir sayfa. */
  scope?: "root" | "route";
}

interface State {
  error: Error | null;
}

/** Yeni sürüm yayımlandığında eski sekmenin isteyemediği parça. */
function isChunkLoadError(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    error.name === "ChunkLoadError" ||
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /Failed to fetch dynamically imported/i.test(text)
  );
}

const RELOAD_ISARETI = "projelio_chunk_reload";

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sunucu tarafında bir hata toplayıcı yok; en azından konsolda bileşen
    // yığını görünsün ki kullanıcı ekran görüntüsü gönderdiğinde iz sürülebilsin.
    console.error("Beklenmeyen hata:", error, info.componentStack);

    if (isChunkLoadError(error)) {
      // Yeni sürüm yayımlanmış: sayfayı bir kez yenilemek sorunu çözer.
      // "Bir kez": yenileme de hata verirse sonsuz döngüye girmemek için
      // işaret sessionStorage'da tutuluyor (sekme kapanınca temizlenir).
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOAD_ISARETI) === "1";
        if (!alreadyTried) sessionStorage.setItem(RELOAD_ISARETI, "1");
      } catch {
        // Gizli sekmede depolama kapalı olabilir; o hâlde yenilemeyi hiç deneme.
        alreadyTried = true;
      }
      if (!alreadyTried) window.location.reload();
    }
  }

  private yenile = (): void => {
    try {
      sessionStorage.removeItem(RELOAD_ISARETI);
    } catch {
      // önemsiz
    }
    window.location.reload();
  };

  render(): ReactNode {
    // Sınıf bileşeni: kanca çağıramaz (bkz. lib/i18n cevirmenSuAn).
    const t = cevirmenSuAn();
    const { error } = this.state;
    if (!error) return this.props.children;

    const guncellemeVar = isChunkLoadError(error);
    const rota = this.props.scope === "route";

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 32,
          minHeight: rota ? 320 : "100vh",
          textAlign: "center",
          color: "#3E4858",
          background: rota ? "transparent" : "#FAFAF8",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
          {guncellemeVar ? "🔄" : "⚠️"}
        </div>
        <h1 style={{ fontSize: 19, margin: 0, fontWeight: 600 }}>
          {guncellemeVar ? "Yeni sürüm yayımlandı" : "Beklenmeyen bir hata oluştu"}
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6B7280", maxWidth: 380, lineHeight: 1.6 }}>
          {guncellemeVar
            ? "Uygulamanın yeni bir sürümü var. Sayfayı yenileyerek devam edebilirsiniz."
            : rota
              ? "Bu bölüm açılamadı. Verileriniz güvende — başka bir sayfaya geçebilir veya yeniden deneyebilirsiniz."
              : "Verileriniz güvende. Sayfayı yenileyerek devam edebilirsiniz."}
        </p>
        <button
          type="button"
          onClick={this.yenile}
          style={{
            marginTop: 4,
            padding: "9px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
            background: "#C0813F",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          {t("Sayfayı yenile")}
        </button>
      </div>
    );
  }
}

export default AppErrorBoundary;
