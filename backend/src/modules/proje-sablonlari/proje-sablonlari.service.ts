import { randomUUID } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  HAZIR_SABLONLAR,
  HAZIR_SABLON_ONEKI,
  PROJE_ICERIGI_SURUMU,
  PROJE_PARCALARI,
  SABLON_TAVANLARI,
  gunFarki,
  gunKaydir,
  icerigiDogrula,
  icerigiSuz,
  parcalariTemizle,
  sablonaCevir,
  yeniBitis,
  type ProjeIcerigi,
  type ProjeSablonu,
  type Project,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { CreationRequestsService } from "../creation-requests/creation-requests.service";
import { MembersService } from "../members/members.service";
import { ProjectsService } from "../projects/projects.service";

const COVER_BUCKET = "project-covers";
const TARIH = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Proje klonlama + proje şablonları (migration 194, model shared projeSablonu.ts).
 *
 * İki akış aynı iki adımdan geçer: bir projeden İÇERİK çıkar (`icerikCikar`),
 * içeriği yeni bir projeye YAZ (`icerigiYaz`). Klonda içerik doğrudan yazılır;
 * şablonda önce `proje_sablonlari`'na saklanır, sonra istenince yazılır.
 *
 * Yazarken görevler bilerek TasksService/OutputsService'ten geçmiyor (bkz.
 * OrnekIsService başlığı): oradaki yan etkiler (her görev için ekibe "yeni
 * görev" bildirimi, atama bildirimi) kopyada bir bildirim seli olurdu. Ekip
 * ise MembersService.addMember'dan geçer: Drive paylaşımları orada eşitleniyor
 * ve ekibe eklenen kişinin haber alması doğru.
 *
 * Kurallar (kullanıcı kararları, 2026-11-10):
 * - Yeni proje HER ZAMAN `active` doğar ve bütün görevler `todo`: biten bir
 *   proje klonlanınca tamamlanmış görevler de yeni projenin yapılacakları
 *   olarak girer. (Durum kopyalansaydı müze tetikleyicisi `completed` bir
 *   satırda yeni projeye hemen plaket basardı.)
 * - Atama seçilmediyse görevler klonlayana/şablonu açana atanır — görevler
 *   doğrudan onun Yapılacaklar listesine düşer.
 * - Tarihler yeni başlangıca kayar: her tarih kaynak başlangıca göre gün
 *   farkıyla saklanır, yeni başlangıca o farkla eklenir.
 */
@Injectable()
export class ProjeSablonlariService {
  private readonly logger = new Logger(ProjeSablonlariService.name);

  constructor(
    private supabase: SupabaseService,
    private access: AccessService,
    private creationRequests: CreationRequestsService,
    private members: MembersService,
    private projects: ProjectsService
  ) {}

  // ─────────────────────────────────────────────────────────── Klonlama

  async klonla(
    userId: string,
    govde: { projectId?: string; jobId?: string; title?: string; startDate?: string; parcalar?: unknown }
  ): Promise<Project> {
    const projectId = String(govde.projectId ?? "");
    if (!projectId) throw new BadRequestException("Klonlanacak proje seçilmedi");
    await this.access.assertCanViewProject(projectId, userId);
    const { data: kaynak } = await this.supabase.client.from("projects").select("job_id").eq("id", projectId).maybeSingle();
    if (!kaynak) throw new NotFoundException("Proje bulunamadı");

    const parcalar = parcalariTemizle(govde.parcalar);
    const icerik = icerigiSuz(await this.icerikCikar(projectId), parcalar);
    return this.icerigiYaz(userId, {
      jobId: govde.jobId || kaynak.job_id,
      title: govde.title,
      startDate: govde.startDate,
      icerik,
      kapakKaynagi: parcalar.has("kapak") ? icerik.kapak : undefined,
    });
  }

  // ─────────────────────────────────────────────────────────── Şablonlar

  /** Bakanın kullanabildiği şablonlar: hazırlar + kendi kişiselleri + çalıştığı şirketlerinkiler. */
  async liste(userId: string): Promise<ProjeSablonu[]> {
    const db = this.supabase.client;
    const sirketler = await this.access.calistigiSirketler(userId);
    const secim = "*, organizations(name), users(full_name)";
    const [kisisel, sirket] = await Promise.all([
      db.from("proje_sablonlari").select(secim).eq("kapsam", "kisisel").eq("olusturan_id", userId).order("created_at", { ascending: false }),
      sirketler.length
        ? db.from("proje_sablonlari").select(secim).eq("kapsam", "sirket").in("organization_id", sirketler).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    // Tablo yoksa (migration 194 uygulanmadan) hazır şablonlar yine çalışsın.
    if (kisisel.error) this.logger.warn(`Şablonlar okunamadı: ${kisisel.error.message}`);
    const satirlar = [...(kisisel.data ?? []), ...(sirket.data ?? [])];
    const yonettigi = await this.yonettigiSirketler(userId, satirlar.map((r: any) => r.organization_id));
    return [
      ...satirlar.map((r: any) => this.mapSablon(r, userId, yonettigi)),
      ...HAZIR_SABLONLAR.map((s) => ({ ...s, silebilir: false })),
    ];
  }

  /** Şirket şablonu kaydedebileceği şirketler (sahip ya da departman yöneticisi). */
  async sirketSecenekleri(userId: string): Promise<{ id: string; name: string }[]> {
    const ids = await this.access.calistigiSirketler(userId);
    const yonettigi = await this.yonettigiSirketler(userId, ids);
    if (!yonettigi.size) return [];
    const { data } = await this.supabase.client.from("organizations").select("id, name").in("id", [...yonettigi]).order("name");
    return (data ?? []).map((o: any) => ({ id: o.id, name: o.name }));
  }

  async kaydet(
    userId: string,
    govde: { projectId?: string; ad?: string; aciklama?: string; kapsam?: string; organizationId?: string; parcalar?: unknown }
  ): Promise<ProjeSablonu> {
    const projectId = String(govde.projectId ?? "");
    if (!projectId) throw new BadRequestException("Şablona çevrilecek proje seçilmedi");
    const ad = String(govde.ad ?? "").trim().slice(0, SABLON_TAVANLARI.baslik);
    if (!ad) throw new BadRequestException("Şablonun adı boş olamaz");
    await this.access.assertCanViewProject(projectId, userId);

    const kapsam = govde.kapsam === "sirket" ? "sirket" : "kisisel";
    let organizationId: string | null = null;
    if (kapsam === "sirket") {
      organizationId = String(govde.organizationId ?? "");
      const erisim = organizationId ? await this.access.organizationAccess(organizationId, userId) : null;
      if (!erisim || (erisim.role !== "owner" && erisim.role !== "department_manager")) {
        throw new ForbiddenException("Şirket şablonunu yalnızca şirketin sahibi ya da bir departman yöneticisi kaydedebilir");
      }
    }

    // Varsayılan: şablonda var olan bütün parçalar.
    const parcalar = parcalariTemizle(
      Array.isArray(govde.parcalar) ? govde.parcalar : PROJE_PARCALARI.filter((p) => p.sablondaVar).map((p) => p.anahtar),
      true
    );
    const icerik = sablonaCevir(icerigiSuz(await this.icerikCikar(projectId), parcalar));
    // Yüklenmiş kapak kaynak projenin klasöründe: o proje kapağını değiştirince
    // silinir ve şablon ölü bir adrese işaret ederdi. Hazır renk/desenler kalır.
    if (icerik.kapak?.includes(`/${COVER_BUCKET}/`)) icerik.kapak = undefined;

    const { data, error } = await this.supabase.client
      .from("proje_sablonlari")
      .insert({
        ad,
        aciklama: String(govde.aciklama ?? "").trim().slice(0, SABLON_TAVANLARI.metin) || null,
        kapsam,
        organization_id: organizationId,
        olusturan_id: userId,
        kaynak_proje_id: projectId,
        icerik,
      })
      .select("*, organizations(name), users(full_name)")
      .single();
    if (error) throw error;
    return this.mapSablon(data, userId, new Set(organizationId ? [organizationId] : []));
  }

  async sil(userId: string, id: string): Promise<void> {
    if (id.startsWith(HAZIR_SABLON_ONEKI)) throw new BadRequestException("Hazır şablonlar silinemez");
    const sablon = await this.okuSatir(id, userId);
    const yonettigi = await this.yonettigiSirketler(userId, [sablon.organization_id]);
    if (!this.silebilirMi(sablon, userId, yonettigi)) throw new ForbiddenException("Bu şablonu silemezsin");
    const { error } = await this.supabase.client.from("proje_sablonlari").delete().eq("id", id);
    if (error) throw error;
  }

  /** Şablondan yeni proje. Şablonda kişi olmadığı için atama/ekip parçaları yoktur. */
  async kullan(
    userId: string,
    id: string,
    govde: { jobId?: string; title?: string; startDate?: string; parcalar?: unknown }
  ): Promise<Project> {
    const sablon = id.startsWith(HAZIR_SABLON_ONEKI)
      ? HAZIR_SABLONLAR.find((s) => s.id === id)
      : this.mapSablon(await this.okuSatir(id, userId), userId, new Set());
    if (!sablon) throw new NotFoundException("Şablon bulunamadı");
    const parcalar = parcalariTemizle(
      Array.isArray(govde.parcalar) ? govde.parcalar : PROJE_PARCALARI.filter((p) => p.sablondaVar).map((p) => p.anahtar),
      true
    );
    const icerik = icerigiSuz(sablon.icerik, parcalar);
    return this.icerigiYaz(userId, {
      jobId: govde.jobId,
      title: govde.title || sablon.ad,
      startDate: govde.startDate,
      icerik,
      kapakKaynagi: parcalar.has("kapak") ? icerik.kapak : undefined,
    });
  }

  // ─────────────────────────────────────────────────────────── İçerik çıkarma

  /** Projenin iskeleti; tarihler projenin başlangıcına göre gün. Arşivlenmiş kayıtlar alınmaz. */
  private async icerikCikar(projectId: string): Promise<ProjeIcerigi> {
    const db = this.supabase.client;
    const { data: p, error } = await db.from("projects").select("*").eq("id", projectId).maybeSingle();
    if (error) throw error;
    if (!p) throw new NotFoundException("Proje bulunamadı");
    const bas: string = String(p.start_date).slice(0, 10);
    const gun = (t: string | null | undefined) => (t ? gunFarki(bas, String(t).slice(0, 10)) : null);

    const [ciktilar, gorevler, etkinlikler, ekip] = await Promise.all([
      db.from("outputs").select("id, title, description, sort_order").eq("project_id", projectId).is("archived_at", null).order("sort_order"),
      db
        .from("tasks")
        .select("*")
        .eq("project_id", projectId)
        .is("archived_at", null)
        .order("sort_order")
        .limit(SABLON_TAVANLARI.gorev),
      db.from("project_calendar_events").select("*").eq("project_id", projectId).order("event_date").limit(SABLON_TAVANLARI.etkinlik),
      db.from("project_members").select("user_id, role").eq("project_id", projectId).eq("status", "approved"),
    ]);
    for (const s of [ciktilar, gorevler]) if (s.error) throw s.error;

    const gorevSatirlari = gorevler.data ?? [];
    const gorevIds = gorevSatirlari.map((g: any) => g.id);
    const [atamalar, bagimliliklar] = gorevIds.length
      ? await Promise.all([
          db.from("task_assignees").select("task_id, user_id").in("task_id", gorevIds),
          db.from("task_dependencies").select("task_id, depends_on_task_id").in("task_id", gorevIds),
        ])
      : [{ data: [] as any[] }, { data: [] as any[] }];
    const atananlar = new Map<string, string[]>();
    for (const a of atamalar.data ?? []) atananlar.set(a.task_id, [...(atananlar.get(a.task_id) ?? []), a.user_id]);

    const saat = (t: unknown) => (typeof t === "string" ? t.slice(0, 5) : null);
    // Önce ana görevler, sonra alt görevler: içerikte sıra korunur.
    const sirali = [...gorevSatirlari.filter((g: any) => !g.parent_task_id), ...gorevSatirlari.filter((g: any) => g.parent_task_id)];
    return icerigiDogrula({
      surum: PROJE_ICERIGI_SURUMU,
      aciklama: p.description ?? undefined,
      toplamButce: Number(p.total_budget ?? 0) || undefined,
      sureGun: Math.max(1, gunFarki(bas, String(p.deadline).slice(0, 10))),
      kapak: p.cover_image_url ?? undefined,
      ciktilar: (ciktilar.data ?? []).map((c: any) => ({ ref: c.id, baslik: c.title, aciklama: c.description ?? undefined })),
      gorevler: sirali.map((g: any) => ({
        ref: g.id,
        ustRef: g.parent_task_id ?? undefined,
        ciktiRef: g.output_id ?? undefined,
        baslik: g.title,
        aciklama: g.description ?? undefined,
        oncelik: g.priority ?? 0,
        baslangicGun: gun(g.start_date),
        bitisGun: gun(g.deadline) ?? 0,
        saat: saat(g.deadline_time),
        tahminiSure:
          g.estimated_duration_value && g.estimated_duration_unit
            ? { deger: Number(g.estimated_duration_value), birim: g.estimated_duration_unit }
            : null,
        butce: Number(g.budget ?? 0) > 0 ? { tutar: Number(g.budget), birim: g.budget_currency ?? "TRY" } : null,
        atananlar: atananlar.get(g.id) ?? (g.assigned_to ? [g.assigned_to] : []),
      })),
      bagimliliklar: (bagimliliklar.data ?? []).map((b: any) => ({ gorevRef: b.task_id, oncekiRef: b.depends_on_task_id })),
      etkinlikler: (etkinlikler.data ?? []).map((e: any) => ({
        baslik: e.title,
        not: e.note ?? undefined,
        yer: e.location ?? undefined,
        tur: e.kind,
        gun: gun(e.event_date) ?? 0,
        bitisGun: gun(e.end_date),
        tumGun: !!e.all_day,
        baslangicSaati: saat(e.starts_at),
        bitisSaati: saat(e.ends_at),
        renk: e.color,
      })),
      ekip: (ekip.data ?? []).filter((m: any) => m.role !== "owner").map((m: any) => m.user_id),
    });
  }

  // ─────────────────────────────────────────────────────────── Yazma

  private async icerigiYaz(
    userId: string,
    a: { jobId?: string; title?: string; startDate?: string; icerik: ProjeIcerigi; kapakKaynagi?: string }
  ): Promise<Project> {
    const jobId = String(a.jobId ?? "");
    if (!jobId) throw new BadRequestException("Projenin açılacağı iş seçilmedi");
    const title = String(a.title ?? "").trim().slice(0, SABLON_TAVANLARI.baslik);
    if (!title) throw new BadRequestException("Projenin adı boş olamaz");
    const baslangic = a.startDate && TARIH.test(a.startDate) ? a.startDate : new Date().toISOString().slice(0, 10);

    // Taşeron başkasının işine proje açarken onay talebinden geçer (bkz.
    // ProjectsController.create). Talep yalnızca başlık/tarih taşıyor; görev
    // ağacını bekletecek bir yer yok — bu yüzden kopya/şablon yolu ona kapalı.
    if (await this.creationRequests.requiresApproval("project", userId, { jobId })) {
      throw new ForbiddenException("Bu işe proje açmak onay istiyor; kopya ya da şablondan açılamaz. Projeyi Yeni proje ile iste.");
    }
    await this.access.assertCanViewJob(jobId, userId);

    const { icerik } = a;
    const db = this.supabase.client;
    const { data: proje, error: projeHatasi } = await db
      .from("projects")
      .insert({
        owner_id: userId,
        job_id: jobId,
        title,
        description: icerik.aciklama ?? null,
        total_budget: icerik.toplamButce ?? 0,
        start_date: baslangic,
        deadline: yeniBitis(baslangic, icerik),
      })
      .select("*")
      .single();
    if (projeHatasi) throw projeHatasi;

    try {
      await this.altKayitlariYaz(proje.id, userId, baslangic, icerik);
      const kapak = await this.kapakKopyala(proje.id, a.kapakKaynagi);
      if (kapak) await db.from("projects").update({ cover_image_url: kapak }).eq("id", proje.id);
    } catch (hata) {
      // Yarım proje bırakma: görevlerin yarısı yazılmış bir kopya, kullanıcının
      // "neden eksik" diye aramasına yol açardı. Görev/çıktı/etkinlik zincirleme gider.
      await db.from("projects").delete().eq("id", proje.id);
      throw hata;
    }

    // Ekip: atama seçildiyse atananlar da ekibe girer — yoksa atandıkları
    // görevin projesini göremezlerdi. Hata yutuluyor: bir kişi eklenemedi diye
    // (ör. hesabı silinmiş) proje geri alınmamalı.
    const kisiler = new Set<string>([...(icerik.ekip ?? []), ...icerik.gorevler.flatMap((g) => g.atananlar ?? [])]);
    kisiler.delete(userId);
    for (const kisi of kisiler) {
      await this.members.addMember(proje.id, kisi, "member", undefined, userId).catch((err) => this.logger.warn(`Kopya projeye ekip üyesi eklenemedi (${kisi}): ${String(err)}`));
    }

    return this.projects.findOne(proje.id, userId);
  }

  private async altKayitlariYaz(projectId: string, userId: string, baslangic: string, icerik: ProjeIcerigi): Promise<void> {
    const db = this.supabase.client;
    const tarih = (gun: number | null | undefined) => (gun == null ? null : gunKaydir(baslangic, gun));

    // Çıktılar: dönüş sırası garanti değil, sort_order ile eşlenir (bkz. OrnekIsService).
    const ciktiId = new Map<string, string>();
    if (icerik.ciktilar.length) {
      const { data, error } = await db
        .from("outputs")
        .insert(icerik.ciktilar.map((c, i) => ({ project_id: projectId, title: c.baslik, description: c.aciklama ?? null, sort_order: i })))
        .select("id, sort_order");
      if (error) throw error;
      const sirada = new Map((data ?? []).map((r: any) => [r.sort_order as number, r.id as string]));
      icerik.ciktilar.forEach((c, i) => ciktiId.set(c.ref, sirada.get(i)!));
    }

    const satir = (g: ProjeIcerigi["gorevler"][number], sira: number, ustId: string | null) => {
      const atananlar = g.atananlar?.length ? g.atananlar : [userId];
      return {
        project_id: projectId,
        parent_task_id: ustId,
        output_id: g.ciktiRef ? ciktiId.get(g.ciktiRef) ?? null : null,
        sort_order: sira,
        title: g.baslik,
        description: g.aciklama ?? null,
        priority: g.oncelik ?? 0,
        start_date: tarih(g.baslangicGun),
        deadline: tarih(g.bitisGun),
        deadline_time: g.saat ?? null,
        estimated_duration_value: g.tahminiSure?.deger ?? null,
        estimated_duration_unit: g.tahminiSure?.birim ?? null,
        budget: g.butce?.tutar ?? 0,
        budget_currency: g.butce?.birim ?? "TRY",
        assigned_to: atananlar[0],
        // Biten projenin tamamlanmış görevleri de yeni projenin yapılacakları.
        status: "todo",
      };
    };

    const gorevId = new Map<string, string>();
    const anaGorevler = icerik.gorevler.filter((g) => !g.ustRef);
    if (anaGorevler.length) {
      const { data, error } = await db
        .from("tasks")
        .insert(anaGorevler.map((g, i) => satir(g, i, null)))
        .select("id, sort_order");
      if (error) throw error;
      const sirada = new Map((data ?? []).map((r: any) => [r.sort_order as number, r.id as string]));
      anaGorevler.forEach((g, i) => gorevId.set(g.ref, sirada.get(i)!));
    }
    const altGorevler = icerik.gorevler.filter((g) => g.ustRef && gorevId.has(g.ustRef));
    if (altGorevler.length) {
      // Alt görevin sırası üstü içinde; eşleme (üst, sıra) çiftiyle.
      const sayac = new Map<string, number>();
      const satirlar = altGorevler.map((g) => {
        const ustId = gorevId.get(g.ustRef!)!;
        const sira = sayac.get(ustId) ?? 0;
        sayac.set(ustId, sira + 1);
        return { g, ustId, sira };
      });
      const { data, error } = await db
        .from("tasks")
        .insert(satirlar.map((s) => satir(s.g, s.sira, s.ustId)))
        .select("id, parent_task_id, sort_order");
      if (error) throw error;
      const anahtar = (ust: string, sira: number) => `${ust}#${sira}`;
      const bulunan = new Map((data ?? []).map((r: any) => [anahtar(r.parent_task_id, r.sort_order), r.id as string]));
      for (const s of satirlar) gorevId.set(s.g.ref, bulunan.get(anahtar(s.ustId, s.sira))!);
    }

    // Atama tablosu (bkz. 055): Yapılacaklar ve sabah özeti buradan okuyor.
    // Bildirim BİLEREK yok — bkz. sınıf başlığı.
    const atamalar = icerik.gorevler.flatMap((g) => {
      const id = gorevId.get(g.ref);
      if (!id) return [];
      const kisiler = [...new Set(g.atananlar?.length ? g.atananlar : [userId])];
      return kisiler.map((k) => ({ task_id: id, user_id: k, assigned_by: userId }));
    });
    if (atamalar.length) {
      const { error } = await db.from("task_assignees").insert(atamalar);
      if (error) throw error;
    }

    const baglar = icerik.bagimliliklar
      .map((b) => ({ task_id: gorevId.get(b.gorevRef), depends_on_task_id: gorevId.get(b.oncekiRef), created_by: userId }))
      .filter((b) => b.task_id && b.depends_on_task_id && b.task_id !== b.depends_on_task_id);
    if (baglar.length) {
      const { error } = await db.from("task_dependencies").insert(baglar);
      if (error) throw error;
    }

    if (icerik.etkinlikler.length) {
      const { error } = await db.from("project_calendar_events").insert(
        icerik.etkinlikler.map((e) => ({
          project_id: projectId,
          created_by: userId,
          title: e.baslik,
          note: e.not ?? null,
          location: e.yer ?? null,
          kind: e.tur,
          event_date: tarih(e.gun),
          end_date: e.tumGun ? tarih(e.bitisGun) : null,
          all_day: e.tumGun,
          starts_at: e.tumGun ? null : e.baslangicSaati,
          ends_at: e.tumGun ? null : e.bitisSaati,
          color: e.renk ?? null,
        }))
      );
      if (error) throw error;
    }
  }

  /**
   * Kapak: yüklenmiş görsel YENİ projenin klasörüne kopyalanır. Aynı adres
   * paylaşılsaydı kaynak proje kapağını değiştirdiğinde eski dosya silinir
   * (bkz. ProjectsService.uploadCover → removeStaleUploadsInFolder), kopyanın
   * kapağı kırılırdı. Hazır renk/desen değerleri olduğu gibi yazılır.
   */
  private async kapakKopyala(projectId: string, kapak?: string): Promise<string | null> {
    if (!kapak) return null;
    const isaret = `/${COVER_BUCKET}/`;
    const konum = kapak.indexOf(isaret);
    if (konum < 0) return kapak;
    const kaynakYol = decodeURIComponent(kapak.slice(konum + isaret.length).split("?")[0]);
    const uzanti = kaynakYol.split(".").pop() || "jpg";
    const hedefYol = `${projectId}/${randomUUID()}.${uzanti}`;
    const { error } = await this.supabase.client.storage.from(COVER_BUCKET).copy(kaynakYol, hedefYol);
    if (error) {
      this.logger.warn(`Kapak kopyalanamadı (${kaynakYol}): ${error.message}`);
      return null;
    }
    return this.supabase.publicStorageUrl(COVER_BUCKET, hedefYol);
  }

  // ─────────────────────────────────────────────────────────── Yardımcılar

  /** Görme kuralıyla birlikte okur: görülemeyen şablon ile olmayan şablon ayırt edilmez. */
  private async okuSatir(id: string, userId: string): Promise<any> {
    const { data } = await this.supabase.client
      .from("proje_sablonlari")
      .select("*, organizations(name), users(full_name)")
      .eq("id", id)
      .maybeSingle();
    if (!data) throw new NotFoundException("Şablon bulunamadı");
    const gorur =
      data.kapsam === "kisisel"
        ? data.olusturan_id === userId
        : (await this.access.calistigiSirketler(userId)).includes(data.organization_id);
    if (!gorur) throw new NotFoundException("Şablon bulunamadı");
    return data;
  }

  private async yonettigiSirketler(userId: string, orgIds: (string | null | undefined)[]): Promise<Set<string>> {
    const sonuc = new Set<string>();
    for (const id of new Set(orgIds.filter((x): x is string => !!x))) {
      const erisim = await this.access.organizationAccess(id, userId).catch(() => null);
      if (erisim && (erisim.role === "owner" || erisim.role === "department_manager")) sonuc.add(id);
    }
    return sonuc;
  }

  private silebilirMi(r: any, userId: string, yonettigi: Set<string>): boolean {
    if (r.olusturan_id === userId) return true;
    return r.kapsam === "sirket" && yonettigi.has(r.organization_id);
  }

  private mapSablon(r: any, userId: string, yonettigi: Set<string>): ProjeSablonu {
    return {
      id: r.id,
      ad: r.ad,
      aciklama: r.aciklama ?? undefined,
      kapsam: r.kapsam,
      organizationId: r.organization_id ?? undefined,
      organizationName: r.organizations?.name ?? undefined,
      olusturanId: r.olusturan_id ?? undefined,
      olusturanAdi: r.users?.full_name ?? undefined,
      createdAt: r.created_at,
      icerik: icerigiDogrula(r.icerik),
      silebilir: this.silebilirMi(r, userId, yonettigi),
    };
  }
}
