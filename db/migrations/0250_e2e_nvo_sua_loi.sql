-- 0250 — Sửa lỗi tìm thấy khi chạy thử trọn luồng NVO trên trình duyệt (30/10/2026).
--
-- 1. Xoá dòng điều khoản hợp đồng bị chặn 403: chính sách đọc `contract_terms_select` có
--    `deleted_at IS NULL`, mà PostgreSQL kiểm cả DÒNG MỚI của một UPDATE có WHERE theo chính sách
--    đọc — nên `update set deleted_at = now() where id = …` từ trình duyệt luôn hỏng («new row
--    violates row-level security policy»), kể cả với người chịu trách nhiệm hợp đồng. Xoá qua
--    hàm này: cùng điều kiện quyền với chính sách sửa (`rls_contract_writable`), trigger trên bảng
--    vẫn chạy như cũ.

CREATE OR REPLACE FUNCTION public.delete_contract_term(p_term_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract uuid;
BEGIN
  SELECT contract_id INTO v_contract
    FROM contract_terms
   WHERE id = p_term_id AND deleted_at IS NULL;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy điều khoản — có thể đã bị xoá.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT rls_contract_writable(v_contract) THEN
    RAISE EXCEPTION 'Không xoá được điều khoản: chỉ người soạn hợp đồng xoá được khi hợp đồng còn sửa được.'
      USING ERRCODE = '42501';
  END IF;
  UPDATE contract_terms SET deleted_at = now() WHERE id = p_term_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_contract_term(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_contract_term(uuid) TO authenticated;

-- 2. Thông báo «hợp đồng đã được phê duyệt» còn nói «Ban Giám đốc ký với khách rồi ghi nhận đã
--    ký» — từ 0187 người chịu trách nhiệm ghi nhận ký kèm bản đã ký. Chép nguyên văn 0163, chỉ đổi câu.
CREATE OR REPLACE FUNCTION public.contracts_decision_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stage = 'cho_duyet' AND NEW.stage IN ('da_duyet', 'nhap')
     AND NEW.responsible_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      NEW.responsible_user_id, NEW.company_id,
      CASE WHEN NEW.stage = 'da_duyet' THEN 'contract_approved' ELSE 'contract_rejected' END,
      CASE WHEN NEW.stage = 'da_duyet'
           THEN format('Hợp đồng %s đã được phê duyệt — trình hai bên ký, rồi bấm «Ghi nhận đã ký» kèm bản đã ký.', NEW.code)
           ELSE format('Hợp đồng %s bị từ chối — xem lý do, sửa rồi gửi phê duyệt lại.', NEW.code)
      END,
      'contracts', NEW.id,
      format('/hd/hop-dong/%s', NEW.id)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- 3. Hợp đồng THI CÔNG của cơ hội còn hồ sơ thiết kế đang làm: công trình mở lúc BÀN GIAO thiết kế
--    (0243, `sign_contract` không tự mở). Nhưng trang hợp đồng vẫn mời «bấm Mở công trình», và nếu
--    bấm thì hợp đồng đã có công trình → lúc bàn giao thiết kế, trigger gắn hợp đồng không còn hợp
--    đồng nào để gắn và báo «chưa có hợp đồng thi công đã ký» — hai công trình cho một nhà hoặc kẹt
--    bàn giao. Chạy thử NVO 30/10/2026.
--
--    `contract_pending_design` — hồ sơ thiết kế đang chờ bàn giao của hợp đồng (cùng điều kiện với
--    `sign_contract`), để giao diện nói đúng đường đi. Chỉ trả cho người xem được Module HD của pháp
--    nhân, như `contract_has_site`.
CREATE OR REPLACE FUNCTION public.contract_pending_design(p_contract_id uuid)
RETURNS TABLE (id uuid, code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE contracts.id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_can_view_module('HD') THEN
    RETURN;
  END IF;
  IF c.type::text <> 'thi_cong' OR COALESCE(c.source_type::text, 'opportunities') <> 'opportunities' THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT d.id, d.code::text
      FROM public.design_projects d
     WHERE d.opportunity_id = c.source_id AND d.deleted_at IS NULL
       AND d.handed_over_at IS NULL AND d.stage::text <> 'dung_thiet_ke'
     ORDER BY d.created_at
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.contract_pending_design(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contract_pending_design(uuid) TO authenticated;

--    Hàng rào ở CSDL: công trình mở thẳng từ hợp đồng ấy (không qua bàn giao thiết kế) bị từ chối.
--    Bàn giao thiết kế chèn công trình có `design_project_id` nên không bị chặn.
CREATE OR REPLACE FUNCTION public.construction_sites_wait_design_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.contract_id IS NULL OR NEW.design_project_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT d.code INTO v_code
    FROM public.contracts c
    JOIN public.design_projects d ON d.opportunity_id = c.source_id
   WHERE c.id = NEW.contract_id
     AND c.type::text = 'thi_cong'
     AND COALESCE(c.source_type::text, 'opportunities') = 'opportunities'
     AND d.deleted_at IS NULL AND d.handed_over_at IS NULL AND d.stage::text <> 'dung_thiet_ke'
   LIMIT 1;
  IF v_code IS NOT NULL THEN
    RAISE EXCEPTION 'Chưa mở công trình từ hợp đồng này được: cơ hội còn hồ sơ thiết kế % đang làm — công trình tự mở khi Thiết kế bàn giao hồ sơ thi công.', v_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS construction_sites_wait_design_handover ON public.construction_sites;
CREATE TRIGGER construction_sites_wait_design_handover
  BEFORE INSERT ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_wait_design_handover();

-- 4. Bàn giao thiết kế mở công trình với KIẾN TRÚC SƯ chủ trì làm người chịu trách nhiệm (chỉ huy
--    công trình) — chạy thử NVO 30/10/2026: công trình NVO-CT-2026-0122 có chỉ huy «Phạm Thị D»
--    (vai trò Thiết kế). 0164 đã sửa cùng lỗi ở `open_site_from_contract` (Kinh doanh làm chỉ huy).
--    Chép nguyên văn bản đang chạy (0035), đổi tham số người chịu trách nhiệm thành NULL; tên và
--    ngày dự kiến lấy từ hợp đồng thi công đã ký sẽ gắn vào công trình.
CREATE OR REPLACE FUNCTION public.handover_design_to_construction(p_design_project_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.auth_user_id();
  p          record;
  v_blocking integer;
  v_first    text;
  v_notified integer;
  v_site_id  uuid;
  v_start    date;
  v_end      date;
  v_title    text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(p.company_id)
     OR NOT public.auth_can_edit_module('TK') THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này.';
  END IF;

  IF p.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Hồ sơ của dự án này đã bàn giao cho Ban công trường.';
  END IF;

  -- TK-08: "kiểm tra tính đầy đủ và đồng bộ giữa các bộ môn TRƯỚC KHI phát hành cho Ban
  -- công trường". Kiểm tra ở CSDL chứ không ở giao diện: gọi thẳng hàm này qua PostgREST
  -- vẫn phải đi qua đúng bộ điều kiện đó.
  SELECT count(*), min(s.message) INTO v_blocking, v_first
    FROM public.check_design_sync(p_design_project_id) s
   WHERE s.blocking;

  IF v_blocking > 0 THEN
    RAISE EXCEPTION 'Hồ sơ chưa đồng bộ, còn % hạng mục phải xử lý. Ví dụ: %', v_blocking, v_first;
  END IF;

  SELECT c.start_date, c.end_date, c.title INTO v_start, v_end, v_title
    FROM public._design_build_contracts(p_design_project_id) c
   WHERE c.stage = 'da_ky'
     AND NOT EXISTS (SELECT 1 FROM public.construction_sites s
                      WHERE s.contract_id = c.id AND s.deleted_at IS NULL)
   ORDER BY c.signed_date DESC NULLS LAST
   LIMIT 1;

  -- Mở công trình để Ban công trường có chỗ ghi nhật ký và theo ngân sách ngay khi nhận
  -- bàn giao (TC-01). NVO làm trọn gói nên không có gói thầu nào ở giữa.
  v_site_id := public.open_construction_site(
    p.company_id,
    -- Tên công trình theo hợp đồng thi công (tên hồ sơ thiết kế thường mở đầu bằng «Thiết kế …»).
    COALESCE(NULLIF(btrim(v_title), ''), p.name),
    NULL, NULL, p_design_project_id,
    p.site_address,
    -- 0250: KHÔNG lấy kiến trúc sư chủ trì làm chỉ huy công trình (như 0164 với Kinh doanh) —
    -- để trống cho Trưởng phòng Thi công phân công ở bước Chuẩn bị.
    NULL,
    -- Ngày dự kiến theo hợp đồng thi công đã ký sẽ gắn vào công trình (cùng cách chọn với trigger
    -- `construction_sites_link_design_contract`), như `open_site_from_contract`.
    v_start, v_end
  );

  UPDATE public.design_projects
     SET handed_over_at = now(), stage = 'ban_giao',
         construction_site_id = v_site_id,
         updated_at = now(), updated_by = v_user
   WHERE id = p_design_project_id;

  -- Bàn giao là phải có người BIẾT mà nhận (NEN-03) — cùng nguyên tắc với DA-09.
  SELECT count(*) INTO v_notified
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_handover',
      format('Hồ sơ thi công của dự án thiết kế %s đã bàn giao.', p.code),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TC', 'DA_DT', 'KD') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_notified;
END;
$function$;

-- 5. «Bỏ đầu việc» ở Kế hoạch tuần (T3, 0242) bị chặn 403 cùng lý do với mục 1: chính sách đọc
--    `site_plan_items_select` có `deleted_at IS NULL`. Bỏ qua hàm này, cùng điều kiện quyền với
--    chính sách sửa. Đầu việc đã có dấu tiến độ trong nhật ký thì không bỏ được (giao diện cũng
--    chỉ hiện nút khi chưa có) — dấu tiến độ là căn cứ, không để trỏ vào đầu việc đã ẩn.
CREATE OR REPLACE FUNCTION public.remove_site_plan_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site uuid;
BEGIN
  SELECT construction_site_id INTO v_site
    FROM public.site_plan_items
   WHERE id = p_item_id AND deleted_at IS NULL;
  IF v_site IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy đầu việc — có thể đã bị bỏ.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.rls_site_writable(v_site) OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Không bỏ được đầu việc: chỉ người ghi được công trình này (chỉ huy trưởng, Thi công) bỏ được.'
      USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_log_plan_progress g WHERE g.plan_item_id = p_item_id) THEN
    RAISE EXCEPTION 'Đầu việc đã có tiến độ ghi trong nhật ký — không bỏ được, đánh dấu xong hoặc để lại.';
  END IF;
  UPDATE public.site_plan_items SET deleted_at = now() WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_site_plan_item(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.remove_site_plan_item(uuid) TO authenticated;
