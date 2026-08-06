import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { JobModule } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";

function mapJobModule(row: any): JobModule {
  return {
    id: row.id,
    jobId: row.job_id,
    moduleKey: row.module_key,
    createdAt: row.created_at,
  };
}

// Serbest çalışan panelindeki "Modüller" sekmesi: kişi module_catalog'dan
// applies_to_freelancer=true olan bir modülü, istediği işe atar/kaldırır.
@Injectable()
export class JobModulesService {
  constructor(private supabase: SupabaseService) {}

  private async assertOwner(jobId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data } = await this.supabase.client.from("jobs").select("owner_id").eq("id", jobId).maybeSingle();
    if (!data) throw new NotFoundException("İş bulunamadı");
    if (data.owner_id !== userId) throw new ForbiddenException("Bu işi yalnızca sahibi düzenleyebilir");
  }

  async findByJob(jobId: string): Promise<JobModule[]> {
    const { data, error } = await this.supabase.client.from("job_modules").select("*").eq("job_id", jobId);
    if (error) throw error;
    return (data ?? []).map(mapJobModule);
  }

  async assign(jobId: string, moduleKey: string, requestingUserId?: string): Promise<JobModule> {
    await this.assertOwner(jobId, requestingUserId);
    if (!moduleKey) throw new BadRequestException("Modül anahtarı gerekli");

    const { data: catalogRow, error: catalogError } = await this.supabase.client
      .from("module_catalog")
      .select("applies_to_freelancer")
      .eq("key", moduleKey)
      .maybeSingle();
    if (catalogError) throw catalogError;
    if (!catalogRow) throw new BadRequestException("Geçersiz modül");
    if (!catalogRow.applies_to_freelancer) {
      throw new BadRequestException("Bu modül serbest çalışan panelinde kullanılamıyor");
    }

    const { data: row, error } = await this.supabase.client
      .from("job_modules")
      .upsert({ job_id: jobId, module_key: moduleKey }, { onConflict: "job_id,module_key", ignoreDuplicates: true })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (row) return mapJobModule(row);
    const { data: existing, error: existingError } = await this.supabase.client
      .from("job_modules")
      .select("*")
      .eq("job_id", jobId)
      .eq("module_key", moduleKey)
      .single();
    if (existingError) throw existingError;
    return mapJobModule(existing);
  }

  async unassign(jobId: string, moduleKey: string, requestingUserId?: string): Promise<void> {
    await this.assertOwner(jobId, requestingUserId);
    const { error } = await this.supabase.client
      .from("job_modules")
      .delete()
      .eq("job_id", jobId)
      .eq("module_key", moduleKey);
    if (error) throw error;
  }
}
