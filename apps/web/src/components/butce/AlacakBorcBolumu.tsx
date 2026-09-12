import { useEffect, useImperativeHandle, useMemo, useState, forwardRef } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { useUndo } from "../../lib/undo";
import { kalanGun, sirala, YAKLASAN_GUN, type SiralamaKey } from "../../lib/butceOzeti";
import AddModuleRecordModal from "../AddModuleRecordModal";
import VadeRozeti from "../VadeRozeti";
import { IconEdit, IconTrash } from "../icons";
import { fmtPara } from "./butceBicim";

export type AlacakBorcTuru = "receivable" | "payable";

export interface AlacakBorcHandle {
  openQuickAdd: (kind: AlacakBorcTuru) => void;
}

interface Props {
  organizationId: string;
}

/** Alacak/borç hâlâ bir MODÜL (fm_alacak_borc) — defterle aynı tabloya taşınmadı. */
const RP_KEY = "fm_alacak_borc";

const tutarAl = (r: ModuleRecord) => Number(r.data.amount) || 0;
const paraBirimiAl = (r: ModuleRecord) => (r.data.currency as string) || "TRY";
/** Vade girilmemişse çok uzak sayılır ki listenin sonuna düşsün. */
const vadeTarihi = (r: ModuleRecord) => String(r.data.dueDate ?? "9999-12-31").slice(0, 10);

/**
 * Şirketin alacak/borç takibi.
 *
 * DEFTERDEN AYRI DURMASININ SEBEBİ: buradaki tutarlar HENÜZ GERÇEKLEŞMEMİŞ
 * paradır — tahsil edilmemiş alacak, ödenmemiş borç. Gelir/gider defterine
 * karışsalardı bakiye, elde olmayan parayı varmış gibi gösterirdi. Bu yüzden
 * bu bölüm hiçbir bütçe toplamına girmez; yalnızca "neyi kaçırıyorum"
 * sorusunu cevaplar.
 *
 * Gelir-gider modülü kaldırılıp defter budget_transactions'a taşınırken
 * (migration 104) bu modül BİLEREK yerinde bırakıldı: farklı bir soruyu
 * cevaplıyor ve vade/kapanma durumu gibi alanları defterde karşılığı yok.
 */
const AlacakBorcBolumu = forwardRef<AlacakBorcHandle, Props>(function AlacakBorcBolumu({ organizationId }, ref) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo, pushDestructive } = useUndo();

  const [kayitlar, setKayitlar] = useState<ModuleRecord[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [duzenlenen, setDuzenlenen] = useState<ModuleRecord | null>(null);
  const [hizliEkle, setHizliEkle] = useState<AlacakBorcTuru | null>(null);
  const [kapatilan, setKapatilan] = useState<string | null>(null);
  const [siralama] = useState<SiralamaKey>("yakin");
  const [kapananlarGorunsun, setKapananlarGorunsun] = useState(false);

  const yukle = () => {
    setYukleniyor(true);
    api
      .get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${RP_KEY}`)
      .then(setKayitlar)
      .catch(() => setKayitlar([]))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [organizationId]);

  useImperativeHandle(ref, () => ({ openQuickAdd: (kind) => setHizliEkle(kind) }));

  const sirali = useMemo(() => sirala(kayitlar, siralama, vadeTarihi, tutarAl, false), [kayitlar, siralama]);
  const acik = sirali.filter((r) => r.data.status !== "settled");
  const kapanan = sirali.filter((r) => r.data.status === "settled");
  const gecikmisSayisi = acik.filter((r) => r.data.dueDate && kalanGun(vadeTarihi(r)) < 0).length;
  const yaklasanSayisi = acik.filter((r) => {
    if (!r.data.dueDate) return false;
    const kalan = kalanGun(vadeTarihi(r));
    return kalan >= 0 && kalan <= YAKLASAN_GUN;
  }).length;

  const kapat = async (kayit: ModuleRecord) => {
    setKapatilan(kayit.id);
    try {
      await api.patch(`/module-records/${kayit.id}`, { data: { ...kayit.data, status: "settled" } });
      yukle();
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    } finally {
      setKapatilan(null);
    }
  };

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const sil = async (id: string) => {
    setKayitlar((prev) => prev.filter((r) => r.id !== id));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/module-records/${id}`).catch(() => {});
      },
      restore: yukle,
    });
  };

  const veriyiUygula = async (id: string, data: Record<string, unknown>) => {
    await api.patch(`/module-records/${id}`, { data }).catch(() => {});
    yukle();
  };

  const duzenlendi = (onceki: ModuleRecord, kaydedilen: ModuleRecord) => {
    yukle();
    pushUndo({
      label: "Alacak/borç kaydı düzenlendi",
      run: () => veriyiUygula(onceki.id, onceki.data),
      redo: () => veriyiUygula(kaydedilen.id, kaydedilen.data),
    });
  };

  const gorunen = kapananlarGorunsun ? [...acik, ...kapanan] : acik;

  const bosKart = {
    border: `1px dashed ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 22,
    textAlign: "center",
    color: c.textSecondary,
    fontSize: 14,
  } as const;

  if (yukleniyor) return null;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Alacak / Borç")}</h2>
        {gecikmisSayisi > 0 && (
          <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: `${c.danger}18`, color: c.danger }}>
            {gecikmisSayisi} {t("gecikmiş")}
          </span>
        )}
        {yaklasanSayisi > 0 && (
          <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: `${c.warning}22`, color: c.accentDark }}>
            {yaklasanSayisi} {t("yaklaşan")}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {kapanan.length > 0 && (
          <button
            onClick={() => setKapananlarGorunsun((v) => !v)}
            style={{ fontSize: 12.5, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
          >
            {kapananlarGorunsun ? t("Kapananları gizle") : `${t("Kapananlar")} (${kapanan.length})`}
          </button>
        )}
      </div>

      {/* Bu tutarlar HİÇBİR BÜTÇE TOPLAMINA GİRMEZ: henüz gerçekleşmemiş para. */}
      <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "0 0 10px" }}>
        {t("Henüz tahsil edilmemiş / ödenmemiş tutarlar. Bakiyeye dahil değildir.")}
      </p>

      {gorunen.length === 0 ? (
        <div style={bosKart}>{t("Henüz alacak/borç kaydı yok.")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {gorunen.map((r) => {
            const borc = r.data.type === "payable";
            const kapali = r.data.status === "settled";
            const mesgul = kapatilan === r.id;
            return (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  padding: "9px 12px",
                  borderRadius: 10,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  opacity: kapali ? 0.6 : 1,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 999,
                    flexShrink: 0,
                    color: borc ? c.danger : c.success,
                    background: borc ? `${c.danger}18` : `${c.success}18`,
                  }}
                >
                  {borc ? t("Borç") : t("Alacak")}
                </span>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(r.data.counterparty as string) ?? ""}
                    {r.data.category ? ` · ${r.data.category}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {fmtPara(tutarAl(r), paraBirimiAl(r))}
                  </div>
                </div>

                {!kapali && r.data.dueDate ? <VadeRozeti tarih={vadeTarihi(r)} /> : null}

                {!kapali ? (
                  <button
                    onClick={() => kapat(r)}
                    disabled={mesgul}
                    style={{
                      fontSize: 12,
                      padding: "5px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: c.primary,
                      color: c.onPrimary,
                      flexShrink: 0,
                      cursor: mesgul ? "wait" : "pointer",
                    }}
                  >
                    {borc ? t("Ödendi") : t("Tahsil edildi")}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                    {borc ? t("Ödendi") : t("Tahsil edildi")}
                  </span>
                )}
                <button
                  onClick={() => setDuzenlenen(r)}
                  aria-label={t("Kaydı düzenle")}
                  style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex", cursor: "pointer" }}
                >
                  <IconEdit size={14} color={c.textSecondary} />
                </button>
                <button
                  onClick={() => sil(r.id)}
                  aria-label={t("Kaydı sil")}
                  style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex", cursor: "pointer" }}
                >
                  <IconTrash size={14} color={c.textSecondary} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {duzenlenen && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={duzenlenen.moduleKey}
          record={duzenlenen}
          onClose={() => setDuzenlenen(null)}
          onSaved={(kaydedilen) => duzenlendi(duzenlenen, kaydedilen)}
        />
      )}

      {hizliEkle && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={RP_KEY}
          presetData={{ type: hizliEkle, status: "open" }}
          titleOverride={hizliEkle === "payable" ? "Borç ekle" : "Alacak ekle"}
          onClose={() => setHizliEkle(null)}
          onSaved={yukle}
        />
      )}
    </section>
  );
});

export default AlacakBorcBolumu;
