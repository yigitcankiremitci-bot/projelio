-- 186_web_sitesi_eklentisi.sql
--
-- Web sitesi eklentisi (kullanıcı isteği, 2026-11-09): şirket, katalogdaki
-- ürünleri kendi (özel kodlu) web sitesine verir; sitede satış olunca stok
-- Projelio'da da düşer. Çift yön:
--
--   Projelio → site   site anahtarla ürünleri OKUR (GET /v1/site/products) ve
--                     bir ürün değişince Projelio sitenin webhook adresine
--                     imzalı bildirim gönderir (product.updated / product.deleted).
--   site → Projelio   site satışı/iadeyi bildirir (POST /v1/site/stock-movements);
--                     stok bu tabloda tek işlemde, bir kez düşer.
--
-- Kod: backend/src/modules/web-sitesi/, belge docs/web-sitesi-eklentisi.md.
--
-- ÜÇ KARAR
--   1. Anahtar düz saklanmaz: yalnızca sha256 özeti (ajan anahtarıyla aynı
--      desen, 177). Webhook imza sırrı ise geri okunmak ZORUNDA (her
--      gönderimde imzalanıyor) — o yüzden şifreli (WEB_SITESI_SIR_ENC_KEY).
--   2. Değişiklik yakalama TETİKLEYİCİDE: ürün içe aktarma, kart düzenleme,
--      görsel yükleme, Shopify siparişi… ürüne yazan her yol buradan geçer.
--      Servise "değişti" çağrısı serpiştirmek bir yolu unutmak demekti.
--   3. Kuyruk ürün başına TEK satır (birincil anahtar bağlantı+ürün): ürün
--      art arda on kez düzenlenirse site on değil bir bildirim alır, gönderim
--      anında ürünün SON hâli okunur. Bildirim fark değil tam hâldir.

create table if not exists public.web_sitesi_baglantilari (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ad text not null check (char_length(btrim(ad)) between 1 and 80),
  -- Bilgi amaçlı (arayüzde bağlantı); istek kaynağını kısıtlamaz.
  site_adresi text,
  -- Boşsa bildirim gönderilmez; site yalnızca okuyarak eşitler.
  webhook_adresi text,
  anahtar_ozeti text not null unique,
  -- Arayüzde "psite_Ab12…" diye tanınsın diye ilk karakterler; sır değil.
  anahtar_on_eki text not null,
  webhook_sir_sifreli text not null,
  durum text not null default 'aktif' check (durum in ('aktif', 'kaldirildi')),
  olusturan uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  son_istek_at timestamptz,
  son_bildirim_at timestamptz,
  son_hata text,
  son_hata_at timestamptz
);

create index if not exists web_sitesi_baglantilari_org_idx
  on public.web_sitesi_baglantilari (organization_id) where durum = 'aktif';

-- Bekleyen bildirimler. product_id'de yabancı anahtar YOK: silinen ürünün
-- "product.deleted" bildirimi ürün satırı gittikten sonra da gönderilmeli.
create table if not exists public.web_sitesi_kuyrugu (
  baglanti_id uuid not null references public.web_sitesi_baglantilari(id) on delete cascade,
  product_id uuid not null,
  organization_id uuid not null,
  eklendi_at timestamptz not null default now(),
  deneme integer not null default 0,
  sonraki_deneme_at timestamptz not null default now(),
  son_hata text,
  primary key (baglanti_id, product_id)
);

create index if not exists web_sitesi_kuyrugu_sira_idx on public.web_sitesi_kuyrugu (sonraki_deneme_at);

-- Siteden gelen stok hareketleri. Tekillik (bağlantı, referans, tür, ürün):
-- site aynı siparişi ağ hatası yüzünden iki kez gönderirse stok iki kez düşmez.
create table if not exists public.web_sitesi_stok_hareketleri (
  id uuid primary key default gen_random_uuid(),
  baglanti_id uuid not null references public.web_sitesi_baglantilari(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  referans text not null check (char_length(referans) between 1 and 120),
  tur text not null check (tur in ('satis', 'iade')),
  miktar numeric(12,2) not null check (miktar > 0),
  onceki_stok numeric(12,2),
  sonraki_stok numeric(12,2),
  created_at timestamptz not null default now(),
  unique (baglanti_id, referans, tur, product_id)
);

create index if not exists web_sitesi_stok_hareketleri_urun_idx
  on public.web_sitesi_stok_hareketleri (product_id, created_at desc);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı (bkz. 062, 184).
alter table public.web_sitesi_baglantilari enable row level security;
alter table public.web_sitesi_kuyrugu enable row level security;
alter table public.web_sitesi_stok_hareketleri enable row level security;

comment on table public.web_sitesi_baglantilari is
  'Web sitesi eklentisi (186): sirketin urunlerini okuyan ve stok bildiren site. Anahtar yalnizca sha256 ozeti.';
comment on table public.web_sitesi_kuyrugu is
  'Siteye gonderilecek urun bildirimleri; urun basina tek satir, gonderimde urunun son hali okunur.';
comment on table public.web_sitesi_stok_hareketleri is
  'Siteden gelen satis/iade; (baglanti, referans, tur, urun) tekil — ayni siparis iki kez stok dusurmez.';

-- ─────────────────────────────────────────────── Değişiklik yakalama

create or replace function public.web_sitesi_kuyruga_ekle(p_org uuid, p_urun uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.web_sitesi_kuyrugu (baglanti_id, product_id, organization_id)
  select b.id, p_urun, p_org
    from public.web_sitesi_baglantilari b
   where b.organization_id = p_org
     and b.durum = 'aktif'
     and b.webhook_adresi is not null
  on conflict (baglanti_id, product_id) do update
    set eklendi_at = now(), deneme = 0, sonraki_deneme_at = now(), son_hata = null;
$$;

create or replace function public.web_sitesi_urun_tetigi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.web_sitesi_kuyruga_ekle(old.organization_id, old.id);
    return old;
  end if;
  -- Yalnızca sıralama değiştiyse siteye söylenecek bir şey yok.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'sort_order') = (to_jsonb(old) - 'sort_order') then
    return new;
  end if;
  perform public.web_sitesi_kuyruga_ekle(new.organization_id, new.id);
  return new;
end;
$$;

drop trigger if exists web_sitesi_urun_degisti on public.products;
create trigger web_sitesi_urun_degisti
  after insert or update or delete on public.products
  for each row execute function public.web_sitesi_urun_tetigi();

-- Görsel eklenince/silinince/sırası değişince ürünün görsel listesi değişir.
create or replace function public.web_sitesi_gorsel_tetigi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_urun uuid := coalesce(new.product_id, old.product_id);
  v_org uuid;
begin
  select organization_id into v_org from public.products where id = v_urun;
  if v_org is not null then
    perform public.web_sitesi_kuyruga_ekle(v_org, v_urun);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists web_sitesi_gorsel_degisti on public.product_images;
create trigger web_sitesi_gorsel_degisti
  after insert or update or delete on public.product_images
  for each row execute function public.web_sitesi_gorsel_tetigi();

-- ─────────────────────────────────────────────── Stok hareketi (tek işlem)

-- p_kalemler: [{"product_id": "<uuid>", "miktar": 2}, ...] — ürün kimlikleri
-- servis katmanında stok kodundan çözülmüş, bu şirkete ait ve TEKİL olmalı.
-- Ya hepsi işlenir ya hiçbiri. Daha önce işlenmiş kalem (aynı referans+tür)
-- tekrar düşülmez; dönüşte "yeni": false ile bildirilir.
-- Dönüş: [{"product_id", "stok", "yeni"}, ...]
create or replace function public.web_sitesi_stok_isle(
  p_baglanti uuid,
  p_referans text,
  p_tur text,
  p_kalemler jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_kalem record;
  v_onceki numeric(12,2);
  v_sonraki numeric(12,2);
  v_eklendi uuid;
  v_sonuc jsonb := '[]'::jsonb;
begin
  if p_tur not in ('satis', 'iade') then
    raise exception 'Geçersiz hareket türü';
  end if;

  select organization_id into v_org
    from public.web_sitesi_baglantilari
   where id = p_baglanti and durum = 'aktif';
  if v_org is null then
    raise exception 'Bağlantı bulunamadı';
  end if;

  -- Kilitler kimlik sırasıyla: iki sipariş aynı ürünleri ters sırada
  -- getirse bile birbirini kilitlemesin.
  for v_kalem in
    select (k->>'product_id')::uuid as product_id, (k->>'miktar')::numeric as miktar
      from jsonb_array_elements(p_kalemler) k
     order by 1
  loop
    if v_kalem.miktar is null or v_kalem.miktar <= 0 then
      raise exception 'Miktar sıfırdan büyük olmalı';
    end if;

    select stock_quantity into v_onceki
      from public.products
     where id = v_kalem.product_id and organization_id = v_org
     for update;
    if not found then
      raise exception 'Ürün bu şirkete ait değil';
    end if;

    insert into public.web_sitesi_stok_hareketleri
      (baglanti_id, organization_id, product_id, referans, tur, miktar, onceki_stok)
    values (p_baglanti, v_org, v_kalem.product_id, p_referans, p_tur, v_kalem.miktar, v_onceki)
    on conflict (baglanti_id, referans, tur, product_id) do nothing
    returning id into v_eklendi;

    if v_eklendi is null then
      v_sonuc := v_sonuc || jsonb_build_object('product_id', v_kalem.product_id, 'stok', v_onceki, 'yeni', false);
      continue;
    end if;

    -- Stok eksiye düşebilir (products.service.ts ile aynı karar: sayım açığı
    -- ya da ön sipariş gerçek bir durum, satışı reddetmek stoku yalan söyletir).
    update public.products
       set stock_quantity = coalesce(stock_quantity, 0)
                            + case when p_tur = 'iade' then v_kalem.miktar else -v_kalem.miktar end
     where id = v_kalem.product_id
    returning stock_quantity into v_sonraki;

    update public.web_sitesi_stok_hareketleri set sonraki_stok = v_sonraki where id = v_eklendi;
    v_sonuc := v_sonuc || jsonb_build_object('product_id', v_kalem.product_id, 'stok', v_sonraki, 'yeni', true);
    v_eklendi := null;
  end loop;

  update public.web_sitesi_baglantilari set son_istek_at = now() where id = p_baglanti;
  return v_sonuc;
end;
$$;

revoke all on function public.web_sitesi_kuyruga_ekle(uuid, uuid) from public, anon, authenticated;
revoke all on function public.web_sitesi_stok_isle(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.web_sitesi_stok_isle(uuid, text, text, jsonb) to service_role;
