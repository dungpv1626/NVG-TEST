-- ============================================================================
-- Module KT — phân quyền và luồng nghiệp vụ kế toán, tài chính
--
-- Nguồn: PRD KT-01 → KT-10, Backend Schema 4.9, Webapp Flow 4.6.
--
-- Năm thứ file này phải giữ được, xếp theo thiệt hại nếu mất:
--
--  1. KHÔNG CHI TRƯỚC, DUYỆT SAU (KT-01). Tiền chỉ ghi nhận đã chi trên một đề nghị đã đi
--     hết bốn bước: trưởng đơn vị → Kế toán → Trưởng Tài chính → phê duyệt theo hạn mức.
--     Mở UPDATE thẳng vào `stage` là mở đường chi vài trăm triệu rồi hợp lệ hoá sau.
--  2. KHÔNG ĐẾM CHI PHÍ HAI LẦN. Hàng mua qua Module MH đã được `record_delivery` ghi vào
--     phần "đã phát sinh" của ngân sách ngay khi hàng về (KT-05). Đề nghị thanh toán cho
--     chính đơn hàng đó KHÔNG cộng thêm lần nữa — nếu cộng, mọi báo cáo lãi/lỗ của công
--     trình sẽ báo chi phí gấp đôi phần vật tư, và cảnh báo vượt ngân sách kêu sai liên tục.
--     Xem hàm `post_payment_to_budget`.
--  3. SỐ ĐÃ THU CỦA HỢP ĐỒNG PHẢI TRUY NGƯỢC ĐƯỢC (HD-03, KT-04). `contracts.collected_amount`
--     chỉ đổi qua trigger của `receivable_settlements` — nghĩa là sau mỗi con số luôn có một
--     chứng từ thu đứng tên, ngày tháng và số tiền.
--  4. KỲ ĐÃ KHÓA LÀ KHÓA THẬT (KT-09). Không phải một nhãn hiển thị: trigger từ chối mọi
--     thay đổi tiền tệ mang ngày nằm trong kỳ đã khóa. Muốn điều chỉnh thì mở lại kỳ, và mở
--     lại bắt buộc nêu nguyên nhân kèm người mở.
--  5. DỮ LIỆU TÀI CHÍNH KHÔNG HIỂN THỊ ĐẠI TRÀ (KT-10, NEN-07). Công nợ, dòng tiền và tạm
--     ứng của người khác chỉ mở cho Tài chính – Kế toán, Ban Giám đốc và Quản trị hệ thống.
--     Riêng khoản tạm ứng của CHÍNH MÌNH thì ai cũng xem được khoản của mình.
--
-- ⚠️ Ranh giới PRD KT chi phối cả file: hệ thống này KHÔNG ghi sổ kế toán và KHÔNG lập báo
--    cáo thuế. Không có bút toán, không có tài khoản kế toán ở đây. Phần mềm kế toán chính
--    thức vẫn là nguồn ghi sổ; cột `posted_at`/`posted_reference` chỉ đánh dấu "đã chuyển
--    sang bên đó" theo KT-08.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Khoá ngoại còn thiếu, bộ theo dõi chuẩn, và các cột bất biến
--
-- Hai khoá ngoại dưới đây không khai được ở tầng Drizzle vì chúng tạo vòng tham chiếu giữa
-- `payment_requests` và hai bảng khai sau nó — cùng cách `project_budgets.construction_site_id`
-- đã xử lý ở migration của Module TC.
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_settles_advance_fk
  FOREIGN KEY (settles_advance_id) REFERENCES public.advances(id) ON DELETE SET NULL;

ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_receivable_fk
  FOREIGN KEY (receivable_id) REFERENCES public.receivables_payables(id) ON DELETE SET NULL;

SELECT public.attach_audit_touch('public.payment_requests');
SELECT public.attach_audit_touch('public.payment_request_allocations');
SELECT public.attach_audit_touch('public.advances');
SELECT public.attach_audit_touch('public.receivables_payables');
SELECT public.attach_audit_touch('public.receivable_settlements');
SELECT public.attach_audit_touch('public.cash_flow_plans');
SELECT public.attach_audit_touch('public.accounting_periods');

CREATE TRIGGER payment_requests_freeze_identity
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'request_type', 'requested_by'
  );

CREATE TRIGGER payment_request_allocations_freeze_identity
  BEFORE UPDATE ON public.payment_request_allocations
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('payment_request_id');

CREATE TRIGGER advances_freeze_identity
  BEFORE UPDATE ON public.advances
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'payment_request_id', 'user_id', 'amount', 'advance_date'
  );

CREATE TRIGGER receivables_freeze_identity
  BEFORE UPDATE ON public.receivables_payables
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'code', 'company_id', 'direction'
  );

CREATE TRIGGER receivable_settlements_freeze_identity
  BEFORE UPDATE ON public.receivable_settlements
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('receivable_id');

CREATE TRIGGER accounting_periods_freeze_identity
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'period_code', 'period_start', 'period_end'
  );

/*
 * Cột nào chỉ đổi được qua hàm nghiệp vụ (migration 0028).
 *
 * `amount` nằm trong danh sách của `payment_requests` vì nó là con số đối chiếu hạn mức: sửa
 * số tiền sau khi hồ sơ đã qua ba bước kiểm là vô hiệu hoá cả chuỗi KT-01 mà không để lại
 * dấu vết nào. Muốn đổi số thì sửa lúc còn Nháp, hoặc để người kiểm trả về.
 */
CREATE TRIGGER payment_requests_stage_guard
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'stage', 'amount', 'submitted_at', 'approved_at',
    'paid_date', 'paid_amount', 'payment_method', 'payment_reference',
    'posted_at', 'posted_reference', 'accounting_period',
    'settles_advance_id', 'receivable_id'
  );

CREATE TRIGGER advances_stage_guard
  BEFORE UPDATE ON public.advances
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'settled_amount', 'settled_at'
  );

-- `settled_amount` của công nợ là tổng cộng dồn từ bảng chứng từ con: sửa tay là làm nó lệch
-- với chính danh sách chứng từ nằm ngay bên dưới trên màn hình.
CREATE TRIGGER receivables_stage_guard
  BEFORE UPDATE ON public.receivables_payables
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'settled_amount', 'settled_at'
  );

CREATE TRIGGER accounting_periods_stage_guard
  BEFORE UPDATE ON public.accounting_periods
  FOR EACH ROW EXECUTE FUNCTION public.stage_changes_via_functions_only(
    'status', 'closed_at', 'closed_by', 'reopened_at', 'reopened_by', 'reopen_reason',
    'exported_at', 'exported_by'
  );


-- ----------------------------------------------------------------------------
-- 1. Ai nhìn thấy dữ liệu tài chính — KT-10, NEN-07
--
-- Công nợ, dòng tiền và kỳ kế toán là dữ liệu nhạy cảm theo KT-10 ("không để tất cả người
-- dùng cùng xem"). Nhưng "nhạy cảm" ở đây KHÁC giá vốn: giá vốn giấu theo CỘT (Mẫu D), còn
-- công nợ giấu theo DÒNG — hoặc thấy cả khoản nợ, hoặc không thấy gì. Vì vậy dùng một vị từ
-- riêng thay vì mượn `rls_sees_sensitive('cost')`.
--
-- Quyền xem module KT trong `permissions` đã là chốt chặn chính; hàm này thêm một lớp nữa cho
-- các bảng thuần tài chính, để một vai trò được cấp nhầm quyền xem KT vẫn không đọc được
-- toàn bộ bức tranh dòng tiền của tập đoàn.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_sees_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN', 'KT');
$$;

COMMENT ON FUNCTION public.rls_sees_finance() IS
  'Ai đọc được công nợ, dòng tiền và kỳ kế toán — KT-10. Khác rls_sees_sensitive: giấu theo DÒNG chứ không theo cột.';


/**
 * Ai xử lý được BƯỚC KIỂM TRA hiện tại của một đề nghị chi — KT-01.
 *
 * ⚠️ SUY LUẬN, cần Haan xác nhận với NVG: PRD KT-01 nói "xác nhận TRƯỞNG ĐƠN VỊ" nhưng hệ
 * thống chưa có cây tổ chức (quan hệ cấp trên – cấp dưới thuộc Module NS, chưa dựng). Ở đây
 * "trưởng đơn vị" được hiểu là NGƯỜI CÓ QUYỀN PHÊ DUYỆT TRONG MODULE PHÁT SINH KHOẢN CHI —
 * chi phí công trường thì Ban chỉ huy (`can_approve` trên TC), khoản mua hàng thì Phòng Mua
 * hàng (`can_approve` trên MH). Khi Module NS có cây tổ chức, thay điều kiện ở đây bằng quan
 * hệ quản lý trực tiếp và KHÔNG phải sửa chỗ nào khác.
 *
 * Hai bước sau bám đúng câu chữ PRD nên không phải suy luận: "kiểm tra Kế toán" là vai trò
 * KT, "kiểm tra dòng tiền (Trưởng Tài chính)" là CFO. Tổng Giám đốc và Quản trị hệ thống đi
 * qua được mọi bước — họ vốn đã duyệt được ở bước cuối, chặn ở bước giữa chỉ tạo bế tắc khi
 * có người nghỉ phép.
 */
CREATE OR REPLACE FUNCTION public.rls_payment_step_actor(
  p_step payment_check_step,
  p_company_id uuid,
  p_origin_module text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.rls_company_access(p_company_id)
    AND (
      public.auth_has_role('TGD', 'ADMIN')
      OR CASE p_step
           WHEN 'don_vi' THEN EXISTS (
             SELECT 1
             FROM public.user_companies uc
             JOIN public.permissions p ON p.role_id = uc.role_id
             JOIN public.roles r       ON r.id = uc.role_id
             WHERE uc.user_id = public.auth_user_id()
               AND uc.deleted_at IS NULL
               AND p.module_code = COALESCE(p_origin_module, 'KT')
               AND p.can_approve
               AND (uc.company_id = p_company_id OR r.sees_all_companies)
           )
           WHEN 'ke_toan'   THEN public.auth_has_role('KT')
           WHEN 'tai_chinh' THEN public.auth_has_role('CFO', 'BGD')
         END
    );
$$;

COMMENT ON FUNCTION public.rls_payment_step_actor(payment_check_step, uuid, text) IS
  'Ai xử lý được một bước kiểm tra của luồng duyệt chi KT-01. Bước "trưởng đơn vị" là SUY LUẬN — xem chú thích trong migration.';

/**
 * Hồ sơ này có đang nằm ở bước mà CHÍNH người dùng hiện tại phải xử lý không.
 *
 * Cần một hàm riêng vì đây là điều kiện XEM, không phải điều kiện thao tác: trưởng đơn vị
 * không có quyền xem phân hệ Kế toán, nên nếu chỉ dựa vào quyền module thì hồ sơ chờ chính
 * họ ký lại không hiện ra ở đâu cả — và luồng KT-01 đứng ngay ở bước đầu tiên.
 */
CREATE OR REPLACE FUNCTION public.rls_payment_awaiting_me(
  p_stage payment_request_stage,
  p_company_id uuid,
  p_origin_module text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_stage IN ('cho_don_vi', 'cho_ke_toan', 'cho_tai_chinh')
     AND public.rls_payment_step_actor(
           (CASE p_stage
              WHEN 'cho_don_vi'    THEN 'don_vi'
              WHEN 'cho_ke_toan'   THEN 'ke_toan'
              WHEN 'cho_tai_chinh' THEN 'tai_chinh'
            END)::payment_check_step,
           p_company_id, p_origin_module
         );
$$;

COMMENT ON FUNCTION public.rls_payment_awaiting_me(payment_request_stage, uuid, text) IS
  'Đề nghị chi có đang chờ chính người dùng hiện tại xử lý không — điều kiện XEM cho người kiểm ở bước giữa (KT-01).';


/**
 * Đề nghị chi này có nằm trong phạm vi xem của người dùng hiện tại không.
 *
 * Bốn nhóm nhìn thấy, không phải một:
 *   - Kế toán – Tài chính và Ban Giám đốc: thấy toàn bộ khoản chi của pháp nhân;
 *   - CHÍNH NGƯỜI ĐỀ NGHỊ, kể cả khi họ không có quyền module KT — TC-03 và MH-08 đưa đề
 *     nghị chi tới từ công trường và Mua hàng, và KT-02 nói rõ người đề nghị phải thấy được
 *     "hồ sơ đang ở bước nào, chờ ai". Không mở thì họ lại đi hỏi Zalo, đúng thứ hệ thống
 *     sinh ra để bỏ;
 *   - NGƯỜI NHẬN TẠM ỨNG, vì khoản nợ đó là của họ;
 *   - NGƯỜI ĐANG PHẢI XỬ LÝ hồ sơ ở bước kiểm hiện tại — và CHỈ trong lúc hồ sơ còn ở bước
 *     đó. Ban công trường được cấp quyền xem phân hệ Kế toán để gửi đề nghị, nhưng như vậy
 *     KHÔNG có nghĩa là họ đọc được mọi khoản chi của công ty, kể cả lương và thuế (KT-10).
 */
CREATE OR REPLACE FUNCTION public.rls_payment_request_readable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND public.rls_company_access(pr.company_id)
      AND (
        (public.auth_can_view_module('KT') AND public.rls_sees_finance())
        OR pr.requested_by = public.auth_user_id()
        OR pr.advance_user_id = public.auth_user_id()
        OR public.rls_payment_awaiting_me(pr.stage, pr.company_id, pr.origin_module)
      )
  );
$$;

COMMENT ON FUNCTION public.rls_payment_request_readable(uuid) IS
  'Đề nghị chi có trong phạm vi xem không — Kế toán/Tài chính, người đề nghị, hoặc người nhận tạm ứng (KT-02).';

/**
 * Ai sửa được nội dung một đề nghị chi.
 *
 * Chỉ khi hồ sơ còn Nháp hoặc vừa bị trả lại: sửa số tiền sau khi đã qua bước kiểm là vô
 * hiệu hoá cả chuỗi KT-01. Người sửa là chính người đề nghị, hoặc Kế toán (họ soạn hộ nhiều
 * khoản chi của văn phòng).
 */
CREATE OR REPLACE FUNCTION public.rls_payment_request_draft_writable(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_requests pr
    WHERE pr.id = p_request_id
      AND pr.deleted_at IS NULL
      AND pr.stage IN ('nhap', 'tu_choi')
      AND public.rls_company_access(pr.company_id)
      AND (
        public.auth_can_edit_module('KT')
        OR (pr.requested_by = public.auth_user_id()
            AND public.auth_can_create_in('KT', pr.company_id))
      )
  );
$$;

COMMENT ON FUNCTION public.rls_payment_request_draft_writable(uuid) IS
  'Sửa được nội dung đề nghị chi khi còn Nháp hoặc bị trả lại — Kế toán, hoặc chính người đề nghị.';


/**
 * Kỳ kế toán chứa một ngày đã bị khóa chưa — KT-09.
 *
 * Không có dòng kỳ nào chứa ngày đó thì coi là CHƯA khóa. Mặc định ngược lại (chưa khai báo
 * kỳ thì chặn hết) sẽ làm toàn bộ module đứng im cho tới khi ai đó nhớ ra phải tạo kỳ — một
 * cách hỏng vừa khó đoán vừa không liên quan gì tới điều KT-09 muốn bảo vệ.
 */
CREATE OR REPLACE FUNCTION public.kt_period_locked(p_company_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ap.status = 'da_khoa'
        FROM public.accounting_periods ap
       WHERE ap.company_id = p_company_id
         AND p_date BETWEEN ap.period_start AND ap.period_end
       LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.kt_period_locked(uuid, date) IS
  'Ngày này có nằm trong một kỳ kế toán đã khóa không (KT-09). Chưa khai báo kỳ = chưa khóa.';


-- ----------------------------------------------------------------------------
-- 2. Chính sách truy cập
--
-- Mẫu áp dụng (Backend Schema 3.3 và 4.9):
--   payment_requests, advances          → Mẫu C (chỉ hiện với người liên quan và người duyệt)
--   receivables_payables, cash_flow_plans, accounting_periods → Mẫu A + lớp `rls_sees_finance`
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_request_steps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advances                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables_payables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_settlements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_plans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods          ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_requests            FROM anon;
REVOKE ALL ON public.payment_request_allocations FROM anon;
REVOKE ALL ON public.payment_request_steps       FROM anon;
REVOKE ALL ON public.advances                    FROM anon;
REVOKE ALL ON public.receivables_payables        FROM anon;
REVOKE ALL ON public.receivable_settlements      FROM anon;
REVOKE ALL ON public.cash_flow_plans             FROM anon;
REVOKE ALL ON public.accounting_periods          FROM anon;

-- Không xoá cứng hồ sơ nghiệp vụ — xoá mềm qua `deleted_at`, giữ lịch sử (NEN-03).
REVOKE DELETE ON public.payment_requests     FROM authenticated;
REVOKE DELETE ON public.advances             FROM authenticated;
REVOKE DELETE ON public.receivables_payables FROM authenticated;
REVOKE DELETE ON public.cash_flow_plans      FROM authenticated;
REVOKE DELETE ON public.accounting_periods   FROM authenticated;

/*
 * Bốn bảng dưới đây KHÔNG nhận lệnh ghi nào từ trình duyệt.
 *
 * Mỗi dòng trong chúng là một sự kiện tài chính đã xảy ra: một bước kiểm đã ký, một khoản
 * nợ đã phát sinh, một lần tiền thật đã chuyển. Cho INSERT thẳng thì tạo được lịch sử duyệt
 * chưa từng diễn ra, khoản tạm ứng chưa ai chi, hoặc một lần "đã thu" không có tiền nào vào
 * — mà chính con số đã thu đó lại là thứ Ban Giám đốc đọc để biết công trình lãi hay lỗ.
 */
REVOKE INSERT, UPDATE, DELETE ON public.payment_request_steps  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.advances               FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.receivable_settlements FROM authenticated;
REVOKE UPDATE                  ON public.accounting_periods    FROM authenticated;


-- --- Đề nghị chi ------------------------------------------------------------

CREATE POLICY payment_requests_select ON public.payment_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      -- Xem được cả phân hệ: chỉ Kế toán – Tài chính, Ban Giám đốc, Quản trị (KT-10).
      (public.auth_can_view_module('KT') AND public.rls_sees_finance())
      OR requested_by = public.auth_user_id()
      OR advance_user_id = public.auth_user_id()
      OR public.rls_payment_awaiting_me(stage, company_id, origin_module)
    )
  );

CREATE POLICY payment_requests_insert ON public.payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in('KT', company_id)
    -- Hồ sơ mới luôn bắt đầu ở bước Nháp: tạo thẳng ở "đã duyệt" là bỏ qua toàn bộ KT-01.
    AND stage = 'nhap'
    -- Tiền chưa đi đâu cả, và chưa ai duyệt gì: các cột dấu vết phải rỗng khi vừa tạo.
    AND submitted_at IS NULL AND approved_at IS NULL
    AND paid_date IS NULL AND posted_at IS NULL
  );

CREATE POLICY payment_requests_update ON public.payment_requests
  FOR UPDATE TO authenticated
  USING (public.rls_payment_request_draft_writable(id))
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY payment_request_allocations_select ON public.payment_request_allocations
  FOR SELECT TO authenticated
  USING (public.rls_payment_request_readable(payment_request_id));

CREATE POLICY payment_request_allocations_write ON public.payment_request_allocations
  FOR ALL TO authenticated
  USING (public.rls_payment_request_draft_writable(payment_request_id))
  WITH CHECK (public.rls_payment_request_draft_writable(payment_request_id));

-- Lịch sử bước kiểm: đọc được cùng phạm vi với hồ sơ, ghi thì chỉ hàm nghiệp vụ.
CREATE POLICY payment_request_steps_select ON public.payment_request_steps
  FOR SELECT TO authenticated
  USING (public.rls_payment_request_readable(payment_request_id));


-- --- Tạm ứng ----------------------------------------------------------------

/*
 * Khoản tạm ứng của CHÍNH MÌNH thì ai cũng xem được khoản của mình — người ứng tiền phải
 * biết mình còn nợ bao nhiêu và hạn hoàn là ngày nào, không phải đi hỏi Kế toán.
 * Khoản của người khác chỉ mở cho Tài chính – Kế toán và Ban Giám đốc (KT-10).
 */
CREATE POLICY advances_select ON public.advances
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      user_id = public.auth_user_id()
      OR (public.rls_company_access(company_id)
          AND public.auth_can_view_module('KT')
          AND public.rls_sees_finance())
    )
  );


-- --- Công nợ ----------------------------------------------------------------

CREATE POLICY receivables_select ON public.receivables_payables
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('KT')
    AND public.rls_sees_finance()
  );

CREATE POLICY receivables_insert ON public.receivables_payables
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in('KT', company_id)
    AND public.rls_sees_finance()
    -- Khoản nợ mới chưa thu/trả đồng nào: số đã tất toán chỉ lớn lên qua chứng từ.
    AND settled_amount = 0
  );

CREATE POLICY receivables_update ON public.receivables_payables
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('KT')
    AND public.rls_sees_finance()
  )
  WITH CHECK (public.rls_company_access(company_id));

CREATE POLICY receivable_settlements_select ON public.receivable_settlements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receivables_payables rp
       WHERE rp.id = receivable_id AND rp.deleted_at IS NULL
    )
  );


-- --- Kế hoạch dòng tiền -----------------------------------------------------

CREATE POLICY cash_flow_plans_select ON public.cash_flow_plans
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_view_module('KT')
    AND public.rls_sees_finance()
  );

CREATE POLICY cash_flow_plans_insert ON public.cash_flow_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in('KT', company_id)
    AND public.rls_sees_finance()
  );

CREATE POLICY cash_flow_plans_update ON public.cash_flow_plans
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND public.auth_can_edit_module('KT')
    AND public.rls_sees_finance()
  )
  WITH CHECK (public.rls_company_access(company_id));


-- --- Kỳ kế toán -------------------------------------------------------------

/*
 * Kỳ kế toán đọc được rộng hơn công nợ: nó không chứa số tiền nào, chỉ nói kỳ nào còn mở.
 * Ai nhập chứng từ cũng cần biết điều đó trước khi gõ, thay vì gõ xong mới bị chặn.
 */
CREATE POLICY accounting_periods_select ON public.accounting_periods
  FOR SELECT TO authenticated
  USING (
    public.rls_company_access(company_id)
    AND public.auth_can_view_module('KT')
  );

CREATE POLICY accounting_periods_insert ON public.accounting_periods
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_can_create_in('KT', company_id)
    AND public.rls_sees_finance()
    -- Kỳ mới luôn mở: tạo thẳng một kỳ "đã khóa" là khóa dữ liệu mà không ai đứng tên.
    AND status = 'dang_mo'
    AND closed_at IS NULL
  );


-- ----------------------------------------------------------------------------
-- 3. Kỳ kế toán khóa dữ liệu thật — KT-09
--
-- "Khóa kỳ" ở đây không phải nhãn hiển thị. Trigger dưới đây từ chối mọi thay đổi mang NGÀY
-- CHI nằm trong một kỳ đã khóa — kể cả khi lệnh đến từ hàm nghiệp vụ, vì đó chính là điều
-- KT-09 muốn: sau khi chốt, muốn sửa thì phải mở lại kỳ và nêu nguyên nhân.
--
-- Ràng buộc bám theo NGÀY CHI chứ không theo ngày tạo hồ sơ: một đề nghị lập tháng 7 mà chi
-- tháng 8 thuộc về sổ tháng 8. Ràng buộc theo ngày tạo sẽ khóa nhầm những khoản còn đang
-- chạy chỉ vì hồ sơ ra đời sớm.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kt_guard_payment_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.paid_date IS NOT NULL
     AND public.kt_period_locked(OLD.company_id, OLD.paid_date) THEN
    RAISE EXCEPTION
      'Kỳ kế toán chứa ngày chi % đã khóa. Mở lại kỳ kèm nguyên nhân trước khi điều chỉnh khoản này.',
      to_char(OLD.paid_date, 'DD/MM/YYYY');
  END IF;

  IF NEW.paid_date IS NOT NULL
     AND public.kt_period_locked(NEW.company_id, NEW.paid_date) THEN
    RAISE EXCEPTION
      'Kỳ kế toán chứa ngày chi % đã khóa. Chọn ngày chi trong kỳ còn mở, hoặc mở lại kỳ kèm nguyên nhân.',
      to_char(NEW.paid_date, 'DD/MM/YYYY');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kt_guard_payment_period() IS
  'Chặn ghi/sửa khoản chi mang ngày nằm trong kỳ kế toán đã khóa (KT-09).';

CREATE TRIGGER payment_requests_period_guard
  BEFORE INSERT OR UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.kt_guard_payment_period();


CREATE OR REPLACE FUNCTION public.kt_guard_settlement_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     record;
  v_company uuid;
BEGIN
  -- Không dùng COALESCE(NEW, OLD): trong trigger DELETE thì NEW chưa được gán, và đọc một
  -- trường của nó làm hàm dừng với lỗi khó hiểu thay vì chạy đúng nhánh.
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT rp.company_id INTO v_company
    FROM public.receivables_payables rp
   WHERE rp.id = v_row.receivable_id;

  IF v_company IS NOT NULL AND public.kt_period_locked(v_company, v_row.settled_date) THEN
    RAISE EXCEPTION
      'Kỳ kế toán chứa ngày % đã khóa. Mở lại kỳ kèm nguyên nhân trước khi ghi nhận chứng từ này.',
      to_char(v_row.settled_date, 'DD/MM/YYYY');
  END IF;

  RETURN v_row;
END;
$$;

CREATE TRIGGER receivable_settlements_period_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.receivable_settlements
  FOR EACH ROW EXECUTE FUNCTION public.kt_guard_settlement_period();


/*
 * Cộng lại số đã thu/đã trả từ chính danh sách chứng từ — KT-04, HD-03.
 *
 * Tính LẠI TỪ ĐẦU mỗi lần thay vì cộng dồn tại chỗ. Cộng dồn nhanh hơn, nhưng chỉ cần một
 * lần sửa hoặc xoá chứng từ là con số trôi khỏi danh sách bên dưới nó, và từ đó không ai
 * biết bên nào đúng. Số dòng chứng từ của một khoản nợ luôn nhỏ, nên cái giá là không đáng kể.
 *
 * `contracts.collected_amount` cũng cộng lại theo cùng cách, từ MỌI khoản phải thu của hợp
 * đồng — đây là con số Ban Giám đốc đọc ở HD-03 và là vế "đã thu" của báo cáo lãi/lỗ.
 */
CREATE OR REPLACE FUNCTION public.kt_apply_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable uuid;
  rp           record;
  v_total      bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_receivable := OLD.receivable_id;
  ELSE
    v_receivable := NEW.receivable_id;
  END IF;

  SELECT COALESCE(SUM(rs.amount), 0)::bigint INTO v_total
    FROM public.receivable_settlements rs
   WHERE rs.receivable_id = v_receivable;

  UPDATE public.receivables_payables
     SET settled_amount = v_total,
         settled_at = CASE WHEN v_total >= amount AND amount > 0 THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = v_receivable
   RETURNING * INTO rp;

  IF rp.contract_id IS NOT NULL AND rp.direction = 'phai_thu' THEN
    UPDATE public.contracts c
       SET collected_amount = (
             SELECT COALESCE(SUM(rs.amount), 0)::bigint
               FROM public.receivable_settlements rs
               JOIN public.receivables_payables r ON r.id = rs.receivable_id
              WHERE r.contract_id = rp.contract_id
                AND r.direction = 'phai_thu'
                AND r.deleted_at IS NULL
           ),
           updated_at = now()
     WHERE c.id = rp.contract_id;
  END IF;

  -- Trigger AFTER: giá trị trả về bị bỏ qua, nhưng vẫn phải trả một record hợp lệ.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.kt_apply_settlement() IS
  'Cộng lại số đã thu/đã trả của một khoản công nợ và số đã thu của hợp đồng (KT-04, HD-03).';

CREATE TRIGGER receivable_settlements_apply
  AFTER INSERT OR UPDATE OR DELETE ON public.receivable_settlements
  FOR EACH ROW EXECUTE FUNCTION public.kt_apply_settlement();


-- ----------------------------------------------------------------------------
-- 4. Luồng duyệt chi nhiều cấp — KT-01, KT-02, KT-03, KT-05
-- ----------------------------------------------------------------------------

/**
 * Cấp mã hồ sơ và đóng dấu người đề nghị ngay khi tạo.
 *
 * Cấp mã lúc INSERT chứ không lúc gửi đi: `code` là cột bất biến (trigger freeze ở trên), nên
 * điền muộn sẽ bị chính trigger đó chặn. Quan trọng hơn, người đề nghị cần một mã để nhắc tới
 * hồ sơ của mình ngay từ lúc còn nháp.
 *
 * Ba loại đề nghị dùng ba tiền tố khác nhau — đọc mã là biết ngay loại khoản chi mà không
 * phải mở hồ sơ, đúng cách các module trước đã làm.
 */
CREATE OR REPLACE FUNCTION public.payment_requests_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_code text;
BEGIN
  NEW.requested_by := COALESCE(public.auth_user_id(), NEW.requested_by);

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    SELECT c.code INTO v_company_code FROM public.companies c WHERE c.id = NEW.company_id;
    NEW.code := public.next_record_code(
      v_company_code,
      CASE NEW.request_type
        WHEN 'thanh_toan' THEN 'DNTT'
        WHEN 'tam_ung'    THEN 'DNTU'
        ELSE 'HU'
      END
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_requests_before_insert
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.payment_requests_before_insert();

COMMENT ON FUNCTION public.payment_requests_before_insert() IS
  'Đóng dấu người đề nghị từ phiên đăng nhập và cấp mã đề nghị chi (KT-01).';


/** Tổng các dòng phân bổ của một đề nghị chi — dùng để đối chiếu với số tiền đề nghị. */
CREATE OR REPLACE FUNCTION public.payment_allocated_total(p_request_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.amount), 0)::bigint
    FROM public.payment_request_allocations a
   WHERE a.payment_request_id = p_request_id;
$$;

/**
 * Gửi một đề nghị chi vào luồng duyệt — KT-01 bước 1.
 *
 * Mọi điều kiện được kiểm ở ĐÂY chứ không rải ra từng bước sau, vì đây là lần cuối người đề
 * nghị còn sửa được hồ sơ của mình. Bắt lỗi ở bước Kế toán rồi trả về sẽ tốn thêm một vòng
 * qua lại mà lẽ ra không cần.
 */
CREATE OR REPLACE FUNCTION public.submit_payment_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  pr          record;
  v_allocated bigint;
  v_lines     integer;
  a           record;
  adv         record;
  v_overdue   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_payment_request_draft_writable(p_request_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị chi này.';
  END IF;

  IF pr.amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền đề nghị bằng 0. Nhập số tiền trước khi gửi đi.';
  END IF;

  IF pr.request_type <> 'tam_ung'
     AND pr.supplier_id IS NULL
     AND (pr.payee_name IS NULL OR btrim(pr.payee_name) = '') THEN
    RAISE EXCEPTION 'Chưa có bên nhận tiền. Chọn nhà cung cấp hoặc nhập tên bên nhận.';
  END IF;

  /*
   * KT-05: "gắn chi phí vào đúng mã công trình/hạng mục/nhóm chi phí NGAY TỪ KHI PHÁT SINH,
   * không hạch toán lại thủ công". Chỗ duy nhất còn kịp làm việc đó là ở đây. Không có dòng
   * phân bổ thì khoản chi này về sau không thuộc về công trình nào, và báo cáo lãi/lỗ theo
   * công trình thiếu đúng phần đó mà không ai nhận ra.
   */
  SELECT count(*), public.payment_allocated_total(p_request_id)
    INTO v_lines, v_allocated
    FROM public.payment_request_allocations
   WHERE payment_request_id = p_request_id;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Chưa phân bổ khoản chi vào mã chi phí nào. Thêm ít nhất một dòng phân bổ.';
  END IF;

  IF v_allocated <> pr.amount THEN
    RAISE EXCEPTION 'Tổng phân bổ (% đồng) khác số tiền đề nghị (% đồng). Sửa cho khớp trước khi gửi đi.',
      to_char(v_allocated, 'FM999,999,999,999'), to_char(pr.amount, 'FM999,999,999,999');
  END IF;

  IF v_lines > 1 AND EXISTS (
    SELECT 1 FROM public.payment_request_allocations al
     WHERE al.payment_request_id = p_request_id
       AND (al.basis IS NULL OR btrim(al.basis) = '')
  ) THEN
    RAISE EXCEPTION 'Khoản chi chia cho nhiều mã chi phí phải nêu căn cứ phân bổ ở từng dòng.';
  END IF;

  FOR a IN
    SELECT * FROM public.payment_request_allocations
     WHERE payment_request_id = p_request_id
  LOOP
    IF a.amount <= 0 THEN
      RAISE EXCEPTION 'Có dòng phân bổ với số tiền bằng 0 hoặc âm.';
    END IF;

    IF a.construction_site_id IS NOT NULL THEN
      IF a.cost_code IS NULL OR btrim(a.cost_code) = '' THEN
        RAISE EXCEPTION 'Dòng phân bổ cho công trình phải có mã chi phí trong ngân sách công trình.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.construction_sites s
         WHERE s.id = a.construction_site_id AND s.company_id = pr.company_id
      ) THEN
        RAISE EXCEPTION 'Công trình trong dòng phân bổ không thuộc pháp nhân của đề nghị chi này.';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.project_budgets pb
         WHERE pb.construction_site_id = a.construction_site_id
           AND pb.cost_code = a.cost_code
           AND pb.company_id = pr.company_id
           AND pb.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Mã chi phí % không có trong ngân sách của công trình đã chọn.', a.cost_code;
      END IF;
    END IF;
  END LOOP;

  /* --- Tạm ứng: KT-03 --------------------------------------------------- */
  IF pr.request_type = 'tam_ung' THEN
    IF pr.advance_user_id IS NULL THEN
      RAISE EXCEPTION 'Chưa chọn người nhận tạm ứng.';
    END IF;

    IF pr.advance_due_date IS NULL THEN
      RAISE EXCEPTION 'Chưa có hạn hoàn ứng. Nhập hạn hoàn ứng trước khi gửi đi.';
    END IF;

    /*
     * KT-03: "HẠN CHẾ cấp tạm ứng mới khi khoản cũ chưa hoàn, TRỪ trường hợp được người có
     * thẩm quyền phê duyệt". Chặn cứng sẽ làm bế tắc công trường vào đúng lúc cần tiền gấp;
     * cho qua im lặng thì điều khoản này thành chữ trên giấy. Cách ở giữa: vẫn gửi được,
     * nhưng bắt buộc nêu lý do, và lý do đó hiện ngay trước mắt người duyệt.
     */
    SELECT count(*) INTO v_overdue
      FROM public.advances ad
     WHERE ad.user_id = pr.advance_user_id
       AND ad.company_id = pr.company_id
       AND ad.status = 'dang_no'
       AND ad.deleted_at IS NULL
       AND ad.due_date IS NOT NULL
       AND ad.due_date < current_date;

    IF v_overdue > 0
       AND (pr.advance_override_reason IS NULL OR btrim(pr.advance_override_reason) = '') THEN
      RAISE EXCEPTION
        'Người nhận còn % khoản tạm ứng quá hạn chưa hoàn. Nêu lý do cần ứng tiếp để người có thẩm quyền xem xét.',
        v_overdue;
    END IF;
  END IF;

  /* --- Hoàn ứng --------------------------------------------------------- */
  IF pr.request_type = 'hoan_ung' THEN
    IF pr.settles_advance_id IS NULL THEN
      RAISE EXCEPTION 'Chưa chọn khoản tạm ứng cần hoàn.';
    END IF;

    SELECT * INTO adv FROM public.advances
     WHERE id = pr.settles_advance_id AND deleted_at IS NULL;

    IF NOT FOUND OR adv.company_id <> pr.company_id THEN
      RAISE EXCEPTION 'Khoản tạm ứng cần hoàn không thuộc pháp nhân của đề nghị này.';
    END IF;

    IF adv.status = 'da_hoan' THEN
      RAISE EXCEPTION 'Khoản tạm ứng này đã hoàn xong.';
    END IF;

    IF pr.amount > adv.amount - adv.settled_amount THEN
      RAISE EXCEPTION 'Số hoàn (% đồng) lớn hơn số còn nợ của khoản tạm ứng (% đồng).',
        to_char(pr.amount, 'FM999,999,999,999'),
        to_char(adv.amount - adv.settled_amount, 'FM999,999,999,999');
    END IF;
  END IF;

  UPDATE public.payment_requests
     SET stage = 'cho_don_vi',
         submitted_at = now(),
         accounting_period = to_char(current_date, 'YYYY-MM'),
         closed_reason = NULL,
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.submit_payment_request(uuid) IS
  'Gửi đề nghị chi vào luồng duyệt KT-01, sau khi kiểm phân bổ chi phí (KT-05) và điều kiện tạm ứng (KT-03).';


/**
 * Xử lý MỘT bước kiểm tra của luồng duyệt chi — KT-01, Backend Schema 4.9
 * (`POST /api/payment-requests/:id/approve-step`).
 *
 * Ba bước kiểm dùng chung một hàm thay vì ba hàm riêng: chúng khác nhau đúng ở chỗ ai được
 * bấm, còn phần ghi lịch sử, chuyển bước và báo cho người tiếp theo thì giống hệt. Ba bản
 * sao của cùng đoạn mã sớm muộn sẽ lệch nhau ở một trong ba.
 *
 * Từ chối ở BẤT KỲ bước nào đều trả hồ sơ về người đề nghị kèm lý do, KHÔNG lùi một bước.
 * Lùi một bước nghe hợp lý nhưng sai về nghiệp vụ: bước trước đã ký rồi, và cái sai hầu như
 * luôn nằm ở nội dung hồ sơ chứ không ở người ký trước đó.
 */
CREATE OR REPLACE FUNCTION public.advance_payment_step(
  p_request_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS payment_request_stage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  pr          record;
  v_step      payment_check_step;
  v_next      payment_request_stage;
  v_entered   timestamptz;
  v_subject   approval_subject;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  -- Khoá dòng: hai người kiểm bấm cùng lúc trên cùng một hồ sơ sẽ ghi hai dòng lịch sử cho
  -- cùng một bước và đẩy hồ sơ nhảy hai bước một lúc.
  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy đề nghị chi.';
  END IF;

  v_step := CASE pr.stage
    WHEN 'cho_don_vi'    THEN 'don_vi'
    WHEN 'cho_ke_toan'   THEN 'ke_toan'
    WHEN 'cho_tai_chinh' THEN 'tai_chinh'
  END::payment_check_step;

  IF v_step IS NULL THEN
    RAISE EXCEPTION 'Đề nghị chi này không ở bước kiểm tra nào.';
  END IF;

  IF NOT public.rls_payment_step_actor(v_step, pr.company_id, pr.origin_module) THEN
    RAISE EXCEPTION '%', CASE v_step
      WHEN 'don_vi'    THEN 'Bước này do trưởng đơn vị phát sinh khoản chi xác nhận.'
      WHEN 'ke_toan'   THEN 'Bước này do Kế toán kiểm tra.'
      ELSE 'Bước này do Trưởng Tài chính kiểm tra dòng tiền.'
    END;
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do trả lại hồ sơ.';
  END IF;

  -- Hồ sơ đến bước này lúc nào: lần quyết định gần nhất, hoặc lúc gửi đi nếu đây là bước đầu.
  SELECT COALESCE(max(s.decided_at), pr.submitted_at) INTO v_entered
    FROM public.payment_request_steps s
   WHERE s.payment_request_id = p_request_id;

  INSERT INTO public.payment_request_steps
    (payment_request_id, step, decision, note, entered_at, decided_by)
  VALUES
    (p_request_id, v_step, p_decision, NULLIF(btrim(p_note), ''), v_entered, v_user);

  IF p_decision = 'rejected' THEN
    UPDATE public.payment_requests
       SET stage = 'tu_choi',
           closed_reason = btrim(p_note),
           updated_at = now(), updated_by = v_user
     WHERE id = p_request_id;

    PERFORM public.create_notification(
      pr.requested_by, pr.company_id, 'payment_request_returned',
      format('Đề nghị chi %s bị trả lại ở bước %s. %s',
             COALESCE(pr.code, ''),
             CASE v_step WHEN 'don_vi' THEN 'xác nhận đơn vị'
                         WHEN 'ke_toan' THEN 'kiểm tra Kế toán'
                         ELSE 'kiểm tra dòng tiền' END,
             btrim(p_note)),
      'payment_requests', p_request_id,
      format('/kt/de-nghi-thanh-toan/%s', p_request_id)
    );

    RETURN 'tu_choi'::payment_request_stage;
  END IF;

  v_next := CASE v_step
    WHEN 'don_vi'    THEN 'cho_ke_toan'
    WHEN 'ke_toan'   THEN 'cho_tai_chinh'
    WHEN 'tai_chinh' THEN 'cho_phe_duyet'
  END::payment_request_stage;

  UPDATE public.payment_requests
     SET stage = v_next, updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;

  /*
   * Kiểm xong ba bước thì hồ sơ vào Hộp thư Phê duyệt — MỘT màn hình chung cho mọi module
   * (Webapp Flow 4.6). Tạm ứng dùng loại nghiệp vụ riêng vì NVG có thể đặt hạn mức khác cho
   * tiền ứng trước so với tiền trả nhà cung cấp (`approval_limits`, NEN-02).
   */
  IF v_next = 'cho_phe_duyet' THEN
    v_subject := CASE WHEN pr.request_type = 'tam_ung' THEN 'advance' ELSE 'payment_request' END;

    INSERT INTO public.approvals (
      company_id, subject, entity_type, entity_id, entity_code,
      title, amount, reason, status, requested_by, due_date
    )
    VALUES (
      pr.company_id, v_subject, 'payment_requests', pr.id, pr.code,
      format('%s %s — %s',
             CASE pr.request_type WHEN 'thanh_toan' THEN 'Đề nghị thanh toán'
                                  WHEN 'tam_ung'    THEN 'Đề nghị tạm ứng'
                                  ELSE 'Hoàn ứng' END,
             COALESCE(pr.code, ''), pr.title),
      pr.amount,
      -- Lý do xin ứng tiếp khi còn nợ cũ phải hiện ngay trước mắt người duyệt (KT-03).
      COALESCE(NULLIF(btrim(pr.advance_override_reason), ''), pr.notes),
      'pending_approval', pr.requested_by,
      pr.due_date::timestamptz
    );
  ELSE
    PERFORM public.create_notification(
      u.id, pr.company_id, 'payment_request_pending',
      format('Đề nghị chi %s đang chờ %s, giá trị %s đồng.',
             COALESCE(pr.code, ''),
             CASE v_next WHEN 'cho_ke_toan' THEN 'Kế toán kiểm tra'
                         ELSE 'kiểm tra dòng tiền' END,
             to_char(pr.amount, 'FM999,999,999,999')),
      'payment_requests', pr.id,
      format('/kt/de-nghi-thanh-toan/%s', pr.id)
    )
    FROM public.users u
    JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
    JOIN public.roles r ON r.id = uc.role_id
    WHERE u.is_active AND u.deleted_at IS NULL
      AND (uc.company_id = pr.company_id OR r.sees_all_companies)
      AND r.code = (CASE WHEN v_next = 'cho_ke_toan' THEN 'KT' ELSE 'CFO' END)::role_code;
  END IF;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.advance_payment_step(uuid, approval_decision, text) IS
  'Xử lý một bước kiểm tra của luồng duyệt chi nhiều cấp (KT-01); bước cuối đẩy hồ sơ vào Hộp thư Phê duyệt.';


CREATE OR REPLACE FUNCTION public.cancel_payment_request(p_request_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  pr     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(pr.company_id)
     OR NOT (public.auth_can_edit_module('KT') OR pr.requested_by = v_user) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị chi này.';
  END IF;

  IF pr.stage IN ('da_chi', 'da_hach_toan', 'huy') THEN
    RAISE EXCEPTION 'Đề nghị này đã chi hoặc đã đóng, không hủy được. Ghi một khoản điều chỉnh nếu cần.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do hủy đề nghị chi.';
  END IF;

  -- Đang chờ duyệt mà bị hủy thì đóng luôn hồ sơ trong Hộp thư, kèm một dòng lịch sử đứng
  -- tên người hủy — không để người duyệt mở ra một việc đã không còn tồn tại.
  INSERT INTO public.approval_decisions (approval_id, step, decision, note, decided_by)
  SELECT a.id, a.current_step, 'rejected',
         format('Người đề nghị hủy đề nghị chi: %s', btrim(p_reason)), v_user
    FROM public.approvals a
   WHERE a.entity_type = 'payment_requests' AND a.entity_id = p_request_id
     AND a.status = 'pending_approval' AND a.deleted_at IS NULL;

  UPDATE public.approvals
     SET status = 'completed', final_decision = 'rejected',
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE entity_type = 'payment_requests' AND entity_id = p_request_id
     AND status = 'pending_approval' AND deleted_at IS NULL;

  UPDATE public.payment_requests
     SET stage = 'huy', closed_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_payment_request(uuid, text) IS
  'Hủy một đề nghị chi kèm lý do, và đóng hồ sơ tương ứng trong Hộp thư Phê duyệt.';


-- ----------------------------------------------------------------------------
-- 5. Thực hiện chi và hạch toán — KT-01 bước 6 → 8, KT-05
-- ----------------------------------------------------------------------------

/**
 * Ghi phần chi phí của một đề nghị vào ngân sách công trình — KT-05.
 *
 * ⚠️ ĐÂY LÀ CHỖ DỄ ĐẾM HAI LẦN NHẤT TRONG CẢ HỆ THỐNG. Ba loại khoản chi, ba cách xử lý khác
 * nhau, và chọn sai thì chi phí công trình sai mà không có triệu chứng nào cho tới lúc đối
 * chiếu lãi/lỗ:
 *
 *   - Chi cho một ĐƠN HÀNG của Module MH: chi phí ĐÃ được `record_delivery` ghi vào phần "đã
 *     phát sinh" ngay khi hàng về (MH-07, KT-05 "gắn chi phí ngay từ khi phát sinh"). Trả
 *     tiền là việc của dòng tiền, không phải một lần phát sinh chi phí thứ hai. KHÔNG ghi.
 *   - TẠM ỨNG: tiền ra khỏi quỹ nhưng chưa có chi phí nào phát sinh — người nhận còn nợ lại.
 *     Chi phí chỉ hình thành khi hoàn ứng kèm chứng từ. KHÔNG ghi.
 *   - Còn lại (thanh toán thẳng không qua mua hàng, và hoàn ứng): đây mới là lần đầu chi phí
 *     được ghi nhận. GHI vào `actual_amount` theo từng dòng phân bổ.
 */
CREATE OR REPLACE FUNCTION public.post_payment_to_budget(p_request_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.auth_user_id();
  pr       record;
  a        record;
  v_posted bigint := 0;
BEGIN
  SELECT * INTO pr FROM public.payment_requests WHERE id = p_request_id;

  IF pr.request_type = 'tam_ung' THEN
    RETURN 0;
  END IF;

  IF pr.purchase_order_id IS NOT NULL OR pr.delivery_id IS NOT NULL THEN
    RETURN 0;
  END IF;

  FOR a IN
    SELECT * FROM public.payment_request_allocations
     WHERE payment_request_id = p_request_id
       AND construction_site_id IS NOT NULL
       AND cost_code IS NOT NULL
  LOOP
    UPDATE public.project_budgets
       SET actual_amount = actual_amount + a.amount,
           updated_at = now(), updated_by = v_user
     WHERE construction_site_id = a.construction_site_id
       AND cost_code = a.cost_code
       AND company_id = pr.company_id
       AND deleted_at IS NULL;

    IF FOUND THEN
      v_posted := v_posted + a.amount;
    END IF;
  END LOOP;

  RETURN v_posted;
END;
$$;

COMMENT ON FUNCTION public.post_payment_to_budget(uuid) IS
  'Ghi chi phí thực tế của một khoản chi vào ngân sách công trình (KT-05). Bỏ qua khoản đã ghi ở Module MH và khoản tạm ứng.';


/**
 * Ghi nhận đã chi tiền cho một đề nghị đã được phê duyệt — KT-01 bước 6 và 7.
 *
 * CỐ Ý không nhận tham số số tiền: khoản chi bằng đúng số đã được duyệt, không hơn không kém.
 * Chi một phần thì tách thành hai đề nghị — mỗi phần đi qua đúng hạn mức của phần đó. Cho
 * nhập số tự do ở đây là mở đường chi 200 triệu trên một hồ sơ chỉ được duyệt 20 triệu.
 *
 * Một lần gọi kéo theo bốn việc, tất cả trong CÙNG một giao dịch: đánh dấu đã chi, ghi chi
 * phí vào ngân sách, sinh hoặc tất toán khoản tạm ứng, và ghi một dòng vào lịch sử thanh
 * toán của khoản công nợ. Tách rời thì có lúc tiền đã ra mà khoản nợ vẫn còn nguyên.
 */
CREATE OR REPLACE FUNCTION public.record_payment(
  p_request_id uuid,
  p_paid_date date,
  p_method payment_method,
  p_reference text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.auth_user_id();
  pr      record;
  adv     record;
  v_paid  date := COALESCE(p_paid_date, current_date);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(pr.company_id) THEN
    RAISE EXCEPTION 'Không thao tác được trên đề nghị chi này.';
  END IF;

  -- Người kiểm và người chi là hai vai khác nhau (PRD 2.3): ghi nhận đã chi là việc của
  -- Kế toán – Tài chính, không phải của người đề nghị.
  IF NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Ghi nhận đã chi do Kế toán – Tài chính thực hiện.';
  END IF;

  IF pr.stage <> 'da_duyet' THEN
    RAISE EXCEPTION 'Chỉ ghi nhận đã chi cho đề nghị đã được phê duyệt. Hồ sơ này đang ở bước khác.';
  END IF;

  IF v_paid > current_date THEN
    RAISE EXCEPTION 'Ngày chi nằm ở tương lai. Chọn ngày đã thực hiện chi.';
  END IF;

  UPDATE public.payment_requests
     SET stage = 'da_chi',
         paid_date = v_paid,
         paid_amount = pr.amount,
         payment_method = p_method,
         payment_reference = NULLIF(btrim(p_reference), ''),
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;

  PERFORM public.post_payment_to_budget(p_request_id);

  /* --- Tạm ứng: khoản nợ phát sinh đúng lúc tiền ra, không sớm hơn (KT-03) --- */
  IF pr.request_type = 'tam_ung' THEN
    INSERT INTO public.advances (
      company_id, payment_request_id, user_id, purpose, amount,
      advance_date, due_date, status, created_by, updated_by
    )
    VALUES (
      pr.company_id, pr.id, pr.advance_user_id, pr.title, pr.amount,
      v_paid, pr.advance_due_date, 'dang_no', v_user, v_user
    );
  END IF;

  /* --- Hoàn ứng: trừ vào khoản nợ cũ --- */
  IF pr.request_type = 'hoan_ung' AND pr.settles_advance_id IS NOT NULL THEN
    SELECT * INTO adv FROM public.advances
     WHERE id = pr.settles_advance_id FOR UPDATE;

    UPDATE public.advances
       SET settled_amount = settled_amount + pr.amount,
           status = CASE WHEN adv.settled_amount + pr.amount >= adv.amount
                         THEN 'da_hoan' ELSE 'dang_no' END::advance_status,
           settled_at = CASE WHEN adv.settled_amount + pr.amount >= adv.amount
                             THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = pr.settles_advance_id;
  END IF;

  /* --- Công nợ phải trả: ghi một dòng chứng từ, không sửa tổng bằng tay (KT-04) --- */
  IF pr.receivable_id IS NOT NULL THEN
    INSERT INTO public.receivable_settlements (
      receivable_id, settled_date, amount, method, reference,
      payment_request_id, notes, created_by, updated_by
    )
    VALUES (
      pr.receivable_id, v_paid, pr.amount, p_method, NULLIF(btrim(p_reference), ''),
      pr.id, format('Chi theo đề nghị %s', COALESCE(pr.code, '')), v_user, v_user
    );
  END IF;

  PERFORM public.create_notification(
    pr.requested_by, pr.company_id, 'payment_request_paid',
    format('Đề nghị chi %s đã được chi %s đồng ngày %s.',
           COALESCE(pr.code, ''), to_char(pr.amount, 'FM999,999,999,999'),
           to_char(v_paid, 'DD/MM/YYYY')),
    'payment_requests', pr.id,
    format('/kt/de-nghi-thanh-toan/%s', pr.id)
  );
END;
$$;

COMMENT ON FUNCTION public.record_payment(uuid, date, payment_method, text) IS
  'Ghi nhận đã chi một đề nghị đã duyệt: cập nhật ngân sách, tạm ứng và công nợ trong cùng một giao dịch (KT-01).';


/**
 * Đánh dấu đã chuyển số liệu sang phần mềm kế toán chính thức — KT-01 bước 8, KT-08.
 *
 * KHÔNG sinh bút toán và KHÔNG gọi ra ngoài: PRD KT-08 giữ phần mềm kế toán hiện tại làm
 * nguồn ghi sổ chính thức, và NVG chưa chốt dùng phần mềm nào (PRD Mục 10). Ở đây chỉ ghi
 * lại "khoản này đã được chuyển, số chứng từ bên đó là gì" — đúng phần KT-08 gọi là "đánh
 * dấu trạng thái đã chuyển", để lần đối chiếu sau biết khoản nào còn sót.
 */
CREATE OR REPLACE FUNCTION public.post_payment(p_request_id uuid, p_reference text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  pr     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO pr FROM public.payment_requests
   WHERE id = p_request_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(pr.company_id)
     OR NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Đánh dấu đã hạch toán do Kế toán thực hiện.';
  END IF;

  IF pr.stage <> 'da_chi' THEN
    RAISE EXCEPTION 'Chỉ hạch toán khoản đã chi. Hồ sơ này đang ở bước khác.';
  END IF;

  UPDATE public.payment_requests
     SET stage = 'da_hach_toan',
         posted_at = now(),
         posted_reference = NULLIF(btrim(p_reference), ''),
         updated_at = now(), updated_by = v_user
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.post_payment(uuid, text) IS
  'Đánh dấu một khoản chi đã chuyển sang phần mềm kế toán chính thức (KT-08). Không sinh bút toán.';


-- ----------------------------------------------------------------------------
-- 6. Công nợ và thu tiền — KT-04, HD-03
-- ----------------------------------------------------------------------------

/**
 * Ghi nhận một lần thu tiền (hoặc trả tiền) cho một khoản công nợ — KT-04.
 *
 * Đây là cửa DUY NHẤT để `contracts.collected_amount` thay đổi. Bảng `receivable_settlements`
 * không nhận lệnh ghi từ trình duyệt, nên phần "đã thu" hiện trên màn hình Hợp đồng luôn
 * bằng đúng tổng các chứng từ nằm ngay bên dưới nó — không có đường nào tạo ra một con số
 * đẹp hơn thực tế.
 */
CREATE OR REPLACE FUNCTION public.record_receivable_settlement(
  p_receivable_id uuid,
  p_settled_date date,
  p_amount bigint,
  p_method payment_method DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.auth_user_id();
  rp          record;
  v_date      date := COALESCE(p_settled_date, current_date);
  v_remaining bigint;
  v_id        uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO rp FROM public.receivables_payables
   WHERE id = p_receivable_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(rp.company_id)
     OR NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Ghi nhận thu – chi công nợ do Kế toán – Tài chính thực hiện.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Số tiền phải lớn hơn 0.';
  END IF;

  IF v_date > current_date THEN
    RAISE EXCEPTION 'Ngày chứng từ nằm ở tương lai. Chọn ngày đã thực hiện.';
  END IF;

  v_remaining := rp.amount - rp.settled_amount;

  /*
   * Thu nhiều hơn số còn nợ nghĩa là hoặc gõ nhầm, hoặc khách trả gộp cho một khoản khác
   * chưa được lập. Cả hai đều phải dừng lại xử lý: ghi bừa vào đây làm công nợ âm, và bảng
   * tuổi nợ của cả pháp nhân lệch theo.
   */
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Số tiền (% đồng) lớn hơn phần còn lại của khoản công nợ (% đồng).',
      to_char(p_amount, 'FM999,999,999,999'), to_char(v_remaining, 'FM999,999,999,999');
  END IF;

  INSERT INTO public.receivable_settlements (
    receivable_id, settled_date, amount, method, reference, notes, created_by, updated_by
  )
  VALUES (
    p_receivable_id, v_date, p_amount, p_method, NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''), v_user, v_user
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_receivable_settlement(uuid, date, bigint, payment_method, text, text) IS
  'Ghi một chứng từ thu/trả cho khoản công nợ — cửa duy nhất làm đổi số đã thu của hợp đồng (KT-04, HD-03).';


/** Đánh dấu đã đối chiếu công nợ — KT-04 "hằng tháng đối chiếu chính thức". */
CREATE OR REPLACE FUNCTION public.reconcile_receivable(p_receivable_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  rp     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO rp FROM public.receivables_payables
   WHERE id = p_receivable_id AND deleted_at IS NULL;

  IF NOT FOUND OR NOT public.rls_company_access(rp.company_id)
     OR NOT (public.auth_can_edit_module('KT') AND public.rls_sees_finance()) THEN
    RAISE EXCEPTION 'Đối chiếu công nợ do Kế toán – Tài chính thực hiện.';
  END IF;

  UPDATE public.receivables_payables
     SET reconciled_at = now(), reconciled_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_receivable_id;
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. Kỳ kế toán — KT-09
-- ----------------------------------------------------------------------------

/**
 * Khóa một kỳ kế toán.
 *
 * Chặn trước khi khóa nếu còn khoản ĐÃ CHI mà CHƯA HẠCH TOÁN trong kỳ: khóa lúc đó là chốt
 * sổ trên một kỳ còn dở, và vì kỳ đã khóa không sửa được nữa, những khoản đó mắc kẹt vĩnh
 * viễn ở trạng thái nửa vời cho tới khi có người mở lại kỳ.
 *
 * Đề nghị đang chạy dở (chưa chi) thì KHÔNG chặn — chúng thuộc về kỳ mà chúng được chi, và
 * ngày chi nằm ở tương lai.
 */
CREATE OR REPLACE FUNCTION public.close_accounting_period(p_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.auth_user_id();
  ap        record;
  v_pending integer;
  v_locked  integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO ap FROM public.accounting_periods WHERE id = p_period_id FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(ap.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ kế toán.';
  END IF;

  -- Chốt sổ là quyết định của Tài chính cấp trên, không phải của người nhập chứng từ hằng ngày.
  IF NOT public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN') THEN
    RAISE EXCEPTION 'Khóa kỳ kế toán do Trưởng Tài chính hoặc Ban Giám đốc thực hiện.';
  END IF;

  IF ap.status = 'da_khoa' THEN
    RAISE EXCEPTION 'Kỳ này đã khóa.';
  END IF;

  SELECT count(*) INTO v_pending
    FROM public.payment_requests pr
   WHERE pr.company_id = ap.company_id
     AND pr.deleted_at IS NULL
     AND pr.stage = 'da_chi'
     AND pr.paid_date BETWEEN ap.period_start AND ap.period_end;

  IF v_pending > 0 THEN
    RAISE EXCEPTION
      'Còn % khoản đã chi trong kỳ chưa được hạch toán. Hạch toán hết rồi mới khóa kỳ.',
      v_pending;
  END IF;

  SELECT count(*) INTO v_locked
    FROM public.payment_requests pr
   WHERE pr.company_id = ap.company_id
     AND pr.deleted_at IS NULL
     AND pr.paid_date BETWEEN ap.period_start AND ap.period_end;

  UPDATE public.accounting_periods
     SET status = 'da_khoa', closed_at = now(), closed_by = v_user,
         updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;

  RETURN v_locked;
END;
$$;

COMMENT ON FUNCTION public.close_accounting_period(uuid) IS
  'Khóa kỳ kế toán và chặn sửa chứng từ mang ngày trong kỳ (KT-09). Trả về số bản ghi bị khóa.';


/**
 * Mở lại một kỳ đã khóa — KT-09: "mọi điều chỉnh sau khi đã khóa phải ghi rõ NGUYÊN NHÂN và
 * NGƯỜI PHÊ DUYỆT". Lý do bắt buộc, và người mở được ghi tên vào chính dòng kỳ đó.
 */
CREATE OR REPLACE FUNCTION public.reopen_accounting_period(p_period_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  ap     record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO ap FROM public.accounting_periods WHERE id = p_period_id FOR UPDATE;

  IF NOT FOUND OR NOT public.rls_company_access(ap.company_id) THEN
    RAISE EXCEPTION 'Không tìm thấy kỳ kế toán.';
  END IF;

  IF NOT public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN') THEN
    RAISE EXCEPTION 'Mở lại kỳ kế toán do Trưởng Tài chính hoặc Ban Giám đốc thực hiện.';
  END IF;

  IF ap.status <> 'da_khoa' THEN
    RAISE EXCEPTION 'Kỳ này đang mở.';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Vui lòng nêu nguyên nhân mở lại kỳ đã khóa.';
  END IF;

  UPDATE public.accounting_periods
     SET status = 'dang_mo', reopened_at = now(), reopened_by = v_user,
         reopen_reason = btrim(p_reason),
         updated_at = now(), updated_by = v_user
   WHERE id = p_period_id;
END;
$$;

COMMENT ON FUNCTION public.reopen_accounting_period(uuid, text) IS
  'Mở lại kỳ kế toán đã khóa, bắt buộc nêu nguyên nhân và ghi tên người mở (KT-09).';


-- ----------------------------------------------------------------------------
-- 8. Quyết định phê duyệt — thêm nhánh đề nghị chi
--
-- Định nghĩa lại NGUYÊN hàm `decide_approval` (lần gần nhất ở migration 0039) và bổ sung
-- nhánh `payment_requests`. Hộp thư Phê duyệt vẫn là MỘT màn hình cho mọi module
-- (Webapp Flow 4.6), nên mọi loại hồ sơ đều đi qua đúng hàm này.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decide_approval(
  p_approval_id uuid,
  p_decision approval_decision,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.auth_user_id();
  a      record;
  perm   record;
  e      record;
  st     record;
  adj    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập.';
  END IF;

  SELECT * INTO a FROM public.approvals
  WHERE id = p_approval_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ phê duyệt.';
  END IF;

  IF a.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Hồ sơ này đã được xử lý.';
  END IF;

  IF NOT public.rls_can_approve(a.subject, a.company_id, a.amount) THEN
    RAISE EXCEPTION 'Hồ sơ vượt hạn mức phê duyệt của vai trò hiện tại, hoặc vai trò không được duyệt loại nghiệp vụ này.';
  END IF;

  IF p_decision = 'rejected' AND (p_note IS NULL OR btrim(p_note) = '') THEN
    RAISE EXCEPTION 'Vui lòng nêu lý do từ chối.';
  END IF;

  SELECT * INTO perm FROM public.auth_approval_permission(a.subject, a.company_id);

  INSERT INTO public.approval_decisions (
    approval_id, step, decision, note,
    approver_limit_at_time, approver_unlimited, decided_by
  )
  VALUES (
    p_approval_id, a.current_step, p_decision, NULLIF(btrim(p_note), ''),
    perm.max_amount, perm.is_unlimited, v_user
  );

  UPDATE public.approvals
     SET status = 'completed', final_decision = p_decision,
         decided_at = now(), updated_at = now(), updated_by = v_user
   WHERE id = p_approval_id;

  IF a.entity_type = 'quotes' THEN
    UPDATE public.quotes
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'estimates' THEN
    UPDATE public.estimates
       SET status = (CASE WHEN p_decision = 'approved' THEN 'completed' ELSE 'draft' END)::status_group,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id
     RETURNING bidding_project_id, design_project_id INTO e;

    IF e.bidding_project_id IS NOT NULL THEN
      UPDATE public.bidding_projects
         SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet_gia' ELSE 'du_toan' END)::bidding_stage,
             updated_at = now(), updated_by = v_user
       WHERE id = e.bidding_project_id;
    END IF;

  ELSIF a.entity_type = 'contracts' THEN
    -- Từ chối thì hợp đồng quay lại bước Nháp để sửa, không nằm mãi ở "chờ phê duyệt".
    UPDATE public.contracts
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'nhap' END)::contract_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'contract_amendments' THEN
    UPDATE public.contract_amendments
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::amendment_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           decision_notes = NULLIF(btrim(p_note), ''),
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

  ELSIF a.entity_type = 'purchase_requests' THEN
    -- Từ chối thì đề nghị về bước "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy
    -- hồ sơ của mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa (MH-02).
    UPDATE public.purchase_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::purchase_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Đề nghị đã duyệt là việc cần làm của Phòng Mua hàng: họ mới là người đi hỏi báo giá
      -- (MH-04), còn người đề nghị thường ở công trường và không mở màn hình MH hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'purchase_request_approved',
        format('Đề nghị mua %s đã được phê duyệt, giá trị ước tính %s đồng.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'purchase_requests', a.entity_id,
        format('/mh/de-nghi-mua/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND uc.company_id = a.company_id
        AND r.code = 'MH';
    END IF;

    -- Người đề nghị cần biết kết quả dù duyệt hay từ chối — họ đang chờ hàng.
    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'purchase_request_approved' ELSE 'purchase_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị mua %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị mua %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'purchase_requests', a.entity_id,
      format('/mh/de-nghi-mua/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'stocktakes' THEN
    IF p_decision = 'approved' THEN
      /*
       * KHO-07: "lập biên bản và trình phê duyệt TRƯỚC KHI điều chỉnh số liệu". Đây là giây
       * phút sổ kho được phép đổi — và nó đổi bằng một PHIẾU điều chỉnh, không phải bằng một
       * câu UPDATE lặng lẽ, để lần sau còn đọc được ai duyệt và lệch những gì.
       *
       * Đổi trạng thái TRƯỚC khi ghi phiếu: chừng nào đợt kiểm còn mở thì kho vẫn bị khoá
       * nhập xuất, và chính phiếu điều chỉnh cũng sẽ bị chặn.
       */
      UPDATE public.stocktakes
         SET status = 'da_dieu_chinh', adjusted_at = now(),
             updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id
       RETURNING warehouse_id INTO st;

      SELECT jsonb_agg(jsonb_build_object(
               'material_id', si.material_id,
               'quantity', abs(si.counted_quantity - si.book_quantity),
               'direction', CASE WHEN si.counted_quantity > si.book_quantity THEN 'tang' ELSE 'giam' END
             ))
        INTO adj
        FROM public.stocktake_items si
       WHERE si.stocktake_id = a.entity_id
         AND si.counted_quantity IS NOT NULL
         AND si.counted_quantity <> si.book_quantity;

      IF adj IS NOT NULL THEN
        PERFORM public.write_stock_movement(
          'kiem_ke', st.warehouse_id, NULL, current_date, adj,
          NULL, NULL, NULL, NULL, NULL, NULL, a.entity_id,
          format('Điều chỉnh theo biên bản kiểm kê %s.', COALESCE(a.entity_code, ''))
        );
      END IF;
    ELSE
      -- Từ chối thì kho đếm lại, KHÔNG phải là chấp nhận số sổ cũ rồi đóng hồ sơ.
      UPDATE public.stocktakes
         SET status = 'dang_kiem', updated_at = now(), updated_by = v_user
       WHERE id = a.entity_id;
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'stocktake_adjusted' ELSE 'stocktake_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Biên bản kiểm kê %s đã được duyệt, sổ kho đã điều chỉnh.', COALESCE(a.entity_code, ''))
           ELSE format('Biên bản kiểm kê %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'stocktakes', a.entity_id,
      format('/kho/kiem-ke/%s', a.entity_id)
    );

  ELSIF a.entity_type = 'payment_requests' THEN
    /*
     * KT-01 bước 5 — phê duyệt theo hạn mức. Ba bước kiểm trước đó đã xong và đã ghi vào
     * `payment_request_steps`; ở đây chỉ còn quyết định cuối cùng về tiền.
     *
     * Từ chối thì hồ sơ về "Bị từ chối" chứ không về Nháp: người đề nghị cần thấy hồ sơ của
     * mình đã bị từ chối và vì sao, trước khi sửa lại và gửi lần nữa. Sửa xong gửi lại là
     * đi LẠI TỪ ĐẦU cả ba bước kiểm — người kiểm trước đó đã ký trên một con số khác.
     */
    UPDATE public.payment_requests
       SET stage = (CASE WHEN p_decision = 'approved' THEN 'da_duyet' ELSE 'tu_choi' END)::payment_request_stage,
           approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
           closed_reason = CASE WHEN p_decision = 'rejected' THEN NULLIF(btrim(p_note), '') END,
           updated_at = now(), updated_by = v_user
     WHERE id = a.entity_id;

    IF p_decision = 'approved' THEN
      -- Khoản đã duyệt là việc cần làm của Kế toán – Tài chính: họ lập phiếu chi và thực
      -- hiện chi (KT-01 bước 6, 7). Người đề nghị thường không mở màn hình KT hằng ngày.
      PERFORM public.create_notification(
        u.id, a.company_id, 'payment_request_approved',
        format('Đề nghị chi %s đã được phê duyệt, giá trị %s đồng. Lập phiếu chi để thực hiện.',
               COALESCE(a.entity_code, ''), to_char(COALESCE(a.amount, 0), 'FM999,999,999,999')),
        'payment_requests', a.entity_id,
        format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
      )
      FROM public.users u
      JOIN public.user_companies uc ON uc.user_id = u.id AND uc.deleted_at IS NULL
      JOIN public.roles r ON r.id = uc.role_id
      WHERE u.is_active AND u.deleted_at IS NULL
        AND (uc.company_id = a.company_id OR r.sees_all_companies)
        AND r.code = 'KT';
    END IF;

    PERFORM public.create_notification(
      a.requested_by, a.company_id,
      CASE WHEN p_decision = 'approved' THEN 'payment_request_approved' ELSE 'payment_request_rejected' END,
      CASE WHEN p_decision = 'approved'
           THEN format('Đề nghị chi %s đã được phê duyệt.', COALESCE(a.entity_code, ''))
           ELSE format('Đề nghị chi %s bị từ chối. %s', COALESCE(a.entity_code, ''), COALESCE(NULLIF(btrim(p_note), ''), ''))
      END,
      'payment_requests', a.entity_id,
      format('/kt/de-nghi-thanh-toan/%s', a.entity_id)
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.decide_approval(uuid, approval_decision, text) IS
  'Ghi một quyết định phê duyệt và cập nhật hồ sơ nguồn — báo giá, dự toán, hợp đồng, phát sinh, đề nghị mua, điều chỉnh kiểm kê, đề nghị chi.';


-- ----------------------------------------------------------------------------
-- 9. Dòng tiền hiện tại — KT-06
--
-- `GET /api/cash-flow/current` của Backend Schema 4.9, hiện thực hoá bằng một hàm CSDL thay
-- vì một endpoint Workers: nó chỉ đọc và tổng hợp trên các bảng đã có RLS, đúng ranh giới
-- hai lớp ở CLAUDE.md 3.1 ("chỉ tạo endpoint Workers khi gọi dịch vụ ngoài, ghi nhiều bảng,
-- hoặc quy tắc phức tạp hơn RLS").
--
-- SECURITY INVOKER — CỐ Ý, và đây là điểm quan trọng nhất của hàm này: nó chạy bằng quyền
-- của người gọi, nên RLS lọc trước khi cộng. Một người chỉ thấy NVC sẽ nhận đúng số của NVC.
-- Đổi sang SECURITY DEFINER là biến bảng dòng tiền toàn tập đoàn thành công khai.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cash_flow_current(
  p_from date,
  p_to date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  company_id        uuid,
  company_code      varchar(8),
  company_name      varchar(64),
  opening_balance   bigint,
  planned_in        bigint,
  planned_out       bigint,
  receivables_due   bigint,
  payables_due      bigint,
  approved_payments bigint,
  closing_balance   bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT c.id, c.code, c.short_name
      FROM public.companies c
     WHERE c.is_transactional
       AND c.deleted_at IS NULL
       AND (p_company_id IS NULL OR c.id = p_company_id)
  ),
  plans AS (
    SELECT cfp.company_id AS cid,
           COALESCE(SUM(cfp.opening_balance), 0)::bigint AS opening_balance,
           COALESCE(SUM(cfp.planned_in), 0)::bigint      AS planned_in,
           COALESCE(SUM(cfp.planned_out), 0)::bigint     AS planned_out
      FROM public.cash_flow_plans cfp
     WHERE cfp.deleted_at IS NULL
       AND cfp.period_start >= p_from
       AND cfp.period_end <= p_to
     GROUP BY cfp.company_id
  ),
  debts AS (
    -- Chỉ tính PHẦN CÒN LẠI của khoản nợ, không tính giá trị gốc: hóa đơn đã thu gần hết mà
    -- vẫn vào bảng dòng tiền theo số gốc sẽ vẽ ra một dòng tiền vào không có thật.
    SELECT rp.company_id AS cid,
           COALESCE(SUM(CASE WHEN rp.direction = 'phai_thu'
                             THEN rp.amount - rp.settled_amount ELSE 0 END), 0)::bigint AS receivables_due,
           COALESCE(SUM(CASE WHEN rp.direction = 'phai_tra'
                             THEN rp.amount - rp.settled_amount ELSE 0 END), 0)::bigint AS payables_due
      FROM public.receivables_payables rp
     WHERE rp.deleted_at IS NULL
       AND rp.amount > rp.settled_amount
       AND (rp.due_date IS NULL OR rp.due_date <= p_to)
     GROUP BY rp.company_id
  ),
  approved AS (
    -- Đã duyệt nhưng chưa chi: khoản gần như chắc chắn ra khỏi quỹ, và là thứ hay bị bỏ sót
    -- nhất khi lập kế hoạch dòng tiền bằng tay.
    SELECT pr.company_id AS cid,
           COALESCE(SUM(pr.amount), 0)::bigint AS approved_payments
      FROM public.payment_requests pr
     WHERE pr.deleted_at IS NULL
       AND pr.stage = 'da_duyet'
     GROUP BY pr.company_id
  )
  SELECT
    s.id, s.code, s.short_name,
    COALESCE(p.opening_balance, 0),
    COALESCE(p.planned_in, 0),
    COALESCE(p.planned_out, 0),
    COALESCE(d.receivables_due, 0),
    COALESCE(d.payables_due, 0),
    COALESCE(ap.approved_payments, 0),
    COALESCE(p.opening_balance, 0)
      + COALESCE(p.planned_in, 0) + COALESCE(d.receivables_due, 0)
      - COALESCE(p.planned_out, 0) - COALESCE(d.payables_due, 0) - COALESCE(ap.approved_payments, 0)
  FROM scope s
  LEFT JOIN plans    p  ON p.cid  = s.id
  LEFT JOIN debts    d  ON d.cid  = s.id
  LEFT JOIN approved ap ON ap.cid = s.id
  ORDER BY s.code;
$$;

COMMENT ON FUNCTION public.cash_flow_current(date, date, uuid) IS
  'Dòng tiền dự kiến một kỳ theo pháp nhân (KT-06). SECURITY INVOKER — RLS lọc trước khi cộng.';


/**
 * Tuổi nợ theo khung — KT-04, phục vụ màn hình đối chiếu công nợ.
 *
 * Cùng ngưỡng 30/60/90 với `receivableAging` ở `@nvg/shared/kt`. Hai nơi cùng chia khung là
 * chỗ dễ lệch, nên chỉ có MỘT nơi được coi là nguồn: hàm này dùng cho báo cáo tổng hợp, còn
 * hàm ở `shared` dùng khi màn hình đã tải sẵn từng dòng. Sửa ngưỡng thì sửa cả hai — có kiểm
 * thử canh cho khớp.
 */
CREATE OR REPLACE FUNCTION public.receivable_aging(
  p_direction receivable_direction,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bucket    text,
  total     bigint,
  entries   integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT b.bucket,
         COALESCE(SUM(rp.amount - rp.settled_amount), 0)::bigint,
         count(rp.id)::integer
    FROM (VALUES ('chua_den_han'), ('qua_1_30'), ('qua_31_60'), ('qua_61_90'), ('qua_tren_90'))
         AS b(bucket)
    LEFT JOIN public.receivables_payables rp
      ON rp.deleted_at IS NULL
     AND rp.direction = p_direction
     AND rp.amount > rp.settled_amount
     AND (p_company_id IS NULL OR rp.company_id = p_company_id)
     AND b.bucket = CASE
           WHEN rp.due_date IS NULL OR rp.due_date >= current_date THEN 'chua_den_han'
           WHEN current_date - rp.due_date <= 30 THEN 'qua_1_30'
           WHEN current_date - rp.due_date <= 60 THEN 'qua_31_60'
           WHEN current_date - rp.due_date <= 90 THEN 'qua_61_90'
           ELSE 'qua_tren_90'
         END
   GROUP BY b.bucket;
$$;

COMMENT ON FUNCTION public.receivable_aging(receivable_direction, uuid) IS
  'Bảng tuổi nợ theo năm khung 30/60/90 (KT-04). Ngưỡng khớp với receivableAging ở @nvg/shared/kt.';


-- ----------------------------------------------------------------------------
-- 10. Hàm nội bộ — không mở cho trình duyệt
--
-- Postgres mặc định cho PUBLIC gọi mọi hàm, nên hàm nội bộ phải REVOKE tường minh. Ba hàm
-- dưới đây đều là SECURITY DEFINER và đọc/ghi vượt RLS: `post_payment_to_budget` cộng thẳng
-- vào chi phí thực tế của ngân sách công trình, hai hàm còn lại đọc tổng tiền không qua lọc.
-- Để mở là tự tay dựng một cửa sau bên cạnh cửa chính vừa khoá xong.
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.post_payment_to_budget(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.payment_allocated_total(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.kt_period_locked(uuid, date) FROM anon;
