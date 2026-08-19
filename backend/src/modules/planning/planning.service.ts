import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PersonalBoardItem,
  PlanBlockSource,
  PlanBlockStatus,
  PlanCalendarView,
  PlanFocusArea,
  PlanPeriod,
  PlanPeriodKind,
  PlanPeriodProgress,
  PlanPreferences,
  PlanProgressRow,
  PlanRitual,
  PlanRitualKind,
  PlanRitualPrompt,
  PlanTarget,
  PlanTimeBlock,
  SchedulableTask,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { PersonalTodosService } from "../personal-todos/personal-todos.service";
import {
  assertTime,
  daysBetween,
  eachDay,
  formatTime,
  minutesToTime,
  normalizePeriodStart,
  periodEnd,
  timeToMinutes,
  today,
  weekday,
} from "./planning.dates";
import { RITUALS, ritualTitle } from "./planning.rituals";
import { MIN_SUGGESTED_BLOCK_MINUTES, distribute } from "./planning.scheduler";

/**
 * GÜVENLİK NOTU
 * -------------
 * personal-todos ile aynı model: plan_* tablolarında RLS açık ama politika yok;
 * erişim yalnızca service_role ile, yani tam olarak bu servisten. Kullanıcı
 * izolasyonu TAMAMEN bu dosyanın sorumluluğudur.
 *
 * Kurallar istisnasızdır:
 *   1. user_id taşıyan her sorgu `.eq("user_id", userId)` ile filtrelenir.
 *   2. user_id TAŞIMAYAN tablolar (plan_targets) yalnızca sahipliği önceden
 *      doğrulanmış bir period_id üzerinden yazılır/okunur — bkz. assertPeriod.
 *   3. `userId` asla istek gövdesinden gelmez, daima `req.user.userId`'den.
 *
 * Bunlar kullanıcının kimseye göstermediği planlarıdır; tabloları okuyan her
 * yeni kod yolu (rapor, bildirim, dışa aktarma, AI bağlamı) bu gözle ayrıca
 * gözden geçirilmelidir.
 */

const PERIOD_KINDS: PlanPeriodKind[] = ["day", "week", "month"];
const BLOCK_STATUSES: PlanBlockStatus[] = ["planned", "done", "skipped"];
const BLOCK_SOURCES: PlanBlockSource[] = ["manual", "lio", "routine"];
const RITUAL_KINDS: PlanRitualKind[] = ["daily", "weekly", "monthly"];

/** Takvimin yan sütununda gösterilen "henüz planlanmamış" kart sayısı. */
const UNSCHEDULED_LIMIT = 40;

/** plan_preferences satırı hiç yoksa dönen varsayılanlar. */
const DEFAULT_PREFERENCES: PlanPreferences = {
  timezone: "Europe/Istanbul",
  workdays: [1, 2, 3, 4, 5],
  dayStart: "09:00",
  dayEnd: "18:00",
  dailyTargetMinutes: 360,
  focusBlockMinutes: 90,
  breakMinutes: 15,
  ritualsEnabled: true,
  weeklyRitualWeekday: 1,
  weeklyRitualTime: "09:00",
  dailyRitualTime: "09:00",
  monthlyRitualDay: 1,
};

@Injectable()
export class PlanningService {
  constructor(
    private supabase: SupabaseService,
    private personalTodos: PersonalTodosService
  ) {}

  // ====================================================================== Tercihler

  async getPreferences(userId: string): Promise<PlanPreferences> {
    const { data, error } = await this.supabase.client
      .from("plan_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    // Satır yoksa varsayılanlar döner; kullanıcı ayarlara hiç girmeden de
    // takvim çalışsın diye kayıt burada oluşturulmuyor.
    return data ? mapPreferences(data) : { ...DEFAULT_PREFERENCES };
  }

  async updatePreferences(userId: string, body: Partial<PlanPreferences>): Promise<PlanPreferences> {
    const current = await this.getPreferences(userId);
    const next: PlanPreferences = { ...current };

    if (body.timezone !== undefined) next.timezone = body.timezone.trim() || current.timezone;
    if (body.workdays !== undefined) next.workdays = normalizeWorkdays(body.workdays);
    if (body.dayStart !== undefined) next.dayStart = assertTimeInput(body.dayStart);
    if (body.dayEnd !== undefined) next.dayEnd = assertTimeInput(body.dayEnd);
    if (body.dailyTargetMinutes !== undefined) next.dailyTargetMinutes = clampInt(body.dailyTargetMinutes, 30, 1440);
    if (body.focusBlockMinutes !== undefined) next.focusBlockMinutes = clampInt(body.focusBlockMinutes, 15, 480);
    if (body.breakMinutes !== undefined) next.breakMinutes = clampInt(body.breakMinutes, 0, 240);
    if (body.ritualsEnabled !== undefined) next.ritualsEnabled = Boolean(body.ritualsEnabled);
    if (body.weeklyRitualWeekday !== undefined) next.weeklyRitualWeekday = clampInt(body.weeklyRitualWeekday, 0, 6);
    if (body.weeklyRitualTime !== undefined) next.weeklyRitualTime = assertTimeInput(body.weeklyRitualTime);
    if (body.dailyRitualTime !== undefined) next.dailyRitualTime = assertTimeInput(body.dailyRitualTime);
    if (body.monthlyRitualDay !== undefined) next.monthlyRitualDay = clampInt(body.monthlyRitualDay, 1, 28);

    if (timeToMinutes(next.dayEnd) <= timeToMinutes(next.dayStart)) {
      throw new BadRequestException("Mesai bitişi başlangıcından sonra olmalı.");
    }

    const { data, error } = await this.supabase.client
      .from("plan_preferences")
      .upsert(
        {
          user_id: userId,
          timezone: next.timezone,
          workdays: next.workdays,
          day_start: next.dayStart,
          day_end: next.dayEnd,
          daily_target_minutes: next.dailyTargetMinutes,
          focus_block_minutes: next.focusBlockMinutes,
          break_minutes: next.breakMinutes,
          rituals_enabled: next.ritualsEnabled,
          weekly_ritual_weekday: next.weeklyRitualWeekday,
          weekly_ritual_time: next.weeklyRitualTime,
          daily_ritual_time: next.dailyRitualTime,
          monthly_ritual_day: next.monthlyRitualDay,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return mapPreferences(data);
  }

  // =================================================================== Odak alanları

  async listFocusAreas(userId: string, includeArchived = false): Promise<PlanFocusArea[]> {
    let query = this.supabase.client
      .from("plan_focus_areas")
      .select("*, jobs(title)")
      .eq("user_id", userId);
    if (!includeArchived) query = query.is("archived_at", null);

    const { data, error } = await query.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapFocusArea);
  }

  async createFocusArea(
    userId: string,
    body: { name?: string; color?: string; jobId?: string }
  ): Promise<PlanFocusArea> {
    const name = (body.name ?? "").trim();
    if (!name) throw new BadRequestException("Alan adı boş olamaz.");

    // Yeni alan listenin sonuna gelir.
    const { data: last } = await this.supabase.client
      .from("plan_focus_areas")
      .select("sort_order")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await this.supabase.client
      .from("plan_focus_areas")
      .insert({
        user_id: userId,
        name,
        color: body.color || null,
        job_id: body.jobId || null,
        sort_order: (last?.sort_order ?? -1) + 1,
      })
      .select("*, jobs(title)")
      .single();
    // Aynı isimde aktif bir alan varsa benzersizlik indeksi devreye girer;
    // kullanıcıya ham veritabanı hatası göstermek yerine niyeti anlatıyoruz.
    if (error) {
      if (error.code === "23505") throw new BadRequestException(`"${name}" adında bir odak alanın zaten var.`);
      throw error;
    }
    return mapFocusArea(data);
  }

  async updateFocusArea(
    userId: string,
    id: string,
    body: { name?: string; color?: string | null; jobId?: string | null }
  ): Promise<PlanFocusArea> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) throw new BadRequestException("Alan adı boş olamaz.");
      patch.name = name;
    }
    if (body.color !== undefined) patch.color = body.color || null;
    if (body.jobId !== undefined) patch.job_id = body.jobId || null;

    const { data, error } = await this.supabase.client
      .from("plan_focus_areas")
      .update(patch)
      .eq("id", id)
      // Sahiplik kontrolü: sadece "id" ile güncellemek yeterli DEĞİL.
      .eq("user_id", userId)
      .select("*, jobs(title)")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") throw new BadRequestException("Bu adda bir odak alanın zaten var.");
      throw error;
    }
    if (!data) throw new NotFoundException("Odak alanı bulunamadı.");
    return mapFocusArea(data);
  }

  /**
   * Kalıcı silmez, arşivler. Geçmiş dönemlerin raporları alanın adına
   * dayandığı için silmek eski haftaların dağılımını okunamaz hâle getirirdi.
   */
  async archiveFocusArea(userId: string, id: string): Promise<{ ok: true }> {
    const { data, error } = await this.supabase.client
      .from("plan_focus_areas")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Odak alanı bulunamadı.");
    return { ok: true };
  }

  async reorderFocusAreas(userId: string, ids: string[]): Promise<{ ok: true }> {
    if (!Array.isArray(ids) || ids.length === 0) return { ok: true };
    // Sahiplik filtresi her satırda ayrıca uygulanır: başkasının id'si listeye
    // sokulsa bile yazılmaz.
    await Promise.all(
      ids.map((id, index) =>
        this.supabase.client
          .from("plan_focus_areas")
          .update({ sort_order: index, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId)
      )
    );
    return { ok: true };
  }

  // ======================================================================== Dönemler

  /**
   * Dönemi bulur, yoksa taslak olarak oluşturur.
   *
   * Okuma yolunda kayıt oluşturmak bilinçli bir tercih: kullanıcı bir haftaya
   * baktığı anda o hafta artık "var"dır — niyeti henüz yazılmamış olsa bile
   * hedefler, ritüel kaydı ve ilerleme görünümü bir period_id'ye asılmak
   * zorunda. Alternatifi (period yokken hesabı ayrı bir kod yolunda yapmak)
   * aynı matematiği iki yerde tutmak olurdu; sapması an meselesi.
   */
  async ensurePeriod(userId: string, kind: PlanPeriodKind, date: string): Promise<PlanPeriod> {
    const k = this.assertKind(kind);
    const start = normalizePeriodStart(k, date);

    const existing = await this.findPeriod(userId, k, start);
    if (existing) return existing;

    const { data, error } = await this.supabase.client
      .from("plan_periods")
      .insert({ user_id: userId, kind: k, period_start: start, status: "draft" })
      .select("*")
      .single();
    // Aynı anda iki istek gelirse benzersizlik indeksi birini reddeder;
    // o durumda kazananı okuyup dönüyoruz.
    if (error) {
      if (error.code === "23505") {
        const raced = await this.findPeriod(userId, k, start);
        if (raced) return raced;
      }
      throw error;
    }
    return mapPeriod(data);
  }

  private async findPeriod(userId: string, kind: PlanPeriodKind, start: string): Promise<PlanPeriod | null> {
    const { data, error } = await this.supabase.client
      .from("plan_periods")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("period_start", start)
      .maybeSingle();
    if (error) throw error;
    return data ? mapPeriod(data) : null;
  }

  /** Dönemin sahibi doğrulanır; plan_targets'a giden her yol buradan geçer. */
  private async assertPeriod(userId: string, periodId: string): Promise<PlanPeriod> {
    const { data, error } = await this.supabase.client
      .from("plan_periods")
      .select("*")
      .eq("id", periodId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Dönem bulunamadı.");
    return mapPeriod(data);
  }

  async getPeriod(userId: string, kind: PlanPeriodKind, date: string): Promise<PlanPeriod> {
    const period = await this.ensurePeriod(userId, kind, date);
    period.targets = await this.fetchTargets(period.id);
    return period;
  }

  async updatePeriod(
    userId: string,
    periodId: string,
    body: { theme?: string | null; note?: string | null; reviewNote?: string | null; capacityMinutes?: number | null; status?: string }
  ): Promise<PlanPeriod> {
    await this.assertPeriod(userId, periodId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.theme !== undefined) patch.theme = body.theme?.trim() || null;
    if (body.note !== undefined) patch.note = body.note?.trim() || null;
    if (body.reviewNote !== undefined) patch.review_note = body.reviewNote?.trim() || null;
    if (body.capacityMinutes !== undefined) {
      patch.capacity_minutes = body.capacityMinutes == null ? null : clampInt(body.capacityMinutes, 1, 100000);
    }
    if (body.status !== undefined) {
      if (!["draft", "active", "closed"].includes(body.status)) throw new BadRequestException("Geçersiz dönem durumu.");
      patch.status = body.status;
      // 'closed' ile closed_at veritabanında CHECK ile birbirine bağlı;
      // ikisini birlikte yazmazsak güncelleme reddedilir.
      patch.closed_at = body.status === "closed" ? new Date().toISOString() : null;
    }

    const { data, error } = await this.supabase.client
      .from("plan_periods")
      .update(patch)
      .eq("id", periodId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Dönem bulunamadı.");
    return mapPeriod(data);
  }

  // ======================================================================== Hedefler

  async listTargets(userId: string, periodId: string): Promise<PlanTarget[]> {
    await this.assertPeriod(userId, periodId);
    return this.fetchTargets(periodId);
  }

  /**
   * Sahiplik doğrulaması YAPMAZ. Yalnızca çağıran, period'un kullanıcıya ait
   * olduğunu zaten kanıtlamışsa kullanılır (ensurePeriod/assertPeriod sonrası).
   * Aynı doğrulamayı istek başına üç kez çalıştırmamak için var.
   */
  private async fetchTargets(periodId: string): Promise<PlanTarget[]> {
    const { data, error } = await this.supabase.client
      .from("plan_targets")
      .select("*, plan_focus_areas(name, color)")
      .eq("period_id", periodId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapTarget);
  }

  /**
   * Dönemin hedeflerini TOPLU yazar — sihirbazın ve arayüzün ortak yolu.
   *
   * Gelen liste dönemin YENİ tam hâlidir: listede olmayan hedefler silinir.
   * Odak alanına bağlı hedeflerde `done_count` KORUNUR: kullanıcı hafta
   * ortasında yüzdeleri revize ettiğinde "3 içerik yaptım" sayacı sıfırlanmaz.
   */
  async setTargets(
    userId: string,
    periodId: string,
    targets: {
      focusAreaId?: string;
      title?: string;
      sharePct?: number;
      targetMinutes?: number;
      targetCount?: number;
      unit?: string;
    }[]
  ): Promise<PlanTarget[]> {
    await this.assertPeriod(userId, periodId);
    if (!Array.isArray(targets)) throw new BadRequestException("targets bir dizi olmalı.");

    // Gönderilen odak alanlarının gerçekten bu kullanıcıya ait olduğu doğrulanır;
    // plan_targets user_id taşımadığı için tek koruma budur.
    const areaIds = targets.map((t) => t.focusAreaId).filter((v): v is string => Boolean(v));
    if (areaIds.length) {
      const { data: owned, error: ownedError } = await this.supabase.client
        .from("plan_focus_areas")
        .select("id")
        .eq("user_id", userId)
        .in("id", areaIds);
      if (ownedError) throw ownedError;
      const ownedSet = new Set((owned ?? []).map((r: any) => r.id));
      for (const id of areaIds) {
        if (!ownedSet.has(id)) throw new NotFoundException("Odak alanı bulunamadı.");
      }
    }

    const existing = await this.fetchTargets(periodId);
    const doneCountByArea = new Map<string, number>();
    for (const t of existing) if (t.focusAreaId) doneCountByArea.set(t.focusAreaId, t.doneCount);

    const rows = targets.map((t, index) => {
      const title = t.title?.trim() || null;
      if (!t.focusAreaId && !title) {
        throw new BadRequestException("Her hedef ya bir odak alanına bağlı olmalı ya da bir başlık taşımalı.");
      }
      const sharePct = t.sharePct == null ? null : clampNumber(t.sharePct, 0, 100);
      const targetMinutes = t.targetMinutes == null ? null : clampInt(t.targetMinutes, 1, 100000);
      const targetCount = t.targetCount == null ? null : clampInt(t.targetCount, 0, 10000);
      if (sharePct == null && targetMinutes == null && targetCount == null) {
        throw new BadRequestException("Her hedefin en az bir ölçütü olmalı: yüzde, süre veya adet.");
      }
      return {
        period_id: periodId,
        focus_area_id: t.focusAreaId || null,
        title,
        share_pct: sharePct,
        target_minutes: targetMinutes,
        target_count: targetCount,
        unit: t.unit?.trim() || null,
        done_count: t.focusAreaId ? (doneCountByArea.get(t.focusAreaId) ?? 0) : 0,
        sort_order: index,
      };
    });

    // Önce eskiyi temizle, sonra yeniyi yaz. Sahiplik zaten assertPeriod ile
    // doğrulandığı için period_id filtresi yeterli.
    const { error: deleteError } = await this.supabase.client.from("plan_targets").delete().eq("period_id", periodId);
    if (deleteError) throw deleteError;

    if (rows.length === 0) return [];

    const { error: insertError } = await this.supabase.client.from("plan_targets").insert(rows);
    if (insertError) {
      if (insertError.code === "23505") throw new BadRequestException("Aynı odak alanı için iki hedef girilemez.");
      throw insertError;
    }
    return this.fetchTargets(periodId);
  }

  /**
   * Adet hedefinin sayacını ilerletir ("10 içerikten 4'ünü yaptım").
   * Zaman hedeflerinin böyle bir sayacı yok; onlar bloklardan hesaplanır.
   */
  async bumpTargetCount(userId: string, targetId: string, delta: number): Promise<PlanTarget> {
    const { data: row, error } = await this.supabase.client
      .from("plan_targets")
      .select("*, plan_periods!inner(user_id)")
      .eq("id", targetId)
      // plan_targets user_id taşımaz; sahiplik dönem üzerinden zorlanır.
      .eq("plan_periods.user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Hedef bulunamadı.");

    const next = Math.max(0, (row.done_count ?? 0) + Math.trunc(delta || 0));
    const { data, error: updateError } = await this.supabase.client
      .from("plan_targets")
      .update({ done_count: next, updated_at: new Date().toISOString() })
      .eq("id", targetId)
      .select("*, plan_focus_areas(name, color)")
      .single();
    if (updateError) throw updateError;
    return mapTarget(data);
  }

  // ==================================================================== Zaman blokları

  async listBlocks(userId: string, from: string, to: string): Promise<PlanTimeBlock[]> {
    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .select(
        "*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)"
      )
      .eq("user_id", userId)
      .gte("block_date", from)
      .lte("block_date", to)
      .order("block_date", { ascending: true })
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapBlock);
  }

  async createBlock(userId: string, body: BlockInput): Promise<PlanTimeBlock> {
    const row = await this.buildBlockRow(userId, body, true);
    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .insert({ user_id: userId, ...row })
      .select("*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)")
      .single();
    if (error) throw error;
    return mapBlock(data);
  }

  /** Lio'nun ve sihirbazın toplu yazma yolu; tek tek insert etmekten çok daha ucuz. */
  async createBlocks(userId: string, blocks: BlockInput[]): Promise<PlanTimeBlock[]> {
    if (!Array.isArray(blocks) || blocks.length === 0) return [];
    if (blocks.length > 200) throw new BadRequestException("Tek seferde en fazla 200 blok eklenebilir.");

    const rows = [];
    for (const b of blocks) rows.push({ user_id: userId, ...(await this.buildBlockRow(userId, b, true)) });

    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .insert(rows)
      .select("*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)");
    if (error) throw error;
    return (data ?? []).map(mapBlock);
  }

  async updateBlock(userId: string, id: string, body: BlockInput): Promise<PlanTimeBlock> {
    const patch = await this.buildBlockRow(userId, body, false);
    if (Object.keys(patch).length === 0) return this.findBlock(userId, id);

    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Blok bulunamadı.");
    return mapBlock(data);
  }

  /**
   * Sürükle-bırak. Süreyi koruyarak taşımak için `endsAt` verilmeyebilir:
   * bu durumda bloğun mevcut uzunluğu yeni başlangıca eklenir. Arayüzün
   * taşıma sırasında süreyi yeniden hesaplaması gerekmez.
   */
  async moveBlock(
    userId: string,
    id: string,
    body: { blockDate?: string; startsAt?: string; endsAt?: string }
  ): Promise<PlanTimeBlock> {
    const current = await this.findBlock(userId, id);
    const startsAt = body.startsAt ? assertTimeInput(body.startsAt) : current.startsAt;
    const endsAt = body.endsAt
      ? assertTimeInput(body.endsAt)
      : minutesToTime(timeToMinutes(startsAt) + current.plannedMinutes);

    if (timeToMinutes(endsAt) <= timeToMinutes(startsAt)) {
      throw new BadRequestException("Bitiş saati başlangıçtan sonra olmalı.");
    }

    return this.updateBlock(userId, id, {
      blockDate: body.blockDate ?? current.blockDate,
      startsAt,
      endsAt,
    });
  }

  /**
   * Bloğun durumunu değiştirir.
   *
   * 'done' işaretlenirken `actualMinutes` verilmezse planlanan süre
   * gerçekleşmiş kabul edilir — kullanıcıyı her blokta süre girmeye zorlamak
   * takip alışkanlığını baştan öldürüyor.
   */
  async setBlockStatus(
    userId: string,
    id: string,
    status: PlanBlockStatus,
    actualMinutes?: number
  ): Promise<PlanTimeBlock> {
    if (!BLOCK_STATUSES.includes(status)) throw new BadRequestException("Geçersiz blok durumu.");

    const patch: Record<string, unknown> = {
      status,
      // 'done' ile completed_at veritabanında CHECK ile birbirine bağlı.
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    if (status === "done") {
      patch.actual_minutes = actualMinutes == null ? null : clampInt(actualMinutes, 0, 1440);
    } else {
      // Geri alınan blok gerçekleşen süresini de bırakır.
      patch.actual_minutes = null;
    }

    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Blok bulunamadı.");
    return mapBlock(data);
  }

  async deleteBlock(userId: string, id: string): Promise<{ ok: true }> {
    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Blok bulunamadı.");
    return { ok: true };
  }

  /**
   * Lio'nun bir aralığa koyduğu ve henüz dokunulmamış önerileri siler.
   *
   * Yalnızca source='lio' VE status='planned' olanlar gider: kullanıcının
   * tamamladığı ya da atladığı bir öneri artık onun kararıdır, öneri değil.
   */
  async clearSuggestions(userId: string, from: string, to: string): Promise<{ removed: number }> {
    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .delete()
      .eq("user_id", userId)
      .eq("source", "lio")
      .eq("status", "planned")
      .gte("block_date", from)
      .lte("block_date", to)
      .select("id");
    if (error) throw error;
    return { removed: (data ?? []).length };
  }

  private async findBlock(userId: string, id: string): Promise<PlanTimeBlock> {
    const { data, error } = await this.supabase.client
      .from("plan_time_blocks")
      .select("*, plan_focus_areas(name, color), tasks(title, status), personal_todos(title, status)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Blok bulunamadı.");
    return mapBlock(data);
  }

  /**
   * Blok gövdesini veritabanı satırına çevirir ve bağların sahipliğini doğrular.
   * `requireTimes` yalnızca oluşturmada true: güncellemede kısmi gövde gelir.
   */
  private async buildBlockRow(userId: string, body: BlockInput, requireTimes: boolean): Promise<Record<string, unknown>> {
    const row: Record<string, unknown> = {};

    if (requireTimes || body.blockDate !== undefined) {
      if (!body.blockDate) throw new BadRequestException("Tarih zorunlu.");
      row.block_date = body.blockDate;
    }
    if (requireTimes || body.startsAt !== undefined) {
      if (!body.startsAt) throw new BadRequestException("Başlangıç saati zorunlu.");
      row.starts_at = assertTimeInput(body.startsAt);
    }
    if (requireTimes || body.endsAt !== undefined) {
      if (!body.endsAt) throw new BadRequestException("Bitiş saati zorunlu.");
      row.ends_at = assertTimeInput(body.endsAt);
    }
    if (row.starts_at && row.ends_at && timeToMinutes(row.ends_at as string) <= timeToMinutes(row.starts_at as string)) {
      throw new BadRequestException("Bitiş saati başlangıçtan sonra olmalı.");
    }

    if (body.title !== undefined) row.title = body.title?.trim() || null;
    if (body.note !== undefined) row.note = body.note?.trim() || null;
    if (body.color !== undefined) row.color = body.color || null;
    if (body.source !== undefined) {
      if (!BLOCK_SOURCES.includes(body.source)) throw new BadRequestException("Geçersiz blok kaynağı.");
      row.source = body.source;
    }

    if (body.focusAreaId !== undefined) {
      if (body.focusAreaId) await this.assertFocusAreaOwner(userId, body.focusAreaId);
      row.focus_area_id = body.focusAreaId || null;
    }

    // Bir blok en fazla bir karta bağlanır; ikisi birden gelirse gövde hatalı.
    if (body.taskId && body.personalTodoId) {
      throw new BadRequestException("Bir blok hem göreve hem kişisel görevin ikisine birden bağlanamaz.");
    }
    if (body.taskId !== undefined) {
      if (body.taskId) await this.assertSchedulableTask(userId, body.taskId);
      row.task_id = body.taskId || null;
      if (body.taskId) row.personal_todo_id = null;
    }
    if (body.personalTodoId !== undefined) {
      if (body.personalTodoId) await this.assertPersonalTodoOwner(userId, body.personalTodoId);
      row.personal_todo_id = body.personalTodoId || null;
      if (body.personalTodoId) row.task_id = null;
    }

    if (requireTimes) {
      const hasIdentity =
        (typeof row.title === "string" && row.title.length > 0) ||
        row.focus_area_id ||
        row.task_id ||
        row.personal_todo_id;
      if (!hasIdentity) {
        throw new BadRequestException("Blok bir başlık, odak alanı veya göreve bağlanmalı.");
      }
    }

    return row;
  }

  private async assertFocusAreaOwner(userId: string, id: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("plan_focus_areas")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Odak alanı bulunamadı.");
  }

  /**
   * Bloğa bağlanabilecek görevlerin kapsamı.
   *
   * Başlangıçta yalnızca kullanıcıya ATANMIŞ görevler bağlanabiliyordu; bu
   * yanlıştı. Serbest çalışan kendi projesindeki bir işe, onu kimseye
   * atamadan da zaman ayırmak ister — "Pist Prodüksiyon" işindeki
   * "samar-unfazed" projesinin görevi gibi. Kapsam bu yüzden erişilen
   * projeleri ve programları da içeriyor.
   *
   * Kapsam TEK BİR YERDE hesaplanıyor çünkü iki yerde kullanılıyor: görev
   * seçicinin listelediği şey ile bloğa bağlanmasına izin verilen şey aynı
   * olmak zorunda. Ayrı ayrı yazılsalardı biri diğerinden sapar ve listede
   * görünen bir görev "erişiminiz yok" hatası verirdi (ya da tersi, ki o
   * daha kötü).
   */
  private async loadSchedulableScope(userId: string): Promise<SchedulableScope> {
    const [ownedProjects, memberships, ownedOperations, ownedJobs] = await Promise.all([
      this.supabase.client.from("projects").select("id").eq("owner_id", userId).is("archived_at", null),
      this.supabase.client.from("project_members").select("project_id, role").eq("user_id", userId).eq("status", "approved"),
      this.supabase.client.from("operations").select("id").eq("owner_id", userId).is("archived_at", null),
      this.supabase.client.from("jobs").select("id").eq("owner_id", userId).is("archived_at", null),
    ]);
    if (ownedProjects.error) throw ownedProjects.error;
    if (memberships.error) throw memberships.error;
    if (ownedOperations.error) throw ownedOperations.error;
    if (ownedJobs.error) throw ownedJobs.error;

    const projects = new Map<string, string>();
    for (const row of ownedProjects.data ?? []) projects.set(row.id, "owner");
    // Üyelik sahipliği EZMEZ: kendi projesinde ayrıca taşeron kaydı olan biri
    // sahipliğini kaybetmemeli.
    for (const row of memberships.data ?? []) {
      if (!projects.has(row.project_id)) projects.set(row.project_id, row.role);
    }

    const operations = new Set<string>((ownedOperations.data ?? []).map((r: any) => r.id));

    // İş sahibi, o işin altındaki programların da sahibi sayılır
    // (bkz. OperationsService.assertCanManage ile aynı kural).
    const jobIds = (ownedJobs.data ?? []).map((r: any) => r.id);
    if (jobIds.length) {
      const { data, error } = await this.supabase.client
        .from("operations")
        .select("id")
        .in("job_id", jobIds)
        .is("archived_at", null);
      if (error) throw error;
      for (const row of data ?? []) operations.add(row.id);
    }

    return { projects, operations };
  }

  /**
   * Bloğa bağlanacak görevin erişilebilirliğini doğrular.
   *
   * Taşeron kuralı korunuyor: bir projede taşeron olan kişi yalnızca kendisine
   * atanmış görevleri görebilir (bkz. TasksService.getVisibleTaskIdsForSubcontractor),
   * dolayısıyla göremediği bir göreve zaman da ayıramaz. Bu kural burada
   * gevşetilseydi takvim, göreve erişimi olmayan birinin proje içeriğini
   * öğrenmesi için bir yan kapı olurdu.
   */
  private async assertSchedulableTask(userId: string, taskId: string): Promise<void> {
    const { data: task, error } = await this.supabase.client
      .from("tasks")
      .select("id, project_id, operation_id, assigned_to")
      .eq("id", taskId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!task) throw new NotFoundException("Görev bulunamadı.");

    // Kendisine atanmış görev her hâlükârda planlanabilir; departman görevleri
    // de bu yoldan geçer.
    if (task.assigned_to === userId) return;

    const scope = await this.loadSchedulableScope(userId);

    if (task.project_id) {
      const role = scope.projects.get(task.project_id);
      if (role && role !== "subcontractor") return;
    }
    if (task.operation_id && scope.operations.has(task.operation_id)) return;

    throw new NotFoundException("Görev bulunamadı veya erişiminiz yok.");
  }

  /**
   * Takvime sürüklenebilecek görevler.
   *
   * Kişisel panodan (listUnscheduled) ayrı bir liste: pano kullanıcının kendi
   * tabağıdır, burası ise erişebildiği her şeydir. Arayüzde iki ayrı sekme
   * olarak duruyorlar; atanmış görevlerin ikisinde birden görünmesi beklenen
   * bir durum, hata değil.
   */
  async listSchedulableTasks(
    userId: string,
    opts: { query?: string; projectId?: string; limit?: number } = {}
  ): Promise<SchedulableTask[]> {
    const scope = await this.loadSchedulableScope(userId);
    const limit = clampInt(opts.limit ?? 60, 1, 200);

    const projectIds = [...scope.projects.keys()].filter((id) => !opts.projectId || id === opts.projectId);
    const operationIds = opts.projectId ? [] : [...scope.operations];

    const select =
      "id, title, status, priority, deadline, assigned_to, project_id, operation_id, " +
      "estimated_duration_value, estimated_duration_unit, " +
      "assigned_user:users!tasks_assigned_to_fkey(full_name), " +
      "projects(title, job_id, jobs(title)), " +
      "operations(title, job_id, jobs(title))";

    // Üç ayrı sorgu, tek bir `.or(...)` yerine: PostgREST'in or filtresine
    // uzun uuid listeleri gömmek okunaksız ve kırılgan. Sonuçlar id üzerinden
    // birleştiriliyor, kesişimler tekrar etmiyor.
    const runs: Promise<any>[] = [];

    if (projectIds.length) {
      let q = this.supabase.client
        .from("tasks")
        .select(select)
        .in("project_id", projectIds)
        .is("archived_at", null)
        .neq("status", "completed")
        .limit(limit * 2);
      if (opts.query) q = q.ilike("title", `%${opts.query}%`);
      runs.push(Promise.resolve(q));
    }

    if (operationIds.length) {
      let q = this.supabase.client
        .from("tasks")
        .select(select)
        .in("operation_id", operationIds)
        .is("archived_at", null)
        .is("skipped_at", null)
        .neq("status", "completed")
        .limit(limit * 2);
      if (opts.query) q = q.ilike("title", `%${opts.query}%`);
      runs.push(Promise.resolve(q));
    }

    // Departman görevleri gibi, kapsam sorgularına düşmeyen ama kullanıcıya
    // atanmış işler bu üçüncü kolla geliyor.
    if (!opts.projectId) {
      // Atama ayrı tabloda (bkz. migration 053): birincil atanan olmayan ama
      // göreve eklenmiş kullanıcı da bu listeyi görmeli.
      const { data: assignedRows } = await this.supabase.client
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", userId);
      const assignedIds = (assignedRows ?? []).map((r: any) => r.task_id as string);
      let q = this.supabase.client
        .from("tasks")
        .select(select)
        .in("id", assignedIds.length ? assignedIds : ["00000000-0000-0000-0000-000000000000"])
        .is("archived_at", null)
        .neq("status", "completed")
        .limit(limit * 2);
      if (opts.query) q = q.ilike("title", `%${opts.query}%`);
      runs.push(Promise.resolve(q));
    }

    const results = await Promise.all(runs);
    const byId = new Map<string, any>();
    for (const res of results) {
      if (res.error) throw res.error;
      for (const row of res.data ?? []) {
        // Taşeron olunan projede yalnızca kendisine atanan görevler görünür.
        if (row.project_id && scope.projects.get(row.project_id) === "subcontractor" && row.assigned_to !== userId) {
          continue;
        }
        byId.set(row.id, row);
      }
    }

    return [...byId.values()]
      .map(mapSchedulableTask)
      // Teslim tarihi olanlar önce ve yakından uzağa; tarihi olmayanlar sonda.
      .sort((a, b) => {
        if (!a.deadline && !b.deadline) return a.title.localeCompare(b.title, "tr");
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      })
      .slice(0, limit);
  }

  private async assertPersonalTodoOwner(userId: string, todoId: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("personal_todos")
      .select("id")
      .eq("id", todoId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kişisel görev bulunamadı.");
  }

  // ======================================================================= İlerleme

  /**
   * Dönemin hedef/gerçek karşılaştırması. Tek kaynak v_plan_period_progress —
   * aynı matematiğin ikinci bir kopyası hiçbir yerde tutulmuyor.
   */
  async getProgress(userId: string, kind: PlanPeriodKind, date: string): Promise<PlanPeriodProgress> {
    const period = await this.ensurePeriod(userId, kind, date);
    return this.getProgressForPeriod(userId, period);
  }

  private async getProgressForPeriod(userId: string, period: PlanPeriod): Promise<PlanPeriodProgress> {
    const { data, error } = await this.supabase.client
      .from("v_plan_period_progress")
      .select("*")
      // Görünüm user_id taşıyor; izolasyon filtresi burada da zorunlu.
      .eq("user_id", userId)
      .eq("period_id", period.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []).map(mapProgressRow);
    const plannedMinutes = rows.reduce((sum, r) => sum + r.plannedMinutes, 0);
    const doneMinutes = rows.reduce((sum, r) => sum + r.doneMinutes, 0);
    const sharePctTotal = rows.reduce((sum, r) => sum + (r.sharePct ?? 0), 0);

    const capacityMinutes = period.capacityMinutes ?? (await this.computeCapacity(userId, period));

    return {
      period,
      rows,
      plannedMinutes,
      doneMinutes,
      capacityMinutes,
      sharePctTotal: round2(sharePctTotal),
      // Kapasitenin ne kadarı takvime dolduruldu.
      fillPct: capacityMinutes > 0 ? round2((100 * plannedMinutes) / capacityMinutes) : 0,
      // Takvime düşenin ne kadarı gerçekten yapıldı. "Verimlilik yüzdesi"
      // dediğimiz şey budur: hedefe değil, kendi planına sadakat.
      adherencePct: plannedMinutes > 0 ? round2((100 * doneMinutes) / plannedMinutes) : 0,
    };
  }

  /**
   * Dönemin kaydında kapasite yazmıyorsa çalışma ritminden hesaplanır:
   * aralıktaki iş günü sayısı × günlük hedef.
   */
  private async computeCapacity(userId: string, period: PlanPeriod): Promise<number> {
    const prefs = await this.getPreferences(userId);
    const workdays = new Set(prefs.workdays);
    const days = eachDay(period.periodStart, period.periodEnd).filter((d) => workdays.has(weekday(d)));
    return days.length * prefs.dailyTargetMinutes;
  }

  // ================================================================== Takvim görünümü

  /**
   * Takvimin tek istekle beslenmesi. Gün/hafta/ay görünümleri aynı paketi
   * kullanır; aralarındaki tek fark tarih aralığı ve hangi dönemin
   * ilerlemesinin gösterildiğidir.
   */
  async getCalendar(userId: string, kind: PlanPeriodKind, date: string): Promise<PlanCalendarView> {
    const k = this.assertKind(kind);
    const start = normalizePeriodStart(k, date);
    const end = periodEnd(k, start);

    const [period, blocks, focusAreas, ritual, preferences] = await Promise.all([
      this.ensurePeriod(userId, k, start),
      this.listBlocks(userId, start, end),
      this.listFocusAreas(userId),
      this.getDueRitual(userId),
      this.getPreferences(userId),
    ]);

    // Hedefler ilerlemeden ÖNCE dolduruluyor: getProgressForPeriod aldığı
    // period nesnesini olduğu gibi geri veriyor, dolayısıyla sonradan
    // atamak yan etkiye bel bağlamak olurdu — arayüz progress.period.targets
    // okuduğu için o bağ sessizce kopabilirdi.
    period.targets = await this.fetchTargets(period.id);

    const [progress, unscheduled] = await Promise.all([
      this.getProgressForPeriod(userId, period),
      this.listUnscheduled(userId, blocks),
    ]);

    return { kind: k, from: start, to: end, preferences, blocks, unscheduled, focusAreas, progress, ritual };
  }

  /**
   * Takvimin yan sütunu: kullanıcının açık işlerinden, görünen aralıkta hiç
   * bloğu OLMAYANLAR. Buradan sürükleyip takvime bırakılırlar.
   */
  private async listUnscheduled(userId: string, blocks: PlanTimeBlock[]): Promise<PersonalBoardItem[]> {
    const scheduled = new Set<string>();
    for (const b of blocks) {
      if (b.taskId) scheduled.add(b.taskId);
      if (b.personalTodoId) scheduled.add(b.personalTodoId);
    }

    const board = await this.personalTodos.getBoard(userId, { source: "all", completedWithinDays: 0 });
    return board
      .filter((item) => item.status !== "completed" && !scheduled.has(item.itemId))
      .slice(0, UNSCHEDULED_LIMIT);
  }

  // ======================================================================= Ritüeller

  /**
   * "Bugün hangi sihirbazın zamanı geldi?"
   *
   * Cevap hesaplanır, bir yerde beklemez: bugünün tarihi + tercihler yeterli.
   * Zamanlanmış görev (cron) yok — kullanıcı uygulamayı hafta ortasında açsa
   * bile pazartesi ritüelini yapmadıysa sihirbaz onu karşılar. Bir ritüel
   * "kaçırılmaz", sadece gecikir.
   *
   * Öncelik sırası GENİŞTEN DARA: ay > hafta > gün. Ayın niyeti haftanın,
   * haftanınki günün girdisidir; ters sırada sorulursa kullanıcı günü
   * planladıktan sonra haftanın hedefini değiştirip baştan başlar.
   */
  async getDueRitual(userId: string, onDate?: string): Promise<PlanRitualPrompt | undefined> {
    const prefs = await this.getPreferences(userId);
    if (!prefs.ritualsEnabled) return undefined;

    const day = onDate ?? today();

    for (const kind of ["monthly", "weekly", "daily"] as PlanRitualKind[]) {
      if (!this.isRitualDue(kind, day, prefs)) continue;
      const anchor = this.ritualAnchorDate(kind, day);
      // Bu döneme ait oturum zaten yapıldıysa (ya da atlandıysa) tekrar sorulmaz.
      const done = await this.findRitual(userId, kind, anchor);
      if (done && done.status !== "pending") continue;

      const periodKind = ritualPeriodKind(kind);
      const period = await this.ensurePeriod(userId, periodKind, anchor);
      const previous = await this.findPreviousRitual(userId, kind, anchor);

      return {
        kind,
        periodStart: period.periodStart,
        periodKind,
        periodId: period.id,
        title: ritualTitle(kind, period.periodStart),
        questions: RITUALS[kind].questions,
        previousSummary: previous?.summary,
      };
    }
    return undefined;
  }

  /**
   * Ritüelin zamanı geldi mi?
   *
   * "Geçti mi" diye bakılıyor, "bugün mü" diye değil: pazartesiyi kaçıran
   * kullanıcı salı günü açtığında da haftalık planlamayı yapabilmeli.
   */
  private isRitualDue(kind: PlanRitualKind, day: string, prefs: PlanPreferences): boolean {
    switch (kind) {
      case "daily":
        // Gün ritüeli yalnızca çalışma günlerinde. Tatil günü plan sorulmaz.
        return prefs.workdays.includes(weekday(day));

      case "weekly": {
        // Kullanıcının seçtiği planlama günü, haftanın başından kaçıncı gün?
        // Dönemler pazartesi başladığı için tercih (0=Pazar…6=Cumartesi)
        // pazartesiye göre bir kaymaya çevrilir: Pazartesi -> 0, Pazar -> 6.
        const offset = prefs.weeklyRitualWeekday === 0 ? 6 : prefs.weeklyRitualWeekday - 1;
        return daysBetween(this.ritualAnchorDate("weekly", day), day) >= offset;
      }

      case "monthly":
        // Ayın kaçıncı gününde sorulacaksa o güne gelinmiş olmalı.
        return daysBetween(this.ritualAnchorDate("monthly", day), day) >= prefs.monthlyRitualDay - 1;
    }
  }

  /**
   * Ritüelin bağlı olduğu tarih — aynı ritüelin iki kez sorulmasını engelleyen
   * anahtar (plan_rituals'daki benzersizlik bu üçlü üzerinedir).
   *
   * Anahtar dönemin BAŞLANGICIDIR, ritüelin yapıldığı gün değil. Salı günü
   * yapılan "pazartesi planlaması" da o haftanın ritüelidir; kullanıcı bir gün
   * geç kaldı diye aynı hafta ikinci kez sorulmamalı.
   */
  private ritualAnchorDate(kind: PlanRitualKind, day: string): string {
    switch (kind) {
      case "daily":
        return day;
      case "weekly":
        return normalizePeriodStart("week", day);
      case "monthly":
        return normalizePeriodStart("month", day);
    }
  }

  private async findRitual(userId: string, kind: PlanRitualKind, occurredOn: string): Promise<PlanRitual | null> {
    const { data, error } = await this.supabase.client
      .from("plan_rituals")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("occurred_on", occurredOn)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRitual(data) : null;
  }

  /** Bir önceki aynı türden oturum; Lio "geçen hafta ne demiştin" diye sorabilsin. */
  private async findPreviousRitual(userId: string, kind: PlanRitualKind, before: string): Promise<PlanRitual | null> {
    const { data, error } = await this.supabase.client
      .from("plan_rituals")
      .select("*")
      .eq("user_id", userId)
      .eq("kind", kind)
      .eq("status", "done")
      .lt("occurred_on", before)
      .order("occurred_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRitual(data) : null;
  }

  /**
   * Sihirbaz oturumunu kapatır. `status='skipped'` de bir cevaptır: kullanıcı
   * bugün planlamak istemiyorsa aynı soru gün boyunca tekrar sorulmaz.
   */
  async completeRitual(
    userId: string,
    body: { kind?: string; occurredOn?: string; periodId?: string; answers?: Record<string, unknown>; summary?: string; status?: string }
  ): Promise<PlanRitual> {
    const kind = this.assertRitualKind(body.kind);
    const occurredOn = body.occurredOn ?? this.ritualAnchorDate(kind, today());
    const status = body.status === "skipped" ? "skipped" : "done";

    if (body.periodId) await this.assertPeriod(userId, body.periodId);

    const answers = body.answers ?? {};
    if (typeof answers !== "object" || Array.isArray(answers)) {
      throw new BadRequestException("answers bir nesne olmalı.");
    }

    const { data, error } = await this.supabase.client
      .from("plan_rituals")
      .upsert(
        {
          user_id: userId,
          kind,
          occurred_on: occurredOn,
          period_id: body.periodId || null,
          status,
          answers,
          summary: body.summary?.trim() || null,
          // 'pending' olmayan her durum bitiş zamanı taşımak ZORUNDA (CHECK).
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,kind,occurred_on" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return mapRitual(data);
  }

  async listRituals(userId: string, kind?: string, limit = 12): Promise<PlanRitual[]> {
    let query = this.supabase.client
      .from("plan_rituals")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .limit(clampInt(limit, 1, 100));
    if (kind) query = query.eq("kind", this.assertRitualKind(kind));

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapRitual);
  }

  // ================================================================ Otomatik dağıtım

  /**
   * Hedefleri takvime dağıtır — Lio'nun "sihirbaz" hissini veren asıl parça.
   *
   * Dağıtım MODELE DEĞİL, buraya yaptırılıyor. Sebep: bu iş aritmetik, ve dil
   * modelleri aritmetikte hem pahalı hem güvenilmezdir. Model kullanıcıyla
   * konuşup hedefleri çıkarır, hesabı bu fonksiyon yapar, sonuç yine modele
   * dönüp cümleye çevrilir. Böylece "%60 yazılım" gerçekten haftanın %60'ı
   * olur, modelin tahmini olmaz.
   *
   * Kurallar:
   *   - Yalnızca kullanıcının çalışma günlerine ve mesai saatlerine yerleşir.
   *   - Takvimde ELLE konmuş bloklara dokunulmaz; onların etrafına yerleşir.
   *   - Her odak alanının haftalık payı günlere EŞİT bölünür; bir alanın işi
   *     tek güne yığılmaz.
   *   - Kalan boşluk hedefleri karşılamaya yetmiyorsa eksik kalan süre
   *     `shortfallMinutes` olarak raporlanır — sessizce kırpılmaz.
   */
  async suggestSchedule(
    userId: string,
    kind: PlanPeriodKind,
    date: string,
    opts: { apply?: boolean; replaceExisting?: boolean } = {}
  ): Promise<SuggestionResult> {
    const k = this.assertKind(kind);
    if (k === "month") {
      // Ay ölçeğinde saat bloğu önermek anlamsız: ay hedefleri sonuç
      // cinsindendir, haftalık ritüelde saate dönüşür.
      throw new BadRequestException("Otomatik dağıtım gün ve hafta için yapılır; ay hedefleri haftalara bölünür.");
    }

    const start = normalizePeriodStart(k, date);
    const end = periodEnd(k, start);

    const prefs = await this.getPreferences(userId);
    const period = await this.ensurePeriod(userId, k, start);
    const targets = await this.fetchTargets(period.id);

    if (opts.replaceExisting) await this.clearSuggestions(userId, start, end);

    const existing = await this.listBlocks(userId, start, end);
    const capacity = period.capacityMinutes ?? (await this.computeCapacity(userId, period));

    // Süreye çevrilebilen hedefler: yüzde varsa kapasiteden, yoksa doğrudan
    // dakika. Yalnızca adet hedefi olanlar (10 içerik) buraya girmez — onların
    // ne kadar sürdüğünü yalnızca kullanıcı bilir.
    const demands = targets
      .filter((t) => t.focusAreaId)
      .map((t) => ({
        focusAreaId: t.focusAreaId!,
        focusAreaName: t.focusAreaName,
        color: t.focusAreaColor,
        minutes: t.targetMinutes ?? (t.sharePct != null ? Math.round((capacity * t.sharePct) / 100) : 0),
      }))
      .filter((d) => d.minutes > 0);

    if (demands.length === 0) {
      throw new BadRequestException("Dağıtılacak bir hedef yok. Önce odak alanlarına yüzde veya süre verin.");
    }

    const workDays = eachDay(start, end).filter((d) => prefs.workdays.includes(weekday(d)));
    if (workDays.length === 0) {
      throw new BadRequestException("Bu aralıkta çalışma günü yok. Çalışma günlerini ayarlardan güncelleyin.");
    }

    // Hesabın tamamı saf bir modülde; buradaki iş yalnızca girdileri toplayıp
    // sonucu yazmak (bkz. planning.scheduler.ts).
    const { proposals, shortfall } = distribute(
      demands,
      // Atlanmış bloklar "dolu" sayılmaz: kullanıcı o saati kullanmayacağını
      // zaten söylemiş, üstüne plan kurulabilir.
      existing.filter((b) => b.status !== "skipped"),
      {
        workDays,
        dayStart: prefs.dayStart,
        dayEnd: prefs.dayEnd,
        focusBlockMinutes: prefs.focusBlockMinutes,
        breakMinutes: prefs.breakMinutes,
      }
    );

    // Lio'nun koyduğu bloklar işaretlenir; kullanıcının elle koyduklarıyla
    // karışmasınlar — "önerileri temizle" yalnızca bunları siler.
    const inputs: BlockInput[] = proposals.map((p) => ({ ...p, source: "lio" as const }));
    const blocks = opts.apply ? await this.createBlocks(userId, inputs) : [];

    return {
      periodId: period.id,
      from: start,
      to: end,
      capacityMinutes: capacity,
      proposedCount: proposals.length,
      proposedMinutes: proposals.reduce(
        (sum, p) => sum + (timeToMinutes(p.endsAt!) - timeToMinutes(p.startsAt!)),
        0
      ),
      applied: Boolean(opts.apply),
      blocks,
      shortfall,
    };
  }

  // ====================================================================== Yardımcılar

  private assertKind(kind: string | undefined): PlanPeriodKind {
    if (!kind || !PERIOD_KINDS.includes(kind as PlanPeriodKind)) {
      throw new BadRequestException("Geçersiz dönem türü. Beklenen: day, week veya month.");
    }
    return kind as PlanPeriodKind;
  }

  private assertRitualKind(kind: string | undefined): PlanRitualKind {
    if (!kind || !RITUAL_KINDS.includes(kind as PlanRitualKind)) {
      throw new BadRequestException("Geçersiz ritüel türü. Beklenen: daily, weekly veya monthly.");
    }
    return kind as PlanRitualKind;
  }
}

// ======================================================================== Tipler

export interface BlockInput {
  blockDate?: string;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  note?: string;
  color?: string;
  focusAreaId?: string | null;
  taskId?: string | null;
  personalTodoId?: string | null;
  source?: PlanBlockSource;
}

/**
 * Kullanıcının takvime bağlayabileceği kayıtların kapsamı.
 * Görev seçici ile bloğa bağlama izni bu tek kaynaktan besleniyor.
 */
interface SchedulableScope {
  /** projeId -> kullanıcının o projedeki rolü ("owner" | "member" | "subcontractor"). */
  projects: Map<string, string>;
  /** Sahibi olunan ya da sahibi olunan bir işin altındaki programlar. */
  operations: Set<string>;
}

export interface SuggestionResult {
  periodId: string;
  from: string;
  to: string;
  capacityMinutes: number;
  proposedCount: number;
  proposedMinutes: number;
  /** Bloklar gerçekten yazıldı mı, yoksa yalnızca önerildi mi. */
  applied: boolean;
  blocks: PlanTimeBlock[];
  /** Takvimde yer kalmadığı için karşılanamayan süre. Sessizce kırpılmaz. */
  shortfall: { focusAreaId: string; focusAreaName?: string; minutes: number }[];
}

// ================================================================== Saf yardımcılar

/**
 * Mesai penceresinden dolu blokları çıkarır, geriye kalan boşlukları verir.
 * Öneri yerleştirici yalnızca bu boşluklara yazar; elle konmuş hiçbir bloğun
 * üstüne gidilmez.
 */
/** Ritüel türünün beslediği dönem kademesi. */
function ritualPeriodKind(kind: PlanRitualKind): PlanPeriodKind {
  return kind === "daily" ? "day" : kind === "weekly" ? "week" : "month";
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) throw new BadRequestException("Sayısal bir değer bekleniyordu.");
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new BadRequestException("Sayısal bir değer bekleniyordu.");
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function assertTimeInput(value: string): string {
  try {
    return assertTime(value);
  } catch {
    throw new BadRequestException(`Geçersiz saat: ${value}`);
  }
}

function normalizeWorkdays(days: number[]): number[] {
  if (!Array.isArray(days)) throw new BadRequestException("Çalışma günleri bir dizi olmalı.");
  const set = new Set(days.map((d) => clampInt(d, 0, 6)));
  if (set.size === 0) throw new BadRequestException("En az bir çalışma günü seçilmeli.");
  return [...set].sort((a, b) => a - b);
}

// ====================================================================== Eşlemeler

function mapPreferences(row: any): PlanPreferences {
  return {
    timezone: row.timezone,
    workdays: row.workdays ?? [1, 2, 3, 4, 5],
    dayStart: formatTime(row.day_start),
    dayEnd: formatTime(row.day_end),
    dailyTargetMinutes: row.daily_target_minutes,
    focusBlockMinutes: row.focus_block_minutes,
    breakMinutes: row.break_minutes,
    ritualsEnabled: row.rituals_enabled,
    weeklyRitualWeekday: row.weekly_ritual_weekday,
    weeklyRitualTime: formatTime(row.weekly_ritual_time),
    dailyRitualTime: formatTime(row.daily_ritual_time),
    monthlyRitualDay: row.monthly_ritual_day,
  };
}

function mapFocusArea(row: any): PlanFocusArea {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    jobId: row.job_id ?? undefined,
    jobTitle: row.jobs?.title ?? undefined,
    sortOrder: row.sort_order ?? 0,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
  };
}

function mapPeriod(row: any): PlanPeriod {
  const kind = row.kind as PlanPeriodKind;
  const start = typeof row.period_start === "string" ? row.period_start.slice(0, 10) : row.period_start;
  return {
    id: row.id,
    kind,
    periodStart: start,
    // Son gün veritabanında tutulmuyor; kademeden türetilir.
    periodEnd: periodEnd(kind, start),
    theme: row.theme ?? undefined,
    note: row.note ?? undefined,
    reviewNote: row.review_note ?? undefined,
    capacityMinutes: row.capacity_minutes ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at ?? undefined,
  };
}

function mapTarget(row: any): PlanTarget {
  return {
    id: row.id,
    periodId: row.period_id,
    focusAreaId: row.focus_area_id ?? undefined,
    focusAreaName: row.plan_focus_areas?.name ?? undefined,
    focusAreaColor: row.plan_focus_areas?.color ?? undefined,
    title: row.title ?? undefined,
    sharePct: row.share_pct != null ? Number(row.share_pct) : undefined,
    targetMinutes: row.target_minutes ?? undefined,
    targetCount: row.target_count ?? undefined,
    unit: row.unit ?? undefined,
    doneCount: row.done_count ?? 0,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapBlock(row: any): PlanTimeBlock {
  const startsAt = formatTime(row.starts_at);
  const endsAt = formatTime(row.ends_at);
  return {
    id: row.id,
    blockDate: typeof row.block_date === "string" ? row.block_date.slice(0, 10) : row.block_date,
    startsAt,
    endsAt,
    // Süre kolonda tutulmuyor; iki uçtan hesaplanır ki tek doğru kaynak kalsın.
    plannedMinutes: timeToMinutes(endsAt) - timeToMinutes(startsAt),
    title: row.title ?? undefined,
    note: row.note ?? undefined,
    color: row.color ?? undefined,
    focusAreaId: row.focus_area_id ?? undefined,
    focusAreaName: row.plan_focus_areas?.name ?? undefined,
    focusAreaColor: row.plan_focus_areas?.color ?? undefined,
    taskId: row.task_id ?? undefined,
    personalTodoId: row.personal_todo_id ?? undefined,
    linkedTitle: row.tasks?.title ?? row.personal_todos?.title ?? undefined,
    linkedStatus: row.tasks?.status ?? row.personal_todos?.status ?? undefined,
    source: row.source,
    status: row.status,
    actualMinutes: row.actual_minutes ?? undefined,
    completedAt: row.completed_at ?? undefined,
    sortOrder: row.sort_order ?? 0,
  };
}

function mapProgressRow(row: any): PlanProgressRow {
  return {
    targetId: row.target_id ?? undefined,
    focusAreaId: row.focus_area_id ?? undefined,
    focusAreaName: row.focus_area_name ?? undefined,
    focusAreaColor: row.focus_area_color ?? undefined,
    targetTitle: row.target_title ?? undefined,
    sharePct: row.share_pct != null ? Number(row.share_pct) : undefined,
    targetMinutes: row.target_minutes ?? undefined,
    targetCount: row.target_count ?? undefined,
    unit: row.unit ?? undefined,
    doneCount: row.done_count ?? 0,
    plannedMinutes: Number(row.planned_minutes ?? 0),
    doneMinutes: Number(row.done_minutes ?? 0),
    blockCount: Number(row.block_count ?? 0),
    doneBlockCount: Number(row.done_block_count ?? 0),
    plannedSharePct: row.planned_share_pct != null ? Number(row.planned_share_pct) : undefined,
    doneSharePct: row.done_share_pct != null ? Number(row.done_share_pct) : undefined,
  };
}

function mapSchedulableTask(row: any): SchedulableTask {
  const container = row.projects ?? row.operations;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: (row.priority ?? 0) as SchedulableTask["priority"],
    deadline: row.deadline ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assignedToName: row.assigned_user?.full_name ?? undefined,
    projectId: row.project_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    operationId: row.operation_id ?? undefined,
    operationTitle: row.operations?.title ?? undefined,
    // İş başlığı, görevin bağlı olduğu proje ya da programın üstünden geliyor;
    // seçicide görevler işe göre gruplanıyor.
    jobId: container?.job_id ?? undefined,
    jobTitle: container?.jobs?.title ?? undefined,
    estimatedMinutes: estimatedMinutes(row.estimated_duration_value, row.estimated_duration_unit),
  };
}

/**
 * Görevin tahmini süresini dakikaya çevirir; takvime sürüklenen görev bu
 * uzunlukta bir blok açar.
 *
 * "gün" biriminde takvim günü değil ÇALIŞMA günü kastediliyor: 8 saatlik bir
 * iş günü. 24 saate çevirmek, tek bir görevin takvimde bütün günü yutması
 * demek olurdu.
 */
function estimatedMinutes(value: unknown, unit: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (unit === "hours") return Math.round(n * 60);
  if (unit === "days") return Math.round(n * 8 * 60);
  return undefined;
}

function mapRitual(row: any): PlanRitual {
  return {
    id: row.id,
    kind: row.kind,
    occurredOn: typeof row.occurred_on === "string" ? row.occurred_on.slice(0, 10) : row.occurred_on,
    periodId: row.period_id ?? undefined,
    status: row.status,
    answers: row.answers ?? {},
    summary: row.summary ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}
