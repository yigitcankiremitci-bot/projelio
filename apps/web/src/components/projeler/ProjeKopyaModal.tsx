import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Project, ProjeParcasi } from "@projelio/shared";
import { PROJE_PARCALARI, VARSAYILAN_KLON_PARCALARI, SABLON_TAVANLARI, parcalariTemizle } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { notifySidebarChanged } from "../../lib/sidebarEvents";
import { useT } from "../../lib/i18n";
import Modal from "../Modal";

/**
 * Projenin sağ tık menüsünden açılan iki pencere (bkz. ProjectCard):
 * - "klon": seçilen parçalarla yeni bir proje (aynı işte), yeni başlangıç tarihi.
 * - "sablon": projeyi şablon olarak kaydet — yalnızca kendim ya da şirketin
 *   bütün çalışanları için.
 *
 * Parça listesi ve kuralları shared projeSablonu.ts'ten: sunucu aynı süzgeçten
 * geçiriyor (gereği seçilmeyen parça düşer, şablonda kişiler yok).
 */
export default function ProjeKopyaModal({
  project,
  kip,
  onClose,
}: {
  project: Project;
  kip: "klon" | "sablon";
  onClose: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const sablon = kip === "sablon";
  const parcalarListesi = PROJE_PARCALARI.filter((p) => !sablon || p.sablondaVar);

  const [ad, setAd] = useState(() =>
    sablon ? project.title : `${project.title} ${t("(kopya)")}`.slice(0, SABLON_TAVANLARI.baslik)
  );
  const [aciklama, setAciklama] = useState("");
  const [baslangic, setBaslangic] = useState(() => new Date().toISOString().slice(0, 10));
  const [secili, setSecili] = useState<Set<ProjeParcasi>>(
    () => new Set(sablon ? parcalarListesi.map((p) => p.anahtar) : VARSAYILAN_KLON_PARCALARI)
  );
  const [kapsam, setKapsam] = useState<"kisisel" | "sirket">("kisisel");
  const [sirketler, setSirketler] = useState<{ id: string; name: string }[]>([]);
  const [sirketId, setSirketId] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    if (!sablon) return;
    api
      .get<{ id: string; name: string }[]>("/proje-sablonlari/sirketler")
      .then((liste) => {
        setSirketler(liste);
        if (liste[0]) setSirketId(liste[0].id);
      })
      .catch(() => setSirketler([]));
  }, [sablon]);

  // Gereği kalkınca bağlı parça da kalkar (görevsiz alt görev olmaz) — sunucuyla aynı kural.
  const degistir = (anahtar: ProjeParcasi) =>
    setSecili((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(anahtar)) yeni.delete(anahtar);
      else yeni.add(anahtar);
      return parcalariTemizle([...yeni], sablon);
    });

  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    setHata("");
    setYukleniyor(true);
    try {
      if (sablon) {
        await api.post("/proje-sablonlari", {
          projectId: project.id,
          ad,
          aciklama: aciklama || undefined,
          kapsam,
          organizationId: kapsam === "sirket" ? sirketId : undefined,
          parcalar: [...secili],
        });
        setKaydedildi(true);
      } else {
        const yeni = await api.post<Project>("/proje-sablonlari/klonla", {
          projectId: project.id,
          jobId: project.jobId,
          title: ad,
          startDate: baslangic,
          parcalar: [...secili],
        });
        notifySidebarChanged();
        onClose();
        navigate(`/projects/${yeni.id}`);
      }
    } catch (err: any) {
      setHata(err?.message || (sablon ? t("Şablon kaydedilemedi. Tekrar dene.") : t("Proje klonlanamadı. Tekrar dene.")));
    } finally {
      setYukleniyor(false);
    }
  };

  const etiket = { fontSize: 15, color: c.textSecondary } as const;
  const birincil = {
    marginTop: 4,
    background: c.primary,
    color: c.onPrimary,
    padding: "11px 0",
    borderRadius: 8,
    border: "none",
    fontSize: 17,
    fontWeight: 500,
  } as const;

  if (kaydedildi) {
    return (
      <Modal title={t("Şablon kaydedildi")} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>
            <strong>{ad}</strong>{" "}
            {kapsam === "sirket"
              ? t("şirketin bütün çalışanlarının şablonlarında. Yeni proje açarken \"Şablondan başla\"dan seçilebilir.")
              : t("şablonlarında. Yeni proje açarken \"Şablondan başla\"dan seçebilirsin.")}
          </p>
          <button type="button" onClick={onClose} style={birincil}>
            {t("Tamam")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={sablon ? t("Şablon olarak kaydet") : t("Projeyi klonla")} onClose={onClose}>
      <form onSubmit={gonder} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={etiket}>{sablon ? t("Şablonun adı") : t("Yeni projenin adı")}</label>
          <input value={ad} onChange={(e) => setAd(e.target.value)} required maxLength={SABLON_TAVANLARI.baslik} style={{ width: "100%" }} />
        </div>

        {sablon ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={etiket}>{t("Açıklama")}</label>
              <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder={t("Bu şablon ne zaman kullanılır? (opsiyonel)")} style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={etiket}>{t("Kimler kullanabilsin?")}</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, color: c.textPrimary }}>
                <input type="radio" checked={kapsam === "kisisel"} onChange={() => setKapsam("kisisel")} />
                {t("Yalnızca ben")}
              </label>
              {sirketler.length > 0 && (
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, color: c.textPrimary }}>
                  <input type="radio" checked={kapsam === "sirket"} onChange={() => setKapsam("sirket")} />
                  {t("Şirketin bütün çalışanları")}
                  {kapsam === "sirket" && sirketler.length > 1 && (
                    <select value={sirketId} onChange={(e) => setSirketId(e.target.value)} style={{ marginLeft: 6 }}>
                      {sirketler.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {kapsam === "sirket" && sirketler.length === 1 && <span style={{ color: c.textSecondary }}>({sirketler[0].name})</span>}
                </label>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={etiket}>{t("Başlangıç tarihi")}</label>
            <input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} required style={{ width: "100%" }} />
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t("Görevlerin ve etkinliklerin tarihleri bu güne aynı aralıklarla kaydırılır. Bütün görevler \"Yapılacak\" olarak başlar.")}
            </span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={etiket}>{sablon ? t("Şablona girecekler") : t("Projeden alınacaklar")}</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, border: `1px solid ${c.border}`, borderRadius: 10, padding: "6px 10px" }}>
            {parcalarListesi.map((p) => {
              const kapali = Boolean(p.gerektirir && !secili.has(p.gerektirir));
              return (
                <label
                  key={p.anahtar}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "6px 0",
                    paddingLeft: p.gerektirir ? 22 : 0,
                    opacity: kapali ? 0.45 : 1,
                    cursor: kapali ? "default" : "pointer",
                  }}
                >
                  <input type="checkbox" checked={secili.has(p.anahtar)} disabled={kapali} onChange={() => degistir(p.anahtar)} style={{ marginTop: 3 }} />
                  <span style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 15, color: c.textPrimary }}>{t(p.ad)}</span>
                    <span style={{ fontSize: 13, color: c.textSecondary }}>{t(p.aciklama)}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {!sablon && !secili.has("atamalar") && secili.has("gorevler") && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Görevler sana atanır ve Yapılacaklar listene düşer.")}</span>
          )}
        </div>

        {hata && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{hata}</p>}

        <button type="submit" disabled={yukleniyor || (sablon && kapsam === "sirket" && !sirketId)} style={birincil}>
          {yukleniyor ? t("Hazırlanıyor…") : sablon ? t("Şablonu kaydet") : t("Klonla")}
        </button>
      </form>
    </Modal>
  );
}
