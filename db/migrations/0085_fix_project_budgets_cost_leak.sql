-- ============================================================================
-- Rà soát code review (workers/ + db/, /code-review high) phát hiện lỗ rò giá vốn còn sót
-- lại ở CHÍNH bảng gốc `project_budgets` (DA-09), dù bốn migration 0068/0069/0071/0073 đã
-- vá kỹ ba RPC báo cáo đọc từ bảng này (construction_budget_status, sites_budget_status).
--
-- `project_budgets_select` (0021_da_rls.sql) chỉ chặn dòng `cost_group = 'loi_nhuan'` bằng
-- `rls_sees_sensitive('profit')` — mọi dòng chi phí khác (vật tư, nhân công, máy móc, thầu
-- phụ...) không có điều kiện `rls_sees_sensitive('cost')` nào cả. Vai trò KHÔNG nằm trong
-- danh sách được xem giá vốn (CLAUDE.md 6.6: "TGĐ/CFO/BGĐ/Admin + DA_DT, TKE, MH"), ví dụ NS
-- hay CRM, vẫn đọc được nguyên vẹn `budgeted_amount/actual_amount/committed_amount` bằng
-- cách gọi thẳng PostgREST (`GET /rest/v1/project_budgets?select=...`), bỏ qua toàn bộ ba
-- RPC đã được vá.
--
-- Vá: thêm điều kiện `rls_sees_sensitive('cost') OR auth_can_edit_module('TC')` cho các dòng
-- không phải lợi nhuận — đúng quy tắc mà 0071/0073 đã dùng cho hai RPC báo cáo (chỉ huy công
-- trường cần theo dõi ngân sách công trình mình quản lý dù không nằm trong danh sách cost-
-- sighted chính thức). Không đổi `project_budgets_update`: chính sách đó đã hẹp bằng
-- `auth_can_edit_module('DA')`, phạm vi khác và không nằm trong lỗi được xác nhận lần này.
-- ============================================================================

DROP POLICY IF EXISTS project_budgets_select ON public.project_budgets;

CREATE POLICY project_budgets_select ON public.project_budgets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.rls_company_access(company_id)
    AND (
      (cost_group = 'loi_nhuan' AND public.rls_sees_sensitive('profit'))
      OR (cost_group <> 'loi_nhuan'
          AND (public.rls_sees_sensitive('cost') OR public.auth_can_edit_module('TC')))
    )
  );
