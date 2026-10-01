-- ============================================================================
-- Tài khoản demo vai trò «Trưởng phòng Thi công» mang chức danh «Chỉ huy trưởng».
--
-- Thấy khi làm hướng dẫn Trưởng phòng Thi công (01/10/2026): lời chào trên Dashboard đọc chức
-- danh nên ra «Chào E» thay vì «Chào Trưởng phòng», và người xem buổi demo lẫn tài khoản này với
-- tài khoản Chỉ huy trưởng (Đỗ Văn K). Chỉ sửa đúng tài khoản seed, đúng giá trị cũ — tài khoản
-- người thật không bị đụng tới. Bộ nạp seed (`db/src/seed/data.ts`) đã sửa cùng lúc.
-- ============================================================================

UPDATE public.users
   SET job_title = 'Trưởng phòng Thi công',
       department = 'NVC — Phòng Thi công'
 WHERE email = 'congtruong.nvc@nhavietgroup.test'
   AND job_title = 'Chỉ huy trưởng';
