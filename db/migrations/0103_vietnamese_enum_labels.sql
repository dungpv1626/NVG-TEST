-- ============================================================================
-- 0103 — Nhãn tiếng Việt cho mã enum trong chữ hiện ra màn hình
--
-- Lỗi được sửa: bốn chỗ dựng câu bằng `replace(<enum>::text, '_', ' ')`, cho ra chữ
-- Việt KHÔNG DẤU giữa một câu có dấu:
--
--   "Bộ môn kien truc chưa có bản vẽ nào được phát hành."
--   "Bộ môn ket cau đang ở trạng thái "dang lam", chưa báo hoàn thành."
--   "Bản dien nuoc của dự án thiết kế NVO-… đã phát hành phiên bản 3."
--   project_budgets.name = "Vat Tu" / "Nhan Cong" / "May Moc"…
--
-- Vi phạm CLAUDE.md 4.1 ("giao diện + nội dung hệ thống: tiếng Việt có dấu 100%").
-- Đáng chú ý ở chỗ nó lọt lưới lâu: đọc mã nguồn chỉ thấy `replace(...)` chứ không
-- thấy chuỗi hỏng, và `grep` một câu tiếng Việt không dấu thì không ra tệp nào —
-- chữ chỉ thành hình lúc chạy. Cùng loại với nhóm lỗi "chữ do trình duyệt tự sinh"
-- đã ghi ở CLAUDE.md 4.1, chỉ khác nguồn sinh chữ là CSDL.
--
-- ⚠️ Riêng `build_budget_lines` còn tự mâu thuẫn: khối INSERT thứ hai của CHÍNH NÓ
--    đã ghi 'Chi phí chung' / 'Dự phòng rủi ro' / 'Lợi nhuận mục tiêu' có dấu, nên
--    một bảng ngân sách có thể vừa có dòng "Chi Phi Chung" vừa có dòng "Chi phí
--    chung" tuỳ đường dữ liệu nào chạy trước.
--
-- ## Vì sao là hàm nhãn, không phải sửa từng câu
--
-- Ba bảng nhãn dưới đây ĐÃ tồn tại trong `shared/` (`DESIGN_DISCIPLINE_LABELS`,
-- `DISCIPLINE_TASK_STATUS_META`, `COST_GROUP_LABELS`). Chép chuỗi thẳng vào từng
-- câu format() là tạo nguồn thứ ba, không ai canh. Gói thành hàm thì chỉ có MỘT
-- chỗ trong CSDL để đối chiếu, và `db/src/__tests__/enum-labels.test.ts` so từng
-- giá trị với bảng của `shared/` — lệch một chữ là đỏ.
--
-- Dữ liệu cũ: `project_budgets.name` đã ghi sai được vá lại ở cuối tệp. Sửa tên
-- hiển thị không đụng tới số tiền, `cost_group` hay `cost_code`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ba hàm nhãn
--
-- IMMUTABLE: nhãn là hằng số của enum, không phụ thuộc dữ liệu hay thời điểm.
-- Trả NULL cho giá trị chưa khai — thêm nhánh enum mà quên thêm nhãn thì câu
-- thông báo mất một mảnh, và kiểm thử phủ đủ nhánh sẽ bắt được ngay.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.design_discipline_label(p_discipline design_discipline)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_discipline
           WHEN 'phuong_an' THEN 'Phương án kiến trúc'
           WHEN 'kien_truc' THEN 'Kiến trúc'
           WHEN 'ket_cau'   THEN 'Kết cấu'
           WHEN 'dien_nuoc' THEN 'Điện nước'
         END;
$$;

COMMENT ON FUNCTION public.design_discipline_label(design_discipline) IS
  'Nhãn tiếng Việt của bộ môn thiết kế — bản sao trong CSDL của DESIGN_DISCIPLINE_LABELS (@nvg/shared/tk), có kiểm thử đối chiếu.';

CREATE OR REPLACE FUNCTION public.discipline_task_status_label(p_status discipline_task_status)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_status
           WHEN 'chua_bat_dau'  THEN 'Chưa bắt đầu'
           WHEN 'dang_lam'      THEN 'Đang triển khai'
           WHEN 'cho_kiem_tra'  THEN 'Chờ kiểm tra chéo'
           WHEN 'hoan_thanh'    THEN 'Hoàn thành'
         END;
$$;

COMMENT ON FUNCTION public.discipline_task_status_label(discipline_task_status) IS
  'Nhãn tiếng Việt trạng thái phần việc bộ môn — bản sao của DISCIPLINE_TASK_STATUS_META (@nvg/shared/tk).';

CREATE OR REPLACE FUNCTION public.cost_group_label(p_group cost_group)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT CASE p_group
           WHEN 'vat_tu'        THEN 'Vật tư'
           WHEN 'nhan_cong'     THEN 'Nhân công'
           WHEN 'may_moc'       THEN 'Máy móc, thiết bị'
           WHEN 'thau_phu'      THEN 'Nhà thầu phụ'
           WHEN 'chi_phi_chung' THEN 'Chi phí chung'
           WHEN 'du_phong'      THEN 'Dự phòng rủi ro'
           WHEN 'loi_nhuan'     THEN 'Lợi nhuận mục tiêu'
         END;
$$;

COMMENT ON FUNCTION public.cost_group_label(cost_group) IS
  'Nhãn tiếng Việt nhóm chi phí — bản sao của COST_GROUP_LABELS (@nvg/shared/da).';


-- ----------------------------------------------------------------------------
-- 2. Kiểm tra đồng bộ đa bộ môn (TK-04, TK-08)
--
-- Nguyên văn 0025 mục 9, chỉ đổi ba chỗ dựng nhãn. Chép lại cả hàm vì Postgres
-- không sửa được một câu bên trong; phần logic KHÔNG đổi.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_design_sync(p_design_project_id uuid)
RETURNS TABLE (
  code text,
  discipline design_discipline,
  message text,
  blocking boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
BEGIN
  SELECT * INTO p FROM public.design_projects
   WHERE id = p_design_project_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_design_project_readable(p_design_project_id) THEN
    RAISE EXCEPTION 'Không xem được dự án thiết kế này.';
  END IF;

  -- (a) Thiếu bản vẽ đang hiệu lực của một bộ môn — thiếu là không thi công được.
  RETURN QUERY
  SELECT 'thieu_ban_ve'::text,
         d.discipline,
         format('Bộ môn %s chưa có bản vẽ nào được phát hành.',
                public.design_discipline_label(d.discipline)),
         true
    FROM unnest(ARRAY['kien_truc', 'ket_cau', 'dien_nuoc']::design_discipline[]) AS d(discipline)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = d.discipline
        AND v.is_current_version
        AND v.published_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (b) Bộ môn chưa báo hoàn thành. Phát hành khi bộ môn còn đang vẽ nghĩa là bản trên hệ
  -- thống không phải bản cuối — đúng vướng mắc #9 mà module này sinh ra để giải.
  RETURN QUERY
  SELECT 'bo_mon_chua_xong'::text,
         t.discipline,
         format('Bộ môn %s đang ở trạng thái "%s", chưa báo hoàn thành.',
                public.design_discipline_label(t.discipline),
                public.discipline_task_status_label(t.status)),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.discipline <> 'phuong_an'
     AND t.status <> 'hoan_thanh';

  -- (c) Xung đột giữa các bộ môn còn ghi trong hồ sơ (TK-04) — ví dụ dầm chắn cửa sổ, ống
  -- kỹ thuật đâm vào cột. Còn nội dung ở đây thì chưa phát hành được.
  RETURN QUERY
  SELECT 'con_xung_dot'::text,
         t.discipline,
         format('Bộ môn %s còn ghi nhận xung đột chưa xử lý: %s',
                public.design_discipline_label(t.discipline),
                left(t.conflict_notes, 160)),
         true
    FROM public.design_discipline_tasks t
   WHERE t.design_project_id = p_design_project_id
     AND t.deleted_at IS NULL
     AND t.conflict_notes IS NOT NULL
     AND btrim(t.conflict_notes) <> '';

  -- (d) Yêu cầu thay đổi đã chấp thuận nhưng chưa thực hiện: bàn giao lúc này là giao bộ hồ
  -- sơ mà chính mình đã biết là phải sửa (TK-06).
  RETURN QUERY
  SELECT 'thay_doi_chua_lam'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s đã chấp thuận nhưng chưa thực hiện.',
                COALESCE(c.code, c.title)),
         true
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status = 'chap_thuan';

  -- (e) Yêu cầu thay đổi còn đang đánh giá — cảnh báo, không chặn: có thể kết luận là không
  -- làm, và chặn cứng ở đây thì một yêu cầu bỏ quên treo cả dự án.
  RETURN QUERY
  SELECT 'thay_doi_dang_mo'::text,
         NULL::design_discipline,
         format('Yêu cầu thay đổi %s chưa có kết luận.', COALESCE(c.code, c.title)),
         false
    FROM public.change_requests c
   WHERE c.design_project_id = p_design_project_id
     AND c.deleted_at IS NULL
     AND c.status IN ('moi', 'dang_danh_gia');

  -- (f) Phương án kiến trúc chưa được khách duyệt (TK-03).
  RETURN QUERY
  SELECT 'phuong_an_chua_duyet'::text,
         'phuong_an'::design_discipline,
         'Phương án kiến trúc chưa có xác nhận duyệt của khách hàng.',
         true
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_versions v
      WHERE v.design_project_id = p_design_project_id
        AND v.discipline = 'phuong_an'
        AND v.customer_approved_at IS NOT NULL
        AND v.deleted_at IS NULL
   );

  -- (g) Đầu bài chưa xác nhận — cảnh báo: hồ sơ vẫn có thể đúng, nhưng không có căn cứ đối
  -- chiếu khi khách nói "tôi đâu có yêu cầu thế này".
  RETURN QUERY
  SELECT 'dau_bai_chua_xac_nhan'::text,
         NULL::design_discipline,
         'Đầu bài đang hiệu lực chưa được xác nhận.',
         false
   WHERE NOT EXISTS (
     SELECT 1 FROM public.design_briefs b
      WHERE b.design_project_id = p_design_project_id
        AND b.is_current_version
        AND b.confirmed_at IS NOT NULL
        AND b.deleted_at IS NULL
   );
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Phát hành phiên bản bản vẽ (TK-05)
--
-- Nguyên văn 0025 mục 7, chỉ đổi câu thông báo. "Bản dien nuoc" → "Hồ sơ Điện nước":
-- đổi luôn danh từ vì "Bản %s" chỉ đọc xuôi khi %s là mã, còn với nhãn đầy đủ
-- ("Phương án kiến trúc") thì thành "Bản Phương án kiến trúc".
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_design_version(p_version_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.auth_user_id();
  v          record;
  p          record;
  v_notified integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO v FROM public.design_versions
   WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bản này.';
  END IF;

  IF NOT public.rls_design_project_writable(v.design_project_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên dự án thiết kế này, hoặc hồ sơ đã bàn giao.';
  END IF;

  IF v.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'Phiên bản này đã phát hành.';
  END IF;

  IF v.document_version_id IS NULL THEN
    RAISE EXCEPTION 'Chưa đính kèm tệp bản vẽ. Tải tệp lên trước khi phát hành.';
  END IF;

  SELECT * INTO p FROM public.design_projects WHERE id = v.design_project_id;

  -- Hạ bản cũ TRƯỚC khi nâng bản mới: unique index chỉ cho một bản đã phát hành đang hiệu
  -- lực trên mỗi bộ môn, làm ngược thứ tự sẽ vi phạm ràng buộc ngay giữa giao dịch.
  UPDATE public.design_versions
     SET is_current_version = false, updated_at = now(), updated_by = v_user
   WHERE design_project_id = v.design_project_id
     AND discipline = v.discipline
     AND is_current_version
     AND published_at IS NOT NULL
     AND deleted_at IS NULL;

  UPDATE public.design_versions
     SET is_current_version = true,
         published_at = now(),
         published_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_version_id;

  -- Thông báo cho ĐÚNG những bộ phận PRD TK-05 liệt kê, trong đúng pháp nhân của dự án.
  -- Người vừa bấm phát hành không nhận thông báo về việc mình vừa làm (create_notification lo).
  SELECT count(*) INTO v_notified
  FROM (
    SELECT public.create_notification(
      u.id, p.company_id, 'design_version_published',
      format('Hồ sơ %s của dự án thiết kế %s đã phát hành phiên bản %s.',
             public.design_discipline_label(v.discipline), p.code, v.version),
      'design_projects', p.id,
      format('/tk/du-an/%s?tab=phien-ban', p.id)
    ) AS notification_id
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND uc.company_id = p.company_id
      AND (r.code IN ('TKE', 'DA_DT', 'KD', 'TC') OR u.id = p.responsible_user_id)
  ) AS sent
  WHERE sent.notification_id IS NOT NULL;

  RETURN v_notified;
END;
$$;

COMMENT ON FUNCTION public.publish_design_version(uuid) IS
  'Phát hành một phiên bản bản vẽ và thông báo đồng thời các bên liên quan — TK-05, Backend Schema 4.4.';


-- ----------------------------------------------------------------------------
-- 4. Dựng dòng ngân sách từ dự toán (DA-09)
--
-- Nguyên văn 0080, chỉ đổi biểu thức đặt tên dòng. Sau lần này khối INSERT thứ nhất
-- và khối INSERT thứ hai của cùng hàm dùng CHUNG một bảng nhãn, nên không còn cửa
-- nào sinh ra hai cách gọi tên cho cùng một nhóm chi phí.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_budget_lines(
  p_bidding_project_id uuid,
  p_design_project_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  e         record;
  v_rows    integer;
BEGIN
  IF num_nonnulls(p_bidding_project_id, p_design_project_id) <> 1 THEN
    RAISE EXCEPTION 'Ngân sách phải thuộc đúng một hồ sơ: gói thầu hoặc dự án thiết kế.';
  END IF;

  SELECT company_id INTO v_company
    FROM public.bidding_projects
   WHERE id = p_bidding_project_id AND deleted_at IS NULL;

  IF v_company IS NULL THEN
    SELECT company_id INTO v_company
      FROM public.design_projects
     WHERE id = p_design_project_id AND deleted_at IS NULL;
  END IF;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ nguồn của ngân sách.';
  END IF;

  -- Chỉ bản dự toán ĐANG HIỆU LỰC và ĐÃ DUYỆT mới thành ngân sách (DA-09, PRD Mục 7).
  SELECT * INTO e FROM public.estimates
   WHERE (p_bidding_project_id IS NOT NULL AND bidding_project_id = p_bidding_project_id
          OR p_design_project_id IS NOT NULL AND design_project_id = p_design_project_id)
     AND is_current_version AND deleted_at IS NULL AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chưa có bản dự toán được phê duyệt để chuyển thành ngân sách.';
  END IF;

  -- Chi phí trực tiếp: gộp theo nhóm từ các dòng dự toán, giữ nguyên cách phân nhóm của
  -- người lập giá thay vì tự chia lại.
  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id, i.cost_group,
         upper(i.cost_group::text),
         public.cost_group_label(i.cost_group),
         sum(i.amount)
    FROM public.estimate_items i
   WHERE i.estimate_id = e.id AND i.deleted_at IS NULL
   GROUP BY i.cost_group;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  -- Các khoản không nằm trong dòng chi tiết nhưng DA-09 liệt kê thành mã chi phí riêng. Nếu
  -- mã đã tồn tại (dòng dự toán chi tiết trùng đúng 1 trong 3 nhóm này) thì CỘNG DỒN vào,
  -- không bỏ qua (0080) — tránh mất số overhead_cost/contingency_cost/profit_amount.
  UPDATE public.project_budgets b
     SET budgeted_amount = b.budgeted_amount + g.amount
    FROM (
      VALUES
        ('CHI_PHI_CHUNG', COALESCE(e.overhead_cost, 0)),
        ('DU_PHONG',      COALESCE(e.contingency_cost, 0)),
        ('LOI_NHUAN',     COALESCE(e.profit_amount, 0))
    ) AS g(cost_code, amount)
   WHERE b.cost_code = g.cost_code AND b.deleted_at IS NULL AND g.amount > 0
     AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
     AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id);

  INSERT INTO public.project_budgets (
    company_id, bidding_project_id, design_project_id, estimate_id,
    cost_group, cost_code, name, budgeted_amount
  )
  SELECT v_company, p_bidding_project_id, p_design_project_id, e.id,
         g.cost_group, g.cost_code, g.name, g.amount
    FROM (
      VALUES
        ('chi_phi_chung'::cost_group, 'CHI_PHI_CHUNG', 'Chi phí chung', COALESCE(e.overhead_cost, 0)),
        ('du_phong'::cost_group,      'DU_PHONG',      'Dự phòng rủi ro', COALESCE(e.contingency_cost, 0)),
        ('loi_nhuan'::cost_group,     'LOI_NHUAN',     'Lợi nhuận mục tiêu', COALESCE(e.profit_amount, 0))
    ) AS g(cost_group, cost_code, name, amount)
   WHERE g.amount > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_budgets b
       WHERE b.cost_code = g.cost_code AND b.deleted_at IS NULL
         AND (b.bidding_project_id IS NOT DISTINCT FROM p_bidding_project_id)
         AND (b.design_project_id  IS NOT DISTINCT FROM p_design_project_id)
     );

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.build_budget_lines(uuid, uuid) IS
  'Dựng dòng ngân sách từ bản dự toán đang hiệu lực đã duyệt — DA-09; cộng dồn ba khoản overhead/dự phòng/lợi nhuận thay vì bỏ qua (0080).';


COMMENT ON FUNCTION public.check_design_sync(uuid) IS
  'Kiểm tra tính đầy đủ và đồng bộ giữa các bộ môn — dùng chung cho tab Hồ sơ kỹ thuật (TK-04) và bước bàn giao (TK-08).';


-- ----------------------------------------------------------------------------
-- 5. Vá dữ liệu đã ghi sai
--
-- Chỉ sửa dòng có tên ĐÚNG BẰNG chuỗi hỏng mà hàm cũ sinh ra. Tên do người dùng
-- tự đặt (sửa tay trên màn hình ngân sách) không khớp mẫu này nên không bị đụng —
-- đó là lý do dùng so sánh bằng chứ không dùng `ilike`.
--
-- `updated_at`/`updated_by` KHÔNG đổi: đây là vá lỗi hệ thống, không phải một lần
-- sửa của người dùng, và ghi tên người vào đó sẽ làm hỏng dấu vết kiểm toán.
-- ----------------------------------------------------------------------------

UPDATE public.project_budgets b
   SET name = public.cost_group_label(b.cost_group)
 WHERE b.name = initcap(replace(b.cost_group::text, '_', ' '));
