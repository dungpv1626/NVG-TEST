/**
 * Thêm vai trò "Xưởng sản xuất" (`SX`) — nguồn: khảo sát Xưởng sản xuất giàn giáo, 02/09/2026.
 *
 * Vì sao phải có vai trò riêng chứ không dùng lại vai trò Kho:
 *
 *   Phiếu khảo sát ghi rõ Xưởng là một ĐƠN VỊ có bộ máy riêng — "1 Phó giám đốc, 1 admin,
 *   4 nhân viên kinh doanh, 1 nhân viên kho, 1 tổ trưởng sản xuất, 10 công nhân cơ khí" — và
 *   người đứng đầu đơn vị đó tự ký ba thứ mà Kho không ký:
 *     · lệnh sản xuất ("Phó Giám đốc/Ban Giám đốc" duyệt phiếu/lệnh sản xuất),
 *     · bảng chấm công khối xưởng ("người phụ trách xưởng chốt bảng công và sản lượng,
 *       Phó Giám đốc xác nhận, sau đó chuyển HCNS/Kế toán" — NS-04),
 *     · đề nghị mua/cấp nguyên vật liệu phục vụ sản xuất.
 *
 *   Trước khi có khảo sát, quyền `SX: WORK` được tạm gán cho vai trò Kho (BUILD_PLAN 3F,
 *   giả định số 21). Giả định đó nay SAI: Kho làm chứng từ nhập – xuất – tồn, Kinh doanh
 *   đứng tên hợp đồng cho thuê, Xưởng điều hành sản xuất. Ba việc khác nhau, ba vai trò.
 *
 * `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới KHÔNG nằm chung một migration được
 * (Postgres chưa nhìn thấy giá trị mới trong cùng giao dịch) — phần dùng nằm ở 0106.
 */

ALTER TYPE public.role_code ADD VALUE IF NOT EXISTS 'SX';
