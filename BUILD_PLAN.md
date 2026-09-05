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

## ⚠️ ĐỌC TRƯỚC — phạm vi đã NỞ RA sau bộ tài liệu v1.4 (05/09/2026)

Phase 0 → 4 dưới đây được viết theo **PRD v1.3**. Bộ tài liệu cập nhật ngày 05/09/2026 (sau khi có đủ
11 phiếu khảo sát / 10 bộ phận) đã **thay toàn bộ** phạm vi của hai module:

| Module | Cũ (PRD v1.3)                         | Mới (PRD v1.4)                                                              | Hiện trạng mã nguồn                  |
| ------ | ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| **TC** | TC-01 → TC-08                         | **TC-01 → TC-20** (~28 bảng theo BSD v1.1 4.6)                              | 6 bảng — phủ phần lõi của phạm vi CŨ |
| **SX** | SX-01 → SX-03, "GĐ 3, mức định hướng" | **SX-01 → SX-22** (~29 bảng theo BSD v1.1 4.12), **"GĐ 2, phạm vi đầy đủ"** | 4 bảng — phủ phần lõi của phạm vi CŨ |

**Vì vậy: các dấu ✅ ở Phase 3A và 3F đúng với phạm vi CŨ, không đúng với phạm vi MỚI.** Đừng đọc chúng
như "module đã xong". Phần còn thiếu nằm ở **Phase 6** cuối tài liệu này.

Đợt 05/09/2026 đã làm xong **nền tảng xuyên suốt** (migration `0110` → `0117`): trạng thái thứ sáu
`disputed`, `system_parameters` + lịch sử (NEN-12), `sla_definitions` + đồng hồ hạn xử lý trên Hộp thư
Phê duyệt, mẫu RLS **E** + `user_site_assignments` + vai trò `CHT`, bộ ba cột đồng bộ hiện trường, quy
tắc bất biến chứng từ đã ký, câu chuẩn "Chưa đủ dữ liệu". **Không đụng vào 42 yêu cầu TC/SX mới.**

Bản đối chiếu TRƯỚC–SAU đầy đủ: `doc/CHANGELOG_NVG_docs.md`.

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

### 1.4 Hạ tầng thông báo & việc cần làm (NEN-03, NEN-04) — ⏳ Trung tâm Thông báo xong (Phase 3G), `tasks` chưa dùng

- ✅ `notifications` · `audit_logs` · `sensitive_access_logs` — có bảng, có ghi, có đọc.
- ✅ Helper `create_notification()` (`db/migrations/0021_da_rls.sql`, SECURITY DEFINER — bảng
  `notifications` không cho INSERT trực tiếp từ trình duyệt, NEN-03) đã được **8 module gọi ở
  36 chỗ** (bàn giao, cảnh báo vượt ngân sách, nhắc phê duyệt để lâu…) từ rất sớm trong dự án —
  nhưng cho tới Phase 3G, KHÔNG có màn hình nào đọc lại bảng đó: nút chuông ở Top Bar chỉ là
  một nút chết (không `onClick`, không đếm, không panel). Đã bịt ở Phase 3G:
  `web/src/hooks/use-notifications.ts` (đọc/đánh dấu đã đọc, RLS Mẫu B tự lọc đúng người) +
  `web/src/components/layout/notification-bell.tsx` (panel thả xuống, huy hiệu đếm CHƯA đọc,
  bấm một dòng vừa đánh dấu đã đọc vừa điều hướng tới `action_url`, có "Đánh dấu tất cả đã đọc").
  Test: `web/src/components/layout/__tests__/top-bar.test.tsx`.
- ⏳ **CHƯA dùng Supabase Realtime** — dùng tạm `refetchInterval: 60s`. Bảng `notifications`
  chưa được thêm vào publication `supabase_realtime`, và đây sẽ là lần đầu dùng cơ chế đó
  trong dự án (chưa có tiền lệ để soi) — cố ý lùi lại, không phải quên.
- 🚫 **`tasks` — bảng có sẵn từ Phase 0 nhưng CHƯA từng được ghi hay đọc ở bất kỳ đâu.** Không
  có hàm `create_task()`, không migration nào INSERT vào bảng này, không hook/màn hình nào đọc
  nó. "Việc cần làm" ở Top Bar hiện trỏ vào `usePendingApprovals()` (Hộp thư Phê duyệt) — đủ
  dùng cho luồng phê duyệt, nhưng KHÔNG phải mọi việc cần làm đều là một lượt phê duyệt (ví dụ
  "giấy tờ nhân sự sắp hết hạn" hiện chỉ SINH RA một `notification`, không sinh `task`, nên
  không ai "xử lý xong" được nó theo đúng nghĩa AFD 5.4 — chỉ đọc rồi biết vậy). Cần quyết định:
  bỏ hẳn bảng `tasks` (dùng notifications + entity's own trạng thái là đủ) hay thật sự dùng nó
  cho việc không gắn với phê duyệt — hỏi Haan trước khi chọn một bên.

### 1.5 Tìm kiếm toàn hệ thống (AFD 5.3) — ✅ xong, phủ đủ 10/10 module có "hồ sơ" (Phase 4A)

Hàm CSDL `global_search` (`db/migrations/0057_global_search.sql`), gọi thẳng qua PostgREST RPC
— không qua Workers, vì đây chỉ là một truy vấn đọc trên bảng đã có RLS (CLAUDE.md 3.1). Gộp
kết quả theo module, tối đa 5/nhóm, khớp đầu MÃ ưu tiên trước khớp trong tên. SECURITY INVOKER
— không tự kiểm quyền module, dựa hẳn vào RLS của từng bảng nguồn (test:
`db/src/__tests__/search.test.ts`, khẳng định NVO không tìm thấy hồ sơ của NVC). Ô tìm kiếm ở
Top Bar (`web/src/components/layout/top-bar.tsx`) nay gọi thật, có debounce 300ms, gộp theo
module và bấm vào là sang thẳng chi tiết.

⚠️ **Không phải `tsvector` full-text như phác thảo gốc** — dùng ILIKE, đủ nhanh ở quy mô demo;
nâng cấp sau nếu chậm thật (xem ghi chú đầu file migration).

**Đăng ký ban đầu sáu bảng trung tâm** (customers, opportunities, bidding_projects,
design_projects, contracts, construction_sites) — **Phase 4A mở rộng thêm năm bảng**
(`db/migrations/0061_global_search_more_modules.sql`), đúng ghi chú "đăng ký dần" ban đầu:
`purchase_requests`/`suppliers` (MH), `payment_requests` (KT), `employees` (NS),
`rental_agreements` (SX) — nâng độ phủ từ 6 lên 9/12 module có "hồ sơ" tìm được (NEN là cấu
hình hệ thống, BC là báo cáo tổng hợp, cả hai không có hồ sơ để tìm; KHO CHƯA thêm vì các màn
hình Kho chưa có route `:id` để dẫn thẳng tới — thêm vào sẽ ra kết quả không có chỗ để bấm).
Cột chọn cố ý tránh cột nhạy cảm: `employees` chỉ lấy `code`/`full_name`/`position`, KHÔNG đụng
lương/căn cước/sức khỏe; `payment_requests` chỉ lấy `code`/`title`, KHÔNG lấy `amount`. Test
thêm cho nhánh RLS khó nhất (`employees_select` gộp nhiều điều kiện, không phải Mẫu A trơn):
HCNS thấy được, Kinh doanh cùng pháp nhân nhưng không liên quan thì không — xác nhận cả qua
`db/src/__tests__/search.test.ts` (chạy trên CSDL thật) lẫn qua browser thật.

**Đợt ba (`db/migrations/0070_global_search_kho.sql`) — nối nốt Module KHO**, module cuối
cùng còn thiếu trong 10 module có "hồ sơ" để tìm (NEN/BC không có, không tính). Ba màn hình
Kho (`materials`, `stocktakes`, `scaffolding_assets`) chưa có trang chi tiết riêng — thay vì
dựng một mẫu bố cục thứ 8 (CLAUDE.md 4.6 cấm), kết quả tìm kiếm trỏ THẲNG về màn hình danh
sách kèm query param mà chính màn hình đó đọc để tự lọc/tự mở đúng dòng: `?ma=<mã>` cho
`/kho/vat-tu` (đọc trong `MaterialListPage`, giống cách `query` local state đã lọc theo mã/
tên/quy cách), `?mo=<id>` cho `/kho/kiem-ke` và `/kho/gian-giao` (đọc để khởi tạo `openId`,
mở sẵn đúng dòng đang mở rộng — cùng khuôn `StockMovementPage` đã đọc `?loai=`/`?vat-tu=` từ
trước). Không có cột nhạy cảm nào ở ba bảng này (giá vốn nằm ở cột khác, đã khoá riêng từ 0064) nên không cần `rls_sees_sensitive`. `warehouses` và `inventory_items` cố ý KHÔNG nối —
`warehouses` là danh mục vị trí ít khi tra theo mã, `inventory_items` là dòng tồn theo từng
cặp (vật tư, kho) chứ không phải một "hồ sơ" độc lập, tra đúng qua vật tư đã đủ. Test:
`db/src/__tests__/search.test.ts` (thêm 3 ca: vật tư dùng chung, giàn giáo tôn trọng Mẫu A
theo pháp nhân, đợt kiểm kê).

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
- ✅ **MH-07 — Ban công trường ký nhận được hàng giao thẳng tới chân công trình**
  (migration 0106, theo khảo sát 02/09/2026: "thủ kho/người được giao phối hợp với kỹ thuật
  kiểm tra… Hai bên ký giao nhận"). Mở HẸP: chỉ với đề nghị mua có gắn công trình — hàng mua
  cho văn phòng hay cho gói thầu vẫn chỉ Mua hàng và Kho ký được. Có test cả hai chiều.

#### Khảo sát Chỉ huy – Giám sát công trường đã về (02/09/2026) — còn gì phải làm

Module KHÔNG còn ở mức ĐỊNH HƯỚNG. Phần dưới đây là **khoảng trống thật đã được xác nhận**,
không còn là phỏng đoán. Xếp theo đúng thứ tự ưu tiên mà người điền phiếu tự nêu.

- ⏳ **Ưu tiên 1 người dùng tự nêu — luồng đề nghị công trường ↔ văn phòng có người tiếp nhận,
  thời hạn và cảnh báo quá hạn.** Nguyên văn: "Mỗi yêu cầu về vật tư, bản vẽ, nghiệm thu, phát
  sinh, tổ đội, thanh toán hoặc hỗ trợ kỹ thuật phải được lập ngay tại hiện trường; có người
  tiếp nhận, người phê duyệt, thời hạn xử lý, trạng thái đang chờ và cảnh báo quá hạn."
  → Đây chính là bảng `tasks` bỏ trống từ Phase 0 (câu hỏi 23). Khảo sát vừa cho nó một lý do
  tồn tại rõ ràng: Hộp thư Phê duyệt phủ được vật tư và thanh toán, KHÔNG phủ được "chờ văn
  phòng trả lời bản vẽ" — thứ đang làm công trường phải gọi nhắc nhiều lần.
  → Cảnh báo trong phiếu, phải chép vào bất kỳ thiết kế nào: "nếu chỉ yêu cầu công trường cập
  nhật nhưng các phòng ban không xử lý trên cùng hệ thống thì phần mềm không giải quyết được
  điểm nghẽn."
- ⏳ **Quản lý phiên bản bản vẽ ĐANG CÓ HIỆU LỰC ở hiện trường.** Vướng mắc số 1 của bộ phận, và
  là nguyên nhân lần làm lại gần nhất ("thi công theo bản vẽ đang lưu tại hiện trường, sau đó
  phát hiện đã có điều chỉnh mà công trường chưa nhận được bản cập nhật"). Hệ `documents` +
  `document_versions` của NEN-05 đã có sẵn cơ chế phiên bản — việc còn lại là gắn nó vào Chi
  tiết Công trình và bắt buộc xác nhận đúng bản vẽ trước khi giao việc. **Không dựng cơ chế
  phiên bản thứ hai.**
- ⏳ **Bảng xác nhận khối lượng tổ đội / nhà thầu phụ.** Tổ đội thanh toán theo **khối lượng
  hoàn thành × đơn giá hợp đồng**; kỹ thuật hiện trường đo bóc, chỉ huy trưởng kiểm tra, Phòng
  Thi công/Dự án kiểm tra rồi mới chuyển Kế toán. "Khối lượng chưa đạt chất lượng, chưa nghiệm
  thu hoặc chưa đủ hồ sơ chưa được tính thanh toán" — đây là ràng buộc, không phải quy trình
  giấy tờ. Bảng này cũng là thứ mở khoá BC-03 phần 4 (hiệu suất tổ đội).
- ⏳ **Danh sách tồn tại (punch list) và theo dõi sửa lỗi**, **phiếu yêu cầu làm rõ kỹ thuật
  (RFI)**, **hồ sơ an toàn lao động** (đào tạo, cấp phát bảo hộ, biên bản vi phạm, sự cố và
  tình huống suýt tai nạn). Cả ba đều nằm trong danh sách biểu mẫu đang dùng hằng ngày.
- ⏳ Kế hoạch tiến độ chi tiết (phần còn lại của TC-01) — khảo sát cho biết đo **theo hạng
  mục/đầu việc**, xác nhận bằng khối lượng đã nghiệm thu; còn thiếu mức chi tiết (theo tuần
  hay theo mũi thi công) và ai cập nhật % hoàn thành. Xem câu hỏi 10.
- ⏳ Lịch sử đánh giá tổ đội theo từng đợt (TC-06) — hiện giữ đánh giá gần nhất, các lần trước
  vẫn truy được qua `audit_logs`.
- ⏳ Ảnh hiện trường mới là cột `photo_urls`, chưa có màn hình tải ảnh. Phiếu đòi thêm: ảnh phải
  **tự ghi thời gian, vị trí và hạng mục**.
- ⚠️ Ba con số suy luận vẫn CHƯA được khảo sát trả lời: cửa sổ sửa nhật ký **24 giờ**, ngưỡng
  cảnh báo ngân sách **90%**, thang đánh giá tổ đội **1–5**. Chỉ có con số 24 giờ được ủng hộ
  gián tiếp (báo cáo ngày phải gửi trước 20 giờ tối).

**Hai ràng buộc trải nghiệm phải tôn trọng, do người dùng tự đặt ra:**

1. **Tối đa 10–20 phút nhập liệu mỗi ngày** (câu hỏi trong phiếu hỏi thẳng, người điền chọn
   "10–20 phút"; phần tự do còn siết hơn: "nhập liệu trong khoảng 5–10 phút mỗi ngày"). Mọi
   màn hình công trường phải đo được bằng thước này, không phải bằng số trường đã có.
2. **Điều kiện hiện trường tốt hơn giả định ban đầu**: sóng mạng "ổn định", văn phòng công
   trường "đủ" chỗ ngồi, máy tính, máy in/scan. → Offline-first cho TC KHÔNG cấp thiết (khác
   với Kho và Xưởng, nơi phiếu ghi mạng "đôi lúc không ổn định"). Vẫn cần bố cục di động thật
   vì thao tác chính diễn ra khi đang đi lại trên công trường.

- ✅ **Tab "Hồ sơ – Bản vẽ" ở Chi tiết Công trình** (04/09/2026) — vướng mắc số MỘT của khảo
  sát công trường. Dùng lại `documents` + `document_versions` (NEN-05/NEN-06), **không dựng cơ
  chế phiên bản thứ hai**: cùng bộ mà bản vẽ thiết kế (TK-05), dự toán (DA-06) và hợp đồng
  (HD-01) đang dùng. Bản đang hiệu lực đứng riêng và nói rõ **bằng chữ**; bản cũ gập lại, mang
  chữ "Không còn hiệu lực" — nhìn nhầm bản cũ chính là nguyên nhân lần tháo dỡ làm lại mà
  phiếu kể. Nguyên nhân thay đổi bắt buộc từ bản thứ hai, do CSDL giữ chứ không do màn hình.
  Tab đứng ngay sau Nhật ký: phải biết bản nào đang dùng TRƯỚC khi giao việc cho tổ đội.
  → ⏳ Tải tệp thật lên Supabase Storage vẫn chưa làm — hiện ghi nhận đường dẫn, đúng cách
  `version-panel` của Module Thiết kế đang làm. Cơ chế phiên bản chạy đúng từ bây giờ.

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
- ✅ **Khối xưởng tách khỏi nhánh HCNS** (migration 0106, khảo sát Xưởng 02/09/2026: "người phụ
  trách xưởng chốt bảng công và sản lượng, Phó Giám đốc xác nhận"). Ánh xạ khối → phân hệ nay
  gói trong `timesheet_block_module`: công trường → TC, xưởng → SX, văn phòng → NS. Kèm theo:
  Xưởng đọc được hồ sơ nhân sự và dòng công của khối mình (ghi mà không đọc lại được thì màn
  hình chấm công vô dụng) — mở đúng bằng phạm vi chỉ huy công trường đã có, cột lương vẫn khuất.
- 🔒 **Hai lỗi tìm ra khi làm việc trên**: (1) `confirm_timesheet_period` không tính
  `sees_all_companies`, nên Ban Giám đốc và Tổng Giám đốc — vốn được gán vào mã tổng hợp NVG —
  không xác nhận được bảng công của bất kỳ pháp nhân nào (đúng bẫy CLAUDE.md 3.5); (2) thông báo
  "chờ xác nhận" gửi theo MÃ VAI TRÒ, trùng khớp một cách tình cờ với hai khối cũ và sai hẳn với
  khối xưởng. Nay gửi theo đúng điều kiện `confirm_timesheet_period` dùng để cho phép ký, và
  bằng `EXISTS` chứ không nối bảng — nối bảng thì người được gán nhiều pháp nhân nhận bốn thông
  báo giống hệt nhau.
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

### 3F. Module SX (BSD 4.12) — ✅ SX-03 xong, SX-01 chỉ khung, SX-02 chưa làm

`production_orders` · `material_consumption` · `rental_agreements` · `rental_agreement_items` (thêm —
SX-03 đòi doanh thu/hiệu suất "theo NHÓM tài sản", một hợp đồng thuê thường gồm nhiều mã giàn giáo).

- ✅ `create_rental_agreement` — lập hợp đồng VÀ chuyển đúng lô `scaffolding_assets` sang vị trí
  "khách đang thuê" trong CÙNG một giao dịch (không có bước "tạo hợp đồng rồi xuất kho sau").
  Xuất từ lô **"còn dùng được" và "mới"**, ưu tiên hàng đã qua sử dụng trước để giữ hàng mới
  cho khách yêu cầu hàng mới; lô giao cho khách GIỮ NGUYÊN tình trạng của lô nguồn. Giả định
  cũ ("lô mới coi như chưa phân loại xong") đã bị khảo sát bác: dây chuyền kết thúc bằng
  "kiểm tra thành phẩm → đếm, bó kiện, dán nhận diện → lập phiếu nhập kho thành phẩm"
  (migration 0106, câu hỏi 22 đã đóng).
- ✅ `return_rental_agreement` = `POST /api/rental-agreements/:id/return` — thu hồi, tách phần
  ĐẠT (gộp lại lô "còn dùng được" ở kho) / HƯ HỎNG (lô "hỏng chờ sửa" riêng + để lại biên bản
  `scaffolding_events`, KHO-06) / MẤT (rời sổ, để lại biên bản có bên chịu trách nhiệm), tính
  doanh thu theo SỐ NGÀY ĐÃ THUÊ THẬT và tổng bồi thường.
- ✅ **Thu hồi NHIỀU ĐỢT** (migration 0106) — mỗi lần gọi ghi nhận một đợt trả, doanh thu và bồi
  thường **cộng dồn**, số ngày tính riêng cho từng đợt (ngày bắt đầu thuê → ngày trả của đợt
  đó), hợp đồng chỉ đóng khi mọi dòng đã trả hết. Bản trước bắt khai đủ MỌI loại trong một lần
  gọi — đúng với giả định "khách trả một lần", sai với thực tế mà khảo sát mô tả: "Nếu khách
  giao hoặc trả nhiều lần, tiền thuê phải tính riêng theo từng đợt hoặc theo số dư hằng ngày."
  Bất biến giữ nguyên: một dòng khai sai (trả vượt số còn lại) thì cả đợt rollback, kể cả các
  dòng hợp lệ trong cùng lời gọi.
- 🔒 **Lỗi tìm ra khi làm việc trên**: một dòng thuê gom hàng từ nhiều lô kho thì bên khách cũng
  thành nhiều lô (`create_rental_agreement` sinh một lô cho mỗi lô nguồn), nhưng bản thu hồi cũ
  chỉ lấy lô ĐẦU TIÊN rồi báo "Lô giàn giáo đang ghi ở bên thuê không đủ để trả" — khách trả đủ
  hàng mà hệ thống từ chối. Có sẵn từ trước, cho phép xuất cả lô "mới" chỉ làm nó dễ gặp hơn
  hẳn. Nay trừ dần qua từng lô; có test.
- ✅ **Hai khách thuê cùng một loại giàn giáo không gộp chung lô**: thêm cột
  `scaffolding_assets.current_rental_agreement_id` (khai kiểu `uuid` trơn ở `kho.ts`, không
  `.references()`, để tránh vòng phụ thuộc `kho.ts ↔ sx.ts` — FK thật khai bằng SQL tay ở
  migration RLS của SX, giống cách `design_projects.construction_site_id` từng làm trước khi
  Module TC tồn tại). Có test khẳng định thu hồi hợp đồng A không đụng lô của hợp đồng B.
- ✅ SX-01 (`production_orders` + `material_consumption`) — CRUD cơ bản, KHÔNG có định mức tiêu
  hao chuẩn, kế hoạch sản xuất theo tổ hay công thức giá thành. Trạng thái đổi bằng ô chọn trực
  tiếp, chưa có luồng chuyển bước ràng buộc — PRD ghi thẳng "cần xác nhận thêm" (SX-02 giá thành
  CỐ Ý chưa làm gì cả, chờ khảo sát Xưởng).
- ✅ **Ai vận hành module — câu hỏi 21 đã đóng.** Thêm vai trò thứ 13 `SX` "Xưởng sản xuất –
  Cho thuê" (migration 0105, `@nvg/shared/roles`, `db/src/seed/data.ts`). Kho **giữ** `SX: WORK`
  vì chính họ kiểm đếm và bàn giao lô hàng, nhưng không còn là vai trò duy nhất. Vai trò mới
  KHÔNG có `approve` — mọi biểu mẫu xưởng trong phiếu đều ghi người duyệt là "Phó Giám
  đốc/Ban Giám đốc", và BGĐ đã sẵn có `SX: xem + phê duyệt`.
- ⏳ **CỐ Ý chưa làm**, không phải quên: luồng "hủy hợp đồng trước khi thu hồi" (enum `huy` có
  sẵn nhưng chưa có hàm/nút) — BSD chỉ đặc tả đúng một endpoint thu hồi, chưa rõ nghiệp vụ hủy
  thật sự cần gì.

#### Khảo sát Xưởng sản xuất giàn giáo đã về (02/09/2026) — còn gì phải làm

Module KHÔNG còn ở mức ĐỊNH HƯỚNG. Thứ tự dưới đây là **đúng thứ tự người điền phiếu tự xếp**:
"Sau khi quản lý ổn định dòng tài sản này mới mở rộng sâu sang kế hoạch sản xuất, định mức
nguyên vật liệu, năng suất, chất lượng và giá thành."

- ⏳ **Ưu tiên 1 — vòng đời tài sản giàn giáo phải khép kín và tra được tức thời.** Nguyên văn:
  "sản xuất mới → nhập kho → bán hoặc cho thuê → giao cho khách hàng/công trình → giao thêm
  hoặc trả bớt → thu hồi → kiểm đếm → phân loại tốt, thiếu, hỏng → sửa chữa → nhập lại kho".
  Đã có: xuất, thu hồi nhiều đợt, tách đạt/hỏng/mất, lô riêng theo hợp đồng.
  Còn thiếu ba mắt xích:
  - **Giao thêm giữa kỳ** — mỗi đợt giao có ngày bắt đầu tính thuê riêng, nên cần bảng đợt
    giao chứ không nhét thêm vào `rental_agreement_items` được. Xem câu hỏi 26.
  - **Biên bản thu hồi từng đợt** có chữ ký hai bên và hình ảnh ("lập biên bản có chữ ký và
    hình ảnh nếu có thiếu hoặc hư hỏng"). Hiện đợt trả chỉ để lại con số cộng dồn trên
    `rental_agreement_items` cộng `scaffolding_events` cho phần hỏng/mất — **không có bản ghi
    ngày tháng của riêng đợt đó**, nên tranh chấp thì không dựng lại được.
  - ~~Sửa chữa hàng thu hồi rồi nhập lại kho~~ — **đã có sẵn, ghi nhầm là thiếu**:
    `record_scaffolding_event` với `event_type = 'sua_chua'` và tình trạng sau sửa
    `con_dung_duoc` chuyển đúng số lượng từ lô "hỏng chờ sửa" sang lô dùng được, gộp vào lô
    cùng vật tư – tình trạng – vị trí, và để lại biên bản (KHO-06, migration 0039/0079).
    Màn hình Giàn giáo đã có sẵn thao tác này. Kiểm lại trước khi dựng cái thứ hai.
- ⏳ **Ưu tiên 2 — SX-01 đủ nghĩa.** Hiện chỉ CRUD. Phiếu đòi lệnh sản xuất phải có "mã sản
  phẩm, quy cách, số lượng, thời hạn và người duyệt", và **thay đổi phải lập phiên bản mới**
  ghi rõ nội dung thay đổi, thời điểm, người xác nhận — vì đây đúng là nguyên nhân lần làm lại
  gần nhất của xưởng. Trạng thái hiện đổi bằng ô chọn trực tiếp, chưa có luồng chuyển bước.
- ⏳ **Ưu tiên 3 — định mức nguyên vật liệu (BOM) có phiên bản**, rồi mới tới **SX-02 giá thành**.
  Phiếu mô tả đủ cấu phần giá thành (vật tư trực tiếp theo định mức × giá mua thực tế, nhân
  công trực tiếp, vật tư phụ và năng lượng, khấu hao/sửa chữa máy, chi phí quản lý xưởng, gia
  công ngoài, phế phẩm và hao hụt) và yêu cầu **phân biệt giá thành KẾ HOẠCH với giá thành
  THỰC TẾ** — hai con số, không phải một.
- ⏳ **Ghi nhận lỗi theo sản phẩm – công đoạn – người thực hiện – nguyên nhân** (phiếu nói thẳng
  là cần), **sổ máy móc và bảo dưỡng**.
- ⚠️ **Chặn bởi dữ liệu, không bởi mã**: catalogue sản phẩm giàn giáo chưa có ("phần này anh
  gửi catalogue"), định mức chưa biết ai giữ, tỷ lệ lỗi và giá trị thất thoát chưa thống kê.
  Phiếu ghi rõ **"không nên ước lượng một con số để điền"** — đừng tự đặt giá trị mặc định.
  Xem CLAUDE.md 6.6.
- ⚠️ **Điều kiện triển khai người dùng tự nêu, ảnh hưởng thứ tự làm việc**: phải chốt số dư
  ban đầu và thống nhất mã sản phẩm/quy cách/đơn vị tính trước khi chạy; thao tác được trên
  điện thoại, quét mã QR, đính kèm ảnh; **mạng ở xưởng "đôi lúc không ổn định"** — khác công
  trường, nên đây mới là chỗ offline thật sự có giá trị (cùng nhóm với KHO-09, câu hỏi 1).

### 3G. Module BC — đầy đủ — ✅ BC-01/BC-02/BC-03 (một phần)/BC-05/BC-06/BC-07 xong, ⏳ BC-04 chưa làm

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
- ✅ **BC-07 — BC-03 nay cũng truy ngược được xuống pháp nhân khi xem "Toàn NVG"**
  (`db/migrations/0060_bc_sales_effectiveness_by_company.sql`). BC-02 đã làm việc này từ 0056
  (mỗi dòng vốn là một công trình, chỉ cần thêm cột); BC-03 khác — hai hàm nguồn
  (`opportunity_funnel_by_source`, `bidding_outcomes`) GỘP theo nhóm ngay ở CSDL, nên gọi với
  `p_company_id = NULL` sẽ trộn lẫn số liệu ba pháp nhân vào cùng một dòng nếu không có cột
  `company_id` để tách lại — DROP + CREATE lại (không REPLACE được vì đổi tập cột trả về). Thêm
  bảng "Theo pháp nhân — BC-07" (`CompanyBreakdownSection`, `sales-effectiveness.tsx`), CHỈ hiện
  khi `scope.isAggregate` — gọi lại ĐÚNG `summarizeOpportunitiesBySource`/`summarizeBiddingOutcomes`
  trên tập con dòng thô của từng pháp nhân, không tính công thức riêng. Cả CSV và PDF cũng thêm
  đúng phần này. Test: `db/src/__tests__/bc.test.ts` (khẳng định `company_id` có trong dòng trả
  về từ CSDL thật), `shared/src/__tests__/bc.test.ts`. Xác nhận qua browser thật: "Toàn NVG" hiện
  bảng ba pháp nhân, chọn một pháp nhân cụ thể thì bảng tự ẩn, không lỗi console.
- ⏳ **CHƯA LÀM**: BC-04 (tồn kho/hao hụt/giá thành SX — mục này đã nằm trong danh sách CÓ THỂ
  CẮT, xem "Thứ tự cắt giảm").
- ✅ **BC-06 phần xuất PDF** — nút "Xuất PDF" trên cả hai báo cáo (BC-02, BC-03), mở CỬA SỔ IN
  riêng (`web/src/lib/print-report.ts`) rồi gọi `window.print()` — người dùng chọn đích "Lưu
  dưới dạng PDF" ở hộp thoại in, không phải file `.pdf` tự tải xuống. CỐ Ý không dùng thư viện
  dựng PDF (jsPDF…): font mặc định của các thư viện đó thiếu glyph tiếng Việt có dấu, phải tự
  nhúng font base64 mới đúng — đúng loại rủi ro CLAUDE.md 4.1 đã cảnh báo (chữ do một tầng khác
  sinh ra, không kiểm được bằng cách đọc mã nguồn). Cửa sổ in dùng font hệ thống nên không có
  khâu nhúng font nào có thể sai. Cũng CỐ Ý không phủ `@media print` lên App Shell — tránh phải
  làm print-safe cho sidebar/top bar dùng chung mọi màn hình chỉ để phục vụ hai trang báo cáo.
  Test: `web/src/lib/__tests__/print-report.test.ts` (mock `window.open`, không gọi `print()`
  thật trong môi trường test/tự động — hộp thoại in là dialog có thể chặn thao tác tiếp theo,
  giống `window.confirm`, nên không kiểm bằng browser tự động, chỉ kiểm nút hiện đúng chỗ).
- ✅ **BC-06 phần "ngày cập nhật gần nhất" + "mức độ hoàn thiện dữ liệu"** —
  `web/src/pages/bc/report-meta.tsx`, dùng chung cho cả hai báo cáo. `ReportFreshness` hiện
  "Dữ liệu tính đến {giờ}" lấy từ `dataUpdatedAt` của TanStack Query — báo cáo đọc CSDL trực
  tiếp mỗi lần mở (không có `report_snapshots`), nên thời điểm truy vấn vừa chạy xong CHÍNH LÀ
  "ngày cập nhật gần nhất", không cần cột riêng nào để lưu. `ReportIncompleteNote` nói THẲNG
  trên màn hình BC-03 rằng phần thứ tư "hiệu suất nhân sự/tổ đội/nhà cung cấp" chưa đo được —
  trước đây chỉ có trong ghi chú mã nguồn, người xem báo cáo không biết là báo cáo CHƯA đủ bốn
  phần như PRD liệt kê, dễ tưởng nhầm ba phần đang có là toàn bộ báo cáo. Cùng nguyên tắc với
  `DataCompletenessNote` của Dashboard (Phase 2E) — không dựng thẻ 0 khi thật ra là "chưa đo
  được". Xác nhận qua browser thật (TGĐ, cả hai trang), không lỗi console, không tràn ngang.
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

### 4A. Hồ sơ 360° đầy đủ (AFD 5.1–5.2) — ✅ xong (tìm kiếm còn 9/12 module, xem 1.5)

- ✅ **Panel ngữ cảnh hiển thị đủ liên kết cho 7 thực thể trung tâm** — cả 7 (customers,
  opportunities, bidding_projects, design_projects, contracts, construction_sites, và các hồ
  sơ khác qua `related`) đều đã dùng `EntityDetail`/panel `related` (BSD 2.1). Hai trang KHÔNG
  có panel (`production-order-detail.tsx`, `supplier-detail.tsx` phần tổng quan) là ĐÚNG —
  `production_orders` không có khoá ngoại tới thực thể trung tâm nào để mà liên kết
  (BUILD_PLAN 3F), không phải thiếu sót.
- ✅ **Mọi trường tham chiếu là liên kết bấm được** — rà toàn bộ 14 trang "Hồ sơ 360°", sửa
  10 trường còn hiện chữ tĩnh dù đã có sẵn `id` để liên kết: Đối tác (HD), Khách hàng (CRM cơ
  hội/khiếu nại, TK, DA gói thầu), Khách thuê + Công trình nhận (SX cho thuê), Công trình (MH
  đề nghị mua), Nhà cung cấp (MH đơn hàng, KT đề nghị chi), và mã đơn hàng trong tab "Lịch sử
  giao dịch" của trang Nhà cung cấp. Hai chỗ CỐ Ý chưa sửa vì thiếu dữ liệu để liên kết tới,
  không phải bỏ sót: "Quản lý trực tiếp" (NS, `users` không có màn hình chi tiết riêng) và "Dự
  toán đã duyệt" trong panel liên quan của Hợp đồng (chưa có màn hình chi tiết dự toán độc
  lập, dự toán nằm trong tab của DA/TK).
- ✅ **Breadcrumb phản ánh đường đi thực tế** — `EntityDetail` đọc `location.state.from`
  (`web/src/components/entity/entity-detail.tsx`): mọi link trong panel "Hồ sơ liên quan"
  (`RelatedGroups`) đính kèm `state: { from: { label: <hồ sơ hiện tại>, to: <URL hiện tại> } }`
  khi điều hướng; trang đích thay mắt xích module mặc định bằng đúng hồ sơ vừa đến từ. Vào
  thẳng bằng URL hoặc tải lại trang thì không có `state`, breadcrumb quay về mặc định (bản
  cũ, vẫn đúng — chỉ là không biết đường đi). Test:
  `web/src/components/entity/__tests__/entity-detail.test.tsx` (ba ca: mặc định khi không có
  state, ghi đè đúng khi có, và link thực sự đính kèm đúng state khi bấm). Xác nhận qua browser
  thật: từ Công trình bấm sang Hợp đồng nguồn, breadcrumb hiện "Nhà xưởng Khu công nghiệp Demo
  › Hợp đồng thi công Nhà xưởng Demo"; tải lại cùng trang thì breadcrumb quay về "Hợp đồng ›
  …". CHỈ áp dụng cho link trong panel ngữ cảnh (nơi AFD 5.2 nêu ví dụ) — chưa mở rộng sang kết
  quả tìm kiếm toàn hệ thống hay các link khác, có thể làm thêm sau nếu cần.
- ✅ **Mở tab mới bằng chuột giữa luôn hoạt động** — rà soát mọi nơi điều hướng tới một hồ sơ cụ
  thể (EntityTable, Kanban, Dashboard, panel liên quan, Hộp thư Phê duyệt) đều đã dùng `<Link>`
  từ trước. Một chỗ sai duy nhất tìm được: nút "Mở hợp đồng" (`draft-contract-button.tsx`) dùng
  `onClick={() => navigate(...)}` — đã sửa sang `<Button asChild><Link to=…>`.

### 4B. Rà soát phân quyền toàn hệ thống — ✅ đợt 1+2+3+4 xong (kể cả boq_items/unit_prices/view BC, export sạch, và business logic ~101 hàm ghi dữ liệu)

- ✅ **Đợt 1 — khoá `EXECUTE` cho vai trò `anon` ở tầng HÀM** (`db/migrations/0062_lock_down_anon_functions.sql`).
  Chạy `mcp__supabase__get_advisors` (loại security) phát hiện 145/168 hàm — gồm cả hàm
  SECURITY DEFINER ghi dữ liệu như `advance_payment_step`, `adjust_timesheet` — vẫn cho phép
  `anon` (chưa đăng nhập) gọi qua `/rest/v1/rpc/...`, dù `0001_rls_foundation.sql` đã nói rõ ý
  đồ "anon không đọc được bảng nghiệp vụ nào" và REVOKE ALL trên 57 bảng — ý đồ đó **chưa bao
  giờ áp dụng cho HÀM**: Postgres mặc định cấp EXECUTE cho `PUBLIC` (kéo theo cả `anon`) lúc
  tạo hàm, và chỉ 9/168 hàm được REVOKE tay. Không phải lỗ hổng khai thác được ngay (đọc thân
  hàm xác nhận mọi hàm SECURITY DEFINER ghi dữ liệu đều mở đầu bằng
  `IF auth_user_id() IS NULL THEN RAISE EXCEPTION` chặn `anon` ngay dòng đầu) nhưng là khoảng
  hở phòng thủ nhiều lớp — đã đóng bằng cách REVOKE khỏi `PUBLIC` (không phải `anon` — thử
  REVOKE trực tiếp từ `anon` trước, không ăn thua, vì quyền hiện tại nằm ở dòng cấp cho
  `PUBLIC` chứ không phải một dòng cấp riêng cho `anon`) rồi CẤP LẠI đúng tập hàm
  `authenticated` đang gọi được (chụp lại TRƯỚC khi revoke) — không đổi bất kỳ hành vi nào cho
  người đã đăng nhập. Đặt `ALTER DEFAULT PRIVILEGES` để hàm tạo sau này không tự mở lại cho
  `PUBLIC` — **từ nay mọi hàm RPC người dùng gọi phải tự thêm
  `GRANT EXECUTE ... TO authenticated`**, đúng khuôn `global_search` đã làm sẵn.
  Tiện thể vá `function_search_path_mutable` cho `global_search`/`attach_audit_touch` (thiếu
  `SET search_path = public`, lệch quy ước có từ `0002`).
- ✅ **Phát hiện phụ, đã xác nhận từng hàm và sửa nốt 1 chỗ hồi quy** — rà lại 9 hàm nội bộ
  từng có `REVOKE ... FROM authenticated` ở migration cũ (`build_budget_lines`,
  `close_stocktake`, `quotation_goods_subtotal`, `quotation_landed_total`,
  `purchase_request_budget_line`, `scan_hr_document_reminders`, `post_payment_to_budget`,
  `payment_allocated_total`, `kt_period_locked`) bằng `has_function_privilege` sau khi đợt 1
  chạy xong. 6/9 đã đúng ý đồ — chưa từng có `PUBLIC` access thật (REVOKE cũ vẫn đứng vững):
  `build_budget_lines`, `quotation_goods_subtotal`, `quotation_landed_total`,
  `purchase_request_budget_line`, `post_payment_to_budget`, `payment_allocated_total`.
  `close_stocktake` và `kt_period_locked` mở cho `authenticated` là ĐÚNG Ý ĐỒ gốc
  (`close_stocktake` gọi thẳng từ Frontend — `web/src/hooks/use-warehouse.ts`;
  `kt_period_locked` migration gốc chỉ `REVOKE ... FROM anon`, chưa từng định chặn
  `authenticated`). Riêng **`scan_hr_document_reminders` là hồi quy thật do chính đợt 1 gây
  ra**: hàm này có comment + `REVOKE EXECUTE ... FROM authenticated, anon` tường minh từ
  `0049` ("chỉ tác vụ nền gọi; không mở cho trình duyệt để không ai bắn lại loạt thông báo cho
  cả công ty"), nhưng vì quyền đó trước giờ đến từ `PUBLIC` (đúng lỗi ngữ nghĩa đợt 1 vừa vá
  cho 144 hàm khác), REVOKE cũ chưa từng có hiệu lực — đợt 1 chụp "authenticated gọi được" =
  true nên vô tình CẤP LẠI, giữ nguyên đúng lỗ hổng migration gốc định vá. Không phải rò rỉ dữ
  liệu Mẫu D, nhưng bất kỳ ai đăng nhập gọi thẳng được tác vụ vốn chỉ dành cho Cloudflare Cron
  Trigger, gây "nhàm cảnh báo" (CGD 3.4). Vá bằng `db/migrations/0065_fix_hr_reminder_scan_regrant.sql`
  (REVOKE lại đúng câu gốc), xác nhận qua `has_function_privilege` + `get_advisors` (hàm không
  còn xuất hiện trong `authenticated_security_definer_function_executable`). Test canh:
  `db/src/__tests__/ns.test.ts` ("người đã đăng nhập KHÔNG gọi được
  scan_hr_document_reminders").
- ✅ **Đợt 2 — đối chiếu RLS policy thật với mẫu A/B/C/D của BSD 4.1→4.12**, đọc hết cả tài
  liệu lẫn `pg_policies` của 90 bảng có RLS. Không phát hiện lỗ hổng phân quyền nào được xác
  nhận chắc chắn — mọi bảng trung tâm đều khớp đúng mẫu, kể cả nhánh khó nhất
  (`employees`/`estimates`/`employment_contracts` dùng **column-level GRANT/REVOKE** của
  Postgres — cơ chế TÁCH BIỆT với RLS — để khoá cột nhạy cảm, xác nhận qua
  `has_column_privilege`, không chỉ đọc `pg_policies`). `record_sequences` là bảng RLS-không-
  policy duy nhất, đúng ý đồ (chỉ ghi qua hàm SECURITY DEFINER).
  - ✅ **Đã khoá** — Haan xác nhận 28/08/2026: khoá `inventory_items.average_cost` và
    `stock_movement_items.unit_cost` giống giá vốn dự toán
    (`db/migrations/0064_lock_down_inventory_cost.sql`). Hai cách khác nhau vì cách dùng ở
    Frontend khác nhau: `average_cost` CÓ hiển thị (tổng "Giá trị ước tính" ở trang Tồn kho)
    nên có hàm riêng `inventory_items_cost` (khuôn `purchase_price_history` — trả cả danh
    sách, ghi MỘT lượt log cho cả đợt xem, không phải một dòng mỗi mặt hàng); `unit_cost` của
    `stock_movement_items` KHÔNG hề hiển thị ở đâu (tải về rồi bỏ không) nên chỉ cần khoá cột
    và bỏ khỏi câu truy vấn Frontend, không cần hàm riêng. Vai trò không đủ quyền vẫn thấy
    toàn bộ tồn kho bình thường, chỉ riêng dòng "Giá trị ước tính" đổi thành ghi chú ai xem
    được. Test: `db/src/__tests__/kho.test.ts` (Thủ kho bị chặn cả SELECT thẳng lẫn gọi hàm,
    Ban Giám đốc/Tài chính gọi hàm được).
  - Ghi chú diễn giải (không phải lỗi): `quotes`/`contracts`/`contract_amendments` BSD gắn nhãn
    Mẫu C nhưng bảng gốc dùng RLS kiểu A/B — phần hạn mức C nằm ở bảng `approvals` hợp nhất khi
    hồ sơ "gửi phê duyệt". Đây là kiến trúc đúng (hồ sơ cần nhìn thấy lúc đang soạn, không chỉ
    lúc chờ duyệt), chỉ khác cách đọc literal nhãn BSD.
- ✅ **Xuất báo cáo không lộ dữ liệu nhạy cảm** — toàn bộ app chỉ có ĐÚNG hai đường "xuất":
  `web/src/pages/bc/profit-loss.tsx` và `web/src/pages/bc/sales-effectiveness.tsx`, cả hai qua
  chung `openPrintReport()` (`web/src/lib/print-report.ts` — mở cửa sổ in riêng rồi
  `window.print()`, không có `.xlsx`/CSV tự tải nào trong repo). Cả hai chỉ chuyển thẳng dữ
  liệu ĐÃ hiện trên màn hình thành HTML để in — không truy vấn thêm gì riêng cho việc xuất, nên
  kế thừa đúng nguyên trạng khoá quyền của trang: `profit-loss.tsx` đọc qua hàm
  `project_profit_loss` (chặn cả hàm cho vai trò không có quyền `profit`, lỗi ngay từ bước tải
  dữ liệu chứ không phải lúc xuất); `sales-effectiveness.tsx` không đụng cột Mẫu D nào (đã ghi
  chú sẵn trong file). Không cần sửa gì — chỉ xác nhận và ghi lại ở đây.
- ✅ **Đợt 3 — rà source code của mọi RPC ghi dữ liệu, đúng lớp lỗi vừa lộ ra ở
  `budget_overrun_alert`** (0067) — hàm đúng ý đồ RLS/GRANT nhưng logic BÊN TRONG hàm tự làm
  sai (không phải điều đợt 1/đợt 2 bắt được, vì đó là hai lớp khác: quyền EXECUTE và policy
  RLS). Soát 35/35 điểm gọi `create_notification` theo mẫu "báo cả nhóm vai trò" và mọi hàm
  chạm cột Mẫu D — không phải đọc tuần tự cả ~80 hàm ghi dữ liệu, mà tìm đúng hai chữ ký lỗi:
  (a) lọc cứng `company_id` cộng với vai trò có `sees_all_companies`, (b) trả cột nhạy cảm mà
  không qua `rls_sees_sensitive`/`log_sensitive_access`. Tìm thêm 3 chỗ, vá cùng
  `db/migrations/0068_fix_cfo_notifications_and_budget_cost_leak.sql`:
  - **`record_delivery`** (MH-08) và **`record_acceptance`** (TC-04) — cùng lỗi hệt
    `budget_overrun_alert`: báo `('KT', 'CFO')` nhưng lọc cứng `company_id`, CFO không bao giờ
    nhận được thông báo "bộ chứng từ sẵn sàng thanh toán" / "đủ căn cứ thu tiền". Vá cùng mẫu
    `OR r.sees_all_companies` + `SELECT DISTINCT`. Test: thêm khẳng định CFO nhận đúng 1 thông
    báo vào `db/src/__tests__/mh.test.ts` và `tc.test.ts` (cạnh khẳng định Kế toán đã có sẵn).
  - **`construction_budget_status`** (TC-05) — khác lớp, không phải thông báo mà là RÒ RỈ giá
    vốn: hàm chỉ khoá riêng dòng `loi_nhuan` sau `rls_sees_sensitive('profit')`, các dòng chi
    phí còn lại (vật tư, nhân công, máy móc, thầu phụ, chi phí chung, dự phòng) trả cho BẤT KỲ
    ai xem được module TC, không qua `rls_sees_sensitive('cost')` như mọi nơi khác đang khoá
    giá vốn, và không ghi `sensitive_access_logs`. Vai trò NS được cấp `TC: VIEW` (để xác nhận
    chấm công công trường) nên đọc được đầy đủ ngân sách công trình dù không nằm trong danh
    sách CLAUDE.md 6.6 cho phép xem giá vốn. `web/src/hooks/use-construction-sites.ts` đã có
    sẵn chú thích đúng ý đồ Mẫu D cho dòng lợi nhuận nhưng người viết chỉ áp cho lợi nhuận, bỏ
    sót các dòng chi phí — vá cho khớp đúng ý đồ đó (dòng bị lọc mất, không phải giá trị bị che
    rỗng — giữ nguyên cách Frontend đang tiêu thụ). Test:
    `db/src/__tests__/tc.test.ts` ("ngân sách công trình là dữ liệu Mẫu D...") — vai trò NS gọi
    hàm nhận mảng rỗng và KHÔNG bị ghi log; TGĐ nhận đủ cả hai dòng và có ghi log.
  - Soát cũng xác nhận: 6/9 hàm nội bộ khác dùng chung mẫu thông báo đã đúng (không có vai trò
    `sees_all_companies` nào trong danh sách nhận của chúng); mọi hàm trả cột nhạy cảm khác đã
    tìm thấy (`estimates`, `profit_loss_report`, `inventory_items_cost`, `purchase_requests`
    cost, `quotation_items` cost, `employees` lương/hồ sơ cá nhân, `hr_documents`) đều gọi
    `log_sensitive_access` đúng.
- ✅ **Hồi quy tự gây ra ở `construction_budget_status`, phát hiện bằng `npm test` đầy đủ và
  vá ngay** — `db/migrations/0069_fix_construction_budget_status_overreach.sql`. Bản vá 0068
  đòi `rls_sees_sensitive('cost')` cho MỌI dòng, kể cả dòng không phải lợi nhuận — nhưng danh
  sách đó không có vai trò `TC`, nên vô tình khoá luôn chính chỉ huy trưởng công trình (có
  `TC: WORK_APPROVE`, tức sửa được module TC), người đúng ra phải theo được ngân sách công
  trình MÌNH quản lý (TC-05). `golden-path.test.ts` đã có sẵn một dòng chú thích xác nhận đúng
  ý đồ gốc này và đỏ ngay sau khi 0068 chạy — đây là lý do phải chạy `npm test` đầy đủ (không
  chỉ tệp vừa sửa) trước khi coi một đợt rà phân quyền là xong: đợt sửa X có thể phá đúng luồng
  Y đang đứng. Sửa: dòng chi phí (không phải lợi nhuận) hiện cho AI SỬA ĐƯỢC module TC (chính
  chủ công trình) HOẶC vai trò xem giá vốn — không đòi cả hai. NS vẫn bị chặn đúng như 0068
  định làm. ⚠️ Còn một điểm CHƯA quyết, ghi lại trong chính migration: có nên ghi
  `sensitive_access_logs` cho MỖI lần chỉ huy trưởng mở tab ngân sách công trình mình không
  (NEN-07 đọc theo chữ là "mọi lượt xem") — đang CỐ Ý không ghi (coi là thao tác vận hành bình
  thường, ghi mọi lượt sẽ làm bảng phình rất nhanh), cần Haan xác nhận nếu thấy quan trọng.
  Cùng lúc phát hiện và sửa luôn một lỗi CÓ SẴN TỪ TRƯỚC (không liên quan phiên làm việc này):
  `golden-path.test.ts` vẫn `select('quantity_on_hand, average_cost')` trên `inventory_items`
  dù migration 0064 (28/08/2026, trước đó trong cùng phiên đã compact) đã khoá quyền đọc cột
  `average_cost` của `authenticated` — bài test đó đã đỏ âm thầm từ lúc 0064 chạy, không ai
  chạy `npm test` đầy đủ để bắt được. Bỏ `average_cost` khỏi câu truy vấn (không dùng ở đâu
  khác trong bài test).
- ✅ **Đợt 3 hoàn tất phần đã cam kết** — soát hết mọi điểm gọi `create_notification` (đối
  chiếu tới định nghĩa CÒN HIỆU LỰC khi một hàm bị định nghĩa lại nhiều lần qua các migration,
  ví dụ `decide_approval` thân thật nằm ở 0049 chứ không phải bản cũ ở 0021/0043) cho chữ ký
  lỗi (a), và `boq_items`/`unit_prices`/mọi hàm ở 0058–0060 cho chữ ký lỗi (b). Tìm thêm đúng
  MỘT lỗi mới, cùng lớp (b) với `construction_budget_status`: **`sites_budget_status()`**
  (BC-05 "vượt ngân sách" trên Dashboard + cột/bộ lọc Ngân sách ở danh sách Công trình) trả
  thẳng `budgeted_cost`/`actual_cost`/`committed_cost` — tiền thật — cho BẤT KỲ ai có quyền
  `BC: VIEW` (gần như mọi vai trò, kể cả Kinh doanh — không nằm trong danh sách xem giá vốn,
  CLAUDE.md 6.6). Migration gốc (0058) có ghi chú CỐ Ý không chặn, nhưng lý do ghi ở đó
  ("đây là tín hiệu RỦI RO, không phải giá vốn") không đúng với việc trả nguyên ba cột tiền.
  Vá ở `db/migrations/0071_fix_sites_budget_status_cost_leak.sql`: tách hai việc — TÌNH TRẠNG
  (`health`: trong ngân sách/sắp vượt/vượt, tính sẵn trong SQL đúng công thức
  `summarizeBudget()`) vẫn hiện RỘNG cho mọi vai trò xem BC (đúng ý đồ gốc, thẻ cảnh báo rủi ro
  không cần giấu); SỐ TIỀN THẬT thì `NULL` cho vai trò không đủ quyền (`rls_sees_sensitive('cost')
OR auth_can_edit_module('TC')` — cùng điều kiện `construction_budget_status` dùng từ 0069, vì
  chỉ huy trưởng cần theo dõi ngân sách công trình mình quản lý). Kéo theo sửa
  `web/src/hooks/use-reports.ts` (`SiteBudgetStatusRow` thêm `health`, ba cột tiền thành
  `| null`) và hai nơi tiêu thụ — `dashboard.tsx`/`tc/site-list.tsx` — đổi từ tự tính lại
  `summarizeBudget()` sang đọc thẳng `health` (đọc từ cột tiền `null` sẽ ra sai cho phần lớn
  vai trò nếu không đổi). Test: `db/src/__tests__/bc.test.ts` (Kinh doanh nhận `health` nhưng
  cột tiền `null`). Toàn bộ đợt này (audit + vá + sửa 2 trang tiêu thụ + test) do một fork phụ
  thực hiện trong lúc phiên chính làm việc khác — đã đối chiếu lại: đúng lớp lỗi, không phá
  luồng cũ (171 test web + test liên quan ở `db/` xanh, `tsc -b` sạch).
- ✅ **Rà lại trước khi commit (skill `backend-code-review`) lộ ra một chỗ 0071 tự mâu thuẫn
  tiền lệ 0069** — vá ở `db/migrations/0073_fix_sites_budget_status_log_overreach.sql`. 0069
  CỐ Ý chỉ ghi `sensitive_access_logs` cho `construction_budget_status` khi
  `rls_sees_sensitive('cost')` đúng, KHÔNG ghi khi chỉ huy trưởng (`auth_can_edit_module('TC')`)
  xem đúng công trình mình quản lý — vì đó là thao tác vận hành bình thường, ghi mọi lượt sẽ
  phình bảng. `sites_budget_status` (0071) lại dùng điều kiện gộp cả TC để ghi log, và hàm này
  gọi ở TẦN SUẤT CAO HƠN nhiều — mọi lượt mở Dashboard/danh sách Công trình, không phải chỉ khi
  mở tab Ngân sách một công trình cụ thể. Giữ nguyên nghĩa là mỗi lần chỉ huy trưởng mở Dashboard
  ghi thêm một dòng log — đúng kiểu phình bảng 0069 đã tránh cho hàm anh em của nó. Sửa: tách
  riêng điều kiện ghi log (`rls_sees_sensitive('cost')` thôi) khỏi điều kiện hiện số tiền
  (`v_cost_sighted`, giữ nguyên gồm cả TC) — hành vi hiển thị dữ liệu không đổi. Test:
  `db/src/__tests__/bc.test.ts` (chỉ huy trưởng thấy số tiền thật của công trình mình, không bị
  ghi log).
- ✅ **Đợt 4 — đọc tuần tự phần business logic của ~101 hàm SECURITY DEFINER ghi dữ liệu**,
  ngoài hai chữ ký lỗi (a)/(b) đợt 3 đã quét. Chia 8 fork đọc độc lập theo module (CRM/DA, TK,
  HD, TC, MH, KHO, KT, NS), mỗi fork chỉ đọc — không sửa; tìm được **9 lỗi thật**, tất cả đã vá
  (migration 0074–0084) kèm test mới xác nhận từng lỗi tái hiện được và đã hết:
  - **`execute_amendment`** (HD-04, 0074) — không bao giờ cộng `contract_amendments.value_change`
    vào `contracts.value`. Một phát sinh chạy hết luồng duyệt vẫn để giá trị hợp đồng đứng yên
    mãi mãi, trong khi `profit_loss_report` (BC-02) đọc thẳng cột đó — lãi/lỗ sai vĩnh viễn cho
    công trình có phát sinh. Vá bằng `value = COALESCE(value, 0) + a.value_change` — bản đầu
    thiếu `COALESCE` bị chính bài test mới bắt được ngay (hợp đồng còn ở bước soạn, `value`
    chưa nhập nên là NULL, `NULL + số = NULL`, mất luôn giá trị).
  - **`save_estimate_items`** (TK-01, 0075) — ép `quantity` sang `bigint` (làm tròn) TRƯỚC khi
    nhân với đơn giá thay vì nhân xong mới làm tròn. Khối lượng có phần lẻ (m³, m² — ví dụ 2,5)
    ra sai số tiền dòng chi phí, kéo theo `direct_cost`. Vá bằng nhân ở `numeric`, `ROUND` ở
    bước cuối.
  - **`move_opportunity_stage`** (CRM-02, 0076) — không chặn chuyển giai đoạn khi cơ hội đã ở
    giai đoạn kết thúc (`ky_hop_dong`/`mat_co_hoi`, `isTerminal: true`) — quy tắc đó trước giờ
    CHỈ có ở giao diện (ẩn nút), gọi thẳng RPC vẫn đổi được, và `lost_reason` cũ không bị xoá
    khi "hồi sinh" một cơ hội đã mất. Vá bằng chặn thẳng ở hàm.
  - **`cancel_purchase_order`** (MH-06, 0077) — chỉ chặn huỷ khi đơn đã `huy`, không chặn huỷ
    đơn đã bắt đầu nhận hàng (`dang_giao`/`da_giao_du`) — huỷ sau khi đã nhận để lại tiền đã chi
    không hoàn tác được và đề nghị mua có thể mở đơn thứ hai cho hàng đã nhận một lần rồi. Vá
    bằng chặn thêm hai stage đó.
  - **`record_payment`** (KT-03, 0078) — không kiểm lại giới hạn hoàn ứng tại thời điểm CHI, chỉ
    dựa vào một lượt kiểm ở `submit_payment_request` (không khoá dòng). Hai đề nghị hoàn ứng gửi
    gần như cùng lúc có thể cùng qua được kiểm tra lúc `settled_amount` còn 0, rồi cả hai đều
    được ghi nhận đã chi — `advances.settled_amount` vượt `amount`. Vá bằng kiểm lại NGAY SAU
    khi khoá dòng `advances FOR UPDATE` trong `record_payment`.
  - **`record_scaffolding_event`** (KHO-06, 0079) — sinh mã lô mới bằng `now()` (độ phân giải
    một giây) không cắt bớt code nguồn — đúng lớp lỗi 0063 đã vá cho
    `create_rental_agreement`/`return_rental_agreement` nhưng bỏ sót hàm anh em này. Vá cùng
    khuôn: `clock_timestamp()` + mili-giây, `left(asset_code, 44)`.
  - **`build_budget_lines`** (DA-09, 0080) — có thể ÂM THẦM bỏ sót `overhead_cost`/
    `contingency_cost`/`profit_amount` của dự toán: `COST_GROUPS` cho phép dòng dự toán chi
    tiết dùng trực tiếp nhóm `chi_phi_chung`/`du_phong`/`loi_nhuan`, và khi đó mã ngân sách sinh
    ra trùng với mã cố định INSERT thứ hai dùng cho ba khoản tổng — điều kiện `NOT EXISTS` coi
    là "đã có" nên bỏ qua hẳn, không báo lỗi. Vá bằng CỘNG DỒN vào dòng đã có thay vì bỏ qua.
    Không quyết định thay việc dòng dự toán chi tiết có NÊN được dùng 3 nhóm này hay không — đó
    là câu hỏi tầng dự toán/frontend, cần hỏi Haan nếu muốn thu hẹp (xem 6.6).
  - **`log_employee_sensitive_edit`** (NEN-07, 0081) — nhánh INSERT kiểm ít cột hơn nhánh UPDATE
    (thiếu `insurance_salary`/`salary_type` ở nhóm lương, thiếu `discipline_notes` ở nhóm cá
    nhân) — tạo mới nhân viên chỉ điền các cột đó sẽ không ghi `sensitive_access_logs`. Vá bằng
    kiểm đủ cùng bộ cột cả hai nhánh.
  - **`hire_candidate`** (NS-02, 0082) — đọc `recruitment_positions.hired_count` không khoá
    dòng trước khi kiểm `>= headcount` — hai ứng viên cùng vị trí tuyển gần như đồng thời có thể
    cùng qua được kiểm tra, tuyển vượt chỉ tiêu. Vá bằng `FOR UPDATE` trước khi kiểm, cùng khuôn
    `record_payment`/`advance_payment_step`. Không viết test riêng (race hai luồng thật khó tái
    hiện ổn định trong Vitest) — vá theo nguyên tắc phòng thủ, đã xác nhận không đổi hành vi khi
    chạy tuần tự.
  - **`submit_leave_request`** (NS-05, 0083) — không kiểm chồng lấn ngày nghỉ: một nhân viên gửi
    được hai đơn có khoảng ngày chồng nhau, cả hai đều có thể duyệt độc lập. Vá bằng chặn gửi
    nếu đã có đơn khác `cho_duyet`/`da_duyet` chồng ngày.
  - **`save_attendance`** (NS-04, 0084) — không kiểm biên `hours`/`overtime_hours` (RPC gọi
    thẳng từ Frontend, không qua Workers) — giờ công âm/phi thực tế lọt thẳng vào
    `consolidate_timesheets` rồi ra lương. Vá bằng chặn ngoài khoảng 0–24 ở biên RPC.
  - Test mới: `db/src/__tests__/{rls,mh,kt,kho,ns}.test.ts` — mỗi lỗi trên có đúng một ca kiểm
    tái hiện được kịch bản lỗi và xác nhận đã vá; toàn bộ 8 tệp liên quan (rls 126, mh 39, kt 34,
    kho 41, ns 36, tc 30, bc 9, golden-path 3 — chạy riêng từng tệp đúng quy ước) đều xanh sau
    khi áp migration.
  - Hai điểm PLAUSIBLE fork tìm được nhưng KHÔNG tự vá, cần Haan xác nhận trước khi làm tiếp
    (ghi vào 6.6): (1) `move_site_stage` (TC) không gửi thông báo cho bất kỳ bước chuyển nào —
    kể cả "tạm dừng thi công"/"hoàn thành" — trong khi mọi hàm ghi sự kiện lớn khác cùng migration
    đều gọi `create_notification`; chưa rõ vai trò nào nên nhận nên chưa tự thêm. (2)
    `cancel_acceptance` (TC) không kiểm công trình có đang dựa vào chính biên bản đó để đã
    chuyển bước hay không — mức tin cậy thấp (quy trình thực tế thường huỷ ngay sau khi tạo,
    trước khi kịp chuyển bước), chỉ ghi lại để lưu ý.
  - Đã kiểm và LOẠI TRỪ một nghi vấn: `publish_design_version`/`handover_design_to_construction`
    (TK) chọn người nhận thông báo không có `OR sees_all_companies` — nhưng đối chiếu
    `db/src/seed/data.ts` xác nhận cả 4 vai trò trong danh sách nhận (`TKE, DA_DT, KD, TC`) đều
    `seesAllCompanies: false`, không có vai trò kiểu CFO nào trong nhóm này — không phải bug.
  - Phát hiện phụ (không phải nghiệp vụ, hạ tầng test): chạy thử `search.test.ts` +
    `sx.test.ts` cùng lúc lộ `search.test.ts`'s `cleanupFixture` xoá `customers`/`opportunities`/
    `employees` bằng `LIKE` tiền tố rộng thay vì đúng id của chính fixture đó — đúng loại rủi ro
    `global-teardown.ts` đã ghi chú (Vitest chạy nhiều tệp song song, tệp xong trước xoá rộng
    đụng bản ghi tệp khác đang dùng dở). Đã vá về đúng id (thêm `customerId` vào `Fixture`).
- Việc phụ phát hiện khi rà đợt 1 (KHÔNG liên quan quyền, đã sửa cùng đợt vì lộ ra lúc chạy lại
  `sx.test.ts` để xác nhận không hồi quy): `create_rental_agreement`/`return_rental_agreement`
  (SX-03) sinh `asset_code` lô mới bằng `to_char(now(), 'YYMMDDHH24MISS')` — độ phân giải MỘT
  GIÂY, và `now()` đứng yên suốt một transaction. Hai hợp đồng thuê cùng vật tư lập liên tiếp
  trong cùng một giây (thao tác tay nhanh, hoặc test tự động) đụng khoá duy nhất
  `scaffolding_assets_code`. Sửa bằng `clock_timestamp()` + mili-giây
  (`db/migrations/0063_fix_scaffolding_asset_code_collision.sql`); đồng thời cắt bớt phần đầu
  code nguồn trước khi nối hậu tố (`left(v_lot.asset_code, 44)`) vì thêm mili-giây làm vài
  code đã dài (qua nhiều vòng thuê/trả) vượt `varchar(64)`.

### 4C. Áp Content Guidelines toàn diện — ✅ xong (thư viện 5.1–5.6, tương phản màu, vùng bấm)

- ✅ **Thuật ngữ chuẩn hoá (CGD 4.4)** — grep toàn bộ `web/src` theo 7 cặp từ CGD 4.5 cấm dùng
  (Owner/Chủ hồ sơ, Submit/Gửi duyệt, Approve/Chấp thuận, Handover/Chuyển tiếp, Active/Hiện
  hành, Entity/Chi nhánh, Overdue/Trễ hạn): không tìm thấy vi phạm nào trong chữ hiển thị cho
  người dùng (hai chỗ khớp đều là comment giải thích quy tắc, không phải chữ hiển thị).
- ✅ **Định dạng ngày/giờ nhất quán** — `print-report.ts` (xuất PDF báo cáo, BC-06) dùng
  `new Date().toLocaleString('vi-VN')` thay vì `formatDateTime` dùng chung — ra định dạng khác
  spec CGD (không đệm 0, dấu phẩy thay vì "—", có giây). Đã đổi sang `formatDateTime`.
- ✅ **Lỗi = [việc gì] + [vì sao/cần làm gì], không lộ kỹ thuật (CGD 5.5)** — grep 87 khối
  `catch` trong `web/src`: 70 chỗ đã đi qua `toUserMessage` (dịch mã lỗi Postgres/mạng sang
  tiếng Việt, giữ nguyên thông báo `RAISE EXCEPTION` đã có dấu, chặn rò rỉ mọi lỗi khác). Tìm
  thấy 1 chỗ lách qua: `approval-inbox.tsx` (Hộp thư Phê duyệt — mẫu dùng chung MỌI loại phê
  duyệt, AFD 4.6) tự lấy `e.message` — lỗi mạng ("Failed to fetch") hoặc mã Postgres không có
  `RAISE EXCEPTION` tương ứng sẽ hiện tiếng Anh/kỹ thuật ngay trên màn hình quan trọng nhất.
  Đã đổi sang `toUserMessage(e, 'approve')`.
- ✅ **Vùng bấm di động ≥40×40px (CGD 6.8)** — quét các nút chỉ có icon (`size-6`…`size-8`)
  ngoài cụm đã canh sẵn (`IconButton` ở Top Bar, nút lịch ở `DateInput`): tìm thấy 2 nút thật
  sự nhỏ hơn chuẩn — nút "Menu tài khoản" ở Top Bar (`px-2 py-1` quanh avatar 24px, ra ~32px
  cao) và nút đóng banner cài đặt/cập nhật PWA (`size-8` = 32px, đúng banner hiện chủ yếu trên
  điện thoại). Cả hai sửa theo đúng khuôn `size-10 sm:size-8` đã dùng cho chuông thông báo/
  "Việc cần làm" (40px cảm ứng, 32px chuột). Thêm 2 ca test canh trong `design-rules.test.ts`
  để không mòn dần lại như đã từng xảy ra với nút lịch.
- ✅ **Đối chiếu thư viện nội dung CGD 5.1–5.6 với chữ thật trên màn hình** — cả năm mục:
  - **5.1 nhãn trạng thái** (`shared/src/status.ts` `STATUS_META`) — khớp nguyên văn (Nháp/Chờ
    duyệt/Đang xử lý/Hoàn thành/Quá hạn). Không lệch.
  - **5.2 nút** (`shared/src/content.ts` `BUTTONS`) — khớp nguyên văn, kể cả "Xuất Excel"/"Xuất
    PDF" (không rút gọn thành "Xuất") và "Duyệt" chỉ rút gọn trên nút. Grep thêm JSX sống tìm
    chữ Anh cứng (Submit/Save/Cancel/Delete/Edit/Approve/Reject) và nút lệch chuẩn ngoài
    `BUTTONS` — không có kết quả.
  - **5.3 thông báo** — đối chiếu `NOTIFICATIONS` (TS) VÀ toàn bộ ~40 chuỗi `create_notification(...)`
    sống rải trong `db/migrations/*.sql`. Mọi thông báo SQL đang chạy thật đều sạch; chỉ có
    `NOTIFICATIONS.handedOver`/`.awaitingApproval` (object TS — hoá ra KHÔNG được import/dùng ở
    đâu, code chết) còn giữ "cho bạn"/"chờ bạn phê duyệt" — sửa cho nhất quán dù không ai gọi.
  - **5.4 email** — grep toàn repo không thấy mã gửi email/template nào tồn tại — đúng là CHƯA
    làm vì hạ tầng Resend còn chặn (`RESEND_API_KEY`, mục 4D), không phải bỏ sót cần vá.
  - **5.5 lỗi** — `ERRORS` khớp gần như nguyên văn CGD, kể cả một chỗ **CỐ Ý lệch đúng hướng**:
    `exceedsApprovalLimit` đã bỏ sẵn "của bạn" — ưu tiên CLAUDE.md 4.4 (mới hơn, cấm đại từ nhân
    xưng) hơn chữ gốc trong CGD (cũ hơn, còn "bạn"). Không lệch cần sửa.
  - **5.6 trạng thái rỗng** — `MODULE_EMPTY_STATES` khớp bảng CGD nguyên văn (dòng TC cũng đã bỏ
    đúng đại từ từ trước); rà cả 56 chỗ gọi `<EmptyState>` — trạng thái rỗng của các panel con
    (không nằm trong bảng theo module của CGD) dùng chữ riêng là ĐÚNG, không phải vi phạm — CGD
    chỉ quy định mức danh sách gốc.
  - **Lệch thật duy nhất tìm được, cả ba đều cùng một lỗi (đại từ "bạn"/"của bạn", CLAUDE.md
    4.4)**: `web/src/pages/kho/scan-page.tsx` (chữ ĐANG hiển thị cho người dùng — "trong phạm vi
    của bạn" → "trong phạm vi đang xem") và hai chỗ trong `NOTIFICATIONS`/`EMPTY_STATES.noAccess`
    (code chết, sửa cho nhất quán). Không có gì cần hỏi lại Haan — chữ "bạn" trong bản thân CGD
    5.3 chỉ là chưa cập nhật theo quy tắc cấm đại từ ban hành sau, và phần còn lại của mã nguồn
    đã tự đúng theo quy tắc mới từ trước.
  - Quét thêm emoji (không có trong UI, chỉ có trong comment code — không sao) và chữ IN HOA
    nhấn mạnh (không có).
- ✅ **Tương phản màu ngoài token** — grep toàn `web/src` tìm màu tuỳ biến bỏ qua hệ token: hex
  trong `className`/`style` (`text-[#...]`, `style={{color:...}}`), hex literal rải rác trong
  `.tsx`, và bảng màu Tailwind gốc (`red-500`, `green-600`…) thay vì token thiết kế — KHÔNG có
  kết quả nào ở cả ba. Toàn bộ codebase chỉ dùng đúng bộ token (`fg`, `surface`, `brand`,
  `status-*`…), kể cả nơi hay bị bỏ sót nhất (thanh tiến độ dùng `bg-brand` thuần, không có chữ
  đè lên nên không phát sinh vấn đề tương phản). Không có gì để vá — `design-rules.test.ts` đã
  canh đủ mọi cặp token/nền thật sự tồn tại trong sản phẩm.
- ✅ **Vùng bấm nhỏ ở các trang chưa rà** — quét toàn diện icon-button ngoài phạm vi Top Bar/PWA
  banner đã xong trước đó: liệt kê mọi `aria-label` (25 tệp), mọi lớp `size-6/7/8`, `h-6/7/8`,
  `p-1`/`p-1.5` gắn với phần tử bấm được, và mọi `Button size="sm"` (28px) dùng cho nút chỉ có
  icon. Tìm 3 chỗ thật:
  - **Bộ chọn pháp nhân dạng `compact`** (`company-switcher.tsx`, chỉ hiện dưới `lg:` ở Top
    Bar — đúng nơi ngón tay cần nhất) — `px-2 py-1` quanh icon 16px + mã pháp nhân, cùng lớp
    lỗi đã vá cho "Menu tài khoản". Vá bằng `min-h-10 ... sm:min-h-8`, đúng khuôn cũ.
  - **Nút chuyển tháng trong lịch chọn ngày** (`calendar-popover.tsx`, dùng chung mọi
    `DateInput` toàn ứng dụng) — `Button size="sm"` mặc định 28px cao. Vá bằng
    `size-10 sm:size-8`. Nhân tiện bump `h-9` (36px) lên `h-10` (40px) cho ô ngày trong lưới —
    **không** nới rộng cả khung lịch (`w-72` → `w-80`) để "đủ 40px/cột": đã thử, xác nhận trực
    tiếp trên trình duyệt việc đó làm nặng thêm một lỗi CÓ SẴN — popover định vị `right-0` so
    với chính ô nhập, ô nhập càng gần sidebar thì phần mở rộng bên trái càng bị cột nội dung
    cắt mất (đã thấy tận mắt ở ô "Từ ngày" trang `/kt/dong-tien`: 2 cột lịch đầu + nút "Tháng
    trước" biến mất hẳn khi thử `w-80`; quay lại `w-72` chỉ còn cột T2 bị cắt — hiện trạng CÓ
    SẴN từ trước, không phải lỗi mới). Không phải câu hỏi nghiệp vụ cần hỏi Haan — là nợ kỹ
    thuật thuần tuý (cần sửa cách ĐỊNH VỊ popover: neo theo khung nhìn hoặc portal, không phải
    nới bề ngang), ngoài phạm vi 4C nên chưa vá ở đây; nhắc lại khi có `DateInput` nào đặt gần
    mép trái nội dung (sidebar/panel hẹp) gặp lại đúng triệu chứng này.
  - **Nút chuyển "Pipeline"/"Danh sách"** (`opportunity-pipeline.tsx`) — ẩn chữ nhãn dưới `sm:`,
    dưới ngưỡng đó chỉ còn icon và `Button size="sm"` không đủ. Vá bằng
    `size-10 sm:h-8 sm:w-auto sm:px-3`.
  - Đã LOẠI TRỪ có chủ đích: checkbox chọn dòng trong `entity-table.tsx` và các checkbox biểu
    mẫu khác (9 chỗ, `size-4`/`size-5`) — control gốc trình duyệt, quy ước rộng khắp toàn cầu
    tách biệt kích thước THỊ GIÁC khỏi vùng bấm thật (viền/label bao quanh vẫn nhận click),
    không nằm trong phạm vi 3 ca kiểm "vùng bấm cho ngón tay" đã có từ trước — đổi kích thước
    checkbox là quyết định ngôn ngữ thiết kế rộng hơn phạm vi một lượt quét lỗi.
  - Đã xác nhận cả 3 chỗ bằng trình duyệt thật (Chrome, tài khoản TGD) — cửa sổ không co được
    xuống độ rộng di động thật trong môi trường này (`resize_window` không tác dụng, đã thử
    nhiều lần, `window.innerWidth` vẫn báo desktop), nên xác nhận được: (a) hai fix trong lịch
    render đúng, sạch, không lệch bố cục ở cả hai trạng thái di động/máy tính; (b) bộ chọn
    pháp nhân compact render đúng ở trạng thái `sm:` (32px); (c) không có gì vỡ bố cục ở màn
    hình máy tính sau khi thêm class. Trạng thái 40px thật trên di động xác nhận qua đối chiếu
    class với `design-rules.test.ts` (3 ca kiểm mới) và so khớp nguyên văn với mẫu đã áp dụng
    trước đó (`min-h-10 ... sm:min-h-8`), không quan sát trực tiếp được do giới hạn công cụ.
  - Test mới: `web/src/test/design-rules.test.ts` — 3 ca kiểm canh cả 3 vá (19 → 22 test, chạy
    xanh cùng 171 test web còn lại → 174).

### 4D. Tác vụ nền (NEN-04) — ⏳ hạ tầng xong + 4/4 loại cảnh báo (phần gắn phê duyệt), còn Queues + "hồ sơ thiếu chứng từ"

- ✅ **Đã dựng `workers/`** — package thứ tư của monorepo (`shared`/`db`/`web`/`workers`), Hono +
  Cloudflare Cron Trigger, dùng Supabase client với `service_role` (Tech Stack 5.6). Đây là
  Worker API tùy chỉnh ĐẦU TIÊN của dự án — trước giờ mọi nghiệp vụ đều diễn đạt được bằng
  RLS/hàm SECURITY DEFINER gọi thẳng từ Frontend (CLAUDE.md 3.1), Cron Trigger là lý do đầu
  tiên THẬT SỰ cần lớp này vì nó chỉ gắn được vào Worker, không gắn thẳng vào Supabase.
  Lịch chạy `0 18 * * *` (UTC) = 01:00 sáng giờ Việt Nam, sau giờ làm và trước khi Ban Giám đốc
  mở Dashboard buổi sáng. Xác nhận chạy đúng cục bộ bằng `wrangler dev --test-scheduled` (không
  deploy) — gọi `scan_hr_document_reminders` qua RPC thật, tạo đúng 2 `notifications` cho tài
  khoản `nhansu@nhavietgroup.test` (đã xác nhận lại bằng SQL, không chỉ tin log "ok").
- ✅ **1/4 — nhắc hạn giấy tờ nhân sự** (`scan_hr_document_reminders`, NS-10). Hàm này có từ
  Phase 3E nhưng CHƯA từng có gì gọi tới cho đến bây giờ — chỉ gọi được tay qua SQL Editor
  trước đó.
- ✅ **2/4 — công nợ phải thu quá hạn** (`scan_receivable_reminders`,
  `db/migrations/0066_scan_receivable_reminders.sql`, KT-04). Dùng LẠI đúng cấu hình
  `aging_buckets` (KT-04, không phát minh mốc ngày mới) — mỗi đêm khớp lại khung tuổi nợ của
  từng khoản phải thu chưa tất toán, chỉ nhắc Kế toán khi khoản đó vừa CHUYỂN sang khung nặng
  hơn lần quét trước (cột mới `receivables_payables.last_reminded_bucket_id`, cùng khuôn
  `hr_documents.last_reminded_stage`). CỐ Ý thu hẹp phạm vi hai chỗ so với câu PRD NEN-04
  "công nợ đến hạn hoặc quá hạn": (a) chỉ `phai_thu`, chưa làm `phai_tra`; (b) chỉ nhắc khi ĐÃ
  quá hạn, chưa làm nhánh "sắp đến hạn" vì PRD không nêu số ngày báo trước nào cho công nợ
  (khác NS-10 có sẵn 90/60/30/7) — tự đặt một con số là tự quyết nghiệp vụ, cần hỏi Haan nếu
  làm tới. Test: `db/src/__tests__/kt.test.ts` (tạo thông báo đúng 1 lần khi chuyển khung, quét
  lại ngay không nhắc lại). Xác nhận lại qua `wrangler dev --test-scheduled` chạy cả hai hàm
  trong cùng một lượt cron.
- ✅ **3/4 — chi phí vượt ngân sách công trình** (TC-05). Hoá ra KHÔNG cần viết hàm quét mới:
  trigger `budget_overrun_alert()` đã tồn tại từ Phase 3A (`db/migrations/0035_tc_rls.sql`,
  chạy `AFTER UPDATE` trên `project_budgets`) và đã đúng kiểu "cảnh báo sớm" hơn cách 2 loại
  kia làm — báo NGAY lúc chi phí đã phát sinh + đã cam kết vượt 90%, không đợi tới lượt quét
  đêm. Chỉ là trigger này CHƯA từng có test nên không ai biết nó có chạy đúng không.
  Viết test (`db/src/__tests__/tc.test.ts`) lộ ra **một lỗi thật, từ Phase 3A tới giờ**: điều
  kiện nhận thông báo dùng cứng `uc.company_id = s.company_id`, mà CFO chỉ được gán vào pháp
  nhân tổng hợp "NVG" (`db/src/seed/data.ts`) chứ không gán riêng vào NVC/NVS/NVO — nên với
  MỌI công trình thật, CFO **không bao giờ nhận được** cảnh báo vượt ngân sách dù nằm trong
  danh sách vai trò nhận. Đúng lớp lỗi CLAUDE.md 3.5 đã cảnh báo (lọc cứng `company_id` bỏ sót
  vai trò xem toàn NVG), chỉ khác chỗ xảy ra là truy vấn người-nhận-thông-báo chứ không phải
  policy RLS. TGD không lộ lỗi vì được gán riêng vào cả 4 pháp nhân nên luôn có một dòng khớp
  thẳng — che mất lỗi khi trước giờ chỉ thử tay bằng tài khoản TGD. Đã vá ở
  `db/migrations/0067_fix_budget_overrun_alert_recipients.sql`: đổi sang mẫu
  `(uc.company_id = ... OR r.sees_all_companies)` đã dùng ở `0049_ns_rls.sql`; vì sửa này khiến
  TGD có nhiều dòng `user_companies` cùng khớp điều kiện, phải gói `SELECT DISTINCT` trước khi
  gọi `create_notification` để không nhắc trùng 4 lần. Test xác nhận cả hai vế: CFO nhận đúng 1
  thông báo, TGD cũng đúng 1 (không nhân đôi), và không nhắc lại khi vẫn đứng trên ngưỡng ở lần
  cập nhật sau.
- ✅ **4/4 — việc quá hạn xử lý, phần gắn phê duyệt** (`scan_pending_approval_reminders`,
  `db/migrations/0072_scan_pending_approval_reminders.sql`). Đọc lại BUILD_PLAN 1.4: "Việc cần
  làm" ở Top Bar hiện chính là Hộp thư Phê duyệt (`usePendingApprovals`) — nên với việc CÓ gắn
  phê duyệt, hệ thống ĐÃ có định nghĩa "quá hạn xử lý" rồi, không cần chờ quyết định bảng
  `tasks`: một hồ sơ nằm ở người duyệt quá `PENDING_APPROVAL_AGING_DAYS` (3 ngày,
  `shared/src/bc.ts`, ngưỡng đã dùng cho thẻ "để lâu" của BC-05) thì được nhắc, đúng MỘT lần
  mỗi hồ sơ (cột mới `approvals.last_reminded_at`). Việc KHÔNG gắn phê duyệt (ví dụ nhắc giấy
  tờ sắp hết hạn) vẫn treo đúng như cũ, chờ quyết định bảng `tasks`.
  Người nhận KHÔNG tái dùng được `rls_can_approve` (hàm đó đọc phiên đăng nhập hiện tại, tác vụ
  nền không có phiên) — viết hàm nội bộ mới `approval_reminder_recipients(subject, company_id)`
  cùng lõi (vai trò còn hạn mức phê duyệt đang bật) và cùng mẫu `OR r.sees_all_companies` +
  `DISTINCT` đã vá ở 0067/0068 cho CFO. ⚠️ Cố ý KHÔNG so khớp `max_amount` như
  `rls_can_approve` làm — sai theo hướng THỪA (nhắc thêm một vai trò hạn mức thấp hơn) chỉ tốn
  một thông báo vô hại, còn sai theo hướng THIẾU (bỏ sót người phải xử lý) mới là lỗi NEN-04
  muốn tránh; đánh đổi này ghi rõ trong migration, đổi lại được nếu Haan thấy nhắc thừa gây
  nhàm (CGD 3.4). Test (`db/src/__tests__/rls.test.ts`, describe "nhắc việc chờ phê duyệt để
  lâu") dùng `stocktake_adjustment` — hạn mức seed sẵn cả KHO (gán trực tiếp NVC) và CFO (chỉ
  gán "NVG") — đúng phép thử đã lộ ba lỗi CFO trước đó trong phiên này; xác nhận cả hai nhận
  đúng 1 thông báo (không nhân đôi), quét lại không nhắc lại, và chưa đủ ngưỡng thì chưa nhắc.
  ⚠️ **Phát hiện phụ lúc kiểm bằng SQL trực tiếp (không tin "Hoàn tất")**: hàm chỉ REVOKE khỏi
  `authenticated, anon` (đúng khuôn `scan_hr_document_reminders`) nhưng vẫn còn `EXECUTE` cho
  `PUBLIC` sau khi tạo — đối chiếu `pg_default_acl` không thấy PUBLIC được cấp mặc định, cũng
  không thấy event trigger nào cấp lại; nguồn gốc chưa rõ, nhưng `has_function_privilege` xác
  nhận CẢ `authenticated` LẪN `anon` gọi được qua đường PUBLIC nếu không revoke tường minh. Vá
  bằng cách ghi thêm `PUBLIC` vào câu REVOKE (đúng khuôn `scan_receivable_reminders`, 0066, vốn
  đã làm vậy) — khuyến nghị: **mọi hàm cron-only mới nên REVOKE cả PUBLIC tường minh, đừng tin
  default đã đủ**, bất kể 0062 tưởng đã lo xong phần PUBLIC cho mọi hàm sau này.
- ⏳ PRD NEN-04 còn nhắc "hồ sơ thiếu chứng từ" — chưa rõ diễn giải thành điều kiện SQL cụ thể
  nào, cần hỏi Haan nếu làm tới.
- Ghi chú tiện dùng lại sau: `shared/src/content.ts` có sẵn mẫu `NOTIFICATIONS.debtDue(party,
amount, date)` cho "công nợ đến hạn" nhưng khung câu đó giả định "đến hạn vào ngày X" — không
  khớp cách `scan_receivable_reminders` diễn đạt ("đã chuyển sang khung … "). Chưa dùng lại
  được, không phải bỏ sót.
- ⏳ **Chưa làm — Cloudflare Queues** (gửi email, tổng hợp báo cáo nặng): `RESEND_API_KEY` vẫn
  để trống (CLAUDE.md 6.6 liệt kê là vấn đề còn mở), nên v1 chỉ dừng ở thông báo trong ứng dụng
  (`notifications`, đã có kênh hiển thị ở chuông Top Bar từ Phase 3G) — đúng tinh thần "không
  chặn luồng chính khi thiếu hạ tầng phụ" (CLAUDE.md 5.1). Thêm khi có tài khoản Resend thật.
- ⏳ **Chưa làm — triển khai thật**: mọi xác nhận ở trên chạy CỤC BỘ qua `wrangler dev`, CHƯA
  `wrangler deploy`. Deploy thật cần Haan xác nhận trước (CLAUDE.md 6.4) và cần đặt secret
  `SUPABASE_SERVICE_ROLE_KEY` bằng `wrangler secret put ... --config workers/wrangler.jsonc`
  — khoá đó KHÔNG được đưa vào `wrangler.jsonc` hay bất kỳ đâu commit vào Git.
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

> **Viết lại toàn bộ ngày 28/08/2026.** Phương án cũ của mục này (tự viết bộ giải ràng buộc
> bằng TypeScript trên Workers; dựng ba chiều thủ tục bằng Three.js) **đã bị thay thế** bởi
> bộ tài liệu đặc tả ở `doc/design/`. Giữ hai phương án song song sẽ tạo hai kế hoạch mâu
> thuẫn trong cùng repo.

**Điều kiện vào:** ✅ **đã thoả cả hai** — hệ thống lõi ~90%, và bộ tài liệu đặc tả (14 file)
đã nằm ở `doc/design/`.

**Đọc trước khi làm bất cứ việc gì ở đây:** `doc/design/README.md` (6 đính chính chỗ tài liệu
mô tả sai hiện trạng + bảng ánh xạ sang bảng và enum đang chạy), rồi `CLAUDE.md` mục 8.

**Tiến độ và vướng mắc: `TIEN_DO_THIET_KE.html`** — xong việc nào cập nhật ngay.

## Kiến trúc — khác hẳn phương án cũ

Hai runtime. Ranh giới là ranh giới **năng lực thư viện**, không phải sở thích:

|         | Worker (TypeScript)                                       | Container (Python)                                  |
| ------- | --------------------------------------------------------- | --------------------------------------------------- |
| Chạy gì | Giao diện, API, gọi mô hình ngôn ngữ, artifact, điều phối | Bộ giải CP-SAT, hình học, tệp CAD, mô hình ba chiều |
| Vì sao  | Nghẽn ở vào/ra, cùng codebase                             | OR-Tools, trimesh, ezdxf, shapely chỉ có ở Python   |

Năm lớp, mỗi lớp là một hàm thuần `(artifact vào, cấu hình) → artifact ra`:

```
DesignBrief ─► SpaceProgram ─► LayoutIntent ─► FloorPlan ─► ArchModel ─► Mesh3D ─► Renders
 (Worker)       (Worker)        (Worker)       (Container)  (cả hai)    (Container) (Worker)
```

**Nguyên tắc chi phối mọi thứ:** mô hình ngôn ngữ sinh **cấu trúc** (cây chia không gian),
**bộ giải gán số**. Mô hình ngôn ngữ không bao giờ sinh toạ độ hay kích thước.

Vì sao **OR-Tools CP-SAT** chứ không phải thuật toán tự viết: cơ chế giả định của CP-SAT trả
về **tập ràng buộc mâu thuẫn** khi vô nghiệm (đo được 29/08/2026: OR-Tools chỉ hứa tập ĐỦ,
không hứa nhỏ nhất — trên đầu bài thật nó trả ~40 mục; bộ giải thu hẹp còn 2 bằng bộ lọc xoá
dần, xem vướng mắc V-4). Đó chính là thứ tạo ra tính năng phân
tích tác động — không có nó thì hệ thống chỉ nói được "không hợp lệ" mà không nói được _cái
gì xung đột với cái gì_, và cũng không đề xuất được phương án nới lỏng.

## Mốc — làm tuần tự, điều kiện ra xác định "xong", không phải lịch

### Mốc 0 — Kiểm chứng rủi ro kỹ thuật ✅ 0.1 đạt bậc 1 (06/09/2026), 0.2 và 0.3 xong

| #   | Việc                                                                     | Điều kiện ra                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 | Đọc 5 tệp `.dwg` cũ qua ODA File Converter + `ezdxf` trong container     | ~~Trích được đa giác ranh phòng và nhãn phòng; KTS xác nhận đúng ≥4/5~~ — **điều kiện ra này đo sai thứ, xem dưới.** Hồ sơ thật đã có (05/09/2026, hai bộ, 265 tờ) và **vướng mắc V-1 đã gỡ**. Câu trả lời: quy ước lớp NVG **không** nhất quán, và bản vẽ **không có lớp ranh phòng** — NVG đặt tên lớp theo độ đậm nét khi in. Trình trích xuất hiện nhìn thấy ~1/6 bản vẽ (83% hình học nằm trong block). Chuyển thành **vướng mắc V-8**; điều kiện ra đề xuất thay bằng bốn phần đo được — xem `doc/design/13-ho-so-thuc-te.md` mục 13.12 và câu hỏi Q-23 |
| 0.2 | Model CP-SAT nhỏ: căn 5×18, 4 tầng, giải liên tầng trong **một** mô hình | Có nghiệm hợp lệ; ép mâu thuẫn → tập ràng buộc xung đột đọc hiểu được. **Đo bằng Docker tại chỗ — vướng mắc V-2**                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0.3 | 20 quy tắc đầu từ QCVN 01:2021/BXD + trình kiểm tra định dạng rule pack  | Kiến trúc sư đọc hiểu và đề xuất thêm ≥5 quy tắc. **Phần xác nhận để mở — vướng mắc V-3**                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Mốc 3 — Pipeline số hoá + Knowledge Base ⏳ ĐANG LÀM

Chạy song song Mốc 2 được (chỉ cần Mốc 1). Phần chạy trong Container đã xong 29/08/2026:

- Hợp đồng `contracts/kb-record.schema.json` — bản ghi vượt ranh giới Container → Worker nên
  phải có lược đồ (nguyên tắc bất biến 3). `slicing_tree` dùng lại **nguyên**
  `layout_node` của `layout-intent`: bản ghi được đưa vào prompt Layer 3a làm few-shot, lệch
  định dạng là dạy mô hình sinh sai.
- `compute/src/design_compute/cad/` — bọc ODA File Converter (`xvfb-run`, thư mục tạm một
  tệp), bảng ánh xạ lớp bản vẽ dạng **dữ liệu** (`kb/layer_mapping.yaml`), trình trích xuất
  mặt bằng: đa giác phòng, nhãn nguyên văn, lưới cột, ranh đất.
  > ⚠️ **Đối chiếu hồ sơ thật 05/09/2026: phần này phải viết lại, không phải bổ sung.**
  > Bốn giả định nền đều sai với bản vẽ NVG và cả bốn hỏng im lặng — chỉ duyệt
  > `doc.modelspace()` trong khi 83% hình học nằm trong block · tìm phòng trên lớp
  > `room_boundary` mà không tập nào có lớp đó · coi một tệp là một tầng trong khi một tệp
  > là 22–73 tờ xếp cạnh nhau · không đọc `ATTRIB` nên bỏ hết mã tờ, tỷ lệ, cao độ tầng,
  > bảng cửa và nhãn trục. Thêm bốn mục trong `ignore` đang bỏ đúng thứ giá trị nhất
  > (lớp `0`, `*DIM*`, `*TRUC*`, `*KHUNG*TEN*`). Chi tiết và thứ tự sửa: **vướng mắc V-8**
  > và `doc/design/13-ho-so-thuc-te.md` mục 13.6, 13.10.
- `compute/src/design_compute/kb/slicing.py` — suy ngược cây chia không gian. Lá mang **chỉ
  số** phòng, không mang tên: hình học giải trong Container, từ vựng chuẩn hoá ở Worker.
  Mặt bằng không thuộc lớp slicing trả `None` thay vì một cây gần đúng.
- `compute/src/design_compute/kb/crosscheck.py` — Bước 2 kiểm tra chéo → `quality_score`.
  Phép kiểm **chưa chạy được cũng kéo điểm xuống**: điểm tuyệt đối phải nghĩa là "đã kiểm
  hết", không phải "kiểm được ít nên không trượt".
- `compute/src/design_compute/kb/record.py` — lắp bản ghi và validate theo hợp đồng.

- Hợp đồng `contracts/cad-extraction.schema.json` + `POST /extract` và `POST /kb/record`.
  Tệp CAD gửi bằng **multipart** — đích đến vẫn là R2 (mục 8.5 T4) nhưng R2 cần bật thanh
  toán, nên chỗ phải đổi gói gọn trong một phương thức của `HttpComputeBackend`.
- `ComputeBackend` phía Worker có thêm `extract()` và `buildKbRecord()`. Phân loại lỗi:
  tệp sai định dạng → 422 không thử lại · container đang khởi động → đáng thử lại ·
  **thiếu ODA File Converter → 503 nhưng KHÔNG thử lại** (vấn đề triển khai, không phải sự
  cố tạm thời — Container nói rõ `retryable: false` trong thân phản hồi thay vì để lớp gọi
  suy đoán từ mã trạng thái).

- Bảng `kb_record` (`db/migrations/0098_kb_records.sql`). `payload` là nguồn sự thật; mọi
  cột dùng để lọc là cột `GENERATED ALWAYS … STORED` đọc thẳng từ payload, nên hai nguồn
  **không thể** nói khác nhau. Phân quyền **hai** chiều (tenant + bộ môn), cố ý không có
  chiều dự án: bản ghi là tri thức mức tenant và `project_id` được phép rỗng. Không bất
  biến (Bước 3 bổ sung `rationale`), không có policy DELETE — xoá mềm, chỉ mục duy nhất là
  một phần để số hoá lại cùng mã công trình được.

- `DigitisePipeline` — Workflow **mỗi tệp một step**, cộng kho tệp nguồn khoá theo **mã băm
  nội dung** (Bước 0 của tài liệu: cùng bản vẽ ở ba thư mục chỉ chiếm chỗ và trích một lần).
  Tuyến `POST /design/kb/digitise` lưu tệp rồi khởi động Workflow, trả `runId` ngay thay vì
  giữ kết nối chờ. Quyền hỏi thẳng CSDL (`rls_kb_writable`) dưới phiên người gọi.
- **Một tệp lỗi không giết cả mẻ** — kiểm chứng đầu-cuối: một DXF tốt + một PDF gửi nhầm vẫn
  ra bản ghi từ phần dùng được, tệp hỏng được ghi nhận. Cơ chế: lỗi tạm thời ném tiếp cho
  Workflow thử lại, lỗi của chính tệp bắt lại và đi tiếp.

Bổ sung 29/08/2026 (khoá Gemini đã có, đã gọi thật để kiểm chứng):

- Từ vựng phòng dạng **dữ liệu** (`kb/room_vocabulary.yaml`) + chuẩn hoá nhãn hai lượt: bảng
  bí danh tất định chạy trước, mô hình ngôn ngữ chỉ nhận phần còn lại và chỉ MỘT lượt gọi
  cho cả bộ hồ sơ. Đưa thẳng mọi nhãn cho mô hình sẽ làm kết quả thôi tất định — mà bản ghi
  lại dùng làm few-shot, nên sai ở đây dạy sai cho mọi phương án sinh sau đó.
- `workers/src/design/llm/gemini.ts` — lớp DUY NHẤT chạm mạng nhà cung cấp mô hình. Không
  nhận tên mô hình, chỉ nhận TÊN BƯỚC rồi hỏi `ModelRouter`; có tham số `model` là có đường
  đi vòng qua lớp chặn hạng dữ liệu.
- `0099_kb_retrieval.sql` — pgvector, cột `rationale_embedding vector(1536)`, các cột lọc
  tầng 2 (kích thước lô, hồ sơ gia đình, phong cách, cờ đã chú giải), hàm truy hồi
  `kb_retrieve_candidates` (**SECURITY INVOKER** — đi qua RLS) và `kb_apply_rationale`.
  **Chưa đánh chỉ mục vector**, theo đúng mục 6.6 của tài liệu.
- `0100_kb_annotation_outcome.sql` — câu hỏi thứ năm của Bước 3 thuộc `outcome`, không thuộc
  `rationale`; ghi cùng một lần để hai phần không lệch nhau.
- `workers/src/design/kb/mmr.ts` — chọn few-shot vừa sát vừa khác nhau. Khi cả kho chưa có
  vector, phần "khác nhau" lùi về so hình học thay vì trả 0: trả 0 sẽ khiến MMR lặng lẽ
  thoái hoá thành xếp hạng thuần.
- Văn bản đem đi nhúng dựng theo **danh sách CHO PHÉP** (`kb/rationale.ts`): mã công trình,
  kích thước lô thật và mọi ô chữ tự do ở lại trong hệ thống. Danh sách loại trừ sẽ hỏng vào
  ngày hợp đồng thêm một trường mới, và hỏng trong im lặng.
- Giao diện `/tk/ho-so-cu` — hàng chờ chú giải + màn hình chú giải với mặt bằng SVG. Đây là
  lớp gọi Worker ĐẦU TIÊN của `web/` (`lib/design-api.ts`); mười hai module còn lại vẫn gọi
  thẳng Supabase và đó vẫn là mặc định đúng.

Còn lại của Mốc 3: Bước 0 đầy đủ (xác định bản có hiệu lực theo quy ước tên tệp và thư mục
`08_Hồ sơ phát hành`), extractor cho tổng mặt bằng / kết cấu / mặt cắt / bảng thống kê.
Cả hai đều chờ 5 hồ sơ `.dwg` thật — bảng ánh xạ lớp bản vẽ hiện vẫn là phỏng đoán theo
chuẩn AIA, chưa gặp bản vẽ nào của NVG.

### Mốc 1 — Khung xương ✅ XONG (29/08/2026)

- `contracts/` — JSON Schema đủ **cả 5 lớp**, kể cả lớp chưa cài đặt. Sinh zod →
  `shared/src/design/` bằng `scripts/contracts-gen.mjs` (`npm run contracts:check` canh lệch).
  Phía Python **không sinh mã**: nạp thẳng `contracts/*.schema.json`, validate bằng
  `jsonschema` — bản sao cần bước kiểm tra để không lệch, đọc thẳng nguồn gốc thì không có
  gì để lệch. Cả hai bên **đều validate** ở ranh giới; không bên nào tin bên kia.
- Bảng `design_artifact` · `design_artifact_edge` · `design_head` — mang `tenant_id`,
  `company_id`, `discipline`; khoá ngoại tới `design_projects` và `users` **sẵn có**.
- Bảng `tenants` (một dòng NVG) + bảng `role_capabilities(role_id, capability)` cho quyền
  chuỗi `design.*`. **Không sửa** ma trận `permissions` — 12 module đang chạy trên đó.
- RLS **ba chiều** trên mọi bảng module: tenant · phân công dự án · bộ môn — gói trong hai
  hàm dùng chung (`rls_design_readable` / `rls_design_writable`) để không bảng nào chép lại
  điều kiện rồi lệch. Phạm vi tenant suy từ `companies.tenant_id`, không có bảng nối riêng.
- Trình nạp rule pack (`base/` + `locality/` ghi đè) + engine vị từ trong Container, có mặt
  tiếp xúc HTTP `GET /health` + `POST /solve`.
- Bộ định tuyến mô hình ngôn ngữ + **lớp chặn `data_class`** — `resolve()` là đường duy nhất
  tới cấu hình mô hình và bắt buộc nhận `data_class`, không có lối vòng.
- Khung Cloudflare Workflow đủ 6 bước, chạy lại được từ giữa, phân biệt lỗi đáng thử lại với
  lỗi cấu trúc; bước chưa cài đặt trả mã tạm đúng hợp đồng.
- Cầu nối phát hành sang `documents`/`document_versions` — ký theo **từng** bộ môn.
- Cột dự án nháp cho khách vãng lai + cơ chế chuyển thành dự án chính thức.

**Điều kiện ra — đã đạt, có kiểm thử:** pipeline sáu bước chạy thông đầu-cuối qua CẢ HAI
runtime thật (Supabase Storage + bộ giải trong Docker); mọi artifact có băm nội dung và
lineage; truy vấn được "bản nào đang hiệu lực"; cùng đầu vào + cùng cấu hình → **cùng mã
băm** và chỉ một dòng artifact; dữ liệu hạng 1 bị chặn ở đầu ra gói miễn phí; artifact không
sửa/xoá được từ trình duyệt; không ghi được artifact ngoài bộ môn được phân công; phát hành
`ket_cau` bị chặn vì người ký không có `design.publish.ket_cau`.
**100 phép thử xanh** (37 Python + 63 TypeScript).

⚠️ **Bốn quy ước then chốt do mốc này dựng ra — xem CLAUDE.md 8.8 trước khi thêm bảng hay
endpoint.** Hai chỗ lệch tài liệu đã ghi ở `contracts/README.md`; hai phát hiện mới ở
`TIEN_DO_THIET_KE.html` (vướng mắc V-6, câu hỏi Q-12 và Q-13).

### Mốc 2 — Lớp 1: Design Brief (TK-10) ✅ XONG (29/08/2026)

**Q-2 đã trả lời: MỞ RỘNG `design_briefs`, không thay bảng.** TK-01 và TK-10 mô tả CÙNG một
hồ sơ ở hai mức chi tiết — PRD TK-10 nói thẳng "tiếp nhận yêu cầu khách hàng và chuẩn hoá
thành Design Brief". Hai bảng nghĩa là hai nơi nhập, đúng cái điều kiện ra của mốc này cấm.

- `shared/src/design/brief-form.json` — biểu mẫu thích ứng dạng **dữ liệu**: trường nào, thứ
  tự nào, hiện với loại hình nào, nặng bao nhiêu điểm. Giao diện đọc cấu hình rồi vẽ; không
  có `if (buildingType === 'biet_thu')` nào trong mã. Đặt trong `shared/src/` chứ không ở
  `config/` vì `shared/tsconfig.json` khai `rootDir: "./src"` — để ngoài thì phải thêm một bộ
  sinh và một lệnh `--check` chạy tay, mà repo chưa có CI.
- `brief-completeness.ts` — chấm điểm **tất định**, không gọi mạng. Chấm trên những trường
  ĐANG HIỆN, nên hàm bắt buộc nhận cấu hình; nhà phố ẩn khoảng lùi thì không bị tính là thiếu.
  Phần soát mâu thuẫn tách hàm riêng: thiếu trường thì bổ sung là xong, mâu thuẫn thì phải
  chọn bỏ một bên.
- `0101_tk_design_brief_structured.sql` — `structured` jsonb + hai cột SINH từ nó + trigger
  **riêng cho bảng này** đóng băng nội dung sau khi xác nhận. Cố ý KHÔNG mở rộng
  `freeze_record_identity`: hàm đó gắn với khoảng mười trigger đang chạy thật.
- `POST /design/brief/confirm` — đúc artifact khi XÁC NHẬN, và **tính lại điểm**, bỏ hẳn con
  số máy khách gửi lên. Lỗi hợp đồng dịch sang nhãn nghiệp vụ tiếng Việt.
- Cổng chặn Lớp 2 trong `design-pipeline.ts`, ngưỡng đọc từ `design_setting`. **Không có số
  dự phòng viết cứng**: cấu hình bị xoá nhầm phải làm hệ thống dừng và nói ra.

**Điều kiện ra — đã đạt:** một chỗ nhập duy nhất (tab Đầu bài) · 126 phép thử RLS xanh
nguyên trước và sau migration · artifact validate theo lược đồ, chạy thật đầu-cuối qua
`wrangler dev`.

Hai gạch đầu dòng "di trú dữ liệu phiếu cũ" và "kiểm kê module khác" của `08-milestones`
**thực tế đã rỗng**: CSDL có 0 dòng `design_briefs` và chỉ tab Đầu bài đọc bảng này. Điều này
cũng giải mâu thuẫn M2 trong `doc/design/README.md` (D4 nói không cần di trú, 3.1 nói phải
có script) — D4 đúng với hiện trạng.

**Q-17 đã trả lời — hợp đồng mở rộng luôn.** `DesignBrief` lên **1.1.0**: thêm nhóm
`massing` (số cánh nhà, hình bao chữ nhật/L/U/T, số lõi thang, thang phụ dịch vụ, tổ chức
sân vườn, quan hệ trong nhà với sân). Chỉ thêm trường tuỳ chọn nên tăng số phụ. Mọi trường
là **lựa chọn rời rạc**, không phải số đo — bộ giải mới là nơi gán kích thước. "Có sân trong
hay không" vẫn khai ở `required_spaces`; `massing.yards` khai sân **nằm đâu**.

⚠️ Còn chờ Haan: bốn danh sách lựa chọn và bảng trọng số chấm điểm chưa có kiến trúc sư xác
nhận (Q-16 — sẽ rà cùng kiến trúc sư sau).

### Mốc 3 — Pipeline số hoá + Knowledge Base

Mỗi tệp là một bước Workflow; một tệp lỗi không giết cả mẻ. Trình trích xuất cho mặt bằng,
tổng mặt bằng, kết cấu, mặt cắt, bảng thống kê. Bảng ánh xạ lớp CAD. Kiểm tra chéo tự động →
`quality_score`. Suy ngược cây chia không gian từ hình học. Truy hồi ba tầng. Giao diện nhập
chú giải.

⚠️ Kho hồ sơ thực tế **dưới 50 bộ**. Hệ quả: không phân hạng A/B/C; thống kê thực nghiệm chưa
dùng được (giữ điểm nối trong hàm mục tiêu nhưng trả về rỗng); đánh giá bằng leave-one-out
chứ không tách bộ dự án mẫu riêng.

### Mốc 4 — Lớp 2: Space Program (TK-11) — ✅ XONG cho demo (06/09/2026: dồn phòng theo ngưỡng đầy sàn, bổ sung phòng — `kb/space_norms.yaml` mục `allocation`)

Phải **chạy được với Knowledge Base rỗng** (quy tắc + mô hình ngôn ngữ, chất lượng thấp hơn
nhưng đúng hợp đồng).
**Ra:** kiến trúc sư đánh giá hợp lý trên ≥70% kho đánh giá.

**Đã xong** (`workers/src/design/program/`, `kb/space_norms.yaml`, migration `0102`):

- Engine soạn chương trình không gian, **hàm thuần và tất định** — chạy thật qua bộ giải
  CP-SAT trong Container, ra mặt bằng đủ ba tầng.
- **Ba nguồn tri thức, thứ tự ưu tiên cưỡng chế trong mã**: quy chuẩn (`rules/**`) > thống kê
  thực nghiệm > chuẩn nghề nghiệp (`kb/space_norms.yaml`). Diện tích tối thiểu luôn lấy giá
  trị lớn nhất của hai nguồn đầu.
- **Quan hệ liền kề sinh từ rule pack**, không khai lại lần thứ hai ở đâu.
- **Hook thống kê thực nghiệm** (`kb_room_area_stats`): ngưỡng đếm số **công trình**, cưỡng
  chế bằng `HAVING` trong SQL. Trả rỗng ở quy mô kho hiện tại — đúng thiết kế, không phải
  việc còn dở (`06-knowledge-base` 6.0b).
- Quy nhu cầu viết bằng lời về mã không gian: lượt bảng bí danh chạy được ngay; lượt mô hình
  ngôn ngữ bị chặn vì đầu bài là dữ liệu hạng 1 còn cấu hình demo đặt `max_data_class: 3`.
  Có kiểm thử canh chính hàng rào đó.
- **Hai endpoint và tab giao diện**: `GET /design/program/:projectId` tính lại chương trình của
  đầu bài đang hiệu lực; `POST /design/program/generate` chốt thành artifact và chuyển bản đang
  hiệu lực. Tab **Chương trình không gian** trong Hồ sơ 360° của dự án thiết kế — mẫu bố cục 3,
  không phát sinh mẫu mới nên không vướng câu hỏi Q-1.

**Còn lại:**

- Bộ đo leave-one-out để đối chiếu với ngưỡng 70% — cần kho hồ sơ cũ, đang chờ tệp `.dwg`.
- Chuẩn diện tích cần kiến trúc sư soát (câu hỏi Q-18 trong `TIEN_DO_THIET_KE.html`).
- Sửa chương trình không gian bằng tay (thêm/bớt phòng, đổi diện tích) — chưa làm; hiện chỉ
  xem và chốt. Sửa tay cần một artifact `space_program` do người soạn, tức một nhánh lineage
  riêng; để lại tới khi có yêu cầu thật.

### Mốc 5 — Lõi Lớp 3 cho nhà phố (TK-12, TK-13) — ✅ XONG theo phương án demo (06/09/2026), trừ trình chỉnh sửa Konva (cắt có chủ đích — `doc/design/14-phuong-an-demo.md` 14.3)

Đặt khối trong lô · sinh cấu trúc bố cục + kiểm tra · **CP-SAT liên tầng trong Container**,
cơ chế giả định → báo cáo vô nghiệm · tinh chỉnh hình học · trình chỉnh sửa mặt bằng (Konva)
· phân tích tác động · **gói trình khách để chốt phương án sớm** (mặt bằng tô màu công năng,
khối ba chiều đơn giản, bảng so sánh) · **xuất DXF** · bảng thống kê tự sinh · phát hành bộ
môn kiến trúc.

**Ra:** kiến trúc sư chọn một phương án của hệ thống làm điểm khởi đầu trên **≥40%** (cổng
chặn; mục tiêu 70% theo dõi qua bộ đo). Đổi 3 tầng → 4 tầng: sinh lại dưới 60 giây, cả 4 tầng
nhất quán, lõi thang và trục kết cấu giữ nguyên. DXF mở được trong AutoCAD.

### Mốc 6 · 6b · 6c — giai đoạn sau

Mặt đứng, mặt cắt, mô hình ba chiều có vật liệu, phối cảnh qua dịch vụ ảnh (Mốc 6) → nâng
chất lượng đầu ra kiến trúc lên mức bản vẽ kỹ thuật (6b) → phối hợp liên bộ môn: kỹ sư kết
cấu và điện nước làm việc trên nền hình học chung, phát hiện xung đột, phát hành theo từng bộ
môn với chữ ký riêng (6c).

**Mốc 6b không bỏ qua được** — không thể mời kỹ sư kết cấu vào làm việc trên một nền hình học
còn ở mức phương án sơ bộ.

### Mốc 7 · 8 · 9 — giai đoạn sau

Biệt thự và nhà vườn (nhiều cánh nhà, hình L/U/T, khoảng lùi bốn phía, khoảng rỗng là sân
trong) · mở cho khách trên website (dự án nháp, giới hạn tần suất, chống lạm dụng) · bóc tách
khối lượng sơ bộ, thư viện phong cách, tenant thứ hai.

**Ngưỡng chấp nhận của biệt thự đặt BẰNG nhà phố.** Nếu đo thấy thấp hơn, cách xử lý là làm
giàu đầu vào ở Lớp 1 và bổ sung quy tắc — **không phải hạ ngưỡng**. Hạ ngưỡng là biến chênh
lệch tạm thời thành chuẩn mực vĩnh viễn.

## 🚧 Ranh giới bắt buộc

- Mọi phương án của hệ thống ở trạng thái **NHÁP/ĐỀ XUẤT** cho tới khi người có thẩm quyền
  xác nhận qua đúng luồng phê duyệt TK-03.
- **Kết cấu, cơ điện, phòng cháy chữa cháy luôn do kỹ sư có chứng chỉ hành nghề xác minh và
  ký.** Engine chuẩn bị nền hình học và phát hiện xung đột; nó **không** tính tiết diện,
  không tính tải trọng, không kết luận về phòng cháy.
- Một lần phát hành mang **đúng một** bộ môn. Trưởng phòng Thiết kế không ký được hồ sơ kết
  cấu, kể cả khi họ là trưởng phòng.
- Giai đoạn demo: mô hình ngôn ngữ **chỉ chạy dữ liệu giả lập hoặc ẩn danh**. Đầu bài khách
  hàng là dữ liệu hạng 1; gói Gemini miễn phí có thể được dùng để huấn luyện.
- **Xuất DXF một chiều.** Không nhập ngược tệp CAD đã sửa — mất toàn bộ siêu dữ liệu ràng buộc.
- **Cấm hard-code ngưỡng quy chuẩn.** Quy tắc kiến trúc là dữ liệu YAML, kiến trúc sư phải đọc
  và sửa được.

## Đầu ra chuẩn (TK-17)

Sáu loại gắn với mỗi dự án thiết kế: Design Brief · Space Program · **mặt bằng chỉnh sửa được
(dữ liệu hình học, KHÔNG phải ảnh)** · phương án kiến trúc · mô hình ba chiều tham số · ảnh
phối cảnh — mỗi loại đi qua đúng luồng góp ý và phê duyệt TK-03.

---

# PHASE 6 — Phạm vi mới của bộ tài liệu v1.4

> Thứ tự bám **IPD v1.1 §3.2**, được sắp lại có chủ đích: hai ưu tiên số một của hai bộ phận hiện
> trường (đề nghị – phê duyệt của công trường; vòng đời tài sản cho thuê của xưởng) hoàn thành **SỚM**,
> không dồn về cuối như bản v1.0.
>
> Mỗi khối chỉ liệt kê phần **CÒN THIẾU** so với mã nguồn hiện có; phần đã làm ở Phase 3 không nhắc lại.

## 6.0 ✅ Nền tảng xuyên suốt (ĐÃ XONG 05/09/2026)

Migration `0110` → `0117`. Chi tiết ở hộp cảnh báo đầu tài liệu.

Ba thứ **cố ý để RỖNG**, đừng "sửa" bằng cách điền số: `sla_definitions` (chờ BGĐ ban hành thời hạn),
`internal_rental_price` · `compensation_price_table` · `defect_rate_threshold` · `min_samples_for_metric`
(chờ BGĐ / chờ kiểm kê). Điền một giá trị mặc định vào đây là biến một ô trống nhìn thấy được thành một
con số sai trông như đã được duyệt.

## 6.1 TC nhóm A + B — chuẩn bị, kế hoạch, vận hành hằng ngày

**Đầu ra:** chỉ huy trưởng nhập được nhật ký ngày trên điện thoại và chốt ngày, dưới ngưỡng thao tác.

| Mã                   | Nội dung                                                                                                                                                 | Bảng mới (BSD v1.1 4.6)                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| TC-01 (phần còn lại) | Hiển thị nội dung **còn thiếu/chưa xác nhận** trong hồ sơ bàn giao thay vì để công trường tự phát hiện                                                   | `site_handover_checklists`                                                                   |
| TC-02                | Khảo sát và tiếp nhận mặt bằng: biên bản, ảnh hiện trạng, hạ tầng tạm, lán trại                                                                          | `site_mobilizations`                                                                         |
| **TC-03**            | **Bản vẽ đang có hiệu lực tại hiện trường** + xác nhận đúng bản vẽ TRƯỚC khi giao việc. Sự cố thật: tổ đội thi công theo bản vẽ cũ, phải tháo dỡ làm lại | `site_drawings`, `drawing_acknowledgements`                                                  |
| TC-04                | Phiếu giao việc theo hạng mục/tổ đội, kèm biện pháp và cảnh báo an toàn                                                                                  | `work_assignments`                                                                           |
| **TC-05** 🔒         | Nhật ký thi công điện tử — **nguồn duy nhất** sinh ra nhật ký, báo cáo ngày và báo cáo tuần                                                              | `site_logs` (đã có) + `site_log_labor`, `site_log_equipment`, `site_log_works`               |
| TC-06                | Ảnh có ngữ cảnh (gắn hạng mục, vị trí, thời điểm)                                                                                                        | `site_photos`                                                                                |
| TC-07                | Hoạt động ngoại tuyến thật (Dexie/IndexedDB + `POST /api/sync/batch`)                                                                                    | —                                                                                            |
| TC-08                | Ghi nhận công tại công trường                                                                                                                            | `site_attendance` — ⛔ **chờ NVG chốt phương thức** (đang cân nhắc ảnh + thời gian + vị trí) |

## 6.2 MH + TC nhóm C — đề nghị vật tư và **hạn xử lý hai chiều**

**Đầu ra:** luồng đề nghị – phê duyệt hai chiều công trường ↔ văn phòng chạy được, có đồng hồ hạn xử lý.

| Mã           | Nội dung                                                                                                                                          | Bảng mới                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **TC-09** 🔒 | Lập đề nghị vật tư từ công trình                                                                                                                  | `material_requests`                     |
| **TC-10** 🔒 | **Theo dõi trạng thái đề nghị + cảnh báo quá hạn** — ai đang giữ, chờ bao lâu, hạn xử lý còn lại. **Ưu tiên số một của công trường**              | `request_tracking`, `request_reminders` |
| TC-11        | Tiếp nhận vật tư tại công trình                                                                                                                   | `site_material_receipts`                |
| TC-12        | Đối chiếu ngân sách với chi phí thực tế                                                                                                           | `site_cost_entries`                     |
| MH-10        | Quy cách kỹ thuật bắt buộc khi mua nguyên liệu NVS (mác thép, đường kính, độ dày, dung sai, mạ kẽm) — quyết định khả năng đạt chứng chỉ kiểm định | `material_specs`                        |

**Màn hình:** mẫu bố cục **4.7 Request Tracker** (mới) — dành cho người GỬI, đối xứng với Hộp thư Phê
duyệt. Thanh tiến trình chỉ ra bước đang tắc; nút "Thúc" ghi vào lịch sử hồ sơ.

⛔ **Điều kiện tiên quyết:** BGĐ ban hành thời hạn cam kết phản hồi (`sla_definitions`). Không có nó thì
cảnh báo quá hạn không có căn cứ để chạy — nguyên văn PRD v1.4 Mục 10.

## 6.3 KHO — bổ sung

| Mã         | Nội dung                                                                            | Bảng mới                 |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------ |
| KHO-01     | Kho **đa địa điểm**, gồm 3 cơ sở NVS (PRD Phụ lục D.5)                              | — (mở rộng `warehouses`) |
| **KHO-11** | **Chốt số dư ban đầu** trước khi vận hành; sau khi chốt chỉ biến động bằng chứng từ | `opening_balances`       |
| KHO-06     | Mở rộng vòng đời giàn giáo lên **11 trạng thái**; tổng theo mã phải luôn cân        | — (mở rộng)              |

## 6.4 SX cụm D — vòng đời tài sản cho thuê 🔒 **ƯU TIÊN SỐ MỘT CỦA NVS**

**Đầu ra:** luồng đơn thuê giàn giáo chạy trọn (luồng #2 của Mốc M2).

| Mã    | Nội dung                                                                                                                                                                   | Ghi chú                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SX-15 | **Sổ cái tài sản thời gian thực** — mỗi mã đang ở kho / xưởng / khách nào / công trình nào; dùng được / đang sửa / chờ thanh lý / thiếu chưa thu hồi                       | Màn hình mẫu **4.9 Asset Ledger** (ma trận). Dòng tổng mỗi mã phải luôn cân, không cân thì cảnh báo ngay trên dòng |
| SX-16 | **Đơn thuê theo số dư động** — chuỗi sự kiện: giao lần đầu → giao thêm → trả bớt → gia hạn → điều chuyển → thu hồi cuối                                                    | Giải luôn câu hỏi treo #26 (giao thêm giữa kỳ)                                                                     |
| SX-17 | **Tính tiền thuê theo số dư TỪNG NGÀY**, không tính gộp                                                                                                                    | Bảng đối soát sinh tự động theo kỳ → Kế toán (`rental_settlements`)                                                |
| SX-18 | Thu hồi, kiểm đếm, phân loại **4 nhóm**; biên bản có ảnh và chữ ký hai bên khi có thiếu/hỏng                                                                               | `scaffolding_returns`, `scaffolding_return_lines`                                                                  |
| SX-19 | Tính bồi thường thiếu – hỏng theo bảng giá cấu hình. **Chưa thống nhất thì KHOÁ số liệu gốc** — trạng thái `disputed`, chỉ lập được chứng từ điều chỉnh mới có người duyệt | `compensation_claims`, `compensation_adjustments`. Trạng thái tím đã sẵn sàng (0110)                               |
| SX-20 | Sửa chữa hàng thu hồi, tập hợp chi phí theo lô và theo khách/công trình                                                                                                    | `repair_orders`                                                                                                    |
| SX-21 | **Giàn giáo cho công trình nội bộ** — chứng từ đầy đủ như khách ngoài, **bắt buộc ghi nhận giá trị** theo giá thuê nội bộ (QĐ-6)                                           | `rental_agreements.is_internal`. ⚠️ Báo cáo hợp nhất toàn NVG **phải LOẠI TRỪ** để không đếm hai lần doanh thu     |

## 6.5 TC nhóm D + E — nghiệm thu, RFI, phát sinh, an toàn, bàn giao

**Đầu ra:** luồng vận hành công trường hằng ngày chạy trọn (luồng #4 của Mốc M2).

| Mã           | Nội dung                                                                                                         | Bảng mới                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **TC-13** 🔒 | Nghiệm thu bằng **checklist điện tử** kèm ảnh                                                                    | `acceptance_checklists`, `acceptance_checklist_results` |
| TC-14        | Danh sách tồn tại (punch list)                                                                                   | `site_issues`                                           |
| **TC-15**    | **Yêu cầu làm rõ kỹ thuật (RFI)** có định tuyến và thời hạn — thay việc hỏi bản vẽ qua Zalo                      | `rfis`                                                  |
| **TC-16**    | Quản lý thay đổi và phát sinh, **chụp ảnh TRƯỚC KHI bị che khuất** — khảo sát nêu là nguồn tranh chấp thường gặp | `site_variations`                                       |
| TC-17        | Khối lượng tổ đội: đo bóc, xác nhận, **chặn khối lượng chưa nghiệm thu khỏi bảng thanh toán**                    | `subcontractor_quantities`                              |
| **TC-18**    | An toàn lao động, sự cố, tình huống suýt tai nạn                                                                 | `safety_records`, `safety_incidents`                    |
| TC-19        | Giàn giáo và thiết bị mượn tại công trường, theo nguồn cấp — khớp SX-21                                          | `site_scaffolding_holdings`                             |
| TC-20        | Bàn giao, bảo hành, truy vết tranh chấp                                                                          | `site_handovers` (+ `warranty_claims` đã có)            |

## 6.6 SX cụm A, B, C, E — sản xuất và giá thành

**Đầu ra:** luồng lệnh sản xuất chạy trọn (luồng #3 của Mốc M2).

⛔ **Chặn bởi dữ liệu, không phải bởi code** — xem bảng câu hỏi cuối tài liệu: sản lượng/tháng và phân
loại bán–thuê từng mã, bộ định mức hiện hành, ngưỡng tỷ lệ lỗi.

| Cụm                            | Mã            | Bảng mới                                                                                                                                                                     |
| ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — danh mục                   | SX-01 → SX-03 | `products`, `product_specs`, `product_drawings`, `product_certificates` (khởi tạo từ PRD Phụ lục D)                                                                          |
| B — kế hoạch, lệnh             | SX-04 → SX-08 | `production_plans`, `production_order_versions`, `boms`, `bom_lines`, `production_material_issues`                                                                           |
| C — thực hiện, chất lượng, máy | SX-09 → SX-14 | `production_stages`, `production_stage_logs` (9 công đoạn, cấu hình được), `quality_inspections`, `quality_defects`, `machines`, `machine_maintenances`, `machine_incidents` |
| E — giá thành                  | SX-22         | `product_costs` (**mẫu RLS D**), `cost_recalculation_logs` — tính lại được **bất kỳ lúc nào** theo giá vật tư tại thời điểm chọn                                             |

## 6.7 KT, NS, BC — bổ sung

| Mã                 | Nội dung                                                                                                                                                                                   | Bảng mới                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| KT — đối soát thuê | Đối soát thuê giàn giáo theo kỳ                                                                                                                                                            | `rental_settlements`, `cost_entries.is_internal_transfer` |
| NS-04              | Nguồn dữ liệu chấm công cụ thể theo khối: văn phòng = máy chấm công; **xưởng = máy chấm công + xác nhận tổ trưởng**; công trường = tổ trưởng báo → kỹ thuật kiểm → chỉ huy trưởng xác nhận | —                                                         |
| NS-06              | Công thức lương cấu hình được                                                                                                                                                              | `payroll_rules`, `piece_rates` — ⛔ chờ quy chế lương     |
| NS-09              | Hồ sơ tổ đội / thầu phụ — khối lớn nhất về số người (~80/100 tại một công trường lớn), hồ sơ an toàn kiểm soát chặt như nhân sự công ty                                                    | `subcontractor_workers`                                   |
| **NS-12**          | **Giảm phụ thuộc vào một người** — người dự phòng + SOP + mẫu chuẩn lưu trong hệ thống. Cả Xưởng và Công trường đều nêu                                                                    | `role_backups`                                            |
| **BC-04**          | 4 báo cáo NVS chuyên biệt: giá thành theo lệnh · hiệu suất khai thác tài sản · thất thoát theo khách/công trình · tỷ lệ lỗi theo công đoạn/lô                                              | —                                                         |
| BC-05              | Thêm nguồn rủi ro: việc chờ duyệt quá hạn cam kết · đơn thuê quá hạn trả · sự cố an toàn chưa đóng                                                                                         | —                                                         |
| BC — Việc đang tắc | **Bảng Việc đang tắc toàn hệ thống**, nhóm theo phòng ban đang giữ hồ sơ (AFD 3.11 bước 4)                                                                                                 | `GET /api/sla/overdue`                                    |

## 6.8 Nguyên tắc lược đồ mới của BSD v1.1 — áp cho MỌI bảng ở Phase 6

- **KHÔNG lưu giá trị đã tính được từ chứng từ.** Số dư khách đang giữ, tồn theo trạng thái, tiền thuê
  luỹ kế đều tính **từ bảng sự kiện**. Cần tăng tốc thì dùng materialized view có lịch làm mới — **KHÔNG**
  dùng cột đếm cập nhật thủ công.
- **Mọi con số hiển thị phải truy ngược được về chứng từ gốc** — áp dụng đặc biệt cho Sổ cái tài sản và
  báo cáo lãi/lỗ. Mỗi ô của Asset Ledger phải bấm được để mở danh sách chứng từ tạo ra nó.
- **Giao dịch nội bộ** (`is_internal`) phải bị **loại trừ** khỏi báo cáo hợp nhất toàn NVG.
- **Chứng từ đã phát hành lưu SNAPSHOT giá trị tham số đã áp dụng**, không đọc lại tham số hiện hành.

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

# Thứ tự cắt giảm nếu phải cắt (IPD v1.1 4.3)

⚠️ **Thứ tự này ĐÃ ĐƯỢC ĐỊNH SẴN trong tài liệu, không phải để tự chọn lại.** IPD v1.1 4.3 nêu đích
danh hai nhóm; danh sách bên dưới bám theo đó.

**GIỮ BẰNG MỌI GIÁ — đây là ưu tiên số một mà chính hai bộ phận tự nêu trong khảo sát:**

- **SX-15 → SX-21** — toàn bộ vòng đời tài sản cho thuê (sổ cái, đơn thuê theo số dư động, thu hồi và
  kiểm đếm, bồi thường, sửa chữa, giàn giáo cho công trình nội bộ).
- **TC-05, TC-09, TC-10, TC-13** — liên thông công trường ↔ văn phòng (nhật ký điện tử, lập đề nghị vật
  tư, **theo dõi trạng thái đề nghị + cảnh báo quá hạn**, checklist nghiệm thu).

**CÓ THỂ HOÀN THIỆN DẦN SAU** — các phần này cần dữ liệu thực tế tích luỹ mới có ý nghĩa, làm sớm cũng
chỉ ra bảng trống:

- **SX-07** định mức · **SX-10** năng suất chuẩn · **SX-22** giá thành.

Ngoài hai nhóm trên, cắt từ trên xuống, **không bao giờ cắt Golden Path**:

1. TK-09 thư viện thiết kế · DA-11 AI bóc tách · NS-02 kanban tuyển dụng
2. `report_snapshots` · BC-04 báo cáo tồn kho nâng cao
3. KHO-09 offline thật → hạ xuống online-first + optimistic UI
4. Chiều sâu của các yêu cầu TC/SX không nằm trong nhóm "giữ bằng mọi giá"

**Không bao giờ cắt:** RLS + test RLS · audit/lịch sử · quản lý phiên bản tài liệu · luồng phê duyệt
theo hạn mức · truy vết ngược tới chứng từ gốc.

> Mục cũ ghi _"SX-01/SX-02 cắt trước, giữ SX-03 tài sản cho thuê"_. Câu đó **đã hết hiệu lực**: mã yêu
> cầu SX được đánh số lại hoàn toàn ở PRD v1.4 (SX-01→SX-03 cũ thành SX-01→SX-22 mới), nên đọc theo số
> cũ sẽ cắt nhầm. Tinh thần thì không đổi — tài sản cho thuê giữ, sản xuất và giá thành cắt sau.

---

# Quyết định còn cần Haan chốt

| #   | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Chặn                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | **KHO-09 offline-first** làm thật hay online-first + `client_generated_id`?                                                                                                                                                                                                                                                                                                                                                                                                                                               | Phase 3C                                                                 |
| 2   | **Phần mềm kế toán** chính thức (KT-08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 3D (endpoint export)                                               |
| 3   | **`unit_prices` dùng chung** DA/TK/MH hay NVO cần bảng riêng? (BSD 5)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Phase 2B                                                                 |
| 4   | **Quy tắc mã hoá** dự án/công trình/vật tư/hợp đồng — dùng bộ nào?                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Phase 2A                                                                 |
| 5   | **Hạn mức phê duyệt** tạm thời cụ thể theo vai trò × loại nghiệp vụ                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 0.2 (seed)                                                         |
| 6   | **Công thức lương** NS-06                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Phase 3E                                                                 |
| 7   | **Đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase 4C                                                                 |
| 8   | **Một hợp đồng mở được nhiều công trình không?** Hiện chặn ở một, để tránh bấm hai lần thành hai công trình chia nhau một bộ ngân sách                                                                                                                                                                                                                                                                                                                                                                                    | Phase 3A (đã làm, đổi được bằng một tham số)                             |
| 9   | **Ba con số suy luận của TC**: cửa sổ sửa nhật ký 24 giờ · ngưỡng cảnh báo ngân sách 90% · thang đánh giá tổ đội 1–5. Khảo sát 02/09/2026 **không** trả lời; chỉ ủng hộ gián tiếp con số 24 giờ (báo cáo ngày gửi trước 20 giờ tối)                                                                                                                                                                                                                                                                                       | Phase 3A (đã làm, sửa ở một chỗ)                                         |
| 10  | **Công trường đo tiến độ thế nào** — khảo sát 02/09/2026 trả lời một nửa: theo **hạng mục/đầu việc**, xác nhận bằng **khối lượng hoàn thành đã nghiệm thu**. Còn thiếu: mức chi tiết của kế hoạch (theo tuần hay theo mũi thi công) và ai cập nhật % hoàn thành                                                                                                                                                                                                                                                           | Phase 3A phần còn lại                                                    |
| 11  | **Một đề nghị mua có được đặt hàng nhiều nhà cung cấp không?** Hiện một đề nghị → một đơn hàng. Đề nghị 20 mặt hàng mà mỗi nhóm hàng một nhà cung cấp thì phải tách thành nhiều đề nghị                                                                                                                                                                                                                                                                                                                                   | Phase 3B (đã làm, mở rộng được)                                          |
| 12  | ~~**Ai ký nhận hàng tại công trường**~~ — **ĐÃ CHỐT** 02/09/2026: "thủ kho/người được giao phối hợp với kỹ thuật kiểm tra… Hai bên ký giao nhận". Nay mở thêm cho vai trò TC, **chỉ** với đề nghị mua gắn công trình                                                                                                                                                                                                                                                                                                      | Phase 3B (đã làm, sửa ở một hàm)                                         |
| 13  | **Bảng giá khung MH-09** — NVG thoả thuận theo tháng hay quý, điều chỉnh giá báo trước bao lâu?                                                                                                                                                                                                                                                                                                                                                                                                                           | Chặn MH-09                                                               |
| 14  | **Vật tư mua sẵn về kho chung rồi mới xuất cho công trình thì ghi chi phí lúc nào?** Mua theo đề nghị gắn công trình đã ghi khi hàng về (MH-07); còn hàng từ kho chung hiện KHÔNG về được ngân sách công trình nào. Đây là quyết định kế toán, không phải lựa chọn kỹ thuật                                                                                                                                                                                                                                               | Phase 3C (khoảng trống thật, chưa lấp)                                   |
| 15  | **Ngưỡng "tồn lâu, chậm luân chuyển" 90 ngày** — đang lấy bằng một quý cho khớp chu kỳ kiểm kê                                                                                                                                                                                                                                                                                                                                                                                                                            | Phase 3C (đã làm, sửa ở một chỗ)                                         |
| 16  | **Kho tự duyệt được chênh lệch kiểm kê tới 10 triệu** — theo hạn mức mặc định. Kho vừa đếm vừa duyệt là một chốt kiểm soát yếu, cần xác nhận NVG muốn vậy                                                                                                                                                                                                                                                                                                                                                                 | Phase 3C (đổi bằng cấu hình `approval_limits`)                           |
| 17  | **"Trưởng đơn vị" xác nhận công từng khối là ai?** — **hai trong ba khối ĐÃ CHỐT** 02/09/2026 (công trường → chỉ huy trưởng, xưởng → Phó Giám đốc). Khối **văn phòng** vẫn là suy luận                                                                                                                                                                                                                                                                                                                                    | Phase 3E (đã làm, sửa ở `confirm_timesheet_period`)                      |
| 18  | **Một ngày công bằng bao nhiêu giờ?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phase 3E (đã làm, hằng số ở `@nvg/shared/ns` + SQL, có test đối chiếu)   |
| 19  | **Ai duyệt yêu cầu tuyển dụng?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Phase 3E (đã làm, đổi bằng cấu hình `approval_limits`)                   |
| 20  | **Kế toán được đọc hồ sơ nhân sự tới đâu?** — chi tiết + giả định tạm ở 3E                                                                                                                                                                                                                                                                                                                                                                                                                                                | Phase 3E (đã làm, sửa ở `rls_employee_readable`)                         |
| 21  | ~~**Ai vận hành Module SX?**~~ — **ĐÃ CHỐT** 02/09/2026: thêm vai trò thứ 13 `SX` "Xưởng sản xuất – Cho thuê"; Kho giữ phần chứng từ và kiểm đếm                                                                                                                                                                                                                                                                                                                                                                          | Phase 3F (đã làm, đổi ở `db/src/seed/data.ts`)                           |
| 22  | ~~**Lô giàn giáo "mới" cho thuê được ngay không?**~~ — **ĐÃ CHỐT** 02/09/2026: **được**, hàng mới đã qua kiểm tra chất lượng trước khi nhập kho thành phẩm                                                                                                                                                                                                                                                                                                                                                                | Phase 3F (đã làm, sửa điều kiện `condition` trong hàm)                   |
| 23  | **Bảng `tasks` — bỏ hẳn hay dùng thật?** Có sẵn từ Phase 0, chưa từng được ghi/đọc. "Việc cần làm" ở Top Bar hiện chỉ là Hộp thư Phê duyệt (`usePendingApprovals`) — đủ cho luồng phê duyệt, nhưng việc không gắn phê duyệt (vd. nhắc giấy tờ sắp hết hạn) hiện chỉ SINH `notification`, không có nơi "xử lý xong thì biến mất" đúng nghĩa AFD 5.4                                                                                                                                                                        | Phase 1.4 (Trung tâm Thông báo đã xong ở Phase 3G, `tasks` vẫn để trống) |
| 24  | **`move_site_stage` (TC) có nên gửi thông báo khi chuyển bước không, và cho ai?** Hiện KHÔNG gửi ở bất kỳ bước nào — kể cả "tạm dừng thi công"/"hoàn thành" — trong khi mọi hàm ghi sự kiện lớn khác của module (`open_construction_site`, `handover_design_to_construction`, `generate_project_budget`) đều báo. Phát hiện ở đợt rà business logic 4B (28/08/2026)                                                                                                                                                       | Phase 3A (chưa vá — chờ xác nhận vai trò nhận)                           |
| 25  | **Dòng dự toán chi tiết có nên được phép dùng nhóm `chi_phi_chung`/`du_phong`/`loi_nhuan` không?** `COST_GROUPS` hiện cho phép, và khi dùng thì trùng mã với 3 khoản tổng nhập ở `save_estimate_costs` — đã vá phần mất tiền (0080, cộng dồn thay vì bỏ qua) nhưng chưa quyết có nên GIỚI HẠN dropdown chỉ còn 4 nhóm vật tư/nhân công/máy móc/thầu phụ hay để nguyên. Phát hiện ở đợt rà business logic 4B (28/08/2026)                                                                                                  | Phase 2B (đã vá phần mất tiền, còn câu hỏi UX)                           |
| 26  | **Giao thêm giữa kỳ trong một hợp đồng thuê tính tiền từ ngày nào?** Thu hồi nhiều đợt đã làm (0106). Giao thêm thì chưa: mỗi đợt giao cần ngày bắt đầu tính thuê riêng, nên phải thêm bảng đợt giao chứ không mở rộng `rental_agreement_items` được. Khảo sát Xưởng 02/09/2026 xác nhận đây là việc xảy ra thường xuyên ("giao thêm, trả bớt, điều chuyển, gia hạn")                                                                                                                                                     | Chặn phần còn lại của SX-03                                              |
| 27  | ~~**Công trình nội bộ mượn giàn giáo có tính giá thuê nội bộ không?**~~ — **ĐÃ CHỐT** 05/09/2026 (QĐ-6): việc **ghi nhận là BẮT BUỘC**; công trình nội bộ lập chứng từ đầy đủ như khách ngoài (SX-21), có thể không phát sinh thanh toán thật nhưng số liệu phải có để phân bổ đúng chi phí công trình. **Mức giá** do BGĐ quyết — tham số `internal_rental_price`, đang RỖNG                                                                                                                                             | Phase 6.4 (SX-21)                                                        |
| 28  | **Catalogue + định mức + tỷ lệ lỗi + thất thoát/năm** — **hai trong bốn ĐÃ CÓ MỘT PHẦN** 05/09/2026. _Catalogue_: PRD Phụ lục D có mã, quy cách, nguyên liệu, chứng chỉ, 3 địa điểm — nhưng **KHÔNG có sản lượng/tháng và phân loại bán/cho thuê từng mã**. _Định mức_: biết được nó nằm trên file máy tính + bản giấy do **trưởng bộ phận sản xuất** giữ, và **giá biến động liên tục** — nhưng chưa có chính bộ định mức. _Tỷ lệ lỗi_ và _thất thoát_: vẫn trống, phiếu ghi rõ "không nên ước lượng một con số để điền" | Phase 6.6 (SX cụm A/B/E)                                                 |
| 29  | **Hồ sơ công trường nào bắt buộc giữ bản giấy có chữ ký gốc?** Cần danh sách cụ thể để biết chỗ nào ký điện tử được, chỗ nào chỉ đính kèm bản chụp — liên quan trực tiếp tới PRD 2.3 "không bắt nhập liệu hai lần"                                                                                                                                                                                                                                                                                                        | Chặn thiết kế màn hình nghiệm thu và nhật ký của TC                      |
| 30  | **Thời hạn cam kết phản hồi của từng phòng ban** (MỚI, PRD v1.4 Mục 10). Bảng `sla_definitions` đã dựng và **cố ý để RỖNG** — nạp sẵn một con số sẽ tạo đồng hồ đếm ngược trông như đã cam kết, và người duyệt bị gắn nhãn quá hạn theo thời hạn chưa ai ký                                                                                                                                                                                                                                                               | ⛔ **Điều kiện tiên quyết của Phase 6.2** (TC-10)                        |
| 31  | **Bảng giá bồi thường giàn giáo thiếu – hỏng theo mã** (MỚI, SX-19). Khởi tạo tạm để vận hành được, admin sửa sau — tham số `compensation_price_table`, đang RỖNG                                                                                                                                                                                                                                                                                                                                                         | Phase 6.4 (SX-19)                                                        |
| 32  | **Ngưỡng tỷ lệ lỗi sản xuất cho phép** theo nhóm sản phẩm / giai đoạn / lô (MỚI, SX-12) — tham số `defect_rate_threshold`, đang RỖNG                                                                                                                                                                                                                                                                                                                                                                                      | Phase 6.6 (SX-12)                                                        |
| 33  | **Phương thức ghi nhận công tại công trường** (MỚI, TC-08 + NS-04). Chưa chốt; phương án đang cân nhắc là **ảnh có gắn thời gian và vị trí**                                                                                                                                                                                                                                                                                                                                                                              | ⛔ Chặn TC-08 ở Phase 6.1                                                |
| 34  | **Số bản ghi tối thiểu để hiện một chỉ số** thay vì "Chưa đủ dữ liệu" (MỚI, BSD v1.1 Mục 5) — tham số `min_samples_for_metric`, đang RỖNG. Cố ý không hard-code trong truy vấn báo cáo                                                                                                                                                                                                                                                                                                                                    | Phase 6.7 (BC-04)                                                        |
| 35  | **Địa chỉ xưởng chính của NVS** — Catalogue ghi **hai địa chỉ khác nhau trong cùng tài liệu** (Xã Tây Sơn vs Xã Vũ Sơn, cùng huyện Kiến Xương). Thêm nữa: Phụ lục D.5 ghi "Thái Bình" nhưng tỉnh này **đã sáp nhập vào Hưng Yên từ 2025** (quyết định T9) — seed `warehouses` phải dùng tên đơn vị hành chính hiện hành                                                                                                                                                                                                   | ⛔ Chặn KHO-01 đa địa điểm ở Phase 6.3                                   |
| 36  | **Catalogue phát hành 2022** — cần NVS xác nhận danh mục còn đúng (mã nào đã ngừng, mã nào mới) và chứng chỉ kiểm định còn hiệu lực hay không                                                                                                                                                                                                                                                                                                                                                                             | Phase 6.6 (SX-01, SX-13)                                                 |
| 37  | **Tổ trưởng sản xuất** là vai trò thứ 15 mà AFD v1.1 2.3 liệt kê ("Việc của tổ hôm nay", bố cục di động) nhưng **chưa tạo**. `CHT` đã tạo ở đợt này vì mẫu RLS E cần nó; vai trò tổ trưởng thì chờ tới đợt SX cụm C mới có màn hình để gắn vào                                                                                                                                                                                                                                                                            | Phase 6.6                                                                |
