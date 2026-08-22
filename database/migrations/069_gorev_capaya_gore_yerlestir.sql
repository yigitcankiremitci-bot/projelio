-- Alt görev göreve dönüştürülünce nereye konacağı.
--
-- Sorun: yükseltilen kayıt üst seviye listenin SONUNA ekleniyordu. Kullanıcı
-- listenin ortasındaki bir görevin alt görevini yükseltince kart gözden
-- kayboluyor, panoda alakasız bir yerde beliriyordu ("kafasına göre yerlere
-- koydu"). Beklenen davranış: kayıt, ayrıldığı görevin HEMEN ALTINDA belirsin.
--
-- Neden fonksiyon: araya sokmak, altındaki tüm kardeşlerin sort_order'ını bir
-- artırmayı gerektiriyor. Bunu uygulama katmanından yapmak satır sayısı kadar
-- UPDATE demek; tek ifadeyle burada yapılıyor.
CREATE OR REPLACE FUNCTION public.task_place_after(p_task_id UUID, p_anchor_id UUID)
RETURNS VOID AS $$
DECLARE
  v_anchor RECORD;
BEGIN
  SELECT project_id, department_id, sort_order, parent_task_id
    INTO v_anchor
    FROM public.tasks
   WHERE id = p_anchor_id;

  -- Çapa yoksa ya da kendisi bir alt görevse araya sokacak bir yer yok:
  -- kayıt bulunduğu sırada kalır (çağıran zaten listenin sonuna koymuştu).
  IF NOT FOUND OR v_anchor.parent_task_id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Çapanın altındaki üst seviye kardeşlere bir sıra yer aç.
  -- Kapsam karşılaştırması coalesce ile: NULL = NULL karşılaştırması yanlış
  -- döner ve departman görevleri (project_id null) hiç eşleşmezdi.
  UPDATE public.tasks
     SET sort_order = sort_order + 1
   WHERE parent_task_id IS NULL
     AND id <> p_task_id
     AND COALESCE(project_id::TEXT, '') = COALESCE(v_anchor.project_id::TEXT, '')
     AND COALESCE(department_id::TEXT, '') = COALESCE(v_anchor.department_id::TEXT, '')
     AND sort_order > v_anchor.sort_order;

  UPDATE public.tasks
     SET sort_order = v_anchor.sort_order + 1
   WHERE id = p_task_id;
END;
$$ LANGUAGE plpgsql;
