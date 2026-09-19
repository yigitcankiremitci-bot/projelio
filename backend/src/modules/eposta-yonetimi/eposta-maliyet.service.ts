import { Injectable } from "@nestjs/common";
import { maliyetTopla, type EpostaLioIslemi, type EpostaMaliyetOzeti } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { IpucuDeposuService } from "./ipucu-deposu.service";

/**
 * Lio'nun e-posta harcamasının özeti (Admin > E-posta maliyeti).
 *
 * Her satır bir model çağrısı; "birim" o harcamanın bir kullanıcıdan
 * kesilseydi tutacağı Lio Bakiyesi (komisyon dahil). Kampanya ve ipucu
 * başına "birimBasina", tek bir alıcıya ortalama maliyeti gösteriyor —
 * yönetici bir sonraki kampanyanın bedelini buradan tahmin eder.
 *
 * Toplama kodda: satır sayısı küçük (günde en fazla birkaç yüz) ve
 * PostgREST'te grup toplamı için ayrı bir görünüm/RPC gerekirdi.
 */

const SATIR_TAVANI = 20000;
const ISLEMLER: EpostaLioIslemi[] = ["ipucu", "kampanya", "taslak", "onizleme"];

@Injectable()
export class EpostaMaliyetService {
  constructor(
    private supabase: SupabaseService,
    private depo: IpucuDeposuService
  ) {}

  async ozet(gunGirdisi: unknown): Promise<EpostaMaliyetOzeti> {
    const gun = Math.min(365, Math.max(1, Number(gunGirdisi) || 30));
    const baslangic = new Date(Date.now() - gun * 86_400_000).toISOString();
    const { data, error } = await this.supabase.client
      .from("eposta_ai_kullanimi")
      .select(
        "id, created_at, islem, kampanya_id, ipucu_anahtari, model, input_tokens, output_tokens, maliyet_usd, birim, basarili, alici:users!eposta_ai_kullanimi_alici_user_id_fkey(full_name, email), kampanya:eposta_kampanyalari(konu, tur)"
      )
      .gte("created_at", baslangic)
      .order("created_at", { ascending: false })
      .limit(SATIR_TAVANI);
    if (error) throw error;

    const satirlar = ((data ?? []) as any[]).map((r) => {
      const alici = Array.isArray(r.alici) ? r.alici[0] : r.alici;
      const kampanya = Array.isArray(r.kampanya) ? r.kampanya[0] : r.kampanya;
      return {
        id: r.id as string,
        createdAt: r.created_at as string,
        islem: r.islem as EpostaLioIslemi,
        kampanyaId: r.kampanya_id as string | null,
        ipucuAnahtari: r.ipucu_anahtari as string | null,
        model: r.model as string,
        inputTokens: Number(r.input_tokens) || 0,
        outputTokens: Number(r.output_tokens) || 0,
        maliyetUsd: Number(r.maliyet_usd) || 0,
        birim: Number(r.birim) || 0,
        basarili: r.basarili !== false,
        aliciAdi: (alici?.full_name || alici?.email || undefined) as string | undefined,
        konu: kampanya?.konu as string | undefined,
        kampanyaTur: kampanya?.tur as "toplu" | "tekil" | undefined,
      };
    });

    const islemeGore = Object.fromEntries(
      ISLEMLER.map((i) => [i, maliyetTopla(satirlar.filter((s) => s.islem === i))])
    ) as EpostaMaliyetOzeti["islemeGore"];

    const kampanyaGruplari = new Map<string, typeof satirlar>();
    for (const s of satirlar) {
      if (!s.kampanyaId) continue;
      kampanyaGruplari.set(s.kampanyaId, [...(kampanyaGruplari.get(s.kampanyaId) ?? []), s]);
    }
    const kampanyalar = [...kampanyaGruplari.entries()].map(([kampanyaId, grup]) => {
      const k = maliyetTopla(grup);
      return {
        ...k,
        kampanyaId,
        konu: grup[0].konu ?? "",
        tur: grup[0].kampanyaTur ?? ("toplu" as const),
        birimBasina: k.adet ? Number((k.birim / k.adet).toFixed(2)) : 0,
      };
    });

    const ipucuBasliklari = new Map((await this.depo.liste()).map((i) => [i.anahtar, i.baslik]));
    const ipucuGruplari = new Map<string, typeof satirlar>();
    for (const s of satirlar) {
      if (s.islem !== "ipucu" || !s.ipucuAnahtari) continue;
      ipucuGruplari.set(s.ipucuAnahtari, [...(ipucuGruplari.get(s.ipucuAnahtari) ?? []), s]);
    }
    const ipuclari = [...ipucuGruplari.entries()].map(([anahtar, grup]) => {
      const k = maliyetTopla(grup);
      return {
        ...k,
        anahtar,
        baslik: ipucuBasliklari.get(anahtar) ?? anahtar,
        birimBasina: k.adet ? Number((k.birim / k.adet).toFixed(2)) : 0,
      };
    });

    return {
      gun,
      toplam: maliyetTopla(satirlar),
      islemeGore,
      kampanyalar: kampanyalar.sort((a, b) => b.birim - a.birim),
      ipuclari: ipuclari.sort((a, b) => b.birim - a.birim),
      son: satirlar.slice(0, 200).map(({ kampanyaId: _k, ipucuAnahtari: _i, kampanyaTur: _t, ...geri }) => geri),
    };
  }
}
