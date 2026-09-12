import { useEffect, useState } from "react";
import type { BudgetViewer, User } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { IconTrash } from "../icons";

interface Props {
  scopeType: string;
  scopeId: string;
}

/**
 * "Bu bütçeyi kimler görsün" ayarı.
 *
 * Bütçe varsayılan olarak yalnızca kademenin SAHİBİNE ve YÖNETİCİSİNE açıktır.
 * Buradaki liste onun ÜZERİNE ekler — buradan bir kişiyi çıkarmak sahibi kendi
 * defterinden kilitleyemez.
 *
 * ONAY YETKİSİ BU LİSTEDEN GELMEZ. "Kayıt girebilir" işaretlenen kişi hareket
 * ekleyebilir ama görev bütçesi ONAYLAYAMAZ: onay "bu parayı harcamaya izin
 * veriyorum" demektir ve bir yönetim kararıdır. Görünürlük listesi bir okuma
 * izni mekanizmasıdır, imza yetkisi değil (bkz. butce-erisim.ts).
 *
 * Taşeron bu listeye eklenemez: dış kaynaktır, kurumsal finansal veriye hiç
 * erişmez. Sunucu reddediyor, burada da hata olarak görünüyor.
 */
export default function ButceGorunurluk({ scopeType, scopeId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [viewers, setViewers] = useState<BudgetViewer[]>([]);
  const [arama, setArama] = useState("");
  const [sonuclar, setSonuclar] = useState<User[]>([]);
  const [yazabilir, setYazabilir] = useState(false);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  const yukle = () => {
    setYukleniyor(true);
    api
      .get<BudgetViewer[]>(`/budget/scope/${scopeType}/${scopeId}/viewers`)
      .then(setViewers)
      .catch(() => setViewers([]))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [scopeType, scopeId]);

  // Arama sunucuda: istemcide tüm kullanıcı listesini tutmak hem gereksiz hem
  // de herkese açık bir kullanıcı dizini vermek demekti (bkz. users.controller).
  useEffect(() => {
    const q = arama.trim();
    if (q.length < 2) {
      setSonuclar([]);
      return;
    }
    let iptal = false;
    const zamanlayici = setTimeout(() => {
      api
        .get<User[]>(`/users/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!iptal) setSonuclar(r);
        })
        .catch(() => {
          if (!iptal) setSonuclar([]);
        });
    }, 250);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
    };
  }, [arama]);

  const ekle = async (userId: string) => {
    setHata("");
    try {
      await api.post(`/budget/scope/${scopeType}/${scopeId}/viewers`, { userId, canManage: yazabilir });
      setArama("");
      setSonuclar([]);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kullanıcı eklenemedi."));
    }
  };

  const cikar = async (userId: string) => {
    setViewers((prev) => prev.filter((v) => v.userId !== userId));
    await api.delete(`/budget/scope/${scopeType}/${scopeId}/viewers/${userId}`).catch(() => yukle());
  };

  return (
    <section>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>{t("Bütçeyi görenler")}</h2>
      <p style={{ fontSize: 12.5, color: c.textSecondary, margin: "0 0 10px" }}>
        {t("Sahibi ve yöneticileri bu bütçeyi zaten görür. Buraya eklediklerin de görebilir.")}
      </p>

      <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={t("İsim ya da e-posta ile ara")}
            style={{ flex: 1, minWidth: 180 }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: c.textSecondary }}>
            <input type="checkbox" checked={yazabilir} onChange={(e) => setYazabilir(e.target.checked)} />
            {t("Kayıt da girebilsin")}
          </label>
        </div>

        {sonuclar.length > 0 && (
          <div style={{ marginTop: 8, border: `1px solid ${c.border}`, borderRadius: 8, overflow: "hidden" }}>
            {sonuclar.map((u) => (
              <button
                key={u.id}
                onClick={() => ekle(u.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 11px",
                  border: "none",
                  borderBottom: `1px solid ${c.border}`,
                  background: "transparent",
                  color: c.textPrimary,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                {u.fullName}
                <span style={{ color: c.textSecondary, fontSize: 12 }}> · {u.email}</span>
              </button>
            ))}
          </div>
        )}

        {hata && <p style={{ color: c.danger, fontSize: 13, margin: "8px 0 0" }}>{hata}</p>}

        <div style={{ marginTop: 10 }}>
          {yukleniyor ? (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : viewers.length === 0 ? (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
              {t("Henüz kimseye ayrıca görünürlük verilmedi.")}
            </p>
          ) : (
            viewers.map((v) => (
              <div
                key={v.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 0",
                  borderTop: `1px solid ${c.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: c.textPrimary }}>{v.userName || v.userEmail}</div>
                  <div style={{ fontSize: 11.5, color: c.textSecondary }}>
                    {v.canManage ? t("Görüntüler ve kayıt girer") : t("Yalnızca görüntüler")}
                  </div>
                </div>
                <button
                  onClick={() => cikar(v.userId)}
                  aria-label={t("Görünürlüğü kaldır")}
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3 }}
                >
                  <IconTrash size={14} color={c.danger} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
