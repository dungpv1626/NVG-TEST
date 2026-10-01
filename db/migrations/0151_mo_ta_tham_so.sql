-- ============================================================================
-- Mô tả tham số hệ thống viết cho người dùng NVG đọc.
--
-- Màn hình Tham số hệ thống hiện thẳng cột `description`, mà cột đó đang chứa ghi chú của đội
-- triển khai: tên hằng số và đường dẫn mã nguồn («Khớp BUDGET_WARNING_THRESHOLD ở
-- shared/src/tc.ts»), tên tệp migration, chữ IN HOA để nhấn mạnh (CGD 4). Thấy khi chụp hướng
-- dẫn Quản trị hệ thống (01/10/2026). Nội dung giữ nguyên ý: tham số nào là mức tạm, tham số
-- nào chờ Ban Giám đốc quyết. Ghi chú kỹ thuật vẫn ở migration `0111`, `0112`.
--
-- Chỉ đổi `description` — trigger lịch sử bỏ qua lần sửa không đổi giá trị.
-- ============================================================================

UPDATE public.system_parameters AS p
   SET description = v.description
  FROM (VALUES
    ('budget_warning_threshold',
     'Công trình đã chi tới tỷ lệ này của ngân sách thì hiện cảnh báo «Sắp vượt». Mức tạm do đội triển khai đề xuất, chờ Nhà Việt Group xác nhận.'),
    ('compensation_price_table',
     'Giá bồi thường giàn giáo thiếu hoặc hỏng theo từng mã sản phẩm (SX-19). Chờ Ban Giám đốc ban hành bảng giá chính thức.'),
    ('crew_rating_scale_max',
     'Thang điểm đánh giá chất lượng tổ đội. Đổi thang không quy đổi lại điểm đã chấm: điểm cũ đọc theo thang tại thời điểm chấm. Mức tạm do đội triển khai đề xuất.'),
    ('defect_rate_threshold',
     'Tỷ lệ lỗi sản xuất vượt mức này thì hiện cảnh báo (SX-12). Mức thay đổi theo nhóm sản phẩm, giai đoạn hoặc lô; Nhà Việt Group chưa có số liệu chuẩn.'),
    ('hours_per_workday',
     'Quy đổi giờ làm thành ngày công khi chấm công (Bộ luật Lao động 2019, Điều 105). Chưa tách riêng ca 12 giờ ở xưởng.'),
    ('internal_rental_price',
     'Giá thuê giàn giáo khi các pháp nhân trong NVG thuê của nhau (SX-21). Giao dịch nội bộ luôn được ghi nhận; mức giá do Ban Giám đốc quyết, hiện chưa có quyết định.'),
    ('min_samples_for_metric',
     'Số bản ghi tối thiểu trước khi báo cáo hiện một chỉ số; ít hơn thì hiện «Chưa đủ dữ liệu». Chưa xác định.'),
    ('request_nudge_min_interval_hours',
     'Khoảng cách tối thiểu giữa hai lần «Thúc» cùng một đề nghị, tính theo đề nghị chứ không theo người. Để trống hoặc 0 là không giới hạn. Mức tạm do đội triển khai đề xuất.'),
    ('site_log_edit_window_hours',
     'Nhật ký công trường sửa được trong chừng ấy giờ kể từ lúc ghi, và chỉ bởi chính người ghi. Mức tạm do đội triển khai đề xuất.')
  ) AS v(param_key, description)
 WHERE p.param_key = v.param_key
   AND p.scope_type = 'global';
