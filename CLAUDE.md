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
> | Môi trường          | CSDL                                      | Ai dùng                                     | Cấu hình                                                                |
> | ------------------- | ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
> | **Phát triển**      | Supabase **tại máy** (Docker, cổng 553xx) | máy, `wrangler dev`, **mọi test `db/`**     | `.env`, `workers/.dev.vars`, `supabase/config.toml`                     |
> | **Chạy thử / demo** | project cloud `awaiwegmuykhctnysvou`      | `nvg.tests99.workers.dev`, Worker `nvg-api` | `.env.demo` (không commit), `.env.production`, `workers/wrangler.jsonc` |
> | **Vận hành**        | chưa có — tạo lúc go-live, **gói Pro**    | —                                           | —                                                                       |
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
- Cách làm đã chứng minh hiệu quả: **chạy thử bằng đúng tài khoản từng vai trên trình duyệt** (Playwright, chụp ảnh)
  sau mỗi thay đổi — phần lớn lỗi của đợt này (nút hiện rồi báo lỗi, tự gán sai người, bỏ qua được bước) chỉ lộ ra
  khi đi trọn luồng như người dùng thật, không lộ ở phép thử đơn vị.

### 9.2 Trạng thái từng giai đoạn

| GĐ  | Nội dung                                                                                                                   | Trạng thái                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 0   | Lưu mốc                                                                                                                    | **Xong**                                       |
| 1   | Quyền + thứ tự bước, đồng bộ liên module, dải tiến trình + chuỗi hồ sơ, gỡ chế độ tối, sửa lớp đè / token màu (vấn đề 2–4) | **Xong phần chính** — chờ Haan kiểm            |
| 2   | «Tổng quan điều hành» + Dashboard lãnh đạo theo khung từng công ty + vai trò Kiểm soát nội bộ (vấn đề 1)                   | **Xong phần chính** — chờ Haan kiểm            |
| 3   | Khảo sát chốt bằng máy (CRM + TK), đính kèm dùng chung, ghi âm → Whisper → Gemini tóm tắt (vấn đề 6, 8)                    | Chưa làm — nay là Đợt 1 / 5 của kế hoạch tổng  |
| 3b  | Điểm danh theo tổ, kiểm bán kính GPS (chỉ cảnh báo), báo cáo có mặt, đề xuất chấm công                                     | Chưa làm — nay là Đợt 2 (2C) của kế hoạch tổng |
| 4   | Mẫu hợp đồng `.docx` có chỗ trống, tự điền, xem trước, xuất (vấn đề 5)                                                     | **Xong vòng đầu** — chờ Haan kiểm              |
| 5   | AI Design thành 4 bước: Đầu vào → Mặt bằng → Mặt ngoài → Bộ kết quả (vấn đề 7)                                             | Chưa làm — nay là Đợt 5 (5B) của kế hoạch tổng |

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

### 9.3 Bước tiếp theo

**Đọc `doc/KE_HOACH_LAM_HO.md` trước khi bắt đầu đợt nào** — thứ tự, phụ thuộc, câu hỏi chặn, tiêu chí xong ở đó.

1. **Bước 0 — chốt phần đã làm.** Haan kiểm GĐ1 + GĐ2 + GĐ4 trên máy (`http://localhost:5173`, mật khẩu `NhaViet2026`)
   bằng đúng vai: Kinh doanh `kinhdoanh.nvc@…` đi cơ hội → báo giá → hợp đồng (tab «Văn bản»); TGĐ `tgd@…` duyệt, ký, mở
   công trình, xem Dashboard / Tổng quan điều hành, tải mẫu hợp đồng; Thi công `congtruong.nvc@…`; Chỉ huy trưởng
   `chihuytruong.nvc@…`; KSNB `ksnb@…`. Trả lời câu hỏi 9.5; NVG gửi mẫu Word hợp đồng thật.
2. Khi Haan đồng ý phát hành: đẩy nhánh → `npm run db:migrate:demo` → **`db:seed` trên demo** (vai trò KSNB, trang mặc
   định mới) → `npm run deploy` (API trước, web sau).
3. **Bước 0b — bộ nhận diện NVG** — XONG vòng đầu trên máy, chờ chủ dự án duyệt ảnh `backup/brand-truoc|sau/` (mục 1b của kế hoạch): token màu theo logo, logo thật ở thanh bên / đăng nhập / favicon /
   PWA; giữ 6 màu trạng thái; chụp trước / sau cho chủ dự án duyệt. Logo PNG ở `backup/nvg-logo-2048.png`.
4. **Đợt 1 — Kinh doanh** (chủ dự án đã chốt: báo cáo khảo sát do Ban Giám đốc duyệt, chưa duyệt thì chặn Báo giá; hợp
   đồng gửi duyệt kèm văn bản; AI chạy giả lập trước): xây khối nền K1–K5; CRM đầu mối + nhật ký chăm sóc + việc hôm nay
   - khách cũ + phễu; khảo sát ghi âm → báo cáo → BGĐ; hợp đồng kèm văn bản (`contracts.approved_document_id`, chỉ lập
     văn bản khi Nháp); quản trị AI; thư viện công trình mẫu + link xem trực tuyến cho khách (1H, quy tắc ở mục 3.1 của kế
     hoạch — trang công khai đầu tiên, đi qua Worker). Loại phê duyệt mới `survey_report` (thêm enum ở migration riêng; `decide_approval`
     chép nguyên bản 0088 rồi thêm nhánh; `stage_readiness` chép bản 0166).
5. Rồi Đợt 2 Thi công (7 mốc NVO, nhật ký giọng nói, điểm danh tổ, biên bản tự sinh, màn hình Trưởng phòng, phiếu bảo
   hành) → Đợt 3 Tài chính; Đợt 4 Mua hàng – Kho và Đợt 5 (Thiết kế + AI Design 4 bước, Đấu thầu — soạn hồ sơ dự thầu, mục 3.2 của kế hoạch —, NVS, Nhân sự, Hành
   chính) song song sau Đợt 1.
6. Việc treo, làm xen: lịch sử bước chung `stage_transitions`; dải tiến trình gói thầu; QĐ-6 giao dịch nội bộ; ô «hợp
   đồng sắp hết hạn»; lối vào Tổng quan điều hành trên thanh dưới điện thoại; PDF chuẩn và AI gợi ý câu chữ cho mẫu hợp
   đồng; nối Zalo OA / form quảng cáo; gửi văn bản cho khách qua email; thêm dữ liệu demo quá hạn ở cả ba công ty.

**Đợt 1 — Kinh doanh: XONG vòng đầu trên máy** (0172–0179, commit 8139a22 → 16d3413): đầu mối + nhật ký chăm sóc
(`leads`, `contact_logs`, `convert_lead`), việc hôm nay (`my_crm_followups`, quét nhắc), khảo sát ghi âm → nháp AI → Ban
Giám đốc duyệt (`site_surveys.report_status`, phê duyệt `survey_report`, chưa duyệt chặn Báo giá), hợp đồng gửi duyệt kèm
văn bản (`contracts_document_gate`), khách cũ + phễu theo nguồn, trang «Trợ lý AI» (`/nen/tro-ly-ai`, bảng `ai_calls`),
thư viện công trình mẫu + link gửi khách (`/mau-cong-trinh`, trang công khai `/xem-mau/:token` qua Worker
`/public/showcase/:token`, phê duyệt xoá `showcase_delete`). Bản mới nhất của hàm chép-dài: `decide_approval` ở 0179,
`stage_readiness` ở 0176, `my_pending_approvals` ở 0175. Hạn mức của loại phê duyệt mới nằm ở seed (`DEFAULT_APPROVAL_LIMITS`)
— chạy `db:seed` sau migrate. Ảnh chạy thử: `backup/dot1-1a/` → `backup/dot1-1h/`.

**Migration tiếp theo: 0180.**

### 9.4 Quyết định đã chốt và lý do

| Quyết định                                                                                                                                                                  | Lý do                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kinh doanh chỉ soạn, sửa, gửi hợp đồng mình chịu trách nhiệm; Ban Giám đốc ghi ký, quyết toán, hủy sau duyệt                                                                | Chủ dự án chọn; tách người thực hiện với người phê duyệt (PRD 2.3). BGĐ có `approve` HD nhưng không có `edit`, nên trước đây lại không ghi ký được                               |
| Cấm tự ĐỒNG Ý hồ sơ của mình, đặt ở TRIGGER chứ không sửa từng hàm duyệt                                                                                                    | Một chỗ phủ mọi loại phê duyệt; không chép lại `decide_approval` ~300 dòng (bài học 0086). Tự hủy (`rejected`) vẫn được. Đơn nghỉ xét theo nhân viên trong đơn                   |
| Quy tắc hợp đồng đặt ở trigger trên bảng, không ở thân hàm                                                                                                                  | Mọi đường đổi bước (kể cả `decide_approval`) đều đi qua; không chép lại hàm dài                                                                                                  |
| Điều kiện «Báo giá / Đàm phán» chấp nhận báo giá CRM, gói thầu HOẶC hồ sơ thiết kế                                                                                          | NVC định giá qua gói thầu (DA), NVO qua thiết kế — đòi riêng báo giá CRM là chặn nhầm luồng nhà xưởng                                                                            |
| Không tự sang Đàm phán khi khách trả lời báo giá                                                                                                                            | `quotes.customer_response` là chữ tự do, không có cờ chấp nhận; điều kiện thay bằng «đã duyệt và đã gửi khách»                                                                   |
| Không nhảy cóc hồ sơ thiết kế chỉ ở `move_design_stage`, không ở trigger bảng                                                                                               | `record_design_review` đẩy Phương án → Hồ sơ kỹ thuật khi khách duyệt — trigger sẽ chặn nhầm thao tác thật                                                                       |
| Không tự đẩy công trình sang Nghiệm thu khi có biên bản khách hàng                                                                                                          | Biên bản có thể chỉ cho một đợt (`stage_name`)                                                                                                                                   |
| `stage_readiness` và `record_chain` là SECURITY DEFINER nhưng chỉ trả cờ / hồ sơ người gọi được xem                                                                         | Kinh doanh không xem DA vẫn phải biết đủ điều kiện và đã có hợp đồng; hồ sơ ngoài quyền bị bỏ hẳn (5.4)                                                                          |
| Gỡ hẳn chế độ tối                                                                                                                                                           | Chủ dự án yêu cầu; bảng màu thứ hai không ai duy trì là nơi sinh chữ đen trên nền đen                                                                                            |
| Hộp hướng dẫn không tự mở, chỉ chấm «có hướng dẫn mới»                                                                                                                      | Bảng tự mở che cột Trạng thái / Thời hạn ở 16 danh sách và chặn cú bấm                                                                                                           |
| Trên điện thoại, thao tác công trường THAY thanh điều hướng (kèm nút «Phân hệ»)                                                                                             | Hai thanh chồng nhau ~150px che ô nhập nhật ký; AFD 4.8 cho 4–5 mục, nút chụp ảnh luôn hiện                                                                                      |
| STT: Cloudflare Workers AI Whisper; tóm tắt: Gemini Flash trả phí, tắt mặc định                                                                                             | Chủ dự án muốn miễn phí / rẻ; Gemini miễn phí có thể huấn luyện trên dữ liệu khách nên bị loại                                                                                   |
| Mẫu hợp đồng: `.docx` có chỗ trống, điền tất định; AI chỉ gợi ý câu chữ                                                                                                     | Giữ đúng định dạng mẫu Word của NVG; dữ liệu hợp đồng là hạng 1, không gửi AI                                                                                                    |
| Rời Xác minh cần Phân loại M2–M4 + Loại công trình; khảo sát bắt buộc trước Báo giá, bỏ qua phải ghi lý do                                                                  | Chủ dự án chọn; trước đó không có chỗ nhập phân loại và khảo sát bỏ qua được không để lại dấu vết. M1 «Lưu trữ» = chưa có nhu cầu thực                                           |
| Khảo sát: đổi luồng cho CẢ CRM lẫn TK                                                                                                                                       | Chủ dự án chọn; hai nơi đang ghi thời điểm kết thúc sai theo hai kiểu khác nhau                                                                                                  |
| Dashboard điều hành là trang riêng + vai trò KSNB chỉ xem                                                                                                                   | Chủ dự án chọn; Dashboard chung không cho lãnh đạo thấy ngay vấn đề toàn hệ thống                                                                                                |
| Báo giá lập TRONG bước Báo giá; vào Báo giá chỉ cần phân loại + khảo sát                                                                                                    | Đòi có báo giá để VÀO bước Báo giá là ngược thứ tự — người dùng kẹt ở Khảo sát (thấy khi chạy thử)                                                                               |
| Làm xong việc của bước thì tự sang bước kế + mở đúng tab (lưu phân loại, biên bản khảo sát, gửi báo giá…)                                                                   | Chủ dự án: «phải tự mò»; bước có điều kiện rõ thì hệ thống đi tiếp, người dùng chỉ làm việc                                                                                      |
| Mọi phê duyệt hiện «Đang chờ: ai · bao lâu» + nút «Thúc» (chỉ người gửi, có giãn cách)                                                                                      | AFD 4.7; trước đó người gửi chỉ thấy «Chờ duyệt», phải gọi điện hỏi                                                                                                              |
| Thi công KHÔNG xem Module Hợp đồng                                                                                                                                          | Chủ dự án giữ nguyên quyền; panel công trình chỉ nói «đã có hợp đồng», không lộ số / giá trị                                                                                     |
| Chỉ huy trưởng phải là người có quyền sửa TC; ô chọn chỉ liệt kê người đó                                                                                                   | Mở công trình từng tự lấy người Kinh doanh phụ trách hợp đồng làm chỉ huy (thấy khi chạy thử)                                                                                    |
| Kết thúc công trình chỉ khi hết bảo hành, không còn yêu cầu bảo hành mở                                                                                                     | Trước đó bấm được ngay hôm bàn giao — công trình biến khỏi theo dõi khi khách còn quyền gọi bảo hành                                                                             |
| KSNB: xem giá vốn / lợi nhuận / tài chính / nhật ký; không xem lương, hồ sơ cá nhân                                                                                         | Kiểm soát cần số để đối chiếu; lương / cá nhân là mặc định an toàn chờ Haan                                                                                                      |
| Lãnh đạo: MỖI CÔNG TY MỘT KHUNG đủ tình hình; không chia trang theo chủ đề, không theo bộ chọn pháp nhân                                                                    | Chủ dự án qua bốn vòng: gộp số → không biết công ty nào; tách theo chủ đề → phải gom bằng mắt, nhớ không hết; chốt «nhìn một nơi nắm một công ty»                                |
| Lãnh đạo nhìn ít mà ra vấn đề: chỉ vấn đề mới to / đứng trên, mảng ổn gom một dòng, không xếp thẻ ngang hàng                                                                | Chủ dự án: «nhìn quá nhiều thứ cùng cấp bậc nên bị loạn»                                                                                                                         |
| Mẫu hợp đồng làm TRƯỚC GĐ3; vòng đầu chỉ `.docx` (không PDF, không AI)                                                                                                      | Chủ dự án chọn; PDF đúng định dạng cần máy chủ LibreOffice, AI tốn phí — tách ra vòng sau                                                                                        |
| Văn bản hợp đồng ở bảng riêng `contract_documents`, không ở `documents`                                                                                                     | `documents` theo Mẫu A — cả pháp nhân xem được, trong khi Thi công không xem Module HD                                                                                           |
| Ô chưa có dữ liệu in dải chấm và được liệt kê trước khi lưu; mẫu có chỗ trống lạ thì không cho lưu mẫu                                                                      | Không bịa số (5.2); lỗi mẫu phải lộ lúc soạn mẫu, không lộ lúc Kinh doanh cần văn bản                                                                                            |
| Hợp đồng đã ký thì khoá văn bản; sửa câu chữ = sửa trong Word rồi lập bản mới có lý do (trước khi ký)                                                                       | Hệ thống không đọc ngược tệp Word; số liệu sửa trên hệ thống để tệp và CSDL không lệch                                                                                           |
| Lãnh đạo dùng hình thay chữ khi có thể (biểu tượng, ô màu kèm số / ✓); mức luôn có chữ hoặc nhãn đọc được                                                                   | Chủ dự án: «nhiều chữ quá»; CGD 6.8 cấm dùng màu làm cách duy nhất                                                                                                               |
| Hướng tiếp theo: hệ thống LÀM HỘ từng bộ phận — máy làm nháp, người kiểm và gửi, sếp duyệt / trả về kèm ý kiến                                                              | Chủ dự án: hệ thống đang chủ yếu ghi nhận cho TGĐ; phòng ban vẫn gõ lại, gọi điện, Zalo. Máy chỉ nháp (PRD 2.3)                                                                  |
| Thứ tự: Bước 0 → Kinh doanh → Thi công → Tài chính; Mua hàng – Kho và bộ phận còn lại song song sau Đợt 1                                                                   | Đợt Kinh doanh xây khối nền dùng chung (ghi âm → nháp AI, hộp duyệt xem nội dung, văn bản Word, việc hôm nay); Tài chính lấy dữ liệu từ mốc / biên bản của Thi công              |
| Báo cáo khảo sát do Ban Giám đốc duyệt (không thêm vai trò Trưởng phòng KD); chưa duyệt thì chặn Báo giá                                                                    | Chủ dự án chọn                                                                                                                                                                   |
| «Gửi hợp đồng trong hệ thống» = gửi phê duyệt kèm văn bản Word; gửi khách / email làm sau                                                                                   | Chủ dự án chọn; chưa có dịch vụ email                                                                                                                                            |
| AI làm bằng giả lập trước; gọi thật chỉ khi duyệt số lượt + chi phí                                                                                                         | Chủ dự án chọn; CLAUDE.md 6.4                                                                                                                                                    |
| CRM bổ sung đầu mối + nhật ký chăm sóc (bắt buộc bước tiếp + ngày hẹn) + khách cũ; KHÔNG thay Zalo                                                                          | Chủ dự án chỉ ra; phiếu khảo sát Kinh doanh: «thông tin chỉ nằm trong Zalo rồi trôi mất» là vướng mắc số 1; PRD CRM-01, CRM-07 chưa có                                           |
| Thi công NVO chia 7 mốc, nghiệm thu + ảnh trước khi che khuất; NVC chờ NVG xác nhận mốc riêng                                                                               | Quy chuẩn Nhà Việt One (18 bước, chuẩn 05, 06); một trạng thái «đang thi công» không chặn được đổ bê tông khi chưa nghiệm thu thép                                               |
| Sơ đồ ba pipeline đặt cạnh nhau, cùng hàng = cùng giai đoạn; bản «sau» cùng bố cục bản «hiện tại»                                                                           | Chủ dự án: tách 3 công ty, nhìn được toàn bộ pipeline, so được từng ô                                                                                                            |
| NVC: ghi bước «phương án kỹ thuật, biện pháp thi công»; việc tự thiết kế để câu hỏi mở                                                                                      | Hai nguồn trong hồ sơ khảo sát nói khác nhau (Ban Giám đốc: có thiết kế; chính phòng Dự án: theo bản vẽ chủ đầu tư) — không tự chọn                                              |
| Thư viện công trình mẫu (1H): Thiết kế đẩy vào, cả công ty xem, chỉ Thiết kế + Giám đốc sửa, xoá cần Giám đốc đồng ý; gửi khách bằng link trực tuyến; không hiện giá        | Chủ dự án chốt (17/10/2026). Kinh doanh / TGĐ đang chào khách bằng ảnh rải trên Drive, Zalo; nhà khách đã làm được dùng làm mẫu. Ngoại lệ có chủ đích với Mẫu A (cả công ty đọc) |
| Đấu thầu NVC (5C) mở rộng: kho hồ sơ năng lực trước, rồi soạn bộ hồ sơ dự thầu từ số liệu có sẵn (hành chính, năng lực, tài chính máy sinh; kỹ thuật chỉ nháp)              | Chủ dự án đồng ý gộp (17/10/2026). Phòng Dự án NVC thiếu người, dữ liệu thầu phân tán; máy không ký, không nộp, không quyết giá (PRD 2.3)                                        |
| Bước 0b: đổi bộ nhận diện theo logo NVG (xanh lá N = màu hành động chính; cam V chỉ điểm nhấn, chữ tối; xanh dương G hạn chế), giữ nguyên 6 màu trạng thái; làm trước Đợt 1 | Chủ dự án yêu cầu (17/10/2026). Cam trên chữ trắng chỉ 2,36:1; xanh dương gần «Đang xử lý» — dùng làm liên kết sẽ đọc như trạng thái                                             |

### 9.5 Câu hỏi chờ Haan (đang chạy theo mặc định trong ngoặc)

1. NVO có được thi công trước khi ký hợp đồng? (cảnh báo; đặt `tk.handover_requires_signed_contract = true` để chặn)
2. TGĐ gửi hồ sơ thì ai duyệt? (người khác có hạn mức; chưa có ngoại lệ)
3. Tuyển dụng do Nhân sự lập rồi Nhân sự duyệt có được không? (cho phép)
4. Trượt thầu có tự đánh dấu Mất cơ hội? (chỉ báo người phụ trách)
5. Ai mở công trình từ hợp đồng? (Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng)
6. Cho GĐ3b: cách tính công từ điểm danh, công lao động thời vụ ghi vào đâu, bán kính GPS bao nhiêu mét.
7. KSNB có được xem lương / hồ sơ cá nhân? (không)
8. Hợp đồng còn bao nhiêu ngày thì tính «sắp hết hạn»? (chưa có ô này)
9. Mốc «phê duyệt chờ lâu» 3 ngày (giả định cũ của Dashboard) — giữ, hay đặt SLA theo loại hồ sơ? (3 ngày)
10. Khảo sát có bắt buộc với cả ba pháp nhân? (bắt buộc, bỏ qua phải ghi lý do — lý do hiện trên trang điều hành)
11. Mẫu hợp đồng: ai tải lên, mẫu riêng từng pháp nhân hay dùng chung? (Ban Giám đốc / Quản trị; riêng từng pháp nhân)
    Gửi 1–2 mẫu Word thật (thi công NVC, thiết kế NVO) để thay mẫu ví dụ.
12. Có lưu CCCD của khách cá nhân (NVO) để in lên hợp đồng? (không — mẫu để dải chấm điền tay)
13. Tách «thi công» thành thi công / thiết kế + thi công / EPC theo Luật Xây dựng 2025? (chưa tách; hình thức giá đã có)
14. NVC có tự thiết kế công trình không? Bảng tổ chức của Ban Giám đốc ghi Phòng Dự án – Đấu thầu NVC làm «thiết kế»,
    nhưng phiếu khảo sát của chính phòng chỉ ghi «phương án kỹ thuật sơ bộ, biện pháp thi công» và làm theo bản vẽ / BOQ
    của chủ đầu tư. (Sơ đồ đang ghi: có bước phương án kỹ thuật; thiết kế chỉ khi gói thiết kế – thi công — chờ xác nhận)
15. Thi công nhà xưởng NVC chia mốc nghiệm thu thế nào? (chưa có; 7 mốc hiện chỉ áp cho NVO)
16. CRM: số ngày nhắc gọi lại / chưa phản hồi / liên hệ lại khách M1 / chăm sóc khách cũ? Ai nhập data Marketing, có tự
    chia đầu mối cho Kinh doanh không? (để trống = chưa nhắc; người nhập là người phụ trách)
17. Ngưỡng cảnh báo cho Kiểm soát nội bộ (duyệt sát hạn mức bao nhiêu %), mức tồn tối thiểu từng vật tư, bảng giá bồi
    thường giàn giáo chính thức? (để trống)
18. Thư viện mẫu: tư liệu ban đầu (hồ sơ năng lực, brochure, ảnh công trình, Catalogue NVS mới) — chủ dự án gửi sau.
    ĐÃ CHỐT: mẫu NVC / NVS cũng do Phòng Thiết kế đưa vào; Kinh doanh tự đặt thời hạn thu hồi link. Còn mở: hạn tối đa
    của link (không giới hạn).
19. Đấu thầu (5C): 1–2 bộ hồ sơ dự thầu NVC đã nộp + hồ sơ mời thầu; mẫu đơn dự thầu / thư chào giá; loại gói và giấy tờ
    từng loại; ai theo dõi bảo lãnh dự thầu; có ghi đối thủ không. (chưa có — chặn 5C-3, 5C-6, 5C-9)
20. Bộ nhận diện: ĐÃ QUYẾT (chủ dự án giao Claude Code, 17/10/2026) — dùng logo PNG + mã đo trên ảnh, giữ Be Vietnam Pro, nền
    xám trung tính, Module Thiết kế chỉ đổi màu nhấn; chi tiết và lý do ở mục 1b kế hoạch. NVG gửi vector / mã chuẩn thì thay.
21. Pháp nhân (lấy từ website 17/10/2026, đã điền vào seed — chỉ điền ô trống): mã số thuế NVO 1001222166 + địa chỉ đăng ký;
    địa chỉ NVS. ĐÃ CHỐT: người đại diện NVS là **Lương Vân**; **được dùng logo đối tác** trên nhavietgroup.vn (Cotecons, Hòa
    Bình, CBRE…) làm kinh nghiệm / đối tác trong hồ sơ thầu. Còn thiếu: tên đầy đủ + mã số thuế NVC (site gọi «Nhà Việt
    Construction», app gọi «Nhà Việt Cons»); ảnh trên nhavietsteel.vn ghi «Công ty TNHH TM & SX Bảo Liên» là gì.

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
