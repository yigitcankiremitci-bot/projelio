import { useState, type ReactNode } from "react";
import { sekmeStili } from "../lib/listeStili";
import { BAGLANTI_MODUL_KEY, type BaglantiListeKaydi, type PartyListeModulu } from "@projelio/shared";
import { partyApi } from "../api/party";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconEdit } from "./icons";

/**
 * Bağlantı listeleri (migration 163) — oynatma listesi mantığı.
 *
 * Fuarda toplanan bağlantılar ile ekipten birinin Excel'le yüklediği liste
 * tek listede birbirine karışıyordu (kullanıcı isteği, 2026-10-12). Liste bir
 * etiket: kart birden çok listede olabilir, liste silinince kartlar kalır.
 *
 * Migration 170'ten beri Müşteriler'de de (Müşteriler, Potansiyel, Tahsilat
 * takibi sekmelerinde ortak listeler). Kart satırı bir liste sekmesinin
 * üstüne sürüklenip bırakılınca o listeye taşınır (bkz. PARTY_SURUKLE).
 */

/** Sürüklenen kartın dataTransfer türü; değer kart kimliği. */
export const PARTY_SURUKLE = "application/x-projelio-party";

/** Bağlantılar ekranının üstündeki liste sekmeleri: Tümü · listeler · + Yeni liste. */
export function BaglantiListeSekmeleri({
  listeler,
  secili,
  onSec,
  toplam,
  gorunenIdler,
  kapsamYolu,
  canWrite,
  onDegisti,
  modul = BAGLANTI_MODUL_KEY,
  sayilar,
  onBirak,
  sag,
}: {
  listeler: BaglantiListeKaydi[];
  /** "" = Tümü. */
  secili: string;
  onSec: (listeId: string) => void;
  toplam: number;
  modul?: PartyListeModulu;
  /** Açık sekmedeki (müşteriler / potansiyel) kart sayıları; yoksa sunucunun sayısı. */
  sayilar?: Record<string, number>;
  /** Sekmenin üstüne kart bırakıldı ("" = Tümü). Verilmezse sekmeler bırakma kabul etmez. */
  onBirak?: (listeId: string, partyId: string) => void;
  /** Sekmelerin sağında duran düğmeler (Haritada göster). */
  sag?: ReactNode;
  /** Şu an ekranda görünen kartlar: yeni liste açılırken "bunları ekle" seçeneği (fuarı aratıp hepsini listeye almak). */
  gorunenIdler: string[];
  kapsamYolu: string;
  canWrite: boolean;
  onDegisti: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [form, setForm] = useState<null | { tur: "yeni" } | { tur: "adlandir"; id: string }>(null);
  const [ad, setAd] = useState("");
  const [gorunenleriEkle, setGorunenleriEkle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  // Üzerine kart sürüklenen sekme ("" = Tümü); vurgulanır.
  const [hedef, setHedef] = useState<string | null>(null);
  const birakma = (listeId: string) =>
    onBirak && canWrite
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes(PARTY_SURUKLE)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (hedef !== listeId) setHedef(listeId);
          },
          onDragLeave: () => setHedef((h) => (h === listeId ? null : h)),
          onDrop: (e: React.DragEvent) => {
            const id = e.dataTransfer.getData(PARTY_SURUKLE);
            setHedef(null);
            if (!id) return;
            e.preventDefault();
            onBirak(listeId, id);
          },
        }
      : {};
  const vurgu = (listeId: string) =>
    hedef === listeId ? { outline: `2px dashed ${c.primary}`, outlineOffset: 2 } : {};
  const duzenlenen = form?.tur === "adlandir" ? listeler.find((l) => l.id === form.id) : undefined;

  const kaydet = async () => {
    if (!ad.trim() || !form) return;
    setBusy(true);
    setHata("");
    try {
      if (form.tur === "yeni") {
        const yeni = await partyApi.listeAc(kapsamYolu, ad.trim(), gorunenleriEkle ? gorunenIdler : [], modul);
        onSec(yeni.id);
      } else {
        await partyApi.listeAdlandir(form.id, ad.trim());
      }
      setForm(null);
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  /** true: silindi. Onay sorusundan vazgeçilirse düzenleme formu açık kalır. */
  const sil = async (l: BaglantiListeKaydi): Promise<boolean> => {
    const soru =
      modul === BAGLANTI_MODUL_KEY
        ? t("\"{ad}\" listesi silinsin mi? İçindeki {n} bağlantı silinmez, Tümü'nde kalır.", { ad: l.ad, n: l.sayi })
        : t("\"{ad}\" listesi silinsin mi? İçindeki kartlar silinmez, Tümü'nde kalır.", { ad: l.ad });
    if (!window.confirm(soru)) return false;
    try {
      await partyApi.listeSil(l.id);
      if (secili === l.id) onSec("");
      onDegisti();
      return true;
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
      return false;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => onSec("")} style={{ ...sekmeStili(c, secili === ""), ...vurgu("") }} {...birakma("")}>
          {t("Tümü")} ({toplam})
        </button>
        {listeler.map((l) => (
          <span key={l.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <button
              onClick={() => onSec(l.id)}
              style={{ ...sekmeStili(c, secili === l.id), ...vurgu(l.id) }}
              title={l.olusturanAd ? t("Oluşturan: {ad}", { ad: l.olusturanAd }) : undefined}
              {...birakma(l.id)}
            >
              ☰ {l.ad} ({sayilar ? sayilar[l.id] ?? 0 : l.sayi})
            </button>
            {/* Yeniden adlandırma ve silme kalemden: ayrı bir satır kaplamasın. */}
            {canWrite && (
              <button
                onClick={() => {
                  setForm({ tur: "adlandir", id: l.id });
                  setAd(l.ad);
                  setHata("");
                }}
                title={t("Listeyi düzenle")}
                aria-label={t("Listeyi düzenle")}
                style={{ border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", padding: 3, display: "inline-flex" }}
              >
                <IconEdit size={13} />
              </button>
            )}
          </span>
        ))}
        {canWrite && !form && (
          <button
            onClick={() => {
              setForm({ tur: "yeni" });
              setAd("");
              setGorunenleriEkle(false);
              setHata("");
            }}
            style={{ ...sekmeStili(c, false), borderStyle: "dashed", color: c.primary }}
          >
            {t("+ Yeni liste")}
          </button>
        )}
        {sag && <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>{sag}</span>}
      </div>
      {onBirak && canWrite && listeler.length > 0 && (
        <span style={{ fontSize: 11, color: c.textSecondary }}>
          {t("İpucu: bir kartı tutup liste sekmesinin üstüne bırakınca o listeye taşınır; listede sürükleyerek sırasını değiştirebilirsin.")}
        </span>
      )}

      {form && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.surface,
          }}
        >
          <input
            autoFocus
            value={ad}
            maxLength={80}
            onChange={(e) => setAd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            placeholder={t("Liste adı, ör. İTS 2026 Fuarı")}
            style={{ fontSize: 13, padding: "6px 8px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
          />
          {form.tur === "yeni" && gorunenIdler.length > 0 && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: c.textPrimary, cursor: "pointer" }}>
              <input type="checkbox" checked={gorunenleriEkle} onChange={(e) => setGorunenleriEkle(e.target.checked)} />
              {modul === BAGLANTI_MODUL_KEY
                ? t("Şu an listede görünen {n} bağlantıyı bu listeye ekle", { n: gorunenIdler.length })
                : t("Şu an listede görünen {n} kartı bu listeye ekle", { n: gorunenIdler.length })}
            </label>
          )}
          {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
            {form.tur === "adlandir" && duzenlenen && (
              <button
                onClick={async () => {
                  if (await sil(duzenlenen)) setForm(null);
                }}
                style={{ fontSize: 12, border: "none", background: "transparent", color: c.danger, cursor: "pointer", marginRight: "auto", padding: "4px 0" }}
              >
                {t("Listeyi sil")}
              </button>
            )}
            <button onClick={() => setForm(null)} style={{ ...sekmeStili(c, false), fontSize: 12, padding: "4px 10px" }}>
              {t("Vazgeç")}
            </button>
            <button onClick={kaydet} disabled={busy || !ad.trim()} style={{ ...sekmeStili(c, true), fontSize: 12, padding: "4px 12px", opacity: busy || !ad.trim() ? 0.6 : 1 }}>
              {form.tur === "yeni" ? t("Listeyi oluştur") : t("Kaydet")}
            </button>
          </div>
        </div>
      )}
      {!form && hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
    </div>
  );
}

/** Kartın içinde: hangi listelerde olduğu; tıklayınca ekler / çıkarır. */
export function KartListeleri({
  partyId,
  listeler,
  uyeOlduklari,
  canWrite,
  onDegisti,
}: {
  partyId: string;
  listeler: BaglantiListeKaydi[];
  uyeOlduklari: string[];
  canWrite: boolean;
  onDegisti: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [hata, setHata] = useState("");
  if (!listeler.length) return null;

  const degistir = async (l: BaglantiListeKaydi) => {
    setBusy(l.id);
    setHata("");
    try {
      if (uyeOlduklari.includes(l.id)) await partyApi.listedenCikar(l.id, [partyId]);
      else await partyApi.listeyeEkle(l.id, [partyId]);
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: c.textSecondary }}>{t("Listeler:")}</span>
      {listeler.map((l) => {
        const uye = uyeOlduklari.includes(l.id);
        return (
          <button
            key={l.id}
            disabled={!canWrite || busy === l.id}
            onClick={() => degistir(l)}
            title={canWrite ? (uye ? t("Listeden çıkar") : t("Listeye ekle")) : undefined}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px ${uye ? "solid" : "dashed"} ${uye ? c.primary : c.border}`,
              background: uye ? `${c.primary}1A` : "transparent",
              color: uye ? c.primary : c.textSecondary,
              cursor: canWrite ? "pointer" : "default",
            }}
          >
            {uye ? "✓ " : "+ "}
            {l.ad}
          </button>
        );
      })}
      {hata && <span style={{ color: c.danger }}>{hata}</span>}
    </div>
  );
}
