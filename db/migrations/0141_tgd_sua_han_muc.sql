-- ============================================================================
-- Hạn mức phê duyệt và thời hạn xử lý: CHỈ Tổng Giám đốc (và Quản trị viên) sửa được.
--
-- Haan 30/09/2026: «đồng ý, chỉ TGĐ» — Tổng Giám đốc tự sửa, không phải nhờ Quản trị viên; Giám
-- đốc Tài chính và các thành viên Ban Giám đốc khác KHÔNG sửa.
--
--   approval_limits  trước: chỉ ADMIN ghi       → nay: ADMIN, TGD
--   sla_definitions  trước: TGD, CFO, BGD, ADMIN → nay: ADMIN, TGD (thu lại CFO, BGD)
--
-- Hạn mức là cấu hình quyền lực nhất hệ thống (ai được duyệt bao nhiêu tiền), nên không mở rộng
-- hơn yêu cầu. Người sửa cuối và thời điểm ghi ở `updated_by`/`updated_at` (trigger
-- `audit_touch`, trình duyệt không khai hộ được). Quyền ĐỌC giữ nguyên.
--
-- Giao diện mở đúng hai màn hình này cho TGĐ (`useManagesApprovalRules`, web/src/components/
-- layout/module-nav.ts); các màn hình Quản trị khác vẫn chỉ Quản trị viên.
-- ============================================================================

DROP POLICY IF EXISTS approval_limits_admin_write ON public.approval_limits;
CREATE POLICY approval_limits_admin_write ON public.approval_limits
  FOR ALL TO authenticated
  USING (public.auth_has_role('ADMIN', 'TGD'))
  WITH CHECK (public.auth_has_role('ADMIN', 'TGD'));

DROP POLICY IF EXISTS sla_definitions_insert ON public.sla_definitions;
CREATE POLICY sla_definitions_insert ON public.sla_definitions
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role('ADMIN', 'TGD'));

DROP POLICY IF EXISTS sla_definitions_update ON public.sla_definitions;
CREATE POLICY sla_definitions_update ON public.sla_definitions
  FOR UPDATE TO authenticated
  USING (public.auth_has_role('ADMIN', 'TGD'))
  WITH CHECK (public.auth_has_role('ADMIN', 'TGD'));
