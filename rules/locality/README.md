# Gói quy tắc địa phương

Thư mục này **hiện chưa có gói nào**, và đó là trạng thái đúng chứ không phải chỗ bỏ dở:
NVG chưa nhận được văn bản quy hoạch riêng của tỉnh nào. Mọi giá trị đang dùng đều lấy từ
**QCVN 01:2021/BXD** — quy chuẩn quốc gia — nên chúng nằm ở `rules/base/`.

Một gói địa phương chỉ nên ra đời khi có **văn bản cụ thể** để trích dẫn vào khoá `source`.
Tạo một gói chép lại đúng số của quy chuẩn quốc gia là tạo bản sao thứ hai của cùng một
con số: sửa quy chuẩn ở gói nền thì gói chép vẫn giữ số cũ, và không có gì báo.

## Thêm một tỉnh

1. Tạo `rules/locality/<tên-tỉnh-gạch-nối>/00-meta.yaml`:

   ```yaml
   pack:
     id: hung-yen
     version: '2026.09.1'
     locality: hung_yen # khớp giá trị `locality` của đầu bài (gạch DƯỚI)
     extends: base
     description: 'Khoảng lùi theo Quyết định số … của UBND tỉnh Hưng Yên.'
   ```

2. Thêm tệp quy tắc, **chỉ ghi những `id` thật sự khác gói nền**. Ghi đè theo `id`, nên
   `id` phải trùng nguyên văn với quy tắc ở `rules/base/` mới thay được nó.

3. Khai vào `LOCALITY_FILES` (`workers/src/design/program/rule-pack-data.ts`) — Worker
   không có hệ tệp lúc chạy nên không duyệt thư mục được. Container thì đọc thẳng đĩa,
   không cần khai.

Tên thư mục dùng **gạch nối**, giá trị `locality` trong đầu bài dùng **gạch dưới**
(`hung_yen` → `hung-yen`). Danh sách tỉnh chọn được nằm ở
`shared/src/design/brief-form.json`, mục `locality` — 34 đơn vị hành chính sau sắp xếp
năm 2025. Tỉnh có mặt trong danh sách nhưng chưa có gói ở đây là chuyện **bình thường**:
engine chạy trên gói nền và ghi lại điều đó trong `params.rule_pack_locality`.
