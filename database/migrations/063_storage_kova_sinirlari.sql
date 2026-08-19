-- 063_storage_kova_sinirlari.sql
--
-- Storage kovalarına boyut ve tür sınırı koyar.
--
-- NEDEN. Kapak/avatar kovalarının hepsi PUBLIC ve hiçbirinde sınır yoktu.
-- Asıl açık şuydu: uygulama, yüklenen dosyanın türünü ve uzantısını doğrudan
-- İSTEMCİDEN alıyordu (`file.mimetype`, `file.originalname`). İkisi de
-- uydurulabilir olduğu için giriş yapmış bir kullanıcı, içeriği HTML olan bir
-- dosyayı "kapak görseli" diye yükleyip kendi alan adımızın altında kalıcı
-- URL'li bir sayfa barındırabilirdi.
--
-- Asıl düzeltme uygulama katmanındadır: backend/src/common/upload-image.util.ts
-- dosyanın ilk baytlarındaki imzaya bakarak türü TESPİT eder, istemcinin
-- iddiasını yok sayar. Bu migration ikinci katmandır — uygulama katmanı bir gün
-- atlanırsa (yeni bir uç nokta, doğrudan service_role çağrısı) kova yine reddeder.
--
-- Değerler uygulama katmanıyla BİREBİR aynı seçildi (multer 8 MB + kabul edilen
-- 4 tür), bu yüzden bugün çalışan hiçbir akış değişmez. Mevcut 29 nesnenin
-- tamamı image/jpeg veya image/png; hiçbiri bu sınırların dışında kalmıyor.

update storage.buckets
set file_size_limit = 8 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
where id in ('avatars', 'department-covers', 'group-covers', 'job-covers',
             'organization-covers', 'product-covers', 'project-covers');

-- social-publish farklıdır: doğrudan yükleme almaz. Medya Drive/OneDrive'dan
-- gelir ve Instagram Reels için VİDEO olabilir. Boyut sınırı BİLEREK
-- konulmuyor — büyük bir video yayını kırılmasın. Tür kısıtı yine de kovanın
-- rastgele dosya barındırmasını engeller.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'video/*']
where id = 'social-publish';

-- Not: kovalar PUBLIC kalmaya devam ediyor, çünkü kapak görselleri
-- getPublicUrl() ile arayüzde gösteriliyor. Nesne yolları rastgele UUID
-- (`<kayıt-id>/<uuid>.<uzantı>`) olduğu için adresi bilmeyen biri numara
-- deneyerek bulamaz.
