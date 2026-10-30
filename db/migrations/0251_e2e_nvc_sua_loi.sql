-- 0251 — Sửa lỗi tìm thấy khi chạy thử trọn luồng NVC trên trình duyệt (30/10/2026).
--
-- 1. `site_cost_lines` (0246) là SECURITY DEFINER và trả MỌI dòng ngân sách của công trình cho người xem
--    được công trình — gồm cả dòng «Lợi nhuận mục tiêu» (`cost_group = 'loi_nhuan'`). Chỉ huy trưởng /
--    Trưởng phòng Thi công thấy «LOI_NHUAN — Lợi nhuận mục tiêu (còn 900.000.000 đồng)» trong ô «Nguồn
--    ngân sách» khi chọn thầu phụ — lộ lợi nhuận (Mẫu D) mà `project_budgets_select` đã chặn, và cho
--    chọn lợi nhuận làm nguồn chi trả. Lợi nhuận không phải dòng chi được: loại hẳn khỏi hai hàm.
-- 2. `cancel_acceptance` (0035) hủy được biên bản nghiệm thu ĐÃ KÝ HAI BÊN (kể cả khi Kế toán đã ghi
--    nhận, đã vào đợt khối lượng trả tổ đội). Chứng từ đã ký là bất biến (BSD 3.5, CLAUDE.md 5.2) —
--    chặn ở CSDL: cả hàm lẫn trigger bất biến của biên bản.
-- 3. Thông báo «Hợp đồng … đã được ký, giá trị … đồng» (`sign_contract`) gửi cả vai trò Thi công — lộ
--    giá trị hợp đồng cho phòng không xem phân hệ Hợp đồng (0165), kèm đường dẫn mở ra trang «Không
--    mở được phân hệ»; số in kiểu Anh `7,300,000,000`. Thông báo bàn giao ngân sách (DA-09) dẫn Thi
--    công sang trang gói thầu mà Thi công không xem được. Sửa bằng trigger nhỏ trên `notifications`
--    thay vì chép lại `sign_contract` / `generate_project_budget` (bài học 0086, 0183).
--
-- Chạy lại được.

-- --- 1. Dòng ngân sách chọn được cho thầu phụ: không có lợi nhuận ---------------------------------------
CREATE OR REPLACE FUNCTION public._site_budget_line_remaining(p_site_id uuid, p_cost_code text)
RETURNS TABLE (found boolean, name text, cost_group public.cost_group, budgeted bigint, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) > 0,
         min(pb.name),
         min(pb.cost_group::text)::public.cost_group,
         COALESCE(sum(pb.budgeted_amount), 0)::bigint,
         COALESCE(sum(pb.budgeted_amount - pb.committed_amount - pb.actual_amount), 0)::bigint
    FROM public.project_budgets pb
   WHERE pb.construction_site_id = p_site_id AND pb.cost_code = p_cost_code AND pb.deleted_at IS NULL
     -- 0251: lợi nhuận mục tiêu không phải dòng chi — không làm nguồn chi trả được.
     AND pb.cost_group <> 'loi_nhuan';
$$;
REVOKE ALL ON FUNCTION public._site_budget_line_remaining(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.site_cost_lines(p_site_id uuid)
RETURNS TABLE (cost_code text, name text, cost_group text, budgeted bigint, remaining bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pb.cost_code::text, min(pb.name), min(pb.cost_group::text),
         sum(pb.budgeted_amount)::bigint,
         sum(pb.budgeted_amount - pb.committed_amount - pb.actual_amount)::bigint
    FROM public.project_budgets pb
   WHERE pb.construction_site_id = p_site_id AND pb.deleted_at IS NULL
     -- 0251: dòng «Lợi nhuận mục tiêu» là số Mẫu D (`project_budgets_select` chỉ trả cho người xem được
     -- lợi nhuận) và không chi được — hàm DEFINER này từng trả nó cho chỉ huy trưởng.
     AND pb.cost_group <> 'loi_nhuan'
     AND public.rls_site_readable(p_site_id)
   GROUP BY pb.cost_code
   ORDER BY pb.cost_code;
$$;
REVOKE ALL ON FUNCTION public.site_cost_lines(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_cost_lines(uuid) TO authenticated;

-- --- 2. Biên bản nghiệm thu đã ký không hủy được --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_acceptance(p_acceptance_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
BEGIN
  SELECT * INTO a FROM public.acceptance_records
   WHERE id = p_acceptance_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_site_writable(a.construction_site_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên biên bản nghiệm thu này.';
  END IF;

  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân hủy biên bản nghiệm thu.';
  END IF;

  IF a.status = 'huy' THEN
    RAISE EXCEPTION 'Biên bản này đã được hủy.';
  END IF;

  -- 0251: biên bản đã ký hai bên là căn cứ thu / trả tiền — bất biến (BSD 3.5).
  IF a.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Biên bản đã ký hai bên — không hủy được. Cần đính chính thì lập biên bản điều chỉnh.';
  END IF;

  UPDATE public.acceptance_records
     SET status = 'huy', cancel_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_acceptance_id;
END;
$$;
COMMENT ON FUNCTION public.cancel_acceptance(uuid, text) IS
  'Hủy một biên bản nghiệm thu CHƯA ký kèm nguyên nhân — biên bản không bị xóa, vẫn truy vết được (TC-08). '
  'Đã ký hai bên thì không hủy được (0251).';

-- Lưới an toàn cho mọi đường ghi (kể cả UPDATE thẳng qua RLS): bản 0192 + chặn đổi trạng thái sang «huy».
CREATE OR REPLACE FUNCTION public.acceptance_records_signature_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL AND (
       NEW.signed_at IS DISTINCT FROM OLD.signed_at
    OR NEW.signed_by IS DISTINCT FROM OLD.signed_by
    OR NEW.counterpart_signer_name IS DISTINCT FROM OLD.counterpart_signer_name
    OR NEW.counterpart_signer_title IS DISTINCT FROM OLD.counterpart_signer_title
    OR NEW.nvg_signature_path IS DISTINCT FROM OLD.nvg_signature_path
    OR NEW.counterpart_signature_path IS DISTINCT FROM OLD.counterpart_signature_path
    OR NEW.paper_scan_path IS DISTINCT FROM OLD.paper_scan_path) THEN
    RAISE EXCEPTION 'Biên bản đã ký hai bên — không sửa được phần ký. Cần đính chính thì lập biên bản mới.';
  END IF;
  -- 0251: đã ký thì không hủy được (trước đây `cancel_acceptance` vẫn hủy).
  IF OLD.signed_at IS NOT NULL AND NEW.status = 'huy' AND OLD.status IS DISTINCT FROM 'huy' THEN
    RAISE EXCEPTION 'Biên bản đã ký hai bên — không hủy được. Cần đính chính thì lập biên bản điều chỉnh.';
  END IF;
  IF OLD.billing_recorded_at IS NOT NULL AND (
       NEW.billing_recorded_at IS DISTINCT FROM OLD.billing_recorded_at
    OR NEW.billing_recorded_by IS DISTINCT FROM OLD.billing_recorded_by) THEN
    RAISE EXCEPTION 'Kế toán đã ghi nhận biên bản này.';
  END IF;
  RETURN NEW;
END;
$$;

-- --- 3. Thông báo cho người không xem được phân hệ nguồn ------------------------------------------------
-- Người nhận có quyền xem một phân hệ ở pháp nhân của thông báo (gương `auth_can_view_module`, theo người
-- nhận thay vì người đang đăng nhập).
CREATE OR REPLACE FUNCTION public._user_can_view_module(p_user_id uuid, p_company_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_companies uc
      JOIN public.permissions p ON p.role_id = uc.role_id
      JOIN public.roles r ON r.id = uc.role_id
     WHERE uc.user_id = p_user_id
       AND uc.deleted_at IS NULL
       AND p.module_code = p_module
       AND p.can_view
       AND (p_company_id IS NULL OR uc.company_id = p_company_id OR r.sees_all_companies)
  );
$$;
REVOKE ALL ON FUNCTION public._user_can_view_module(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notifications_hide_module_for_outsiders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  IF NEW.type = 'contract_signed' THEN
    -- Số kiểu Việt Nam (CGD 4.3): «7,300,000,000» → «7.300.000.000».
    NEW.message := regexp_replace(NEW.message, ',(?=\d{3}(\D|$))', '.', 'g');
    IF NOT public._user_can_view_module(NEW.user_id, NEW.company_id, 'HD') THEN
      -- Thi công không xem phân hệ Hợp đồng (chủ dự án giữ quyền, 0165): không lộ giá trị, không dẫn
      -- sang trang không mở được — dẫn tới khối «Hợp đồng đã ký chờ mở công trình» (0230).
      SELECT c.code INTO v_code FROM public.contracts c WHERE c.id = NEW.related_entity_id;
      NEW.message := format('Hợp đồng %s đã được ký — mở công trình ở trang Công trình.',
                            COALESCE(v_code, ''));
      NEW.action_url := '/tc/cong-trinh';
    END IF;
  ELSIF NEW.type = 'budget_handover'
        AND NOT public._user_can_view_module(NEW.user_id, NEW.company_id, 'DA') THEN
    -- Ngân sách đã nằm ở tab Ngân sách của công trình (khi mở) — Thi công không xem gói thầu.
    NEW.action_url := '/tc/cong-trinh';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_hide_module_for_outsiders ON public.notifications;
CREATE TRIGGER notifications_hide_module_for_outsiders
  BEFORE INSERT ON public.notifications
  FOR EACH ROW WHEN (NEW.type IN ('contract_signed', 'budget_handover'))
  EXECUTE FUNCTION public.notifications_hide_module_for_outsiders();
