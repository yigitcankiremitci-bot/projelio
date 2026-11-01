/**
 * Projelio'ya giden tek kapı. Kimlik, Ajan panelinden üretilen kişiye özel
 * anahtar: yalnızca /ajan/isci/* uçlarını açar, hesabın geri kalanına erişmez.
 * Tipler sunucudaki `packages/shared/src/ajan.ts` ile aynı biçimde; bu klasör
 * workspace olmadığı için oradan içe aktarılamıyor.
 */

export interface IsPaketi {
  is: { id: string; tur: "sohbet" | "arastirma" | "ogrenme" | "liste"; girdi: string };
  ad: string;
  ogretilenler: { baslik: string; icerik: string }[];
  sonMesajlar: { rol: "kullanici" | "ajan"; metin: string }[];
  mevcutKonular: string[];
}

export interface Kaynak {
  baslik: string;
  adres: string;
}

export interface IsSonucu {
  hata?: string;
  mesaj?: string;
  rapor?: { baslik: string; ozet?: string; icerik: string; kaynaklar?: Kaynak[] };
  bilgiler?: { baslik: string; icerik: string; kaynaklar?: Kaynak[] }[];
  konular?: { konu: string; neden?: string }[];
  oneriler?: { tur: "yapilacak"; veri: { baslik: string; aciklama?: string; bitis?: string } }[];
}

export class Projelio {
  // Kurucuda `private url` kısaltması YOK: Node'un tip silmesi onu çalıştıramıyor.
  private url: string;
  private anahtar: string;

  constructor(url: string, anahtar: string) {
    this.url = url;
    this.anahtar = anahtar;
  }

  private async istek<T>(yol: string, init: RequestInit = {}): Promise<T> {
    const y = await fetch(new URL(yol, this.url), {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${this.anahtar}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!y.ok) throw new Error(`Projelio ${y.status}: ${(await y.text()).slice(0, 200)}`);
    return (await y.json()) as T;
  }

  nabiz(durum: "bosta" | "calisiyor", not: string | null, model: string) {
    return this.istek("/ajan/isci/nabiz", { method: "POST", body: JSON.stringify({ durum, not, model }) });
  }

  async isAl(): Promise<IsPaketi | null> {
    return (await this.istek<{ paket: IsPaketi | null }>("/ajan/isci/is-al", { method: "POST", body: "{}" })).paket;
  }

  bellekteAra(q: string) {
    return this.istek<{ baslik: string; icerik: string }[]>(`/ajan/isci/bellek?q=${encodeURIComponent(q)}`);
  }

  bitir(id: string, sonuc: IsSonucu) {
    return this.istek(`/ajan/isci/isler/${id}/bitir`, { method: "POST", body: JSON.stringify(sonuc) });
  }
}
