# 09 — Quyết định đã chốt và câu hỏi còn treo

**Cách dùng file này:**

- **BLOCKING** — chưa có câu trả lời thì **không code phần liên quan**. Dừng và hỏi.
- **NON-BLOCKING** — code được, nhưng tách module để đổi được sau. Ghi rõ giả định.

Khi có câu trả lời: cập nhật file này và tài liệu liên quan. Đừng để câu trả lời chỉ nằm
trong lịch sử chat.

---

## Phần 1 — Đã chốt (không mở lại)

### Tích hợp và hạ tầng

| # | Quyết định |
|---|---|
| D1 | Module nằm **trong** phần mềm quản trị NVG: cùng codebase, cùng database |
| D2 | Next.js/TypeScript trên Cloudflare; lõi tính toán là Cloudflare Container (Python) |
| D3 | Dùng chung: dự án/khách hàng, user/phân quyền, hệ tài liệu có phiên bản |
| D4 | **Design Brief thay thế** phiếu tiếp nhận. Phần mềm chưa chạy thật → **không cần di trú dữ liệu** |
| D5 | Artifact/lineage riêng + **publish bridge** khi phê duyệt |
| D6 | Điều phối bằng **Cloudflare Workflows + Queues**. Bỏ Hatchet |
| D7 | Worker Python trên **Cloudflare Containers**, stateless để chuyển được |
| D11 | Nguồn schema là **JSON Schema** (lược đồ mô tả hình dạng dữ liệu JSON), sinh ra zod cho TypeScript và Pydantic cho Python |
| D12 | Rust biên dịch sang WebAssembly cho kiểm tra tức thời **hoãn sau Giai đoạn 1** |
| D15 | Phân quyền: module khai báo **quyền**, gán vào bảng vai trò sẵn có. Không hard-code tên vai trò |
| D19 | Vận hành theo hợp đồng bảo trì, **không có người trực** → tự thử lại, tự phục hồi, cảnh báo chủ động |

### Phạm vi sản phẩm

| # | Quyết định |
|---|---|
| D9 | Giai đoạn 1 = khung + Layer 1, 2 và lõi CP-SAT nhà phố chạy thật |
| D10 | Pipeline số hoá DWG + giao diện annotation **nằm trong Giai đoạn 1** |
| D16 | **Đích đến: bộ hồ sơ đầy đủ ba bộ môn — kiến trúc, kết cấu, điện nước — đi ra từ nền tảng**, mỗi bộ môn do người chịu trách nhiệm ký. Engine không tự sinh nội dung kết cấu và cơ điện |
| D17 | Kỹ sư kết cấu thuê ngoài có **tài khoản đầy đủ**, giới hạn theo dự án được phân công |
| D18 | **Mở tính năng thiết kế AI cho khách trên website** → dự án nháp, rate limit, hạ tầng co giãn |
| D20 | Web editor là nguồn sự thật cho sơ bộ; **xuất DXF một chiều**, không round-trip |
| D26 | **Cổng chốt phương án với khách hàng đặt trước phần chi tiết.** Gói trình khách gồm mặt bằng tô màu công năng, khối 3D đơn giản, bảng so sánh — nằm trong Giai đoạn 1 |
| D27 | **Mục tiêu chất lượng như nhau cho mọi loại hình.** Thứ tự nhà phố trước là thứ tự triển khai kỹ thuật, không phải ưu tiên chất lượng. Không hạ ngưỡng chấp nhận cho biệt thự |

### Dữ liệu và chất lượng

| # | Quyết định |
|---|---|
| D8 | **Multi-tenant từ khung** — `tenant_id` trên mọi bảng module |
| D13 | Kho hồ sơ cũ **dưới 50 bộ** → không phân hạng, chưa dùng thống kê thực nghiệm, đánh giá bằng leave-one-out |
| D14 | Ngưỡng Mốc 5: **cổng chặn ≥40%**, mục tiêu 70% theo dõi qua eval |
| D21 | Rule pack: `tenant_id` cho phép NULL (NULL = dùng chung). Knowledge Base riêng hoàn toàn theo tenant |
| D22 | **2–3 địa phương** → cơ chế rule base + locality override có ngay, nạp một bộ ở Giai đoạn 1 |
| D23 | **Trường `discipline` — bộ môn: `KT` kiến trúc, `KC` kết cấu, `DN` điện nước — trên mọi artifact và tài liệu** ngay từ khung, dù Giai đoạn 1 chỉ sinh bộ môn kiến trúc |
| D24 | Mô hình dữ liệu giữ **ngữ nghĩa IFC** (Industry Foundation Classes — tiêu chuẩn mở mô tả dữ liệu công trình) — chuyển từ "nên có" thành bắt buộc, vì ba bộ môn tham chiếu chung một hình học |
| D25 | Render qua **dịch vụ API trả theo ảnh**. Ưu tiên model **Apache 2.0**, tránh mua giấy phép thương mại |

---

## Phần 2 — Còn treo

### Q-A — Tỉ trọng nhà phố / biệt thự — **NON-BLOCKING**

**Liên quan:** `01-overview.md` mục 1.2, thứ tự Mốc 5 và Mốc 7.

Chưa có số liệu về tỉ trọng doanh thu và số dự án giữa nhà phố và biệt thự.

**Vì sao vẫn nên hỏi:** con số này không đổi thứ tự triển khai — nhà phố vẫn làm trước vì
là tập con kỹ thuật của biệt thự (D27) — nhưng nó quyết định **mức đầu tư vào form Layer 1
cho biệt thự**. Biệt thự phụ thuộc chất lượng đầu vào nhiều hơn, nên nếu nó chiếm tỉ trọng
lớn thì phần phân nhánh câu hỏi cho biệt thự cần làm kỹ ngay từ Mốc 2.

**Cần NVG trả lời:**
1. Số dự án và doanh thu mỗi loại hình trong 2–3 năm gần nhất?
2. Xác nhận nhà xưởng công nghiệp **ngoài phạm vi**?

**Làm gì trong lúc chờ:** làm nhà phố trước như kế hoạch. Giữ kiến trúc massing + wing để
mở rộng không phải viết lại. Không thiết kế schema riêng cho nhà xưởng.

### Q-B — Danh sách địa phương cụ thể — **NON-BLOCKING**

**Liên quan:** `07-rule-pack.md`.

Đã biết là 2–3 tỉnh lân cận, chưa biết tỉnh nào. Cần để soạn pack locality thứ hai và thứ ba.

**Làm gì trong lúc chờ:** xây cơ chế base + override, soạn một pack. Thêm pack sau là
thêm dữ liệu, không sửa code.

### Q-C — Ai duyệt rule pack — **NON-BLOCKING**

Ai chịu trách nhiệm phân định rule nào là QCVN bắt buộc, rule nào là kinh nghiệm khuyến
nghị? Trường `source` (nguồn của quy tắc) quyết định rule đó chặn phát hành hay chỉ cảnh báo, nên cần một
người có thẩm quyền chuyên môn duyệt.

**Làm gì trong lúc chờ:** validator từ chối nạp rule ghi `source: "kinh nghiệm NVG"` mà
đặt `severity: error`. Cơ chế đã bảo vệ; còn thiếu người duyệt.

### Q-D — Chia tenant chi tiết cho rule pack — **NON-BLOCKING**

Đã chốt `tenant_id` cho phép NULL (D21), nhưng chưa chốt rule QCVN thuộc nền tảng hay
từng tenant. Cấu trúc chứa được cả hai nên đây chỉ là gán giá trị.

Câu phụ chưa rõ: một người dùng có thuộc nhiều tenant được không?

### Q-E — Máy trạm văn phòng NVG — **ĐÃ HẠ ƯU TIÊN**

Trước đây là ứng viên chính cho hạ tầng render. Sau khi chốt mở tính năng cho khách trên
website (D18), tải không đoán trước được nên **không thể phụ thuộc một máy trong văn
phòng**. Đã chốt dùng dịch vụ API (D25).

Máy trạm vẫn dùng được cho công việc nội bộ nếu về sau muốn giảm chi phí. Nếu đi đường đó thì cần biết dung lượng VRAM (Video RAM — bộ nhớ của card đồ hoạ), địa
chỉ IP tĩnh hay động, và ai chịu trách nhiệm bật tắt bảo trì.

### Q-F — Ngân sách vận hành mỗi tháng — **NON-BLOCKING**

Chưa có con số trần cho chi phí API và hạ tầng. Ảnh hưởng đến chiến lược định tuyến model
và giới hạn cho khách vãng lai trên website.

**Làm gì trong lúc chờ:** ghi nhận `cost_per_design` trong bộ đo chất lượng ngay từ đầu
để có số liệu thật khi cần quyết định.
