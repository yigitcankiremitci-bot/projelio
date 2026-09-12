import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BudgetScopeType, BudgetTransaction, BudgetTransactionType, ButceSayfasi } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { useRefreshOnUndo, useUndo } from "../../lib/undo";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { IconEdit, IconTrash } from "../icons";
import ButceOzetSeridi from "./ButceOzetSeridi";
import NakitAkisGrafigi from "./NakitAkisGrafigi";
import TTablosu from "./TTablosu";
import KademeKirilimi from "./KademeKirilimi";
import OnayKuyrugu from "./OnayKuyrugu";
import DuzenliOdemeler from "./DuzenliOdemeler";
import HedefSecici, { GorevBagiDuzenle } from "./HedefSecici";
import ButceGorunurluk from "./ButceGorunurluk";
import { PARA_BIRIMLERI, fmtPara, fmtTarih } from "./butceBicim";
import { RECURRENCE_INTERVAL_LABEL, RECURRENCE_INTERVALS, type RecurrenceInterval } from "@projelio/shared";

export interface ScopeBudgetPanelHandle {
  openCreate: () => void;
}

interface Props {
  /** "job" | "department" | "organization" | "group" */
  scopeType: string;
  scopeId: string;
}

const TUR_ETIKET: Record<BudgetTransactionType, string> = {
  income: "Gelir",
  expense: "Gider",
  payout: "Hakediş/Ödeme",
};

/** Alt kademe kartına tıklayınca gidilecek sayfa. */
const KADEME_YOLU: Partial<Record<BudgetScopeType, string>> = {
  organization: "/organizations",
  job: "/jobs",
  department: "/departments",
  project: "/projects",
};

/**
 * İş / departman / şirket / holding bütçe sekmesi — DÖRDÜ AYNI BİLEŞEN.
 *
 * Dört ayrı panel yazılsaydı (departman paneli zaten öyle yazılmıştı) aynı
 * düzeltme dört yerde yapılmak zorunda kalırdı ve biri her seferinde unutulurdu.
 * Kademeye göre değişen tek şey verinin nereden geldiği; ekranın kendisi aynı.
 *
 * SAYFANIN SIRASI, kullanıcının sorularının sırası:
 *   1. Onay bekleyenler — bu ekranda kullanıcıdan iş isteyen tek şey
 *   2. Özet          — "ne durumdayız"
 *   3. Nakit akışı   — "hangi yöne gidiyoruz"
 *   4. T tablosu     — "para nereden geldi, nereye gitti"
 *   5. Alt kademeler — "hangi birim ne getirdi" (hiyerarşinin göründüğü yer)
 *   6. Defter        — "tek tek hangi kayıtlar"
 *   7. Düzenli ödemeler ve görünürlük — ayarlar
 *
 * Tüm veri TEK UÇTAN geliyor (bkz. ButceHiyerarsiService.sayfa): parçalara
 * bölünseydi ekran bunları farklı anlarda alır ve kendi içinde çelişen bir
 * tablo gösterebilirdi.
 */
const ScopeBudgetPanel = forwardRef<ScopeBudgetPanelHandle, Props>(function ScopeBudgetPanel(
  { scopeType, scopeId },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { pushUndo, pushDestructive } = useUndo();

  const [sayfa, setSayfa] = useState<ButceSayfasi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [erisimHatasi, setErisimHatasi] = useState("");
  const [secilenBirim, setSecilenBirim] = useState<string | null>(null);

  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<BudgetTransaction | null>(null);
  const [type, setType] = useState<BudgetTransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  // "Bu kayıt neyle ilgili?" — hedef kademe ve (varsa) görev.
  const [hedef, setHedef] = useState({ hedefTur: "", hedefId: "", taskId: "" });
  // Düzenliye çevrilmek üzere açılan satır ve seçilen aralık.
  const [cevrilen, setCevrilen] = useState<BudgetTransaction | null>(null);
  const [cevirmeAraligi, setCevirmeAraligi] = useState<RecurrenceInterval>("monthly");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");
  /**
   * "Kayıt şuraya yazıldı" bildirimi.
   *
   * Hedef seçilerek eklenen kayıt ALT kademenin defterine gidiyor, yani bu
   * sayfadaki "Bu kademenin kayıtları" listesinde GÖRÜNMÜYOR (yalnızca
   * toplamlara ve "Alt kademeler" kırılımına yansıyor). Bunu söylemezsek
   * kullanıcı kaydın kaybolduğunu sanıyor.
   */
  const [bilgi, setBilgi] = useState("");

  useImperativeHandle(ref, () => ({ openCreate: () => setFormAcik(true) }));

  const yukle = () => {
    setYukleniyor(true);
    api
      .get<ButceSayfasi>(`/budget/scope/${scopeType}/${scopeId}`)
      .then((veri) => {
        setSayfa(veri);
        setErisimHatasi("");
      })
      .catch((err) => setErisimHatasi(err instanceof Error ? err.message : t("Bu bütçeyi görüntüleyemiyorsun.")))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [scopeType, scopeId]);
  // Aynı sayfadaki başka biri değiştirdiğinde de tazelenir (bkz. lib/liveRoom.ts).
  useRefreshOnUndo(yukle);

  /**
   * Gösterilecek para birimi.
   *
   * Defter çok para birimli olabilir ama bir ekranda tek bir "toplam" gösterilir
   * — kur dönüşümü yapılmadığı için iki birimi tek kutuda toplamak yanlış olur.
   * Varsayılan, defterde en çok KAYDI olan birim (tutarı en büyük olan değil:
   * tek bir 50.000 USD'lik kayıt yüzünden 300 kayıtlık ₺ defterinin arkaya
   * düşmesi kullanıcıyı şaşırtır).
   */
  const birimler = useMemo(() => sayfa?.tTablolari.map((tablo) => tablo.currency) ?? [], [sayfa]);
  const aktifBirim = secilenBirim && birimler.includes(secilenBirim) ? secilenBirim : (birimler[0] ?? "TRY");

  const formuSifirla = () => {
    setDuzenlenen(null);
    setType("expense");
    setAmount("");
    setCurrency(aktifBirim);
    setCategory("");
    setDescription("");
    setOccurredAt("");
    setHedef({ hedefTur: "", hedefId: "", taskId: "" });
  };

  const duzenlemeyeBasla = (kayit: BudgetTransaction) => {
    setDuzenlenen(kayit);
    setType(kayit.type);
    setAmount(String(kayit.amount));
    setCurrency(kayit.currency || "TRY");
    setCategory(kayit.category ?? "");
    setDescription(kayit.description ?? "");
    setOccurredAt(kayit.occurredAt ? kayit.occurredAt.slice(0, 10) : "");
    // Düzenlemede kademe DEĞİŞTİRİLEMEZ (kaydı başka bir şirkete taşımak iki
    // kademenin geçmiş toplamını birden değiştirirdi), ama görev bağı
    // değiştirilebilir — çoğu zaman "bu masraf şu görev içindi" sonradan
    // fark ediliyor.
    setHedef({ hedefTur: "", hedefId: "", taskId: kayit.taskId ?? "" });
    setHata("");
    setFormAcik(true);
  };

  // Bir kaydın alanlarını sunucuda o hâle getirir. Geri/ileri alma da bunu
  // kullanır: "eski değerlere dön" ile "yeni değerleri tekrar uygula" aynı işlem.
  const degerleriUygula = async (tx: BudgetTransaction) => {
    await api
      .patch(`/budget/transactions/${tx.id}`, {
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        category: tx.category ?? "",
        description: tx.description ?? "",
        occurredAt: tx.occurredAt,
      })
      .catch(() => {});
    yukle();
  };

  const kaydet = async () => {
    setHata("");
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setHata(t("Geçerli bir tutar gir"));
      return;
    }
    setKaydediliyor(true);
    try {
      const govde = {
        type,
        amount: n,
        currency,
        category: category || "",
        description: description || "",
        occurredAt: occurredAt || undefined,
        taskId: hedef.taskId || "",
        // Hedef yalnızca EKLEMEDE gönderiliyor; düzenlemede kademe sabit.
        ...(duzenlenen ? {} : { hedefTur: hedef.hedefTur || undefined, hedefId: hedef.hedefId || undefined }),
      };

      if (duzenlenen) {
        const onceki = duzenlenen;
        const kaydedilen = await api.patch<BudgetTransaction>(`/budget/transactions/${duzenlenen.id}`, govde);
        pushUndo({
          label: "Bütçe kaydı düzenlendi",
          run: () => degerleriUygula(onceki),
          redo: () => degerleriUygula(kaydedilen),
        });
      } else {
        const olusan = await api.post<BudgetTransaction>(`/budget/scope/${scopeType}/${scopeId}/transactions`, govde);
        // Kayıt bu kademeye değil, seçilen hedefe yazıldıysa nereye gittiğini
        // söyle: aksi hâlde aşağıdaki listede görünmediği için kaybolmuş sanılıyor.
        const yazildigiYer = olusan.projectTitle || olusan.departmentName || olusan.jobTitle || olusan.organizationName;
        setBilgi(
          olusan.scopeType !== scopeType && yazildigiYer
            ? t("Kayıt {yer} defterine yazıldı; buradaki toplamlara dahil.", { yer: yazildigiYer })
            : ""
        );
        // Ekleme de geri alınabilir olmalı: bütçe girerken en sık yapılan hata
        // yanlış tutar yazmak.
        pushUndo({
          label: "Bütçe kaydı eklendi",
          run: async () => {
            await api.delete(`/budget/transactions/${olusan.id}`).catch(() => {});
            yukle();
          },
          redo: async () => {
            await api.post(`/budget/scope/${scopeType}/${scopeId}/transactions`, govde);
            yukle();
          },
        });
      }

      formuSifirla();
      setFormAcik(false);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kayıt kaydedilemedi."));
    } finally {
      setKaydediliyor(false);
    }
  };

  /**
   * Tek seferlik bir kaydı düzenli gelir/gidere çevirir.
   *
   * Kayıt SİLİNMEZ: o para gerçekten çıktı ve defterde kalmalı. Yeni düzenli
   * ödeme bir sonraki vadeden başlıyor (sunucu hesaplıyor), yoksa aynı ay iki
   * kez işlenir ve gider iki katı görünürdü.
   */
  const duzenliyeCevir = async () => {
    if (!cevrilen) return;
    setKaydediliyor(true);
    setHata("");
    try {
      await api.post(`/budget/transactions/${cevrilen.id}/recurring`, { interval: cevirmeAraligi });
      setCevrilen(null);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Düzenli hâle getirilemedi."));
    } finally {
      setKaydediliyor(false);
    }
  };

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const sil = async (id: string) => {
    setSayfa((prev) => (prev ? { ...prev, hareketler: prev.hareketler.filter((h) => h.id !== id) } : prev));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/budget/transactions/${id}`).catch(() => {});
      },
      restore: yukle,
    });
  };

  if (yukleniyor) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
  if (erisimHatasi || !sayfa) {
    return (
      <div
        style={{
          border: `1px dashed ${c.border}`,
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 14,
        }}
      >
        {erisimHatasi || t("Bu bütçeyi görüntüleyemiyorsun.")}
      </div>
    );
  }

  const { ozet, yetki } = sayfa;
  const aktifTablo = sayfa.tTablolari.find((tablo) => tablo.currency === aktifBirim);
  const aktifNoktalar = sayfa.donemler.filter((n) => n.currency === aktifBirim);
  const defterHareketleri = sayfa.hareketler.filter((h) => (h.currency || "TRY") === aktifBirim);
  const bolumBaslik = { fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" } as const;
  const bosKart = {
    border: `1px dashed ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 22,
    textAlign: "center",
    color: c.textSecondary,
    fontSize: 14,
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {yetki.canApprove && <OnayKuyrugu talepler={sayfa.onayBekleyenler} onDegisti={yukle} />}

      {/* Para birimi seçici yalnızca birden fazla birim varsa: tek birimli
          defterde gereksiz bir düğme sırası kullanıcıyı "bir şey seçmem mi
          gerekiyor" diye duraklatır. */}
      {birimler.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Para birimi")}</span>
          {birimler.map((birim) => (
            <button
              key={birim}
              onClick={() => setSecilenBirim(birim)}
              style={{
                fontSize: 12.5,
                padding: "3px 11px",
                borderRadius: 999,
                border: `1px solid ${birim === aktifBirim ? c.accent : c.border}`,
                background: birim === aktifBirim ? `${c.accent}18` : "transparent",
                color: birim === aktifBirim ? c.accentDark : c.textSecondary,
                cursor: "pointer",
              }}
            >
              {birim}
            </button>
          ))}
        </div>
      )}

      <ButceOzetSeridi ozet={ozet} currency={aktifBirim} />

      <NakitAkisGrafigi noktalar={aktifNoktalar} currency={aktifBirim} />

      <section>
        <h2 style={bolumBaslik}>{t("Gelir / Gider tablosu")}</h2>
        {aktifTablo ? (
          <TTablosu tablo={aktifTablo} />
        ) : (
          <div style={bosKart}>{t("Henüz bir gelir/gider kaydı yok.")}</div>
        )}
      </section>

      {ozet.cocuklar.length > 0 && (
        <section>
          <h2 style={bolumBaslik}>{t("Alt kademeler")}</h2>
          <KademeKirilimi
            cocuklar={ozet.cocuklar}
            currency={aktifBirim}
            onAc={(cocuk) => {
              const yol = KADEME_YOLU[cocuk.scopeType];
              if (yol) navigate(`${yol}/${cocuk.scopeId}?tab=budget`);
            }}
          />
        </section>
      )}

      {/* Defter: yalnızca BU kademeye girilmiş kayıtlar. Alt kademelerin
          kayıtları burada değil — onlar kendi ekranlarında düzenlenir,
          buraya yalnızca toplam olarak yansır. */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <h2 style={{ ...bolumBaslik, margin: 0 }}>{t("Bu kademenin kayıtları")}</h2>
          {yetki.canManage && (
            <button
              onClick={() => {
                setFormAcik((v) => !v);
                formuSifirla();
                setHata("");
              }}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              {formAcik ? t("Vazgeç") : t("+ Kayıt ekle")}
            </button>
          )}
        </div>

        {formAcik && yetki.canManage && (
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
              <select
                value={type}
                onChange={(e) => setType(e.target.value as BudgetTransactionType)}
                style={{ flex: 1, minWidth: 120 }}
              >
                <option value="income">{t("Gelir")}</option>
                <option value="expense">{t("Gider")}</option>
                <option value="payout">{t("Hakediş/Ödeme")}</option>
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
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("Kategori (örn. Kira, Yazılım, Satış)")}
                style={{ flex: 1, minWidth: 160 }}
              />
              <input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                style={{ flex: 1, minWidth: 140 }}
              />
            </div>

            {/* "Bu kayıt neyle ilgili?" — kademe ve (varsa) görev.
                Düzenlemede kademe seçilemiyor: kaydı başka bir şirkete taşımak
                iki kademenin geçmiş toplamını birden değiştirirdi. Görev bağı
                ise düzenlemede de değiştirilebilir. */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {duzenlenen ? (
                <GorevBagiDuzenle
                  kayit={duzenlenen}
                  taskId={hedef.taskId}
                  onChange={(taskId) => setHedef((h) => ({ ...h, taskId }))}
                />
              ) : (
                <HedefSecici
                  scopeType={scopeType}
                  scopeId={scopeId}
                  hedefTur={hedef.hedefTur}
                  hedefId={hedef.hedefId}
                  taskId={hedef.taskId}
                  onChange={setHedef}
                />
              )}
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("Açıklama")}
              style={{ width: "100%" }}
            />
            {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={kaydet}
                disabled={kaydediliyor}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "none",
                  background: c.primary,
                  color: c.onPrimary,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {kaydediliyor ? t("Kaydediliyor…") : duzenlenen ? t("Değişikliği kaydet") : t("Kaydet")}
              </button>
              <button
                onClick={() => {
                  formuSifirla();
                  setFormAcik(false);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  color: c.textSecondary,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {t("Vazgeç")}
              </button>
            </div>
          </div>
        )}

        {bilgi && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: `${c.success}12`,
              border: `1px solid ${c.success}`,
              borderRadius: 10,
              padding: "8px 11px",
              marginBottom: 10,
              fontSize: 13,
              color: c.textPrimary,
            }}
          >
            <span style={{ flex: 1 }}>{bilgi}</span>
            <button
              onClick={() => setBilgi("")}
              aria-label={t("Kapat")}
              style={{ background: "transparent", border: "none", color: c.textSecondary, cursor: "pointer", fontSize: 15 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Düzenliye çevirme: hangi aralıkta tekrarlayacağını sormak zorunlu,
            çünkü kaydın kendisinde bu bilgi yok. Kayıt olduğu yerde durur. */}
        {cevrilen && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              background: `${c.accent}10`,
              border: `1px solid ${c.accent}`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, color: c.textPrimary }}>
                {cevrilen.description || cevrilen.category || t(TUR_ETIKET[cevrilen.type])} ·{" "}
                {fmtPara(cevrilen.amount, cevrilen.currency)}
              </div>
              <div style={{ fontSize: 11.5, color: c.textSecondary, marginTop: 2 }}>
                {t("Bu kayıt defterde kalır; tekrarı bir sonraki vadeden başlar.")}
              </div>
            </div>
            <select
              value={cevirmeAraligi}
              onChange={(e) => setCevirmeAraligi(e.target.value as RecurrenceInterval)}
              style={{ minWidth: 120 }}
              aria-label={t("Tekrar aralığı")}
            >
              {RECURRENCE_INTERVALS.map((aralik) => (
                <option key={aralik} value={aralik}>
                  {t(RECURRENCE_INTERVAL_LABEL[aralik])}
                </option>
              ))}
            </select>
            <button
              onClick={duzenliyeCevir}
              disabled={kaydediliyor}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: "none",
                background: c.primary,
                color: c.onPrimary,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {kaydediliyor ? t("Kaydediliyor…") : t("Düzenli yap")}
            </button>
            <button
              onClick={() => setCevrilen(null)}
              style={{
                padding: "6px 12px",
                borderRadius: 7,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textSecondary,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {t("Vazgeç")}
            </button>
          </div>
        )}

        {defterHareketleri.length === 0 ? (
          <div style={bosKart}>{t("Bu kademeye henüz doğrudan bir kayıt girilmedi.")}</div>
        ) : (
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, overflow: "hidden" }}>
            {defterHareketleri.map((kayit) => (
              <div
                key={kayit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 12px",
                  borderBottom: `1px solid ${c.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      color: c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {kayit.description || kayit.category || t(TUR_ETIKET[kayit.type])}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {[
                      fmtTarih(kayit.occurredAt),
                      kayit.category,
                      // Neyle ilgili olduğu: kaydın kendi kademesinden BAŞKA
                      // bir yere aitse orası, ayrıca bağlıysa görev.
                      kayit.projectTitle || kayit.departmentName || kayit.jobTitle,
                      kayit.taskTitle ? `↳ ${kayit.taskTitle}` : undefined,
                      kayit.type === "payout" ? t(TUR_ETIKET.payout) : undefined,
                      kayit.source === "recurring" ? t("düzenli") : undefined,
                      isDesktop && kayit.createdByName ? kayit.createdByName : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: kayit.type === "income" ? c.success : c.danger,
                    flexShrink: 0,
                  }}
                >
                  {kayit.type === "income" ? "+" : "−"}
                  {fmtPara(kayit.amount, kayit.currency)}
                </span>
                {/* Tek seferlik bir gider aslında her ay tekrarlıyorsa: kayıt
                    durur, üstüne bir düzenli ödeme kurulur. Eskiden tek yol
                    kaydı silip düzenli olarak yeniden kurmaktı — defterdeki
                    geçmiş de onunla birlikte gidiyordu. */}
                {yetki.canManage && kayit.source === "manual" && kayit.type !== "payout" && !kayit.recurringPaymentId && (
                  <button
                    onClick={() => {
                      setCevrilen(kayit);
                      setCevirmeAraligi("monthly");
                      setHata("");
                    }}
                    title={t("Düzenli hâle getir")}
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
                    {t("Düzenli yap")}
                  </button>
                )}
                {yetki.canManage && (
                  <>
                    <button
                      onClick={() => duzenlemeyeBasla(kayit)}
                      aria-label={t("Kaydı düzenle")}
                      style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3, flexShrink: 0 }}
                    >
                      <IconEdit size={14} color={c.textSecondary} />
                    </button>
                    <button
                      onClick={() => sil(kayit.id)}
                      aria-label={t("Kaydı sil")}
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

      <DuzenliOdemeler
        scopeType={scopeType}
        scopeId={scopeId}
        odemeler={sayfa.duzenliOdemeler}
        canManage={yetki.canManage}
        onDegisti={yukle}
      />

      {yetki.canManageViewers && <ButceGorunurluk scopeType={scopeType} scopeId={scopeId} />}
    </div>
  );
});

export default ScopeBudgetPanel;
