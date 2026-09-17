import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

interface Props {
  /** "Google Drive" / "OneDrive"; bilinmiyorsa (karışık küme) genel ad kullanılır. */
  provider?: string;
  /** true: bulutta da çöp kutusuna taşınır. */
  alsoTrash: boolean;
  onChange: (alsoTrash: boolean) => void;
}

/**
 * Dosya kaldırma penceresindeki "nereye kadar silinsin" seçimi.
 *
 * NEDEN İKİ AÇIK SEÇENEK: eskiden pencere yalnızca "Projelio'dan kaldırılacak"
 * diyordu, bulutta da silineceği küçük bir onay kutusunda saklıydı (bir
 * ekranda o kutu hiç yoktu ve dosya her zaman Drive'dan da siliniyordu).
 * Kullanıcı için ikisi çok farklı sonuçlar: biri dosyayı yalnızca listeden
 * çıkarıyor, öbürü kendi Drive'ından siliyor. İkisi de yan yana, ne olacağı
 * yazılı olarak duruyor.
 */
export default function FileDeleteOptions({ provider, alsoTrash, onChange }: Props) {
  const c = useThemeColors();
  const t = useT();
  // Ek ("'dan", "'da") doğrudan ada geliyor; genel ad da ona uymalı.
  const depo = provider ?? "Drive/OneDrive";

  const secenek = (deger: boolean, baslik: string, aciklama: string) => {
    const secili = alsoTrash === deger;
    return (
      <label
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "10px 12px",
          borderRadius: 9,
          border: `1px solid ${secili ? (deger ? c.danger : c.accent) : c.border}`,
          background: secili ? `${deger ? c.danger : c.accent}10` : "transparent",
          cursor: "pointer",
        }}
      >
        <input
          type="radio"
          name="dosya-silme-kapsami"
          checked={secili}
          onChange={() => onChange(deger)}
          style={{ marginTop: 3 }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, color: c.textPrimary }}>{baslik}</span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }}>{aciklama}</span>
        </span>
      </label>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {secenek(
        true,
        t("Projelio'dan kaldır ve {depo}'dan da sil", { depo }),
        t("Dosya {depo} çöp kutusuna taşınır; oradan bir süre geri alınabilir.", { depo })
      )}
      {secenek(
        false,
        t("Yalnızca Projelio'dan kaldır"),
        t("Dosya {depo}'da olduğu gibi kalır.", { depo })
      )}
    </div>
  );
}
