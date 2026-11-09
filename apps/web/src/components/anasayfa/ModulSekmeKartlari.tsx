import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MUSTERI_MODUL_KEY, acilisSekmesiCoz, kalanTutar, potansiyelMusteriMi, siparisDurumu, type BaglantiListeKaydi, type MusteriSiparisi, type Party } from "@projelio/shared";
import { partyApi, siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { useRefreshOnUndo } from "../../lib/undo";
import { IconInfo } from "../icons";
import { KartRozeti, SekmeCipleri, enYeniOnce, kisaTarih } from "./gorselOzet";

/**
 * Sekmeli modüllerin pano kartları: modülün sekmeleri kartın üstünde çip
 * olur, kart içeriği seçilen sekmeye göre değişir (kullanıcı isteği,
 * 2026-11-09). Satıra basınca modül o sekmede açılır (?sekme= / ?liste=,
 * bkz. CustomersPanel).
 *
 * - Müşteriler: Tahsilat / Müşteriler / Potansiyel (shared/modulSekmeleri.ts).
 * - Bağlantılar: sekmeleri kullanıcının listeleri (Fuar 2026, Rakipler…).
 *
 * Seçilen sekme bu cihazda kart başına hatırlanır.
 */

function hatirla<K extends string>(anahtar: string, gecerli: readonly K[], varsayilan: K): [K, (k: K) => void] {
  return [
    (() => {
      try {
        const kayit = localStorage.getItem(anahtar) as K | null;
        return kayit && gecerli.includes(kayit) ? kayit : varsayilan;
      } catch {
        return varsayilan;
      }
    })(),
    (k: K) => {
      try {
        localStorage.setItem(anahtar, k);
      } catch {
        // Hatırlanmazsa kart bir sonraki açılışta varsayılan sekmeyle başlar.
      }
    },
  ];
}

function useVeri<T>(yukle: () => Promise<T>, deps: unknown[]): { veri?: T; hata: boolean } {
  const [sonuc, setSonuc] = useState<{ veri?: T; hata: boolean }>({ hata: false });
  const [tazele, setTazele] = useState(0);
  useRefreshOnUndo(() => setTazele((n) => n + 1));
  useEffect(() => {
    let iptal = false;
    yukle()
      .then((veri) => !iptal && setSonuc({ veri, hata: false }))
      .catch(() => !iptal && setSonuc({ hata: true }));
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tazele]);
  return sonuc;
}

function adresEki(hedef: string, ek: string): string {
  return `${hedef}${hedef.includes("?") ? "&" : "?"}${ek}`;
}

function BosYazi({ children }: { children: string }) {
  const c = useThemeColors();
  return <span style={{ fontSize: 13, color: c.textSecondary, padding: "6px 2px" }}>{children}</span>;
}

/** Kaydırılır kart listesi: ad solda, il sağda. */
export function PartyListesi({ kartlar, hedef, bos }: { kartlar: Party[] | undefined; hedef: string; bos: string }) {
  const c = useThemeColors();
  if (!kartlar) return null;
  if (kartlar.length === 0) return <BosYazi>{bos}</BosYazi>;
  return (
    <div className="no-drag pano-kaydir" style={{ flex: 1, minHeight: 0, maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      {enYeniOnce(kartlar).map((p) => (
        <Link key={p.id} to={hedef} draggable={false} className="pano-satir" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "5px 4px", borderBottom: `1px solid ${c.border}`, fontSize: 13, textDecoration: "none" }}>
          <span style={{ flex: 1, minWidth: 0, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.displayName}</span>
          {p.address?.city && <span style={{ flexShrink: 0, fontSize: 12, color: c.textSecondary }}>{p.address.city}</span>}
        </Link>
      ))}
    </div>
  );
}

function para(tutar: number, birim: string): string {
  const sayi = Math.round(tutar).toLocaleString(bicimDili());
  return birim === "TRY" ? `${sayi} ₺` : `${sayi} ${birim}`;
}

function gunAnahtari(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tahsilat sekmesi: kalanı olan siparişler, vadesi en yakın önce; gecikenler kırmızı. */
function TahsilatListesi({ siparisler, hedef }: { siparisler: MusteriSiparisi[] | undefined; hedef: string }) {
  const c = useThemeColors();
  const t = useT();
  if (!siparisler) return null;
  const bugun = gunAnahtari(new Date());
  const acik = siparisler.filter((s) => kalanTutar(s) > 0).sort((a, b) => a.vadeTarihi.localeCompare(b.vadeTarihi));
  if (acik.length === 0) return <BosYazi>{t("Bekleyen tahsilat yok.")}</BosYazi>;
  return (
    <div className="no-drag pano-kaydir" style={{ flex: 1, minHeight: 0, maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
      {acik.map((s) => {
        const gecikti = siparisDurumu(s, bugun) === "gecikti";
        return (
          <Link key={s.id} to={hedef} draggable={false} className="pano-satir" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "5px 4px", borderBottom: `1px solid ${c.border}`, fontSize: 13, textDecoration: "none" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: gecikti ? c.danger : c.accent }} />
            <span style={{ flex: 1, minWidth: 0, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.partyName ?? s.alici?.ad ?? s.kanalAdi ?? s.siparisNo ?? "—"}</span>
            <span style={{ flexShrink: 0, color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{para(kalanTutar(s), s.paraBirimi)}</span>
            <span style={{ flexShrink: 0, width: 46, textAlign: "right", fontSize: 12, color: gecikti ? c.danger : c.textSecondary }}>{kisaTarih(s.vadeTarihi)}</span>
          </Link>
        );
      })}
    </div>
  );
}

type MusteriSekmesi = "tahsilat" | "musteriler" | "potansiyel";

export function MusteriModulKarti({ kok, hedef }: { kok: string; hedef: string }) {
  const c = useThemeColors();
  const t = useT();
  const anahtar = `projelio_pano_sekme_musteri_${kok}`;
  const sekmeIdleri: MusteriSekmesi[] = ["tahsilat", "musteriler", "potansiyel"];
  const [ilk, kaydet] = hatirla<MusteriSekmesi>(anahtar, sekmeIdleri, (acilisSekmesiCoz(MUSTERI_MODUL_KEY, undefined) as MusteriSekmesi) ?? "tahsilat");
  const [sekme, setSekme] = useState<MusteriSekmesi>(ilk);
  const kartlar = useVeri(() => partyApi.musterilerim(`${kok}/party`).then((r) => r.musteriler.filter((p) => !p.archivedAt)), [kok]);
  const siparisler = useVeri(() => (sekme === "tahsilat" ? siparisApi.kapsamdakiler(kok).then((r) => r.siparisler) : Promise.resolve(undefined)), [kok, sekme === "tahsilat"]);
  const musteriler = kartlar.veri?.filter((p) => !potansiyelMusteriMi(p));
  const potansiyeller = kartlar.veri?.filter(potansiyelMusteriMi);
  const gecikenler = (siparisler.veri ?? []).filter((s) => siparisDurumu(s, gunAnahtari(new Date())) === "gecikti").length;
  const sekmeHedefi = adresEki(hedef, `sekme=${sekme}`);
  const hata = kartlar.hata || (sekme === "tahsilat" && siparisler.hata);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {gecikenler > 0 && (
        <KartRozeti renk={c.danger} baslik={t("{adet} tahsilat gecikti", { adet: gecikenler })}>
          <IconInfo size={14} color={c.danger} /> {gecikenler}
        </KartRozeti>
      )}
      <SekmeCipleri
        etiket={t("Modül sekmeleri")}
        secili={sekme}
        onSec={(k) => {
          setSekme(k);
          kaydet(k);
        }}
        sekmeler={[
          { id: "tahsilat", ad: t("Tahsilat") },
          { id: "musteriler", ad: t("Müşteriler"), sayi: musteriler?.length },
          { id: "potansiyel", ad: t("Potansiyel"), sayi: potansiyeller?.length },
        ]}
      />
      {hata ? (
        <BosYazi>{t("Özet yüklenemedi")}</BosYazi>
      ) : sekme === "tahsilat" ? (
        <TahsilatListesi siparisler={siparisler.veri} hedef={sekmeHedefi} />
      ) : (
        <PartyListesi kartlar={sekme === "musteriler" ? musteriler : potansiyeller} hedef={sekmeHedefi} bos={sekme === "musteriler" ? t("Henüz müşteri yok.") : t("Potansiyel müşteri yok.")} />
      )}
    </div>
  );
}

export function BaglantiModulKarti({ kok, hedef }: { kok: string; hedef: string }) {
  const t = useT();
  const { veri, hata } = useVeri(() => partyApi.baglantilarim(kok), [kok]);
  const listeler: BaglantiListeKaydi[] = veri?.listeler ?? [];
  const anahtar = `projelio_pano_sekme_baglanti_${kok}`;
  const [ilk, kaydet] = hatirla<string>(anahtar, ["", ...listeler.map((l) => l.id)], "");
  const [sekme, setSekme] = useState<string | null>(null);
  // Listeler yanıtla geliyor; hatırlanan liste o zamana kadar doğrulanamıyor.
  const secili = sekme ?? ilk;
  const kartlar = veri?.baglantilar.filter((p) => !p.archivedAt);
  const gorunen = secili ? kartlar?.filter((p) => p.listeIdleri?.includes(secili)) : kartlar;
  if (hata) return <BosYazi>{t("Özet yüklenemedi")}</BosYazi>;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {listeler.length > 0 && (
        <SekmeCipleri
          etiket={t("Modül sekmeleri")}
          secili={secili}
          onSec={(k) => {
            setSekme(k);
            kaydet(k);
          }}
          sekmeler={[{ id: "", ad: t("Tümü"), sayi: kartlar?.length }, ...listeler.map((l) => ({ id: l.id, ad: l.ad, sayi: l.sayi }))]}
        />
      )}
      <PartyListesi kartlar={gorunen} hedef={secili ? adresEki(hedef, `liste=${secili}`) : hedef} bos={t("Bu listede bağlantı yok.")} />
    </div>
  );
}
