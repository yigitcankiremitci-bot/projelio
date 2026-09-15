import { useRef, useState } from "react";
import type { ModuleAttachmentsConfig } from "@projelio/shared";
import { faturalarApi } from "../api/faturalar";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import LinkedFilesPanel from "./LinkedFilesPanel";

interface Props {
  recordId: string;
  ayar: ModuleAttachmentsConfig;
  /** Kaydı düzenleme yetkisi yoksa yalnızca liste görünür. */
  canWrite?: boolean;
}

/**
 * Bir modül kaydının BELGELERİ (bkz. migration 112).
 *
 * LinkedFilesPanel'den ayrı: o panel bağlamayı bilir, YÜKLEMEYİ bilmez ve
 * bilmemesi doğru — oradaki dosyalar başka bir klasörde yaşıyor, o ekrana ait
 * değil. Burada ise dosyanın nereye ineceği kaydın kendisinden çıkıyor (fatura
 * tarihinin ay klasörü) ve karar sunucuda veriliyor; bu bileşen yalnızca
 * dosyayı seçtiriyor.
 *
 * Üç yol da aynı uca gidiyor: sürükle-bırak, dosya seç, fotoğraf çek. Fişin
 * fotoğrafı ayrı bir akış DEĞİL — telefonun kamerası yalnızca dosya seçicinin
 * başka bir kipi (`capture`), aksi hâlde aynı iş iki kez yazılırdı.
 */
export default function KayitEkleri({ recordId, ayar, canWrite = true }: Props) {
  const c = useThemeColors();
  const t = useT();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const kameraRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(0);
  const [hata, setHata] = useState("");
  const [uzerinde, setUzerinde] = useState(false);
  // Listeyi tazelemenin en ucuz yolu: yüklemeden sonra paneli yeniden kurmak.
  const [tazele, setTazele] = useState(0);

  const yukle = async (files: FileList | File[] | null) => {
    const secilen = Array.from(files ?? []);
    if (secilen.length === 0) return;
    setHata("");
    setYukleniyor(secilen.length);
    let basarili = 0;
    for (const file of secilen) {
      try {
        await faturalarApi.ekYukle(recordId, file);
        basarili++;
      } catch (e: any) {
        // Kalanları denemeye devam: beş fişten biri büyük diye diğer dördünü
        // yüklememek, kullanıcıyı işi baştan yapmaya zorlardı.
        setHata(e?.message ?? t("Belge yüklenemedi"));
      }
      setYukleniyor((n) => n - 1);
    }
    if (basarili) setTazele((n) => n + 1);
  };

  return (
    <div style={{ marginTop: 16 }}>
      {canWrite && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setUzerinde(true);
            }}
            onDragLeave={() => setUzerinde(false)}
            onDrop={(e) => {
              e.preventDefault();
              setUzerinde(false);
              void yukle(e.dataTransfer.files);
            }}
            onClick={() => dosyaRef.current?.click()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              padding: "16px 12px",
              borderRadius: 10,
              border: `1px dashed ${uzerinde ? c.primary : c.border}`,
              background: uzerinde ? `${c.primary}12` : "transparent",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 14, color: c.textPrimary }}>
              {yukleniyor > 0 ? t("Yükleniyor…") : t(ayar.label)}
            </span>
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("PDF'i buraya sürükleyin ya da tıklayıp seçin.")}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => dosyaRef.current?.click()}
              disabled={yukleniyor > 0}
              style={{ flex: 1, padding: "8px 0", fontSize: 13 }}
            >
              {t("Dosya yükle")}
            </button>
            <button
              type="button"
              onClick={() => kameraRef.current?.click()}
              disabled={yukleniyor > 0}
              style={{ flex: 1, padding: "8px 0", fontSize: 13 }}
            >
              {t("Fotoğraf çek")}
            </button>
          </div>

          <input
            ref={dosyaRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void yukle(e.target.files);
              // Aynı dosya ikinci kez seçilebilsin: değer değişmezse change
              // olayı hiç tetiklenmiyor.
              e.target.value = "";
            }}
          />
          {/*
            `capture` yalnızca telefonda anlamlı; masaüstünde tarayıcı bunu yok
            sayıp sıradan dosya seçici açıyor, yani düğme hiçbir yerde ölü değil.
          */}
          <input
            ref={kameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void yukle(e.target.files);
              e.target.value = "";
            }}
          />
        </>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: "8px 0 0" }}>{hata}</p>}

      <LinkedFilesPanel
        key={tazele}
        targetKind="module_record"
        targetId={recordId}
        title={t("Belgeler")}
        canUnlink={canWrite}
        canPick={canWrite}
      />
    </div>
  );
}
