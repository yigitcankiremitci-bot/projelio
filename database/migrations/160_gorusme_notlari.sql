-- 160_gorusme_notlari.sql
-- Müşteri / potansiyel müşteri kartında görüşme notları + "tekrar ara" tarihi.
--
-- NEDEN: Potansiyel müşteriler tek tek aranıp bilgi alınıyor (kullanıcı isteği,
-- 2026-10-12). Her arama kartın altına yazan + tarihle bir not olarak düşmeli;
-- "Ulaşılamadı" ayrı bir tür, çünkü üst üste kaç kez ulaşılamadığı listede
-- görünmeli. Notlar YENİ bir tabloya değil party_activity'ye yazılır: temas
-- geçmişi zaten orada (yazan, tarih, tür) — ikinci bir günlük açmak aynı
-- aramanın iki yerde durması demekti.
--
-- sonraki_arama Müşteriler defterinin "tekrar ara" günü. Bağlantılar'ın
-- party_baglanti.sonraki_temas'ı bilerek ayrı: o alan yalnızca Bağlantılar'ın
-- yetkisiyle okunuyor, satış ekibinin araması oraya yazılamaz.

-- Kısıt 046'da satır içi yazıldı; adı Postgres'in verdiği addır. Adına
-- güvenmemek için tür sütununa bakan bütün check kısıtları düşürülür.
do $$
declare k record;
begin
  for k in
    select conname from pg_constraint
     where conrelid = 'public.party_activity'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%type%'
  loop
    execute format('alter table public.party_activity drop constraint %I', k.conname);
  end loop;
end $$;
alter table public.party_activity
  add constraint party_activity_type_check
  check (type in ('not', 'arama', 'ulasilamadi', 'toplanti', 'eposta', 'teklif', 'ziyaret', 'sistem'));

alter table public.party
  add column if not exists sonraki_arama date;

comment on column public.party.sonraki_arama is
  'Musteriler defterinde tekrar aranacak gun (gorusme notu eklenirken secilir). Bos = planlanmis arama yok.';
