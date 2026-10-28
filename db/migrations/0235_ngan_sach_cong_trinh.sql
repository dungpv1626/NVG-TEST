-- ============================================================================
-- Ngân sách cho công trình không qua gói thầu hay hồ sơ thiết kế (anh Dũng 28/10/2026: «theo
-- bạn đề xuất»).
--
-- Lỗi thật (đo trên CSDL máy 28/10/2026): hợp đồng thi công từ cơ hội CRM ký xong tự mở công
-- trình (0187) nhưng `project_budgets` chỉ dựng được từ dự toán đã duyệt của gói thầu / hồ sơ
-- thiết kế. Công trình `NVC-CT-2026-0105` (hợp đồng «AB») có 0 dòng ngân sách → `site_cost_codes`
-- trả rỗng → đề nghị mua gắn công trình KHÔNG gửi phê duyệt được: thiếu mã thì «Chưa chọn mã chi
-- phí…», có mã thì «Mã chi phí VAT_TU không có trong ngân sách của công trình này».
--
-- Đề xuất đã chốt: lập ngân sách NGAY TRÊN CÔNG TRÌNH, dựng từ báo giá đã duyệt và đã gửi khách
-- của cơ hội nguồn.
--   · Báo giá CRM không có dòng hạng mục (chỉ `total_value` — là GIÁ BÁN), nên máy dựng MỘT dòng
--     tổng với số dự trù = 0 và ghi giá trị báo giá vào `notes` làm căn cứ. Máy KHÔNG tự đặt tỷ lệ
--     chi phí / lợi nhuận (5.2, PRD 2.3): người lập nhập số dự trù, chia thêm dòng theo nhóm.
--   · Ai lập / sửa: Trưởng phòng Thi công (sửa được TC, KHÔNG phải vai trò hiện trường — chỉ huy
--     trưởng có `approve` TC nhưng bị giới hạn phạm vi, `roles.site_scoped`) và Ban Giám đốc
--     (`auth_manages_all_companies` — KSNB chỉ xem). Gói trong một hàm `auth_manages_site_budget`.
--   · Dòng lợi nhuận: chỉ người xem được lợi nhuận mới thêm / sửa / xoá (Mẫu D giữ nguyên).
--   · Sửa mã / xoá dòng đã có chứng từ (đã cam kết, đã phát sinh, đề nghị mua, phân bổ thanh
--     toán) bị chặn: đơn hàng tìm dòng ngân sách THEO MÃ (`purchase_request_budget_line`), đổi mã
--     là cắt mối nối tiền. Mỗi lần sửa / xoá ghi `audit_logs`.
--   · `stage_readiness('site')` KHÔNG thêm điều kiện «có ngân sách» để khởi công — chặn khởi công
--     là quyết định nghiệp vụ NVG chưa nói; thiếu ngân sách đã tự lộ ra ở đề nghị mua.
--   · `submit_purchase_request_approval` (0037) KHÔNG phải sửa: nó đọc ngân sách theo
--     `construction_site_id`, không qua gói thầu / thiết kế — dòng gắn thẳng công trình qua được.
--
-- Chạy lại được (CREATE OR REPLACE, DROP … IF EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cho phép dòng ngân sách gắn thẳng công trình
-- ----------------------------------------------------------------------------

-- Trước: đúng một trong gói thầu / thiết kế. Nay: tối đa một trong hai; không có cả hai thì
-- PHẢI có công trình. Dòng của gói thầu / thiết kế vẫn mang thêm `construction_site_id` khi mở
-- công trình — nên không viết «đúng một trong ba».
ALTER TABLE public.project_budgets DROP CONSTRAINT IF EXISTS project_budgets_one_owner;
ALTER TABLE public.project_budgets ADD CONSTRAINT project_budgets_one_owner CHECK (
  num_nonnulls(bidding_project_id, design_project_id) = 1
  OR (bidding_project_id IS NULL AND design_project_id IS NULL AND construction_site_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_budgets_site_cost_code
  ON public.project_budgets (construction_site_id, cost_code)
  WHERE deleted_at IS NULL AND bidding_project_id IS NULL AND design_project_id IS NULL;

-- Dòng chỉ gắn công trình: công trình là hồ sơ cha, nên cũng bất biến (như `design_project_id`
-- ở 0035). Dòng gói thầu / thiết kế vẫn được gắn công trình sau, ở bước mở công trình.
CREATE OR REPLACE FUNCTION public.project_budgets_site_owner_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.bidding_project_id IS NULL AND OLD.design_project_id IS NULL
     AND NEW.construction_site_id IS DISTINCT FROM OLD.construction_site_id THEN
    RAISE EXCEPTION 'Không chuyển được dòng ngân sách sang công trình khác.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_budgets_site_owner_frozen ON public.project_budgets;
CREATE TRIGGER project_budgets_site_owner_frozen
  BEFORE UPDATE ON public.project_budgets
  FOR EACH ROW EXECUTE FUNCTION public.project_budgets_site_owner_frozen();

-- Khoá ngoại `construction_site_id` là ON DELETE SET NULL (đúng cho dòng gói thầu). Với dòng chỉ
-- gắn công trình, SET NULL sẽ vi phạm CHECK ở trên và làm hỏng lệnh xoá cứng công trình (chỉ dọn
-- dữ liệu thử làm vậy — nghiệp vụ xoá mềm). Xoá trước các dòng ấy.
CREATE OR REPLACE FUNCTION public.construction_sites_drop_site_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.project_budgets
   WHERE construction_site_id = OLD.id
     AND bidding_project_id IS NULL AND design_project_id IS NULL;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.construction_sites_drop_site_budget() FROM authenticated, anon, public;

DROP TRIGGER IF EXISTS construction_sites_drop_site_budget ON public.construction_sites;
CREATE TRIGGER construction_sites_drop_site_budget
  BEFORE DELETE ON public.construction_sites
  FOR EACH ROW EXECUTE FUNCTION public.construction_sites_drop_site_budget();


-- ----------------------------------------------------------------------------
-- 2. Quyền đọc: thêm Mẫu E cho nhánh «sửa được TC»
--
-- Chép 0085, chỉ thêm: người đọc nhờ quyền sửa TC (không phải vai trò xem giá vốn) chỉ thấy dòng
-- của công trình nằm trong phạm vi (`rls_site_readable`) — chỉ huy trưởng công trình A không đọc
-- thẳng ngân sách công trình B qua PostgREST. `construction_budget_status` (0069) đã lọc như vậy.
-- Dòng lợi nhuận giữ nguyên yêu cầu `rls_sees_sensitive('profit')`.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS project_budgets_select ON public.project_budgets;

CREATE POLICY project_budgets_select ON public.project_budgets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      (cost_group = 'loi_nhuan' AND public.rls_sees_sensitive('profit'))
      OR (cost_group <> 'loi_nhuan'
          AND (public.rls_sees_sensitive('cost')
               OR (public.auth_can_edit_module('TC')
                   AND (construction_site_id IS NULL
                        OR public.rls_site_readable(construction_site_id)))))
    )
  );


-- ----------------------------------------------------------------------------
-- 3. Ai lập / sửa ngân sách công trình
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_manages_site_budget(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.construction_sites s
     WHERE s.id = p_site_id
       AND s.deleted_at IS NULL
       AND s.stage <> 'hoan_thanh'
       AND public.rls_company_access(s.company_id)
  )
  AND (
    public.auth_manages_all_companies()
    -- Trưởng phòng Thi công: sửa được TC và KHÔNG chỉ giữ vai trò hiện trường.
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  );
$$;

COMMENT ON FUNCTION public.auth_manages_site_budget(uuid) IS
  'Lập / sửa ngân sách gắn thẳng công trình (0235): Trưởng phòng Thi công (sửa TC, không phải vai trò hiện trường) hoặc Ban Giám đốc. Chỉ huy trưởng, Kinh doanh, KSNB không.';

GRANT EXECUTE ON FUNCTION public.auth_manages_site_budget(uuid) TO authenticated;


-- Báo giá nguồn: báo giá ĐÃ DUYỆT và ĐÃ GỬI KHÁCH mới nhất của cơ hội sinh ra hợp đồng.
CREATE OR REPLACE FUNCTION public._site_budget_source_quote(p_site_id uuid)
RETURNS TABLE (quote_id uuid, quote_code text, quote_value bigint, contract_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.code::text, q.total_value, c.code::text
    FROM public.construction_sites s
    JOIN public.contracts c ON c.id = s.contract_id AND c.deleted_at IS NULL
    JOIN public.quotes q ON q.opportunity_id = c.source_id AND q.deleted_at IS NULL
   WHERE s.id = p_site_id
     AND c.source_type = 'opportunities'
     AND q.company_id = s.company_id
     AND q.status = 'completed'
     AND q.sent_to_customer_at IS NOT NULL
   ORDER BY q.is_current_version DESC, q.sent_to_customer_at DESC
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._site_budget_source_quote(uuid) FROM authenticated, anon, public;


-- Tình trạng cho giao diện. Người không có quyền lập chỉ nhận `can_manage = false` — không lộ
-- báo giá (giá bán) cho Thi công hiện trường.
CREATE OR REPLACE FUNCTION public.site_budget_source(p_site_id uuid)
RETURNS TABLE (
  can_manage     boolean,
  has_budget     boolean,
  site_only      boolean,
  quote_code     text,
  quote_value    bigint,
  contract_code  text,
  blocked_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has   boolean;
  v_other boolean;
  q       record;
BEGIN
  IF NOT public.auth_manages_site_budget(p_site_id) THEN
    RETURN QUERY SELECT false, NULL::boolean, NULL::boolean, NULL::text, NULL::bigint, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.project_budgets b
                  WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL),
         EXISTS (SELECT 1 FROM public.project_budgets b
                  WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL
                    AND (b.bidding_project_id IS NOT NULL OR b.design_project_id IS NOT NULL))
    INTO v_has, v_other;

  SELECT * INTO q FROM public._site_budget_source_quote(p_site_id);

  RETURN QUERY SELECT
    true,
    v_has,
    NOT v_other,
    q.quote_code,
    q.quote_value,
    q.contract_code,
    CASE
      WHEN v_has THEN NULL
      WHEN q.quote_id IS NULL THEN
        'Hợp đồng của công trình không đi từ cơ hội có báo giá đã duyệt và đã gửi khách — chưa có căn cứ để lập ngân sách tại đây.'
      ELSE NULL
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.site_budget_source(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. Lập ngân sách từ báo giá
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_site_budget_from_quote(p_site_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  s      record;
  q      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_manages_site_budget(p_site_id) THEN
    RAISE EXCEPTION 'Không lập được ngân sách cho công trình này. Trưởng phòng Thi công hoặc Ban Giám đốc lập ngân sách công trình.';
  END IF;

  -- Khoá dòng công trình: hai người bấm cùng lúc thì người sau thấy ngân sách đã có.
  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.project_budgets b
              WHERE b.construction_site_id = p_site_id AND b.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Công trình đã có ngân sách. Sửa từng dòng thay vì lập lại.';
  END IF;

  SELECT * INTO q FROM public._site_budget_source_quote(p_site_id);
  IF q.quote_id IS NULL THEN
    RAISE EXCEPTION 'Chưa có báo giá đã duyệt và đã gửi khách của cơ hội sinh ra hợp đồng này — chưa lập được ngân sách từ báo giá.';
  END IF;

  -- Báo giá CRM không có dòng hạng mục → một dòng tổng. Số dự trù để 0: giá báo khách là GIÁ
  -- BÁN, lấy nó làm chi phí là tự đặt tỷ lệ lợi nhuận 0 % — việc của người lập (5.2).
  INSERT INTO public.project_budgets (
    company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount, notes,
    created_by, updated_by
  )
  VALUES (
    s.company_id, p_site_id, 'vat_tu', 'TONG', 'Chi phí thi công (chưa chia nhóm)', 0,
    format('Lập từ báo giá %s của hợp đồng %s — giá trị đã gửi khách %s đồng (giá bán, chưa phải chi phí). Số dự trù do người lập nhập.',
           q.quote_code, q.contract_code,
           COALESCE(replace(to_char(q.quote_value, 'FM999,999,999,999,999'), ',', '.'), 'chưa ghi')),
    v_user, v_user
  );

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, s.company_id, 'build_site_budget', 'construction_sites', p_site_id, NULL,
          jsonb_build_object('quote_code', q.quote_code, 'quote_value', q.quote_value), NULL);

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION public.build_site_budget_from_quote(uuid) IS
  'Lập ngân sách nháp cho công trình mở từ hợp đồng của cơ hội CRM, căn cứ báo giá đã duyệt + đã gửi khách (0235). Một dòng tổng, số dự trù = 0 để người lập nhập — không tự đặt tỷ lệ chi phí / lợi nhuận.';

GRANT EXECUTE ON FUNCTION public.build_site_budget_from_quote(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Thêm / sửa / xoá mềm dòng ngân sách gắn thẳng công trình
-- ----------------------------------------------------------------------------

-- Dòng đã có tiền hoặc chứng từ trỏ tới mã thì không đổi mã / xoá được.
CREATE OR REPLACE FUNCTION public._site_budget_line_in_use(b public.project_budgets)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.actual_amount <> 0 OR b.committed_amount <> 0
      OR EXISTS (SELECT 1 FROM public.purchase_requests pr
                  WHERE pr.construction_site_id = b.construction_site_id
                    AND pr.cost_code = b.cost_code AND pr.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.payment_request_allocations a
                  WHERE a.construction_site_id = b.construction_site_id
                    AND a.cost_code = b.cost_code);
$$;

REVOKE EXECUTE ON FUNCTION public._site_budget_line_in_use(public.project_budgets) FROM authenticated, anon, public;


CREATE OR REPLACE FUNCTION public.save_site_budget_line(
  p_site_id uuid,
  p_line_id uuid,
  p_cost_group cost_group,
  p_cost_code text,
  p_name text,
  p_budgeted_amount bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  v_code text := upper(btrim(COALESCE(p_cost_code, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  s      record;
  b      public.project_budgets;
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  IF NOT public.auth_manages_site_budget(p_site_id) THEN
    RAISE EXCEPTION 'Không sửa được ngân sách công trình này. Trưởng phòng Thi công hoặc Ban Giám đốc sửa ngân sách công trình.';
  END IF;

  IF p_cost_group IS NULL THEN
    RAISE EXCEPTION 'Chưa chọn nhóm chi phí.';
  END IF;
  IF v_code = '' OR length(v_code) > 64 THEN
    RAISE EXCEPTION 'Mã chi phí phải có từ 1 đến 64 ký tự.';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'Chưa nhập tên dòng ngân sách.';
  END IF;
  IF p_budgeted_amount IS NULL OR p_budgeted_amount < 0 THEN
    RAISE EXCEPTION 'Số tiền dự trù phải từ 0 đồng trở lên.';
  END IF;
  IF p_cost_group = 'loi_nhuan' AND NOT public.rls_sees_sensitive('profit') THEN
    RAISE EXCEPTION 'Dòng lợi nhuận chỉ Ban Giám đốc lập được.';
  END IF;

  SELECT * INTO s FROM public.construction_sites WHERE id = p_site_id FOR UPDATE;

  -- Ngân sách đi từ gói thầu / thiết kế là của dự toán đã duyệt — sửa ở hồ sơ nguồn, không ở đây.
  IF EXISTS (SELECT 1 FROM public.project_budgets x
              WHERE x.construction_site_id = p_site_id AND x.deleted_at IS NULL
                AND (x.bidding_project_id IS NOT NULL OR x.design_project_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Ngân sách công trình này lập từ dự toán đã duyệt của gói thầu hoặc dự án thiết kế — sửa ở hồ sơ nguồn.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_budgets x
              WHERE x.construction_site_id = p_site_id AND x.deleted_at IS NULL
                AND x.cost_code = v_code AND x.id IS DISTINCT FROM p_line_id) THEN
    RAISE EXCEPTION 'Mã chi phí % đã có trong ngân sách công trình. Chọn mã khác.', v_code;
  END IF;

  IF p_line_id IS NULL THEN
    INSERT INTO public.project_budgets (
      company_id, construction_site_id, cost_group, cost_code, name, budgeted_amount,
      created_by, updated_by
    )
    VALUES (s.company_id, p_site_id, p_cost_group, v_code, v_name, p_budgeted_amount, v_user, v_user)
    RETURNING id INTO v_id;

    INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
    VALUES (v_user, s.company_id, 'add_site_budget_line', 'project_budgets', v_id, NULL,
            jsonb_build_object('cost_group', p_cost_group, 'cost_code', v_code, 'name', v_name,
                               'budgeted_amount', p_budgeted_amount), NULL);
    RETURN v_id;
  END IF;

  SELECT * INTO b FROM public.project_budgets
   WHERE id = p_line_id AND construction_site_id = p_site_id AND deleted_at IS NULL
     AND bidding_project_id IS NULL AND design_project_id IS NULL
   FOR UPDATE;

  IF NOT FOUND OR (b.cost_group = 'loi_nhuan' AND NOT public.rls_sees_sensitive('profit')) THEN
    RAISE EXCEPTION 'Không tìm thấy dòng ngân sách này.';
  END IF;

  IF b.cost_code <> v_code AND public._site_budget_line_in_use(b) THEN
    RAISE EXCEPTION 'Mã chi phí % đã có đề nghị mua, đơn hàng hoặc chi phí gắn vào — không đổi mã được. Thêm dòng mới nếu cần mã khác.', b.cost_code;
  END IF;

  UPDATE public.project_budgets
     SET cost_group = p_cost_group, cost_code = v_code, name = v_name,
         budgeted_amount = p_budgeted_amount, updated_at = now(), updated_by = v_user
   WHERE id = p_line_id;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, s.company_id, 'update_site_budget_line', 'project_budgets', p_line_id,
          jsonb_build_object('cost_group', b.cost_group, 'cost_code', b.cost_code, 'name', b.name,
                             'budgeted_amount', b.budgeted_amount),
          jsonb_build_object('cost_group', p_cost_group, 'cost_code', v_code, 'name', v_name,
                             'budgeted_amount', p_budgeted_amount), NULL);
  RETURN p_line_id;
END;
$$;

COMMENT ON FUNCTION public.save_site_budget_line(uuid, uuid, cost_group, text, text, bigint) IS
  'Thêm (p_line_id rỗng) hoặc sửa một dòng ngân sách gắn thẳng công trình (0235). Không đổi mã dòng đã có chứng từ; ghi audit_logs.';

GRANT EXECUTE ON FUNCTION public.save_site_budget_line(uuid, uuid, cost_group, text, text, bigint) TO authenticated;


CREATE OR REPLACE FUNCTION public.delete_site_budget_line(p_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  b      public.project_budgets;
BEGIN
  SELECT * INTO b FROM public.project_budgets
   WHERE id = p_line_id AND deleted_at IS NULL
     AND bidding_project_id IS NULL AND design_project_id IS NULL;

  IF NOT FOUND OR v_user IS NULL OR NOT public.auth_manages_site_budget(b.construction_site_id)
     OR (b.cost_group = 'loi_nhuan' AND NOT public.rls_sees_sensitive('profit')) THEN
    RAISE EXCEPTION 'Không xoá được dòng ngân sách này.';
  END IF;

  IF public._site_budget_line_in_use(b) THEN
    RAISE EXCEPTION 'Mã chi phí % đã có đề nghị mua, đơn hàng hoặc chi phí gắn vào — không xoá được. Đặt số dự trù về 0 nếu không dùng nữa.', b.cost_code;
  END IF;

  UPDATE public.project_budgets
     SET deleted_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_line_id;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, b.company_id, 'delete_site_budget_line', 'project_budgets', p_line_id,
          jsonb_build_object('cost_group', b.cost_group, 'cost_code', b.cost_code, 'name', b.name,
                             'budgeted_amount', b.budgeted_amount), NULL, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_site_budget_line(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
