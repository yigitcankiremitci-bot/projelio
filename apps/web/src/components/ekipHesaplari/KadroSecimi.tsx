import { useMemo } from "react";
import type { DepartmentMemberRole, EkipHesabiSecenekleri } from "@projelio/shared";
import { useT } from "../../lib/i18n";
import { departmanAdi } from "../../lib/departmanAdi";
import { useThemeColors } from "../../theme/useThemeColors";

export const ROL_ETIKETI: Record<DepartmentMemberRole, string> = {
  employee: "Üretici Çalışan", // dil:anahtar
  manager: "Departman Yöneticisi", // dil:anahtar
  subcontractor: "Taşeron", // dil:anahtar
};

const ROL_ACIKLAMASI: Record<DepartmentMemberRole, string> = {
  employee: "Departmanın modüllerini görür; işaretlediğin modüllerde kayıt girer.", // dil:anahtar
  manager: "Departmanı yönetir: kadroya kişi ekler, tüm modüllerde kayıt girer, bütçeyi görür.", // dil:anahtar
  subcontractor: "Dış kaynak: yalnızca işaretlediğin modüllerde çalışır, kadroyu ve bütçeyi göremez.", // dil:anahtar
};

// Görev/pozisyon alanı serbest metin; bunlar yalnızca yazmaya başlarken çıkan öneriler.
export const GOREV_ONERILERI = [
  "Satış temsilcisi", // dil:anahtar
  "Muhasebe uzmanı", // dil:anahtar
  "Proje yöneticisi", // dil:anahtar
  "İnsan kaynakları uzmanı", // dil:anahtar
  "Grafik tasarımcı", // dil:anahtar
  "Sosyal medya uzmanı", // dil:anahtar
  "Yazılım geliştirici", // dil:anahtar
  "Stajyer", // dil:anahtar
];

/** Departman → rol eşlemesi ve "departmentId:moduleKey" kümesi — formun durumu. */
export type DepartmanRolleri = Record<string, DepartmentMemberRole>;

/** Form durumunu sunucunun beklediği seçime çevirir. */
export function kadroSeciminiTopla(secenekler: EkipHesabiSecenekleri, departmanlar: DepartmanRolleri, moduller: Set<string>) {
  return {
    departmanlar: secenekler.departmanlar
      .filter((d) => departmanlar[d.id])
      .map((d) => ({ departmentId: d.id, role: departmanlar[d.id] })),
    moduller: [...moduller].map((anahtar) => {
      const [departmentId, moduleKey] = anahtar.split(":");
      return { departmentId, moduleKey };
    }),
  };
}

/** Tek departmanlı şirkette departman baştan seçili gelir. */
export function baslangicDepartmanlari(secenekler: EkipHesabiSecenekleri): DepartmanRolleri {
  return secenekler.departmanlar.length === 1 ? { [secenekler.departmanlar[0].id]: "employee" } : {};
}

interface Props {
  secenekler: EkipHesabiSecenekleri;
  departmanlar: DepartmanRolleri;
  setDepartmanlar: React.Dispatch<React.SetStateAction<DepartmanRolleri>>;
  moduller: Set<string>;
  setModuller: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** Bölüm başlığı çizer — formun kendi başlık stiliyle aynı görünsün diye dışarıdan gelir. */
  bolum: (baslik: string) => React.ReactNode;
}

/**
 * "Departman ve rol" + "Görebilecekleri ve çalışacağı modüller" bölümleri.
 *
 * Ekip Hesabı formu ve İşe al formu ORTAK kullanır: kişiyi hangi departmana
 * hangi rolle ve hangi modüllere koyduğun iki ekranda aynı görünmeli, sunucu
 * da ikisini aynı kuralla doğruluyor (kadroSeciminiDogrula).
 *
 * Departman seçimi kaldırıldığında o departmandan işaretlenmiş modüller de
 * düşer — görünmeyen bir seçim sunucuya gidip "modül seçilen departmana ait
 * olmalı" hatası verirdi.
 */
export default function KadroSecimi({ secenekler, departmanlar, setDepartmanlar, moduller, setModuller, bolum }: Props) {
  const c = useThemeColors();
  const t = useT();

  const seciliDepartmanlar = useMemo(
    () => secenekler.departmanlar.filter((d) => departmanlar[d.id]),
    [secenekler, departmanlar]
  );

  const departmanDegistir = (id: string, secili: boolean) => {
    setDepartmanlar((onceki) => {
      const yeni = { ...onceki };
      if (secili) yeni[id] = yeni[id] ?? "employee";
      else delete yeni[id];
      return yeni;
    });
    if (!secili) {
      setModuller((onceki) => new Set([...onceki].filter((anahtar) => !anahtar.startsWith(`${id}:`))));
    }
  };

  const modulDegistir = (anahtar: string, secili: boolean) => {
    setModuller((onceki) => {
      const yeni = new Set(onceki);
      if (secili) yeni.add(anahtar);
      else yeni.delete(anahtar);
      return yeni;
    });
  };

  const tumunuSec = (departmentId: string, keys: string[], secili: boolean) => {
    setModuller((onceki) => {
      const yeni = new Set(onceki);
      for (const k of keys) {
        if (secili) yeni.add(`${departmentId}:${k}`);
        else yeni.delete(`${departmentId}:${k}`);
      }
      return yeni;
    });
  };

  const ipucu = (metin: string) => <span style={{ fontSize: 11, color: c.textSecondary }}>{metin}</span>;
  const kucukDugme = {
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    cursor: "pointer",
    color: c.textSecondary,
    whiteSpace: "nowrap" as const,
    padding: "2px 8px",
    fontSize: 11,
  };

  return (
    <>
      {bolum(t("Departman ve rol"))}
      {secenekler.departmanlar.length === 0 ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("Bu şirkette henüz departman yok. Önce bir departman aç; hesap bir departmanın kadrosuna eklenir.")}
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!secenekler.sahipMi && ipucu(t("Yalnızca yöneticisi olduğun departmanlar listeleniyor."))}
          {secenekler.departmanlar.map((d) => {
            const rol = departmanlar[d.id];
            return (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  border: `1px solid ${rol ? c.accent : c.border}`,
                  borderRadius: 8,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textPrimary, flex: "1 1 160px" }}>
                  <input type="checkbox" checked={Boolean(rol)} onChange={(e) => departmanDegistir(d.id, e.target.checked)} />
                  {departmanAdi(d.name, t)}
                </label>
                {rol && (
                  <select
                    value={rol}
                    onChange={(e) => setDepartmanlar((o) => ({ ...o, [d.id]: e.target.value as DepartmentMemberRole }))}
                    style={{ fontSize: 12, padding: "4px 6px" }}
                  >
                    {(Object.keys(ROL_ETIKETI) as DepartmentMemberRole[]).map((r) => (
                      <option key={r} value={r}>
                        {t(ROL_ETIKETI[r])}
                      </option>
                    ))}
                  </select>
                )}
                {rol && <div style={{ flexBasis: "100%", fontSize: 11, color: c.textSecondary }}>{t(ROL_ACIKLAMASI[rol])}</div>}
              </div>
            );
          })}
        </div>
      )}

      {seciliDepartmanlar.length > 0 && (
        <>
          {bolum(t("Görebilecekleri ve çalışacağı modüller"))}
          {ipucu(
            t("Departmanın kadrosunda olmak o departmanın modüllerini görmeye yeter. İşaretlediğin modüllerde kayıt da girebilir.")
          )}
          {seciliDepartmanlar.map((d) => {
            const anahtarlar = d.moduller.map((m) => m.key);
            const hepsi = anahtarlar.length > 0 && anahtarlar.every((k) => moduller.has(`${d.id}:${k}`));
            return (
              <div key={d.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{departmanAdi(d.name, t)}</span>
                  {anahtarlar.length > 1 && (
                    <button type="button" onClick={() => tumunuSec(d.id, anahtarlar, !hepsi)} style={kucukDugme}>
                      {hepsi ? t("Hiçbiri") : t("Tümü")}
                    </button>
                  )}
                </div>
                {d.moduller.length === 0 ? (
                  ipucu(t("Bu departmanda açık modül yok."))
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 4 }}>
                    {d.moduller.map((m) => {
                      const anahtar = `${d.id}:${m.key}`;
                      return (
                        <label key={anahtar} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: c.textPrimary }}>
                          <input type="checkbox" checked={moduller.has(anahtar)} onChange={(e) => modulDegistir(anahtar, e.target.checked)} />
                          {m.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
