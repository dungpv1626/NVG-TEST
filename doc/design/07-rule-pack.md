# 07 — Rule pack

Quy tắc kiến trúc là **dữ liệu**, không phải code. 50–100 quy tắc không thể nằm trong
Python: KTS không đọc được, không đề xuất được, và mỗi lần quy chuẩn địa phương thay
đổi phải deploy lại hệ thống.

**Engine là code, luật là dữ liệu.** Không hard-code một ngưỡng quy chuẩn nào ở bất kỳ
đâu trong mã nguồn.

**Nơi chạy:** vị từ (predicate — hàm kiểm tra một điều kiện hình học) chỉ được cài đặt
**một nơi duy nhất — Container/Python**. Worker đọc
rule pack để hiển thị cho người dùng nhưng **không tự đánh giá rule**; nếu không sẽ có
hai bản thực thi lệch nhau. Đây cũng là lý do hoãn tầng Rust biên dịch sang WebAssembly.

**Tenant:** `tenant_id` **cho phép NULL** trên bảng rule. NULL nghĩa là dùng chung nền
tảng. Cấu trúc này chứa được cả ba phương án chia tenant, nên khi chốt chỉ là gán giá
trị chứ không phải đổi schema.

**Địa phương:** NVG thi công ở 2–3 tỉnh lân cận, mà khoảng lùi và mật độ xây dựng khác
nhau theo địa phương. **Cơ chế rule theo địa phương phải có trong khung ngay**, nhưng
Giai đoạn 1 chỉ nạp một bộ.

```
rules/
  base/            áp dụng mọi nơi (kích thước tối thiểu, quy tắc công năng)
  locality/
    hanoi/         khoảng lùi, mật độ xây dựng riêng
    <tinh-2>/
```

`DesignBrief.locality` quyết định nạp pack nào. Pack địa phương **ghi đè** pack base
theo `rule_id`. Rule không có trong pack địa phương thì lấy từ base.

## 7.1 Định dạng

`rules/<pack_name>/*.yaml`, phiên bản hoá theo ngày phát hành (`2026.08.1`).

Trong ví dụ dưới, `source` ghi nguồn của quy tắc. **QCVN** là Quy chuẩn kỹ thuật quốc
gia — văn bản quy phạm pháp luật bắt buộc tuân thủ; **BXD** là Bộ Xây dựng, cơ quan ban
hành. Quy chuẩn tham chiếu ở đây là QCVN 01:2021/BXD.

```yaml
- id: corridor_min_width
  applies_to: [nha_pho, biet_thu, nha_vuon]
  scope: floor
  predicate: min_dimension
  target: circulation
  value_m: 0.9
  severity: error
  source: "QCVN 01:2021/BXD"
  auto_repair: shrink_adjacent

- id: altar_room_top_floor
  applies_to: [nha_pho]
  scope: building
  predicate: floor_preference
  target: altar_room
  value: top
  severity: warning
  source: "kinh nghiệm NVG"
  auto_repair: none

- id: stair_alignment
  applies_to: [nha_pho, biet_thu, nha_vuon]
  scope: building
  predicate: aligned_across_floors
  target: core
  tolerance_m: 0.0
  severity: error
  source: "QCVN 01:2021/BXD"
  auto_repair: none
```

## 7.2 Hai trường quan trọng nhất

### `source` — tách quy chuẩn pháp lý khỏi kinh nghiệm

| `source` | `severity` cho phép | Ý nghĩa |
|---|---|---|
| `"QCVN …"` hoặc văn bản pháp quy | `error` | **Chặn phát hành.** Kiến trúc sư không được bỏ qua |
| `"kinh nghiệm NVG"` | `warning` | Cảnh báo. Kiến trúc sư được quyền bỏ qua, có ghi nhận lý do |

Không tách thì hệ thống hoặc **quá cứng** (kiến trúc sư bỏ dùng vì bị chặn bởi thứ không
bắt buộc), hoặc **quá lỏng** (mất giá trị kiểm soát pháp lý). Đây không phải chi tiết
trang trí — nó quyết định hệ thống có được dùng hay không.

**Cưỡng chế bằng validator:** rule có `source` là văn bản pháp quy mà `severity:
warning` → cảnh báo khi nạp pack. Rule có `source: "kinh nghiệm NVG"` mà `severity:
error` → **từ chối nạp**.

### `applies_to` — phạm vi loại hình

Luật nhà phố không áp cho biệt thự. Không có trường này thì khi mở rộng loại hình sẽ
phải viết lại toàn bộ rule pack.

Giá trị hợp lệ: `nha_pho`, `biet_thu`, `nha_vuon`. Không có `nha_xuong` — ngoài phạm vi.

## 7.3 Vị từ (predicate)

Vị từ được **cài đặt trong code**, rule chỉ tham chiếu tên và tham số. Thêm vị từ mới
là thay đổi code; thêm rule mới thì không.

| Predicate | Tham số | Ý nghĩa | Mã hoá vào CP-SAT thế nào |
|---|---|---|---|
| `min_area` | `target`, `value_m2` | Diện tích tối thiểu | Ràng buộc tuyến tính trên biến dẫn xuất |
| `max_area` | `target`, `value_m2` | Diện tích tối đa | Như trên |
| `min_dimension` | `target`, `value_m` | Cạnh nhỏ nhất | Ràng buộc trên hiệu hai đường cắt |
| `aspect_ratio_max` | `target`, `value` | Tỉ lệ dài/rộng tối đa | Ràng buộc tuyến tính |
| `requires_daylight` | `target` | Phải tiếp giáp mặt thoáng | Ràng buộc vị trí lá trong cây |
| `requires_access` | `target` | Phải có lối vào | Ràng buộc liên thông |
| `adjacency` | `a`, `b`, `kind` | Quan hệ vị trí | Ràng buộc cứng hoặc trọng số mềm |
| `floor_preference` | `target`, `value` | Ưu tiên tầng | Thường `warning` → hàm mục tiêu |
| `aligned_across_floors` | `target`, `tolerance_m` | Thẳng hàng liên tầng | Biến dùng chung giữa các tầng |
| `setback` | `side`, `value_m` | Khoảng lùi | Ràng buộc ở bước massing |
| `max_density` | `value` | Mật độ xây dựng tối đa | Ràng buộc ở bước massing |
| `module_multiple` | `value_m` | Bội số module xây dựng | Miền giá trị biến nguyên |

**Khi cần một ràng buộc mới:** trước hết kiểm tra có diễn đạt được bằng vị từ sẵn có
không. Chỉ thêm vị từ mới khi thật sự không diễn đạt được — mỗi vị từ mới là thêm code
phải bảo trì và thêm cách mã hoá CP-SAT phải kiểm chứng.

## 7.4 `severity` và `auto_repair`

| `severity` | Solver xử lý thế nào |
|---|---|
| `error` | Ràng buộc cứng. Vi phạm → UNSAT → `InfeasibilityReport` |
| `warning` | Trọng số trong hàm mục tiêu. Vi phạm → ghi vào `constraint_report.violations` nhưng vẫn trả nghiệm |

`auto_repair` gợi ý hướng nới lỏng khi sinh `suggested_relaxations`:
`shrink_adjacent`, `move_to_floor`, `remove`, `none`.

## 7.5 Gắn với cơ chế giả định (assumptions) của bộ giải CP-SAT

Mỗi rule `severity: error` được gắn một **biến giả định** khi dựng model. Khi vô nghiệm
(UNSAT — unsatisfiable), bộ giải trả về tập biến giả định mâu thuẫn nhỏ nhất → ánh xạ ngược ra `rule_id` →
`conflict_set` trong `InfeasibilityReport`.

Đây là lý do kỹ thuật chính để chọn CP-SAT. **Không bỏ qua bước gắn assumption** vì
nó "làm model chậm hơn" — không có nó thì mất hẳn tính năng Impact Analysis.

## 7.6 Thông báo cho người dùng

`human_message` sinh từ **mẫu câu theo `rule_id`**, không gọi mô hình ngôn ngữ. Tất định, rẻ, dịch
được, và không bịa.

```yaml
# rules/messages.vi.yaml
corridor_min_width: "Hành lang {room} chỉ còn {actual}m, tối thiểu {required}m"
min_area: "{room} chỉ đạt {actual}m², yêu cầu tối thiểu {required}m²"
```

Ghép nhiều rule trong tập mâu thuẫn thành một câu thì dùng mẫu câu ghép, vẫn không cần
mô hình ngôn ngữ.

## 7.7 Phiên bản

- Mỗi `FloorPlan` ghi `rule_pack_version` đã dùng (bắt buộc, xem `03-data-contracts.md`)
- Đổi rule không sửa artifact cũ. Muốn áp rule mới thì regenerate và tạo artifact mới
- Nhiều pack theo địa phương: `rules/hanoi/`, `rules/hcm/` — khoảng lùi và mật độ xây
  dựng khác nhau theo địa phương. Danh sách tỉnh cụ thể xem `09-open-questions.md` Q-B

## 7.8 Quy trình thêm rule

1. KTS mô tả quy tắc bằng lời
2. Lập trình viên ánh xạ sang vị từ sẵn có, hoặc báo cần vị từ mới
3. Viết YAML, ghi rõ `source` và `applies_to`
4. **Chạy bộ đo chất lượng** — rule mới không được làm tụt tỉ lệ đạt ràng buộc
5. Người có thẩm quyền duyệt pack (xem Q8) → tăng version

Bước 4 là bắt buộc. Rule mới có vẻ hợp lý vẫn có thể làm nhiều phương án cũ thành vô
nghiệm.
