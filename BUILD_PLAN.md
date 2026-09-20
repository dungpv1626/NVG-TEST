# BUILD_PLAN.md — Kế hoạch triển khai theo luồng phụ thuộc

> Tài liệu làm việc của đội triển khai (không phải 1 trong 6 tài liệu chính thức trong `doc/`).
> Phase chia theo **phụ thuộc kỹ thuật, không theo lịch**. Phân bổ module theo giai đoạn bám PRD 4.
>
> Bản này đã rút gọn: mục ĐÃ XONG chỉ còn tóm tắt + tệp chính + bẫy còn hiệu lực. Nhật ký chi tiết
> cách làm, số đo và lịch sử sửa nằm trong git (trước commit rút gọn: `6d9ce10`).

## Bản đồ phụ thuộc tổng thể

```
P0 Nền móng ──► P1 Primitives ──┬─► P2 Xương sống thương mại (GĐ1)
                                │     CRM ─► DA ─┐
                                │       └──► TK ──┼─► HD ─► BC(cơ bản)
                                │                 ▼
                                └─► P3 Vận hành (GĐ2)
                                       TC ─► MH ─► KHO ─► KT
                                       NS (độc lập)   SX ◄─┘
                                       └──────► BC (đầy đủ)
                                                  ▼
                                       P4 Liên kết chéo + Demo (GĐ3)
                                                  ▼
                                       P5 AI Design Engine    P6 Phạm vi mới v1.4
```

**Quy tắc vàng:** không viết đoạn code thứ hai giống đoạn đã viết ở module trước — nâng thành
primitive trong `shared/` hoặc `web/src/components/`.

---

## ⚠️ ĐỌC TRƯỚC — phạm vi đã NỞ RA sau bộ tài liệu v1.4

Phase 0 → 4 viết theo **PRD v1.3**. Bộ tài liệu v1.4 đã **thay toàn bộ** phạm vi hai module:

- **TC**: TC-01→TC-08 → **TC-01→TC-20** (~28 bảng, BSD v1.1 4.6). Mã nguồn: 6 bảng, phủ lõi phạm vi CŨ.
- **SX**: SX-01→SX-03 "GĐ 3, định hướng" → **SX-01→SX-22** (~29 bảng, BSD v1.1 4.12), **"GĐ 2, đầy đủ"**. Mã nguồn: 4 bảng, phủ lõi phạm vi CŨ.

**Dấu ✅ ở 3A và 3F đúng với phạm vi CŨ, không phải "module đã xong".** Phần còn thiếu ở **Phase 6**.
Nền tảng xuyên suốt của v1.4 đã xong (migration `0110`→`0117`, xem 6.0). Đối chiếu TRƯỚC–SAU:
`doc/CHANGELOG_NVG_docs.md`.

---

# PHASE 0 — Nền móng kỹ thuật ✅

Đăng nhập, menu theo vai trò, chuyển pháp nhân, một bảng chạy hết vòng đời (tạo → RLS → audit).

### 0.1 Hạ tầng & repo

Monorepo `web/ workers/ db/ shared/ doc/`, TypeScript strict, Vite + React 18 + Tailwind + shadcn/ui,
Hono + `wrangler.jsonc` (`nodejs_compat`), Drizzle + drizzle-kit. **Không commit secret.**

### 0.2 Bảng nền tảng (BSD 3.2)

`companies` · `users` · `roles` · `permissions` · `user_companies` · `approval_limits`. NVG là mã tổng
hợp, **không phải pháp nhân giao dịch**.

### 0.3 Xác thực (BSD 3.1)

Supabase Auth email/mật khẩu, **không tự đăng ký công khai** — Admin tạo tài khoản, gửi email mời.

### 0.4 RLS — hạ tầng phân quyền (BSD 3.3)

Hàm dùng lại (`auth_company_ids`, `auth_has_role`, …) + helper áp mẫu A/B/C/D — không viết tay từng policy.

### 0.5 Bộ test RLS

Mỗi bảng nhạy cảm giả lập ≥5 vai trò. **RLS quá lỏng không có triệu chứng** — không lùi phần này.

### 0.6 Design tokens & format

Token màu/chữ nay theo `DESIGN_SYSTEM.md`; hàm format ngày/số/tiền ở `shared/`.

### 0.7 App Shell (AFD 2.1–2.4)

Sidebar · Topbar · Breadcrumb · Content · Panel ngữ cảnh. Chuyển pháp nhân không tải lại trang; menu
**ẩn** theo quyền.

---

# PHASE 1 — Primitives & hạ tầng xuyên suốt

### 1.0 Chuẩn PWA và bố cục di động ✅

`vite-plugin-pwa` cho **toàn bộ** ứng dụng, cập nhật kiểu hỏi trước (`registerType: 'prompt'`), thanh
điều hướng dưới, danh sách thành thẻ, vùng bấm ≥40px, tách gói theo màn hình.
🚫 KHÔNG cache dữ liệu Supabase trong service worker. Offline thật = KHO-09, chờ quyết định.

### 1.1 Component primitives ✅

`EntityTable` · `EntityDetail` · `EntityForm`/`WizardForm` · `ApprovalInbox` · `StatusLozenge` ·
`KanbanBoard` · `EmptyState`/`Skeleton`/`ErrorState`.

### 1.2 Drizzle helpers ✅

`auditColumns()` · `softDelete()` · `versionColumns()` · `companyScoped()` · `moneyColumn()` · `statusColumn()`.

### 1.3 Hạ tầng tài liệu & phiên bản (NEN-05, NEN-06) ✅

`documents` + `document_versions` + Supabase Storage. Mọi module dùng chung — **không dựng cơ chế phiên bản thứ hai**.

### 1.4 Hạ tầng thông báo & việc cần làm (NEN-03, NEN-04) — ⏳ Trung tâm Thông báo xong, `tasks` chưa dùng

- ✅ `notifications` · `audit_logs` · `sensitive_access_logs`. Chỉ ghi qua `create_notification()`
  (SECURITY DEFINER, `0021_da_rls.sql`). Chuông Top Bar: `web/src/hooks/use-notifications.ts` +
  `web/src/components/layout/notification-bell.tsx`.
- ⏳ **Chưa dùng Supabase Realtime** — tạm `refetchInterval: 60s`; `notifications` chưa vào publication
  `supabase_realtime`. Cố ý lùi lại.
- 🚫 **`tasks` có bảng từ Phase 0 nhưng chưa từng được ghi/đọc.** "Việc cần làm" hiện trỏ vào
  `usePendingApprovals()`. Việc không gắn phê duyệt (vd. giấy tờ sắp hết hạn) chỉ sinh `notification`,
  không có nơi "xử lý xong thì biến mất" (AFD 5.4). Bỏ hẳn hay dùng thật — **hỏi Haan** (câu hỏi 23).
  Khảo sát công trường cho nó lý do tồn tại: TC-10 (xem 6.2).

### 1.5 Tìm kiếm toàn hệ thống (AFD 5.3) — ✅ xong, phủ 10/10 module có "hồ sơ"

Hàm `global_search` (`0057`, mở rộng ở `0061`, `0070`) gọi thẳng qua PostgREST RPC, SECURITY INVOKER —
phạm vi do RLS từng bảng nguồn quyết. Test: `db/src/__tests__/search.test.ts`.

- ⚠️ Dùng ILIKE, **không phải `tsvector`** — đủ ở quy mô demo, nâng cấp nếu chậm thật.
- ⚠️ Cột trả về cố ý tránh cột nhạy cảm (`employees` không lương/căn cước; `payment_requests` không `amount`).
- Ba màn hình Kho chưa có trang chi tiết: kết quả trỏ về danh sách kèm `?ma=` / `?mo=` để tự lọc/mở dòng.

### 1.6 Seed script v1 ✅

Pháp nhân, người dùng đủ vai trò, roles + permissions + approval_limits. Chạy từ máy sạch bằng 1 lệnh.

---

# PHASE 2 — Xương sống thương mại (PRD Giai đoạn 1) — ✅ ĐẠT

Thứ tự: **CRM → (DA ∥ TK) → HD → BC**. Kiểm chứng bằng `db/src/__tests__/golden-path.test.ts` (CSDL thật,
đúng vai trò, không `service_role`). Còn nợ: bản E2E Playwright của hai Golden Path (4E).

### 2A. Module CRM (BSD 4.2) ✅

Pipeline Kanban 6 giai đoạn, báo giá có phiên bản + duyệt nội bộ, bàn giao sang DA/TK kèm lịch sử.
⚠️ RLS `opportunities`: **B khi nháp, A sau khi bàn giao**.

### 2B. Module DA (BSD 4.3) ✅ phần lõi

Gói thầu, bóc tách gắn phiên bản bản vẽ, đơn giá dùng chung, dự toán có phiên bản, duyệt giá qua Hộp thư
chung, sinh ngân sách thi công (DA-09).

- **Mẫu D làm lần đầu ở đây** — khuôn dùng lại cho mọi bảng nhạy cảm: `REVOKE` quyền đọc CỘT, dữ liệu chỉ
  ra qua hàm SECURITY DEFINER có gọi `log_sensitive_access`. Bảng toàn nhạy cảm thì chặn mức DÒNG.
- ⏳ DA-10 (đối chiếu dự toán với chi phí thực tế). ⏸ DA-11 (Gemini đọc bản vẽ) — lùi được.

### 2C. Module TK (BSD 4.4) ✅ phần lõi

Đầu bài có phiên bản, khảo sát kỹ thuật, phương án + góp ý khách, phiên bản bản vẽ theo bộ môn, tiến độ
3 bộ môn, yêu cầu thay đổi, bàn giao thi công. **TK-07 mở rộng DA** (`estimates`/`boq_items` nhận hai loại
hồ sơ cha, CHECK đúng một) — dự toán ở `components/estimate/` dùng chung.

- ⏳ TK-09 thư viện thiết kế — lùi được. TK-10→TK-17 ở Phase 5.
- ⚠️ **Hai chỗ cố ý lệch BSD 4.4, chờ Haan cập nhật tài liệu:** `design_briefs` là bảng có phiên bản
  (BSD ghi một trường); `design_versions` trỏ sang `documents` (BSD ghi `file_url`). Thêm `design_surveys`,
  `design_reviews` mà BSD không liệt kê nhưng PRD yêu cầu.

### 2D. Module HD (BSD 4.5) ✅

Soạn từ hồ sơ nguồn (không có màn hình "Tạo hợp đồng" riêng), checklist 8 nhóm điều khoản, trình ký theo
hạn mức, phát sinh HD-04, quyết toán/hủy. `collected_amount` do trigger KT cộng từ `receivable_settlements`.

- ⚠️ **Bẫy RLS đã bịt (0028), áp cho mọi bảng có cột bước/trạng thái:** `USING` không chặn được việc ĐỔI
  bước — phải có `WITH CHECK` hoặc trigger `stage_changes_via_functions_only` (chặn khi
  `current_user = 'authenticated'`, cho qua hàm SECURITY DEFINER). Bảng mới có cột bước thì gắn trigger này.
- ⚠️ **Cố ý lệch AFD 2.3, chờ Haan xác nhận:** ai sở hữu hồ sơ nguồn thì soạn được hợp đồng từ hồ sơ đó
  (AFD 2.3 chỉ cho "xem", nhưng 3.1/3.2 bắt chính họ soạn).

### 2E. Module BC — mức cơ bản ✅

Dashboard chỉ số thật, mỗi con số dẫn tới danh sách lọc sẵn (đếm bằng cùng hàm của danh sách). Sửa lỗi
"Toàn NVG" trắng màn hình → `useCompanyScope` / `withCompanyScope`; `EntityTable` nhận `?trang-thai=`.

---

# PHASE 3 — Vận hành, hậu cần, tài chính (PRD Giai đoạn 2)

Thứ tự: `TC → MH → KHO → KT`. `NS` độc lập. `SX` sau `KHO`.

### 3A. Module TC (BSD 4.6) ✅ phần lõi (phạm vi CŨ)

Đã có: `construction_sites` · `site_logs` · `acceptance_records` · `subcontractors` · `warranties` ·
`warranty_claims`. Mở công trình từ hợp đồng / bàn giao thiết kế; nhật ký ngày (chỉ người ghi sửa, trong
24 giờ); nghiệm thu — chỉ nghiệm thu với **chủ đầu tư** mới báo Kế toán thu tiền; `construction_budget_status`
(cảnh báo 90%); `project_budgets` nhận `design_project_id` cho NVO; tab Đề nghị mua (TC-03 cũ); ban công
trường ký nhận hàng giao thẳng (chỉ đề nghị gắn công trình, 0106); tab **Hồ sơ – Bản vẽ** dùng `documents`.

#### Khảo sát Chỉ huy – Giám sát công trường — còn gì phải làm

- ⏳ **Ưu tiên 1 — đề nghị công trường ↔ văn phòng có người tiếp nhận, thời hạn, cảnh báo quá hạn.**
  Hộp thư Phê duyệt không phủ "chờ văn phòng trả lời bản vẽ". Cảnh báo phải chép vào thiết kế: _"nếu chỉ
  yêu cầu công trường cập nhật nhưng các phòng ban không xử lý trên cùng hệ thống thì phần mềm không giải
  quyết được điểm nghẽn."_ → TC-10, 6.2.
- ⏳ Bản vẽ đang hiệu lực: đã có tab; còn **bắt buộc xác nhận đúng bản vẽ trước khi giao việc** (TC-03 mới)
  và **tải tệp thật lên Storage** (hiện chỉ ghi đường dẫn).
- ⏳ Xác nhận khối lượng tổ đội: **khối lượng × đơn giá hợp đồng**; chưa nghiệm thu / chưa đủ hồ sơ thì
  **chưa tính thanh toán** (ràng buộc). Mở khoá BC-03 phần 4.
- ⏳ Punch list · RFI · hồ sơ an toàn lao động (sự cố, suýt tai nạn).
- ⏳ Kế hoạch tiến độ chi tiết (câu hỏi 10) · lịch sử đánh giá tổ đội · ảnh hiện trường (có cột
  `photo_urls`, chưa có màn hình; ảnh phải tự ghi thời gian, vị trí, hạng mục).
- ⚠️ Ba con số suy luận chưa ai xác nhận: 24 giờ · 90% · thang 1–5 (câu hỏi 9, đã là tham số — 0112).

**Hai ràng buộc do người dùng tự đặt:** (1) nhập liệu **10–20 phút/ngày, mục tiêu 5–10**; (2) mạng công
trường ổn định → offline-first cho TC **không cấp thiết** (khác Kho/Xưởng), nhưng vẫn cần bố cục di động thật.

### 3B. Module MH (BSD 4.7) ✅

9 bảng (5 của BSD + 4 bảng dòng). Đề nghị mua → Hộp thư chung → đơn hàng (`purchase_orders` REVOKE INSERT,
chỉ sinh từ `create_purchase_order` sau khi duyệt) → `compare_quotations` → `record_delivery` → chứng từ
sang KT. Chi phí vào `project_budgets` lúc đặt (committed) và lúc hàng về (actual).

- ⚠️ `compare_quotations` chỉ quy về tiền những gì quy được; thời hạn/điều kiện/bảo hành để NGUYÊN — quy
  thành tiền là phần mềm chọn hộ NCC. Chọn báo giá không rẻ nhất bắt buộc nêu căn cứ.
- ⚠️ Công thức chuẩn hoá có **hai bản** (`standardizeQuotationCost` TS + SQL), có test đối chiếu khớp từng đồng.
  Sửa một bản phải sửa bản kia. Tỷ lệ lưu bằng điểm cơ bản (10% = 1000).
- ⚠️ `purchase_price_history` **chỉ đọc**, không tự ghi vào `unit_prices` (tự đổi đơn giá = tự quyết giá).
- ⚠️ `suppliers` là bảng dùng chung, không `company_id` — BSD 4.7 ghi "A" là mâu thuẫn, cần sửa tài liệu.
- ⚠️ Chờ Haan xác nhận: Mua hàng được đọc tối thiểu phía TC (mã/tên/địa chỉ công trình + `site_cost_codes`
  không kèm số tiền).
- ⏳ Cố ý chưa làm: MH-09 bảng giá khung (câu hỏi 13) · MH-10 quy cách nguyên liệu NVS (6.2) · đính kèm tệp
  chứng từ (dùng lại `documents`).

### 3C. Module KHO (BSD 4.8) ✅

9 bảng. `inventory_items` REVOKE ghi — mọi thay đổi tồn qua `write_stock_movement` và để lại phiếu; không
xuất quá tồn (`FOR UPDATE`); điều chuyển là một giao dịch; kiểm kê khoá kho, điều chỉnh qua `approvals`;
giàn giáo có vòng đời riêng qua `record_scaffolding_event`, **không** đi qua sổ tồn; `receive_from_delivery`
nối MH-07; `client_generated_id` chống ghi trùng; cảnh báo KHO-08 (tồn lâu 90 ngày — câu hỏi 15).

- ⚠️ Sửa chữa hàng thu hồi → nhập lại kho **đã có**: `record_scaffolding_event` `event_type = 'sua_chua'`.
  Kiểm trước khi dựng cái thứ hai.
- ⏳ Cố ý chưa làm: KHO-09 ngoại tuyến thật (câu hỏi 1) · camera quét QR · mua giàn giáo tự vào sổ tài sản ·
  kiểm kê phát hiện hàng chưa có trong sổ · giá vốn xuất kho chính thức (chờ phần mềm kế toán; hiện chỉ có
  `average_cost` tham khảo) · chi phí hàng xuất từ kho chung cho công trình (câu hỏi 14).

### 3D. Module KT (BSD 4.9) ✅

8 bảng. Duyệt chi nhiều cấp (`advance_payment_step` cho ba bước kiểm tra, bước duyệt qua `decide_approval`);
chi phí gắn mã công trình khi phát sinh — **không đếm hai lần** hàng mua qua MH; tạm ứng; công nợ + tuổi nợ
cấu hình được (`aging_buckets`); `cash_flow_current()`; khoá kỳ `close_accounting_period()`.

- ⏸ KT-08 xuất phần mềm kế toán — chặn bởi chọn MISA/AMIS/Fast (cột `posted_at`/`posted_reference` đã có).
- ⚠️ "Trưởng đơn vị" bước 1 là SUY LUẬN (`approve` trên `origin_module`) — đổi ở `rls_payment_step_actor`.

### 3E. Module NS (BSD 4.10) ✅

16 bảng. Lương/căn cước/sức khỏe/kỷ luật khoá ở tầng CỘT, đọc qua `employee_salary` /
`employee_personal_details` (có nhật ký, cả khi sửa qua trigger); hai nhóm `salary` (có KT) và `personal`
(không KT). Chấm công 3 khối, ánh xạ khối → phân hệ ở `timesheet_block_module`; `consolidate_timesheets()`;
điều chỉnh sau chốt có lý do + người duyệt; nghỉ có phép phải có đơn đã duyệt; `offboard_employee()`;
tài sản qua biên bản; nhắc hạn giấy tờ; tuyển dụng qua Hộp thư chung.

- ⚠️ Thông báo gửi theo **đúng điều kiện cho phép ký**, dùng `EXISTS` chứ không nối bảng (nối bảng →
  người nhiều pháp nhân nhận trùng). Nhớ `sees_all_companies` (bẫy CLAUDE.md 3.5).
- ⚠️ `employees`: dòng theo Mẫu **B** (BSD 4.10), cột lương hạn chế như **D**.
- ⏸ NS-06 công thức lương (chặn bởi quy chế) · nhập tệp máy chấm công.
- Suy luận chờ xác nhận: câu hỏi 17–20.

### 3F. Module SX (BSD 4.12) — ✅ SX-03 xong, SX-01 chỉ khung, SX-02 chưa làm (theo số CŨ)

`production_orders` · `material_consumption` · `rental_agreements` · `rental_agreement_items`.
`create_rental_agreement` lập hợp đồng + chuyển lô trong cùng giao dịch (xuất cả lô "mới"); `return_rental_agreement`
thu hồi **nhiều đợt**, tách đạt/hỏng/mất, doanh thu theo ngày thuê thật từng đợt; lô bên khách theo
`scaffolding_assets.current_rental_agreement_id` (FK khai bằng SQL tay để tránh vòng `kho.ts ↔ sx.ts`).
Vai trò thứ 13 `SX` (0105), không có `approve`.

- ⏳ Hủy hợp đồng trước khi thu hồi (enum `huy` có, chưa có hàm).

#### Khảo sát Xưởng sản xuất giàn giáo — còn gì phải làm

Thứ tự người điền tự xếp: _ổn định dòng tài sản trước, rồi mới kế hoạch sản xuất, định mức, năng suất,
chất lượng, giá thành._

- ⏳ **Ưu tiên 1 — vòng đời tài sản khép kín.** Còn thiếu: **giao thêm giữa kỳ** (cần bảng đợt giao —
  câu hỏi 26); **biên bản thu hồi từng đợt** có chữ ký hai bên + ảnh (hiện không có bản ghi riêng của đợt,
  tranh chấp không dựng lại được). → SX-15→SX-21, 6.4.
- ⏳ **Ưu tiên 2 — lệnh sản xuất đủ nghĩa:** mã, quy cách, số lượng, thời hạn, người duyệt; **thay đổi lập
  phiên bản mới**; luồng chuyển bước thay ô chọn trạng thái.
- ⏳ **Ưu tiên 3 — BOM có phiên bản, rồi giá thành** (phân biệt KẾ HOẠCH và THỰC TẾ).
- ⏳ Ghi lỗi theo sản phẩm – công đoạn – người – nguyên nhân · sổ máy và bảo dưỡng.
- ⚠️ Chặn bởi dữ liệu (câu hỏi 28): **"không nên ước lượng một con số để điền"**.
- ⚠️ Mạng ở xưởng "đôi lúc không ổn định" — đây mới là chỗ offline có giá trị (cùng nhóm KHO-09).

### 3G. Module BC — đầy đủ — ✅ BC-01/BC-02/BC-03 (một phần)/BC-05/BC-06/BC-07 xong, ⏳ BC-04 chưa làm

- ✅ BC-02 lãi/lỗ theo công trình (`project_profit_loss`, `0056`) — Mẫu D chặn cả hàm bằng
  `rls_sees_sensitive('profit')`; bấm tên công trình → tab Ngân sách.
- ✅ BC-01 Dashboard dùng thẳng hook của từng màn hình chi tiết (không endpoint tổng hợp) để số không lệch.
- ✅ BC-05 thẻ "Quá hạn" gộp 4 nguồn; vượt ngân sách qua `sites_budget_status` (`0058`, một lượt gọi).
  ⚠️ `PENDING_APPROVAL_AGING_DAYS` = 3 là giả định (`shared/src/bc.ts`).
- ✅ BC-03 ba phần đầu (`0059`), tách theo pháp nhân khi "Toàn NVG" (BC-07, `0060`).
- ✅ BC-06: "Xuất Excel" là **CSV có BOM UTF-8**; "Xuất PDF" là cửa sổ in (`web/src/lib/print-report.ts`) —
  cố ý không dùng thư viện PDF (thiếu glyph tiếng Việt). Báo cáo nói thẳng phần chưa đo được.
- ⏳ BC-03 phần 4 "hiệu suất nhân sự/tổ đội/NCC" — cố ý chưa làm, chưa có cơ sở đo (hỏi Haan).
- ⏳ BC-04 (xem 6.7). `GET /api/dashboard/executive` và `report_snapshots` — chỉ làm nếu chậm thật.

### ✅ Definition of Done — Phase 3

1. Golden Path 1 (NVC) chạy TRỌN tới lãi/lỗ
2. Golden Path 3 (NVS) chạy trọn: báo giá kèm tồn → xuất cho thuê → theo dõi → thu hồi + đối soát
3. Từ một dòng lãi/lỗ, truy ngược tới đúng chứng từ gốc
4. BGĐ mở dashboard thấy doanh thu / dòng tiền / công nợ / chi phí vs ngân sách
5. Chấm công 3 khối chốt được và chuyển sang KT

---

# PHASE 4 — Liên kết chéo, chất lượng, bàn giao demo (PRD Giai đoạn 3)

### 4A. Hồ sơ 360° đầy đủ (AFD 5.1–5.2) — ✅ xong

Panel liên kết cho 7 thực thể trung tâm; mọi trường tham chiếu là liên kết; breadcrumb theo đường đi thật
(`location.state.from`, chỉ cho link trong panel liên quan); điều hướng bằng `<Link>` để chuột giữa mở tab mới.
Cố ý chưa liên kết: "Quản lý trực tiếp" (NS) và "Dự toán đã duyệt" trong panel Hợp đồng — chưa có trang đích.

### 4B. Rà soát phân quyền toàn hệ thống — ✅ đợt 1+2+3+4 xong

Đợt 1 khoá `EXECUTE` của `PUBLIC`/`anon` trên hàm (`0062`); đợt 2 đối chiếu policy với mẫu BSD; đợt 3 rà mọi
RPC ghi dữ liệu + đường xuất báo cáo; đợt 4 đọc business logic ~101 hàm SECURITY DEFINER.

- ⚠️ **Mọi hàm RPC mới phải tự `GRANT EXECUTE ... TO authenticated`** (`ALTER DEFAULT PRIVILEGES` đã đóng
  mặc định). **Hàm chỉ cho cron phải REVOKE cả `PUBLIC` tường minh** — đã gặp hàm vẫn còn `EXECUTE` qua
  `PUBLIC`; kiểm bằng `has_function_privilege`, đừng tin mặc định.
- ⚠️ Hàm bị định nghĩa lại qua nhiều migration: đọc bản **còn hiệu lực** (vd. `decide_approval` ở `0049`).
- ⚠️ Chỉ huy trưởng xem ngân sách công trình mình **không** ghi `sensitive_access_logs` (cố ý, tránh phình
  bảng); điều kiện ghi log tách khỏi điều kiện hiện số. NEN-07 đọc theo chữ là "mọi lượt xem" — chờ Haan.
- ⚠️ Chạy `npm test` đầy đủ trước khi coi một đợt sửa phân quyền là xong — sửa X từng phá luồng Y (`0069`).
- Chờ Haan: câu hỏi 24 (`move_site_stage` không báo ai), 25 (nhóm chi phí trên dòng dự toán).
  `cancel_acceptance` không kiểm công trình đã chuyển bước dựa vào biên bản đó — tin cậy thấp, chỉ lưu ý.

### 4C. Áp Content Guidelines toàn diện — ✅ xong

Thuật ngữ CGD 4.4, ngày giờ, lỗi qua `toUserMessage`, thư viện 5.1–5.6 khớp, tương phản, vùng bấm
`size-10 sm:size-8`. Canh bằng `web/src/test/design-rules.test.ts`.

- ⚠️ Nợ kỹ thuật: popover lịch (`calendar-popover.tsx`) định vị `right-0` theo ô nhập nên bị cắt khi ô
  gần mép trái nội dung. Sửa bằng neo theo khung nhìn/portal, **không** nới bề ngang.
- 5.4 email chưa có (chờ Resend).

### 4D. Tác vụ nền (NEN-04) — ⏳ hạ tầng xong + 4/4 loại cảnh báo (phần gắn phê duyệt), còn Queues + "hồ sơ thiếu chứng từ"

`workers/` là Worker API tùy chỉnh đầu tiên: Hono + Cron `0 18 * * *` UTC (01:00 giờ VN), `service_role`.
Đã có: nhắc hạn giấy tờ NS · công nợ quá hạn · vượt ngân sách · phê duyệt để lâu
(`scan_pending_approval_reminders`, `approvals.last_reminded_at`, người nhận qua
`approval_reminder_recipients` — cố ý nhắc THỪA thay vì THIẾU, không so `max_amount`).

- ⏳ "Hồ sơ thiếu chứng từ" (NEN-04) — chưa rõ điều kiện SQL, hỏi Haan.
- ⏳ Nhắc công nợ CỐ Ý thu hẹp so với NEN-04: chỉ `phai_thu` (chưa `phai_tra`), chỉ khi ĐÃ quá hạn —
  nhánh "sắp đến hạn" cần Haan chốt số ngày báo trước (PRD không nêu), không tự đặt.
- ⏳ Cloudflare Queues + email — `RESEND_API_KEY` chưa có; v1 dừng ở thông báo trong ứng dụng.
- ⏳ Deploy thật Worker cron — cần Haan xác nhận; secret `SUPABASE_SERVICE_ROLE_KEY` qua
  `wrangler secret put ... --config workers/wrangler.jsonc`, không bao giờ commit.
- ⚠️ Chống nhàm cảnh báo (CGD 3.4): không lặp lại thông báo đã xử lý, chỉ gửi đúng người.
- Mẫu `NOTIFICATIONS.debtDue` giả định "đến hạn ngày X" — không khớp cách quét công nợ diễn đạt.

### 4E. Kiểm thử & triển khai

- ⏳ 3 Golden Path E2E (Playwright) xanh ổn định
- Bộ test RLS đầy đủ xanh
- Dữ liệu demo thật cho 3 pháp nhân + Back Office

#### ⚠️ Tách môi trường — việc BẮT BUỘC trước go-live, chưa làm

Hiện chỉ có **một** project Supabase (`awaiwegmuykhctnysvou`): máy phát triển và bản chạy thử
`nvg.tests99.workers.dev` dùng chung. Haan chốt giữ nguyên tới go-live.

**Hạn chót: trước khi NVG nhập dòng dữ liệu thật đầu tiên.** Chưa tách thì `npm test` chạm CSDL bản
đang chạy — và `cleanupTestData` xoá CỨNG.

1. Tạo project Supabase thứ hai (production). Giữ project cũ làm `dev`.
2. `npm run db:migrate` rồi `npm run db:seed` lên project mới — **kiểm bằng số bảng thật** trong
   `information_schema`, đừng tin "Hoàn tất" (bẫy `_journal.json`).
3. Đổi `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` trong **build variables của trigger production** trên
   Cloudflare Workers Builds. ⚠️ Phải qua Builds API
   (`PATCH /accounts/{acct}/builds/triggers/{uuid}/environment_variables`) với token **user-scoped** có quyền
   `Workers Builds Configuration: Edit` — `wrangler` không làm được, token account-scoped bị từ chối.
   Trigger preview giữ project dev.
4. Trỏ `.env` ở máy về project **dev**, rồi xác minh bằng grep host Supabase trong chunk `auth-*.js` của bản
   đã deploy (không phải `index-*.js`). Biến `VITE_` rỗng làm trắng màn hình mà build vẫn xanh.

Sau khi tách, "xác nhận sao lưu trước migration production (IPD 5.4)" mới có nghĩa và trở lại bắt buộc.

### 4F. Tính năng phụ (chỉ khi còn thời gian — IPD 4.3)

DA-11 (Gemini đọc bản vẽ) · TK-09 (thư viện thiết kế) · NS-02 (kanban tuyển dụng) · `report_snapshots`

### ✅ Definition of Done — Phase 4

1. 12 module liên kết chéo thông suốt, không lỗi chặn luồng chính
2. Kịch bản demo đầu-cuối cho NVC + NVO + NVS + Back Office
3. Quy trình demo **chạy hoàn toàn trên hệ thống, không cần Excel/Zalo song song** (PRD 7)

---

# PHASE 5 — AI Preliminary Design Engine (TK-10 → TK-17)

> **Trạng thái thật và vướng mắc: `TIEN_DO_THIET_KE.html`.** Hàng rào và quyết định: `CLAUDE.md` mục 8,
> `doc/design/README.md`. Mục này chỉ giữ khung mốc của **bộ giải nội bộ** — **đã gỡ hẳn ở T58
> (19/09/2026)**, các mốc 4–9 dưới đây là lịch sử. Thiết kế tự động nay là nhánh AI («AI Design»); Mốc 3
> (số hoá + Knowledge Base) vẫn còn hiệu lực vì Container `compute/` giữ lại cho số hoá.

Hai runtime: Worker (TypeScript — giao diện, API, mô hình ngôn ngữ, artifact, điều phối) và Container
(Python — CP-SAT, hình học, CAD, ba chiều). Năm lớp, mỗi lớp là hàm thuần `(artifact vào, cấu hình) → artifact ra`:

```
DesignBrief ─► SpaceProgram ─► LayoutIntent ─► FloorPlan ─► ArchModel ─► Mesh3D ─► Renders
```

### Mốc 0 — Kiểm chứng rủi ro kỹ thuật ✅

- 0.1 Đọc `.dwg` qua ODA + `ezdxf`: điều kiện ra cũ đo sai thứ — bản vẽ NVG **không có lớp ranh phòng**,
  tên lớp theo độ đậm nét in. Chuyển thành vướng mắc **V-8** (`doc/design/13-ho-so-thuc-te.md` 13.12, Q-23).
- 0.2 CP-SAT liên tầng một mô hình (V-2) · 0.3 rule pack đầu tiên (V-3).

### Mốc 1 — Khung xương ✅

`contracts/` đủ 5 lớp → zod ở `shared/src/design/` (`npm run contracts:check`); Python nạp thẳng JSON Schema.
`design_artifact` · `design_artifact_edge` · `design_head`. Quy ước then chốt: CLAUDE.md 8.8.

### Mốc 2 — Lớp 1: Design Brief (TK-10) ✅

**Mở rộng `design_briefs`, không thay bảng** (Q-2). ⚠️ Chờ Haan: bốn danh sách lựa chọn + bảng trọng số
chấm điểm chưa có kiến trúc sư xác nhận (Q-16).

### Mốc 3 — Pipeline số hoá + Knowledge Base ⏳ ĐANG LÀM

Đã có: hợp đồng `kb-record` / `cad-extraction`; `compute/src/design_compute/cad/` (ODA, trích xuất);
`kb/slicing.py`, `kb/crosscheck.py`, `kb/record.py`; `POST /extract`, `POST /kb/record` (multipart);
bảng `kb_record` (`0098`, cột lọc `GENERATED ALWAYS … STORED`); `DigitisePipeline` mỗi tệp một step, khoá
theo mã băm, **một tệp lỗi không giết cả mẻ**; từ vựng phòng `kb/room_vocabulary.yaml` + chuẩn hoá hai
lượt; truy hồi pgvector (`0099`, `0100`, **chưa đánh chỉ mục vector**); `kb/mmr.ts`; văn bản nhúng theo
**danh sách CHO PHÉP**; giao diện `/tk/ho-so-cu`.

- ⚠️ **Trình trích xuất phải VIẾT LẠI, không bổ sung** — bốn giả định nền sai và hỏng im lặng: chỉ duyệt
  modelspace (83% hình học trong block) · tìm lớp `room_boundary` không tồn tại · coi một tệp là một tầng
  (thật ra 22–73 tờ) · không đọc `ATTRIB`. Thêm: mục `ignore` đang bỏ đúng thứ giá trị nhất (`0`, `*DIM*`,
  `*TRUC*`, `*KHUNG*TEN*`). Xem V-8 và `13-ho-so-thuc-te.md` 13.6, 13.10.
- ⏳ Còn lại: Bước 0 đầy đủ (xác định bản có hiệu lực theo tên tệp và thư mục `08_Hồ sơ phát hành`);
  extractor tổng mặt bằng / kết cấu / mặt cắt / bảng thống kê.
- ⚠️ Kho hồ sơ **dưới 50 bộ**: không phân hạng A/B/C; thống kê thực nghiệm trả rỗng; đánh giá leave-one-out.

### Mốc 4 — Lớp 2: Space Program (TK-11) — ✅ XONG cho demo

`workers/src/design/program/`, `kb/space_norms.yaml`, migration `0102`. Ưu tiên nguồn cưỡng chế trong mã:
quy tắc > thống kê thực nghiệm > chuẩn nghề. Hook `kb_room_area_stats` đếm theo số **công trình** (HAVING).
⏳ Còn lại: bộ đo leave-one-out (ngưỡng 70%) · chuẩn diện tích chờ kiến trúc sư soát (Q-18) · sửa chương
trình bằng tay (chưa có yêu cầu thật).

### Mốc 5 — Lõi Lớp 3 cho nhà phố (TK-12, TK-13) — ✅ XONG theo phương án demo, trừ trình chỉnh sửa Konva (cắt có chủ đích — `doc/design/14-phuong-an-demo.md` 14.3)

**Ra:** kiến trúc sư chọn phương án của hệ thống làm điểm khởi đầu **≥40%**; 3 → 4 tầng sinh lại dưới 60 s,
lõi thang và trục kết cấu giữ nguyên; DXF mở được trong AutoCAD.

### Mốc 6 · 6b · 6c — giai đoạn sau

Mặt đứng, mặt cắt, ba chiều có vật liệu, phối cảnh (6) → đầu ra mức bản vẽ kỹ thuật (6b, **không bỏ qua
được**) → phối hợp liên bộ môn, phát hành từng bộ môn với chữ ký riêng (6c).

### Mốc 7 · 8 · 9 — giai đoạn sau

Biệt thự/nhà vườn · mở cho khách trên website · bóc khối lượng sơ bộ, thư viện phong cách, tenant thứ hai.
**Ngưỡng của biệt thự đặt BẰNG nhà phố** — thấp hơn thì làm giàu đầu vào, không hạ ngưỡng.

## 🚧 Ranh giới bắt buộc

Phương án của hệ thống là **NHÁP/ĐỀ XUẤT** tới khi duyệt qua TK-03 · kết cấu, cơ điện, PCCC do kỹ sư có
chứng chỉ ký · một lần phát hành đúng **một** bộ môn · demo chỉ chạy dữ liệu giả lập/ẩn danh · DXF một chiều
· không hard-code ngưỡng quy chuẩn. Chi tiết: CLAUDE.md 8.

## Đầu ra chuẩn (TK-17)

Design Brief · Space Program · **mặt bằng chỉnh sửa được (dữ liệu, không phải ảnh)** · phương án kiến trúc ·
mô hình ba chiều tham số · ảnh phối cảnh — mỗi loại qua luồng góp ý và phê duyệt TK-03.

---

# PHASE 6 — Phạm vi mới của bộ tài liệu v1.4

> Thứ tự bám **IPD v1.1 §3.2**: hai ưu tiên số một của hiện trường (đề nghị – phê duyệt của công trường;
> vòng đời tài sản cho thuê của xưởng) làm **SỚM**. Mỗi khối chỉ liệt kê phần **CÒN THIẾU**.

## 6.0 ✅ Nền tảng xuyên suốt

Migration `0110` → `0117`: trạng thái thứ sáu `disputed`, `system_parameters` + lịch sử (NEN-12),
`sla_definitions` + đồng hồ hạn xử lý trên Hộp thư Phê duyệt, mẫu RLS **E** + `user_site_assignments` + vai
trò `CHT`, bộ ba cột đồng bộ hiện trường, bất biến chứng từ đã ký, câu "Chưa đủ dữ liệu".

⚠️ **Cố ý để RỖNG, đừng điền số:** `sla_definitions` · `internal_rental_price` · `compensation_price_table` ·
`defect_rate_threshold` · `min_samples_for_metric`. Điền mặc định là biến ô trống nhìn thấy được thành con
số sai trông như đã duyệt.

## 6.1 TC nhóm A + B — chuẩn bị, kế hoạch, vận hành hằng ngày

**Đầu ra:** chỉ huy trưởng nhập nhật ký ngày trên điện thoại và chốt ngày, dưới ngưỡng thao tác.

- TC-01 (phần còn lại): hiện nội dung **còn thiếu/chưa xác nhận** trong hồ sơ bàn giao — `site_handover_checklists`
- TC-02 khảo sát, tiếp nhận mặt bằng, lán trại — `site_mobilizations`
- **TC-03** bản vẽ đang hiệu lực + xác nhận đúng bản vẽ TRƯỚC khi giao việc — `site_drawings`, `drawing_acknowledgements`
- TC-04 phiếu giao việc theo hạng mục/tổ đội, kèm cảnh báo an toàn — `work_assignments`
- **TC-05** 🔒 nhật ký điện tử — **nguồn duy nhất** của báo cáo ngày/tuần — `site_logs` + `site_log_labor`, `site_log_equipment`, `site_log_works`
- TC-06 ảnh có ngữ cảnh (hạng mục, vị trí, thời điểm) — `site_photos`
- TC-07 ngoại tuyến thật (Dexie + `POST /api/sync/batch`)
- TC-08 ghi nhận công tại công trường — `site_attendance` — ⛔ chờ chốt phương thức (câu hỏi 33)

## 6.2 MH + TC nhóm C — đề nghị vật tư và **hạn xử lý hai chiều**

**Đầu ra:** luồng đề nghị – phê duyệt hai chiều công trường ↔ văn phòng, có đồng hồ hạn xử lý.

- **TC-09** 🔒 lập đề nghị vật tư từ công trình — `material_requests`
- **TC-10** 🔒 **theo dõi trạng thái đề nghị + cảnh báo quá hạn** (ai giữ, chờ bao lâu, hạn còn lại) — `request_tracking`, `request_reminders`
- TC-11 tiếp nhận vật tư tại công trình — `site_material_receipts`
- TC-12 đối chiếu ngân sách với chi phí thực tế — `site_cost_entries`
- MH-10 quy cách kỹ thuật bắt buộc khi mua nguyên liệu NVS — `material_specs`

**Màn hình:** mẫu **Request Tracker** (AFD 4.7) cho người GỬI; nút "Thúc" ghi vào lịch sử hồ sơ.
⛔ **Điều kiện tiên quyết:** BGĐ ban hành `sla_definitions` (câu hỏi 30).

## 6.3 KHO — bổ sung

- KHO-01 kho **đa địa điểm**, 3 cơ sở NVS (PRD Phụ lục D.5) — mở rộng `warehouses` (⛔ câu hỏi 35)
- **KHO-11** chốt số dư ban đầu; sau đó chỉ biến động bằng chứng từ — `opening_balances`
- KHO-06 vòng đời giàn giáo **11 trạng thái**; tổng theo mã luôn cân

## 6.4 SX cụm D — vòng đời tài sản cho thuê 🔒 **ƯU TIÊN SỐ MỘT CỦA NVS**

**Đầu ra:** luồng đơn thuê giàn giáo chạy trọn (luồng #2 của M2).

- SX-15 **sổ cái tài sản thời gian thực** — màn hình **Asset Ledger** (AFD 4.9); dòng tổng mỗi mã luôn cân, lệch thì cảnh báo trên dòng
- SX-16 đơn thuê theo **số dư động**: giao lần đầu → giao thêm → trả bớt → gia hạn → điều chuyển → thu hồi (giải câu hỏi 26)
- SX-17 tính tiền thuê theo **số dư từng ngày**; đối soát theo kỳ → KT — `rental_settlements`
- SX-18 thu hồi, kiểm đếm, phân loại **4 nhóm**; biên bản ảnh + chữ ký hai bên — `scaffolding_returns`, `scaffolding_return_lines`
- SX-19 bồi thường theo bảng giá cấu hình; chưa thống nhất thì **khoá số liệu gốc** (`disputed`), chỉ sửa bằng chứng từ điều chỉnh có duyệt — `compensation_claims`, `compensation_adjustments`
- SX-20 sửa chữa hàng thu hồi, chi phí theo lô và theo khách/công trình — `repair_orders`
- SX-21 giàn giáo cho công trình nội bộ — chứng từ đầy đủ, **bắt buộc ghi nhận giá trị** (QĐ-6) — `rental_agreements.is_internal`. ⚠️ Báo cáo hợp nhất **phải LOẠI TRỪ**

## 6.5 TC nhóm D + E — nghiệm thu, RFI, phát sinh, an toàn, bàn giao

**Đầu ra:** luồng vận hành công trường hằng ngày chạy trọn (luồng #4 của M2).

- **TC-13** 🔒 nghiệm thu bằng **checklist điện tử** kèm ảnh — `acceptance_checklists`, `acceptance_checklist_results`
- TC-14 punch list — `site_issues`
- **TC-15** RFI có định tuyến và thời hạn — `rfis`
- **TC-16** thay đổi/phát sinh, **chụp ảnh TRƯỚC KHI bị che khuất** — `site_variations`
- TC-17 khối lượng tổ đội: **chặn khối lượng chưa nghiệm thu khỏi bảng thanh toán** — `subcontractor_quantities`
- **TC-18** an toàn lao động, sự cố, suýt tai nạn — `safety_records`, `safety_incidents`
- TC-19 giàn giáo/thiết bị mượn tại công trường, khớp SX-21 — `site_scaffolding_holdings`
- TC-20 bàn giao, bảo hành, truy vết tranh chấp — `site_handovers` (+ `warranty_claims`)

## 6.6 SX cụm A, B, C, E — sản xuất và giá thành

**Đầu ra:** luồng lệnh sản xuất chạy trọn (luồng #3 của M2). ⛔ **Chặn bởi dữ liệu** (câu hỏi 28, 32, 36).

- A — danh mục (SX-01→03): `products`, `product_specs`, `product_drawings`, `product_certificates` (khởi tạo từ Phụ lục D)
- B — kế hoạch, lệnh (SX-04→08): `production_plans`, `production_order_versions`, `boms`, `bom_lines`, `production_material_issues`
- C — thực hiện, chất lượng, máy (SX-09→14): `production_stages`, `production_stage_logs` (9 công đoạn, cấu hình được), `quality_inspections`, `quality_defects`, `machines`, `machine_maintenances`, `machine_incidents`
- E — giá thành (SX-22): `product_costs` (**Mẫu D**), `cost_recalculation_logs` — tính lại được theo giá vật tư tại thời điểm chọn

## 6.7 KT, NS, BC — bổ sung

- KT: đối soát thuê giàn giáo theo kỳ — `rental_settlements`, `cost_entries.is_internal_transfer`
- NS-04 nguồn chấm công theo khối: văn phòng = máy; **xưởng = máy + tổ trưởng xác nhận**; công trường = tổ trưởng báo → kỹ thuật kiểm → chỉ huy trưởng xác nhận
- NS-06 công thức lương — `payroll_rules`, `piece_rates` — ⛔ chờ quy chế lương
- NS-09 hồ sơ tổ đội/thầu phụ (khối đông người nhất, an toàn kiểm soát như nhân sự công ty) — `subcontractor_workers`
- **NS-12** giảm phụ thuộc một người: người dự phòng + SOP + mẫu chuẩn — `role_backups`
- **BC-04** 4 báo cáo NVS: giá thành theo lệnh · hiệu suất khai thác tài sản · thất thoát theo khách/công trình · tỷ lệ lỗi
- BC-05 thêm nguồn rủi ro: chờ duyệt quá hạn cam kết · đơn thuê quá hạn trả · sự cố an toàn chưa đóng
- BC **Việc đang tắc** toàn hệ thống, nhóm theo phòng ban đang giữ (AFD 3.11) — `GET /api/sla/overdue`

## 6.8 Nguyên tắc lược đồ mới của BSD v1.1 — áp cho MỌI bảng ở Phase 6

- **Không lưu giá trị tính được từ chứng từ.** Số dư, tồn theo trạng thái, tiền thuê luỹ kế tính **từ bảng sự
  kiện**; cần nhanh thì materialized view có lịch làm mới, **không** cột đếm cập nhật tay.
- **Mọi con số hiển thị truy ngược được về chứng từ gốc** — mỗi ô Asset Ledger bấm được.
- Giao dịch nội bộ (`is_internal`) **loại trừ** khỏi báo cáo hợp nhất.
- Chứng từ đã phát hành lưu **snapshot** tham số đã áp dụng.

---

# Công việc chạy SONG SONG suốt mọi phase

- **Test RLS**: mỗi bảng mới thêm test ngay.
- **Seed data**: mỗi module mới bổ sung dữ liệu tương ứng.
- **E2E Golden Path**: viết trước (đỏ), xanh dần.
- **Câu hỏi nghiệp vụ**: phát hiện mơ hồ → ghi vào danh sách hỏi Haan, không tự quyết.

---

# Thứ tự cắt giảm nếu phải cắt (IPD v1.1 4.3)

⚠️ **Đã định sẵn trong tài liệu, không tự chọn lại.**

**GIỮ BẰNG MỌI GIÁ:** SX-15 → SX-21 (vòng đời tài sản cho thuê) · TC-05, TC-09, TC-10, TC-13 (liên thông
công trường ↔ văn phòng).

**HOÀN THIỆN DẦN SAU** (cần dữ liệu tích luỹ): SX-07 định mức · SX-10 năng suất chuẩn · SX-22 giá thành.

Ngoài hai nhóm trên, cắt từ trên xuống, **không bao giờ cắt Golden Path**:

1. TK-09 · DA-11 · NS-02 kanban tuyển dụng
2. `report_snapshots` · BC-04
3. KHO-09 offline thật → online-first + optimistic UI
4. Chiều sâu các yêu cầu TC/SX ngoài nhóm "giữ bằng mọi giá"

**Không bao giờ cắt:** RLS + test RLS · audit/lịch sử · phiên bản tài liệu · phê duyệt theo hạn mức · truy
vết về chứng từ gốc.

> Số hiệu SX đã đánh lại ở PRD v1.4 (SX-01→03 cũ ≠ SX-01→22 mới) — đừng cắt theo số cũ.

---

# Quyết định còn cần Haan chốt

Giữ nguyên số thứ tự vì mã nguồn và các mục trên trỏ tới "câu hỏi N". Các số **12, 21, 22, 27 đã chốt**
nên đã bỏ khỏi bảng (xem git nếu cần nội dung cũ).

- **#1** **KHO-09 offline-first** làm thật hay online-first + `client_generated_id`? — 3C
- **#2** **Phần mềm kế toán** chính thức (KT-08) — 3D
- **#3** **`unit_prices` dùng chung** DA/TK/MH hay NVO cần bảng riêng? (BSD 5) — 2B
- **#4** **Quy tắc mã hoá** dự án/công trình/vật tư/hợp đồng — 2A
- **#5** **Hạn mức phê duyệt** chính thức theo vai trò × loại nghiệp vụ — 0.2
- **#6** **Công thức lương** NS-06 — 3E
- **#7** **Đầu mối hỗ trợ kỹ thuật** (mẫu lỗi CGD 5.5) — 4C
- **#8** **Một hợp đồng mở được nhiều công trình không?** Hiện chặn ở một — 3A (đổi bằng một tham số)
- **#9** **Ba con số suy luận của TC**: 24 giờ sửa nhật ký · cảnh báo ngân sách 90% · thang tổ đội 1–5 — 3A (đã là tham số)
- **#10** **Công trường đo tiến độ thế nào** — đã biết: theo hạng mục, bằng khối lượng đã nghiệm thu. Còn thiếu: mức chi tiết (tuần hay mũi thi công) và ai cập nhật % — 3A
- **#11** **Một đề nghị mua đặt nhiều nhà cung cấp được không?** Hiện một đề nghị → một đơn — 3B
- **#13** **Bảng giá khung MH-09** — theo tháng hay quý, điều chỉnh báo trước bao lâu? — chặn MH-09
- **#14** **Hàng từ kho chung xuất cho công trình ghi chi phí lúc nào?** Hiện không về được ngân sách công trình nào — quyết định kế toán — 3C
- **#15** **Ngưỡng tồn lâu 90 ngày** — 3C
- **#16** **Kho tự duyệt chênh lệch kiểm kê tới 10 triệu** — vừa đếm vừa duyệt là kiểm soát yếu — 3C (cấu hình `approval_limits`)
- **#17** **Trưởng đơn vị xác nhận công khối VĂN PHÒNG là ai?** (công trường, xưởng đã chốt) — 3E (`confirm_timesheet_period`)
- **#18** **Một ngày công bao nhiêu giờ?** Đang 8 giờ — 3E (`HOURS_PER_WORKDAY` + SQL, có test đối chiếu)
- **#19** **Ai duyệt yêu cầu tuyển dụng?** Đang TGĐ — 3E (cấu hình `approval_limits`)
- **#20** **Kế toán đọc hồ sơ nhân sự tới đâu?** — 3E (`rls_employee_readable`)
- **#23** **Bảng `tasks` — bỏ hẳn hay dùng thật?** — 1.4
- **#24** **`move_site_stage` có nên báo khi chuyển bước, cho ai?** Hiện không báo ở bước nào — 3A (chưa vá)
- **#25** **Dòng dự toán chi tiết có được dùng nhóm `chi_phi_chung`/`du_phong`/`loi_nhuan` không?** Phần mất tiền đã vá (0080), còn câu hỏi UX — 2B
- **#26** **Giao thêm giữa kỳ tính tiền từ ngày nào?** Cần bảng đợt giao — chặn phần còn lại của SX-03 cũ / SX-16
- **#28** **Catalogue + định mức + tỷ lệ lỗi + thất thoát/năm**: Catalogue (Phụ lục D) thiếu sản lượng/tháng và phân loại bán/cho thuê từng mã; định mức do trưởng bộ phận sản xuất giữ, chưa có bộ hiện hành; tỷ lệ lỗi và thất thoát trống — **"không nên ước lượng"** — 6.6
- **#29** **Hồ sơ công trường nào bắt buộc giữ bản giấy có chữ ký gốc?** — chặn thiết kế màn hình nghiệm thu và nhật ký TC
- **#30** **Thời hạn cam kết phản hồi của từng phòng ban** (`sla_definitions`, đang RỖNG) — ⛔ tiên quyết của 6.2 (TC-10)
- **#31** **Bảng giá bồi thường giàn giáo thiếu – hỏng** (`compensation_price_table`, đang RỖNG) — 6.4 (SX-19)
- **#32** **Ngưỡng tỷ lệ lỗi sản xuất** (`defect_rate_threshold`, đang RỖNG) — 6.6 (SX-12)
- **#33** **Phương thức ghi nhận công tại công trường** — đang cân nhắc ảnh + thời gian + vị trí — ⛔ chặn TC-08
- **#34** **Số bản ghi tối thiểu để hiện một chỉ số** (`min_samples_for_metric`, đang RỖNG) — 6.7 (BC-04)
- **#35** **Địa chỉ xưởng chính NVS** — Catalogue ghi hai địa chỉ (Xã Tây Sơn / Xã Vũ Sơn); "Thái Bình" nay là **Hưng Yên** — ⛔ chặn KHO-01
- **#36** **Catalogue phát hành 2022** còn đúng không, chứng chỉ kiểm định còn hiệu lực không — 6.6 (SX-01, SX-13)
- **#37** **Tổ trưởng sản xuất** (vai trò thứ 15, AFD v1.1 2.3) chưa tạo — chờ SX cụm C — 6.6
