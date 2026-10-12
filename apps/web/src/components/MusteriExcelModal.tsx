import { useRef, useState } from "react";
import { BAGLANTI_MODUL_KEY, type BaglantiListeKaydi, type MusteriIceAktarmaSonucu } from "@projelio/shared";
import { api } from "../api/client";
import { partyApi } from "../api/party";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconDownload, IconUpload } from "./icons";
import Modal from "./Modal";

interface Props {
  /** Müşteri listesinin yolu (ör. /organizations/:id/party); yükleme `${yol}/import`. */
  scopePath: string;
  departmentId?: string;
  /** Bağlantı ve İlişkiler defterine yükler: ayrı şablon (önem, tanışma yeri…), kartlar müşteri listesine girmez. */
  baglanti?: boolean;
  onClose: () => void;
  /** Kartlar açıldıktan sonra liste tazelensin; bağlantı listesine aktarıldıysa listenin kimliği gelir. */
  onDone: (listeId?: string) => void;
  /** Yalnızca Bağlantılar: mevcut bağlantı listeleri ve o an açık olan liste (varsayılan hedef). */
  listeler?: BaglantiListeKaydi[];
  acikListeId?: string;
}

/** Yeni liste seçeneğinin değeri (liste kimlikleri UUID, çakışmaz). */
const YENI_LISTE = "__yeni";

/**
 * Excel ile toplu müşteri ekleme: şablonu indir → doldur → aynı pencereden yükle.
 *
 * İki adımlı: dosya seçilince sunucu yalnızca ÖNİZLER (hiçbir şey yazmaz),
 * kullanıcı "N müşteriyi ekle"ye basınca aynı dosya onizleme=0 ile yeniden
 * gider. Doğrudan yazmak, yanlış dosyada 300 kartı tek tek arşivletmek demekti.
 * Dosya iki kez gönderiliyor çünkü sunucu iki istek arasında durum tutmuyor
 * (bkz. PartyController.iceAktar).
 */
export default function MusteriExcelModal({
  scopePath,
  departmentId,
  baglanti = false,
  onClose,
  onDone,
  listeler = [],
  acikListeId,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const girdi = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<File | null>(null);
  const [sonuc, setSonuc] = useState<MusteriIceAktarmaSonucu | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [zatenAcik, setZatenAcik] = useState(false);
  // Bağlantılar: yüklenen liste hangi bağlantı listesine girsin. Varsayılan
  // açık sekme; o yoksa dosyanın adıyla YENİ bir liste — Excel'le gelen liste
  // mevcut bağlantılara karışmasın (kullanıcı isteği, 2026-10-12).
  const [listeSecimi, setListeSecimi] = useState<string>(acikListeId ?? YENI_LISTE);
  const [yeniListeAdi, setYeniListeAdi] = useState("");

  const gonder = async (f: File, onizleme: boolean) => {
    setCalisiyor(true);
    setHata("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      const q = new URLSearchParams({ onizleme: onizleme ? "1" : "0" });
      if (departmentId) q.set("departmentId", departmentId);
      if (baglanti) q.set("modul", BAGLANTI_MODUL_KEY);
      if (baglanti && !onizleme) {
        if (listeSecimi === YENI_LISTE) {
          if (yeniListeAdi.trim()) q.set("yeniListe", yeniListeAdi.trim());
        } else if (listeSecimi) q.set("listeId", listeSecimi);
      }
      const r = await api.uploadFile<MusteriIceAktarmaSonucu>(`${scopePath}/import?${q}`, fd);
      setSonuc(r);
      if (!onizleme) onDone(r.liste?.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Dosya okunamadı."));
      if (onizleme) setSonuc(null);
    } finally {
      setCalisiyor(false);
    }
  };

  const sec = (f: File | undefined) => {
    if (!f) return;
    setDosya(f);
    setZatenAcik(false);
    // Yeni listenin adı dosyanın adı: "Firdevs bağlantılar.xlsx" → "Firdevs bağlantılar".
    if (!yeniListeAdi.trim()) setYeniListeAdi(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    void gonder(f, true);
  };

  const sablonuIndir = () => {
    setHata("");
    const ad = baglanti ? t("Projelio bağlantı şablonu") : t("Projelio müşteri şablonu");
    partyApi
      .sablonuIndir(ad + ".xlsx", baglanti ? BAGLANTI_MODUL_KEY : undefined)
      .catch(() => setHata(t("Şablon indirilemedi.")));
  };

  const bitti = sonuc && !sonuc.onizleme;
  const listeyeGidecek = baglanti && (listeSecimi === YENI_LISTE ? !!yeniListeAdi.trim() : !!listeSecimi);
  // Yeni kart yoksa bile zaten kayıtlı olanlar seçilen listeye eklenebilir.
  const listeyeEklenecekMevcut = listeyeGidecek ? (sonuc?.zatenKayitli.filter((z) => z.mevcutId).length ?? 0) : 0;
  const uygulanabilir = !!sonuc && (sonuc.acilacak > 0 || listeyeEklenecekMevcut > 0);
  const adim = (n: number, baslik: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: c.primary,
          color: c.onPrimary,
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      {baslik}
    </div>
  );
  const satirListesi = (liste: { satir: number; sebep: string }[]) => (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: c.textSecondary }}>
      {liste.slice(0, 10).map((x, i) => (
        <li key={i}>{x.satir ? t("{n}. satır: {sebep}", { n: x.satir, sebep: x.sebep }) : x.sebep}</li>
      ))}
      {liste.length > 10 && <li>{t("… ve {n} satır daha", { n: liste.length - 10 })}</li>}
    </ul>
  );

  return (
    <Modal title={baglanti ? t("Excel ile toplu bağlantı ekle") : t("Excel ile toplu müşteri ekle")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!bitti && (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {adim(1, t("Şablonu indirip doldurun"))}
              <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
                {baglanti
                  ? t("Her satır bir bağlantı. Yalnızca Ad zorunlu; önem, nerede tanışıldığı ve sonraki temas da yazılabilir.")
                  : t("Her satır bir müşteri. Yalnızca Ad zorunlu; sütunların açıklaması dosyanın ikinci sayfasında.")}
              </p>
              <button
                onClick={sablonuIndir}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 16px",
                  borderRadius: 8,
                  border: `1px solid ${c.primary}`,
                  background: "transparent",
                  color: c.primary,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <IconDownload size={16} /> {t("Şablonu indir (.xlsx)")}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {adim(2, t("Doldurduğunuz dosyayı yükleyin"))}
              <div
                onClick={() => girdi.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setSurukleniyor(true);
                }}
                onDragLeave={() => setSurukleniyor(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSurukleniyor(false);
                  sec(e.dataTransfer.files?.[0]);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "18px 12px",
                  borderRadius: 10,
                  border: `2px dashed ${surukleniyor ? c.primary : c.border}`,
                  background: surukleniyor ? `${c.primary}10` : "transparent",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                <IconUpload size={22} color={c.primary} />
                <span style={{ fontSize: 14, color: c.textPrimary }}>
                  {dosya ? dosya.name : t("Dosyayı buraya bırakın ya da seçmek için tıklayın")}
                </span>
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {baglanti
                    ? t("Kendi listeniz de olur (.xlsx ya da .csv); tanınan sütunlar aktarılır.")
                    : t("Kendi müşteri listeniz de olur (.xlsx ya da .csv); tanınan sütunlar aktarılır.")}
                </span>
                <input
                  ref={girdi}
                  type="file"
                  accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    sec(e.target.files?.[0]);
                    // Aynı dosyayı düzeltip yeniden seçince de onChange tetiklensin.
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </>
        )}

        {calisiyor && <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>{t("Dosya okunuyor…")}</p>}
        {hata && <p style={{ margin: 0, fontSize: 13, color: c.danger }}>{hata}</p>}

        {sonuc && !calisiyor && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 12,
              borderRadius: 10,
              background: c.background,
              border: `1px solid ${c.border}`,
              fontSize: 13,
              color: c.textPrimary,
            }}
          >
            {bitti ? (
              <div style={{ fontSize: 15, fontWeight: 500, color: c.success }}>
                {baglanti
                  ? t("{n} bağlantı kartı açıldı.", { n: sonuc.acilan ?? 0 })
                  : t("{n} müşteri kartı açıldı.", { n: sonuc.acilan ?? 0 })}
                {sonuc.liste && (
                  <div style={{ fontSize: 13, fontWeight: 400, color: c.textPrimary, marginTop: 2 }}>
                    {t("\"{liste}\" listesinde {n} bağlantı var.", { liste: sonuc.liste.ad, n: sonuc.liste.eklenen })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {sonuc.acilacak > 0
                  ? baglanti
                    ? t("{n} satır okundu, {m} bağlantı eklenecek.", { n: sonuc.okunanSatir, m: sonuc.acilacak })
                    : t("{n} satır okundu, {m} müşteri eklenecek.", { n: sonuc.okunanSatir, m: sonuc.acilacak })
                  : baglanti
                    ? t("{n} satır okundu, eklenecek yeni bağlantı yok.", { n: sonuc.okunanSatir })
                    : t("{n} satır okundu, eklenecek yeni müşteri yok.", { n: sonuc.okunanSatir })}
              </div>
            )}

            {!bitti && sonuc.ornek.length > 0 && (
              <div style={{ color: c.textSecondary }}>
                {sonuc.ornek.map((o) => o.ad).join(", ")}
                {sonuc.acilacak > sonuc.ornek.length && ` ${t("ve {n} tane daha", { n: sonuc.acilacak - sonuc.ornek.length })}`}
              </div>
            )}

            {sonuc.zatenKayitli.length > 0 && (
              <div>
                <button
                  onClick={() => setZatenAcik((v) => !v)}
                  style={{ padding: 0, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", fontSize: 13 }}
                >
                  {listeyeGidecek
                    ? t("{n} tanesi zaten kayıtlı; yeni kart açılmaz, mevcut kart listeye eklenir", { n: sonuc.zatenKayitli.length })
                    : t("{n} tanesi zaten kayıtlı, atlanacak", { n: sonuc.zatenKayitli.length })}{" "}
                  {zatenAcik ? "▾" : "▸"}
                </button>
                {zatenAcik &&
                  satirListesi(
                    sonuc.zatenKayitli.map((z) => ({ satir: z.satir, sebep: `${z.ad} → ${z.mevcutKart} (${t(z.neden)})` }))
                  )}
              </div>
            )}

            {sonuc.atlanan.length > 0 && (
              <div style={{ color: c.warning }}>
                {t("{n} satır atlanacak:", { n: sonuc.atlanan.length })}
                {satirListesi(sonuc.atlanan)}
              </div>
            )}
            {sonuc.uyarilar.length > 0 && (
              <div style={{ color: c.warning }}>
                {t("Uyarılar:")}
                {satirListesi(sonuc.uyarilar)}
              </div>
            )}
            {sonuc.kullanilmayanSutunlar.length > 0 && (
              <div style={{ color: c.textSecondary }}>
                {t("Tanınmayan sütunlar aktarılmayacak: {liste}", { liste: sonuc.kullanilmayanSutunlar.join(", ") })}
              </div>
            )}
            {sonuc.hatalar.length > 0 && (
              <div style={{ color: c.danger }}>
                {t("Eklenemeyenler:")}
                {satirListesi(sonuc.hatalar)}
              </div>
            )}
            {sonuc.kalanIlkSatir && (
              <div style={{ color: c.warning }}>
                {t("Tek seferde en fazla 300 satır eklenir. Kalanlar için dosyayı {n}. satırdan başlatıp yeniden yükleyin.", {
                  n: sonuc.kalanIlkSatir,
                })}
              </div>
            )}
          </div>
        )}

        {baglanti && sonuc && !bitti && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: c.textPrimary }}>
            <span style={{ fontWeight: 500 }}>{t("Hangi bağlantı listesine eklensin?")}</span>
            <select
              value={listeSecimi}
              onChange={(e) => setListeSecimi(e.target.value)}
              style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }}
            >
              <option value={YENI_LISTE}>{t("+ Yeni liste")}</option>
              {listeler.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.ad} ({l.sayi})
                </option>
              ))}
              <option value="">{t("Listeye ekleme (yalnızca Tümü'nde görünür)")}</option>
            </select>
            {listeSecimi === YENI_LISTE && (
              <input
                value={yeniListeAdi}
                onChange={(e) => setYeniListeAdi(e.target.value)}
                maxLength={80}
                placeholder={t("Liste adı, ör. Firdevs — Ekim bağlantıları")}
                style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }}
              />
            )}
          </div>
        )}

        {bitti ? (
          <button
            data-primary
            onClick={onClose}
            style={{ background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 16, fontWeight: 500 }}
          >
            {t("Kapat")}
          </button>
        ) : (
          <button
            data-primary
            disabled={!dosya || !uygulanabilir || calisiyor}
            onClick={() => dosya && gonder(dosya, false)}
            style={{
              background: c.primary,
              color: c.onPrimary,
              padding: "11px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              fontWeight: 500,
              opacity: !dosya || !uygulanabilir ? 0.5 : 1,
            }}
          >
            {sonuc && sonuc.acilacak === 0 && listeyeEklenecekMevcut > 0
              ? t("{n} kayıtlı bağlantıyı listeye ekle", { n: listeyeEklenecekMevcut })
              : sonuc && sonuc.acilacak > 0
              ? baglanti
                ? t("{n} bağlantıyı ekle", { n: sonuc.acilacak })
                : t("{n} müşteriyi ekle", { n: sonuc.acilacak })
              : baglanti
                ? t("Bağlantıları ekle")
                : t("Müşterileri ekle")}
          </button>
        )}
      </div>
    </Modal>
  );
}
