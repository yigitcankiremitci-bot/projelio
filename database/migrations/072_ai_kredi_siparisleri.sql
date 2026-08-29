-- Kullanıcının kendi kredisini yükleyebildiği sipariş akışı.
--
-- NEDEN AYRI BİR TABLO: kredi yükleme bugüne kadar yalnızca yöneticinin elinden
-- geçiyordu (ai_credit_transactions'a doğrudan 'topup' satırı). Kullanıcı kendi
-- siparişini oluşturmaya başlayınca "ödeme sözü verildi" ile "kredi yüklendi"
-- birbirinden AYRILMAK zorunda: ikisini tek satırda tutmak, ödemesi tamamlanmamış
-- bir siparişin bakiyeye yansıması demekti.
--
-- ÖDEME SAĞLAYICI ENTEGRASYONU HENÜZ YOK. Sipariş 'pending_payment' doğar ve orada
-- bekler; krediyi yalnızca ödemeyi doğrulayan bir yönetici (ya da ileride sağlayıcı
-- callback'i) yükler. Bu tabloya bakan hiçbir yer, siparişin varlığını "ödendi"
-- saymamalı — tek geçerli kanıt status='paid' VE credited_at dolu olmasıdır.

create table if not exists ai_credit_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  -- Paketin anahtarı (bkz. ai-credits.config.ts CREDIT_PACKAGES). Paket listesi
  -- koddan geliyor; burada yalnızca sipariş ANINDAKİ değerler dondurulur ki paket
  -- fiyatı sonra değişse bile eski siparişin ne için ödendiği belli kalsın.
  package_key varchar(40) not null,
  credits numeric(14, 2) not null check (credits > 0),
  price_amount numeric(12, 2) not null check (price_amount >= 0),
  currency varchar(3) not null default 'TRY',

  -- pending_payment: sipariş açıldı, ödeme bekleniyor (kredi YÜKLENMEDİ).
  -- paid:            ödeme doğrulandı; kredi yüklendiyse credited_at dolar.
  -- cancelled:       kullanıcı ya da yönetici vazgeçti.
  -- failed:          ödeme sağlayıcısı reddetti (entegrasyon gelince kullanılacak).
  status varchar(20) not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled', 'failed')),

  -- Ödeme sağlayıcısı bağlanınca doldurulacak alanlar. Şimdilik boş kalıyor;
  -- şemaya baştan konuldular ki entegrasyon bir migration daha gerektirmesin.
  payment_provider varchar(30),
  payment_reference varchar(200),

  -- Ödemenin doğrulandığı an ile kredinin bakiyeye GEÇTİĞİ an ayrı tutulur:
  -- ikisi arasında hata olursa (yükleme başarısız) fark buradan görülür ve
  -- yönetici yüklemeyi yeniden deneyebilir.
  paid_at timestamp,
  credited_at timestamp,
  -- Ödemeyi elle onaylayan yönetici (sağlayıcı callback'inde boş kalır).
  approved_by uuid references users(id) on delete set null,
  note text,
  created_at timestamp not null default current_timestamp
);

create index if not exists idx_ai_credit_orders_user
  on ai_credit_orders(user_id, created_at desc);

-- Yönetici ekranı "ödeme bekleyenler" listesini bununla çeker.
create index if not exists idx_ai_credit_orders_status
  on ai_credit_orders(status, created_at desc);

-- --------------------------------------------------------------------------
-- Defter satırını siparişe bağlar.
-- --------------------------------------------------------------------------
-- ÇİFT YÜKLEMEYE KARŞI ASIL KORUMA BU: krediyi yükleyen kod, önce bu order_id ile
-- bir hareket var mı diye bakar. Sipariş satırındaki credited_at damgası tek başına
-- yeterli değil — kredi yüklendikten sonra, damga yazılmadan önce süreç çökerse
-- yeniden deneme aynı krediyi bir daha yüklerdi. Hareket defteri ise kredinin
-- gerçekten geçtiğinin tek güvenilir kanıtı.
alter table public.ai_credit_transactions
  add column if not exists order_id uuid references ai_credit_orders(id) on delete set null;

-- Bir siparişin defterde EN FAZLA bir yükleme satırı olabilir; yarış durumunda
-- ikinci ekleme veritabanı düzeyinde reddedilir.
create unique index if not exists uniq_ai_credit_tx_order
  on ai_credit_transactions(order_id) where order_id is not null;

alter table ai_credit_orders enable row level security;
