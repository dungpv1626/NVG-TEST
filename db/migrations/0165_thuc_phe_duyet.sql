-- 0165 — Nút «Thúc» cho MỌI phê duyệt đang chờ (AFD 4.7: bước hiện tại, ai giữ, chờ bao lâu,
-- nút «Thúc» ghi lịch sử).
--
-- Đến nay «Thúc» chỉ có ở đề nghị vật tư công trường (0134, `request_reminders` gắn cứng công
-- trình). Rà chuỗi bước sau phản hồi chủ dự án: người Kinh doanh gửi báo giá / hợp đồng đi duyệt
-- đã biết đang chờ ai (0162) nhưng không có cách nào nhắc ngoài gọi điện. Bảng lịch sử riêng cho
-- phê duyệt — không nới `request_reminders` (cột công trình NOT NULL, chính sách theo Mẫu E).
--
--  * Chỉ người GỬI phê duyệt thúc được; người nhận là đúng những người `approval_waiting_on` kể ra.
--  * Giãn cách dùng chung tham số `request_nudge_min_interval_hours` (NEN-12; tính theo hồ sơ).
--  * `approval_waiting_on` trả thêm id người giữ, lần thúc gần nhất và lúc thúc lại được — đổi
--    kiểu trả về nên DROP rồi tạo lại.

CREATE TABLE public.approval_reminders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  approval_id        uuid NOT NULL REFERENCES public.approvals(id) ON DELETE CASCADE,
  notified_user_ids  uuid[] NOT NULL DEFAULT '{}',
  waited_hours       integer,
  note               text,
  nudged_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  nudged_at          timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by         uuid REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX approval_reminders_approval_idx
  ON public.approval_reminders (approval_id, nudged_at DESC);

COMMENT ON TABLE public.approval_reminders IS
  'Lịch sử «Thúc» một phê duyệt đang chờ (0165). Chỉ ghi qua nudge_approval; không sửa, không xoá.';

ALTER TABLE public.approval_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.approval_reminders FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.approval_reminders FROM authenticated;

-- Thấy phê duyệt nào (chính sách của `approvals`) thì thấy lịch sử thúc của nó.
CREATE POLICY approval_reminders_select ON public.approval_reminders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.approvals a WHERE a.id = approval_id));

-- --- Ai đang giữ + lần thúc gần nhất ---------------------------------------------------------
DROP FUNCTION IF EXISTS public.approval_waiting_on(uuid);

CREATE FUNCTION public.approval_waiting_on(p_approval_id uuid)
RETURNS TABLE (
  role_labels    text[],
  user_names     text[],
  user_ids       uuid[],
  waiting_since  timestamptz,
  last_nudged_at timestamptz,
  nudge_count    integer,
  next_nudge_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a       record;
  v_hours numeric := NULLIF(public.system_parameter_number('request_nudge_min_interval_hours'), 0);
  v_last  timestamptz;
  v_count integer;
BEGIN
  SELECT id, company_id, subject, amount, status, requested_by, requested_at, deleted_at
    INTO a
    FROM public.approvals WHERE id = p_approval_id;

  -- Chỉ trả cho người xem được pháp nhân của hồ sơ, và chỉ khi còn đang chờ.
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.status <> 'pending_approval'
     OR NOT public.rls_company_access(a.company_id) THEN
    RETURN;
  END IF;

  SELECT max(r.nudged_at), count(*)::int INTO v_last, v_count
    FROM public.approval_reminders r WHERE r.approval_id = p_approval_id;

  RETURN QUERY
  WITH roles_ok AS (
    -- Mọi vai trò có hạn mức ĐỦ (decide_approval cho bất kỳ ai trong số đó duyệt), bậc thấp
    -- xếp trước — xem 0162 vì sao không lọc theo `current_step`.
    SELECT al.role_id, min(al.step) AS step
      FROM public.approval_limits al
     WHERE al.subject = a.subject AND al.is_active
       AND (al.company_id IS NULL OR al.company_id = a.company_id)
       AND (al.max_amount IS NULL OR a.amount IS NULL OR al.max_amount >= a.amount)
     GROUP BY al.role_id
  ),
  people AS (
    SELECT ro.step, r.label::text AS role_label, u.id AS user_id, u.full_name::text AS full_name
      FROM roles_ok ro
      JOIN public.roles r ON r.id = ro.role_id
      JOIN public.user_companies uc ON uc.role_id = ro.role_id AND uc.deleted_at IS NULL
      JOIN public.users u ON u.id = uc.user_id AND u.is_active AND u.deleted_at IS NULL
     WHERE (uc.company_id = a.company_id OR r.sees_all_companies)
       AND u.id IS DISTINCT FROM a.requested_by
  )
  SELECT COALESCE((SELECT array_agg(x.role_label ORDER BY x.step)
                      FROM (SELECT p.role_label, min(p.step) AS step FROM people p
                             GROUP BY p.role_label) x), ARRAY[]::text[]),
         COALESCE((SELECT array_agg(y.full_name ORDER BY y.step, y.full_name)
                      FROM (SELECT p.full_name, min(p.step) AS step FROM people p
                             GROUP BY p.full_name) y), ARRAY[]::text[]),
         COALESCE((SELECT array_agg(DISTINCT p.user_id) FROM people p), ARRAY[]::uuid[]),
         a.requested_at,
         v_last,
         COALESCE(v_count, 0),
         CASE WHEN v_last IS NOT NULL AND v_hours IS NOT NULL
              THEN v_last + make_interval(secs => (v_hours * 3600)::double precision) END;
END;
$$;

COMMENT ON FUNCTION public.approval_waiting_on(uuid) IS
  'Phê duyệt đang chờ ai (0162, 0165): vai trò có hạn mức đủ, tên + id người (trừ người gửi), '
  'chờ từ lúc nào, lần thúc gần nhất và lúc thúc lại được. Mẫu theo dõi AFD 4.7.';

REVOKE ALL ON FUNCTION public.approval_waiting_on(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approval_waiting_on(uuid) TO authenticated;

-- --- Thúc ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nudge_approval(p_approval_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := public.auth_user_id();
  a       record;
  w       record;
  v_hours integer;
  v_id    uuid;
  v_msg   text;
  u       uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT id, company_id, title, requested_by, status, deleted_at
    INTO a FROM public.approvals WHERE id = p_approval_id;
  IF NOT FOUND OR a.deleted_at IS NOT NULL OR a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này không còn chờ phê duyệt.';
  END IF;
  IF a.requested_by IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'Chỉ người gửi phê duyệt mới thúc được.';
  END IF;

  SELECT * INTO w FROM public.approval_waiting_on(p_approval_id);
  IF w.next_nudge_at IS NOT NULL AND w.next_nudge_at > now() THEN
    RAISE EXCEPTION 'Đã thúc lúc %; thúc lại được sau %.',
      to_char(w.last_nudged_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      to_char(w.next_nudge_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI');
  END IF;
  IF cardinality(w.user_ids) = 0 THEN
    RAISE EXCEPTION 'Chưa có ai đủ hạn mức phê duyệt khoản này. Báo Quản trị hệ thống cấu hình hạn mức phê duyệt.';
  END IF;

  v_hours := floor(extract(epoch FROM (now() - w.waiting_since)) / 3600)::int;

  INSERT INTO public.approval_reminders (
    company_id, approval_id, notified_user_ids, waited_hours, note, nudged_by, created_by, updated_by
  ) VALUES (
    a.company_id, p_approval_id, w.user_ids, v_hours, NULLIF(btrim(p_note), ''), v_me, v_me, v_me
  )
  RETURNING id INTO v_id;

  v_msg := format('%s thúc phê duyệt «%s» — đã chờ %s.',
                  COALESCE((SELECT full_name FROM public.users WHERE id = v_me), 'Người gửi'),
                  a.title,
                  CASE WHEN v_hours < 24 THEN v_hours || ' giờ' ELSE (v_hours / 24) || ' ngày' END);

  FOREACH u IN ARRAY w.user_ids LOOP
    PERFORM public.create_notification(
      u, a.company_id, 'approval_nudge', v_msg, 'approvals', p_approval_id, '/viec-can-lam'
    );
  END LOOP;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.nudge_approval(uuid, text) IS
  'Người gửi «Thúc» một phê duyệt đang chờ (0165): báo đúng những người approval_waiting_on kể '
  'ra, ghi approval_reminders, giãn cách theo request_nudge_min_interval_hours.';

REVOKE ALL ON FUNCTION public.nudge_approval(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nudge_approval(uuid, text) TO authenticated;
