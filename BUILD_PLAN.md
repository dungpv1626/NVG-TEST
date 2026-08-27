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
- _(Email giao dịch qua Resend/SendGrid — có thể dùng SMTP mặc định Supabase tạm thời)_

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

**Mục tiêu:** dựng xong bộ công cụ để module 3→12 trở thành _cấu hình_ thay vì _viết mới_.

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

| Primitive                                                                                                                                                                              | Thay thế                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `<EntityTable>` — cột mã · người chịu trách nhiệm · trạng thái · thời hạn; lọc + tìm kiếm đầu bảng; **giữ bộ lọc khi quay lại từ Chi tiết**; bulk action; empty state có nút           | ~20 màn hình Danh sách      |
| `<EntityDetail>` — header cố định khi cuộn (tên, mã, trạng thái, người chịu trách nhiệm, nút hành động); **Tab giữ nguyên URL gốc**; panel phải liên kết chéo; **tab Lịch sử tự động** | ~12 màn hình Chi tiết       |
| `<EntityForm>` / `<WizardForm>` — <10 trường: 1 trang; dài: wizard có thanh tiến trình, lưu nháp, quay lại không mất dữ liệu; Hủy hỏi xác nhận; **lưu xong → vào thẳng Chi tiết**      | ~15 biểu mẫu                |
| `<ApprovalInbox>` — MỘT component cho mọi loại duyệt; xem nhanh bên phải đủ để quyết định; duyệt xong tự sang hồ sơ tiếp theo                                                          | 6+ luồng duyệt              |
| `<StatusLozenge>` — 5 trạng thái, bo tròn hoàn toàn, **luôn kèm chữ**                                                                                                                  | Toàn hệ thống               |
| `<KanbanBoard>` — cột theo trạng thái, kéo-thả                                                                                                                                         | CRM pipeline, NS tuyển dụng |
| `<EmptyState>` `<Skeleton>` `<ErrorState>` — theo CGD 4.7 / AFD 6.7 (**skeleton, không spinner toàn màn**)                                                                             | Toàn hệ thống               |

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

### 1.5 Tìm kiếm toàn hệ thống (AFD 5.3) — ✅ v1 xong (Phase 3G)

Hàm CSDL `global_search` (`db/migrations/0057_global_search.sql`), gọi thẳng qua PostgREST RPC
— không qua Workers, vì đây chỉ là một truy vấn đọc trên bảng đã có RLS (CLAUDE.md 3.1). Gộp
kết quả theo module, tối đa 5/nhóm, khớp đầu MÃ ưu tiên trước khớp trong tên. SECURITY INVOKER
— không tự kiểm quyền module, dựa hẳn vào RLS của từng bảng nguồn (test:
`db/src/__tests__/search.test.ts`, khẳng định NVO không tìm thấy hồ sơ của NVC). Ô tìm kiếm ở
Top Bar (`web/src/components/layout/top-bar.tsx`) nay gọi thật, có debounce 300ms, gộp theo
module và bấm vào là sang thẳng chi tiết.

⚠️ **Không phải `tsvector` full-text như phác thảo gốc** — dùng ILIKE, đủ nhanh ở quy mô demo;
nâng cấp sau nếu chậm thật (xem ghi chú đầu file migration). **Đăng ký MỚI sáu bảng trung tâm**
(customers, opportunities, bidding_projects, design_projects, contracts, construction_sites) —
các bảng khác (nhà cung cấp, vật tư, nhân sự…) đăng ký thêm khi có nhu cầu thật.

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

### 2D. Module HD (BSD 4.5) ✅ đã xong

Đã dựng: 3 bảng + RLS + 18 test · soạn hợp đồng từ hồ sơ nguồn · checklist 8 nhóm điều
khoản · trình ký theo hạn mức qua Hộp thư chung · ghi nhận đã ký + thông báo Thi công/Kế
toán · phát sinh ngoài hợp đồng đủ luồng HD-04 · quyết toán và hủy.

**Không có màn hình "Tạo hợp đồng".** Nút Soạn hợp đồng nằm trên Chi tiết của hồ sơ NGUỒN
(cơ hội ở bước Đàm phán, gói thầu đã trúng thầu, dự án thiết kế ở bước Dự toán) — đúng
AFD 3.1 bước 5 và 3.2, và đúng PRD 2.3: không nhập lại dữ liệu đã có.

**★ LỖ HỔNG PHÁT HIỆN KHI VIẾT TEST — đã bịt ở migration 0028, ảnh hưởng CẢ CRM/DA/TK/HD.**
Mẫu policy dùng khắp nơi có `USING (... AND stage = 'nhap')` nhưng `WITH CHECK` chỉ kiểm
pháp nhân. `USING` nói "được đụng vào dòng ĐANG ở bước nào", `WITH CHECK` mới nói "dòng SẼ
thành cái gì" — nên một câu `PATCH /contracts {"stage":"da_ky"}` đủ để bỏ qua toàn bộ hạn
mức HD-05, không để lại dòng nào trong `approvals`. Tương tự với `bidding_projects.stage`
(bỏ qua DA-08), `design_projects.stage` (bỏ qua kiểm tra đồng bộ TK-08) và `quotes.status`
(bỏ qua duyệt nội bộ CRM-04).
Cách bịt: trigger chung `stage_changes_via_functions_only`, chặn khi `current_user =
'authenticated'` và cho qua khi hàm `SECURITY DEFINER` gọi. Kéo theo 0029/0030/0031 để đưa
ba trigger cấp phiên bản và `request_quote_approval` về đúng nhóm "logic hệ thống".

✅ HD-03 phần "đã thu / còn phải thu": `collected_amount` không còn là khung tính rỗng — trigger
của Module KT (0043_kt_rls.sql) cộng lại từ `receivable_settlements` mỗi khi ghi nhận thu tiền.
Ghi chú "luôn bằng 0" ở đây từ lúc Module KT chưa tồn tại, nay đã lỗi thời.

⚠️ **Một chỗ cố ý lệch Webapp Flow 2.3 — cần Haan xác nhận:** bảng menu ở 2.3 ghi Kinh
doanh / Dự án – Đấu thầu / Thiết kế chỉ có "Hợp đồng (xem)", nhưng 3.1 bước 5 và 3.2 lại
cho chính họ SOẠN hợp đồng. Theo 2.3 thì chỉ Quản trị hệ thống soạn được, và luồng trọng
yếu Giai đoạn 1 không ai chạy được. Đã chọn: ai sở hữu hồ sơ nguồn thì soạn được hợp đồng
từ hồ sơ đó; Kế toán giữ nguyên chỉ xem. Hạn mức phê duyệt HD-05 không đổi.

`contracts` · `contract_terms` · `contract_amendments`

- `POST /api/contracts/from-opportunity` — soạn từ dữ liệu cơ hội/gói thầu/dự án TK, **không nhập lại** (HD-01)
- Theo dõi điều khoản: phạm vi, giá trị, tiến độ thanh toán, tạm ứng, bảo lãnh, phạt, bảo hành, quyết toán (HD-02)
- Phát sinh ngoài hợp đồng phải có đề xuất + báo giá + xác nhận khách trước khi thực hiện (HD-04)
- `POST /api/contracts/:id/submit-approval` — duyệt theo hạn mức (HD-05)
- RLS Mẫu **C**

### 2E. Module BC — mức cơ bản ✅ đã xong

Dashboard chỉ số thật, mỗi con số là một liên kết tới danh sách đã lọc sẵn (AFD 4.1) — đếm bằng
đúng hàm mà danh sách dùng để hiện trạng thái, nên thẻ và danh sách không nói hai điều khác nhau.
Bộ lọc kỳ báo cáo giữ trên thanh địa chỉ; nút truy cập nhanh theo AFD 6.1; phần BC-01 chưa có dữ
liệu được nói thẳng thay vì dựng thẻ rỗng (BC-06).

Kèm theo: sửa lỗi **"Toàn NVG" cho ra màn hình trắng** — NVG là mã tổng hợp nên không bảng giao
dịch nào mang `company_id` đó; chọn nó nay bỏ điều kiện lọc và để RLS quyết định phạm vi
(`useCompanyScope` / `withCompanyScope`). `EntityTable` nhận thêm bộ lọc trạng thái trên thanh
địa chỉ (`?trang-thai=`) dùng chung cho mọi danh sách, và cột "Pháp nhân" khi đang gộp.

### ✅ Definition of Done — Phase 2 — ✅ ĐẠT

Kiểm chứng bằng `db/src/__tests__/golden-path.test.ts` — chạy trên CSDL thật, đăng nhập bằng đúng
vai trò làm việc đó ngoài đời, gọi đúng hàm mà giao diện gọi (không dùng `service_role`).

1. ✅ **Golden Path 2 (NVO) chạy trọn**: Cơ hội → Dự án thiết kế → Phương án → Phiên bản bản vẽ → Dự toán → Hợp đồng
2. ✅ **Golden Path 1 (NVC) chạy tới hợp đồng**: Cơ hội → Gói thầu → BOQ → Dự toán → Duyệt giá → Hợp đồng → Ngân sách
3. ✅ Từ một hợp đồng, truy ngược được về đúng cơ hội gốc + đúng phiên bản dự toán đã duyệt + ai duyệt, khi nào
4. ✅ Sửa bản vẽ nguồn → dòng khối lượng bóc theo bản cũ tự lộ ra (`is_current_version = false`)

> Còn nợ sang P4: bản E2E Playwright của hai Golden Path (mục 4E). Bản hiện tại chạy ở tầng dữ
> liệu — chứng minh nghiệp vụ thông suốt, chưa chứng minh phần nối dây trên giao diện.

### 🔓 Mở khoá: P3 (TC cần `contracts` + `project_budgets`)

---

# PHASE 3 — Vận hành, hậu cần, tài chính (PRD Giai đoạn 2)

**Mục tiêu:** một công trình chạy trọn vòng đời: Hợp đồng → Ngân sách → Mua hàng/Kho → Nghiệm thu →
Đề nghị thanh toán → Thu tiền → Lãi/lỗ (PRD 7, IPD M2).

**Thứ tự bắt buộc bên trong:** `TC → MH → KHO → KT`. `NS` độc lập (chen vào bất cứ lúc nào).
`SX` sau `KHO`.

### 3A. Module TC (BSD 4.6) — cửa ngõ của Phase 3 ✅ phần lõi đã xong

`construction_sites` · `site_logs` · `acceptance_records` · `subcontractors` · `warranties` ·
`warranty_claims` (thêm — TC-07 đòi ghi nguyên nhân/chi phí/kết quả của TỪNG lần phản ánh,
không thuộc về hạng mục)

- ✅ Công trình mở từ hợp đồng đã ký (`open_site_from_contract`) hoặc tự mở khi bàn giao hồ sơ
  thiết kế (`handover_design_to_construction` — chỗ migration 0025 đã để sẵn). Ngân sách đã
  duyệt được GẮN vào công trình, không lập lại (TC-01).
- ✅ Nhật ký công trường theo ngày, kèm quân số (dùng lại cho NS-04) và thời tiết. Chỉ người
  ghi sửa được, trong 24 giờ — nhật ký sửa được bất cứ lúc nào thì không truy vết được (TC-08).
- ✅ `record_acceptance` — nghiệm thu, và **chỉ nghiệm thu với CHỦ ĐẦU TƯ mới báo Kế toán thu
  tiền** (TC-04). Nghiệm thu nội bộ / với tổ đội là việc khác hẳn.
- ✅ `construction_budget_status` — so ngân sách vs đã phát sinh / đã cam kết / còn được chi
  theo từng mã chi phí; dòng lợi nhuận bị lọc theo Mẫu D. Cảnh báo sớm ở ngưỡng 90% qua
  trigger trên `project_budgets` (TC-05).
- ✅ Tổ đội (TC-06) và bảo hành theo từng hạng mục kèm phản ánh (TC-07).
- ✅ `project_budgets` mở rộng cho NVO: `design_project_id` + CHECK "đúng một hồ sơ cha", theo
  đúng cách `estimates` đã dùng chung ở migration 0024. NVO làm trọn gói nên không đi qua gói
  thầu nhưng vẫn cần TC-05.
- ✅ TC-03 (đề nghị mua vật tư từ công trường) — xong ở 3B: tab **Đề nghị mua** ở Chi tiết
  Công trình mở thẳng biểu mẫu của Module MH đã gắn sẵn công trình.
- ⚠️ Module **ĐỊNH HƯỚNG** — chưa có khảo sát Chỉ huy công trường (PRD 10). **Đã CỐ Ý chưa
  làm**, chờ khảo sát chứ không phải quên:
  - Kế hoạch tiến độ chi tiết theo đầu việc và kế hoạch nhân sự/vật tư theo thời gian (phần
    còn lại của TC-01) — chưa biết công trường lập tiến độ theo hạng mục, theo tuần hay theo
    mũi thi công.
  - Lịch sử đánh giá tổ đội theo từng đợt (TC-06) — hiện giữ đánh giá gần nhất, các lần trước
    vẫn truy được qua `audit_logs`.
  - Ảnh hiện trường mới là cột `photo_urls`, chưa có màn hình tải ảnh.
  - Ba con số suy luận cần xác nhận: cửa sổ sửa nhật ký **24 giờ**, ngưỡng cảnh báo ngân sách
    **90%**, thang đánh giá tổ đội **1–5**.

### 3B. Module MH (BSD 4.7) ✅ xong

`purchase_requests` + `purchase_request_items` · `suppliers` · `quotations` + `quotation_items` ·
`purchase_orders` + `purchase_order_items` · `deliveries` + `delivery_items`

BSD 4.7 liệt kê 5 bảng, ở đây có 9 — 4 bảng thêm là bảng DÒNG của bảng đã có (không phải khái
niệm mới): gộp vào bảng cha thì một đề nghị mua chỉ mua được 1 mặt hàng, trong khi thực tế luôn
là một danh sách.

- ✅ Đề nghị mua từ Công trình (TC-03) hoặc Gói thầu, hoặc không gắn hồ sơ nào (mua cho văn
  phòng). `submit_purchase_request_approval` chốt giá trị rồi gửi qua **đúng bảng `approvals`
  và hàm `decide_approval` đã có** — Hộp thư Phê duyệt vẫn là một màn hình duy nhất (MH-02).
- ✅ **Không đặt hàng trước rồi trình duyệt sau**: `purchase_orders` bị REVOKE INSERT, đơn hàng
  chỉ sinh từ `create_purchase_order` và hàm đó từ chối mọi đề nghị chưa ở bước "đã duyệt".
- ✅ `compare_quotations` — bảng so sánh **chuẩn hoá**: tiền hàng, hao hụt, thuế, vận chuyển quy
  về một tổng; thời hạn giao, điều kiện thanh toán, bảo hành để NGUYÊN, không quy thành tiền.
  Quy đổi được thì phần mềm đã ngầm chọn hộ nhà cung cấp — đúng thứ "Ranh giới KHÔNG làm" cấm.
  `select_quotation` bắt buộc nêu **căn cứ chọn** nếu báo giá được chọn không phải rẻ nhất (MH-04).
  → Chọn hàm CSDL thay vì endpoint Workers như BSD đặc tả: phép tính chỉ đọc dữ liệu sẵn có,
  nhưng phải chạy sau khi kiểm quyền xem giá vốn và ghi nhật ký truy cập (CLAUDE.md 3.1(c)).
- ✅ Công thức chuẩn hoá viết **hai lần** — `standardizeQuotationCost` (màn hình tính lại khi gõ)
  và SQL (con số đem lưu vào đơn hàng). Có test đối chiếu hai bản **khớp từng đồng**. Tỷ lệ lưu
  bằng **điểm cơ bản** (10% = 1000) để mọi phép nhân giữ nguyên `bigint`.
- ✅ **Chi phí gắn vào công trình ngay khi phát sinh** (KT-05, TC-05): lập đơn hàng cộng vào
  `project_budgets.committed_amount`; hàng về đến đâu `record_delivery` chuyển sang
  `actual_amount` đến đó theo tỷ lệ TIỀN HÀNG; hủy đơn hoàn lại đúng phần còn treo. Đây là thứ
  làm cột "đã cam kết" của màn hình Ngân sách công trình thôi bằng 0.
- ✅ `record_delivery` — kiểm đếm theo dòng, **không nhận vượt số đã đặt**, tách `quantity_ok` /
  `quantity_issue` (chỉ phần ĐẠT vào chi phí thực tế), hàng không đạt bắt buộc nói rõ kiểu gì
  (MH-07). Kho cũng ghi được, không riêng Mua hàng.
- ✅ `purchase_price_history` — lịch sử giá theo mã vật tư – NCC – ngày – hồ sơ áp dụng
  (MH-05 ↔ DA-05). CỐ Ý **chỉ đọc**, không tự ghi vào `unit_prices`: đơn giá dự toán tự đổi theo
  lần mua gần nhất là phần mềm tự quyết giá, thứ PRD 2.3 cấm.
- ✅ Bộ chứng từ chuyển thẳng Kế toán (MH-08): nhận đủ hàng thì KT/CFO nhận thông báo dẫn tới
  tab **Chứng từ** của đơn hàng. Đề nghị thanh toán sinh ra từ đó thuộc KT-01, làm ở 3D.
- ✅ **Nội dung thương thảo không hiển thị đại trà** (NEN-07): các báo giá KHÔNG được chọn chỉ mở
  cho vai trò xem được giá vốn; báo giá ĐÃ chọn thì mọi người có quyền xem MH đều thấy vì nó là
  một phần bộ chứng từ. `suppliers` là bảng DÙNG CHUNG, không có `company_id` — BSD 4.7 ghi RLS
  "A" nhưng chính dòng đó gọi nó là "danh mục dùng chung", **hai vế không thể cùng đúng**; theo
  BSD 2.2 và cách `customers` đã làm. → cần cập nhật tài liệu.
- ✅ Khoá ngoại còn nợ từ 0020 đã nối: `unit_prices.supplier_id` → `suppliers`.
- 🔒 Bốn chỗ do đợt rà soát trước khi commit tìm ra và đã bịt:
  - **Ranh giới pháp nhân**: policy INSERT cũ không kiểm hồ sơ nguồn, nên biết `uuid` một công
    trình NVO là gán được vào đề nghị NVC — và tiền đơn hàng sẽ cộng vào ngân sách pháp nhân
    khác. Nay đi qua `rls_purchase_source_matches_company`, kèm lưới an toàn thứ hai ở
    `purchase_request_budget_line` (`pb.company_id = pr.company_id`). Có test.
  - **Chạy đua giữa hai đợt giao**: `record_delivery` đọc `committed_to_budget` rồi tính phần
    chuyển sang chi phí thực tế dựa trên chính con số vừa đọc — thêm `FOR UPDATE` như
    `decide_approval` đã làm.
  - **Hủy đề nghị đang chờ duyệt** đóng hồ sơ phê duyệt bằng một câu UPDATE trần, để lại một
    đề nghị "bị từ chối" không ai đứng tên. Nay ghi kèm một dòng `approval_decisions`.
  - **Tiến độ giao hàng cộng số lượng khác đơn vị**: nhận đủ 5.000 con bulông trong khi 20 tấn
    thép chưa về hiện thành "99,6%". `deliveryProgress` nay đếm theo SỐ MẶT HÀNG đã nhận đủ.
- ⚠️ **Giả định chờ Haan xác nhận**: vai trò Mua hàng được mở **quyền đọc tối thiểu** phía Thi
  công — phần đầu hồ sơ công trình (mã, tên, địa chỉ) và danh sách mã chi phí (`site_cost_codes`,
  KHÔNG kèm số tiền). Không có nó thì màn hình của chính Phòng Mua hàng không gọi được tên công
  trình mà MH-01 bắt buộc ghi. Nhật ký, nghiệm thu, tổ đội, bảo hành và số liệu ngân sách vẫn
  đóng — chúng đi qua `rls_site_readable`, hàm này không đổi.
- ⏳ **CỐ Ý chưa làm**, không phải quên:
  - **MH-09** bảng giá khung / thoả thuận nguyên tắc — cần biết NVG thoả thuận theo tháng hay
    quý và cơ chế điều chỉnh giá; chưa có dữ liệu.
  - **MH-10** quy cách kỹ thuật nguyên liệu NVS (mác thép, dung sai, quy đổi kg/mét/tấm) —
    thuộc Module SX, mà Xưởng giàn giáo chưa có khảo sát trực tiếp (PRD 10).
  - **Tồn kho**: `record_delivery` mới dừng ở ghi nhận giao nhận + báo Kho. Việc cộng vào tồn
    chờ `inventory_items` ở 3C — chưa có bảng tồn để cập nhật.
  - Đính kèm tệp chứng từ (ảnh biên bản, bản chụp hoá đơn) — dùng lại bộ `documents` của NEN-05
    ở một lượt riêng, không dựng cơ chế thứ hai.

### 3C. Module KHO (BSD 4.8) ✅ xong

`materials` · `warehouses` · `inventory_items` · `stock_movements` + `stock_movement_items` ·
`stocktakes` + `stocktake_items` · `scaffolding_assets` + `scaffolding_events`

BSD 4.8 liệt kê 5 bảng, ở đây có 9. `materials` là danh mục mà KHO-02 bắt buộc ("một vật tư một
MÃ DUY NHẤT") — để tên/quy cách nằm trong từng dòng tồn kho thì cùng một cây thép bị mô tả lại
ở mỗi kho, đúng thứ KHO-02 cấm. 3 bảng còn lại là bảng dòng.

- ✅ **Sổ kho chỉ đổi qua phiếu.** `inventory_items` bị REVOKE INSERT/UPDATE/DELETE; mọi thay
  đổi tồn đi qua `write_stock_movement` (hàm nội bộ) và để lại một phiếu. Không có ràng buộc
  đó thì kiểm kê KHO-07 mất luôn cái để đối chiếu.
- ✅ **Không xuất quá tồn**, khoá dòng tồn bằng `FOR UPDATE` — hai người soạn hàng cùng lúc
  không cùng đọc một số tồn rồi cùng trừ.
- ✅ **Điều chuyển là MỘT việc** (KHO-05): giảm kho xuất và tăng kho nhận trong cùng giao dịch.
  Có test khẳng định điều chuyển vượt tồn không làm tăng kho nhận.
- ✅ **Kiểm kê khoá kho, điều chỉnh phải được duyệt trước** (KHO-07): mở đợt kiểm là chụp số
  sổ kho và tạm dừng nhập xuất; sổ chỉ đổi sau khi biên bản qua `approvals` +
  `decide_approval` (subject `stocktake_adjustment`, hạn mức Kho 10 triệu / CFO không giới
  hạn); và nó đổi bằng một PHIẾU điều chỉnh, không phải một câu UPDATE lặng lẽ.
- ✅ **Giàn giáo có vòng đời riêng** (KHO-06): tình trạng chỉ đổi qua `record_scaffolding_event`,
  mỗi lần đổi để lại một biên bản có số lượng, nguyên nhân và bên chịu trách nhiệm. Giàn giáo
  CỐ Ý không đi qua sổ tồn kho — cùng một đống giáo nêm nằm ở hai sổ là hai con số chắc chắn
  lệch nhau ngay lần đầu có hàng hỏng.
- ✅ **KHO-03 ↔ MH-07 đã nối**: `receive_from_delivery` nhập kho thẳng từ phiếu giao nhận, lấy
  đúng phần ĐẠT, không nhập lại số liệu. Một phiếu giao nhận chỉ nhập kho một lần.
- ✅ **KHO-09 phần chống ghi trùng**: `client_generated_id` duy nhất; gửi lại cùng một phiếu
  trả về đúng phiếu cũ thay vì báo lỗi (với người đứng ở kho, một thông báo đỏ sẽ khiến họ
  tưởng hàng chưa ghi và nhập tay lần nữa).
- ✅ Cảnh báo chủ động KHO-08: hết hàng · sắp hết (theo mức tối thiểu đặt được ngay trên dòng)
  · tồn lâu quá **90 ngày** (con số suy luận, cần chốt). Dòng có cảnh báo đẩy lên đầu danh sách.
- ✅ Màn hình quét mã ưu tiên di động (AFD 4.7) — máy quét cầm tay dùng được ngay.
- ⏳ **CỐ Ý chưa làm**, không phải quên:
  - **KHO-09 ngoại tuyến thật** (ghi được khi mất mạng, đồng bộ lại sau) — quyết định còn treo.
  - **Camera quét mã QR** — cần thư viện giải mã và quyền camera, mà cách hoạt động khi mất
    mạng phụ thuộc chính quyết định trên.
  - **KHO-10** lệnh sản xuất và hàng cho thuê — thuộc Module SX (3E), chưa khảo sát xưởng.
  - **Mua giàn giáo về ghi vào sổ tài sản** — hiện phải tạo lô tay ở màn hình Giàn giáo;
    nối tự động chờ khảo sát xưởng cùng KHO-10.
  - **Kiểm kê phát hiện hàng CHƯA có trong sổ** — hiện chỉ đối chiếu các dòng đã có tồn. Ghi
    nhận hàng lạ tìm thấy trong kho cần biết định giá nó thế nào, tức là chờ quyết định kế toán.
  - **Giá vốn xuất kho chính thức** (bình quân gia quyền, nhập trước xuất trước…) — phải khớp
    phần mềm kế toán, mà phần mềm đó chưa chốt. Hiện chỉ có `average_cost` tham khảo.

### 3D. Module KT (BSD 4.9) ✅ xong

`payment_requests` + `payment_request_allocations` + `payment_request_steps` · `advances` ·
`receivables_payables` + `receivable_settlements` · `cash_flow_plans` · `accounting_periods`

BSD 4.9 liệt kê 5 bảng, ở đây có 8 — 3 bảng thêm là bảng dòng/lịch sử của bảng đã có: phân bổ
chi phí (KT-05 cần phân bổ dùng chung, 1 cột `cost_code` không đủ), lịch sử từng bước (KT-02 cần
biết "chờ ai, quá hạn bao lâu"; BSD 2.3 cấm ghi đè), chứng từ thu/trả (KT-04 + HD-03 cần truy
ngược từng lần thu).

- ✅ Luồng duyệt chi **nhiều cấp** (KT-01): đề nghị → trưởng đơn vị → Kế toán kiểm tra → Trưởng Tài
  chính kiểm tra dòng tiền → duyệt theo hạn mức → phiếu chi → thực hiện chi → hạch toán.
  `advance_payment_step()` xử lý ba bước KIỂM TRA (không cần hạn mức); bước thứ tư đi qua Hộp thư
  Phê duyệt dùng chung và `decide_approval()` như mọi module khác.
- ✅ Mọi khoản gắn mã công ty/công trình/hạng mục/bộ phận + màn hình nói rõ **đang ở bước nào, chờ
  ai** (KT-02) ← giải trực tiếp vướng mắc #6.
- ✅ Gắn chi phí vào mã công trình **ngay khi phát sinh** (KT-05) — và **KHÔNG đếm hai lần**: hàng
  mua qua MH đã được `record_delivery` ghi vào ngân sách lúc hàng về, nên khoản chi cho chính đơn
  hàng đó chỉ là dòng tiền. Tạm ứng cũng chưa phải chi phí; chi phí hình thành lúc hoàn ứng.
- ✅ Tạm ứng (KT-03): khoản nợ sinh ra đúng lúc tiền ra, quá hạn chưa hoàn thì lần ứng sau bắt
  buộc nêu lý do và lý do đó hiện trước mắt người duyệt.
- ✅ Công nợ hai chiều + bảng tuổi nợ CẤU HÌNH ĐƯỢC (bảng `aging_buckets`, seed 30/60/90 — cùng
  quy tắc "không hard-code" của `approval_limits`, NEN-02). `contracts.collected_amount` chỉ đổi qua
  `record_receivable_settlement()` → phần "đã thu / còn phải thu" của HD-03 nay có số thật.
- ✅ `cash_flow_current()` (KT-06) — SECURITY INVOKER, RLS lọc trước khi cộng.
- ✅ `close_accounting_period()` / `reopen_accounting_period()` (KT-09): khóa kỳ là ràng buộc THẬT
  ở tầng CSDL, mở lại bắt buộc nêu nguyên nhân kèm người mở.
- ⏸ `POST /api/export/accounting-software` (KT-08) — **chặn bởi quyết định phần mềm kế toán**. Cột
  `posted_at`/`posted_reference` đã có để đánh dấu "đã chuyển"; định dạng xuất chờ NVG chốt MISA /
  AMIS / Fast.
- ⏸ KT-07 lãi/lỗ theo công trình — thuộc 3G (BC đầy đủ), đọc từ `project_budgets` + các bảng ở đây,
  không sinh thêm bảng.

⚠️ **Điểm SUY LUẬN cần Haan xác nhận với NVG**: KT-01 nói "xác nhận TRƯỞNG ĐƠN VỊ" nhưng hệ thống
chưa có cây tổ chức (thuộc Module NS, chưa dựng). Tạm hiểu "trưởng đơn vị" = người có quyền phê
duyệt trong module phát sinh khoản chi (`payment_requests.origin_module`). Khi NS có quan hệ quản
lý trực tiếp, thay điều kiện trong `rls_payment_step_actor` và không phải sửa chỗ nào khác.

### 3E. Module NS (BSD 4.10) ✅ xong

`employees` · `employment_contracts` · `hr_documents` · `timesheet_periods` +
`timesheet_entries` + `timesheets` + `timesheet_adjustments` · `leave_requests` ·
`payroll_adjustments` · `recruitment_positions` + `recruitment_candidates` ·
`assets` + `asset_events` · `hr_checklists` + `hr_checklist_items` · `labor_workers`

BSD 4.10 liệt kê 6 bảng, ở đây có 16 — không bảng nào mới, tất cả là bảng dòng/lịch sử/hồ sơ mà
NS-01→NS-11 đòi: giấy tờ có hạn (NS-10), kỳ+ngày công+tổng hợp+điều chỉnh sau chốt (NS-04 tách
4 thứ), biên bản tài sản (NS-08, 5 loại), checklist tiếp nhận/bàn giao (NS-03, NS-11), ứng viên
(NS-02 Kanban), lao động thời vụ (NS-09 — khác `subcontractors` của TC-06, đó là hồ sơ khoán việc).

- ✅ **Lương, căn cước, sức khỏe, kỷ luật thu hồi quyền đọc ở tầng CỘT** (PRD NS ranh giới,
  NEN-07): `select=*` trên `employees` bị CSDL từ chối; đọc qua `employee_salary` /
  `employee_personal_details`, mỗi lượt ghi `sensitive_access_logs`. Sửa cũng ghi, bằng
  trigger — chờ ứng dụng gọi hàm ghi nhật ký thì chỉ cần một màn hình quên gọi là mất dấu.
  Hai nhóm quyền TÁCH nhau: `salary` (có Kế toán) và `personal` (không có Kế toán).
- ✅ Chấm công **3 khối** (NS-04): mỗi khối một kỳ riêng vì ba người xác nhận khác nhau;
  chốt kỳ chỉ chạy khi **cả ba khối** đã được trưởng đơn vị xác nhận — HCNS là đầu mối tổng
  hợp, không phải người ký thay.
- ✅ `consolidate_timesheets()` = `POST /api/timesheets/consolidate` (BSD 4.10), làm bằng hàm
  CSDL theo quy tắc chọn lớp ở CLAUDE.md 3.1. Chốt xong Kế toán nhận số liệu, **không nhập lại**.
- ✅ **Điều chỉnh sau khi chốt bắt buộc nêu lý do và ghi tên người phê duyệt** (`adjust_timesheet`,
  bảng `timesheet_adjustments`) — nguyên văn NS-04. Số cũ không biến mất khỏi hệ thống.
- ✅ "Nghỉ có phép" phải có **đơn nghỉ đã duyệt phủ đúng ngày đó** (NS-05). Không có đơn thì
  CSDL từ chối — đó là cách một ngày nghỉ không phép lặng lẽ thành có phép lúc tính lương.
- ✅ `offboard_employee()` = `POST /api/employees/:id/offboard`: checklist bàn giao gồm **đúng
  những tài sản người đó đang giữ** (NS-08), không phải một dòng "thu hồi tài sản" chung chung.
- ✅ Tài sản đổi người giữ/tình trạng **chỉ qua biên bản** `record_asset_event` — năm loại của NS-08.
- ✅ Nhắc hạn giấy tờ 90/60/30/7 ngày (`scan_hr_document_reminders`, NS-10 → NEN-04), không
  nhắc lại cùng một mốc (CGD 3.4). Hàm dành cho tác vụ nền, thu hồi quyền gọi từ trình duyệt.
- ✅ Tuyển dụng (NS-02): yêu cầu tuyển đi qua **Hộp thư Phê duyệt dùng chung**
  (`approval_subject = 'recruitment_position'`), ứng viên đi qua Kanban, nhận việc thì sinh
  hồ sơ nhân sự + checklist tiếp nhận mà không gõ lại tên.
- ⏸ NS-06 công thức lương — **chặn bởi quy chế lương** (PRD Mục 10). Ở đây chỉ có HÌNH THỨC
  trả lương và số công đã chốt; không có bảng lương, không có công thức, không có số tiền
  lương tính ra.
- ⏸ Nhập khẩu tệp máy chấm công — `timesheet_entries.source` đã đánh dấu dòng nào từ máy,
  dòng nào nhập tay; đọc tệp là việc của giao diện, không sinh bảng mới. PRD Mục 9 ghi rõ hệ
  thống KHÔNG thay thế máy/phần mềm chấm công.

⚠️ **Điểm SUY LUẬN cần Haan xác nhận với NVG** (đã ghi vào CLAUDE.md 6.6):

- Ai là "trưởng đơn vị" xác nhận bảng công của từng khối — tạm lấy người có quyền `approve`
  trên phân hệ phụ trách khối (công trường → TC, hai khối còn lại → NS). Cùng vướng mắc với
  bước 1 của luồng duyệt chi KT-01, và sẽ được giải cùng lúc khi có cây tổ chức.
- **8 giờ = một ngày công** (Bộ luật Lao động 2019 Điều 105) — xưởng có thể tính ca 12 giờ.
- Ai duyệt **yêu cầu tuyển dụng** — tạm đặt Tổng Giám đốc vì tăng biên chế là quyết định
  ngân sách của cả công ty.

⚠️ `employees`: BSD 3.3 ghi Mẫu D, BSD 4.10 ghi Mẫu B → theo 4.10 (**B**), và **cột lương vẫn
hạn chế theo cột như D**. Kế toán đọc được DÒNG hồ sơ (tên, khối) vì họ phải đối chiếu bảng
công đã chốt — nhưng không đọc được căn cước, sức khỏe, kỷ luật.

### 3F. Module SX (BSD 4.12) — mức cơ bản ✅ SX-03 xong, SX-01 chỉ khung

`production_orders` · `material_consumption` · `rental_agreements` · `rental_agreement_items` (thêm —
SX-03 đòi doanh thu/hiệu suất "theo NHÓM tài sản", một hợp đồng thuê thường gồm nhiều mã giàn giáo).

- ✅ `create_rental_agreement` — lập hợp đồng VÀ chuyển đúng lô `scaffolding_assets` sang vị trí
  "khách đang thuê" trong CÙNG một giao dịch (không có bước "tạo hợp đồng rồi xuất kho sau").
  Chỉ xuất từ lô tình trạng **"còn dùng được"** — lô "mới" coi như Kho chưa phân loại sẵn sàng
  cho thuê (⚠️ giả định cần Haan xác nhận, cùng nhóm với các giả định KHO-06 khác).
- ✅ `return_rental_agreement` = `POST /api/rental-agreements/:id/return` — thu hồi, tách phần
  ĐẠT (gộp lại lô "còn dùng được" ở kho) / HƯ HỎNG (lô "hỏng chờ sửa" riêng + để lại biên bản
  `scaffolding_events`, KHO-06) / MẤT (rời sổ, để lại biên bản có bên chịu trách nhiệm), tính
  doanh thu theo SỐ NGÀY ĐÃ THUÊ THẬT và tổng bồi thường, ghi một lần khi đóng hợp đồng. Một lần
  gọi phải khai đủ MỌI loại giàn giáo đã thuê — thiếu một dòng thì cả giao dịch rollback, không
  đóng hợp đồng dở dang.
- ✅ **Hai khách thuê cùng một loại giàn giáo không gộp chung lô**: thêm cột
  `scaffolding_assets.current_rental_agreement_id` (khai kiểu `uuid` trơn ở `kho.ts`, không
  `.references()`, để tránh vòng phụ thuộc `kho.ts ↔ sx.ts` — FK thật khai bằng SQL tay ở
  migration RLS của SX, giống cách `design_projects.construction_site_id` từng làm trước khi
  Module TC tồn tại). Có test khẳng định thu hồi hợp đồng A không đụng lô của hợp đồng B.
- ✅ SX-01 (`production_orders` + `material_consumption`) — CRUD cơ bản, KHÔNG có định mức tiêu
  hao chuẩn, kế hoạch sản xuất theo tổ hay công thức giá thành. Trạng thái đổi bằng ô chọn trực
  tiếp, chưa có luồng chuyển bước ràng buộc — PRD ghi thẳng "cần xác nhận thêm" (SX-02 giá thành
  CỐ Ý chưa làm gì cả, chờ khảo sát Xưởng).
- ⚠️ **Giả định cần Haan xác nhận**: ai vận hành module — tạm cấp quyền `SX: WORK` cho vai trò
  **Kho** (họ đã quản lý vòng đời vật lý giàn giáo qua KHO-06, xem `db/src/seed/data.ts`), chờ
  khảo sát Xưởng giàn giáo NVS để biết vai trò thật sự đứng ra cho thuê.
- ⏳ **CỐ Ý chưa làm**, không phải quên: luồng "hủy hợp đồng trước khi thu hồi" (enum `huy` có
  sẵn nhưng chưa có hàm/nút) — BSD chỉ đặc tả đúng một endpoint thu hồi, chưa rõ nghiệp vụ hủy
  thật sự cần gì.

### 3G. Module BC — đầy đủ — ⏳ BC-01/BC-02/BC-03 (một phần)/BC-05 xong, BC-04/BC-06/BC-07 chưa làm

- ✅ **BC-02 — Báo cáo lãi/lỗ theo công trình** (`/bc/lai-lo`, hàm `project_profit_loss` —
  `db/migrations/0056_bc_profit_loss.sql`). KHÔNG sinh bảng mới: đọc trực tiếp
  `project_budgets` (đã có sẵn dòng `cost_group = 'loi_nhuan'` = lãi/lỗ DỰ KIẾN từ lúc lập
  ngân sách, DA-09) + `contracts.value`/`collected_amount` (doanh thu). Ba con số: dự kiến,
  thực tế tới hiện tại (doanh thu − đã phát sinh), dự kiến khi hoàn thành (trừ thêm phần
  ngân sách còn lại giả định sẽ chi hết). Mẫu D — chặn CẢ HÀM bằng `rls_sees_sensitive('profit')`
  giống `estimate_cost_breakdown`, không che từng cột. **Truy ngược chứng từ gốc**: bấm tên
  công trình → thẳng tab Ngân sách của TC-05 (`BudgetPanel` có sẵn, không dựng lại). Test:
  `db/src/__tests__/bc.test.ts`. Đã xác nhận qua giao diện thật (đăng nhập TGĐ thấy đủ số,
  đăng nhập Kế toán — không có quyền `profit` — nhận đúng thông báo vượt quyền, không phải
  bảng trống).
- ✅ Thẻ liên kết nhanh "Lãi/lỗ theo công trình" trên Dashboard (BC-01), dẫn thẳng tới BC-02 —
  nằm sau thẻ "Quá hạn", chỉ hiện với vai trò có `BC: view` (gần như mọi vai trò).
- ✅ **Xuất Excel cho BC-02** — thực chất là CSV có BOM UTF-8 (Excel mở đúng tiếng Việt có
  dấu), KHÔNG phải file `.xlsx` thật. Nút vẫn ghi "Xuất Excel" theo đúng `BUTTONS.exportExcel`
  đã có sẵn trong `@nvg/shared/content` — người dùng không phân biệt được khác gì.
- ✅ **Bốn thẻ BC-01 còn thiếu đã ghép vào Dashboard**: Dòng tiền (`useCashFlow`), Công nợ phải
  thu (`useReceivables`), Giàn giáo đang cho thuê (`useRentalAgreements`), Chấm công đã chốt
  (`useTimesheets`) — dùng thẳng hook của từng màn hình chi tiết, KHÔNG dựng endpoint tổng hợp
  riêng, để con số trên thẻ không bao giờ lệch với danh sách nó dẫn tới. Mỗi thẻ ẩn hoàn toàn
  khi vai trò không có quyền module tương ứng (`KT`/`SX`/`NS`).
- ✅ **BC-05 đầy đủ — thẻ "Quá hạn" nay gộp CẢ bốn nguồn rủi ro** thay vì chỉ 4 module gốc: hồ
  sơ quá hạn theo module (CRM/DA/TK/HD), công nợ phải thu đã quá hạn thu (KT), phê duyệt bị "để
  lâu" — quá `PENDING_APPROVAL_AGING_DAYS` (3 ngày, ⚠️ giả định cần Haan xác nhận, xem
  `shared/src/bc.ts`) kể từ lúc gửi, và **công trình vượt ngân sách**. Phần vượt ngân sách dùng
  hàm CSDL mới `sites_budget_status` (`db/migrations/0058_bc_over_budget.sql`) — tổng hợp chi
  phí CẢ danh sách công trình trong MỘT lượt gọi (cùng khuôn `costs` CTE với `project_profit_loss`,
  loại dòng `loi_nhuan`), tránh N+1 mà `useSiteBudgetStatus` (đòi biết trước site_id) gặp phải.
  Trình duyệt tự tính `health` bằng `summarizeBudget()` — cùng công thức/ngưỡng 90% với
  `BudgetPanel` (TC-05), không tính lại. Thẻ dẫn tới `/tc/cong-trinh?ngan-sach=vuot` — danh sách
  Công trình (TC-01) nay có thêm cột + bộ lọc "Ngân sách" dùng ĐÚNG hook đó, nên con số trên thẻ
  và trên danh sách không thể lệch nhau. Test: `shared/src/__tests__/bc.test.ts`,
  `db/src/__tests__/bc.test.ts`, `web/src/pages/__tests__/dashboard.test.tsx`.
- ⏳ **CHƯA LÀM**: `GET /api/dashboard/executive` dạng một-lần-gọi (BC-01 hiện vẫn là nhiều hook
  riêng lẻ, không phải một endpoint tổng hợp — chấp nhận được ở quy mô demo, cân nhắc lại nếu
  Dashboard chậm thật).
- ✅ **BC-03 (ba phần đầu) — Báo cáo hiệu quả kinh doanh** (`/bc/hieu-qua-kinh-doanh`, hàm
  `opportunity_funnel_by_source` + `bidding_outcomes` — `db/migrations/0059_bc_sales_effectiveness.sql`).
  Không phải Mẫu D (không phải giá vốn/lương/lợi nhuận) — chặn bằng `auth_can_view_module('BC')`
  như `sites_budget_status`, không có sensitivity gate. Hai hàm trả DÒNG THÔ đã gộp nhóm; trình
  duyệt tự pivot bằng `summarizeOpportunitiesBySource`/`summarizeOpportunityFunnel`/
  `summarizeBiddingOutcomes` (shared/src/bc.ts) ra ba phần: nguồn khách (tổng số cơ hội + đã ký
  - tỷ lệ chuyển đổi + giá trị theo từng nguồn), phễu bán hàng (đếm theo GIAI ĐOẠN HIỆN TẠI —
    đơn giản hoá có chủ ý, không phải chuyển đổi luỹ tiến qua `opportunity_stage_history`), tỷ lệ
    trúng thầu + nguyên nhân trượt thầu (chỉ tính gói thầu đã CÓ KẾT QUẢ). Test:
    `shared/src/__tests__/bc.test.ts`, `db/src/__tests__/bc.test.ts`. Thẻ liên kết nhanh trên
    Dashboard, cạnh thẻ Lãi/lỗ. Thêm `BcNav` (điều hướng phụ giữa hai báo cáo BC) — dùng lại cho
    cả `/bc/lai-lo`. **Xuất Excel** (CSV BOM UTF-8, cùng khuôn BC-02) gộp CẢ BA phần vào một tệp
    — ba khối cách nhau một dòng trống, vì đây là một báo cáo có ba lát cắt, không phải ba báo
    cáo độc lập cần ba nút riêng.
- ⏳ **CỐ Ý CHƯA LÀM — BC-03 phần 4 "hiệu suất nhân sự/tổ đội/nhà cung cấp"**: PRD không nói rõ
  đo bằng gì (tổ đội thi công — TC chưa có bảng phân công; nhà cung cấp — MH chưa có sổ đánh
  giá). Làm ẩu sẽ tạo "bảng xếp hạng nhân sự" không có cơ sở, đúng thứ CLAUDE.md 5.1 cấm. Cần
  hỏi lại Haan trước khi thêm — xem ghi chú đầu `db/migrations/0059_bc_sales_effectiveness.sql`.
- ⏳ **CHƯA LÀM**: BC-04 (tồn kho/hao hụt/giá thành SX — mục này đã nằm trong danh sách CÓ THỂ
  CẮT, xem "Thứ tự cắt giảm"), BC-07 (báo cáo tổng hợp toàn NVG truy ngược xuống pháp nhân/phòng
  ban — một phần đã có qua "Toàn NVG" + cột Pháp nhân).
- ⏳ **CHƯA LÀM**: xuất PDF (mọi báo cáo) và "hiện mức độ đầy đủ dữ liệu" (BC-06) ngoài phần
  Dashboard đã có sẵn từ Phase 2E.
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

#### ⚠️ Tách môi trường — việc BẮT BUỘC trước go-live, chưa làm

Hiện chỉ có **một** project Supabase (`awaiwegmuykhctnysvou`): máy phát triển và bản chạy thử
công khai `nvg.tests99.workers.dev` dùng chung nó. Đã kiểm ngày 27/08/2026 bằng cách đối chiếu
chunk `auth-*.js` của bản đang chạy với `.env`. Haan chốt giữ nguyên tới lúc go-live.

**Hạn chót: trước khi NVG nhập dòng dữ liệu thật đầu tiên.** Chừng nào chưa tách, một lượt
`npm test` là chạm vào CSDL của bản đang chạy — mà `cleanupTestData` xoá CỨNG.

Bốn bước, theo đúng thứ tự:

1. Tạo project Supabase thứ hai (production). Giữ project cũ làm `dev`.
2. Chạy `npm run db:migrate` rồi `npm run db:seed` lên project mới — **kiểm bằng số bảng thật**
   trong `information_schema`, đừng tin dòng "Hoàn tất" (xem bẫy `_journal.json` ở IPD/memory).
3. Đổi `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` trong **build variables của trigger
   production** trên Cloudflare Workers Builds. ⚠️ Phải sửa qua Builds API
   (`PATCH /accounts/{acct}/builds/triggers/{uuid}/environment_variables`) với token
   **user-scoped** có quyền `Workers Builds Configuration: Edit` — `wrangler` không có lệnh
   nào làm việc này, và token account-scoped bị từ chối. Trigger preview giữ project dev.
4. Trỏ `.env` ở máy về project **dev**, rồi xác minh bằng cách grep host Supabase trong chunk
   `auth-*.js` của bản đã deploy — không phải `index-*.js`, và đừng dừng ở "build pass":
   biến `VITE_` rỗng làm trắng màn hình mà build vẫn xanh.

Sau khi tách xong thì mục "xác nhận sao lưu trước migration production (IPD 5.4)" mới có nghĩa
và trở lại thành điều kiện bắt buộc của mỗi lần migrate.

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

| Lớp                              | Yêu cầu      | Công nghệ (PRD đã chốt)                                                                                      |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| L1 Requirement Intelligence      | TK-10        | Gemini Flash + bộ quy tắc kiến trúc nhà ở đã hệ thống hoá sẵn                                                |
| L2 Functional Programming        | TK-11        | Gemini Flash + quy tắc diện tích/quan hệ phòng chuẩn                                                         |
| L3 Floor Plan + Re-design        | TK-12, TK-13 | **Thuật toán ràng buộc TỰ XÂY (TypeScript, Workers)** — Gemini chỉ diễn giải tác động bằng ngôn ngữ tự nhiên |
| L4 Architecture Generation       | TK-14        | Thư viện mẫu kiến trúc dựng sẵn + Gemini chọn/phối theo phong cách                                           |
| L5 Parametric 3D + Visualization | TK-15, TK-16 | **Three.js** (dựng thủ tục, không gọi AI) + Gemini 2.5 Flash Image dùng ảnh 3D làm tham chiếu                |

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

| Việc                          | Nhịp                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| **Test RLS**                  | Mỗi bảng mới → thêm test ngay, không để cuối                 |
| **Seed data**                 | Mỗi module mới → bổ sung dữ liệu thật tương ứng              |
| **E2E Golden Path**           | Viết trước (đỏ), làm cho xanh dần qua các phase              |
| **Cập nhật CLAUDE.md**        | Khi có quyết định mới hoặc tài liệu được cập nhật            |
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

| #   | Quyết định                                                                                                                                                                                                                                                                  | Chặn                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | **KHO-09 offline-first** làm thật hay online-first + `client_generated_id`?                                                                                                                                                                                                 | Phase 3C                                                               |
| 2   | **Phần mềm kế toán** chính thức (KT-08)                                                                                                                                                                                                                                     | Phase 3D (endpoint export)                                             |
| 3   | **`unit_prices` dùng chung** DA/TK/MH hay NVO cần bảng riêng? (BSD 5)                                                                                                                                                                                                       | Phase 2B                                                               |
| 4   | **Quy tắc mã hoá** dự án/công trình/vật tư/hợp đồng — dùng bộ nào?                                                                                                                                                                                                          | Phase 2A                                                               |
| 5   | **Hạn mức phê duyệt** tạm thời cụ thể theo vai trò × loại nghiệp vụ                                                                                                                                                                                                         | Phase 0.2 (seed)                                                       |
| 6   | **Công thức lương** NS-06                                                                                                                                                                                                                                                   | Phase 3E                                                               |
| 7   | **Đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5)                                                                                                                                                                                                                      | Phase 4C                                                               |
| 8   | **Một hợp đồng mở được nhiều công trình không?** Hiện chặn ở một, để tránh bấm hai lần thành hai công trình chia nhau một bộ ngân sách                                                                                                                                      | Phase 3A (đã làm, đổi được bằng một tham số)                           |
| 9   | **Ba con số suy luận của TC**: cửa sổ sửa nhật ký 24 giờ · ngưỡng cảnh báo ngân sách 90% · thang đánh giá tổ đội 1–5                                                                                                                                                        | Phase 3A (đã làm, sửa ở một chỗ)                                       |
| 10  | **Công trường đo tiến độ thế nào** (theo khối lượng, theo đầu việc, theo mũi thi công?) — quyết định luôn cả kế hoạch tiến độ chi tiết của TC-01                                                                                                                            | Phase 3A phần còn lại                                                  |
| 11  | **Một đề nghị mua có được đặt hàng nhiều nhà cung cấp không?** Hiện một đề nghị → một đơn hàng. Đề nghị 20 mặt hàng mà mỗi nhóm hàng một nhà cung cấp thì phải tách thành nhiều đề nghị                                                                                     | Phase 3B (đã làm, mở rộng được)                                        |
| 12  | **Ai ký nhận hàng tại công trường** — Kho, chỉ huy trưởng, hay cả hai? Hiện mở cho Mua hàng và Kho                                                                                                                                                                          | Phase 3B (đã làm, sửa ở một hàm)                                       |
| 13  | **Bảng giá khung MH-09** — NVG thoả thuận theo tháng hay quý, điều chỉnh giá báo trước bao lâu?                                                                                                                                                                             | Chặn MH-09                                                             |
| 14  | **Vật tư mua sẵn về kho chung rồi mới xuất cho công trình thì ghi chi phí lúc nào?** Mua theo đề nghị gắn công trình đã ghi khi hàng về (MH-07); còn hàng từ kho chung hiện KHÔNG về được ngân sách công trình nào. Đây là quyết định kế toán, không phải lựa chọn kỹ thuật | Phase 3C (khoảng trống thật, chưa lấp)                                 |
| 15  | **Ngưỡng "tồn lâu, chậm luân chuyển" 90 ngày** — đang lấy bằng một quý cho khớp chu kỳ kiểm kê                                                                                                                                                                              | Phase 3C (đã làm, sửa ở một chỗ)                                       |
| 16  | **Kho tự duyệt được chênh lệch kiểm kê tới 10 triệu** — theo hạn mức mặc định. Kho vừa đếm vừa duyệt là một chốt kiểm soát yếu, cần xác nhận NVG muốn vậy                                                                                                                   | Phase 3C (đổi bằng cấu hình `approval_limits`)                         |
| 17  | **"Trưởng đơn vị" xác nhận công từng khối là ai?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                           | Phase 3E (đã làm, sửa ở `confirm_timesheet_period`)                    |
| 18  | **Một ngày công bằng bao nhiêu giờ?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                        | Phase 3E (đã làm, hằng số ở `@nvg/shared/ns` + SQL, có test đối chiếu) |
| 19  | **Ai duyệt yêu cầu tuyển dụng?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                             | Phase 3E (đã làm, đổi bằng cấu hình `approval_limits`)                 |
| 20  | **Kế toán được đọc hồ sơ nhân sự tới đâu?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                  | Phase 3E (đã làm, sửa ở `rls_employee_readable`)                       |
| 21  | **Ai vận hành Module SX?** — chi tiết + giả định tạm ở 3F                                                                                                                                                                                                                   | Phase 3F (đã làm, đổi ở `db/src/seed/data.ts`)                         |
| 22  | **Lô giàn giáo "mới" cho thuê được ngay không?** — chi tiết + giả định tạm ở 3F                                                                                                                                                                                             | Phase 3F (đã làm, sửa điều kiện `condition` trong hàm)                 |
