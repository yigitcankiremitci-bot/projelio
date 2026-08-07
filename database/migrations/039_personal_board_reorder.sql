-- 039 — Yapılacaklar panosunu ortak kanban sözleşmesine hizala
--
-- Yapılacaklar sayfası artık proje/departman kanbanlarıyla aynı TaskColumn
-- bileşenini kullanıyor. O bileşenin sözleşmesi iki ayrı çağrıdır:
--   1) durum değişikliği  (PATCH /tasks/:id/status karşılığı)
--   2) kolon sırası       (PATCH /tasks/reorder karşılığı, tam id listesi)
--
-- 038'deki personal_board_move (durum + sıralama tek çağrıda) bu sözleşmeye
-- uymuyordu; yerine yalnızca sıralamayı yazan personal_board_reorder geliyor.
-- Durum değişikliği servis katmanında doğrudan yapılıyor (sahiplik filtreli).
--
-- NOT: 038'deki "sentinel" sıralama açıklaması geçerliliğini koruyor; sentinel'i
-- devreden çıkaran çağrı artık personal_board_move değil personal_board_reorder.

drop function if exists public.personal_board_move(uuid, text, uuid, text, integer);

-- p_items: [{"source":"personal","id":"..."}, {"source":"assigned","id":"..."}]
-- Dizideki sıra sort_order olur (0'dan başlayarak).
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
    -- Gorev gercekten bu kullaniciya atanmis olmali; aksi halde herhangi bir
    -- task id'si icin pref satiri yazilabilirdi.
    where o.source = 'assigned'
      and exists (select 1 from public.tasks t where t.id = o.item_id and t.assigned_to = p_user_id)
    on conflict (user_id, task_id)
      do update set sort_order = excluded.sort_order, updated_at = current_timestamp
    returning 1
  )
  select (select count(*) from upd_personal) + (select count(*) from upd_prefs)
    into v_touched;
end;
$$;

comment on function public.personal_board_reorder is
  'Yapilacaklar panosunda bir kolonun nihai sirasini yazar. p_items dizisindeki sira sort_order olur. Sahiplik icerideki filtrelerle dogrulanir.';

revoke all on function public.personal_board_reorder(uuid, jsonb) from public, anon, authenticated;
