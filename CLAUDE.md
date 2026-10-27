# CLAUDE.md — Hệ thống Phần mềm Quản trị Nhà Việt Group (NVG)

> File này là **bản đồ + hàng rào**, không thay thế tài liệu. Mọi khẳng định truy được về tài liệu
> gốc trong `doc/` (mã tài liệu + số mục). Cần chi tiết thì **đọc tài liệu gốc**.
>
> Tách ra tệp riêng cho gọn: **`doc/VAN_DE_CON_MO.md`** (câu hỏi chờ NVG) ·
> **`doc/design/QUYET_DINH_AI.md`** (nhật ký quyết định T1→T66 của module Thiết kế AI).

---

## 1. Dự án là gì

Hệ thống quản trị nội bộ (web) cho **Nhà Việt Group** — 3 pháp nhân + Back Office dùng chung:

| Pháp nhân                | Mảng                                                    | Quy mô            |
| ------------------------ | ------------------------------------------------------- | ----------------- |
| **NVC** — Nhà Việt Cons  | Nhà xưởng công nghiệp, tổng thầu                        | ~30 dự án/năm     |
| **NVO** — Nhà Việt One   | Thiết kế + thi công trọn gói nhà ở dân dụng             | ~70 dự án/năm     |
| **NVS** — Nhà Việt Steel | Sản xuất, thương mại, cho thuê giàn giáo/kết cấu thép   | ~700 đơn hàng/năm |
| **Back Office**          | Hành chính–Nhân sự, Cung ứng–Vật tư, Kế toán, Tài chính | dùng chung        |

~40 nhân sự văn phòng/ban công trường + 50–200 lao động thời vụ. Hiện vận hành thủ công trên
Excel / Word / Zalo / Google Drive — không có nguồn dữ liệu chung (PRD 1.2).

**12 module**: `NEN` nền tảng · `CRM` · `DA` dự án–đấu thầu · `TK` thiết kế · `HD` hợp đồng ·
`TC` thi công–ngân sách · `MH` mua hàng · `KHO` · `KT` kế toán–tài chính · `NS` nhân sự ·
`BC` báo cáo · `SX` sản xuất–cho thuê giàn giáo. Mục tiêu: bản **demo ~95% hoàn chỉnh**, 3 giai đoạn (PRD 4).

> **KHÔNG ghi mốc thời gian vào tài liệu dự án** (QĐ-1). Chỉ cam kết **THỨ TỰ** và **TIÊU CHÍ
> HOÀN THÀNH**. Ngoại lệ: định dạng ngày `dd/mm/yyyy` cho giao diện (CGD 4.3).

---

## 2. Tài liệu

Tài liệu nguồn nằm trong `doc/` dạng `.docx`:

| Mã      | File                                        | Trả lời câu hỏi                   |
| ------- | ------------------------------------------- | --------------------------------- |
| **PRD** | `PRD_He_thong_Quan_tri_NVG_v1_4.docx`       | Làm **GÌ**, ranh giới KHÔNG làm   |
| **AFD** | `Webapp_Flow_Document_NVG_v1_1.docx`        | Màn hình, điều hướng, hành trình  |
| **TSD** | `TechStack_Document_NVG_v1_2.docx`          | Thư viện, hạ tầng, CI/CD          |
| **CGD** | `ContentGuidelines_Document_NVG_v1_2.docx`  | Microcopy, màu, font, khoảng cách |
| **BSD** | `BackendSchema_Document_NVG_v1_1.docx`      | Bảng, quan hệ, RLS, API tùy chỉnh |
| **IPD** | `ImplementationPlan_Document_NVG_v1_1.docx` | Thứ tự khối công việc, deploy     |

- **Đọc `doc/CHANGELOG_NVG_docs.md` TRƯỚC** — bản đối chiếu trước–sau của đợt tài liệu v1.4 và sáu
  quyết định gốc QĐ-1→QĐ-6. Đổi nhiều nhất: TC 8→20 yêu cầu, SX 3→22, BSD ~65→~95 thực thể.
- **Hồ sơ khảo sát** `doc/khao-sat/HoSo_KhaoSat_NVG_full.md` (12 bộ phận) là **dữ liệu thô, đứng dưới
  PRD**. Lệch với PRD thì PRD thắng — nhưng **báo Haan**. Trước khi động vào TC/SX đọc mục 3, 6, 7 của
  phiếu (mục 7 = việc người dùng nói KHÔNG nên đưa lên phần mềm). Ô trống `[...]` là câu hỏi cho Haan.
- Đọc `.docx`: `python3 doc/docx2md.py "doc/<file>.docx" | sed -n '190,290p'`
- **Thứ tự ưu tiên khi mâu thuẫn**: `PRD > AFD > TSD > CGD > BSD > IPD`. Gặp mâu thuẫn thật: theo thứ
  tự đó **và báo Haan** — không tự chọn rồi im lặng.

---

## 3. Architecture

### 3.1 Backend hai lớp — quy tắc quan trọng nhất (TSD 3.2, BSD 1.3)

| Lớp                           | Công nghệ                                 | Dùng cho                                      |
| ----------------------------- | ----------------------------------------- | --------------------------------------------- |
| **Nền tảng dữ liệu**          | Supabase — REST tự sinh (PostgREST) + RLS | CRUD thường: danh sách, chi tiết, lọc, sửa    |
| **Logic nghiệp vụ tùy chỉnh** | Cloudflare Workers + Hono                 | Nghiệp vụ nhiều bước không diễn đạt bằng CRUD |

Chỉ đọc/ghi 1–vài bảng và quyền diễn đạt được bằng RLS → **gọi thẳng Supabase, KHÔNG viết API**.
Chỉ tạo endpoint Workers khi: (a) gọi dịch vụ ngoài, (b) ghi nhiều bảng phải toàn vẹn, hoặc
(c) quy tắc phức tạp hơn RLS. Endpoint đã đặc tả: **BSD 4.1 → 4.12** — không tự phát minh cái tương đương.

### 3.2 Stack (TSD 1.4)

- **React 18 + TypeScript + Vite, SPA** (KHÔNG Next.js/SSR) · Tailwind + shadcn/ui + Lucide + Recharts
- TanStack Query + Zustand + `@supabase/supabase-js` · React Hook Form + Zod (dùng chung 2 lớp)
- PWA toàn ứng dụng (`vite-plugin-pwa`); Dexie.js chỉ khi làm offline thật cho Kho/công trường
- Cloudflare Workers + Hono (REST/JSON) · PostgreSQL trên Supabase · Drizzle ORM + `drizzle-kit`
- Supabase Auth / Storage / Realtime · Cron Triggers + Queues cho tác vụ nền
- Hosting: frontend = **Workers Static Assets** (không phải Pages), backend = Worker riêng
- Vitest + React Testing Library + Playwright

### 3.3 Cấu trúc thư mục (monorepo)

```
NVG/
├── doc/        # tài liệu .docx + docx2md.py — KHÔNG sửa nội dung; design/ = đặc tả Thiết kế AI; khao-sat/
├── web/        # React + Vite (SPA)
├── workers/    # Cloudflare Workers + Hono — API tùy chỉnh, cron, queue
├── db/         # Drizzle schema + migration (nguồn duy nhất của cấu trúc bảng)
├── shared/     # Zod schema, type, hằng số nghiệp vụ dùng chung web/ + workers/
└── compute/ contracts/ rules/ kb/ config/   # module Thiết kế AI — xem mục 8
```

### 3.4 Phân quyền = RLS trong Postgres (TSD 3.3, BSD 3.3)

Quyền viết **thành policy trong CSDL**, không kiểm ở UI hay API. Mỗi bảng áp **đúng một** trong 5 mẫu:

| Mẫu                            | Logic                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **A** — theo pháp nhân         | Chỉ thấy dòng có `company_id` thuộc pháp nhân của người dùng; BGĐ/Admin thấy tất cả                  |
| **B** — người chịu trách nhiệm | A + chỉ người chịu trách nhiệm/phối hợp/quản lý trực tiếp mới sửa                                    |
| **C** — hạn mức phê duyệt      | Hiện trong Hộp thư Phê duyệt và cho duyệt nếu giá trị trong hạn mức (`approval_limits`)              |
| **D** — hạn chế theo CỘT       | Cột nhạy cảm (giá vốn, lợi nhuận, lương) chỉ trả giá trị thật cho vai trò được phép, qua view riêng  |
| **E** — phạm vi hiện trường    | Chỉ dữ liệu công trình/xưởng được phân công (`user_site_assignments`); áp cả khi ghi đồng bộ offline |

- Mọi lượt xem/sửa dữ liệu Mẫu D ghi vào `sensitive_access_logs` (NEN-07). Nhóm ai-được-xem sửa ở
  một chỗ: hàm `rls_sees_sensitive`.
- **Mẫu E: dấu hiệu "cấp quản lý" là cột `roles.site_scoped`, KHÔNG phải quyền `approve`** (chỉ huy
  trưởng CÓ `approve` trên TC). Vai trò hiện trường: `CHT` (quyền giống `TC`, khác phạm vi).
  ⚠️ **Quên phân công phải dẫn tới thấy ÍT đi**, không phải nhiều hơn. Người ở
  `construction_sites.responsible_user_id` coi như đã được phân công.
- Event trigger `ensure_rls` tự bật RLS cho mọi bảng mới (không tạo policy → bảng quên policy bị chặn
  hết). Vẫn phải viết policy; giữ `ENABLE ROW LEVEL SECURITY` trong migration cho tự mô tả.
- **BSD tự mâu thuẫn**: `employees` (D ở 3.3, B ở 4.10), `quotes` (B ở 3.3, C ở 4.2). Ưu tiên
  **BSD 4.x** và báo Haan; cột lương của `employees` vẫn hạn chế theo cột. `audit_logs` và
  `sensitive_access_logs`: chỉ TGĐ/CFO/BGĐ/ADMIN đọc, KHÔNG ai ghi từ trình duyệt (chỉ qua
  `SECURITY DEFINER` hoặc Workers).

### 3.5 Đa pháp nhân (NEN-01, BSD 2.2)

- `companies` = NVC / NVS / NVO + **"NVG"** — mã tổng hợp cho báo cáo, **không phải pháp nhân giao dịch**.
- Bảng **giao dịch** LUÔN có `company_id`. Bảng **dùng chung** (`customers`, `suppliers`, `users`) KHÔNG có.
- **KHÔNG lọc `company_id = <id NVG>`** — ra danh sách rỗng ở mọi màn hình (đã xảy ra thật). "Toàn NVG"
  = **bỏ điều kiện lọc**, để RLS quyết: dùng `useCompanyScope()` + `withCompanyScope()`
  (`web/src/lib/company-scope.ts`). Màn hình gộp phải hiện thêm cột **Pháp nhân**.
- Báo cáo hợp nhất toàn NVG phải **loại trừ** giao dịch nội bộ (`rental_agreements.is_internal`, QĐ-6).

### 3.6 Hồ sơ 360° (BSD 2.1)

Thực thể tham chiếu xuyên module — **liên kết, KHÔNG sao chép**: `companies`, `users`, `customers`,
`opportunities`, `bidding_projects`/`design_projects`, `contracts`, `construction_sites`.

---

## 4. Coding convention

### 4.1 Ngôn ngữ

- **TypeScript xuyên suốt**; type và Zod dùng chung qua `shared/`.
- **Giao diện: tiếng Việt có dấu 100%** (PRD 6, CGD 4.1). Code, tên bảng/cột/biến: tiếng Anh.
  Ngoại lệ có chủ đích duy nhất: tên mục **«AI Design»** của module Thiết kế (Haan chọn, T58).
- **"100%" gồm cả chữ do TRÌNH DUYỆT tự sinh** — theo ngôn ngữ trình duyệt, không theo `lang`, grep không ra:
  - ràng buộc biểu mẫu ("Please fill out this field") → `setCustomValidity`, đã gom trong `Input` (`web/src/lib/validation-message.ts`)
  - `<input type="date">` → dùng `DateInput`
  - `<input type="number">` → `MoneyInput` cho tiền, ô số khác dùng `inputMode`
  - `window.confirm`/`alert` → hạn chế; việc quan trọng dựng hộp thoại riêng

  Trước khi dùng điều khiển gốc nào, hỏi "nó có tự sinh chữ không?" — kiểm bằng **Chrome đặt tiếng Anh**,
  không phải đọc code. Test canh: `web/src/test/design-rules.test.ts`.

### 4.2 Cơ sở dữ liệu (BSD 1.4) — mọi bảng

- `snake_case` tiếng Anh, **tên bảng số nhiều**; khoá chính `id` **UUID**; khoá ngoại `<bảng_số_ít>_id`.
- `company_id` trên mọi bảng nghiệp vụ (trừ bảng dùng chung). Audit: `created_at`, `updated_at`, `created_by`, `updated_by`.
- Xoá mềm `deleted_at` cho bảng quan trọng. Phiên bản: `version` + `is_current_version`.
- `status` luôn quy về **6 nhóm**: `draft` / `pending_approval` / `in_progress` / `completed` / `overdue` / `disputed`.
- **Tiền: `bigint` đồng, KHÔNG thập phân.** Số lượng vật lý: **`numeric`**; đơn vị ở bảng danh mục.
- Bản ghi hiện trường: `client_created_at` (mốc nghiệp vụ), `synced_at` (máy chủ đặt), `client_generated_id` (khử trùng).
- Thay đổi trạng thái/giá trị quan trọng → **bảng lịch sử riêng**, không ghi đè.

### 4.3 Giao diện — xem `DESIGN_SYSTEM.md`

`DESIGN_SYSTEM.md` mở rộng và ở vài chỗ THAY THẾ CGD Mục 6 (màu thương hiệu theo logo NVG — xanh lá / cam / xanh dương, Bước 0b; font
**Be Vietnam Pro**, dải trung tính, độ nổi, chuyển động). Trang trưng bày thành phần: **`/nen/giao-dien`**.

- **6 màu trạng thái** (Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn · Tranh chấp) — KHÔNG tạo
  màu trạng thái mới; màu thương hiệu KHÔNG dùng ở nhãn trạng thái.
- Chữ chính không dùng đen `#000000`. Body ~14px. Lưới 8px. Bo góc 4–8px (Lozenge bo tròn).
- **Một hành động chính mỗi màn hình.** Phân cấp bằng độ đậm + kích thước, không bằng màu.
- **Không có chế độ tối** — đã gỡ hẳn (doc/MOC_CAI_TIEN_UX.md). Lớp màu chỉ trỏ vào token đã khai (test canh).

### 4.4 Văn phong (CGD 2, 4)

- Rõ, trực tiếp, hỗ trợ không phán xét. **KHÔNG đại từ nhân xưng** ("Vui lòng nhập…"); ngoại lệ lời
  chào Dashboard "Chào [Tên], …".
- **KHÔNG emoji, KHÔNG IN HOA để nhấn mạnh**, không nhiều dấu chấm than.
- Ngày `dd/mm/yyyy` · ngày giờ `dd/mm/yyyy — hh:mm` · số `1.234.567,89` · tiền `125.000.000 đồng`.
- Nút = động từ mệnh lệnh. Lỗi = `[việc không làm được] + [vì sao / cần làm gì]`; **không hiện mã
  HTTP/stack trace**; lỗi vượt quyền nói rõ **ai xử lý được**.
- Trạng thái rỗng = tình trạng + hành động gợi ý + nút. Đang tải = **skeleton**, không spinner toàn màn hình.
- Dùng lại thư viện nội dung **CGD 5.1–5.6** — đừng nghĩ cách diễn đạt mới.

### 4.5 Thuật ngữ chuẩn (CGD 4.4)

**Người chịu trách nhiệm** (không: Owner, Chủ hồ sơ) · **Gửi phê duyệt** (không: Submit, Gửi duyệt) ·
**Phê duyệt** ("Duyệt" chỉ trên nút) · **Bàn giao** (không: Chuyển giao, Handover) · **Đang hiệu lực**
(không: Mới nhất, Active) · **Pháp nhân** (không: Công ty con, Entity) · **Quá hạn** (không: Trễ hạn, Overdue).

### 4.6 9 mẫu bố cục (AFD 4) — mọi màn hình thuộc một trong 9, không tự nghĩ mẫu thứ 10

1. **Dashboard** — lưới thẻ, bấm dẫn tới danh sách đã lọc.
2. **Danh sách** — cột 1 mã/tên; cột cố định người chịu trách nhiệm, trạng thái, thời hạn; giữ bộ lọc khi quay lại.
3. **Chi tiết Hồ sơ 360°** — header cố định, Tab cùng URL gốc, panel phải = hồ sơ liên quan, **luôn có tab Lịch sử**.
4. **Biểu mẫu** — <~10 trường một trang; dài thì wizard có tiến trình + lưu nháp. Lưu xong → vào Chi tiết.
5. **Kanban** — chỉ cho quy trình trạng thái cố định (CRM-02).
6. **Hộp thư Phê duyệt** — MỘT mẫu cho mọi loại phê duyệt; duyệt xong tự sang hồ sơ tiếp.
7. **Request Tracker** (AFD 4.7) — cho người GỬI đề nghị: bước hiện tại, ai giữ, chờ bao lâu, nút "Thúc" ghi lịch sử. Ưu tiên số một của công trường (TC-10).
8. **Di động** (Kho, Xưởng, công trường, AFD 4.8) — bottom nav 4–5 mục, không thu nhỏ desktop, hiện trạng thái đồng bộ; **nút chụp ảnh không bao giờ ẩn sau menu**; ưu tiên chọn từ gợi ý thay gõ tay.
9. **Asset Ledger** (AFD 4.9) — hàng = mã sản phẩm, cột = trạng thái/vị trí; ô bấm ra chứng từ; **dòng tổng phải cân, lệch thì cảnh báo trên dòng**; xem lại tại ngày quá khứ (SX-15, KHO-06).

> **Ngân sách thao tác hiện trường là TIÊU CHÍ NGHIỆM THU** (PRD v1.4 Mục 6): cập nhật hằng ngày của
> chỉ huy trưởng / phụ trách xưởng **≤ 10–20 phút, mục tiêu 5–10 phút** — vượt là người dùng quay lại Excel/Zalo.

### 4.7 Kiểm thử (TSD 2.6, 3.6)

- Ưu tiên E2E Playwright cho luồng nghiệp vụ chính; Vitest cho logic; **bắt buộc test RLS** (nhất là giá vốn, lương, lợi nhuận).
- **Chỉ chạy phần liên quan**:

| Đổi ở đâu                        | Chạy                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `web/`, `shared/` phần giao diện | `npx vitest run --project web` (~4 giây)                            |
| Logic thuần trong `shared/`      | `npx vitest run --project logic shared/src/__tests__/<tệp>.test.ts` |
| Migration / RLS trong `db/`      | `npx vitest run --project db db/src/__tests__/<module>.test.ts`     |

- Luôn kèm `npx tsc -b` và `npx prettier --check <tệp đã đổi>`. `npm test` đầy đủ (~100 giây) chỉ khi
  Haan yêu cầu hoặc trước commit lớn.
- **`npm run lint` (eslint) chạy được từ 20/09/2026** — trước đó khai trong `package.json` mà không có
  eslint trong kho, gọi ra «eslint: not found». Luật chọn để bắt LỖI, không bắt cách viết; hai luật
  tắt có ghi lý do trong `eslint.config.js`. **Đừng tắt thêm luật để cho xanh** — tắt thì ghi lý do
  ngay tại chỗ, kèm ca hỏng đã đo.
- **CI**: `.github/workflows/kiem.yml` chạy định dạng, luật, kiểu, hợp đồng và 1.606 phép thử trên
  mỗi PR. Chưa chạy `db/` — cần dựng Supabase trong CI (`supabase start`), chưa làm.
- **`npm run mutation-proof`**: cài 83 lỗi thật vào mã nguồn rồi đòi bộ kiểm phải ĐỎ. Số bài kiểm
  không chứng minh bộ kiểm có tác dụng — 20/09/2026 có tám lỗi thật lọt qua 867 bài kiểm đang xanh.
  Thêm hàng rào mới (quyền, riêng tư, tiền gọi mô hình, số đo bản vẽ) thì thêm một đột biến cho nó.
  Khoảng trống đã biết: RLS và ràng buộc trong CSDL KHÔNG được chứng minh ở đây.
- Nhóm `db` chạy **tuần tự** trên Supabase tại máy (~40 giây cả bộ): 23 tệp dùng chung một CSDL và dọn theo
  tiền tố, chạy song song thì tệp này xoá dữ liệu tệp kia đang dùng. Đừng thêm cờ song song cho nhóm đó.

---

## 5. Hàng rào cứng

### 5.1 Ranh giới AI (PRD 2.3 + "Ranh giới KHÔNG làm" từng module ở PRD 5)

- Phần mềm/AI **KHÔNG tự quyết / tự phê duyệt**: nội dung chuyên môn, pháp lý, kỹ thuật, nhân sự, **giá
  bán cuối, tỷ lệ lợi nhuận, mức dự phòng**, giải pháp kết cấu/MEP/PCCC, tuyển dụng–lương–kỷ luật, chọn
  nhà cung cấp, phê duyệt thanh toán.
- **Mọi kết quả AI là NHÁP/ĐỀ XUẤT** tới khi người có thẩm quyền xác nhận qua đúng luồng phê duyệt.
- **KHÔNG gửi dữ liệu nhạy cảm** (bản vẽ, giá vốn, khách hàng, lợi nhuận, lương) lên AI công cộng chưa
  kiểm soát. Gemini gói miễn phí có thể dùng dữ liệu để huấn luyện → chỉ gửi phần thật sự cần.
- AI luôn phụ trợ tùy chọn — hết hạn mức API không được chặn luồng chính.

### 5.2 Dữ liệu và phân quyền

- **KHÔNG hard-code hạn mức phê duyệt** → `approval_limits`.
- **NEN-12 — tham số hoá**: mọi giá trị biến động (đơn giá thuê giàn giáo, giá bồi thường, giá thuê nội
  bộ, ngưỡng lỗi, SLA phòng ban) nằm ở bảng cấu hình. **Ba bảng song song, đừng gộp**: `approval_limits`
  · `aging_buckets` · `system_parameters` (+ `sla_definitions`).
  - **Đổi tham số KHÔNG hồi tố**: chứng từ đã phát hành lưu giá trị đã áp dụng (vd `unit_price_applied`).
  - **`coalesce` đặt ở nơi gọi**: `system_parameter_number()` trả `NULL` khi chưa cấu hình, cố ý không tự dựng mặc định.
- **Chứng từ đã phát hành bất biến (BSD 3.5)**: giao nhận/thu hồi giàn giáo đã ký hai bên, biên bản
  nghiệm thu đã ký, chứng từ kế toán kỳ đã khoá → chỉ sửa bằng **chứng từ điều chỉnh có người duyệt**.
  Cưỡng chế ở **CSDL** (`frozen_after_signed`, `close_accounting_period`), không ở giao diện.
- **KHÔNG hiển thị số ước lượng.** Chỉ số chưa có dữ liệu thật hiện **"Chưa đủ dữ liệu"** (`EMPTY_STATES.notEnoughData`),
  không hiện `0`, không điền mặc định. Tham số NVG chưa quyết (SLA, giá bồi thường, ngưỡng lỗi, giá thuê
  nội bộ, `min_samples_for_metric`) **cố ý để RỖNG**.
- **Trách nhiệm hai chiều có thời hạn**: văn phòng cũng phải xử lý trên hệ thống theo `sla_definitions`.
- **KHÔNG lưu**: mật khẩu thô, OTP, tài khoản ngân hàng cá nhân, tin đồn, nhận xét cảm tính, trao đổi cá nhân.
- **Một nguồn dữ liệu duy nhất**: nhập một lần tại nơi phát sinh; module khác liên kết.

### 5.3 Phạm vi — KHÔNG thay thế (PRD 2.2, 9)

Chỉ tích hợp/liên kết: phần mềm kế toán chính thức (**không tạo hai bộ số liệu**, KT-08), hoá đơn điện
tử, chữ ký số, eTax, ngân hàng điện tử, chấm công; AutoCAD/Revit/SketchUp/ETABS…; dự toán GXD/Delta/F1/Escon/Acitt.

### 5.4 Trải nghiệm người dùng

- Không bắt nhập liệu hai lần (trừ khi pháp luật buộc giữ bản giấy).
- **Ẩn** menu/nút/liên kết khi không có quyền — KHÔNG hiện rồi báo lỗi; ẩn cả trong panel liên kết chéo.
- **Không bao giờ mất dữ liệu đang nhập**: tự lưu nháp, hỏi khi rời trang.
- Không dùng màu làm cách duy nhất truyền đạt — trạng thái luôn kèm chữ.
- ≤ 3 cú nhấp tới một hồ sơ. Vùng bấm di động ≥ ~40×40px.

### 5.5 Hạ tầng và bảo mật (TSD 5.6)

- **KHÔNG commit secret** → Cloudflare Workers Secrets. `service_role` **chỉ trong Workers**; frontend chỉ anon key.
- **KHÔNG sửa bảng tay trên Dashboard** — mọi thay đổi qua migration Drizzle, commit vào Git.

### 5.6 Module TC và SX

Phạm vi đã nở ra ở PRD v1.4: **TC-01→TC-20**, **SX-01→SX-22** (SX chuyển sang GĐ 2, phạm vi đầy đủ —
QĐ-2). Mã hiện có mới phủ lõi phạm vi cũ — **đối chiếu `BUILD_PLAN.md` trước khi làm**.
Nếu buộc phải cắt, theo đúng IPD v1.1 §4.3: **giữ bằng mọi giá** SX-15→SX-21 và TC-05, TC-09, TC-10,
TC-13; **hoàn thiện sau** SX-07, SX-10, SX-22.

---

## 6. Quyết định dự án

### 6.1 Công nghệ đã chốt — không mở lại trừ khi điều kiện đổi (TSD 6)

SPA + Vite (không Next.js) · React 18 · PostgreSQL/Supabase · Cloudflare Workers (không Supabase Edge
Functions) · REST (không GraphQL) · Supabase Auth · Supabase Storage (không R2 cho tệp nghiệp vụ) · PWA
(không React Native) · AI/OCR nghiệp vụ: **Google Gemini**. (TSD 5.6 nhắc "khóa Claude API" là dấu vết sót.)

### 6.2 Lộ trình (PRD 4) — chỉ thứ tự và tiêu chí

| GĐ    | Module                                        | Tiêu chí hoàn thành (PRD 7)                                                 |
| ----- | --------------------------------------------- | --------------------------------------------------------------------------- |
| **1** | NEN, CRM, DA, TK (trừ AI), HD, BC cơ bản      | Một cơ hội chạy trọn CRM → DA/TK → HD trên dữ liệu thật, truy vết phê duyệt |
| **2** | TC, MH, KHO, KT, NS, **SX đầy đủ**, BC đầy đủ | Bốn luồng M2 dưới đây CÙNG chạy được                                        |
| **3** | Liên kết chéo → ~95% + AI Design Engine       | 12 module thông suốt; kịch bản demo đầu-cuối NVC/NVO/NVS + Back Office      |

Bốn luồng M2 (IPD v1.1 2.2): (1) Hợp đồng → Ngân sách → Mua hàng/Kho → Nghiệm thu → Đề nghị thanh toán
→ Thu tiền → Lãi/lỗ · (2) Đơn thuê giàn giáo: báo giá kiểm tồn → xuất kho → giao–trả → thu hồi, kiểm
đếm → đối soát → tất toán · (3) Lệnh sản xuất: phiên bản → cấp vật tư theo định mức → công đoạn →
chất lượng → nhập kho → giá thành · (4) Công trường hằng ngày: nhật ký → đề nghị vật tư có hạn → nghiệm thu checklist.

Nghiệm thu đo bằng **người thật dùng, dữ liệu đúng, báo cáo đối soát được** — không bằng số tính năng.

### 6.3 Môi trường

> **Hai môi trường CSDL, tách 30/09/2026 (C-1)** — trước đó máy phát triển ghi thẳng vào CSDL của bản công khai.
>
> | Môi trường          | CSDL                                      | Ai dùng                                                   | Cấu hình                                                                |
> | ------------------- | ----------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
> | **Phát triển**      | Supabase **tại máy** (Docker, cổng 553xx) | máy, `wrangler dev`, **mọi test `db/`**                   | `.env`, `workers/.dev.vars`, `supabase/config.toml`                     |
> | **Chạy thử / demo** | project cloud `fvfmtbdcvcniakigfpdm`      | `nvg.automkt.workers.dev` (CHƯA deploy), Worker `nvg-api` | `.env.demo` (không commit), `.env.production`, `workers/wrangler.jsonc` |
> | **Vận hành**        | chưa có — tạo lúc go-live, **gói Pro**    | —                                                         | —                                                                       |
>
> - Bật / tắt CSDL máy: `npm run db:start` / `npm run db:stop`. Dựng lại từ đầu: `npx supabase db reset` rồi `npm run db:migrate && npm run db:seed`.
> - **Migration lên bản demo chỉ bằng `npm run db:migrate:demo`**, lúc phát hành, TRƯỚC `npm run deploy`. `db:migrate` thường
>   luôn chạy trên máy. `db/src/env.ts` chặn cứng: `.env` trỏ vào demo thì lệnh thường dừng, còn **bộ test
>   `db/` từ chối chạy trên demo kể cả khi gọi tường minh** (phép thử `env-guard.test.ts`).
> - Dải cổng mặc định 543xx thuộc stack Supabase của dự án khác trên máy — đừng dừng nó.
> - Dữ liệu người dùng nhập trên bản demo (hồ sơ, lượt AI Design) **không có** trên máy, và ngược lại.
> - Bản vận hành cần gói Pro: tài khoản đã dùng hết 2 project miễn phí, và gói Free không sao lưu, tự dừng sau 7 ngày.

- Đích theo tài liệu: 3 môi trường, mỗi cái một project Supabase; nhánh `main` = production, `staging`,
  feature branch. Một người triển khai → không cần duyệt PR nhiều người; **Haan tự kiểm bản preview** là
  kiểm soát chất lượng duy nhất (IPD 5.2).
- **Frontend = Worker `nvg` (Static Assets)**, cấu hình `web/wrangler.jsonc`; API = Worker `nvg-api`,
  cấu hình `workers/wrangler.jsonc`. **Phát hành bằng `npm run deploy`** — API TRƯỚC, giao diện SAU.
  - ⚠️ **KHÔNG BAO GIỜ kèm `--env production`** — sinh ra Worker thứ hai `nvg-production`, `nvg` thật giữ bản cũ.
  - SPA phải có `assets.not_found_handling: "single-page-application"`, thiếu thì đường dẫn sâu ra 404.
  - `wrangler deploy` không nạp `.env`; đừng dùng `--secrets-file` với `.env` gốc (có `service_role`, mật khẩu CSDL).
  - **Biến `VITE_*` bị đóng cứng vào bundle lúc build.** `.env` là cấu hình MÁY (API = `localhost:8788`);
    bản phát hành lấy địa chỉ công khai từ **`.env.production`** (có commit, đè `.env`). Build production
    DỪNG nếu biến nào rỗng hoặc trỏ về máy (`web/src/lib/build-env.ts`, đột biến M29). Lỗi thật
    06/09→23/09/2026: bản public gọi `localhost:8788`, «AI Design» chỉ chạy trên máy đang mở `wrangler dev`.
    Thêm biến `VITE_` mới: khai ở `define` **và** `REQUIRED_BUILD_ENV` (có phép thử canh hai bên khớp).
  - ⚠️ **Đừng phát hành một mình `deploy:web`.** Artifact của Module Thiết kế là bất biến và bị kiểm hợp
    đồng **cả khi ĐỌC LẠI**, nên một bản `nvg-api` cũ hơn hợp đồng đã ghi ra artifact sẽ không đọc nổi
    chính kho của mình. Xảy ra thật 21/09/2026: giao diện dựng 20/09, API tải lên 19/09 → cả tab «AI
    Design» đỏ với câu lỗi kiểm kiểu, nút «Thử lại» vô nghĩa vì chỗ hỏng nằm ở lượt đọc.
    Hàng rào: cả hai bên nhúng `CONTRACTS_FINGERPRINT` (băm `contracts/`, sinh cùng `contracts:gen`),
    Worker trả ở header `X-NVG-Contracts`, giao diện đối chiếu và hiện dải báo. Kiểm sau khi deploy:
    `curl -s https://nvg-api.automkt.workers.dev/design/health` — trường `contracts` phải khớp
    `CONTRACTS_FINGERPRINT` trong `shared/src/design/index.generated.ts`.

### 6.4 Phân vai Claude Code ↔ Haan (IPD 4)

- Claude Code: schema, migration, code, test, bước kỹ thuật triển khai. **Haan: xác nhận nghiệp vụ thật
  của NVG (không uỷ quyền cho AI), trao đổi với BGĐ, xác nhận trước khi triển khai production.**
- Chu trình lặp ngắn: một module/luồng, chạy thử ngay, phản hồi cụ thể.
- **Gặp mơ hồ nghiệp vụ → liệt kê câu hỏi cho Haan, không tự quyết.** Câu hỏi đang treo: `doc/VAN_DE_CON_MO.md`.

> **KHÔNG gọi API AI trả phí khi Haan chưa cho phép** — OpenAI, Anthropic, Gemini, mọi đường (`curl`,
> endpoint `/design/**/ai-*`, script tạm), kể cả chỉ để kiểm tên model. Một lượt chương trình không gian
> tốn 0,08–0,23 USD. Cần đo thật thì **nói trước: mấy lượt, tuyến nào, bao nhiêu tiền, để chứng minh
> gì** rồi chờ đồng ý. Đưa khoá hay "làm tiếp" không phải là cho phép; cho một lượt không phải cho cả
> loạt. Khi chưa được phép: dựng payload đọc bằng mắt, test với client giả, đối chiếu bảng `design_ai_call`.

### 6.5 Quyết định đã chốt qua trao đổi — tài liệu gốc chưa cập nhật

1. **AI Design Engine (TK-10→TK-17) là tính năng quyết định thành công**, làm ngay sau khi lõi đạt 90%
   (thay IPD 3.3). Đặc tả ở `doc/design/` (thay IPD 7). Còn lệch số phiên bản tài liệu gốc v02/v03/v04/v05 — chờ Haan (Q-5).
2. **`shared/`** là thư mục thứ tư cạnh `web/ workers/ db/` (TSD 1.3 cần dùng chung type/Zod).
3. **PWA cho TOÀN BỘ ứng dụng** (mở rộng TSD): mọi màn hình có bố cục di động thật. **KHÔNG offline-first**:
   service worker chỉ cache khung ứng dụng; phản hồi Supabase **cố ý không cache** (dữ liệu RLS theo từng
   người, còn trong máy là đọc được sau đăng xuất). Offline thật cho Kho còn treo (KHO-09).
4. **Frontend trên Workers Static Assets, không Pages** (thay TSD 1.4) — xem 6.3.
5. **Ngôn ngữ thị giác theo `DESIGN_SYSTEM.md`** (thay một phần CGD 6) — xem 4.3.
6. **Vai trò `SX` "Xưởng sản xuất – Cho thuê"** (vai trò thứ 13): KHÔNG có `approve` (BGĐ duyệt SX);
   bảng công khối xưởng do người có `approve` trên SX xác nhận (`timesheet_block_module`). ⚠️ Ma trận
   `permissions` là (vai trò × module), không có chiều pháp nhân — nhân viên kinh doanh NVS đang dùng chung vai trò này.
7. **Vai trò `CHT` "Chỉ huy trưởng / Kỹ thuật hiện trường"** (thứ 14): quyền giống hệt `TC` kể cả
   `approve`, chỉ khác `roles.site_scoped` (Mẫu E). `TC` đổi nhãn "Trưởng phòng Thi công". Vai trò
   _Tổ trưởng sản xuất_ (AFD v1.1) **chưa làm** — thuộc đợt SX.
8. **Sáu quyết định gốc v1.4** (`doc/CHANGELOG_NVG_docs.md` mục 1): QĐ-1 bỏ mốc thời gian · QĐ-2 SX đầy
   đủ · QĐ-3 TC mở rộng đầy đủ · QĐ-4 phiếu công trường áp cho cả NVC và NVO, khác biệt bằng **cấu hình**
   · QĐ-5 định mức/tỷ lệ lỗi biến động, phải sửa được; bảng giá bồi thường để tạm · QĐ-6 **ghi nhận giá
   thuê nội bộ là bắt buộc**, mức giá cấu hình được.

---

## 7. Checklist trước khi bắt đầu một module

1. PRD 5 phần module — gồm **"Ranh giới KHÔNG làm"**.
2. BSD 4.x — bảng, mẫu RLS, endpoint đã đặc tả.
3. AFD 3.x (hành trình) + AFD 7 (bản đồ màn hình).
4. Mỗi thao tác: Supabase trực tiếp hay Workers (3.1).
5. Dùng lại 9 mẫu bố cục, thư viện CGD 5, thuật ngữ chuẩn, 6 màu trạng thái.
6. Mơ hồ nghiệp vụ → hỏi Haan.

---

## 8. Module Thiết kế AI (TK-10 → TK-17)

Hàng rào riêng của module; nơi nào mục này im lặng thì áp mục 1–7.

> **AI Design là module ĐỘC LẬP hỗ trợ phòng thiết kế, KHÔNG thuộc quy trình Dự án thiết kế** (Haan, T114 + T118).
> Không đặt nó thành bước của dải tiến trình, màn hình con của hồ sơ, điều kiện mở bước khác, việc cần làm hay
> hoạt động của hồ sơ. Lối sang duy nhất từ hồ sơ là khối «Công cụ hỗ trợ». Nó ĐỌC đầu bài đã xác nhận và khảo sát
> của hồ sơ, CHỈ XEM — sửa phải về hồ sơ thiết kế. Chiều từ AI sang quy trình không có.

### 8.1 Tài liệu

- Đặc tả: **`doc/design/`** — nguồn sự thật cho TK-10→TK-17, thắng các bản `.docx`. **Đọc
  `doc/design/README.md` TRƯỚC**: 11 đính chính chỗ tài liệu mô tả sai hiện trạng (Đ7–Đ11 đối chiếu hồ
  sơ thật, sai nặng hơn) + bảng ánh xạ sang bảng/enum đang chạy.
- Đụng số hoá hồ sơ cũ hoặc bộ xuất CAD → đọc **`doc/design/13-ho-so-thuc-te.md`**.
- Nhật ký quyết định T1→T66: **`doc/design/QUYET_DINH_AI.md`** (thêm quyết định mới vào cuối tệp đó,
  không vào đây).
- **Hiện trạng chung** (T58, 19/09/2026): **bộ giải CP-SAT nội bộ đã gỡ hẳn** (T10 ghi nó không đạt qua
  thử nghiệm thực tế). Thiết kế tự động chỉ còn nhánh AI — trên giao diện tên **«AI Design»** (ngoại lệ tiếng
  Anh có chủ đích với 4.1, Haan chọn). Container `compute/` chỉ còn **số hoá hồ sơ cũ**. Artifact cũ của bộ
  giải vẫn nằm trong CSDL (bất biến), không mã nào đọc. `ai-independence.test.ts` canh bộ giải không được
  tạo lại lặng lẽ.

### 8.2 Nguyên tắc bất biến còn áp dụng

1. Mọi ranh giới giữa hai runtime có JSON Schema trong `contracts/` — không có hợp đồng thì dừng và hỏi.
2. Quy tắc kiến trúc là dữ liệu (rule pack YAML), không hard-code ngưỡng ở đâu cả.
3. Artifact bất biến, băm nội dung, có lineage. Sửa = artifact mới + đổi `design_head`.
4. Mọi bảng của module mang `tenant_id`.
5. Mọi artifact và tài liệu mang `discipline`.
6. Không tự sinh/tự phát hành nội dung kết cấu, điện nước, PCCC; kỹ sư có chứng chỉ ký. Mỗi lần phát hành
   đúng **một** bộ môn.

### 8.3 Nhánh AI («AI Design») — hiện trạng

Nhánh AI (T14): đầu vào chỉ đầu bài + khảo sát; kết quả là **đề xuất**, không đi qua Container, không vào
hồ sơ phát hành. Hiện trạng:

- **Một lượt gọi cho cả nhà** (T45, hợp đồng `contracts/ai-house-intent`): mô hình khai phòng, diện tích
  mục tiêu, quan hệ, lối vào, và **vẽ bản phác lưới ô ~1 m mỗi tầng** (T48). Chương trình
  (`workers/src/design/ai/arrange/`, `ai/tree/`) nắn bản phác, **gán mọi toạ độ**, đặt cửa/cửa sổ/số bậc
  (T40), cho qua cổng. Bản phác là toạ độ thô; mọi số trên bản vẽ vẫn do chương trình gán.
- **Cổng hỏng thì không lưu** (T39). Chỉ gọi lại mô hình cho lỗi **ngữ nghĩa** (`REVISABLE_CODES`), tối
  đa `HOUSE_REVISIONS_MAX`; lỗi hình học thì bộ xếp tự thử rồi dừng. Tầng 1 hỏng vì cửa ra ngoài → chương
  trình thử đổi phòng mang cửa chính trước khi gọi lại (T51).
- **Ngưỡng 60 điểm** (`kb/plan_quality.yaml` `accept_percent`; 65 tới 01/10/2026) **và sàn 40 % cho từng nhóm**
  (`accept_group_floor_percent`, T96 — nhóm diện tích không bù được cho một tầng đi lại tệ); dưới ngưỡng
  dùng lượt sửa còn lại; sau đó kỹ sư **sửa trên bản vẽ bằng ô yêu cầu** → mô hình trả thao tác trong tập
  đóng `contracts/ai-plan-edit`, chương trình áp lên cây đã lưu (T53, `ai/edit/`). Thước chấm là **tư duy
  nghề, không phải luật**: trọng số trong nhóm khai ở từng tiêu chí (`weight`), ba tiêu chí T96 đo đúng
  ba lỗi Haan chỉ trên mặt bằng thật — cửa chính đón vào đâu (C9), hành lang phục vụ mấy phòng (C10), khu
  ướt đè lên chỗ tiếp khách / ngủ / lối vào tầng dưới (E5).
- **Đầu bài đã khai là ràng buộc**, phần không khai mới là chỗ sáng tạo (T41, `brief/gate.ts`); diện tích
  tối thiểu đầu bài khai là sàn cứng. Chiều ngược lại (T96, Haan: «không khai trong đầu bài thì hạn chế bịa
  thêm»): loại trong `only_when_asked` của `kb/brief_fidelity.yaml` (giếng trời, sân trong, sân thượng, cửa
  hàng, thang máy) chỉ được đề xuất khi đầu bài có hỏi tới — cổng danh mục bác, câu dẫn không gợi ý.
- **Luật cứng chỉ khi không dựng được / không đi được** (đường đi hằng ngày không xuyên gara/sảnh ngoài,
  ô thang chỉ mở cửa sang giao thông / khu chung / sân thượng / thang máy (T74), không đi xuyên phòng riêng, cạnh dùng được). **Định mức và kinh
  nghiệm nghề chỉ trừ điểm/cảnh báo, không loại phương án** (T49, T52–T55). Chỗ bất hợp lý của một bản vẽ
  cụ thể → sửa bằng ô yêu cầu, **đừng biến thành luật** (Haan, T52). **Ngoại lệ Haan tự đặt (T71,
  `rules/nvg-mandatory.yaml`, luôn bật):** bếp / phòng thờ không nằm dưới WC, phòng thờ không giáp /
  đối diện WC, ban công DÀI (cạnh dài > 1,5 lần cạnh ngắn) trong sàn quay cạnh dài ra mặt thoáng — CHẶN
  (ban công đua ra không xét, gần vuông chỉ trừ điểm — T91); WC chung thẳng trục là ƯU TIÊN (bậc xếp
  hạng đầu của bộ xếp), không chặn. Thêm luật vào tệp ấy chỉ khi chính Haan nói «bắt buộc».
- **Không kiểm quy chuẩn xây dựng** (T30, T42): `rules/base/` đã xoá. Nhánh AI đọc `rules/nvg-experience.yaml`
  - `rules/nvg-measured.yaml` theo lựa chọn của kỹ sư, chỉ để đối chiếu SAU. Màn hình phải nói rõ «Không
    kiểm quy chuẩn xây dựng…» (câu do mã chèn). Khoảng lùi/mật độ chỉ lấy từ đầu bài.
- **Tờ vẽ chính là SVG vector tất định** (`ai/draw/`) — T21 (tờ do mô hình ảnh vẽ) đã bị T22 gỡ. Chữ do mô
  hình sinh là nội dung không tin được: thoát ký tự khi dựng SVG, hiển thị qua `<img>`.
- **Xuất DXF bằng TypeScript trong Worker** (T47, `ai/dxf/`), đổi từ chính tờ SVG. Một chiều.
- **Ảnh mặt bằng có nội thất** (T57): mô hình ảnh vẽ từ **ảnh neo** (`ai/draw/anchor.ts`, không khung tên),
  panel riêng dưới tờ vector — **tờ vector vẫn là tờ chính**. Ảnh do mô hình ảnh vẽ hiện NGUYÊN BẢN, không in dấu (T154, Haan 11/10/2026; T117 đã bỏ câu chú thích trong trang).
  Phép thử canh `images` có đúng một phần tử.
- **Mặt đứng mặt tiền** (T59): khung, lỗ mở, ban công suy từ phương án mặt bằng đã chọn và KHOÁ; mô
  hình chỉ chọn mái, vật liệu, màu, cổng, rào, trang trí trong `kb/facade_vocabulary.yaml`. Phiếu yêu cầu
  của kỹ sư (`ai_facade_brief`) là bắt buộc — hàm ghép áp thẳng mục đã điền; bề rộng cửa là của mặt bằng.
- **Đầu bài là đầu vào duy nhất, nên nó hỏi kỹ** (T62, 21/09/2026): 98 câu trong **SÁU mục** —
  Công trình và khu đất (kèm cao độ đường/đất, mặt nắng gắt, mặt đón gió, bề rộng đường, ngập,
  nhà liền kề) · Gia đình và nếp sinh hoạt (kèm **tuổi**, tín ngưỡng, kinh doanh tại nhà) ·
  Công năng và lưu trữ · Khối nhà, thang và mặt ngoài (thang máy: làm ngay / **chừa chỗ**; ban
  công **đua ra ngoài ranh**) · Kỹ thuật và dự trù · Ưu tiên, ngân sách và người quyết định.
  **Ba PHẦN, bảy mục** (T114, 03/10/2026, thay «sáu mục» của T62): Chung cho cả nhà · Mặt bằng
  công năng · Mặt đứng; mục thứ bảy `mat_dung` là phiếu mặt đứng T59 gộp vào đầu bài (`facade`).
  Nhãn **`for`** từng câu quyết định câu ấy đi vào lời gọi AI nào (mặt bằng / mặt đứng / phối
  cảnh), không khai thì theo phần — thêm câu hỏi mới thì nghĩ luôn nó dùng cho bản vẽ nào. Thêm
  nhóm câu hỏi thì xếp vào mục có sẵn, đừng mở mục mới («12 mục là quá dài»). Số bước KHÔNG đổi
  theo loại hình: nhóm tổ chức khối nhà ẩn theo TỪNG TRƯỜNG, không ẩn cả mục.
  Trường mới gần hết mang **trọng số 0** — `completeness_score` là cổng chặn Lớp 2, chỉ đo thứ
  thiếu thì không dựng nổi mặt bằng. Phong thuỷ vào đầu bài dưới dạng **câu ràng buộc người đã
  quyết**, không phải ngày sinh để máy luận (PRD 2.3) — từ 07/10/2026 qua ô «Điều kiêng kỵ khác»: Haan gỡ
  11 câu (phong thuỷ, nếp nấu ăn, bếp phụ, tiếp khách, làm việc tại nhà, ca đêm, thú nuôi, quan hệ người quyết
  định, chỗ cất đồ, khách ở lại qua đêm); trường vẫn trong hợp đồng để đầu bài cũ đọc được.
- **Quản trị viên sửa được mục khảo sát** (T63): lớp phủ lên `brief-form.json`, lưu ở
  `design_setting.brief_form_overlay`, ghi qua `POST /design/brief/form`. Sửa nhãn/gợi ý/trọng
  số/thứ tự, ẩn, và thêm câu hỏi ở ô mở `custom.*`. **Không** sửa được kiểu điều khiển, đơn vị,
  giá trị lựa chọn; năm trường hợp đồng bắt buộc khoá hẳn; câu hỏi có sẵn chỉ ẩn, không xoá.
  Câu hỏi tự thêm tới mô hình dạng nhãn–câu trả lời và **không ràng buộc hình học**. Cả `web/` lẫn
  `workers/` phải đọc cấu hình HIỆU LỰC (`useBriefFormConfig`, `readEffectiveBriefForm`), không
  nhập thẳng `BRIEF_FORM` — hai bên chấm điểm lệch nhau là con số sai đi vào artifact bất biến.
- **Đầu bài đã khai là ràng buộc KIỂM ĐƯỢC, không chỉ là câu văn** (T65, 22/09/2026, Haan: «mặt
  bằng phải theo sát yêu cầu đầu bài, không được làm thiếu hoặc sai»). Bảng `demands` trong
  `kb/brief_fidelity.yaml` nói «gia chủ trả lời X thì mặt bằng phải có Y»; `ai/brief-demands.ts`
  suy ra tất định, `ai/program.ts` bác đề xuất thiếu, `ai/plan-demands.ts` kiểm phần chỉ thấy
  được khi đã có toạ độ. **Thang máy** có mã phòng riêng `elevator` (tách khỏi `core`) và phải
  CHỒNG KHÍT mọi tầng — kể cả lựa chọn «chừa chỗ lắp sau», vì chừa lệch tầng thì không phải chừa
  chỗ. **Ban công** (T91): mặt BẮT BUỘC phải có, mặt CÓ THỂ tuỳ, mặt khác CẤM; độ đua khai TỪNG mặt,
  đọc qua một hàm `balconySides` (`shared/src/design/balcony-brief.ts`, đọc được cả đầu bài cũ) —
  đừng đọc thẳng trường. Phần **đua ra ngoài ranh** nới ô ngay trong cây chia
  (`tree/balcony-projection.ts`), TRƯỚC khi dựng hình bao và đặt lỗ mở.
  **Khung xương trước (T102, 29/09/2026, `arrange/skeleton.ts`, `doc/design/THIET_KE_KHUNG_XUONG.md`):** bản
  phác của mô hình hỏng (lối vào, sàn, cổng) thì chương trình DỰNG lại tầng như kiến trúc sư: ô thang đúng mốc,
  hành lang nối ô thang (dải ngang trước / sau lõi, dải dọc áp lõi, khe cạnh thang máy thành sảnh), phòng lấp vào
  các túi theo vị trí bản phác — lối vào là bất biến của cách dựng, không phải phép kiểm sau. Đi TRƯỚC các vòng
  khung cũ; ghi chú `skeleton_arranged`; lỗi bản phác vẫn theo câu nhắc (T86). Mọi lá hành lang của tầng là MỘT
  ngân sách: thiếu đoạn thì thêm không gian, thừa lá thì chia đoạn.
  **Bộ xếp có ý niệm công năng (T96):** khu đón khách của không gian mở quay về phía cửa vào
  (`passage.reception_from`, sảnh trước gara trước hành lang); khách / ăn kề lối đi nối bằng ô thông SUỐT
  vách (`passage.open_flow`), không vách ngăn; ban công khép kín và WC khép kín không chung một dải; cổng
  bắt buộc chia lại khu bếp tầng dưới theo WC của chính ứng viên. Đo mọi thay đổi bộ xếp bằng **phát lại
  114 vòng thật** (mẫu `scratchpad` của phiên T96, đối chứng là cùng mã với thay đổi tắt) — không có lợi
  đo được thì gỡ.
  Ba ranh giới không được phá: **chỉ suy từ câu ĐÃ trả lời** (không `?? false` — «chưa hỏi» khác
  «trả lời không»); **thiếu số thì không bịa** (khai đua ranh mà không khai mấy mét thì giữ trong
  ranh và nói ra); **lời gia chủ thì bác được, suy đoán nghề chỉ cảnh báo** (cờ `blocking` ở tệp
  dữ liệu, T52). Thêm nhóm đòi hỏi mới thì thêm dòng vào YAML **và** nhánh trong `matchDemand` —
  có phép thử canh hai bên không lệch.
- Dữ liệu gửi nhà cung cấp: **đầy đủ trừ danh tính** → hạng 2 (T12); khung tên mang mã hồ sơ là hạng 1, không gửi.

> **Ranh giới có KIỂM THỬ canh**: `workers/src/design/__tests__/ai-independence.test.ts` đỏ khi nhánh AI
> import `compute-backend` hay `use-design-projects`, và khi bất kỳ đường, tệp hay hợp đồng nào của bộ giải
> đã gỡ xuất hiện lại. Nhánh AI được dùng hạ tầng chung: `auth-scope`, `artifacts`, `llm/`, `rules/`, `kb/`,
> `brief/`, `shared/`.

### 8.4 Hai runtime

|          | **Worker (TypeScript)**                                   | **Container (Python)**                                    |
| -------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Chạy gì  | Giao diện, API, gọi mô hình ngôn ngữ, artifact, điều phối | Số hoá hồ sơ cũ: `/extract` (DWG/DXF), `/kb/record` (T58) |
| Gọi nhau | Worker → Container qua HTTP                               | **Không gọi ngược** Worker                                |

Đừng gọi mô hình ngôn ngữ từ Container. Container không giữ
trạng thái, không dùng API đặc thù Cloudflare. Giai đoạn dev: gói Cloudflare Free → `compute/` chạy
**Docker tại chỗ**, Worker gọi `localhost:8080` qua `ComputeBackend` (T3). Containers cần Workers Paid,
gọi qua Durable Object binding (`getContainer(env.DESIGN_COMPUTE, id)`), có hạng tới `standard-4`.

### 8.5 Ánh xạ thư mục và quyết định nền (T1–T8)

- `packages/contracts/*.schema.json` → `contracts/` (viết tay). Zod sinh ra ở `shared/src/design/*.generated.ts`
  bằng `npm run contracts:gen` / kiểm `npm run contracts:check` — **không sửa tay tệp sinh**. Python nạp
  thẳng JSON Schema, không sinh Pydantic.
- `apps/web/src/modules/design/` → `workers/src/design/` · `services/design-compute/` → `compute/` (không
  phải npm workspace) · `rules/`, `kb/`, `config/models.yaml`, `tests/golden/` ở gốc.
- T1 Vite SPA + Hono, không Next.js · T4 artifact qua `ArtifactStore` (adapter `supabase://` đang dùng,
  `r2://` viết sẵn); hồ sơ phát hành qua `documents`/`document_versions` · T5 bảng mang cả `tenant_id` lẫn
  `company_id` · T6 quyền chuỗi qua `role_capabilities`, không sửa ma trận `permissions` · T7 dùng lại enum
  `design_discipline` (`KT→kien_truc`, `KC→ket_cau`, `DN→dien_nuoc`) · T8 demo chỉ chạy dữ liệu giả lập/ẩn danh.

### 8.6 Ranh giới khi viết mã

- Cấm hard-code ngưỡng quy tắc (có test grep canh).
- DXF **một chiều** — không có và sẽ không có endpoint nhập ngược CAD.
- **Quy ước lớp bản vẽ là dữ liệu** (`kb/layer_mapping.yaml`) — cấm viết tên lớp vào mã. Trình trích xuất
  trả `layers_unmapped`, tách bạch với lớp cố ý bỏ qua (`ignore`).
- Container **không** quy chuẩn hoá nhãn phòng (`"PN2"` → `bedroom` là việc của Worker).
- Không tạo lại thứ đã có: `design_projects`, `customers`, `users`, `documents` + `document_versions`.
- Nhãn cảnh báo do mã chèn, không tắt được từ giao diện (`AI_DISCLAIMERS` trong `@nvg/shared/design`). Từ T117
  (Haan) màn hình KHÔNG bày câu chú thích giá / chi phí / riêng tư / «ảnh AI không đo được»; từ T154 (11/10/2026)
  cũng không in dấu lên ảnh do mô hình ảnh vẽ. Câu `noCodeCheck` (mục «Đối chiếu thói quen thiết kế») vẫn giữ.
- **Stub RPC nhận từ binding Workflow (`PIPELINE.create()`, `workflow.get()`) phải huỷ** qua
  `workflows/rpc-stub.ts` (`instanceIdOf`, `disposeStub`). Bỏ rơi cho bộ dọn rác thì `wrangler dev`
  tự huỷ ngẫu nhiên giữa lượt AI (T84, ba lần 25/09/2026, backtrace gdb). Kết quả `step.do` cũng là kết quả RPC — `run()` bọc `step` bằng `disposingStep` (T85). Phép thử quét mã canh.

### 8.7 Quy ước dữ liệu của module

1. **Khoá chính `design_artifact` = mã băm nội dung** (`sha256:` + 64 hex). Không có policy UPDATE/DELETE.
2. **Quyền chia theo BỘ MÔN, không theo lớp**: `design.project.all` · `design.read|write|publish.<discipline>`
   · `design.settings.write` (`DESIGN_CAPABILITIES` trong `@nvg/shared/design`). Cấu hình khai ra mà không
   policy nào đọc tới còn tệ hơn không khai.
3. RLS gói trong `rls_design_readable` / `rls_design_writable`, dựng trên quyền Module TK — không bảng nào chép lại điều kiện.
4. Phạm vi tenant suy từ `companies.tenant_id`; `auth_tenant_ids()` cố ý không dùng `auth_sees_all_companies()`.
5. **`rules/` quyết định hợp lệ; `kb/` quyết định bản vẽ trông thế nào** — đừng trộn. Trước khi ghi số vào
   `kb/`: từ vựng/quy ước thì n = 1 đủ; định mức/phân bố cần **5 công trình** (`priors.min_samples`,
   Haan hạ 15 → 5 ngày 23/09/2026, Q-49) — kho nay có 7 bộ nên tầng này đã mở. Vượt ngưỡng chỉ MỞ
   tầng thống kê: số rút ra ở n nhỏ vẫn chỉ vào điểm và cảnh báo, **không loại phương án** (T52).
6. **Bản vẽ NVG không có đa giác phòng trên lớp riêng**: tên lớp theo độ đậm nét khi in (`NV-Thay`,
   `NV-Khuat`…), đa giác phòng phải dựng từ đồ thị tim tường. Trình trích xuất **phải** đi vào block
   (`virtual_entities()`), **phải** đọc `ATTRIB`, và một tệp DXF là trọn hồ sơ một bộ môn (22–73 tờ). Ba
   chỗ này hỏng im lặng — chỉ phát hiện bằng đối chiếu bản vẽ thật.

### 8.8 Theo dõi tiến độ — bắt buộc

Tiến độ module ở **`TIEN_DO_THIET_KE.html`** (tách khỏi `TIEN_DO.html`). **Xong việc nào cập nhật ngay.**
Vướng mắc ghi ngay lúc gặp, đủ bốn ý: ở đâu, đã thử gì, đang chặn gì, cần gì để gỡ. Câu hỏi cho Haan ghi
vào phần "Câu hỏi chờ Haan" của file đó.

**Giữ tờ đó dưới ~120 KB** (20/09/2026 nó đã phình tới **460 KB / 5.971 dòng** — mở chậm, không ai đọc
hết, và tốn **~115.000 token** mỗi lần một phiên phải đọc nó). Ba quy tắc chống phình: mục «Đã làm» chỉ
giữ **hai ngày gần nhất**, cũ hơn đẩy sang **`TIEN_DO_THIET_KE_LUU.html`**; vướng mắc đã gỡ chuyển sang
tờ lưu trữ ngay; phần nói về thứ **đã bị xoá khỏi mã** thì **xoá hẳn** — `doc/design/QUYET_DINH_AI.md`
và lịch sử git đã giữ. Cập nhật hai tờ này bằng lệnh chèn ở shell, **đừng `Read` cả tệp**.

---

## 9. Đợt cải tiến UX và luồng (nhánh `cai-tien-ux`) — trạng thái

Chi tiết đầy đủ, hiện trạng tại mốc và danh sách commit: **`doc/MOC_CAI_TIEN_UX.md`**. Mục này là bản tóm
tắt để phiên sau bắt đầu ngay; tệp mốc thắng khi hai nơi lệch.

### 9.1 Nguồn gốc

Review UX toàn dự án (4 nhóm: điều hướng, giao diện, luồng nghiệp vụ, AI Design; ~150 ảnh chụp) và 8 vấn đề
chủ dự án nêu: (1) lãnh đạo / kiểm soát không thấy vấn đề ngay · (2) giao diện đè nhau, bỏ chế độ tối ·
(3) chuyển bước sai quyền, không đồng bộ · (4) không biết tiến độ / bước tiếp theo / bước cuối · (5) mẫu hợp
đồng Word tự điền · (6) giọng nói → chữ → AI tổng hợp, tải tệp mọi nơi · (7) AI Design chưa công thái học ·
(8) khảo sát: máy tự ghi kết thúc sau khi chốt.

- **Mốc:** tag `moc-truoc-cai-tien-ux` (= `ef2eb13`, PR #27 của `anhoangha/NVG`). Xem thay đổi:
  `git diff --stat moc-truoc-cai-tien-ux..cai-tien-ux`. Sao lưu CSDL máy + ảnh trước/sau ở `backup/` (không commit).
- `main` giữ nguyên. **Chưa đẩy nhánh/tag lên GitHub, chưa `db:migrate:demo`, chưa deploy** — cần Haan đồng ý.
  Mọi thay đổi chỉ chạy trên máy (`http://localhost:5173`); bản demo `nvg.tests99.workers.dev` vẫn là bản cũ.
- **Demo mới (18/10/2026, chủ máy là anh Dũng):** bản cũ `tests99` + Supabase `awaiwegmuykhctnysvou` nằm ở tài khoản
  khác, máy này không vào được. Đã dựng sẵn Supabase demo MỚI `fvfmtbdcvcniakigfpdm` (đã migrate 0001→0181, seed,
  nạp 5/6 kịch bản demo — thiếu NVO vì cần Worker mới chạy) và trỏ cấu hình sang Cloudflare tài khoản wewear
  (`automkt.workers.dev`). **Chưa deploy — anh Dũng quyết: chạy local tới khi làm xong mọi tính năng rồi mới
  phát hành.** Lúc phát hành: tài khoản wewear đang gói Free, mà `limits.cpu_ms` trong `workers/wrangler.jsonc`
  chỉ có ở Workers Paid → nâng gói (AI Design, Whisper cần) hoặc tách giới hạn CPU; rồi `db:migrate:demo` (Windows:
  `NVG_DB_TARGET=demo npm run migrate --workspace=db`), `npx tsx db/src/demo/index.ts --confirm=fvfmtbdcvcniakigfpdm
--only=nvo`, `deploy:workers`, đặt secret (service_role, Gemini trả phí, khoá AI Design — anh Dũng đã cho chép),
  `deploy:web`, bật hai công tắc AI. Supabase gói Free tự tạm dừng sau 7 ngày không dùng — khôi phục trên Dashboard.
- Cách làm đã chứng minh hiệu quả: **chạy thử bằng đúng tài khoản từng vai trên trình duyệt** (Playwright, chụp ảnh)
  sau mỗi thay đổi — phần lớn lỗi của đợt này (nút hiện rồi báo lỗi, tự gán sai người, bỏ qua được bước) chỉ lộ ra
  khi đi trọn luồng như người dùng thật, không lộ ở phép thử đơn vị.

### 9.2 Trạng thái từng giai đoạn

| GĐ  | Nội dung                                                                                                                                             | Trạng thái                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0   | Lưu mốc                                                                                                                                              | **Xong**                                                     |
| 1   | Quyền + thứ tự bước, đồng bộ liên module, dải tiến trình + chuỗi hồ sơ, gỡ chế độ tối, sửa lớp đè / token màu (vấn đề 2–4)                           | **Xong phần chính** — chờ Haan kiểm                          |
| 2   | «Tổng quan điều hành» + Dashboard lãnh đạo theo khung từng công ty + vai trò Kiểm soát nội bộ (vấn đề 1)                                             | **Xong phần chính** — chờ Haan kiểm                          |
| 3   | Khảo sát chốt bằng máy (CRM + TK), đính kèm dùng chung, ghi âm → Whisper → Gemini tóm tắt (vấn đề 6, 8)                                              | **Phần CRM xong trong Đợt 1**; phần TK ở Đợt 5               |
| 3b  | Điểm danh theo tổ, kiểm bán kính GPS (chỉ cảnh báo), báo cáo có mặt, đề xuất chấm công                                                               | Chưa làm — nay là Đợt 2 (2C) của kế hoạch tổng               |
| 4   | Mẫu hợp đồng `.docx` có chỗ trống, tự điền, xem trước, xuất (vấn đề 5)                                                                               | **Xong vòng đầu** — chờ Haan kiểm                            |
| 5   | AI Design thành 4 bước: Đầu vào → Mặt bằng → Mặt ngoài → Bộ kết quả (vấn đề 7)                                                                       | **Giao diện xong + sửa A/B (T163–T169)**; 6 lượt thật chưa ra mặt bằng — xem 9.3 |
| Đ1  | Đợt 1 Kinh doanh (kế hoạch tổng): 1A–1H + bổ sung 18/10 (AI thật, đính kèm, in, phiếu riêng)                                                         | **Xong trên máy** — chờ anh Dũng chạy thử                    |
| Đ2  | Đợt 2 Thi công (NVO trước): 2A mốc, 2B nhật ký giọng nói, 2D biên bản ký hai bên, 2E bảng theo dõi, 2F phiếu bảo hành, 2G mẫu nháp (0182, 0190–0194) | **Xong trên máy** trừ 2C (chờ câu 6) và mốc NVC (chờ câu 15) |
| Đ3  | Đợt 3 Tài chính: 3A đợt thu gắn mốc, 3B đề nghị thu tiền, 3C dòng tiền tuần, 3D lãi / lỗ quản trị, 3E bất thường KSNB (0195–0199)                  | **Xong trên máy** — anh Dũng chưa chạy thử                   |
| Đ4  | Đợt 4 Mua hàng – Kho: 4A gom đề nghị, 4B so giá, 4C đơn sắp trễ, 4D tồn tối thiểu (0200–0203)                                                    | **Xong trên máy** — anh Dũng chưa chạy thử                   |
| Đ5  | Đợt 5: 5A TK ghi âm + vòng ý kiến, 5B AI Design 4 bước, 5C-1/5/9 đấu thầu, 5D NVS, 5E nhắc HĐLĐ, 5F hành chính (0205–0209)                         | **Xong phần không bị chặn**; còn 5C khác (câu 14, 19), bảng công (câu 6) |
| HĐ  | Soạn hợp đồng bằng máy + bộ mẫu ba pháp nhân + ký không cần sếp vào app + bộ quét bản đã ký (0185–0189)                                              | **Xong trên máy** — anh Dũng đã chạy thử trọn tới bản quét   |
| 0b  | Bộ nhận diện theo logo NVG                                                                                                                           | **Xong vòng đầu** — chờ duyệt ảnh                            |
| V2  | Giao diện v2 (`design_handoff_nvg_v2/`): token, khung, sidebar 4 nhóm, thanh tab 4 ô, khuôn chung, đăng nhập, Việc hôm nay, Phê duyệt 3 ô (0221) | **Xong, đã gộp `cai-tien-ux`** — anh Dũng duyệt + giao toàn quyền 24/10/2026 |
| PH  | Phát hành bản demo mới                                                                                                                               | **Chuẩn bị xong, CỐ Ý CHƯA deploy** (xem 9.3)                |

**GĐ1 đã có trong mã** (migration 0155–0166; 0160–0166 là vòng rà chuỗi bước bằng đúng vai sau phản hồi chủ dự án):

- 0155 `move_opportunity_stage`: chỉ đi tới bước kế tiếp khi đủ điều kiện (`stage_readiness` — một nguồn cho
  CSDL và giao diện); lùi phải có lý do; «Ký hợp đồng» không chuyển tay. `_sync_opportunity_stage` nội bộ.
- 0156: trigger chặn người gửi tự ĐỒNG Ý hồ sơ của mình (`approval_decisions`, `payment_request_steps`);
  `my_pending_approvals` bỏ hồ sơ của mình.
- 0157: `auth_can_approve_module`; trigger `contracts_stage_permissions`, `contracts_source_ready`,
  `construction_sites_open_permission`; `rls_contract_writable` thêm điều kiện người chịu trách nhiệm.
- 0158: hợp đồng đã ký → cơ hội «Ký hợp đồng»; hủy / trượt thầu → báo người phụ trách cơ hội;
  `move_design_stage` không nhảy cóc bằng tay; bàn giao thiết kế gắn hợp đồng đã ký (tham số
  `tk.handover_requires_signed_contract`).
- 0159: `record_chain`, `opportunity_has_contract`, trigger một cơ hội một hợp đồng.
- 0160 (sau phản hồi chủ dự án): rời «Xác minh» cần Phân loại M2–M4 + Loại công trình (M1 đứng lại); «Báo giá»
  cần khảo sát đã làm hoặc lý do bỏ qua (`waive_opportunity_survey`, cột `survey_waived_reason`). Giao diện có
  ô Phân loại, tự mở tab nơi làm việc của bước, liên kết «làm ngay» cạnh từng dòng «Cần».
- 0161: báo giá lập TRONG bước Báo giá (vào Báo giá chỉ cần phân loại + khảo sát; Đàm phán mới cần báo giá đã gửi);
  «đã khảo sát» không được ở tương lai. Lưu phân loại / biên bản đã khảo sát thì tự sang bước kế và mở tab của bước.
- 0162: `approval_waiting_on` (phê duyệt đang chờ ai, bao lâu — dùng chung mọi loại phê duyệt); báo giá gửi khách /
  gói thầu nộp / phương án thiết kế gửi khách duyệt → cơ hội ở Báo giá tự sang Đàm phán; báo kết quả duyệt báo giá
  cho người phụ trách; lập phiên bản báo giá mới thì đóng phê duyệt đang chờ của bản cũ.
- 0163: `stage_readiness('contract')` (giá trị, ba nhóm điều khoản bắt buộc; quyết toán cần công trình đã bàn giao);
  báo người chịu trách nhiệm khi hợp đồng được duyệt / bị từ chối. Trang hợp đồng mở tab Điều khoản khi còn Nháp,
  khoá «Gửi phê duyệt» kèm lý do, hiện «Đang chờ: …» khi chờ duyệt (`components/entity/waiting-on.tsx`).
- 0164: `stage_readiness('site')` — khởi công cần chỉ huy trưởng THUỘC Thi công (quyền sửa TC) + ngày khởi công /
  hoàn thành dự kiến (trigger chặn); bàn giao cần biên bản nghiệm thu chủ đầu tư. `open_site_from_contract`: Ban
  Giám đốc mở được (trước đòi quyền SỬA nên TGĐ bị từ chối dù thấy nút), không tự lấy người Kinh doanh làm chỉ huy.
  Khối «Chuẩn bị khởi công» (`tc/site-prep-card.tsx`, ô chọn từ `site_commander_candidates`); chỉ huy trưởng được
  báo khi được phân công; mở công trình xong sang thẳng trang công trình; mỗi bước mở đúng tab.
- 0165: «Thúc» cho mọi phê duyệt đang chờ — `nudge_approval` (chỉ người gửi; báo đúng người `approval_waiting_on` kể
  ra; giãn cách `request_nudge_min_interval_hours`), lịch sử `approval_reminders`. Nút nằm trong `WaitingOn`.
  Thi công KHÔNG xem Module Hợp đồng (chủ dự án giữ nguyên): panel công trình ghi «Đã có hợp đồng — Kinh doanh và Ban
  Giám đốc quản lý nội dung», không lộ số / giá trị.
- 0166: kết thúc công trình cần đã khai hạng mục bảo hành, mọi hạng mục đã hết hạn, không còn yêu cầu bảo hành đang
  mở (áp cả đường tắt Nghiệm thu → Kết thúc); `warranties_fill_dates` tính lại ngày hết hạn khi sửa ngày bắt đầu /
  thời hạn (trước giữ ngày cũ).
- Giao diện: `shared/src/flow.ts` (`OPPORTUNITY_FLOW`, `CONTRACT_FLOW`, `SITE_FLOW`, `stepWindow`), `StepTrack`,
  `RecordChain`, slot `progress` của `EntityDetail`, `allowedDrop` của Kanban, `bottom-bar-slot.ts`; đã gỡ
  `lib/theme.tsx` và `tk-theme.css`.
- Hàng rào: `flow-guard.test.ts`, `flow.test.ts` (khớp SQL 0155), chuỗi hồ sơ trong `golden-path.test.ts`,
  `design-rules.test.ts` (lớp màu chỉ trỏ token đã khai; không còn chế độ tối); đột biến M238–M240.

**GĐ2 đã có trong mã** (0167–0170) — trạng thái HIỆN TẠI:

- **Vai trò `KSNB` «Kiểm soát nội bộ»** (0167 chỉ thêm enum; dòng vai trò + quyền do `db:seed` tạo — **chạy seed SAU
  migrate, kể cả trên demo**). Xem mọi pháp nhân / phân hệ; không tạo, sửa, phê duyệt; xem giá vốn, lợi nhuận, tài
  chính, nhật ký kiểm toán; KHÔNG xem lương, hồ sơ cá nhân. Tài khoản thử `ksnb@nhavietgroup.test`.
- `auth_is_read_only()`, `auth_manages_all_companies()` (0168): «xem mọi pháp nhân» không còn đồng nghĩa «quản lý mọi
  pháp nhân». **Viết điều kiện GHI mới thì dùng `auth_manages_all_companies()`, đừng dùng `auth_sees_all_companies()`.**
  Chữ 'KSNB' trong SQL so dạng `text` (giá trị enum mới chưa commit khi các migration chạy chung một giao dịch).
- Web: `useIsResponsible` dựa vào `ORG_MANAGER_ROLES` (gương `rls_owner_can_write`), không dựa `seesAllCompanies`.
  Đăng nhập / `/` đi tới `roles.default_route` (`useDefaultRoute`; trang đăng nhập chờ hồ sơ tải xong, tối đa 5 giây);
  TGĐ, CFO, BGĐ, KSNB → `/tong-quan`. Mục «Tổng quan điều hành» đầu menu chỉ hiện cho các vai trò đó.
- CSDL: `exec_overview()` (0169, 10 mảng cảnh báo, quy tắc quá hạn chép đúng `*DisplayStatus` của `shared/`, mốc «chờ
  lâu» = SLA nếu có, không thì `PENDING_APPROVAL_AGING_DAYS` trang truyền vào); `exec_overview_by_company`,
  `exec_company_pulse` (0170). Cửa vào: TGĐ / CFO / BGĐ / ADMIN / KSNB.
- **Khung từng công ty `CompanyBoards`** (`pages/dieu-hanh/company-boards.tsx`) — khối chính của lãnh đạo: ba khung NVC /
  NVS / NVO, mỗi khung đủ tình trạng (vấn đề, bấm = chọn pháp nhân đó + mở danh sách lọc), chờ duyệt, tiền trong kỳ,
  đang chạy — cùng thứ tự ở ba khung; khung có việc cần xử lý viền đỏ. Nhãn / biểu tượng mảng: `exec-meta.ts`.
- **Dashboard của lãnh đạo** (`dashboard.tsx`, nhánh `ExecDashboard`): chỉ còn chọn kỳ + `CompanyBoards` + liên kết sang
  Tổng quan điều hành và Báo cáo. Vai trò khác giữ Dashboard cũ (lưới thẻ phân hệ theo bộ chọn pháp nhân).
- **Tổng quan điều hành** (`/tong-quan`): `CompanyBoards` (tháng này) + bản đồ cảnh báo mảng × công ty (chỉ hiện mảng có
  vấn đề, mảng ổn gom một dòng ✓, rê ô để xem hồ sơ) + biểu đồ quy mô (cơ hội / hợp đồng theo công ty).
- `/kt/cong-no?chieu=phai-tra` mở thẳng tab Phải trả.
- Hàng rào: `ksnb.test.ts` (đo bằng cách nới chính sách — phép thử phải đỏ; cộng các công ty = số gộp),
  `tong-quan.test.tsx`, `company-boards.test.tsx` (số công ty này không lọt sang khung công ty kia), ca lãnh đạo
  trong `dashboard.test.tsx`.
- **Đã thử rồi bỏ** (đừng dựng lại): gộp số cả tập đoàn thành một con số; bảng chữ «cảnh báo theo công ty»; thẻ sức
  khoẻ vòng tròn; khối «Tiêu điểm» trên lưới thẻ; khối tài chính chia theo chủ đề tách công ty. Lý do ở 9.4.
- Hạn chế: số «cả tập đoàn» CHƯA loại giao dịch nội bộ (QĐ-6 chưa làm — không có cột đánh dấu); trang ghi rõ.

**GĐ4 vòng đầu đã có trong mã** (0171 — làm TRƯỚC GĐ3 theo chủ dự án; phạm vi gọn: `.docx`, không PDF, không AI):

- Căn cứ pháp lý mới: Luật Xây dựng 2025 (135/2025/QH15) và Nghị định 210/2026/NĐ-CP, hiệu lực 01/07/2026, thay
  Nghị định 37/2015 + 50/2021. Cột mới `contracts.price_form` (9 hình thức giá, Điều 82 khoản 2), `vat_rate` (giá trị
  ĐÃ GỒM thuế; rỗng = không tách), `project_location`; `companies.representative_title`, `bank_account_number`,
  `bank_name` (tài khoản CỦA PHÁP NHÂN); `customers.representative_name`, `representative_title`. Không lưu CCCD.
- `contract_templates` (pháp nhân × loại hợp đồng × hình thức giá tuỳ chọn; không xoá, «Ngừng dùng»; tệp và chỗ trống
  không sửa được) — quản lý: `auth_can_manage_contract_templates` = phê duyệt HD hoặc ADMIN, không KSNB.
  `contract_documents` — văn bản đã điền, đánh số bản, bản sau phải có lý do, BẤT BIẾN, lưu `filled_values`; khoá khi
  hợp đồng đã ký. Hai bucket `contract-templates` / `contract-documents`, quyền tệp theo thư mục đầu. KHÔNG dùng
  `documents` (Mẫu A — Thi công sẽ thấy văn bản hợp đồng).
- `shared/src/hd-template.ts`: danh mục chỗ trống (`TEMPLATE_FIELDS`, bảng lặp `TEMPLATE_LOOPS`), đọc số thành chữ
  (chia theo khối tỷ), tách thuế bằng `bigint`, bên A / B tự đổi theo loại hợp đồng, ô thiếu = `null` → dải chấm.
  `web/src/lib/docx-template.ts`: docxtemplater 3.71.0 + pizzip 3.3.0 (điền trên trình duyệt), docx-preview 0.4.1
  (xem trước, nạp khi cần), mẫu ví dụ dựng bằng mã. ⚠️ `docxtemplater/js/inspect-module` cần `lodash` mà gói không
  khai — dùng `TagCollector` tự viết. ⚠️ PostgREST trả cột `numeric` dạng SỐ, không phải chuỗi.
- Giao diện: `/hd/mau-hop-dong` (tải mẫu lên — kiểm cú pháp + chỗ trống lạ NGAY khi chọn tệp, sai thì không lưu; tải
  mẫu ví dụ; cách viết chỗ trống; thông tin pháp nhân, Quản trị sửa); tab «Văn bản» của hợp đồng (thông tin in lên
  văn bản — sửa khi Nháp; chọn mẫu → điền và xem trước → liệt kê ô thiếu → lưu phiên bản và tải về; các bản đã lưu);
  thanh `HdNav`; ô người đại diện ký ở biểu mẫu khách hàng.
- Hàng rào: `db/src/__tests__/hd-template.test.ts` (10, đã nới hàm quyền để thấy đỏ), `shared/.../hd-template.test.ts`
  (26), `web/src/lib/__tests__/docx-template.test.ts` (3). Chạy thử trình duyệt: TGĐ tải mẫu, Kinh doanh điền + lưu
  bản 1 trên hợp đồng nháp `NVC-HD-2026-MAU1` (tạo tay trên máy), Thi công bị chặn.

**Sau GĐ4 — định hướng «làm hộ» cho từng bộ phận (chỉ LẬP KẾ HOẠCH, chưa viết mã):**

- Chủ dự án nhận xét hệ thống mới chủ yếu ghi nhận cho TGĐ xem + AI Design; muốn hệ thống LÀM HỘ việc lặp lại của từng
  phòng ban (ví dụ Kinh doanh: hẹn khảo sát → ghi âm → chữ → máy viết báo cáo → sếp duyệt / trả về; hợp đồng tự lập
  từ mẫu và gửi duyệt trong hệ thống).
- **Kế hoạch tổng: `doc/KE_HOACH_LAM_HO.md`** — Bước 0 (chốt + phát hành phần đã làm), khối nền K1–K5 (ghi âm → chữ
  → nháp AI; hộp duyệt xem nội dung; sinh văn bản Word; việc cần làm hôm nay; quản trị AI), Đợt 1 Kinh doanh (kèm CRM
  theo dõi khách từ lúc tiếp cận) → Đợt 2 Thi công (7 mốc NVO) → Đợt 3 Tài chính; Đợt 4 Mua hàng – Kho và Đợt 5 các
  bộ phận còn lại song song sau Đợt 1. Mỗi đợt có phụ thuộc, câu hỏi chặn, tiêu chí xong.
- **Tài liệu cho chủ dự án / NVG (Claude Docs, không nằm trong repo):** «Hệ thống Quản trị NVG — Tổng quan trước và sau
  thay đổi», https://claude.ai/code/artifact/bf449c59-31e6-4dca-955a-a29b7053fc4b — mục 1 tổng quan; mục 2 hiện tại (ba
  pipeline NVC / NVO / NVS đặt cạnh nhau theo giai đoạn + Back Office 4 dòng); mục 3 sau thay đổi (cùng bố cục, ô xanh
  lá = máy làm hộ; 3.3 bảy mốc thi công NVO; 3.4 vòng đời khách hàng CRM); mục 4 bảng so sánh + 4.0 công cụ dùng chung
  - 4.1–4.16 chi tiết từng bộ phận (bước làm, công cụ); mục 5 đã làm; mục 6 lộ trình. Sửa tài liệu bằng công cụ Claude
    Docs, đừng tạo tài liệu mới.
- Tệp PDF «Vai trò và nhiệm vụ» 15 vai trò: `backup/Vai_tro_nhiem_vu_NVG.pdf` (không commit; dựng từ HTML bằng
  `backup/to-pdf.cjs`).
- **Bộ hồ sơ «HoSoTapHop Gui Sep»** (thư mục gốc repo, không commit, dữ liệu khách hạng 1): 7 hồ sơ nhà ở NVO (.rar) +
  `QUY CHUẨN NHÀ VIỆT ONE.docx`. Các hồ sơ ĐÃ được giải nén và đo ở `doc/design/13-ho-so-thuc-te.md` (Dương, Mạnh
  trùng từng byte với đợt 1) — không cần giải nén lại. Quy chuẩn là quy trình / chất lượng (15 quy tắc, 10 chuẩn, công
  thức 18 bước, «nghiệm thu trước khi che khuất», ảnh trước–trong–sau, 3 lớp kiểm soát), không có kích thước hình
  học. Không bộ nào là nhà xưởng NVC.
- Sự thật đã kiểm khi vẽ sơ đồ: NVS đã có tạm tính tiền thuê + bồi thường (`rentalSettlementPreview`) và biên bản thu hồi
  ký hai bên; CHƯA có màn hình báo giá thuê (PRD CRM-11). Phân hệ Đấu thầu không có bước thiết kế; Thiết kế ghi «NVO,
  hỗ trợ NVC khi cần». CRM chưa có đầu mối trước cơ hội, nhật ký liên hệ (CRM-01), chăm sóc khách cũ (CRM-07); đã có
  báo cáo phễu (`bc/sales-effectiveness.tsx`) và bàn giao khách khi nghỉ việc (CRM-10).

**GĐ1 còn thiếu:** bảng lịch sử bước chung `stage_transitions` (hợp đồng / gói thầu / công trình); dải tiến
trình cho gói thầu; thanh lưu dính của biểu mẫu đầu bài, thẻ PWA trên hộp thoại, `ConfirmDialog` qua portal.

### 9.3 Trạng thái hiện tại và bước tiếp theo

**Đọc `doc/KE_HOACH_LAM_HO.md` trước khi bắt đầu đợt nào** — thứ tự, phụ thuộc, câu hỏi chặn, tiêu chí xong ở đó.
Người đang làm việc với Claude Code trên máy này là **anh Dũng** (`dungpv1626`); «Haan» trong tài liệu là vai chủ dự án.

#### Đã hoàn thành (nhánh `cai-tien-ux`, đẩy lên `dungpv1626/NVG-TEST`)

- GĐ1, GĐ2, GĐ4 (0155–0171) và Bước 0b bộ nhận diện — chi tiết ở 9.2.
- **Đợt 1 — Kinh doanh** (0172–0181, commit 8139a22 → 2bc209b):
  - 1A/1B đầu mối + nhật ký chăm sóc (`leads`, `contact_logs`, `convert_lead`, báo trùng số điện thoại);
    1C việc hôm nay (`my_crm_followups`, quét nhắc đêm); 1F khách cũ + phễu theo nguồn.
  - 1D khảo sát: Bắt đầu / Kết thúc do máy ghi giờ, ghi âm, báo cáo 6 ô → Ban Giám đốc duyệt / trả về
    (`site_surveys.report_status`, phê duyệt `survey_report`); chưa duyệt thì chặn Báo giá.
  - 1E hợp đồng gửi duyệt kèm văn bản Word (`contracts_document_gate`, xem văn bản ngay trong hộp duyệt).
  - 1G trang «Trợ lý AI» (`/nen/tro-ly-ai`): công tắc từng chức năng, sổ chi phí `ai_calls`.
  - 1H thư viện công trình mẫu `/mau-cong-trinh` + link gửi khách có hạn, thu hồi được (`/xem-mau/:token` qua Worker
    `/public/showcase/:token`, hàm `showcase_public` chỉ service_role); xoá mẫu cần Giám đốc duyệt (`showcase_delete`).
  - Bổ sung 18/10/2026: ô ngày giờ `DateTimeInput` (bỏ `datetime-local`); 0180 ảnh / video / phiếu giấy / tài liệu
    đính kèm khảo sát (kho `survey-files`); in biên bản + in phiếu khảo sát trống (`pages/crm/survey-print.ts`); 0181 phiếu
    khảo sát RIÊNG từng pháp nhân (`shared/src/survey-forms.ts`, cột `site_surveys.site_details`); bộ ghi âm có thanh mức
    âm, chọn micro, nhắc khi micro không nghe thấy; Worker lọc câu Whisper tự bịa (`whisper-hallucination.ts`).
- **Đợt 2 — Thi công, xong trên máy 22/10/2026** (phần NVO; 2C điểm danh tổ chờ câu 6, mốc NVC chờ câu 15):
  - 2A xong (0182): `milestone_templates` (bộ mốc của pháp nhân, dữ liệu) → `site_milestones` (chụp lại khi áp; công
    trình mới của pháp nhân có bộ mặc định tự có mốc) + lịch sử `site_milestone_events`. Bộ 7 mốc NVO + 7 danh mục kiểm
    tra rút từ Quy chuẩn Nhà Việt One nằm ở `shared/src/tc-milestones.ts`, `db:seed` nạp — ĐỀ XUẤT, chờ Trưởng phòng
    Thi công NVO duyệt. Nghiệm thu mốc = biên bản nội bộ kèm danh mục (`record_milestone_acceptance` gọi
    `record_acceptance_with_checklist`); mốc sau chưa mở khi mốc trước chưa đạt; mốc cần lớp 3 thì Trưởng phòng Thi công /
    Ban Giám đốc kiểm (`review_milestone_technical`, không phải người lập, trả lại phải có ý kiến); chưa đạt đủ mốc thì không
    sang «Nghiệm thu bàn giao» (`stage_readiness` + trigger `construction_sites_milestones_gate`). Tab «Mốc thi công» trên
    trang công trình. Tài khoản thử mới: `congtruong.nvo@…` (TC), `chihuytruong.nvo@…` (CHT). Công trình thử trên máy:
    `NVO-CT-2026-0901`. Ảnh: `backup/dot2-2a/`.
  - 2B xong (0190, 22/10/2026): tab Nhật ký có khối «Nói nhật ký thay gõ» (dùng lại `VoiceRecorder`) → tệp vào kho
    `site-log-audio` (thư mục đầu = công trình, quyền `rls_site_readable/_writable`, không xoá) → Worker
    `POST /ai/site-log-draft` chép chữ (Whisper) + xếp mục (Gemini, công tắc RIÊNG `ai.site_log_enabled`, trống = tắt →
    đưa nguyên bản chép chữ vào ô Nội dung) → máy điền Nội dung (Việc đã làm / Vật tư / Vướng mắc / An toàn — ghép ở
    `shared/src/site-log-voice.ts`), Quân số, Thời tiết; đã gõ sẵn thì nối thêm. Người ghi sửa rồi Lưu; mục lưu kèm
    `voice_path`, `voice_transcript`, `ai_drafted` (trigger bắt tệp đúng công trình), danh sách có «Nghe đoạn ghi âm» +
    «Lời đã nói». Phép thử `db/src/__tests__/tc-voice-log.test.ts` (6, đột biến gỡ trigger / nới quyền kho đã đo đỏ),
    `shared/.../site-log-voice.test.ts`. Ảnh: `backup/dot2-2b/` (kịch bản `backup/dot2-2b-voice.cjs`, chạy với
    `AI_FAKE=transcribe,site_log`).
  - 2E xong (0191, 22/10/2026): `/tc/bang-theo-doi` «Bảng theo dõi công trình» (mục thứ hai của thanh Thi công) — mỗi
    công trình đang chạy một dòng từ hàm `tc_site_board()` (SECURITY INVOKER — RLS quyết phạm vi, chỉ huy trưởng chỉ thấy
    công trình được giao): mốc hiện tại + đạt n/tổng + hạn, nhật ký (đã ghi hôm nay / lần cuối), mốc chờ kiểm, đề nghị
    đang mở (`site_request_tracker`). Cột «Cần chú ý» chỉ từ NGÀY ĐÃ KHAI (quá hạn công trình, mốc quá hạn, đề nghị quá
    ngày cần) + mốc chờ kiểm; chưa ghi nhật ký KHÔNG tính là vấn đề (NVG chưa quyết ngưỡng). Dòng có vấn đề đứng trên,
    lọc «Chỉ công trình cần chú ý» (`?can-chu-y=1`). Phép thử `db/src/__tests__/tc-site-board.test.ts` (3, đột biến
    SECURITY DEFINER đã đo đỏ). Ảnh: `backup/dot2-2e/`, `backup/dot2-2e-cht/` (kịch bản `backup/dot2-2e-board.cjs`).
  - 2D xong (0192, 22/10/2026): biên bản nghiệm thu lập xong ở «Chưa ký»; «Ký hai bên» mở ngay sau khi lập hoặc để sau
    (`pages/tc/acceptance-sign.tsx`): hai `SignaturePad` trên cùng điện thoại HOẶC bản giấy quét bằng `DocumentScanner`
    → `sign_acceptance_record` (tên người ký bắt buộc, tệp phải ở `acceptance-docs/<công trình>/<biên bản>/`, ký một lần,
    trigger `acceptance_records_signature_frozen`). «In biên bản» tự điền từ `acceptance_document` (công trình, hạng mục,
    danh mục kiểm tra + kết quả, tồn tại, giá trị, chữ ký). Kế toán được báo lúc KÝ (trước: lúc lập — `record_acceptance`
    chép nguyên văn 0136, bỏ thông báo), không phải lúc lập; trang `/kt/bien-ban-nghiem-thu` (KT không xem được Thi công
    nên đi qua `kt_signed_acceptances` / `rls_acceptance_readable`): khách hàng = phải thu, tổ đội = phải trả, «Xem biên
    bản», «Đã ghi nhận» (`mark_acceptance_billed`, chỉ KT sửa được, một lần). Hệ thống KHÔNG tự sinh công nợ. Biên bản lập
    trước 0192 coi như đã ký + đã ghi nhận (chỉ gán lần đầu thêm cột). Phép thử `tc-acceptance-sign.test.ts` (6, đột biến
    nới quyền đọc / bỏ phạm vi ký đã đo đỏ); `tc.test.ts`, `golden-path` đổi theo thứ tự lập → ký → báo
    (`signAcceptanceWithPaper` trong `helpers.ts`). Ảnh: `backup/dot2-2d/` (kịch bản `backup/dot2-2d-sign.cjs`).
  - 2F xong (0193, 22/10/2026): phiếu bảo hành trên `warranty_claims` có sẵn (`pages/tc/warranty-claims.tsx`): lời khách
    nói → chép chữ (Worker `/ai/site-log-draft` với `purpose: 'transcript'`, tệp ở `site-log-audio`) hoặc gõ, ảnh hiện
    trạng (`construction-photos/<công trình>/bao-hanh/`), người phụ trách (mặc định chỉ huy trưởng công trình, phải là
    người Thi công — `site_commander_candidates`), hạn xử lý (tự đặt, hoặc tham số `tc.warranty_response_days` — để TRỐNG
    = không hạn). Trigger `warranty_claims_guard`: mã BH, phiếu mới luôn «Tiếp nhận», không quay lại «Tiếp nhận», hoàn
    tất cần kết quả + ảnh sau sửa, từ chối cần lý do, máy ghi giờ + người đóng, phiếu đã đóng không sửa. Người được giao
    nhận thông báo `warranty_claim_assigned`. `tc_site_board` thêm phiếu mở / quá hạn và hiện cả công trình đang bảo
    hành còn phiếu mở. Phép thử `tc-warranty.test.ts` (6, đột biến bỏ ảnh / bỏ kiểm người phụ trách đã đo đỏ). Ảnh:
    `backup/dot2-2f/` (kịch bản `backup/dot2-2f-warranty.cjs`, Worker chạy với `AI_FAKE=transcribe`).
  - 2G xong (0194, 22/10/2026): công trình sang «Bảo hành» (bàn giao) → trigger `construction_sites_showcase_draft` lập
    MỘT mẫu NHÁP trong thư viện mẫu (`showcase_items.status = 'nhap'`, mỗi công trình một mẫu): loại nhà, số tầng, diện
    tích / kích thước lô đất từ đầu bài thiết kế đã xác nhận, năm hoàn thành, mô tả liệt kê bản thiết kế khách đã duyệt;
    tên KHÔNG lấy tên công trình (hay mang tên chủ nhà). Thiết kế được báo (`showcase_draft`). Mẫu nháp chỉ Thiết kế /
    Giám đốc thấy (chính sách đọc mẫu, ảnh mẫu, kho `showcase`), không gửi khách được (trigger trên `showcase_shares`).
    Trang mẫu: khối «Ảnh từ công trình» (`showcase_draft_photo_candidates`: ảnh nghiệm thu + ảnh nhật ký; chính sách kho
    `construction-photos` thêm nhánh `rls_showcase_draft_site` — chỉ khi đang có mẫu nháp) → chép ảnh sang kho thư viện →
    «Xác nhận đưa vào kho» (`confirm_showcase_draft`: cần ảnh + ảnh bìa). `showcase_items_guard` chép nguyên văn 0179, thêm
    khoá trạng thái / công trình. Phép thử `showcase-draft.test.ts` (6, đột biến mở mẫu nháp + gỡ chặn gửi khách đã đo
    đỏ). Ảnh: `backup/dot2-2g/` (kịch bản `backup/dot2-2g-showcase.cjs`).
- **Sửa sau khi anh Dũng chạy thử Đợt 1 (20–21/10/2026, commit fc2e118 → 23a14aa):**
  - Biểu mẫu Khách hàng (tạo / sửa) kiểm trùng số điện thoại với đầu mối + khách hàng (`contact-duplicates-notice.tsx`,
    cùng hàm `contact_duplicates`); trùng khách hàng có sẵn thì không tạo thêm hồ sơ. Trước chỉ biểu mẫu Đầu mối kiểm.
  - Phân loại khách bằng LỜI, ký hiệu để trong ngoặc: «Chưa có nhu cầu — lưu để chăm sóc sau (M1)» · «Có nhu cầu thật —
    cần khảo sát (M2)» · «Đã rõ yêu cầu — chờ báo giá (M3)» · «Sắp chốt — đang đàm phán (M4)». Khách M1 dừng ở Xác minh
    có khung vàng giải thích; nút bước kế bị khoá thì ghi lý do NGAY dưới nút (không chỉ chú thích khi rê chuột).
  - Nút bị khoá (toàn hệ thống, `button.tsx`) chuyển hẳn sang xám — nút chính mờ mà vẫn xanh trông như bấm được.
  - Ô giờ `DateTimeInput`: chỉ gõ số, máy chèn «:» (`1430` → 14:30, `930` → 09:30); bản cũ ra `01:43` (có phép thử).
  - Khảo sát: «Đặt lịch» chỉ hỏi ngày giờ hẹn, người đi, ghi chú; giờ khảo sát do máy ghi (Bắt đầu / Kết thúc trên thẻ),
    gõ tay chỉ qua lối «Đã khảo sát mà quên bấm?» trong biên bản.
  - 0183: câu chữ `stage_readiness` theo đúng tình trạng báo cáo khảo sát (chưa gửi / đang chờ duyệt / bị trả về) +
    nhãn phân loại bằng lời; `crm_followups_for` đổi nhãn; trigger `notifications_survey_approved_tab` cho thông báo
    «đã duyệt — lập báo giá» mở tab Báo giá. Trang cơ hội tự mở tab của bước mới khi bước đổi (kể cả do BGĐ duyệt),
    `useOpportunity` tải lại khi quay lại cửa sổ.
  - 0184: chỉ lập báo giá khi cơ hội ở Báo giá / Đàm phán (trigger `quotes_require_quote_stage`, hằng
    `QUOTE_STAGES`); tab Báo giá thay nút bằng lý do, trang lập báo giá chặn khi vào thẳng. Trước đây BGĐ chưa duyệt
    khảo sát mà Kinh doanh vẫn lập, gửi duyệt, gửi khách được báo giá. Phép thử đổi theo thứ tự thật (duyệt khảo sát →
    sang Báo giá → lập báo giá), đột biến gỡ trigger đã đo đỏ.
- **Sửa 22/10/2026:** mẫu hợp đồng khách cá nhân hết in «Ông/Bà Ông …» (tiêu đề bên khách dùng `{doi_tac_ho_ten}` —
  tên bỏ danh xưng, `withoutHonorific`), dòng «Ông/Bà: …» lặp bên dưới chỉ còn ngày sinh (`convert.py`, NVO-HĐ-01→04,
  NVC-HĐ-05; commit 3f1077f). Ô đã điền của `NVO-HD-2026-THU1` chuyển sang mẫu mới.
- **Hợp đồng — soạn bằng máy (21/10/2026, commit 44cc2f9 → nay):** thẻ báo giá ghi bước tiếp theo (gửi khách xong
  cơ hội tự sang Đàm phán); Điều khoản + Văn bản gộp thành tab «Soạn hợp đồng» hai cột (trái sửa, phải bản xem trước
  luôn hiện, tự cập nhật, ô thiếu tô vàng, cột dính đo chiều cao header thật — `--detail-sticky-top`); máy soạn sẵn
  Phạm vi / Giá trị từ báo giá + khảo sát đã duyệt (`shared/src/hd-term-suggest.ts`); mỗi nhóm điều khoản chỉ hỏi ô
  nó dùng, tỷ lệ × giá trị → số tiền, sửa / xoá dòng; ô thiếu chia theo nơi sửa (`missingTemplateFieldsBySource`),
  điền tay riêng cho một văn bản.
  - **0185 + bộ mẫu ba pháp nhân:** anh Dũng gửi bộ dự thảo (NVC 15, NVO 13, NVS 12 tệp — gốc ở `Bo_hop_dong_*`,
    không commit). 21 mẫu hợp đồng chính chuyển bằng `db/seed-assets/contract-templates/convert.py` (dải chấm →
    chỗ trống ở đầu văn bản, khối hai bên `nvg_*` / `doi_tac_*`, giá + bằng chữ, bảng đợt thanh toán → bảng lặp;
    bỏ «Ghi chú soạn thảo»; ô Phương án giữ để chọn trong Word). `db:seed` tải lên kho `contract-templates`, tên tệp
    theo băm nội dung (đổi mẫu = ngừng bản cũ). Ba loại hợp đồng mới: `mua_vat_tu`, `thue_thiet_bi` (NVG chi ra),
    `cho_thue` (NVS) — không mở công trình (trigger `construction_sites_contract_type_guard`). Các đợt thanh toán mẫu
    đề xuất ở `contract_templates.payment_milestones` → nút «Dùng các đợt này». Phụ lục, biên bản nghiệm thu / thanh
    lý, hợp đồng lao động, bộ biểu mẫu dự thầu CHƯA nạp (thuộc phân hệ khác). Hợp đồng thử trên máy:
    `NVO-HD-2026-THU1`.
  - **0186 — văn bản hoàn chỉnh:** convert.py đánh số MỌI dải chấm còn lại (`{o_N}`, câu văn trước / sau, Điều,
    mức «mặc định»), lựa chọn trong ngoặc vuông (`{c_N}`), khối «☐ Phương án» (`{#pa_N_x}` + ô `{pa_N_x_o}`) →
    `contract_templates.free_fields` / `options`. Cột trái tab Soạn hợp đồng có «Nội dung riêng của văn bản» chia
    theo Điều, nút điền mức mặc định; giá trị lưu dần ở `contract_document_inputs` (một dòng một hợp đồng; khoá chuẩn
    `so_hop_dong`, khoá tự do `<template_id>:o_N`, `<template_id>:pa_N` = chữ phương án). Xem trước tô màu: xanh lá
    hồ sơ, xanh dương điền tay, vàng còn thiếu; nút «Lưu và gửi phê duyệt».
  - **0187 — ký không cần sếp vào hệ thống:** người chịu trách nhiệm (Kinh doanh) «Ghi nhận đã ký» được khi TẢI
    LÊN bản đã ký (ảnh / PDF, `contracts.signed_scan_path`, tệp phải có thật trong kho); Ban Giám đốc ghi nhận không
    cần bản chụp và được báo (`contract_signed_recorded`). Hợp đồng thi công TỪ CƠ HỘI CRM ký xong tự mở công trình
    ở bước Chuẩn bị (cờ giao dịch `nvg.auto_open_site` bỏ qua `construction_sites_open_permission`) + báo Trưởng
    phòng Thi công; từ gói thầu / thiết kế giữ đường cũ (gói thầu lập ngân sách trước). Quyết toán hợp đồng thi
    công cần đã có công trình. Trang hợp đồng tự đổi tab khi bước đổi; dải báo việc tiếp theo theo vai.
    `contractDisplayStatus` so quá hạn theo NGÀY.
  - **Sau ký + 0188 (22/10/2026):** tab Tổng quan của hợp đồng đã ký có khối «Sau khi ký — việc còn lại»
    (`pages/hd/after-sign-card.tsx`): bàn giao Thi công, các đợt thanh toán + hạn (để nhắc khách; số đã thu chỉ
    Kế toán ghi), phát sinh, giữ liên lạc khách, ai quyết toán. **0188 cập nhật tức thời:** `notifications` +
    `approvals` vào publication `supabase_realtime`; `hooks/use-live-updates.ts` (gắn ở chuông thông báo) nghe
    sự kiện rồi `invalidateQueries()` — không cần F5 khi được giao việc / được duyệt. Realtime kiểm RLS SELECT
    của người nhận. Bảng mới cần đẩy tức thời thì thêm vào publication bằng migration, ĐỪNG đọc nội dung sự kiện.
  - **Bộ quét dùng chung + 0189 (22/10/2026)** — `components/scan/document-scanner.tsx`, trả một `File` PDF A4, nơi
    gọi tự tải lên (không biết hồ sơ nào). Toán thuần ở `lib/scan/` (có phép thử, `scan.test.ts`):
    `detect.ts` tự tìm mép giấy (Otsu → vùng sáng lớn nhất → 4 điểm cực theo hai đường chéo; không chắc thì `null`) +
    vùng MẶT BÀN để tô trắng (tối / ít màu / xanh trội, thông ra mép ảnh — chữ lọt trong giấy và dấu đỏ chạm mép giữ);
    `perspective.ts` nắn + xoay trong MỘT lần lấy mẫu, trang 3.000 px (~250 dpi); `deskew.ts` đo góc dòng chữ ±10°;
    `enhance.ts` ba chế độ: Màu gốc / Tài liệu (nền giấy ước theo từng kênh màu → khử bóng + ánh đèn, kéo mức, làm sắc,
    giữ màu dấu) / Đen trắng (Bradley), cả hai chế độ sau dọn vệt tối trong dải 2 % sát mép; `quality.ts` báo «Mờ»
    (phương sai Laplace, ngưỡng 250 hiệu chỉnh trên ảnh thật); `build-pdf.ts` (pdf-lib 1.17.1, nạp khi cần). Nhiều ảnh một
    lần thì xếp theo thời điểm chụp (`sortByCapture`) + nút «Đảo thứ tự trang». Đang gắn ở «Ghi nhận đã ký», khối «Bản
    hợp đồng đã ký» (`signed-scan-panel.tsx`) và «Quét phiếu giấy» khảo sát.
    **0189:** `contracts_signed_scan_guard` (cột bản đã ký chỉ đổi lúc ký hoặc qua `attach_signed_scan`: bổ sung khi
    chưa có; THAY = người chịu trách nhiệm hoặc BGĐ, bắt buộc lý do, `audit_logs`, BGĐ được báo); kho: riêng tệp
    `da-ky-*` theo `rls_contract_scan_uploader` (BGĐ chỉ có quyền phê duyệt vẫn tải được; hợp đồng đã duyệt / ký /
    quyết toán); lịch sử `contract_signed_scans` (trigger ghi mỗi lần đổi tệp, lý do qua cờ `nvg.signed_scan_reason`,
    xem theo quyền hợp đồng) → mục «Các lần quét»; link khách `contract_scan_shares` + `_views` (≤ 1 năm, thu hồi được) →
    Worker `GET /public/signed/:token` (`contract_scan_public`, chỉ service_role, không giá trị / điều khoản) → trang
    `/xem-ban-ky/:token` (vẽ trang PDF bằng pdf.js — điện thoại không hiện PDF trong khung). «Chia sẻ»
    (`lib/share-file.ts`): máy cảm ứng mở bảng chia sẻ, máy tính tải tệp về.
- **Đợt 3 — Tài chính và kiểm soát, xong trên máy 23/10/2026 (0195–0199, mạch song song, phép thử `kt-dot3-*`):**
  3A đợt thanh toán (`contract_terms`) gắn mốc thi công hoặc biên bản nghiệm thu → mốc đạt / biên bản ký hai bên thì «đến hạn
  thu», báo Kế toán + Giám đốc Tài chính + người chịu trách nhiệm hợp đồng (`/kt/dot-thu`, ô «Căn cứ thu» ở khối Sau khi ký;
  nhắc trước hạn = tham số TRỐNG `kt.collection_remind_days_before`, quét đêm `scan_collection_reminders`). 3B đề nghị thu
  tiền bảng RIÊNG `collection_requests` (không dùng `payment_requests` — đó là đề nghị CHI): một bấm từ biên bản đã ký, số
  tiền theo đợt thu, bằng chữ, in, quét bản giấy; công nợ chỉ sinh khi Kế toán bấm «Ghi công nợ» (`/kt/de-nghi-thu`). 3C
  dòng tiền 4 / 8 tuần (`cash_flow_forecast_items` + `shared/src/kt-cash-forecast.ts`, `/kt/dong-tien-theo-tuan`): thiếu số
  dư đầu kỳ nhập tay thì chỉ báo tuần «Chi vượt thu», không tự dựng số dư. 3D lãi / lỗ quản trị từng công trình (Mẫu D,
  `/bc/lai-lo-quan-tri`, «số quản trị, không thay sổ kế toán»; chưa có ngân sách / chi phí thì «Chưa đủ dữ liệu»). 3E danh
  sách bất thường `ksnb_anomalies` (`/tong-quan/bat-thuong`, sáu nhóm; ngưỡng `ksnb.near_limit_percent`,
  `ksnb.acceptance_unsigned_days` TRỐNG → «Chưa cấu hình ngưỡng»). Dữ liệu thử hậu tố THU3 (`NVO-HD-2026-THU3`,
  `NVO-CT-2026-THU3`). Còn: khoản phải thu Kế toán lập tay cho cùng đợt có thể đếm hai lần ở dòng tiền; kế hoạch thu – chi
  nhập tay chưa vào dòng tiền tuần; QĐ-6.
- **Đợt 4 — Mua hàng và Kho, xong trên máy 23/10/2026 (0200–0203, phép thử `mh-dot4-*`):** 4A `/mh/gom-de-nghi`
  (`mh_purchase_pool` — gộp theo pháp nhân + mã vật tư + đơn vị; «Hỏi giá chung» / «Nhập giá chung» ghi trên TỪNG đề nghị
  nguồn, đơn hàng vẫn một đề nghị một đơn vì ngân sách và nơi giao theo công trình); báo giá nhập được từ lúc Nháp
  (`rls_quotation_writable`), không chọn được báo giá thiếu mặt hàng. 4B bảng so giá `quotation_board` (VAT, tệp báo giá
  quét — kho `quotation-files`, giá lần mua trước; người chọn, máy không gợi ý) hiện trong hộp duyệt đề nghị mua;
  `select_quotation` chép 0037, «thấp nhất» chỉ xét báo giá đủ hàng. 4C khối «Đơn hàng đến hạn giao» + quét đêm
  `scan_purchase_order_due_reminders` (sắp tới hạn = tham số TRỐNG `mh.order_due_soon_days`; quá hẹn / hôm nay luôn báo).
  4D tồn tối thiểu: trigger `inventory_items_low_stock_notify` báo ngay lúc tồn vượt xuống mức, mức trống = «Chưa đặt mức».
  Dữ liệu thử hậu tố THU4. Lỗ có sẵn: chính sách đọc `purchase_orders` / `deliveries` chỉ Mẫu A (chỉ huy trưởng thấy đơn
  công trình khác) — chưa sửa. Hàm danh sách nối nhiều bảng có RLS: viết điều kiện phạm vi tường minh trong SECURITY
  DEFINER (`mh_purchase_pool`), để RLS tự áp trên năm bảng nối thì quá 8 giây.
- **Đợt 5 (trừ 5B), xong trên máy 23/10/2026 (0205–0209, phép thử `dot5-*`, `rental-quote`):** 5A khảo sát thiết kế máy ghi
  giờ (`start_design_survey` / `finish_design_survey`) + ghi âm lời chủ nhà (kho `design-audio`, Worker `/ai/design-transcribe`
  chỉ chép chữ) + vòng ý kiến khách tự đánh số theo dự án + bộ môn (`design_reviews.round_no`, `record_design_feedback`
  bọc `record_design_review`). 5F giấy tờ pháp nhân có hạn (`company_documents`, `/ns/giay-to-phap-nhan`) + tài sản cấp phát
  ký nhận (`sign_asset_event`). 5E nhắc hợp đồng lao động hết hạn (`ns_expiring_contracts`, thẻ ở `/ns/viec-can-xu-ly`, không
  lộ lương). 5C-1/5/9 kho hồ sơ năng lực (`/da/ho-so-nang-luc`, dùng chung `company_documents`; tệp báo cáo tài chính chỉ mở
  qua `open_financial_statement` — Mẫu D, ghi nhật ký), gắn giấy tờ vào gói + báo đỏ hết hạn trước ngày nộp, vòng làm rõ +
  lịch sử gia hạn, bảo lãnh + kết quả trúng / trượt. 5D nhắc hết hạn thuê, phiếu giao ký nhận (`sign_rental_delivery`), báo
  giá thuê `/sx/bao-gia-thue` kiểm tồn + tự tính khi đơn giá `sx.rental_daily_rate` (theo sản phẩm, TRỐNG) đã đặt. Bốn hàm quét
  đêm mới. Số ngày nhắc `hc.document_remind_days`, `ns.contract_remind_days`, `da.document_remind_days`,
  `da.deadline_remind_days`, `sx.rental_remind_days` TRỐNG (quá hạn vẫn báo). Chưa làm: văn bản hành chính mẫu tự điền,
  bảng công (câu 6), 5C-2/3/4/6/7/8/10 (câu 14, 19), bảng giá bồi thường (câu 17). Dữ liệu thử hậu tố THU5.
- **5B AI Design bốn bước (22/10/2026, T162, chỉ `web/src/pages/tk/ai/`):** dải Đầu vào → Mặt bằng → Mặt ngoài (mặt đứng +
  phối cảnh) → Bộ kết quả; `?buoc=` mở thẳng bước. Chi phí ước tính trên nút «Xếp mặt bằng» / «Sửa lại» = trung bình tiền
  THẬT các lượt trước cùng tuyến mô hình (`design_ai_run` + `design_ai_call`), chưa có lượt thì «Chưa đủ dữ liệu». So phương
  án cạnh nhau; ba lý do trừ điểm lớn nhất từ thước chấm đã lưu; ô «Yêu cầu sửa» đặt lại (đảo một phần T117 — chờ quyết);
  Bộ kết quả `.zip` dựng trên trình duyệt bằng pizzip, tên theo mã hồ sơ. Chưa chụp được ba bước sau bằng artifact thật
  (CSDL máy không có lượt AI nào). Ảnh: `backup/dot5b-shots/`.
- **Câu hỏi 1, 2, 4, 8 đã làm (22/10/2026):** 0217 — không thi công trước hợp đồng (`tk.handover_requires_signed_contract`
  = true), trượt thầu tự chuyển cơ hội sang Mất cơ hội; 0218 — Tổng Giám đốc tự duyệt hồ sơ của mình
  (`user_may_self_approve`), hợp đồng đã ký còn ≤ 90 ngày là «sắp hết hạn» (`contracts_expiring_soon`, cột «Hết hạn» ở danh
  sách hợp đồng + khối trên Tổng quan điều hành). Phép thử `co-hoi-truot-thau`, `hd-sap-het-han`, ca TGĐ trong `flow-guard`.
- **Bốn mạch song song đã gộp (23/10/2026):** Đợt 3, 4, 5, 5B chạy trong worktree riêng, dải migration riêng, phép thử CSDL
  qua khoá chung; gộp xong chạy lại `npm run db:migrate` chuẩn (0195→0218 chạy lại đúng thứ tự) + `db:seed` + cả bộ `db`
  (718/727; đỏ còn lại là `env-guard` và các tệp lúc đỏ lúc xanh khi chạy chung, chạy riêng xanh). Worktree đã gỡ; ảnh của
  các mạch gom về `backup/dot3-*`, `dot4-*`, `dot5-*`, `dot5b-shots/`.
- **Tham số DEMO (23/10/2026, anh Dũng: «dữ kiện nào chưa có thì tự lấy demo mặc định»):** kịch bản `mac-dinh` của bộ nạp
  demo (`db/src/demo/scenario-defaults.ts`, `npm run db:demo-data -- --only=mac-dinh`) điền mọi số NVG chưa quyết: số ngày nhắc
  (đợt thu 7, hẹn giao 3, giấy tờ / HĐLĐ / hồ sơ năng lực 30, hạn thầu 7, trả giàn giáo 3), hạn bảo hành 7, KSNB 90 % / 7 ngày,
  đơn giá thuê + giá thuê nội bộ (70 %) + bồi thường cho 3 mã giàn giáo, 8 thời hạn xử lý phê duyệt (SLA), mức tồn tối thiểu
  còn trống (15 % tồn). Chỉ điền ô trống, mô tả ghi «Giá trị DEMO — NVG thay»; KHÔNG bật công tắc AI. Đã chạy trên máy.
- **Chạy AI Design THẬT lần đầu (23/10/2026, anh Dũng cho phép):** hồ sơ thử `NVO-TK-2026-THU5`, đầu bài nhà phố 5 × 18 m 4 tầng
  (mục 1 điền tay trên giao diện, 6 mục còn lại từ `db/src/demo/nvo-dau-bai.json`, xác nhận trên giao diện). Hai lượt «Xếp mặt
  bằng» (GPT-5.6 Terra, 1 phương án) đều HỎNG — 10 lần gọi mô hình, ≈ 0,74 USD, ~9 phút, 0 phương án. Ảnh + báo cáo lượt 1:
  `backup/ai-that/` (kịch bản `backup/ai-that/*.cjs`). Danh sách chỗ khó dùng ở «Bước tiếp theo» 2b.
- **Giao diện v2 — xong và đã gộp (24/10/2026, commit a7149ff → 6035a00, `design_handoff_nvg_v2/` không commit):**
  - Bước 1 token (DESIGN_SYSTEM.md §8, 10 cặp tương phản trong `design-rules.test.ts`); bước 2 khung xanh rừng + bảng nội
    dung `canvas` bo 24, sidebar 4 nhóm (Của tôi · Kinh doanh · Triển khai · Nội bộ, ẩn theo quyền), thanh tab điện thoại 4 ô
    (Hôm nay · phân hệ · Phê duyệt · Thêm); bước 3 khuôn chung — nút / ô nhập / tiêu đề 28, thanh trang con dạng viên, danh
    sách thẻ trắng, trang chi tiết có cột phải (`detail-aside.tsx`: thẻ tối «Bước tiếp theo» từ `StepTrack` + «Chuỗi hồ sơ»
    dọc từ `RecordChain`, cổng sang cột phải từ xl), Kanban, ô chỉ số, trạng thái, hộp thoại, `ui/form-page.tsx`
    (`FormLayout` «Sau khi lưu» + `FormSection` đánh số); bước 4 từng phân hệ — đăng nhập hai nửa, thanh trang con xuống
    dưới tiêu đề ở 48 trang, 152 ô chọn / ô nhiều dòng tự dựng theo kiểu ô nhập v2, ~200 thẻ đổi kiểu thẻ v2, bỏ bóng thẻ,
    `--color-fg` / `--color-fg-subtle` mang giá trị `ink` / `ink-subtle`, biểu mẫu «Sau khi lưu» ở Tạo cơ hội, Đầu mối, Báo
    giá, Khiếu nại, Gói thầu, Hồ sơ thiết kế, Đề nghị mua, Đề nghị thanh toán.
  - Trang mới: `/viec-hom-nay` (`pages/phe-duyet/today-page.tsx`: khách cần liên hệ, chờ tôi duyệt, tôi đã gửi còn chờ),
    `/viec-can-lam/:id` (mở đúng một hồ sơ chờ duyệt). Trang Phê duyệt có ba ô «Chờ tôi duyệt · Tôi đã gửi · Đã xử lý»
    (`?o=`), dữ liệu từ 0221 `my_approval_box(p_box)` (SECURITY INVOKER, 90 ngày, phép thử `db/.../hop-thu-v2.test.ts`).
  - Ảnh đối chiếu 1440 / 390 px: `backup/v2-buoc2/`, `v2-buoc3/`, `v2-buoc4/` (kịch bản `backup/v2-buoc4/sweep*.cjs`).
- **AI Design — giao diện (A) và bộ xếp (B), 23–24/10/2026, T163–T169, không tốn tiền AI:**
  - A (T163): lý do hỏng của lượt CHÍNH (`workflows/plan-main-rejection.ts`, `pages/tk/ai/plan-failure.ts`) kèm gợi ý sửa đầu
    bài; ước tính chi phí lần đầu theo bảng giá; hộp hỏi lại trước khi xếp; ô mật độ cảnh báo < 1 %; «Còn thiếu» chỉ đếm
    câu bắt buộc; xác nhận đầu bài có hộp hỏi lại; lưu nháp ở lại biểu mẫu; một kiểu «Bước X trên Y»; nhãn bậc mô hình;
    dải bước «Đang chạy / Hỏng»; câu tùy chọn gấp lại.
  - T164 (anh Dũng chốt): trần chi phí CHẶN thật — `design_setting.ai_run_cost_cap_usd` (0219, migration để trống, demo
    0,5, máy hiện 0,8), `ai/cost-cap.ts`, dừng trước lời gọi sửa có thể vượt; Worker chặn xác nhận đầu bài dưới ngưỡng /
    còn mâu thuẫn nghiêm trọng (`brief/gate.ts#briefConfirmBlock`); màn hình hiện lý do hỏng chính.
  - B: T165 nhà phố có ô tô — gara làm lối vào trong lời dẫn, câu nhắc «hàng bản phác quá hẹp»
    (`sketch_row_too_narrow`); báo cáo `.md` có câu trả lời mô hình (đã lưu từ 15/09 ở `ai_calls/<id>.json`). T166 nắn bản
    phác không ăn cạnh tối thiểu của ô thang. T167 tầng 1 hỏng thì vẫn soát phòng thiếu ở tầng trên. T168 tầng chỉ dựng được
    nhờ chia lại thì lỗi ban công là hệ quả, không đổ cho mô hình; bỏ câu «đầu thang bị chặn» khi bản phác có lối đi. T169
    tầng trên hỏng thì xếp lại tầng 1 với ô thang thu về cạnh tối thiểu (+1 vòng qua cổng trong phát lại 234 vòng).
    Fixture lượt thật: `workers/src/design/__tests__/fixtures/ai-run-*.json`.
  - 6 lượt «Xếp mặt bằng» THẬT trên `NVO-TK-2026-THU5` (GPT-5.6 Terra): ≈ 2,15 USD, 0 phương án. Trang giải thích cho
    anh Dũng (4 bước + bảng các lượt): https://claude.ai/artifact/9J6st5KDMr9qTXsQ6JQEdt (ảnh `backup/ai-giai-thich/`).
- Hàm chép-dài bản mới nhất: `decide_approval` ở 0179, `stage_readiness` ở 0183, `crm_followups_for` ở 0183, `my_pending_approvals` ở 0175, hàm canh
  `site_surveys_report_guard` ở 0181. Hạn mức loại phê duyệt mới nằm ở seed (`DEFAULT_APPROVAL_LIMITS`) — `db:seed` sau migrate.
- Ảnh chạy thử từng phần: `backup/dot1-1a/` → `backup/dot1-1h/`, `backup/dot1-dinh-kem/`, `backup/dot1-phieu-rieng/`,
  `backup/dot1-micro/` (không commit).

#### Trạng thái từng phần

| Phần                                  | Trạng thái                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mã Đợt 1                              | Xong; phép thử CSDL có đột biến; `tsc`, `lint` (trừ `backup/`) sạch                                                                                                                                                                                                                                                                                                             |
| Hợp đồng (0185–0187)                  | Xong trên máy: 21 mẫu NVC / NVO / NVS nạp bằng seed, mọi chỗ trống điền được và lưu theo hợp đồng, Kinh doanh ghi nhận ký kèm bản đã ký, ký xong tự mở công trình. Cả bộ phép thử `db` xanh trừ hai nhóm đỏ sẵn (9.6)                                                                                                                                                           |
| Cập nhật tức thời (0188)              | Xong: thông báo + phê duyệt đẩy về trình duyệt ~1 giây (đo bằng Playwright), không cần F5                                                                                                                                                                                                                                                                                       |
| Bộ quét + bản đã ký (0189)            | Xong trên máy, anh Dũng chạy thử bằng ảnh thật tới bản đạt (lần quét «sss» trên AB). `scan.test.ts` + `hd-template.test.ts` (22) xanh, đột biến chính sách kho đã đo đỏ. Chưa thử trên điện thoại thật                                                                                                                                                                          |
| Nhật ký giọng nói (0190)              | Xong trên máy, chạy thử bằng `chihuytruong.nvo@…` ở khung điện thoại với AI giả lập. Máy xếp mục (`ai.site_log_enabled`) để TẮT — chưa duyệt chi phí; tắt thì vẫn chép chữ thật và đưa nguyên lời vào ô Nội dung                                                                                                                                                                |
| Đợt 2 Thi công (0190–0194)            | Xong trên máy, anh Dũng CHƯA chạy thử (dữ liệu thử `NVO-CT-2026-0901`, `-0902`): nhật ký giọng nói, bảng theo dõi Trưởng phòng, biên bản ký hai bên → Kế toán, phiếu bảo hành, mẫu nháp khi bàn giao. Mỗi phần có phép thử CSDL + đột biến đã đo đỏ và chạy thử bằng đúng vai trên trình duyệt. Cả bộ `db` 644/649 (5 đỏ sẵn: `env-guard`, `kb-room-area-stats` khi chạy chung) |
| Đợt 3 / 4 / 5 (0195–0209)             | Xong trên máy (mỗi phần có phép thử CSDL + đột biến đo đỏ, chạy thử bằng đúng vai); anh Dũng CHƯA chạy thử. Dữ liệu thử hậu tố THU3 / THU4 / THU5. Số chờ NVG đã có giá trị DEMO (kịch bản `mac-dinh`) |
| AI Design 4 bước (5B)                 | Giao diện + sửa T163–T169 xong. 6 lượt thật trên nhà phố 5 × 18 m (≈ 2,15 USD) chưa ra mặt bằng: lượt 4 qua tầng 1–3; lượt 6 mô hình trả lại bản phác y nguyên nên máy dừng sau 2 lời gọi. Phát lại (T170): biệt thự 15 × 20 m `46d6eff3` vòng 1 đã LƯU trên hồ sơ thử `NVO-TK-2026-PL01` — 70,2 điểm, dưới ngưỡng vì 2 nhóm dưới sàn; Bộ kết quả tải được. Mặt ngoài chưa chạy (tốn tiền mô hình). Giao diện 25/10 (việc 1 = A + B + D): bước Mặt bằng thành khung hai ngăn (bản vẽ luôn phải; trái Xếp mặt bằng / Đánh giá / Ảnh nội thất), một nút chính kèm chi phí, model / mức suy nghĩ / số phương án / gói quy tắc gấp trong «Tùy chọn nâng cao» (cả Mặt ngoài, Phối cảnh, ảnh từ bản vẽ kỹ sư); «Đánh giá» bằng lời (`ai-plan-verdict.tsx`: Đạt / Chưa đạt — N việc nên sửa, phòng bị ảnh hưởng, «Nhờ AI sửa» điền sẵn ô yêu cầu, không gọi AI); một phương án thì Mặt ngoài tự dùng. Đầu bài (E, 27/10): khung «Tóm tắt đầu bài» sống (câu nặng điểm) cạnh biểu mẫu và đứng đầu chế độ xem, câu trả lời gấp theo mục. Còn: C (bấm phòng trên bản vẽ) |
| Giao diện v2                          | Xong mọi phân hệ, đã gộp `cai-tien-ux`. Web 738/755 (17 đỏ sẵn của Node 24). Làm thêm 24/10: thanh trên điện thoại nền xanh rừng, thông báo «Hoàn tác» (`ui/toast.tsx`), `FormLayout` cho Khách hàng / Nhân sự / Mẫu công trình — ảnh `backup/v2-them/` |
| Soạn hợp đồng trực tiếp (0222)        | Xong 25/10/2026: bấm chỗ vàng / xanh dương trên bản xem trước là điền tại chỗ (thấy nguyên câu); «Tải lên bản đã sửa trong Word» = phiên bản mới `contract_documents.source = 'sua_trong_word'`, bắt buộc ghi đã sửa gì, gửi phê duyệt gửi đúng bản ấy; tab Soạn hợp đồng bỏ cột phải. Hợp đồng thử `NVC-HD-2026-WORD1`. Cùng ngày (A + B): người không sửa được chỉ thấy văn bản xem trước toàn khổ + ai đang soạn (không ô khoá); đã khoá thì hiện đúng bản đã duyệt / đang gửi; khung chỗ trống chia Cần điền (điều khoản bắt buộc chưa ghi, thông tin hợp đồng, bên NVG) / Nên điền / Tùy chọn của mẫu (gấp lại, Phụ lục riêng) / Điền lúc ký. Bản xem trước LUÔN hiện (anh Dũng dặn). Khung hai ngăn kiểu VS Code (`components/ui/split-workspace.tsx`): kéo thanh giữa đổi bề rộng, kéo tab sang ngăn kia, phóng to một ngăn, nhớ sắp xếp trên máy; ô trong tab ẩn mở bằng `revealElement` / `revealById`. «Nhận soạn thay» (0223, anh Dũng đồng ý): Ban Giám đốc nhận một hợp đồng Nháp → thành người chịu trách nhiệm, người soạn trước được báo, nhật ký; quyền soạn = `auth_drafts_contract` (sửa HD, HOẶC phê duyệt HD + là người chịu trách nhiệm); chính sách `contracts_update` thêm điều kiện người chịu trách nhiệm (trước Kinh doanh sửa được hợp đồng người khác). Hợp đồng thử `NVO-HD-2026-NST1`. Soạn theo bước (C): tab trái 1. Thông tin → 2. Điều khoản → 3. Nội dung riêng (tùy chọn) → 4. Kiểm tra và gửi, huy hiệu ✓ / số còn thiếu, nút «Bước tiếp». Sửa hồ sơ khách tại chỗ (D): ô bên khách thiếu (địa chỉ, điện thoại, email, mã số thuế, đại diện, chức vụ) lưu thẳng vào `customers` (RLS `customers_update` quyết), vẫn có «chỉ điền cho văn bản này» |
| Bộ mẫu hợp đồng                       | Bản DỰ THẢO (anh Dũng gửi, dùng như chính thức) — chờ pháp chế NVG rà; bảng hỏi mục 6 trong tệp «00_Huong_dan» từng bộ chờ NVG trả lời. Tài khoản ngân hàng ba công ty là số DEMO                                                                                                                                                                                               |
| AI trên máy                           | **Chạy THẬT**: Whisper (Workers AI) + Gemini 2.5 Flash trả phí — `workers/.dev.vars` `AI_FAKE=` rỗng, công tắc `ai.transcribe_enabled` / `ai.survey_summary_enabled` = 1 ở CSDL máy. Muốn quay về giả lập: `AI_FAKE=1`                                                                                                                                                          |
| Bản demo cũ `nvg.tests99.workers.dev` | Vẫn chạy bản trước GĐ1, CSDL `awaiwegmuykhctnysvou` — ở tài khoản khác, máy này KHÔNG vào được                                                                                                                                                                                                                                                                                  |
| Bản demo mới                          | Supabase `fvfmtbdcvcniakigfpdm` đã migrate 0001→0181 + seed + 5/6 kịch bản demo (thiếu NVO). Cloudflare tài khoản wewear (`automkt.workers.dev`) — **chưa deploy**; lần thử đầu bị từ chối vì gói Free không cho `limits.cpu_ms`                                                                                                                                                |
| Repo                                  | Chỉ đẩy lên `dungpv1626/NVG-TEST` (remote `dungpv`); remote `origin` (anhoangha) đã khoá đẩy                                                                                                                                                                                                                                                                                    |

#### Bước tiếp theo

1. **Anh Dũng đang chạy thử trên máy** — đã đi trọn: đầu mối → phân loại → khảo sát → duyệt → báo giá → gửi khách →
   Đàm phán → soạn hợp đồng (bộ mẫu NVC-HĐ-01) → duyệt → ký → công trình đã mở → quét bản đã ký. Hợp đồng «AB»
   `NVC-HD-2026-0501` (`ce44609b-3977-474c-887d-a747255bbd3a`, Đã ký, người chịu trách nhiệm Nguyễn Văn A — Kinh doanh
   NVC) có công trình `NVC-CT-2026-0105` (`9c2f0f6e-b475-41e0-b457-74bf292c254b`) ở bước **Chuẩn bị, CHƯA có chỉ huy
   trưởng** — việc đang ở Trưởng phòng Thi công NVC Hoàng Văn E (`congtruong.nvc@…`): chọn chỉ huy trưởng (vd Đỗ Văn K
   `chihuytruong.nvc@…`) và sửa ngày dự kiến (đang là ngày thử 21–22/10/2026, sẽ hiện «Quá hạn») rồi sang «Đang thi
   công». Tiến độ thanh toán của AB chỉ có dòng thử («Test» 30%) — sửa bằng phụ lục. Bản đã ký đang dùng là lần quét
   «sss» (6 lần quét trong lịch sử, các link khách đều đã thu hồi). Còn thử: hợp đồng NVO `NVO-HD-2026-THU1`
   (`26581784-c23e-4a4a-aabc-0e19f2589e34`, 9 đợt thanh toán mẫu NVO-HĐ-02); khảo sát mới trên «Ok» `NVC-CH-2026-1648`;
   việc hôm nay, khách cũ, thư viện mẫu, Trợ lý AI. Lỗi anh gặp → sửa ngay, kiểm bằng đúng vai (`backup/*.cjs`).
   Tài khoản (`http://localhost:5173`, mật khẩu `NhaViet2026`): `kinhdoanh.nvc@…`, `kinhdoanh.nvo@…`, `tgd@…`,
   `congtruong.nvc@…`, `thietke.nvo@…`. Sau khi khởi động lại máy: Docker → `npm run db:start` → `npm run dev:workers` →
   `npm run dev`. Cổng 8788 có nhiều tiến trình `workerd` cũ thì tắt hết rồi chạy lại một bản.
   Việc treo của phần hợp đồng (lỗi «Ông/Bà Ông …» đã sửa 22/10, commit 3f1077f):
   phụ lục / biên bản nghiệm thu / thanh lý / hợp đồng lao động / bộ biểu mẫu dự thầu trong bộ gửi CHƯA nạp (thuộc
   phân hệ khác — nạp khi làm phần đó, dùng lại `convert.py`); chưa có chỗ tạo hợp đồng mua vật tư / thuê máy / giao
   khoán với nhà cung cấp, tổ đội (thuộc Mua hàng, Thi công).
   Việc treo của bộ quét: (a) **giấy cong** — đề xuất thêm điểm giữa mỗi cạnh để uốn theo mép (máy tự đặt khi thấy mép),
   chờ anh Dũng quyết; tờ giấy tràn khung thì chỉ nắn được theo dòng chữ (khó hơn nhiều); (b) thử trên **điện thoại thật**
   (cần cho Vite / Worker nghe mạng nhà và tạm đổi `.env` sang IP máy `192.168.1.12` — chưa làm, anh Dũng chưa yêu cầu);
   (c) đã gắn vào ký biên bản nghiệm thu (2D); còn đề nghị thanh toán ở Đợt 3; (d) ảnh đã qua Zalo /
   chỉnh sửa có thể mang thời điểm gửi chứ không phải lúc chụp → thứ tự lệch, dùng «Đảo thứ tự trang».
2. **Đợt 2 — Thi công: xong trên máy, anh Dũng CHƯA chạy thử.** Hướng dẫn chạy thử đã gửi anh Dũng (22/10) theo
   thứ tự: 2B nhật ký nói (chỉ huy trưởng, 0901) → 2A mốc (0901) → 2E bảng theo dõi → 2D biên bản ký hai bên → Kế toán
   (0902) → bàn giao 0902 → 2G mẫu nháp (Thiết kế) → 2F phiếu bảo hành (0902). Dữ liệu thử NVO:
   `NVO-CT-2026-0901` (`a705ba2b-…`, đang thi công, mốc 3/7, không gắn hồ sơ thiết kế) và `NVO-CT-2026-0902`
   (`a7790cd0-c40b-41be-8b51-98069157345e`, dựng 22/10: đạt đủ 7 mốc, đang «Nghiệm thu», gắn hồ sơ thiết kế có đầu bài
   đã xác nhận, 4 ảnh nhật ký, 3 hạng mục bảo hành — chỉ thiếu biên bản nghiệm thu chủ đầu tư đã ký để sang «Bảo hành»).
   Còn của Đợt 2: 2C điểm danh tổ (câu 6), mốc nhà xưởng NVC (câu 15); chờ anh Dũng: bật `ai.site_log_enabled` (Gemini
   ~0,001 USD / lượt nói), đặt `tc.warranty_response_days`.
   **Đợt 3, 4, 5 đã xong trên máy (23/10/2026)** — anh Dũng chạy thử bằng đúng vai: Kế toán `/kt/dot-thu`,
   `/kt/de-nghi-thu`, `/kt/dong-tien-theo-tuan`; TGĐ / KSNB `/tong-quan/bat-thuong`, `/bc/lai-lo-quan-tri`; Mua hàng
   `/mh/gom-de-nghi`, `/mh/don-hang`; Kho `/kho/ton-kho`; Thiết kế khảo sát ghi âm + vòng ý kiến; `/ns/giay-to-phap-nhan`;
   `/da/ho-so-nang-luc`; `/sx/bao-gia-thue`. Còn chặn: bảng công (câu 6), 5C-2/3/4/6/7/8/10 (câu 14, 19), mốc NVC (câu 15).
   Lỗ có sẵn chưa sửa: chỉ huy trưởng thấy đơn đặt hàng công trình khác (chính sách `purchase_orders` / `deliveries` chỉ Mẫu
   A) — hỏi anh Dũng có sửa không.
2a. **Giao diện v2 (`design_handoff_nvg_v2/`, anh Dũng duyệt + giao toàn quyền 24/10/2026) — đã gộp vào `cai-tien-ux`:**
   token v2 (DESIGN_SYSTEM.md §8), khung xanh rừng + sidebar 4 nhóm + thanh tab điện thoại 4 ô, khuôn chung (danh
   sách, chi tiết có cột phải «Bước tiếp theo» + «Chuỗi hồ sơ», Kanban, biểu mẫu «Sau khi lưu», trạng thái), trang
   đăng nhập hai nửa, thanh trang con dưới tiêu đề ở mọi phân hệ, ô nhập thống nhất. Trang mới: `/viec-hom-nay`
   (Việc hôm nay), `/viec-can-lam/:id` (một phê duyệt), Phê duyệt có ô «Tôi đã gửi / Đã xử lý» (0221
   `my_approval_box`). Giữ có chủ đích: Tổng quan điều hành mỗi công ty một khung (không gộp số tập đoàn); trang
   đầu từng vai trò không đổi. Route trong bản thiết kế mà app chưa có (vd `/tc/cong-trinh/mo`, `/hd/hop-dong/soan`,
   `/kho/phieu`, `/lam-ro/:id`) KHÔNG tự tạo. Làm thêm 24/10: thanh trên điện thoại nền xanh rừng; thông báo nhỏ có «Hoàn tác»
   (`components/ui/toast.tsx`, khung đặt ở `AppShell`) gắn ở xoá dòng điều khoản hợp đồng (ghi xoá khi hết 6 giây —
   chính sách sửa `contract_terms` bỏ qua dòng đã xoá mềm nên không khôi phục sau được), «Ngừng dùng / Dùng lại» mẫu
   hợp đồng, «Đánh dấu tất cả đã đọc»; `FormLayout` cho Khách hàng, Nhân sự, Mẫu công trình. Các trang còn lại có ô
   nhập là danh sách kèm khối nhập nhanh (Phiếu kho, Nhà cung cấp…) — không phải biểu mẫu toàn trang, giữ nguyên.
2b. **AI Design — việc tiếp theo (chờ anh Dũng đồng ý thứ tự, đề xuất 1 → 2):**
   1. ĐÃ LÀM (T170, 24/10/2026): tuyến `POST /design/ai/plan/replay` (chỉ khi `.dev.vars` có `AI_REPLAY=1`), digest hồ
      sơ phải trùng digest lượt ghi; hồ sơ thử `NVO-TK-2026-PL01` (`fbcd8e1d-b915-406e-9df4-f98a08272e98`), kịch bản
      `backup/ai-phat-lai/` (`dung-dau-bai.ts` → `tao-ho-so.mjs` → `phat-lai.mjs` → `chup.cjs`).
   2. ĐÃ THỬ RỒI GỠ (T171, 25/10/2026): khung nhà ống do chương trình dựng — phát lại 243 vòng: luồng thật THU5 0 → 0 vòng
      qua, ngữ cảnh thử 6 → 4 (lùi) nên gỡ; mã giữ ở scratchpad `rowhouse/t171-wip.patch`. Chặn thật: tầng 1 chọn vị trí thang /
      giếng trời theo điểm riêng tầng 1, các tầng trên hết chiều sâu. Hướng gỡ: quay lui chọn tầng 1 biết các tầng trên
      (kiểu T169, không tốn tiền) HOẶC đổi lời dẫn cho mô hình vẽ mỗi dải sâu trọn bề ngang (cần lượt chạy thật, xin phép).
   2b. ĐÃ LÀM (T172, 27/10/2026): tầng trên hỏng thì dời ô thang tầng 1 một ô lưới (`sketch.ground_core_shift.max_steps: 1`) —
      đường Workflow 11 → 15 vòng qua, THU5 vẫn 0; 2 bước không thêm gì mà vòng lâu nhất 218 s (sát trần CPU 300 s).
      THU5 còn chặn ở bản phác tầng 2–4 → cần câu nhắc / lượt thật.
   3. Sau đó mới xin chạy thật thêm (mỗi lượt 0,2–0,5 USD, trần 0,8). Thử mô hình khác: chưa khuyên.
   Phát lại / đo bộ xếp: một lượt vitest một lúc, `--pool=forks --poolOptions.forks.maxForks=1` (máy 8 GB).
   Danh sách chỗ khó dùng ban đầu của lượt 23/10 (đã làm hết, T163):
   - (A) giao diện, không tốn AI: hỏng thì hiện LÝ DO tiếng Việt của lượt có lỗi chính (không phải lượt cuối) + gợi ý sửa
     đầu bài; báo cáo `.md` lưu cả câu trả lời của mô hình; trần chi phí / hỏi trước khi gọi lại nhiều lượt, ước tính lần đầu từ
     bảng giá; ô mật độ xây dựng < 1 thì cảnh báo («0,9 là 0,9 % — có phải 90 %?»; gõ 0.9 đang lưu 0,009); câu «(tùy chọn)»
     không nằm trong «Còn thiếu»; «Xác nhận đầu bài» có hộp hỏi lại và ẩn khi < 70 %; «Lưu nháp» không đẩy ra khỏi biểu mẫu;
     thống nhất bộ đếm bước (đang có «bước 1 trên 6», «Bước 1/5», «Bước 1 trên 7»); tên mô hình dễ hiểu + gợi ý chọn; khối ảnh
     nội thất rời khỏi bước Mặt bằng khi chưa có mặt bằng; nhãn bước «Đang chạy» / «Hỏng»; số thập phân dấu phẩy trong câu
     cảnh báo; lỗi trùng key React trên trang hồ sơ thiết kế; đầu bài 7 mục quá dài (mục 1 = 26 câu, ~6 màn hình, 42 thao tác).
   - (B) vì sao bộ xếp không ra nhà ống 5 m 4 tầng (lỗi: phòng không có lối vào, phòng làm việc thiếu 1 m², thang không chạm
     hành lang, cửa phòng khách chỉ đặt được ở cạnh giáp hàng xóm) — phát lại không tốn tiền từ ý định đã ghi; cần lưu câu
     trả lời mô hình trước.
   - (C) sau (B): một lượt thật nữa (≈ 0,3–0,5 USD, phải xin anh Dũng) để kiểm Mặt ngoài, Bộ kết quả, so phương án, ô yêu cầu sửa.
3. **Phát hành — CHỈ sau khi xong mọi tính năng** (anh Dũng quyết 18/10/2026). Trình tự đã chuẩn bị:
   (a) chọn gói Cloudflare: Workers Paid 5 USD/tháng (đủ AI Design + Whisper), hoặc Free và tách `limits.cpu_ms` khỏi
   `workers/wrangler.jsonc` (AI Design hỏng, Whisper đoạn dài dễ hỏng); (b) khôi phục Supabase nếu đã tạm dừng; tạo lại mật
   khẩu CSDL + service_role (đã lộ trong chat) rồi cập nhật `.env.demo`; (c) `NVG_DB_TARGET=demo npm run migrate
--workspace=db` (Windows: không dùng `npm run db:migrate:demo` — cmd không hiểu cú pháp đặt biến) rồi seed cùng cách;
   (d) `npm run deploy:workers`; đặt secret `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_PAID_API_KEY` và các khoá AI Design
   (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `POLLINATIONS_API_KEY` — anh Dũng đã cho chép từ
   `.dev.vars`); (e) `NVG_DB_TARGET=demo npx tsx db/src/demo/index.ts --confirm=fvfmtbdcvcniakigfpdm --only=nvo` và `--only=mac-dinh` (tham số DEMO); migrate demo bây giờ phải tới 0218;
   (f) `npm run deploy:web`; kiểm `curl https://nvg-api.automkt.workers.dev/design/health`; (g) bật hai công tắc AI ở trang
   Trợ lý AI của bản demo; chạy thử bằng đúng vai.
4. Việc nhỏ treo của Đợt 1: AI điền luôn các ô «Thông tin hiện trường» riêng từng công ty; nút «Gửi mẫu» trên đầu mối /
   cơ hội; nhập đầu mối từ Excel; Kinh doanh NVS sửa ô phiếu khảo sát (câu 22).
5. Việc treo cũ, làm xen: lịch sử bước chung `stage_transitions`; dải tiến trình gói thầu; QĐ-6 giao dịch nội bộ; lối vào Tổng quan điều hành trên thanh dưới điện thoại; PDF chuẩn và AI gợi ý câu chữ cho mẫu hợp
   đồng; nối Zalo OA / form quảng cáo; gửi văn bản cho khách qua email; thêm dữ liệu demo quá hạn ở cả ba công ty.

**Migration tiếp theo: 0224.** (Đã dùng tới 0223; 0204, 0210–0216, 0220 bỏ trống.)

### 9.4 Quyết định đã chốt và lý do

| Quyết định                                                                                                                                                                             | Lý do                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Người chịu trách nhiệm (Kinh doanh) ghi nhận đã ký kèm bản đã ký tải lên; Ban Giám đốc được báo (0187, thay một phần dòng dưới)                                                        | Anh Dũng 22/10/2026: giám đốc ít vào app, nhân viên đưa sếp ký trực tiếp — bắt sếp bấm «Ghi nhận đã ký» làm hợp đồng kẹt. Bản đã ký là căn cứ thay cho chữ ký trên hệ thống                            |
| Hợp đồng thi công từ cơ hội CRM ký xong tự mở công trình ở bước Chuẩn bị; quyết toán cần đã có công trình                                                                              | Ký xong «kẹt ở quyết toán, không biết nhảy đi đâu»; điều kiện «mọi công trình đã bàn giao» đúng rỗng khi chưa có công trình. Gói thầu / thiết kế có bước mở riêng (ngân sách DA-09, bàn giao thiết kế) |
| Kinh doanh chỉ soạn, sửa, gửi hợp đồng mình chịu trách nhiệm; Ban Giám đốc ghi ký, quyết toán, hủy sau duyệt                                                                           | Chủ dự án chọn; tách người thực hiện với người phê duyệt (PRD 2.3). BGĐ có `approve` HD nhưng không có `edit`, nên trước đây lại không ghi ký được                                                     |
| Cấm tự ĐỒNG Ý hồ sơ của mình, đặt ở TRIGGER chứ không sửa từng hàm duyệt                                                                                                               | Một chỗ phủ mọi loại phê duyệt; không chép lại `decide_approval` ~300 dòng (bài học 0086). Tự hủy (`rejected`) vẫn được. Đơn nghỉ xét theo nhân viên trong đơn                                         |
| Quy tắc hợp đồng đặt ở trigger trên bảng, không ở thân hàm                                                                                                                             | Mọi đường đổi bước (kể cả `decide_approval`) đều đi qua; không chép lại hàm dài                                                                                                                        |
| Điều kiện «Báo giá / Đàm phán» chấp nhận báo giá CRM, gói thầu HOẶC hồ sơ thiết kế                                                                                                     | NVC định giá qua gói thầu (DA), NVO qua thiết kế — đòi riêng báo giá CRM là chặn nhầm luồng nhà xưởng                                                                                                  |
| Không tự sang Đàm phán khi khách trả lời báo giá                                                                                                                                       | `quotes.customer_response` là chữ tự do, không có cờ chấp nhận; điều kiện thay bằng «đã duyệt và đã gửi khách»                                                                                         |
| Không nhảy cóc hồ sơ thiết kế chỉ ở `move_design_stage`, không ở trigger bảng                                                                                                          | `record_design_review` đẩy Phương án → Hồ sơ kỹ thuật khi khách duyệt — trigger sẽ chặn nhầm thao tác thật                                                                                             |
| Không tự đẩy công trình sang Nghiệm thu khi có biên bản khách hàng                                                                                                                     | Biên bản có thể chỉ cho một đợt (`stage_name`)                                                                                                                                                         |
| `stage_readiness` và `record_chain` là SECURITY DEFINER nhưng chỉ trả cờ / hồ sơ người gọi được xem                                                                                    | Kinh doanh không xem DA vẫn phải biết đủ điều kiện và đã có hợp đồng; hồ sơ ngoài quyền bị bỏ hẳn (5.4)                                                                                                |
| Gỡ hẳn chế độ tối                                                                                                                                                                      | Chủ dự án yêu cầu; bảng màu thứ hai không ai duy trì là nơi sinh chữ đen trên nền đen                                                                                                                  |
| Hộp hướng dẫn không tự mở, chỉ chấm «có hướng dẫn mới»                                                                                                                                 | Bảng tự mở che cột Trạng thái / Thời hạn ở 16 danh sách và chặn cú bấm                                                                                                                                 |
| Trên điện thoại, thao tác công trường THAY thanh điều hướng (kèm nút «Phân hệ»)                                                                                                        | Hai thanh chồng nhau ~150px che ô nhập nhật ký; AFD 4.8 cho 4–5 mục, nút chụp ảnh luôn hiện                                                                                                            |
| STT: Cloudflare Workers AI Whisper; tóm tắt: Gemini Flash trả phí, tắt mặc định                                                                                                        | Chủ dự án muốn miễn phí / rẻ; Gemini miễn phí có thể huấn luyện trên dữ liệu khách nên bị loại                                                                                                         |
| Mẫu hợp đồng: `.docx` có chỗ trống, điền tất định; AI chỉ gợi ý câu chữ                                                                                                                | Giữ đúng định dạng mẫu Word của NVG; dữ liệu hợp đồng là hạng 1, không gửi AI                                                                                                                          |
| Rời Xác minh cần Phân loại M2–M4 + Loại công trình; khảo sát bắt buộc trước Báo giá, bỏ qua phải ghi lý do                                                                             | Chủ dự án chọn; trước đó không có chỗ nhập phân loại và khảo sát bỏ qua được không để lại dấu vết. M1 «Lưu trữ» = chưa có nhu cầu thực                                                                 |
| Khảo sát: đổi luồng cho CẢ CRM lẫn TK                                                                                                                                                  | Chủ dự án chọn; hai nơi đang ghi thời điểm kết thúc sai theo hai kiểu khác nhau                                                                                                                        |
| Dashboard điều hành là trang riêng + vai trò KSNB chỉ xem                                                                                                                              | Chủ dự án chọn; Dashboard chung không cho lãnh đạo thấy ngay vấn đề toàn hệ thống                                                                                                                      |
| Báo giá lập TRONG bước Báo giá; vào Báo giá chỉ cần phân loại + khảo sát                                                                                                               | Đòi có báo giá để VÀO bước Báo giá là ngược thứ tự — người dùng kẹt ở Khảo sát (thấy khi chạy thử)                                                                                                     |
| Làm xong việc của bước thì tự sang bước kế + mở đúng tab (lưu phân loại, biên bản khảo sát, gửi báo giá…)                                                                              | Chủ dự án: «phải tự mò»; bước có điều kiện rõ thì hệ thống đi tiếp, người dùng chỉ làm việc                                                                                                            |
| Mọi phê duyệt hiện «Đang chờ: ai · bao lâu» + nút «Thúc» (chỉ người gửi, có giãn cách)                                                                                                 | AFD 4.7; trước đó người gửi chỉ thấy «Chờ duyệt», phải gọi điện hỏi                                                                                                                                    |
| Thi công KHÔNG xem Module Hợp đồng                                                                                                                                                     | Chủ dự án giữ nguyên quyền; panel công trình chỉ nói «đã có hợp đồng», không lộ số / giá trị                                                                                                           |
| Chỉ huy trưởng phải là người có quyền sửa TC; ô chọn chỉ liệt kê người đó                                                                                                              | Mở công trình từng tự lấy người Kinh doanh phụ trách hợp đồng làm chỉ huy (thấy khi chạy thử)                                                                                                          |
| Kết thúc công trình chỉ khi hết bảo hành, không còn yêu cầu bảo hành mở                                                                                                                | Trước đó bấm được ngay hôm bàn giao — công trình biến khỏi theo dõi khi khách còn quyền gọi bảo hành                                                                                                   |
| KSNB: xem giá vốn / lợi nhuận / tài chính / nhật ký; không xem lương, hồ sơ cá nhân                                                                                                    | Kiểm soát cần số để đối chiếu; lương / cá nhân là mặc định an toàn chờ Haan                                                                                                                            |
| Lãnh đạo: MỖI CÔNG TY MỘT KHUNG đủ tình hình; không chia trang theo chủ đề, không theo bộ chọn pháp nhân                                                                               | Chủ dự án qua bốn vòng: gộp số → không biết công ty nào; tách theo chủ đề → phải gom bằng mắt, nhớ không hết; chốt «nhìn một nơi nắm một công ty»                                                      |
| Lãnh đạo nhìn ít mà ra vấn đề: chỉ vấn đề mới to / đứng trên, mảng ổn gom một dòng, không xếp thẻ ngang hàng                                                                           | Chủ dự án: «nhìn quá nhiều thứ cùng cấp bậc nên bị loạn»                                                                                                                                               |
| Mẫu hợp đồng làm TRƯỚC GĐ3; vòng đầu chỉ `.docx` (không PDF, không AI)                                                                                                                 | Chủ dự án chọn; PDF đúng định dạng cần máy chủ LibreOffice, AI tốn phí — tách ra vòng sau                                                                                                              |
| Văn bản hợp đồng ở bảng riêng `contract_documents`, không ở `documents`                                                                                                                | `documents` theo Mẫu A — cả pháp nhân xem được, trong khi Thi công không xem Module HD                                                                                                                 |
| Ô chưa có dữ liệu in dải chấm và được liệt kê trước khi lưu; mẫu có chỗ trống lạ thì không cho lưu mẫu                                                                                 | Không bịa số (5.2); lỗi mẫu phải lộ lúc soạn mẫu, không lộ lúc Kinh doanh cần văn bản                                                                                                                  |
| Hợp đồng đã ký thì khoá văn bản; sửa câu chữ = sửa trong Word rồi lập bản mới có lý do (trước khi ký)                                                                                  | Hệ thống không đọc ngược tệp Word; số liệu sửa trên hệ thống để tệp và CSDL không lệch                                                                                                                 |
| Lãnh đạo dùng hình thay chữ khi có thể (biểu tượng, ô màu kèm số / ✓); mức luôn có chữ hoặc nhãn đọc được                                                                              | Chủ dự án: «nhiều chữ quá»; CGD 6.8 cấm dùng màu làm cách duy nhất                                                                                                                                     |
| Hướng tiếp theo: hệ thống LÀM HỘ từng bộ phận — máy làm nháp, người kiểm và gửi, sếp duyệt / trả về kèm ý kiến                                                                         | Chủ dự án: hệ thống đang chủ yếu ghi nhận cho TGĐ; phòng ban vẫn gõ lại, gọi điện, Zalo. Máy chỉ nháp (PRD 2.3)                                                                                        |
| Thứ tự: Bước 0 → Kinh doanh → Thi công → Tài chính; Mua hàng – Kho và bộ phận còn lại song song sau Đợt 1                                                                              | Đợt Kinh doanh xây khối nền dùng chung (ghi âm → nháp AI, hộp duyệt xem nội dung, văn bản Word, việc hôm nay); Tài chính lấy dữ liệu từ mốc / biên bản của Thi công                                    |
| Báo cáo khảo sát do Ban Giám đốc duyệt (không thêm vai trò Trưởng phòng KD); chưa duyệt thì chặn Báo giá                                                                               | Chủ dự án chọn                                                                                                                                                                                         |
| «Gửi hợp đồng trong hệ thống» = gửi phê duyệt kèm văn bản Word; gửi khách / email làm sau                                                                                              | Chủ dự án chọn; chưa có dịch vụ email                                                                                                                                                                  |
| AI làm bằng giả lập trước; gọi thật chỉ khi duyệt số lượt + chi phí                                                                                                                    | Chủ dự án chọn; CLAUDE.md 6.4                                                                                                                                                                          |
| CRM bổ sung đầu mối + nhật ký chăm sóc (bắt buộc bước tiếp + ngày hẹn) + khách cũ; KHÔNG thay Zalo                                                                                     | Chủ dự án chỉ ra; phiếu khảo sát Kinh doanh: «thông tin chỉ nằm trong Zalo rồi trôi mất» là vướng mắc số 1; PRD CRM-01, CRM-07 chưa có                                                                 |
| Thi công NVO chia 7 mốc, nghiệm thu + ảnh trước khi che khuất; NVC chờ NVG xác nhận mốc riêng                                                                                          | Quy chuẩn Nhà Việt One (18 bước, chuẩn 05, 06); một trạng thái «đang thi công» không chặn được đổ bê tông khi chưa nghiệm thu thép                                                                     |
| Sơ đồ ba pipeline đặt cạnh nhau, cùng hàng = cùng giai đoạn; bản «sau» cùng bố cục bản «hiện tại»                                                                                      | Chủ dự án: tách 3 công ty, nhìn được toàn bộ pipeline, so được từng ô                                                                                                                                  |
| NVC: ghi bước «phương án kỹ thuật, biện pháp thi công»; việc tự thiết kế để câu hỏi mở                                                                                                 | Hai nguồn trong hồ sơ khảo sát nói khác nhau (Ban Giám đốc: có thiết kế; chính phòng Dự án: theo bản vẽ chủ đầu tư) — không tự chọn                                                                    |
| Thư viện công trình mẫu (1H): Thiết kế đẩy vào, cả công ty xem, chỉ Thiết kế + Giám đốc sửa, xoá cần Giám đốc đồng ý; gửi khách bằng link trực tuyến; không hiện giá                   | Chủ dự án chốt (17/10/2026). Kinh doanh / TGĐ đang chào khách bằng ảnh rải trên Drive, Zalo; nhà khách đã làm được dùng làm mẫu. Ngoại lệ có chủ đích với Mẫu A (cả công ty đọc)                       |
| Đấu thầu NVC (5C) mở rộng: kho hồ sơ năng lực trước, rồi soạn bộ hồ sơ dự thầu từ số liệu có sẵn (hành chính, năng lực, tài chính máy sinh; kỹ thuật chỉ nháp)                         | Chủ dự án đồng ý gộp (17/10/2026). Phòng Dự án NVC thiếu người, dữ liệu thầu phân tán; máy không ký, không nộp, không quyết giá (PRD 2.3)                                                              |
| Bước 0b: đổi bộ nhận diện theo logo NVG (xanh lá N = màu hành động chính; cam V chỉ điểm nhấn, chữ tối; xanh dương G hạn chế), giữ nguyên 6 màu trạng thái; làm trước Đợt 1            | Chủ dự án yêu cầu (17/10/2026). Cam trên chữ trắng chỉ 2,36:1; xanh dương gần «Đang xử lý» — dùng làm liên kết sẽ đọc như trạng thái                                                                   |
| Đính kèm khảo sát ở bảng riêng `site_survey_attachments`, quyền dùng lại `rls_survey_readable/_writable`; gửi duyệt thì khoá                                                           | Ảnh nhà khách là dữ liệu khách hàng (Thi công cùng pháp nhân không xem); Ban Giám đốc phải duyệt đúng bộ ảnh lúc gửi                                                                                   |
| Phiếu khảo sát riêng từng pháp nhân = 6 mục chung + nhóm ô riêng; danh sách ô là DỮ LIỆU (`survey-forms.ts`), giá trị ở jsonb                                                          | Anh Dũng yêu cầu (18/10/2026). Ô còn chờ Kinh doanh từng công ty sửa — đổi ô không được kéo theo migration. Ô NVO / NVC rút từ hồ sơ khảo sát; NVS là đề xuất                                          |
| Phiếu giấy in cùng thứ tự ô với màn hình; về văn phòng chụp phiếu tải lên rồi gõ lại; chưa cho AI đọc chữ viết tay                                                                     | Không bắt dò khi gõ lại; đọc chữ viết tay là AI tốn phí — để sau                                                                                                                                       |
| Bật AI THẬT trên máy: Whisper (Workers AI) + Gemini 2.5 Flash gói trả phí; khoá AI Design được chép lên demo khi phát hành                                                             | Anh Dũng cho phép từng phần (18/10/2026), xác nhận khoá Gemini đã bật thanh toán (gói miễn phí có thể huấn luyện trên dữ liệu khách). Một báo cáo ≈ 0,0005 USD                                         |
| `vad_filter` + lọc câu Whisper tự bịa; chép ra rỗng thì báo «Không nghe rõ», KHÔNG lưu câu bịa                                                                                         | Gặp thật: micro chỉ thu tiếng ồn ra «Hãy subscribe cho kênh Ghiền Mì Gõ…». Đo cho thấy đường chép chữ đúng (giọng đọc rõ chép chuẩn), lỗi ở micro                                                      |
| Bộ ghi âm hiện thanh mức âm, tên micro, cho chọn micro, nhắc sau 4 giây nếu đỉnh dưới −30 dB                                                                                           | Người ghi phải biết micro hỏng NGAY tại hiện trường, không phải sau khi chép chữ                                                                                                                       |
| Chỉ đẩy lên `dungpv1626/NVG-TEST`, KHÔNG BAO GIỜ lên `anhoangha/NVG`; remote `origin` khoá đẩy bằng địa chỉ vô hiệu                                                                    | Anh Dũng yêu cầu (18/10/2026)                                                                                                                                                                          |
| Dựng bản demo MỚI (Supabase `fvfmtbdcvcniakigfpdm` + Cloudflare `automkt`) thay vì cập nhật `tests99`                                                                                  | Bản cũ ở tài khoản Cloudflare / Supabase máy này không vào được; anh Dũng chọn «tạo mới»                                                                                                               |
| Chạy local tới khi xong mọi tính năng rồi mới deploy                                                                                                                                   | Anh Dũng quyết (18/10/2026): một lần phát hành, không deploy lặp; còn phải chọn gói Cloudflare (Free không cho giới hạn CPU mà AI Design cần)                                                          |
| Mốc thi công là DỮ LIỆU: bộ mốc của pháp nhân (`milestone_templates`) chụp vào công trình khi áp; bộ 7 mốc NVO rút từ Quy chuẩn Nhà Việt One là đề xuất chờ Thi công NVO duyệt         | Đổi mốc không được kéo theo migration; NVC dùng cùng cơ chế khi có danh sách mốc (câu 15). Công trình đang chạy không đổi khi bộ mốc sửa                                                               |
| Lớp kiểm thứ ba của mốc = Trưởng phòng Thi công / Ban Giám đốc, KHÔNG phải người lập biên bản; trả lại phải có ý kiến                                                                  | Quy chuẩn NVO chuẩn 05 (ba lớp kiểm soát, kiểm độc lập hạng mục quan trọng)                                                                                                                            |
| Khách hàng trùng số điện thoại với khách có sẵn thì KHÔNG tạo thêm hồ sơ; trùng với đầu mối chỉ báo                                                                                    | Khách hàng là bảng dùng chung ba pháp nhân — hai hồ sơ một người là hai lịch sử; đầu mối có thể chính là người sẽ thành khách                                                                          |
| Ghi loại khách bằng lời, ký hiệu M1–M4 trong ngoặc                                                                                                                                     | Anh Dũng: «M1–M4 khó nhìn vì phải nhớ ký hiệu»; giữ ký hiệu cho người đã quen                                                                                                                          |
| Đặt lịch khảo sát tách khỏi biên bản; giờ khảo sát do máy ghi, gõ tay là lối dự phòng                                                                                                  | Anh Dũng: hẹn 10 ngày nữa mới khảo sát thì lịch và hoàn thành không nên chung một ô; gõ tay một giờ đã thành «đã khảo sát» (thấy khi chạy thử)                                                         |
| Chỉ lập báo giá ở bước Báo giá / Đàm phán, chặn bằng trigger                                                                                                                           | Anh Dũng hỏi «sếp chưa duyệt khảo sát mà vẫn lập báo giá thì sao» — thật sự lập được; chặn ở CSDL để mọi đường ghi đều qua                                                                             |
| Điều khoản + Văn bản gộp một tab «Soạn hợp đồng» hai cột; bản xem trước luôn hiện, tự cập nhật, tô màu (xanh lá hồ sơ / xanh dương điền tay / vàng còn thiếu), bấm chỗ vàng tới ô điền | Anh Dũng: sửa phải đổi tab rồi kéo xuống tận cuối mới thấy văn bản; «không biết thiếu phần nào, đã điền phần nào»                                                                                      |
| Mọi dải chấm, lựa chọn [a/b], «☐ Phương án» của mẫu thành chỗ trống có tên (câu văn quanh nó, Điều, bên A/B, hàng × cột), lưu theo hợp đồng ở `contract_document_inputs`               | Anh Dũng: văn bản phải ra «một bộ hoàn chỉnh»; ô điền tay chỉ trong trình duyệt thì tải lại trang là mất (5.4)                                                                                         |
| Máy soạn sẵn Phạm vi / Giá trị từ báo giá + khảo sát đã duyệt; Tiến độ thanh toán chỉ gợi ý các đợt MẪU ghi sẵn, không tự đặt tỷ lệ                                                    | Anh Dũng chọn phương án B (tỷ lệ chia đợt là quyết định của pháp nhân, chưa có cấu hình — không bịa số, 5.2)                                                                                           |
| Mỗi nhóm điều khoản chỉ hỏi ô nó dùng; tỷ lệ × giá trị hợp đồng → số tiền                                                                                                              | Trước nhóm nào cũng có Giá trị / Tỷ lệ / Hạn — đã có người ghi 30% vào Phạm vi và số đó in vào văn bản                                                                                                 |
| Soạn hợp đồng từ cơ hội / gói thầu / thiết kế chỉ chọn được loại NVG NHẬN tiền                                                                                                         | Hồ sơ nguồn là việc khách trả tiền cho NVG; chọn loại đi mua / thuê / khoán sẽ in NVG sai bên                                                                                                          |
| Quá hạn tính theo NGÀY giờ Việt Nam, chính ngày hạn chưa quá hạn                                                                                                                       | `new Date('yyyy-mm-dd')` là 07:00 sáng — trước đây ngày hạn hiện «Quá hạn» cạnh «Đến hạn hôm nay»                                                                                                      |
| Bộ mẫu hợp đồng của NVG nạp như chính thức dù là bản dự thảo; chỗ trống bên NVG / đối tác theo `nvg_*` / `doi_tac_*`, không theo bên A / B                                             | Anh Dũng: «làm như chính thức». Bên A / B mỗi mẫu một khác (NVG là A khi đi mua / thuê / khoán) — gắn theo bên thì đổi loại hợp đồng là in sai bên                                                     |
| Thêm loại hợp đồng `mua_vat_tu`, `thue_thiet_bi`, `cho_thue` thay vì dồn vào `mua_ban` / `khoan_thau_phu`                                                                              | Hướng tiền khác nhau (phải thu / phải trả ở KT); `mua_ban` cũ nghĩa là NVG bán                                                                                                                         |
| Bảng các đợt thanh toán trong mẫu thành bảng lặp; các đợt mẫu đề xuất giữ làm gợi ý, không tự thêm                                                                                     | Văn bản phải in đúng các đợt đã ghi trên hệ thống; mốc / tỷ lệ mặc định là đề xuất của NVG, người soạn bấm mới dùng                                                                                    |
| Cập nhật tức thời bằng Supabase Realtime trên `notifications` + `approvals`; sự kiện chỉ là tín hiệu, tải lại mọi truy vấn đang hiện (0188)                                            | Anh Dũng: nhận việc / được duyệt phải tải lại trang. Hai bảng này phủ gần hết việc đến tay một người; tải lại qua đường thường nên vẫn qua RLS. `refetchInterval` 60 giây giữ làm dự phòng             |
| Bộ quét tài liệu: kéo 4 góc bằng tay, xử lý ảnh trên máy người dùng, không OCR / AI                                                                                                    | Anh Dũng chọn (22/10/2026): thư viện tự nhận mép ~8 MB chậm trên máy yếu; ảnh hợp đồng đã ký là dữ liệu khách hạng 1 — không rời máy cho tới khi vào kho của hợp đồng                                  |
| Link xem bản đã ký cho khách = bảng riêng theo mẫu link thư viện mẫu, trang công khai chỉ qua hàm service_role                                                                         | Bản đã ký là của chính khách nên được gửi; nhưng link phải có hạn, thu hồi được, đếm lượt xem và không lộ giá trị / điều khoản trên hệ thống                                                           |
| Hợp đồng đã ký: khối «Sau khi ký — việc còn lại» theo vai; Kinh doanh KHÔNG đánh dấu «khách đã trả»                                                                                    | Anh Dũng: ký xong Kinh doanh không biết làm gì (dải tiến trình chỉ nói việc của Thi công / BGĐ). Số đã thu chỉ đổi qua chứng từ Kế toán — một nguồn dữ liệu                                            |
| Bộ quét TỰ TÌM MÉP bằng mã tự viết (Otsu + vùng sáng), vẫn không tải thư viện nhận mép; không chắc thì không đoán                                                                      | Kéo 4 góc tay để sót mặt bàn → viền loang; thư viện ~8 MB anh Dũng đã loại. Giấy trắng trên bàn trắng trả `null` để người dùng kéo                                                                     |
| Giấy tràn khung: tô trắng vùng mặt bàn thay vì cố cắt bằng 4 góc; xoay thẳng theo dòng chữ                                                                                             | Ảnh thật của anh Dũng chụp gần, mép giấy ra ngoài ảnh — 4 góc không cắt được vải / bàn, chữ vẫn nghiêng 2° («giống ảnh chụp»)                                                                          |
| «Tài liệu» chia nền theo TỪNG KÊNH màu + làm sắc; trang 3.000 px, nắn và xoay trong một lần lấy mẫu                                                                                    | Chia theo độ sáng chung còn ám xanh; nắn rồi xoay = lấy mẫu hai lần → «nhòe và mờ»; 2.000 px chỉ ~170 dpi                                                                                              |
| Ảnh rung: BÁO «Mờ — chụp lại» ngay khi thêm ảnh, không cố khôi phục                                                                                                                    | Không phần mềm nào phục hồi hết chữ của ảnh rung; chụp lại tại chỗ khi giấy còn trên bàn là cách chắc chắn                                                                                             |
| Người chịu trách nhiệm tự thay bản quét (bắt buộc lý do, nhật ký, BGĐ được báo); lịch sử các lần quét ở bảng riêng                                                                     | Chỉ BGĐ thay thì Kinh doanh quét lại cho rõ bị kẹt, xem mãi bản cũ; `audit_logs` chỉ lãnh đạo đọc nên Kinh doanh không thấy đã thay được chưa                                                          |
| Quyền kho cho tệp bản đã ký tách riêng (`da-ky-*`, `rls_contract_scan_uploader`), không nới quyền sửa hợp đồng                                                                         | BGĐ chỉ có quyền phê duyệt nên bị chặn tải bản quét; nới `rls_contract_writable` sẽ mở cả văn bản hợp đồng đã khoá                                                                                     |
| «Chia sẻ» chỉ mở bảng chia sẻ của hệ điều hành trên máy cảm ứng; máy tính tải tệp về                                                                                                   | Chrome trên Windows cũng có Web Share — người dùng máy tính chờ một tệp để đính kèm, không phải bảng chia sẻ Windows                                                                                   |
| Nhiều ảnh một lần xếp theo thời điểm chụp (trùng thì theo tên, số tự nhiên)                                                                                                            | Hộp chọn tệp trả theo thứ tự riêng của máy — ảnh chụp đầu bị xếp xuống cuối                                                                                                                            |
| Mẫu hợp đồng in sẵn «Ông/Bà» trước tên khách thì điền `doi_tac_ho_ten` (tên bỏ danh xưng); dòng «Ông/Bà: …» lặp ngay dưới chỉ giữ ngày sinh                                            | Tên khách trên hệ thống thường đã có danh xưng («Ông Nguyễn Văn Thử») → văn bản in «Ông/Bà Ông …» và bắt gõ lại tên một lần nữa                                                                        |
| Nhật ký giọng nói: máy điền NHÁP lên biểu mẫu nhật ký có sẵn, người ghi sửa rồi tự Lưu; không bảng nhật ký thứ hai                                                                     | Giữ nguyên quy tắc 24 giờ và chữ ký người ghi (TC-08); máy chỉ nháp (PRD 2.3)                                                                                                                          |
| Lưu đoạn ghi âm + bản máy chép cạnh nội dung đã sửa; kho ghi âm không cho xoá                                                                                                          | Lời nói gốc là bằng chứng khi tranh chấp tiến độ / khối lượng — nội dung là của người ghi, bản chép là thứ máy nghe được                                                                               |
| Máy xếp mục nhật ký có công tắc RIÊNG, tắt thì vẫn chép chữ và dán nguyên văn                                                                                                          | Chi phí Gemini duyệt theo từng chức năng (6.4); chép chữ đã được duyệt, xếp mục chưa — luồng không bị chặn                                                                                             |
| Bảng theo dõi của Trưởng phòng: «cần chú ý» chỉ tính từ ngày đã khai + mốc chờ kiểm; nhật ký chỉ hiện «lần cuối», không tự đặt ngưỡng ngày                                             | Tiêu chí Đợt 2 «thấy công trình nào chậm không cần gọi»; số ngày không ghi nhật ký là có vấn đề NVG chưa quyết — không bịa ngưỡng (5.2)                                                                |
| Biên bản nghiệm thu: «Ký hai bên» là bước riêng sau khi lập (hai chữ ký trên điện thoại hoặc bản giấy quét); Kế toán được báo lúc ký                                                   | Khách / tổ đội thường ký khi gặp tại công trường, không phải lúc chỉ huy trưởng lập; biên bản chưa ký chưa là căn cứ thu / trả tiền                                                                    |
| Kế toán xem biên bản đã ký qua hàm riêng, không mở quyền xem phân hệ Thi công; chỉ đánh dấu «đã ghi nhận», không tự sinh công nợ                                                       | KT không có quyền TC (thông báo cũ trỏ vào trang KT không mở được); thuế, hạn, đợt theo hợp đồng là quyết định của Kế toán (PRD 2.3)                                                                   |
| Phiếu bảo hành tự giao chỉ huy trưởng công trình; hạn xử lý mặc định là tham số để TRỐNG; đóng phiếu bắt buộc ảnh sau sửa                                                              | Kế hoạch 2F: «tự giao người phụ trách, có hạn xử lý, ảnh xác nhận»; số ngày hạn NVG chưa quyết (5.2) — trước đây đổi trạng thái tự do, «đã xử lý» không cần bằng chứng                                 |
| Công trình bàn giao tự lập mẫu NHÁP; Thiết kế chọn ảnh và xác nhận mới vào kho; mẫu nháp không ai ngoài Thiết kế / Giám đốc thấy                                                       | Kế hoạch 2G; ảnh công trường có thể lộ người, biển số, tên chủ nhà — máy không tự đưa ảnh nào ra ngoài. Thiết kế chỉ đọc ảnh công trình khi đang có mẫu nháp của chính công trình đó                   |
| Trượt thầu tự chuyển cơ hội sang Mất cơ hội; bàn giao thiết kế cần hợp đồng đã ký (0217) | Anh Dũng trả lời câu 4 và câu 1 (22/10/2026). Cơ hội còn gói thầu khác đang chạy thì chưa mất |
| Tổng Giám đốc được tự duyệt hồ sơ của chính mình; hợp đồng đã ký còn ≤ 90 ngày là «sắp hết hạn» (0218) | Anh Dũng trả lời câu 2 và câu 8 (22/10/2026). Ngoại lệ đặt ở một hàm `user_may_self_approve` mà hai trigger chặn tự duyệt, hộp thư và «đang chờ ai» cùng gọi |
| Đề nghị thu tiền là bảng riêng; công nợ chỉ sinh khi Kế toán xác nhận; lãi / lỗ quản trị để trống khi chưa có ngân sách / chi phí | Máy không tự ghi sổ (PRD 2.3, KT-08); nghiệm thu trừ 0 đồng chi phí ra lãi đẹp giả (5.2) |
| Gom đề nghị mua ở khâu HỎI GIÁ, không gộp đơn hàng; báo giá thiếu mặt hàng không chọn được và không tính là thấp nhất | Mỗi đề nghị một công trình, một dòng ngân sách, một nơi giao (KT-05, TC-05) |
| Giấy tờ pháp nhân và hồ sơ năng lực dùng chung `company_documents`; báo cáo tài chính hạn chế ở mức TỆP (Đấu thầu gắn được vào gói, không mở được) | Một giấy tờ không hai bản; Mẫu D cho báo cáo tài chính mà vẫn ráp được hồ sơ thầu |
| Mọi nhắc hạn mới: quá hạn luôn báo một lần, báo trước chỉ khi tham số có số, đổi ngày hạn thì nhắc lại | Số ngày nhắc NVG chưa quyết (5.2) — không im lặng khi đã quá hạn |
| Làm song song nhiều đợt bằng worktree riêng: mỗi mạch một dải số migration, áp tay bằng psql, phép thử CSDL qua khoá chung; gộp xong chạy lại `db:migrate` chuẩn | Anh Dũng yêu cầu làm song song Đợt 3 / 4 / 5. CSDL máy dùng chung: drizzle bỏ qua migration số nhỏ khi số lớn đã áp, và `global-teardown` xoá dữ liệu thử của mạch khác |
| Số DEMO cho tham số NVG chưa quyết nằm ở bộ nạp dữ liệu demo (`mac-dinh`), KHÔNG ở migration / seed | Anh Dũng: «tự lấy demo mặc định»; bản vận hành vẫn phải dùng số NVG tự đặt (5.2) — migration giữ trống, demo nạp khi chủ động |
| Chạy AI Design thật: dừng sau 2 lượt hỏng, báo cáo thay vì thử tiếp | Mỗi lượt hỏng vẫn tốn 0,28–0,46 USD; lỗi lặp lại ở bộ xếp, chạy thêm không cho thêm thông tin |
| Giao diện v2: chỉ THÊM token trước (bước 1) rồi mới đổi khung; sửa thẳng các khung dùng chung thay vì dựng bộ thứ hai | Anh Dũng duyệt từng bước, cuối cùng giao toàn quyền (24/10/2026). Sửa khung chung thì ~120 màn đổi cùng lúc, logic / quyền / route giữ nguyên |
| Giữ ba chỗ lệch bản v2: nền nhãn trạng thái cũ, ô nhập luôn trong thẻ trắng, nút khoá vẫn ghi lý do bằng chữ | Đo tương phản: nhãn Hoàn thành v2 4,22:1 (< 4,5), viền ô nhập trên nền ám xanh 2,89:1 (< 3) |
| Tổng quan điều hành giữ «mỗi công ty một khung», không gộp số cả tập đoàn như màn 1.2 | Chủ dự án đã thử và bỏ cách gộp số; số tập đoàn chưa loại giao dịch nội bộ (QĐ-6) |
| Route bản thiết kế có mà app chưa có thì KHÔNG tự tạo; nhãn nhóm sidebar viết thường | Anh Dũng dặn «không chắc route thì hỏi»; CLAUDE.md 4.4 cấm IN HOA |
| Tách «Việc hôm nay» và «Phê duyệt»; Phê duyệt có «Tôi đã gửi / Đã xử lý»; trang riêng `/viec-can-lam/:id`; trang đầu vai trò không đổi | Anh Dũng nhờ gợi ý rồi đồng ý (24/10/2026). Người gửi hay phải gọi điện hỏi hồ sơ đang ở ai; link một hồ sơ để gửi / mở từ thông báo |
| Trần chi phí AI Design CHẶN thật (không chỉ hỏi); khoá «Xác nhận đầu bài» dưới ngưỡng ở cả Worker; hiện lý do hỏng chính trên màn hình (T164) | Hai lượt đầu tốn 0,74 USD không ra gì; đầu bài thiếu làm hỏng bộ xếp mà lượt hỏng vẫn tốn tiền; người dùng cần biết sửa đầu bài hay chạy lại |
| Giữ phòng khách 16 m² của đầu bài thử, không hạ 13 m² | Phát lại cho thấy 16 m² vừa — thiếu chỗ là do chương trình lấn ô thang (T166); hạ đầu bài sẽ che mất lỗi thật |
| Đo mọi sửa bộ xếp bằng phát lại toàn bộ vòng đã ghi (đối chứng tắt thay đổi); không lợi thì gỡ; chỉ lưu phương án phát lại khi thật sự qua cổng | Không làm giả kết quả; một sửa giúp ca này có thể làm hỏng ca khác (T169 bỏ một điều kiện vì mất chính vòng 46d6eff3) |
| Ban Giám đốc «Nhận soạn thay» hợp đồng Nháp thay vì có quyền sửa mọi hợp đồng | Anh Dũng đồng ý (25/10/2026). Giữ tách người thực hiện / người phê duyệt: lãnh đạo chỉ sửa ĐÚNG hợp đồng đã nhận, có nhật ký và báo người soạn trước |
| Soạn hợp đồng: điền chỗ trống ngay trên bản xem trước + tải lên bản đã sửa trong Word; KHÔNG làm trình soạn thảo đầy đủ trên hệ thống | Anh Dũng chọn (25/10/2026): nhãn chỗ trống máy tự cắt từ câu văn nên khó hiểu; sửa câu chữ trong Word giữ đúng định dạng mẫu (bảng, đánh số). Hệ thống không đọc ngược Word nên bản ấy được đánh dấu riêng |
| Sửa câu chữ / đường dẫn của hàm dài bằng bản chép nguyên văn hoặc trigger nhỏ, không viết lại logic                                                                                    | `decide_approval` ~300 dòng: đổi đường dẫn thông báo bằng trigger trên `notifications` thay vì chép cả hàm (bài học 0086)                                                                              |

### 9.5 Câu hỏi chờ Haan (đang chạy theo mặc định trong ngoặc)

1. ĐÃ CHỐT (anh Dũng 22/10/2026): **không thi công trước hợp đồng** — `tk.handover_requires_signed_contract` = true (0217), bàn giao thiết kế chưa có hợp đồng đã ký bị chặn.
2. ĐÃ CHỐT (anh Dũng 22/10/2026): **Tổng Giám đốc tự duyệt** hồ sơ do chính mình gửi (trong hạn mức của TGĐ; `user_may_self_approve`, 0218). Vai trò khác vẫn không tự duyệt; đơn nghỉ của chính mình vẫn không.
3. ĐÃ CHỐT: Nhân sự tự lập rồi tự duyệt tuyển dụng — được.
4. ĐÃ CHỐT: trượt thầu → cơ hội tự sang «Mất cơ hội» kèm lý do trượt, trừ khi còn gói thầu khác của cơ hội đang chạy (0217).
5. Ai mở công trình từ hợp đồng? (Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng)
6. Cho GĐ3b: cách tính công từ điểm danh, công lao động thời vụ ghi vào đâu, bán kính GPS bao nhiêu mét.
7. ĐÃ CHỐT: KSNB không xem lương / hồ sơ cá nhân.
8. ĐÃ CHỐT: hợp đồng đã ký còn ≤ **90 ngày** tới ngày kết thúc là «sắp hết hạn» (`hd.expiring_soon_days`, `contracts_expiring_soon`, 0218) — cột «Hết hạn» ở danh sách hợp đồng + khối trên Tổng quan điều hành.
9. ĐÃ CHỐT: «phê duyệt chờ lâu» = 3 ngày.
10. Khảo sát có bắt buộc với cả ba pháp nhân? (bắt buộc, bỏ qua phải ghi lý do — lý do hiện trên trang điều hành)
11. Mẫu hợp đồng: ai tải lên, mẫu riêng từng pháp nhân hay dùng chung? (Ban Giám đốc / Quản trị; riêng từng pháp nhân)
    Gửi 1–2 mẫu Word thật (thi công NVC, thiết kế NVO) để thay mẫu ví dụ.
12. ĐÃ CHỐT: không lưu CCCD — mẫu để dải chấm điền tay.
13. Tách «thi công» thành thi công / thiết kế + thi công / EPC theo Luật Xây dựng 2025? (chưa tách; hình thức giá đã có)
14. NVC có tự thiết kế công trình không? Bảng tổ chức của Ban Giám đốc ghi Phòng Dự án – Đấu thầu NVC làm «thiết kế»,
    nhưng phiếu khảo sát của chính phòng chỉ ghi «phương án kỹ thuật sơ bộ, biện pháp thi công» và làm theo bản vẽ / BOQ
    của chủ đầu tư. (Sơ đồ đang ghi: có bước phương án kỹ thuật; thiết kế chỉ khi gói thiết kế – thi công — chờ xác nhận)
15. Thi công nhà xưởng NVC chia mốc nghiệm thu thế nào? (chưa có; 7 mốc hiện chỉ áp cho NVO)
16. CRM: số ngày nhắc gọi lại / chưa phản hồi / liên hệ lại khách M1 / chăm sóc khách cũ? Ai nhập data Marketing, có tự
    chia đầu mối cho Kinh doanh không? (để trống = chưa nhắc; người nhập là người phụ trách)
17. Ngưỡng cảnh báo cho Kiểm soát nội bộ (duyệt sát hạn mức bao nhiêu %), mức tồn tối thiểu từng vật tư, bảng giá bồi
    thường giàn giáo chính thức? (migration để trống; dữ liệu demo đang dùng số DEMO của kịch bản `mac-dinh`)
18. Thư viện mẫu: tư liệu ban đầu (hồ sơ năng lực, brochure, ảnh công trình, Catalogue NVS mới) — chủ dự án gửi sau.
    ĐÃ CHỐT: mẫu NVC / NVS cũng do Phòng Thiết kế đưa vào; Kinh doanh tự đặt thời hạn thu hồi link. ĐÃ CHỐT: link không giới
    hạn thời hạn tối đa.
19. Đấu thầu (5C): 1–2 bộ hồ sơ dự thầu NVC đã nộp + hồ sơ mời thầu; mẫu đơn dự thầu / thư chào giá; loại gói và giấy tờ
    từng loại; ai theo dõi bảo lãnh dự thầu; có ghi đối thủ không. (chưa có — chặn 5C-3, 5C-6, 5C-9)
20. Bộ nhận diện: ĐÃ QUYẾT (chủ dự án giao Claude Code, 17/10/2026) — dùng logo PNG + mã đo trên ảnh, giữ Be Vietnam Pro, nền
    xám trung tính, Module Thiết kế chỉ đổi màu nhấn; chi tiết và lý do ở mục 1b kế hoạch. NVG gửi vector / mã chuẩn thì thay.
21. Pháp nhân (lấy từ website 17/10/2026, đã điền vào seed — chỉ điền ô trống): mã số thuế NVO 1001222166 + địa chỉ đăng ký;
    địa chỉ NVS. ĐÃ CHỐT: người đại diện NVS là **Lương Vân**; **được dùng logo đối tác** trên nhavietgroup.vn (Cotecons, Hòa
    Bình, CBRE…) làm kinh nghiệm / đối tác trong hồ sơ thầu. Còn thiếu: tên đầy đủ + mã số thuế NVC (site gọi «Nhà Việt
    Construction», app gọi «Nhà Việt Cons»); ảnh trên nhavietsteel.vn ghi «Công ty TNHH TM & SX Bảo Liên» là gì.
22. Phiếu khảo sát riêng (0181): danh sách ô NVO / NVC rút từ hồ sơ khảo sát; ô NVS là ĐỀ XUẤT (hồ sơ chưa mô tả khảo sát
    cho thuê giàn giáo) — Kinh doanh từng công ty xem và sửa `shared/src/survey-forms.ts`.
23. Pháp nhân ĐÃ CHỐT (anh Dũng 21/10/2026): địa chỉ chung ba công ty «Số nhà 587 đường Lê Quý Đôn, Phường Trần Lãm,
    Tỉnh Hưng Yên»; người đại diện NVS «Lương Thị Vân» (thay «Lương Vân» ở câu 21), NVC / NVO «Bùi Văn Thi»; chức vụ
    «Giám đốc» (tạm); tài khoản ngân hàng là số DEMO `9999 0000 000x` — thay số thật ở Mẫu hợp đồng → Thông tin pháp
    nhân. Mã số thuế NVC 1001004344, NVS 1001185820 lấy từ bộ mẫu. Tên NVO «Tư vấn và Xây dựng» (không «&»). Còn mở: bảng hỏi mục 6 của
    từng bộ mẫu chờ NVG trả lời.

### 9.6 Ghi chú máy phát triển Windows

- Sau khi khởi động lại máy: mở Docker Desktop → `npm run db:start` → `npm run dev:workers` → `npm run dev`. Nếu Windows
  giữ dải cổng 55317–55416 (Supabase không mở được cổng 553xx): PowerShell quyền Administrator
  `net stop winnat; net start winnat`. Hàm mới vừa tạo mà REST báo không thấy: `NOTIFY pgrst, 'reload schema'`.
- Sửa một migration CHƯA phát hành sau khi đã áp trên máy: sửa tệp rồi chạy lại nguyên tệp bằng
  `docker exec -i supabase_db_nvg psql -U postgres -v ON_ERROR_STOP=1 < db/migrations/<tệp>.sql` (viết tệp chạy lại
  được: `CREATE OR REPLACE`, `DROP … IF EXISTS`). Bẫy plpgsql đã gặp hai lần: bí danh bảng trùng tên biến `record`
  («record "s" is not assigned yet»); cột của `RETURNS TABLE` trùng cột bảng → thêm `#variable_conflict use_column`.
- Đoạn văn dài nhiều dấu nháy truyền qua heredoc của Bash tool hay vỡ — ghi script vào scratchpad rồi chạy tệp.
- Migration viết tay phải thêm mục vào `db/migrations/meta/_journal.json` (idx +1, `when` +10000000).
- Git Bash đổi `/duong-dan` thành đường dẫn Windows khi truyền cho node — đặt `MSYS_NO_PATHCONV=1`.
  Playwright cần `executablePath` trỏ `%LOCALAPPDATA%/ms-playwright/chromium-1243/chrome-win64/chrome.exe`.
- `core.autocrlf=true` làm `prettier --check` báo cả tệp chưa đổi (CRLF); chỉ kiểm tệp mình sửa.
- Đỏ sẵn trên máy này, không do thay đổi: `env-guard.test.ts` (`spawnSync('npx')` không chạy trên Windows),
  ~20 test web quá thời gian 5 giây, `kb-room-area-stats` và `bc.test.ts` lúc đỏ lúc xanh khi chạy cả bộ
  (chạy riêng thì xanh). Vì bộ web chưa xanh nên
  `npm run mutation-proof` không chạy trọn ở đây — đột biến mới đo tay.
- Node 24 trên máy này: các phép thử web có điều hướng của react-router (`use-unsaved-changes-guard`, `top-bar`,
  `entity-detail`, `dashboard`) đỏ với «RequestInit: Expected signal … AbortSignal» — lệch jsdom / undici, có sẵn
  trước Đợt 1, không do mã.
- Ổ C: gần đầy làm máy ảo WSL của Docker treo IO (17/10/2026); gỡ bằng `wsl --shutdown` quyền Administrator rồi mở lại
  Docker Desktop. Giữ ổ C: trống ≥ 20 GB.
- `npm run lint` cần `NODE_OPTIONS=--max-old-space-size=8192` (mặc định hết bộ nhớ), như CI.
- 20–21/10/2026: Docker Desktop hai lần tắt cùng lúc phiên Claude Code bị ngắt, một lần máy ảo `vmmemWSL` kẹt hẳn
  (`wsl --shutdown` có quyền Administrator cũng treo) — chỉ khởi động lại Windows mới gỡ. Bật lại: mở Docker Desktop →
  `npm run db:start` (lần đầu có thể báo «container is not ready», thử lại sau 15 giây) → `dev:workers` → `dev`.
  Phép thử `db/` đồng loạt quá 10 giây = CSDL / Docker đã chết, không phải mã hỏng.
- Lần đăng nhập đầu sau khi bật lại CSDL chậm; kịch bản Playwright nên `waitForURL` rời `/dang-nhap` thay vì chờ cố định,
  chụp ảnh với `animations: 'disabled'`. `staleTime` mặc định 30 giây và `refetchOnWindowFocus: false` (App.tsx) —
  thử «quay lại cửa sổ thì tải lại» phải đợi quá 30 giây.
- Bộ mẫu hợp đồng: sửa cách chuyển thì sửa `db/seed-assets/contract-templates/convert.py`, chạy lại
  `python -I db/seed-assets/contract-templates/convert.py "Bo_hop_dong_<MÃ> (1)/Bo_hop_dong_<MÃ>" <MÃ>` cho NVC / NVO / NVS
  (gốc ở thư mục `Bo_hop_dong_*`, không commit) rồi `npm run db:seed` — tệp đổi thì seed ngừng bản cũ, nạp bản mới; phép
  thử `web/src/lib/__tests__/contract-template-assets.test.ts` canh cả 21 mẫu. Python in tiếng Việt ra cửa sổ Windows
  cần `sys.stdout.reconfigure(encoding="utf-8")` (cờ `-I` bỏ qua `PYTHONIOENCODING`).
- Playwright headless trên máy này: thêm `args: ['--disable-gpu']` — không có thì `requestAnimationFrame` gần như đứng,
  mọi cú bấm treo ở bước «chờ ổn định» (trang vẫn chạy JS bình thường).
- Không xoá được tệp trong kho bằng SQL (`storage.protect_delete`) — dùng Storage API với khoá service đọc từ `.env`
  (đừng in khoá). Thử bộ quét: dùng ảnh thật của anh Dũng trong scratchpad (dữ liệu khách — KHÔNG commit), chạy thẳng
  mã `lib/scan/*.ts` trên trình duyệt bằng `page.evaluate(() => import('/src/lib/scan/…'))` qua Vite dev.
- Thử AI không tốn tiền: `workers/.dev.vars` đặt `AI_FAKE=transcribe` (hoặc `transcribe,site_log`), tắt hết
  `wrangler`/`workerd` rồi `npm run dev:workers`; thử xong trả về `AI_FAKE=` (rỗng = AI thật). Đừng sửa tệp này bằng
  `Set-Content` của PowerShell 5.1 — nó thêm BOM và CRLF; dùng `sed -i`.
- Dữ liệu thử Đợt 2 (công trình, biên bản, phiếu, mẫu) dọn bằng xoá mềm `deleted_at` (biên bản: `status = 'huy'`) +
  xoá thông báo theo `related_entity_id`. Mã công trình thử `NVO-CT-2026-09xx` đặt tay — dãy số NVO CT đang ở 78.
- Chạy nhiều phiên / mạch cùng lúc trên một CSDL máy: phép thử `db/` phải đi qua khoá chung (thư mục
  `C:/Users/wewea/.nvg-dbtest-lock`, kịch bản `dbtest-lock.cjs` ở scratchpad phiên 23/10) — `global-teardown` xoá mọi dữ liệu
  thử sau mỗi lượt. Lượt hỏng giữa chừng có thể để sót quyền tạm (vd vai TKE của `thietke.nvo@` ở NVC do `tk-tc-lam-ro`) —
  xoá rồi chạy lại.
- Thử AI Design thật: Playwright bấm nút trên `/tk/ai-design/<hồ sơ>` (nút «Xếp mặt bằng» phải `exact: true`, vì nhãn bước
  cũng chứa chữ ấy); một lượt 3–6 phút; chi phí xem ở `design_ai_call`, báo cáo tải bằng nút «Tải báo cáo (.md)».
- 24/10/2026: máy 8 GB hết RAM (VS Code ~4 GB + WSL ~4 GB + nhiều lượt vitest song song) → Docker / WSL treo, đăng nhập kẹt
  «Đang đăng nhập…». Chỉ khởi động lại Windows mới gỡ (Start → Restart, KHÔNG Shut down — khởi động nhanh giữ máy ảo
  treo; kiểm bằng `(Get-CimInstance Win32_OperatingSystem).LastBootUpTime`). Mạch con chạy phép thử phải
  `--pool=forks --poolOptions.forks.maxForks=1`.
- Đổi nhánh git khi Worker `wrangler dev` đang chạy = Worker nạp mã nhánh mới giữa chừng — đừng đổi nhánh khi đang có lượt AI.
- Thử nhanh trên máy: «AB» `bd36f4d6-857f-49ff-a94d-f69c3cbf499c`, «Ok» `ad60f61f-6b09-47d4-9823-a92366659fb2`,
  công trình NVO `NVO-CT-2026-0901` (`a705ba2b-885f-4b9f-a971-b12364e7e4fd`). Khách thử «Dũng đen» trùng số với đầu mối
  NVC-DM-2026-0043 — để lại có chủ đích (chưa xoá).
