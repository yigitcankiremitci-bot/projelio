import { useEffect, useState } from "react";
import type { Department, Project } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

export interface KonumHedefi {
  projectId?: string;
  departmentId?: string;
}

interface Props {
  /** Görevin şu an bağlı olduğu yer. İkisi de boşsa görev kişiseldir. */
  projectId?: string;
  departmentId?: string;
  /**
   * Hedef seçilince çağrılır. Hata fırlatırsa mesajı bölümde gösterilir;
   * başarılı olursa pencereyi kapatmak/yenilemek çağıranın işi.
   */
  onSec: (hedef: KonumHedefi) => Promise<void>;
}

/**
 * Görev düzenleme penceresindeki "Konum" bölümü: görev nerede yaşıyor, başka
 * bir projeye ya da departmana alınabilir mi.
 *
 * Proje görevi ile kişisel görev AYNI bölümü görür; fark yalnızca düğmenin
 * yaptığı iştedir (taşımak ya da kişisel görevi gerçek göreve çevirmek) ve o
 * iş `onSec` ile dışarıdan verilir. Kişisel bir yapılacağın sonradan "bu
 * aslında şu projenin işi" diye bağlanabilmesi için eklendi — önceki tek yol
 * görevi silip projede yeniden yazmaktı.
 *
 * Liste GET /projects ve GET /departments'tan gelir: kullanıcının erişebildiği
 * tüm projeler/departmanlar (bkz. MoveTaskModal — aynı kaynak).
 */
export default function GorevKonumu({ projectId, departmentId, onSec }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [acik, setAcik] = useState(false);
  const [tur, setTur] = useState<"project" | "department">("project");
  const [hedefId, setHedefId] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  // Mevcut konumun ADI için liste gerekiyor; kişisel görevde (konum yok) liste
  // ancak seçici açılınca çekilir.
  const kisisel = !projectId && !departmentId;
  useEffect(() => {
    if (kisisel && !acik) return;
    if (projects && departments) return;
    Promise.all([
      api.get<Project[]>("/projects").catch(() => [] as Project[]),
      api.get<Department[]>("/departments").catch(() => [] as Department[]),
    ]).then(([p, d]) => {
      setProjects(p);
      setDepartments(d);
    });
  }, [kisisel, acik, projects, departments]);

  const mevcutAd = projectId
    ? projects?.find((p) => p.id === projectId)?.title
    : departmentId
      ? departments?.find((d) => d.id === departmentId)?.name
      : undefined;
  const mevcutMetin = kisisel
    ? t("Kişisel — bu görevi senden başkası görmez.")
    : projectId
      ? t("Proje: {ad}", { ad: mevcutAd ?? "…" })
      : t("Departman: {ad}", { ad: mevcutAd ?? "…" });

  // Görevin zaten bulunduğu yer hedef listesinde çıkmasın.
  const secenekler =
    tur === "project"
      ? (projects ?? []).filter((p) => p.id !== projectId).map((p) => ({ id: p.id, ad: p.title }))
      : (departments ?? []).filter((d) => d.id !== departmentId).map((d) => ({ id: d.id, ad: d.name }));

  const uygula = async () => {
    if (!hedefId) return;
    setCalisiyor(true);
    setHata("");
    try {
      await onSec(tur === "project" ? { projectId: hedefId } : { departmentId: hedefId });
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Görev taşınamadı"));
      setCalisiyor(false);
    }
  };

  const turDugmesi = (deger: "project" | "department", etiket: string) => (
    <button
      type="button"
      onClick={() => {
        setTur(deger);
        setHedefId("");
      }}
      style={{
        flex: 1,
        padding: "7px 0",
        borderRadius: 8,
        border: `1.5px solid ${tur === deger ? c.primary : c.border}`,
        background: tur === deger ? c.background : "transparent",
        color: c.textPrimary,
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {etiket}
    </button>
  );

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 20, paddingTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>{t("Görevin yeri")}</h3>

      {!acik ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, color: c.textSecondary }}>{mevcutMetin}</span>
          <button
            type="button"
            onClick={() => setAcik(true)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              cursor: "pointer",
            }}
          >
            {kisisel ? t("Projeye / departmana ata") : t("Başka yere taşı")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {kisisel && (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, lineHeight: 1.45 }}>
              {t("Görev seçtiğin yerde sana atanmış olarak açılır; ekip onu görebilir. Kişisel kopyası kaldırılır.")}
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            {turDugmesi("project", t("Proje"))}
            {turDugmesi("department", t("Departman"))}
          </div>
          {!projects || !departments ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : secenekler.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
              {tur === "project" ? t("Erişebildiğin proje yok.") : t("Erişebildiğin departman yok.")}
            </p>
          ) : (
            <select value={hedefId} onChange={(e) => setHedefId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Seç…")}</option>
              {secenekler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setAcik(false);
                setHedefId("");
                setHata("");
              }}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: "transparent",
                color: c.textPrimary,
                fontSize: 14,
              }}
            >
              {t("Vazgeç")}
            </button>
            <button
              type="button"
              onClick={() => void uygula()}
              disabled={!hedefId || calisiyor}
              style={{
                padding: "7px 16px",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: c.onPrimary,
                fontSize: 14,
                fontWeight: 500,
                opacity: !hedefId || calisiyor ? 0.6 : 1,
              }}
            >
              {calisiyor ? t("Kaydediliyor…") : kisisel ? t("Ata") : t("Taşı")}
            </button>
          </div>
          {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
        </div>
      )}
    </div>
  );
}
