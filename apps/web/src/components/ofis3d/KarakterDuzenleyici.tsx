// Kişinin kendi 3D ofis karakterini düzenlediği panel: model, ten ve saç;
// ayrı sekmede kıyafet parçaları (üst, alt, ayakkabı) — şekil ve renk. Seçimler anında sahnedeki karaktere uygulanır (önizleme
// sahnenin kendisi); "Kaydet" sunucuya yazar, "Vazgeç" eski görünüme döner.

import { useState } from "react";
import {
  KARAKTER_MODELLERI,
  KIYAFET_PARCALARI,
  KIYAFET_RENKLERI,
  SAC_RENKLERI,
  TEN_RENKLERI,
  type KarakterGorunumu,
  type KarakterModeli,
} from "@projelio/shared";

export default function KarakterDuzenleyici({
  gorunum,
  varsayilanModel,
  kaydediliyor,
  onDegis,
  onKaydet,
  onVazgec,
}: {
  /** Şu an seçili görünüm (kayıtlı değilse modeli adından türetilen). */
  gorunum: KarakterGorunumu | null;
  /** Kaydı yokken sahnede görünen model (adından türetilen). */
  varsayilanModel: KarakterModeli;
  kaydediliyor: boolean;
  onDegis: (g: KarakterGorunumu) => void;
  onKaydet: () => void;
  onVazgec: () => void;
}) {
  const g: KarakterGorunumu = gorunum ?? { model: varsayilanModel };
  const [sekme, setSekme] = useState<"karakter" | "kiyafet">("karakter");
  const renkler = (baslik: string, liste: readonly string[], alan: "ten" | "sac" | "kiyafet" | "altRenk" | "ayakkabiRenk") => (
    <div className="of-kd-grup">
      <span className="of-kd-baslik">{baslik}</span>
      <div className="of-kd-renkler">
        <button
          type="button"
          className={`of-kd-renk varsayilan${!g[alan] ? " secili" : ""}`}
          aria-label={`${baslik}: modelin kendi rengi`}
          aria-pressed={!g[alan]}
          title="Modelin kendi rengi"
          onClick={() => onDegis({ ...g, [alan]: undefined })}
        />
        {liste.map((r) => (
          <button
            key={r}
            type="button"
            className={`of-kd-renk${g[alan] === r ? " secili" : ""}`}
            style={{ background: r }}
            aria-label={`${baslik}: ${r}`}
            aria-pressed={g[alan] === r}
            onClick={() => onDegis({ ...g, [alan]: r })}
          />
        ))}
      </div>
    </div>
  );
  return (
    <div className="of-hud of-karakter" role="dialog" aria-label="Karakterini düzenle">
      <div className="of-kd-bas">
        <b>Karakterini düzenle</b>
        <small>Seçtiğin görünüm ofiste herkese böyle görünür.</small>
      </div>
      <div className="of-kd-sekmeler" role="tablist">
        {(
          [
            ["karakter", "Karakter"],
            ["kiyafet", "Kıyafet"],
          ] as const
        ).map(([k, ad]) => (
          <button key={k} type="button" role="tab" aria-selected={sekme === k} className={`of-kd-sekme${sekme === k ? " secili" : ""}`} onClick={() => setSekme(k)}>
            {ad}
          </button>
        ))}
      </div>
      {sekme === "karakter" ? (
        <>
          <div className="of-kd-grup">
            <span className="of-kd-baslik">Karakter</span>
            <div className="of-kd-modeller">
              {KARAKTER_MODELLERI.map((m) => (
                <button
                  key={m.dosya}
                  type="button"
                  className={`of-kd-model${g.model === m.dosya ? " secili" : ""}`}
                  aria-pressed={g.model === m.dosya}
                  // Parça kendi modelininse kayıtta boş tutulur (bkz. karakterGorunumuTemizle).
                  onClick={() =>
                    onDegis({
                      ...g,
                      model: m.dosya,
                      ust: g.ust === m.dosya ? undefined : g.ust,
                      alt: g.alt === m.dosya ? undefined : g.alt,
                      ayakkabi: g.ayakkabi === m.dosya ? undefined : g.ayakkabi,
                    })
                  }
                >
                  {m.ad}
                </button>
              ))}
            </div>
          </div>
          {renkler("Ten", TEN_RENKLERI, "ten")}
          {renkler("Saç", SAC_RENKLERI, "sac")}
        </>
      ) : (
        KIYAFET_PARCALARI.map((p) => {
          const secili = g[p.alan] ?? g.model;
          return (
            <div key={p.alan} className="of-kd-parca">
              <div className="of-kd-grup">
                <span className="of-kd-baslik">{p.ad}: şekil</span>
                <div className="of-kd-sekiller">
                  {KARAKTER_MODELLERI.map((m) => (
                    <button
                      key={m.dosya}
                      type="button"
                      className={`of-kd-sekil${secili === m.dosya ? " secili" : ""}`}
                      aria-pressed={secili === m.dosya}
                      onClick={() => onDegis({ ...g, [p.alan]: m.dosya === g.model ? undefined : m.dosya })}
                    >
                      {m.dosya === g.model ? "Kendi" : m.ad}
                    </button>
                  ))}
                </div>
              </div>
              {renkler(`${p.ad}: renk`, KIYAFET_RENKLERI, p.renk)}
            </div>
          );
        })
      )}
      <div className="of-kd-alt">
        <button type="button" className="of-btn" onClick={onVazgec} disabled={kaydediliyor}>
          Vazgeç
        </button>
        <button type="button" className="of-btn birincil" onClick={onKaydet} disabled={kaydediliyor}>
          {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
