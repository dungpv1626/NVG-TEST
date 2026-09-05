/**
 * Mẫu phân quyền E — phạm vi hiện trường (Backend Schema v1.1 Mục 3.3, MỚI ở v1.1).
 *
 * Nguyên văn: "Người dùng hiện trường chỉ xem/ghi được dữ liệu thuộc công trình hoặc xưởng
 * mình được phân công (đối chiếu `user_site_assignments`); cấp quản lý (Trưởng phòng Thi công,
 * Phó Giám đốc NVS) xem được toàn bộ đơn vị mình phụ trách."
 *
 * ## Vì sao dấu hiệu "cấp quản lý" KHÔNG phải quyền `approve`
 *
 * Đó là cách đọc đầu tiên, và nó SAI. Khảo sát Chỉ huy – Giám sát công trường nói rõ chính chỉ
 * huy trưởng là người xác nhận bảng chấm công khối công trường (đã cài ở 0106), nên chỉ huy
 * trưởng CÓ quyền `approve` trên phân hệ TC. Lấy `approve` làm dấu hiệu quản lý thì đúng người
 * cần giới hạn lại được miễn trừ, và Mẫu E không áp lên ai — cấu hình chạy không sai nhưng
 * không làm gì, kiểu hỏng khó thấy nhất.
 *
 * Webapp Flow v1.1 Mục 2.3 phân biệt hai vai trò bằng PHẠM VI, không bằng quyền:
 *   · Chỉ huy trưởng / Kỹ thuật hiện trường → "Công trình CỦA TÔI"
 *   · Trưởng phòng Thi công                → "TẤT CẢ công trình"
 *
 * Nên phạm vi được khai thành một thuộc tính của vai trò: `roles.site_scoped`. Đọc được ngay
 * từ bảng vai trò, không phải suy từ tổ hợp quyền.
 *
 * ## Vì sao KHÔNG thu hẹp bằng "có bản ghi phân công thì mới bị giới hạn"
 *
 * Cách đó nghe tiện (chưa phân công thì chưa ảnh hưởng ai) nhưng chạy ngược chiều an toàn:
 * một chỉ huy trưởng mới, chưa được phân công công trình nào, sẽ thấy TOÀN BỘ công trình của
 * pháp nhân. Quên phân công phải dẫn tới thấy ÍT đi, không phải thấy nhiều hơn.
 */

-- ----------------------------------------------------------------------------
-- 1. Vai trò nào bị giới hạn theo phạm vi hiện trường
-- ----------------------------------------------------------------------------

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS site_scoped boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.roles.site_scoped IS
  'Vai trò làm việc tại MỘT công trình/xưởng cụ thể: chỉ thấy nơi mình được phân công (mẫu RLS E, Backend Schema v1.1 3.3).';

/**
 * KHÔNG ghi dòng `roles` của `CHT` bằng SQL trực tiếp ở đây.
 *
 * Postgres cấm dùng một giá trị enum mới (`ALTER TYPE ... ADD VALUE`, migration 0114) trong
 * CÙNG giao dịch đã thêm nó — kể cả khi việc thêm và việc dùng nằm ở hai FILE migration khác
 * nhau: `drizzle-orm/pg-core` chạy toàn bộ các migration đang chờ trong MỘT transaction duy
 * nhất (`session.transaction` bọc ngoài vòng lặp migration trong `dialect.ts`), không phải mỗi
 * file một giao dịch riêng. `UPDATE ... WHERE code = 'CHT'` và `INSERT ... VALUES ('CHT', …)`
 * so khớp trực tiếp với cột `roles.code role_code` — đúng thứ Postgres từ chối, và đã từng
 * chặn migration thật với lỗi "unsafe use of new value "CHT" of enum type role_code" (rà
 * soát trước commit, 05/09/2026).
 *
 * Tiền lệ 0105/0106 (vai trò `SX`) tưởng như làm y hệt nhưng KHÔNG dính lỗi này: 0106 chỉ gọi
 * `auth_can_edit_module('SX')`/`auth_can_view_module('SX')` — tham số của hai hàm đó là
 * `text`, so khớp với `permissions.module_code varchar(8)`, không phải cột kiểu `role_code`.
 * 0106 không có dòng nào ghi bảng `roles` bằng SQL — dòng vai trò `SX` được tạo bởi
 * `npm run db:seed` (`db/src/seed/data.ts`), chạy ở MỘT TIẾN TRÌNH KHÁC, sau khi
 * `npm run db:migrate` đã COMMIT giá trị enum mới.
 *
 * Dòng `CHT` trong `db/src/seed/data.ts` (`ROLE_SEED`, `siteScoped: true`) đã sẵn có — chạy
 * `npm run db:seed` SAU migration này để tạo/đồng bộ dòng vai trò, đúng cách `SX` đã làm.
 */


-- ----------------------------------------------------------------------------
-- 2. Phân công người dùng vào công trình
-- ----------------------------------------------------------------------------

CREATE TABLE public.user_site_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  construction_site_id uuid NOT NULL REFERENCES public.construction_sites(id) ON DELETE CASCADE,
  /** Vai trò tại công trình này (chỉ huy trưởng, kỹ thuật hiện trường, an toàn…). Mô tả, không phân quyền. */
  site_role   varchar(48),
  assigned_from date NOT NULL DEFAULT current_date,
  assigned_to   date,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX user_site_assignments_unique
  ON public.user_site_assignments (user_id, construction_site_id)
  WHERE deleted_at IS NULL;

CREATE INDEX user_site_assignments_site_idx
  ON public.user_site_assignments (construction_site_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.user_site_assignments IS
  'Phân công người dùng vào công trình — cơ sở của mẫu phân quyền E (Backend Schema v1.1 3.3).';

SELECT public.attach_audit_touch('public.user_site_assignments');

CREATE TRIGGER user_site_assignments_freeze_identity
  BEFORE UPDATE ON public.user_site_assignments
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity('user_id', 'construction_site_id');


-- ----------------------------------------------------------------------------
-- 3. Vị từ phạm vi
--
-- Một người có thể giữ NHIỀU vai trò trong cùng một pháp nhân (NEN-02, mở rộng ở PRD v1.4 cho
-- nhân sự NVS vừa làm kinh doanh vừa xử lý nghiệp vụ kho). Quy tắc hợp nhất: chỉ bị giới hạn
-- khi MỌI vai trò cho phép vào phân hệ TC đều là vai trò hiện trường. Giữ thêm một vai trò
-- toàn đơn vị thì nhìn được toàn đơn vị — đúng cách các hàm quyền khác đang hợp nhất vai trò.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_is_site_scoped()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
           SELECT 1
           FROM public.user_companies uc
           JOIN public.permissions p ON p.role_id = uc.role_id AND p.module_code = 'TC' AND p.can_view
           WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
         )
     AND NOT EXISTS (
           SELECT 1
           FROM public.user_companies uc
           JOIN public.roles r ON r.id = uc.role_id
           JOIN public.permissions p ON p.role_id = uc.role_id AND p.module_code = 'TC' AND p.can_view
           WHERE uc.user_id = public.auth_user_id() AND uc.deleted_at IS NULL
             AND NOT r.site_scoped
         );
$$;

COMMENT ON FUNCTION public.auth_is_site_scoped() IS
  'Người dùng chỉ giữ vai trò hiện trường trên phân hệ TC — bị giới hạn theo công trình được phân công (mẫu E).';


CREATE OR REPLACE FUNCTION public.rls_site_in_scope(p_site_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Ban Giám đốc và Quản trị hệ thống nhìn xuyên pháp nhân, đương nhiên xuyên công trình.
    public.auth_sees_all_companies()
    OR NOT public.auth_is_site_scoped()
    OR EXISTS (
      SELECT 1 FROM public.user_site_assignments a
      WHERE a.construction_site_id = p_site_id
        AND a.user_id = public.auth_user_id()
        AND a.deleted_at IS NULL
        AND a.assigned_from <= current_date
        AND (a.assigned_to IS NULL OR a.assigned_to >= current_date)
    )
    -- Người được ghi là chịu trách nhiệm chính của công trình được coi như đã phân công.
    -- Không bắt nhập lại một dữ kiện đã có (PRD 2.3, "một nguồn dữ liệu duy nhất"): cột
    -- `responsible_user_id` từ trước tới nay chưa từng được dùng trong policy nào, nhưng nó
    -- đúng là câu trả lời cho "ai phụ trách công trình này".
    OR EXISTS (
      SELECT 1 FROM public.construction_sites s
      WHERE s.id = p_site_id AND s.responsible_user_id = public.auth_user_id()
    );
$$;

COMMENT ON FUNCTION public.rls_site_in_scope(uuid) IS
  'Mẫu E (Backend Schema v1.1 3.3): công trình có thuộc phạm vi phân công của người dùng không. Vai trò toàn đơn vị luôn đúng.';


-- ----------------------------------------------------------------------------
-- 4. Ghép vào hai vị từ sẵn có
--
-- Không sửa policy của từng bảng: năm bảng con của Module TC đều đi qua `rls_site_readable` /
-- `rls_site_writable` (0035), nên thêm điều kiện ở đây là áp cho cả năm cùng lúc và không có
-- bảng nào lệch. Các bảng Mẫu E khác trong Backend Schema v1.1 (site_photos, work_assignments,
-- rfis, safety_records, production_stage_logs, quality_inspections, scaffolding_returns) chưa
-- tồn tại; chúng gọi hai hàm này khi ra đời.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rls_site_readable(p_site_id uuid)
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
      AND public.rls_company_access(s.company_id)
      AND public.auth_can_view_module('TC')
  ) AND public.rls_site_in_scope(p_site_id);
$$;

CREATE OR REPLACE FUNCTION public.rls_site_writable(p_site_id uuid)
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
      AND public.rls_company_access(s.company_id)
      AND public.auth_can_edit_module('TC')
      -- Công trình đã kết thúc thì hồ sơ đóng lại: hết bảo hành rồi mà còn thêm được nhật
      -- ký và biên bản nghiệm thu thì con số quyết toán công trình không còn là con số cuối.
      AND s.stage <> 'hoan_thanh'
  ) AND public.rls_site_in_scope(p_site_id);
$$;

COMMENT ON FUNCTION public.rls_site_writable(uuid) IS
  'Công trình còn thao tác được không: đúng pháp nhân, có quyền sửa module TC, chưa kết thúc, VÀ nằm trong phạm vi phân công (mẫu E — 0115).';

/**
 * Bản thân bảng `construction_sites` cũng phải thu hẹp, không chỉ các bảng con.
 *
 * Nếu chỉ chặn nhật ký mà vẫn liệt kê đủ công trình thì chỉ huy trưởng vẫn đọc được tên, địa
 * chỉ, giai đoạn và tiến độ của mọi công trình — Mẫu E nói "dữ liệu thuộc công trình mình được
 * phân công", và danh sách công trình là dữ liệu đầu tiên trong số đó.
 */
DROP POLICY IF EXISTS construction_sites_select ON public.construction_sites;
CREATE POLICY construction_sites_select ON public.construction_sites
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    -- Nhánh Mua hàng GIỮ NGUYÊN từ 0037 mục 11: MH-01 bắt buộc đề nghị mua mang mã công
    -- trình, nên Mua hàng phải đọc được phần đầu hồ sơ công trình dù không có quyền phân hệ
    -- Thi công. `rls_site_in_scope` không đụng tới họ: hàm chỉ giới hạn người có quyền xem
    -- phân hệ TC và chỉ giữ vai trò hiện trường.
    AND (public.auth_can_view_module('TC') OR public.auth_can_view_module('MH'))
    AND public.rls_site_in_scope(id)
  );


-- ----------------------------------------------------------------------------
-- 5. Ai đọc, ai sửa bảng phân công
--
-- Người được phân công phải đọc được dòng của chính mình (nếu không thì họ không biết vì sao
-- danh sách công trình ngắn đi). Trưởng phòng Thi công và Quản trị hệ thống phân công.
-- ----------------------------------------------------------------------------

ALTER TABLE public.user_site_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.user_site_assignments FROM anon;
REVOKE DELETE ON public.user_site_assignments FROM authenticated;

CREATE POLICY user_site_assignments_select ON public.user_site_assignments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      user_id = public.auth_user_id()
      OR public.auth_sees_all_companies()
      OR (public.auth_can_view_module('TC') AND NOT public.auth_is_site_scoped())
    )
  );

CREATE POLICY user_site_assignments_insert ON public.user_site_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  );

CREATE POLICY user_site_assignments_update ON public.user_site_assignments
  FOR UPDATE TO authenticated
  USING (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  )
  WITH CHECK (
    public.auth_sees_all_companies()
    OR (public.auth_can_edit_module('TC') AND NOT public.auth_is_site_scoped())
  );
