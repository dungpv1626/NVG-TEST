# 01 — Phạm vi và nguyên tắc

## 1.0 Đây là một module, không phải hệ thống độc lập

Tính năng thiết kế nằm **bên trong** phần mềm quản trị Nhà Việt Group (viết tắt: NVG). Dùng chung
codebase Next.js, database Supabase, người dùng, phân quyền và hệ quản lý tài liệu.

Hệ quả cho mọi quyết định phía dưới: **không tạo lại thứ đã có**. Dự án, khách hàng,
user, vai trò, tài liệu — tham chiếu, không sao chép. Chi tiết ở `02-architecture.md`.

Module cũng chuẩn bị để bán lại cho công ty xây dựng khác, nên **mọi bảng mang
`tenant_id`** ngay từ khung.

## 1.1 Hệ thống làm gì

**Giai đoạn 1:** nhận yêu cầu thiết kế nhà ở → sinh 3–4 phương án sơ bộ **có cấu trúc**
→ kiến trúc sư (KTS) chọn, sửa, phê duyệt → xuất tệp DXF (Drawing Exchange Format —
định dạng trao đổi bản vẽ mà AutoCAD mở trực tiếp được).

**Đích đến dài hạn:** nền tảng mang **cả bộ hồ sơ thiết kế nhiều bộ môn** đi ra từ một
chỗ — kiến trúc do engine sinh ở chất lượng bản vẽ kỹ thuật, kết cấu và điện nước do kỹ
sư làm bên trong hệ thống trên nền hình học engine cung cấp. Nền tảng lo phiên bản, đồng
bộ liên bộ môn, phát hiện xung đột, và xuất bộ hồ sơ hoàn chỉnh.

Đầu ra không phải ảnh đẹp. Đầu ra là **bộ dữ liệu thiết kế chỉnh sửa và tái sinh được**,
trong đó ảnh phối cảnh chỉ là một dẫn xuất.

**Hệ quả cho khung ngay bây giờ:** mọi artifact và tài liệu mang trường `discipline`
— bộ môn: `KT` (kiến trúc), `KC` (kết cấu), `DN` (điện nước) — và mô hình dữ liệu giữ
ngữ nghĩa IFC (Industry Foundation Classes, tiêu chuẩn mở mô tả dữ liệu công trình:
IfcSpace, IfcWall, IfcDoor)
để các bộ môn tham chiếu chung một hình học thay vì copy dữ liệu của nhau. Giai đoạn 1 chỉ sinh ra bộ môn kiến trúc, nhưng thêm trường sau sẽ phải sửa mọi bảng.

## 1.2 Loại hình công trình trong phạm vi

| Loại hình | Thứ tự triển khai | Ghi chú kỹ thuật |
|---|---|---|
| Nhà phố (lô chữ nhật hẹp, lấp kín lô) | Làm trước | Một cánh nhà, khoảng lùi bằng không. **Là tập con kỹ thuật của biệt thự** |
| Biệt thự (lô rộng, khoảng lùi bốn phía) | Làm sau nhà phố | 1–3 cánh nhà, hình L/U/T, có thể nhiều lõi thang, có sân trong |
| Nhà vườn | Làm sau biệt thự | Như biệt thự, tỉ lệ sân lớn hơn |
| Nhà xưởng công nghiệp | **NGOÀI PHẠM VI** | Không code, không thiết kế schema cho nó |

**Mục tiêu chất lượng như nhau cho mọi loại hình trong phạm vi.** Không có loại hình hạng
hai, không đặt ngưỡng chấp nhận thấp hơn cho biệt thự. Thứ tự ở bảng trên là **thứ tự
triển khai**, không phải thứ tự ưu tiên chất lượng.

**Lý do làm nhà phố trước là kỹ thuật, không phải vì nó "dễ hơn":** nhà phố là trường hợp
một cánh nhà với khoảng lùi bằng không. Xây xong nhà phố thì bộ giải, rule pack, trình
chỉnh sửa và bộ xuất CAD đã dùng lại được gần như nguyên vẹn; mở rộng sang biệt thự là bổ
sung máy móc massing chứ không phải viết lại.

**Biệt thự cần nhiều máy móc hơn**, và đây là khối lượng lập trình đo được chứ không phải
giới hạn của mô hình: đặt khối trong lô với khoảng lùi bốn phía, hình bao L/U/T, nhiều
cánh nhà nối qua sảnh, nhiều lõi thang, khoảng rỗng là sân trong và giếng trời.

**Chất lượng phương án biệt thự phụ thuộc chất lượng đầu vào nhiều hơn nhà phố.** Với nhà
phố, ràng buộc chật chội tự thu hẹp không gian lời giải. Với biệt thự, phần thu hẹp đó
phải đến từ thông tin: phong cách, hướng, quan hệ trong ngoài, tổ chức sân vườn, thứ tự
ưu tiên của gia đình, ý đồ của kiến trúc sư phụ trách.

Hệ quả hành động: **form ở Layer 1 phải phân nhánh sâu hơn hẳn cho biệt thự**, và rule
pack biệt thự cần nhiều quy tắc mang tính ý đồ thiết kế hơn. Đây là việc làm được, không
phải rào cản.

Kiến trúc được thiết kế để **nhà phố là trường hợp đặc biệt của biệt thự** (một wing,
setback = 0), nên không có hai code path. Xem `04-layer3-floorplan.md`.

## 1.3 Bảy nguyên tắc bất biến

Lặp lại từ `CLAUDE.md` vì chúng chi phối mọi quyết định thiết kế phía dưới.

1. **Không đi thẳng text → image.** Mọi ảnh dẫn xuất từ hình học đã giải.
2. **LLM không sinh số hình học.** LLM sinh cấu trúc rời rạc; solver gán kích thước.
3. **Mọi ranh giới layer có JSON Schema.** Validate ở cả hai đầu.
4. **Quy tắc kiến trúc là dữ liệu.** Rule pack YAML, không phải `if` trong Python.
5. **Một nguồn hình học.** Server sinh glTF; client chỉ render.
6. **Artifact bất biến + lineage.** Không ghi đè, không mất lịch sử.
7. **Mọi bảng của module mang `tenant_id`.** Kể cả khi hiện chỉ có một tenant.

## 1.4 Ranh giới trách nhiệm AI / con người

Đây là ràng buộc sản phẩm, không phải khuyến nghị. Code phải cưỡng chế.

| Hạng mục | Hệ thống được phép | Cấm |
|---|---|---|
| Phân tích yêu cầu, space program, mặt bằng, 3D, phối cảnh, bảng thống kê | Sinh và đề xuất tự động | — |
| Kết cấu, nền móng, tải trọng | Cung cấp nền hình học (lưới trục, cao độ, kích thước đã chốt); sinh sẵn nội dung lặp lại (khung tên, ghi chú, chi tiết điển hình) để kỹ sư kiểm tra | **Không tính toán, không đề xuất tiết diện, không kết luận** |
| Điện nước, phòng cháy chữa cháy (PCCC), hệ thống kỹ thuật | Cung cấp nền hình học và vị trí hộp kỹ thuật; cảnh báo xung đột dựa trên rule pack | **Không tự thiết kế hệ thống, không tự kết luận là đạt** |
| Phát hành hồ sơ | Chuẩn bị file, kiểm tra đầy đủ, phát hiện xung đột liên bộ môn | **Không tự phát hành. Mỗi bộ môn phải có chữ ký của người chịu trách nhiệm chuyên môn đó** |

**Về hồ sơ nhiều bộ môn:** hệ thống mang được cả bộ hồ sơ, nhưng mang không có nghĩa là
sinh ra. Với kết cấu và điện nước, engine đóng vai trò nền tảng cộng tác — cung cấp nền hình học
chính xác, quản lý phiên bản, phát hiện xung đột, tổng hợp bộ hồ sơ — còn nội dung
chuyên môn do kỹ sư có chứng chỉ hành nghề tạo ra và ký.

**Yêu cầu triển khai:** mọi artifact xuất ra ngoài hệ thống (ảnh, DXF, bảng khối lượng)
phải mang nhãn cảnh báo nhúng sẵn:
- Ảnh AI: `"Ảnh tham khảo ý tưởng — chưa phải phương án thi công"`
- Bảng khối lượng: `"Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng"`

Nhãn này do code chèn, không phụ thuộc người dùng nhớ bật.

## 1.5 Phân hạng dữ liệu — quyết định dịch vụ ngoài nào được gọi

| Hạng | Nội dung | Được gửi ra dịch vụ bên ngoài? |
|---|---|---|
| 1 — Nhạy cảm | Thông tin khách hàng, đầu bài, hợp đồng, dự toán, liên hệ | **Không.** Chỉ dịch vụ có cam kết không lưu trữ và không huấn luyện |
| 2 — Trung bình | Mặt bằng kích thước thật, bản vẽ kỹ thuật, mô hình 3D | Chỉ dịch vụ có cam kết không lưu trữ |
| 3 — Thấp | Clay render, depth map, style prompt | Được |

**Triển khai:** mỗi lời gọi ra ngoài phải khai báo `data_class: 1|2|3`. Một lớp kiểm
tra ở giữa chặn lời gọi hạng 1 tới endpoint chưa được đánh dấu an toàn. Đừng để việc
này phụ thuộc trí nhớ người viết code.

## 1.6 Từ vựng

| Thuật ngữ | Nghĩa trong dự án này |
|---|---|
| **Wing** (cánh nhà) | Một hình chữ nhật thành phần của khối công trình. Nhà phố có 1; biệt thự hình L có 2 |
| **Core** (lõi) | Dải chứa cầu thang, WC, hộp kỹ thuật. Vị trí dùng chung giữa các tầng |
| **Slicing tree** (cây chia không gian) | Cây nhị phân, mỗi nút là một lát cắt ngang/dọc, mỗi lá là một phòng hoặc khoảng rỗng |

> Bảng đầy đủ mọi thuật ngữ và viết tắt: `10-glossary.md`.
| **Layout intent** | Output của LLM ở Layer 3a: cấu trúc bố cục, chưa có kích thước chính xác |
| **Rule pack** | Tập quy tắc kiến trúc dạng YAML, có phiên bản |
| **Artifact** | Kết quả bất biến của một layer, định danh bằng hash nội dung |
| **QTO** | Quantity Take-Off — bóc tách khối lượng: đo và tổng hợp diện tích, thể tích, số lượng để lập dự toán |
