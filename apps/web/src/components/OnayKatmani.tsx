import { useEffect, useState, useSyncExternalStore } from "react";
import Modal from "./Modal";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { onayIsteginiKapat, onayKuyrugu, onayKuyrugunuDinle, tehlikeliMi, type OnayIstegi } from "../lib/onay";

/**
 * lib/onay.ts'teki onayla / bildir / sor isteklerini uygulamanın kendi
 * Modal'ında gösterir. Bir kez, en dışta (main.tsx) yerleşir; aynı anda gelen
 * istekler sırayla sorulur.
 */
export default function OnayKatmani() {
  const kuyruk = useSyncExternalStore(onayKuyrugunuDinle, onayKuyrugu);
  const istek = kuyruk[0];
  if (!istek) return null;
  // Anahtar: arka arkaya iki soru gelirse yazılan metin ve odak sıfırlansın.
  return <OnayPenceresi key={kuyruk.length + ":" + istek.mesaj} istek={istek} />;
}

function OnayPenceresi({ istek }: { istek: OnayIstegi }) {
  const c = useThemeColors();
  const t = useT();
  const [metin, setMetin] = useState(istek.tur === "soru" ? istek.varsayilan ?? "" : "");

  const kapat = (sonuc: "evet" | "hayir") => {
    onayIsteginiKapat(istek);
    if (istek.tur === "onay") istek.coz(sonuc === "evet");
    else if (istek.tur === "soru") istek.coz(sonuc === "evet" ? metin : null);
    else istek.coz();
  };

  // Esc yalnızca bu pencereyi kapatsın: onay çoğu zaman başka bir pencerenin
  // içinden sorulur ve Modal'ın Esc dinleyicisi belgeye bağlı — yakalama
  // evresinde durdurulmazsa alttaki pencere de kapanıyordu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      kapat("hayir");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const tehlikeli = istek.tur === "onay" && (istek.tehlikeli ?? tehlikeliMi(istek.mesaj));
  const baslik = istek.baslik ?? (istek.tur === "onay" ? t("Emin misin?") : istek.tur === "soru" ? t("Bilgi gir") : t("Bilgi"));
  const onayEtiketi = istek.onayEtiketi ?? (istek.tur === "onay" ? t("Evet") : t("Tamam"));
  const vazgecEtiketi = istek.vazgecEtiketi ?? t("Vazgeç");

  const dugme = {
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 15,
    cursor: "pointer",
  } as const;

  return (
    <Modal title={baslik} onClose={() => kapat("hayir")} maxWidth={420}>
      <p style={{ fontSize: 15, color: c.textPrimary, margin: "0 0 16px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{istek.mesaj}</p>
      {istek.tur === "soru" && (
        <input
          autoFocus
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 15, padding: "9px 12px", borderRadius: 8, marginBottom: 16 }}
        />
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {istek.tur !== "bilgi" && (
          <button
            type="button"
            onClick={() => kapat("hayir")}
            style={{ ...dugme, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary }}
          >
            {vazgecEtiketi}
          </button>
        )}
        <button
          type="button"
          // Enter bu düğmeye basar (bkz. Modal findPrimaryAction).
          data-primary
          autoFocus={istek.tur !== "soru"}
          onClick={() => kapat("evet")}
          style={{ ...dugme, border: "none", background: tehlikeli ? c.danger : c.primary, color: tehlikeli ? "#fff" : c.onPrimary, fontWeight: 600 }}
        >
          {onayEtiketi}
        </button>
      </div>
    </Modal>
  );
}
