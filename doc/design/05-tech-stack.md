# 05 — Tech stack

Quyết định đã chốt. Cột "Đã loại" ghi lựa chọn đã cân nhắc và lý do bỏ — đọc trước khi
định đề xuất lại.

Bối cảnh chi phối mọi lựa chọn: module nằm trong phần mềm quản trị Nhà Việt Group đã có, chạy trên
Cloudflare, và có hai runtime (xem `02-architecture.md`).

## 5.1 Nền tảng — kế thừa từ phần mềm quản trị

| Vai trò | CHỐT | Ghi chú |
|---|---|---|
| Frontend + API | Next.js / TypeScript trên Cloudflare Workers | Kế thừa, không đổi |
| Database | Supabase PostgreSQL + pgvector | Dùng chung, bảng module prefix `design_` |
| Xác thực + phân quyền | Supabase Auth + RLS (Row Level Security — phân quyền mức từng dòng dữ liệu) | Dùng chung. Không định nghĩa vai trò riêng |
| File storage | Cloudflare R2 | Dùng chung |
| Điều phối | **Cloudflare Workflows + Queues** | Đã loại Hatchet, Celery, Redis — không thêm hạ tầng khi đã ở trên Cloudflare |
| Lõi tính toán | **Cloudflare Containers** (Python) | Workers không chạy được native extension. Xem giới hạn ở 5.2 |

## 5.2 Container Python — giới hạn và hệ quả

| Giới hạn | Hệ quả |
|---|---|
| ~0,5 vCPU (virtual CPU) mỗi instance | Bộ giải CP-SAT chạy `num_search_workers=1`. Timeout rõ ràng. **Đo ở Mốc 0** |
| 4 GiB RAM | Đủ nhà phố; biệt thự nhiều wing cần đo lại |
| Đĩa ephemeral (xoá sạch mỗi lần chạy) | Công cụ chuyển đổi ODA (Open Design Alliance) và tài nguyên nằm trong image. Không cache giữa các lần gọi |
| Linux/amd64 | Build image đúng kiến trúc |
| Tính theo CPU thực dùng | Hợp workload nhàn rỗi — đúng hồ sơ NVG (10–15 thiết kế/tháng) |

**Container không giữ trạng thái (stateless), không dùng API đặc thù Cloudflare bên trong.** Nếu Mốc 0 cho thấy
nửa vCPU quá chậm thì chuyển sang VPS/Fly/Railway chỉ là đổi chỗ deploy.

## 5.3 Contract

| Vai trò | CHỐT | Đã loại |
|---|---|---|
| Nguồn schema | **JSON Schema** trong `packages/contracts/` | Pydantic làm gốc: không sinh ngược sang TS tốt. Viết tay hai bên: chắc chắn lệch |
| Sinh mã TypeScript | `json-schema-to-zod` → zod + kiểu dữ liệu | — |
| Sinh Python | `datamodel-code-generator` → Pydantic v2 | — |
| Kiểm tra | Hệ thống tích hợp liên tục (CI — Continuous Integration) báo lỗi nếu mã sinh ra lệch schema | — |

## 5.4 Solver và hình học — trong Container

| Vai trò | CHỐT | Giấy phép | Đã loại — lý do |
|---|---|---|---|
| Constraint solver | **OR-Tools CP-SAT** | Apache 2.0 | `scipy.optimize`: không xử lý biến nguyên/ràng buộc tổ hợp, kẹt nghiệm cục bộ, **không giải thích được vô nghiệm**. Simulated annealing/GA: chậm, không tất định |
| Giải thích vô nghiệm | CP-SAT assumptions (Z3 nếu cần bổ trợ) | Apache 2.0 / MIT | — |
| Polygon 2D | `shapely` | BSD | — |
| Dựng hình ba chiều | `trimesh` → glTF (Graphics Language Transmission Format) | MIT | `bpy` làm generator: trói vào Blender, khó test. `build123d`/OpenCASCADE: chính xác hơn nhưng nặng — **giữ làm đường nâng cấp nếu sau này bắt buộc xuất IFC (Industry Foundation Classes)** |
| Mặt cắt | `trimesh.section()` | MIT | — |
| Clay render + depth/normal map | Blender headless đọc glTF | GPL (chạy như tool ngoài) | Cân nhắc kích thước image — Blender nặng. Nếu vượt giới hạn container thì tách sang backend render |

## 5.5 CAD — trong Container

| Vai trò | CHỐT | Giấy phép |
|---|---|---|
| Đọc/ghi DXF (Drawing Exchange Format) | `ezdxf` | MIT |
| DWG (định dạng gốc AutoCAD) → DXF | ODA File Converter, đóng gói trong image | Miễn phí |
| IFC | `IfcOpenShell` — **chưa dùng** | LGPL |

Chưa xuất IFC ở giai đoạn này, **nhưng giữ mô hình dữ liệu nội bộ theo ngữ nghĩa IFC**
(IfcSpace / IfcWall / IfcDoor). Rẻ bây giờ, rất đắt nếu phải retrofit.

**Bắt buộc khi xuất DXF:** khung tên và mã phiên bản theo quy ước NVG
(`NVO026_NhaAnhA_KT_MatBang_V03_11082026`), khổ A3 (A1/A2 cho tổng mặt bằng). Số phiên
bản do hệ tài liệu cấp qua publish bridge, không tự đặt.

## 5.6 LLM — trong Worker

| Vai trò | CHỐT |
|---|---|
| Nơi gọi | **Worker (TypeScript)**. Container không gọi mô hình ngôn ngữ |
| Định tuyến | Router đọc `config/models.yaml`. Model **không bao giờ là hằng số trong code** |
| Dev/test | Gói miễn phí, **chỉ dữ liệu giả lập hoặc ẩn danh** |
| Production | Chốt sau bằng eval harness, không bằng cảm tính |
| Trích xuất có cấu trúc | Tool use / structured output, **không** prompt tự do rồi parse JSON |
| Tối ưu chi phí | Prompt caching (phần tĩnh trước, động sau); Batch API cho regenerate không tương tác |

```yaml
# config/models.yaml
layer1_brief:       { provider: "…", model: "…", max_data_class: 1 }
layer2_program:     { provider: "…", model: "…", max_data_class: 1 }
layer3_intent:      { provider: "…", model: "…", max_data_class: 2 }
layer3_intent_hard: { provider: "…", model: "…", max_data_class: 2 }
layer4_facade:      { provider: "…", model: "…", max_data_class: 2 }
kb_label_normalize: { provider: "…", model: "…", max_data_class: 2 }
```

`max_data_class` để lớp kiểm tra chặn dữ liệu nhạy cảm tới endpoint không đủ điều kiện
(`01-overview.md` mục 1.5).

## 5.7 Sinh ảnh — ngoài phạm vi Giai đoạn 1

Chốt **định dạng workflow**, chưa chốt nơi chạy và model.

**ComfyUI làm định dạng workflow** vì file JSON chạy được như nhau trên máy trạm văn
phòng, máy chủ thuê và dịch vụ API. Bọc sau interface `RenderBackend`. Preset phong cách
của KTS trở thành artifact có phiên bản, không phải cấu hình ẩn trong đầu một người.

### So sánh model (khảo sát tới 08/2026 — kiểm chứng lại khi triển khai)

| Model | Kiểm soát hình học | Giấy phép thương mại |
|---|---|---|
| SDXL (Stable Diffusion XL) + ControlNet (kỹ thuật ép mô hình bám theo hình học cho trước) | Rất tốt, hệ sinh thái ControlNet chín nhất | Cho phép (CreativeML Open RAIL++-M) |
| SD 3.5 | Rất tốt | **Đọc kỹ** ngưỡng doanh thu trong Stability Community License |
| FLUX.2 [dev] | Chất lượng cao nhất nhóm mở | **Cần giấy phép thương mại riêng** |
| FLUX.2 [klein] | Tốt | Cho phép (Apache 2.0) |
| **Qwen-Image-Edit** | Tốt, hỗ trợ dẫn hướng theo bản đồ độ sâu, đường biên và điểm mốc; **mạnh nhất về chỉnh sửa** | Cho phép (Apache 2.0) |

Vì module chuẩn bị bán lại cho khách khác, **ưu tiên model giấy phép Apache 2.0** — giấy
phép cần riêng cho từng khách hàng là gánh nặng thương mại.

### Nơi chạy — CHỐT: dịch vụ API trả theo ảnh (D25)

Khối lượng: 10–15 thiết kế/tháng × 12–18 ảnh ≈ **1,5–2,5 giờ GPU (Graphics Processing
Unit — bộ xử lý đồ hoạ)/tháng**.

Ở quy mô này **tiền không phải vấn đề, công sức vận hành mới là**. Hoá đơn máy chủ thuê
có thể chỉ vài USD/tháng, nhưng lưu trữ model 30–50GB bị tính 24/7, mỗi lần chạy đều là
khởi động nguội 30–60 giây và bị tính tiền, còn công sức đóng gói và bảo trì là chi phí
cố định không giảm theo khối lượng.

**Lý do chốt API:** tính năng thiết kế AI sẽ mở cho khách trên website (D18), nên tải
không đoán trước được. Không thể để trải nghiệm khách vãng lai phụ thuộc một máy trạm
trong văn phòng có bật hay không. Cộng với việc vận hành theo hợp đồng bảo trì, không có
người trực (D19) — tự dựng hạ tầng GPU là gánh nặng không tương xứng.

Vẫn code sau `RenderBackend` để đổi được. Hai đường dự phòng nếu về sau muốn giảm chi phí:

- **Máy trạm tại văn phòng NVG** cho công việc nội bộ — chi phí biên gần 0, không khởi
  động nguội, dữ liệu không rời văn phòng. Cần biết dung lượng VRAM (Video RAM — bộ nhớ card đồ hoạ), địa chỉ IP tĩnh hay động, ai bảo trì
- **Máy chủ thuê serverless** khi khối lượng đủ lớn để bù chi phí vận hành

## 5.8 Frontend

| Vai trò | CHỐT | Đã loại |
|---|---|---|
| Floor plan editor | **Konva.js + react-konva** (MIT) | PixiJS: WebGL thừa cho vài chục object. Canvas thuần: phải tự viết hit-testing |
| 3D viewer | Three.js, **chỉ đọc glTF** | Dựng hình phía client: hai bản logic |
| Form | `react-hook-form` + zod sinh từ contract | — |
| Kiểm tra tức thời khi kéo thả | **Kiểm tra trên máy chủ (Giai đoạn 1)** | Rust biên dịch sang WebAssembly: **hoãn** — tạo bản thực thi rule thứ ba. Thêm sau nếu độ trễ thành vấn đề thật |
| Design system | Kế thừa của phần mềm quản trị | Không tạo ngôn ngữ thị giác riêng |

## 5.9 Test và đo lường

| Vai trò | CHỐT |
|---|---|
| Test TS | `vitest` |
| Test Python | `pytest` + `hypothesis` cho property test |
| Eval harness | Bảng metrics trong Postgres. Chi tiết `08-milestones.md` |
| Theo dõi chi tiết lời gọi mô hình ngôn ngữ (nếu cần) | Langfuse — **tự vận hành trên hạ tầng của mình** để phù hợp chính sách dữ liệu |
