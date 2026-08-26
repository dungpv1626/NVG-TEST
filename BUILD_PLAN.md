# BUILD_PLAN.md — Kế hoạch triển khai theo luồng phụ thuộc

> Tài liệu làm việc của đội triển khai (không phải 1 trong 6 tài liệu chính thức trong `doc/`).
> Nguyên tắc: **phase chia theo phụ thuộc kỹ thuật, không theo lịch**. Thời gian chỉ tương đối.
> Phân bổ module theo giai đoạn bám đúng PRD 4 — plan này chỉ chi tiết hoá BÊN TRONG mỗi giai đoạn.

## Bản đồ phụ thuộc tổng thể

```
P0 Nền móng ──► P1 Primitives ──┬─► P2 Xương sống thương mại (GĐ1)
   auth, RLS,      table/detail/ │      CRM ─► DA ─┐
   tokens,         approval,     │       └──► TK ──┼─► HD ─► BC(cơ bản)
   app shell       version, noti │                 │
                                 │                 ▼
                                 └─► P3 Vận hành (GĐ2)
                                        TC ─► MH ─► KHO ─► KT
                                        NS (độc lập)   SX ◄─┘
                                        └──────► BC (đầy đủ)
                                                   │
                                                   ▼
                                        P4 Liên kết chéo + Demo (GĐ3)
                                                   │
                                                   ▼
                                        P5 AI Design Engine (sau khi lõi ~90%)
```

**Quy tắc vàng xuyên suốt:** không bao giờ viết đoạn code thứ hai giống đoạn đã viết ở module trước —
dừng lại, nâng thành primitive trong `shared/` hoặc `web/src/components/`.

---

# PHASE 0 — Nền móng kỹ thuật

**Mục tiêu:** một người đăng nhập được, thấy đúng menu theo vai trò, chuyển được pháp nhân, và có một
bảng chạy hết vòng đời (tạo → RLS chặn đúng → audit ghi đúng).

**Không phụ thuộc gì. Chặn TẤT CẢ phase sau.**

### 0.1 Hạ tầng & repo
- `git init`, monorepo `web/ workers/ db/ shared/ doc/` (TSD 5.2 + quyết định `shared/`)
- Cấu hình workspace (pnpm/npm workspaces), TypeScript strict, ESLint/Prettier
- `web/`: Vite + React 18 + TS + Tailwind + shadcn/ui init
- `workers/`: Hono + wrangler.jsonc (`compatibility_flags: ["nodejs_compat"]`)
- `db/`: Drizzle + drizzle-kit, kết nối Supabase dev
- `.env.example` + `.gitignore` — **không commit secret** (TSD 5.6)

### 0.2 Bảng nền tảng (BSD 3.2)
`companies` · `users` · `roles` · `permissions` · `user_companies` · `approval_limits`

- `companies` seed: NVC, NVS, NVO + NVG (mã tổng hợp, **không phải pháp nhân giao dịch**)
- Áp `auditColumns()` + `softDelete()` ngay từ bảng đầu tiên

### 0.3 Xác thực (BSD 3.1)
- Supabase Auth: email/mật khẩu, **KHÔNG có luồng tự đăng ký công khai**
- Admin tạo tài khoản → gửi email mời → đặt mật khẩu lần đầu
- Mật khẩu tối thiểu 8 ký tự, có chữ và số
- Đồng bộ `auth.users` ↔ `users` (trigger hoặc hàm)
- Quên mật khẩu / đăng xuất
- *(Email giao dịch qua Resend/SendGrid — có thể dùng SMTP mặc định Supabase tạm thời)*

### 0.4 RLS — hạ tầng phân quyền (BSD 3.3) ★ then chốt
Viết **4 hàm SQL tái dùng**, không viết tay 65 policy:

```sql
auth_company_ids()        -- pháp nhân người dùng thuộc, từ user_companies
auth_has_role(text[])     -- kiểm tra vai trò
auth_is_admin_or_bgd()    -- BGĐ/Admin xem mọi pháp nhân
auth_approval_limit(text) -- hạn mức theo loại nghiệp vụ
```

Rồi 4 macro/helper áp policy theo mẫu **A / B / C / D**.

### 0.5 Bộ test RLS ★ không được lùi sang phase sau
Harness chạy như unit test: với mỗi bảng nhạy cảm, giả lập ≥5 vai trò, khẳng định ai thấy/sửa được gì.
Lý do bắt buộc làm sớm: **RLS quá lỏng không có triệu chứng** cho tới khi có người thấy lương/giá vốn
của người khác (PRD NEN-07).

### 0.6 Design tokens & format (CGD 6.3–6.5, 4.3)
- `tailwind.config` + CSS variables shadcn theo đúng mã màu CGD 6.3
- Font Inter, body 14px, lưới 8px, bo góc 4–8px (Lozenge bo tròn hoàn toàn)
- `shared/`: enum 5 trạng thái, mã 12 module, hàm format ngày `dd/mm/yyyy`, số `1.234.567,89`,
  tiền `bigint → "125.000.000 đồng"`, phần trăm

### 0.7 App Shell (AFD 2.1–2.4)
5 vùng cố định: Sidebar · Topbar · Breadcrumb · Content · Panel ngữ cảnh
- Bộ chọn pháp nhân (AFD 2.2) — chuyển **không tải lại trang**, giữ nguyên module đang xem
- Menu lọc theo vai trò (AFD 2.3) — **ẩn**, không phải hiện rồi báo lỗi (AFD 6.5)
- Topbar: ô tìm kiếm (rỗng), chuông Thông báo, Việc cần làm, menu tài khoản

### ✅ Definition of Done — Phase 0
1. Đăng nhập bằng 3 vai trò khác nhau → sidebar hiển thị khác nhau
2. Chuyển pháp nhân NVC→NVO → dữ liệu đổi, module đang xem giữ nguyên
3. Bộ test RLS xanh trên `companies` + `users` + một bảng thử
4. `npm run dev` (web) + `wrangler dev` (workers) + migration Drizzle chạy được từ máy sạch

### 🔓 Mở khoá: toàn bộ Phase 1

---

# PHASE 1 — Primitives & hạ tầng xuyên suốt ★ đòn bẩy lớn nhất

**Mục tiêu:** dựng xong bộ công cụ để module 3→12 trở thành *cấu hình* thay vì *viết mới*.

**Phụ thuộc:** P0. **Chặn:** P2, P3 (làm tắt phase này = trả giá gấp 10 ở P2–P3).

### 1.0 Chuẩn PWA và bố cục di động ✅ (đã làm)

Áp cho **toàn bộ** ứng dụng theo quyết định của Haan — xem CLAUDE.md 6.5 mục 7.

- `vite-plugin-pwa` + Workbox: manifest đầy đủ (biểu tượng 192/512 + maskable, shortcuts,
  `display: standalone`), service worker precache khung ứng dụng, `navigateFallback` cho SPA
- Cập nhật kiểu **hỏi trước** (`registerType: 'prompt'`) — không tự nạp lại giữa lúc nhập liệu
- Dải báo mất kết nối + lời mời cài lên màn hình chính (kèm hướng dẫn riêng cho iOS)
- Bố cục di động: sidebar ẩn, **thanh điều hướng dưới 4–5 mục** (AFD 4.7), danh sách chuyển
  sang dạng thẻ, Hộp thư Phê duyệt xếp dọc, vùng bấm ≥40px, chừa `safe-area` của iPhone
- Tách gói theo màn hình (`React.lazy`) — gói khởi động giảm từ 670KB xuống 253KB
- 🚫 KHÔNG cache dữ liệu Supabase trong service worker (RLS + PRD 5.2). Offline thật = KHO-09,
  vẫn chờ quyết định

### 1.1 Component primitives (AFD 4 — 7 mẫu bố cục)

| Primitive | Thay thế |
|---|---|
| `<EntityTable>` — cột mã · người chịu trách nhiệm · trạng thái · thời hạn; lọc + tìm kiếm đầu bảng; **giữ bộ lọc khi quay lại từ Chi tiết**; bulk action; empty state có nút | ~20 màn hình Danh sách |
| `<EntityDetail>` — header cố định khi cuộn (tên, mã, trạng thái, người chịu trách nhiệm, nút hành động); **Tab giữ nguyên URL gốc**; panel phải liên kết chéo; **tab Lịch sử tự động** | ~12 màn hình Chi tiết |
| `<EntityForm>` / `<WizardForm>` — <10 trường: 1 trang; dài: wizard có thanh tiến trình, lưu nháp, quay lại không mất dữ liệu; Hủy hỏi xác nhận; **lưu xong → vào thẳng Chi tiết** | ~15 biểu mẫu |
| `<ApprovalInbox>` — MỘT component cho mọi loại duyệt; xem nhanh bên phải đủ để quyết định; duyệt xong tự sang hồ sơ tiếp theo | 6+ luồng duyệt |
| `<StatusLozenge>` — 5 trạng thái, bo tròn hoàn toàn, **luôn kèm chữ** | Toàn hệ thống |
| `<KanbanBoard>` — cột theo trạng thái, kéo-thả | CRM pipeline, NS tuyển dụng |
| `<EmptyState>` `<Skeleton>` `<ErrorState>` — theo CGD 4.7 / AFD 6.7 (**skeleton, không spinner toàn màn**) | Toàn hệ thống |

### 1.2 Drizzle helpers (BSD 1.4)
```ts
auditColumns()      // created_at, updated_at, created_by, updated_by
softDelete()        // deleted_at
versionColumns()    // version, is_current_version
companyScoped()     // company_id FK → companies
moneyColumn()       // bigint, đơn vị đồng, KHÔNG thập phân
statusColumn(...)   // enum quy về 5 nhóm chuẩn
```

### 1.3 Hạ tầng tài liệu & phiên bản (NEN-05, NEN-06)
- `documents` + `document_versions` + Supabase Storage
- `POST /api/documents/:id/versions` — tải bản mới, tự set `is_current_version`, **thông báo các bên liên quan**
- Quy ước đặt tên tệp: mã dự án / loại hồ sơ / số phiên bản

### 1.4 Hạ tầng thông báo & việc cần làm (NEN-03, NEN-04)
- `notifications` · `tasks` · `audit_logs` · `sensitive_access_logs`
- Helper `createNotification()` / `createTask()` để mọi module gọi
- Trung tâm Thông báo + Việc cần làm ở topbar (AFD 5.4) — **tách 2 danh sách**, mỗi mục dẫn thẳng
  đến màn hình xử lý; xử lý xong biến mất ngay không cần tải lại
- Supabase Realtime cho cập nhật tức thời

### 1.5 Tìm kiếm toàn hệ thống (AFD 5.3)
`GET /api/search` — Postgres full-text (`tsvector`), gộp kết quả theo module, tối đa 5/nhóm,
khớp chính xác theo mã ưu tiên đầu. Đăng ký dần từng bảng qua các phase sau.

### 1.6 Seed script v1
3 pháp nhân · ~15 người dùng đủ vai trò · roles + permissions + approval_limits.
**Chạy được từ máy sạch bằng 1 lệnh.**

### ✅ Definition of Done — Phase 1
1. Dùng primitive dựng CRUD hoàn chỉnh cho `customers` (list + detail + form + RLS) **trong <30 phút**
2. Tải lên 2 phiên bản một tài liệu → chỉ 1 bản `is_current_version`, các bên nhận thông báo
3. Tìm kiếm topbar trả về khách hàng theo tên và theo mã
4. Storybook/trang demo hiển thị toàn bộ primitive ở mọi trạng thái (rỗng/tải/lỗi)

### 🔓 Mở khoá: P2 và P3 chạy nhanh

---

# PHASE 2 — Xương sống thương mại (PRD Giai đoạn 1)

**Mục tiêu:** dữ liệu gốc hình thành. Một cơ hội chạy trọn **CRM → DA/TK → HD** trên dữ liệu thật,
có lịch sử phiên bản dự toán và người phê duyệt truy vết được (PRD 7, IPD M1).

**Phụ thuộc:** P1. Bên trong P2 thứ tự bắt buộc: **CRM → (DA ∥ TK) → HD → BC**

### 2A. Module CRM (BSD 4.2)
`customers` · `opportunities` · `opportunity_stage_history` · `site_surveys` · `quotes` · `complaints`

- Pipeline Kanban 6 giai đoạn (CRM-02): Tiếp nhận → Xác minh (M1/M2/M3/M4) → Khảo sát → Báo giá → Đàm phán → Ký/Mất
- `quotes` có `version` + `is_current_version` (CRM-04) — báo giá **phải qua duyệt nội bộ trước khi gửi**
- `POST /api/opportunities/:id/handover` — bàn giao sang DA/TK **kèm toàn bộ lịch sử** (CRM-06)
- `POST /api/quotes/:id/request-special-approval` — giảm giá đặc biệt, mặc định TGĐ duyệt (CRM-05)
- ⚠️ RLS: `opportunities` dùng **B khi nháp**, chuyển **A sau khi bàn giao** (BSD 4.2 ghi chú)

### 2B. Module DA (BSD 4.3) — module nặng nhất Phase 2 ✅ phần lõi đã xong

Đã dựng: 7 bảng + RLS + 10 test · gói thầu (5 tab) · bóc tách khối lượng gắn phiên bản bản vẽ ·
đơn giá dùng chung · dự toán có phiên bản · duyệt giá qua Hộp thư chung · nộp thầu có checklist ·
ngân sách thi công + thông báo bàn giao.

**Mẫu D triển khai lần đầu ở đây** — cách làm dùng lại cho `employees` (NS) và mọi bảng nhạy cảm sau:
quyền đọc cột nhạy cảm bị THU HỒI ở tầng CSDL (`REVOKE ... (cột)`), dữ liệu chỉ ra qua hàm
`SECURITY DEFINER` có gọi `log_sensitive_access` — vì một câu SELECT không ghi được nhật ký mà
NEN-07 thì bắt buộc ghi. Bảng nào toàn bộ là dữ liệu nhạy cảm (`unit_prices`, `estimate_items`)
thì chặn ở mức DÒNG cho gọn.

⏳ Còn lại: DA-10 (đối chiếu dự toán với chi phí thực tế) — cần dữ liệu chi phí của Giai đoạn 2.


`bidding_projects` · `boq_items` · `unit_prices` · `estimates` · `price_approvals` · `bid_documents` · `project_budgets`

- Bóc tách khối lượng gắn **mã bản vẽ + phiên bản đang hiệu lực**; cảnh báo khi bản vẽ nguồn đổi (DA-04)
- `unit_prices` — CSDL đơn giá/định mức dùng chung, lưu lịch sử theo mã vật tư/NCC/ngày/dự án (DA-05)
- `estimates` có version; **RLS Mẫu D** (ẩn cột giá vốn/lợi nhuận)
- Luồng duyệt giá (DA-07): Trưởng nhóm → Trưởng phòng/TGĐ, qua `<ApprovalInbox>` + `approval_limits`
  - `POST /api/estimates/:id/submit-approval`
  - `POST /api/estimates/:id/approve`
- `POST /api/bidding-projects/:id/generate-budget` — **chuyển dự toán đã duyệt thành ngân sách thi công
  theo mã chi phí** (DA-09) ← đây là mắt xích quan trọng nhất nối GĐ1 sang GĐ2
- ⏸ DA-11 (Gemini đọc bản vẽ) — **tính năng phụ, lùi được**, làm ở P4 nếu còn thời gian

### 2C. Module TK (BSD 4.4) — song song được với 2B ✅ phần lõi đã xong

Đã dựng: 7 bảng + RLS + 22 test · đầu bài có phiên bản · khảo sát hiện trạng kỹ thuật ·
phương án kiến trúc kèm vòng góp ý của khách · phiên bản bản vẽ theo bộ môn có phát hành +
thông báo · tiến độ 3 bộ môn + kiểm tra đồng bộ · yêu cầu thay đổi · bàn giao thi công.

**TK-07 làm bằng cách MỞ RỘNG Module DA, không sao chép.** `estimates` và `boq_items` nhận
hai loại hồ sơ cha (`bidding_project_id` hoặc `design_project_id`, ràng buộc CHECK đúng một
cột), và màn hình dự toán chuyển từ `pages/da/` sang `components/estimate/` dùng chung. Nhờ
vậy công thức tính thành tiền, cơ chế phiên bản và luồng duyệt giá chỉ có một bản.

⏳ Còn lại: TK-09 (thư viện thiết kế) — đã đánh dấu "lùi được", làm ở P4.
⏳ `handover_design_to_construction` chưa tạo `construction_sites` (bảng của Module TC,
Giai đoạn 2). Cột `design_projects.construction_site_id` đã khai sẵn, migration TC chỉ cần
thêm khoá ngoại và một dòng INSERT.

⚠️ **Hai chỗ cố ý lệch BSD 4.4 — cần Haan xác nhận để cập nhật tài liệu:**
1. BSD ghi `design_projects.brief` là một trường; ở đây tách thành bảng `design_briefs` có
   phiên bản, vì TK-01 yêu cầu "đầu bài ĐANG HIỆU LỰC duy nhất" — chữ "đang hiệu lực" chỉ có
   nghĩa khi tồn tại bản không còn hiệu lực.
2. BSD ghi `design_versions.file_url`; ở đây trỏ sang `documents`/`document_versions` như
   `bid_documents` của DA đã làm, để bản vẽ không có hai nơi quản lý phiên bản (PRD 2.3).

Ngoài ra `design_surveys` (TK-02) và `design_reviews` (TK-03) là hai bảng BSD 4.4 không liệt
kê nhưng PRD yêu cầu — khảo sát kỹ thuật khác khảo sát thương mại của CRM-03, và "vòng góp ý
của khách" là căn cứ chuyển bước nên phải là dữ liệu, không phải ghi chú.


`design_projects` · `design_briefs` · `design_surveys` · `design_versions` · `design_reviews` ·
`design_discipline_tasks` · `change_requests` · `design_library`

- Một "đầu bài" **đang hiệu lực duy nhất** (TK-01)
- Phiên bản bản vẽ theo bộ môn (kiến trúc / kết cấu / điện nước), **chỉ 1 bản hiệu lực tại 1 thời điểm** (TK-05)
- `POST /api/design-projects/:id/publish-version` — phát hành + **thông báo đồng thời** KT/KC/ĐN/dự toán/KD/công trường
- `POST /api/design-projects/:id/handover-construction` — kiểm tra đồng bộ đa bộ môn trước khi bàn giao (TK-08)
- TK-07 dùng chung engine dự toán với DA (không viết lại)
- ⏸ TK-09 (thư viện thiết kế) — **lùi được**
- 🚫 TK-10→TK-17 — **KHÔNG làm ở đây.** Xem Phase 5.

### 2D. Module HD (BSD 4.5)
`contracts` · `contract_terms` · `contract_amendments`

- `POST /api/contracts/from-opportunity` — soạn từ dữ liệu cơ hội/gói thầu/dự án TK, **không nhập lại** (HD-01)
- Theo dõi điều khoản: phạm vi, giá trị, tiến độ thanh toán, tạm ứng, bảo lãnh, phạt, bảo hành, quyết toán (HD-02)
- Phát sinh ngoài hợp đồng phải có đề xuất + báo giá + xác nhận khách trước khi thực hiện (HD-04)
- `POST /api/contracts/:id/submit-approval` — duyệt theo hạn mức (HD-05)
- RLS Mẫu **C**

### 2E. Module BC — mức cơ bản
Dashboard shell + các chỉ số đã có dữ liệu (số cơ hội, giá trị pipeline, hợp đồng chờ duyệt).
Mỗi thẻ **bấm được, dẫn tới danh sách đã lọc sẵn** (AFD 4.1) — không phải thẻ chỉ để nhìn.

### ✅ Definition of Done — Phase 2
1. **Golden Path 2 (NVO) chạy trọn**: Cơ hội → Dự án thiết kế → Phương án → Phiên bản bản vẽ → Dự toán → Hợp đồng
2. **Golden Path 1 (NVC) chạy tới hợp đồng**: Cơ hội → Gói thầu → BOQ → Dự toán → Duyệt giá → Hợp đồng → Ngân sách
3. Từ một hợp đồng, truy ngược được về đúng cơ hội gốc + đúng phiên bản dự toán đã duyệt + ai duyệt, khi nào
4. Sửa bản vẽ nguồn → hệ thống cảnh báo BOQ đang bóc theo bản cũ

### 🔓 Mở khoá: P3 (TC cần `contracts` + `project_budgets`)

---

# PHASE 3 — Vận hành, hậu cần, tài chính (PRD Giai đoạn 2)

**Mục tiêu:** một công trình chạy trọn vòng đời: Hợp đồng → Ngân sách → Mua hàng/Kho → Nghiệm thu →
Đề nghị thanh toán → Thu tiền → Lãi/lỗ (PRD 7, IPD M2).

**Thứ tự bắt buộc bên trong:** `TC → MH → KHO → KT`. `NS` độc lập (chen vào bất cứ lúc nào).
`SX` sau `KHO`.

### 3A. Module TC (BSD 4.6) — cửa ngõ của Phase 3
`construction_sites` · `site_logs` · `acceptance_records` · `subcontractors` · `warranties`

- Nhận ngân sách từ DA-09/TK → lập kế hoạch nhân sự/vật tư/tiến độ (TC-01)
- Nhật ký công trường có ảnh, theo ngày/tuần (TC-02) — **giao diện di động** (AFD 4.7)
- `POST /api/construction-sites/:id/acceptance` — nghiệm thu, **tự thông báo Kế toán thu tiền** (TC-04)
- `GET /api/construction-sites/:id/budget-status` — so ngân sách vs đã phát sinh / đã cam kết /
  dự kiến còn phải chi, **cảnh báo sớm vượt** (TC-05)
- ⚠️ Module **ĐỊNH HƯỚNG** — chưa có khảo sát Chỉ huy công trường (PRD 10). Schema để linh hoạt
  (nullable/JSONB cho phần chưa chắc), **không xây UI sâu**, đánh dấu rõ phần suy luận gián tiếp.

### 3B. Module MH (BSD 4.7)
`purchase_requests` · `suppliers` · `quotations` · `purchase_orders` · `deliveries`

- Đề nghị mua từ Công trình (TC-03) hoặc Gói thầu; duyệt theo hạn mức (MH-02)
- `POST /api/purchase-requests/:id/compare-quotations` — bảng so sánh **chuẩn hoá**: đơn giá, thuế,
  vận chuyển, hao hụt, thời hạn giao, điều kiện thanh toán, bảo hành. **Không chỉ so giá thấp nhất** (MH-04)
- Lịch sử giá theo mã vật tư–NCC–ngày–dự án → **gợi ý ngược cho `unit_prices`** (MH-05 ↔ DA-05)
- `POST /api/deliveries` — ghi giao nhận, **tự cập nhật tồn kho** (MH-07 → KHO)
- Bộ chứng từ chuyển thẳng Kế toán, **không nhập lại** (MH-08 → KT)

### 3C. Module KHO (BSD 4.8)
`warehouses` · `inventory_items` · `stock_movements` · `stocktakes` · `scaffolding_assets`

- Mã hoá vật tư thống nhất: nhóm – viết tắt – quy cách; **một vật tư một mã duy nhất** (KHO-02)
- Nhập / Xuất / Điều chuyển / Kiểm kê (KHO-03→07)
- `scaffolding_assets` — vòng đời riêng: mới / còn dùng được / hỏng chờ sửa / chờ thanh lý (KHO-06)
- `POST /api/stock-movements` với `client_generated_id` **chống trùng khi đồng bộ lại**
- Giao diện di động + quét mã vạch/QR (AFD 4.7)
- ⚠️ **KHO-09 offline-first**: xem "Quyết định cần chốt" ở cuối tài liệu

### 3D. Module KT (BSD 4.9)
`payment_requests` · `advances` · `receivables_payables` · `cash_flow_plans` · `accounting_periods`

- Luồng duyệt chi **nhiều cấp** (KT-01): đề nghị → trưởng đơn vị → Kế toán kiểm tra → Trưởng Tài chính
  kiểm tra dòng tiền → duyệt theo hạn mức → phiếu chi → hạch toán
  - `POST /api/payment-requests/:id/approve-step` — xử lý từng bước
- Mọi khoản gắn mã công ty/công trình/hạng mục/bộ phận + **hiển thị đang ở bước nào, chờ ai, quá hạn
  bao lâu** (KT-02) ← giải trực tiếp vướng mắc #6
- Gắn chi phí vào mã công trình **ngay từ khi phát sinh**, không hạch toán lại thủ công (KT-05)
- `POST /api/accounting-periods/:id/close` — khoá kỳ, chặn sửa (KT-09)
- ⏸ `POST /api/export/accounting-software` (KT-08) — **chặn bởi quyết định phần mềm kế toán**;
  làm khung trước, hoàn thiện định dạng sau

### 3E. Module NS (BSD 4.10) — độc lập, chen vào bất cứ lúc nào
`employees` · `employment_contracts` · `timesheets` · `leave_requests` · `recruitment_positions` · `assets_assigned`

- Chấm công **3 khối**: văn phòng (máy chấm công) / công trường (chỉ huy ghi quân số) / xưởng (ca + sản lượng) (NS-04)
- `POST /api/timesheets/consolidate` → chuyển KT tính lương, **không nhập lại**
- `POST /api/employees/:id/offboard` → checklist thu hồi tài sản + quyền truy cập (NS-11, NEN-10)
- Nhắc hạn giấy tờ trước 90/60/30/7 ngày (NS-10 → NEN-04)
- ⏸ NS-06 công thức lương — **chặn bởi quy chế lương**; làm khung cấu hình được
- ⚠️ `employees`: BSD 3.3 ghi Mẫu D, BSD 4.10 ghi Mẫu B → theo 4.10 (**B**), nhưng **cột lương vẫn
  hạn chế theo cột như D**

### 3F. Module SX (BSD 4.12) — mức cơ bản
`production_orders` · `material_consumption` · `rental_agreements`

- `POST /api/rental-agreements/:id/return` — thu hồi giàn giáo, đối soát hao hụt/hư hỏng/bồi thường
- ⚠️ Module **ĐỊNH HƯỚNG** — chưa khảo sát Xưởng giàn giáo (PRD 10). SX-01/SX-02 đánh dấu
  "cần xác nhận thêm". Ưu tiên **SX-03 (tài sản cho thuê)** vì đã đủ thông tin và liên kết KHO-06/KHO-10.

### 3G. Module BC — đầy đủ
- `GET /api/dashboard/executive` — **một lần gọi** trả toàn bộ chỉ số BC-01
- `GET /api/reports/profit-loss` — lãi/lỗ theo công trình/công ty, **truy ngược tới chứng từ gốc** (BC-02)
- Báo cáo hiệu quả kinh doanh (BC-03), tồn kho (BC-04), cảnh báo rủi ro tổng hợp (BC-05)
- Mọi báo cáo **xuất Excel/PDF** + hiện ngày cập nhật gần nhất + mức độ đầy đủ dữ liệu (BC-06)
- `report_snapshots` — chỉ thêm nếu dashboard chậm thật, không tối ưu sớm

### ✅ Definition of Done — Phase 3
1. **Golden Path 1 (NVC) chạy TRỌN** tới lãi/lỗ
2. **Golden Path 3 (NVS) chạy trọn**: báo giá kèm tồn → xuất cho thuê → theo dõi → thu hồi + đối soát
3. Từ một dòng lãi/lỗ, bấm truy ngược tới đúng chứng từ gốc
4. BGĐ mở dashboard thấy doanh thu / dòng tiền / công nợ / chi phí vs ngân sách — **không cần hỏi Zalo**
5. Chấm công 3 khối chốt được và chuyển sang KT

---

# PHASE 4 — Liên kết chéo, chất lượng, bàn giao demo (PRD Giai đoạn 3)

**Mục tiêu:** ~95% hoàn chỉnh, không còn lỗi chặn luồng nghiệp vụ chính.

### 4A. Hồ sơ 360° đầy đủ (AFD 5.1–5.2)
- Panel ngữ cảnh hiển thị đủ liên kết cho 7 thực thể trung tâm (BSD 2.1)
- **Mọi trường tham chiếu là liên kết bấm được**, không phải chữ tĩnh
- Breadcrumb phản ánh **đường đi thực tế**, không phải cấu trúc menu cố định
- Mở tab mới bằng chuột giữa luôn hoạt động (quan trọng khi người duyệt đối chiếu nhiều hồ sơ)
- Tìm kiếm toàn hệ thống phủ đủ 12 module

### 4B. Rà soát phân quyền toàn hệ thống
- Đối chiếu **từng bảng trong ~65 bảng** với mẫu A/B/C/D đã ghi ở BSD 4.x
- Kiểm tra dữ liệu nhạy cảm **không lộ qua đường vòng** (panel liên kết chéo, kết quả tìm kiếm, export)
- `sensitive_access_logs` ghi đủ

### 4C. Áp Content Guidelines toàn diện
- Rà toàn bộ microcopy theo CGD 5.1–5.6 (nhãn trạng thái, nút, thông báo, email, lỗi, trạng thái rỗng)
- Kiểm tra thuật ngữ chuẩn hoá (CGD 4.4) — không lẫn "Duyệt/Phê duyệt/Approve"
- Kiểm tra định dạng số/ngày/tiền nhất quán
- Kiểm tra tương phản màu đạt WCAG AA; vùng bấm di động ≥40×40px

### 4D. Tác vụ nền (NEN-04)
- Cloudflare **Cron Triggers**: quét hằng ngày → giấy tờ/hợp đồng/bảo hiểm sắp hết hạn (90/60/30/7 ngày),
  vượt ngân sách, công nợ đến hạn, việc quá hạn
- Cloudflare **Queues**: gửi email, tổng hợp báo cáo nặng
- ⚠️ Nguyên tắc chống "nhàm cảnh báo" (CGD 3.4): **không lặp lại thông báo đã xử lý**, chỉ gửi đúng người

### 4E. Kiểm thử & triển khai
- 3 Golden Path E2E xanh ổn định
- Bộ test RLS đầy đủ xanh
- Dữ liệu demo thật cho cả 3 pháp nhân + Back Office
- staging → production; xác nhận sao lưu trước migration production (IPD 5.4)

### 4F. Tính năng phụ (chỉ khi còn thời gian — IPD 4.3)
DA-11 (Gemini đọc bản vẽ) · TK-09 (thư viện thiết kế) · NS-02 (kanban tuyển dụng) · `report_snapshots`

### ✅ Definition of Done — Phase 4
1. 12 module liên kết chéo thông suốt, không lỗi chặn luồng chính
2. Kịch bản demo đầu-cuối chạy được cho NVC + NVO + NVS + Back Office
3. Các quy trình demo **chạy hoàn toàn trên hệ thống, không cần Excel/Zalo song song** (PRD 7)

---

# PHASE 5 — AI Preliminary Design Engine (TK-10 → TK-17)

**Điều kiện vào (bắt buộc):**
1. Hệ thống lõi đạt ~90% (quyết định của Haan)
2. **Tài liệu "AI Preliminary Design Engine v02" đã có trong `doc/` và đã đọc**

🚫 **Không viết một dòng code nào của phase này trước khi thoả cả 2 điều kiện.**

### 5.0 Spike thuật toán trước ★ khuyến nghị mạnh
Trong 5 lớp, **TK-12/TK-13 là phần bất định nhất**: PRD chỉ định rõ **KHÔNG dùng LLM sinh toạ độ**,
phải tự viết thuật toán ràng buộc/phân vùng không gian bằng TypeScript. Các lớp còn lại đều là đường
đã có sẵn (Gemini API, Three.js).

→ Làm **một spike độc lập**, tách khỏi hệ thống chính, trả lời: sinh được bao nhiêu phương án mặt bằng
hợp lệ (không chồng lấn, vừa khít khu đất, thoả quan hệ công năng) cho một khu đất mẫu?
Biết sớm giới hạn của nó quan trọng hơn làm đúng thứ tự các lớp.

### 5.1 → 5.5 Năm lớp (PRD 5, bảng công nghệ)

| Lớp | Yêu cầu | Công nghệ (PRD đã chốt) |
|---|---|---|
| L1 Requirement Intelligence | TK-10 | Gemini Flash + bộ quy tắc kiến trúc nhà ở đã hệ thống hoá sẵn |
| L2 Functional Programming | TK-11 | Gemini Flash + quy tắc diện tích/quan hệ phòng chuẩn |
| L3 Floor Plan + Re-design | TK-12, TK-13 | **Thuật toán ràng buộc TỰ XÂY (TypeScript, Workers)** — Gemini chỉ diễn giải tác động bằng ngôn ngữ tự nhiên |
| L4 Architecture Generation | TK-14 | Thư viện mẫu kiến trúc dựng sẵn + Gemini chọn/phối theo phong cách |
| L5 Parametric 3D + Visualization | TK-15, TK-16 | **Three.js** (dựng thủ tục, không gọi AI) + Gemini 2.5 Flash Image dùng ảnh 3D làm tham chiếu |

### 5.6 Output chuẩn (TK-17)
6 loại gắn với mỗi dự án thiết kế: Design Brief · Functional Program · **Editable Floor Plan
(dữ liệu hình học, KHÔNG phải ảnh)** · Architecture Concept · Parametric 3D Model · AI Visualization —
mỗi loại đi qua đúng luồng review/phê duyệt TK-03.

### 🚧 Ranh giới bắt buộc
- Mọi phương án AI ở trạng thái **NHÁP/ĐỀ XUẤT** cho tới khi Phòng Thiết kế xác nhận
- **Kết cấu, MEP, an toàn, PCCC luôn do kỹ sư chuyên môn xác minh** — AI chỉ đề xuất
- Không gửi bản vẽ nguồn / dữ liệu khách hàng lên gói miễn phí Gemini nhiều hơn mức cần thiết

---

# Công việc chạy SONG SONG suốt mọi phase

| Việc | Nhịp |
|---|---|
| **Test RLS** | Mỗi bảng mới → thêm test ngay, không để cuối |
| **Seed data** | Mỗi module mới → bổ sung dữ liệu thật tương ứng |
| **E2E Golden Path** | Viết trước (đỏ), làm cho xanh dần qua các phase |
| **Cập nhật CLAUDE.md** | Khi có quyết định mới hoặc tài liệu được cập nhật |
| **Ghi lại câu hỏi nghiệp vụ** | Phát hiện mơ hồ → ghi vào danh sách hỏi Haan, không tự quyết |

---

# Thứ tự cắt giảm nếu phải cắt (IPD 4.3)

Cắt từ trên xuống, **không bao giờ cắt Golden Path**:

1. TK-09 thư viện thiết kế · DA-11 AI bóc tách · NS-02 kanban tuyển dụng
2. `report_snapshots` · BC-04 báo cáo tồn kho nâng cao
3. SX-01/SX-02 (lệnh sản xuất, giá thành) — giữ SX-03 tài sản cho thuê
4. KHO-09 offline thật → hạ xuống online-first + optimistic UI
5. Chiều sâu của TC/SX (do thiếu khảo sát) → giữ đủ để luồng chạy

**Không bao giờ cắt:** RLS + test RLS · audit/lịch sử · quản lý phiên bản tài liệu · luồng phê duyệt
theo hạn mức · truy vết ngược tới chứng từ gốc.

---

# Quyết định còn cần Haan chốt

| # | Quyết định | Chặn |
|---|---|---|
| 1 | **KHO-09 offline-first** làm thật hay online-first + `client_generated_id`? | Phase 3C |
| 2 | **Phần mềm kế toán** chính thức (KT-08) | Phase 3D (endpoint export) |
| 3 | **`unit_prices` dùng chung** DA/TK/MH hay NVO cần bảng riêng? (BSD 5) | Phase 2B |
| 4 | **Quy tắc mã hoá** dự án/công trình/vật tư/hợp đồng — dùng bộ nào? | Phase 2A |
| 5 | **Hạn mức phê duyệt** tạm thời cụ thể theo vai trò × loại nghiệp vụ | Phase 0.2 (seed) |
| 6 | **Công thức lương** NS-06 | Phase 3E |
| 7 | **Đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5) | Phase 4C |
