-- 112_fatura_ekleri.sql
-- Faturanın kendisi: dosya eki, ay klasörü, kasa bağı ve muhasebeci adresi
--
-- SORUN
-- -----
-- Fatura modülü (fm_fatura) bugün yalnızca faturanın ÜSTÜNDEKİ BİLGİYİ tutuyor:
-- numara, tutar, karşı taraf, durum. Faturanın KENDİSİ — PDF'i, fişin fotoğrafı —
-- hiçbir yerde yok. Ay sonunda muhasebeciye gönderilen şey ise tam olarak o:
-- bilgi değil, belge. Bugüne kadar bu iş WhatsApp'tan tek tek fotoğraf
-- göndererek yapılıyordu ve hangi ayın hangi faturasının gittiği kimsede
-- yazmıyordu.
--
-- Aynı fatura ikinci kez de kayboluyordu: kasadan (budget_transactions) bir
-- ödeme girilirken faturası elde oluyor ama girilecek yer yok; modüle ayrıca
-- girmek gerekiyor ve iki kayıt birbirini bilmiyordu.
--
-- NE DEĞİŞİYOR
-- -----------
-- 1. Dosya eki için YENİ TABLO YOK. Dosya bağlama altyapısı zaten var
--    (file_links, migration 095) ve `module_record` hedef türünü destekliyor:
--    fatura eki, şirketin dosya ağacındaki Faturalar/<yıl>/<ay> klasörüne
--    yüklenip kayda BAĞLANIR. Dosya klasöründe yaşar, kayıtta görünür.
--
--    Ay klasörü FATURA TARİHİNDEN belirlenir (data->>'issueDate'), yükleme
--    tarihinden değil: geçmiş ayın faturası bir hafta sonra yüklendiğinde
--    ait olduğu ayın klasörüne düşmeli, yoksa ay sonu arşivi eksik çıkar.
--    Kural kodda (fatura-klasoru.ts) çünkü klasör adlandırması bir görüntüleme
--    kararı; şemaya yazılsaydı değiştirmek migration gerektirirdi.
--
-- 2. Kasa ↔ fatura bağı TEK SÜTUN: budget_transactions.invoice_record_id.
--    Ara tablo değil, çünkü ilişki birebir: bir ödemenin bir faturası, bir
--    faturanın bir ödemesi vardır. Ayrı bir tablo, "bir ödemeye üç fatura"
--    gibi anlamı olmayan durumları veritabanı düzeyinde mümkün kılardı.

-- ---------------------------------------------------------------------------
-- 1) Kasa hareketi ↔ fatura kaydı
-- ---------------------------------------------------------------------------

alter table public.budget_transactions
  add column if not exists invoice_record_id uuid references public.module_records(id) on delete set null;

comment on column public.budget_transactions.invoice_record_id is
  'Bu odemenin faturasi (module_records, fm_fatura). Bir odemenin bir faturasi olur; tekil indeks bunu garanti eder.';

-- Aynı fatura iki ayrı ödemeye bağlanamaz.
--
-- Bağlanabilseydi ay sonu arşivinde aynı belge iki kez çıkar, daha kötüsü
-- "bu fatura ödendi mi" sorusunun iki cevabı olurdu. SET NULL ile birlikte
-- çalışıyor: fatura kaydı arşivlenip silinirse ödeme satırı yerinde kalır,
-- yalnızca bağ kopar — para hareketi belgeye bağlı değildir.
create unique index if not exists budget_transactions_invoice_uniq
  on public.budget_transactions(invoice_record_id) where invoice_record_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Muhasebecinin adresi
-- ---------------------------------------------------------------------------
--
-- Bilgi kartında (migration 107) duruyor çünkü tam olarak oraya ait bir künye
-- bilgisi: şirketin vergi dairesi, IBAN'ı ve muhasebecisi aynı sorunun
-- cevapları. Gönderim penceresinde hazır gelir, o seferlik değiştirilebilir —
-- yani burası varsayılan, zorunluluk değil.
alter table public.info_cards
  add column if not exists accountant_email varchar;

comment on column public.info_cards.accountant_email is
  'Ay sonu fatura arsivinin varsayilan alicisi. Gonderim aninda degistirilebilir.';
