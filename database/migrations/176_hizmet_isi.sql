-- 176_hizmet_isi.sql
--
-- 1) İş düzeyinde "bu işte hizmet veren benim" bayrağı.
--
-- NEDEN. Serbest çalışan, müşterisi Projelio'da olmayan bir iş açıp altındaki
-- projelerin görevlerine YAPTIĞI İŞİN fiyatını görev bütçesi olarak yazıyor
-- (mix 5.000 ₺, master 2.000 ₺...). Görev bütçesi ise ekip ödemesi olarak
-- tasarlandı: onaylanıp "ödendi" denince deftere `payout` yazılır. Kullanıcı
-- 2026-11-01'de Samar projelerinin 15 kalemini ödendi yaptı ve Kasa'sına
-- 40.500 ₺ gider düştü — müşterinin ödemesi zaten gelir olarak duruyordu.
--
-- Gelire çevirmek de yanlış olurdu: kalemler müşterinin ödediği ücretin
-- dökümüdür, ayrı bir para değildir; ücret ile kalemleri birlikte saymak aynı
-- parayı iki kez saymak demek.
--
-- İşaretliyken işin projelerindeki görev bütçeleri FİYAT KALEMİDİR: onay
-- kuyruğuna düşmez, "ödendi" yapılamaz, deftere hiçbir şey yazmaz. Gelir,
-- müşterinin ödemesi olarak elle girilir (bugünkü gibi).
--
-- Proje düzeyindeki `hizmet_projesi` (111) başka bir durumdur: orada müşteri
-- işin sahibi olarak sistemde, burada müşteri sistemde yok ve iş de senin.

alter table public.jobs
  add column if not exists hizmet_isi boolean not null default false;

comment on column public.jobs.hizmet_isi is
  'İşin sahibi bu işte müşterisine hizmet veriyor: görev bütçeleri fiyat kalemidir, ödenmez ve deftere yazılmaz (176).';

-- 2) Görev bütçesi ödemelerinin kaynağı.
--
-- GorevButceService.deftereIsle `source` yazmıyordu; 105'ten beri ödenen her
-- görev bütçesi satırı varsayılan 'manual' ile düştü. Sonuç: görev başına tek
-- ödeme satırını zorlayan kısmi tekil indeks bu satırlara hiç işlemiyordu ve
-- satırlar elle girilmiş gibi düzenlenebiliyordu. Koddaki yazım düzeltildi;
-- burada mevcut satırlar işaretleniyor.
--
-- Yalnızca o yolun yazdığı biçimdeki satırlar (payout + 'Görev bütçesi'
-- kategorisi) ve görev başına BİR tane: aynı göreve iki satır düşmüşse (iki kez
-- "ödendi") ikisini birden işaretlemek indeksi kırar; en eskisi işaretlenir,
-- fazlası elle bakılsın diye 'manual' kalır.
update public.budget_transactions b
set source = 'task_budget'
where b.id in (
  select distinct on (t.task_id) t.id
  from public.budget_transactions t
  where t.task_id is not null
    and t.source = 'manual'
    and t.type = 'payout'
    and t.category = 'Görev bütçesi'
    and not exists (
      select 1 from public.budget_transactions x
      where x.task_id = t.task_id and x.source = 'task_budget'
    )
  order by t.task_id, t.created_at
);
