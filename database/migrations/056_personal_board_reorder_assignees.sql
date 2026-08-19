-- 056_personal_board_reorder_assignees.sql
-- Yapılacaklar panosunda sıralama, çoklu atamayı da tanısın.
--
-- SORUN:
--   `personal_board_reorder` (bkz. 039) sahiplik doğrulamasını
--   `tasks.assigned_to = p_user_id` ile yapıyor. Çoklu atama geldikten sonra
--   (bkz. 055) bu alan yalnızca BİRİNCİL atanandır: göreve ikinci kişi olarak
--   eklenen biri kartı sürükleyip bıraktığında `where` koşulu tutmuyor, satır
--   sessizce atlanıyor ve hiçbir hata dönmüyor. Sonuç kullanıcı tarafında
--   "taşıdım ama bir süre sonra eski yerine döndü" oluyor: arayüz iyimser
--   davranıp kartı hemen taşıyor, bir sonraki yüklemede sunucudaki eski sıra
--   geri geliyor.
--
-- ÇÖZÜM:
--   Koşul `task_assignees` üzerinden kurulur. Birincil atanan da o tabloda bir
--   satır olduğu için tek atamalı görevlerde davranış birebir aynı kalır.
--
-- Fonksiyonun geri kalanı 039'daki hâliyle aynı; yalnızca `upd_prefs`
-- bloğundaki exists koşulu değişti.

create or replace function public.personal_board_reorder(
  p_user_id uuid,
  p_items   jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items bir dizi olmali' using errcode = '22023';
  end if;

  with ordered as (
    select
      (elem->>'source')::text as source,
      (elem->>'id')::uuid     as item_id,
      (ord - 1)::int          as new_order
    from jsonb_array_elements(p_items) with ordinality as t(elem, ord)
  ),
  -- Her iki tabloya da TEK statement icinde, TEK snapshot uzerinden yazilir.
  upd_personal as (
    update public.personal_todos pt
       set sort_order = o.new_order
      from ordered o
     -- Sahiplik filtresi: baskasinin kaydi listeye sokulsa bile yazilmaz.
     where o.source = 'personal' and o.item_id = pt.id and pt.user_id = p_user_id
    returning 1
  ),
  upd_prefs as (
    insert into public.personal_task_prefs (user_id, task_id, sort_order)
    select p_user_id, o.item_id, o.new_order
    from ordered o
    -- Gorev gercekten bu kullaniciya atanmis olmali. Birincil atanan sarti DEGIL:
    -- task_assignees'te bir satiri olan herkes kendi sirasini yazabilir.
    where o.source = 'assigned'
      and exists (
        select 1 from public.task_assignees ta
         where ta.task_id = o.item_id and ta.user_id = p_user_id
      )
    on conflict (user_id, task_id)
      do update set sort_order = excluded.sort_order, updated_at = current_timestamp
    returning 1
  )
  select (select count(*) from upd_personal) + (select count(*) from upd_prefs)
    into v_touched;
end;
$$;

comment on function public.personal_board_reorder is
  'Yapilacaklar panosunda bir kolonun nihai sirasini yazar. Atanan gorevlerde yetki task_assignees uzerinden dogrulanir (cok atanan destekli).';

revoke all on function public.personal_board_reorder(uuid, jsonb) from public, anon, authenticated;
