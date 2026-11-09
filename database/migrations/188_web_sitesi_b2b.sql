-- 188_web_sitesi_b2b.sql
--
-- Web sitesi eklentisinin B2B sipariş portalına genişlemesi (2026-11-09; ilk
-- kullanıcı toptan medikal satış — eczaneler portala girip sipariş verir).
-- Genel yazıldı: web sitesi bağlantısı olan her şirket kullanabilir.
--
--   · party.iskonto_orani      — müşteriye özel iskonto (%). Siteye değil
--                                 müşteriye ait: ileride faturada da kullanılır.
--   · portal kullanıcıları      — Projelio hesabı AÇTIRIR, kullanıcı veritabanı
--                                 portaldadır. Projelio şifre TUTMAZ, şifre
--                                 Projelio'dan GEÇMEZ; portal imzalı webhook'la
--                                 "aç / güncelle / kapat" bilgisini alır ve şifre
--                                 belirleme e-postasını kendisi gönderir.
--   · portal siparişi           — musteri_siparisleri, kaynak='web_sitesi',
--                                 dis_kimlik = "<bağlantı id>:<sitenin referansı>".
--                                 Önek ŞART: tekil indeks (kaynak, dis_kimlik)
--                                 şirketten bağımsız (129); iki şirketin portalı
--                                 aynı "SIP-1"i gönderebilir.
--   · bildirim kuyruğu          — ürün başına tek satırdan (bağlantı, tür,
--                                 kayıt) başına tek satıra genelleşir.

-- ─────────────────────────────────────────────── 1. Müşterinin iskontosu

alter table public.party
  add column if not exists iskonto_orani numeric(5,2);
alter table public.party drop constraint if exists party_iskonto_orani_check;
alter table public.party
  add constraint party_iskonto_orani_check check (iskonto_orani is null or (iskonto_orani >= 0 and iskonto_orani <= 100));

comment on column public.party.iskonto_orani is
  'Musteriye ozel iskonto YUZDESI (12.5 = %12,5). KDV haric liste fiyatina uygulanir, sonra KDV eklenir (bkz. 188).';

-- ─────────────────────────────────────────────── 2. Bağlantının satış kanalı

-- Portal siparişleri bağlantı başına bir "Web sitesi" kanalında toplanır
-- (vade/ödeme varsayılanı kanaldan, rapor kırılımı). İlk siparişte açılır.
alter table public.web_sitesi_baglantilari
  add column if not exists kanal_id uuid references public.satis_kanallari(id) on delete set null;

-- ─────────────────────────────────────────────── 3. Portal kullanıcıları

create table if not exists public.web_sitesi_portal_kullanicilari (
  id uuid primary key default gen_random_uuid(),
  baglanti_id uuid not null references public.web_sitesi_baglantilari(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.party(id) on delete cascade,
  eposta text not null check (char_length(eposta) between 3 and 254),
  ad text check (ad is null or char_length(ad) <= 120),
  yetkiler text[] not null default '{siparis_ver,fiyat_gor,siparis_gecmisi}'
    check (yetkiler <@ array['siparis_ver', 'fiyat_gor', 'siparis_gecmisi']::text[]),
  durum text not null default 'aktif' check (durum in ('aktif', 'kapali')),
  olusturan uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  kapatildi_at timestamptz
);

-- Aynı portalda bir e-posta aynı anda tek müşteriye bağlı: portal girişte
-- hangi eczane olduğunu ayırt edemezdi. Kapalı hesaplar serbest (yeniden açılabilsin).
create unique index if not exists web_sitesi_portal_kullanicilari_eposta_uniq
  on public.web_sitesi_portal_kullanicilari (baglanti_id, lower(eposta)) where durum = 'aktif';
create index if not exists web_sitesi_portal_kullanicilari_party_idx
  on public.web_sitesi_portal_kullanicilari (party_id);

alter table public.web_sitesi_portal_kullanicilari enable row level security;

comment on table public.web_sitesi_portal_kullanicilari is
  'B2B portal hesaplari (188). Sifre burada YOK; portal kendi kullanici veritabaninda tutar, Projelio yalnizca ac/guncelle/kapat bildirir.';

-- ─────────────────────────────────────────────── 4. Portal siparişi

alter table public.musteri_siparisleri drop constraint if exists musteri_siparisleri_kaynak_check;
alter table public.musteri_siparisleri
  add constraint musteri_siparisleri_kaynak_check check (kaynak in ('elle', 'shopify', 'excel', 'web_sitesi'));

alter table public.musteri_siparisleri
  add column if not exists portal_kullanici_id uuid references public.web_sitesi_portal_kullanicilari(id) on delete set null;

comment on column public.musteri_siparisleri.kaynak is
  'elle; shopify (dis_kimlik = Shopify siparis id); excel (dis_kimlik = satirin karmasi); web_sitesi (dis_kimlik = "<baglanti id>:<sitenin referansi>").';
comment on column public.musteri_siparisleri.portal_kullanici_id is
  'Siparisi portalda veren kullanici (site bildirdiyse).';

-- ─────────────────────────────────────────────── 5. Bildirim kuyruğu genelleşir

alter table public.web_sitesi_kuyrugu add column if not exists tur text not null default 'urun';
alter table public.web_sitesi_kuyrugu drop constraint if exists web_sitesi_kuyrugu_tur_check;
alter table public.web_sitesi_kuyrugu
  add constraint web_sitesi_kuyrugu_tur_check check (tur in ('urun', 'portal_kullanici', 'siparis'));

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'web_sitesi_kuyrugu' and column_name = 'product_id') then
    alter table public.web_sitesi_kuyrugu rename column product_id to kayit_id;
  end if;
end $$;

alter table public.web_sitesi_kuyrugu drop constraint if exists web_sitesi_kuyrugu_pkey;
alter table public.web_sitesi_kuyrugu add primary key (baglanti_id, tur, kayit_id);

comment on table public.web_sitesi_kuyrugu is
  'Siteye gonderilecek bildirimler; (baglanti, tur, kayit) basina tek satir, gonderimde kaydin son hali okunur (188).';

-- Eski imza (186) tetikleyicilerle birlikte değişiyor.
drop trigger if exists web_sitesi_urun_degisti on public.products;
drop trigger if exists web_sitesi_gorsel_degisti on public.product_images;
drop function if exists public.web_sitesi_urun_tetigi();
drop function if exists public.web_sitesi_gorsel_tetigi();
drop function if exists public.web_sitesi_kuyruga_ekle(uuid, uuid);

-- p_baglanti verilirse yalnızca o bağlantıya (portal kullanıcısı, sipariş);
-- verilmezse şirketin bildirim adresi olan bütün aktif bağlantılarına (ürün).
create or replace function public.web_sitesi_kuyruga_ekle(p_org uuid, p_tur text, p_kayit uuid, p_baglanti uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.web_sitesi_kuyrugu (baglanti_id, tur, kayit_id, organization_id)
  select b.id, p_tur, p_kayit, p_org
    from public.web_sitesi_baglantilari b
   where b.organization_id = p_org
     and b.durum = 'aktif'
     and b.webhook_adresi is not null
     and (p_baglanti is null or b.id = p_baglanti)
  on conflict (baglanti_id, tur, kayit_id) do update
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
    perform public.web_sitesi_kuyruga_ekle(old.organization_id, 'urun', old.id);
    return old;
  end if;
  -- Yalnızca sıralama değiştiyse siteye söylenecek bir şey yok.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'sort_order') = (to_jsonb(old) - 'sort_order') then
    return new;
  end if;
  perform public.web_sitesi_kuyruga_ekle(new.organization_id, 'urun', new.id);
  return new;
end;
$$;

create trigger web_sitesi_urun_degisti
  after insert or update or delete on public.products
  for each row execute function public.web_sitesi_urun_tetigi();

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
    perform public.web_sitesi_kuyruga_ekle(v_org, 'urun', v_urun);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger web_sitesi_gorsel_degisti
  after insert or update or delete on public.product_images
  for each row execute function public.web_sitesi_gorsel_tetigi();

-- Portal kullanıcısı açılınca/değişince o bağlantıya bildirim.
create or replace function public.web_sitesi_portal_tetigi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.web_sitesi_kuyruga_ekle(new.organization_id, 'portal_kullanici', new.id, new.baglanti_id);
  return new;
end;
$$;

drop trigger if exists web_sitesi_portal_degisti on public.web_sitesi_portal_kullanicilari;
create trigger web_sitesi_portal_degisti
  after insert or update on public.web_sitesi_portal_kullanicilari
  for each row execute function public.web_sitesi_portal_tetigi();

-- Portal siparişinin aşaması (ya da kalemleri/tutarı) değişince o bağlantıya
-- "order.updated". Yalnızca siteden gelmiş siparişler; elle açılan sipariş
-- portalın değil.
create or replace function public.web_sitesi_siparis_tetigi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.web_sitesi_baglanti_id is null or new.organization_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.asama is not distinct from old.asama
     and new.tutar is not distinct from old.tutar
     and new.notlar is not distinct from old.notlar then
    return new;
  end if;
  perform public.web_sitesi_kuyruga_ekle(new.organization_id, 'siparis', new.id, new.web_sitesi_baglanti_id);
  return new;
end;
$$;

drop trigger if exists web_sitesi_siparis_degisti on public.musteri_siparisleri;
create trigger web_sitesi_siparis_degisti
  after update on public.musteri_siparisleri
  for each row execute function public.web_sitesi_siparis_tetigi();

revoke all on function public.web_sitesi_kuyruga_ekle(uuid, text, uuid, uuid) from public, anon, authenticated;
