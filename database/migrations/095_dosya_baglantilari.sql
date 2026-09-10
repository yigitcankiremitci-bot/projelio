-- 095_dosya_baglantilari.sql
-- Bağlantılar: bir DOSYAYI ya da KLASÖRÜ bir göreve, kişiye ya da modül
-- kaydına iliştirmek.
--
-- SORUN:
--   Bir dosyanın nerede görüneceğini SAHİPLİĞİ belirliyordu. `files.task_id`
--   dolu ise dosya o görevin ekindeydi; boşsa değildi. Bunun iki sonucu vardı:
--
--     1. Bir dosya yalnızca TEK bir yere iliştirilebiliyordu. Aynı sözleşme hem
--        "Teklif hazırla" görevine hem de müşteri kaydına asılamıyordu.
--     2. İliştirmek TAŞIMAK demekti: klasöründe duran bir dosyayı bir göreve
--        bağlamak, onu klasöründen koparıyordu. Kullanıcı dosyayı bir daha
--        koyduğu yerde bulamıyordu.
--
--   Kişi ve modül kaydı için ise hiçbir yol yoktu — o kolonlar hiç yok. Klasör
--   iliştirmenin de hiçbir karşılığı yoktu, oysa "şu görevin bütün belgeleri"
--   çoğu zaman tek tek dosyalar değil bir KLASÖR.
--
-- MODEL:
--   Ayrı bir kenar tablosu (bkz. migration 094'teki aynı gerekçe). Dosya
--   SAHİPLİĞİNE dokunulmuyor: `files.job_id/department_id/organization_id` ve
--   `folder_id` olduğu gibi kalıyor, dosya klasöründen çıkmıyor. Bağlantı yalnızca
--   "bu dosya şurada da görünsün" demek.
--
--   `files.task_id` KALDIRILMADI. Görev ekranından yüklenen dosya hâlâ o kolona
--   yazılıyor ve görevin ekleri iki kaynağın birleşimi: kolon + bu tablo. Kolonu
--   göç ettirmek, çalışan bir akışı bu özellik uğruna riske atmak olurdu.
--
-- KAYNAK NEDEN İKİ KOLON (file_id / folder_id):
--   İkisi de gerçek tablolara işaret ediyor, yani ikisi de FK olabiliyor ve
--   silinen dosya/klasörün bağlantısı cascade ile gidiyor. Hedef tarafında bu
--   mümkün değil (aşağıya bakın); kaynakta mümkünken vazgeçmenin sebebi yok.
--   `files` ve `file_folders` tablolarındaki "üçünden tam biri" deseninin aynısı.
--
-- HEDEF NEDEN POLİMORFİK (üç ayrı tablo değil):
--   Üç hedef türünün de tek bir davranışı var: "bağla, listele, kopar". Ayrı
--   tablolar üç kopya sorgu ve üç kopya yetki kontrolü demekti; aradaki fark er
--   ya da geç büyürdü. Bunun bedeli, referans bütünlüğünü FK ile
--   kuramamak — bu yüzden hedef silindiğinde bağlantı satırı ARTIKTA KALIR.
--   Zararsız: listeleme her zaman hedeften dosyaya doğru okunuyor, silinmiş bir
--   hedefin satırını kimse sormuyor. Yine de temizlik için türe göre indeks var.
--
-- 'user' HEDEFİ ERİŞİM VERMEZ:
--   Bir dosyayı ya da klasörü birine bağlamak, o kişiye onu GÖSTERMEZ. Görebilmesi için
--   dosyanın kapsamına (iş/departman/şirket) zaten erişimi olmalı; listeleme her
--   satırı tek tek o kontrolden geçiriyor (bkz. FileLinksService). Bağlantıyı
--   erişim kapısı yapmak, Drive izinleriyle Projelio izinlerinin ayrışması
--   demekti: kullanıcı Projelio'da görüp bulutta açamazdı.

create table if not exists public.file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references public.files(id) on delete cascade,
  folder_id uuid references public.file_folders(id) on delete cascade,
  target_kind text not null check (target_kind in ('task', 'user', 'module_record')),
  target_id uuid not null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamp not null default now(),
  constraint file_links_kaynak check (num_nonnulls(file_id, folder_id) = 1)
);

comment on table public.file_links is
  'Dosya ya da klasorun gorev/kisi/modul kaydina iliştirilmesi. Sahipligie ve klasor agacina dokunmaz.';
comment on column public.file_links.folder_id is
  'Kaynak bir KLASOR ise dolu. file_id ile birlikte tam biri dolu olur.';
comment on column public.file_links.target_kind is
  'task | user | module_record. Hedef tablolara FK YOK (polimorfik); silinen hedefin satiri artikta kalir.';

-- Aynı kaynağı aynı hedefe ikinci kez bağlamak yeni satır açmasın: kullanıcı
-- için "bağla" iki kez tıklanabilir bir düğme ve ikincisi bir hata değil.
--
-- İKİ AYRI KISMİ İNDEKS: kaynak kolonlarından biri her zaman NULL ve NULL'lar
-- tekillikte birbirine eşit sayılmıyor — tek bir üçlü indeks klasör satırlarını
-- hiç denetlemezdi.
create unique index if not exists file_links_file_uniq
  on public.file_links(file_id, target_kind, target_id) where file_id is not null;
create unique index if not exists file_links_folder_uniq
  on public.file_links(folder_id, target_kind, target_id) where folder_id is not null;

-- Asıl sorgu: "bu görevin/kişinin/kaydın dosyaları". Listeleme hep bu yönde.
create index if not exists file_links_target_idx
  on public.file_links(target_kind, target_id);

-- Kaynak silinirken satırlar cascade ile gidiyor; bu indeksler dosya
-- ekranındaki "bu nereye bağlı" sorgusunu besliyor.
create index if not exists file_links_file_idx on public.file_links(file_id) where file_id is not null;
create index if not exists file_links_folder_idx on public.file_links(folder_id) where folder_id is not null;
