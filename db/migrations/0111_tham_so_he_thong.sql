/**
 * NEN-12 — Bảng tham số hệ thống.
 *
 * Nguồn: PRD v1.4 NEN-12, Backend Schema v1.1 Mục 4.1. Cả hai ra đời từ khảo sát Xưởng và
 * Công trường, nơi người trả lời nói thẳng rằng những con số dưới đây BIẾN ĐỘNG: đơn giá thuê,
 * bảng giá bồi thường, ngưỡng tỷ lệ lỗi, thời hạn phản hồi của từng phòng ban.
 *
 * ## Bảng này KHÔNG thay `approval_limits` và `aging_buckets`
 *
 * Hai bảng đó đã có lược đồ riêng đúng hình dạng dữ liệu của chúng (hạn mức có bước duyệt và
 * loại nghiệp vụ; mốc tuổi nợ có thứ tự và khoảng ngày), đã có kiểm thử, và migration 0109 vừa
 * vá xong lỗ hổng trùng dòng. Ép chúng vào một bảng khoá–giá trị sẽ đổi lấy sự "thống nhất trên
 * giấy" bằng việc phải viết lại các hàm RLS đang đọc `approval_limits` — tức là mang rủi ro hồi
 * quy phân quyền vào một việc thuần dọn dẹp. Haan đã chốt giữ nguyên hai bảng đó (05/09/2026).
 *
 * Bảng này dùng cho các tham số MỚI của NEN-12 và cho những con số đang nằm cứng trong mã
 * nguồn mà khảo sát KHÔNG xác nhận (xem mục 4).
 *
 * ## Vì sao giá trị là `jsonb` chứ không phải cột theo kiểu
 *
 * Các tham số NEN-12 không cùng hình dạng: `sla` là một số giờ, `internal_rental_price` là tiền
 * theo mã sản phẩm, `compensation_price_table` là cả một bảng giá. Ba cột `value_number`,
 * `value_text`, `value_json` sẽ luôn có hai cột rỗng và không ràng buộc được cột nào phải điền.
 * Cùng lý lẽ đã dùng cho `design_setting` (0095).
 *
 * ## Không hồi tố
 *
 * Đổi tham số KHÔNG được làm đổi các chứng từ đã phát hành (PRD NEN-12). Cơ chế cưỡng chế nằm ở
 * phía chứng từ, không ở đây: chứng từ phải LƯU LẠI giá trị đã áp dụng (ví dụ `unit_price_applied`
 * trên biên bản bồi thường), không đọc lại tham số hiện hành khi hiển thị lịch sử. Bảng này chỉ
 * trả lời "hôm nay giá trị là gì". Đợt sau viết bảng chứng từ nào cũng phải nhớ điều này.
 */

-- ----------------------------------------------------------------------------
-- 1. Phạm vi áp dụng của một tham số
-- ----------------------------------------------------------------------------

CREATE TYPE public.parameter_scope AS ENUM ('global', 'company', 'product', 'role');

COMMENT ON TYPE public.parameter_scope IS
  'Phạm vi một tham số áp dụng (Backend Schema v1.1 4.1). Giá trị hẹp hơn THAY THẾ giá trị rộng hơn, không cộng dồn.';


CREATE TABLE public.system_parameters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  param_key     varchar(64) NOT NULL,
  scope_type    public.parameter_scope NOT NULL DEFAULT 'global',
  -- Rỗng khi scope_type = 'global'. Cố ý KHÔNG đặt khoá ngoại: cột này trỏ tới companies,
  -- products hoặc roles tuỳ scope_type, không có bảng đích cố định để tham chiếu.
  scope_id      uuid,
  value         jsonb,
  unit          varchar(32),
  label         text NOT NULL,
  description   text,
  -- Tham số chứa số liệu thương mại nhạy cảm chỉ hiện cho vai trò được xem giá vốn (Mẫu D).
  is_sensitive  boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT current_date,
  approved_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
);

/**
 * `NULLS NOT DISTINCT` — cùng bài học của migration 0109.
 *
 * Mặc định Postgres coi hai NULL là KHÁC nhau trong ràng buộc duy nhất, nên tham số phạm vi
 * toàn hệ thống (`scope_id` rỗng) sẽ không bao giờ đụng nhau và bộ nạp dữ liệu chạy lại bao
 * nhiêu lần thì nhân bản bấy nhiêu lần — đúng chuyện đã xảy ra thật với `aging_buckets` và
 * `approval_limits`. Bảng này có đa số dòng ở phạm vi toàn hệ thống nên còn dễ dính hơn.
 */
ALTER TABLE public.system_parameters
  ADD CONSTRAINT system_parameters_key_scope
  UNIQUE NULLS NOT DISTINCT (param_key, scope_type, scope_id);

CREATE INDEX system_parameters_key_idx ON public.system_parameters (param_key) WHERE is_active;

COMMENT ON TABLE public.system_parameters IS
  'Tham số cấu hình được của NEN-12. KHÔNG hard-code giá trị nào đã có mặt ở đây. Không thay approval_limits/aging_buckets — xem đầu migration 0111.';
COMMENT ON COLUMN public.system_parameters.value IS
  'Rỗng nghĩa là CHƯA CÓ DỮ LIỆU THẬT — màn hình phải hiện "Chưa đủ dữ liệu", không hiện 0 (PRD v1.4 Mục 2.3).';


-- ----------------------------------------------------------------------------
-- 2. Lịch sử thay đổi — ghi bằng trigger, không bằng kỷ luật lập trình
--
-- PRD NEN-12: "Mọi thay đổi tham số phải lưu lịch sử (giá trị cũ, giá trị mới, ngày áp dụng,
-- người duyệt)". Nếu để mỗi nơi gọi một hàm ghi lịch sử thì chỉ cần một chỗ quên là mất dấu vết
-- đúng lúc cần nhất. Trigger ghi thì không có đường vòng — cùng cách đã dùng cho audit_logs.
-- ----------------------------------------------------------------------------

CREATE TABLE public.system_parameter_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  parameter_id uuid NOT NULL REFERENCES public.system_parameters(id) ON DELETE CASCADE,
  param_key    varchar(64) NOT NULL,
  old_value    jsonb,
  new_value    jsonb,
  effective_from date,
  reason       text,
  changed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  changed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX system_parameter_history_param_idx
  ON public.system_parameter_history (parameter_id, changed_at DESC);

COMMENT ON TABLE public.system_parameter_history IS
  'Lịch sử thay đổi tham số (NEN-12). Chỉ ghi bằng trigger, KHÔNG ai sửa/xoá được từ trình duyệt.';


CREATE OR REPLACE FUNCTION public.log_system_parameter_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sửa mà không đổi giá trị (đổi nhãn, bật/tắt) thì không phải một lần đổi tham số.
  IF TG_OP = 'UPDATE' AND OLD.value IS NOT DISTINCT FROM NEW.value THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.system_parameter_history
    (parameter_id, param_key, old_value, new_value, effective_from, changed_by)
  VALUES
    (NEW.id, NEW.param_key,
     CASE WHEN TG_OP = 'UPDATE' THEN OLD.value END,
     NEW.value, NEW.effective_from, public.auth_user_id());

  RETURN NEW;
END;
$$;

CREATE TRIGGER system_parameters_log_change
  AFTER INSERT OR UPDATE ON public.system_parameters
  FOR EACH ROW EXECUTE FUNCTION public.log_system_parameter_change();

SELECT public.attach_audit_touch('public.system_parameters');

CREATE TRIGGER system_parameters_freeze_identity
  BEFORE UPDATE ON public.system_parameters
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('param_key', 'scope_type', 'scope_id');


-- ----------------------------------------------------------------------------
-- 3. Ai đọc, ai sửa
--
-- ĐỌC rộng nhưng KHÔNG phải tất cả: đa số tham số là ngưỡng vận hành mà mọi màn hình đều cần
-- để vẽ đúng (hạn xử lý, cửa sổ sửa nhật ký, ngưỡng ngân sách). Giấu chúng đi thì màn hình
-- hiện sai một cách im lặng. Nhưng bảng còn chứa số liệu thương mại — giá thuê nội bộ, bảng giá
-- bồi thường — nên có cờ `is_sensitive`: dòng nào bật cờ thì chỉ vai trò xem được giá vốn mới
-- đọc, đúng Mẫu D.
--
-- Hôm nay CHƯA khoá nào bật cờ, và đó là kết luận có cân nhắc chứ không phải bỏ sót. Giá thuê
-- nội bộ và bảng giá bồi thường trông như số nhạy cảm nhưng không thuộc nhóm NEN-07 liệt kê
-- (giá vốn, lợi nhuận, lương, nội dung thương thảo, dữ liệu thuế/ngân hàng): giá bồi thường là
-- điều khoản hợp đồng đưa cho khách, còn giá thuê nội bộ là giá điều chuyển mà chính người lập
-- chứng từ điều chuyển phải đọc được để lập. Bật cờ cho hai khoá này sẽ chặn đúng vai trò cần
-- dùng chúng (Kinh doanh NVS, Xưởng) và làm SX-21 không lập được chứng từ.
--
-- Cơ chế vẫn dựng sẵn vì nó có chi phí gần bằng không và vì khoá tiền tệ tiếp theo có thể thật
-- sự nhạy cảm — nhưng nó là cơ chế ĐANG CHẠY, policy ở dưới đọc cờ thật, không phải cấu hình
-- khai ra rồi bỏ đó.
--
-- SỬA hẹp: NEN-12 gọi đây là "bảng tham số do quản trị viên cấu hình". Đổi một dòng ở đây đổi
-- cách tính tiền hoặc cách cảnh báo của cả tập đoàn — ngang hàng với hạn mức phê duyệt.
-- ----------------------------------------------------------------------------

ALTER TABLE public.system_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_parameter_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.system_parameters FROM anon;
REVOKE DELETE ON public.system_parameters FROM authenticated;
REVOKE ALL    ON public.system_parameter_history FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.system_parameter_history FROM authenticated;

CREATE POLICY system_parameters_select ON public.system_parameters
  FOR SELECT TO authenticated
  USING (
    (NOT is_sensitive OR public.rls_sees_sensitive('cost'))
    AND (
      scope_type <> 'company'
      OR scope_id IS NULL
      OR public.rls_company_access(scope_id)
    )
  );

CREATE POLICY system_parameters_insert ON public.system_parameters
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

CREATE POLICY system_parameters_update ON public.system_parameters
  FOR UPDATE TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'))
  WITH CHECK (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));

-- Lịch sử: đọc như audit_logs (NEN-07) — chỉ cấp quyết định. Không ai ghi được từ trình duyệt;
-- đường ghi duy nhất là trigger SECURITY DEFINER ở mục 2.
CREATE POLICY system_parameter_history_select ON public.system_parameter_history
  FOR SELECT TO authenticated
  USING (public.auth_has_role('TGD', 'CFO', 'BGD', 'ADMIN'));


-- ----------------------------------------------------------------------------
-- 4. Hàm đọc
--
-- Trả về `NULL` khi chưa cấu hình — CỐ Ý không dựng lại giá trị mặc định ở đây. Bài học của
-- 0046: im lặng dựng lại mặc định trong SQL khiến việc xoá hết cấu hình trông như thể cấu hình
-- vẫn còn hiệu lực. Nơi gọi tự quyết định làm gì khi rỗng, và phải nói rõ ra bằng `coalesce`
-- kèm chú thích, để giá trị dự phòng nhìn thấy được ngay tại chỗ dùng.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.system_parameter(
  p_key        text,
  p_scope_type public.parameter_scope DEFAULT 'global',
  p_scope_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  /* Phạm vi hẹp THAY THẾ phạm vi rộng, không trộn — cùng quy tắc aging_buckets (0046). */
  SELECT value
  FROM public.system_parameters
  WHERE param_key = p_key
    AND is_active
    AND effective_from <= current_date
    AND (
      (scope_type = p_scope_type AND scope_id IS NOT DISTINCT FROM p_scope_id)
      OR scope_type = 'global'
    )
  ORDER BY (scope_type = 'global'), effective_from DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.system_parameter(text, public.parameter_scope, uuid) IS
  'Đọc tham số NEN-12. Trả NULL khi chưa cấu hình — nơi gọi phải xử lý tường minh, xem mục 4 của migration 0111.';


CREATE OR REPLACE FUNCTION public.system_parameter_number(
  p_key        text,
  p_scope_type public.parameter_scope DEFAULT 'global',
  p_scope_id   uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(public.system_parameter(p_key, p_scope_type, p_scope_id)) = 'number'
    THEN (public.system_parameter(p_key, p_scope_type, p_scope_id))::text::numeric
  END;
$$;


-- ----------------------------------------------------------------------------
-- 5. Dữ liệu khởi tạo
--
-- Hai nhóm, phân biệt rõ ràng:
--
--   (a) Tham số ĐANG CHẠY, giá trị hiện tại lấy đúng từ mã nguồn — chỉ chuyển chỗ ở, không đổi
--       hành vi. Ba trong bốn con số này là SUY LUẬN của đội triển khai, không phải quy chế của
--       NVG; khảo sát không xác nhận cái nào. Đưa vào đây để NVG sửa được mà không phải triển
--       khai lại phần mềm.
--
--   (b) Tham số CHƯA CÓ DỮ LIỆU THẬT — `value` để RỖNG. Khảo sát Xưởng nói thẳng: "không nên
--       ước lượng một con số để điền vì đây là dữ liệu quan trọng cho quản trị tài sản và định
--       giá cho thuê". Điền một số mặc định ở đây là làm đúng cái việc bị cấm — nó biến một ô
--       trống nhìn thấy được thành một con số sai trông như đã được duyệt.
-- ----------------------------------------------------------------------------

INSERT INTO public.system_parameters
  (param_key, scope_type, value, unit, label, description, is_sensitive)
VALUES
  -- (a) đang chạy
  ('site_log_edit_window_hours', 'global', to_jsonb(24), 'giờ',
   'Cửa sổ sửa nhật ký công trường',
   'SUY LUẬN của đội triển khai (0035_tc_rls.sql), khảo sát KHÔNG xác nhận. Chỉ được ủng hộ gián tiếp: báo cáo ngày phải gửi trước 20 giờ tối.',
   false),

  ('budget_warning_threshold', 'global', to_jsonb(0.9), 'tỷ lệ',
   'Ngưỡng cảnh báo sắp vượt ngân sách công trình',
   'SUY LUẬN của đội triển khai (TC-05, NEN-04). Khớp BUDGET_WARNING_THRESHOLD ở shared/src/tc.ts.',
   false),

  ('crew_rating_scale_max', 'global', to_jsonb(5), 'điểm',
   'Điểm tối đa của thang đánh giá tổ đội',
   'SUY LUẬN của đội triển khai. Đổi thang KHÔNG quy đổi lại các điểm đã chấm — điểm cũ giữ nguyên con số và phải đọc theo thang tại thời điểm chấm.',
   false),

  ('hours_per_workday', 'global', to_jsonb(8), 'giờ',
   'Số giờ quy đổi một ngày công',
   'Căn cứ Bộ luật Lao động 2019 Điều 105. Khảo sát Xưởng để trống hình thức chấm công nên CHƯA loại trừ được ca 12 giờ. Khớp HOURS_PER_WORKDAY ở shared/src/ns.ts.',
   false),

  -- (b) chưa có dữ liệu thật — cố ý để rỗng
  ('internal_rental_price', 'global', NULL, 'đồng/ngày',
   'Giá thuê giàn giáo nội bộ giữa các pháp nhân NVG',
   'PRD v1.4 SX-21: việc GHI NHẬN là bắt buộc, mức giá do Ban Giám đốc quyết. Chưa có quyết định — không được đoán.',
   false),

  ('compensation_price_table', 'global', NULL, 'đồng',
   'Bảng giá bồi thường giàn giáo thiếu – hỏng theo mã sản phẩm',
   'PRD v1.4 SX-19. Khởi tạo tạm khi Ban Giám đốc ban hành bảng chính thức; quản trị viên sửa sau.',
   false),

  ('defect_rate_threshold', 'global', NULL, 'tỷ lệ',
   'Ngưỡng tỷ lệ lỗi sản xuất cho phép',
   'PRD v1.4 SX-12: biến động theo nhóm sản phẩm, giai đoạn hoặc lô. Khảo sát xác định chưa có số liệu chuẩn.',
   false),

  ('min_samples_for_metric', 'global', NULL, 'bản ghi',
   'Số bản ghi tối thiểu để hiện chỉ số thay vì "Chưa đủ dữ liệu"',
   'Backend Schema v1.1 Mục 5: ngưỡng này chưa được xác định, cố ý để rỗng thay vì hard-code trong truy vấn báo cáo.',
   false)
ON CONFLICT ON CONSTRAINT system_parameters_key_scope DO NOTHING;
