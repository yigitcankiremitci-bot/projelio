-- 187_siparis_asamasi_ve_stok.sql
--
-- Sipariş AŞAMASI (alındı → onaylandı → hazırlanıyor → yolda → teslim edildi;
-- ayrıca iptal) ve siparişin stoğu düşürmesi (kullanıcı kararı, 2026-11-09).
--
-- AD: "aşama", "durum" DEĞİL. Kodda "sipariş durumu" zaten tahsilat durumu
-- (bekliyor / kısmi / tahsil edildi / gecikti, packages/shared/src/tahsilat.ts);
-- ikisi bağımsız: ödenmiş bir sipariş yolda, teslim edilmiş biri ödenmemiş olabilir.
--
-- STOK KURALI
--   · Sipariş onaylı bir aşamaya (onaylandı ve sonrası) İLK geçişte stok bir
--     kez düşer; onaydan sonra iptal edilirse geri eklenir; onay öncesi iptal
--     stoğa dokunmaz. Karar saf fonksiyonda: packages/shared/src/siparisAsamasi.ts.
--   · Elle açılan ve web sitesinden gelen siparişlerde çalışır; Shopify (kendi
--     stoğunu yönetiyor) ve Excel (geçmiş kargo listesi) siparişlerinde çalışmaz.
--   · İade, siparişin KALEMLERİNDEN değil, o sipariş için gerçekten yazılmış
--     satış hareketlerinden hesaplanır: stoğu hiç düşmemiş eski bir sipariş
--     iptal edilirse stoğa hayalî ürün eklenmez.
--
-- STOK HAREKETİ TABLOSU genelleşir (186'daki web_sitesi_stok_hareketleri):
-- satır artık ya sitenin bildirimi (kaynak='web_sitesi', bağlantı dolu) ya
-- siparişin onayı/iptali (kaynak='siparis', referans = sipariş kimliği).
-- Ad değiştirilmedi: 186 dün canlıya çıktı, ad değişikliği yalnızca gürültü.

-- ─────────────────────────────────────────────── 1. Aşama

alter table public.musteri_siparisleri
  add column if not exists asama varchar not null default 'teslim_edildi';
alter table public.musteri_siparisleri
  add column if not exists asama_degisti_at timestamptz;

-- Mevcut siparişler geçmiş satışlardır: "teslim edildi" sayılır ve stoğa
-- dokunulmaz (hiç satış hareketleri yok; iptal edilirlerse de iade yazılmaz).
-- Bundan sonraki satırların varsayılanı "alındı": her yazım yolu aşamayı
-- açıkça veriyor, varsayılan yalnızca güvenli taraf.
alter table public.musteri_siparisleri alter column asama set default 'alindi';

alter table public.musteri_siparisleri drop constraint if exists musteri_siparisleri_asama_check;
alter table public.musteri_siparisleri
  add constraint musteri_siparisleri_asama_check
  check (asama in ('alindi', 'onaylandi', 'hazirlaniyor', 'yolda', 'teslim_edildi', 'iptal'));

create index if not exists musteri_siparisleri_asama_idx
  on public.musteri_siparisleri (organization_id, asama) where asama in ('alindi', 'onaylandi', 'hazirlaniyor', 'yolda');

-- Siparişi getiren web sitesi bağlantısı (188'deki B2B portal). Burada
-- açılıyor çünkü aşama fonksiyonu stok hareketine bağlantıyı yazıyor.
alter table public.musteri_siparisleri
  add column if not exists web_sitesi_baglanti_id uuid references public.web_sitesi_baglantilari(id) on delete set null;

comment on column public.musteri_siparisleri.asama is
  'Siparisin asamasi (187): alindi, onaylandi, hazirlaniyor, yolda, teslim_edildi, iptal. Tahsilat durumundan bagimsiz.';

-- ─────────────────────────────────────────────── 2. Stok hareketleri genelleşir

alter table public.web_sitesi_stok_hareketleri alter column baglanti_id drop not null;
alter table public.web_sitesi_stok_hareketleri
  add column if not exists kaynak varchar not null default 'web_sitesi';
alter table public.web_sitesi_stok_hareketleri
  add column if not exists siparis_id uuid references public.musteri_siparisleri(id) on delete set null;

alter table public.web_sitesi_stok_hareketleri drop constraint if exists web_sitesi_stok_hareketleri_kaynak_check;
alter table public.web_sitesi_stok_hareketleri
  add constraint web_sitesi_stok_hareketleri_kaynak_check
  check ((kaynak = 'web_sitesi' and baglanti_id is not null) or kaynak = 'siparis');

-- Sipariş hareketlerinin tekilliği. 186'daki (bağlantı, referans, tür, ürün)
-- tekilliği bağlantısız satırlarda İŞLEMEZ (null'lar birbirine eşit sayılmaz),
-- aynı onay iki kez stok düşerdi. Referans = sipariş kimliği; sipariş
-- silinse de (siparis_id null olur) referans kalır, tekillik bozulmaz.
create unique index if not exists web_sitesi_stok_hareketleri_siparis_uniq
  on public.web_sitesi_stok_hareketleri (organization_id, referans, tur, product_id)
  where kaynak = 'siparis';

create index if not exists web_sitesi_stok_hareketleri_siparis_idx
  on public.web_sitesi_stok_hareketleri (siparis_id) where siparis_id is not null;

comment on column public.web_sitesi_stok_hareketleri.kaynak is
  'web_sitesi = sitenin stock-movements bildirimi; siparis = siparisin onayi/iptali (referans = siparis id).';

-- ─────────────────────────────────────────────── 3. Ortak çekirdek

-- 186'daki web_sitesi_stok_isle'nin gövdesi buraya alındı; davranış AYNI.
-- p_kalemler: [{"product_id", "miktar"}], ürünler tekil ve p_org'un olmalı.
-- Dönüş: [{"product_id", "stok", "yeni"}]
create or replace function public.stok_hareketi_uygula(
  p_org uuid,
  p_kaynak text,
  p_baglanti uuid,
  p_siparis uuid,
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
  v_kalem record;
  v_onceki numeric(12,2);
  v_sonraki numeric(12,2);
  v_eklendi uuid;
  v_sonuc jsonb := '[]'::jsonb;
begin
  if p_tur not in ('satis', 'iade') then
    raise exception 'Geçersiz hareket türü';
  end if;

  -- Kilitler kimlik sırasıyla: iki işlem aynı ürünleri ters sırada getirse
  -- bile birbirini kilitlemesin.
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
     where id = v_kalem.product_id and organization_id = p_org
     for update;
    if not found then
      raise exception 'Ürün bu şirkete ait değil';
    end if;

    insert into public.web_sitesi_stok_hareketleri
      (baglanti_id, organization_id, product_id, referans, tur, miktar, onceki_stok, kaynak, siparis_id)
    values (p_baglanti, p_org, v_kalem.product_id, p_referans, p_tur, v_kalem.miktar, v_onceki, p_kaynak, p_siparis)
    on conflict do nothing
    returning id into v_eklendi;

    if v_eklendi is null then
      v_sonuc := v_sonuc || jsonb_build_object('product_id', v_kalem.product_id, 'stok', v_onceki, 'yeni', false);
      continue;
    end if;

    -- Stok eksiye düşebilir (products.service.ts ile aynı karar).
    update public.products
       set stock_quantity = coalesce(stock_quantity, 0)
                            + case when p_tur = 'iade' then v_kalem.miktar else -v_kalem.miktar end
     where id = v_kalem.product_id
    returning stock_quantity into v_sonraki;

    update public.web_sitesi_stok_hareketleri set sonraki_stok = v_sonraki where id = v_eklendi;
    v_sonuc := v_sonuc || jsonb_build_object('product_id', v_kalem.product_id, 'stok', v_sonraki, 'yeni', true);
    v_eklendi := null;
  end loop;

  return v_sonuc;
end;
$$;

-- Aynı imza, aynı davranış (186): artık çekirdeği çağırıyor.
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
  v_sonuc jsonb;
begin
  select organization_id into v_org
    from public.web_sitesi_baglantilari
   where id = p_baglanti and durum = 'aktif';
  if v_org is null then
    raise exception 'Bağlantı bulunamadı';
  end if;
  v_sonuc := public.stok_hareketi_uygula(v_org, 'web_sitesi', p_baglanti, null, p_referans, p_tur, p_kalemler);
  update public.web_sitesi_baglantilari set son_istek_at = now() where id = p_baglanti;
  return v_sonuc;
end;
$$;

-- ─────────────────────────────────────────────── 4. Aşama değişimi (tek işlem)

-- Aşamayı değiştirir; p_stok 'satis' ya da 'iade' ise stoğu da AYNI işlemde
-- işler. Hangi geçişin stok tetiklediğine servis karar verir (saf kural);
-- burası yalnızca "eski aşama hâlâ bu mu" diye bakar ki iki kişi aynı anda
-- onaylarsa ikincisi eski bilgiyle yazmasın.
--   satis: siparişin ürünlü kalemleri ürün başına toplanıp düşülür.
--   iade : bu sipariş için yazılmış SATIŞ hareketleri kadar geri eklenir.
create or replace function public.siparis_asama_uygula(
  p_siparis uuid,
  p_eski text,
  p_yeni text,
  p_stok text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_asama text;
  v_baglanti uuid;
  v_kalemler jsonb;
  v_sonuc jsonb := '[]'::jsonb;
begin
  select organization_id, asama, web_sitesi_baglanti_id
    into v_org, v_asama, v_baglanti
    from public.musteri_siparisleri
   where id = p_siparis
   for update;
  if not found then
    raise exception 'Sipariş bulunamadı';
  end if;
  if v_asama is distinct from p_eski then
    raise exception 'Siparişin aşaması bu arada değişti; sayfayı yenileyin';
  end if;

  update public.musteri_siparisleri
     set asama = p_yeni, asama_degisti_at = now(), updated_at = now()
   where id = p_siparis;

  if p_stok is null then
    return v_sonuc;
  end if;
  if v_org is null then
    -- İşe ait (job) siparişlerin kalemleri katalog ürününe bağlanamaz;
    -- düşülecek stok yok.
    return v_sonuc;
  end if;

  if p_stok = 'satis' then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'miktar', miktar)), '[]'::jsonb)
      into v_kalemler
      from (
        select product_id, round(sum(miktar), 2) as miktar
          from public.musteri_siparis_kalemleri
         where siparis_id = p_siparis and product_id is not null
         group by product_id
        having round(sum(miktar), 2) > 0
      ) t;
  elsif p_stok = 'iade' then
    select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'miktar', miktar)), '[]'::jsonb)
      into v_kalemler
      from (
        select h.product_id, sum(h.miktar) as miktar
          from public.web_sitesi_stok_hareketleri h
          join public.products p on p.id = h.product_id
         where h.kaynak = 'siparis' and h.organization_id = v_org
           and h.referans = p_siparis::text and h.tur = 'satis'
         group by h.product_id
      ) t;
  else
    raise exception 'Geçersiz stok işlemi';
  end if;

  if jsonb_array_length(v_kalemler) = 0 then
    return v_sonuc;
  end if;
  return public.stok_hareketi_uygula(v_org, 'siparis', v_baglanti, p_siparis, p_siparis::text, p_stok, v_kalemler);
end;
$$;

revoke all on function public.stok_hareketi_uygula(uuid, text, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.siparis_asama_uygula(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.siparis_asama_uygula(uuid, text, text, text) to service_role;
