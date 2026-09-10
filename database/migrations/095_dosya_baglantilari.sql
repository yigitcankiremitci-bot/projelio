-- 095_dosya_baglantilari.sql
-- Dosya bağlantıları: bir dosyayı bir göreve, kişiye ya da modül kaydına iliştirmek.
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
--   Kişi ve modül kaydı için ise hiçbir yol yoktu — o kolonlar hiç yok.
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
-- HEDEF NEDEN POLİMORFİK (üç ayrı tablo değil):
--   Üç hedef türünün de tek bir davranışı var: "bağla, listele, kopar". Ayrı
--   tablolar üç kopya sorgu ve üç kopya yetki kontrolü demekti; aradaki fark er
--   ya da geç büyürdü. Bunun bedeli, referans bütünlüğünü FK ile
--   kuramamak — bu yüzden hedef silindiğinde bağlantı satırı ARTIKTA KALIR.
--   Zararsız: listeleme her zaman hedeften dosyaya doğru okunuyor, silinmiş bir
--   hedefin satırını kimse sormuyor. Yine de temizlik için türe göre indeks var.
--
-- 'user' HEDEFİ ERİŞİM VERMEZ:
--   Bir dosyayı birine bağlamak, o kişiye dosyayı GÖSTERMEZ. Görebilmesi için
--   dosyanın kapsamına (iş/departman/şirket) zaten erişimi olmalı; listeleme her
--   satırı tek tek o kontrolden geçiriyor (bkz. FileLinksService). Bağlantıyı
--   erişim kapısı yapmak, Drive izinleriyle Projelio izinlerinin ayrışması
--   demekti: kullanıcı Projelio'da görüp bulutta açamazdı.

create table if not exists public.file_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files(id) on delete cascade,
  target_kind text not null check (target_kind in ('task', 'user', 'module_record')),
  target_id uuid not null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamp not null default now()
);

comment on table public.file_links is
  'Dosyanin gorev/kisi/modul kaydina iliştirilmesi. Dosya sahipligine ve klasorune dokunmaz.';
comment on column public.file_links.target_kind is
  'task | user | module_record. Hedef tablolara FK YOK (polimorfik); silinen hedefin satiri artikta kalir.';

-- Aynı dosyayı aynı hedefe ikinci kez bağlamak yeni satır açmasın: kullanıcı
-- için "bağla" iki kez tıklanabilir bir düğme ve ikincisi bir hata değil.
create unique index if not exists file_links_uniq
  on public.file_links(file_id, target_kind, target_id);

-- Asıl sorgu: "bu görevin/kişinin/kaydın dosyaları". Listeleme hep bu yönde.
create index if not exists file_links_target_idx
  on public.file_links(target_kind, target_id);

-- Dosya silinirken satırlar cascade ile gidiyor; bu indeks dosya ekranındaki
-- "bu dosya nereye bağlı" rozetini besliyor.
create index if not exists file_links_file_idx on public.file_links(file_id);
