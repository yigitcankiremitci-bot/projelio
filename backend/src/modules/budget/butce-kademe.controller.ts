import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ButceErisimService } from "./butce-erisim.service";
import { ButceHiyerarsiService } from "./butce-hiyerarsi.service";
import { ButceKademeService } from "./butce-kademe.service";

/**
 * İş / departman / şirket / holding bütçe sekmelerinin ortak ucu.
 *
 * TEK UÇ, DÖRT KADEME: `/budget/scope/job/:id`, `/budget/scope/group/:id` …
 * Ayrı ayrı uçlar (`/jobs/:id/budget`, `/groups/:id/budget`) yazılsaydı dört
 * kopya controller ve dört kopya yetki çağrısı olurdu; yeni bir kademe
 * eklendiğinde dördünü de düzenlemek gerekirdi.
 *
 * `scopeType` serbest metin değil: kapsamDogrula tanınmayan değeri 404 ile
 * kesiyor, yani `/budget/scope/users/...` gibi bir yol hiç çalışmıyor.
 */
@Controller("budget/scope/:scopeType/:scopeId")
@UseGuards(AuthGuard("jwt"))
export class ButceKademeController {
  constructor(
    private erisim: ButceErisimService,
    private kademe: ButceKademeService,
    private hiyerarsi: ButceHiyerarsiService
  ) {}

  /**
   * Sayfanın TÜM verisi: özet, T tablosu, grafik noktaları, hareketler, düzenli
   * ödemeler, onay kuyruğu ve isteyenin yetkisi.
   *
   * Tek uçtan gelmesi bilinçli — parçalara bölünseydi ekran bunları farklı
   * anlarda alır ve arada bir kayıt eklenirse kendi içinde çelişen bir tablo
   * gösterirdi (bkz. ButceHiyerarsiService.sayfa).
   */
  @Get()
  sayfa(@Param("scopeType") scopeType: string, @Param("scopeId") scopeId: string, @Req() req: any) {
    return this.hiyerarsi.sayfa(this.erisim.kapsamDogrula(scopeType), scopeId, req.user.userId);
  }

  /**
   * Hareket listesi.
   *
   * `?alt=1` alt kademeleri de katar — türev panellerin (Finansal Analiz gibi)
   * sorduğu şey "şirket bu dönemde ne kazandı" ve bunun cevabı yalnızca
   * şirkete elle girilen satırlarla verilemez. Varsayılan (parametresiz) hâli
   * yalnızca bu kademenin kendi kayıtları: ekranda düzenlenebilen satırlar.
   */
  @Get("transactions")
  hareketler(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Query("alt") alt: string | undefined,
    @Req() req: any
  ) {
    const kapsam = this.erisim.kapsamDogrula(scopeType);
    return alt === "1"
      ? this.hiyerarsi.tumHareketler(kapsam, scopeId, req.user.userId)
      : this.kademe.hareketler(kapsam, scopeId, req.user.userId);
  }

  @Post("transactions")
  ekle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.kademe.ekle(this.erisim.kapsamDogrula(scopeType), scopeId, body, req.user.userId);
  }

  // Kaydın DÜZENLENMESİ ve SİLİNMESİ burada değil, `/budget/transactions/:id`
  // ucunda: kaydın kademesi zaten satırın kendisinde yazılı ve tek kapıdan
  // geçmesi, kuralın ikinci bir kopyasının çıkmasını engelliyor
  // (bkz. BudgetService.assertCanManageTransaction).

  // ------------------------------------------------- Düzenli gelir/giderler

  @Post("recurring")
  duzenliEkle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.kademe.duzenliEkle(this.erisim.kapsamDogrula(scopeType), scopeId, body, req.user.userId);
  }

  @Patch("recurring/:id")
  duzenliGuncelle(@Param("id") id: string, @Body() body: any, @Req() req: any) {
    return this.kademe.duzenliGuncelle(id, body, req.user.userId);
  }

  @Delete("recurring/:id")
  duzenliSil(@Param("id") id: string, @Req() req: any) {
    return this.kademe.duzenliSil(id, req.user.userId);
  }

  // ---------------------------------------------- Bütçeyi görebilen kişiler

  /**
   * Listeyi yalnızca sahibi/yöneticisi görebilir: "bu defteri kimler görüyor"
   * sorusunun cevabı da hassas bir bilgidir.
   */
  @Get("viewers")
  viewers(@Param("scopeType") scopeType: string, @Param("scopeId") scopeId: string, @Req() req: any) {
    return this.erisim.viewers(scopeType, scopeId, req.user.userId);
  }

  @Post("viewers")
  viewerEkle(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Body() body: { userId: string; canManage?: boolean },
    @Req() req: any
  ) {
    return this.erisim.addViewer(scopeType, scopeId, body.userId, !!body.canManage, req.user.userId);
  }

  @Delete("viewers/:userId")
  viewerSil(
    @Param("scopeType") scopeType: string,
    @Param("scopeId") scopeId: string,
    @Param("userId") hedefUserId: string,
    @Req() req: any
  ) {
    return this.erisim.removeViewer(scopeType, scopeId, hedefUserId, req.user.userId);
  }
}
