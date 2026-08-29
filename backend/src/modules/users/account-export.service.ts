import { Injectable } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { SupabaseService } from "../../database/supabase.service";
import { UsersService } from "./users.service";
import { SECTOR_LABEL, TEAM_SIZE_LABEL, USE_CASE_LABEL } from "@projelio/shared";

/**
 * Kullanıcının kendi verisinin Excel çıktısı.
 *
 * İKİ İŞE BİRDEN YARIYOR:
 *   1. KVKK m.11 / GDPR Art. 20 "verilerini yapılandırılmış ve makine tarafından
 *      okunabilir biçimde alma" hakkı — gizlilik politikasında zaten vaat edilmiş.
 *   2. Hesabını silmek isteyen kişi elinde bir dökümanla ayrılsın. Görev geçmişi
 *      ve bütçe kayıtları çoğu zaman kullanıcının tek kaydı; hiçbir şey almadan
 *      gitmek zorunda bırakmak gereksiz bir kayıp.
 *
 * KAPSAM AÇIKÇA YAZILI: dosyanın ilk sayfası neyin dahil olduğunu ve neyin
 * olmadığını listeliyor. Eksik bir dışa aktarmayı "verinizin tamamı" diye sunmak,
 * hiç sunmamaktan daha yanıltıcı olurdu.
 */
@Injectable()
export class AccountExportService {
  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService
  ) {}

  async buildWorkbook(userId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const user = await this.usersService.findById(userId);

    const [gorevler, isler, projeler, butce, yapilacaklar] = await Promise.all([
      this.gorevlerim(userId),
      this.islerim(userId),
      this.projelerim(userId),
      this.butceKayitlarim(userId),
      this.kisiselYapilacaklar(userId),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Projelio";
    wb.created = new Date();

    // --- Kapak: kapsam ---
    const kapak = wb.addWorksheet("Hakkında");
    kapak.columns = [{ width: 26 }, { width: 70 }];
    kapak.addRows([
      ["Projelio veri çıktısı", ""],
      ["Hesap", user?.email ?? ""],
      ["Ad soyad", user?.fullName ?? ""],
      ["Kullanıcı adı", user?.username ?? ""],
      ["Oluşturulma", new Date().toLocaleString("tr-TR")],
      ["", ""],
      // Profil/sihirbaz alanları da kişisel veri; KVKK çıktısı bunları da içermeli.
      // Boş olanlar da satır olarak kalıyor: kullanıcı neyin TUTULMADIĞINI da görsün.
      ["Profil bilgilerim", ""],
      ["Unvan", user?.title ?? ""],
      ["Kısa tanıtım", user?.bio ?? ""],
      ["Telefon", user?.phone ?? ""],
      ["Sektör", user?.sector ? SECTOR_LABEL[user.sector] : ""],
      ["Ekip büyüklüğü", user?.teamSize ? TEAM_SIZE_LABEL[user.teamSize] : ""],
      ["Kullanım amacı", (user?.useCases ?? []).map((u) => USE_CASE_LABEL[u]).join(", ")],
      ["Seçtiğim modüller", (user?.onboardingModules ?? []).join(", ")],
      ["", ""],
      ["Bu dosyada ne var", "Profil bilgilerin, sana atanmış görevler, sahibi olduğun işler ve projeler, kendi bütçe kayıtların, kişisel yapılacakların."],
      ["Bu dosyada ne YOK", "Ekip arkadaşlarının verisi, Drive/OneDrive'daki dosyaların (onlar kendi bulut hesabında duruyor), Lio sohbet geçmişi."],
    ]);
    kapak.getRow(1).font = { bold: true, size: 14 };

    this.sayfaEkle(wb, "Görevlerim", ["Başlık", "Durum", "Öncelik", "Bitiş", "Proje"], gorevler);
    this.sayfaEkle(wb, "İşlerim", ["Başlık", "Açıklama", "Oluşturulma"], isler);
    this.sayfaEkle(wb, "Projelerim", ["Başlık", "Durum", "Bitiş", "İş"], projeler);
    this.sayfaEkle(wb, "Bütçe kayıtlarım", ["Tür", "Tutar", "Açıklama", "Tarih"], butce);
    this.sayfaEkle(wb, "Kişisel yapılacaklar", ["Başlık", "Durum", "Bitiş"], yapilacaklar);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const tarih = new Date().toISOString().slice(0, 10);
    return { buffer, fileName: `projelio-verilerim-${tarih}.xlsx` };
  }

  /** Başlık satırı kalın, sütunlar içeriğe göre; boş sayfada açıklama. */
  private sayfaEkle(wb: ExcelJS.Workbook, ad: string, basliklar: string[], satirlar: unknown[][]): void {
    const ws = wb.addWorksheet(ad);
    ws.addRow(basliklar).font = { bold: true };
    ws.columns = basliklar.map(() => ({ width: 28 }));

    if (satirlar.length === 0) {
      ws.addRow(["Kayıt yok"]);
      return;
    }
    satirlar.forEach((s) => ws.addRow(s));
  }

  private async gorevlerim(userId: string): Promise<unknown[][]> {
    // Hem eski tek-atama sütunu hem çoklu atama tablosu: ikisi ayrışabiliyor
    // (bkz. common/access/subcontractor.ts'teki aynı not).
    const { data } = await this.supabase.client
      .from("tasks")
      .select("title, status, priority, deadline, projects(title), task_assignees(user_id), assigned_to")
      .is("archived_at", null);

    return (data ?? [])
      .filter(
        (t: any) => t.assigned_to === userId || (t.task_assignees ?? []).some((a: any) => a.user_id === userId)
      )
      .map((t: any) => [t.title, t.status, t.priority ?? "", t.deadline ?? "", t.projects?.title ?? ""]);
  }

  private async islerim(userId: string): Promise<unknown[][]> {
    const { data } = await this.supabase.client
      .from("jobs")
      .select("title, description, created_at")
      .eq("owner_id", userId);
    return (data ?? []).map((j: any) => [j.title, j.description ?? "", j.created_at ?? ""]);
  }

  private async projelerim(userId: string): Promise<unknown[][]> {
    const { data } = await this.supabase.client
      .from("projects")
      .select("title, status, deadline, jobs(title)")
      .eq("owner_id", userId);
    return (data ?? []).map((p: any) => [p.title, p.status ?? "", p.deadline ?? "", p.jobs?.title ?? ""]);
  }

  private async butceKayitlarim(userId: string): Promise<unknown[][]> {
    const { data } = await this.supabase.client
      .from("budget_transactions")
      .select("type, amount, description, occurred_at")
      .eq("owner_id", userId);
    return (data ?? []).map((b: any) => [b.type, Number(b.amount), b.description ?? "", b.occurred_at ?? ""]);
  }

  private async kisiselYapilacaklar(userId: string): Promise<unknown[][]> {
    const { data } = await this.supabase.client
      .from("personal_todos")
      .select("title, status, due_date")
      .eq("user_id", userId);
    return (data ?? []).map((t: any) => [t.title, t.status ?? "", t.due_date ?? ""]);
  }
}
