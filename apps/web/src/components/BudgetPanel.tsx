import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { BudgetOverview, BudgetTransaction, RecurringPayment } from "@projelio/shared";
import { api } from "../api/client";
import { useRefreshOnUndo } from "../lib/undo";
import { FAB_PRIORITY, useProjectFabAction } from "../lib/projectFab";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { kalanGun, sirala, YAKLASAN_GUN, type SiralamaKey } from "../lib/butceOzeti";
import KasaFiltreCubugu, { type OdakSecenegi } from "./KasaFiltreCubugu";
import VadeRozeti from "./VadeRozeti";
import BudgetTrendChart from "./BudgetTrendChart";
import AddBudgetEntryModal from "./AddBudgetEntryModal";
import AddRecurringPaymentModal from "./AddRecurringPaymentModal";
import { useUndo } from "../lib/undo";
import { IconTrash, IconEdit, IconCalendar, IconFolder } from "./icons";
import { useT } from "../lib/i18n";

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

// Metinler t() ile burada değil, kullanıldıkları yerde çevriliyor: modül
// düzeyinde kanca çağrılamaz, Türkçe metin anahtar olarak kalır.
const intervalLabels: Record<string, string> = {
  weekly: "Her hafta", // dil:anahtar
  monthly: "Her ay", // dil:anahtar
  yearly: "Her yıl", // dil:anahtar
};

/**
 * Sayfanın odağı: hangi kayıtların gösterileceği.
 *
 * Kasa sayfasında sorulan soru "hangi kayıt daha yeni" değil, "neyi ödemem
 * gerekiyor, neyi tahsil edeceğim, ne gerçekleşti" — o yüzden filtre ölçütleri
 * tarih değil VADE ve GERÇEKLEŞME üzerinden.
 */
type OdakKey = "tumu" | "gecikmis" | "yaklasan" | "gerceklesen";

const odakSecenekleri: OdakSecenegi<OdakKey>[] = [
  { key: "tumu", label: "Tümü", ipucu: "Her şey" }, // dil:anahtar
  { key: "gecikmis", label: "Vadesi geçen", ipucu: "Vadesi dolmuş düzenli ödemeler ve tahsil edilmemiş alacaklar" }, // dil:anahtar
  { key: "yaklasan", label: "Vadesi yaklaşan", ipucu: "Önümüzdeki 7 gün içinde ödenecekler" }, // dil:anahtar
  { key: "gerceklesen", label: "Ödenenler", ipucu: "Deftere işlenmiş gelir/giderler ve tahsilatı biten projeler" }, // dil:anahtar
];

const typeLabels: Record<string, string> = {
  income: "Gelen ödeme", // dil:anahtar
  expense: "Gider", // dil:anahtar
  payout: "Hakediş ödemesi", // dil:anahtar
};

/**
 * Silinen bir kaydı özet toplamlarından düşer (iyimser güncelleme).
 *
 * Sunucudaki hesabın birebir aynısını burada tekrarlamıyoruz — yalnızca silinen
 * kaydın etkisini geri alıyoruz. Kalıcı doğruluk commit sonrası gelen
 * /budget/overview yanıtından geliyor; buradaki iş yalnızca aradaki birkaç
 * saniyede ekranın yalan söylememesi.
 */
function ozettenDus(ozet: BudgetOverview, tx: BudgetTransaction): BudgetOverview {
  const tutar = Number(tx.amount) || 0;
  const genel = !tx.projectId;

  if (tx.type === "income") {
    return {
      ...ozet,
      totalReceived: ozet.totalReceived - tutar,
      netEarned: ozet.netEarned - tutar,
      generalIncome: genel ? ozet.generalIncome - tutar : ozet.generalIncome,
    };
  }

  // expense ve payout, ikisi de gider tarafında.
  return {
    ...ozet,
    totalExpense: ozet.totalExpense - tutar,
    netEarned: ozet.netEarned + tutar,
    generalExpense: genel ? ozet.generalExpense - tutar : ozet.generalExpense,
  };
}

export default function BudgetPanel() {
  const c = useThemeColors();
  const t = useT();
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [addingEntry, setAddingEntry] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [addingRecurring, setAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringPayment | null>(null);
  const [siralama, setSiralama] = useState<SiralamaKey>("yakin");
  const [odak, setOdak] = useState<OdakKey>("tumu");
  const isDesktop = useIsDesktop();
  const { pushUndo, pushDestructive } = useUndo();
  // Anasayfadaki "+" düğmesi, sayfa kendi eylemini KAYDETMEZSE varsayılana —
  // "Yeni iş"e — düşüyor (bkz. BottomNav.tsx). Bütçe sekmesi bunu kaydetmediği
  // için gelir/gider eklemek isteyen kullanıcıya iş oluşturma ekranı açılıyordu.
  // BottomNav'daki yorumda aynı hatanın Yapılacaklar sayfasında yaşandığı yazıyor;
  // desen bu: yeni bir sekme eklerken kendi "+" eylemini de kaydet.
  //
  // Sekmede iki ayrı ekleme var (tek seferlik hareket ve düzenli ödeme); ikisi de
  // bölüm başlıklarında ayrı düğmelerdeydi, artık tek "+" menüsünde.
  useProjectFabAction(
    {
      label: t("Ekle"),
      options: [
        { label: t("Gelir / gider ekle"), onClick: () => setAddingEntry(true) },
        { label: t("Düzenli ödeme ekle"), onClick: () => setAddingRecurring(true) },
      ],
    },
    [],
    FAB_PRIORITY.panel
  );

  const reload = () => {
    api.get<BudgetOverview>("/budget/overview").then(setOverview).catch(() => setOverview(null));
    api.get<BudgetTransaction[]>("/budget/transactions").then(setTransactions).catch(() => setTransactions([]));
    api.get<RecurringPayment[]>("/budget/recurring").then(setRecurring).catch(() => setRecurring([]));
  };

  useEffect(reload, []);
  // Aynı sayfadaki başka biri değiştirdiğinde de tazelenir (bkz. lib/liveRoom.ts).
  useRefreshOnUndo(reload);

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const deleteTransaction = async (id: string) => {
    const silinen = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    // Satır anında listeden düşüyordu ama ÜSTTEKİ TOPLAMLAR eski kalıyordu:
    // özet ayrı bir uçtan (/budget/overview) geliyor ve yalnızca reload() ile
    // tazeleniyor — o da geri alma penceresi dolduktan saniyeler sonra çalışıyor.
    // Kullanıcı "sildim ama düşmedi" diye sayfayı yeniliyordu. Toplamı burada
    // aynı iyimser mantıkla düşüyoruz; commit sonrası gelen reload zaten
    // sunucudaki gerçek değerle üzerine yazacak.
    if (silinen) setOverview((prev) => (prev ? ozettenDus(prev, silinen) : prev));
    pushDestructive({
      label: t("Kayıt silme"),
      commit: async () => {
        await api.delete(`/budget/transactions/${id}`).catch(() => {});
        reload();
      },
      restore: reload,
    });
  };

  // Bir kaydın alanlarını sunucuda o hâle getirir; geri ve ileri alma aynı işlemi
  // farklı değerlerle çağırır.
  const applyValues = async (tx: BudgetTransaction) => {
    await api
      .patch(`/budget/transactions/${tx.id}`, {
        type: tx.type,
        amount: tx.amount,
        description: tx.description ?? "",
        projectId: tx.projectId ?? null,
        occurredAt: tx.occurredAt,
      })
      .catch(() => {});
    reload();
  };

  // Ekleme ve düzenleme de geri alınabilir: bütçe girerken en sık yapılan hata
  // yanlış tutar yazmak ve Cmd/Ctrl+Z burada hiç çalışmıyordu.
  const handleEntrySaved = (saved: BudgetTransaction, previous: BudgetTransaction | null) => {
    reload();
    if (previous) {
      pushUndo({
        label: t("Bütçe kaydı düzenlendi"),
        run: () => applyValues(previous),
        redo: () => applyValues(saved),
      });
      return;
    }
    const payload = {
      type: saved.type,
      amount: saved.amount,
      description: saved.description,
      projectId: saved.projectId,
      occurredAt: saved.occurredAt,
    };
    pushUndo({
      label: t("Bütçe kaydı eklendi"),
      run: async () => {
        await api.delete(`/budget/transactions/${saved.id}`).catch(() => {});
        reload();
      },
      redo: async () => {
        await api.post("/budget/transactions", payload);
        reload();
      },
    });
  };

  const deleteRecurring = async (id: string) => {
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    pushDestructive({
      label: t("Düzenli ödeme silme"),
      commit: async () => {
        await api.delete(`/budget/recurring/${id}`).catch(() => {});
        reload();
      },
      restore: reload,
    });
  };

  const toggleRecurring = async (payment: RecurringPayment) => {
    await api.patch(`/budget/recurring/${payment.id}`, { active: !payment.active });
    reload();
  };

  /**
   * "Ödendi" — düzenli ödemeyi şimdi deftere işler.
   *
   * Eskiden bunun tek yolu gecelik iş (her sabah 08:00) idi: vadesi geçmiş bir
   * ödeme kasada "gecikti" diye duruyor, kullanıcı ödemeyi gerçekten yapmış
   * olsa bile yapabileceği hiçbir şey yoktu. Sunucu kaçırılmış her dönem için
   * ayrı kayıt atıyor ve vadeyi ilerletiyor (bkz. islenecekDonemler).
   *
   * Geri alınabilir: oluşan kayıtlar silinip vade eski gününe döner.
   */
  const markRecurringPaid = async (payment: RecurringPayment) => {
    let sonuc: { olusanIdler: string[]; oncekiVade: string };
    try {
      sonuc = await api.post<{ olusanIdler: string[]; oncekiVade: string }>(
        `/budget/recurring/${payment.id}/ode`,
        {}
      );
    } catch {
      return;
    }
    reload();
    pushUndo({
      label: t("Ödeme işlendi"),
      run: async () => {
        await Promise.all(sonuc.olusanIdler.map((id) => api.delete(`/budget/transactions/${id}`).catch(() => {})));
        await api.patch(`/budget/recurring/${payment.id}`, { nextDueDate: sonuc.oncekiVade }).catch(() => {});
        reload();
      },
      redo: async () => {
        await api.post(`/budget/recurring/${payment.id}/ode`, {}).catch(() => {});
        reload();
      },
    });
  };

  const gecikmisSayisi = recurring.filter((r) => r.active && kalanGun(r.nextDueDate) < 0).length;
  const yaklasanSayisi = recurring.filter((r) => {
    if (!r.active) return false;
    const kalan = kalanGun(r.nextDueDate);
    return kalan >= 0 && kalan <= YAKLASAN_GUN;
  }).length;
  const odakSayilari: Record<OdakKey, number | null> = {
    tumu: null,
    gecikmis: gecikmisSayisi,
    yaklasan: yaklasanSayisi,
    gerceklesen: transactions.length,
  };

  const siraliHareketler = useMemo(
    () => sirala(transactions, siralama, (h) => h.occurredAt, (h) => Number(h.amount), true),
    [transactions, siralama]
  );
  const siraliDuzenli = useMemo(
    () => sirala(recurring, siralama, (r) => r.nextDueDate, (r) => Number(r.amount), false),
    [recurring, siralama]
  );

  // Odak süzgeçleri. Bir bölüme uyan kayıt kalmadıysa bölüm hiç çizilmiyor:
  // "vadesi geçen" seçiliyken üç ayrı boş liste göstermek filtreyi işe
  // yaramaz gösteriyordu.
  const gorunenDuzenli = siraliDuzenli.filter((r) => {
    if (odak === "tumu") return true;
    if (odak === "gerceklesen") return false;
    if (!r.active) return false;
    const kalan = kalanGun(r.nextDueDate);
    return odak === "gecikmis" ? kalan < 0 : kalan >= 0 && kalan <= YAKLASAN_GUN;
  });
  const hareketlerGorunur = odak === "tumu" || odak === "gerceklesen";
  const gorunenProjeler = (overview?.projects ?? []).filter((p) => {
    if (odak === "tumu") return true;
    if (odak === "gecikmis") return p.expected > 0;
    if (odak === "gerceklesen") return p.fullyCollected;
    return false;
  });

  const gelirler = siraliHareketler.filter((h) => h.type === "income");
  const giderler = siraliHareketler.filter((h) => h.type !== "income");
  const gelirToplam = gelirler.reduce((toplam, h) => toplam + Number(h.amount), 0);
  const giderToplam = giderler.reduce((toplam, h) => toplam + Number(h.amount), 0);

  // Süzgeç açıkken hiçbir bölüme kayıt düşmediyse tek bir satır yazılır.
  // "Tümü"de bölümler kendi boş durum metinleriyle çizilmeye devam eder:
  // düzenli ödemenin ne işe yaradığını anlatan metin oradan öğreniliyor.
  const bosSuzgec =
    odak !== "tumu" && gorunenDuzenli.length === 0 && gorunenProjeler.length === 0 && !hareketlerGorunur;

  const cardStyle = {
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 12,
  } as const;

  const sectionTitle = {
    fontSize: 15,
    fontWeight: 500,
    color: c.textPrimary,
    margin: "0 0 10px",
  } as const;

  const ikonDugmesi = {
    background: "transparent",
    border: "none",
    padding: 3,
    display: "flex",
    cursor: "pointer",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Özet şerit — tek satır, küçük kutular. Sayfanın gövdesi grafik ve
          listeler; özet yalnızca "kasada ne var" sorusunu cevaplıyor. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))", gap: 8 }}>
        <SummaryCard label={t("Net kazanç")} value={overview?.netEarned ?? 0} color={(overview?.netEarned ?? 0) < 0 ? c.danger : c.success} vurgulu />
        <SummaryCard label={t("Gelen ödeme")} value={overview?.totalReceived ?? 0} color={c.success} />
        <SummaryCard label={t("Beklenen ödeme")} value={overview?.totalExpected ?? 0} color={c.warning} />
        <SummaryCard label={t("Gider")} value={overview?.totalExpense ?? 0} color={c.danger} />
        <SummaryCard label={t("Anlaşılan ücret")} value={overview?.totalAgreedFee ?? 0} color={c.textPrimary} />
      </div>

      <BudgetTrendChart transactions={transactions} />

      {/* Süzgeç ve sıralama sayfanın ÜSTÜNDE, listelerin hepsinden önce:
          aşağıdaki her bölüm bu iki denetime bağlı. */}
      <KasaFiltreCubugu
        odaklar={odakSecenekleri.map((secenek) => ({
          ...secenek,
          sayi: odakSayilari[secenek.key] ?? undefined,
          // Gecikmiş kayıt varsa süzgeç, seçili olmasa bile uyarı rengini
          // taşır: kullanıcının o listeyi açmak için önce tıklaması gerekmesin.
          uyari: secenek.key === "gecikmis" && gecikmisSayisi > 0,
        }))}
        odak={odak}
        onOdak={setOdak}
        siralama={siralama}
        onSiralama={setSiralama}
      />

      {bosSuzgec && (
        <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 14, padding: 24 }}>
          {t("Bu süzgece uyan kayıt yok.")}
        </div>
      )}

      {/* Vade takibi: ödenecekler önce, çünkü kasa sayfasında ilk sorulan soru
          "neyi kaçırıyorum". */}
      {(gorunenDuzenli.length > 0 || odak === "tumu") && (
        <section>
          <h2 style={sectionTitle}>{t("Düzenli ödemeler")}</h2>
          {gorunenDuzenli.length === 0 ? (
            <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 14, padding: 22 }}>
              {t(
                'Kira, abonelik gibi tekrar eden ödemeleri sayfadaki "+" ile ekle. Vadesi gelince bütçene otomatik işlenir ve bildirim gönderilir.'
              )}
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {gorunenDuzenli.map((r) => (
              <div
                key={r.id}
                style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: r.active ? 1 : 0.55 }}
              >
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: 14, color: c.textPrimary }}>
                    {r.description || (r.type === "income" ? t("Düzenli gelir") : t("Düzenli gider"))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    <IconCalendar size={11} color={c.textSecondary} />
                    <span>{t(intervalLabels[r.interval])}</span>
                    {r.projectTitle && <span>· {r.projectTitle}</span>}
                  </div>
                </div>

                {r.active && <VadeRozeti tarih={r.nextDueDate} />}

                <span style={{ fontSize: 14, fontWeight: 500, color: r.type === "income" ? c.success : c.danger }}>
                  {r.type === "income" ? "+" : "−"}
                  {formatMoney(r.amount)}
                </span>

                {/* Ödemeyi deftere işleyen tek düğme. Vadesi gelmemişse de
                    basılabilir (erken ödeme): sunucu kaydı bugünün tarihiyle
                    atar, ödeme günü kaymaz. Duraklatılmışta gizli. */}
                {r.active && (
                  <button
                    type="button"
                    onClick={() => markRecurringPaid(r)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: c.primary,
                      color: c.onPrimary,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {r.type === "income" ? t("Tahsil edildi") : t("Ödendi")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleRecurring(r)}
                  style={{
                    padding: "4px 9px",
                    borderRadius: 7,
                    border: `1px solid ${c.border}`,
                    background: c.surface,
                    color: c.textSecondary,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {r.active ? t("Duraklat") : t("Sürdür")}
                </button>
                <button type="button" onClick={() => setEditingRecurring(r)} aria-label={t("Düzenle")} style={ikonDugmesi}>
                  <IconEdit size={14} color={c.textSecondary} />
                </button>
                <button type="button" onClick={() => deleteRecurring(r.id)} aria-label={t("Sil")} style={ikonDugmesi}>
                  <IconTrash size={14} color={c.danger} />
                </button>
              </div>
            ))}
          </div>
          )}
        </section>
      )}

      {/* Hareketler: gelir solda, gider sağda — defter mantığıyla T tablosu.
          Tek listede gelirle gider iç içe geçiyordu ve hangi tarafın ağır
          bastığı ancak tek tek okuyunca anlaşılıyordu. */}
      {hareketlerGorunur && (
        <section>
          <h2 style={sectionTitle}>{t("Hareketler")}</h2>
          {transactions.length === 0 ? (
            <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 14, padding: 22 }}>
              {t('Henüz bir hareket yok. Gelir/gider eklemek için sayfadaki "+" düğmesini kullan.')}
            </div>
          ) : (
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
            <HareketSutunu
              baslik={t("Gelir")}
              toplam={gelirToplam}
              renk={c.success}
              hareketler={gelirler}
              isaret="+"
              onEdit={setEditingTransaction}
              onDelete={deleteTransaction}
              borderRight={isDesktop}
            />
            <HareketSutunu
              baslik={t("Gider")}
              toplam={giderToplam}
              renk={c.danger}
              hareketler={giderler}
              isaret="−"
              onEdit={setEditingTransaction}
              onDelete={deleteTransaction}
            />
          </div>
          )}
        </section>
      )}

      {/* Proje bazlı tahsilat durumu */}
      {(gorunenProjeler.length > 0 || odak === "tumu") && (
        <section>
          <h2 style={sectionTitle}>{t("Projelere göre tahsilat")}</h2>
          {gorunenProjeler.length === 0 ? (
            <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 14, padding: 22 }}>
              {t("Henüz bütçesi olan bir projen yok.")}
            </div>
          ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isDesktop ? "repeat(2, 1fr)" : "1fr",
              gap: 8,
              alignItems: "start",
            }}
          >
            {gorunenProjeler.map((p) => {
              const progress = p.agreedFee > 0 ? Math.min(100, (p.received / p.agreedFee) * 100) : 0;
              return (
                <Link key={p.projectId} to={`/projects/${p.projectId}`} style={{ ...cardStyle, display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <IconFolder size={13} color={c.textSecondary} />
                    <span style={{ flex: 1, minWidth: 120, fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
                      {p.projectTitle}
                    </span>
                    {p.fullyCollected ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: c.success,
                          background: `${c.success}1a`,
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                      >
                        {t("Tahsilat tamam")}
                        {p.overpaid > 0 && t(" · +{tutar} fazla", { tutar: formatMoney(p.overpaid) })}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: c.textSecondary }}>
                        {t("{tutar} anlaşıldı", { tutar: formatMoney(p.agreedFee) })}
                      </span>
                    )}
                  </div>

                  {/* Tahsilat ilerlemesi */}
                  <div style={{ height: 5, borderRadius: 999, background: c.background, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: c.success }} />
                  </div>

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
                    <span style={{ color: c.textSecondary }}>
                      {t("Gelen")} <strong style={{ color: c.success, fontWeight: 500 }}>{formatMoney(p.received)}</strong>
                    </span>
                    <span style={{ color: c.textSecondary }}>
                      {t("Beklenen")}{" "}
                      <strong style={{ color: p.expected > 0 ? c.warning : c.textSecondary, fontWeight: 500 }}>
                        {formatMoney(p.expected)}
                      </strong>
                    </span>
                    {p.expense > 0 && (
                      <span style={{ color: c.textSecondary }}>
                        {t("Gider")} <strong style={{ color: c.danger, fontWeight: 500 }}>{formatMoney(p.expense)}</strong>
                      </span>
                    )}
                    <span style={{ color: c.textSecondary }}>
                      {t("Net")}{" "}
                      <strong style={{ color: p.netEarned < 0 ? c.danger : c.textPrimary, fontWeight: 500 }}>
                        {formatMoney(p.netEarned)}
                      </strong>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          )}
        </section>
      )}

      {editingTransaction && (
        <AddBudgetEntryModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={(saved) => handleEntrySaved(saved, editingTransaction)}
        />
      )}
      {addingEntry && (
        <AddBudgetEntryModal onClose={() => setAddingEntry(false)} onSaved={(saved) => handleEntrySaved(saved, null)} />
      )}
      {addingRecurring && <AddRecurringPaymentModal onClose={() => setAddingRecurring(false)} onSaved={reload} />}
      {editingRecurring && (
        <AddRecurringPaymentModal
          payment={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

/** T tablosunun bir sütunu: başlık + toplam, altında hareketler. */
function HareketSutunu({
  baslik,
  toplam,
  renk,
  hareketler,
  isaret,
  onEdit,
  onDelete,
  borderRight,
}: {
  baslik: string;
  toplam: number;
  renk: string;
  hareketler: BudgetTransaction[];
  isaret: string;
  onEdit: (tx: BudgetTransaction) => void;
  onDelete: (id: string) => void;
  borderRight?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ borderRight: borderRight ? `1px solid ${c.border}` : undefined, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 12px",
          background: c.background,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: renk }}>{baslik}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: renk }}>
          {isaret}
          {formatMoney(toplam)}
        </span>
      </div>

      {hareketler.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: 12 }}>{t("Kayıt yok.")}</p>
      ) : (
        hareketler.map((hareket) => (
          <div
            key={hareket.id}
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
                {hareket.description || t(typeLabels[hareket.type])}
                {hareket.recurringPaymentId && (
                  <span style={{ fontSize: 11, color: c.textSecondary, marginLeft: 6 }}>{t("otomatik")}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {formatDate(hareket.occurredAt)}
                {hareket.projectTitle
                  ? ` · ${hareket.projectTitle}`
                  : hareket.departmentName
                    ? ` · ${hareket.departmentName}`
                    : t(" · genel")}
              </div>
            </div>

            <span style={{ fontSize: 14, fontWeight: 500, color: renk, flexShrink: 0 }}>
              {isaret}
              {formatMoney(hareket.amount)}
            </span>

            {/* Otomatik işlenen kayıt elle düzenlenmez: kaynağı düzenli ödeme
                kuralıdır, oradan yönetilir. */}
            {!hareket.recurringPaymentId && (
              <button
                type="button"
                onClick={() => onEdit(hareket)}
                aria-label={t("Düzenle")}
                style={{ background: "transparent", border: "none", padding: 3, display: "flex", flexShrink: 0, cursor: "pointer" }}
              >
                <IconEdit size={14} color={c.textSecondary} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete(hareket.id)}
              aria-label={t("Sil")}
              style={{ background: "transparent", border: "none", padding: 3, display: "flex", flexShrink: 0, cursor: "pointer" }}
            >
              <IconTrash size={14} color={c.danger} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  vurgulu,
}: {
  label: string;
  value: number;
  color: string;
  vurgulu?: boolean;
}) {
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
      <div style={{ fontSize: 17, fontWeight: 600, color }}>{formatMoney(value)}</div>
    </div>
  );
}
