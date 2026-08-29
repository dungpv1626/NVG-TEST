# 06 — Knowledge Base

Kho hồ sơ công trình cũ của Nhà Việt Group, số hoá thành dữ liệu có cấu trúc. Đây là thứ phân
biệt hệ thống này với công cụ AI thiết kế generic.

**Nơi chạy:** trích xuất bản vẽ chạy trong **Container/Python** (`ezdxf`, `shapely`, công
cụ chuyển đổi ODA của Open Design Alliance). Điều phối, chuẩn hoá nhãn phòng bằng mô hình
ngôn ngữ, và giao diện nhập chú giải (annotation) chạy trong **Worker/TypeScript**.

**Quy trình số hoá nằm trong Giai đoạn 1** (Mốc 3), gồm cả giao diện nhập chú giải.

**Tenant:** mọi bảng Knowledge Base mang `tenant_id`. Đây là tài sản có giá trị nhất khi
bán module cho khách hàng thứ hai — rò rỉ giữa các tenant là hỏng sản phẩm.

> **Quy mô thực tế: dưới 50 bộ hồ sơ còn đủ file nguồn `.dwg` (định dạng gốc AutoCAD).** Con số này đã xác nhận
> và nó thay đổi thiết kế của mục này đáng kể — xem 6.0 ngay dưới.

## 6.0 Hệ quả của kho dữ liệu nhỏ

Ba điều chỉnh bắt buộc so với thiết kế ban đầu:

**(a) Phân hạng A/B/C không áp dụng.** Dưới 50 bộ thì gần như tất cả phải là hạng A —
người xem và xác nhận từng bộ. Không có hạng C, nên cũng không có nguồn dữ liệu "chỉ để
thống kê".

**(b) Thống kê thực nghiệm chưa dùng được.** Phân bố diện tích phòng theo bề rộng lô ×
số tầng × kiểu gia đình cần chia dữ liệu thành nhiều ô; với 50 mẫu thì mỗi ô còn một hai
công trình — đó là trùng hợp, không phải phân bố.

*Cách xử lý:* giữ nguyên hook trong code và trong hàm mục tiêu của solver, nhưng nó trả
về rỗng cho tới khi mỗi ô đạt tối thiểu ~15 mẫu. Hàm mục tiêu lùi về diện tích mục tiêu
từ Space Program cộng rule do KTS viết. **Không xoá hook** — kho sẽ lớn lên.

**(c) Đánh giá bằng leave-one-out, không tách golden set.** Tách 20–30 dự án làm golden
set sẽ ngốn quá nửa kho, và nếu vẫn để chúng trong tập tham chiếu thì kết quả bị nhiễm.
Ở quy mô nhỏ, cách đúng là đánh giá từng công trình trong khi **loại chính nó** khỏi tập
tham chiếu.

**Kho sẽ tự lớn lên.** Layer 1 ghi đầu bài từ nay trở đi, và NVG làm khoảng 120 dự án mỗi
năm. Pipeline số hoá phục vụ dòng dự án mới nhiều hơn là backlog — đó là lý do vẫn xây nó
ở Giai đoạn 1 dù backlog nhỏ.

> Cũng vì vậy: **lập luận "Knowledge Base là lợi thế cạnh tranh" chưa đúng ở thời điểm
> này.** Nó sẽ đúng sau vài năm tích luỹ. Đừng để kỳ vọng vào KB che mất việc phải làm
> tốt phần rule pack và solver, vốn là thứ tạo ra chất lượng ngay bây giờ.

## 6.1 Pipeline số hoá

Một công trình không phải một bản vẽ. Một bộ hồ sơ đầy đủ gồm ~10 nhóm tài liệu trong
9 thư mục (`01_Đầu bài–khảo sát` → `09_Điều chỉnh–hoàn công`).

Chạy trên Cloudflare Workflows: **mỗi file là một step**. Một file lỗi không giết cả mẻ; sửa
extractor rồi chạy lại riêng phần lỗi.

### Bước 0 — Thu gom và xác định bản có hiệu lực

Bước bị đánh giá thấp nhất nhưng khó nhất, vì quy ước đặt tên không đồng nhất giữa các
nhân sự và các thời kỳ.

1. Quét thư mục dự án, băm nội dung để gộp bản trùng
2. Xác định bản có hiệu lực theo thứ tự ưu tiên:
   - Parse tên file theo quy ước `NVO026_NhaAnhA_KT_MatBang_V03_11082026` → lấy số
     phiên bản cao nhất
   - File trong thư mục `08_Hồ sơ phát hành` được ưu tiên tuyệt đối
   - Vẫn mơ hồ → xếp hàng chờ người xác nhận, **không đoán**
3. Phân loại loại bản vẽ: đường dẫn thư mục + tên file + nội dung khung tên. LLM đọc
   khung tên rồi phân loại chính xác hơn quy tắc cứng

### Bước 1 — Extractor riêng cho từng loại bản vẽ

**Không có extractor vạn năng.**

| Loại | Nguồn | Trích ra | Ưu tiên |
|---|---|---|---|
| Đầu bài / biên bản khảo sát | DOCX, PDF, ảnh | → `DesignBrief` | **P0** |
| Mặt bằng các tầng | DXF | Polygon phòng, nhãn, kích thước, vị trí thang và cửa | **P0** |
| Tổng mặt bằng | DXF | Ranh đất, khoảng lùi, hướng, vị trí công trình trong lô | **P0** (bắt buộc cho biệt thự) |
| Kết cấu | DXF | Lưới cột → `structural_grid` | **P1 cao** — nuôi ràng buộc thẳng hàng ở Layer 3 |
| Mặt cắt | DXF | Chiều cao tầng, dày sàn, cao độ. **Lấy số, không lấy hình** | P1 |
| Mặt đứng | DXF | Nhịp lỗ mở, tỉ lệ đặc/rỗng, cao độ ban công | P1 |
| Bảng thống kê | DXF text, PDF | Đối chiếu chéo với mặt bằng | P1 (rẻ, giá trị kiểm tra cao) |
| Phối cảnh | JPG/PNG | Nhãn phong cách, vật liệu chủ đạo | P1 (nuôi Layer 4/5) |
| Điện nước | DXF | Vị trí hộp kỹ thuật, ống đứng | P2 |
| Chi tiết kiến trúc | DXF | **Không trích thành dữ liệu** — chỉ index làm thư viện block | P2 |
| Dự toán | XLSX | Khối lượng, đơn giá theo hạng mục | P1 nếu làm QTO |

### Đọc CAD — đọc vector, không dùng vision

```
.dwg → ODA File Converter → .dxf
     → ezdxf đọc entity/layer/hatch/text
     → shapely dựng polygon phòng từ layer tường
     → ghép nhãn phòng từ text entity gần nhất
     → LLM chuẩn hoá nhãn ("PN2" / "P.NGỦ 2" / "BEDROOM 2" → bedroom)
     → hàng chờ người xác nhận
```

Mô hình thị giác chỉ dùng cho **bản quét từ giấy** và **đọc bảng thống kê in trong bản vẽ**.
Với file vector, toạ độ là số thật — vision là suy đoán, đắt hơn hàng chục lần và kém
chính xác hơn.

Rào cản: quy ước layer không đồng nhất. Giải bằng bảng ánh xạ layer
(`kb/layer_mapping.yaml`), bổ sung dần theo thời kỳ và người vẽ. Vẫn rẻ hơn vision
nhiều lần.

### Dữ liệu quý nhất — và rủi ro lớn nhất

Thứ có giá trị nhất không phải bản vẽ, mà là **cặp (đầu bài → mặt bằng kết quả)**. Chỉ
có mặt bằng mà không biết đề bài thì không dạy được hệ thống *vì sao* lại bố trí như vậy.

**Rủi ro:** đầu bài cũ chủ yếu nằm trên Zalo và trao đổi miệng. Nhiều hồ sơ cũ sẽ có
bản vẽ mà thiếu đầu bài.

- Hồ sơ cũ: **TODO(người)** — KTS tái dựng đầu bài rút gọn, ~5–10 phút mỗi công trình
- Hồ sơ mới: Layer 1 chính là nơi ghi đầu bài, vấn đề tự hết. Đây là lý do kỹ thuật
  bổ sung để làm Layer 1 trước — nó vừa là sản phẩm vừa là máy thu thập dữ liệu

### Bước 2 — Hợp nhất và kiểm tra chéo tự động

Nối các trích xuất rời rạc thành một bản ghi công trình, rồi tự phát hiện mâu thuẫn:

- Tổng diện tích từ mặt bằng có khớp bảng thống kê không?
- Số tầng ở mặt cắt có khớp số bản vẽ mặt bằng không?
- Cột kết cấu có nằm trong tường của mặt bằng không?
- Chiều cao tầng ở mặt cắt có khớp mặt đứng không?

Mâu thuẫn → đánh dấu, đưa vào hàng chờ người. Bước này là nguồn của `quality_score`,
chạy tự động và loại phần lớn hồ sơ kém **trước khi** chúng làm hỏng kết quả truy hồi.

### Bước 3 — Tri thức ngầm (TODO(người))

"Lý do bố trí" không đọc được từ bản vẽ. Nhưng đừng bắt KTS viết luận.

Giao diện hiển thị mặt bằng đã trích + 5 câu hỏi có sẵn lựa chọn:

- Vì sao cầu thang đặt ở đây? *(bề rộng lô / lấy sáng giếng trời / phong thuỷ / khách yêu cầu / khác)*
- Vì sao bếp ở vị trí này?
- Ràng buộc lớn nhất của công trình này?
- Nếu làm lại sẽ đổi gì?
- Khách có hài lòng không? Thi công có phát sinh gì?

**10–15 phút/công trình** thay vì 1–2 giờ.

### Bước 4 — Phân hạng

Bắt buộc, để chi phí người không nổ theo quy mô.

| Hạng | Cách làm | Dùng để |
|---|---|---|
| **A** | Người annotation thủ công đầy đủ | Ví dụ tham chiếu, và là toàn bộ kho ở thời điểm hiện tại |
| **B** | Trích tự động + người xác nhận 10–15 phút | Dùng khi dòng dự án mới đủ lớn |
| **C** | Hoàn toàn tự động, không có người xem | Chỉ có ý nghĩa khi kho vượt vài trăm bộ |

**Ở quy mô hiện tại (<50 bộ): tất cả là hạng A.** Cấu trúc ba hạng giữ nguyên trong
schema vì kho sẽ lớn lên, nhưng đừng xây giao diện quản lý phân hạng khi chưa cần.

## 6.2 Schema bản ghi

```jsonc
{
  "schema_version": "1.0.0",
  "tenant_id": "…",
  "project_id": "…",                     // FK tới bảng dự án SẴN CÓ
  "project_code": "NVO-015",
  "tier": "B",                          // A | B | C
  "quality_score": 0.82,                // 0..1, sinh từ Bước 2
  "building_type": "nha_pho",

  "site": { "width_m": 5.0, "depth_m": 18.0, "orientation": "DN", "setback_m": {...} },
  "floors": 4,
  "family_archetype": "3_the_he",
  "style": "hien_dai",

  "floor_plans": [                       // hình học đã trích
    { "level": 1, "rooms": [ { "type": "living", "polygon": [...], "area_m2": 21.0 } ] }
  ],
  "slicing_tree": { ... },               // suy ngược từ hình học — dùng làm few-shot cho Layer 3a
  "structural_grid": { "axes_x_m": [...], "axes_y_m": [...] },
  "adjacency_graph": [ { "a": "…", "b": "…", "kind": "adjacent" } ],

  "rationale": {                         // Bước 3, có thể null
    "stair_position": "lay_sang_gieng_troi",
    "biggest_constraint": "…",
    "would_change": "…"
  },
  "outcome": { "client_satisfied": true, "construction_issues": [] },

  "rationale_embedding": [ ... ],        // pgvector, chỉ trên trường rationale
  "has_brief": true                      // có cặp đầu bài ↔ kết quả không
}
```

**`slicing_tree` là trường quan trọng nhất cho Layer 3a.** Few-shot phải đưa vào đúng
định dạng mà LLM cần sinh ra. Đưa toạ độ vào rồi mong LLM sinh cây là dạy sai.

Suy ngược cây từ hình học: đệ quy tìm đường cắt ngang/dọc chia mặt bằng thành hai phần
mà không cắt qua phòng nào. Nếu không tồn tại đường cắt như vậy (mặt bằng không thuộc
lớp slicing) thì đánh dấu `slicing_tree: null` và **hạ `quality_score`** — bản ghi đó
vẫn dùng được cho thống kê nhưng không dùng làm few-shot.

## 6.3 Truy hồi ba tầng

pgvector một mình **không đủ**: embedding văn bản mô tả công trình là tín hiệu yếu cho
việc tìm mặt bằng tương tự. Hai căn 5×18 bốn tầng mô tả gần giống nhau nhưng bố cục
hoàn toàn khác.

```
1. Lọc cứng (SQL)      building_type khớp tuyệt đối
                       floors ±1
                       quality_score ≥ ngưỡng
                       tier ∈ {A, B}          ← C không bao giờ vào few-shot

2. Lọc hình học (SQL)  width ±0.5m, depth ±2m
                       family_archetype, style

3. Xếp hạng            pgvector trên rationale_embedding
                       + khoảng cách đồ thị liền kề
                       + MMR (Maximal Marginal Relevance — thuật toán chọn kết quả vừa sát yêu cầu vừa khác nhau)
```

### Vì sao cần thuật toán chọn đa dạng

Ở quy mô nhỏ, bước 1–2 trả về 3–8 kết quả và dùng thẳng được. Khi kho lớn lên, bước
1–2 trả về 30–60 kết quả và **việc khó chuyển từ "có đủ dữ liệu không" sang "chọn 5
cái nào trong 60"**.

Nếu chỉ chọn 5 cái giống nhất, rất dễ được 5 căn gần trùng nhau → LLM chỉ thấy một
cách bố trí → 3–4 variant sinh ra sẽ na ná nhau. Thuật toán này lấy cái giống nhất, rồi lần lượt
lấy cái vừa sát đề bài vừa **khác** những cái đã chọn.

## 6.4 Thống kê thực nghiệm — dùng cả hạng C

Đây là thứ quy mô lớn thật sự mở khoá, và nó **không cần LLM**.

Tính sẵn (materialized view — bảng kết quả truy vấn được lưu sẵn, làm mới theo lịch):

- Phân bố diện tích từng loại phòng theo bề rộng lô và loại hình
- Tần suất vị trí lõi thang theo loại hình và số tầng
- Ma trận tần suất liền kề (bếp thường cạnh gì, phòng thờ thường ở đâu)
- Tỉ lệ diện tích giao thông trên diện tích sàn

**Nạp thẳng vào hàm mục tiêu của bộ giải CP-SAT** (`04-layer3-floorplan.md` mục 4.4). Thay vì
"phòng khách khoảng 22m² vì LLM đoán vậy", trở thành "tối thiểu sai lệch so với phân
bố thực tế của các công trình NVG". Tất định, rẻ, và là cách đưa "gu NVG" vào hệ thống
mà không phụ thuộc model nào.

Hồ sơ hạng C tham gia được vào đây dù không đủ chất lượng làm few-shot.

## 6.5 Về fine-tune

**Không làm ở giai đoạn này.** Kiến trúc solver + thống kê + truy hồi tốt lấy được
phần lớn giá trị với chi phí và rủi ro thấp hơn nhiều. Fine-tune chỉ cân nhắc sau khi
eval harness chứng minh ba thứ trên đã kịch trần.

## 6.6 Về hạ tầng ở quy mô lớn

Nhắc để tránh đầu tư thừa: **1.000 bản ghi là rất nhỏ với PostgreSQL.** Không cần chia
nhỏ cơ sở dữ liệu, không cần vector database riêng, chưa cần cả chỉ mục HNSW
(Hierarchical Navigable Small World — cấu trúc chỉ mục cho tìm kiếm vector) cho pgvector. Cái
thay đổi khi kho lớn lên là **chất lượng truy hồi** (mục 6.3), không phải hạ tầng.
