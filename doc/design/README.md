# Tài liệu Module Thiết kế AI — bản trong repo

Bộ 14 file trong thư mục này là **nguồn sự thật cho việc triển khai** module thiết kế
(TK-10 → TK-17). Nó thắng các bản trình bày cho khách hàng
(`AI_Preliminary_Design_Engine_*.docx`, PDF `Phuong_An_v2`) nằm ngoài repo.

Bản gốc: `/home/haan/Documents/Doc/NVG/design/files/`. Copy vào đây ngày **28/08/2026** để
thoả điều kiện của `CLAUDE.md` mục 5.6 và `BUILD_PLAN.md` Phase 5 — không được viết code
TK-10→TK-17 trước khi tài liệu đặc tả nằm trong repo và đã được đọc.

> `CLAUDE-design.md` là file `CLAUDE.md` của bộ tài liệu gốc, đổi tên để không lẫn với
> `CLAUDE.md` ở gốc repo. Nội dung giữ nguyên.

## Thứ tự ưu tiên khi mâu thuẫn

```
PRD > AFD > TSD > CGD > BSD > IPD          ← 6 tài liệu nghiệp vụ ở doc/
```

Bộ tài liệu thiết kế này **chỉ áp dụng cho phạm vi TK-10 → TK-17**. Trong phạm vi đó nó là
nguồn đầy đủ hơn PRD (chính PRD mục 5 nói vậy). Ngoài phạm vi đó, thứ tự trên vẫn giữ.

Khi bộ này mâu thuẫn với hiện trạng hệ thống, xem bảng đính chính dưới **trước khi** làm
theo tài liệu.

---

## ĐÍNH CHÍNH — đọc trước, đừng làm theo nguyên văn

Bộ tài liệu được soạn với một số giả định sai về nền tảng đang có, và một số thông tin
Cloudflare đã lỗi thời. Sáu chỗ dưới đây đã được đối chiếu với mã nguồn và tài liệu
Cloudflare ngày 28/08/2026.

### Đ1. "Next.js" → thực tế là Vite SPA

Tài liệu ghi "Next.js / TypeScript trên Cloudflare Workers — **kế thừa, không đổi**"
(`09-open-questions` D2, `02-architecture` 2.1/2.7, `05-tech-stack` 5.1).

**Sai.** Phần mềm quản trị NVG là **React 18 + Vite 8, kiến trúc SPA, không SSR**
(`web/vite.config.ts`). Next.js và SSR đã bị loại tường minh ở TSD mục 6.

Không nội dung nào của module thật sự cần Next.js — không SEO, không SSR, không React
Server Components. Đọc mọi câu "Next.js" thành **"SPA Vite + Worker Hono"**.

### Đ2. Cấu trúc thư mục

Tài liệu giả định monorepo `apps/ services/ packages/`. Repo là **npm workspaces phẳng**.

| Tài liệu | Repo |
|---|---|
| `packages/contracts/*.schema.json` | `contracts/` ở gốc |
| → sinh zod | `shared/src/design/` |
| → sinh Pydantic | `compute/src/design_compute/` |
| `apps/web/src/modules/design/` | `workers/src/design/` (API, LLM, artifact, workflow) |
| `services/design-compute/` | `compute/` ở gốc — Python, không phải npm workspace |
| `rules/`, `config/models.yaml`, `tests/golden/` | giữ nguyên ở gốc |

### Đ3. "~0,5 vCPU, 4 GiB" KHÔNG phải giới hạn cứng của nền tảng

Tài liệu coi đây là ràng buộc phần cứng và xây cả Mốc 0.2 quanh nó ("nếu nửa vCPU quá chậm
thì chuyển container sang VPS" — `02-architecture` 2.2, `05-tech-stack` 5.2,
`04-layer3-floorplan` 4.4).

Cloudflare Containers hiện có **sáu hạng** cộng custom instance type mở cho mọi tài khoản:

| Hạng | vCPU | RAM | Đĩa |
|---|---|---|---|
| `lite` | 1/16 | 256 MiB | 2 GB |
| `basic` | 1/4 | 1 GiB | 4 GB |
| `standard-1` | 1/2 | 4 GiB | 8 GB |
| `standard-2` | 1 | 6 GiB | 12 GB |
| `standard-3` | 2 | 8 GiB | 16 GB |
| `standard-4` | 4 | 12 GiB | 20 GB |

Con số tài liệu dùng đúng bằng `standard-1`. Hệ quả: `num_search_workers=1` là **lựa chọn
tiết kiệm, không phải ràng buộc**, và kịch bản "đo thấy chậm thì phải chuyển VPS" mất phần
lớn lý do tồn tại — nâng hạng instance là đủ.

### Đ4. Worker gọi Container KHÔNG qua "service binding"

Tài liệu viết "Worker → Container qua service binding (HTTP)" (`CLAUDE-design.md`,
`02-architecture` 2.2).

Thực tế Cloudflare Containers đi qua **Durable Object binding**: khai `containers[]` +
`durable_objects.bindings` + `migrations.new_sqlite_classes` trong wrangler, gọi bằng
`getContainer(env.DESIGN_COMPUTE, id).fetch(...)` từ gói `@cloudflare/containers`.

Khác về cấu hình, **không khác về kiến trúc** — ranh giới runtime vẫn y nguyên.

### Đ5. Containers không có trên gói Workers Free

Bảng giá Cloudflare ghi Containers là `N/A` trên gói Free; cần **Workers Paid** (tối thiểu
5 USD/tháng).

**Quyết định của Haan (28/08/2026): giữ gói Free trong giai đoạn dev.** Nên:

- `compute/` chạy bằng **Docker tại chỗ** (`docker run -p 8080:8080`); Worker gọi qua HTTP
  tới `localhost:8080`. Chỗ gọi bọc sau interface `ComputeBackend`, khi nâng gói chỉ đổi
  một file sang adapter `getContainer()`.
- Điều này **không đi chệch tài liệu** — chính tài liệu bắt container phải stateless và
  không dùng API đặc thù Cloudflare, mục đích là để đổi chỗ deploy dễ.
- Hệ quả: `solve_time` của Mốc 0.2 đo trên máy, **chưa phải phép đo trên hạ tầng thật**.
  Ghi nợ ở phần Vướng mắc của `TIEN_DO_THIET_KE.html`.

### Đ6. Lưu trữ artifact — R2 chưa bật

Tài liệu ghi Cloudflare R2 và nói "**dùng chung**" (`02-architecture` 2.7, `05-tech-stack`
5.1, `payload_uri: "r2://…"` trong `03-data-contracts`).

**Sai ở chữ "dùng chung".** Repo chưa hề dùng R2; TSD mục 6 đã loại R2 để chọn Supabase
Storage. Thực tế **cả hai đều chưa dùng**: không có bucket nào, không có dòng code upload
nào, `document_versions.file_url` hiện là chuỗi bịa.

Quyết định: **R2 cho artifact** (dữ liệu máy đọc) + **Supabase Storage cho hồ sơ phát
hành** (đi qua `documents`/`document_versions` đã có RLS và cơ chế phiên bản). Vì đang giữ
gói Free, cài đặt qua interface `ArtifactStore` với adapter `supabase://` dùng ngay và
adapter `r2://` viết sẵn.

---

## MÂU THUẪN BÊN TRONG BỘ TÀI LIỆU — cần Haan sửa bản gốc

| # | Chỗ 1 | Chỗ 2 | Đang xử lý thế nào |
|---|---|---|---|
| M1 | `05-tech-stack` 5.8: "Design system: **kế thừa của phần mềm quản trị** — đã loại: *không tạo ngôn ngữ thị giác riêng*" | `12-ux-ui` toàn bộ + `CLAUDE-design.md` ("token quản trị dùng cho khu vẽ → **CẤM**") + `02-architecture` 2.9 ("giao diện có hệ thị giác riêng") | `12-ux-ui` tự nhận là nguồn sự thật thị giác nên nó thắng. **Dòng ở 5.8 phải sửa**, nếu không lần đọc sau sẽ hiểu ngược |
| M2 | `09-open-questions` D4: "phần mềm chưa chạy thật → **không cần di trú dữ liệu**" | `03-data-contracts` 3.1 + `08-milestones` Mốc 2: "**phải có script di trú** phiếu cũ sang `design_brief`" + "kiểm kê và chuyển các module khác" | Ngoài phạm vi Mốc 0+1. Ghi thành câu hỏi Q-2 |
| M3 | `04-layer3-floorplan` 4.6 mô tả tầng kiểm tra nhanh "Rust→WebAssembly trong trình duyệt" như một tầng đang có | D12 + `02-architecture` 2.9 + `05-tech-stack` 5.8: WASM **hoãn sau Giai đoạn 1** | Không làm WASM. Giai đoạn 1 kiểm tra trên máy chủ |

---

## ÁNH XẠ SANG HỆ THỐNG ĐANG CHẠY

Những khái niệm của tài liệu đã có sẵn tương đương trong hệ thống — **dùng lại, không tạo
mới**.

| Tài liệu | Hệ thống đang chạy |
|---|---|
| `projects(id)` | **`design_projects`** (`db/src/schema/tk.ts`) — có `company_id NOT NULL`, `code` dạng `NVO-TK-2026-0001` |
| `users(id)` | `users` — khoá chính `id uuid` riêng, nối `auth.users` qua `auth_user_id` |
| Hệ quản lý tài liệu có phiên bản | `documents` + `document_versions` + RPC `publish_document_version`; đã có `version`, `is_current_version` và ràng buộc một bản hiệu lực ở tầng CSDL |
| `discipline: KT / KC / DN` | enum **`design_discipline`** = `phuong_an, kien_truc, ket_cau, dien_nuoc`. Ánh xạ: **KT→`kien_truc`, KC→`ket_cau`, DN→`dien_nuoc`**. Dùng lại enum này, không tạo từ vựng thứ hai |
| Vai trò `architect` / `design_lead` / `sales` / `executive` | `TKE` / `TKE` có `can_approve` / `KD` / `TGD`+`BGD`+`CFO`. Vai trò `guest` **chưa tồn tại** — hệ thống không có anon access |
| Quyền chuỗi `design.publish.<bộ môn>` | Ma trận `permissions` hiện chỉ tới mức module. Thêm bảng **`role_capabilities(role_id, capability)`** riêng cho `design.*`; ma trận cũ giữ nguyên cho 12 module đang chạy |
| `tenant_id` | Chưa có ở bất kỳ bảng nào trong 91 bảng. Bảng module thiết kế mang **cả `tenant_id` lẫn `company_id`** — `tenant_id` để giữ đúng D8 và sẵn sàng bán lại, `company_id` để artifact truy được về pháp nhân (yêu cầu của `CLAUDE.md` 3.5) |
| Địa phương | **Thái Bình** và các tỉnh lân cận → `rules/locality/thai-binh/`. Pack `base/` lấy từ QCVN 01:2021/BXD |

---

## ĐỌC GÌ TRƯỚC

| Đang làm gì | Đọc |
|---|---|
| Mới vào | `01-overview` → `02-architecture` → `03-data-contracts` |
| Nhìn tổng thể nhanh | Sơ đồ ở `02-architecture` 2.0; luồng ở `11-design-flow` |
| Viết code bất kỳ layer nào | `03-data-contracts` (bắt buộc) |
| Làm Layer 3 (mặt bằng) | `04-layer3-floorplan` — phần khó nhất |
| Viết giao diện | `12-ux-ui` (bắt buộc) |
| Thêm/sửa quy tắc kiến trúc | `07-rule-pack` |
| Không biết làm gì tiếp | `08-milestones` |
| Gặp viết tắt lạ | `10-glossary` |
| Gặp chỗ chưa rõ | `09-open-questions`, rồi `TIEN_DO_THIET_KE.html` phần Câu hỏi |

Tiến độ và vướng mắc: **`TIEN_DO_THIET_KE.html`** ở gốc repo.
