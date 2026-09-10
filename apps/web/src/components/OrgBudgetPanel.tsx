import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { kalanGun, sirala, YAKLASAN_GUN, type KasaHareketi, type SiralamaKey } from "../lib/butceOzeti";
import AddModuleRecordModal from "./AddModuleRecordModal";
import BudgetTrendChart from "./BudgetTrendChart";
import KasaFiltreCubugu, { type OdakSecenegi } from "./KasaFiltreCubugu";
import VadeRozeti from "./VadeRozeti";
import { useUndo } from "../lib/undo";
import { IconEdit, IconTrash } from "./icons";
import { useT } from "../lib/i18n";

export type BudgetQuickAddKind = "income" | "expense" | "receivable" | "payable";

export interface OrgBudgetPanelHandle {
  openQuickAdd: (kind: BudgetQuickAddKind) => void;
}

interface Props {
  organizationId: string;
}

const LEDGER_KEY = "fm_gelir_gider";
const RP_KEY = "fm_alacak_borc";

/**
 * Sayfanın odağı. Kişisel kasadakiyle aynı fikir (bkz. BudgetPanel.tsx) ama
 * buradaki vade kaynağı alacak/borç kayıtlarının `dueDate`i.
 */
type OdakKey = "tumu" | "gecikmis" | "yaklasan" | "kapanan";

const odakSecenekleri: OdakSecenegi<OdakKey>[] = [
  { key: "tumu", label: "Tümü", ipucu: "Her şey" }, // dil:anahtar
  { key: "gecikmis", label: "Vadesi geçen", ipucu: "Vadesi dolmuş, hâlâ açık alacak ve borçlar" }, // dil:anahtar
  { key: "yaklasan", label: "Vadesi yaklaşan", ipucu: "Önümüzdeki 7 gün içinde vadesi dolacak alacak ve borçlar" }, // dil:anahtar
  { key: "kapanan", label: "Kapananlar", ipucu: "Tahsil edilmiş/ödenmiş alacak-borçlar ve deftere işlenmiş gelir/giderler" }, // dil:anahtar
];

function fmtMoney(amount: number, currency: string, kisa = false): string {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      // Grafiğin tavan etiketi dar bir şeride sığmalı: "₺42 B".
      ...(kisa ? { notation: "compact" as const, maximumFractionDigits: 1 } : {}),
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fmtDate(value: unknown): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("tr-TR");
}

/** records içindeki `amount`ları para birimine göre gruplayıp toplar. */
function sumByCurrency(records: ModuleRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of records) {
    const currency = (r.data.currency as string) || "TRY";
    const amount = Number(r.data.amount) || 0;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

const tutarAl = (r: ModuleRecord) => Number(r.data.amount) || 0;
const paraBirimiAl = (r: ModuleRecord) => (r.data.currency as string) || "TRY";
/** Defterde tarih `entryDate`; girilmemişse kaydın açılma günü. */
const defterTarihi = (r: ModuleRecord) => String(r.data.entryDate ?? r.createdAt).slice(0, 10);
/** Alacak/borçta tarih VADE; girilmemişse çok uzak sayılır ki listenin sonuna düşsün. */
const vadeTarihi = (r: ModuleRecord) => String(r.data.dueDate ?? "9999-12-31").slice(0, 10);

function SummaryCard({ label, value, tone, vurgulu }: { label: string; value: string; tone?: "positive" | "negative"; vurgulu?: boolean }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        background: vurgulu ? `${c.accent}12` : c.surface,
        border: `1px solid ${vurgulu ? c.accent : c.border}`,
        borderRadius: 10,
        padding: "9px 11px",
      }}
    >
      <div style={{ fontSize: 11.5, color: c.textSecondary, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: tone === "positive" ? c.success : tone === "negative" ? c.danger : c.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Şirket "Kasa" sekmesi: gelir/gider defteri + alacak/borç takibi.
 *
 * Departman kasasından farkı — burada görev bazlı bir bütçe onay akışı yok
 * (organizasyonların kendine ait bir "İşler" listesi olmadığı için, bkz.
 * OrganizationDetail'deki aynı not); yalnızca genel gelir/gider defteri + henüz
 * tahsil/ödeme yapılmamış alacak-borç kayıtları var. İkisi de generic
 * module-records sistemi üzerinden tutulur (bkz. moduleRecordConfigs.ts
 * fm_gelir_gider / fm_alacak_borc) — yeni bir tablo/migration gerekmedi.
 *
 * Düzen kişisel kasayla aynı (özet şeridi → grafik → süzgeç çubuğu → listeler);
 * üç kasa arasında gezinen kullanıcı her seferinde yeni bir ekran öğrenmesin.
 */
const OrgBudgetPanel = forwardRef<OrgBudgetPanelHandle, Props>(function OrgBudgetPanel({ organizationId }, ref) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const [ledger, setLedger] = useState<ModuleRecord[]>([]);
  const [rp, setRp] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState<BudgetQuickAddKind | null>(null);
  // Düzenlenen kayıt: gelir/gider defteri ile alacak/borç aynı modalı kullanır,
  // hangi modülün alanlarının çizileceği kaydın kendi moduleKey'inden gelir.
  const [editing, setEditing] = useState<ModuleRecord | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [siralama, setSiralama] = useState<SiralamaKey>("yakin");
  const [odak, setOdak] = useState<OdakKey>("tumu");
  const { pushUndo, pushDestructive } = useUndo();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${LEDGER_KEY}`).catch(() => []),
      api.get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${RP_KEY}`).catch(() => []),
    ]).then(([l, r]) => {
      setLedger(l);
      setRp(r);
      setLoading(false);
    });
  };

  useEffect(load, [organizationId]);

  useImperativeHandle(ref, () => ({
    openQuickAdd: (kind) => setQuickAdd(kind),
  }));

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const handleDelete = async (id: string) => {
    // Kayıt iki listeden birinde: hangisinde olduğunu bilmeye gerek yok, ikisinden de düş.
    setLedger((prev) => prev.filter((r) => r.id !== id));
    setRp((prev) => prev.filter((r) => r.id !== id));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/module-records/${id}`).catch(() => {});
      },
      restore: load,
    });
  };

  // Bir kaydın verisini sunucuda o hâle getirir; geri ve ileri alma aynı işlemi
  // farklı değerlerle çağırır (bkz. BudgetPanel'deki applyValues).
  const applyData = async (id: string, data: Record<string, unknown>) => {
    await api.patch(`/module-records/${id}`, { data }).catch(() => {});
    load();
  };

  // Düzenleme de geri alınabilir: bütçe girerken en sık yapılan hata yanlış
  // tutar yazmak ve Cmd/Ctrl+Z burada hiç çalışmıyordu.
  const handleEdited = (previous: ModuleRecord, saved: ModuleRecord) => {
    load();
    pushUndo({
      label: "Bütçe kaydı düzenlendi",
      run: () => applyData(previous.id, previous.data),
      redo: () => applyData(saved.id, saved.data),
    });
  };

  const handleSettle = async (record: ModuleRecord) => {
    setSettlingId(record.id);
    try {
      await api.patch(`/module-records/${record.id}`, { data: { ...record.data, status: "settled" } });
      load();
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    } finally {
      setSettlingId(null);
    }
  };

  const gelirKayitlari = useMemo(
    () => sirala(ledger.filter((r) => r.data.type === "income"), siralama, defterTarihi, tutarAl, true),
    [ledger, siralama]
  );
  const giderKayitlari = useMemo(
    () => sirala(ledger.filter((r) => r.data.type === "expense"), siralama, defterTarihi, tutarAl, true),
    [ledger, siralama]
  );
  const siraliRp = useMemo(() => sirala(rp, siralama, vadeTarihi, tutarAl, false), [rp, siralama]);

  const acikRp = siraliRp.filter((r) => r.data.status !== "settled");
  const openReceivables = acikRp.filter((r) => r.data.type !== "payable");
  const openPayables = acikRp.filter((r) => r.data.type === "payable");
  const settledRp = siraliRp.filter((r) => r.data.status === "settled");

  // Vadesi geçmiş / yaklaşan yalnızca AÇIK kayıtlar için sorulur: kapanmış bir
  // borcun vadesi geçmiş olsa da yapılacak bir şey kalmamıştır.
  const gecikmisler = acikRp.filter((r) => r.data.dueDate && kalanGun(vadeTarihi(r)) < 0);
  const yaklasanlar = acikRp.filter((r) => {
    if (!r.data.dueDate) return false;
    const kalan = kalanGun(vadeTarihi(r));
    return kalan >= 0 && kalan <= YAKLASAN_GUN;
  });

  const odakSayilari: Record<OdakKey, number | undefined> = {
    tumu: undefined,
    gecikmis: gecikmisler.length,
    yaklasan: yaklasanlar.length,
    kapanan: settledRp.length + ledger.length,
  };

  // Grafik tek para birimi gösterir: farklı birimleri toplamak yanlış bir
  // rakam üretirdi. En çok kaydı olan birim seçilir, çoklu ise başlıkta yazar.
  const defterBirimleri = sumByCurrency(ledger);
  const grafikBirimi =
    Array.from(defterBirimleri.keys()).sort(
      (a, b) => ledger.filter((r) => paraBirimiAl(r) === b).length - ledger.filter((r) => paraBirimiAl(r) === a).length
    )[0] ?? "TRY";
  const grafikHareketleri: KasaHareketi[] = ledger
    .filter((r) => paraBirimiAl(r) === grafikBirimi)
    .map((r) => ({
      occurredAt: defterTarihi(r),
      type: r.data.type === "expense" ? "expense" : "income",
      amount: tutarAl(r),
    }));

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  const incomeTotals = sumByCurrency(gelirKayitlari);
  const expenseTotals = sumByCurrency(giderKayitlari);
  const receivableTotals = sumByCurrency(openReceivables);
  const payableTotals = sumByCurrency(openPayables);
  const currencies = new Set([...incomeTotals.keys(), ...expenseTotals.keys(), ...receivableTotals.keys(), ...payableTotals.keys()]);
  if (currencies.size === 0) currencies.add("TRY");

  // Odak süzgeçleri. Bir bölüme uyan kayıt kalmadıysa bölüm hiç çizilmiyor;
  // "Tümü"de ise boş bölümler kendi açıklamalarıyla durur.
  // "Tümü"de açık kayıtlar TÜRE GÖRE değil VADEYE göre sıralı duruyor: seçilen
  // sıralama "yakın tarih önce" derken alacakları öne alıp aradaki borcu geriye
  // atmak listeyi yalancı yapıyordu. Türü zaten satırdaki rozet söylüyor.
  // Kapanmışlar en sona: üzerlerinde yapılacak iş kalmadı.
  const gorunenRp =
    odak === "tumu"
      ? [...acikRp, ...settledRp]
      : odak === "gecikmis"
        ? gecikmisler
        : odak === "yaklasan"
          ? yaklasanlar
          : settledRp;
  const defterGorunur = odak === "tumu" || odak === "kapanan";
  const bosSuzgec = odak !== "tumu" && gorunenRp.length === 0 && (!defterGorunur || ledger.length === 0);

  const quickAddConfig: Record<BudgetQuickAddKind, { moduleKey: string; title: string; preset: Record<string, string> }> = {
    income: { moduleKey: LEDGER_KEY, title: "Gelir ekle", preset: { type: "income" } },
    expense: { moduleKey: LEDGER_KEY, title: "Gider ekle", preset: { type: "expense" } },
    receivable: { moduleKey: RP_KEY, title: "Alacak ekle", preset: { type: "receivable", status: "open" } },
    payable: { moduleKey: RP_KEY, title: "Borç ekle", preset: { type: "payable", status: "open" } },
  };

  const bosKart = {
    border: `1px dashed ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 22,
    textAlign: "center",
    color: c.textSecondary,
    fontSize: 14,
  } as const;

  const sectionTitle = { fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* --- özet şerit --- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from(currencies).map((currency) => {
          const income = incomeTotals.get(currency) ?? 0;
          const expense = expenseTotals.get(currency) ?? 0;
          const net = income - expense;
          const receivable = receivableTotals.get(currency) ?? 0;
          const payable = payableTotals.get(currency) ?? 0;
          const suffix = currencies.size > 1 ? ` (${currency})` : "";
          return (
            <div
              key={currency}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))", gap: 8 }}
            >
              <SummaryCard label={`${t("Net")}${suffix}`} value={fmtMoney(net, currency)} tone={net >= 0 ? "positive" : "negative"} vurgulu />
              <SummaryCard label={`${t("Toplam gelir")}${suffix}`} value={fmtMoney(income, currency)} tone="positive" />
              <SummaryCard label={`${t("Toplam gider")}${suffix}`} value={fmtMoney(expense, currency)} tone="negative" />
              <SummaryCard label={`${t("Açık alacak")}${suffix}`} value={fmtMoney(receivable, currency)} />
              <SummaryCard label={`${t("Açık borç")}${suffix}`} value={fmtMoney(payable, currency)} />
            </div>
          );
        })}
      </div>

      <BudgetTrendChart
        transactions={grafikHareketleri}
        formatla={(tutar, kisa) => fmtMoney(tutar, grafikBirimi, kisa)}
        baslikEki={defterBirimleri.size > 1 ? grafikBirimi : undefined}
      />

      <KasaFiltreCubugu
        odaklar={odakSecenekleri.map((secenek) => ({
          ...secenek,
          sayi: odakSayilari[secenek.key],
          uyari: secenek.key === "gecikmis" && gecikmisler.length > 0,
        }))}
        odak={odak}
        onOdak={setOdak}
        siralama={siralama}
        onSiralama={setSiralama}
        siralamaId="org-kasa-sirala"
      />

      {bosSuzgec && <div style={bosKart}>{t("Bu süzgece uyan kayıt yok.")}</div>}

      {/* --- alacak / borç --- Vadesi olan taraf üstte: kasada ilk sorulan
          soru "neyi kaçırıyorum". */}
      {(gorunenRp.length > 0 || odak === "tumu") && (
        <section>
          <h2 style={sectionTitle}>{t("Alacak / Borç")}</h2>
          {gorunenRp.length === 0 ? (
            <div style={bosKart}>{t("Henüz alacak/borç kaydı yok.")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {gorunenRp.map((r) => {
                const isPayable = r.data.type === "payable";
                const isSettled = r.data.status === "settled";
                const busy = settlingId === r.id;
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
                      opacity: isSettled ? 0.6 : 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: 999,
                        flexShrink: 0,
                        color: isPayable ? c.danger : c.success,
                        background: isPayable ? `${c.danger}18` : `${c.success}18`,
                      }}
                    >
                      {isPayable ? "Borç" : "Alacak"}
                    </span>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(r.data.counterparty as string) ?? ""}
                        {r.data.category ? ` · ${r.data.category}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                        {fmtMoney(tutarAl(r), paraBirimiAl(r))}
                      </div>
                    </div>

                    {/* Vade rozeti kişisel kasadakiyle aynı bileşen: gecikmiş
                        kırmızı, yaklaşan kehribar. Kapanmışta anlamı kalmadı. */}
                    {!isSettled && r.data.dueDate ? <VadeRozeti tarih={vadeTarihi(r)} /> : null}

                    {!isSettled ? (
                      <button
                        onClick={() => handleSettle(r)}
                        disabled={busy}
                        style={{
                          fontSize: 12,
                          padding: "5px 10px",
                          borderRadius: 7,
                          border: "none",
                          background: c.primary,
                          color: c.onPrimary,
                          flexShrink: 0,
                          cursor: busy ? "wait" : "pointer",
                        }}
                      >
                        {isPayable ? "Ödendi" : "Tahsil edildi"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                        {isPayable ? "Ödendi" : "Tahsil edildi"}
                      </span>
                    )}
                    <button
                      onClick={() => setEditing(r)}
                      aria-label={t("Kaydı düzenle")}
                      style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex", cursor: "pointer" }}
                    >
                      <IconEdit size={14} color={c.textSecondary} />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
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
        </section>
      )}

      {/* --- T tablosu: gelir solda, gider sağda --- */}
      {defterGorunur && (
        <section>
          <h2 style={sectionTitle}>{t("Gelir / Gider")}</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              overflow: "hidden",
              background: c.surface,
            }}
          >
            <LedgerColumn
              title={t("Gelir")}
              records={gelirKayitlari}
              tone="positive"
              onEdit={setEditing}
              onDelete={handleDelete}
              borderRight={isDesktop}
            />
            <LedgerColumn title={t("Gider")} records={giderKayitlari} tone="negative" onEdit={setEditing} onDelete={handleDelete} />
          </div>
        </section>
      )}

      {editing && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={editing.moduleKey}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => handleEdited(editing, saved)}
        />
      )}

      {quickAdd && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={quickAddConfig[quickAdd].moduleKey}
          presetData={quickAddConfig[quickAdd].preset}
          titleOverride={quickAddConfig[quickAdd].title}
          onClose={() => setQuickAdd(null)}
          onSaved={load}
        />
      )}
    </div>
  );
});

export default OrgBudgetPanel;

/** T tablosunun bir sütunu: başlık + toplam, altında kayıtlar. */
function LedgerColumn({
  title,
  records,
  tone,
  onEdit,
  onDelete,
  borderRight,
}: {
  title: string;
  records: ModuleRecord[];
  tone: "positive" | "negative";
  onEdit: (record: ModuleRecord) => void;
  onDelete: (id: string) => void;
  borderRight?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const renk = tone === "positive" ? c.success : c.danger;
  const toplamlar = sumByCurrency(records);

  return (
    <div style={{ borderRight: borderRight ? `1px solid ${c.border}` : undefined, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 500,
          color: renk,
          background: c.background,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <span>{title}</span>
        {/* Toplam para birimi başına ayrı: farklı birimleri toplamak yanlış
            bir rakam üretir. */}
        <span style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {toplamlar.size === 0
            ? "—"
            : Array.from(toplamlar.entries()).map(([currency, toplam]) => (
                <span key={currency}>
                  {tone === "positive" ? "+" : "−"}
                  {fmtMoney(toplam, currency)}
                </span>
              ))}
        </span>
      </div>

      {records.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: 12 }}>{t("Kayıt yok.")}</p>
      ) : (
        records.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(r.data.description as string) || (r.data.category as string) || (tone === "positive" ? t("Gelir") : t("Gider"))}
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[fmtDate(r.data.entryDate), r.data.category as string | undefined].filter(Boolean).join(" · ")}
              </div>
            </div>

            <span style={{ fontSize: 14, fontWeight: 500, color: renk, flexShrink: 0 }}>
              {tone === "positive" ? "+" : "−"}
              {fmtMoney(tutarAl(r), paraBirimiAl(r))}
            </span>

            <button
              onClick={() => onEdit(r)}
              aria-label={t("Kaydı düzenle")}
              style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex", padding: 3, cursor: "pointer" }}
            >
              <IconEdit size={13} color={c.textSecondary} />
            </button>
            <button
              onClick={() => onDelete(r.id)}
              aria-label={t("Kaydı sil")}
              style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex", padding: 3, cursor: "pointer" }}
            >
              <IconTrash size={13} color={c.textSecondary} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
