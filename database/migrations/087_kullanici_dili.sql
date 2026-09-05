-- 087_kullanici_dili.sql
-- Arayüz dili tercihi: Projelio'nun İngilizce sürümü.
--
-- NEDEN KOLON (localStorage yerine): dil yalnızca arayüzü ilgilendirse
-- tarayıcıda tutmak yeterdi. Ama kullanıcıya ulaşan metinlerin bir kısmını
-- SUNUCU üretiyor — doğrulama/şifre sıfırlama e-postaları, push bildirimleri,
-- günlük özet ve Lio'nun yanıtları. Bunlar tarayıcı açık değilken de gidiyor,
-- yani sunucunun kullanıcının dilini kendi başına bilmesi gerekiyor.
--
-- NEDEN NULL SERBEST: null "kullanıcı henüz seçim yapmadı" demektir, "Türkçe"
-- değil. Seçim yapılmamışken dil tarayıcıdan (web) ya da Accept-Language
-- başlığından (e-posta/bildirim) çıkarılıyor. Varsayılanı 'tr' yapsaydık
-- İngilizce konuşan yeni bir kullanıcı, hiçbir yere dokunmadığı hâlde açıkça
-- "Türkçe istiyorum" demiş sayılır ve otomatik algılama hiç çalışmazdı.
--
-- Kolon dolduğu an tarayıcı diline bir daha bakılmaz: açık seçim örtük
-- tahmini her zaman yener.

alter table public.users
  add column if not exists locale text;

-- Desteklenmeyen bir dil kodu, o kullanıcının arayüzünü sözlüğü olmayan bir
-- dile düşürürdü; kısıtı burada koyuyoruz ki hatalı yazım veritabanına hiç
-- girmesin. Yeni dil eklenirken bu kısıt da genişletilmeli.
alter table public.users
  drop constraint if exists users_locale_check;

alter table public.users
  add constraint users_locale_check
  check (locale is null or locale in ('tr', 'en'));

comment on column public.users.locale is
  'Arayuz dili: tr | en. NULL ise kullanici secim yapmamistir ve dil tarayicidan (web) ya da Accept-Language basligindan (e-posta/bildirim) cikarilir.';
