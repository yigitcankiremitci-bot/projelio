import { useEffect, useMemo, useRef, useState } from "react";
import {
  KARTVIZIT_ALAN_ADI,
  KARTVIZIT_SINIRLAR,
  KARTVIZIT_SOSYAL,
  kartvizitAdresHatasi,
  kartvizitAdresi,
  kartvizitQrSvg,
  kartvizitSosyalNormallestir,
  type Kartvizit,
  type KartvizitAdresHatasi,
  type KartvizitGirdisi,
  type KartvizitSosyalAnahtar,
} from "@projelio/shared";
import { api, ApiError } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { cropAvatarImage, type CropArea } from "../../lib/imageProcessing";
import { useT } from "../../lib/i18n";
import Modal from "../Modal";
import AvatarCropper from "../AvatarCropper";
import { IconCopy, IconDownload, IconExternalLink, IconQr, IconUser } from "../icons";
import { pngIndir, svgIndir, svgVeriAdresi } from "./kartvizitIndir";

/**
 * Dijital kartvizit penceresi: kişi kartındaki QR rozetinden ya da "Profili
 * düzenle"nin altından açılır (bkz. ProfileCard, EditProfileModal).
 *
 * Kullanıcı bir adres seçer (adından türetilmiş, boşta olan öneriler hazır
 * gelir), bilgilerini — çoğu profilden dolu — gözden geçirir, kaydeder.
 * Kayıttan sonra logolu QR'ı PNG/SVG indirir, bağlantıyı kopyalar. Ücretsiz.
 *
 * Fotoğraf ayrı saklanmaz: Projelio profil fotoğrafıdır. Burada değiştirilince
 * profilde de değişir (aynı uç: /users/me/avatar).
 */

interface Durum {
  kart: Kartvizit | null;
  profil: { fullName: string; title: string | null; phone: string | null; email: string | null; avatarUrl: string | null };
  oneriler: string[];
}

interface Props {
  onClose: () => void;
  /** Fotoğraf değişince kişi kartı da yenilensin. */
  onProfilDegisti?: () => void;
}

type Form = Required<Omit<KartvizitGirdisi, "sosyal">> & { sosyal: Record<KartvizitSosyalAnahtar, string> };

const BOS_SOSYAL = Object.fromEntries(KARTVIZIT_SOSYAL.map((s) => [s.anahtar, ""])) as Record<KartvizitSosyalAnahtar, string>;
const ONE_CIKAN_SOSYAL: KartvizitSosyalAnahtar[] = ["instagram", "linkedin", "x", "youtube"];

function formdan(d: Durum): Form {
  const k = d.kart;
  if (k) {
    return {
      adres: k.adres,
      fullName: k.fullName,
      title: k.title ?? "",
      titleEn: k.titleEn ?? "",
      phone: k.phone ?? "",
      email: k.email ?? "",
      website: k.website ?? "",
      location: k.location ?? "",
      tagline: k.tagline ?? "",
      taglineEn: k.taglineEn ?? "",
      sosyal: { ...BOS_SOSYAL, ...k.sosyal },
      showPhoto: k.showPhoto,
      active: k.active,
    };
  }
  return {
    adres: d.oneriler[0] ?? "",
    fullName: d.profil.fullName,
    title: d.profil.title ?? "",
    titleEn: "",
    phone: d.profil.phone ?? "",
    email: d.profil.email ?? "",
    website: "",
    location: "",
    tagline: "",
    taglineEn: "",
    sosyal: { ...BOS_SOSYAL },
    showPhoto: true,
    active: true,
  };
}

export default function KartvizitModal({ onClose, onProfilDegisti }: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const [durum, setDurum] = useState<Durum | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [adresBos, setAdresBos] = useState<boolean | null>(null);
  const [digerSosyal, setDigerSosyal] = useState(false);
  const [ingilizce, setIngilizce] = useState(false);
  const [sosyalHata, setSosyalHata] = useState<Partial<Record<KartvizitSosyalAnahtar, boolean>>>({});
  const [fotoDosyasi, setFotoDosyasi] = useState<File | null>(null);
  const [kirp, setKirp] = useState<CropArea | null>(null);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const kontrolSirasi = useRef(0);

  const yukle = () => {
    setYukleniyor(true);
    api
      .get<Durum>("/kartvizit/me")
      .then((d) => {
        setDurum(d);
        setForm(formdan(d));
        const k = d.kart;
        if (k) {
          setIngilizce(!!(k.titleEn || k.taglineEn));
          setDigerSosyal(KARTVIZIT_SOSYAL.some((s) => !ONE_CIKAN_SOSYAL.includes(s.anahtar) && k.sosyal[s.anahtar]));
        }
      })
      .catch(() => setHata(t("Kartvizit bilgileri yüklenemedi. Tekrar dene.")))
      .finally(() => setYukleniyor(false));
  };
  useEffect(yukle, []); // eslint-disable-line react-hooks/exhaustive-deps

  const kayitli = durum?.kart ?? null;
  const adres = form?.adres ?? "";
  const bicimHatasi: KartvizitAdresHatasi | null = adres ? kartvizitAdresHatasi(adres) : "kisa";
  const adresDegisti = !!kayitli && kayitli.adres !== adres;

  // Adres yazılırken boşta mı diye sor (kısa gecikmeyle; eski cevap yenisini ezmesin).
  useEffect(() => {
    if (!adres || bicimHatasi || (kayitli && kayitli.adres === adres)) {
      setAdresBos(bicimHatasi ? null : true);
      return;
    }
    setAdresBos(null);
    const sira = ++kontrolSirasi.current;
    const zamanlayici = setTimeout(() => {
      api
        .get<Record<string, boolean>>(`/kartvizit/adres-durumu?adresler=${encodeURIComponent(adres)}`)
        .then((r) => sira === kontrolSirasi.current && setAdresBos(r[adres] ?? false))
        .catch(() => sira === kontrolSirasi.current && setAdresBos(null));
    }, 350);
    return () => clearTimeout(zamanlayici);
  }, [adres, bicimHatasi, kayitli]);

  const avatarUrl = durum?.profil.avatarUrl ?? null;
  const qrSvg = useMemo(() => {
    if (!kayitli) return null;
    return kartvizitQrSvg(kartvizitAdresi(kayitli.adres), {
      ad: kayitli.fullName,
      adresMetni: `${kayitli.adres}.${KARTVIZIT_ALAN_ADI}`,
    });
  }, [kayitli]);

  const guncelle = <K extends keyof Form>(alan: K, deger: Form[K]) => {
    setForm((f) => (f ? { ...f, [alan]: deger } : f));
    setBilgi("");
  };

  const adresHataMetni = (h: KartvizitAdresHatasi): string =>
    ({
      kisa: t("En az 3 karakter."),
      uzun: t("En fazla 30 karakter."),
      karakter: t("Yalnızca küçük harf, rakam ve tire."),
      tire: t("Tireyle başlayıp bitemez, iki tire yan yana gelemez."),
      ayrilmis: t("Bu adres Projelio'ya ayrılmış."),
    })[h];

  const kaydet = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form) return;
    setHata("");
    if (bicimHatasi) return setHata(adresHataMetni(bicimHatasi));
    if (adresBos === false) return setHata(t("Bu adres alınmış, başka bir adres seç."));
    const hataliSosyal = KARTVIZIT_SOSYAL.find((s) => kartvizitSosyalNormallestir(s.anahtar, form.sosyal[s.anahtar]) === null);
    if (hataliSosyal) return setHata(t("{ad} hesabı tanınmadı. Kullanıcı adını ya da profil adresini yaz.", { ad: hataliSosyal.ad }));
    if (adresDegisti && !window.confirm(t("Adresi değiştirirsen eski adres ve daha önce basılmış ya da paylaşılmış QR kodları artık açılmaz. Devam edilsin mi?"))) return;

    setKaydediliyor(true);
    try {
      const kart = await api.post<Kartvizit>("/kartvizit/me", form);
      setDurum((d) => (d ? { ...d, kart } : d));
      setForm((f) => (f ? { ...f, adres: kart.adres, website: kart.website ?? "", sosyal: { ...BOS_SOSYAL, ...kart.sosyal } } : f));
      setBilgi(kayitli ? t("Kaydedildi.") : t("Kartvizitin hazır! QR kodunu indirip paylaşabilirsin."));
    } catch (err) {
      setHata(err instanceof ApiError ? t(err.message) : t("Kaydedilemedi. Tekrar dene."));
    } finally {
      setKaydediliyor(false);
    }
  };

  const yayinDurumu = async (aktif: boolean) => {
    if (!form || !kayitli) return;
    guncelle("active", aktif);
    try {
      const kart = await api.post<Kartvizit>("/kartvizit/me", { ...form, adres: kayitli.adres, active: aktif });
      setDurum((d) => (d ? { ...d, kart } : d));
      setBilgi(aktif ? t("Kartvizitin yeniden yayında.") : t("Kartvizitin yayından kaldırıldı. QR kodu okutan kişi kartını göremez."));
    } catch {
      guncelle("active", !aktif);
      setHata(t("Kaydedilemedi. Tekrar dene."));
    }
  };

  const sil = async () => {
    if (!window.confirm(t("Kartvizitin silinsin mi? Adresin boşa çıkar ve QR kodu artık açılmaz."))) return;
    try {
      await api.delete("/kartvizit/me");
      yukle();
      setBilgi(t("Kartvizitin silindi."));
    } catch {
      setHata(t("Silinemedi. Tekrar dene."));
    }
  };

  const fotoKaydet = async () => {
    if (!fotoDosyasi || !kirp) return;
    setFotoYukleniyor(true);
    try {
      const kirpilmis = await cropAvatarImage(fotoDosyasi, kirp);
      const veri = new FormData();
      veri.append("file", kirpilmis);
      const kullanici = await api.uploadFile<{ avatarUrl?: string }>("/users/me/avatar", veri);
      setDurum((d) => (d ? { ...d, profil: { ...d.profil, avatarUrl: kullanici.avatarUrl ?? null } } : d));
      setFotoDosyasi(null);
      setKirp(null);
      onProfilDegisti?.();
    } catch {
      setHata(t("Fotoğraf yüklenemedi. Tekrar dene."));
    } finally {
      setFotoYukleniyor(false);
    }
  };

  const kopyala = async () => {
    if (!kayitli) return;
    try {
      await navigator.clipboard.writeText(kartvizitAdresi(kayitli.adres));
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1800);
    } catch {
      window.prompt(t("Bağlantıyı kopyala"), kartvizitAdresi(kayitli.adres));
    }
  };

  // ---------------------------------------------------------------- görünüm

  const etiket: React.CSSProperties = { fontSize: 14, color: c.textSecondary };
  const alan: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
  const bolumBasligi: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".06em",
    textTransform: "uppercase",
    color: c.textSecondary,
    margin: "6px 0 0",
  };
  const ikincilDugme: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "9px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  };
  const metinAlani = (ad: keyof typeof KARTVIZIT_SINIRLAR | "titleEn" | "taglineEn", baslik: string, yerTutucu?: string, tur = "text") => {
    const sinir = ad === "titleEn" ? KARTVIZIT_SINIRLAR.title : ad === "taglineEn" ? KARTVIZIT_SINIRLAR.tagline : KARTVIZIT_SINIRLAR[ad];
    return (
      <div style={alan}>
        <label style={etiket}>{baslik}</label>
        <input
          type={tur}
          value={form ? (form[ad] as string) : ""}
          onChange={(e) => guncelle(ad, e.target.value)}
          placeholder={yerTutucu}
          maxLength={sinir}
          required={ad === "fullName"}
          style={{ width: "100%" }}
        />
      </div>
    );
  };

  const qrPaneli = kayitli && qrSvg && (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 16,
        borderRadius: 14,
        background: c.background,
        border: `1px solid ${c.border}`,
        opacity: kayitli.active ? 1 : 0.55,
      }}
    >
      <img src={svgVeriAdresi(qrSvg)} alt={t("Kartvizit QR kodu")} style={{ width: "100%", maxWidth: 240, height: "auto", display: "block" }} />
      <a
        href={kartvizitAdresi(kayitli.adres)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 14, fontWeight: 600, color: c.accentDark, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, wordBreak: "break-all" }}
      >
        {kayitli.adres}.{KARTVIZIT_ALAN_ADI}
        <IconExternalLink size={14} />
      </a>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
        <button type="button" style={ikincilDugme} onClick={() => pngIndir(qrSvg, `${kayitli.adres}-kartvizit-qr.png`).catch(() => setHata(t("PNG oluşturulamadı.")))}>
          <IconDownload size={15} /> PNG
        </button>
        <button type="button" style={ikincilDugme} onClick={() => svgIndir(qrSvg, `${kayitli.adres}-kartvizit-qr.svg`)}>
          <IconDownload size={15} /> SVG
        </button>
        <button type="button" style={{ ...ikincilDugme, gridColumn: "1 / -1" }} onClick={kopyala}>
          <IconCopy size={15} /> {kopyalandi ? t("Kopyalandı") : t("Bağlantıyı kopyala")}
        </button>
      </div>
      <span style={{ fontSize: 12, color: c.textSecondary, textAlign: "center", lineHeight: 1.45 }}>
        {t("Baskı için SVG, mesajla göndermek için PNG. Bilgilerini değiştirsen de QR aynı kalır.")}
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: c.textPrimary, cursor: "pointer" }}>
        <input type="checkbox" checked={kayitli.active} onChange={(e) => yayinDurumu(e.target.checked)} />
        {t("Kartvizit yayında")}
      </label>
    </div>
  );

  const tanitim = !kayitli && (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: `linear-gradient(120deg, ${c.primary}, ${c.primaryDark})`,
        color: "#fff",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: c.accent, display: "grid", placeItems: "center" }}>
        <IconQr size={20} color="#fff" />
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <strong style={{ fontSize: 15 }}>{t("Kendi adresinde dijital kartvizit — ücretsiz")}</strong>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.8)" }}>
          {t("QR kodunu okutan kişi seni arayabilir, e-posta atabilir, sosyal hesaplarını açabilir ve tek dokunuşla rehberine ekleyebilir. Türkçe ve İngilizce görünür.")}
        </span>
      </div>
    </div>
  );

  return (
    <Modal
      title={t("Dijital kartvizit")}
      onClose={onClose}
      maxWidth={isDesktop && kayitli ? 820 : 520}
      mobileFullScreen
      footer={
        form && (
          <button
            type="submit"
            form="kartvizit-formu"
            disabled={kaydediliyor || yukleniyor}
            style={{ width: "100%", background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 16, fontWeight: 500 }}
          >
            {kaydediliyor ? t("Kaydediliyor…") : kayitli ? t("Kaydet") : t("Kartviziti oluştur")}
          </button>
        )
      }
    >
      {yukleniyor && !form ? (
        <p style={{ color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : !form ? (
        <p style={{ color: c.danger, margin: 0 }}>{hata}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isDesktop && kayitli ? "minmax(0,1fr) 280px" : "1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          {!isDesktop && qrPaneli}
          <form id="kartvizit-formu" onSubmit={kaydet} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            {tanitim}

            <p style={bolumBasligi}>{t("Adresin")}</p>
            <div style={alan}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: `1px solid ${adresBos === false || (adres && bicimHatasi) ? c.danger : c.border}`,
                  borderRadius: 8,
                  background: c.surface,
                  overflow: "hidden",
                }}
              >
                <input
                  value={adres}
                  onChange={(e) => guncelle("adres", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  maxLength={30}
                  aria-label={t("Kartvizit adresi")}
                  autoCapitalize="none"
                  spellCheck={false}
                  style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", textAlign: "right", fontWeight: 600 }}
                />
                <span style={{ padding: "0 12px 0 2px", color: c.textSecondary, fontSize: 15, whiteSpace: "nowrap" }}>.{KARTVIZIT_ALAN_ADI}</span>
              </div>
              <span style={{ fontSize: 13, color: adres && bicimHatasi ? c.danger : adresBos === false ? c.danger : adresBos ? c.success : c.textSecondary }}>
                {adres && bicimHatasi
                  ? adresHataMetni(bicimHatasi)
                  : adresBos === false
                    ? t("Bu adres alınmış.")
                    : adresBos
                      ? kayitli && kayitli.adres === adres
                        ? t("Şu anki adresin.")
                        : t("Bu adres boşta.")
                      : t("Kontrol ediliyor…")}
              </span>
              {adresDegisti && (
                <span style={{ fontSize: 13, color: c.warning }}>
                  {t("Adresi değiştirirsen eski adres ve daha önce basılmış QR kodları artık açılmaz.")}
                </span>
              )}
              {!kayitli && durum && durum.oneriler.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
                  {durum.oneriler.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => guncelle("adres", o)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 999,
                        fontSize: 13,
                        border: `1px solid ${o === adres ? c.accent : c.border}`,
                        background: o === adres ? c.accent : c.surface,
                        color: o === adres ? "#fff" : c.textPrimary,
                        cursor: "pointer",
                      }}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p style={bolumBasligi}>{t("Fotoğraf")}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              {fotoDosyasi ? (
                <AvatarCropper file={fotoDosyasi} onChange={setKirp} />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: c.background,
                    border: `1px solid ${c.border}`,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    opacity: form.showPhoto ? 1 : 0.4,
                  }}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <IconUser size={26} color={c.textSecondary} />
                  )}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {fotoDosyasi ? (
                  <div style={{ display: "flex", gap: 12 }}>
                    <button type="button" onClick={fotoKaydet} disabled={fotoYukleniyor || !kirp} style={{ ...ikincilDugme, padding: "6px 10px" }}>
                      {fotoYukleniyor ? t("Yükleniyor…") : t("Fotoğrafı kaydet")}
                    </button>
                    <button type="button" onClick={() => setFotoDosyasi(null)} style={{ background: "none", border: "none", color: c.textSecondary, fontSize: 14, padding: 0 }}>
                      {t("Vazgeç")}
                    </button>
                  </div>
                ) : (
                  <label style={{ fontSize: 14, color: c.accentDark, fontWeight: 500, cursor: "pointer" }}>
                    {avatarUrl ? t("Fotoğrafı değiştir") : t("Fotoğraf ekle")}
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setFotoDosyasi(e.target.files?.[0] ?? null)} />
                  </label>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: c.textPrimary, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.showPhoto} onChange={(e) => guncelle("showPhoto", e.target.checked)} />
                  {t("Fotoğrafım kartta görünsün")}
                </label>
                <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Projelio profil fotoğrafın kullanılır.")}</span>
              </div>
            </div>

            <p style={bolumBasligi}>{t("Bilgiler")}</p>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 12 }}>
              {metinAlani("fullName", t("Ad soyad"))}
              {metinAlani("title", t("Görev / unvan"), t("ör. Grafik Tasarımcı"))}
              {metinAlani("phone", t("Telefon"), "+90 5xx xxx xx xx", "tel")}
              {metinAlani("email", t("E-posta"), undefined, "email")}
              {metinAlani("website", t("Web sitesi"), "ornek.com")}
              {metinAlani("location", t("Konum"), t("ör. İstanbul"))}
            </div>
            {metinAlani("tagline", t("Kısa söz (opsiyonel)"), t("Adının altında görünen bir cümle"))}

            <button
              type="button"
              onClick={() => setIngilizce((v) => !v)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: c.accentDark, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            >
              {ingilizce ? t("İngilizce görünümü gizle") : t("İngilizce görünümü düzenle")}
            </button>
            {ingilizce && (
              <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 12 }}>
                {metinAlani("titleEn", t("Unvan (İngilizce)"), form.title || "Graphic Designer")}
                {metinAlani("taglineEn", t("Kısa söz (İngilizce)"), form.tagline)}
                <span style={{ fontSize: 12, color: c.textSecondary, gridColumn: "1 / -1" }}>
                  {t("Telefonu İngilizce kullanan ziyaretçiler kartını İngilizce görür. Boş bırakırsan Türkçesi gösterilir.")}
                </span>
              </div>
            )}

            <p style={bolumBasligi}>{t("Sosyal medya")}</p>
            <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr", gap: 12 }}>
              {KARTVIZIT_SOSYAL.filter((s) => digerSosyal || ONE_CIKAN_SOSYAL.includes(s.anahtar)).map((s) => (
                <div key={s.anahtar} style={alan}>
                  <label style={etiket}>{s.ad}</label>
                  <input
                    value={form.sosyal[s.anahtar]}
                    onChange={(e) => {
                      guncelle("sosyal", { ...form.sosyal, [s.anahtar]: e.target.value });
                      setSosyalHata((h) => ({ ...h, [s.anahtar]: false }));
                    }}
                    onBlur={(e) => setSosyalHata((h) => ({ ...h, [s.anahtar]: kartvizitSosyalNormallestir(s.anahtar, e.target.value) === null }))}
                    placeholder={s.ornek}
                    autoCapitalize="none"
                    spellCheck={false}
                    style={{ width: "100%", borderColor: sosyalHata[s.anahtar] ? c.danger : undefined }}
                  />
                  {sosyalHata[s.anahtar] && <span style={{ fontSize: 12, color: c.danger }}>{t("Kullanıcı adını ya da profil adresini yaz.")}</span>}
                </div>
              ))}
            </div>
            {!digerSosyal && (
              <button
                type="button"
                onClick={() => setDigerSosyal(true)}
                style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: c.accentDark, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              >
                {t("Diğer hesaplar (TikTok, Threads, Facebook, GitHub, Behance)")}
              </button>
            )}

            {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}
            {bilgi && <p style={{ color: c.success, fontSize: 14, margin: 0 }}>{bilgi}</p>}

            {kayitli && (
              <button
                type="button"
                onClick={sil}
                style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: c.danger, fontSize: 13, cursor: "pointer", marginTop: 4 }}
              >
                {t("Kartviziti sil")}
              </button>
            )}
          </form>
          {isDesktop && kayitli && <div style={{ position: "sticky", top: 0 }}>{qrPaneli}</div>}
        </div>
      )}
    </Modal>
  );
}
