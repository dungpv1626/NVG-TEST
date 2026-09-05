/**
 * Vai trò "Chỉ huy trưởng / Kỹ thuật hiện trường" (`CHT`).
 *
 * Nguồn: Webapp Flow v1.1 Mục 2.3, bổ sung sau phiếu khảo sát Chỉ huy – Giám sát công trường.
 * Bảng menu theo vai trò của v1.1 tách rõ hai dòng mà v1.0 gộp làm một:
 *   · "Chỉ huy trưởng / Kỹ thuật hiện trường" — công trình CỦA TÔI, nhật ký, bản vẽ, nghiệm thu
 *   · "Trưởng phòng Thi công" — TẤT CẢ công trình, Hộp thư Phê duyệt, báo cáo tiến độ – chi phí
 *
 * Vì sao việc tách này là điều kiện tiên quyết của mẫu phân quyền E:
 *
 *   Backend Schema v1.1 Mục 3.3 mô tả Mẫu E là "người dùng hiện trường chỉ xem/ghi được dữ liệu
 *   thuộc công trình mình được phân công; cấp quản lý xem được toàn bộ đơn vị mình phụ trách".
 *   Vai trò `TC` hiện có mang quyền `approve` trên chính phân hệ TC (0106 — chỉ huy trưởng xác
 *   nhận bảng công khối công trường), nên nếu lấy `approve` làm dấu hiệu "cấp quản lý" thì MỌI
 *   người dùng công trường đều được miễn trừ và Mẫu E không áp được lên ai.
 *
 *   Cấu hình phân quyền khai ra mà không policy nào chạm tới còn tệ hơn không khai — nó tạo
 *   cảm giác đã phân quyền (CLAUDE.md 8.8 điểm 2). Nên hoặc tách vai trò, hoặc đừng dựng Mẫu E.
 *   Khảo sát mô tả đúng hai lớp (1 trưởng phòng + 2 nhân viên phòng, so với 3 chỉ huy trưởng +
 *   3 kỹ thuật hiện trường ở các công trình khác nhau), nên tách là đúng thực tế chứ không phải
 *   bịa ra một vai trò cho vừa cơ chế.
 *
 * `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới KHÔNG nằm chung một migration được —
 * phần dùng nằm ở 0115 (cùng cách đã làm cho vai trò `SX` ở 0105/0106).
 */

ALTER TYPE public.role_code ADD VALUE IF NOT EXISTS 'CHT';
