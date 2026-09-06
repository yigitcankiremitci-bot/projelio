import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { CloudStorageService } from "./cloud-storage.service";
import type { StorageProvider } from "./cloud-storage.types";

export interface OrganizationStorage {
  organizationId: string;
  provider: StorageProvider;
  accountId: string;
  /** Şirketin kök klasörü. Seçim yapıldığında boş olabilir; ilk dosyada açılır. */
  folderId?: string;
  folderWebViewLink?: string;
  setBy?: string;
}

function mapRow(row: any): OrganizationStorage {
  const provider: StorageProvider = row.storage_provider === "microsoft" ? "microsoft" : "google";
  return {
    organizationId: row.organization_id,
    provider,
    accountId: provider === "google" ? row.google_account_id : row.microsoft_account_id,
    folderId: row.drive_folder_id ?? undefined,
    folderWebViewLink: row.folder_web_view_link ?? undefined,
    setBy: row.set_by ?? undefined,
  };
}

/**
 * "Bu şirketin dosyaları hangi bulut hesabında duruyor?"
 *
 * NEDEN AYRI BİR SEÇİM
 * --------------------
 * Serbest çalışan olarak başlayıp sonra şirket kuran kullanıcı, şirketin
 * dosyalarını kişisel Drive'ından ayırmak istiyor — çoğu zaman bu ayrım
 * hukuki/muhasebi bir zorunluluk. Eskiden depo hesabı ilk dosya yüklenirken
 * "organizasyon sahibinin hesabı" diye SESSİZCE seçiliyordu ve bir daha
 * değişmiyordu; kullanıcıya sorulan bir yer yoktu.
 *
 * DEVRALMA
 * --------
 * Şirketin departmanları ve işleri bu seçimi devralır. Ama yalnızca DEPO
 * KURULMAMIŞ olanlar: `department_storage`/`job_storage` satırı zaten varsa
 * dosyalar o hesapta duruyordur ve hesabı değiştirmek onları erişilemez
 * kılardı. Yani seçimi değiştirmek geçmişi taşımaz, bundan sonrasını yönlendirir
 * — arayüz bunu açıkça yazmak zorunda.
 */
@Injectable()
export class OrganizationStorageService {
  constructor(
    private supabase: SupabaseService,
    private cloudStorage: CloudStorageService
  ) {}

  async find(organizationId: string): Promise<OrganizationStorage | undefined> {
    const { data, error } = await this.supabase.client
      .from("organization_storage")
      .select()
      .eq("organization_id", organizationId)
      .maybeSingle();
    // Migration 088 uygulanmadıysa tablo yoktur. Asistanın/dosya yüklemenin
    // tamamen durması yerine "seçim yok" davranışına düşeriz — eski akış
    // (sahibin varsayılan hesabı) çalışmaya devam eder.
    if (error) {
      if (isMissingTable(error)) return undefined;
      throw error;
    }
    return data ? mapRow(data) : undefined;
  }

  /**
   * Şirketin depo hesabını belirler.
   *
   * Yalnızca ŞİRKET SAHİBİ seçebilir: depo hesabı, şirketin bütün dosyalarının
   * kimin Drive kotasında ve kimin erişiminde olacağını belirler — bu bir
   * sahiplik kararıdır, departman yöneticisinin değil.
   */
  async set(params: {
    organizationId: string;
    userId: string;
    provider: StorageProvider;
    accountId: string;
  }): Promise<OrganizationStorage> {
    const { data: org, error: orgError } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", params.organizationId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id !== params.userId) {
      throw new ForbiddenException("Şirketin depo hesabını yalnızca şirket sahibi seçebilir");
    }

    const account = await this.cloudStorage.findById(params.provider, params.accountId);
    if (!account) throw new NotFoundException("Bulut hesabı bulunamadı");
    // Hesap seçimi başkasının hesabına dosya yazmaya dönüşmemeli: kimlik
    // doğrulanmış bir istekte bile hesap kimliği istemciden geliyor.
    if (account.userId !== params.userId) throw new ForbiddenException("Bu bulut hesabı size ait değil");
    if (!this.cloudStorage.isDriveReady(params.provider, account)) {
      throw new BadRequestException("Bu hesabın dosya erişimi hazır değil; Ayarlar'dan yeniden bağlayın.");
    }

    const patch = {
      organization_id: params.organizationId,
      storage_provider: params.provider,
      google_account_id: params.provider === "google" ? params.accountId : null,
      microsoft_account_id: params.provider === "microsoft" ? params.accountId : null,
      set_by: params.userId,
      updated_at: new Date().toISOString(),
    };

    const existing = await this.find(params.organizationId);
    if (existing) {
      // Hesap değiştiyse kök klasör kimliği artık başka bir Drive'a ait:
      // taşımak yerine sıfırlanır, yeni hesapta ilk kullanımda açılır.
      const resetFolder = existing.accountId !== params.accountId || existing.provider !== params.provider;
      const { data, error } = await this.supabase.client
        .from("organization_storage")
        .update(resetFolder ? { ...patch, drive_folder_id: null, folder_web_view_link: null } : patch)
        .eq("organization_id", params.organizationId)
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    }

    const { data, error } = await this.supabase.client
      .from("organization_storage")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return mapRow(data);
  }

  /** Seçimi kaldırır: şirket yeniden "sahibin varsayılan hesabı" davranışına döner. */
  async clear(organizationId: string, userId: string): Promise<void> {
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (org?.owner_id !== userId) {
      throw new ForbiddenException("Şirketin depo hesabını yalnızca şirket sahibi değiştirebilir");
    }
    const { error } = await this.supabase.client
      .from("organization_storage")
      .delete()
      .eq("organization_id", organizationId);
    if (error) throw error;
  }

  async setFolder(organizationId: string, folderId: string, webViewLink?: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("organization_storage")
      .update({ drive_folder_id: folderId, folder_web_view_link: webViewLink ?? null })
      .eq("organization_id", organizationId);
    if (error) throw error;
  }
}

/** PostgREST: tablo yok (42P01) ya da şema önbelleğinde görünmüyor (PGRST205). */
function isMissingTable(error: unknown): boolean {
  const code = (error as any)?.code;
  return code === "42P01" || code === "PGRST205";
}
