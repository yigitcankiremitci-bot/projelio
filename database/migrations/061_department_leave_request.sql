-- 061_department_leave_request.sql
-- Son yöneticinin ayrılması şirket kurucusunun onayına bağlansın.
--
-- SORUN:
--   Kadrodan ayrılma eklendikten sonra (bkz. members "leave" uçları) bir
--   departmanın TEK yöneticisi de ayrılabiliyor. O anda departman yöneticisiz
--   kalıyor: kimse kadroya kişi davet edemiyor, bütçeye kayıt giremiyor, görev
--   yönetemiyor. Kullanıcı bunu fark etmeden yapıyor, sonucu organizasyon
--   sahibi günler sonra görüyor.
--
-- ÇÖZÜM:
--   Yeni bir tablo değil, mevcut durum makinesine yeni bir DURAK: 'leave_pending'.
--   Son yönetici ayrılmak istediğinde kaydı silinmez, bu duruma geçer ve
--   organizasyon sahibine bildirim gider. Sahip onaylarsa 'removed', reddederse
--   'approved' olur.
--
--   Ayrı bir "ayrılma talepleri" tablosu açmak, aynı ilişkinin durumunu iki
--   yerde tutmak olurdu; hangisinin doğru olduğu er ya da geç belirsizleşir.
--   Talep zaten üyeliğin bir hâli.
--
--   'leave_pending' YETKİ VERMEYE DEVAM EDER: kişi onay bekleyene kadar
--   yöneticidir. Aksi halde talebi açtığı anda departman zaten yöneticisiz
--   kalırdı — engellemeye çalıştığımız durumun ta kendisi.

alter table public.department_members
  drop constraint if exists department_members_status_check;

alter table public.department_members
  add constraint department_members_status_check
  check (status in ('invited', 'pending', 'approved', 'rejected', 'removed', 'leave_pending'));

comment on column public.department_members.status is
  'invited/pending/approved/rejected/removed + leave_pending: son yonetici ayrilma talebi, org sahibi onayi bekliyor.';

-- Benzersizlik kısıtları "removed olmayan tek kayıt" mantığıyla kurulmuştu
-- (bkz. 027); leave_pending de removed olmadığı için o kurala doğal olarak
-- uyuyor, indeksleri değiştirmek gerekmiyor.

-- Bekleyen talepleri org sahibinin panelinde hızlı bulmak için.
create index if not exists idx_department_members_leave_pending
  on public.department_members (department_id)
  where status = 'leave_pending';
