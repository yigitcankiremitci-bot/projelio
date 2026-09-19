import { useEffect, useState } from "react";
import type { EpostaAyarlariDto, EpostaIpucuSatiri } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { epostaYonetimi, type IpucuYamasi } from "../../api/epostaYonetimi";
import { alan, dugme, etiket, kart, rozet } from "./stiller";

/**
 * Admin > E-posta > İpuçları.
 *
 * Koddaki 14 ipucu VARSAYILAN olarak listede; yönetici metnini değiştirebilir,
 * kapatabilir, sırasını değiştirebilir ve araya kendi ipucunu ekleyebilir.
 * "Kime ne gitti" ayrıca tutulduğu için sıra değişikliği kimseyi şaşırtmaz:
 * herkes, henüz almadığı ilk aktif ipucunu alır.
 *
 * DİL: koddaki ipuçlarının İngilizce çevirisi var. Yöneticinin yazdığı ya da
 * değiştirdiği metnin yok — İngilizce kullanıcıya da bu metin gider, meğer ki
 * ipucunda Lio açık olsun (Lio kişinin dilinde yazar).
 */
export default function EpostaIpuclariBolumu() {
  const c = useThemeColors();
  const t = useT();
  const [ayarlar, setAyarlar] = useState<EpostaAyarlariDto | null>(null);
  const [tavanMetni, setTavanMetni] = useState("");
  const [ipuclari, setIpuclari] = useState<EpostaIpucuSatiri[] | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<string | "yeni" | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");

  const yukle = () =>
    Promise.all([epostaYonetimi.ayarlar(), epostaYonetimi.ipuclari()])
      .then(([a, l]) => {
        setAyarlar(a);
        setTavanMetni(a.lioGunlukTavanBirim == null ? "" : String(a.lioGunlukTavanBirim));
        setIpuclari(l);
      })
      .catch((err) => setHata(err instanceof Error ? err.message : t("İpuçları yüklenemedi.")));

  useEffect(() => {
    void yukle();
  }, []);

  /** Her işlem aynı yoldan: çalıştır, mesajı göster, listeyi tazele. */
  const calistir = async (is: () => Promise<unknown>, basari?: string) => {
    setHata("");
    setBilgi("");
    setMesgul(true);
    try {
      await is();
      if (basari) setBilgi(basari);
      await yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem gerçekleştirilemedi."));
    } finally {
      setMesgul(false);
    }
  };

  const tasi = (index: number, yon: -1 | 1) => {
    if (!ipuclari) return;
    const hedef = index + yon;
    if (hedef < 0 || hedef >= ipuclari.length) return;
    const yeni = [...ipuclari];
    [yeni[index], yeni[hedef]] = [yeni[hedef], yeni[index]];
    setIpuclari(yeni);
    void calistir(() => epostaYonetimi.ipucuSirala(yeni.map((i) => i.anahtar)));
  };

  const aktifSayisi = ipuclari?.filter((i) => i.aktif).length ?? 0;
  let aktifSira = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {ayarlar && (
        <section style={{ ...kart(c), display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={ayarlar.ipuclariAcik}
              disabled={mesgul}
              onChange={(e) => void calistir(() => epostaYonetimi.ayarlariKaydet({ ipuclariAcik: e.target.checked }))}
              style={{ width: 17, height: 17, marginTop: 2 }}
            />
            <span>
              <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>{t("Günlük ipucu e-postaları açık")}</span>
              <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary, lineHeight: 1.5 }}>
                {t("Kapatırsan kimseye ipucu gitmez; her kullanıcı kaldığı yerden devam eder.")}
              </span>
            </span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.textPrimary }}>{t("Lio'nun ipuçlarında günlük harcama tavanı")}</span>
            <input
              type="number"
              min={0}
              value={tavanMetni}
              placeholder={t("sınırsız")}
              onChange={(e) => setTavanMetni(e.target.value)}
              style={{ ...alan(c), width: 110 }}
            />
            <span style={{ fontSize: 14, color: c.textSecondary }}>{t("birim")}</span>
            <button
              type="button"
              disabled={mesgul}
              style={dugme(c)}
              onClick={() =>
                void calistir(
                  () =>
                    epostaYonetimi.ayarlariKaydet({
                      lioGunlukTavanBirim: tavanMetni.trim() === "" ? null : Number(tavanMetni),
                    }),
                  t("Kaydedildi.")
                )
              }
            >
              {t("Kaydet")}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
            {t("Tavan aşılınca o gün kalan ipuçları Lio'suz, düz metin olarak gider. Toplu ve tekil gönderimler bu tavana dahil değil.")}
          </p>
          {!ayarlar.lioKullanilabilir && (
            <p style={{ fontSize: 13, color: c.danger, margin: 0 }}>
              {t("Sunucuda Lio için tanımlı bir AI sağlayıcısı yok; Lio işaretli ipuçları düz metin gider.")}
            </p>
          )}
        </section>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}
      {bilgi && <p style={{ color: c.success, fontSize: 14, margin: 0 }}>{bilgi}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: c.textSecondary }}>
          {t("{n} aktif ipucu — her kullanıcıya günde bir tane, sırayla.", { n: aktifSayisi })}
        </span>
        <button type="button" style={dugme(c, "birincil")} onClick={() => setDuzenlenen("yeni")}>
          {t("Yeni ipucu ekle")}
        </button>
      </div>

      {duzenlenen === "yeni" && (
        <IpucuFormu
          onVazgec={() => setDuzenlenen(null)}
          onKaydet={(g) =>
            calistir(async () => {
              await epostaYonetimi.ipucuEkle(g);
              setDuzenlenen(null);
            }, t("İpucu eklendi."))
          }
        />
      )}

      {!ipuclari && !hata && <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

      {ipuclari?.map((ipucu, index) => {
        if (ipucu.aktif) aktifSira += 1;
        return (
          <section key={ipucu.anahtar} style={{ ...kart(c), opacity: ipucu.aktif ? 1 : 0.6, padding: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", flexShrink: 0 }}>
                <button type="button" aria-label={t("Yukarı taşı")} disabled={mesgul || index === 0} onClick={() => tasi(index, -1)} style={okStili(c)}>
                  ▲
                </button>
                <span style={{ fontSize: 13, color: c.textSecondary, minWidth: 22, textAlign: "center" }}>
                  {ipucu.aktif ? aktifSira : "–"}
                </span>
                <button
                  type="button"
                  aria-label={t("Aşağı taşı")}
                  disabled={mesgul || index === ipuclari.length - 1}
                  onClick={() => tasi(index, 1)}
                  style={okStili(c)}
                >
                  ▼
                </button>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15, color: c.textPrimary }}>{ipucu.baslik}</strong>
                  <span style={rozet(c, ipucu.kaynak === "ozel")}>
                    {ipucu.kaynak === "ozel" ? t("Senin ipucun") : ipucu.duzenlendi ? t("Düzenlendi") : t("Varsayılan")}
                  </span>
                  {ipucu.lioIle && <span style={rozet(c, true)}>{t("Lio yazıyor")}</span>}
                </div>
                <p style={{ fontSize: 13.5, color: c.textSecondary, margin: "4px 0 8px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {ipucu.govde.length > 220 ? `${ipucu.govde.slice(0, 220)}…` : ipucu.govde}
                </p>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={secimStili(c)}>
                    <input
                      type="checkbox"
                      checked={ipucu.aktif}
                      disabled={mesgul}
                      onChange={(e) => void calistir(() => epostaYonetimi.ipucuGuncelle(ipucu.anahtar, { aktif: e.target.checked }))}
                    />
                    {t("Gönderilsin")}
                  </label>
                  <label style={secimStili(c)}>
                    <input
                      type="checkbox"
                      checked={ipucu.lioIle}
                      disabled={mesgul}
                      onChange={(e) => void calistir(() => epostaYonetimi.ipucuGuncelle(ipucu.anahtar, { lioIle: e.target.checked }))}
                    />
                    {t("Lio her kişiye farklı yazsın")}
                  </label>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={{ ...dugme(c), padding: "5px 10px", fontSize: 13 }} onClick={() => setDuzenlenen(ipucu.anahtar)}>
                    {t("Düzenle")}
                  </button>
                  <button
                    type="button"
                    disabled={mesgul}
                    style={{ ...dugme(c), padding: "5px 10px", fontSize: 13 }}
                    onClick={() =>
                      void calistir(async () => {
                        const r = await epostaYonetimi.ipucuDene(ipucu.anahtar);
                        if (!r.sent) throw new Error(t("Deneme gönderilemedi. E-posta adresin doğrulanmamış olabilir."));
                      }, t("Deneme e-postası sana gönderildi."))
                    }
                  >
                    {t("Kendime gönder")}
                  </button>
                  {(ipucu.kaynak === "ozel" || ipucu.duzenlendi) && (
                    <button
                      type="button"
                      disabled={mesgul}
                      style={{ ...dugme(c, "tehlike"), padding: "5px 10px", fontSize: 13 }}
                      onClick={() => {
                        const soru =
                          ipucu.kaynak === "ozel"
                            ? t("Bu ipucu silinsin mi?")
                            : t("Bu ipucu varsayılan metnine ve ayarlarına dönsün mü?");
                        if (window.confirm(soru)) void calistir(() => epostaYonetimi.ipucuSil(ipucu.anahtar));
                      }}
                    >
                      {ipucu.kaynak === "ozel" ? t("Sil") : t("Varsayılana dön")}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {duzenlenen === ipucu.anahtar && (
              <div style={{ marginTop: 12 }}>
                <IpucuFormu
                  ilk={ipucu}
                  onVazgec={() => setDuzenlenen(null)}
                  onKaydet={(g) =>
                    calistir(async () => {
                      await epostaYonetimi.ipucuGuncelle(ipucu.anahtar, g);
                      setDuzenlenen(null);
                    }, t("Kaydedildi."))
                  }
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function IpucuFormu({
  ilk,
  onKaydet,
  onVazgec,
}: {
  ilk?: EpostaIpucuSatiri;
  onKaydet: (g: IpucuYamasi) => Promise<void> | void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [baslik, setBaslik] = useState(ilk?.baslik ?? "");
  const [govde, setGovde] = useState(ilk?.govde ?? "");
  const [link, setLink] = useState(ilk?.link ?? "/");
  const [dugmeMetni, setDugmeMetni] = useState(ilk?.dugme ?? "");
  const [lioIle, setLioIle] = useState(ilk?.lioIle ?? false);

  return (
    <div style={{ ...kart(c), background: c.background, display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <div style={etiket(c)}>{t("Başlık")}</div>
        <input value={baslik} onChange={(e) => setBaslik(e.target.value)} maxLength={120} style={alan(c)} />
      </div>
      <div>
        <div style={etiket(c)}>{t("Metin")}</div>
        <textarea
          value={govde}
          onChange={(e) => setGovde(e.target.value)}
          rows={6}
          maxLength={3000}
          style={{ ...alan(c), resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{t("Paragrafları boş satırla ayır.")}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 200px" }}>
          <div style={etiket(c)}>{t("Bağlantı")}</div>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/tasks" style={alan(c)} />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <div style={etiket(c)}>{t("Düğme metni")}</div>
          <input value={dugmeMetni} onChange={(e) => setDugmeMetni(e.target.value)} maxLength={40} style={alan(c)} />
        </div>
      </div>
      {!ilk && (
        <label style={secimStili(c)}>
          <input type="checkbox" checked={lioIle} onChange={(e) => setLioIle(e.target.checked)} />
          {t("Lio her kişiye farklı yazsın")}
        </label>
      )}
      {ilk?.kaynak === "kod" && (
        <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
          {t("Değiştirdiğin metin İngilizce kullanıcılara da bu hâliyle gider; Lio açıksa onların diline çevrilir.")}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" style={dugme(c)} onClick={onVazgec}>
          {t("Vazgeç")}
        </button>
        <button
          type="button"
          style={{ ...dugme(c, "birincil"), opacity: baslik.trim() && govde.trim() ? 1 : 0.55 }}
          disabled={!baslik.trim() || !govde.trim()}
          onClick={() =>
            void onKaydet(
              ilk
                ? {
                    // Koddaki ipucunda değişmeyen alan GÖNDERİLMEZ: aynı metni
                    // kopyalamak, sonradan koddaki düzeltmeyi bu ipucuna kapatırdı.
                    ...(baslik !== ilk.baslik ? { baslik } : {}),
                    ...(govde !== ilk.govde ? { govde } : {}),
                    ...(link !== ilk.link ? { link } : {}),
                    ...(dugmeMetni !== ilk.dugme ? { dugme: dugmeMetni } : {}),
                  }
                : { baslik, govde, link, dugme: dugmeMetni, lioIle }
            )
          }
        >
          {t("Kaydet")}
        </button>
      </div>
    </div>
  );
}

function secimStili(c: ReturnType<typeof useThemeColors>): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13.5, color: c.textPrimary, cursor: "pointer" };
}

function okStili(c: ReturnType<typeof useThemeColors>): React.CSSProperties {
  return {
    border: "none",
    background: "transparent",
    color: c.textSecondary,
    cursor: "pointer",
    fontSize: 10,
    padding: 2,
    lineHeight: 1,
  };
}
