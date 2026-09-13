import { useEffect, useState } from "react";
import type { BudgetTransaction, HizmetAnlasmasi } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { IconTrash } from "../icons";
import { useT } from "../../lib/i18n";

interface Props {
  projectId: string;
  currentUserId?: string;
  /** Liste değişince (ödeme eklendi/silindi) üst panel defteri tazelesin. */
  onChanged?: () => void;
}

const para = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

/**
 * Hizmet alan ile hizmet veren arasındaki anlaşma — iki biçimde: proje sahibi ↔
 * projedeki üye, ya da iş sahibi ↔ o işin altındaki hizmet projesinin sahibi
 * (bkz. Project.hizmetProjesi). Bileşen ikisini aynı gösterir; farkı sunucu çözer.
 *
 * Neden ayrı bölüm: aynı ödeme hizmet alan için gider, veren için gelirdir. "Gelir mi
 * gider mi" diye sormak ikisinden birine yanlış soru sormaktı; burada kayıt
 * "kim kime ödedi" diye giriliyor ve tür sunucuda yöne göre belirleniyor
 * (bkz. backend hizmet-anlasmasi.ts). İki taraf da girebilir.
 */
export default function HizmetAnlasmalari({ projectId, currentUserId, onChanged }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [liste, setListe] = useState<HizmetAnlasmasi[] | null>(null);

  const yukle = () =>
    api
      .get<HizmetAnlasmasi[]>(`/projects/${projectId}/budget/hizmet`)
      .then(setListe)
      .catch(() => setListe([]));

  useEffect(() => {
    yukle();
  }, [projectId]);

  const degisti = () => {
    yukle();
    onChanged?.();
  };

  if (!liste || liste.length === 0) return null;

  return (
    <div>
      <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>{t("Hizmet anlaşmaları")}</h4>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 8px" }}>
        {t("Hizmet alan ile hizmet veren arasındaki ücret. Ödemeyi iki taraf da girebilir; hizmet alan için gider, hizmet veren için gelir olarak görünür.")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {liste.map((a) => (
          <AnlasmaKarti key={a.memberId} anlasma={a} projectId={projectId} currentUserId={currentUserId} onChanged={degisti} />
        ))}
      </div>
    </div>
  );
}

function AnlasmaKarti({
  anlasma: a,
  projectId,
  currentUserId,
  onChanged,
}: {
  anlasma: HizmetAnlasmasi;
  projectId: string;
  currentUserId?: string;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const benHizmetVerenim = a.userId === currentUserId;
  const odeyen = a.ownerName ?? t("Proje sahibi");
  const alan = a.fullName ?? t("Bilinmeyen kullanıcı");

  const [anlasmaDuzenle, setAnlasmaDuzenle] = useState(false);
  const [anlasmaTutari, setAnlasmaTutari] = useState(a.agreedFee ? String(a.agreedFee) : "");
  const [odemeFormu, setOdemeFormu] = useState(false);
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(() => new Date().toISOString().slice(0, 10));
  const [aciklama, setAciklama] = useState("");
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const anlasmayiKaydet = async () => {
    const deger = Number(anlasmaTutari || 0);
    if (!Number.isFinite(deger) || deger < 0) {
      setHata(t("Geçerli bir tutar gir."));
      return;
    }
    setKaydediliyor(true);
    setHata("");
    try {
      await api.patch(`/projects/${projectId}/budget/hizmet/${a.userId}`, { agreedFee: deger });
      setAnlasmaDuzenle(false);
      onChanged();
    } catch {
      setHata(t("Anlaşma kaydedilemedi. Tekrar dene."));
    } finally {
      setKaydediliyor(false);
    }
  };

  const odemeyiKaydet = async () => {
    const deger = Number(tutar);
    if (!deger || deger <= 0) {
      setHata(t("Geçerli bir tutar gir."));
      return;
    }
    setKaydediliyor(true);
    setHata("");
    try {
      await api.post(`/projects/${projectId}/budget/hizmet/${a.userId}/odeme`, {
        amount: deger,
        occurredAt: tarih,
        description: aciklama || undefined,
      });
      setTutar("");
      setAciklama("");
      setOdemeFormu(false);
      onChanged();
    } catch {
      setHata(t("Ödeme kaydedilemedi. Tekrar dene."));
    } finally {
      setKaydediliyor(false);
    }
  };

  const odemeyiSil = async (odeme: BudgetTransaction) => {
    try {
      await api.delete(`/budget/transactions/${odeme.id}`);
      onChanged();
    } catch {
      setHata(t("Ödeme silinemedi."));
    }
  };

  // Silme: satırın yazıldığı defterin sahibi her satırı; karşı taraf yalnızca
  // kendi girdiğini (sunucu da aynı kuralı uyguluyor, burada yalnızca düğmeyi
  // gizliyoruz). Otomatik satırlar (görev bütçesi) kendi yerinden yönetilir.
  const silebilir = (o: BudgetTransaction) =>
    a.canEdit &&
    (o.source ?? "manual") === "manual" &&
    (a.ledgerOwnerId === currentUserId || o.createdBy === currentUserId);

  const girdi = {
    fontSize: 14,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: c.background,
    color: c.textPrimary,
  } as const;
  const birincil = {
    fontSize: 13,
    padding: "5px 10px",
    borderRadius: 6,
    border: "none",
    background: c.primary,
    color: c.onPrimary,
    cursor: "pointer",
  } as const;
  const ikincil = { ...birincil, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary };

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <p style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
          {benHizmetVerenim ? t("Hizmet aldığın: {ad}", { ad: odeyen }) : t("Hizmet veren: {ad}", { ad: alan })}
        </p>
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {benHizmetVerenim ? t("Senin için gelir") : t("Senin için gider")}
        </span>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "10px 0" }}>
        <div style={{ flex: 1, minWidth: 110 }}>
          <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Anlaşılan ücret")}</p>
          {anlasmaDuzenle ? (
            <span style={{ display: "flex", gap: 6 }}>
              <input
                type="number"
                min={0}
                value={anlasmaTutari}
                onChange={(e) => setAnlasmaTutari(e.target.value)}
                style={{ ...girdi, width: 110 }}
                autoFocus
              />
              <button onClick={anlasmayiKaydet} disabled={kaydediliyor} style={birincil}>
                {t("Kaydet")}
              </button>
            </span>
          ) : (
            <p style={{ fontSize: 18, fontWeight: 600, color: c.textPrimary, margin: 0 }}>
              {a.agreedFee > 0 ? para(a.agreedFee) : t("Belirtilmedi")}
              {a.canEdit && (
                <button
                  onClick={() => setAnlasmaDuzenle(true)}
                  style={{ marginLeft: 8, fontSize: 12, background: "transparent", border: "none", color: c.primary, cursor: "pointer" }}
                >
                  {t("Değiştir")}
                </button>
              )}
            </p>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>
            {benHizmetVerenim ? t("Alınan") : t("Ödenen")}
          </p>
          <p style={{ fontSize: 18, fontWeight: 600, color: benHizmetVerenim ? c.success : c.danger, margin: 0 }}>{para(a.paid)}</p>
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>
            {benHizmetVerenim ? t("Alacak") : t("Kalan borç")}
          </p>
          <p style={{ fontSize: 18, fontWeight: 600, color: a.remaining > 0 ? c.warning : c.textSecondary, margin: 0 }}>
            {para(a.remaining)}
          </p>
          {a.overpaid > 0 && (
            <p style={{ fontSize: 12, color: c.textSecondary, margin: "2px 0 0" }}>
              {t("+{tutar} fazla ödendi", { tutar: para(a.overpaid) })}
            </p>
          )}
        </div>
      </div>

      {a.agreedFee > 0 && (
        <div style={{ height: 6, borderRadius: 20, background: c.background, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ width: `${Math.min(100, (a.paid / a.agreedFee) * 100)}%`, height: "100%", background: c.success }} />
        </div>
      )}

      {a.payments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {a.payments.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span style={{ color: c.textSecondary, flexShrink: 0 }}>{new Date(o.occurredAt).toLocaleDateString("tr-TR")}</span>
              <span style={{ color: c.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {odeyen} → {alan}
                {(o.description || o.taskTitle) && (
                  <span style={{ color: c.textSecondary }}> · {o.description || o.taskTitle}</span>
                )}
              </span>
              <span style={{ fontWeight: 500, color: benHizmetVerenim ? c.success : c.danger, flexShrink: 0 }}>
                {benHizmetVerenim ? "+" : "−"}
                {para(o.amount)}
              </span>
              {silebilir(o) && (
                <button
                  onClick={() => odemeyiSil(o)}
                  aria-label={t("Ödemeyi sil")}
                  style={{ background: "transparent", border: "none", padding: 2, display: "flex", cursor: "pointer" }}
                >
                  <IconTrash size={13} color={c.textSecondary} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {a.canEdit &&
        (odemeFormu ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: c.textSecondary, width: "100%" }}>
              {t("{odeyen} → {alan} ödemesi", { odeyen, alan })}
            </span>
            <input
              type="number"
              min={0}
              placeholder={t("Tutar")}
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              style={{ ...girdi, width: 110 }}
              autoFocus
            />
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={girdi} />
            <input
              placeholder={t("Açıklama (isteğe bağlı)")}
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              style={{ ...girdi, flex: 1, minWidth: 140 }}
            />
            <button onClick={odemeyiKaydet} disabled={kaydediliyor} style={birincil}>
              {t("Kaydet")}
            </button>
            <button onClick={() => setOdemeFormu(false)} style={ikincil}>
              {t("Vazgeç")}
            </button>
          </div>
        ) : (
          <button onClick={() => setOdemeFormu(true)} style={ikincil}>
            {benHizmetVerenim ? t("Aldığım ödemeyi ekle") : t("Yaptığım ödemeyi ekle")}
          </button>
        ))}

      {hata && <p style={{ fontSize: 13, color: c.danger, margin: "6px 0 0" }}>{hata}</p>}
    </div>
  );
}
