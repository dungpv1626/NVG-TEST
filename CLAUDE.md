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

`DESIGN_SYSTEM.md` mở rộng và ở vài chỗ THAY THẾ CGD Mục 6 (màu thương hiệu rừng & bạc hà, font
**Be Vietnam Pro**, dải trung tính, độ nổi, chuyển động). Trang trưng bày thành phần: **`/nen/giao-dien`**.

- **6 màu trạng thái** (Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn · Tranh chấp) — KHÔNG tạo
  màu trạng thái mới; màu thương hiệu KHÔNG dùng ở nhãn trạng thái.
- Chữ chính không dùng đen `#000000`. Body ~14px. Lưới 8px. Bo góc 4–8px (Lozenge bo tròn).
- **Một hành động chính mỗi màn hình.** Phân cấp bằng độ đậm + kích thước, không bằng màu.
- Dark mode không bắt buộc cho demo.

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
| Migration / RLS trong `db/`      | `npx vitest run --project logic db/src/__tests__/<module>.test.ts`  |

- Luôn kèm `npx tsc -b` và `npx prettier --check <tệp đã đổi>`. `npm test` đầy đủ (~100 giây) chỉ khi
  Haan yêu cầu hoặc trước commit lớn.
- **`npm run lint` (eslint) chạy được từ 20/09/2026** — trước đó khai trong `package.json` mà không có
  eslint trong kho, gọi ra «eslint: not found». Luật chọn để bắt LỖI, không bắt cách viết; hai luật
  tắt có ghi lý do trong `eslint.config.js`. **Đừng tắt thêm luật để cho xanh** — tắt thì ghi lý do
  ngay tại chỗ, kèm ca hỏng đã đo.
- **CI**: `.github/workflows/kiem.yml` chạy định dạng, luật, kiểu, hợp đồng và 1.606 phép thử trên
  mỗi PR. Cố ý KHÔNG chạy `db/` (chạm Supabase thật, xoá cứng theo tiền tố `[TEST]`).
- **`npm run mutation-proof`**: cài 29 lỗi thật vào mã nguồn rồi đòi bộ kiểm phải ĐỎ. Số bài kiểm
  không chứng minh bộ kiểm có tác dụng — 20/09/2026 có tám lỗi thật lọt qua 867 bài kiểm đang xanh.
  Thêm hàng rào mới (quyền, riêng tư, tiền gọi mô hình, số đo bản vẽ) thì thêm một đột biến cho nó.
  Khoảng trống đã biết: RLS và ràng buộc trong CSDL KHÔNG được chứng minh ở đây.
- Test `db/` đỏ: chạy lại đúng tệp trước (rate limit Supabase Auth gây báo động giả) — vẫn đỏ cùng chỗ là lỗi thật.

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

> ⚠️ **Hiện chỉ có MỘT project Supabase** (`awaiwegmuykhctnysvou`) dùng chung cho máy phát triển và bản
> chạy thử công khai `nvg.tests99.workers.dev`. Hệ quả: `npm run db:migrate` ở máy **đổi luôn CSDL bản
> công khai**; test `db/` chạy trên chính CSDL đó và `cleanupTestData` **xoá cứng** (chỉ theo tiền tố
> `[TEST]` và `year >= 2090`); dữ liệu demo nạp ở máy hiện luôn trên bản công khai.
> **Phải tách TRƯỚC khi NVG nhập dòng dữ liệu thật đầu tiên** (`BUILD_PLAN.md` 4E). Đừng tách sớm, đừng quên tách.

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
    `curl -s https://nvg-api.tests99.workers.dev/design/health` — trường `contracts` phải khớp
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
- **Ngưỡng 65 điểm** (`kb/plan_quality.yaml` `accept_percent`), dưới ngưỡng dùng lượt sửa còn lại; sau đó
  kỹ sư **sửa trên bản vẽ bằng ô yêu cầu** → mô hình trả thao tác trong tập đóng `contracts/ai-plan-edit`,
  chương trình áp lên cây đã lưu (T53, `ai/edit/`).
- **Đầu bài đã khai là ràng buộc**, phần không khai mới là chỗ sáng tạo (T41, `brief/gate.ts`); diện tích
  tối thiểu đầu bài khai là sàn cứng.
- **Luật cứng chỉ khi không dựng được / không đi được** (đường đi hằng ngày không xuyên gara/sảnh ngoài,
  phòng ở không lấy cửa từ ô thang, không đi xuyên phòng riêng, cạnh dùng được). **Định mức và kinh
  nghiệm nghề chỉ trừ điểm/cảnh báo, không loại phương án** (T49, T52–T55). Chỗ bất hợp lý của một bản vẽ
  cụ thể → sửa bằng ô yêu cầu, **đừng biến thành luật** (Haan, T52).
- **Không kiểm quy chuẩn xây dựng** (T30, T42): `rules/base/` đã xoá. Nhánh AI đọc `rules/nvg-experience.yaml`
  - `rules/nvg-measured.yaml` theo lựa chọn của kỹ sư, chỉ để đối chiếu SAU. Màn hình phải nói rõ «Không
    kiểm quy chuẩn xây dựng…» (câu do mã chèn). Khoảng lùi/mật độ chỉ lấy từ đầu bài.
- **Tờ vẽ chính là SVG vector tất định** (`ai/draw/`) — T21 (tờ do mô hình ảnh vẽ) đã bị T22 gỡ. Chữ do mô
  hình sinh là nội dung không tin được: thoát ký tự khi dựng SVG, hiển thị qua `<img>`.
- **Xuất DXF bằng TypeScript trong Worker** (T47, `ai/dxf/`), đổi từ chính tờ SVG. Một chiều.
- **Ảnh mặt bằng có nội thất** (T57): mô hình ảnh vẽ từ **ảnh neo** (`ai/draw/anchor.ts`, không khung tên),
  panel riêng dưới tờ vector — **tờ vector vẫn là tờ chính**. Nhãn hai lớp: in lên pixel + chữ trong trang.
  Phép thử canh `images` có đúng một phần tử.
- **Mặt đứng mặt tiền** (T59): khung, lỗ mở, ban công suy từ phương án mặt bằng đã chọn và KHOÁ; mô
  hình chỉ chọn mái, vật liệu, màu, cổng, rào, trang trí trong `kb/facade_vocabulary.yaml`. Phiếu yêu cầu
  của kỹ sư (`ai_facade_brief`) là bắt buộc — hàm ghép áp thẳng mục đã điền; bề rộng cửa là của mặt bằng.
- **Đầu bài là đầu vào duy nhất, nên nó hỏi kỹ** (T62, 21/09/2026): 98 câu trong **SÁU mục** —
  Công trình và khu đất (kèm cao độ đường/đất, mặt nắng gắt, mặt đón gió, bề rộng đường, ngập,
  nhà liền kề) · Gia đình và nếp sinh hoạt (kèm **tuổi**, tín ngưỡng, kinh doanh tại nhà) ·
  Công năng và lưu trữ · Khối nhà, thang và mặt ngoài (thang máy: làm ngay / **chừa chỗ**; ban
  công **đua ra ngoài ranh**) · Kỹ thuật và dự trù · Ưu tiên, ngân sách và người quyết định.
  **Sáu mục là số đã chốt** (Haan, 21/09/2026: «12 mục là quá dài») — thêm nhóm câu hỏi mới thì
  xếp vào một trong sáu, đừng mở mục thứ bảy. Số bước KHÔNG đổi theo loại hình: nhóm tổ chức
  khối nhà ẩn theo TỪNG TRƯỜNG, không ẩn cả mục.
  Trường mới gần hết mang **trọng số 0** — `completeness_score` là cổng chặn Lớp 2, chỉ đo thứ
  thiếu thì không dựng nổi mặt bằng. Phong thuỷ vào đầu bài dưới dạng **câu ràng buộc người đã
  quyết**, không phải ngày sinh để máy luận (PRD 2.3).
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
  chỗ. **Ban công** đúng mặt đầu bài khai; phần **đua ra ngoài ranh** nới ô ngay trong cây chia
  (`tree/balcony-projection.ts`), TRƯỚC khi dựng hình bao và đặt lỗ mở.
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
- Nhãn cảnh báo do mã chèn, không tắt được từ giao diện (`AI_DISCLAIMERS` trong `@nvg/shared/design`).

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
