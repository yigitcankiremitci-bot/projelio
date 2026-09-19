import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { gercekEpostaMi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { demoEpostasiMi } from "../../common/demo-hesap";
import { istekDili } from "../../common/i18n";
import { yerelAn } from "../notifications/notification-email.zaman";
import { EmailVerificationService } from "./email-verification.service";
import { dogrulamaHatirlatmasiGonderilsinMi } from "./dogrulama-hatirlatma";

/**
 * Adresini doğrulamamış kişilere günde bir "hesabını onayla" e-postası
 * (bkz. migration 119, dogrulama-hatirlatma.ts).
 *
 * Her hatırlatma YENİ bir doğrulama bağlantısı üretiyor (sendVerification):
 * bağlantılar 24 saat geçerli, dünkü e-postadaki bağlantı çoktan ölmüş olurdu.
 *
 * Saat Türkiye saati: doğrulanmamış hesabın saat dilimi tercihi henüz yok
 * (ayarlara giremiyor). 30 dakikalık ızgara, sunucu yeniden başlasa bile o gün
 * atlanmasın diye — kural "saat 10'dan SONRA ve son hatırlatmadan 20 saat sonra".
 */

const TUR_BASINA_EPOSTA = 40;
const GONDERIM_ARASI_MS = 600;
const KULLANICI_TAVANI = 2000;

@Injectable()
export class DogrulamaHatirlatmaProcessor {
  private readonly logger = new Logger(DogrulamaHatirlatmaProcessor.name);
  private calisiyor = false;

  constructor(
    private supabase: SupabaseService,
    private dogrulama: EmailVerificationService
  ) {}

  @Cron("15,45 * * * *")
  async tur() {
    if (this.calisiyor) return;
    this.calisiyor = true;
    const simdi = new Date();
    try {
      const yerelSaat = yerelAn(simdi, "Europe/Istanbul").saat;
      const { data, error } = await this.supabase.client
        .from("users")
        .select("id, email, locale, created_at, dogrulama_hatirlatma_sayisi, son_dogrulama_hatirlatma_at")
        .is("email_verified_at", null)
        .is("deleted_at", null)
        .limit(KULLANICI_TAVANI);
      if (error) throw error;

      let gonderilen = 0;
      for (const u of (data ?? []) as any[]) {
        if (!gercekEpostaMi(u.email) || demoEpostasiMi(u.email)) continue;
        const gonder = dogrulamaHatirlatmasiGonderilsinMi({
          simdi,
          hesapAcilis: zaman(u.created_at),
          sonHatirlatma: zaman(u.son_dogrulama_hatirlatma_at),
          gonderilen: Number(u.dogrulama_hatirlatma_sayisi) || 0,
          yerelSaat,
        });
        if (!gonder) continue;
        if (gonderilen >= TUR_BASINA_EPOSTA) break;

        let gitti = false;
        try {
          gitti = await this.dogrulama.sendVerification(u.id, u.email, istekDili(u.locale));
        } catch (err) {
          this.logger.warn(`Doğrulama hatırlatması gönderilemedi (${u.id}): ${err instanceof Error ? err.message : err}`);
        }
        // Sayaç yalnızca gönderim başarılıysa ilerler; başarısızsa bir
        // sonraki turda yeniden denenir.
        if (!gitti) continue;
        const { error: damgaHatasi } = await this.supabase.client
          .from("users")
          .update({
            dogrulama_hatirlatma_sayisi: (Number(u.dogrulama_hatirlatma_sayisi) || 0) + 1,
            son_dogrulama_hatirlatma_at: simdi.toISOString(),
          })
          .eq("id", u.id);
        if (damgaHatasi) this.logger.warn(`Doğrulama hatırlatması damgalanamadı (${u.id}): ${damgaHatasi.message}`);
        gonderilen += 1;
        await new Promise((r) => setTimeout(r, GONDERIM_ARASI_MS));
      }
      if (gonderilen) this.logger.log(`Doğrulama hatırlatması: ${gonderilen} kişiye gönderildi.`);
    } catch (err) {
      this.logger.error(`Doğrulama hatırlatma turu düştü: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.calisiyor = false;
    }
  }
}

/** Saat dilimsiz `timestamp` UTC olarak okunur (bkz. ipucu-eposta.processor.ts). */
function zaman(deger: unknown): Date | null {
  if (typeof deger !== "string" || !deger) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(deger) ? deger : `${deger}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
