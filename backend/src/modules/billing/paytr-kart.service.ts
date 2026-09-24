import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { getWebAppUrl } from "../../common/config/env";
import { describeError } from "../../common/network-errors";
import { PayTRClient, type DirektFormu, type SakliKart, type TekrarlayanCekimSonucu } from "./paytr.client";
import { siparisNumarasiCoz, siparisNumarasiUret, telefonAlani, type SiparisOneki } from "./paytr-imza";
import { paytrKullaniciBilgisi } from "./paytr-kullanici";

/**
 * PayTR Kart Saklama akışı: kartı 3D'li bir ödemeyle saklamak, saklı kartları
 * listelemek/silmek ve saklı karttan Non3D tekrarlayan çekim.
 *
 * ŞU AN YALNIZCA YÖNETİCİ DENEMESİ İÇİN KULLANILIYOR (Admin > Paketler ve
 * ödeme > PayTR kart saklama denemesi). Amaç, aboneliği yazmadan önce iki
 * belirsizliği gerçek bir kartla gidermek:
 *   1. PayTR bildirimde utoken'ı hangi alanla gönderiyor? Doküman açık değil.
 *   2. CAPI LIST, 3D ile saklanmış kart için require_cvv kaç dönüyor? 1
 *      dönerse gözetimsiz yenileme yapılamaz ve abonelik tasarımı değişir.
 *      PayTR'ye iki kez soruldu, cevap gelmedi.
 * Abonelik yazılırken bu servis olduğu gibi kullanılacak; deneme uçları o
 * zaman kaldırılır.
 *
 * SÖZ: PayTR'ye "ilk ödeme 3D, Non3D yalnızca 3D ile saklanmış karttan
 * otomatik yenilemede" dendi (2026-09-23 destek talebi). Kart saklayan form
 * bu yüzden hep 3D'li (bkz. PayTRClient.direktForm).
 */

/** Denemede çekilecek tutarın sınırları. Yazım hatasıyla 1000 TL çekilmesin. */
const DENEME_EN_AZ = 1;
const DENEME_EN_COK = 50;

export interface KartDurumu {
  testMode: boolean;
  utokenVar: boolean;
  /** Son kart bildiriminin özeti (alan adları, durum, hata) — imza yok. */
  sonBildirim: Record<string, unknown> | null;
  kartlar: SakliKart[];
  /** Kart listesi alınamadıysa sebebi. */
  kartHatasi?: string;
}

@Injectable()
export class PayTRKartService {
  private readonly logger = new Logger(PayTRKartService.name);

  constructor(
    private supabase: SupabaseService,
    private paytr: PayTRClient
  ) {}

  /** Kart saklayan 3D'li ödemenin form alanlarını üretir. */
  async kartSaklamaFormu(userId: string, userIp: string, tutar: number): Promise<DirektFormu & { testMode: boolean }> {
    this.tutarDogrula(tutar);
    const kullanici = await paytrKullaniciBilgisi(this.supabase, userId);
    const utoken = (await this.kayit(userId))?.utoken ?? null;
    const donus = `${getWebAppUrl()}/admin?sekme=paketler`;

    const form = this.paytr.direktForm({
      merchantOid: siparisNumarasiUret(userId, Date.now(), "KRT"),
      email: kullanici.email,
      tutar,
      userIp,
      userName: kullanici.ad,
      userPhone: telefonAlani(kullanici.telefon),
      userAddress: "Elektronik teslimat",
      sepet: [["Projelio kart doğrulama", tutar.toFixed(2), 1]],
      basariliUrl: `${donus}&kart=tamam`,
      basarisizUrl: `${donus}&kart=basarisiz`,
      kartSakla: true,
      utoken,
    });
    return { ...form, testMode: this.paytr.isTestMode() };
  }

  /** utoken, son bildirim ve PayTR'deki saklı kartlar. */
  async durum(userId: string): Promise<KartDurumu> {
    const kayit = await this.kayit(userId);
    const sonuc: KartDurumu = {
      testMode: this.paytr.isTestMode(),
      utokenVar: Boolean(kayit?.utoken),
      sonBildirim: kayit?.son_bildirim ?? null,
      kartlar: [],
    };
    if (kayit?.utoken) {
      try {
        sonuc.kartlar = await this.paytr.kartListesi(kayit.utoken);
      } catch (hata) {
        sonuc.kartHatasi = describeError(hata);
      }
    }
    return sonuc;
  }

  /** Saklı karttan Non3D tekrarlayan çekim denemesi. */
  async tekrarlayanCekim(
    userId: string,
    userIp: string,
    ctoken: string,
    tutar: number
  ): Promise<TekrarlayanCekimSonucu> {
    this.tutarDogrula(tutar);
    const utoken = await this.utokenGerekli(userId);
    const kullanici = await paytrKullaniciBilgisi(this.supabase, userId);
    const donus = `${getWebAppUrl()}/admin?sekme=paketler`;

    const sonuc = await this.paytr.tekrarlayanCekim({
      merchantOid: siparisNumarasiUret(userId, Date.now(), "KRY"),
      email: kullanici.email,
      tutar,
      userIp,
      userName: kullanici.ad,
      userPhone: telefonAlani(kullanici.telefon),
      userAddress: "Elektronik teslimat",
      sepet: [["Projelio yenileme denemesi", tutar.toFixed(2), 1]],
      utoken,
      ctoken,
      basariliUrl: donus,
      basarisizUrl: donus,
    });
    this.logger.log(`PayTR tekrarlayan çekim denemesi: ${sonuc.status} ${sonuc.msg ?? ""}`);
    return sonuc;
  }

  async kartSil(userId: string, ctoken: string): Promise<void> {
    const utoken = await this.utokenGerekli(userId);
    await this.paytr.kartSil(utoken, ctoken);
  }

  /**
   * Kart saklama (KRT) ve tekrarlayan çekim (KRY) bildirimleri. İmza
   * PayTROdemeService'te zaten doğrulandı.
   *
   * ASLA FIRLATMAZ: bildirim ucu "OK" dönemezse PayTR parayı aktarmıyor
   * (bkz. PayTROdemeService.bildirimIsle).
   */
  async bildirimIsle(govde: Record<string, unknown>, onek: SiparisOneki): Promise<void> {
    const merchantOid = String(govde.merchant_oid ?? "");
    const userId = siparisNumarasiCoz(merchantOid, onek);
    if (!userId) {
      this.logger.warn(`PayTR kart bildiriminde çözülemeyen sipariş numarası: ${merchantOid}`);
      return;
    }

    // utoken'ın hangi alanla geldiği dokümanda yazmıyor; en olası adlar
    // deneniyor ve TÜM alan adları özete yazılıyor ki ilk denemede görülsün.
    const gelenUtoken = [govde.utoken, govde.user_token].find((d) => typeof d === "string" && d.length > 0) as
      | string
      | undefined;

    const ozet = {
      onek,
      merchantOid,
      status: String(govde.status ?? ""),
      totalAmount: String(govde.total_amount ?? ""),
      failedReason: govde.failed_reason_msg ? String(govde.failed_reason_msg) : null,
      // Değerler DEĞİL yalnızca adlar: hash ve token'lar özete girmesin.
      alanlar: Object.keys(govde).sort(),
      utokenGeldi: Boolean(gelenUtoken),
      zaman: new Date().toISOString(),
    };
    this.logger.log(`PayTR kart bildirimi (${onek}, ${ozet.status}): alanlar ${ozet.alanlar.join(",")}`);

    try {
      const mevcut = await this.kayit(userId);
      let utoken = mevcut?.utoken ?? null;
      if (gelenUtoken && utoken && gelenUtoken !== utoken) {
        // Mevcut utoken gönderildiği hâlde farklısı geldiyse kartlar iki gruba
        // bölündü demektir. Eskisi korunur: üzerindeki kartlar kaybolmasın.
        this.logger.error(`PayTR farklı bir utoken döndü (kullanıcı ${userId}); mevcut korunuyor.`);
      } else if (gelenUtoken) {
        utoken = gelenUtoken;
      }

      const { error } = await this.supabase.client.from("paytr_kart_sahipleri").upsert(
        { user_id: userId, utoken, son_bildirim: ozet, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    } catch (hata) {
      this.logger.error(`PayTR kart bildirimi kaydedilemedi (${merchantOid}): ${describeError(hata)}`);
    }
  }

  private async kayit(
    userId: string
  ): Promise<{ utoken: string | null; son_bildirim: Record<string, unknown> | null } | null> {
    const { data, error } = await this.supabase.client
      .from("paytr_kart_sahipleri")
      .select("utoken, son_bildirim")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  private async utokenGerekli(userId: string): Promise<string> {
    const utoken = (await this.kayit(userId))?.utoken;
    if (!utoken) throw new NotFoundException("Saklı kart yok. Önce kart saklama ödemesini yap.");
    return utoken;
  }

  private tutarDogrula(tutar: number): void {
    if (!Number.isFinite(tutar) || tutar < DENEME_EN_AZ || tutar > DENEME_EN_COK) {
      // Metin sabit (şablon değil): çeviri sözlüğü anahtarı birebir eşleştiriyor.
      throw new BadRequestException("Tutar 1–50 TL arasında olmalı.");
    }
  }
}
