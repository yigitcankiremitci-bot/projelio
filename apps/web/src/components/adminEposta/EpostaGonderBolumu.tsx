import { useEffect, useMemo, useState } from "react";
import {
  EPOSTA_KAMPANYA_SINIRI,
  gercekEpostaMi,
  kampanyaGirdisiniDogrula,
  type AdminKullaniciSatiri,
  type EpostaHedefi,
  type EpostaKampanyasi,
} from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import { adminKullanicilar } from "../../api/adminKullanicilar";
import { epostaYonetimi } from "../../api/epostaYonetimi";
import { alan, birimYaz, dugme, etiket, kart, rozet } from "./stiller";

/**
 * Admin > E-posta > Gönder.
 *
 * Tek ekran, iki kip: "Kişiler" (arama kutusundan bir ya da birkaç kişi) ve
 * "Kitle" (herkes / yeni üyeler / uzun süredir girmeyenler). Tek kişi seçilince
 * gönderim TEKİL olur: yanıtlanabilir destek@ adresinden, tercihe bakmadan ve
 * hemen gider. Birden fazla kişi ya da kitle TOPLU'dur: ipucu/duyuruları
 * kapatmış kişiye gitmez, kuyruktan dakika dakika gönderilir.
 *
 * Lio iki yerde yardım ediyor: taslağı yazdırmak (yöneticiye bir kez) ve
 * "her alıcıya kendi yorumuyla yaz" (alıcı başına). İkincisinin maliyeti alıcı
 * sayısıyla çarpılıyor; bu yüzden önizleme bir örneğin gerçek maliyetini
 * gösterip toplam için kaba bir tahmin veriyor.
 *
 * Gönder Enter'a bağlı DEĞİL: toplu gönderim geri alınamaz.
 */

type Kip = "kisiler" | "kitle";
type KitleTuru = "herkes" | "yeni" | "pasif";

export default function EpostaGonderBolumu({ onGonderildi }: { onGonderildi: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();

  const [kullanicilar, setKullanicilar] = useState<AdminKullaniciSatiri[]>([]);
  const [arama, setArama] = useState("");
  const [secilenler, setSecilenler] = useState<AdminKullaniciSatiri[]>([]);
  const [kip, setKip] = useState<Kip>("kisiler");
  const [kitle, setKitle] = useState<KitleTuru>("yeni");
  const [gun, setGun] = useState(14);
  const [kitleSayisi, setKitleSayisi] = useState<number | null>(null);

  const [istek, setIstek] = useState("");
  const [taslakDili, setTaslakDili] = useState<"tr" | "en">("tr");
  const [taslakYaziliyor, setTaslakYaziliyor] = useState(false);

  const [konu, setKonu] = useState("");
  const [baslik, setBaslik] = useState("");
  const [govde, setGovde] = useState("");
  const [link, setLink] = useState("");
  const [dugmeMetni, setDugmeMetni] = useState("");
  const [lioIle, setLioIle] = useState(false);

  const [onizleme, setOnizleme] = useState<{ konu: string; html: string; lio: boolean; birim: number } | null>(null);
  const [onizleniyor, setOnizleniyor] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [sonuc, setSonuc] = useState<EpostaKampanyasi | null>(null);

  useEffect(() => {
    adminKullanicilar
      .liste()
      .then((r) => setKullanicilar(r.kullanicilar.filter((u) => !u.anonimlestirildi && !u.deletedAt)))
      .catch(() => setHata(t("Kullanıcı listesi yüklenemedi.")));
  }, []);

  const hedef: EpostaHedefi = useMemo(
    () =>
      kip === "kisiler"
        ? { tur: "secili", kullaniciIds: secilenler.map((u) => u.id) }
        : kitle === "herkes"
          ? { tur: "herkes" }
          : { tur: kitle, gun },
    [kip, kitle, gun, secilenler]
  );

  // Kitle değiştikçe kaç kişiye gideceği sunucudan soruluyor — aynı süzgeç
  // (doğrulanmış adres, çıkış yapmamış) orada uygulanıyor.
  useEffect(() => {
    if (kip !== "kitle") return;
    setKitleSayisi(null);
    const zamanlayici = setTimeout(() => {
      epostaYonetimi
        .hedefSayisi(hedef)
        .then((r) => setKitleSayisi(r.sayi))
        .catch(() => setKitleSayisi(null));
    }, 300);
    return () => clearTimeout(zamanlayici);
  }, [kip, hedef]);

  const eslesenler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (q.length < 2) return [];
    return kullanicilar
      .filter((u) => !secilenler.some((s) => s.id === u.id))
      .filter((u) => `${u.fullName} ${u.email} ${u.username}`.toLocaleLowerCase("tr").includes(q))
      .slice(0, 8);
  }, [arama, kullanicilar, secilenler]);

  const tekil = kip === "kisiler" && secilenler.length === 1;
  const aliciSayisi = kip === "kisiler" ? secilenler.length : kitleSayisi;
  const girdi = { konu, baslik, govde, link, dugme: dugmeMetni, lioIle, hedef };
  const dogrulama = kampanyaGirdisiniDogrula(girdi);

  const taslakYazdir = async () => {
    setHata("");
    setBilgi("");
    setTaslakYaziliyor(true);
    try {
      const r = await epostaYonetimi.taslak(istek, taslakDili);
      setKonu(r.metin.konu);
      setBaslik(r.metin.baslik);
      setGovde(r.metin.govde);
      if (r.metin.dugme) setDugmeMetni(r.metin.dugme);
      setBilgi(t("Lio taslağı yazdı ({birim} birim). Metni dilediğin gibi düzenleyebilirsin.", { birim: birimYaz(r.birim, locale) }));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Lio taslağı yazamadı."));
    } finally {
      setTaslakYaziliyor(false);
    }
  };

  const onizle = async () => {
    setHata("");
    setOnizleniyor(true);
    try {
      setOnizleme(
        await epostaYonetimi.onizleme({
          konu,
          baslik,
          govde,
          link,
          dugme: dugmeMetni,
          lioIle,
          aliciId: kip === "kisiler" ? secilenler[0]?.id : undefined,
        })
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Önizleme hazırlanamadı."));
    } finally {
      setOnizleniyor(false);
    }
  };

  const gonder = async () => {
    if ("hata" in dogrulama) {
      setHata(t(dogrulama.hata));
      return;
    }
    if (!tekil) {
      const onay = window.confirm(
        t("{n} kişiye e-posta gönderilecek. Bu işlem geri alınamaz. Devam edilsin mi?", { n: aliciSayisi ?? "?" })
      );
      if (!onay) return;
    }
    setHata("");
    setBilgi("");
    setGonderiliyor(true);
    try {
      const k = await epostaYonetimi.kampanyaOlustur(dogrulama.temiz);
      setSonuc(k);
      onGonderildi();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("E-posta gönderilemedi."));
    } finally {
      setGonderiliyor(false);
    }
  };

  const yeniden = () => {
    setSonuc(null);
    setOnizleme(null);
    setKonu("");
    setBaslik("");
    setGovde("");
    setLink("");
    setDugmeMetni("");
    setIstek("");
    setSecilenler([]);
    setBilgi("");
  };

  if (sonuc) {
    const gitti = sonuc.tur === "tekil" && sonuc.gonderilen > 0;
    return (
      <div style={{ ...kart(c), display: "flex", flexDirection: "column", gap: 10 }}>
        <strong style={{ fontSize: 16, color: c.textPrimary }}>
          {sonuc.tur === "tekil"
            ? gitti
              ? t("E-posta gönderildi.")
              : t("E-posta gönderilemedi.")
            : t("Gönderim kuyruğa alındı.")}
        </strong>
        <span style={{ fontSize: 14, color: c.textSecondary, lineHeight: 1.5 }}>
          {sonuc.tur === "tekil"
            ? sonuc.aliciAdi ?? secilenler[0]?.fullName
            : t("{n} kişiye dakikada birkaç e-posta olacak şekilde gidiyor. İlerlemeyi Geçmiş sekmesinden izleyebilirsin.", {
                n: sonuc.aliciSayisi,
              })}
        </span>
        <div>
          <button type="button" style={dugme(c, "birincil")} onClick={yeniden}>
            {t("Yeni e-posta yaz")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ───────────── Alıcılar */}
      <section style={kart(c)}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["kisiler", "kitle"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKip(k)}
              style={{ ...dugme(c, kip === k ? "birincil" : "ikincil"), padding: "6px 12px" }}
            >
              {k === "kisiler" ? t("Kişiler") : t("Kitle")}
            </button>
          ))}
        </div>

        {kip === "kisiler" ? (
          <>
            <div style={etiket(c)}>{t("Kullanıcı ara (ad, e-posta, kullanıcı adı)")}</div>
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder={t("En az iki harf yaz…")}
              style={alan(c)}
            />
            {eslesenler.length > 0 && (
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 9, marginTop: 6, overflow: "hidden" }}>
                {eslesenler.map((u) => {
                  const gonderilemez = !u.emailVerifiedAt || !gercekEpostaMi(u.email);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSecilenler((s) => [...s, u]);
                        setArama("");
                      }}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        padding: "8px 11px",
                        border: "none",
                        borderBottom: `1px solid ${c.border}`,
                        background: c.surface,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 14, color: c.textPrimary }}>{u.fullName}</span>
                        <span style={{ fontSize: 12.5, color: c.textSecondary, marginLeft: 8 }}>{u.email}</span>
                      </span>
                      {gonderilemez && <span style={rozet(c)}>{t("adres doğrulanmamış")}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {secilenler.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {secilenler.map((u) => (
                  <span key={u.id} style={{ ...rozet(c, true), fontSize: 13, display: "inline-flex", gap: 6 }}>
                    {u.fullName}
                    <button
                      type="button"
                      aria-label={t("Çıkar")}
                      onClick={() => setSecilenler((s) => s.filter((x) => x.id !== u.id))}
                      style={{ border: "none", background: "transparent", color: c.accent, cursor: "pointer", padding: 0 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "8px 0 0", lineHeight: 1.5 }}>
              {tekil
                ? t("Tek kişi: e-posta hemen ve destek adresinden gider; kişi yanıtlayabilir. Kişinin ipucu tercihine bakılmaz.")
                : t("Birden fazla kişi toplu gönderim sayılır: ipucu ve duyuruları kapatmış olanlara gitmez.")}
            </p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <select value={kitle} onChange={(e) => setKitle(e.target.value as KitleTuru)} style={{ ...alan(c), width: "auto" }}>
                <option value="yeni">{t("Son günlerde kayıt olanlar")}</option>
                <option value="pasif">{t("Uzun süredir girmeyenler")}</option>
                <option value="herkes">{t("Herkes")}</option>
              </select>
              {kitle !== "herkes" && (
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: c.textPrimary }}>
                  <input
                    type="number"
                    min={1}
                    max={EPOSTA_KAMPANYA_SINIRI.gun}
                    value={gun}
                    onChange={(e) => setGun(Math.max(1, Number(e.target.value) || 1))}
                    style={{ ...alan(c), width: 80 }}
                  />
                  {t("gün")}
                </label>
              )}
              <span style={{ fontSize: 14, color: c.textSecondary }}>
                {kitleSayisi === null ? t("Sayılıyor…") : t("{n} kişi", { n: kitleSayisi })}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "8px 0 0", lineHeight: 1.5 }}>
              {t("Yalnızca doğrulanmış adresi olan ve ipucu/duyuruları kapatmamış kişiler sayılır. Her e-postada tek tık çıkış bağlantısı olur.")}
            </p>
          </>
        )}
      </section>

      {/* ───────────── Lio'ya taslak */}
      <section style={kart(c)}>
        <div style={{ ...etiket(c), fontWeight: 600, color: c.textPrimary }}>{t("Taslağı Lio'ya hazırlat (isteğe bağlı)")}</div>
        <textarea
          value={istek}
          onChange={(e) => setIstek(e.target.value)}
          rows={3}
          maxLength={EPOSTA_KAMPANYA_SINIRI.istek}
          placeholder={t("Örn: Yeni bütçe özelliğini anlatan, kısa ve samimi bir e-posta. Sonunda bütçe sekmesini denemeye davet etsin.")}
          style={{ ...alan(c), resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <select value={taslakDili} onChange={(e) => setTaslakDili(e.target.value as "tr" | "en")} style={{ ...alan(c), width: "auto" }}>
            <option value="tr">Türkçe</option> {/* dil:atla */}
            <option value="en">English</option> {/* dil:atla */}
          </select>
          <button
            type="button"
            disabled={!istek.trim() || taslakYaziliyor}
            onClick={() => void taslakYazdir()}
            style={{ ...dugme(c), opacity: !istek.trim() || taslakYaziliyor ? 0.55 : 1 }}
          >
            {taslakYaziliyor ? t("Lio yazıyor…") : t("Lio taslağı yazsın")}
          </button>
        </div>
      </section>

      {/* ───────────── Metin */}
      <section style={{ ...kart(c), display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={etiket(c)}>{t("Konu")}</div>
          <input value={konu} onChange={(e) => setKonu(e.target.value)} maxLength={EPOSTA_KAMPANYA_SINIRI.konu} style={alan(c)} />
        </div>
        <div>
          <div style={etiket(c)}>{t("Başlık")}</div>
          <input value={baslik} onChange={(e) => setBaslik(e.target.value)} maxLength={EPOSTA_KAMPANYA_SINIRI.baslik} style={alan(c)} />
        </div>
        <div>
          <div style={etiket(c)}>{t("Mesaj")}</div>
          <textarea
            value={govde}
            onChange={(e) => setGovde(e.target.value)}
            rows={8}
            maxLength={EPOSTA_KAMPANYA_SINIRI.govde}
            style={{ ...alan(c), resize: "vertical", lineHeight: 1.5 }}
          />
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
            {t("Paragrafları boş satırla ayır. Selam satırı alıcının adıyla kendiliğinden eklenir.")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 220px" }}>
            <div style={etiket(c)}>{t("Bağlantı (isteğe bağlı)")}</div>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/tasks · https://…" style={alan(c)} />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <div style={etiket(c)}>{t("Düğme metni")}</div>
            <input
              value={dugmeMetni}
              onChange={(e) => setDugmeMetni(e.target.value)}
              maxLength={EPOSTA_KAMPANYA_SINIRI.dugme}
              style={alan(c)}
            />
          </div>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={lioIle} onChange={(e) => setLioIle(e.target.checked)} style={{ width: 17, height: 17, marginTop: 2 }} />
          <span>
            <span style={{ fontSize: 14.5, color: c.textPrimary, fontWeight: 500 }}>
              {t("Lio her alıcıya kendi yorumuyla yazsın")}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary, lineHeight: 1.5, marginTop: 2 }}>
              {t(
                "Mesajın anlamı aynı kalır; Lio her kişiye farklı cümlelerle, kişinin dilinde ve hesabının durumuna göre yazar. Herkese birebir aynı metnin gitmesi spam süzgeçlerine takılma ihtimalini artırır. Maliyet alıcı başınadır ve kimsenin bakiyesinden düşmez."
              )}
            </span>
          </span>
        </label>
      </section>

      {onizleme && (
        <section style={{ ...kart(c), padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${c.border}`, fontSize: 13.5, color: c.textSecondary, lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary }}>{onizleme.konu}</strong>
            {onizleme.lio && (
              <div>
                {t("Bu örneği Lio {birim} birime yazdı.", { birim: birimYaz(onizleme.birim, locale) })}{" "}
                {aliciSayisi
                  ? t("{n} alıcı için yaklaşık {toplam} birim.", {
                      n: aliciSayisi,
                      toplam: birimYaz(onizleme.birim * aliciSayisi, locale),
                    })
                  : ""}
              </div>
            )}
          </div>
          <iframe title={t("E-posta önizlemesi")} srcDoc={`<meta charset="utf-8">${onizleme.html}`} style={{ width: "100%", height: 520, border: "none", background: "#f5f6f8" }} />
        </section>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}
      {bilgi && <p style={{ color: c.success, fontSize: 14, margin: 0 }}>{bilgi}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => void onizle()}
          disabled={onizleniyor || !konu.trim() || !baslik.trim() || !govde.trim()}
          style={{ ...dugme(c), opacity: onizleniyor || !konu.trim() || !baslik.trim() || !govde.trim() ? 0.55 : 1 }}
        >
          {onizleniyor ? t("Hazırlanıyor…") : lioIle ? t("Lio ile önizle") : t("Önizle")}
        </button>
        <button
          type="button"
          onClick={() => void gonder()}
          disabled={gonderiliyor || "hata" in dogrulama}
          style={{ ...dugme(c, "birincil"), opacity: gonderiliyor || "hata" in dogrulama ? 0.55 : 1 }}
        >
          {gonderiliyor
            ? t("Gönderiliyor…")
            : tekil
              ? t("Gönder")
              : t("{n} kişiye gönder", { n: aliciSayisi ?? "…" })}
        </button>
      </div>
      {"hata" in dogrulama && (konu || baslik || govde) && (
        <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, textAlign: "right" }}>{t(dogrulama.hata)}</p>
      )}
    </div>
  );
}
