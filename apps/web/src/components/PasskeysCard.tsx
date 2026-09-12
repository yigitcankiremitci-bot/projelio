import { useEffect, useState } from "react";
import type { Passkey } from "@projelio/shared";
import { passkeysApi } from "../api/passkeys";
import { anahtarOlustur, cihazAdiOner, desteklenirMi } from "../lib/gecisAnahtari";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * GEÇİŞ ANAHTARLARI — kullanıcının cihazları.
 *
 * NE İŞE YARIYOR: Hesaplar modülünde bir şifreyi görmek için kilidin açılması
 * gerekiyor ve kilit iki yolla açılıyor — Projelio şifresi ya da buradaki bir
 * cihaz. Parmak izi/yüz ile açmak, kasa şifresini gün içinde onlarca kez
 * yazmaktan hem hızlı hem güvenli (yazılan şifre omuz üstünden okunabiliyor).
 *
 * GİRİŞTE KULLANILMIYOR (henüz): kayıt kullanıcıya ait olduğu için ileride
 * girişe de bağlanabilir, ama o ayrı bir karar — şifresini kaybeden kullanıcı
 * için kurtarma yolu gerekiyor.
 *
 * ÖZEL ANAHTAR CİHAZDAN ÇIKMIYOR: sunucuda yalnızca açık anahtar duruyor, yani
 * bu listenin sızması kimseye giriş sağlamaz (bkz. migration 106 §5).
 */
export default function PasskeysCard({ hasPassword = true }: { hasPassword?: boolean }) {
  const c = useThemeColors();
  const t = useT();
  const [anahtarlar, setAnahtarlar] = useState<Passkey[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  const yukle = () => {
    passkeysApi
      .liste()
      .then(setAnahtarlar)
      .catch(() => setAnahtarlar([]))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, []);

  /**
   * Yeni cihaz ekler.
   *
   * Zincir tıklamadan başlıyor ve araya başka bir bekleme KOYULMAMALI:
   * tarayıcı `navigator.credentials.create`'i ancak kullanıcı hareketinin
   * içinden kabul ediyor (bkz. lib/gecisAnahtari.ts).
   */
  const ekle = async () => {
    setBusy(true);
    setHata("");
    try {
      const secenekler = await passkeysApi.kayitSecenekleri(hasPassword ? password : undefined);
      const yanit = await anahtarOlustur(secenekler);
      await passkeysApi.kaydet({ challenge: secenekler.challenge, ...yanit, label: cihazAdiOner() });
      yukle();
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : "";
      // Kullanıcı vazgeçtiyse arıza gibi göstermiyoruz. InvalidStateError =
      // bu cihaz zaten kayıtlı (excludeCredentials'ın beklenen davranışı).
      setHata(
        /NotAllowedError|AbortError/i.test(mesaj)
          ? t("Ekleme tamamlanmadı.")
          : /InvalidStateError/i.test(mesaj)
          ? t("Bu cihaz zaten kayıtlı.")
          : mesaj || t("Geçiş anahtarı eklenemedi")
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  };

  const sil = async (anahtar: Passkey) => {
    if (!window.confirm(t("Bu geçiş anahtarı kaldırılsın mı? Bu cihazla kilit açamazsınız."))) return;
    setBusy(true);
    try {
      await passkeysApi.sil(anahtar.id);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaldırılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const tarih = (deger?: string) =>
    deger ? new Date(deger).toLocaleDateString("tr-TR", { dateStyle: "medium" }) : "—";

  if (!desteklenirMi() && anahtarlar.length === 0) {
    return (
      <span style={{ fontSize: 13, color: c.textSecondary }}>
        {t("Bu tarayıcı geçiş anahtarını desteklemiyor. Kilidi Projelio şifrenizle açabilirsiniz.")}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {yukleniyor && <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

      {!yukleniyor && anahtarlar.length === 0 && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("Kayıtlı cihaz yok. Bir cihaz eklerseniz hesap şifrelerinin kilidini parmak izi, yüz ya da PIN ile açabilirsiniz.")}
        </span>
      )}

      {anahtarlar.map((anahtar) => (
        <div
          key={anahtar.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: "8px 10px",
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 13, color: c.textPrimary, flex: 1, minWidth: 120 }}>
            {anahtar.label || t("Cihaz")}
          </span>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t("Eklendi: {tarih}", { tarih: tarih(anahtar.createdAt) })}
            {anahtar.lastUsedAt ? ` · ${t("son kullanım: {tarih}", { tarih: tarih(anahtar.lastUsedAt) })}` : ""}
          </span>
          <button
            onClick={() => sil(anahtar)}
            disabled={busy}
            style={{
              fontSize: 12,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: "4px 10px",
              cursor: busy ? "default" : "pointer",
              color: c.danger,
            }}
          >
            {t("Kaldır")}
          </button>
        </div>
      ))}

      {desteklenirMi() && hasPassword && (
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("Mevcut şifren")}
          aria-label={t("Mevcut şifren")}
          disabled={busy}
          style={{ padding: 8, border: `1px solid ${c.border}`, borderRadius: 8, background: "transparent", color: c.textPrimary }}
        />
      )}
      {desteklenirMi() && (
        <button
          onClick={ekle}
          disabled={busy}
          style={{
            alignSelf: "flex-start",
            fontSize: 13,
            padding: "7px 14px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t("Cihaz bekleniyor…") : t("Bu cihazı ekle")}
        </button>
      )}

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
    </div>
  );
}
