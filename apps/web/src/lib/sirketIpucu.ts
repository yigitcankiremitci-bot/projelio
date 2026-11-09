/**
 * Şirketi olmayan kişiye gösterilen "+" düğmesinin zamanlaması.
 *
 * Düğme kalıcı olursa üst şeritte gürültüye dönüşür: bilerek tek başına çalışan
 * kişi her açılışta aynı daveti görürdü. Bu yüzden yalnızca birkaç iş açmış
 * (ürünü gerçekten kullanan) kişiye, haftada bir gün çıkar; çarpıyla kapatılırsa
 * o hafta bir daha gelmez.
 */
const GUN = 24 * 60 * 60 * 1000;
export const IPUCU_ARALIGI = 7 * GUN;
export const IPUCU_SURESI = GUN;
export const IPUCU_EN_AZ_IS = 2;

export interface SirketIpucuKaydi {
  /** Bu haftaki görünmenin başladığı an. */
  baslangic?: number;
  kapandi?: number;
}

export function sirketIpucuKarari(girdi: {
  sirketSayisi: number;
  isSayisi: number;
  kayit: SirketIpucuKaydi;
  simdi: number;
}): { goster: boolean; kayit: SirketIpucuKaydi } {
  const { sirketSayisi, isSayisi, kayit, simdi } = girdi;
  if (sirketSayisi > 0 || isSayisi < IPUCU_EN_AZ_IS) return { goster: false, kayit };
  if (kayit.baslangic === undefined || simdi - kayit.baslangic >= IPUCU_ARALIGI) {
    return { goster: true, kayit: { baslangic: simdi } };
  }
  if (kayit.kapandi !== undefined && kayit.kapandi >= kayit.baslangic) return { goster: false, kayit };
  return { goster: simdi - kayit.baslangic < IPUCU_SURESI, kayit };
}
