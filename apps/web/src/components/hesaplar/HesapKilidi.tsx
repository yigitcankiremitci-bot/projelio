import { useEffect, useState } from "react";
import type { ServiceUnlockResult } from "@projelio/shared";
import { hesaplarApi } from "../../api/hesaplar";
import { anahtarlaImzala, desteklenirMi } from "../../lib/gecisAnahtari";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";

/**
 * Hesap sırlarının kilidi — arayüz tarafı.
 *
 * NEDEN VAR: oturum jetonu 7 gün yaşıyor ve açık kalmış bir ekran başkasının
 * eline geçebiliyor. Bir şifre kasasında "ekran açıksa her şey açık" kabul
 * edilemez; kilit, sırrı GÖSTERME anında kimliği yeniden sorar. Sunucu tarafı:
 * backend/src/modules/hesaplar/hesap-kilit.service.ts
 *
 * İKİ YOL: Projelio hesap şifresi (bildiğin şey) ya da geçiş anahtarı (elinde
 * olan cihaz + biyometri). İkisi de aynı kısa ömürlü jetonu üretiyor; jeton
 * dolduğunda kilit kendiliğinden kapanıyor.
 *
 * JETON EKRANDA TUTULUYOR, localStorage'a YAZILMIYOR: sayfa yenilendiğinde
 * kilidin kapanması doğru davranış — "kilidi açık bırakılmış sekme" tam olarak
 * korunmaya çalıştığımız şey.
 */

export interface Kilit {
  token: string;
  method: ServiceUnlockResult["method"];
  /** Jetonun dolduğu an (ms). Geri sayım bunu okuyor. */
  bitisAni: number;
}

/** Kilidi tutan ve süresi dolunca kendiliğinden kapatan kanca. */
export function useKilit(): {
  kilit: Kilit | null;
  kalanSaniye: number;
  ac: (sonuc: ServiceUnlockResult) => void;
  kapat: () => void;
} {
  const [kilit, setKilit] = useState<Kilit | null>(null);
  const [kalanSaniye, setKalanSaniye] = useState(0);

  useEffect(() => {
    if (!kilit) {
      setKalanSaniye(0);
      return;
    }
    const guncelle = () => {
      const kalan = Math.ceil((kilit.bitisAni - Date.now()) / 1000);
      setKalanSaniye(Math.max(0, kalan));
      // Süre dolunca jeton state'ten SİLİNİR, yalnızca gizlenmez: elde
      // kalmış bir jetonla ikinci bir istek atılmasın.
      if (kalan <= 0) setKilit(null);
    };
    guncelle();
    const sayac = setInterval(guncelle, 1000);
    return () => clearInterval(sayac);
  }, [kilit]);

  return {
    kilit,
    kalanSaniye,
    ac: (sonuc) =>
      setKilit({ token: sonuc.token, method: sonuc.method, bitisAni: Date.now() + sonuc.expiresInSeconds * 1000 }),
    kapat: () => setKilit(null),
  };
}

export default function HesapKilidi({ onAcildi }: { onAcildi: (sonuc: ServiceUnlockResult) => void }) {
  const c = useThemeColors();
  const t = useT();
  const [sifre, setSifre] = useState("");
  const [busy, setBusy] = useState<"sifre" | "anahtar" | null>(null);
  const [hata, setHata] = useState("");

  const sifreyleAc = async () => {
    setBusy("sifre");
    setHata("");
    try {
      onAcildi(await hesaplarApi.sifreyleAc(sifre));
      setSifre("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kilit açılamadı"));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Geçiş anahtarıyla açar.
   *
   * İki adım: sunucudan tek kullanımlık meydan okuma, sonra cihaza imza. Zincir
   * tıklamadan başladığı için tarayıcının "kullanıcı hareketi" şartı sağlanıyor;
   * araya başka bir bekleme KOYULMAMALI (bkz. lib/gecisAnahtari.ts).
   */
  const anahtarlaAc = async () => {
    setBusy("anahtar");
    setHata("");
    try {
      const secenekler = await hesaplarApi.gecisAnahtariSecenekleri();
      const imza = await anahtarlaImzala(secenekler);
      onAcildi(await hesaplarApi.gecisAnahtariylaAc({ challenge: secenekler.challenge, ...imza }));
    } catch (err) {
      // Kullanıcı vazgeçtiyse (cihaz penceresini kapattıysa) tarayıcı da hata
      // atıyor; onu arıza gibi göstermiyoruz.
      const mesaj = err instanceof Error ? err.message : "";
      setHata(
        /NotAllowedError|AbortError|timed out/i.test(mesaj)
          ? t("Doğrulama tamamlanmadı.")
          : mesaj || t("Geçiş anahtarıyla açılamadı")
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        border: `1px dashed ${c.accent}`,
        borderRadius: 10,
        background: `${c.accent}0F`,
      }}
    >
      <span style={{ fontSize: 13, color: c.textPrimary }}>{t("Giriş bilgilerini görmek için kilidi açın")}</span>
      <span style={{ fontSize: 11, color: c.textSecondary }}>
        {t("Oturumun açık olması yeterli değil: açık kalmış bir ekran başkasının eline geçebilir.")}
      </span>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sifreyleAc();
        }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          type="password"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          placeholder={t("Projelio şifreniz")}
          autoComplete="current-password"
          style={{ flex: "1 1 180px", fontSize: 13, padding: "6px 8px" }}
        />
        <button
          type="submit"
          data-primary
          disabled={busy !== null || !sifre}
          style={{
            fontSize: 13,
            padding: "6px 14px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: busy ? "default" : "pointer",
            opacity: busy === "sifre" || !sifre ? 0.6 : 1,
          }}
        >
          {busy === "sifre" ? t("Açılıyor…") : t("Kilidi aç")}
        </button>
      </form>

      {desteklenirMi() && (
        <button
          onClick={anahtarlaAc}
          disabled={busy !== null}
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            background: "transparent",
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "5px 12px",
            cursor: busy ? "default" : "pointer",
            color: c.textSecondary,
          }}
        >
          {busy === "anahtar" ? t("Cihaz bekleniyor…") : t("Geçiş anahtarıyla aç")}
        </button>
      )}

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
    </div>
  );
}
