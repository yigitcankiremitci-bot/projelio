import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { billingApi, type PayTRKartDurumu } from "../api/billing";
import { ApiError } from "../api/client";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { bicimDili } from "../lib/i18n/depo";

/**
 * Yönetici: PayTR kart saklama denemesi.
 *
 * NEDEN VAR: aboneliği yazmadan önce iki şeyi gerçek bir kartla görmek
 * gerekiyor — PayTR'nin bildirimde utoken'ı nasıl gönderdiği ve 3D ile
 * saklanan kart için require_cvv'nin kaç döndüğü (1 ise gözetimsiz yenileme
 * yapılamaz). PayTR ikincisini iki kez sorulduğu hâlde yanıtlamadı.
 *
 * KART VERİSİ SUNUCUMUZA GİTMEZ: sunucudan yalnızca gizli alanlar (imza,
 * tutar, sipariş no) alınır; kart alanları React state'ine bile girmeyen
 * düz input'lar ve form tarayıcıdan DOĞRUDAN PayTR'ye POST edilir. PayTR'nin
 * Direkt API kuralı da bu ("kart formu yalnızca PayTR'ye post edilir").
 *
 * Abonelik yazılınca bu ekran kalkar.
 */
export default function PayTRKartDenemesi() {
  const c = useThemeColors();
  const t = useT();
  const [params] = useSearchParams();
  const [durum, setDurum] = useState<PayTRKartDurumu | null>(null);
  const [tutar, setTutar] = useState("1");
  const [form, setForm] = useState<{ action: string; alanlar: Record<string, string> } | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const yenile = useCallback(() => {
    billingApi.admin.paytrKart
      .durum()
      .then(setDurum)
      .catch((hata) => setMesaj(hata instanceof ApiError ? hata.message : t("Durum alınamadı.")));
  }, [t]);

  useEffect(yenile, [yenile]);

  // PayTR 3D'den sonra buraya döndürüyor. Dönüş ödemenin kanıtı DEĞİL; asıl
  // sonuç bildirimle gelir ve birkaç saniye gecikebilir.
  const donus = params.get("kart");

  const calistir = async (is: () => Promise<void>) => {
    setMesgul(true);
    setMesaj(null);
    try {
      await is();
    } catch (hata) {
      setMesaj(hata instanceof ApiError ? hata.message : t("İşlem başarısız."));
    } finally {
      setMesgul(false);
    }
  };

  const formuAc = () =>
    calistir(async () => {
      const sonuc = await billingApi.admin.paytrKart.form(Number(tutar.replace(",", ".")));
      setForm({ action: sonuc.action, alanlar: sonuc.alanlar });
    });

  const tekrarlayanDene = (ctoken: string) =>
    calistir(async () => {
      const sonuc = await billingApi.admin.paytrKart.tekrarlayan(ctoken, Number(tutar.replace(",", ".")));
      setMesaj(
        t("Non3D çekim yanıtı: {durum}", { durum: sonuc.status }) +
          (sonuc.msg ? ` — ${sonuc.msg}` : "") +
          (sonuc.tryAgain ? ` (${t("yeniden denenebilir")})` : "")
      );
      yenile();
    });

  const sil = (ctoken: string) => {
    if (!window.confirm(t("Bu kart PayTR'den silinsin mi?"))) return;
    calistir(async () => {
      await billingApi.admin.paytrKart.sil(ctoken);
      yenile();
    });
  };

  const etiket = { color: c.textSecondary, fontSize: 12.5 };
  const girdi: React.CSSProperties = {
    background: c.background,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.textPrimary,
    padding: "7px 9px",
    fontSize: 13.5,
  };
  const dugme: React.CSSProperties = {
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
  };
  const kutu: React.CSSProperties = {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 10,
    padding: "12px 14px",
  };

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ color: c.textPrimary, fontSize: 15, fontWeight: 500, margin: "0 0 6px" }}>
        {t("PayTR kart saklama denemesi")}
      </h3>
      <p style={{ ...etiket, fontSize: 13.5, margin: "0 0 12px", maxWidth: 640, lineHeight: 1.55 }}>
        {t(
          "Kendi kartınla küçük bir 3D'li ödeme yapıp kartı PayTR'de saklar, ardından kartın CVV isteyip istemediğini (require_cvv) ve saklı karttan Non3D çekimi dener. Çekilen tutarı PayTR panelinden iade edebilirsin."
        )}
      </p>

      {durum && (
        <div style={{ ...etiket, marginBottom: 10, color: durum.testMode ? c.textSecondary : c.danger }}>
          {durum.testMode ? t("Test modu: gerçek para çekilmez.") : t("Canlı mod: karttan gerçekten para çekilir.")}
        </div>
      )}

      {donus && (
        <div style={{ color: c.textPrimary, fontSize: 13.5, marginBottom: 10 }}>
          {donus === "tamam"
            ? t("PayTR'den döndün. Sonuç bildirimle gelir; birkaç saniye sonra Yenile'ye bas.")
            : t("PayTR ödemeyi başarısız olarak döndürdü.")}
        </div>
      )}

      {mesaj && <div style={{ color: c.textPrimary, fontSize: 13.5, marginBottom: 10 }}>{mesaj}</div>}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={etiket}>{t("Tutar (TL, 1–50)")}</span>
        <input value={tutar} onChange={(e) => setTutar(e.target.value)} style={{ ...girdi, width: 80 }} />
        <button onClick={formuAc} disabled={mesgul} style={dugme}>
          {t("Kart formunu aç")}
        </button>
        <button onClick={yenile} disabled={mesgul} style={dugme}>
          {t("Yenile")}
        </button>
      </div>

      {form && (
        // Düz HTML formu: gönderim React'tan değil tarayıcıdan, doğrudan PayTR'ye.
        // Kart alanları kontrolsüz (value/state yok) — kart hiçbir yerde tutulmaz.
        <form method="POST" action={form.action} style={{ ...kutu, display: "grid", gap: 8, maxWidth: 420, marginBottom: 14 }}>
          {Object.entries(form.alanlar).map(([ad, deger]) => (
            <input key={ad} type="hidden" name={ad} value={deger} />
          ))}
          <input name="cc_owner" required autoComplete="cc-name" placeholder={t("Kart üzerindeki ad")} style={girdi} />
          <input
            name="card_number"
            required
            autoComplete="cc-number"
            inputMode="numeric"
            pattern="\d{15,16}"
            placeholder={t("Kart numarası (boşluksuz)")}
            style={girdi}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <input name="expiry_month" required autoComplete="cc-exp-month" inputMode="numeric" pattern="\d{1,2}" placeholder={t("Ay")} style={{ ...girdi, width: 70 }} />
            <input name="expiry_year" required autoComplete="cc-exp-year" inputMode="numeric" pattern="\d{2}" placeholder={t("Yıl (2 hane)")} style={{ ...girdi, width: 110 }} />
            <input name="cvv" required autoComplete="cc-csc" inputMode="numeric" pattern="\d{3,4}" placeholder="CVV" style={{ ...girdi, width: 80 }} />
          </div>
          <button type="submit" style={{ ...dugme, border: "none", background: c.primaryDark, color: "#fff" }}>
            {t("3D ile öde ve kartı sakla")}
          </button>
        </form>
      )}

      {durum?.sonBildirim && (
        <div style={{ ...kutu, marginBottom: 12 }}>
          <div style={{ color: c.textPrimary, fontSize: 13.5, fontWeight: 500, marginBottom: 4 }}>{t("Son PayTR bildirimi")}</div>
          <div style={etiket}>
            {durum.sonBildirim.onek === "KRT" ? t("Kart saklama") : t("Non3D çekim")} · {durum.sonBildirim.status} ·{" "}
            {new Date(durum.sonBildirim.zaman).toLocaleString(bicimDili())}
            {durum.sonBildirim.failedReason ? ` · ${durum.sonBildirim.failedReason}` : ""}
          </div>
          <div style={etiket}>
            {durum.sonBildirim.utokenGeldi ? t("utoken geldi.") : t("utoken GELMEDİ.")} {t("Alanlar")}:{" "}
            {durum.sonBildirim.alanlar.join(", ")}
          </div>
        </div>
      )}

      {durum?.kartHatasi && <div style={{ ...etiket, color: c.danger, marginBottom: 10 }}>{durum.kartHatasi}</div>}

      {durum?.utokenVar && durum.kartlar.length === 0 && !durum.kartHatasi && (
        <div style={etiket}>{t("PayTR'de saklı kart yok.")}</div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {durum?.kartlar.map((k) => (
          <div key={k.ctoken} style={{ ...kutu, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: c.textPrimary, fontSize: 14 }}>
              {k.sema} •••• {k.last4}
            </span>
            <span style={etiket}>
              {k.banka} · {k.tur} · {k.ay}/{k.yil}
            </span>
            <span style={{ fontSize: 13, color: k.requireCvv ? c.danger : c.textPrimary, fontWeight: 500 }}>
              require_cvv = {k.requireCvv ? "1" : "0"} —{" "}
              {k.requireCvv ? t("CVV istiyor, gözetimsiz yenileme yapılamaz") : t("gözetimsiz yenileme mümkün")}
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={() => tekrarlayanDene(k.ctoken)} disabled={mesgul} style={dugme}>
              {t("Non3D çekim dene")}
            </button>
            <button onClick={() => sil(k.ctoken)} disabled={mesgul} style={{ ...dugme, color: c.danger }}>
              {t("Sil")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
