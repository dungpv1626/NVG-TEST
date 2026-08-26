/*
 * Module KHO — phần chuẩn bị cho ba bản vá ở `0041`.
 *
 * Tách riêng vì `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới đó không nằm chung một
 * giao dịch được: Postgres từ chối với lỗi "unsafe use of new value of enum type". Drizzle bọc
 * mỗi tệp migration trong một giao dịch, nên hàm dùng `'khop_so'` phải sang tệp sau.
 */


-- ----------------------------------------------------------------------------
-- 1. Đóng đợt kiểm kê khi số đếm khớp sổ
-- ----------------------------------------------------------------------------
/*
 * Trước bản vá này, một đợt kiểm kê đếm ra ĐÚNG BẰNG SỔ là một ngõ cụt:
 *
 *  - Nút "Trình phê duyệt" bị khoá khi không có chênh lệch, và `submit_stocktake_approval`
 *    cũng từ chối — đúng, vì không có gì để điều chỉnh.
 *  - Nhưng không có hàm nào đưa đợt kiểm ra khỏi trạng thái `dang_kiem`, mà `status` thì bị
 *    trigger `stocktakes_status_guard` chặn không cho UPDATE thẳng.
 *  - Trong khi đó `warehouse_stocktake_open` tạm dừng MỌI nhập/xuất/điều chuyển của kho suốt
 *    thời gian còn `dang_kiem`.
 *
 * Kết quả: kiểm kê sạch — kết quả TỐT NHẤT có thể — lại khoá cứng kho, và lối thoát duy nhất
 * là "Hủy đợt", tức ghi một lần kiểm đúng vào sổ thành đã hủy. Lần kiểm kê sau mất luôn căn cứ
 * đối chiếu.
 *
 * Thêm trạng thái riêng `khop_so` thay vì mượn `da_dieu_chinh`: sổ kho KHÔNG hề đổi ở đây, và
 * hai việc đó phải phân biệt được khi đọc lại lịch sử kiểm kê.
 */
ALTER TYPE public.stocktake_status ADD VALUE IF NOT EXISTS 'khop_so';
-- Hàm `close_stocktake` dùng giá trị này nằm ở `0041` — xem chú thích đầu tệp.


-- ----------------------------------------------------------------------------
-- 2. Mức tồn tối thiểu và vị trí lưu — sửa được từ màn hình
-- ----------------------------------------------------------------------------
/*
 * `0039` thu hồi INSERT/UPDATE/DELETE trên `inventory_items` để sổ kho chỉ đổi qua phiếu — đúng
 * ý định, nhưng thu hồi quá tay: bảng này còn hai cột KHÔNG phải sổ kho.
 *
 *  - `min_quantity` là ngưỡng cảnh báo "sắp hết" (KHO-08).
 *  - `location` là vị trí để tìm hàng trong kho.
 *
 * Cả hai là dữ liệu mô tả do người dùng đặt, không phải số tồn. Không cấp lại quyền thì cảnh
 * báo sắp hết KHÔNG BAO GIỜ cấu hình được, và mọi lần lưu trả về lỗi `42501` khó hiểu.
 *
 * Cấp quyền THEO CỘT, không cấp cả bảng: `quantity_on_hand`/`average_cost` vẫn phải đi qua
 * phiếu. Trigger `inventory_items_quantity_guard` là lớp chặn thứ hai cho đúng ba cột đó.
 */
GRANT UPDATE (min_quantity, location, updated_at, updated_by)
  ON public.inventory_items TO authenticated;

CREATE POLICY inventory_items_update ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.rls_warehouse_writable(warehouse_id))
  WITH CHECK (public.rls_warehouse_writable(warehouse_id));

COMMENT ON POLICY inventory_items_update ON public.inventory_items IS
  'Chỉ sửa được mức tồn tối thiểu và vị trí; số tồn và giá vốn vẫn chỉ đổi qua phiếu (KHO-08).';
