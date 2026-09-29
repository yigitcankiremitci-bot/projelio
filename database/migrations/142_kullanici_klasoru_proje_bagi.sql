-- Proje klasörünün altında açılan kullanıcı klasörü project_id'yi üst klasörden
-- miras alır (files.service.ts createFolder: yoksa projeye eklenmiş ekip üyesi
-- kendi açtığı klasörü göremiyor). Ama 090'daki kısıt 'user' için project_id'nin
-- BOŞ olmasını şart koşuyordu; sonuç: proje > Dosyalar > Klasör ekle her seferinde
-- 23514 ile düşüyor, kullanıcı yalnızca "Beklenmeyen bir hata oluştu" görüyordu.
-- 'user' artık bir projeye bağlı olabilir; görev/çıktı bağı yine yasak.
alter table public.file_folders drop constraint if exists file_folders_kind_target;
alter table public.file_folders
  add constraint file_folders_kind_target check (
    (kind = 'general' and project_id is null and task_id is null and output_id is null) or
    (kind = 'user'    and task_id is null and output_id is null) or
    (kind = 'project' and project_id is not null and task_id is null and output_id is null) or
    (kind = 'task'    and task_id    is not null and output_id is null) or
    (kind = 'output'  and output_id  is not null and task_id   is null)
  );
