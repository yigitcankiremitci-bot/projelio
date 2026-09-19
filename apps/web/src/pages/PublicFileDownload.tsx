import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PublicFileAccess, PublicFileItem, PublicFileView } from "@projelio/shared";
import { fileDownloadLinksApi } from "../api/fileDownloadLinks";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { IconDownload, IconFile } from "../components/icons";

/**
 * İndirme bağlantısının açtığı sayfa — ÜYELİK GEREKTİRMEZ.
 *
 * Buraya gelen kişinin Projelio hesabı yok: uygulama kabuğu (kenar çubuğu,
 * bildirim çanı, Lio) hiç kurulmaz. App.tsx'teki `isAuthScreen` listesinde
 * olmasının sebebi bu — proje takip sayfasıyla (PublicProject) aynı desen.
 *
 * NE GÖSTERİLECEĞİNE SUNUCU KARAR VERİR: dosyanın işi, projesi, klasörü ve
 * yükleyeni buraya HİÇ gelmez. Yanıtta yalnızca dosyanın adı, türü, boyutu ve
 * paylaşanın adı var.
 *
 * TANITIM NEDEN BURADA: bu sayfa çoğu ziyaretçinin Projelio'yu ilk gördüğü yer
 * — müşteri, muhasebeci, tedarikçi. Reklam olarak değil, "bu dosya nereden
 * geldi" sorusunun cevabı olarak duruyor; indirme düğmesinin ALTINDA, onu
 * geciktirmeden.
 */
export default function PublicFileDownload() {
  const { token } = useParams();
  const c = useThemeColors();
  const t = useT();
  const [view, setView] = useState<PublicFileView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gate" | "gone" | "error">("loading");
  const [email, setEmail] = useState("");
  const [rejected, setRejected] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const uygula = (res: PublicFileAccess) => {
    if (res.state === "open" && res.view) {
      setView(res.view);
      setState("ready");
      const sayi = res.view.files?.length ?? 1;
      document.title = sayi > 1 ? `${t("{sayi} dosya", { sayi })} · Projelio` : `${res.view.name} · Projelio`;
      return;
    }
    if (res.state === "email_required") {
      setRejected(res.emailRejected === true);
      setState("gate");
      return;
    }
    // "closed": kaldırılmış, süresi dolmuş ya da hiç var olmamış bağlantı.
    // Sunucu üçünü ayırmıyor, sayfa da ayırmaz.
    setState("gone");
  };

  useEffect(() => {
    if (!token) {
      setState("gone");
      return;
    }
    // Kapıyı bir kez geçen ziyaretçi sekmeyi yenilediğinde adresi yeniden
    // yazmasın. sessionStorage bilerek: sekme kapanınca siliniyor, ortak
    // kullanılan bir bilgisayarda kalmıyor (bkz. PublicProject).
    const kayitli = sessionStorage.getItem(kapiAnahtari(token));
    const istek = kayitli ? fileDownloadLinksApi.unlock(token, kayitli) : fileDownloadLinksApi.open(token);
    istek.then(uygula).catch(() => setState("error"));
  }, [token]);

  const kapiyiAc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email.trim()) return;
    setUnlocking(true);
    try {
      const res = await fileDownloadLinksApi.unlock(token, email.trim());
      if (res.state === "open") sessionStorage.setItem(kapiAnahtari(token), email.trim());
      uygula(res);
    } catch {
      setState("error");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: c.background,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        gap: 18,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 16,
          padding: 24,
        }}
      >
        {state === "loading" && <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>}

        {state === "error" && (
          <p style={{ margin: 0, color: c.textSecondary }}>
            {t("Bağlantı şu anda açılamadı. Birkaç dakika sonra tekrar deneyin.")}
          </p>
        )}

        {state === "gone" && (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: 20, color: c.textPrimary }}>{t("Bu bağlantı artık geçerli değil")}</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: c.textSecondary }}>
              {t("Bağlantı kaldırılmış ya da süresi dolmuş olabilir. Dosyayı paylaşan kişiden yeni bir bağlantı isteyin.")}
            </p>
          </>
        )}

        {state === "gate" && (
          <form onSubmit={kapiyiAc}>
            <h1 style={{ margin: "0 0 8px", fontSize: 20, color: c.textPrimary }}>{t("E-posta adresinizi girin")}</h1>
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, color: c.textSecondary }}>
              {t("Bu dosya belirli bir adres için paylaşıldı. Dosyayı görmek için o adresi yazın.")}
            </p>
            <input
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("ornek@firma.com")}
              style={{ width: "100%", fontSize: 15, padding: "10px 12px", marginBottom: 10 }}
            />
            {rejected && (
              <p style={{ margin: "0 0 10px", fontSize: 13, color: c.danger }}>
                {t("Bu adres bağlantıyla eşleşmedi. Dosyayı paylaşan kişinin yazdığı adresi deneyin.")}
              </p>
            )}
            <button
              type="submit"
              disabled={unlocking || !email.trim()}
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 10,
                border: "none",
                background: c.accent,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: unlocking ? "wait" : "pointer",
              }}
            >
              {t("Dosyayı aç")}
            </button>
          </form>
        )}

        {state === "ready" && view && ((view.files?.length ?? 1) > 1 ? <PaketKarti view={view} /> : <DosyaKarti view={view} />)}
      </div>

      {(state === "ready" || state === "gone") && <Tanitim />}
    </div>
  );
}

function DosyaKarti({ view }: { view: PublicFileView }) {
  const c = useThemeColors();
  const t = useT();
  const [onizlemeHatasi, setOnizlemeHatasi] = useState(false);

  const icerikUrl = fileDownloadLinksApi.contentUrl(view.contentToken);
  const indirmeUrl = fileDownloadLinksApi.contentUrl(view.contentToken, { download: true });

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${c.accent}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconFile size={22} color={c.accent} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              color: c.textPrimary,
              overflowWrap: "anywhere",
            }}
          >
            {view.name}
          </h1>
          <div style={{ fontSize: 13, color: c.textSecondary }}>
            {turEtiketi(t, view.kindLabel)}
            {view.sizeBytes !== undefined ? ` · ${boyut(view.sizeBytes)}` : ""}
            {view.sharedByName ? ` · ${t("{ad} paylaştı", { ad: view.sharedByName })}` : ""}
          </div>
        </div>
      </div>

      {/* Önizleme. Görsel ve PDF kendi sunucumuzdan gömülüyor; diğer türlerde
          sağlayıcının küçük resmi varsa kapak olarak gösteriliyor, yoksa hiç
          yer kaplamıyor — boş gri bir kutu, bilgi vermeyen gürültü olurdu. */}
      {view.canPreview && !onizlemeHatasi && (
        <div
          style={{
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
            background: c.background,
          }}
        >
          {view.mimeType.startsWith("image/") ? (
            <img
              src={icerikUrl}
              alt={view.name}
              onError={() => setOnizlemeHatasi(true)}
              style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain" }}
            />
          ) : (
            <iframe
              src={icerikUrl}
              title={view.name}
              style={{ display: "block", width: "100%", height: 460, border: "none" }}
            />
          )}
        </div>
      )}

      {!view.canPreview && view.hasThumbnail && !onizlemeHatasi && (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <img
            src={fileDownloadLinksApi.thumbnailUrl(view.contentToken)}
            alt={view.name}
            onError={() => setOnizlemeHatasi(true)}
            style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "contain" }}
          />
        </div>
      )}

      {view.downloadEnabled ? (
        <a
          href={indirmeUrl}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 16px",
            borderRadius: 10,
            background: c.accent,
            color: "#fff",
            textDecoration: "none",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          <IconDownload size={17} color="#fff" />
          {t("Dosyayı indir")}
        </a>
      ) : (
        <p
          style={{
            margin: 0,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            fontSize: 14,
            lineHeight: 1.6,
            color: c.textSecondary,
          }}
        >
          {t(
            "Bu dosya yalnızca görüntülenmek üzere paylaşıldı; indirme kapatılmış. Kopyasına ihtiyacınız varsa dosyayı paylaşan kişiye yazın."
          )}
        </p>
      )}
    </>
  );
}

/**
 * Çok dosyalı bağlantı (bkz. migration 121): dosyalar alt alta, her birinin
 * kendi indirme düğmesi.
 *
 * "HEPSİNİ İNDİR" YOK, bilerek: tarayıcılar tek tıkla art arda başlatılan
 * indirmelerin ilkinden sonrasını sessizce engelliyor — düğme çalışıyor
 * görünüp üç dosyadan birini indirirdi. Sunucuda zip üretmek ise dosyaların
 * tamamını buluttan çekip bellekte paketlemek demek.
 *
 * Önizleme satırın altında AÇILIR, hepsi birden değil: on PDF'lik bir paket
 * sayfayı on iframe'le açardı.
 */
function PaketKarti({ view }: { view: PublicFileView }) {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState<number | null>(null);
  const toplam = view.files.every((f) => f.sizeBytes !== undefined)
    ? view.files.reduce((s, f) => s + (f.sizeBytes ?? 0), 0)
    : undefined;

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: c.textPrimary }}>
          {view.sharedByName
            ? t("{ad} sizinle {sayi} dosya paylaştı", { ad: view.sharedByName, sayi: view.files.length })
            : t("Sizinle {sayi} dosya paylaşıldı", { sayi: view.files.length })}
        </h1>
        {toplam !== undefined && (
          <div style={{ fontSize: 13, color: c.textSecondary }}>{t("Toplam {boyut}", { boyut: boyut(toplam) })}</div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {view.files.map((dosya, i) => (
          <PaketSatiri
            key={dosya.contentToken}
            dosya={dosya}
            indirmeAcik={view.downloadEnabled}
            onizlemeAcik={acik === i}
            onOnizle={() => setAcik(acik === i ? null : i)}
          />
        ))}
      </div>

      {!view.downloadEnabled && (
        <p
          style={{
            margin: "14px 0 0",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            fontSize: 14,
            lineHeight: 1.6,
            color: c.textSecondary,
          }}
        >
          {t(
            "Bu dosyalar yalnızca görüntülenmek üzere paylaşıldı; indirme kapatılmış. Kopyasına ihtiyacınız varsa dosyaları paylaşan kişiye yazın."
          )}
        </p>
      )}
    </>
  );
}

function PaketSatiri({
  dosya,
  indirmeAcik,
  onizlemeAcik,
  onOnizle,
}: {
  dosya: PublicFileItem;
  indirmeAcik: boolean;
  onizlemeAcik: boolean;
  onOnizle: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [onizlemeHatasi, setOnizlemeHatasi] = useState(false);
  const icerikUrl = fileDownloadLinksApi.contentUrl(dosya.contentToken);
  const onizlenebilir = (dosya.canPreview || dosya.hasThumbnail) && !onizlemeHatasi;

  const dugme: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: `${c.accent}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconFile size={18} color={c.accent} />
        </div>
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary, overflowWrap: "anywhere" }}>{dosya.name}</div>
          <div style={{ fontSize: 12, color: c.textSecondary }}>
            {turEtiketi(t, dosya.kindLabel)}
            {dosya.sizeBytes !== undefined ? ` · ${boyut(dosya.sizeBytes)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {onizlenebilir && (
            <button
              type="button"
              onClick={onOnizle}
              style={{ ...dugme, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary }}
            >
              {onizlemeAcik ? t("Kapat") : t("Önizle")}
            </button>
          )}
          {indirmeAcik && (
            <a
              href={fileDownloadLinksApi.contentUrl(dosya.contentToken, { download: true })}
              style={{ ...dugme, border: "none", background: c.accent, color: "#fff" }}
            >
              <IconDownload size={14} color="#fff" />
              {t("İndir")}
            </a>
          )}
        </div>
      </div>

      {onizlemeAcik && onizlenebilir && (
        <div style={{ marginTop: 10, border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden", background: c.background }}>
          {!dosya.canPreview ? (
            <img
              src={fileDownloadLinksApi.thumbnailUrl(dosya.contentToken)}
              alt={dosya.name}
              onError={() => setOnizlemeHatasi(true)}
              style={{ display: "block", width: "100%", maxHeight: 320, objectFit: "contain" }}
            />
          ) : dosya.mimeType.startsWith("image/") ? (
            <img
              src={icerikUrl}
              alt={dosya.name}
              onError={() => setOnizlemeHatasi(true)}
              style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain" }}
            />
          ) : (
            <iframe src={icerikUrl} title={dosya.name} style={{ display: "block", width: "100%", height: 460, border: "none" }} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "Bu sayfa nedir?" — Projelio tanıtımı.
 *
 * Ziyaretçinin yaptığı işi (dosyayı indirmek) engellemiyor: karttan AYRI, onun
 * altında duruyor. Tek bir cümle + tek bir bağlantı; daha fazlası, birinin
 * gönderdiği dosyayı almaya gelen kişiye reklam göstermek olurdu.
 */
function Tanitim() {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ width: "100%", maxWidth: 560, textAlign: "center" }}>
      <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.6, color: c.textSecondary }}>
        {t("Bu dosya")} <strong style={{ color: c.textPrimary }}>Projelio</strong>{" "}
        {t("ile paylaşıldı — projelerinizi, görevlerinizi, dosyalarınızı ve bütçenizi tek yerde toplayan iş yönetim uygulaması.")}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
        {t("Dosyalarınızı ek olarak göndermek yerine, geri alabileceğiniz bağlantılarla paylaşın.")}{" "}
        <a href="https://projelio.app" target="_blank" rel="noopener noreferrer" style={{ color: c.accent }}>
          projelio.app
        </a>
      </p>
    </div>
  );
}

/**
 * Sunucunun ürettiği tür etiketi ("Belge", "E-Tablo") Türkçe gelir (bkz.
 * backend dosya-turu.ts). Alıcının dili TARAYICIDAN geldiği için çeviri
 * burada yapılıyor; sözlükte olmayan bir etiket Türkçesiyle kalır.
 *
 * Anahtarlar aşağıda AÇIKÇA yazılı: `t(view.kindLabel)` dil denetiminin
 * göremeyeceği bir anahtar olurdu ve sözlükteki karşılıklar "artık" sayılırdı.
 */
function turEtiketi(t: ReturnType<typeof useT>, etiket: string): string {
  const etiketler: Record<string, string> = {
    "Google Dokümanı": t("Google Dokümanı"),
    "Google E-Tablo": t("Google E-Tablo"),
    "Google Sunu": t("Google Sunu"),
    Görsel: t("Görsel"),
    PDF: t("PDF"),
    Video: t("Video"),
    Ses: t("Ses"),
    "E-Tablo": t("E-Tablo"),
    Sunu: t("Sunu"),
    Belge: t("Belge"),
    Arşiv: t("Arşiv"),
    Metin: t("Metin"),
    Dosya: t("Dosya"),
  };
  return etiketler[etiket] ?? etiket;
}

/** Kapıyı geçen adresin sekme ömrü boyunca saklandığı anahtar. */
function kapiAnahtari(token: string): string {
  return `projelio_dosya_kapi_${token}`;
}

function boyut(bytes: number): string {
  const birimler = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 B";
  const us = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), birimler.length - 1);
  const deger = bytes / 1024 ** us;
  return `${deger.toFixed(deger >= 10 || us === 0 ? 0 : 1)} ${birimler[us]}`;
}
