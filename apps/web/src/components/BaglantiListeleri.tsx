import { useState } from "react";
import type { BaglantiListeKaydi } from "@projelio/shared";
import { partyApi } from "../api/party";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

/**
 * Bağlantı listeleri (migration 163) — oynatma listesi mantığı.
 *
 * Fuarda toplanan bağlantılar ile ekipten birinin Excel'le yüklediği liste
 * tek listede birbirine karışıyordu (kullanıcı isteği, 2026-10-12). Liste bir
 * etiket: kart birden çok listede olabilir, liste silinince kartlar kalır.
 */

const sekmeStili = (c: ReturnType<typeof useThemeColors>, aktif: boolean) =>
  ({
    fontSize: 13,
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${aktif ? c.primary : c.border}`,
    background: aktif ? c.primary : c.surface,
    color: aktif ? c.onPrimary : c.textPrimary,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }) as const;

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
}: {
  listeler: BaglantiListeKaydi[];
  /** "" = Tümü. */
  secili: string;
  onSec: (listeId: string) => void;
  toplam: number;
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
  const seciliListe = listeler.find((l) => l.id === secili);

  const kaydet = async () => {
    if (!ad.trim() || !form) return;
    setBusy(true);
    setHata("");
    try {
      if (form.tur === "yeni") {
        const yeni = await partyApi.listeAc(kapsamYolu, ad.trim(), gorunenleriEkle ? gorunenIdler : []);
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

  const sil = async (l: BaglantiListeKaydi) => {
    if (!window.confirm(t("\"{ad}\" listesi silinsin mi? İçindeki {n} bağlantı silinmez, Tümü'nde kalır.", { ad: l.ad, n: l.sayi }))) return;
    try {
      await partyApi.listeSil(l.id);
      onSec("");
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
    }
  };

  const yaziDugmesi = { fontSize: 12, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", padding: "2px 4px", textDecoration: "underline" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => onSec("")} style={sekmeStili(c, secili === "")}>
          {t("Tümü")} ({toplam})
        </button>
        {listeler.map((l) => (
          <button key={l.id} onClick={() => onSec(l.id)} style={sekmeStili(c, secili === l.id)} title={l.olusturanAd ? t("Oluşturan: {ad}", { ad: l.olusturanAd }) : undefined}>
            ☰ {l.ad} ({l.sayi})
          </button>
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
      </div>

      {canWrite && seciliListe && !form && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: c.textSecondary }}>
          <span>{t("\"{ad}\" listesi:", { ad: seciliListe.ad })}</span>
          <button
            onClick={() => {
              setForm({ tur: "adlandir", id: seciliListe.id });
              setAd(seciliListe.ad);
              setHata("");
            }}
            style={yaziDugmesi}
          >
            {t("Yeniden adlandır")}
          </button>
          <button onClick={() => sil(seciliListe)} style={yaziDugmesi}>
            {t("Listeyi sil")}
          </button>
        </div>
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
              {t("Şu an listede görünen {n} bağlantıyı bu listeye ekle", { n: gorunenIdler.length })}
            </label>
          )}
          {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
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
