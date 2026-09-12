import { Injectable, Logger } from "@nestjs/common";
import type { BilgiKartiKapsami, BilgiKartiOzetBolumu, BilgiKartiOzeti, BilgiKartiOzetSatiri } from "@projelio/shared";
import { paraBirimiBazinda } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ButceHiyerarsiService } from "../budget/butce-hiyerarsi.service";

/**
 * Kartın "şirket özeti" bölümü: diğer modüllerden toplanan sayılar.
 *
 * HİÇBİRİ KAYDEDİLMİYOR. Her açılışta kaynak tablolardan okunuyor (bkz.
 * migration 107 başlığı): kopyalanmış bir sayı ilk günden bayatlar ve aynı
 * soruya iki farklı cevap veren iki ekran doğurur.
 *
 * HER SORGU AYRI AYRI KORUNUYOR. Bir tablonun yokluğu (henüz uygulanmamış bir
 * migration, kaldırılmış bir modül) ya da bir hata, kartın TAMAMINI
 * çökertmemeli: kullanıcı vergi numarasına bakmak için açtığı pencerede
 * "hesaplar tablosu yok" hatası görmemeli. Okunamayan satır sessizce
 * atlanıyor — eksik bir sayı, açılmayan bir karttan iyidir. Aynı yaklaşım
 * ai-model-settings.service.ts'te de var.
 */
@Injectable()
export class BilgiKartiOzetService {
  private readonly logger = new Logger(BilgiKartiOzetService.name);

  constructor(
    private supabase: SupabaseService,
    private butce: ButceHiyerarsiService
  ) {}

  async ozet(scopeType: BilgiKartiKapsami, scopeId: string, userId?: string): Promise<BilgiKartiOzeti> {
    const sections =
      scopeType === "organization"
        ? await this.organizasyonOzeti(scopeId, userId)
        : await this.isOzeti(scopeId, userId);

    // Boş bölüm çizilmez: başlığı olup satırı olmayan bir kutu, veri yokluğunu
    // yükleme hatası gibi okutuyordu.
    return { sections: sections.filter((b) => b.rows.length > 0) };
  }

  // ------------------------------------------------------------- Organizasyon

  private async organizasyonOzeti(organizationId: string, userId?: string): Promise<BilgiKartiOzetBolumu[]> {
    const yol = `/organizations/${organizationId}`;

    const org = await this.guvenli(async () => {
      const { data } = await this.supabase.client
        .from("organizations")
        .select("created_at, org_type, group_id, groups(name), users(full_name)")
        .eq("id", organizationId)
        .maybeSingle();
      return data;
    });

    const departmanIds = (await this.guvenli(async () => {
      const { data } = await this.supabase.client
        .from("departments")
        .select("id")
        .eq("organization_id", organizationId)
        .is("archived_at", null);
      return (data ?? []).map((d: any) => d.id as string);
    })) ?? [];

    const isIds = (await this.guvenli(async () => {
      const { data } = await this.supabase.client
        .from("jobs")
        .select("id")
        .eq("organization_id", organizationId)
        .is("archived_at", null);
      return (data ?? []).map((j: any) => j.id as string);
    })) ?? [];

    const [kadro, taseron, urun, cari, modul, dosya, hesap, gorev] = await Promise.all([
      this.kadroSayisi(departmanIds, ["manager", "employee"]),
      this.kadroSayisi(departmanIds, ["subcontractor"]),
      this.sayi("products", (q) => q.eq("organization_id", organizationId).is("archived_at", null)),
      this.sayi("party", (q) => q.eq("organization_id", organizationId).is("archived_at", null)),
      this.sayi("organization_modules", (q) => q.eq("organization_id", organizationId)),
      this.dosyaSayisi({ organizationId, departmanIds }),
      this.sayi("service_accounts", (q) => q.eq("organization_id", organizationId)),
      this.gorevSayilari({ departmanIds }),
    ]);

    return [
      {
        key: "kimlik",
        title: "Kuruluş",
        rows: this.satirlar([
          org?.created_at
            ? { key: "kurulus", label: "Projelio'da açıldı", value: new Date(org.created_at).toLocaleDateString("tr-TR") }
            : null,
          org?.org_type ? { key: "tur", label: "Tür", value: org.org_type === "isletme" ? "İşletme" : "Şirket" } : null,
          (org as any)?.users?.full_name
            ? { key: "sahip", label: "Sahibi", value: (org as any).users.full_name }
            : null,
          (org as any)?.groups?.name
            ? { key: "holding", label: "Bağlı holding", value: (org as any).groups.name, href: `/groups/${org!.group_id}` }
            : null,
        ]),
      },
      {
        key: "ekip",
        title: "Ekip",
        rows: this.satirlar([
          this.sayiSatiri("departman", "Departman", departmanIds.length, `${yol}?tab=departments`),
          this.sayiSatiri("kadro", "Çalışan", kadro, `${yol}?tab=departments`),
          this.sayiSatiri("taseron", "Taşeron", taseron),
        ]),
      },
      {
        key: "calisma",
        title: "Çalışma",
        rows: this.satirlar([
          this.sayiSatiri("is", "Bağlı iş", isIds.length),
          this.sayiSatiri("acikGorev", "Açık görev", gorev?.acik, `${yol}?tab=tasks`),
          this.sayiSatiri("bitenGorev", "Tamamlanan görev", gorev?.biten, `${yol}?tab=tasks`),
          this.sayiSatiri("urun", "Ürün / hizmet", urun, `${yol}?tab=products`),
          this.sayiSatiri("cari", "Müşteri / cari", cari),
        ]),
      },
      await this.paraBolumu("organization", organizationId, userId),
      {
        key: "kayitlar",
        title: "Kayıtlar",
        rows: this.satirlar([
          this.sayiSatiri("dosya", "Dosya", dosya, `${yol}?tab=files`),
          this.sayiSatiri("modul", "Kurulu modül", modul),
          this.sayiSatiri("hesap", "Üye olunan hesap", hesap),
        ]),
      },
    ];
  }

  // ----------------------------------------------------------------------- İş

  private async isOzeti(jobId: string, userId?: string): Promise<BilgiKartiOzetBolumu[]> {
    const yol = `/jobs/${jobId}`;

    const job = await this.guvenli(async () => {
      const { data } = await this.supabase.client
        .from("jobs")
        .select("created_at, organization_id, organizations(name), users(full_name)")
        .eq("id", jobId)
        .maybeSingle();
      return data;
    });

    const projeIds = (await this.guvenli(async () => {
      const { data } = await this.supabase.client.from("projects").select("id").eq("job_id", jobId).is("archived_at", null);
      return (data ?? []).map((p: any) => p.id as string);
    })) ?? [];

    const [ekip, cari, modul, dosya, hesap, gorev] = await Promise.all([
      this.sayi("job_members", (q) => q.eq("job_id", jobId).eq("status", "approved")),
      this.sayi("party", (q) => q.eq("job_id", jobId).is("archived_at", null)),
      this.sayi("job_modules", (q) => q.eq("job_id", jobId)),
      this.sayi("files", (q) => q.eq("job_id", jobId)),
      this.sayi("service_accounts", (q) => q.eq("job_id", jobId)),
      this.gorevSayilari({ projeIds }),
    ]);

    return [
      {
        key: "kimlik",
        title: "Kuruluş",
        rows: this.satirlar([
          job?.created_at
            ? { key: "kurulus", label: "Projelio'da açıldı", value: new Date(job.created_at).toLocaleDateString("tr-TR") }
            : null,
          (job as any)?.users?.full_name ? { key: "sahip", label: "Sahibi", value: (job as any).users.full_name } : null,
          (job as any)?.organizations?.name
            ? {
                key: "sirket",
                label: "Bağlı şirket",
                value: (job as any).organizations.name,
                href: `/organizations/${job!.organization_id}`,
              }
            : null,
        ]),
      },
      {
        key: "calisma",
        title: "Çalışma",
        rows: this.satirlar([
          this.sayiSatiri("proje", "Proje", projeIds.length),
          this.sayiSatiri("ekip", "Ekip", ekip, `${yol}?tab=team`),
          this.sayiSatiri("acikGorev", "Açık görev", gorev?.acik, `${yol}?tab=tasks`),
          this.sayiSatiri("bitenGorev", "Tamamlanan görev", gorev?.biten, `${yol}?tab=tasks`),
          this.sayiSatiri("cari", "Müşteri / cari", cari),
        ]),
      },
      await this.paraBolumu("job", jobId, userId),
      {
        key: "kayitlar",
        title: "Kayıtlar",
        rows: this.satirlar([
          this.sayiSatiri("dosya", "Dosya", dosya, `${yol}?tab=files`),
          this.sayiSatiri("modul", "Kurulu modül", modul),
          this.sayiSatiri("hesap", "Üye olunan hesap", hesap),
        ]),
      },
    ];
  }

  // ------------------------------------------------------------------- Para

  /**
   * Bütçe özeti — YETKİ BÜTÇE MODÜLÜNÜN KENDİSİNDEN geçiyor.
   *
   * Burada ikinci bir kural yazılmadı: `tumHareketler` zaten görme yetkisi
   * yoksa 403 fırlatıyor ve o durumda bölüm hiç çizilmiyor. Kopya bir kural,
   * bir gün bütçe ekranının kapalı olduğu birine kartta gelir/gider göstermek
   * demekti (bkz. butceYetkisiKarari).
   */
  private async paraBolumu(
    scopeType: "organization" | "job",
    scopeId: string,
    userId?: string
  ): Promise<BilgiKartiOzetBolumu> {
    const rows = await this.guvenli(async () => {
      const hareketler = await this.butce.tumHareketler(scopeType, scopeId, userId);
      // Kur dönüşümü YOK (bkz. CLAUDE.md / migration 104): her para birimi
      // kendi satırında toplanır.
      return paraBirimiBazinda(hareketler).map<BilgiKartiOzetSatiri>((t) => ({
        key: `para-${t.currency}`,
        label: t.currency,
        value: `Gelir ${fmtPara(t.income, t.currency)} · Gider ${fmtPara(t.expense, t.currency)} · Bakiye ${fmtPara(
          t.net,
          t.currency
        )}`,
        href: `/${scopeType === "organization" ? "organizations" : "jobs"}/${scopeId}?tab=budget`,
      }));
    });

    return { key: "para", title: "Bütçe (alt kademeler dahil)", rows: rows ?? [] };
  }

  // ---------------------------------------------------------------- Yardımcı

  private satirlar(list: (BilgiKartiOzetSatiri | null)[]): BilgiKartiOzetSatiri[] {
    return list.filter((s): s is BilgiKartiOzetSatiri => s !== null);
  }

  /** Sayı satırı. Okunamayan (undefined) değer satırı hiç üretmez; sıfır üretir. */
  private sayiSatiri(key: string, label: string, value: number | undefined, href?: string): BilgiKartiOzetSatiri | null {
    if (value === undefined) return null;
    return { key, label, value: String(value), href };
  }

  private async sayi(tablo: string, filtre: (q: any) => any): Promise<number | undefined> {
    return this.guvenli(async () => {
      const { count, error } = await filtre(this.supabase.client.from(tablo).select("id", { count: "exact", head: true }));
      if (error) throw error;
      return count ?? 0;
    });
  }

  /**
   * Kadro sayısı KİŞİ bazında.
   *
   * Satır saymak yanlış cevap verir: aynı kişi üç departmanda görevliyse üç
   * satırı var ve "12 kişiyiz" diyen şirket kartta 27 çalışan görürdü. Daveti
   * bekleyen satırların (`user_id` boş) sayılmaması da bilinçli: henüz kimse
   * işe başlamadı.
   */
  private async kadroSayisi(departmanIds: string[], roller: string[]): Promise<number | undefined> {
    if (departmanIds.length === 0) return 0;
    return this.guvenli(async () => {
      const { data, error } = await this.supabase.client
        .from("department_members")
        .select("user_id")
        .in("department_id", departmanIds)
        .in("role", roller)
        .eq("status", "approved")
        .not("user_id", "is", null);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.user_id)).size;
    });
  }

  /** Şirketin kendi dosyaları + departman dosyaları: ikisi de şirketin dosyası. */
  private async dosyaSayisi(kapsam: { organizationId: string; departmanIds: string[] }): Promise<number | undefined> {
    return this.guvenli(async () => {
      const { count: kendi } = await this.supabase.client
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", kapsam.organizationId);
      let departman = 0;
      if (kapsam.departmanIds.length > 0) {
        const { count } = await this.supabase.client
          .from("files")
          .select("id", { count: "exact", head: true })
          .in("department_id", kapsam.departmanIds);
        departman = count ?? 0;
      }
      return (kendi ?? 0) + departman;
    });
  }

  private async gorevSayilari(kapsam: {
    departmanIds?: string[];
    projeIds?: string[];
  }): Promise<{ acik: number; biten: number } | undefined> {
    const { departmanIds, projeIds } = kapsam;
    if ((departmanIds?.length ?? 0) === 0 && (projeIds?.length ?? 0) === 0) return { acik: 0, biten: 0 };

    return this.guvenli(async () => {
      const sorgu = (tamamlandi: boolean) => {
        let q = this.supabase.client.from("tasks").select("id", { count: "exact", head: true });
        q = tamamlandi ? q.eq("status", "completed") : q.neq("status", "completed");
        return departmanIds?.length ? q.in("department_id", departmanIds) : q.in("project_id", projeIds ?? []);
      };
      const [{ count: acik }, { count: biten }] = await Promise.all([sorgu(false), sorgu(true)]);
      return { acik: acik ?? 0, biten: biten ?? 0 };
    });
  }

  /**
   * Tek bir özet parçasının hatası kartı düşürmesin.
   *
   * Hata yutuluyor ama LOG'a düşüyor: sessizce kaybolan bir bölüm, sebebi hiç
   * araştırılamayan bir eksiklik demekti.
   */
  private async guvenli<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (e) {
      this.logger.debug(`Bilgi kartı özeti parçası okunamadı: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }
}

/** Özet satırındaki tutar — kart okuma ekranı, kuruş göstermeye gerek yok. */
function fmtPara(tutar: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(tutar);
  } catch {
    // Tanınmayan para birimi kodu: biçimlendirici fırlatır, sayı yine gösterilir.
    return `${Math.round(tutar).toLocaleString("tr-TR")} ${currency}`;
  }
}
