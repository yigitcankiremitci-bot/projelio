import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  ADMIN_MESAJ_SINIRI,
  adminMesajiniDogrula,
  gercekEpostaMi,
  type AdminMesajGirdisi,
  type AdminMesajSonucu,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EmailService } from "../auth/email.service";
import { anonimlestirilmisMi } from "../users/account-deletion.service";
import { istekDili } from "../../common/i18n";
import { getWebAppUrl } from "../../common/config/env";
import { adminMesajEpostasiOlustur } from "./admin-mesaj-eposta";

/**
 * Yöneticinin bir ya da birden çok kullanıcıya bildirim ve/veya e-posta göndermesi.
 *
 * KİME GİTMEZ:
 *   · Kalıcı silinmiş (anonimleştirilmiş) hesap — hiçbir kanaldan. Kişi gitti.
 *   · Demo kadrosu ve gerçek olmayan adresler — e-posta. `.test` alan adına
 *     gönderim sağlayıcıda geri döner ve gönderen itibarını düşürür. Uygulama
 *     içi bildirim demo hesabına gidebilir (zararsız).
 *
 * BİLDİRİM KULLANICININ E-POSTA ÖZETİNE DE GİREBİLİR: okunmamış bildirimler
 * günlük özete ekleniyor (notification-email.processor.ts). İki kanal birden
 * seçilirse kişi aynı mesajı bir de özette görebilir; bu bilinçli olarak
 * engellenmedi — özet "kaçırdıklarını" topluyor ve okunmamış bir yönetici
 * mesajı tam da oraya ait.
 *
 * Gönderim istek İÇİNDE yapılıyor ve sonuç sayılarla dönüyor: yönetici "kaçına
 * gitti" sorusunun cevabını görmeli. Bu yüzden alıcı tavanı var
 * (ADMIN_MESAJ_SINIRI.alici) — e-postalar sınırlı eşzamanlılıkla gidiyor.
 */
const EPOSTA_ESZAMANLILIK = 5;

@Injectable()
export class AdminMesajService {
  private readonly logger = new Logger(AdminMesajService.name);

  constructor(
    private supabase: SupabaseService,
    private notifications: NotificationsService,
    private email: EmailService
  ) {}

  async gonder(adminId: string, userIds: unknown, girdi: Partial<AdminMesajGirdisi>): Promise<AdminMesajSonucu> {
    const dogrulama = adminMesajiniDogrula(girdi);
    if ("hata" in dogrulama) throw new BadRequestException(dogrulama.hata);
    const mesaj = dogrulama.temiz;

    const idler = Array.isArray(userIds) ? [...new Set(userIds.filter((x): x is string => typeof x === "string"))] : [];
    if (idler.length === 0) throw new BadRequestException("En az bir alıcı seç.");
    if (idler.length > ADMIN_MESAJ_SINIRI.alici) {
      throw new BadRequestException("Tek seferde en fazla 200 kişiye mesaj gönderilebilir.");
    }
    if (idler.some((id) => !UUID.test(id))) throw new BadRequestException("Geçersiz alıcı.");

    const { data, error } = await this.supabase.client
      .from("users")
      .select("id, full_name, email, locale")
      .in("id", idler);
    if (error) throw error;
    const alicilar = (data ?? []) as { id: string; full_name: string; email: string; locale: string | null }[];
    if (alicilar.length === 0) throw new BadRequestException("Kullanıcı bulunamadı.");

    const sonuc: AdminMesajSonucu = {
      bildirim: { gonderilen: 0, basarisiz: 0 },
      eposta: { gonderilen: 0, basarisiz: 0, atlanan: 0 },
      atlananSilinmis: 0,
    };
    const kisiBasina = new Map<string, { bildirim?: boolean; eposta?: boolean | "atlandi" }>();
    const canlilar = alicilar.filter((a) => {
      if (anonimlestirilmisMi(a.email)) {
        sonuc.atlananSilinmis++;
        return false;
      }
      kisiBasina.set(a.id, {});
      return true;
    });

    if (mesaj.bildirim) {
      // Bildirim veritabanına yazılıyor, soket/push/WhatsApp arka planda —
      // eşzamanlılık sınırına gerek yok, ama sonucu saymak için bekleniyor.
      await Promise.all(
        canlilar.map(async (a) => {
          try {
            await this.notifications.notifyUser(a.id, "admin_message", mesaj.baslik, mesaj.mesaj, mesaj.link);
            sonuc.bildirim.gonderilen++;
            kisiBasina.get(a.id)!.bildirim = true;
          } catch (e) {
            sonuc.bildirim.basarisiz++;
            kisiBasina.get(a.id)!.bildirim = false;
            this.logger.warn(`Yönetici bildirimi gönderilemedi (${a.id}): ${(e as Error).message}`);
          }
        })
      );
    }

    if (mesaj.eposta) {
      const webUrl = getWebAppUrl();
      const kuyruk = canlilar.filter((a) => {
        if (gercekEpostaMi(a.email)) return true;
        sonuc.eposta.atlanan++;
        kisiBasina.get(a.id)!.eposta = "atlandi";
        return false;
      });
      await sinirliParalel(kuyruk, EPOSTA_ESZAMANLILIK, async (a) => {
        const mail = adminMesajEpostasiOlustur({
          locale: istekDili(a.locale),
          baslik: mesaj.baslik,
          mesaj: mesaj.mesaj,
          link: mesaj.link,
          webUrl,
          ad: a.full_name,
        });
        // sendPrepared hata fırlatmaz; sağlayıcı yoksa ya da ret dönerse false.
        const tamam = await this.email.sendPrepared(a.email, mail);
        if (tamam) sonuc.eposta.gonderilen++;
        else sonuc.eposta.basarisiz++;
        kisiBasina.get(a.id)!.eposta = tamam;
      });
    }

    // İşlem kaydı kişi başına: detay ekranındaki geçmişte her kullanıcı kendi
    // satırını görsün. Mesajın tamamı kayda girmiyor (kişisel veri taşıyabilir,
    // kayıt kalıcı silmede de duruyor); başlık ve kanal sonucu yeterli iz.
    const kayitlar = canlilar.map((a) => ({
      target_user_id: a.id,
      admin_user_id: adminId,
      action: "mesaj_gonder",
      detail: {
        baslik: mesaj.baslik,
        aliciSayisi: canlilar.length,
        ...kisiBasina.get(a.id),
      },
    }));
    if (kayitlar.length) {
      const { error: kayitHatasi } = await this.supabase.client.from("admin_user_actions").insert(kayitlar);
      if (kayitHatasi) this.logger.error(`Yönetici mesajı kaydedilemedi: ${kayitHatasi.message}`);
    }
    this.logger.log(
      `Yönetici mesajı: "${mesaj.baslik}" · ${canlilar.length} alıcı · bildirim ${sonuc.bildirim.gonderilen} · e-posta ${sonuc.eposta.gonderilen} · yönetici ${adminId}`
    );
    return sonuc;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sinirliParalel<T>(liste: T[], sinir: number, is: (x: T) => Promise<void>): Promise<void> {
  let sira = 0;
  const calisanlar = Array.from({ length: Math.min(sinir, liste.length) }, async () => {
    while (sira < liste.length) {
      const oge = liste[sira++];
      await is(oge);
    }
  });
  await Promise.all(calisanlar);
}
