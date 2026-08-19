-- 052_backfill_unassigned_project_tasks.sql
-- Atanmamış proje görevlerini proje sahibine atar (tek seferlik veri düzeltmesi).
--
-- SORUN:
--   Yapılacaklar sayfasının kaynağı v_personal_board görünümü; "assigned" kolu
--   yalnızca `tasks.assigned_to = board_user_id` satırlarını üretiyor. Görev
--   oluştururken atama alanı boş bırakıldığında `assigned_to` null kalıyordu, bu
--   yüzden kullanıcı KENDİ işindeki projeye eklediği görevi Yapılacaklar'da hiç
--   göremiyordu — görev projede duruyor ama kişisel panoda yok.
--
-- ÇÖZÜM:
--   İki parça: (1) bundan sonrası için sunucu tarafında atama yapılmadığında
--   görev oluşturana atanıyor (bkz. tasks.service.ts createForProject);
--   (2) halihazırdaki atanmamış görevler için bu geriye dönük düzeltme.
--
-- KAPSAM — bilinçli olarak dar tutuldu:
--   * Yalnızca PROJE görevleri. Departman görevlerinde "atanmamış" gerçek bir
--     durumdur: yönetici ekibin alacağı işi sahipsiz açar; onları yöneticiye
--     atamak yanlış olurdu. Rutin (operation) görevleri de tekrar kurallarından
--     otomatik doğduğu için dışarıda.
--   * Yalnızca arşivlenmemiş ve tamamlanmamış görevler. Kapanmış geçmişi
--     yeniden yazmanın kimseye faydası yok; tamamlanmış bir göreve şimdi sahip
--     yazmak "kim yaptı" bilgisini de uydurmak olurdu.
--   * Hedef: projenin sahibi; yoksa projenin bağlı olduğu işin sahibi. İkisi de
--     yoksa (sahipsiz artık kayıt) görev olduğu gibi bırakılır.
--
-- Idempotent: yalnızca assigned_to IS NULL satırlara dokunur, tekrar
-- çalıştırıldığında eşleşen satır kalmaz.

update public.tasks t
set assigned_to = coalesce(p.owner_id, j.owner_id)
from public.projects p
left join public.jobs j on j.id = p.job_id
where t.project_id = p.id
  and t.assigned_to is null
  and t.archived_at is null
  and t.status <> 'completed'
  and coalesce(p.owner_id, j.owner_id) is not null;

-- Kaç satırın düzeldiğini görmek için (çalıştırmadan önce/sonra):
--   select count(*) from public.tasks t
--     join public.projects p on p.id = t.project_id
--    where t.assigned_to is null and t.archived_at is null and t.status <> 'completed';
