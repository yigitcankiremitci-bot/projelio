import { ForbiddenException, Global, Injectable, Module, NotFoundException } from "@nestjs/common";
import { koltukDurumu, koltukEklenebilirMi, sirketKoltukSiniri, type KoltukDurumu } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { abonelikDonemiGecerli, HAK_VEREN_DURUMLAR } from "../../modules/billing/abonelik-hakki";
import { requireUuid } from "../validation/input";
import { isSubcontractorAccount } from "../access/subcontractor";
import { hataMetni } from "../i18n/index";

/**
 * Departman kadrosunda koltuk sayılan durumlar. 'leave_pending' (son yöneticinin
 * ayrılma isteği onay bekliyor) hâlâ şirkette: çıkmadan yerini başkasına vermek
 * sınırı bir kişi aşmak olurdu.
 */
const SAYILAN_KADRO = ["approved", "leave_pending"];

/**
 * Şirketin kişi hakkı (kurallar: shared koltukHakki.ts).
 *
 * Bir kullanıcı şirkete İKİ yoldan bağlanır — doğrudan üyelik
 * (organization_members) ve departman kadrosu (department_members) — ve sahip
 * de bir koltuktur. Sayım üçünün BİRLEŞİMİ: iki departmanda olan kişi bir kez
 * sayılır.
 *
 * Global: üye ekleyen her yol (departman kadrosu, işe alım, ekip hesapları)
 * kontrolü kendi modülünde, BillingModule'ü içe aktarmadan çağırabilsin.
 */
@Injectable()
export class KoltukService {
  constructor(private supabase: SupabaseService) {}

  async durum(organizationId: string): Promise<KoltukDurumu> {
    const { sinir, kisiler } = await this.sinirVeKisiler(organizationId);
    return koltukDurumu(sinir, kisiler.size);
  }

  /**
   * Kişiyi şirkete eklemeden ÖNCE çağrılır; yer yoksa fırlatır.
   *
   * userId null = henüz hesabı olmayan kişi (ekip hesabı açılmadan önce).
   * `taseronRolu`: kişi şirkete yalnızca taşeron rolüyle giriyorsa yer harcamaz.
   */
  async kisiEklenebilir(organizationId: string, userId: string | null, secenek: { taseronRolu?: boolean } = {}): Promise<void> {
    const { sinir, kisiler } = await this.sinirVeKisiler(organizationId);
    const karar = koltukEklenebilirMi(koltukDurumu(sinir, kisiler.size), {
      zatenSayiliyor: userId !== null && kisiler.has(userId),
      taseron: Boolean(secenek.taseronRolu) || (userId !== null && (await this.taseronMu(userId))),
    });
    if ("metin" in karar) throw new ForbiddenException(hataMetni(karar.metin, karar.params));
  }

  /** Departmanın bağlı olduğu şirket üzerinden aynı kontrol. */
  async departmanaEklenebilir(departmentId: string, userId: string, secenek: { taseronRolu?: boolean } = {}): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", departmentId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.organization_id) return; // Şirketsiz departman yok ama varsa sınır da yok.
    await this.kisiEklenebilir(data.organization_id, userId, secenek);
  }

  private async sinirVeKisiler(organizationId: string): Promise<{ sinir: number; kisiler: Set<string> }> {
    // Kimlik aşağıda filtre METNİNE gömülüyor (bkz. requireUuid).
    requireUuid(organizationId, "Organizasyon kimliği");
    const { data: org, error: orgHatasi } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgHatasi) throw orgHatasi;
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");

    const [abonelikler, uyeler, departmanlar] = await Promise.all([
      this.supabase.client
        .from("subscriptions")
        .select("plan_key, koltuk, status, source, current_period_end")
        .or(`and(scope.eq.organization,organization_id.eq.${organizationId}),and(scope.eq.user,user_id.eq.${org.owner_id})`)
        .in("status", HAK_VEREN_DURUMLAR),
      this.supabase.client
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("status", "approved"),
      this.supabase.client.from("departments").select("id").eq("organization_id", organizationId),
    ]);
    for (const sonuc of [abonelikler, uyeler, departmanlar]) if (sonuc.error) throw sonuc.error;

    const depIds = (departmanlar.data ?? []).map((d: any) => d.id);
    const { data: kadro, error: kadroHatasi } = depIds.length
      ? await this.supabase.client
          .from("department_members")
          .select("user_id")
          .in("department_id", depIds)
          .in("status", SAYILAN_KADRO)
          // Kadroda taşeron rolüyle duran kişi de şirketin içinden değil.
          .neq("role", "subcontractor")
      : { data: [], error: null };
    if (kadroHatasi) throw kadroHatasi;

    const adaylar = new Set<string>([
      org.owner_id,
      ...(uyeler.data ?? []).map((u: any) => u.user_id),
      ...(kadro ?? []).map((k: any) => k.user_id),
    ].filter(Boolean));

    // Taşeron koltuk sayılmaz.
    const { data: taseronlar, error: tipHatasi } = adaylar.size
      ? await this.supabase.client.from("users").select("id").in("id", [...adaylar]).eq("account_type", "subcontractor")
      : { data: [], error: null };
    if (tipHatasi) throw tipHatasi;
    for (const t of taseronlar ?? []) adaylar.delete((t as any).id);

    const gecerli = (abonelikler.data ?? []).filter((a: any) =>
      abonelikDonemiGecerli({ status: a.status, source: a.source, currentPeriodEnd: a.current_period_end })
    );
    const sinir = sirketKoltukSiniri(gecerli.map((a: any) => ({ planKey: a.plan_key, koltuk: a.koltuk })));
    return { sinir, kisiler: adaylar };
  }

  private async taseronMu(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client.from("users").select("account_type").eq("id", userId).maybeSingle();
    if (error) throw error;
    return isSubcontractorAccount(data?.account_type ?? null);
  }
}

@Global()
@Module({
  providers: [KoltukService],
  exports: [KoltukService],
})
export class KoltukModule {}
