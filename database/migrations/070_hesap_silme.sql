-- Hesap silme (KVKK m.11 / GDPR "silme hakkı").
--
-- Tasarımın tamamı ve NEDEN böyle olduğu: docs/hesap-silme.md
--
-- Kısaca: `users` satırı SİLİNMİYOR, anonimleştiriliyor. Sebebi şemada:
-- `users(id)`'ye 66 yabancı anahtar bakıyor; 36'sı `on delete cascade` ve
-- bunların arasında `projects.owner_id` ile `jobs.owner_id` var. Satırı gerçekten
-- silmek, o kişinin sahibi olduğu TÜM projeleri ve işleri — içindeki ekip
-- arkadaşlarının aylarca yaptığı işle birlikte — uçururdu. Anonimleştirme hiçbir
-- yabancı anahtarı kırmıyor: görev geçmişi, yorumlar ve bütçe kayıtları yerinde
-- kalıyor, ama kimlik bilgisi kalmıyor.
--
-- Bu yüzden şemada tek bir değişiklik yetiyor: hesabın silinmiş olduğunu
-- işaretleyecek bir sütun. Cascade kurallarına dokunmuyoruz.

alter table public.users
  add column if not exists deleted_at timestamp;

comment on column public.users.deleted_at is
  'Silme TALEBİNİN alındığı an. 30 günlük bekleme başlar: bu süre içinde kullanıcı aynı e-postayla giriş yapıp hesabını geri alabilir (veri hâlâ duruyor). Süre dolunca AccountPurgeProcessor kişisel veriyi siler ve satırı anonimleştirir — satır kendisine bağlı iş verisi kırılmasın diye tutulur. Bkz. docs/hesap-silme.md';

-- Giriş akışı her denemede bu sütuna bakıyor (AuthService.login), ayrıca yönetim
-- ekranları silinmiş hesapları listeden düşürüyor.
create index if not exists idx_users_deleted_at
  on public.users(deleted_at)
  where deleted_at is not null;
