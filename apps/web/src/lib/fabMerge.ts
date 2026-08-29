/**
 * "+" düğmesine aynı anda kaydedilmiş eylemleri tek bir eyleme indirger.
 *
 * Ayrı dosyada, çünkü saf mantık: testi JSX'siz koşabiliyor (bkz. fabMerge.test.ts).
 * Kullanımı ve kayıt defteri için bkz. projectFab.tsx.
 */

export interface ProjectFabActionOption {
  label: string;
  onClick: () => void;
}

export interface ProjectFabAction {
  label: string;
  // Tek bir eylem için onClick yeterli. Birden fazla ekleme seçeneği sunmak
  // gerektiğinde (örn. şirket anasayfasında "+" ile departman/ürün-hizmet/modül
  // arasından seçim) onClick yerine options verilir — BottomNav bu durumda
  // doğrudan tetiklemek yerine küçük bir seçim menüsü açar (bkz. job-choice deseni).
  onClick?: () => void;
  options?: ProjectFabActionOption[];
}

/**
 * Kayıt önceliği.
 *
 * Aynı anda ekranda olan iki bileşen de "+"a bir eylem verebilir. Böyle bir
 * durumda SAYFANIN genel eylemi değil, o an içinde çalışılan PANELİN eylemi
 * kazanmalı: kullanıcı bir modülün kayıt listesine bakarken "+" o listeye kayıt
 * eklemeli, sayfanın varsayılanını değil.
 */
export const FAB_PRIORITY = {
  /** Sayfanın kendi (sekmeye bağlı) eylemi. */
  page: 0,
  /** Sayfanın içinde çalışılan panelin eylemi — sayfayı ezer. */
  panel: 10,
} as const;

export interface FabRegistration {
  /** Kayıt sırası — render sırasında dağıtılır, menüdeki sırayı belirler. */
  id: number;
  priority: number;
  action: ProjectFabAction;
}

/**
 * En yüksek öncelikli kayıtları tek bir "+" eylemine indirger.
 *
 * Aynı öncelikte birden fazla kayıt varsa (örn. departmanın Modüller sekmesinde
 * hem modül hem ürün eklenebiliyor) hepsi TEK menüde toplanır — ikinci bir
 * ekleme düğmesi açmak yerine.
 */
export function mergeFabActions(list: FabRegistration[]): ProjectFabAction | null {
  if (list.length === 0) return null;
  const top = Math.max(...list.map((e) => e.priority));
  const winners = list.filter((e) => e.priority === top).sort((a, b) => a.id - b.id);
  if (winners.length === 1) return winners[0].action;

  const options = winners.flatMap((e) =>
    e.action.options?.length
      ? e.action.options
      : e.action.onClick
      ? [{ label: e.action.label, onClick: e.action.onClick }]
      : []
  );
  if (options.length === 0) return null;
  // Tek seçenek kalmışsa menü açmaya değmez: "+" doğrudan onu tetikler.
  if (options.length === 1) return { label: options[0].label, onClick: options[0].onClick };
  return { label: "Ekle", options };
}
