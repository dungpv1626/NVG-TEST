/**
 * Trạng thái thứ SÁU — `disputed` ("Tranh chấp").
 *
 * Nguồn: Content Guidelines v1.2 Mục 5.1 và 6.3, Backend Schema v1.1 Mục 1.4, PRD v1.4 SX-19.
 * Cả ba tài liệu được cập nhật sau khi có phiếu khảo sát Xưởng sản xuất giàn giáo.
 *
 * Vì sao phải là một NHÓM CHUẨN chứ không phải trạng thái con của module SX:
 *
 *   Năm nhóm cũ đều mô tả hồ sơ đang ĐI TỚI đâu (nháp → chờ duyệt → đang xử lý → hoàn thành,
 *   hoặc lệch nhịp thành quá hạn). "Tranh chấp" không nằm trên trục đó: nó nói rằng số liệu
 *   gốc đã bị KHOÁ. Khi hai bên chưa thống nhất số giàn giáo thiếu hoặc hỏng, biên bản, ảnh
 *   và số lượng phải giữ nguyên; muốn đổi thì lập chứng từ điều chỉnh mới có người duyệt
 *   (Backend Schema v1.1 Mục 3.5). Quy nó về "đang xử lý" thì mất đúng cái thông tin khiến
 *   người dùng phải dừng tay, và về "quá hạn" thì sai — quá hạn là lỗi tiến độ, tranh chấp
 *   là bất đồng số liệu, hai việc cần hai cách xử lý khác nhau.
 *
 *   Nó cũng không thể là trạng thái riêng của SX: cùng một vụ tranh chấp sẽ hiện đồng thời ở
 *   biên bản thu hồi (SX), công nợ phải thu (KT) và hồ sơ khách hàng (CRM). Trạng thái con của
 *   một module không hiển thị được ở hai module kia.
 *
 * `ALTER TYPE ... ADD VALUE` và việc DÙNG giá trị mới KHÔNG nằm chung một migration được —
 * Postgres chưa nhìn thấy giá trị mới trong cùng giao dịch (đã gặp ở 0105/0106). Migration này
 * CỐ Ý chỉ khai giá trị; nơi dùng thật sẽ đến cùng bảng thu hồi và bồi thường giàn giáo (SX-18,
 * SX-19) ở đợt sau.
 */

ALTER TYPE public.status_group ADD VALUE IF NOT EXISTS 'disputed';

COMMENT ON TYPE public.status_group IS
  'Sáu nhóm trạng thái chuẩn dùng chung toàn hệ thống (Content Guidelines v1.2 Mục 5.1). '
  'Trạng thái riêng của từng module phải quy về đúng một trong sáu giá trị này khi hiển thị; '
  'KHÔNG thêm giá trị thứ bảy mà không sửa Content Guidelines trước.';
