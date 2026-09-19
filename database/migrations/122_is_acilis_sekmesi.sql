-- 122_is_acilis_sekmesi.sql
-- İş sayfasının açılış sekmesi (her iş için ayrı)
--
-- NE VARDI
-- --------
-- İş sayfası her zaman "Projeler" sekmesiyle açılıyordu. Yalnızca görev
-- yönetimi yapan (İşler sekmesinde yaşayan) ya da yalnızca bütçe tutan biri
-- işe her girişinde önce proje kartlarını görüp sekme değiştirmek zorundaydı.
--
-- NE DEĞİŞİYOR
-- -----------
-- Departmanlardaki `default_tab`in (bkz. 032) iş karşılığı. İş sahibi iş
-- ayarlarından seçer; tercih İŞE aittir, kullanıcıya değil — aynı kişinin bir
-- işi bütçe, diğeri görevlerle açılabilsin diye.
--
-- NEDEN CHECK YOK
-- ---------------
-- 091'deki gerekçe: sekme kümesi arayüzle birlikte değişiyor, her yeni sekme
-- bir migration daha gerektirirdi. Doğrulama sunucuda
-- (bkz. JobsService.update — ENTITY_TAB_KEYS.job).
--
-- Varsayılan 'projects' — mevcut işlerin hiçbirinde davranış değişmez.

alter table public.jobs add column if not exists default_tab varchar not null default 'projects';

comment on column public.jobs.default_tab is
  'İş sayfası açıldığında gelecek sekme. İş sahibi iş ayarlarından değiştirir; kapatılmış bir sekmeyse sayfa Projeler''e düşer.';
