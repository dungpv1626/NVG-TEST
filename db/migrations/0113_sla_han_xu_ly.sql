/**
 * Thời hạn cam kết xử lý — `sla_definitions` (NEN-12, TC-10, MH-02).
 *
 * Nguồn: PRD v1.4 NEN-12 và Backend Schema v1.1 Mục 4.1, cả hai viết sau phiếu khảo sát Chỉ huy
 * – Giám sát công trường. Đây là "ưu tiên số một của công trường" theo nguyên văn khảo sát: cái
 * họ cần không phải gửi đề nghị nhanh hơn, mà là biết ĐỀ NGHỊ ĐANG NẰM Ở AI VÀ CHỜ BAO LÂU RỒI.
 *
 * ## Trách nhiệm hai chiều
 *
 * PRD v1.4 Mục 2.3 thêm một nguyên tắc thiết kế mới: không chỉ yêu cầu hiện trường cập nhật,
 * văn phòng cũng phải xử lý trên cùng hệ thống với thời hạn phản hồi cấu hình được. Thiếu vế
 * thứ hai thì phần mềm chỉ làm tăng việc cho công trường mà không gỡ được điểm nghẽn — và
 * người dùng quay lại Zalo, đúng rủi ro khảo sát nêu.
 *
 * ## Bảng này CỐ Ý được tạo RỖNG
 *
 * PRD v1.4 Mục 10 xếp "thời hạn cam kết phản hồi của từng phòng ban" vào nhóm CẦN BAN GIÁM ĐỐC
 * QUYẾT, kèm câu: "không có tham số này thì cơ chế cảnh báo quá hạn không có căn cứ".
 *
 * Nên ở đây không seed một con số nào. Nạp sẵn "48 giờ cho mọi loại" sẽ tạo ra đồng hồ đếm
 * ngược trông như đã được cam kết, và người duyệt bị gắn nhãn "Quá hạn" theo một thời hạn chưa
 * ai ký. Đó là điều tệ hơn không có đồng hồ. Chưa khai thời hạn thì màn hình KHÔNG hiện đồng hồ
 * — không hiện "0 ngày", không hiện "Quá hạn" (PRD v1.4 Mục 2.3, quy tắc "chưa đủ dữ liệu").
 */

CREATE TABLE public.sla_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  /**
   * Loại đề nghị. Với hồ sơ phê duyệt, giá trị là tên của `approval_subject` (ví dụ
   * 'payment_request'). Cố ý để `varchar` chứ không dùng enum: TC-10 và MH-02 sẽ thêm các loại
   * đề nghị KHÔNG đi qua luồng phê duyệt theo hạn mức (đề nghị vật tư từ công trường, yêu cầu
   * làm rõ kỹ thuật), và ràng buộc chúng vào `approval_subject` sẽ sai ngay từ dòng đầu tiên.
   */
  request_type varchar(48) NOT NULL,

  /** Rỗng = áp dụng cho mọi vai trò tiếp nhận. Có giá trị = chỉ riêng phòng ban đó. */
  responsible_role_id uuid REFERENCES public.roles(id) ON DELETE CASCADE,

  /** Rỗng = áp dụng cho mọi pháp nhân. Có giá trị = thời hạn riêng của pháp nhân đó. */
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  target_hours integer NOT NULL CHECK (target_hours > 0),
  label       text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL
);

-- `NULLS NOT DISTINCT` — cùng bài học 0109, và bảng này có nhiều dòng phạm vi rộng (cả hai cột
-- phạm vi đều rỗng) nên còn dễ nhân bản hơn.
ALTER TABLE public.sla_definitions
  ADD CONSTRAINT sla_definitions_scope
  UNIQUE NULLS NOT DISTINCT (request_type, responsible_role_id, company_id);

CREATE INDEX sla_definitions_type_idx ON public.sla_definitions (request_type) WHERE is_active;

COMMENT ON TABLE public.sla_definitions IS
  'Thời hạn cam kết xử lý theo loại đề nghị (NEN-12, TC-10, MH-02). CỐ Ý rỗng cho tới khi Ban Giám đốc ban hành — xem đầu migration 0113.';

SELECT public.attach_audit_touch('public.sla_definitions');

CREATE TRIGGER sla_definitions_freeze_identity
  BEFORE UPDATE ON public.sla_definitions
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('request_type', 'responsible_role_id', 'company_id');


-- ----------------------------------------------------------------------------
-- Ai đọc, ai sửa
--
-- ĐỌC rộng: thời hạn xử lý không phải số nhạy cảm, và ai gửi đề nghị cũng cần biết bao giờ thì
-- được coi là chậm. Giấu bảng này đi thì đồng hồ biến mất mà không giải thích được vì sao.
--
-- SỬA hẹp: đây là cam kết vận hành giữa các phòng ban, ngang hàng với hạn mức phê duyệt.
-- ----------------------------------------------------------------------------

ALTER TABLE public.sla_definitions ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.sla_definitions FROM anon;
REVOKE DELETE ON public.sla_definitions FROM authenticated;

CREATE POLICY sla_definitions_select ON public.sla_definitions
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR public.rls_company_access(company_id));

CREATE POLICY sla_definitions_insert ON public.sla_definitions
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

CREATE POLICY sla_definitions_update ON public.sla_definitions
  FOR UPDATE TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'))
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));


-- ----------------------------------------------------------------------------
-- Hàm tra thời hạn
--
-- Dòng HẸP hơn thay thế dòng rộng hơn, không cộng dồn — cùng quy tắc `aging_buckets` (0046) và
-- `system_parameters` (0111). Thứ tự ưu tiên: đúng cả vai trò lẫn pháp nhân > đúng pháp nhân >
-- đúng vai trò > dòng chung.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sla_target_hours(
  p_request_type text,
  p_company_id   uuid DEFAULT NULL,
  p_role_id      uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_hours
  FROM public.sla_definitions
  WHERE request_type = p_request_type
    AND is_active
    AND (company_id IS NULL OR company_id = p_company_id)
    AND (responsible_role_id IS NULL OR responsible_role_id = p_role_id)
  ORDER BY (company_id IS NOT NULL) DESC, (responsible_role_id IS NOT NULL) DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.sla_target_hours(text, uuid, uuid) IS
  'Thời hạn cam kết (giờ) cho một loại đề nghị. Trả NULL khi Ban Giám đốc chưa ban hành — nơi gọi phải KHÔNG hiện đồng hồ, không hiện 0.';


-- ----------------------------------------------------------------------------
-- Hộp thư Phê duyệt có đồng hồ hạn xử lý — Webapp Flow v1.1 Mục 4.6
--
-- Trước đây danh sách chỉ trả `requested_at` và giao diện hiện "Chờ N ngày" — người duyệt biết
-- đã chờ bao lâu nhưng không biết bao lâu là quá. `formatDeadline()` ở shared/src/format.ts đã
-- có sẵn từ lâu mà chưa ai gọi; nay có căn cứ để gọi.
--
-- Hồ sơ quá hạn đẩy lên ĐẦU danh sách. Hồ sơ chưa có thời hạn khai báo giữ nguyên thứ tự cũ
-- (theo thời điểm gửi) và không mang đồng hồ — chúng không "đúng hạn", chúng là CHƯA BIẾT.
--
-- RETURNS TABLE đổi cột nên phải DROP trước, và DROP xoá luôn quyền EXECUTE — kể từ 0062 hàm
-- mới không tự mở cho PUBLIC, phải GRANT lại tường minh (bài học 0071, 0094).
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.my_pending_approvals();

CREATE FUNCTION public.my_pending_approvals()
RETURNS TABLE (
  id                uuid,
  subject           approval_subject,
  entity_type       varchar(64),
  entity_id         uuid,
  entity_code       varchar(40),
  title             text,
  amount            bigint,
  reason            text,
  requested_at      timestamptz,
  requested_by_name text,
  company_code      varchar(8),
  company_name      varchar(64),
  parent_id         uuid,
  parent_module     varchar(8),
  due_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending AS (
    SELECT
      a.id, a.subject, a.entity_type, a.entity_id, a.entity_code, a.title, a.amount, a.reason,
      a.requested_at, u.full_name AS requested_by_name, c.code AS company_code,
      c.short_name AS company_name,
      CASE
        WHEN a.entity_type = 'quotes'              THEN q.opportunity_id
        WHEN a.entity_type = 'estimates'           THEN COALESCE(e.bidding_project_id, e.design_project_id)
        WHEN a.entity_type = 'contract_amendments' THEN am.contract_id
      END AS parent_id,
      CASE
        WHEN a.entity_type = 'estimates' AND e.bidding_project_id IS NOT NULL THEN 'DA'
        WHEN a.entity_type = 'estimates' AND e.design_project_id  IS NOT NULL THEN 'TK'
      END AS parent_module,
      a.requested_at
        + make_interval(hours => public.sla_target_hours(a.subject::text, a.company_id))
        AS due_at
    FROM public.approvals a
    LEFT JOIN public.users     u ON u.id = a.requested_by
    LEFT JOIN public.companies c ON c.id = a.company_id
    LEFT JOIN public.quotes    q ON a.entity_type = 'quotes'    AND q.id = a.entity_id
    LEFT JOIN public.estimates e ON a.entity_type = 'estimates' AND e.id = a.entity_id
    LEFT JOIN public.contract_amendments am
           ON a.entity_type = 'contract_amendments' AND am.id = a.entity_id
    WHERE a.status = 'pending_approval'
      AND a.deleted_at IS NULL
      AND public.rls_can_approve(a.subject, a.company_id, a.amount)
  )
  SELECT id, subject, entity_type, entity_id, entity_code, title, amount, reason,
         requested_at, requested_by_name, company_code, company_name,
         parent_id, parent_module::varchar(8), due_at
  FROM pending
  ORDER BY (due_at IS NOT NULL AND due_at < now()) DESC, due_at NULLS LAST, requested_at;
$$;

COMMENT ON FUNCTION public.my_pending_approvals() IS
  'Hồ sơ người dùng hiện tại thực sự duyệt được, kèm hồ sơ CHA (báo giá, dự toán, phát sinh hợp đồng) và hạn xử lý theo sla_definitions. Hồ sơ quá hạn lên đầu; hồ sơ chưa khai thời hạn có due_at rỗng và KHÔNG hiện đồng hồ (0113).';

REVOKE ALL ON FUNCTION public.my_pending_approvals() FROM public;
GRANT EXECUTE ON FUNCTION public.my_pending_approvals() TO authenticated;
