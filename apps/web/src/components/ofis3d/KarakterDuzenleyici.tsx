// Kişinin kendi 3D ofis karakterini düzenlediği panel: model, ten, saç ve
// kıyafet rengi. Seçimler anında sahnedeki karaktere uygulanır (önizleme
// sahnenin kendisi); "Kaydet" sunucuya yazar, "Vazgeç" eski görünüme döner.

import {
  KARAKTER_MODELLERI,
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
  const renkler = (baslik: string, liste: readonly string[], alan: "ten" | "sac" | "kiyafet") => (
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
      <div className="of-kd-grup">
        <span className="of-kd-baslik">Karakter</span>
        <div className="of-kd-modeller">
          {KARAKTER_MODELLERI.map((m) => (
            <button
              key={m.dosya}
              type="button"
              className={`of-kd-model${g.model === m.dosya ? " secili" : ""}`}
              aria-pressed={g.model === m.dosya}
              onClick={() => onDegis({ ...g, model: m.dosya })}
            >
              {m.ad}
            </button>
          ))}
        </div>
      </div>
      {renkler("Ten", TEN_RENKLERI, "ten")}
      {renkler("Saç", SAC_RENKLERI, "sac")}
      {renkler("Kıyafet", KIYAFET_RENKLERI, "kiyafet")}
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
