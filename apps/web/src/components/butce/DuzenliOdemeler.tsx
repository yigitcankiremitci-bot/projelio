import { useState } from "react";
import type { RecurrenceInterval, RecurringPayment } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { IconTrash } from "../icons";
import { PARA_BIRIMLERI, fmtPara, fmtTarih } from "./butceBicim";

interface Props {
  scopeType: string;
  scopeId: string;
  odemeler: RecurringPayment[];
  canManage: boolean;
  onDegisti: () => void;
}

const ARALIK_ETIKET: Record<RecurrenceInterval, string> = {
  weekly: "Haftalık",
  monthly: "Aylık",
  yearly: "Yıllık",
};

/**
 * Kademeye bağlı düzenli gelir/giderler: kira, maaş, abonelik, düzenli hakediş.
 *
 * Vadesi geldiğinde sunucudaki günlük iş bunlardan gerçek bir defter satırı
 * üretir (bkz. recurring-payments.processor.ts) — bu liste HENÜZ İŞLENMEMİŞ
 * yükü gösterir. Ayrı bölüm olmasının sebebi bu: defterdeki satır gerçekleşen
 * para, buradaki satır gelecekteki para. İkisi tek listede karışsaydı bakiye
 * yanlış okunurdu.
 */
export default function DuzenliOdemeler({ scopeType, scopeId, odemeler, canManage, onDegisti }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [aciliyor, setAciliyor] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [interval, setInterval] = useState<RecurrenceInterval>("monthly");
  const [nextDueDate, setNextDueDate] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");

  const sifirla = () => {
    setType("expense");
    setAmount("");
    setCurrency("TRY");
    setCategory("");
    setDescription("");
    setInterval("monthly");
    setNextDueDate("");
  };

  const kaydet = async () => {
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setHata(t("Geçerli bir tutar gir"));
      return;
    }
    if (!nextDueDate) {
      setHata(t("İlk vade tarihini seç"));
      return;
    }
    setKaydediliyor(true);
    setHata("");
    try {
      await api.post(`/budget/scope/${scopeType}/${scopeId}/recurring`, {
        type,
        amount: n,
        currency,
        category: category || undefined,
        description: description || undefined,
        interval,
        nextDueDate,
      });
      sifirla();
      setAciliyor(false);
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi."));
    } finally {
      setKaydediliyor(false);
    }
  };

  const sil = async (id: string) => {
    await api.delete(`/budget/scope/${scopeType}/${scopeId}/recurring/${id}`).catch(() => {});
    onDegisti();
  };

  const duraklat = async (odeme: RecurringPayment) => {
    await api
      .patch(`/budget/scope/${scopeType}/${scopeId}/recurring/${odeme.id}`, { active: !odeme.active })
      .catch(() => {});
    onDegisti();
  };

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Düzenli gelir / giderler")}</h2>
        {canManage && (
          <button
            onClick={() => {
              setAciliyor((v) => !v);
              sifirla();
              setHata("");
            }}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {aciliyor ? t("Vazgeç") : t("+ Düzenli ekle")}
          </button>
        )}
      </div>

      {aciliyor && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={type} onChange={(e) => setType(e.target.value as "income" | "expense")} style={{ flex: 1, minWidth: 110 }}>
              <option value="income">{t("Gelir")}</option>
              <option value="expense">{t("Gider")}</option>
            </select>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("Tutar")}
              style={{ flex: 1, minWidth: 110 }}
            />
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 92 }}>
              {PARA_BIRIMLERI.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as RecurrenceInterval)}
              style={{ flex: 1, minWidth: 110 }}
            >
              <option value="weekly">{t("Haftalık")}</option>
              <option value="monthly">{t("Aylık")}</option>
              <option value="yearly">{t("Yıllık")}</option>
            </select>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              style={{ flex: 1, minWidth: 140 }}
            />
          </div>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={t("Kategori (örn. Kira, Maaş, Abonelik)")}
            style={{ width: "100%" }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Açıklama")}
            style={{ width: "100%" }}
          />
          {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
          <button
            onClick={kaydet}
            disabled={kaydediliyor}
            style={{
              padding: "8px 0",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {kaydediliyor ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
        </div>
      )}

      {odemeler.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 22,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 14,
          }}
        >
          {t("Düzenli bir gelir/gider tanımlı değil.")}
        </div>
      ) : (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, overflow: "hidden" }}>
          {odemeler.map((o) => (
            <div
              key={o.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderBottom: `1px solid ${c.border}`,
                opacity: o.active ? 1 : 0.55,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.description || o.category || t(ARALIK_ETIKET[o.interval])}
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                  {t(ARALIK_ETIKET[o.interval])} · {t("Sıradaki")}: {fmtTarih(o.nextDueDate)}
                  {!o.active && ` · ${t("Duraklatıldı")}`}
                </div>
              </div>
              <span
                style={{ fontSize: 14, fontWeight: 500, color: o.type === "income" ? c.success : c.danger, flexShrink: 0 }}
              >
                {o.type === "income" ? "+" : "−"}
                {fmtPara(o.amount, o.currency)}
              </span>
              {canManage && (
                <>
                  <button
                    onClick={() => duraklat(o)}
                    style={{
                      fontSize: 12,
                      padding: "3px 8px",
                      borderRadius: 7,
                      border: `1px solid ${c.border}`,
                      background: "transparent",
                      color: c.textSecondary,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {o.active ? t("Duraklat") : t("Sürdür")}
                  </button>
                  <button
                    onClick={() => sil(o.id)}
                    aria-label={t("Düzenli ödemeyi sil")}
                    style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3, flexShrink: 0 }}
                  >
                    <IconTrash size={14} color={c.danger} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
