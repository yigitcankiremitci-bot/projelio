import { useState } from "react";
import type { RecurrenceInterval, ServiceAccount, ServiceAccountCategory, ServiceAccountLoginMethod } from "@projelio/shared";
import {
  RECURRENCE_INTERVAL_LABEL,
  RECURRENCE_INTERVALS,
  SERVICE_ACCOUNT_CATEGORIES,
  SERVICE_ACCOUNT_LOGIN_METHODS,
} from "@projelio/shared";
import { hesaplarApi, type HesapGirdisi, type HesapKapsami } from "../../api/hesaplar";
import { useT } from "../../lib/i18n";
import { HESAP_GIRIS_YONTEMLERI, HESAP_KATEGORILERI, sifresizYontem } from "../../lib/hesaplar";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";

interface Props {
  kapsam: HesapKapsami;
  hesap?: ServiceAccount | null;
  /** Abonelik giderinin gideceği kasanın adı — ekranda yazılı olsun diye. */
  kasaAdi?: string;
  /** Kullanıcı o kasaya kayıt girebiliyor mu; giremiyorsa abonelik bloğu kapalı. */
  kasaYetkisi: boolean;
  uyeler: { id: string; label: string }[];
  onClose: () => void;
  onKaydedildi: () => void;
}

/**
 * Hesap ekleme / düzenleme.
 *
 * ŞİFRE BU FORMDA YOK — bilerek. Giriş bilgileri ayrı bir modalde
 * (HesapKimlikModal) çünkü hesabı düzenleyen herkes şifreyi görmüyor: hesap
 * bilgisi (ad, abonelik, adres) modülü yazabilen herkese açık, sır ise
 * yalnızca yetkisi olana. İkisi tek formda olsaydı bu ayrım arayüzde
 * anlatılamazdı. Aynı ayrım sosyal medyada da var.
 *
 * ABONELİK BLOĞU KASAYA YAZAR: işaretlendiği anda defterde (bkz. migration
 * 104) düzenli bir gider satırı açılıyor ve vadesi gelince gerçek hareketi
 * gecelik iş üretiyor. Bu yüzden hangi kasaya gittiği formda YAZILI —
 * kullanıcı parayı nereye yazdığını kaydetmeden önce görmeli.
 */
export default function HesapModal({
  kapsam,
  hesap,
  kasaAdi,
  kasaYetkisi,
  uyeler,
  onClose,
  onKaydedildi,
}: Props) {
  const c = useThemeColors();
  const t = useT();

  const [name, setName] = useState(hesap?.name ?? "");
  const [category, setCategory] = useState<ServiceAccountCategory>(hesap?.category ?? "yazilim");
  const [url, setUrl] = useState(hesap?.url ?? "");
  const [loginMethod, setLoginMethod] = useState<ServiceAccountLoginMethod>(hesap?.loginMethod ?? "password");
  const [plan, setPlan] = useState(hesap?.plan ?? "");
  const [ownerUserId, setOwnerUserId] = useState(hesap?.ownerUserId ?? "");
  const [note, setNote] = useState(hesap?.note ?? "");

  const [isPaid, setIsPaid] = useState(hesap?.isPaid ?? false);
  const [amount, setAmount] = useState(hesap?.amount ? String(hesap.amount) : "");
  const [currency, setCurrency] = useState(hesap?.currency ?? "TRY");
  const [billingInterval, setBillingInterval] = useState<RecurrenceInterval>(hesap?.billingInterval ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(hesap?.nextDueDate?.slice(0, 10) ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const kaydet = async () => {
    if (!name.trim()) {
      setError(t("Hesap adı gerekli"));
      return;
    }
    setBusy(true);
    setError("");
    const govde: HesapGirdisi = {
      name: name.trim(),
      category,
      url: url.trim(),
      loginMethod,
      plan: plan.trim(),
      ownerUserId: ownerUserId || null,
      note: note.trim(),
      isPaid,
      // Ücretsizken tutar ve ritim TEMİZLENİYOR: kalırsa kullanıcı aboneliği
      // yeniden işaretlediğinde eski tutarı fark etmeden kasaya yazardı.
      amount: isPaid ? Number(amount.replace(",", ".")) : null,
      currency,
      billingInterval: isPaid ? billingInterval : null,
      nextDueDate: isPaid ? nextDueDate || null : null,
    };

    try {
      if (hesap) await hesaplarApi.guncelle(hesap.id, govde);
      else await hesaplarApi.ekle(kapsam, govde);
      onKaydedildi();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Hesap kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const etiket = (metin: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{metin}</label>;
  const alan = { fontSize: 13, padding: "6px 8px", width: "100%" } as const;
  const satir = { display: "flex", gap: 8, flexWrap: "wrap" as const };
  const kutu = { flex: "1 1 160px", display: "flex", flexDirection: "column" as const, gap: 4 };

  return (
    <Modal
      title={hesap ? t("Hesabı düzenle") : t("Hesap ekle")}
      subtitle={t("Giriş bilgileri (kullanıcı adı, şifre) bu formda değil: hesabı kaydettikten sonra “Giriş bilgileri”nden eklenir.")}
      onClose={onClose}
      maxWidth={620}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={satir}>
          <div style={kutu}>
            {etiket(t("Hesap adı *"))}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Adobe Creative Cloud"
              style={alan}
            />
          </div>
          <div style={kutu}>
            {etiket(t("Kategori"))}
            <select value={category} onChange={(e) => setCategory(e.target.value as ServiceAccountCategory)} style={alan}>
              {SERVICE_ACCOUNT_CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {t(HESAP_KATEGORILERI[k].label)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={satir}>
          <div style={kutu}>
            {etiket(t("Giriş adresi"))}
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="account.adobe.com"
              style={alan}
            />
          </div>
          <div style={kutu}>
            {etiket(t("Giriş yöntemi"))}
            <select
              value={loginMethod}
              onChange={(e) => setLoginMethod(e.target.value as ServiceAccountLoginMethod)}
              style={alan}
            >
              {SERVICE_ACCOUNT_LOGIN_METHODS.map((y) => (
                <option key={y} value={y}>
                  {t(HESAP_GIRIS_YONTEMLERI[y].label)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {sifresizYontem(loginMethod) && (
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t(HESAP_GIRIS_YONTEMLERI[loginMethod].hint)} ·{" "}
            {t("Şifre alanını boş bırakıp yalnızca kullanıcı adını ve notu kaydedebilirsiniz.")}
          </span>
        )}

        <div style={satir}>
          <div style={kutu}>
            {etiket(t("Plan"))}
            <input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder={t("Team — 5 koltuk")} style={alan} />
          </div>
          <div style={kutu}>
            {etiket(t("Sorumlu"))}
            <select value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} style={alan}>
              <option value="">{t("Seçilmedi")}</option>
              {uyeler.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Not (şifre DEĞİL: “kurumsal kartla ödeniyor” gibi bilgiler)"))}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ ...alan, resize: "vertical" }} />
        </div>

        {/* ----------------------------------------------------- Abonelik */}
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
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textPrimary }}>
            <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} disabled={!kasaYetkisi} />
            {t("Ücretli abonelik")}
          </label>

          {!kasaYetkisi && (
            <span style={{ fontSize: 11, color: c.textSecondary }}>
              {t("Aboneliği kasaya işlemek için bütçe yetkisi gerekiyor. Hesabı ücretsiz olarak kaydedebilirsiniz.")}
            </span>
          )}

          {isPaid && kasaYetkisi && (
            <>
              <div style={satir}>
                <div style={{ ...kutu, flex: "1 1 100px" }}>
                  {etiket(t("Tutar *"))}
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={alan} />
                </div>
                <div style={{ ...kutu, flex: "0 0 90px" }}>
                  {etiket(t("Birim"))}
                  <input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                    style={alan}
                  />
                </div>
                <div style={{ ...kutu, flex: "1 1 110px" }}>
                  {etiket(t("Ödeme aralığı"))}
                  <select
                    value={billingInterval}
                    onChange={(e) => setBillingInterval(e.target.value as RecurrenceInterval)}
                    style={alan}
                  >
                    {RECURRENCE_INTERVALS.map((aralik) => (
                      <option key={aralik} value={aralik}>
                        {t(RECURRENCE_INTERVAL_LABEL[aralik])}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ ...kutu, flex: "1 1 130px" }}>
                  {etiket(t("Sıradaki ödeme"))}
                  <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} style={alan} />
                </div>
              </div>
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {kasaAdi
                  ? t("Bu gider {kasa} kasasına düzenli gider olarak yazılır; vadesi geldikçe deftere işlenir.", {
                      kasa: kasaAdi,
                    })
                  : t("Bu gider kasaya düzenli gider olarak yazılır; vadesi geldikçe deftere işlenir.")}
              </span>
            </>
          )}
        </div>

        {error && <span style={{ fontSize: 12, color: c.danger }}>{error}</span>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              fontSize: 13,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              padding: "6px 14px",
              cursor: "pointer",
              color: c.textSecondary,
            }}
          >
            {t("Vazgeç")}
          </button>
          <button
            data-primary
            onClick={kaydet}
            disabled={busy}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
