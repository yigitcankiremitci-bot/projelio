import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { DepartmentMemberRole, EkipHesabi, EkipHesabiSecenekleri, SirketEkibi } from "@projelio/shared";
import { ApiError } from "../../api/client";
import { iseAlimApi } from "../../api/iseAlim";
import { ekipHesaplariApi } from "../../api/ekipHesaplari";
import { useT } from "../../lib/i18n";
import { departmanAdi } from "../../lib/departmanAdi";
import { useKatlanirBolum } from "../../lib/useKatlanirBolum";
import { useThemeColors } from "../../theme/useThemeColors";
import SectionToggle from "../SectionToggle";
import Modal from "../Modal";
import EkipHesabiModal from "../ekipHesaplari/EkipHesabiModal";
import IseAlModal from "./IseAlModal";

export interface SirketEkibiPanelHandle {
  openHire: () => void;
}

const ROL_KISA: Record<DepartmentMemberRole, string> = {
  manager: "Yönetici", // dil:anahtar
  employee: "Çalışan", // dil:anahtar
  subcontractor: "Taşeron", // dil:anahtar
};

/**
 * Şirket anasayfasındaki "Ekip": onaylı kadro (kişi başına tek satır) +
 * bekleyen işe alım davetleri + "İşe al".
 *
 * Önceden şirket sayfasında çalışanları görmenin bir yolu yoktu; kadro yalnızca
 * tek tek departman sayfalarında duruyordu. Taşeron bu bölümü hiç görmez
 * (sunucu 403 döner, bölüm çizilmez) — departman Ekip sekmesindeki kuralla aynı.
 *
 * Hesabı olmayan biri için İşe al formundan Ekip Hesabı formuna geçilir; ikisi
 * aynı yetki kapısından (ekip-hesaplari/secenekler) besleniyor.
 */
const SirketEkibiPanel = forwardRef<SirketEkibiPanelHandle, { organizationId: string }>(function SirketEkibiPanel(
  { organizationId },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const [ekip, setEkip] = useState<SirketEkibi | null>(null);
  const [gizli, setGizli] = useState(false);
  const [secenekler, setSecenekler] = useState<EkipHesabiSecenekleri | null>(null);
  const [form, setForm] = useState<"ise-al" | "hesap" | null>(null);
  const [bilgi, setBilgi] = useState("");
  const [hata, setHata] = useState("");
  const [sonAcilan, setSonAcilan] = useState<{ hesap: EkipHesabi; sifre: string; epostaGonderildi: boolean } | null>(null);
  const [geriCekiliyor, setGeriCekiliyor] = useState<string | null>(null);
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.anasayfa-ekip-kapali", true);

  const yukle = () => {
    iseAlimApi
      .ekip(organizationId)
      .then((e) => {
        setEkip(e);
        setGizli(false);
      })
      .catch((err) => {
        // Taşeron ya da yetkisiz: bölüm hiç görünmez.
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) setGizli(true);
        else setHata(err instanceof Error ? err.message : t("Ekip yüklenemedi"));
      });
  };
  useEffect(yukle, [organizationId]);

  const formuAc = async () => {
    setBilgi("");
    setHata("");
    try {
      setSecenekler(await ekipHesaplariApi.secenekler(organizationId));
      setForm("ise-al");
    } catch (err) {
      setHata(
        err instanceof ApiError && err.status === 403
          ? t("İşe almak için şirket sahibi ya da bir departmanın yöneticisi olmalısın.")
          : err instanceof Error
            ? err.message
            : t("Form açılamadı")
      );
    }
  };

  useImperativeHandle(ref, () => ({ openHire: () => void formuAc() }));

  const geriCek = async (id: string) => {
    setGeriCekiliyor(id);
    setHata("");
    try {
      await iseAlimApi.iptal(id);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Davet geri çekilemedi"));
    } finally {
      setGeriCekiliyor(null);
    }
  };

  const hayalet = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
    whiteSpace: "nowrap" as const,
  };
  const satirKutusu = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap" as const,
    padding: "8px 12px",
    border: `1px solid ${c.border}`,
    borderRadius: 10,
  };
  const departmanEtiketleri = (liste: { id: string; name: string; role: DepartmentMemberRole }[]) =>
    liste.map((d) => `${departmanAdi(d.name, t)} · ${t(ROL_KISA[d.role])}`).join(", ");

  if (gizli) return null;

  const modallar = (
    <>
      {form === "ise-al" && secenekler && (
        <IseAlModal
          organizationId={organizationId}
          secenekler={secenekler}
          ekiptekiler={ekip?.uyeler.map((u) => u.userId) ?? []}
          onClose={() => setForm(null)}
          onHesapAc={() => setForm("hesap")}
          onGonderildi={(davet) => {
            setForm(null);
            setBilgi(t("{ad} kişisine işe alım daveti gönderildi. Kabul edince ekipte görünecek.", { ad: davet.fullName }));
            yukle();
          }}
        />
      )}
      {form === "hesap" && secenekler && (
        <EkipHesabiModal
          organizationId={organizationId}
          secenekler={secenekler}
          onClose={() => setForm(null)}
          onAcildi={(sonuc) => {
            setForm(null);
            setSonAcilan(sonuc);
            yukle();
          }}
        />
      )}
      {sonAcilan && (
        <Modal title={t("{ad} için hesap açıldı", { ad: sonAcilan.hesap.fullName })} onClose={() => setSonAcilan(null)} maxWidth={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: c.textPrimary }}>
            <span style={{ color: c.textSecondary }}>
              {sonAcilan.epostaGonderildi
                ? t("{eposta} adresine giriş bağlantısı gönderildi. Kişi bağlantıya tıklayınca doğrudan hesabına girer.", {
                    eposta: sonAcilan.hesap.email,
                  })
                : t("Hesap açıldı ama e-posta gönderilemedi. Ekip Hesapları modülünden bağlantıyı yeniden gönderebilirsin.")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: c.textSecondary }}>{t("Şifre")}:</span>
              <code style={{ fontSize: 13, padding: "2px 6px", border: `1px solid ${c.border}`, borderRadius: 6 }}>{sonAcilan.sifre}</code>
            </div>
            <span style={{ fontSize: 11, color: c.textSecondary }}>
              {t("Şifre bu ekrandan çıkınca bir daha gösterilmez. Kişiye e-posta dışında bir yoldan ilet.")}
            </span>
          </div>
        </Modal>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Ekip")}</h2>
        <SectionToggle
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          count={ekip ? ekip.uyeler.length : undefined}
          showLabel={t("Ekibi göster")}
          hideLabel={t("Ekibi gizle")}
        />
        <div style={{ flex: 1 }} />
        {ekip?.iseAlabilir && (
          <button onClick={() => void formuAc()} style={hayalet}>
            {t("+ İşe al")}
          </button>
        )}
      </div>

      {bilgi && <span style={{ fontSize: 12, color: c.success }}>{bilgi}</span>}
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}

      {!collapsed && ekip && (
        <>
          {ekip.bekleyenDavetler.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kabul bekleyen davetler")}</span>
              {ekip.bekleyenDavetler.map((d) => (
                <div key={d.id} style={{ ...satirKutusu, borderStyle: "dashed" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: c.textPrimary }}>
                      {d.fullName}
                      {d.pozisyon && <span style={{ color: c.textSecondary }}> · {d.pozisyon}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSecondary }}>{departmanEtiketleri(d.departmanlar)}</div>
                  </div>
                  <button onClick={() => void geriCek(d.id)} disabled={geriCekiliyor === d.id} style={hayalet}>
                    {geriCekiliyor === d.id ? t("Geri çekiliyor…") : t("Daveti geri çek")}
                  </button>
                </div>
              ))}
            </div>
          )}

          {ekip.uyeler.length === 0 ? (
            <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 14 }}>
              {ekip.iseAlabilir
                ? t("Henüz ekipte kimse yok. “İşe al” ile Projelio'daki birini davet et ya da hesabı yoksa onun için hesap aç.")
                : t("Henüz ekipte kimse yok.")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ekip.uyeler.map((u) => (
                <div key={u.userId} style={satirKutusu}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: c.textPrimary }}>
                      {u.fullName}
                      {u.title && <span style={{ color: c.textSecondary }}> · {u.title}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSecondary }}>{departmanEtiketleri(u.departmanlar)}</div>
                  </div>
                  {u.username && <span style={{ fontSize: 12, color: c.textSecondary }}>@{u.username}</span>}
                </div>
              ))}
              {ekip.iseAlabilir && (
                <span style={{ fontSize: 11, color: c.textSecondary }}>
                  {t("Rolü değiştirmek ya da kişiyi kadrodan çıkarmak için departmanın Ekip sekmesini kullan.")}
                </span>
              )}
            </div>
          )}
        </>
      )}

      {modallar}
    </div>
  );
});

export default SirketEkibiPanel;
