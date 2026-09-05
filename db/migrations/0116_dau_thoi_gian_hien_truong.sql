/**
 * Dấu thời gian hiện trường — Backend Schema v1.1 Mục 1.4 (quy ước MỚI ở v1.1).
 *
 * Nguyên văn: "Mọi bản ghi tạo từ thiết bị di động có thêm `client_created_at` (thời điểm người
 * dùng thao tác trên máy), `synced_at` (thời điểm về máy chủ) và `client_generated_id` (chống
 * trùng khi đồng bộ lại) — bắt buộc cho Kho, Xưởng và Công trường (TC-07, KHO-09)."
 *
 * ## Ba cột này trả lời ba câu hỏi khác nhau, đừng gộp
 *
 *   `created_at`        — máy chủ ghi lúc nào. Đã có sẵn ở mọi bảng.
 *   `client_created_at` — người dùng BẤM lúc nào. Đây mới là thời điểm nghiệp vụ: một nhật ký
 *                         ghi lúc 16 giờ ngoài công trường mất sóng, đồng bộ lúc 21 giờ khi về
 *                         tới nhà, thì đó là nhật ký của 16 giờ. Lấy `created_at` làm mốc sẽ
 *                         đẩy bản ghi sang khung giờ sai và, nếu qua nửa đêm, sang cả ngày sai.
 *   `synced_at`         — về tới máy chủ lúc nào. Chênh lệch giữa hai mốc là thứ duy nhất cho
 *                         biết một công trường đang mất sóng bao lâu.
 *
 * ## Vì sao KHÔNG kèm cơ chế đồng bộ trong migration này
 *
 * `POST /api/sync/batch` (Backend Schema v1.1 Mục 4.1) và hàng đợi ngoại tuyến thật (Dexie /
 * IndexedDB) chưa nằm trong đợt này — repo hiện chưa có thư viện lưu trữ phía trình duyệt nào.
 * Nhưng ba cột phải có TRƯỚC: thêm cột vào bảng đã có dữ liệu thật thì mọi bản ghi cũ mang giá
 * trị rỗng vĩnh viễn, và không có cách nào dựng lại thời điểm người dùng đã bấm.
 *
 * Cột rỗng ở đây KHÔNG phải cấu hình chết: `client_created_at` rỗng có nghĩa xác định là "bản
 * ghi nhập trực tiếp khi có mạng", và nơi đọc dùng `coalesce(client_created_at, created_at)`.
 */

-- ----------------------------------------------------------------------------
-- 1. Nhật ký công trường (TC-05, TC-07)
-- ----------------------------------------------------------------------------

ALTER TABLE public.site_logs
  ADD COLUMN IF NOT EXISTS client_created_at  timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at          timestamptz,
  ADD COLUMN IF NOT EXISTS client_generated_id varchar(64);

COMMENT ON COLUMN public.site_logs.client_created_at IS
  'Thời điểm người dùng thao tác trên thiết bị. Rỗng = nhập trực tiếp khi có mạng; nơi đọc dùng coalesce(client_created_at, created_at).';
COMMENT ON COLUMN public.site_logs.synced_at IS
  'Thời điểm bản ghi về tới máy chủ. Chênh với client_created_at cho biết công trường mất sóng bao lâu.';

-- Cùng khuôn khử trùng đã dùng cho `stock_movements` (0038): unique một phần, bỏ qua dòng rỗng.
-- Không phát minh cơ chế thứ hai — hai cơ chế khử trùng khác nhau trong cùng một hệ thống là
-- hai bộ luật để đối chiếu khi có sự cố.
CREATE UNIQUE INDEX site_logs_client_id
  ON public.site_logs (client_generated_id)
  WHERE client_generated_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. Phiếu kho (KHO-09) — đã có `client_generated_id` từ 0038, thiếu hai mốc thời gian
-- ----------------------------------------------------------------------------

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at         timestamptz;

COMMENT ON COLUMN public.stock_movements.client_created_at IS
  'Thời điểm thủ kho bấm trên thiết bị. Rỗng = nhập trực tiếp khi có mạng.';


-- ----------------------------------------------------------------------------
-- 3. Đếm kiểm kê (KHO-07) — thao tác quét mã tại kho, cùng nhóm nghiệp vụ hiện trường
-- ----------------------------------------------------------------------------

ALTER TABLE public.stocktake_items
  ADD COLUMN IF NOT EXISTS client_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS synced_at         timestamptz;


-- ----------------------------------------------------------------------------
-- 4. Máy chủ đặt `synced_at` MỘT LẦN, không nhận từ trình duyệt
--
-- `client_created_at` thì phải nhận từ thiết bị — chỉ thiết bị biết người dùng bấm lúc nào.
-- Nhưng `synced_at` là quan sát của máy chủ về chính nó; nhận giá trị này từ lệnh gửi lên thì
-- một bản ghi có thể khai đã đồng bộ trước khi được tạo, và phép trừ hai mốc để đo thời gian
-- mất sóng thành vô nghĩa.
--
-- ⚠️ CHỈ đặt lúc TẠO, giữ nguyên khi SỬA. `synced_at` trả lời "bản ghi này VỀ TỚI máy chủ lúc
-- nào" — một sự kiện xảy ra ĐÚNG MỘT LẦN. Đặt lại ở mọi UPDATE (bản đầu tiên của trigger này)
-- là lỗi thật: TC-08 cho sửa nhật ký trong 24 giờ (`site_logs_edit_window`, 0035), và
-- `save_stocktake_count` cho ghi đè `counted_quantity` nhiều lần trong lúc còn đang kiểm kê
-- (0039) — cả hai đều là UPDATE hợp lệ, thường xuyên. Đặt lại `synced_at` ở đó xoá mất đúng
-- con số nó sinh ra để đo: khoảng cách từ lúc ghi tới lúc về tới máy chủ LẦN ĐẦU.
--
-- `client_created_at` cũng không được nằm ở TƯƠNG LAI: đồng hồ thiết bị lệch là chuyện thường
-- ngoài công trường, và một nhật ký đề ngày mai sẽ lọt vào báo cáo của kỳ chưa tới. Cho phép
-- lệch 5 phút để không chặn oan thiết bị lệch nhẹ, quá thì kẹp về thời điểm máy chủ nhận.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stamp_field_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.synced_at := now();
  ELSE
    NEW.synced_at := OLD.synced_at;
  END IF;

  IF NEW.client_created_at IS NOT NULL AND NEW.client_created_at > now() + interval '5 minutes' THEN
    NEW.client_created_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_field_sync() IS
  'Máy chủ đặt synced_at đúng MỘT LẦN lúc tạo (giữ nguyên khi sửa) và kẹp client_created_at lệch về tương lai (Backend Schema v1.1 1.4).';

CREATE TRIGGER site_logs_stamp_sync
  BEFORE INSERT OR UPDATE ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_field_sync();

CREATE TRIGGER stock_movements_stamp_sync
  BEFORE INSERT OR UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_field_sync();

CREATE TRIGGER stocktake_items_stamp_sync
  BEFORE INSERT OR UPDATE ON public.stocktake_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_field_sync();

-- Mã khử trùng và thời điểm người dùng bấm là ĐỊNH DANH của thao tác, không sửa được sau khi
-- ghi — cùng lý do `client_generated_id` của `stock_movements` đã bị khoá ở 0039, và cùng lý
-- do `logged_by` đã bị khoá ở 0035: đây là fact về QUÁ KHỨ, sửa được thì mất giá trị truy vết.
DROP TRIGGER IF EXISTS site_logs_freeze_identity ON public.site_logs;
CREATE TRIGGER site_logs_freeze_identity
  BEFORE UPDATE ON public.site_logs
  FOR EACH ROW EXECUTE FUNCTION public.freeze_record_identity(
    'company_id', 'construction_site_id', 'logged_by',
    'client_generated_id', 'client_created_at'
  );
