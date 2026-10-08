import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  PROJE_ETKINLIK_TURLERI,
  kisiselTakvimdeGorunurMu,
  type ProjeEtkinligi,
  type ProjeEtkinlikGirdisi,
  type ProjeTakvimGorunumu,
  type Task,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { requireUuid } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { PlanningService } from "../planning/planning.service";
import { NotificationsService } from "../notifications/notifications.service";
import { daysBetween, formatTime, parseDate, timeToMinutes } from "../planning/planning.dates";

const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const TITLE_MAX = 200;
const LOCATION_MAX = 300;
const NOTE_MAX = 5000;
/** Tek istekte okunabilecek en geniş aralık — ay görünümü taşmasıyla ~6 hafta. */
const ARALIK_TAVANI_GUN = 62;
/** Çok günlü tüm gün etkinliğin en uzun hâli; daha uzunu bir proje evresi, etkinlik değil. */
const ETKINLIK_GUN_TAVANI = 60;
const KATILIMCI_TAVANI = 100;

const EVENT_SELECT = "*, users(full_name), projects(title)";

/**
 * Proje takvimi.
 *
 * Eskiden bu modül yalnızca proje görevlerini "benim / ekip" diye süzüyordu
 * (`filterTasks`). Artık projenin ortak etkinliklerini de tutuyor
 * (migration 152). Kişisel Takvim'le (modules/planning) ilişkisi okuma
 * yönündedir; gerekçesi packages/shared/src/projeTakvimi.ts başında.
 *
 * Yetki:
 *   - Görmek: projeyi görebilen herkes (AccessService.assertCanViewProject).
 *   - Eklemek: projeyi görebilen herkes — taşeron dahil; toplantı ayarlamak
 *     ekipteki herkesin işi.
 *   - Düzenlemek/silmek: etkinliği yazan ya da proje sahibi. Başkasının
 *     toplantısının saatini sessizce kaydırabilmek, ekibin takvimine güveni
 *     bozardı.
 */
@Injectable()
export class CalendarService {
  constructor(
    private supabase: SupabaseService,
    private access: AccessService,
    private planning: PlanningService,
    private notifications: NotificationsService
  ) {}

  // "Sadece Benim Görevlerim" / "Tüm Ekip Takvimi" filtreleme
  filterTasks(tasks: Task[], userId: string, scope: "mine" | "team"): Task[] {
    // Bir görevin birden fazla atananı olabilir (bkz. migration 053); assignedTo
    // yalnızca birincil atanandır, ikinci kişi kendi takviminde görevi göremezdi.
    const mine = (t: Task) =>
      t.assignees?.length ? t.assignees.some((a) => a.userId === userId) : t.assignedTo === userId;
    return scope === "mine" ? tasks.filter(mine) : tasks;
  }

  // Sürükle-bırak ile tarih güncelleme sonrası çağrılır
  reschedule(task: Task, newStart: string, newDeadline: string): Task {
    return { ...task, startDate: newStart, deadline: newDeadline };
  }

  // ============================================================ Proje takvimi

  async projeTakvimi(projectId: string, userId: string, from: string, to: string): Promise<ProjeTakvimGorunumu> {
    requireUuid(projectId, "Proje");
    await this.access.assertCanViewProject(projectId, userId);
    aralikDogrula(from, to);

    const [events, myBlocks, sahip] = await Promise.all([
      this.etkinlikleriOku([projectId], from, to),
      this.planning.listBlocksForProject(userId, projectId, from, to),
      this.projeSahipleri([projectId]),
    ]);
    return { from, to, events: events.map((r) => mapEvent(r, userId, sahip)), myBlocks };
  }

  /**
   * Kişisel Takvim'e düşen proje etkinlikleri: sahibi ya da onaylı üyesi
   * olunan projelerin, kişiyi ilgilendiren etkinlikleri (bkz.
   * kisiselTakvimdeGorunurMu). İşi yöneten ama projeye üye olmayan biri her
   * projenin toplantısını kişisel takviminde görmez — onlar proje takviminde.
   */
  async kisiselTakvim(userId: string, from: string, to: string): Promise<ProjeEtkinligi[]> {
    aralikDogrula(from, to);
    const projeler = await this.uyeOlunanProjeler(userId);
    if (projeler.length === 0) return [];
    const [rows, sahip] = await Promise.all([this.etkinlikleriOku(projeler, from, to), this.projeSahipleri(projeler)]);
    return rows.map((r) => mapEvent(r, userId, sahip)).filter((e) => kisiselTakvimdeGorunurMu(e, userId));
  }

  async etkinlikEkle(projectId: string, userId: string, body: ProjeEtkinlikGirdisi): Promise<ProjeEtkinligi> {
    requireUuid(projectId, "Proje");
    await this.access.assertCanViewProject(projectId, userId);
    const row = await this.satirKur(projectId, body, null);

    const { data, error } = await this.supabase.client
      .from("project_calendar_events")
      .insert({ ...row, project_id: projectId, created_by: userId })
      .select(EVENT_SELECT)
      .single();
    if (error) throw error;

    const sahip = await this.projeSahipleri([projectId]);
    const etkinlik = mapEvent(data, userId, sahip);
    this.katilimcilariHaberdarEt(etkinlik, userId);
    return etkinlik;
  }

  async etkinlikGuncelle(eventId: string, userId: string, body: ProjeEtkinlikGirdisi): Promise<ProjeEtkinligi> {
    const mevcut = await this.duzenlenebilirEtkinlik(eventId, userId);
    const row = await this.satirKur(mevcut.project_id, body, mevcut);

    const { data, error } = await this.supabase.client
      .from("project_calendar_events")
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .select(EVENT_SELECT)
      .single();
    if (error) throw error;
    const sahip = await this.projeSahipleri([mevcut.project_id]);
    return mapEvent(data, userId, sahip);
  }

  async etkinlikSil(eventId: string, userId: string): Promise<{ ok: true }> {
    await this.duzenlenebilirEtkinlik(eventId, userId);
    const { error } = await this.supabase.client.from("project_calendar_events").delete().eq("id", eventId);
    if (error) throw error;
    return { ok: true };
  }

  // ------------------------------------------------------------ İç yardımcılar

  private async etkinlikleriOku(projeler: string[], from: string, to: string): Promise<any[]> {
    // Çok günlü etkinlik aralıktan önce başlayıp içine taşabilir: başlangıcı
    // `to`dan önce ve (bitişi ya da tek günse başlangıcı) `from`dan sonra olanlar.
    const { data, error } = await this.supabase.client
      .from("project_calendar_events")
      .select(EVENT_SELECT)
      .in("project_id", projeler)
      .lte("event_date", to)
      .or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`)
      .order("event_date", { ascending: true })
      .order("starts_at", { ascending: true, nullsFirst: true })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return data ?? [];
  }

  private async projeSahipleri(projeler: string[]): Promise<Map<string, string>> {
    const { data } = await this.supabase.client.from("projects").select("id, owner_id").in("id", projeler);
    return new Map((data ?? []).map((p: any) => [p.id, p.owner_id]));
  }

  private async uyeOlunanProjeler(userId: string): Promise<string[]> {
    const [sahip, uye] = await Promise.all([
      this.supabase.client.from("projects").select("id").eq("owner_id", userId).limit(LISTE_TAVANI),
      this.supabase.client
        .from("project_members")
        .select("project_id")
        .eq("user_id", userId)
        .eq("status", "approved")
        .limit(LISTE_TAVANI),
    ]);
    if (sahip.error) throw sahip.error;
    if (uye.error) throw uye.error;
    return [...new Set([...(sahip.data ?? []).map((p: any) => p.id), ...(uye.data ?? []).map((m: any) => m.project_id)])];
  }

  private async duzenlenebilirEtkinlik(eventId: string, userId: string): Promise<any> {
    requireUuid(eventId, "Etkinlik");
    const { data, error } = await this.supabase.client
      .from("project_calendar_events")
      .select("*, projects(owner_id)")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Etkinlik bulunamadı");
    // Önce görme yetkisi: projeden çıkarılmış eski yazan, etkinliğini artık
    // değiştiremez.
    await this.access.assertCanViewProject(data.project_id, userId);
    if (data.created_by !== userId && data.projects?.owner_id !== userId) {
      throw new ForbiddenException("Bu etkinliği yalnızca ekleyen kişi ya da proje sahibi değiştirebilir");
    }
    return data;
  }

  /**
   * Girdiyi doğrulayıp satıra çevirir. Güncellemede eksik alanlar mevcut
   * kayıttan tamamlanır: tüm gün ↔ saatli geçişi gibi alanların birbirine
   * bağlı olduğu durumlarda kısıt ancak birleşik kayıt üzerinde sınanabilir.
   */
  private async satirKur(projectId: string, body: ProjeEtkinlikGirdisi, mevcut: any | null): Promise<Record<string, unknown>> {
    const b = body ?? {};
    const row: Record<string, unknown> = {};

    if (b.title !== undefined || !mevcut) {
      const title = (b.title ?? "").trim().replace(/\s+/g, " ");
      if (!title) throw new BadRequestException("Etkinlik adı boş olamaz");
      if (title.length > TITLE_MAX) throw new BadRequestException("Etkinlik adı çok uzun");
      row.title = title;
    }
    if (b.note !== undefined) {
      const note = (b.note ?? "").trim();
      if (note.length > NOTE_MAX) throw new BadRequestException("Not çok uzun");
      row.note = note || null;
    }
    if (b.location !== undefined) {
      const location = (b.location ?? "").trim();
      if (location.length > LOCATION_MAX) throw new BadRequestException("Konum çok uzun");
      row.location = location || null;
    }
    if (b.kind !== undefined) {
      if (!PROJE_ETKINLIK_TURLERI.includes(b.kind)) throw new BadRequestException("Geçersiz etkinlik türü");
      row.kind = b.kind;
    }
    if (b.color !== undefined) {
      if (b.color && !HEX_COLOR.test(b.color)) throw new BadRequestException("Geçersiz renk");
      row.color = b.color || null;
    }
    if (b.participantIds !== undefined) {
      row.participant_ids = await this.katilimcilariDogrula(projectId, b.participantIds);
    }

    // Tarih/saat alanları birlikte değerlendirilir.
    const eventDate = b.eventDate ?? mevcut?.event_date?.slice?.(0, 10) ?? mevcut?.event_date;
    if (!eventDate) throw new BadRequestException("Etkinlik tarihi gerekli");
    tarihDogrula(eventDate);
    const allDay = b.allDay ?? mevcut?.all_day ?? false;

    if (allDay) {
      const endRaw = b.endDate !== undefined ? b.endDate : mevcut?.all_day ? mevcut?.end_date : null;
      const endDate = endRaw ? String(endRaw).slice(0, 10) : null;
      if (endDate) {
        tarihDogrula(endDate);
        if (endDate < eventDate) throw new BadRequestException("Bitiş günü başlangıçtan önce olamaz");
        if (daysBetween(eventDate, endDate) > ETKINLIK_GUN_TAVANI) {
          throw new BadRequestException("Etkinlik en fazla 60 gün sürebilir");
        }
      }
      Object.assign(row, {
        event_date: eventDate,
        end_date: endDate && endDate !== eventDate ? endDate : null,
        all_day: true,
        starts_at: null,
        ends_at: null,
      });
      return row;
    }

    const startsAt = b.startsAt ?? (mevcut?.starts_at ? formatTime(mevcut.starts_at) : null);
    const endsAt = b.endsAt ?? (mevcut?.ends_at ? formatTime(mevcut.ends_at) : null);
    if (!startsAt || !endsAt || !ISO_TIME.test(startsAt) || !ISO_TIME.test(endsAt)) {
      throw new BadRequestException("Başlangıç ve bitiş saati gerekli");
    }
    if (timeToMinutes(endsAt) <= timeToMinutes(startsAt)) {
      throw new BadRequestException("Bitiş saati başlangıçtan sonra olmalı");
    }
    Object.assign(row, { event_date: eventDate, end_date: null, all_day: false, starts_at: startsAt, ends_at: endsAt });
    return row;
  }

  /**
   * Katılımcı yalnızca projeyi görebilen biri olabilir. Aksi hâlde id'si
   * bilinen herhangi bir kullanıcıya, göremeyeceği bir projeden bildirim
   * gönderilebilir ve kişisel takvimine yabancı bir başlık düşürülebilirdi.
   */
  private async katilimcilariDogrula(projectId: string, ids: string[]): Promise<string[]> {
    if (!Array.isArray(ids)) throw new BadRequestException("Geçersiz katılımcı listesi");
    const tekil = [...new Set(ids)];
    if (tekil.length > KATILIMCI_TAVANI) throw new BadRequestException("Çok fazla katılımcı");
    for (const id of tekil) requireUuid(id, "Katılımcı");
    for (const id of tekil) {
      if (!(await this.access.canViewProject(projectId, id))) {
        throw new BadRequestException("Katılımcılar projenin ekibinden seçilmeli");
      }
    }
    return tekil;
  }

  private katilimcilariHaberdarEt(e: ProjeEtkinligi, yazan: string): void {
    const zaman = e.allDay ? e.eventDate : `${e.eventDate} ${e.startsAt}`;
    // Bildirim çağrısının içindeki her dize sözlük anahtarı sayılıyor (bkz.
    // scripts/dil-denetimi.mjs); boş yedek dışarıda kurulur.
    const proje = e.projectTitle ?? "";
    for (const kisi of e.participantIds) {
      if (kisi === yazan) continue;
      this.notifications.notifyUserSafe(
        kisi,
        "project_event",
        { metin: "Proje takvimine eklendin: {baslik}", params: { baslik: e.title } },
        { metin: "Proje: {proje} · {zaman}", params: { proje, zaman } },
        `/projects/${e.projectId}?tab=process&gorunum=takvim&tarih=${e.eventDate}`
      );
    }
  }
}

function tarihDogrula(value: string): void {
  try {
    parseDate(value);
  } catch {
    throw new BadRequestException("Geçersiz tarih");
  }
}

function aralikDogrula(from: string, to: string): void {
  tarihDogrula(from);
  tarihDogrula(to);
  if (to < from) throw new BadRequestException("Geçersiz tarih aralığı");
  if (daysBetween(from, to) > ARALIK_TAVANI_GUN) throw new BadRequestException("Tarih aralığı çok geniş");
}

function mapEvent(row: any, userId: string, sahipler: Map<string, string>): ProjeEtkinligi {
  const gun = (v: any) => (typeof v === "string" ? v.slice(0, 10) : v);
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle: row.projects?.title ?? undefined,
    title: row.title,
    note: row.note ?? undefined,
    location: row.location ?? undefined,
    kind: row.kind,
    eventDate: gun(row.event_date),
    endDate: row.end_date ? gun(row.end_date) : undefined,
    allDay: !!row.all_day,
    startsAt: row.starts_at ? formatTime(row.starts_at) : undefined,
    endsAt: row.ends_at ? formatTime(row.ends_at) : undefined,
    color: row.color ?? undefined,
    participantIds: row.participant_ids ?? [],
    createdBy: row.created_by ?? undefined,
    createdByName: row.users?.full_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    duzenlenebilir: row.created_by === userId || sahipler.get(row.project_id) === userId,
  };
}
