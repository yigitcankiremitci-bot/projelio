import { SIRALAMA_SECENEKLERI, type SiralamaKey } from "../lib/butceOzeti";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

export interface OdakSecenegi<K extends string> {
  key: K;
  label: string;
  /** Çipin üstüne gelince görünen açıklama: süzgecin neyi kapsadığı. */
  ipucu: string;
  /** Çipin yanında yazan sayı. 0 ya da tanımsızsa yazılmaz. */
  sayi?: number;
  /** Dikkat çeken süzgeç (ör. gecikmiş): seçili olmasa da uyarı renginde durur. */
  uyari?: boolean;
}

interface Props<K extends string> {
  odaklar: OdakSecenegi<K>[];
  odak: K;
  onOdak: (key: K) => void;
  siralama: SiralamaKey;
  onSiralama: (key: SiralamaKey) => void;
  /** Sıralama menüsünün id'si: aynı sayfada iki çubuk olursa çakışmasın. */
  siralamaId?: string;
}

/**
 * Kasa sayfalarının üst çubuğu: odak süzgeçleri + sıralama.
 *
 * Üç kasa da (kişisel, şirket, departman) aynı çubuğu kullanıyor. Süzgeçlerin
 * ANLAMI her sayfada farklı — kişiselde vade, departmanda görev bütçesi onayı —
 * ama görünüş ve davranış aynı; üç kopya olsaydı biri değişip diğerleri
 * kalırdı.
 *
 * Sayfanın en üstünde, bütün listelerden ÖNCE durur: aşağıdaki her bölüm ona
 * bağlı, listelerin arasına girdiğinde neyi etkilediği anlaşılmıyordu.
 */
export default function KasaFiltreCubugu<K extends string>({
  odaklar,
  odak,
  onOdak,
  siralama,
  onSiralama,
  siralamaId = "kasa-sirala",
}: Props<K>) {
  const c = useThemeColors();
  const t = useT();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {odaklar.map((secenek) => {
        const secili = secenek.key === odak;
        const uyari = Boolean(secenek.uyari) && !secili;
        return (
          <button
            key={secenek.key}
            type="button"
            title={t(secenek.ipucu)}
            onClick={() => onOdak(secenek.key)}
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              border: `1px solid ${secili ? c.accent : uyari ? c.danger : c.border}`,
              background: secili ? `${c.accent}1a` : uyari ? `${c.danger}12` : c.surface,
              color: secili ? c.accent : uyari ? c.danger : c.textSecondary,
              cursor: "pointer",
            }}
          >
            {t(secenek.label)}
            {secenek.sayi ? ` (${secenek.sayi})` : ""}
          </button>
        );
      })}

      <span style={{ flex: 1 }} />

      <label htmlFor={siralamaId} style={{ fontSize: 13, color: c.textSecondary }}>
        {t("Sırala")}
      </label>
      <select
        id={siralamaId}
        value={siralama}
        onChange={(e) => onSiralama(e.target.value as SiralamaKey)}
        style={{ width: "auto", minWidth: 168, fontSize: 13 }}
      >
        {SIRALAMA_SECENEKLERI.map((secenek) => (
          <option key={secenek.key} value={secenek.key}>
            {t(secenek.label)}
          </option>
        ))}
      </select>
    </div>
  );
}
