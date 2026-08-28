-- ============================================================================
-- Sửa hồi quy do chính 0068 gây ra: construction_budget_status khoá QUÁ TAY.
--
-- 0068 gọi rls_sees_sensitive('cost') cho MỌI dòng (kể cả các dòng không phải lợi nhuận) để
-- bịt việc vai trò NS (chỉ có TC: VIEW, cấp để xác nhận chấm công công trường — không phải để
-- xem tiền) đọc được toàn bộ ngân sách công trình. Nhưng rls_sees_sensitive('cost') KHÔNG có
-- vai trò TC trong danh sách (chỉ TGD/CFO/BGD/ADMIN/DA_DT/TKE/MH) — nên bản vá đó VÔ TÌNH khoá
-- luôn chính chỉ huy trưởng công trình, người có `TC: WORK_APPROVE` (sửa được module TC) và
-- đúng ra phải theo dõi được ngân sách công trình MÌNH quản lý (TC-05: "cảnh báo sớm vượt
-- ngân sách" là cho chính người quản lý công trình biết, không chỉ cho Ban Giám đốc/Tài
-- chính). `golden-path.test.ts` đã có sẵn một dòng chú thích xác nhận đúng ý đồ gốc này —
-- "TC-05: chỉ huy trưởng theo được ngân sách của công trình mình — nhưng KHÔNG thấy dòng lợi
-- nhuận mục tiêu" — và test đó đỏ ngay sau khi 0068 chạy, phát hiện lỗi này.
--
-- Sửa: dòng chi phí (không phải lợi nhuận) hiện cho AI SỬA ĐƯỢC module TC (chính là người
-- quản lý công trình) HOẶC vai trò nằm trong danh sách xem giá vốn — không còn đòi hỏi cả hai.
-- NS vẫn bị chặn đúng như 0068 định làm (chỉ có quyền XEM, không có quyền SỬA module TC, và
-- không nằm trong danh sách giá vốn). Dòng lợi nhuận giữ nguyên yêu cầu riêng.
--
-- ⚠️ Chưa quyết: có nên ghi sensitive_access_logs cho MỖI lần chỉ huy trưởng mở tab ngân sách
-- công trình mình không (NEN-07 đọc theo chữ là "mọi lượt xem cột nhạy cảm"). Đang CỐ Ý giữ
-- log chỉ bắn khi rls_sees_sensitive('cost') đúng (như trước), nghĩa là KHÔNG log lượt xem
-- thường ngày của chỉ huy trưởng với đúng công trình mình — coi đó là thao tác vận hành bình
-- thường, không phải truy cập cần giám sát. Ghi log mọi lượt xem sẽ làm bảng phình rất nhanh
-- vì đây là tab họ mở nhiều lần mỗi ngày. Cần Haan xác nhận cách đọc nào đúng nếu thấy quan
-- trọng.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.construction_budget_status(p_site_id uuid)
RETURNS TABLE (
  cost_group       cost_group,
  cost_code        text,
  name             text,
  budgeted_amount  bigint,
  actual_amount    bigint,
  committed_amount bigint,
  engaged_amount   bigint,
  remaining_amount bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF public.rls_sees_sensitive('cost') THEN
    SELECT s.company_id INTO v_company_id FROM public.construction_sites s WHERE s.id = p_site_id;
    PERFORM public.log_sensitive_access('cost', 'construction_sites', p_site_id, 'view', v_company_id);
  END IF;

  RETURN QUERY
  SELECT b.cost_group,
         b.cost_code::text,
         b.name,
         b.budgeted_amount,
         b.actual_amount,
         b.committed_amount,
         b.actual_amount + b.committed_amount            AS engaged_amount,
         b.budgeted_amount - b.actual_amount - b.committed_amount AS remaining_amount
    FROM public.project_budgets b
   WHERE b.construction_site_id = p_site_id
     AND b.deleted_at IS NULL
     AND public.rls_site_readable(p_site_id)
     AND (public.auth_can_edit_module('TC') OR public.rls_sees_sensitive('cost'))
     AND (b.cost_group <> 'loi_nhuan' OR public.rls_sees_sensitive('profit'))
   ORDER BY b.cost_group, b.cost_code;
END;
$$;

COMMENT ON FUNCTION public.construction_budget_status(uuid) IS
  'Ngân sách công trình so với chi phí đã phát sinh và đã cam kết, theo từng mã chi phí (TC-05). Chỉ huy trưởng (sửa được module TC) và vai trò xem giá vốn đều thấy các dòng chi phí; riêng dòng lợi nhuận cần thêm quyền xem lợi nhuận. Ghi sensitive_access_logs (0068/0069).';
