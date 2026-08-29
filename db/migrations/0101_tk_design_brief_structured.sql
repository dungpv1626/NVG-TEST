-- ============================================================================
-- Đầu bài thiết kế có CẤU TRÚC — Mốc 2, Lớp 1 (TK-10).
--
-- Nguồn: `doc/design/03-data-contracts.md` mục 3.1, `doc/design/08-milestones.md` Mốc 2.
-- Hợp đồng dữ liệu: `contracts/design-brief.schema.json`.
--
-- MỞ RỘNG bảng `design_briefs` đang chạy, KHÔNG tạo bảng thứ hai (quyết định của Haan
-- 29/08/2026, câu hỏi Q-2). Lý do: TK-01 và TK-10 mô tả CÙNG MỘT hồ sơ ở hai mức chi tiết —
-- PRD TK-10 nói thẳng "tiếp nhận yêu cầu khách hàng và chuẩn hoá thành Design Brief". Hai
-- bảng nghĩa là hai nơi nhập cho cùng một thứ, đúng cái mà điều kiện ra của Mốc 2 cấm.
--
-- Giữ nguyên toàn bộ máy móc đã chạy: bốn trigger, ba policy, chỉ mục "một bản hiệu lực
-- duy nhất", cơ chế cấp phiên bản. Migration này chỉ THÊM cột và THÊM một trigger.
--
-- Kiểm trước khi viết: CSDL có 0 dòng `design_briefs`, 0 `design_projects`. Nên phần "di trú
-- dữ liệu phiếu cũ" của tài liệu là rỗng trong hệ thống, và không có script di trú nào.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cột mới
-- ----------------------------------------------------------------------------

ALTER TABLE public.design_briefs
  -- Toàn bộ đầu bài theo hợp đồng `DesignBrief`. NOT NULL DEFAULT '{}' để không có trạng
  -- thái "null hay rỗng" mơ hồ; an toàn tuyệt đối vì bảng đang trống.
  ADD COLUMN IF NOT EXISTS structured jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Artifact `design_brief` đúc ra khi xác nhận. Cho phép truy ngược hai chiều giữa hồ sơ
  -- người dùng sửa được và bản bất biến mà engine đọc.
  ADD COLUMN IF NOT EXISTS artifact_id text REFERENCES public.design_artifact (id) ON DELETE SET NULL,

  -- Biên bản khảo sát đã dùng để điền kích thước lô (TK-02). Rỗng = số do người nhập tay.
  -- Có nó thì màn hình đối chiếu được và nói ra khi hai bên lệch nhau; không có thì lệch
  -- vẫn lệch, chỉ là không ai biết.
  ADD COLUMN IF NOT EXISTS site_source_survey_id uuid REFERENCES public.design_surveys (id) ON DELETE SET NULL;

-- Hai cột dẫn xuất, SINH thẳng từ `structured` — cùng lý lẽ đã dùng cho `kb_record`: chép
-- tay sang cột riêng là tạo hai nguồn có thể nói khác nhau, cột sinh thì Postgres không cho
-- lệch. Bọc `CASE` theo `jsonb_typeof` để một payload hỏng làm rơi lệnh ghi tại chỗ với lý
-- do đọc được, thay vì ném lỗi ép kiểu khó hiểu.
--
-- ⚠️ Đây là BỘ NHỚ ĐỆM cho việc lọc và hiển thị, KHÔNG phải chốt chặn. Con số này do trình
-- duyệt tính rồi ghi vào payload. Chốt chặn thật nằm ở Worker: khi đúc artifact nó TÍNH LẠI
-- bằng cùng bộ quy tắc trong `@nvg/shared/design` và bỏ hẳn con số máy khách gửi lên.
ALTER TABLE public.design_briefs
  ADD COLUMN IF NOT EXISTS completeness_score numeric(4, 3) GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(structured -> 'completeness_score') = 'number'
        THEN (structured ->> 'completeness_score')::numeric
    END
  ) STORED,

  ADD COLUMN IF NOT EXISTS missing_fields jsonb GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(structured -> 'missing_fields') = 'array'
        THEN structured -> 'missing_fields'
      ELSE '[]'::jsonb
    END
  ) STORED;

-- `structured` phải là đối tượng. CỐ Ý KHÔNG liệt kê danh sách khoá cho phép ở đây: đó là
-- bản sao thứ hai của `contracts/design-brief.schema.json` viết bằng SQL, và bản sao thì sẽ
-- lệch. Việc chặn khoá lạ do zod `.strict()` làm ở CẢ HAI đường ghi (trình duyệt và Worker).
ALTER TABLE public.design_briefs
  ADD CONSTRAINT design_briefs_structured_is_object
    CHECK (jsonb_typeof(structured) = 'object'),
  ADD CONSTRAINT design_briefs_completeness_range
    CHECK (completeness_score IS NULL OR completeness_score BETWEEN 0 AND 1);

COMMENT ON COLUMN public.design_briefs.structured IS
  'Đầu bài theo contracts/design-brief.schema.json (Lớp 1, TK-10). Nguồn của artifact design_brief.';
COMMENT ON COLUMN public.design_briefs.completeness_score IS
  'Cột sinh từ structured. Bộ nhớ đệm để lọc và hiển thị — chốt chặn Lớp 2 đọc điểm trong artifact, do Worker tự tính lại.';
COMMENT ON COLUMN public.design_briefs.site_source_survey_id IS
  'Biên bản khảo sát (TK-02) đã dùng để điền kích thước lô. Rỗng = nhập tay.';

-- Hàng chờ: đầu bài đang hiệu lực chưa đủ thông tin để chạy Lớp 2.
CREATE INDEX IF NOT EXISTS design_briefs_completeness_idx
  ON public.design_briefs (design_project_id, completeness_score)
  WHERE is_current_version AND deleted_at IS NULL;


-- ----------------------------------------------------------------------------
-- 2. Đóng băng nội dung sau khi XÁC NHẬN
--
-- Vì sao cần: artifact `design_brief` là mã BĂM NỘI DUNG của `structured`. Sửa `structured`
-- tại chỗ sau khi artifact đã đúc làm CSDL và artifact nói khác nhau, còn đồ thị lineage thì
-- nói dối — và không có triệu chứng nào cả.
--
-- Vì sao KHÔNG mở rộng `public.freeze_record_identity()` (cách hiển nhiên hơn): hàm đó gắn
-- với khoảng mười trigger của các module đang chạy thật. Thay nó để thêm một cột cho một
-- bảng là đặt cả mười chỗ kia vào rủi ro, đổi lấy đúng một tiện lợi. Trigger riêng ở đây
-- chỉ chạm bảng này.
--
-- Vì sao mốc là `confirmed_at` chứ không phải "đã lưu": biểu mẫu mới dài gấp ba lần bản cũ,
-- và mỗi lần Lưu là một phiên bản mới bắt buộc nêu lý do. Bắt nêu lý do cho từng lần lưu dở
-- thì không ai dùng nổi. Dấu vết kiểm toán tồn tại để trả lời "khách nói tôi đâu yêu cầu thế
-- này" — mà chưa xác nhận thì chưa ai dựa vào bản đó. Xác nhận rồi thì bất biến như cũ.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.design_briefs_freeze_after_confirm()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cột được phép đổi sau khi xác nhận: `artifact_id` (Worker ghi sau khi đúc), `deleted_at`
  -- (xoá mềm) và các cột nhật ký. Mọi thứ còn lại là nội dung đầu bài.
  IF NEW.structured            IS DISTINCT FROM OLD.structured
     OR NEW.design_task        IS DISTINCT FROM OLD.design_task
     OR NEW.functional_needs   IS DISTINCT FROM OLD.functional_needs
     OR NEW.budget_amount      IS DISTINCT FROM OLD.budget_amount
     OR NEW.budget_note        IS DISTINCT FROM OLD.budget_note
     OR NEW.style_note         IS DISTINCT FROM OLD.style_note
     OR NEW.site_condition     IS DISTINCT FROM OLD.site_condition
     OR NEW.legal_documents    IS DISTINCT FROM OLD.legal_documents
     OR NEW.site_source_survey_id IS DISTINCT FROM OLD.site_source_survey_id
  THEN
    RAISE EXCEPTION '%',
      'Không sửa được đầu bài đã xác nhận. Chọn "Điều chỉnh đầu bài" để lập phiên bản mới — bản đã xác nhận vẫn giữ nguyên làm căn cứ đối chiếu với khách.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.design_briefs_freeze_after_confirm() IS
  'Đầu bài đã xác nhận là bất biến: artifact design_brief băm nội dung của nó (Mốc 2).';

DROP TRIGGER IF EXISTS design_briefs_freeze_after_confirm ON public.design_briefs;
CREATE TRIGGER design_briefs_freeze_after_confirm
  BEFORE UPDATE ON public.design_briefs
  FOR EACH ROW EXECUTE FUNCTION public.design_briefs_freeze_after_confirm();


-- ----------------------------------------------------------------------------
-- 3. Phân quyền
--
-- KHÔNG sửa policy nào. Quyền của bảng này cấp ở mức BẢNG chứ không theo cột, nên cột mới
-- thừa hưởng ngay ba policy sẵn có (`design_briefs_select/insert/update`, migration 0025).
-- Thêm GRANT theo cột là tạo cảm giác có phân quyền theo cột trong khi không có.
-- ----------------------------------------------------------------------------
