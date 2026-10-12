-- Müşteri siparişinin faturası.
--
-- Satış faturası SİPARİŞE aittir, tahsilata değil: 100.000 TL'lik siparişin
-- tek faturası olur, parası ise üç taksitte gelebilir. Kasa satırındaki
-- fatura bağı (budget_transactions.invoice_record_id, migration 112) tekil
-- olduğu için taksitlerden yalnızca birine bağlanabiliyordu; "bu müşteriye
-- kesilen fatura nerede" sorusunun cevabı da müşteri kartında yoktu.
--
-- Fatura için YENİ TABLO YOK: kayıt yine Faturalar modülünün kaydı
-- (module_records, fm_fatura), belgesi yine ay klasöründe ve ay sonu
-- arşivinde. Burada yalnızca siparişten ona bir bağ var.
--
-- Bir faturanın bir siparişi olur (tekil indeks): iki siparişe bağlanabilseydi
-- tahsilat bitince faturanın "Ödendi" durumu hangisinden gelir belirsizdi
-- (bkz. SiparisService.faturaDurumunuEsitle). Fatura kaydı silinirse sipariş
-- kalır, yalnızca bağ kopar.

alter table public.musteri_siparisleri
  add column if not exists invoice_record_id uuid references public.module_records(id) on delete set null;

create unique index if not exists musteri_siparisleri_invoice_uniq
  on public.musteri_siparisleri(invoice_record_id) where invoice_record_id is not null;

comment on column public.musteri_siparisleri.invoice_record_id is
  'Siparisin faturasi (module_records, fm_fatura). Bir faturanin bir siparisi olur; fatura silinince bag kopar.';
