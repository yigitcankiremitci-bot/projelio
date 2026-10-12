import { useEffect, useState } from "react";
import {
  GORUSME_TURLERI,
  GORUSME_TURU_ETIKETI,
  GORUSME_TURU_SIMGESI,
  aramaDurumu,
  temasOzeti,
  tekrarAramaOnerileri,
  type Party,
  type PartyActivity,
  type PartyActivityType,
} from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { formatDateTime, timeAgo } from "../../lib/dates";
import { IconEdit, IconTrash } from "../icons";

/**
 * Müşteri / potansiyel müşteri kartının görüşme notları.
 *
 * Potansiyeller tek tek aranıp bilgi alınıyor (kullanıcı isteği, 2026-10-12):
 * her arama kartın notunun altına bir satır olarak düşer — yazan ve tarih
 * sunucuda damgalanır, elle yazılmaz. Notlar party_activity'de durur; "Geçmiş"
 * sekmesindeki otomatik kayıtlar (rol eklendi, kayıt oluşturuldu) burada
 * gösterilmez, yalnızca insanların yazdıkları.
 *
 * "Tekrar ara" günü kartın kendisinde (party.sonraki_arama, migration 160):
 * listede "Bugün aranacak" rozeti ve "Aranacaklar önce" sıralaması ondan.
 */

const ILK_GOSTERIM = 5;

/** Yerel takvimde bugün (toISOString UTC'ye kayar, gece yarısı yanlış gün verir). */
function bugunYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function gunGoster(gun: string): string {
  const [y, a, g] = gun.split("-");
  return `${g}.${a}.${y}`;
}

export default function GorusmeNotlari({
  party,
  canWrite,
  onDegisti,
}: {
  party: Party;
  canWrite: boolean;
  /** Not ya da tekrar arama günü değişti: liste satırındaki özet tazelensin. */
  onDegisti: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const { user } = useCurrentUser();
  const bugun = bugunYmd();

  const [notlar, setNotlar] = useState<PartyActivity[]>([]);
  const [hepsi, setHepsi] = useState(false);
  const [formAcik, setFormAcik] = useState(false);
  const [tur, setTur] = useState<PartyActivityType>("arama");
  const [metin, setMetin] = useState("");
  const [tekrar, setTekrar] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const [duzenlenen, setDuzenlenen] = useState<{ id: string; metin: string } | null>(null);

  const yukle = () => {
    api
      .get<PartyActivity[]>(`/party/${party.id}/activities`)
      .then((r) => setNotlar(r.filter((a) => a.type !== "sistem" && !a.relatedType)))
      .catch(() => setNotlar([]));
  };
  useEffect(yukle, [party.id]);

  const ozet = temasOzeti(notlar);
  const durum = aramaDurumu(party.sonrakiArama, bugun);
  const oneriler = tekrarAramaOnerileri(bugun);

  const formuAc = (ilkTur: PartyActivityType) => {
    setTur(ilkTur);
    setMetin("");
    // Ulaşılamadıysa en olası sonraki adım ertesi gün yeniden denemek.
    setTekrar(ilkTur === "ulasilamadi" ? oneriler[0].gun : "");
    setHata("");
    setFormAcik(true);
  };

  const kaydet = async () => {
    if (!metin.trim() && tur !== "ulasilamadi") {
      setHata(t("Ne konuşulduğunu kısaca yaz."));
      return;
    }
    setBusy(true);
    setHata("");
    try {
      await api.post(`/party/${party.id}/activities`, {
        type: tur,
        summary: metin.trim(),
        // Boş seçim mevcut planı değiştirmez; "Planı kaldır" ayrı düğme.
        ...(tekrar ? { sonrakiArama: tekrar } : {}),
      });
      setFormAcik(false);
      setMetin("");
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const aramaGunuYaz = async (gun: string | null) => {
    setBusy(true);
    try {
      await api.patch(`/party/${party.id}`, { sonrakiArama: gun });
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const duzeltmeyiKaydet = async () => {
    if (!duzenlenen) return;
    setBusy(true);
    try {
      await api.patch(`/party-activities/${duzenlenen.id}`, { summary: duzenlenen.metin });
      setDuzenlenen(null);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const sil = async (a: PartyActivity) => {
    if (!window.confirm(t("Bu not silinsin mi?"))) return;
    try {
      await api.delete(`/party-activities/${a.id}`);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
    }
  };

  const durumRengi = durum === "gecikti" ? c.danger : durum === "bugun" ? c.accent : c.textSecondary;
  const gorunen = hepsi ? notlar : notlar.slice(0, ILK_GOSTERIM);

  const kucukDugme = (aktif: boolean) =>
    ({
      fontSize: 12,
      padding: "3px 8px",
      borderRadius: 6,
      border: `1px solid ${aktif ? c.primary : c.border}`,
      background: aktif ? c.primary : "transparent",
      color: aktif ? c.onPrimary : c.textSecondary,
      cursor: "pointer",
    }) as const;

  // Türe göre not kartının sol şeridi ve rozet rengi: göz önce ne olduğunu,
  // sonra kimin yazdığını yakalasın.
  const turRengi = (k: PartyActivityType): string =>
    k === "ulasilamadi"
      ? c.danger
      : k === "arama"
        ? c.success
        : k === "teklif"
          ? c.accent
          : k === "not"
            ? c.textSecondary
            : c.primary;

  const form = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {GORUSME_TURLERI.map((k) => (
          <button
            key={k}
            onClick={() => {
              setTur(k);
              if (k === "ulasilamadi" && !tekrar) setTekrar(oneriler[0].gun);
            }}
            style={kucukDugme(tur === k)}
          >
            {GORUSME_TURU_SIMGESI[k]} {t(GORUSME_TURU_ETIKETI[k])}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={metin}
        onChange={(e) => setMetin(e.target.value)}
        rows={3}
        placeholder={
          tur === "ulasilamadi"
            ? t("İsteğe bağlı: meşguldü, sesli mesaj bırakıldı…")
            : t("Ne konuşuldu? Örn. Katalog istedi, fiyat teklifi bekliyor, karar verici Ahmet Bey.")
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) kaydet();
        }}
        style={{ fontSize: 13, padding: "6px 8px", resize: "vertical", fontFamily: "inherit", borderRadius: 6, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 12, color: c.textSecondary }}>
        <span>{t("Tekrar ara:")}</span>
        <button onClick={() => setTekrar("")} style={kucukDugme(tekrar === "")}>
          {t("Yok")}
        </button>
        {oneriler.map((o) => (
          <button key={o.gun} onClick={() => setTekrar(o.gun)} style={kucukDugme(tekrar === o.gun)}>
            {t(o.etiket)}
          </button>
        ))}
        <input
          type="date"
          value={tekrar}
          min={bugun}
          onChange={(e) => setTekrar(e.target.value)}
          style={{ fontSize: 12, padding: "2px 6px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
        />
      </div>
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={() => setFormAcik(false)} style={kucukDugme(false)}>
          {t("Vazgeç")}
        </button>
        <button
          onClick={kaydet}
          disabled={busy}
          style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
        >
          {t("Kaydet")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Başlık: sayı + seri uyarısı */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>
          {t("Görüşme notları")} {notlar.length > 0 && `(${notlar.length})`}
        </span>
        {ozet.ulasilamadiSerisi >= 2 && (
          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 6, color: c.danger, border: `1px solid ${c.danger}60` }}>
            {t("Üst üste {n} kez ulaşılamadı", { n: ozet.ulasilamadiSerisi })}
          </span>
        )}
      </div>

      {/* Tekrar arama günü */}
      {party.sonrakiArama && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: durumRengi }}>
          <span>
            📅{" "}
            {durum === "gecikti"
              ? t("Arama gecikti · {tarih}", { tarih: gunGoster(party.sonrakiArama) })
              : durum === "bugun"
                ? t("Bugün aranacak")
                : t("Tekrar ara · {tarih}", { tarih: gunGoster(party.sonrakiArama) })}
          </span>
          {canWrite && (
            <button
              onClick={() => aramaGunuYaz(null)}
              disabled={busy}
              style={{ fontSize: 11, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", textDecoration: "underline" }}
            >
              {t("Planı kaldır")}
            </button>
          )}
        </div>
      )}

      {/* Notlar, en yeni üstte; her biri ayrı kart */}
      {notlar.length === 0
        ? !formAcik && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("Henüz görüşme notu yok. Aradığında \"+ Not ekle\" ile ne konuşulduğunu yaz.")}
            </span>
          )
        : gorunen.map((a) => {
            const benim = !!user && a.userId === user.id;
            const duzenleniyor = duzenlenen?.id === a.id;
            const renk = turRengi(a.type);
            return (
              <div
                key={a.id}
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderLeft: `3px solid ${renk}`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "1px 8px",
                      borderRadius: 10,
                      color: renk,
                      background: `${renk}1A`,
                    }}
                  >
                    {GORUSME_TURU_SIMGESI[a.type]} {t(GORUSME_TURU_ETIKETI[a.type])}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: c.textPrimary }}>
                    {a.userName ?? t("Bilinmeyen kullanıcı")}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: c.textSecondary }} title={timeAgo(a.occurredAt)}>
                    {formatDateTime(a.occurredAt)}
                  </span>
                  {benim && canWrite && !duzenleniyor && (
                    <span style={{ display: "inline-flex", gap: 2 }}>
                      <button
                        onClick={() => setDuzenlenen({ id: a.id, metin: a.summary })}
                        title={t("Düzenle")}
                        style={{ border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", padding: 2 }}
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        onClick={() => sil(a)}
                        title={t("Sil")}
                        style={{ border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", padding: 2 }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </span>
                  )}
                </div>
                {duzenleniyor ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <textarea
                      autoFocus
                      value={duzenlenen.metin}
                      onChange={(e) => setDuzenlenen({ id: a.id, metin: e.target.value })}
                      rows={2}
                      style={{ fontSize: 13, padding: "5px 8px", resize: "vertical", fontFamily: "inherit", borderRadius: 6, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
                    />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => setDuzenlenen(null)} style={kucukDugme(false)}>
                        {t("Vazgeç")}
                      </button>
                      <button onClick={duzeltmeyiKaydet} disabled={busy} style={kucukDugme(true)}>
                        {t("Kaydet")}
                      </button>
                    </div>
                  </div>
                ) : (
                  a.summary && (
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: c.textPrimary, whiteSpace: "pre-wrap" }}>{a.summary}</p>
                  )
                )}
              </div>
            );
          })}
      {notlar.length > ILK_GOSTERIM && (
        <button
          onClick={() => setHepsi((h) => !h)}
          style={{ alignSelf: "flex-start", fontSize: 12, border: "none", background: "transparent", color: c.primary, cursor: "pointer", padding: 0 }}
        >
          {hepsi ? t("Daha az göster") : t("Tüm notlar ({n})", { n: notlar.length })}
        </button>
      )}

      {/* Ekleme listenin altında: önce okunur, sonra yazılır. */}
      {canWrite &&
        (formAcik ? (
          form
        ) : (
          <button
            onClick={() => formuAc("arama")}
            style={{ alignSelf: "flex-start", fontSize: 12, padding: "5px 12px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
          >
            {t("+ Not ekle")}
          </button>
        ))}
      {!formAcik && hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
    </div>
  );
}
