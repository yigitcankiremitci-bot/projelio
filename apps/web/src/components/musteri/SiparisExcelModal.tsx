import { useEffect, useMemo, useRef, useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  type AliciKarari,
  type OdemeYontemi,
  type Party,
  type Product,
  type SatisKanaliTuru,
  type SiparisAktarimAlicisi,
  type SiparisAktarimDuzeltmeleri,
  type SiparisAktarimSonucu,
} from "@projelio/shared";
import { api } from "../../api/client";
import { partyApi, siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara, fmtTarih } from "../butce/butceBicim";
import { IconUpload } from "../icons";
import Modal from "../Modal";

// dil:anahtar-baslangic — etiketler; çeviri kullanım yerinde (t())
const KARAR_ETIKET: Record<AliciKarari, string> = {
  mevcut: "Mevcut müşteri",
  yeni: "Yeni müşteri kartı",
  kanal: "Kanala (tek seferlik)",
  atla: "Alma",
};
const TUR_ETIKET: Record<SatisKanaliTuru, string> = {
  pazaryeri: "Pazaryeri",
  web: "Kendi sitesi",
  eczane: "Eczane",
  doktor: "Doktor",
  bayi: "Bayi / dağıtıcı",
  diger: "Diğer",
};
// dil:anahtar-bitis

type Sekme = "mevcut" | "belirsiz" | "yeni" | "kanal" | "atla";
const SEKMELER: Sekme[] = ["mevcut", "belirsiz", "yeni", "kanal", "atla"];
const SATIR_TAVANI = 100;

function sekmesi(a: SiparisAktarimAlicisi): Sekme {
  if (a.guven === "belirsiz" && a.karar === "kanal") return "belirsiz";
  return a.karar;
}

/**
 * Sipariş listesini (Excel / CSV) içe aktarma.
 *
 * Müşteri içe aktarmayla aynı iki adım: dosya seçilince sunucu yalnızca
 * ÖNİZLER; kullanıcı ürün sütunlarını, kanal ayarlarını ve alıcı
 * eşleşmelerini düzeltir, her düzeltmede önizleme tazelenir; "N siparişi
 * aktar" aynı dosyayı düzeltmelerle yeniden gönderir. Sunucu iki istek
 * arasında durum tutmaz (bkz. backend siparis-aktarim.service.ts).
 *
 * Kararlar alıcı ANAHTARIYLA tutulur, satırla değil: aynı kişinin bütün
 * siparişleri aynı karta ya da kanala gider.
 *
 * Tahsilat yazılmaz: siparişler "bekliyor" girer, muhasebe Tahsilat
 * ekranından tek tek ya da toplu "tahsil edildi" der.
 */
export default function SiparisExcelModal({
  organizationId,
  onKapat,
  onAktarildi,
}: {
  organizationId: string;
  onKapat: () => void;
  onAktarildi: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const girdi = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<File | null>(null);
  const [sonuc, setSonuc] = useState<SiparisAktarimSonucu | null>(null);
  const [d, setD] = useState<SiparisAktarimDuzeltmeleri>({});
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [sekme, setSekme] = useState<Sekme>("mevcut");
  const [arama, setArama] = useState("");
  const [atlananAcik, setAtlananAcik] = useState(false);
  const [urunler, setUrunler] = useState<Product[]>([]);
  const [musteriler, setMusteriler] = useState<Party[]>([]);
  const istek = useRef(0);

  useEffect(() => {
    api.get<Product[]>(`/organizations/${organizationId}/products`).then(setUrunler).catch(() => setUrunler([]));
    partyApi
      .musterilerim(`/organizations/${organizationId}`)
      .then((r) => setMusteriler(r.musteriler))
      .catch(() => setMusteriler([]));
  }, [organizationId]);

  const gonder = async (f: File, duz: SiparisAktarimDuzeltmeleri, onizleme: boolean) => {
    const no = ++istek.current;
    setCalisiyor(true);
    setHata("");
    try {
      const r = await siparisApi.iceAktar(organizationId, f, duz, onizleme);
      // Arka arkaya iki düzeltmede geç gelen eski önizleme yenisini ezmesin.
      if (no !== istek.current) return;
      setSonuc(r);
      if (!onizleme) onAktarildi();
    } catch (err) {
      if (no !== istek.current) return;
      setHata(err instanceof Error ? err.message : t("Dosya okunamadı."));
    } finally {
      if (no === istek.current) setCalisiyor(false);
    }
  };

  // Düzeltme değişince önizleme tazelenir (kısa bekleme: tarih yazarken her tuşta değil).
  useEffect(() => {
    if (!dosya || sonuc?.onizleme === false) return;
    const z = setTimeout(() => void gonder(dosya, d, true), 350);
    return () => clearTimeout(z);
  }, [d, dosya]);

  const duzelt = (fn: (x: SiparisAktarimDuzeltmeleri) => SiparisAktarimDuzeltmeleri) => setD((x) => fn({ ...x }));
  const aliciKarari = (a: SiparisAktarimAlicisi, karar: AliciKarari, partyId?: string, ad?: string) =>
    duzelt((x) => ({
      ...x,
      alicilar: { ...(x.alicilar ?? {}), [a.anahtar]: { karar, partyId, ad: ad ?? x.alicilar?.[a.anahtar]?.ad } },
    }));

  const sayilar = useMemo(() => {
    const m: Record<Sekme, { alici: number; siparis: number }> = {
      mevcut: { alici: 0, siparis: 0 },
      belirsiz: { alici: 0, siparis: 0 },
      yeni: { alici: 0, siparis: 0 },
      kanal: { alici: 0, siparis: 0 },
      atla: { alici: 0, siparis: 0 },
    };
    for (const a of sonuc?.alicilar ?? []) {
      const s = sekmesi(a);
      m[s].alici += 1;
      m[s].siparis += a.siparisSayisi;
    }
    return m;
  }, [sonuc]);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return (sonuc?.alicilar ?? []).filter(
      (a) => sekmesi(a) === sekme && (!q || a.ad.toLocaleLowerCase("tr").includes(q) || (a.partyAdi ?? "").toLocaleLowerCase("tr").includes(q))
    );
  }, [sonuc, sekme, arama]);

  const atlananOzeti = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of sonuc?.atlanan ?? []) {
      const n = a.neden.replace(/:.*$/, "");
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [sonuc]);

  const atlananlariIndir = () => {
    const hucre = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv =
      "﻿" +
      [[t("Satır"), t("Neden"), t("Satırın özeti")], ...(sonuc?.atlanan ?? []).map((a) => [a.satir, a.neden, a.ozet])]
        .map((r) => r.map(hucre).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("atlanan-satirlar")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const bitti = sonuc && !sonuc.onizleme;
  const secim: React.CSSProperties = { fontSize: 12, padding: "4px 6px", maxWidth: "100%" };
  const th: React.CSSProperties = { textAlign: "left", fontWeight: 500, color: c.textSecondary, padding: "4px 6px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "4px 6px", verticalAlign: "middle", color: c.textPrimary };
  const kutu: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    background: c.background,
    border: `1px solid ${c.border}`,
    fontSize: 13,
    color: c.textPrimary,
  };
  const baslik = (s: string) => <span style={{ fontSize: 14, fontWeight: 500 }}>{s}</span>;

  return (
    <Modal title={t("Excel'den sipariş aktar")} onClose={onKapat} maxWidth={980} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!bitti && (
          <div
            onClick={() => girdi.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setSonuc(null);
                setDosya(f);
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "16px 12px",
              borderRadius: 10,
              border: `2px dashed ${c.border}`,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <IconUpload size={22} color={c.primary} />
            <span style={{ fontSize: 14, color: c.textPrimary }}>{dosya ? dosya.name : t("Sipariş listesini buraya bırakın ya da seçmek için tıklayın")}</span>
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("Her satır bir sipariş: Tarih, Kanal (çıkış yeri), Alıcı, Tutar ve ürün başına adet sütunları. Ya da satır başına bir ürün: Ürün, Miktar.")}
            </span>
            <input
              ref={girdi}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setSonuc(null);
                  setDosya(f);
                }
                e.target.value = "";
              }}
            />
          </div>
        )}

        {dosya && !bitti && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textPrimary, flexWrap: "wrap" }}>
            {t("Bu tarihten itibaren al:")}
            <input
              type="date"
              value={d.baslangic ?? ""}
              onChange={(e) => duzelt((x) => ({ ...x, baslangic: e.target.value || undefined }))}
              style={secim}
            />
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Boşsa dosyadaki tüm tarihler.")}</span>
          </label>
        )}

        {calisiyor && <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>{t("Dosya okunuyor…")}</p>}
        {hata && <p style={{ margin: 0, fontSize: 13, color: c.danger }}>{hata}</p>}

        {sonuc && (
          <div style={kutu}>
            <div style={{ fontSize: 15, fontWeight: 500, color: bitti ? c.success : c.textPrimary }}>
              {bitti
                ? t("{n} sipariş aktarıldı.", { n: sonuc.yazilan ?? 0 })
                : t("{n} sipariş aktarılacak · {tutar}", { n: sonuc.siparisSayisi, tutar: fmtPara(sonuc.toplamTutar, "TRY") })}
            </div>
            <div style={{ color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
              {sonuc.ilkTarih && sonuc.sonTarih && <span>{`${fmtTarih(sonuc.ilkTarih)} – ${fmtTarih(sonuc.sonTarih)}`}</span>}
              <span>{t("{n} kalem", { n: sonuc.kalemSayisi })}</span>
              <span>{t("Dosyada {n} satır", { n: sonuc.dosyaSatiri })}</span>
              {sonuc.oncekiSatir > 0 && <span>{t("{n} satır başlangıç tarihinden önce", { n: sonuc.oncekiSatir })}</span>}
            </div>
            {bitti && (
              <div style={{ color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                {(sonuc.zatenVar ?? 0) > 0 && <span>{t("{n} sipariş zaten aktarılmıştı, atlandı", { n: sonuc.zatenVar })}</span>}
                {(sonuc.acilanKart ?? 0) > 0 && <span>{t("{n} yeni müşteri kartı açıldı", { n: sonuc.acilanKart })}</span>}
                {(sonuc.acilanKanal ?? 0) > 0 && <span>{t("{n} satış kanalı açıldı", { n: sonuc.acilanKanal })}</span>}
                <span>{t("Siparişler tahsilatsız girdi; tahsil edilenleri Tahsilat ekranından işaretleyin.")}</span>
              </div>
            )}
          </div>
        )}

        {sonuc && !bitti && (
          <>
            {/* ------------------------------------------------ Ürün sütunları */}
            <div style={kutu}>
              {baslik(t("Ürünler"))}
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("Kalem fiyatları dosyadaki tutardan, katalog fiyatı (KDV dahil) oranında dağıtılır.")}
              </span>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={th}>{t("Dosyadaki sütun")}</th>
                      <th style={th}>{t("Adet")}</th>
                      <th style={th}>{t("Katalogdaki ürün")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sonuc.urunSutunlari.map((u) => {
                      const secilen = d.urunSutunlari && u.baslik in d.urunSutunlari ? d.urunSutunlari[u.baslik] : u.productId ?? "";
                      return (
                        <tr key={u.baslik} style={{ borderBottom: `1px solid ${c.border}` }}>
                          <td style={td}>{u.baslik}</td>
                          <td style={td}>{u.adet}</td>
                          <td style={td}>
                            <select
                              value={secilen === null ? "__alma" : secilen}
                              onChange={(e) =>
                                duzelt((x) => ({
                                  ...x,
                                  urunSutunlari: {
                                    ...(x.urunSutunlari ?? {}),
                                    [u.baslik]: e.target.value === "__alma" ? null : e.target.value,
                                  },
                                }))
                              }
                              style={{ ...secim, borderColor: u.productId || secilen === null ? undefined : c.warning, width: "100%" }}
                            >
                              <option value="">{t("Eşleşmedi — açıklamalı kalem olarak al")}</option>
                              {u.adaylar.length > 0 && (
                                <optgroup label={t("Önerilen")}>
                                  {u.adaylar.map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {x.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label={t("Katalog")}>
                                {urunler.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.name}
                                  </option>
                                ))}
                              </optgroup>
                              <option value="__alma">{t("Bu sütunu alma")}</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ------------------------------------------------ Kanallar */}
            {sonuc.kanallar.length > 0 && (
              <div style={kutu}>
                {baslik(t("Satış kanalları"))}
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {t("Siparişin vadesi ve ödeme yöntemi kanaldan gelir. Var olan kanalın ayarı Satış kanalları ekranından değişir.")}
                </span>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                        <th style={th}>{t("Kanal")}</th>
                        <th style={th}>{t("Sipariş")}</th>
                        <th style={th}>{t("Tutar")}</th>
                        <th style={th}>{t("Tür")}</th>
                        <th style={th}>{t("Vade (gün)")}</th>
                        <th style={th}>{t("Ödeme yöntemi")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sonuc.kanallar.map((k) => {
                        const ayar = (v: Partial<{ tur: SatisKanaliTuru; vadeGun: number; odemeYontemi: OdemeYontemi }>) =>
                          duzelt((x) => ({ ...x, kanallar: { ...(x.kanallar ?? {}), [k.ad]: { ...(x.kanallar?.[k.ad] ?? {}), ...v } } }));
                        return (
                          <tr key={k.ad} style={{ borderBottom: `1px solid ${c.border}` }}>
                            <td style={td}>
                              {k.ad}
                              {k.yeni && <span style={{ color: c.primary, marginLeft: 6 }}>{t("yeni")}</span>}
                            </td>
                            <td style={td}>{k.siparisSayisi}</td>
                            <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtPara(k.tutar, "TRY")}</td>
                            <td style={td}>
                              <select value={k.tur} disabled={!k.yeni} onChange={(e) => ayar({ tur: e.target.value as SatisKanaliTuru })} style={secim}>
                                {(Object.keys(TUR_ETIKET) as SatisKanaliTuru[]).map((x) => (
                                  <option key={x} value={x}>
                                    {t(TUR_ETIKET[x])}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={td}>
                              <input
                                // Tür değişince sunucunun önerdiği vade de değişir; anahtar
                                // değişmezse kutu eski sayıyı göstermeye devam ederdi.
                                key={`${k.ad}|${k.tur}|${k.vadeGun}`}
                                type="number"
                                min={0}
                                disabled={!k.yeni}
                                defaultValue={k.vadeGun}
                                onBlur={(e) => {
                                  const gun = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                  if (gun !== k.vadeGun) ayar({ vadeGun: gun });
                                }}
                                style={{ ...secim, width: 64 }}
                              />
                            </td>
                            <td style={td}>
                              <select
                                value={k.odemeYontemi}
                                disabled={!k.yeni}
                                onChange={(e) => ayar({ odemeYontemi: e.target.value as OdemeYontemi })}
                                style={secim}
                              >
                                {ODEME_YONTEMLERI.map((y) => (
                                  <option key={y} value={y}>
                                    {t(ODEME_YONTEMI_ETIKET[y])}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ------------------------------------------------ Alıcılar */}
            <div style={kutu}>
              {baslik(t("Alıcılar"))}
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("Mevcut müşteriyle eşleşen alıcının siparişleri o karta yazılır. Eşleşmeyen ama birden çok siparişi olan için yeni kart açılır; tek seferlik alıcılar kanalında toplanır.")}
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SEKMELER.filter((s) => sayilar[s].alici > 0 || s === sekme).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSekme(s)}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: `1px solid ${s === sekme ? c.primary : c.border}`,
                      background: s === sekme ? `${c.primary}15` : "transparent",
                      color: s === "belirsiz" ? c.warning : c.textPrimary,
                      cursor: "pointer",
                    }}
                  >
                    {s === "belirsiz" ? t("Karar bekleyen") : t(KARAR_ETIKET[s])} · {sayilar[s].alici}
                    <span style={{ color: c.textSecondary }}> ({t("{n} sipariş", { n: sayilar[s].siparis })})</span>
                  </button>
                ))}
              </div>
              <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder={t("Alıcı ara")} style={{ ...secim, fontSize: 13 }} />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={th}>{t("Dosyadaki alıcı")}</th>
                      <th style={th}>{t("Sipariş")}</th>
                      <th style={th}>{t("Tutar")}</th>
                      <th style={th}>{t("Nereye")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gorunen.slice(0, SATIR_TAVANI).map((a) => (
                      <tr key={a.anahtar} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={td}>
                          {a.ad}
                          <div style={{ fontSize: 11, color: c.textSecondary }}>{[a.kanallar.join(", "), a.il].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td style={td}>{a.siparisSayisi}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtPara(a.tutar, "TRY")}</td>
                        <td style={{ ...td, minWidth: 240 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <select
                              value={a.karar === "mevcut" ? `p:${a.partyId}` : a.karar}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v.startsWith("p:")) aliciKarari(a, "mevcut", v.slice(2));
                                else aliciKarari(a, v as AliciKarari);
                              }}
                              style={{ ...secim, width: "100%" }}
                            >
                              {(a.adaylar ?? []).length > 0 && (
                                <optgroup label={t("Önerilen")}>
                                  {a.adaylar!.map((x) => (
                                    <option key={x.id} value={`p:${x.id}`}>
                                      {x.ad}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <option value="yeni">{t("Yeni müşteri kartı aç")}</option>
                              <option value="kanal" disabled={a.kanallar.length === 0}>
                                {t("Kanala yaz (tek seferlik)")}
                              </option>
                              <option value="atla">{t("Bu alıcının siparişlerini alma")}</option>
                              <optgroup label={t("Tüm müşteriler")}>
                                {musteriler.map((m) => (
                                  <option key={m.id} value={`p:${m.id}`}>
                                    {m.displayName}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            {a.karar === "mevcut" && a.guven && (
                              <span style={{ fontSize: 11, color: a.guven === "kesin" ? c.success : c.textSecondary }}>
                                {a.guven === "kesin" ? t("Eczane adı birebir eşleşti") : t("Olası eşleşme — kontrol edin")}
                              </span>
                            )}
                            {a.karar === "yeni" && (
                              <input
                                defaultValue={a.yeniKartAdi}
                                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== a.yeniKartAdi && aliciKarari(a, "yeni", undefined, e.target.value.trim())}
                                aria-label={t("Yeni kartın adı")}
                                style={{ ...secim, width: "100%" }}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {gorunen.length > SATIR_TAVANI && (
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {t("İlk {n} alıcı gösteriliyor; diğerleri için arayın.", { n: SATIR_TAVANI })}
                </span>
              )}
            </div>

            {/* ------------------------------------------------ Atlananlar */}
            {sonuc.atlanan.length > 0 && (
              <div style={kutu}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  {baslik(t("{n} satır alınmayacak", { n: sonuc.atlanan.length }))}
                  <button onClick={atlananlariIndir} style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}>
                    {t("CSV indir")}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", color: c.textSecondary }}>
                  {atlananOzeti.map(([n, sayi]) => (
                    <span key={n}>
                      {t(n)}: {sayi}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setAtlananAcik((x) => !x)}
                  style={{ alignSelf: "flex-start", padding: 0, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", fontSize: 12 }}
                >
                  {atlananAcik ? t("Satırları gizle ▾") : t("Satırları göster ▸")}
                </button>
                {atlananAcik && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: c.textSecondary }}>
                    {sonuc.atlanan.slice(0, 200).map((a) => (
                      <li key={a.satir}>{t("{n}. satır: {neden} — {ozet}", { n: a.satir, neden: a.neden, ozet: a.ozet })}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        {bitti ? (
          <button
            data-primary
            onClick={onKapat}
            style={{ background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 16, fontWeight: 500 }}
          >
            {t("Kapat")}
          </button>
        ) : (
          <button
            data-primary
            disabled={!dosya || !sonuc || sonuc.siparisSayisi === 0 || calisiyor}
            onClick={() => {
              if (!dosya || !sonuc) return;
              if (!window.confirm(t("{n} sipariş aktarılsın mı?", { n: sonuc.siparisSayisi }))) return;
              void gonder(dosya, d, false);
            }}
            style={{
              background: c.primary,
              color: c.onPrimary,
              padding: "11px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              fontWeight: 500,
              opacity: !dosya || !sonuc || sonuc.siparisSayisi === 0 ? 0.5 : 1,
            }}
          >
            {sonuc ? t("{n} siparişi aktar", { n: sonuc.siparisSayisi }) : t("Siparişleri aktar")}
          </button>
        )}
      </div>
    </Modal>
  );
}
