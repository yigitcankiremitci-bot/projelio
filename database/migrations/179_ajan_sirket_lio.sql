-- 179_ajan_sirket_lio.sql
-- Ajan şirketi Projelio'dan tanısın, işlem gerektiren işi Lio'ya devretsin.
--
-- Kullanıcının isteği (2026-11-02): ajan şirketin Projelio'daki varlığını
-- (şirketler, bilgi kartı, departmanlar, işler, projeler, ürünler, müşteriler)
-- ayrıntılı öğrensin; ama işlem yapmak için görevi Lio'ya devretsin.
--
--   ajan_ayarlari.sirket_ozeti   Sunucunun Lio'nun SALT OKUNUR araçlarından
--                                kullanıcının kendi yetkisiyle çıkardığı profil;
--                                her işte ajana gider, günde bir tazelenir.
--                                Hassas alanlar (IBAN, vergi/TC no, telefon,
--                                e-posta, adres) bu metne HİÇ girmez.
--   ajan_isleri.tur = 'sirket'   Boşta: profili inceleyip not/konu/fikir çıkarma.
--   ajan_onerileri.tur = 'lio'   Ajanın Lio'ya devretmek istediği iş. Onayda
--                                Lio açılır ve talimat yazı kutusuna gelir;
--                                göndermek (bakiye harcamak) kullanıcıdadır.

alter table public.ajan_ayarlari add column if not exists sirket_ozeti text;
alter table public.ajan_ayarlari add column if not exists sirket_ozeti_at timestamptz;

alter table public.ajan_isleri drop constraint if exists ajan_isleri_tur_check;
alter table public.ajan_isleri
  add constraint ajan_isleri_tur_check check (tur in ('sohbet', 'arastirma', 'ogrenme', 'liste', 'fikir', 'otomasyon', 'sirket'));

alter table public.ajan_onerileri drop constraint if exists ajan_onerileri_tur_check;
alter table public.ajan_onerileri
  add constraint ajan_onerileri_tur_check check (tur in ('yapilacak', 'fikir', 'lio'));
