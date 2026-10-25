-- 0223 — «Nhận soạn thay» hợp đồng cho Ban Giám đốc (anh Dũng 25/10/2026).
--
-- Vì sao: Ban Giám đốc (TGĐ / CFO / BGĐ) có quyền PHÊ DUYỆT Hợp đồng nhưng không có quyền SỬA — đúng quy tắc
-- «người thực hiện tách người phê duyệt» (9.4). Khi người chịu trách nhiệm vắng / chậm, lãnh đạo cần soạn tiếp. Thay vì
-- mở quyền sửa mọi hợp đồng, lãnh đạo NHẬN SOẠN THAY một hợp đồng cụ thể: trở thành người chịu trách nhiệm của nó,
-- có ghi lịch sử, người soạn trước được báo. Từ đó họ sửa được ĐÚNG hợp đồng ấy (và chỉ khi còn Nháp).
--
-- Tự duyệt: người nhận soạn rồi gửi phê duyệt không tự đồng ý được (trigger 0156), trừ TGĐ (0218) — giữ nguyên.

-- Ai SOẠN được hợp đồng: có quyền sửa Module HD (như cũ), HOẶC là người phê duyệt HD (không phải vai chỉ xem KSNB)
-- đang là người chịu trách nhiệm của chính hợp đồng đó.
CREATE OR REPLACE FUNCTION public.auth_drafts_contract(p_responsible uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_can_edit_module('HD')
      OR (p_responsible IS NOT NULL
          AND p_responsible = public.auth_user_id()
          AND public.auth_can_approve_module('HD')
          AND NOT public.auth_is_read_only());
$$;

COMMENT ON FUNCTION public.auth_drafts_contract(uuid) IS
  'Soạn được hợp đồng: quyền sửa HD, hoặc người phê duyệt HD đã nhận soạn thay (là người chịu trách nhiệm) — 0223.';

-- rls_contract_writable — chép 0157, đổi điều kiện quyền sửa module sang auth_drafts_contract.
CREATE OR REPLACE FUNCTION public.rls_contract_writable(p_contract_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.deleted_at IS NULL
      AND public.rls_company_access(c.company_id)
      AND public.auth_drafts_contract(c.responsible_user_id)
      -- 0157: chỉ người chịu trách nhiệm (hoặc TGĐ/CFO/BGĐ/Quản trị) — có quyền sửa module HD
      -- không có nghĩa là sửa được hợp đồng người khác đang soạn.
      AND public.rls_owner_can_write(c.company_id, c.responsible_user_id)
      AND c.stage NOT IN ('hoan_thanh', 'huy')
  );
$$;

-- Sửa thông tin hợp đồng khi Nháp — cùng điều kiện, THÊM người chịu trách nhiệm (rls_owner_can_write). Trước 0223
-- chính sách chỉ kiểm quyền sửa module: một nhân viên Kinh doanh sửa được thông tin hợp đồng người khác đang soạn
-- (lộ ra khi viết phép thử nhận soạn thay) — trái quy tắc «chỉ soạn, sửa hợp đồng mình chịu trách nhiệm» (9.4).
DROP POLICY IF EXISTS contracts_update ON public.contracts;
CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_drafts_contract(responsible_user_id)
    AND public.rls_owner_can_write(company_id, responsible_user_id)
    AND stage = 'nhap'
  )
  WITH CHECK (public.rls_company_access(company_id));

-- submit_contract_approval — chép nguyên văn bản đang chạy, chỉ đổi điều kiện quyền.
CREATE OR REPLACE FUNCTION public.submit_contract_approval(p_contract_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.auth_user_id();
  c          record;
  v_missing  integer;
  v_approval uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id)
     OR NOT public.auth_drafts_contract(c.responsible_user_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên hợp đồng này.';
  END IF;

  IF c.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng này đã được trình ký.';
  END IF;

  IF c.value IS NULL OR c.value <= 0 THEN
    RAISE EXCEPTION 'Chưa có giá trị hợp đồng. Nhập giá trị trước khi trình ký.';
  END IF;

  -- HD-02 liệt kê tám nhóm điều khoản phải theo dõi. Ba nhóm dưới đây là những nhóm mà
  -- thiếu chúng thì hợp đồng không thực hiện được, nên chặn ngay ở bước trình ký — phát
  -- hiện sau khi đã ký là quá muộn để bổ sung.
  SELECT count(*) INTO v_missing
    FROM unnest(ARRAY['pham_vi', 'gia_tri', 'tien_do_thanh_toan']::contract_term_type[]) AS r(t)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.contract_terms ct
      WHERE ct.contract_id = p_contract_id AND ct.deleted_at IS NULL AND ct.term_type = r.t
   );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Còn % nhóm điều khoản bắt buộc chưa ghi (phạm vi, giá trị, tiến độ thanh toán). Kiểm tra tab Điều khoản.', v_missing;
  END IF;

  INSERT INTO public.approvals (
    company_id, subject, entity_type, entity_id, entity_code,
    title, amount, reason, status, requested_by, due_date
  )
  VALUES (
    c.company_id, 'contract', 'contracts', c.id, c.code,
    format('Hợp đồng %s — %s', c.code, c.title),
    c.value, c.notes, 'pending_approval', v_user,
    -- Hạn duyệt bám ngày bắt đầu thực hiện: duyệt sau khi đã phải khởi công thì vô nghĩa.
    c.start_date::timestamptz
  )
  RETURNING id INTO v_approval;

  UPDATE public.contracts
     SET stage = 'cho_duyet', updated_at = now(), updated_by = v_user
   WHERE id = p_contract_id;

  RETURN v_approval;
END;
$function$;

-- Nhận soạn thay.
CREATE OR REPLACE FUNCTION public.take_over_contract(p_contract_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  c record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;
  SELECT * INTO c FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.rls_company_access(c.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy hợp đồng.';
  END IF;
  IF NOT public.auth_can_approve_module('HD') OR public.auth_is_read_only() THEN
    RAISE EXCEPTION 'Chỉ Ban Giám đốc nhận soạn thay được hợp đồng.';
  END IF;
  IF c.stage <> 'nhap' THEN
    RAISE EXCEPTION 'Hợp đồng đã gửi phê duyệt — chỉ nhận soạn thay được khi còn Nháp.';
  END IF;
  IF c.responsible_user_id = v_user THEN
    RAISE EXCEPTION 'Đang là người chịu trách nhiệm của hợp đồng này.';
  END IF;

  UPDATE public.contracts SET responsible_user_id = v_user, updated_by = v_user, updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.audit_logs (user_id, company_id, action, entity_type, entity_id, before, after, reason)
  VALUES (v_user, c.company_id, 'take_over_contract', 'contracts', c.id,
          jsonb_build_object('responsible_user_id', c.responsible_user_id),
          jsonb_build_object('responsible_user_id', v_user),
          nullif(btrim(coalesce(p_reason, '')), ''));

  IF c.responsible_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      c.responsible_user_id, c.company_id, 'contract_taken_over',
      format('%s đã nhận soạn thay hợp đồng %s%s.',
             (SELECT full_name FROM public.users WHERE id = v_user), c.code,
             CASE WHEN nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN ''
                  ELSE ' — ' || btrim(p_reason) END),
      'contracts', c.id,
      format('/hd/hop-dong/%s', c.id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.take_over_contract(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.take_over_contract(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_drafts_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_drafts_contract(uuid) TO authenticated;
