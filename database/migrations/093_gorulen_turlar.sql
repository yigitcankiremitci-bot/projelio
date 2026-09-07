-- 093_gorulen_turlar.sql
-- Görülen eğitim turları: hangi tur kullanıcıya bir kez gösterildi.
--
-- SORUN:
--   Tur ilerlemesi yalnızca localStorage'daydı (projelio_tour_seen_v1). Yani
--   "görüldü" bilgisi kullanıcıya değil TARAYICIYA aitti: işteki bilgisayarda
--   turu bitiren kişi evdeki tarayıcıda, telefonda ya da gizli sekmede aynı
--   eğitimle yeniden karşılaşıyordu. Kullanıcı açısından uygulama, kendisini
--   her seferinde unutan bir şey gibi görünüyordu.
--
-- ÇÖZÜM:
--   Kolon kullanıcıda. Onboarding sihirbazının zaten sunucuda tutulduğu yerle
--   (users.onboarding_completed_at) aynı mantık: "bu kişiye bir kez gösterildi"
--   kararı kişinin kendisine yazılır.
--
-- NEDEN text[] (jsonb değil):
--   İçerik düz bir tur kimliği listesi; users.use_cases ve
--   users.onboarding_modules da aynı biçimde tutuluyor.
--
-- NULL = "hiç tur görülmedi". Boş diziyle aynı anlama geliyor ama mevcut
-- satırların hepsini geriye dönük doldurmak gerekmiyor.

alter table public.users
  add column if not exists tours_seen text[];

comment on column public.users.tours_seen is
  'Kullaniciya bir kez gosterilmis egitim turlarinin kimlikleri. NULL = hic tur gorulmedi.';
