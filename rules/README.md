# Rule pack — quy tắc kiến trúc là DỮ LIỆU, không phải mã nguồn

Đặc tả: `doc/design/07-rule-pack.md`.

**Cấm hard-code một ngưỡng quy chuẩn nào trong mã nguồn.** 50–100 quy tắc không thể nằm
trong Python: kiến trúc sư không đọc được, không đề xuất được, và mỗi lần quy chuẩn địa
phương đổi lại phải triển khai lại hệ thống.

## Cấu trúc

```
rules/
  base/                 áp dụng mọi nơi — QCVN 01:2021/BXD + quy tắc công năng
  locality/
    thai-binh/          ghi đè theo địa phương: khoảng lùi, mật độ xây dựng
  messages.vi.yaml      mẫu câu thông báo cho người dùng, theo rule_id
```

`DesignBrief.locality` quyết định nạp gói nào. Gói địa phương **ghi đè** gói `base` theo
`rule_id`; quy tắc không có trong gói địa phương thì lấy từ `base`.

## Hai trường quan trọng nhất

### `source` — tách quy chuẩn pháp lý khỏi kinh nghiệm

| `source`                                 | `severity` cho phép | Ý nghĩa                                                     |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------- |
| `QCVN …` hoặc văn bản quy phạm pháp luật | `error`             | **Chặn phát hành.** Kiến trúc sư không được bỏ qua          |
| `kinh nghiệm NVG`                        | `warning`           | Cảnh báo. Kiến trúc sư được quyền bỏ qua, có ghi nhận lý do |

Không tách thì hệ thống hoặc **quá cứng** (kiến trúc sư bỏ dùng vì bị chặn bởi thứ không bắt
buộc), hoặc **quá lỏng** (mất giá trị kiểm soát pháp lý). Đây không phải chi tiết trang trí —
nó quyết định hệ thống có được dùng hay không.

**Cưỡng chế bằng trình kiểm tra** (`compute/src/design_compute/rules/validator.py`): quy tắc
ghi `source: "kinh nghiệm NVG"` mà đặt `severity: error` thì **từ chối nạp**; quy tắc dẫn văn
bản quy phạm pháp luật mà đặt `severity: warning` thì cảnh báo khi nạp.

### `applies_to` — phạm vi loại hình

Giá trị hợp lệ: `nha_pho`, `biet_thu`, `nha_vuon`. **Không có `nha_xuong`** — ngoài phạm vi.

Luật nhà phố không áp cho biệt thự. Không có trường này thì khi mở rộng loại hình phải viết
lại toàn bộ rule pack.

## Thêm quy tắc mới

1. Kiến trúc sư mô tả quy tắc bằng lời.
2. Lập trình viên ánh xạ sang vị từ sẵn có, hoặc báo cần vị từ mới.
3. Viết YAML, ghi rõ `source` và `applies_to`.
4. **Chạy bộ đo chất lượng** — quy tắc mới không được làm tụt tỉ lệ đạt ràng buộc.
5. Người có thẩm quyền duyệt gói → tăng số phiên bản.

Bước 4 là bắt buộc. Quy tắc trông hợp lý vẫn có thể làm nhiều phương án cũ thành vô nghiệm.

**Thêm vị từ mới là thay đổi mã nguồn; thêm quy tắc mới thì không.** Trước khi thêm vị từ,
kiểm tra đã diễn đạt được bằng vị từ sẵn có chưa — mỗi vị từ mới là thêm mã phải bảo trì và
thêm một cách mã hoá vào CP-SAT phải kiểm chứng.

## Trạng thái hiện tại

Gói `base` soạn từ **QCVN 01:2021/BXD**. Gói `thai-binh` để mỏng, dày lên khi kiến trúc sư
đọc và bổ sung.

⚠️ **Chưa có kiến trúc sư đọc và xác nhận** — xem vướng mắc V-3 ở `TIEN_DO_THIET_KE.html`.
Mọi quy tắc `source: "kinh nghiệm NVG"` dưới đây là **suy luận gián tiếp**, phải được xác
nhận trước khi coi là yêu cầu đã chốt.

⚠️ **Thái Bình đã sáp nhập vào tỉnh Hưng Yên** (sắp xếp đơn vị hành chính 2025). Tên thư mục
và văn bản quy hoạch địa phương nào đang có hiệu lực — câu hỏi Q-8, chờ Haan.
