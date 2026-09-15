import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { faturalarApi, type FaturaKapsami, type LioGirisSonucu, type LioYardimiDurumu } from "../api/faturalar";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { IconInfo, IconSparkle, IconX } from "./icons";

interface Props {
  moduleKey: string;
  kapsam: FaturaKapsami;
  /** Kayıt hangi departmanın altına ve hangi defterе yazılacak. */
  departmentId?: string;
  /** Modüle yazma yetkisi yoksa anahtar salt okunur. */
  canWrite?: boolean;
  /** Lio bir kayıt açtığında listenin tazelenmesi için. */
  onIslendi: () => void;
}

const ACIKLAMA =
  "Lio yardımı açıkken modüle bıraktığın fatura ya da fişi Lio okur: tarihini, tutarını ve karşı tarafını " +
  "kendisi doldurur, belgeyi ayın klasörüne koyar ve kasaya gideri/geliri yazar. Her okuma AI kredisi harcar. " +
  "Kapalıyken hiçbir şey değişmez — kaydı elle girersin.";

/** Öneri balonu kişi başına bir kez kapatılıyor; modül modül tekrar çıkması bunaltıcı olurdu. */
const BALON_ANAHTARI = "projelio_lio_yardimi_balonu";

function okundu(bilgi: LioGirisSonucu, t: ReturnType<typeof useT>): string {
  const tutar = new Intl.NumberFormat("tr-TR", { style: "currency", currency: bilgi.fatura.currency }).format(
    bilgi.fatura.amount
  );
  const parcalar = [tutar, bilgi.fatura.counterpartyName, bilgi.fatura.issueDate].filter(Boolean).join(" · ");
  return bilgi.kasa.yazildi
    ? t("Okundu: {ozet} — kayıt ve kasa hareketi açıldı.", { ozet: parcalar })
    : t("Okundu: {ozet} — kayıt açıldı ama kasaya yazılamadı ({hata})", {
        ozet: parcalar,
        hata: bilgi.kasa.hata ?? "",
      });
}

/**
 * Modülün "Lio yardımı" anahtarı ve açıkken belge bırakma alanı.
 *
 * Anahtar MODÜLE ait (bkz. migration 113): aynı modüle belge bırakan herkesin
 * aynı davranışı görmesi gerekiyor. Kredi ise KİŞİYE ait — bu yüzden kutu
 * ikisini birlikte gösteriyor: kredisi bitmiş bir kullanıcı, ekibin açtığı
 * anahtarın neden kendisinde çalışmadığını buradan öğreniyor.
 */
export default function LioYardimiKutusu({ moduleKey, kapsam, departmentId, canWrite = true, onIslendi }: Props) {
  const c = useThemeColors();
  const t = useT();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [durum, setDurum] = useState<LioYardimiDurumu | null>(null);
  const [acikliyor, setAcikliyor] = useState(false);
  const [kredUyarisi, setKrediUyarisi] = useState(false);
  const [balonKapali, setBalonKapali] = useState(() => {
    try {
      return localStorage.getItem(BALON_ANAHTARI) === "1";
    } catch {
      // Gizli sekmede localStorage okunamıyor; balonun görünmesi bir şey bozmuyor.
      return false;
    }
  });
  const [calisiyor, setCalisiyor] = useState(false);
  const [uzerinde, setUzerinde] = useState(false);
  const [sonuc, setSonuc] = useState("");
  const [hata, setHata] = useState("");

  const yukle = useCallback(() => {
    faturalarApi
      .lioDurumu(moduleKey, kapsam)
      .then(setDurum)
      // Durum alınamazsa kutu hiç çizilmiyor: yanlış bir varsayımla "açık"
      // göstermek, kullanıcıyı belge bırakıp bekleterek yanıltırdı.
      .catch(() => setDurum(null));
  }, [moduleKey, kapsam.scope, kapsam.scopeId]);

  useEffect(yukle, [yukle]);

  if (!durum || !durum.okuyabilir) return null;

  const cevir = async () => {
    if (!durum.enabled && !durum.krediVar) {
      setKrediUyarisi(true);
      return;
    }
    setHata("");
    try {
      const cevap = await faturalarApi.lioAyarla(moduleKey, kapsam, !durum.enabled);
      setDurum({ ...durum, enabled: cevap.enabled });
      setKrediUyarisi(false);
    } catch (e: any) {
      setHata(e?.message ?? t("Ayar kaydedilemedi."));
    }
  };

  const balonuKapat = () => {
    setBalonKapali(true);
    try {
      localStorage.setItem(BALON_ANAHTARI, "1");
    } catch {
      // Tercih saklanamadıysa balon bir dahaki açılışta yine çıkar; zararsız.
    }
  };

  const birak = async (files: FileList | File[] | null) => {
    const secilen = Array.from(files ?? []);
    if (secilen.length === 0) return;
    setHata("");
    setSonuc("");
    setCalisiyor(true);
    try {
      for (const file of secilen) {
        const cevap = await faturalarApi.lioIleGir(kapsam, file, departmentId);
        setSonuc(okundu(cevap, t));
      }
    } catch (e: any) {
      setHata(e?.message ?? t("Belge okunamadı."));
    } finally {
      // Liste her iki yolda da tazeleniyor: üç belgenin ikincisi düşse bile
      // birincisi gerçekten kaydedilmiş oluyor ve ekranda görünmeliydi.
      onIslendi();
      // Okuma BAŞARISIZ OLSA DA kredi harcanmış olabilir (sağlayıcı isteği
      // işledi, yanıtı okunamadı): rozet her iki yolda da tazeleniyor, yoksa
      // kullanıcı bakiyesindeki düşüşü hiçbir yerde göremezdi.
      yukle();
      setCalisiyor(false);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${durum.enabled ? c.primary : c.border}`,
        borderRadius: 12,
        padding: 12,
        background: durum.enabled ? `${c.primary}0D` : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: canWrite ? "pointer" : "default" }}>
          <input type="checkbox" checked={durum.enabled} onChange={cevir} disabled={!canWrite} />
          <IconSparkle size={15} color={durum.enabled ? c.primary : c.textSecondary} />
          <span style={{ fontSize: 14, color: c.textPrimary }}>{t("Lio yardımı")}</span>
        </label>

        <button
          type="button"
          onClick={() => setAcikliyor((a) => !a)}
          aria-label={t("Lio yardımı nedir?")}
          title={t("Lio yardımı nedir?")}
          style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
        >
          <IconInfo size={15} color={c.textSecondary} />
        </button>

        <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary }}>
          {t("{n} kredi", { n: String(Math.floor(durum.bakiye)) })}
        </span>
      </div>

      {acikliyor && (
        <p style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.5, margin: "8px 0 0" }}>{t(ACIKLAMA)}</p>
      )}

      {/* Kredisi yokken anahtar açılmıyor; kullanıcı burada ne yapacağını görüyor. */}
      {kredUyarisi && !durum.krediVar && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: c.surface,
          }}
        >
          <p style={{ fontSize: 13, color: c.textPrimary, margin: 0 }}>
            {t("Lio yardımı için AI kredin yok. Her belge okumasında krediden düşülüyor.")}
          </p>
          <Link
            to="/settings/ai-credits"
            style={{
              display: "inline-block",
              marginTop: 8,
              padding: "7px 14px",
              borderRadius: 8,
              background: c.primary,
              color: c.onPrimary,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            {t("Kredi yükle")}
          </Link>
        </div>
      )}

      {/* Kredisi olan ama anahtarı kapalı bırakan kullanıcıya küçük bir öneri. */}
      {!durum.enabled && durum.krediVar && !balonKapali && canWrite && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: 9,
            background: `${c.accent}1A`,
            border: `1px solid ${c.accent}55`,
          }}
        >
          <span style={{ fontSize: 13, color: c.textPrimary, flex: 1, lineHeight: 1.45 }}>
            {t("Faturaları tek tek yazmak yerine Lio'ya bırakabilirsin: belgeyi sürükle, gerisini o doldursun.")}
          </span>
          <button
            type="button"
            onClick={balonuKapat}
            aria-label={t("Kapat")}
            style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 2 }}
          >
            <IconX size={13} color={c.textSecondary} />
          </button>
        </div>
      )}

      {durum.enabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setUzerinde(true);
          }}
          onDragLeave={() => setUzerinde(false)}
          onDrop={(e) => {
            e.preventDefault();
            setUzerinde(false);
            void birak(e.dataTransfer.files);
          }}
          onClick={() => dosyaRef.current?.click()}
          style={{
            marginTop: 10,
            padding: "16px 12px",
            borderRadius: 10,
            border: `1px dashed ${uzerinde ? c.primary : c.border}`,
            background: uzerinde ? `${c.primary}12` : "transparent",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div style={{ fontSize: 14, color: c.textPrimary }}>
            {calisiyor ? t("Lio okuyor…") : t("Faturayı buraya bırak, Lio işlesin")}
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 4 }}>
            {t("PDF ya da fotoğraf. Fişin fotoğrafını çekip de bırakabilirsin.")}
          </div>
        </div>
      )}

      <input
        ref={dosyaRef}
        type="file"
        accept="application/pdf,image/*"
        multiple
        hidden
        onChange={(e) => {
          void birak(e.target.files);
          // Aynı dosya ikinci kez seçilebilsin diye.
          e.target.value = "";
        }}
      />

      {sonuc && <p style={{ fontSize: 13, color: c.textSecondary, margin: "8px 0 0" }}>{sonuc}</p>}
      {hata && <p style={{ fontSize: 13, color: c.danger, margin: "8px 0 0" }}>{hata}</p>}
    </div>
  );
}
