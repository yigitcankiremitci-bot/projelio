import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { IndirimOzeti } from "../api/billing";
import IndirimKoduAlani from "./IndirimKoduAlani";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * PayTR Direkt API kart formu (açılır pencere).
 *
 * KART VERİSİ SUNUCUMUZA GİTMEZ. Sunucudan yalnızca gizli alanlar (imza, tutar,
 * sipariş no) alınır; kart alanları React state'ine bile girmeyen düz
 * input'lar ve form tarayıcıdan DOĞRUDAN PayTR'ye POST edilir. PayTR'nin
 * Direkt API kuralı da bu: "kart formu yalnızca PayTR'ye post edilir".
 * Müşteri 3D doğrulamasına gider, sonra Paketler ekranına döner.
 *
 * GİZLİ ALANLAR ÖDE'YE BASINCA ALINIR, pencere açılınca değil: her alış
 * sunucuda bir ödeme satırı açıyor; bakıp vazgeçen kullanıcı satır bırakmasın.
 *
 * ONAY KUTUSU ZORUNLU: PayTR'ye "müşteri tekrarlayan çekime açık onay verecek"
 * dendi. Sunucu da onaysız isteği reddediyor; kutu yalnızca arayüz tarafı.
 */
/**
 * Kart alanlarını PayTR'nin beklediği biçime getirir. Alanlar kontrolsüz
 * (state yok), bu yüzden değer DOM'da düzeltiliyor.
 *
 * NEDEN: tarayıcının kart otomatik doldurması yılı "2029", kart numarasını
 * "4242 4242 …" diye yazıyor. PayTR yılı İKİ hane istiyor; maxLength=2 çözüm
 * değil, tarayıcı "2029"u "20"ye keser ve yanlış yıl gider. 4 hane gelirse
 * son iki hane alınır.
 */
export function yilIkiHane(deger: string): string {
  const rakam = deger.replace(/\D/g, "");
  return rakam.length >= 4 ? rakam.slice(2, 4) : rakam.slice(0, 2);
}

function rakamlar(deger: string, enFazla: number): string {
  return deger.replace(/\D/g, "").slice(0, enFazla);
}

function duzelt(e: React.FormEvent<HTMLInputElement>, cevir: (d: string) => string) {
  const girdi = e.currentTarget;
  const yeni = cevir(girdi.value);
  if (yeni !== girdi.value) girdi.value = yeni;
}

export default function PayTRKartFormu({
  baslik,
  ozet,
  dugmeMetni,
  formuAl,
  indirimOnizle,
  onKapat,
}: {
  baslik: string;
  /** Ne ödendiği ve ne kadar — kullanıcı neye onay verdiğini görsün. */
  ozet: string;
  dugmeMetni: string;
  formuAl: (onay: boolean, indirimKodu?: string) => Promise<{ action: string; alanlar: Record<string, string> }>;
  /** Verilirse "İndirim kodun var mı?" alanı görünür (yalnızca paket satın almada). */
  indirimOnizle?: (kod: string) => Promise<IndirimOzeti>;
  onKapat: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [onay, setOnay] = useState(false);
  const [form, setForm] = useState<{ action: string; alanlar: Record<string, string> } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [indirim, setIndirim] = useState<IndirimOzeti | null>(null);

  // Gizli alanlar DOM'a yazıldıktan SONRA gönder; aynı turda göndermek
  // alanların boş gitmesine yol açardı.
  useEffect(() => {
    if (form) formRef.current?.submit();
  }, [form]);

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onay || mesgul) return;
    // Son güvence: otomatik doldurma hiçbir olay göndermeden yazmış olabilir.
    const yil = formRef.current?.elements.namedItem("expiry_year") as HTMLInputElement | null;
    if (yil) yil.value = yilIkiHane(yil.value);
    const numara = formRef.current?.elements.namedItem("card_number") as HTMLInputElement | null;
    if (numara) numara.value = rakamlar(numara.value, 16);
    setMesgul(true);
    setHata(null);
    try {
      setForm(await formuAl(true, indirim?.kod));
    } catch (h) {
      setHata(h instanceof ApiError ? h.message : t("Ödeme başlatılamadı."));
      setMesgul(false);
    }
  };

  const girdi: React.CSSProperties = {
    background: c.background,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.textPrimary,
    padding: "9px 10px",
    fontSize: 14.5,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !mesgul) onKapat();
      }}
    >
      <form
        ref={formRef}
        method="POST"
        action={form?.action}
        onSubmit={gonder}
        style={{
          background: c.surface,
          borderRadius: 14,
          padding: 22,
          width: "100%",
          maxWidth: 420,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary }}>{baslik}</div>
        <div style={{ fontSize: 13.5, color: c.textSecondary, lineHeight: 1.55, marginBottom: 4 }}>{ozet}</div>
        {indirimOnizle && <IndirimKoduAlani onizle={indirimOnizle} onDegis={setIndirim} />}

        {form && Object.entries(form.alanlar).map(([ad, deger]) => <input key={ad} type="hidden" name={ad} value={deger} />)}

        <input name="cc_owner" required autoComplete="cc-name" placeholder={t("Kart üzerindeki ad")} style={girdi} />
        <input
          name="card_number"
          required
          autoComplete="cc-number"
          inputMode="numeric"
          pattern="\d{15,16}"
          onInput={(e) => duzelt(e, (d) => rakamlar(d, 16))}
          title={t("Kart numarası, boşluksuz 15–16 rakam")}
          placeholder={t("Kart numarası")}
          style={girdi}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <input
            name="expiry_month"
            required
            autoComplete="cc-exp-month"
            inputMode="numeric"
            pattern="\d{1,2}"
            onInput={(e) => duzelt(e, (d) => rakamlar(d, 2))}
            placeholder={t("Ay")}
            style={girdi}
          />
          <input
            name="expiry_year"
            required
            autoComplete="cc-exp-year"
            inputMode="numeric"
            pattern="\d{2}"
            onInput={(e) => duzelt(e, yilIkiHane)}
            // Otomatik doldurma bazen input olayı göndermiyor; alandan çıkınca da düzelt.
            onBlur={(e) => duzelt(e, yilIkiHane)}
            placeholder={t("Yıl (2 hane)")}
            style={girdi}
          />
          <input
            name="cvv"
            required
            autoComplete="cc-csc"
            inputMode="numeric"
            pattern="\d{3,4}"
            onInput={(e) => duzelt(e, (d) => rakamlar(d, 4))}
            placeholder="CVV"
            style={girdi}
          />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: c.textPrimary, lineHeight: 1.5, marginTop: 4 }}>
          <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            {t(
              "Kartımın PayTR'de saklanmasını ve aboneliğimin iptal edene kadar her dönem bu karttan otomatik yenilenmesini kabul ediyorum."
            )}
          </span>
        </label>

        {hata && <div style={{ fontSize: 13, color: c.danger }}>{hata}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="submit"
            disabled={!onay || mesgul}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 15,
              cursor: onay && !mesgul ? "pointer" : "default",
              background: onay ? c.primaryDark : c.border,
              color: onay ? "#fff" : c.textSecondary,
            }}
          >
            {mesgul ? t("Yönlendiriliyor…") : dugmeMetni}
          </button>
          <button
            type="button"
            onClick={onKapat}
            disabled={mesgul}
            style={{ border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, borderRadius: 10, padding: "11px 14px", fontSize: 14, cursor: "pointer" }}
          >
            {t("Vazgeç")}
          </button>
        </div>
        <div style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
          {t("Kart bilgilerin Projelio'ya gelmez; ödeme PayTR üzerinden 3D Secure ile alınır.")}
        </div>
      </form>
    </div>
  );
}
