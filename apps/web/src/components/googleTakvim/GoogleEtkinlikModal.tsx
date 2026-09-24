import { useState } from "react";
import type { GoogleTakvimEtkinligi, GoogleTakvimEtkinlikGirdisi } from "@projelio/shared";
import { safeExternalUrl, saatliParcalar, tumGunGunleri } from "@projelio/shared";
import Modal from "../Modal";
import { googleTakvimApi } from "../../api/googleTakvim";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { askLio } from "../../lib/askLio";
import { inputStyle, labelStyle, primaryButton, secondaryButton } from "../plan/PlanTargetsModal";

interface Props {
  /** Var olan etkinlik; boşsa yeni etkinlik formu açılır. */
  etkinlik?: GoogleTakvimEtkinligi;
  /** Yeni etkinlik için ön doldurulmuş gün. */
  tarih?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Google Takvim etkinliği.
 *
 * Google'dan gelen etkinlik SALT OKUNUR: başkasının davet ettiği bir toplantıyı
 * Projelio'dan kaydırmak davetlilerin takvimini de oynatırdı. Projelio'nun
 * açtığı etkinlikler (kaynak=projelio) burada düzenlenip silinebilir.
 *
 * "Göreve çevir" Lio'ya gider, burada form açmaz: etkinliğin hangi işe/projeye
 * ait olduğunu, süresini ve son tarihini Lio başlıktan, katılımcılardan ve
 * açıklamadan tahmin ediyor; kullanıcıya proje seçtirmek o tahmini boşa
 * çıkarırdı. Lio görevi açınca etkinliği kendisi işaretliyor.
 */
export default function GoogleEtkinlikModal({ etkinlik, tarih, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [duzenle, setDuzenle] = useState(!etkinlik);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const calistir = async (is: () => Promise<unknown>, kapat = true) => {
    setMesgul(true);
    setHata(null);
    try {
      await is();
      onSaved();
      if (kapat) onClose();
    } catch (e: any) {
      setHata(String(e?.message ?? t("İşlem tamamlanamadı.")));
    } finally {
      setMesgul(false);
    }
  };

  if (duzenle) {
    return (
      <EtkinlikFormu
        etkinlik={etkinlik}
        tarih={tarih}
        onClose={onClose}
        onKaydet={(girdi) =>
          calistir(() => (etkinlik ? googleTakvimApi.duzenle(etkinlik.id, girdi) : googleTakvimApi.ekle(girdi)))
        }
        mesgul={mesgul}
        hata={hata}
      />
    );
  }

  const e = etkinlik!;
  const googleLink = safeExternalUrl(e.htmlLink);
  const meetLink = safeExternalUrl(e.meetLink);
  const aciklama = e.aciklama ? duzMetin(e.aciklama) : "";

  const goreveCevir = () => {
    const satirlar = [
      `Google Takvim'deki şu etkinliği Projelio'ya görev olarak işle (etkinlik id: ${e.id}):`,
      `"${e.baslik}" — ${zamanMetni(e)}`,
      e.katilimciSayisi ? `${e.katilimciSayisi} katılımcı${e.duzenleyen ? `, düzenleyen: ${e.duzenleyen}` : ""}` : "",
      "Hangi iş/projeye ait olduğunu, süresini, önceliğini ve son tarihini tahmin et; önce bana öner, onaylarsam görevi oluştur ve etkinliği işaretle.",
    ].filter(Boolean);
    askLio(satirlar.join("\n"));
    onClose();
  };

  return (
    <Modal title={e.baslik} onClose={onClose} maxWidth={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: c.textPrimary }}>
        <div>{zamanMetni(e)}</div>
        {e.takvimAdi && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.textSecondary }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: e.takvimRengi ?? c.accent }} />
            {e.takvimAdi}
            {e.kaynak === "projelio" && <span>· {t("Projelio'dan eklendi")}</span>}
          </div>
        )}
        {e.konum && <div style={{ color: c.textSecondary }}>{e.konum}</div>}
        {(e.duzenleyen || e.katilimciSayisi) && (
          <div style={{ color: c.textSecondary }}>
            {e.duzenleyen && `${t("Düzenleyen:")} ${e.duzenleyen}`}
            {e.duzenleyen && e.katilimciSayisi ? " · " : ""}
            {e.katilimciSayisi ? t("{n} katılımcı", { n: e.katilimciSayisi }) : ""}
          </div>
        )}
        {aciklama && (
          <div
            style={{
              whiteSpace: "pre-wrap",
              maxHeight: 180,
              overflowY: "auto",
              background: c.background,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 13,
              color: c.textSecondary,
            }}
          >
            {aciklama}
          </div>
        )}
        {(googleLink || meetLink) && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {meetLink && (
              <a href={meetLink} target="_blank" rel="noreferrer" style={{ color: c.accent, fontSize: 14 }}>
                {t("Toplantıya katıl")}
              </a>
            )}
            {googleLink && (
              <a href={googleLink} target="_blank" rel="noreferrer" style={{ color: c.accent, fontSize: 14 }}>
                {t("Google Takvim'de aç")}
              </a>
            )}
          </div>
        )}
      </div>

      {e.kaynak === "google" && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: c.background,
            fontSize: 13,
            color: c.textSecondary,
          }}
        >
          {e.isleme === "gorev" ? (
            <>
              {t("Projelio'ya görev olarak işlendi")}
              {e.gorevBasligi && (
                <>
                  : <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{e.gorevBasligi}</strong>
                </>
              )}
            </>
          ) : e.isleme === "yoksay" ? (
            t("Görev olmayacak diye işaretlendi.")
          ) : (
            t("Bu etkinlik henüz Projelio'ya işlenmedi. Lio hangi işe ait olduğunu ve ne kadar süreceğini tahmin edip görev önerebilir.")
          )}
        </div>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{hata}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {e.kaynak === "projelio" ? (
          <>
            <button
              onClick={() => {
                if (!window.confirm(t("Etkinlik Google Takvim'den de silinsin mi?"))) return;
                void calistir(() => googleTakvimApi.sil(e.id));
              }}
              disabled={mesgul}
              style={{ ...secondaryButton(c), color: c.danger, marginRight: "auto" }}
            >
              {t("Sil")}
            </button>
            <button onClick={() => setDuzenle(true)} disabled={mesgul} style={primaryButton(c, mesgul)}>
              {t("Düzenle")}
            </button>
          </>
        ) : e.isleme === "yeni" ? (
          <>
            <button
              onClick={() => void calistir(() => googleTakvimApi.isleme(e.id, "yoksay"))}
              disabled={mesgul}
              style={{ ...secondaryButton(c), marginRight: "auto" }}
            >
              {t("Görev değil")}
            </button>
            <button onClick={goreveCevir} style={primaryButton(c, false)}>
              {t("Lio ile göreve çevir")}
            </button>
          </>
        ) : (
          <button
            onClick={() => void calistir(() => googleTakvimApi.isleme(e.id, "yeni"))}
            disabled={mesgul}
            style={{ ...secondaryButton(c), marginRight: "auto" }}
          >
            {t("İşareti kaldır")}
          </button>
        )}
      </div>
    </Modal>
  );
}

function EtkinlikFormu({
  etkinlik,
  tarih,
  onClose,
  onKaydet,
  mesgul,
  hata,
}: {
  etkinlik?: GoogleTakvimEtkinligi;
  tarih?: string;
  onClose: () => void;
  onKaydet: (girdi: GoogleTakvimEtkinlikGirdisi) => void;
  mesgul: boolean;
  hata: string | null;
}) {
  const c = useThemeColors();
  const t = useT();
  const baslangicDegeri = etkinlik ? formBaslangici(etkinlik) : null;

  const [baslik, setBaslik] = useState(etkinlik?.baslik ?? "");
  const [gun, setGun] = useState(baslangicDegeri?.tarih ?? tarih ?? "");
  const [tumGun, setTumGun] = useState(etkinlik?.tumGun ?? false);
  const [bitisGunu, setBitisGunu] = useState(baslangicDegeri?.bitisTarihi ?? "");
  const [bas, setBas] = useState(baslangicDegeri?.baslangicSaati ?? "09:00");
  const [bit, setBit] = useState(baslangicDegeri?.bitisSaati ?? "10:00");
  const [aciklama, setAciklama] = useState(etkinlik?.aciklama ?? "");
  const [yerelHata, setYerelHata] = useState<string | null>(null);

  const kaydet = () => {
    if (!baslik.trim()) return setYerelHata(t("Etkinliğin bir başlığı olmalı."));
    if (!gun) return setYerelHata(t("Tarih seç."));
    if (!tumGun && bit <= bas) return setYerelHata(t("Bitiş saati başlangıçtan sonra olmalı."));
    setYerelHata(null);
    onKaydet({
      baslik: baslik.trim(),
      tarih: gun,
      tumGun,
      ...(tumGun ? { bitisTarihi: bitisGunu || undefined } : { baslangicSaati: bas, bitisSaati: bit }),
      aciklama: aciklama.trim(),
    });
  };

  return (
    <Modal title={etkinlik ? t("Etkinliği düzenle") : t("Google Takvim'e etkinlik ekle")} onClose={onClose} maxWidth={440}>
      <label style={labelStyle(c)}>{t("Başlık")}</label>
      <input value={baslik} onChange={(e) => setBaslik(e.target.value)} style={inputStyle(c)} autoFocus />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: c.textPrimary, marginTop: 14 }}>
        <input type="checkbox" checked={tumGun} onChange={(e) => setTumGun(e.target.checked)} />
        {t("Tüm gün")}
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ flex: 1.4 }}>
          <label style={labelStyle(c)}>{tumGun ? t("İlk gün") : t("Tarih")}</label>
          <input type="date" value={gun} onChange={(e) => setGun(e.target.value)} style={inputStyle(c)} />
        </div>
        {tumGun ? (
          <div style={{ flex: 1.4 }}>
            <label style={labelStyle(c)}>{t("Son gün")}</label>
            <input type="date" value={bitisGunu} min={gun} onChange={(e) => setBitisGunu(e.target.value)} style={inputStyle(c)} />
          </div>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <label style={labelStyle(c)}>{t("Başlangıç")}</label>
              <input type="time" value={bas} onChange={(e) => setBas(e.target.value)} style={inputStyle(c)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle(c)}>{t("Bitiş")}</label>
              <input type="time" value={bit} onChange={(e) => setBit(e.target.value)} style={inputStyle(c)} />
            </div>
          </>
        )}
      </div>

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Açıklama")}</label>
      <textarea value={aciklama} onChange={(e) => setAciklama(e.target.value)} rows={3} style={{ ...inputStyle(c), resize: "vertical" }} />

      {(yerelHata || hata) && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{yerelHata ?? hata}</p>}

      <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={secondaryButton(c)}>
          {t("Vazgeç")}
        </button>
        <button onClick={kaydet} disabled={mesgul} style={primaryButton(c, mesgul)}>
          {mesgul ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
      </div>
      <p style={{ fontSize: 12, color: c.textSecondary, margin: "12px 0 0", lineHeight: 1.5 }}>
        {t("Etkinlik Ayarlar'da seçtiğin Google takvimine yazılır. Davetli eklenmez, kimseye e-posta gitmez.")}
      </p>
    </Modal>
  );
}

// ------------------------------------------------------------------ yardımcılar

/** "24 Eyl Per 10:00–11:30" / "24–26 Eyl (tüm gün)" — kullanıcının dilinde. */
function zamanMetni(e: GoogleTakvimEtkinligi): string {
  const dil = bicimDili();
  const gunBicimi = (d: Date) => d.toLocaleDateString(dil, { day: "numeric", month: "short", weekday: "short" });
  if (e.tumGun) {
    const gunler = tumGunGunleri(e.baslangic, e.bitis);
    const ilk = gunBicimi(new Date(`${gunler[0]}T12:00:00`));
    if (gunler.length === 1) return ilk;
    return `${ilk} – ${gunBicimi(new Date(`${gunler[gunler.length - 1]}T12:00:00`))}`;
  }
  const bas = new Date(e.baslangic);
  const bit = new Date(e.bitis);
  const saat = (d: Date) => d.toLocaleTimeString(dil, { hour: "2-digit", minute: "2-digit" });
  if (bas.toDateString() === bit.toDateString()) return `${gunBicimi(bas)} ${saat(bas)}–${saat(bit)}`;
  return `${gunBicimi(bas)} ${saat(bas)} – ${gunBicimi(bit)} ${saat(bit)}`;
}

/** Düzenleme formu için etkinliğin yerel saatteki alanları. */
function formBaslangici(e: GoogleTakvimEtkinligi) {
  if (e.tumGun) {
    const gunler = tumGunGunleri(e.baslangic, e.bitis);
    return { tarih: gunler[0], bitisTarihi: gunler.length > 1 ? gunler[gunler.length - 1] : "", baslangicSaati: "09:00", bitisSaati: "10:00" };
  }
  const parcalar = saatliParcalar(e.baslangic, e.bitis);
  const ilk = parcalar[0];
  return {
    tarih: ilk.gun,
    bitisTarihi: "",
    baslangicSaati: ilk.baslangic,
    // Günü aşan etkinlik formda tek güne sığdırılır; bitiş o günün sonu.
    bitisSaati: parcalar.length > 1 ? "23:59" : ilk.bitis,
  };
}

/**
 * Google açıklamaları sıklıkla HTML taşıyor (<br>, <a>). Metin olarak
 * gösterilir — HTML'i sayfaya basmak başkasının yazdığı içeriği çalıştırmak
 * olurdu.
 */
function duzMetin(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
