# Tài liệu Module Thiết kế AI — bản trong repo

Bộ 15 file trong thư mục này là **nguồn sự thật cho việc triển khai** module thiết kế
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

## ĐÍNH CHÍNH ĐỢT HAI — sau khi có hồ sơ thật (05/09/2026)

Sáu điểm trên là đối chiếu với **nền tảng kỹ thuật**. Năm điểm dưới là đối chiếu với **hồ sơ
thật của NVG**: hai bộ hồ sơ hoàn chỉnh nhận ngày 05/09/2026, tổng 265 tờ bản vẽ ba bộ môn.

**Chi tiết đầy đủ, kèm cách đo lại: `13-ho-so-thuc-te.md`.** Phần dưới chỉ là kết luận.

> **Khác Đ1–Đ6 ở một điểm: đợt này tài liệu gốc ĐÃ được sửa thẳng.** Sáu đính chính đầu chỉ ghi
> ở đây, tài liệu gốc để nguyên. Nhưng những câu bị hồ sơ thật bác bỏ là **mô tả sai về hiện
> trạng**, không phải khác biệt quan điểm — để nguyên thì lần đọc sau vẫn tin nhầm. Nên sáu câu
> cụ thể đã được sửa tại chỗ, mỗi chỗ kèm khối chú thích ghi rõ câu gốc là gì và vì sao sai:
>
> | File | Chỗ sửa |
> |---|---|
> | `06-knowledge-base` 6.1 | cây 9 thư mục · hai bước giải quyết phiên bản ở Bước 0 |
> | `03-data-contracts` 3.8b | "quy ước sẵn có của NVG" |
> | `05-tech-stack` 5.5 | quy ước tên file khi xuất DXF |
> | `12-ux-ui` 12.8 | quy ước tên file · bảng lớp DXF · phạm vi của tám yếu tố bắt buộc |
> | `11-design-flow` 11.5 | "Veras và Enscape" |
> | `08-milestones` Mốc 0.1 | điều kiện ra, cộng mục **thứ tự ưu tiên do Haan chốt 05/09/2026** |

### Đ7. Cây thư mục 9 mục không tồn tại

`06-knowledge-base` 6.1 mô tả "~10 nhóm tài liệu trong **9 thư mục** (`01_Đầu bài–khảo sát` →
`09_Điều chỉnh–hoàn công`)" và đặt quy tắc "file trong thư mục `08_Hồ sơ phát hành` được ưu
tiên tuyệt đối".

**Hồ sơ thật có 4 thư mục**, không thư mục nào mang tên đó, và không có thư mục phát hành
riêng. Bước 0 (giải quyết phiên bản) đang dựa vào một cây thư mục không tồn tại.

→ Phân loại thư mục phải là **dữ liệu khớp mẫu trong `kb/`**, không phải danh sách cứng.

### Đ8. Quy ước tên file `NVO026_NhaAnhA_KT_MatBang_V03_11082026` không phải hiện trạng

Bốn chỗ khẳng định quy ước này (`03-data-contracts` 3.8b · `05-tech-stack` 5.5 · `12-ux-ui`
12.8 · `11-design-flow` 11.6). Tên file thật không có số phiên bản, ngày đứng **trước**, và
**không nhất quán ngay trong cùng một hồ sơ** — ba file của một hồ sơ theo ba mẫu khác nhau.

→ Đọc quy ước đó là **quy ước MỚI cho bản vẽ hệ thống XUẤT ra**, không phải mô tả hồ sơ cũ.
Giải quyết phiên bản khi số hoá: băm nội dung → ngày ở đầu tên file → ngày trong ATTRIB khung
tên → xếp hàng chờ người xác nhận. **Không đoán.**

### Đ9. "Phòng là đa giác khép kín trên lớp ranh phòng" — sai với cách NVG vẽ

Đây là điểm nặng nhất, và nó nằm trong **mã nguồn** (`cad/extract.py`) chứ không chỉ trong tài
liệu.

Đã kiểm trên **cả hai tập kiến trúc**: không lớp nào trong 97 + 94 lớp khớp `*ROOM*BOUND*`,
`A-AREA*`, `*PHONG*RANH*` hay `KT-PHONG*`. Lý do sâu hơn chuyện đặt tên: **NVG đặt tên lớp theo
độ đậm nét khi in, không theo vật thể** — `NV-Thay` (thấy), `NV-Khuat` (khuất), `NV-Manh`
(mảnh), `NV-MoDam`, `NV-Cat`. Ba bộ môn còn dùng ba quy ước khác hẳn nhau (KT/DN có 94–120 lớp
kiểu `NV-*` và `!*`; KC dùng đúng 13–15 lớp kiểu `A1_ THÉP` … `A11_NÉT HATCH`).

Thêm hai chỗ hỏng cùng gốc: **83% hình học nằm trong block** mà trình trích xuất chỉ duyệt
`doc.modelspace()`; và **một DXF chứa cả 22–73 tờ xếp cạnh nhau** chứ không phải một tầng.

→ `06-knowledge-base` 6.1 **vốn đã kê đúng** (*"shapely dựng polygon phòng từ layer tường"*) —
chính mã nguồn mới là chỗ đi lệch. Đa giác phòng phải dựng từ **đồ thị tim tường**.

### Đ10. PDF không dùng được làm nguồn, và chữ trong bản vẽ là phông cũ

`06-knowledge-base` 6.1 viết "mô hình thị giác chỉ dùng cho bản quét từ giấy" — vẫn đúng, nhưng
nay nặng ký hơn nhiều: **3 trong 6 tập PDF là bản quét thuần ảnh**, không chứa một ký tự nào.

Ba tập còn lại dùng **phông TCVN3 8-bit**, phải giải mã ở mức byte mới đọc được. Trong file
DXF thì TCVN3 và Unicode **lẫn nhau ngay trong cùng một file, thậm chí cùng một loại thực thể**.

→ **`.dwg` là nguồn vector đáng tin duy nhất.** Sửa bảng mã phải làm theo từng chuỗi dựa trên
nội dung — giải mã mù quáng sẽ làm hỏng chuỗi vốn đã đúng.

### Đ11. NVG đã dùng công cụ dựng ảnh AI trong sản xuất

Ảnh phối cảnh của một hồ sơ mang tên `aicomplex_angle_*.jpg`, `aicomplex-edited-*.png`.
`11-design-flow` 11.4b giả định KTS dùng Veras và Enscape; Mốc 6 giả định engine tự sở hữu
`RenderBackend`.

→ Nhiều khả năng việc của engine là **cấp liệu** cho công cụ NVG đang dùng (ảnh khối trắng, bản
đồ độ sâu, bản đồ pháp tuyến), không phải sở hữu bộ dựng ảnh. Đây là một de-scope đáng kể cho
Mốc 6 — nhưng cần Haan xác nhận công cụ đó là gì trước (câu hỏi 1 ở `13-ho-so-thuc-te` 13.13).

**Hiện trạng 06/09/2026, để không phải dò lại.** Trong lúc chờ câu trả lời đó, tuyến
`layer5_render` đã chạy được bằng **Pollinations** (mô hình `kontext`, `POST /v1/images/edits`,
ảnh → ảnh, ~18–21 giây một ảnh). Đã thử và loại hai nhà cung cấp trước đó: **Gemini** (gói miễn
phí trả `limit: 0` cho mọi mô hình sinh ảnh) và **Hugging Face** (chạy được nhưng hạn mức miễn
phí chỉ đủ ba tới bốn ảnh một tháng).

Ba điều đáng nhớ, đúng cho mọi nhà cung cấp đã thử: mô hình **ảnh → ảnh** giữ đúng khối đã giải,
còn **chữ → ảnh** thì dựng một ngôi nhà khác nên vi phạm nguyên tắc bất biến 1 — đừng đổi sang
đường rẻ hơn ấy; lời dẫn phải viết **tiếng Anh** (lời dẫn tiếng Việt bị mô hình bỏ qua lặng lẽ,
không báo lỗi); và độ bám khối không tuyệt đối, nên nhãn cảnh báo do mã in lên ảnh là bắt buộc.

Nhà cung cấp, tên mô hình và địa chỉ endpoint đều là dữ liệu trong `config/models.yaml`, nên nếu
Đ11 dẫn tới kết luận de-scope thì việc bỏ tuyến này là gỡ một mục cấu hình, không phải viết lại
lớp gọi.

---

## NGUỒN DỮ LIỆU NỀN ĐÃ RÚT TỪ HỒ SƠ THẬT (06/09/2026)

Đính chính Đ7 → Đ11 nói tài liệu sai ở đâu. Mục này nói **thứ đã thay vào chỗ đó**: phần tri
thức rút khỏi hai hồ sơ và đưa vào `kb/` để dùng cho dự án sau. Đầy đủ ở
`13-ho-so-thuc-te.md` mục 13.15.

| Tệp `kb/` | Nội dung |
|---|---|
| `sheet_catalogue.yaml` (mới) | **47 loại tờ** của một bộ hồ sơ nhà ở — 16 kiến trúc, 21 kết cấu, 10 điện nước. Mỗi loại ghi engine được phép tự phát hành hay chỉ chuẩn bị nền |
| `title_block.yaml` (mới) | **Ba** họ quy ước khung tên, hai trong ba nằm ngay trong cùng một hồ sơ. Một họ đặt tên thẻ bằng chính chữ mặc định (`KT/01`), nên tra theo tên thẻ sẽ ra một danh mục mà mọi tờ trùng mã |
| `text_encoding.yaml` (mới) | Giải mã TCVN3: 74 mục + 49 ký tự dấu hiệu, và quy tắc suy bảng mã **theo kiểu chữ chứ không theo từng chuỗi** |
| `layer_mapping.yaml` (viết lại) | Tên lớp thật thay phỏng đoán chuẩn AIA; thêm `line_weight_layers` — lớp NVG đặt theo độ đậm nét khi in |
| `construction_norms.yaml` (sửa) | Kích thước cửa đo được, cao độ tầng, và quy ước "thông thủy hoàn thiện" |
| `room_vocabulary.yaml` (sửa) | Bí danh nguyên văn + quy tắc gỡ đuôi diện tích viết liền nhãn |

**Ranh giới ba tầng dữ liệu — đọc trước khi ghi thêm bất kỳ con số nào vào `kb/`:**

| Tầng | Ngưỡng mẫu | Hai hồ sơ này |
|---|---|---|
| Từ vựng, quy ước (tất định) | n = 1 | đủ, đã rút |
| Định mức, phân bố (thống kê) | 15 công trình | **không đủ** |
| Cặp đầu bài → phương án (few-shot) | vài chục | **không tồn tại trong kho** |

**Haan chốt 06/09/2026:** giai đoạn demo **không xin thêm hồ sơ** (bản thiết kế là thông tin
nhạy cảm) → tầng hai **đóng lại**, chuẩn diện tích phải do kiến trúc sư ấn định chứ không suy
từ dữ liệu (Q-18). Và **có** ghi lại bản vẽ phương án từ dự án tới → tầng ba bắt đầu tích luỹ,
với điều kiện bản phương án được lưu **kèm đầu bài của chính nó**.

---

## MÂU THUẪN BÊN TRONG BỘ TÀI LIỆU — cần Haan sửa bản gốc

| # | Chỗ 1 | Chỗ 2 | Đang xử lý thế nào |
|---|---|---|---|
| M1 | `05-tech-stack` 5.8: "Design system: **kế thừa của phần mềm quản trị** — đã loại: *không tạo ngôn ngữ thị giác riêng*" | `12-ux-ui` toàn bộ + `CLAUDE-design.md` ("token quản trị dùng cho khu vẽ → **CẤM**") + `02-architecture` 2.9 ("giao diện có hệ thị giác riêng") | `12-ux-ui` tự nhận là nguồn sự thật thị giác nên nó thắng. **Dòng ở 5.8 phải sửa**, nếu không lần đọc sau sẽ hiểu ngược |
| M2 | `09-open-questions` D4: "phần mềm chưa chạy thật → **không cần di trú dữ liệu**" | `03-data-contracts` 3.1 + `08-milestones` Mốc 2: "**phải có script di trú** phiếu cũ sang `design_brief`" + "kiểm kê và chuyển các module khác" | Ngoài phạm vi Mốc 0+1. Ghi thành câu hỏi Q-2 |
| M3 | `04-layer3-floorplan` 4.6 mô tả tầng kiểm tra nhanh "Rust→WebAssembly trong trình duyệt" như một tầng đang có | D12 + `02-architecture` 2.9 + `05-tech-stack` 5.8: WASM **hoãn sau Giai đoạn 1** | Không làm WASM. Giai đoạn 1 kiểm tra trên máy chủ |
| M4 | `12-ux-ui` 12.8 bảng "Ánh xạ sang lớp DXF khi xuất": `KT-CUA`, `KT-CUASO`, `KT-THANG`, `KT-KICHTHUOC`, `KT-GHICHU`, `KT-NOITHAT`, `KT-CANHQUAN` | `kb/layer_mapping.yaml` mục `export:` đang xuất `KT-CUA-DI`, `KT-CUA-SO`, `KT-PHONG`, `KT-TEXT`, `KT-THONG-TANG` — và năm lớp kia **không tồn tại ở cả hai nơi** | Hai bảng cùng tự nhận là hợp đồng giữa giao diện và bộ xuất CAD. Phải chốt một. Cân nhắc dùng thẳng quy ước `NV-*` của NVG (xem Đ9) — câu hỏi 5 ở `13-ho-so-thuc-te` 13.13 |

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
| Địa phương | ~~Thái Bình → `rules/locality/thai-binh/`~~ — **đã hết hiệu lực 29/08/2026** (Q-8). Thái Bình đã sáp nhập vào **Hưng Yên**; biểu mẫu đầu bài cho chọn đủ 34 đơn vị hành chính. Mọi giá trị dẫn QCVN 01:2021/BXD nằm ở `rules/base/`; `rules/locality/` **rỗng có chủ đích** cho tới khi có tỉnh gửi văn bản quy hoạch để trích vào khoá `source` |

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
| Không biết làm gì tiếp | **`14-phuong-an-demo`** (phương án demo đã chốt và thi hành 06/09/2026; mục 14.10 ghi gì còn khác) rồi `08-milestones` |
| Gặp viết tắt lạ | `10-glossary` |
| Làm phần số hoá hồ sơ cũ, hoặc bộ xuất CAD | **`13-ho-so-thuc-te`** — hồ sơ thật của NVG chứa gì, đo được, và chỗ nào tài liệu này sai |
| Gặp chỗ chưa rõ | `09-open-questions`, rồi `TIEN_DO_THIET_KE.html` phần Câu hỏi |

Tiến độ và vướng mắc: **`TIEN_DO_THIET_KE.html`** ở gốc repo.
