import type {
  EpostaAyarlariDto,
  EpostaHedefi,
  EpostaIpucuSatiri,
  EpostaKampanyaGirdisi,
  EpostaKampanyasi,
  EpostaMaliyetOzeti,
} from "@projelio/shared";
import { api } from "./client";

/** Admin > E-posta uçları (bkz. backend/src/modules/eposta-yonetimi/). */

export interface IpucuYamasi {
  aktif?: boolean;
  lioIle?: boolean;
  baslik?: string | null;
  govde?: string | null;
  link?: string | null;
  dugme?: string | null;
}

export interface LioTaslagi {
  metin: { konu: string; baslik: string; govde: string; dugme?: string };
  birim: number;
}

const yol = (anahtar: string) => `/admin/eposta/ipuclari/${encodeURIComponent(anahtar)}`;

export const epostaYonetimi = {
  ayarlar: () => api.get<EpostaAyarlariDto>("/admin/eposta/ayarlar"),
  ayarlariKaydet: (g: Partial<Pick<EpostaAyarlariDto, "ipuclariAcik" | "lioGunlukTavanBirim">>) =>
    api.patch<EpostaAyarlariDto>("/admin/eposta/ayarlar", g),

  ipuclari: () => api.get<EpostaIpucuSatiri[]>("/admin/eposta/ipuclari"),
  ipucuEkle: (g: IpucuYamasi) => api.post<EpostaIpucuSatiri>("/admin/eposta/ipuclari", g),
  ipucuGuncelle: (anahtar: string, g: IpucuYamasi) => api.patch<EpostaIpucuSatiri>(yol(anahtar), g),
  ipucuSil: (anahtar: string) => api.delete<{ ok: true }>(yol(anahtar)),
  ipucuSirala: (anahtarlar: string[]) => api.post<EpostaIpucuSatiri[]>("/admin/eposta/ipuclari/sirala", { anahtarlar }),
  ipucuDene: (anahtar: string) => api.post<{ sent: boolean; lio: boolean }>(`${yol(anahtar)}/deneme`, {}),

  hedefSayisi: (hedef: EpostaHedefi) => api.post<{ sayi: number }>("/admin/eposta/hedef-sayisi", { hedef }),
  taslak: (istek: string, dil: "tr" | "en") => api.post<LioTaslagi>("/admin/eposta/taslak", { istek, dil }),
  onizleme: (g: Partial<EpostaKampanyaGirdisi> & { aliciId?: string }) =>
    api.post<{ konu: string; html: string; lio: boolean; birim: number }>("/admin/eposta/onizleme", g),
  kampanyalar: () => api.get<EpostaKampanyasi[]>("/admin/eposta/kampanyalar"),
  kampanyaOlustur: (g: EpostaKampanyaGirdisi) => api.post<EpostaKampanyasi>("/admin/eposta/kampanyalar", g),
  kampanyaIptal: (id: string) => api.post<EpostaKampanyasi>(`/admin/eposta/kampanyalar/${id}/iptal`, {}),

  maliyet: (gun: number) => api.get<EpostaMaliyetOzeti>(`/admin/eposta/maliyet?gun=${gun}`),
};
