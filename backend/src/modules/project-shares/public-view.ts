import type { ProjectShareVisibility, PublicProjectTask } from "@projelio/shared";

/**
 * Görev satırlarını linki açan kişiye gidecek biçime çevirir.
 *
 * NEDEN AYRI VE SAF: burası paylaşımın en sızıntıya açık yeri. Görev satırı
 * veritabanından atanan kişinin adıyla birlikte geliyor (sayım ve sıralama için
 * aynı sorgu kullanılıyor) ve o adın yanıta girip girmemesi TEK BİR koşula
 * bakıyor. Servisin içinde, iki `if` arasında kalan bir satır olarak dursaydı
 * test edilemezdi; buradaki hâli test edilebilir (bkz. public-view.test.ts).
 *
 * KURAL: atanan adı yalnızca EKİP de paylaşılıyorsa gider. "Ekibi gösterme"
 * diyen sahibin, çalışanlarının adlarını görev kartlarından sızdırması olmaz.
 * Kullanıcı kimliği (assigned_to) hiçbir koşulda gitmez: linki açan kişinin
 * elinde bir Projelio kimliğiyle yapabileceği bir şey olmamalı.
 */
export function mapPublicTasks(rows: any[], visibility: ProjectShareVisibility): PublicProjectTask[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    startDate: row.start_date ?? undefined,
    deadline: row.deadline ?? undefined,
    completedAt: row.completed_at ?? undefined,
    outputId: row.output_id ?? undefined,
    assigneeName: visibility.team ? (row.assigned_user?.full_name ?? undefined) : undefined,
  }));
}
