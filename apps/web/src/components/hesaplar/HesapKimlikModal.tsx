import { useEffect, useRef, useState } from "react";
import type {
  ServiceAccount,
  ServiceCredential,
  ServiceCredentialSecret,
  ServiceCredentialView,
} from "@projelio/shared";
import { hesaplarApi, type HesapKimlikGirdisi } from "../../api/hesaplar";
import { useT } from "../../lib/i18n";
import { HESAP_GIRIS_YONTEMLERI, HESAP_KILIT_YONTEMI, HESAP_YETKI_GEREKCESI, sifresizYontem } from "../../lib/hesaplar";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";
import HesapKilidi, { useKilit } from "./HesapKilidi";

interface Props {
  hesap: ServiceAccount;
  canManage: boolean;
  canWrite: boolean;
  onClose: () => void;
  onDegisti: () => void;
}

/** Gösterilen sırrın ekranda kalma süresi. */
const GOSTERIM_SANIYE = 45;

function tarih(deger?: string): string {
  if (!deger) return "—";
  return new Date(deger).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Bir hesabın giriş bilgileri.
 *
 * ÜÇ KURAL:
 *   1. Sır listede DÖNMEZ — her gösterim ayrı bir istek ve sunucuda ayrı bir
 *      denetim satırı.
 *   2. Gösterim SÜRELİ: şifre görünür kaldığı sürece omuz üstünden okunabilir,
 *      ekran paylaşımında görünür, ekran görüntüsüne girer. {GOSTERIM_SANIYE}
 *      saniye sonra state'ten siliniyor.
 *   3. Yetki yetmez, KİLİT de gerekir (bkz. HesapKilidi).
 *
 * Sunucu tarafı: backend/src/modules/hesaplar/hesap-kimlik.service.ts
 */
export default function HesapKimlikModal({ hesap, canManage, canWrite, onClose, onDegisti }: Props) {
  const c = useThemeColors();
  const t = useT();
  const { kilit, kalanSaniye, ac } = useKilit();

  const [satirlar, setSatirlar] = useState<ServiceCredential[]>([]);
  const [gosterimler, setGosterimler] = useState<ServiceCredentialView[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  // Açık olan sır: yalnızca bellekte, tek kayıt için, süreli.
  const [sir, setSir] = useState<ServiceCredentialSecret | null>(null);
  const [gosterimKalan, setGosterimKalan] = useState(0);
  const [mesgul, setMesgul] = useState<string | null>(null);

  const [form, setForm] = useState<{
    id: string | null;
    label: string;
    username: string;
    password: string;
    note: string;
    totp: string;
  } | null>(null);

  const yukle = () => {
    setYukleniyor(true);
    Promise.all([
      hesaplarApi.kimlikler(hesap.id),
      canManage ? hesaplarApi.gosterimler(hesap.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([k, g]) => {
        setSatirlar(k);
        setGosterimler(g);
        setHata("");
      })
      .catch((err) => setHata(err instanceof Error ? err.message : t("Kayıtlar yüklenemedi")))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [hesap.id]);

  // Geri sayım. Süre dolunca sır state'ten SİLİNİR, yalnızca gizlenmez.
  useEffect(() => {
    if (!sir) return;
    setGosterimKalan(GOSTERIM_SANIYE);
    const sayac = setInterval(() => setGosterimKalan((n) => n - 1), 1000);
    const zaman = setTimeout(() => setSir(null), GOSTERIM_SANIYE * 1000);
    return () => {
      clearInterval(sayac);
      clearTimeout(zaman);
    };
  }, [sir]);

  const goster = async (satir: ServiceCredential) => {
    if (!kilit) return;
    setMesgul(satir.id);
    setHata("");
    try {
      setSir(await hesaplarApi.goster(satir.id, kilit.token));
      // Denetim izi yöneticide anında tazelenir: "kim gördü" listesi kendi
      // gösterimini de içermeli, yoksa liste eksik görünüyor.
      if (canManage) hesaplarApi.gosterimler(hesap.id).then(setGosterimler).catch(() => undefined);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Bilgiler gösterilemedi"));
    } finally {
      setMesgul(null);
    }
  };

  const kaydet = async () => {
    if (!form) return;
    setMesgul("form");
    setHata("");
    const govde: HesapKimlikGirdisi = {
      label: form.label,
      username: form.username,
      note: form.note,
      totp: form.totp,
    };
    // Boş şifre "dokunma" demek (sunucu da öyle yorumluyor): form şifreyi
    // hiçbir zaman dolu getirmiyor, boş gönderim olağan.
    if (form.password.trim()) govde.password = form.password;

    try {
      if (form.id) await hesaplarApi.kimlikGuncelle(form.id, govde);
      else await hesaplarApi.kimlikEkle(hesap.id, govde);
      setForm(null);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setMesgul(null);
    }
  };

  const sil = async (satir: ServiceCredential) => {
    if (!window.confirm(t("“{etiket}” kaydı silinsin mi? Şifre geri getirilemez.", { etiket: satir.label }))) return;
    try {
      await hesaplarApi.kimlikSil(satir.id);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
    }
  };

  const hayalet = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
  } as const;
  const etiket = (metin: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{metin}</label>;
  const alan = { fontSize: 13, padding: "6px 8px", width: "100%" } as const;

  return (
    <Modal
      title={t("{hesap} · giriş bilgileri", { hesap: hesap.name })}
      subtitle={t("Bilgiler sunucuda şifreli saklanır. Görmek için kilidi açmanız gerekir ve her gösterim kaydedilir.")}
      onClose={onClose}
      maxWidth={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t(HESAP_GIRIS_YONTEMLERI[hesap.loginMethod].label)}
          {sifresizYontem(hesap.loginMethod) ? ` · ${t(HESAP_GIRIS_YONTEMLERI[hesap.loginMethod].hint)}` : ""}
        </span>

        {/* Kilit yalnızca GÖRME yetkisi olana gösteriliyor: yetkisi olmayanı
            olmayan bir kapının önünde bekletmek anlamsız. */}
        {hesap.canReveal &&
          (kilit ? (
            <span style={{ fontSize: 11, color: c.success }}>
              {t("Kilit açık ({yontem}) · {n} sn", {
                yontem: t(HESAP_KILIT_YONTEMI[kilit.method]),
                n: kalanSaniye,
              })}
            </span>
          ) : (
            <HesapKilidi onAcildi={ac} />
          ))}

        {yukleniyor && <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

        {!yukleniyor && satirlar.length === 0 && (
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Bu hesap için kayıtlı giriş yok.")} {canWrite ? t("Aşağıdan ekleyebilirsiniz.") : t("Ekleme yetkiniz yok.")}
          </span>
        )}

        {satirlar.map((satir) => (
          <div
            key={satir.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "10px 12px",
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, color: c.textPrimary, flex: 1, minWidth: 120 }}>{satir.label}</span>
              {satir.canReveal ? (
                <button onClick={() => goster(satir)} disabled={!kilit || mesgul === satir.id} style={hayalet}>
                  {mesgul === satir.id
                    ? t("Açılıyor…")
                    : !kilit
                    ? t("Kilit kapalı")
                    : sir?.id === satir.id
                    ? t("Yenile")
                    : t("Göster")}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Görme yetkiniz yok")}</span>
              )}
              {satir.canEdit && (
                <>
                  <button
                    onClick={() =>
                      setForm({ id: satir.id, label: satir.label, username: "", password: "", note: "", totp: "" })
                    }
                    style={hayalet}
                  >
                    {t("Düzenle")}
                  </button>
                  <button onClick={() => sil(satir)} style={{ ...hayalet, color: c.danger }}>
                    {t("Sil")}
                  </button>
                </>
              )}
            </div>

            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {[
                satir.createdByName ? t("Giren: {kisi}", { kisi: satir.createdByName }) : null,
                satir.hasPassword
                  ? t("Şifre güncellenme: {tarih}", { tarih: tarih(satir.passwordChangedAt) })
                  : t("Şifre girilmemiş"),
                satir.hasNote ? t("Not var") : null,
                satir.hasTotp ? t("2FA anahtarı var") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>

            {sir?.id === satir.id && <SirKutusu sir={sir} kalan={gosterimKalan} />}
          </div>
        ))}

        {/* Ekleme / düzenleme formu */}
        {form ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "10px 12px",
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              background: c.background,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
                {etiket(t("Etiket"))}
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder={t("Ana giriş")}
                  style={alan}
                />
              </div>
              <div style={{ flex: "1 1 160px", display: "flex", flexDirection: "column", gap: 4 }}>
                {etiket(t("Kullanıcı adı / e-posta"))}
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="off"
                  style={alan}
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {etiket(form.id ? t("Yeni şifre (boş bırakılırsa değişmez)") : t("Şifre"))}
              {/* type=password + autoComplete=new-password: tarayıcı bunu kendi
                  şifre kasasına kaydetmeye çalışmasın, sır tek yerde dursun. */}
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                autoComplete="new-password"
                style={alan}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {etiket(t("2FA anahtarı (varsa)"))}
              <input
                value={form.totp}
                onChange={(e) => setForm({ ...form, totp: e.target.value })}
                autoComplete="off"
                style={alan}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {etiket(t("Not (kurtarma e-postası, 2FA'nın hangi telefonda olduğu…)"))}
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                style={{ ...alan, resize: "vertical" }}
              />
            </div>
            {form.id && (
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {t("Kullanıcı adı, not ve 2FA anahtarı yazdığınızla değiştirilir; boş bırakırsanız temizlenir.")}
              </span>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setForm(null)} style={hayalet}>
                {t("Vazgeç")}
              </button>
              <button
                data-primary
                onClick={kaydet}
                disabled={mesgul === "form"}
                style={{
                  fontSize: 13,
                  padding: "6px 14px",
                  background: c.primary,
                  color: c.onPrimary,
                  border: "none",
                  borderRadius: 8,
                  cursor: mesgul === "form" ? "default" : "pointer",
                  opacity: mesgul === "form" ? 0.6 : 1,
                }}
              >
                {mesgul === "form" ? t("Kaydediliyor…") : t("Kaydet")}
              </button>
            </div>
          </div>
        ) : (
          canWrite && (
            <button
              onClick={() => setForm({ id: null, label: "", username: "", password: "", note: "", totp: "" })}
              style={{ ...hayalet, alignSelf: "flex-start", color: c.primary }}
            >
              + {t("Giriş ekle")}
            </button>
          )
        )}

        {canManage && gosterimler.length > 0 && (
          <details>
            <summary style={{ fontSize: 12, color: c.textSecondary, cursor: "pointer" }}>
              {t("Son görüntülemeler ({n})", { n: gosterimler.length })}
            </summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              {gosterimler.slice(0, 20).map((g) => (
                <span key={g.id} style={{ fontSize: 11, color: c.textSecondary }}>
                  {tarih(g.viewedAt)} · {g.userName ?? t("Silinmiş kullanıcı")} · {g.credentialLabel} ·{" "}
                  {t(HESAP_YETKI_GEREKCESI[g.reason])} · {t(HESAP_KILIT_YONTEMI[g.unlockMethod])}
                </span>
              ))}
            </div>
          </details>
        )}

        {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      </div>
    </Modal>
  );
}

/** Açılan sır — süreli, kopyalanabilir, hiçbir yere yazılmaz. */
function SirKutusu({ sir, kalan }: { sir: ServiceCredentialSecret; kalan: number }) {
  const c = useThemeColors();
  const t = useT();
  const [kopyalanan, setKopyalanan] = useState("");
  const zaman = useRef<number | null>(null);

  const kopyala = async (metin: string, ne: string) => {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalanan(ne);
      if (zaman.current) window.clearTimeout(zaman.current);
      zaman.current = window.setTimeout(() => setKopyalanan(""), 2000);
    } catch {
      setKopyalanan("hata");
    }
  };

  const satir = (baslik: string, deger: string, mono = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: c.textSecondary, width: 92 }}>{baslik}</span>
      <span
        style={{
          fontSize: 13,
          color: c.textPrimary,
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          wordBreak: "break-all",
          flex: 1,
          minWidth: 120,
        }}
      >
        {deger}
      </span>
      <button
        onClick={() => kopyala(deger, baslik)}
        style={{
          fontSize: 11,
          background: "transparent",
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          padding: "2px 8px",
          cursor: "pointer",
          color: c.textSecondary,
        }}
      >
        {kopyalanan === baslik ? t("Kopyalandı") : t("Kopyala")}
      </button>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        border: `1px dashed ${c.accent}`,
        borderRadius: 8,
        background: `${c.accent}0F`,
      }}
    >
      {sir.username && satir(t("Kullanıcı adı"), sir.username)}
      {sir.password && satir(t("Şifre"), sir.password, true)}
      {sir.totp && satir(t("2FA anahtarı"), sir.totp, true)}
      {sir.note && satir(t("Not"), sir.note)}
      <span style={{ fontSize: 11, color: c.textSecondary }}>
        {kalan > 0 ? t("{n} saniye sonra gizlenecek.", { n: kalan }) : t("Gizleniyor…")}{" "}
        {t("Bu gösterim kaydedildi.")}
      </span>
    </div>
  );
}
