import { useEffect, useState } from "react";
import type { DepartmentMemberRole, EkipHesabi, EkipHesabiSecenekleri } from "@projelio/shared";
import { ApiError } from "../../api/client";
import { ekipHesaplariApi } from "../../api/ekipHesaplari";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import EkipHesabiModal from "./EkipHesabiModal";

interface Props {
  organizationId?: string;
  jobId?: string;
}

const ROL_KISA: Record<DepartmentMemberRole, string> = {
  manager: "Yönetici", // dil:anahtar
  employee: "Çalışan", // dil:anahtar
  subcontractor: "Taşeron", // dil:anahtar
};

/**
 * Ekip Hesapları modülü: açılan hesapların listesi + "Hesap aç".
 *
 * Yetki sunucuda (şirket sahibi ya da departman yöneticisi); burada 403
 * gelirse boş bir liste değil NEDEN açıklanıyor — modülü gören ama hesap
 * açamayan çalışan "bozuk" sanmasın.
 *
 * Açılan hesabın şifresi YALNIZCA oluşturma anında, bir kez gösterilir:
 * sunucu şifreyi hash'leyip saklıyor, geri okunamaz.
 */
export default function EkipHesaplariPanel({ organizationId, jobId }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [secenekler, setSecenekler] = useState<EkipHesabiSecenekleri | null>(null);
  const [hesaplar, setHesaplar] = useState<EkipHesabi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yetkiYok, setYetkiYok] = useState("");
  const [hata, setHata] = useState("");
  const [formAcik, setFormAcik] = useState(false);
  const [sonAcilan, setSonAcilan] = useState<{ hesap: EkipHesabi; sifre: string; epostaGonderildi: boolean } | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState("");

  const yukle = () => {
    if (!organizationId) return;
    setYukleniyor(true);
    Promise.all([ekipHesaplariApi.secenekler(organizationId), ekipHesaplariApi.liste(organizationId)])
      .then(([s, l]) => {
        setSecenekler(s);
        setHesaplar(l);
        setYetkiYok("");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setYetkiYok(err.message);
        else setHata(err instanceof Error ? err.message : t("Liste yüklenemedi"));
      })
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [organizationId]);

  if (jobId || !organizationId) {
    return (
      <p style={{ fontSize: 13, color: c.textSecondary }}>
        {t("Ekip hesapları şirketler için: hesap, şirketin bir departmanının kadrosuna açılır.")}
      </p>
    );
  }

  const yenidenGonder = async (h: EkipHesabi) => {
    setGonderiliyor(h.id);
    setHata("");
    setBilgi("");
    try {
      const { epostaGonderildi } = await ekipHesaplariApi.baglantiGonder(h.id);
      setBilgi(
        epostaGonderildi
          ? t("Yeni giriş bağlantısı {eposta} adresine gönderildi. Eski bağlantı artık çalışmaz.", { eposta: h.email })
          : t("E-posta gönderilemedi. Birazdan tekrar dene.")
      );
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Bağlantı gönderilemedi"));
    } finally {
      setGonderiliyor(null);
    }
  };

  const kopyala = async (metin: string) => {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    } catch {
      // Pano izni yoksa kullanıcı metni elle seçebilir; şifre ekranda yazılı.
    }
  };

  const tarih = (iso?: string) =>
    iso ? new Date(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).toLocaleDateString() : "";

  const hayalet = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
  } as const;

  if (yetkiYok) {
    return (
      <div style={{ padding: "16px 14px", border: `1px dashed ${c.border}`, borderRadius: 10, fontSize: 13, color: c.textSecondary }}>
        {yetkiYok}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("{n} hesap", { n: hesaplar.length })}
          {secenekler && !secenekler.sahipMi && ` · ${t("yalnızca senin açtıkların")}`}
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setFormAcik(true)}
          disabled={!secenekler}
          style={{
            fontSize: 13,
            padding: "6px 14px",
            background: c.primary,
            color: c.onPrimary,
            border: "none",
            borderRadius: 8,
            cursor: secenekler ? "pointer" : "default",
          }}
        >
          {t("+ Hesap aç")}
        </button>
      </div>

      {sonAcilan && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "12px 14px",
            border: `1px solid ${c.accent}`,
            borderRadius: 10,
            background: c.background,
            fontSize: 13,
            color: c.textPrimary,
          }}
        >
          <strong>{t("{ad} için hesap açıldı", { ad: sonAcilan.hesap.fullName })}</strong>
          <span style={{ color: c.textSecondary }}>
            {sonAcilan.epostaGonderildi
              ? t("{eposta} adresine giriş bağlantısı gönderildi. Kişi bağlantıya tıklayınca doğrudan hesabına girer.", {
                  eposta: sonAcilan.hesap.email,
                })
              : t("Hesap açıldı ama e-posta gönderilemedi. Listeden “Bağlantıyı yeniden gönder” diyebilirsin.")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: c.textSecondary }}>{t("Şifre")}:</span>
            <code style={{ fontSize: 13, padding: "2px 6px", border: `1px solid ${c.border}`, borderRadius: 6 }}>{sonAcilan.sifre}</code>
            <button onClick={() => kopyala(sonAcilan.sifre)} style={hayalet}>
              {kopyalandi ? t("Kopyalandı") : t("Kopyala")}
            </button>
            <button onClick={() => setSonAcilan(null)} style={{ ...hayalet, marginLeft: "auto" }}>
              {t("Tamam")}
            </button>
          </div>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t("Şifre bu ekrandan çıkınca bir daha gösterilmez. Kişiye e-posta dışında bir yoldan ilet.")}
          </span>
        </div>
      )}

      {bilgi && <span style={{ fontSize: 12, color: c.success }}>{bilgi}</span>}
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}

      {yukleniyor ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>
      ) : hesaplar.length === 0 ? (
        <div style={{ padding: "18px 14px", border: `1px dashed ${c.border}`, borderRadius: 10, fontSize: 13, color: c.textSecondary }}>
          {t("Henüz buradan hesap açılmadı. “Hesap aç” ile ekibinden birine kullanıcı adı ve şifre oluştur; kişi e-postasındaki bağlantıyla doğrudan hesabına girer.")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hesaplar.map((h) => (
            <div
              key={h.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: `1px solid ${c.border}`,
                borderRadius: 10,
                background: c.surface,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 220px", minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>
                  {h.fullName}
                  {h.title && <span style={{ fontWeight: 400, color: c.textSecondary }}> · {h.title}</span>}
                </span>
                <span style={{ fontSize: 12, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis" }}>
                  @{h.username} · {h.email}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: "1 1 160px" }}>
                {h.departmanlar.length === 0 ? (
                  <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Kadroda değil")}</span>
                ) : (
                  h.departmanlar.map((d) => (
                    <span
                      key={d.id}
                      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${c.border}`, color: c.textPrimary }}
                    >
                      {d.name} · {t(ROL_KISA[d.role])}
                    </span>
                  ))
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 1 auto" }}>
                {h.ilkGirisAt ? (
                  <span style={{ fontSize: 12, color: c.success }}>{t("Giriş yaptı · {tarih}", { tarih: tarih(h.ilkGirisAt) })}</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: c.textSecondary }}>
                      {h.davetGonderildiAt
                        ? t("Bağlantı gönderildi · {tarih}", { tarih: tarih(h.davetGonderildiAt) })
                        : t("E-posta gitmedi")}
                    </span>
                    <button onClick={() => yenidenGonder(h)} disabled={gonderiliyor === h.id} style={hayalet}>
                      {gonderiliyor === h.id ? t("Gönderiliyor…") : t("Bağlantıyı yeniden gönder")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <span style={{ fontSize: 11, color: c.textSecondary }}>
        {t("Rolü değiştirmek ya da kişiyi kadrodan çıkarmak için departmanın Ekip sekmesini kullan.")}
      </span>

      {formAcik && secenekler && (
        <EkipHesabiModal
          organizationId={organizationId}
          secenekler={secenekler}
          onClose={() => setFormAcik(false)}
          onAcildi={(sonuc) => {
            setFormAcik(false);
            setSonAcilan(sonuc);
            setBilgi("");
            yukle();
          }}
        />
      )}
    </div>
  );
}
