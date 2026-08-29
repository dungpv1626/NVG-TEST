# 08 — Giai đoạn 1 và các mốc tiếp theo

Luồng thiết kế đầy đủ và ranh giới Giai đoạn 1 xem sơ đồ ở `11-design-flow.md`.

**Không ước lượng thời gian.** Làm tuần tự, xong mốc này mới sang mốc sau. Điều kiện ra
xác định "xong", không phải lịch.

---

# GIAI ĐOẠN 1 — Khung xương + Layer 1, 2 và lõi CP-SAT nhà phố

Mục tiêu: dựng phần khung ở mức hoàn thiện nhất dựa trên những gì đã rõ, để hạn chế phải
sửa về sau. Mọi thứ ngoài phạm vi này chỉ tạo **stub đúng contract**, không cài đặt.

## Mốc 0 — Kiểm chứng rủi ro kỹ thuật (làm trước mọi thứ)

Ba việc nhỏ nhưng nếu thất bại thì kiến trúc phải xem lại — rẻ hơn nhiều so với phát
hiện ở Mốc 3.

| # | Việc | Definition of Done |
|---|---|---|
| 0.1 | Đọc thử 5 file `.dwg` cũ qua công cụ chuyển đổi ODA (Open Design Alliance) và thư viện `ezdxf`, chạy trong container | Trích được đa giác ranh phòng và nhãn phòng; kiến trúc sư xác nhận đúng trên ít nhất 4 trên 5 file |
| 0.2 | Model CP-SAT nhỏ: một căn 5×18, 4 tầng, giải liên tầng, **chạy trong Cloudflare Container** | Có nghiệm hợp lệ trong dưới 60 giây với `num_search_workers=1`; khi ép ràng buộc mâu thuẫn thì tập ràng buộc xung đột trả về đọc hiểu được |
| 0.3 | Viết 20 rule đầu tiên theo `07-rule-pack.md` | Kiến trúc sư đọc hiểu và tự đề xuất thêm ít nhất 5 rule |

**Ra:** cả ba đạt.

> 0.2 là phép đo quyết định về hạ tầng. Nếu nửa vCPU quá chậm, chuyển container sang
> VPS — vì container đã stateless nên chỉ là đổi chỗ deploy.
> 0.1 thất bại thì kế hoạch Knowledge Base phải thiết kế lại.

## Mốc 1 — Nền tảng dùng chung

**Vào:** Mốc 0 đạt.

- `packages/contracts/` với JSON Schema đầy đủ cho **cả 5 layer**, kể cả layer chưa cài
  đặt. Pipeline sinh zod và Pydantic + kiểm tra CI
- Bảng `design_artifact`, `design_artifact_edge`, `design_head` — có `tenant_id` và
  `discipline`, khoá ngoại tới bảng dự án và user **sẵn có**
- Khai báo **quyền** của module (`design.*`) và gán vào bảng vai trò sẵn có. Không
  hard-code tên vai trò
- Chính sách RLS (Row Level Security — phân quyền mức từng dòng dữ liệu) trên mọi bảng
  module, kiểm tra **ba chiều**: tenant, phân công dự án, bộ môn
- Cơ chế nạp rule pack theo địa phương (base + locality override), nạp một bộ
- Trạng thái dự án nháp cho khách vãng lai + cơ chế chuyển thành dự án chính thức
- Cloudflare Container dựng được, Worker gọi được qua service binding
- Khung Cloudflare Workflow với đủ 5 bước; bước chưa cài đặt trả về stub (mã tạm đúng
  contract) thay vì kết quả thật
- Rule pack loader + engine vị từ (trong Container) + 20 rule của Mốc 0
- Lớp router LLM + kiểm tra `data_class`
- Publish bridge sang hệ tài liệu (chưa có nội dung để publish, nhưng đường đi phải thông)

**Ra:**
- Chạy được một pipeline giả từ đầu đến cuối bằng stub, mọi artifact có hash và lineage
- Truy vấn được "bản nào đang hiệu lực" cho một dự án
- Test: gửi `data_class: 1` tới endpoint miễn phí → bị chặn
- Test: cùng input + config → cùng artifact hash
- Test: user tenant A không đọc được dữ liệu tenant B
- Test: user chỉ ghi được artifact thuộc bộ môn mình phụ trách
- Kiểm thử: phát hành bộ môn kết cấu bị chặn nếu người ký không có quyền `design.publish.KC`

## Mốc 2 — Layer 1 (Design Brief) thay thế phiếu tiếp nhận

**Vào:** Mốc 1 đạt.

- Adaptive form, logic hiện/ẩn trong cấu hình JSON chứ không viết cứng trong giao diện
- LLM kiểm tra đầy đủ và nhất quán, `completeness_score`
- **Di trú dữ liệu phiếu tiếp nhận cũ** sang `design_brief`
- **Kiểm kê và chuyển các module khác** (Kinh doanh, Dự toán) sang đọc `design_brief`
  hoặc view tương thích

**Ra:**
- Phiếu tiếp nhận cũ ngừng sử dụng, không còn nhập hai nơi
- Không module nào của phần mềm quản trị bị hỏng
- Design Brief validate được bằng schema

> Đây là mốc có rủi ro vận hành cao nhất trong Giai đoạn 1 vì nó động vào phần đang chạy
> thật. Làm sau Mốc 1 để có versioning và rollback trước khi đụng vào dữ liệu sống.

## Mốc 3 — Pipeline số hoá + Knowledge Base

**Vào:** Mốc 1 đạt (chạy song song Mốc 2 được).

- Workflow số hoá: mỗi file một step, chạy lại riêng phần lỗi được
- Extractor cho mặt bằng, tổng mặt bằng, kết cấu, mặt cắt, bảng thống kê
- Bảng ánh xạ layer CAD (`kb_layer_mapping`), bổ sung dần
- Kiểm tra chéo tự động → `quality_score`
- **Không xây giao diện quản lý phân hạng A/B/C** — với kho hiện tại tất cả là hạng A
- Suy ngược `slicing_tree` từ hình học; không suy được thì hạ `quality_score`
- **Giao diện annotation**: hiển thị mặt bằng đã trích + 5 câu hỏi có sẵn lựa chọn
- Truy hồi ba tầng + MMR
- Thống kê thực nghiệm (materialized view)

**Ra:**
- Chạy được toàn bộ kho hồ sơ mà NVG cung cấp, có báo cáo tỉ lệ trích xuất thành công
- KTS annotation một công trình trong ≤15 phút
- Truy hồi trả về 3–5 công trình đa dạng, không trùng nhau

> **Kho thực tế dưới 50 bộ.** Hook thống kê thực nghiệm phải có nhưng trả về rỗng ở quy
> mô này (`06-knowledge-base.md` mục 6.0). Đánh giá bằng leave-one-out, không tách golden
> set riêng. Pipeline phục vụ dòng dự án mới nhiều hơn backlog.

## Mốc 4 — Layer 2 (Space Program)

**Vào:** Mốc 2 và Mốc 3 đạt.

- Functional Programming Engine
- Dùng thống kê thực nghiệm khi có, **chạy được với Knowledge Base rỗng** (rule + LLM,
  chất lượng thấp hơn nhưng đúng contract)

**Ra:** từ Design Brief sinh Space Program mà KTS đánh giá hợp lý trên **≥70%** kho đánh
giá (leave-one-out).

## Mốc 5 — Lõi Layer 3 cho nhà phố

**Vào:** Mốc 4 đạt.

- Massing (một wing lấp kín lô)
- Sinh `LayoutIntent` + validate cấu trúc
- **CP-SAT liên tầng trong Container**, assumptions → `InfeasibilityReport`
- Geometry refinement
- Floor Plan Editor (Konva), validate trên server
- Impact Analysis từ conflict set
- **Gói trình khách để chốt phương án sớm** (`11-design-flow.md` mục 11.4b):
  - Mặt bằng tô màu theo nhóm công năng
  - **Khối 3D đơn giản**: đùn khối bằng `trimesh` → glTF → Three.js. Không vật liệu,
    không render. Đây là phần tối thiểu của Layer 5a kéo lên sớm
  - Bảng so sánh phương án bằng ngôn ngữ khách hiểu
  - Ghi nhận sự kiện khách chốt phương án vào lineage
- **Xuất DXF mặt bằng** với khung tên và mã phiên bản đúng quy ước Nhà Việt Group
- Bảng thống kê tự sinh: cửa, diện tích, vật liệu
- Publish bridge có nội dung thật, phát hành bộ môn kiến trúc

> **Ranh giới phạm vi:** Giai đoạn 1 gồm mặt bằng, gói trình khách có khối 3D đơn giản,
> bảng thống kê, tệp DXF và phát hành bộ môn kiến trúc. **Mặt đứng, mặt cắt và ảnh phối
> cảnh photorealistic thuộc Mốc 6.**
> Hệ quả với từng người dùng và ví dụ minh hoạ output: `11-design-flow.md` mục 11.5, 11.6.

**Ra:**
- Leave-one-out trên kho nhà phố: KTS chọn một phương án AI làm điểm khởi đầu trên
  **≥40%** (cổng chặn). Mục tiêu 70% theo dõi liên tục qua eval, không phải điều kiện ra
- 3 tầng → 4 tầng: regenerate <60s, cả 4 tầng nhất quán, lõi và trục giữ nguyên
- DXF xuất ra mở được trong AutoCAD, layer và khung tên đúng quy ước
- Khách hàng chốt được phương án chỉ dựa trên gói trình khách, không cần chờ phối cảnh
- Phê duyệt một phương án → tài liệu xuất hiện trong hệ tài liệu với số phiên bản đúng

**Đây là điểm kết thúc Giai đoạn 1.**

---

# CÁC GIAI ĐOẠN SAU

Làm khi đã chốt thêm phương án với khách hàng.

## Mốc 6 — Layer 4 và 5 cho nhà phố

Template mặt đứng, mặt cắt tự sinh, nâng bộ sinh 3D từ khối đơn giản lên mô hình có vật
liệu, xuất bản đồ độ sâu và bản đồ pháp tuyến, `RenderBackend` với adapter thật.

Phần đùn khối cơ bản đã có từ Mốc 5, nên mốc này bổ sung chứ không xây lại từ đầu.

## Mốc 6b — Hồ sơ kỹ thuật kiến trúc

Nâng chất lượng output `KT` từ phương án sơ bộ lên bản vẽ kỹ thuật: cấu tạo lớp tường,
cao độ chi tiết, tham chiếu thư viện chi tiết, bố cục khổ giấy, ghi chú kỹ thuật.

Đây là bước bắc cầu bắt buộc trước Mốc 6c — không thể mời kỹ sư kết cấu vào làm việc trên
một nền hình học còn ở mức sơ bộ.

## Mốc 6c — Phối hợp liên bộ môn (kết cấu, điện nước)

Đích đến ở `01-overview.md` mục 1.1. Nội dung:

- Tài khoản cho kỹ sư kết cấu và điện nước, giới hạn theo dự án được phân công và bộ môn
- Kỹ sư nhận nền hình học từ engine (lưới trục, cao độ, kích thước đã chốt) thay vì tự
  dựng lại
- Engine sinh sẵn nội dung lặp lại cho `KC` và `DN` — khung tên, ghi chú kỹ thuật, chi
  tiết cấu tạo điển hình, bảng thống kê — để kỹ sư **kiểm tra và duyệt**, không tự phát hành
- **Phát hiện xung đột liên bộ môn** trên hình học chung: cột đè lên cửa, hộp kỹ thuật
  cắt dầm, cao độ trần va đường ống
- Publish theo từng bộ môn với chữ ký riêng; kiểm tra đầy đủ bộ hồ sơ trước khi phát hành

**Ranh giới bất biến:** engine không tính tiết diện, không tính tải trọng, không kết luận
về PCCC. Nó chuẩn bị nền và phát hiện xung đột; kỹ sư có chứng chỉ hành nghề quyết định
và ký.

**Ra:** một bộ hồ sơ thiết kế đầy đủ ba bộ môn đi ra từ hệ thống, mỗi bộ môn có chữ ký
của người chịu trách nhiệm đúng chuyên môn.

## Mốc 7 — Biệt thự và nhà vườn

Massing đầy đủ (L/U/T, setback bốn phía, nhiều wing, nhiều lõi), `void` trong slicing
tree, rule pack riêng, golden set riêng, template mặt đứng xử lý góc khối.

Ngưỡng chấp nhận **đặt bằng nhà phố**. Nếu đo thấy thấp hơn, cách xử lý là làm giàu đầu
vào ở Layer 1 và bổ sung rule, không phải hạ ngưỡng — xem `01-overview.md` mục 1.2.

## Mốc 8 — Mở cho khách trên website

Đã xác nhận đây là tính năng NVG muốn có. Nội dung: luồng khách vãng lai, rate limit,
chống lạm dụng, giới hạn số phương án, chuyển dự án nháp thành chính thức khi Kinh doanh
tiếp nhận.

Hạ tầng render dùng **dịch vụ API trả theo ảnh** — tải từ website không đoán trước được
nên không thể phụ thuộc máy trạm văn phòng.

## Mốc 9 — Mở rộng liên tục

QTO sơ bộ (mục 8.3), thư viện phong cách, tinh chỉnh rule pack, tenant thứ hai.

---

## 8.1 Bộ đo chất lượng (eval harness)

**Cách đánh giá: leave-one-out**, không tách golden set riêng. Kho hiện dưới 50 bộ nên
tách 20–30 dự án sẽ ngốn quá nửa, và nếu vẫn để chúng trong tập tham chiếu thì kết quả bị
nhiễm. Thay vào đó: đánh giá từng công trình trong khi loại chính nó khỏi tập tham chiếu.

Chuyển sang golden set tách riêng khi kho vượt ~200 bộ.

| Chỉ số | Đo gì | Layer |
|---|---|---|
| `constraint_pass_rate` | Đạt ràng buộc ngay lần đầu | 3 |
| `repair_rounds` | Số vòng sinh lại variant | 3 |
| `area_deviation` | Sai lệch so với `target_area_m2` | 3 |
| `solve_time_p95` | Thời gian giải ở phân vị 95 — tức 95% số lần đo nằm dưới giá trị này — **đo trên container thật** | 3 |
| **`kts_acceptance_rate`** | **KTS chọn phương án AI hay vẽ lại từ đầu.** Cổng chặn ≥40%, mục tiêu 70% | 3 |
| `program_reasonable_rate` | KTS đánh giá Space Program hợp lý | 2 |
| `extraction_success_rate` | Tỉ lệ trích xuất bản vẽ cũ thành công | KB |
| `cost_per_design` | Chi phí gọi mô hình ngôn ngữ và bộ xử lý đồ hoạ cho mỗi phương án | toàn bộ |

`kts_acceptance_rate` là chỉ số quan trọng nhất và không tự động hoá hoàn toàn được —
cần KTS chấm định kỳ. Các chỉ số còn lại chạy tự động.

**Chạy khi nào:** mọi thay đổi ở prompt, rule pack, hoặc model CP-SAT phải chạy lại eval
trước khi merge. Kết quả ghi vào bảng metrics để so theo thời gian.

Eval cũng là cách **chốt LLM chính thức**: chạy cùng golden set qua nhiều model, so chất
lượng và chi phí bằng số liệu.

## 8.2 Test bảo vệ nguyên tắc

Những test này bảo vệ các nguyên tắc bất biến. Nguyên tắc chỉ nằm trong tài liệu thì sẽ
bị vi phạm; có test thì không.

| Test | Bảo vệ |
|---|---|
| Mọi artifact validate được bằng schema của nó, ở **cả hai** runtime | Nguyên tắc 3 |
| Code sinh từ JSON Schema khớp với schema (CI) | Contract không lệch |
| Không có ngưỡng quy chuẩn nào hard-code trong mã nguồn (grep) | Nguyên tắc 4 |
| `solver/` không import phần gọi LLM | Ranh giới runtime |
| Cùng input + config → cùng artifact hash | Idempotency |
| `data_class: 1` bị chặn ở endpoint không đủ điều kiện | Chính sách dữ liệu |
| Tenant A không truy cập được dữ liệu tenant B (mọi bảng module) | Multi-tenant |
| Không ghi được artifact ngoài bộ môn được phân công | Ranh giới bộ môn |
| Publish `KC`/`DN` bị chặn nếu người ký không có quyền đúng bộ môn | Trách nhiệm pháp lý |
| Mọi bảng module đều có cột `tenant_id` và `discipline` (kiểm tra schema) | Khung không thiếu cột |
| Ảnh xuất ra luôn có `watermark_applied: true` | Ranh giới trách nhiệm |
| **Slicing tree hợp lệ → polygon không chồng lấn, không hở** (property test) | Nguyên tắc cấu trúc |

Kiểm thử cuối viết bằng `hypothesis` (thư viện sinh dữ liệu kiểm thử ngẫu nhiên): sinh
cây ngẫu nhiên, giải, kiểm tra tính lấp kín. Đây
là cách chứng minh nguyên tắc "lấp kín theo cấu trúc" thật sự đúng trong cài đặt.

## 8.3 Bóc tách khối lượng (Mốc 9)

**Bóc tách khối lượng** — tiếng Anh là Quantity Take-Off, viết tắt QTO: đo và tổng hợp
diện tích, thể tích, chiều dài, số lượng từ bản vẽ để lập dự toán. Ba bài toán khác nhau, chỉ một trong
phạm vi:

| | Mô tả | Phạm vi |
|---|---|---|
| **(a)** Khối lượng sơ bộ từ thiết kế engine sinh ra: m² sàn, m² tường, m² ốp lát, số cửa, m² mái | Chỉ là tính toán trên hình học đã có | **TRONG phạm vi**, Mốc 9 |
| (b) Bóc tách thi công chi tiết: thép, cấu tạo, chống thấm | Cần hồ sơ kỹ thuật đầy đủ + kết cấu | Ngoài phạm vi |
| (c) Đọc bản vẽ PDF/scan có sẵn để bóc tách | Bài toán ngược, không dùng chung pipeline | **Dự án riêng** |

(a) và (c) nghe giống nhau nhưng chia sẻ rất ít công nghệ. Đừng gộp.

**Bắt buộc:** mọi kết quả gắn nhãn `"Khối lượng sơ bộ — không dùng làm căn cứ ký hợp
đồng"`, do code chèn. Sai khối lượng → sai báo giá → thiệt hại tiền thật.
