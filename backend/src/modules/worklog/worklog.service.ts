import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  MAX_WORK_LOG_MINUTES,
  sureyiDakikayaCevir,
  type WorkLogEntry,
  type WorkLogPushResult,
  type WorkLogSource,
  type WorkLogSummary,
  type WorkLogTargetKind,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { TasksService } from "../tasks/tasks.service";
import { BudgetService } from "../budget/budget.service";
import { ModuleRecordsService } from "../module-records/module-records.service";
import { PersonalTodosService } from "../personal-todos/personal-todos.service";

/**
 * YAPTIM — kullanıcının kişisel iş günlüğü.
 *
 * GÜVENLİK NOTU
 * -------------
 * personal_todos ile birebir aynı sınıf: RLS açık ama policy yok, erişim
 * yalnızca service_role ile — yani tam olarak bu dosyadan. Kullanıcı izolasyonu
 * TAMAMEN buranın sorumluluğu; buradaki her sorgu istisnasız `user_id` ile
 * filtrelenmek zorunda ve `userId` asla gövdeden/parametreden alınmaz, daima
 * `req.user.userId`'den gelir.
 *
 * BAĞLAMA (link) NEDEN YETKİ SORMUYOR
 * -----------------------------------
 * Bir kaydı bir projeye/göreve bağlamak, o kayda ERİŞİM VERMEZ ve hedeften
 * hiçbir bilgi OKUMAZ. Etiket (target_label) istemciden gelir; sunucu hedefin
 * adını sorgulamaz. Sebep: sorgulasaydı, erişimi olmayan bir uuid'yi bağlamayı
 * deneyen biri projenin adını öğrenebilirdi — kişisel bir nota iliştirilen
 * yer imi, bir bilgi sızıntısı kapısına dönerdi. Bağlantı yalnızca kullanıcının
 * kendi kaydında duran bir işarettir; hedefe gitmek, hedefin kendi yetki
 * kontrollerinden geçer.
 *
 * AKTARMA (push) İSE GERÇEK BİR YAZMADIR ve yetkiyi hedefin kendi servisi
 * uygular (TasksService, BudgetService, ModuleRecordsService…). Burada ikinci
 * bir kontrol yazmıyoruz: kopya yetki kuralı er ya da geç asıl kuralla ayrışır.
 */
@Injectable()
export class WorklogService {
  constructor(
    private supabase: SupabaseService,
    private tasksService: TasksService,
    private budgetService: BudgetService,
    private moduleRecordsService: ModuleRecordsService,
    private personalTodosService: PersonalTodosService
  ) {}

  // ------------------------------------------------------------------ Okuma

  /**
   * Kullanıcının kayıtları, yeniden eskiye.
   *
   * `from`/`to` GÜN sınırıdır (YYYY-MM-DD) ve `to` DAHİLDİR: kullanıcı "bugün"
   * derken bugünün 23:59'unu da kastediyor. Yarı açık aralık yazsaydık son
   * saatteki kayıtlar sessizce listeden düşerdi.
   */
  async list(
    userId: string,
    opts: { from?: string; to?: string; unlinkedOnly?: boolean; limit?: number } = {}
  ): Promise<WorkLogEntry[]> {
    let query = this.supabase.client
      .from("work_log_entries")
      .select("*")
      // Tek ve vazgeçilmez izolasyon filtresi.
      .eq("user_id", userId)
      .is("archived_at", null);

    if (opts.from) query = query.gte("done_at", gunBasi(opts.from));
    if (opts.to) query = query.lte("done_at", gunSonu(opts.to));
    if (opts.unlinkedOnly) query = query.is("target_kind", null);

    const { data, error } = await query
      .order("done_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(opts.limit ?? LISTE_TAVANI, LISTE_TAVANI));
    if (error) throw error;
    return (data ?? []).map(mapEntry);
  }

  /**
   * Aralığın özeti. Ayrı bir sorgu değil, listenin üzerinden hesaplanıyor:
   * gün/hafta/ay aralıklarında kayıt sayısı üç haneyi geçmiyor ve Postgres
   * tarafında ikinci bir gruplama sorgusu yazmaya değmiyor.
   *
   * SINIR: liste tavanı (LISTE_TAVANI) burada da geçerli. Aralık verilmezse
   * ve kullanıcının 500'den fazla kaydı varsa toplam yalnızca EN YENİ 500
   * kaydı kapsar. Sayfa varsayılan olarak "bugün" ile açıldığı ve en geniş
   * hazır aralık 30 gün olduğu için pratikte bu sınıra dayanılmıyor; gerçek
   * bir "tüm zamanlar toplamı" gerektiğinde doğru çözüm Postgres tarafında
   * gruplama, tavanı büyütmek değil.
   */
  async summary(userId: string, opts: { from?: string; to?: string } = {}): Promise<WorkLogSummary> {
    const entries = await this.list(userId, opts);
    const gunler = new Map<string, { entryCount: number; totalMinutes: number }>();

    let totalMinutes = 0;
    let withoutDurationCount = 0;
    let unlinkedCount = 0;

    for (const entry of entries) {
      const gun = entry.doneAt.slice(0, 10);
      const mevcut = gunler.get(gun) ?? { entryCount: 0, totalMinutes: 0 };
      mevcut.entryCount += 1;
      mevcut.totalMinutes += entry.durationMinutes ?? 0;
      gunler.set(gun, mevcut);

      totalMinutes += entry.durationMinutes ?? 0;
      if (!entry.durationMinutes) withoutDurationCount += 1;
      if (!entry.targetKind) unlinkedCount += 1;
    }

    return {
      from: opts.from ?? entries[entries.length - 1]?.doneAt.slice(0, 10) ?? bugun(),
      to: opts.to ?? entries[0]?.doneAt.slice(0, 10) ?? bugun(),
      entryCount: entries.length,
      totalMinutes,
      withoutDurationCount,
      unlinkedCount,
      days: [...gunler.entries()]
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  async findOne(userId: string, id: string): Promise<WorkLogEntry> {
    const { data, error } = await this.supabase.client
      .from("work_log_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapEntry(data);
  }

  // ------------------------------------------------------------------ Yazma

  async create(
    userId: string,
    body: {
      title?: string;
      note?: string;
      doneAt?: string;
      duration?: string | number | null;
      durationMinutes?: number | null;
      source?: WorkLogSource;
      targetKind?: WorkLogTargetKind | null;
      targetId?: string | null;
      targetLabel?: string | null;
    }
  ): Promise<WorkLogEntry> {
    const title = (body.title ?? "").trim();
    if (!title) throw new BadRequestException("Ne yaptığını yazman gerekiyor");

    const hedef = this.hedefiCozumle(body);
    const { data, error } = await this.supabase.client
      .from("work_log_entries")
      .insert({
        user_id: userId,
        title: title.slice(0, 255),
        note: body.note?.trim() || null,
        done_at: this.zamaniCozumle(body.doneAt),
        duration_minutes: this.sureyiCozumle(body),
        source: this.kaynagiCozumle(body.source),
        target_kind: hedef.targetKind,
        target_id: hedef.targetId,
        target_label: hedef.targetLabel,
        linked_at: hedef.targetKind ? yerelZamanDamgasi(new Date()) : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapEntry(data);
  }

  async update(
    userId: string,
    id: string,
    body: {
      title?: string;
      note?: string | null;
      doneAt?: string;
      duration?: string | number | null;
      durationMinutes?: number | null;
    }
  ): Promise<WorkLogEntry> {
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) throw new BadRequestException("Ne yaptığını yazman gerekiyor");
      patch.title = title.slice(0, 255);
    }
    if (body.note !== undefined) patch.note = body.note?.trim() || null;
    if (body.doneAt !== undefined) patch.done_at = this.zamaniCozumle(body.doneAt);
    if (body.duration !== undefined || body.durationMinutes !== undefined) {
      patch.duration_minutes = this.sureyiCozumle(body);
    }

    if (Object.keys(patch).length === 0) return this.findOne(userId, id);
    return this.yaz(userId, id, patch);
  }

  /** Kalıcı silme değil: arşivlenir. Gün dökümünden bir satırın sessizce kaybolması geri alınamaz olmamalı. */
  async archive(userId: string, id: string): Promise<{ ok: true }> {
    await this.yaz(userId, id, { archived_at: yerelZamanDamgasi(new Date()), timer_started_at: null });
    return { ok: true };
  }

  async restore(userId: string, id: string): Promise<WorkLogEntry> {
    const { data, error } = await this.supabase.client
      .from("work_log_entries")
      .update({ archived_at: null })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapEntry(data);
  }

  // -------------------------------------------------------------- Bağlantı

  /**
   * Kaydı bir yere iliştirir ya da (targetKind boşsa) bağlantıyı koparır.
   * Yetki sormaz — sebebi dosyanın başındaki nota bak.
   */
  async link(
    userId: string,
    id: string,
    body: { targetKind?: WorkLogTargetKind | null; targetId?: string | null; targetLabel?: string | null }
  ): Promise<WorkLogEntry> {
    const hedef = this.hedefiCozumle(body);
    return this.yaz(userId, id, {
      target_kind: hedef.targetKind,
      target_id: hedef.targetId,
      target_label: hedef.targetLabel,
      linked_at: hedef.targetKind ? yerelZamanDamgasi(new Date()) : null,
    });
  }

  // ------------------------------------------------------------ Kronometre

  /**
   * Kronometreyi başlatır. Aynı anda yalnızca bir kayıt ölçülebilir — kural
   * veritabanında kısmi tekil indeksle (bkz. migration 097). Burada önce
   * çalışan varsa DURDURUYORUZ: kullanıcı yeni işe geçtiğinde eskisinin
   * süresini kaybetmemeli, ama iki kronometreyle de baş başa kalmamalı.
   */
  async startTimer(userId: string, id: string): Promise<WorkLogEntry> {
    const calisan = await this.runningEntry(userId);
    if (calisan && calisan.id !== id) await this.stopTimer(userId, calisan.id);
    if (calisan && calisan.id === id) return calisan;
    return this.yaz(userId, id, { timer_started_at: yerelZamanDamgasi(new Date()) });
  }

  /**
   * Kronometreyi durdurur ve geçen süreyi kayıtlı süreye EKLER (üzerine yazmaz):
   * bir işe gün içinde iki kez dönmek yaygın ve ikinci ölçüm birincisini
   * silmemeli. Toplam tavanı aşarsa tavanda kalır — burada reddetmek,
   * kullanıcının ölçtüğü süreyi hiç kaydetmemek olurdu.
   */
  async stopTimer(userId: string, id: string): Promise<WorkLogEntry> {
    const entry = await this.findOne(userId, id);
    if (!entry.timerStartedAt) return entry;

    // İki damga da AYNI çerçevede (yerel duvar saati, saat dilimsiz) okunuyor;
    // ikisini de aynı yanlış ofsetle çözsek bile FARK doğru kalır. Türkiye
    // 2016'dan beri yaz saati uygulamıyor, yani aradaki tek risk de yok.
    const gecenDakika = Math.max(
      1,
      Math.round((naiveMs(yerelZamanDamgasi(new Date())) - naiveMs(entry.timerStartedAt)) / 60000)
    );
    const toplam = Math.min((entry.durationMinutes ?? 0) + gecenDakika, MAX_WORK_LOG_MINUTES);

    return this.yaz(userId, id, { timer_started_at: null, duration_minutes: toplam });
  }

  /** O an kronometresi çalışan kayıt (varsa). Sayfa açılışında gösteriliyor. */
  async runningEntry(userId: string): Promise<WorkLogEntry | null> {
    const { data, error } = await this.supabase.client
      .from("work_log_entries")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .not("timer_started_at", "is", null)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEntry(data) : null;
  }

  // --------------------------------------------------------------- Aktarma

  /**
   * Kaydı hedefte GERÇEK bir kayda dönüştürür ve sonucu kendisine bağlar.
   *
   * Yaptım'ın asıl amacı bu: "yaptım" demekle kalmayıp yapılan işi ait olduğu
   * deftere yazmak. Yetkiyi hedefin kendi servisi uyguluyor (bkz. dosya başı).
   */
  async push(
    userId: string,
    id: string,
    body: {
      kind?: string;
      projectId?: string;
      departmentId?: string;
      outputId?: string;
      organizationId?: string;
      moduleKey?: string;
      recordData?: Record<string, unknown>;
      amount?: number;
      transactionType?: "income" | "expense";
    }
  ): Promise<WorkLogPushResult> {
    const entry = await this.findOne(userId, id);

    switch (body.kind) {
      case "task": {
        if (!body.projectId && !body.departmentId) {
          throw new BadRequestException("Görev için proje ya da departman seçilmeli");
        }
        // Görev TAMAMLANMIŞ olarak açılır: bu iş zaten yapıldı. Açık bir görev
        // yaratmak, kullanıcıya bitirdiği işi bir de kapatma yükü bindirirdi.
        const veri = {
          title: entry.title,
          description: entry.note,
          status: "completed" as const,
          deadline: entry.doneAt,
          // Görevin tahmini süresi saat/gün cinsinden (dakika birimi yok);
          // ölçülen dakika saate çevriliyor, ondalık bir hane korunuyor:
          // 45 dakikalık bir iş "0 saat" diye kaydedilmemeli.
          estimatedDurationValue: entry.durationMinutes
            ? Math.max(0.1, Math.round((entry.durationMinutes / 60) * 10) / 10)
            : undefined,
          estimatedDurationUnit: entry.durationMinutes ? ("hours" as const) : undefined,
          outputId: body.outputId,
        };
        const task = body.projectId
          ? await this.tasksService.create(body.projectId, veri, userId)
          : await this.tasksService.createForDepartment(body.departmentId!, veri, userId);
        const linked = await this.link(userId, id, {
          targetKind: "task",
          targetId: task.id,
          targetLabel: task.title,
        });
        return {
          entry: linked,
          createdId: task.id,
          path: body.projectId ? `/projects/${body.projectId}` : `/departments/${body.departmentId}?tab=tasks`,
        };
      }

      case "personal_todo": {
        const todo = await this.personalTodosService.create(userId, {
          title: entry.title,
          description: entry.note,
          status: "completed",
        });
        const linked = await this.link(userId, id, {
          targetKind: "personal_todo",
          targetId: todo.id,
          targetLabel: todo.title,
        });
        return { entry: linked, createdId: todo.id, path: "/tasks" };
      }

      case "budget": {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException("Geçerli bir tutar gerekiyor");
        const veri = {
          type: body.transactionType ?? ("expense" as const),
          amount,
          description: entry.title,
          occurredAt: entry.doneAt.slice(0, 10),
        };
        // Üç kapı: proje defteri, departman defteri ve kullanıcının kendi
        // defteri (Anasayfa > Kasa). Hangisi olduğu seçime bağlı; her biri
        // kendi yetki kontrolünü yapıyor.
        const tx = body.projectId
          ? await this.budgetService.add(body.projectId, veri, userId)
          : body.departmentId
            ? await this.budgetService.addForDepartment(body.departmentId, veri, userId)
            : await this.budgetService.createForUser(userId, veri);
        const linked = await this.link(userId, id, {
          targetKind: "budget",
          targetId: tx.id,
          targetLabel: entry.title,
        });
        return {
          entry: linked,
          createdId: tx.id,
          path: body.projectId
            ? `/projects/${body.projectId}?tab=budget`
            : body.departmentId
              ? `/departments/${body.departmentId}?tab=budget`
              : "/?tab=budget",
        };
      }

      case "module_record": {
        if (!body.organizationId || !body.moduleKey) {
          throw new BadRequestException("Modül kaydı için şirket ve modül seçilmeli");
        }
        const record = await this.moduleRecordsService.create(
          body.organizationId,
          {
            departmentId: body.departmentId,
            moduleKey: body.moduleKey,
            // Alan adları MODÜLE GÖRE değişir (bkz. shared/moduleConfigs);
            // eşlemeyi istemci yapıyor, çünkü modülün alan tanımını o biliyor.
            // Buradaki varsayılan yalnızca hiçbir eşleme gelmediğinde devreye
            // girer ve genel amaçlı defterin anahtarlarını kullanır
            // (title/notes/date) — uydurma anahtar yazmak, defterde okunamayan
            // bir satır bırakırdı.
            data: body.recordData ?? {
              title: entry.title,
              ...(entry.note ? { notes: entry.note } : {}),
              date: entry.doneAt.slice(0, 10),
            },
          },
          userId
        );
        const linked = await this.link(userId, id, {
          targetKind: "module_record",
          targetId: record.id,
          targetLabel: entry.title,
        });
        return {
          entry: linked,
          createdId: record.id,
          path: `/organizations/${body.organizationId}`,
        };
      }

      default:
        throw new BadRequestException("Geçersiz aktarma hedefi");
    }
  }

  // ------------------------------------------------------------ Yardımcılar

  /** Sahiplik kontrolü tek yerde: sadece "id" ile güncellemek YETERLİ DEĞİL. */
  private async yaz(userId: string, id: string, patch: Record<string, unknown>): Promise<WorkLogEntry> {
    const { data, error } = await this.supabase.client
      .from("work_log_entries")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return mapEntry(data);
  }

  /**
   * Süre iki biçimde gelebilir: serbest metin ("1s 30dk", web kutusu ve Lio) ya
   * da doğrudan dakika. Metin anlaşılmazsa REDDEDİLİR — sessizce null yazmak,
   * kullanıcının girdiği süreyi kaybetmek olurdu.
   */
  private sureyiCozumle(body: { duration?: string | number | null; durationMinutes?: number | null }): number | null {
    const ham = body.duration !== undefined ? body.duration : body.durationMinutes;
    if (ham == null || ham === "") return null;
    const dakika = sureyiDakikayaCevir(ham);
    if (dakika == null) {
      throw new BadRequestException(
        `Süreyi anlayamadım. Örnek: "45", "1s 30dk", "2 saat". En fazla ${MAX_WORK_LOG_MINUTES / 60} saat.`
      );
    }
    return dakika;
  }

  /**
   * Kayıt zamanı — DAİMA yerel duvar saati olarak saklanır ("2026-09-10T14:30:00",
   * sonda Z YOK).
   *
   * NEDEN UTC DEĞİL: burası bir GÜN defteri ve tek soru "bu iş hangi gün
   * yapıldı". Sunucu UTC çalışıyor (bkz. ai-assistant.service AI_TIMEZONE
   * yorumu); gece 01:00'de girilen kayıt UTC'ye çevrilseydi bir önceki güne
   * düşer, kullanıcı sabah "dün ne yapmışım" derken bugünkü işini orada
   * bulurdu. Kolon zaten `timestamp` (saat dilimsiz) — saklanan şey duvar saati.
   */
  private zamaniCozumle(value: string | undefined): string {
    if (!value) return yerelZamanDamgasi(new Date());

    // Yalnızca gün verildiyse (YYYY-MM-DD) günün ortasına sabitliyoruz: saat
    // bilgisi olmayan bir kaydın gece yarısına oturması, en ufak kaymada onu
    // komşu güne taşır.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00`;

    // Saat dilimi taşıyan bir damga (…Z ya da +03:00) geldiyse yerel duvar
    // saatine çeviriyoruz; taşımıyorsa zaten yerel demektir, olduğu gibi kalır.
    if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
      const tarih = new Date(value);
      if (Number.isNaN(tarih.getTime())) throw new BadRequestException("Tarih anlaşılamadı");
      return yerelZamanDamgasi(tarih);
    }

    const yerel = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!yerel) throw new BadRequestException("Tarih anlaşılamadı");
    return `${yerel[1]}T${yerel[2]}:${yerel[3]}:${yerel[4] ?? "00"}`;
  }

  private kaynagiCozumle(value: string | undefined): WorkLogSource {
    return value === "lio" || value === "whatsapp" ? value : "manual";
  }

  private hedefiCozumle(body: {
    targetKind?: WorkLogTargetKind | null;
    targetId?: string | null;
    targetLabel?: string | null;
  }): { targetKind: string | null; targetId: string | null; targetLabel: string | null } {
    if (!body.targetKind) return { targetKind: null, targetId: null, targetLabel: null };
    if (!TARGET_KINDS.includes(body.targetKind)) throw new BadRequestException("Geçersiz bağlantı türü");
    if (!body.targetId) throw new BadRequestException("Bağlantı için hedef gerekli");
    return {
      targetKind: body.targetKind,
      targetId: body.targetId,
      targetLabel: body.targetLabel?.trim() || null,
    };
  }
}

const TARGET_KINDS: WorkLogTargetKind[] = [
  "task",
  "project",
  "job",
  "department",
  "operation",
  "output",
  "module_record",
  "budget",
  "personal_todo",
];

function mapEntry(row: any): WorkLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    note: row.note ?? undefined,
    doneAt: row.done_at,
    durationMinutes: row.duration_minutes ?? undefined,
    timerStartedAt: row.timer_started_at ?? undefined,
    source: row.source,
    targetKind: row.target_kind ?? undefined,
    targetId: row.target_id ?? undefined,
    targetLabel: row.target_label ?? undefined,
    linkedAt: row.linked_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Uygulamanın saat dilimi. Sunucu UTC çalışıyor; bu olmadan gece yarısından
 * sonraki her kayıt bir gün geriye kayardı (aynı gerekçe:
 * ai-assistant.service.ts AI_TIMEZONE).
 */
const WORKLOG_TIMEZONE = process.env.TZ?.trim() || "Europe/Istanbul";

/**
 * Anı, uygulamanın saat diliminde "YYYY-MM-DDTHH:MM:SS" duvar saatine çevirir.
 * `en-CA` bilerek: yıl-ay-gün sırasını veren tek yaygın yerel ayar.
 */
function yerelZamanDamgasi(tarih: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKLOG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(tarih)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/**
 * Saat dilimsiz damgayı karşılaştırılabilir bir sayıya çevirir. Mutlak değeri
 * ANLAMSIZDIR (sunucunun dilimine göre kayar); yalnızca aynı şekilde okunmuş
 * iki damganın FARKI için kullanılır.
 */
function naiveMs(damga: string): number {
  return new Date(damga.replace(/(Z|[+-]\d{2}:\d{2})$/, "")).getTime();
}

function bugun(): string {
  return yerelZamanDamgasi(new Date()).slice(0, 10);
}

/**
 * Gün sınırları. Kolon saat dilimsiz olduğu ve kayıtlar duvar saatiyle
 * yazıldığı için sınırlar da duvar saati: "bugün" = 00:00 – 23:59:59.
 * `to` DAHİLDİR — kullanıcı "bugün" derken 23:59'u da kastediyor.
 */
function gunBasi(gun: string): string {
  return `${gun}T00:00:00`;
}

function gunSonu(gun: string): string {
  return `${gun}T23:59:59.999`;
}
