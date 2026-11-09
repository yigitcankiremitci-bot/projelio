import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { PersonalBoardSource } from "@projelio/shared";
import { PersonalTodosService } from "./personal-todos.service";
import { YapilacakListeleriService } from "./yapilacak-listeleri.service";

/**
 * Yapılacaklar sayfası: kullanıcının kişisel kanban panosu.
 *
 * Buradaki hiçbir uç nokta kullanıcı kimliğini gövdeden/parametreden almaz;
 * daima `req.user.userId` kullanılır. Kişisel görevler kullanıcının kimseyle
 * paylaşmadığı kayıtlar olduğu için bu kural istisnasızdır.
 */
@Controller("todos")
@UseGuards(AuthGuard("jwt"))
export class PersonalTodosController {
  constructor(
    private personalTodosService: PersonalTodosService,
    private listeler: YapilacakListeleriService
  ) {}

  // ── Listeler (migration 185). "todos/:id" ile çakışmasın diye ondan önce. ──

  @Get("listeler")
  listeleriGetir(@Req() req: any) {
    return this.listeler.listele(req.user.userId);
  }

  @Post("listeler")
  listeOlustur(@Req() req: any, @Body("ad") ad: unknown) {
    return this.listeler.olustur(req.user.userId, ad);
  }

  @Patch("listeler/:listeId")
  listeAdlandir(@Req() req: any, @Param("listeId", ParseUUIDPipe) listeId: string, @Body("ad") ad: unknown) {
    return this.listeler.adlandir(req.user.userId, listeId, ad);
  }

  @Delete("listeler/:listeId")
  listeSil(@Req() req: any, @Param("listeId", ParseUUIDPipe) listeId: string) {
    return this.listeler.sil(req.user.userId, listeId);
  }

  @Post("listeler/:listeId/ekle")
  listeyeEkle(@Req() req: any, @Param("listeId", ParseUUIDPipe) listeId: string, @Body("ogeler") ogeler: { source?: string; itemId?: string }[]) {
    return this.listeler.ekle(req.user.userId, listeId, Array.isArray(ogeler) ? ogeler : []);
  }

  @Post("listeler/:listeId/cikar")
  listedenCikar(@Req() req: any, @Param("listeId", ParseUUIDPipe) listeId: string, @Body("ogeler") ogeler: { source?: string; itemId?: string }[]) {
    return this.listeler.cikar(req.user.userId, listeId, Array.isArray(ogeler) ? ogeler : []);
  }

  @Get("board")
  getBoard(
    @Req() req: any,
    @Query("source") source?: string,
    @Query("includeHidden") includeHidden?: string,
    @Query("completedWithinDays") completedWithinDays?: string
  ) {
    return this.personalTodosService.getBoard(req.user.userId, {
      source: (source as PersonalBoardSource | "all") ?? "all",
      includeHidden: includeHidden === "true",
      completedWithinDays: completedWithinDays ? Number(completedWithinDays) : undefined,
    });
  }

  // NOT: "todos/:id" ile çakışmasın diye ondan önce tanımlı.
  // Bu ikisi, proje/departman kanbanlarındaki PATCH /tasks/:id/status ve
  // PATCH /tasks/reorder ile aynı sözleşmeyi taşır; sayfa da aynı TaskColumn
  // bileşenini kullandığı için ikisi birebir eşleşmeli.
  @Patch("status")
  setStatus(@Req() req: any, @Body() body: { source?: string; itemId?: string; status?: string }) {
    return this.personalTodosService.setStatus(req.user.userId, body);
  }

  @Patch("reorder")
  reorder(@Req() req: any, @Body("items") items: { source?: string; itemId?: string }[]) {
    return this.personalTodosService.reorder(req.user.userId, items);
  }

  /**
   * Panodaki atanan bir kartın TAM görev kaydı. Görev düzenleyicisi eksik bir
   * kayıtla açılırsa kaydederken atanan kişi/bütçe/süre alanlarını siler.
   */
  @Get("assigned/:taskId")
  findAssignedTask(@Req() req: any, @Param("taskId") taskId: string) {
    return this.personalTodosService.findAssignedTask(req.user.userId, taskId);
  }

  /** Atanan görevin yalnızca kullanıcıya görünen alanları. tasks tablosuna dokunmaz. */
  @Patch("assigned/:taskId/prefs")
  updateAssignedPrefs(
    @Req() req: any,
    @Param("taskId") taskId: string,
    @Body() body: { personalNote?: string | null; personalDueDate?: string | null; isPinned?: boolean; isHidden?: boolean }
  ) {
    return this.personalTodosService.updateAssignedPrefs(req.user.userId, taskId, body);
  }

  @Post()
  create(
    @Req() req: any,
    @Body() body: { title?: string; description?: string; status?: any; priority?: number; color?: string; dueDate?: string; listeId?: string }
  ) {
    return this.personalTodosService.create(req.user.userId, body).then(async (todo) => {
      // Açık listeden eklenen kart o listeye girsin; liste yoksa ya da başkasınınsa kart yine açılır.
      if (body.listeId) await this.listeler.ekle(req.user.userId, body.listeId, [{ source: "personal", itemId: todo.id }]).catch(() => undefined);
      return todo;
    });
  }

  /**
   * Kartın tam kaydı. Pano satırı (v_personal_board) hatırlatma ön süresini
   * taşımıyor; düzenleyici onu buradan okur, yoksa açılışta "Hatırlatma yok"
   * görünür ve kaydet dendiğinde kurulu hatırlatma sessizce silinirdi.
   */
  @Get(":id")
  findOne(@Req() req: any, @Param("id") id: string) {
    return this.personalTodosService.findOne(req.user.userId, id);
  }

  @Patch(":id")
  update(@Req() req: any, @Param("id") id: string, @Body() body: any) {
    return this.personalTodosService.update(req.user.userId, id, body);
  }

  /**
   * Kişisel görevi bir projeye ya da departmana bağlar: aynı alanlarla gerçek
   * bir görev açılır (kullanıcıya atanmış olarak), kişisel kayıt arşivlenir.
   * Yanıt yeni görevin tam kaydıdır — sayfa düzenleyiciyi onunla açar.
   */
  @Post(":id/promote")
  promote(@Req() req: any, @Param("id") id: string, @Body() body: { projectId?: string; departmentId?: string }) {
    return this.personalTodosService.promote(req.user.userId, id, body ?? {});
  }

  /** Kalıcı silmez, arşivler — yanlışlıkla silme geri alınabilsin diye. */
  @Delete(":id")
  archive(@Req() req: any, @Param("id") id: string) {
    return this.personalTodosService.archive(req.user.userId, id);
  }

  @Patch(":id/restore")
  restore(@Req() req: any, @Param("id") id: string) {
    return this.personalTodosService.restore(req.user.userId, id);
  }
}
