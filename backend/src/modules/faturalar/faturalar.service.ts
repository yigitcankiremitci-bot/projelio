import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ModuleRecord } from "@projelio/shared";
import { MODULE_RECORD_CONFIGS, type ModuleAttachmentsConfig } from "@projelio/shared";
import { JwtService } from "@nestjs/jwt";
import { getApiPublicUrl, getJwtSecret } from "../../common/config/env";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { FilesService, type ProjectFile } from "../files/files.service";
import { FileLinksService } from "../file-links/file-links.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { ModuleRecordsService } from "../module-records/module-records.service";
import { ButceKademeService } from "../budget/butce-kademe.service";
import type { ViewerKapsami } from "../budget/butce-erisim";
import { ayAnahtari, ayKlasorAdi, buAy, ekYolu } from "./fatura-klasoru";
import type { OkunanFatura } from "./fatura-okuma";
import { LioYardimiService } from "./lio-yardimi.service";
import { faturaVerisi, kayitKlasorAdi } from "./kasa-faturasi";
import { zipOlustur, type ZipGirdisi } from "./zip";

/** Fatura modülünün katalog anahtarı (bkz. 024_departments_and_org_structure.sql). */
export const FATURA_MODULU = "fm_fatura";

/**
 * Belge biriktiren bir modül kaydının kapsamı.
 *
 * Fatura bir ŞİRKETE ya da bir İŞE aittir (serbest çalışanın şahıs şirketi) —
 * module_records'un kendi kapsam ikilisinin aynısı.
 */
export type FaturaKapsami = { kind: "organization" | "job"; id: string };

/**
 * Arşivin toplam tavanı.
 *
 * ZIP bellekte kuruluyor (bkz. zip.ts): tavan olmadan tek bir istek, yanlışlıkla
 * video yüklenmiş bir ayda sunucunun belleğini tüketebilirdi. 200 MB, bir ayın
 * fatura ve fişleri için fazlasıyla geniş; aşılırsa kullanıcı neyin büyük
 * olduğunu görebilsin diye AÇIK hata dönüyor, sessizce kırpılmıyor —
 * eksik gönderilen bir muhasebe arşivi, hiç gönderilmemişten kötüdür.
 */
const ARSIV_TAVANI = 200 * 1024 * 1024;

/**
 * E-posta ekinin tavanı.
 *
 * Resend'in sınırı 40 MB ama o, base64'e çevrilmiş HÂLİN sınırı: base64 boyu
 * ~%33 büyütüyor, yani ham tavan pratikte ~29 MB. 20 MB seçildi çünkü birçok
 * kurumsal posta sunucusu 25 MB'ın üstünü zaten reddediyor ve reddi gönderen
 * değil ALICI yaşıyor — biz "gitti" derken muhasebeciye hiçbir şey ulaşmıyordu.
 * Üstüne çıkan arşiv ek yerine indirme bağlantısıyla gidiyor.
 */
const EPOSTA_EKI_TAVANI = 20 * 1024 * 1024;

/** Arşiv bağlantısının ömrü. Muhasebeci bir ayı kaçırmasın, sonsuza da açık kalmasın. */
export const ARSIV_BAGLANTI_OMRU = "7d";

function guvenliDosyaAdi(ad: string): string {
  // Yol ayırıcıları klasör açardı: ad yolun SON parçası olmalı.
  return (ad || "belge").replace(/[\\/]+/g, "-").trim() || "belge";
}

@Injectable()
export class FaturalarService {
  private readonly logger = new Logger(FaturalarService.name);

  constructor(
    private supabase: SupabaseService,
    private files: FilesService,
    private fileLinks: FileLinksService,
    private moduleRecords: ModuleRecordsService,
    private moduleMembers: ModuleMembersService,
    private butceKademe: ButceKademeService,
    private email: EmailService,
    private jwt: JwtService,
    private lioYardimi: LioYardimiService
  ) {}

  // =========================================================== Belge yükleme

  /**
   * Kayda belge ekler: dosya ay klasörüne iner, kayda BAĞLANIR.
   *
   * Dosya kaydın içine değil, kapsamın dosya ağacına yazılıyor. Sebebi ay sonu:
   * muhasebeciye giden şey kayıtlar değil klasördür ve klasörün Drive'da elle
   * de açılabilir olması gerekiyor (bkz. migration 112).
   */
  async ekYukle(recordId: string, file: Express.Multer.File, userId: string): Promise<ProjectFile> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");

    const record = await this.moduleRecords.findOne(recordId);
    await this.moduleRecords.assertCanManageRecord(record, userId);
    return this.belgeyiKaydaBagla(record, file, userId);
  }

  /** Yetkisi doğrulanmış bir kayda belgeyi yükler ve bağlar. */
  private async belgeyiKaydaBagla(
    record: ModuleRecord,
    file: Express.Multer.File,
    userId: string
  ): Promise<ProjectFile> {
    const ayar = this.ekAyari(record.moduleKey);
    const yol = ekYolu(ayar.rootFolder, record.data[ayar.dateKey], guvenliDosyaAdi(file.originalname));

    const dosya = record.jobId
      ? await this.files.uploadInline(record.jobId, userId, file, {}, { relativePath: yol })
      : await this.files.uploadInlineForFlat(
          { kind: "organization", id: record.organizationId! },
          userId,
          file,
          { relativePath: yol }
        );

    await this.fileLinks.link({ fileId: dosya.id }, userId, "module_record", record.id);
    return dosya;
  }

  /** Modülün belge eki tanımı. Tanımsızsa bu modülde ek yok. */
  private ekAyari(moduleKey: string): ModuleAttachmentsConfig {
    const ayar = MODULE_RECORD_CONFIGS[moduleKey]?.attachments;
    if (!ayar) throw new BadRequestException("Bu modülün kayıtlarına belge eklenemez.");
    return ayar;
  }

  // ====================================================== Kasa ile fatura bağı

  /**
   * Kasa satırının faturası.
   *
   * İki yol da buradan geçiyor: var olan bir fatura kaydıyla EŞLEŞTİRME
   * (`recordId` verilir) ve kasadan yeni fatura AÇMA (verilmez). İkisi tek
   * metotta çünkü aradaki tek fark kaydın nereden geldiği; bağın kurulması,
   * yetkisi ve tekillik kuralı aynı.
   */
  async kasaFaturasi(
    transactionId: string,
    body: { recordId?: string; departmentId?: string },
    userId: string
  ): Promise<{ recordId: string }> {
    const satir = await this.butceKademe.faturaIcinSatir(transactionId, userId);

    if (body.recordId) {
      // Eşleştirme: kayıt gerçekten bir fatura kaydı mı ve kullanıcı onu
      // yönetebiliyor mu. Yönetemeyeceği bir kaydı bağlayabilseydi, göremediği
      // bir belgeyi kendi ödemesinin kanıtı yapabilirdi.
      const record = await this.moduleRecords.findOne(body.recordId);
      if (record.moduleKey !== FATURA_MODULU) throw new BadRequestException("Bu kayıt bir fatura değil.");
      await this.moduleRecords.assertCanManageRecord(record, userId);
      await this.butceKademe.faturaBagla(transactionId, record.id, userId);
      return { recordId: record.id };
    }

    const kapsam = await this.kasaKapsami(satir);
    const record = await this.faturaKaydiAc(kapsam, satir, body.departmentId, userId);

    try {
      await this.butceKademe.faturaBagla(transactionId, record.id, userId);
    } catch (err) {
      // Bağ kurulamazsa yeni açılan kayıt ORTADA KALMASIN: kullanıcının
      // görmediği, hiçbir ödemeye bağlı olmayan boş bir fatura, ay sonu
      // arşivinde açıklanamayan bir satır demekti.
      await this.moduleRecords.remove(record.id, userId).catch(() => {});
      throw err;
    }

    return { recordId: record.id };
  }

  /** Bağı koparır. Fatura kaydı ve belgesi DURUR: belge, ödemenin eki değil kendi kaydınındır. */
  async kasaFaturasiniKaldir(transactionId: string, userId: string): Promise<{ success: true }> {
    await this.butceKademe.faturaBagla(transactionId, null, userId);
    return { success: true };
  }

  /**
   * Kasa satırının fatura kapsamı.
   *
   * Departman satırı şirketin kapsamına çıkar: fatura modülü departmanın değil
   * ŞİRKETİN modülü (module_catalog > scope = organization), departman yalnızca
   * kaydın hangi birime ait olduğunu söyler.
   *
   * Holding (group) ve kişisel kasa DIŞARIDA: ikisinin altında da fatura modülü
   * yok, kayıt açacak bir yer de yok. Sessizce şirketlerden birine yazmak
   * faturayı yanlış tüzel kişiye koyardı.
   */
  private async kasaKapsami(satir: any): Promise<FaturaKapsami> {
    if (satir.organization_id) return { kind: "organization", id: satir.organization_id };
    if (satir.job_id) return { kind: "job", id: satir.job_id };
    if (satir.department_id) {
      const { data } = await this.supabase.client
        .from("departments")
        .select("organization_id")
        .eq("id", satir.department_id)
        .maybeSingle();
      if (!data?.organization_id) throw new NotFoundException("Departmanın şirketi bulunamadı");
      return { kind: "organization", id: data.organization_id };
    }
    throw new BadRequestException(
      "Bu kasa kaydına fatura eklenemez: fatura bir şirkete ya da işe ait olmalı. " +
        "Kaydı şirket veya departman kasasına girip yeniden deneyin."
    );
  }

  /** Kasa satırından fatura kaydı. Alanlar SATIRDAN kopyalanır; kullanıcı ikinci kez yazmasın. */
  private async faturaKaydiAc(
    kapsam: FaturaKapsami,
    satir: any,
    departmentId: string | undefined,
    userId: string
  ): Promise<ModuleRecord> {
    const data = faturaVerisi(satir) as unknown as Record<string, unknown>;

    if (kapsam.kind === "job") {
      return this.moduleRecords.createForJob(kapsam.id, { moduleKey: FATURA_MODULU, data }, userId);
    }
    return this.moduleRecords.create(
      kapsam.id,
      { moduleKey: FATURA_MODULU, departmentId: departmentId || satir.department_id || undefined, data },
      userId
    );
  }

  // ============================================================== Ay arşivi

  /** Bir ayın faturaları: kayıt + ona bağlı belgeler. */
  async ayinKayitlari(kapsam: FaturaKapsami, ay: string, userId: string): Promise<ModuleRecord[]> {
    const ayAnahtar = ayAnahtari(`${ay}-01`) ?? undefined;
    if (!ayAnahtar) throw new BadRequestException("Ay 'YYYY-MM' biçiminde olmalı.");

    const kayitlar =
      kapsam.kind === "organization"
        ? await this.moduleRecords.findByOrganization(kapsam.id, FATURA_MODULU, userId)
        : await this.isinKayitlari(kapsam.id, userId);

    const ayar = this.ekAyari(FATURA_MODULU);
    return kayitlar.filter((k) => ayAnahtari(k.data[ayar.dateKey]) === ayAnahtar);
  }

  private async isinKayitlari(jobId: string, userId: string): Promise<ModuleRecord[]> {
    const access = await this.moduleMembers.resolveJobAccess(jobId, FATURA_MODULU, userId);
    if (!access.canRead) throw new ForbiddenException("Bu işin faturalarını görme yetkin yok");
    return this.moduleRecords.findByJob(jobId, FATURA_MODULU);
  }

  /**
   * Ayın bütün belgelerini tek ZIP'te toplar.
   *
   * Kaynağı KAYITLARIN BAĞLI DOSYALARI, Drive klasörünün içeriği değil: klasöre
   * elle atılmış alakasız bir dosya muhasebeciye gitmesin ve klasörü sonradan
   * yeniden adlandıran biri arşivi boşaltmasın diye.
   */
  async arsiv(
    kapsam: FaturaKapsami,
    ay: string,
    userId: string
  ): Promise<{ dosyaAdi: string; icerik: Buffer; belgeSayisi: number; kayitSayisi: number; eksikKayitlar: string[] }> {
    const kayitlar = await this.ayinKayitlari(kapsam, ay, userId);

    const girdiler: ZipGirdisi[] = [];
    const eksikKayitlar: string[] = [];
    let toplam = 0;

    for (const kayit of kayitlar) {
      const { files } = await this.fileLinks.listForTarget("module_record", kayit.id, userId);
      if (files.length === 0) {
        eksikKayitlar.push(kayitKlasorAdi(kayit, buAy()));
        continue;
      }
      for (const dosya of files) {
        const icerik = await this.belgeIcerigi(dosya, userId);
        if (!icerik) continue;
        // Tavan İNDİRİLEN boyla sayılıyor, künyedeki `sizeBytes` ile değil:
        // o alan boş olabiliyor (eski kayıtlar, bazı sağlayıcı yanıtları) ve
        // boş sayılan her dosya tavanı fiilen devre dışı bırakırdı.
        toplam += icerik.length;
        if (toplam > ARSIV_TAVANI) {
          throw new BadRequestException(
            "Bu ayın belgeleri tek arşive sığmayacak kadar büyük (200 MB üstü). " +
              "Belgeleri Drive'daki ay klasöründen indirebilirsiniz."
          );
        }
        girdiler.push({ ad: `${kayitKlasorAdi(kayit, buAy())}/${dosya.name}`, icerik });
      }
    }

    return {
      dosyaAdi: `Faturalar ${ayKlasorAdi(ayAnahtari(`${ay}-01`)!)}.zip`,
      icerik: zipOlustur(girdiler),
      belgeSayisi: girdiler.length,
      kayitSayisi: kayitlar.length,
      eksikKayitlar,
    };
  }

  /**
   * Tek bir belgenin içeriği.
   *
   * İndirilemeyen belge arşivi DÜŞÜRMEZ, atlanır: bulutta elle silinmiş tek bir
   * dosya yüzünden ay sonu gönderiminin tamamen durması, en çok ihtiyaç duyulan
   * anda ürünü kullanılamaz yapardı. Atlananlar log'a yazılıyor.
   */
  private async belgeIcerigi(dosya: ProjectFile, userId: string): Promise<Buffer | null> {
    try {
      const { response } = await this.files.openDownload(dosya.id, userId);
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Fatura eki arşive alınamadı (file=${dosya.id}): ${String(err)}`);
      return null;
    }
  }


  /** Şirketin muhasebecisi (bkz. info_cards.accountant_email, migration 112). */
  async muhasebeciAdresi(kapsam: FaturaKapsami): Promise<string | undefined> {
    const sutun = kapsam.kind === "organization" ? "organization_id" : "job_id";
    const { data } = await this.supabase.client
      .from("info_cards")
      .select("accountant_email")
      .eq(sutun, kapsam.id)
      .maybeSingle();
    return data?.accountant_email || undefined;
  }

  // ================================================== Lio yardımı ile giriş

  /**
   * Bırakılan belgeyi Lio okur, kaydı ve kasa satırını o açar.
   *
   * SIRA ÖNEMLİ ve şöyle: önce oku, sonra kayıt, sonra belge, en sonda kasa.
   *   * Okuma önce, çünkü ay klasörü FATURA TARİHİNDEN çıkıyor — tarihi
   *     bilmeden dosyayı doğru klasöre koyamayız (bkz. migration 112).
   *   * Kasa en sonda ve HATASI İŞİ DÜŞÜRMÜYOR: modüle yazma yetkisi olan
   *     herkesin defteri yönetme yetkisi olmayabiliyor. Orada patlasaydı
   *     okunmuş belge ve harcanmış kredi birlikte çöpe giderdi; oysa kayıt ve
   *     belge zaten yerinde duruyor, eksik olan tek şey defter satırı.
   */
  async lioIleGir(
    kapsam: FaturaKapsami,
    file: Express.Multer.File,
    departmentId: string | undefined,
    userId: string
  ): Promise<{
    recordId: string;
    fatura: OkunanFatura;
    kredi: number;
    kasa: { yazildi: boolean; hata?: string };
  }> {
    if (!(await this.lioYardimi.acikMi(kapsam, FATURA_MODULU))) {
      throw new BadRequestException("Bu modülde Lio yardımı kapalı.");
    }

    const { fatura, kredi } = await this.lioYardimi.faturayiOku(file, userId);

    const data: Record<string, unknown> = {
      direction: fatura.direction,
      amount: fatura.amount,
      currency: fatura.currency,
      issueDate: fatura.issueDate,
      // Belge elimizde ve tutar okundu: fatura kesilmiş. Ödenip ödenmediğini
      // belge söylemiyor, bu yüzden "bekliyor" — kasaya yazılan satır paranın
      // hareketini ayrıca gösteriyor.
      status: "pending",
    };
    if (fatura.invoiceNo) data.invoiceNo = fatura.invoiceNo;
    if (fatura.counterpartyName) data.counterpartyName = fatura.counterpartyName;
    if (fatura.description) data.notes = fatura.description;

    const record =
      kapsam.kind === "job"
        ? await this.moduleRecords.createForJob(kapsam.id, { moduleKey: FATURA_MODULU, data }, userId)
        : await this.moduleRecords.create(kapsam.id, { moduleKey: FATURA_MODULU, departmentId, data }, userId);

    await this.belgeyiKaydaBagla(record, file, userId);

    return { recordId: record.id, fatura, kredi, kasa: await this.kasayaYaz(kapsam, departmentId, fatura, record.id, userId) };
  }

  /**
   * Okunan faturanın defter satırı.
   *
   * Departman biliniyorsa DEPARTMANIN defterine yazılıyor, şirketin değil:
   * kademeler birbirini topluyor (bkz. CLAUDE.md > Bütçe), yani satır şirkette
   * yine görünüyor ama hangi birimin gideri olduğu da kayboluyor değil.
   */
  private async kasayaYaz(
    kapsam: FaturaKapsami,
    departmentId: string | undefined,
    fatura: OkunanFatura,
    recordId: string,
    userId: string
  ): Promise<{ yazildi: boolean; hata?: string }> {
    const kademe: { tur: ViewerKapsami; id: string } =
      kapsam.kind === "job"
        ? { tur: "job", id: kapsam.id }
        : departmentId
          ? { tur: "department", id: departmentId }
          : { tur: "organization", id: kapsam.id };

    try {
      const satir = await this.butceKademe.ekle(
        kademe.tur,
        kademe.id,
        {
          // Kesilen fatura para GİRİŞİ, alınan fatura ÇIKIŞ.
          type: fatura.direction === "issued" ? "income" : "expense",
          amount: fatura.amount,
          currency: fatura.currency,
          category: fatura.category,
          description: fatura.description ?? fatura.counterpartyName,
          occurredAt: fatura.issueDate,
        },
        userId
      );
      await this.butceKademe.faturaBagla(satir.id, recordId, userId);
      return { yazildi: true };
    } catch (err: any) {
      // Defter yetkisi modül yetkisinden dar olabiliyor. Kayıt ve belge yerinde;
      // kullanıcıya eksik olanın SADECE defter satırı olduğu söyleniyor.
      this.logger.warn(`Fatura kasaya yazılamadı (record=${recordId}): ${String(err?.message ?? err)}`);
      return { yazildi: false, hata: err?.message ?? "Kasa kaydı açılamadı." };
    }
  }

  // ======================================================== Muhasebeciye gönderim

  /**
   * Ayın arşivini muhasebeciye yollar.
   *
   * Arşiv eke sığıyorsa EK olarak gider; sığmıyorsa süreli bir indirme
   * bağlantısıyla. "Her zaman ek" seçilseydi yoğun bir ayda gönderim
   * sağlayıcıda ya da alıcının posta sunucusunda reddedilir ve bunu gönderen
   * hiç öğrenmezdi; "her zaman bağlantı" ise muhasebecinin beklediği eki
   * ortadan kaldırırdı (bkz. EPOSTA_EKI_TAVANI).
   */
  async muhasebeciyeGonder(
    kapsam: FaturaKapsami,
    ay: string,
    alici: string,
    userId: string,
    gonderenAdresi?: string
  ): Promise<{ gonderildi: true; ekOlarak: boolean; belgeSayisi: number; eksikKayitlar: string[] }> {
    const hedef = (alici || "").trim() || (await this.muhasebeciAdresi(kapsam));
    if (!hedef) {
      throw new BadRequestException(
        "Muhasebeci e-posta adresi yok. Bilgi kartına yazabilir ya da bu gönderim için elle girebilirsiniz."
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hedef)) throw new BadRequestException("E-posta adresi geçersiz.");

    const arsiv = await this.arsiv(kapsam, ay, userId);
    if (arsiv.belgeSayisi === 0) {
      // Boş bir arşiv göndermek, muhasebecide "bu ay fatura yokmuş" izlenimi
      // bırakırdı — oysa çoğu zaman belgeler henüz yüklenmemiş oluyor.
      throw new BadRequestException("Bu ayda belgesi yüklenmiş fatura yok; gönderilecek bir şey çıkmadı.");
    }

    const ekeSigar = arsiv.icerik.length <= EPOSTA_EKI_TAVANI;
    const donem = ayKlasorAdi(ayAnahtari(`${ay}-01`)!);

    const satirlar = [
      `${donem} dönemine ait ${arsiv.belgeSayisi} belge, ${arsiv.kayitSayisi} fatura kaydı.`,
      ekeSigar
        ? "Belgeler ekteki ZIP dosyasında; her fatura kendi klasöründe."
        : "Arşiv e-posta ekine sığmayacak kadar büyük olduğu için aşağıdaki bağlantıyla gönderiliyor. Bağlantı 7 gün geçerli.",
    ];
    if (arsiv.eksikKayitlar.length) {
      // Muhasebecinin "eksik var mı" diye sormasını beklemek yerine biz
      // söylüyoruz: eksik belge ay kapanışında geriye dönük aranıyor.
      satirlar.push(
        `Belgesi yüklenmemiş ${arsiv.eksikKayitlar.length} fatura kaydı var: ${arsiv.eksikKayitlar
          .slice(0, 10)
          .join(", ")}${arsiv.eksikKayitlar.length > 10 ? "…" : ""}`
      );
    }

    const gonderildi = await this.email.sendBelgeArsivi({
      to: hedef,
      replyTo: gonderenAdresi,
      konu: `Fatura arşivi — ${donem}`,
      baslik: `Fatura arşivi · ${donem}`,
      govdeSatirlari: satirlar,
      ek: ekeSigar ? { filename: arsiv.dosyaAdi, content: arsiv.icerik } : undefined,
      indirmeUrl: ekeSigar ? undefined : this.arsivBaglantisi(kapsam, ay, userId),
    });

    if (!gonderildi) {
      throw new BadRequestException(
        "E-posta gönderilemedi. Sunucu e-posta ayarları eksik olabilir; arşivi indirip elle gönderebilirsiniz."
      );
    }

    return {
      gonderildi: true,
      ekOlarak: ekeSigar,
      belgeSayisi: arsiv.belgeSayisi,
      eksikKayitlar: arsiv.eksikKayitlar,
    };
  }

  /**
   * Süreli indirme bağlantısı.
   *
   * Jeton GÖNDERENİN kimliğini taşıyor (`sub`): arşiv indirilirken yeniden
   * onun yetkisiyle kuruluyor. Böylece bağlantı, gönderenin o an görebildiği
   * belgelerden fazlasını hiçbir zaman açamaz — yetkisi sonradan daralırsa
   * bağlantı da daralır (dosyaların kendi erişim jetonlarıyla aynı desen,
   * bkz. files.controller.ts).
   */
  private arsivBaglantisi(kapsam: FaturaKapsami, ay: string, userId: string): string {
    const jeton = this.jwt.sign(
      { typ: "invoice_archive", scopeKind: kapsam.kind, scopeId: kapsam.id, month: ay, sub: userId },
      { secret: getJwtSecret(), expiresIn: ARSIV_BAGLANTI_OMRU }
    );
    return `${getApiPublicUrl()}/invoices/archive/download?t=${encodeURIComponent(jeton)}`;
  }

  /** Bağlantıdaki jetonu doğrular. Süresi dolmuş/oynanmış jeton burada durur. */
  arsivJetonunuCoz(jeton: string): { kapsam: FaturaKapsami; ay: string; userId: string } {
    let claims: any;
    try {
      claims = this.jwt.verify(jeton, { secret: getJwtSecret() });
    } catch {
      throw new ForbiddenException("Bağlantı geçersiz ya da süresi dolmuş.");
    }
    if (claims?.typ !== "invoice_archive") throw new ForbiddenException("Bağlantı geçersiz.");
    return {
      kapsam: { kind: claims.scopeKind === "job" ? "job" : "organization", id: String(claims.scopeId) },
      ay: String(claims.month),
      userId: String(claims.sub),
    };
  }
}
