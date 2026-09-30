-- ============================================================================
-- TC-13 — nghiệm thu có danh mục kiểm tra và ảnh từng mục; vá phạm vi công trình của
-- record_acceptance.
--
-- Biên bản nghiệm thu hiện chỉ có một con số giá trị: không có gì cho thấy ĐÃ KIỂM những gì.
-- Khảo sát công trường: nghiệm thu là chỗ tranh cãi nhiều nhất với chủ đầu tư và tổ đội, và
-- bằng chứng hiện nằm rải rác trong ảnh Zalo.
--
-- Thiết kế:
--   · `acceptance_checklists` — DANH MỤC KIỂM TRA dùng lại được (mục kiểm, mục nào bắt buộc
--     ảnh). Nội dung danh mục là quyết định nghiệp vụ của NVG; bảng chỉ là chỗ chứa.
--   · `acceptance_checklist_results` — kết quả từng mục của MỘT biên bản, CHỤP LẠI nhãn mục lúc
--     ký: sửa danh mục sau này không được đổi nội dung một biên bản đã ký (cùng lẽ với
--     `unit_price_applied`, CLAUDE.md 5.2).
--   · Biên bản sinh ra đã ký ngay (0117: không có bước nháp), nên kết quả phải ghi CÙNG GIAO
--     DỊCH với biên bản: `record_acceptance_with_checklist` gọi lại `record_acceptance` — dùng
--     lại mọi kiểm tra, cách cấp mã và thông báo Kế toán, không chép lại.
--   · Kết quả không sửa được sau khi ký (trigger, cùng thông điệp 0117), không ghi thẳng được
--     từ trình duyệt.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Vá Mẫu E cho record_acceptance — thân hàm giữ nguyên, chỉ thêm một điều kiện
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_acceptance(p_site_id uuid, p_acceptance_type acceptance_type, p_stage_name text, p_value bigint DEFAULT NULL::bigint, p_scope text DEFAULT NULL::text, p_accepted_date date DEFAULT NULL::date, p_subcontractor_id uuid DEFAULT NULL::uuid, p_counterpart_signed_by text DEFAULT NULL::text, p_outstanding_issues text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_user         uuid := public.auth_user_id();
  s              record;
  v_company_code text;
  v_id           uuid;
  v_code         text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO s FROM public.construction_sites
   WHERE id = p_site_id AND deleted_at IS NULL;

  -- 0136: thêm Mẫu E — trước đây chỉ huy trưởng lập được biên bản cho công trình KHÔNG được
  -- giao, vì hàm chỉ kiểm pháp nhân và quyền sửa phân hệ.
  IF NOT FOUND OR NOT public.rls_company_access(s.company_id)
     OR NOT public.auth_can_edit_module('TC')
     OR NOT public.rls_site_in_scope(p_site_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên công trình này.';
  END IF;

  IF s.stage = 'hoan_thanh' THEN
    RAISE EXCEPTION 'Công trình đã kết thúc, không lập thêm biên bản nghiệm thu.';
  END IF;

  IF COALESCE(btrim(p_stage_name), '') = '' THEN
    RAISE EXCEPTION 'Vui lòng nhập giai đoạn hoặc hạng mục được nghiệm thu.';
  END IF;

  IF p_acceptance_type = 'thau_phu' AND p_subcontractor_id IS NULL THEN
    RAISE EXCEPTION 'Vui lòng chọn tổ đội được nghiệm thu.';
  END IF;

  IF p_subcontractor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.subcontractors sc
     WHERE sc.id = p_subcontractor_id AND sc.construction_site_id = p_site_id
       AND sc.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tổ đội được chọn không thuộc công trình này.';
  END IF;

  IF p_acceptance_type = 'khach_hang' AND COALESCE(p_value, 0) <= 0 THEN
    RAISE EXCEPTION 'Vui lòng nhập giá trị khối lượng được nghiệm thu để Kế toán có căn cứ thu tiền.';
  END IF;

  SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = s.company_id;
  v_code := public.next_record_code(v_company_code, 'NT');

  INSERT INTO public.acceptance_records (
    company_id, construction_site_id, code, acceptance_type, status,
    stage_name, scope, value, subcontractor_id,
    accepted_date, accepted_at, accepted_by, counterpart_signed_by, outstanding_issues
  )
  VALUES (
    s.company_id, p_site_id, v_code, p_acceptance_type, 'da_nghiem_thu',
    btrim(p_stage_name), p_scope, p_value, p_subcontractor_id,
    COALESCE(p_accepted_date, current_date), now(), v_user,
    NULLIF(btrim(COALESCE(p_counterpart_signed_by, '')), ''), p_outstanding_issues
  )
  RETURNING id INTO v_id;

  IF p_acceptance_type = 'khach_hang' THEN
    PERFORM public.create_notification(
      recipient.id, s.company_id, 'acceptance_billing',
      format('Công trình %s đã nghiệm thu %s với chủ đầu tư, giá trị %s đồng — đủ căn cứ thu tiền theo hợp đồng.',
             s.code, btrim(p_stage_name), to_char(p_value, 'FM999,999,999,999')),
      'acceptance_records', v_id,
      format('/tc/cong-trinh/%s?tab=nghiem-thu', p_site_id)
    )
    FROM (
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = s.company_id OR r.sees_all_companies)
        AND r.code IN ('KT', 'CFO')
    ) recipient;
  END IF;

  RETURN v_id;
END;
$fn$;


-- ----------------------------------------------------------------------------
-- 2. Danh mục kiểm tra
-- ----------------------------------------------------------------------------

CREATE TYPE public.checklist_result AS ENUM ('dat', 'khong_dat', 'khong_ap_dung');

CREATE TABLE public.acceptance_checklists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Rỗng = dùng chung toàn NVG.
  company_id      uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  -- Rỗng = dùng cho mọi loại nghiệm thu.
  acceptance_type acceptance_type,
  -- [{ "key": "...", "label": "...", "requires_photo": true }]
  items           jsonb NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at      timestamptz,
  CONSTRAINT acceptance_checklists_items_array
    CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
  CONSTRAINT acceptance_checklists_name_unique UNIQUE NULLS NOT DISTINCT (company_id, name)
);

COMMENT ON TABLE public.acceptance_checklists IS
  'Danh mục kiểm tra khi nghiệm thu (TC-13). Nội dung là quyết định nghiệp vụ của NVG.';

ALTER TABLE public.acceptance_checklists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acceptance_checklists FROM anon;

CREATE POLICY acceptance_checklists_select ON public.acceptance_checklists
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.auth_can_view_module('TC')
    AND (company_id IS NULL OR public.rls_company_access(company_id))
  );

-- Văn phòng thi công và Ban Giám đốc soạn danh mục; chỉ huy trưởng dùng, không sửa.
CREATE POLICY acceptance_checklists_insert ON public.acceptance_checklists
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  );

CREATE POLICY acceptance_checklists_update ON public.acceptance_checklists
  FOR UPDATE TO authenticated
  USING (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  )
  WITH CHECK (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped()
        AND company_id IS NOT NULL AND public.rls_company_access(company_id))
  );

SELECT public.attach_audit_touch('public.acceptance_checklists');


-- ----------------------------------------------------------------------------
-- 3. Kết quả từng mục của một biên bản
-- ----------------------------------------------------------------------------

CREATE TABLE public.acceptance_checklist_results (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  acceptance_record_id    uuid NOT NULL REFERENCES public.acceptance_records(id) ON DELETE CASCADE,
  acceptance_checklist_id uuid REFERENCES public.acceptance_checklists(id) ON DELETE SET NULL,
  position                integer NOT NULL,
  item_key                text NOT NULL,
  -- Chụp lại lúc ký — sửa danh mục sau này không đổi biên bản đã ký.
  item_label              text NOT NULL,
  result                  public.checklist_result NOT NULL,
  note                    text,
  -- Đường dẫn trong bucket construction-photos: `<công trình>/nghiem-thu/<uuid>.<đuôi>`.
  photo_paths             text[] NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT acceptance_checklist_results_position_unique UNIQUE (acceptance_record_id, position)
);

CREATE INDEX acceptance_checklist_results_record_idx
  ON public.acceptance_checklist_results (acceptance_record_id);

ALTER TABLE public.acceptance_checklist_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.acceptance_checklist_results FROM anon;
-- Chỉ ghi qua record_acceptance_with_checklist.
REVOKE INSERT, UPDATE, DELETE ON public.acceptance_checklist_results FROM authenticated;

CREATE POLICY acceptance_checklist_results_select ON public.acceptance_checklist_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.acceptance_records ar
      WHERE ar.id = acceptance_record_id
        AND public.rls_site_readable(ar.construction_site_id)
    )
  );

-- Biên bản sinh ra đã ký (0117), nên mọi kết quả đều đã ký: không sửa được, kể cả từ hàm
-- SECURITY DEFINER viết sau này. Ngoại lệ DUY NHẤT: khoá ngoại tới danh mục bị đặt về rỗng khi
-- danh mục bị xoá — nhãn mục đã chụp lại nên nội dung biên bản không đổi. Xoá dây chuyền khi gỡ
-- công trình là việc quản trị; trình duyệt vốn không có quyền xoá.
CREATE OR REPLACE FUNCTION public.acceptance_checklist_results_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.acceptance_checklist_id IS NULL
     AND (to_jsonb(NEW) - 'acceptance_checklist_id') = (to_jsonb(OLD) - 'acceptance_checklist_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Biên bản nghiệm thu đã ký, không sửa được nữa. Cần đính chính thì lập biên bản điều chỉnh.';
END;
$$;

CREATE TRIGGER acceptance_checklist_results_frozen
  BEFORE UPDATE ON public.acceptance_checklist_results
  FOR EACH ROW EXECUTE FUNCTION public.acceptance_checklist_results_frozen();


-- ----------------------------------------------------------------------------
-- 4. Ghi nghiệm thu kèm danh mục kiểm tra — một giao dịch
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_acceptance_with_checklist(
  p_site_id uuid,
  p_acceptance_type acceptance_type,
  p_stage_name text,
  p_checklist_id uuid,
  p_results jsonb,
  p_value bigint DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_accepted_date date DEFAULT NULL,
  p_subcontractor_id uuid DEFAULT NULL,
  p_counterpart_signed_by text DEFAULT NULL,
  p_outstanding_issues text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  v_list      record;
  v_item      jsonb;
  v_given     jsonb;
  v_path      text;
  v_pos       integer := 0;
  v_failed    boolean := false;
  v_id        uuid;
  v_company   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v_list FROM public.acceptance_checklists
   WHERE id = p_checklist_id AND deleted_at IS NULL AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy danh mục kiểm tra đã chọn, hoặc danh mục đã ngừng dùng.';
  END IF;

  SELECT company_id INTO v_company FROM public.construction_sites WHERE id = p_site_id;
  IF v_list.company_id IS NOT NULL AND v_list.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Danh mục kiểm tra này thuộc pháp nhân khác.';
  END IF;

  IF p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Chưa có kết quả kiểm tra.';
  END IF;

  -- Mọi mục của danh mục phải có kết quả; mục bắt buộc ảnh phải có ảnh đúng công trình.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items) LOOP
    SELECT r INTO v_given FROM jsonb_array_elements(p_results) r
     WHERE r->>'key' = v_item->>'key' LIMIT 1;
    IF v_given IS NULL OR (v_given->>'result') NOT IN ('dat', 'khong_dat', 'khong_ap_dung') THEN
      RAISE EXCEPTION 'Chưa chấm mục «%». Chọn Đạt, Không đạt hoặc Không áp dụng cho mọi mục.', v_item->>'label';
    END IF;
    IF (v_item->>'requires_photo')::boolean IS TRUE
       AND (v_given->>'result') <> 'khong_ap_dung'
       AND COALESCE(jsonb_array_length(v_given->'photo_paths'), 0) = 0 THEN
      RAISE EXCEPTION 'Mục «%» cần ít nhất một ảnh hiện trường.', v_item->>'label';
    END IF;
    FOR v_path IN SELECT jsonb_array_elements_text(COALESCE(v_given->'photo_paths', '[]'::jsonb)) LOOP
      IF left(v_path, length(p_site_id::text) + 1) <> p_site_id::text || '/' THEN
        RAISE EXCEPTION 'Ảnh của mục «%» không thuộc công trình này.', v_item->>'label';
      END IF;
    END LOOP;
    IF v_given->>'result' = 'khong_dat' THEN
      v_failed := true;
    END IF;
  END LOOP;

  IF v_failed AND COALESCE(btrim(p_outstanding_issues), '') = '' THEN
    RAISE EXCEPTION 'Có mục Không đạt — ghi rõ tồn tại cần khắc phục trước khi ký biên bản.';
  END IF;

  -- Dùng lại toàn bộ kiểm tra, cấp mã và thông báo Kế toán của record_acceptance (kể cả Mẫu E).
  v_id := public.record_acceptance(
    p_site_id, p_acceptance_type, p_stage_name, p_value, p_scope, p_accepted_date,
    p_subcontractor_id, p_counterpart_signed_by, p_outstanding_issues
  );

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_list.items) LOOP
    v_pos := v_pos + 1;
    SELECT r INTO v_given FROM jsonb_array_elements(p_results) r
     WHERE r->>'key' = v_item->>'key' LIMIT 1;
    INSERT INTO public.acceptance_checklist_results (
      company_id, acceptance_record_id, acceptance_checklist_id, position,
      item_key, item_label, result, note, photo_paths, created_by, updated_by
    ) VALUES (
      v_company, v_id, p_checklist_id, v_pos,
      v_item->>'key', v_item->>'label', (v_given->>'result')::public.checklist_result,
      NULLIF(btrim(COALESCE(v_given->>'note', '')), ''),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_given->'photo_paths', '[]'::jsonb))),
      v_user, v_user
    );
  END LOOP;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_acceptance_with_checklist(
  uuid, acceptance_type, text, uuid, jsonb, bigint, text, date, uuid, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_acceptance_with_checklist(
  uuid, acceptance_type, text, uuid, jsonb, bigint, text, date, uuid, text, text
) TO authenticated;

COMMENT ON FUNCTION public.record_acceptance_with_checklist(
  uuid, acceptance_type, text, uuid, jsonb, bigint, text, date, uuid, text, text
) IS 'TC-13: lập biên bản nghiệm thu kèm kết quả từng mục kiểm tra và ảnh, trong một giao dịch.';
