import { useCallback, useEffect, useState } from "react";
import { billingApi, type AdminIndirimKodu, type YeniIndirimKodu } from "../api/billing";
import { ApiError } from "../api/client";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Yönetici: indirim kodları (abonelik + Lio Bakiyesi).
 *
 * Kodun değeri oluşturulduktan sonra DEĞİŞTİRİLEMEZ, yalnızca kapatılır:
 * kodu kullanmış abonelerin yenilemeleri bu satıra bakıyor (bkz. migration 140).
 * İndirimli tutar 1 ₺'nin altına inmez — PayTR 0 ₺ ödeme almıyor.
 */
const PAKETLER = [
  { key: "starter", ad: "Starter" },
  { key: "pro", ad: "Pro" },
  { key: "business", ad: "Business" },
];

const BOS: YeniIndirimKodu = {
  kod: "",
  aciklama: "",
  tur: "yuzde",
  deger: 10,
  kapsam: "abonelik",
  planKeys: [],
  periods: [],
  sure: "ilk",
  donemSayisi: null,
  sonTarih: null,
  kullanimSiniri: null,
};

export default function IndirimKodlariPanel() {
  const c = useThemeColors();
  const t = useT();
  const [kodlar, setKodlar] = useState<AdminIndirimKodu[]>([]);
  const [taslak, setTaslak] = useState<YeniIndirimKodu>(BOS);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const yenile = useCallback(() => {
    billingApi.admin.indirimKodlari().then(setKodlar).catch(() => {});
  }, []);
  useEffect(yenile, [yenile]);

  const olustur = async () => {
    setMesgul(true);
    setMesaj(null);
    try {
      await billingApi.admin.indirimKoduOlustur({
        ...taslak,
        donemSayisi: taslak.sure === "donem" ? taslak.donemSayisi ?? 1 : null,
        // Tarih kutusu gün verir; kod o günün SONUNA kadar geçerli olsun.
        sonTarih: taslak.sonTarih ? new Date(`${taslak.sonTarih}T23:59:59`).toISOString() : null,
      });
      setMesaj(t("İndirim kodu oluşturuldu."));
      setTaslak(BOS);
      yenile();
    } catch (h) {
      setMesaj(h instanceof ApiError ? h.message : t("Kod oluşturulamadı."));
    } finally {
      setMesgul(false);
    }
  };

  const aktiflik = async (k: AdminIndirimKodu) => {
    try {
      await billingApi.admin.indirimKoduAktiflik(k.id, !k.aktif);
      yenile();
    } catch (h) {
      setMesaj(h instanceof ApiError ? h.message : t("Kaydedilemedi."));
    }
  };

  const secimDegistir = (alan: "planKeys" | "periods", deger: string) => {
    const mevcut = taslak[alan] ?? [];
    setTaslak({ ...taslak, [alan]: mevcut.includes(deger) ? mevcut.filter((d) => d !== deger) : [...mevcut, deger] });
  };

  const etiket: React.CSSProperties = { color: c.textSecondary, fontSize: 12.5, display: "grid", gap: 4 };
  const girdi: React.CSSProperties = {
    background: c.background,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.textPrimary,
    padding: "7px 9px",
    fontSize: 13.5,
  };

  const degerMetni = (k: AdminIndirimKodu) =>
    k.tur === "yuzde" ? `%${k.deger}` : `${k.deger.toLocaleString(bicimDili())} ₺`;
  const sureMetni = (k: AdminIndirimKodu) =>
    k.sure === "surekli" ? t("süresiz") : k.sure === "donem" ? t("ilk {n} ödeme", { n: k.donemSayisi ?? 1 }) : t("ilk ödeme");
  const kapsamMetni = (k: AdminIndirimKodu) =>
    k.kapsam === "hepsi" ? t("abonelik + Lio") : k.kapsam === "lio" ? t("Lio Bakiyesi") : t("abonelik");

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ color: c.textPrimary, fontSize: 15, fontWeight: 500, margin: "0 0 6px" }}>{t("İndirim kodları")}</h3>
      <p style={{ color: c.textSecondary, fontSize: 13.5, margin: "0 0 12px", maxWidth: 640, lineHeight: 1.55 }}>
        {t("Kodu müşteri ödeme formunda girer. İndirimli tutar 1 ₺'nin altına inmez. Oluşturulan kodun değeri değiştirilemez, yalnızca kapatılabilir.")}
      </p>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          padding: 14,
          maxWidth: 820,
        }}
      >
        <label style={etiket}>
          {t("Kod")}
          <input value={taslak.kod} onChange={(e) => setTaslak({ ...taslak, kod: e.target.value.toUpperCase() })} placeholder="KURUCU30" style={girdi} />
        </label>
        <label style={etiket}>
          {t("Tür")}
          <select value={taslak.tur} onChange={(e) => setTaslak({ ...taslak, tur: e.target.value as "yuzde" | "tutar" })} style={girdi}>
            <option value="yuzde">{t("Yüzde (%)")}</option>
            <option value="tutar">{t("Sabit tutar (₺)")}</option>
          </select>
        </label>
        <label style={etiket}>
          {taslak.tur === "yuzde" ? t("İndirim (%)") : t("İndirim (₺)")}
          <input type="number" min={0} max={taslak.tur === "yuzde" ? 100 : undefined} value={taslak.deger} onChange={(e) => setTaslak({ ...taslak, deger: Number(e.target.value) })} style={girdi} />
        </label>
        <label style={etiket}>
          {t("Nerede geçerli")}
          <select value={taslak.kapsam} onChange={(e) => setTaslak({ ...taslak, kapsam: e.target.value as YeniIndirimKodu["kapsam"] })} style={girdi}>
            <option value="abonelik">{t("Abonelik")}</option>
            <option value="lio">{t("Lio Bakiyesi")}</option>
            <option value="hepsi">{t("Abonelik + Lio Bakiyesi")}</option>
          </select>
        </label>
        {taslak.kapsam !== "lio" && (
          <label style={etiket}>
            {t("Abonelikte süre")}
            <select value={taslak.sure} onChange={(e) => setTaslak({ ...taslak, sure: e.target.value as YeniIndirimKodu["sure"] })} style={girdi}>
              <option value="ilk">{t("Yalnızca ilk ödeme")}</option>
              <option value="donem">{t("İlk N ödeme")}</option>
              <option value="surekli">{t("Süresiz")}</option>
            </select>
          </label>
        )}
        {taslak.kapsam !== "lio" && taslak.sure === "donem" && (
          <label style={etiket}>
            {t("Ödeme sayısı")}
            <input type="number" min={1} value={taslak.donemSayisi ?? 1} onChange={(e) => setTaslak({ ...taslak, donemSayisi: Number(e.target.value) })} style={girdi} />
          </label>
        )}
        <label style={etiket}>
          {t("Son tarih (isteğe bağlı)")}
          <input type="date" value={taslak.sonTarih ?? ""} onChange={(e) => setTaslak({ ...taslak, sonTarih: e.target.value || null })} style={girdi} />
        </label>
        <label style={etiket}>
          {t("Toplam kullanım sınırı (isteğe bağlı)")}
          <input
            type="number"
            min={1}
            value={taslak.kullanimSiniri ?? ""}
            onChange={(e) => setTaslak({ ...taslak, kullanimSiniri: e.target.value ? Number(e.target.value) : null })}
            placeholder={t("sınırsız")}
            style={girdi}
          />
        </label>
        <label style={{ ...etiket, gridColumn: "1 / -1" }}>
          {t("Açıklama (yalnızca sen görürsün)")}
          <input value={taslak.aciklama ?? ""} onChange={(e) => setTaslak({ ...taslak, aciklama: e.target.value })} style={girdi} />
        </label>
        {taslak.kapsam !== "lio" && (
          <div style={{ ...etiket, gridColumn: "1 / -1", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <span>{t("Paket sınırı (boşsa hepsi):")}</span>
            {PAKETLER.map((p) => (
              <label key={p.key} style={{ display: "flex", gap: 4, alignItems: "center", color: c.textPrimary }}>
                <input type="checkbox" checked={(taslak.planKeys ?? []).includes(p.key)} onChange={() => secimDegistir("planKeys", p.key)} />
                {p.ad}
              </label>
            ))}
            <span style={{ marginLeft: 10 }}>{t("Dönem:")}</span>
            {(["monthly", "yearly"] as const).map((d) => (
              <label key={d} style={{ display: "flex", gap: 4, alignItems: "center", color: c.textPrimary }}>
                <input type="checkbox" checked={(taslak.periods ?? []).includes(d)} onChange={() => secimDegistir("periods", d)} />
                {d === "monthly" ? t("Aylık") : t("Yıllık")}
              </label>
            ))}
          </div>
        )}
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={olustur}
            disabled={mesgul || !taslak.kod.trim()}
            style={{ border: "none", borderRadius: 8, background: c.primaryDark, color: "#fff", padding: "8px 14px", fontSize: 13.5, cursor: "pointer" }}
          >
            {mesgul ? "…" : t("Kodu oluştur")}
          </button>
          {mesaj && <span style={{ fontSize: 13, color: c.textPrimary }}>{mesaj}</span>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 14, maxWidth: 820 }}>
        {kodlar.length === 0 && <div style={{ color: c.textSecondary, fontSize: 12.5 }}>{t("Henüz indirim kodu yok.")}</div>}
        {kodlar.map((k) => (
          <div
            key={k.id}
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
              fontSize: 13,
              color: c.textSecondary,
              opacity: k.aktif ? 1 : 0.55,
              borderBottom: `1px solid ${c.border}`,
              padding: "6px 0",
            }}
          >
            <strong style={{ color: c.textPrimary, minWidth: 110 }}>{k.kod}</strong>
            <span>{degerMetni(k)}</span>
            <span>{kapsamMetni(k)}</span>
            {k.kapsam !== "lio" && <span>{sureMetni(k)}</span>}
            <span>
              {t("kullanım")}: {k.kullanimSayisi}
              {k.kullanimSiniri ? ` / ${k.kullanimSiniri}` : ""}
            </span>
            {k.sonTarih && <span>{t("son")}: {new Date(k.sonTarih).toLocaleDateString(bicimDili())}</span>}
            {k.aciklama && <span style={{ fontStyle: "italic" }}>{k.aciklama}</span>}
            <span style={{ flex: 1 }} />
            <button
              onClick={() => aktiflik(k)}
              style={{ border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, borderRadius: 8, padding: "4px 10px", fontSize: 12.5, cursor: "pointer" }}
            >
              {k.aktif ? t("Kapat") : t("Aç")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
