import { useEffect, useState } from "react";
import { demoAdmin, type DemoDurumu } from "../api/demoAdmin";
import { demoHesap } from "../lib/demoHesap";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Admin > Demo hesabı.
 *
 * Demo verisi her girişte ilk hâline dönüyor (bkz. backend
 * demo-sifirlama.service.ts). Bu panonun tek işi o "ilk hâl"i yönetmek:
 *
 *   Düzenleme kipini AÇ → demo hesabına girip içeriği istediğin gibi düzenle
 *   → KAPAT → o anki hâl yeni ilk hâl olur ve sıfırlama yeniden başlar.
 *
 * Kip açıkken hiçbir giriş veriyi sıfırlamaz; yani araya bir ziyaretçi girse
 * bile emeğin silinmez. Açık unutulursa ziyaretçilerin bıraktığı hiçbir şey
 * temizlenmeyeceği için pano bunu belirgin biçimde hatırlatır.
 */
export default function DemoAdminPanel() {
  const c = useThemeColors();
  const [durum, setDurum] = useState<DemoDurumu | null>(null);
  const [islem, setIslem] = useState<"" | "aciliyor" | "kaydediliyor" | "atiliyor" | "sifirlaniyor">("");
  const [hata, setHata] = useState("");
  const [mesaj, setMesaj] = useState("");

  const yukle = () => {
    demoAdmin
      .durum()
      .then(setDurum)
      .catch((e) => setHata(e instanceof Error ? e.message : "Demo durumu okunamadı."));
  };

  useEffect(yukle, []);

  const calistir = async (
    ad: typeof islem,
    is: () => Promise<string>
  ) => {
    setHata("");
    setMesaj("");
    setIslem(ad);
    try {
      setMesaj(await is());
      yukle();
    } catch (e) {
      setHata(e instanceof Error ? e.message : "İşlem tamamlanamadı.");
    } finally {
      setIslem("");
    }
  };

  const aktif = durum?.duzenlemeKipi.aktif === true;
  const ozet = durum?.anlikGoruntu;

  const dugme = (birincil: boolean) => ({
    background: birincil ? c.primary : "transparent",
    color: birincil ? "#fff" : c.textSecondary,
    border: birincil ? "none" : `1px solid ${c.border}`,
    padding: "9px 16px",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 500,
  });

  return (
    <section style={{ maxWidth: 760, width: "100%" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary, margin: "0 0 12px" }}>
        Demo hesabı
      </h2>

      <div
        style={{
          background: c.surface,
          border: `1px solid ${aktif ? c.accent : c.border}`,
          borderRadius: 12,
          padding: "18px 20px",
        }}
      >
        <p style={{ margin: 0, fontSize: 15, color: c.textPrimary, lineHeight: 1.55 }}>
          {aktif ? (
            <>
              <strong>Düzenleme kipi açık.</strong> Demo verisi şu an sıfırlanmıyor —{" "}
              <code>{demoHesap.email}</code> ile girip içeriği düzenleyebilirsin. Bitirince
              &quot;Kaydet ve kapat&quot; de: o anki hâl yeni ilk hâl olur.
            </>
          ) : (
            <>
              Demo verisi her girişte ilk hâline dönüyor. İçeriği kendin düzenleyeceksen önce
              düzenleme kipini aç; açıkken hiçbir giriş veriyi sıfırlamaz.
            </>
          )}
        </p>

        {aktif && durum?.duzenlemeKipi.acildi && (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: c.textSecondary }}>
            {new Date(durum.duzenlemeKipi.acildi).toLocaleString("tr-TR")} tarihinde açıldı.
            Açık kaldığı sürece ziyaretçilerin bıraktıkları da temizlenmez.
          </p>
        )}

        <p style={{ margin: "12px 0 0", fontSize: 13, color: c.textSecondary }}>
          {ozet && ozet.kaynak === "veritabani" && (
            <>
              Kayıtlı ilk hâl: {ozet.tabloSayisi} tablo, {ozet.satirSayisi} satır
              {ozet.alindi ? ` — ${new Date(ozet.alindi).toLocaleString("tr-TR")}` : ""}.
            </>
          )}
          {ozet && ozet.kaynak === "dosya" && (
            <>
              Henüz panelden kaydedilmiş bir hâl yok; depodaki fabrika ayarı kullanılıyor (
              {ozet.satirSayisi} satır). İlk kaydetmede veritabanına geçer.
            </>
          )}
          {ozet && ozet.kaynak === "yok" && <>Kayıtlı bir ilk hâl bulunamadı.</>}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {aktif ? (
            <>
              <button
                onClick={() =>
                  calistir("kaydediliyor", async () => {
                    const { kaydedilen } = await demoAdmin.duzenlemeKipi(false, true);
                    return `Kaydedildi: ${kaydedilen?.satirSayisi ?? 0} satır yeni ilk hâl oldu. Sıfırlama yeniden açık.`;
                  })
                }
                disabled={islem !== ""}
                style={dugme(true)}
              >
                {islem === "kaydediliyor" ? "Kaydediliyor…" : "Kaydet ve kapat"}
              </button>
              <button
                onClick={() =>
                  calistir("atiliyor", async () => {
                    await demoAdmin.duzenlemeKipi(false, false);
                    return "Kaydedilmedi. Bir sonraki girişte demo eski hâline dönecek.";
                  })
                }
                disabled={islem !== ""}
                style={dugme(false)}
              >
                {islem === "atiliyor" ? "Kapatılıyor…" : "Kaydetmeden kapat"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() =>
                  calistir("aciliyor", async () => {
                    await demoAdmin.duzenlemeKipi(true);
                    return "Düzenleme kipi açıldı. Artık demo hesabına girip düzenleyebilirsin.";
                  })
                }
                disabled={islem !== ""}
                style={dugme(true)}
              >
                {islem === "aciliyor" ? "Açılıyor…" : "Düzenleme kipini aç"}
              </button>
              <button
                onClick={() =>
                  calistir("sifirlaniyor", async () => {
                    await demoAdmin.sifirla();
                    return "Demo verisi ilk hâline döndürüldü.";
                  })
                }
                disabled={islem !== ""}
                style={dugme(false)}
              >
                {islem === "sifirlaniyor" ? "Sıfırlanıyor…" : "Demoyu şimdi sıfırla"}
              </button>
            </>
          )}
        </div>

        {mesaj && <p style={{ color: c.success, fontSize: 14, margin: "12px 0 0" }}>{mesaj}</p>}
        {hata && <p style={{ color: c.danger, fontSize: 14, margin: "12px 0 0" }}>{hata}</p>}
      </div>
    </section>
  );
}
