# CLAUDE.md — Hệ thống Phần mềm Quản trị Nhà Việt Group (NVG)

> File này là **bản đồ + hàng rào**, không thay thế tài liệu. Mọi khẳng định dưới đây đều truy được về
> tài liệu gốc trong `doc/` (ghi kèm mã tài liệu + số mục). Khi cần chi tiết đầy đủ, **đọc tài liệu gốc**.

---

## 1. Dự án là gì

Hệ thống quản trị nội bộ (web) cho **Nhà Việt Group** — tập đoàn 3 pháp nhân + Back Office dùng chung:

| Pháp nhân | Mảng | Quy mô |
|---|---|---|
| **NVC** — Nhà Việt Cons | Nhà xưởng công nghiệp, tổng thầu | ~30 dự án/năm |
| **NVO** — Nhà Việt One | Thiết kế + thi công trọn gói nhà ở dân dụng | ~70 dự án/năm |
| **NVS** — Nhà Việt Steel | Sản xuất, thương mại, cho thuê giàn giáo/kết cấu thép | ~700 đơn hàng/năm |
| **Back Office** | Hành chính–Nhân sự, Cung ứng–Vật tư, Kế toán, Tài chính | dùng chung toàn hệ thống |

~40 nhân sự văn phòng/ban công trường + 50–200 lao động thời vụ. Hiện trạng: toàn bộ vận hành thủ công
trên Excel / Word / Zalo / Google Drive / email — không có nguồn dữ liệu chung (PRD 1.2).

**12 module**: `NEN` nền tảng · `CRM` khách hàng–cơ hội · `DA` dự án–đấu thầu · `TK` thiết kế ·
`HD` hợp đồng · `TC` thi công–ngân sách · `MH` mua hàng–vật tư · `KHO` kho · `KT` kế toán–tài chính ·
`NS` nhân sự–hành chính · `BC` báo cáo–dashboard · `SX` sản xuất–cho thuê giàn giáo.

Mục tiêu: bản **demo ~95% hoàn chỉnh trong 6 tuần**, chia 3 giai đoạn (PRD 4).

---

## 2. Document location

Toàn bộ tài liệu nguồn nằm trong `doc/` dưới dạng `.docx`.

| Mã | File | Trả lời câu hỏi | Đọc khi |
|---|---|---|---|
| **PRD** | `PRD_He_thong_Quan_tri_NVG_v1.3.docx` | Hệ thống làm được **GÌ**? | Cần yêu cầu chức năng, business rule, ranh giới KHÔNG làm |
| **AFD** | `Webapp_Flow_Document_NVG_v1.0.docx` | Người dùng đi **ĐẾN ĐÂU**, như thế nào? | Dựng màn hình, điều hướng, hành trình người dùng |
| **TSD** | `TechStack_Document_NVG_v1.1.docx` | Xây **BẰNG GÌ**, ở **ĐÂU**? | Chọn thư viện, hạ tầng, CI/CD, môi trường |
| **CGD** | `ContentGuidelines_Document_NVG_v1.1.docx` | Hệ thống **NÓI/HIỂN THỊ** thế nào? | Viết microcopy, đặt tên nút, màu, font, khoảng cách |
| **BSD** | `BackendSchema_Document_NVG_v1.0.docx` | Dữ liệu **TỔ CHỨC** ra sao? | Thiết kế bảng, quan hệ, RLS, API tùy chỉnh |
| **IPD** | `ImplementationPlan_Document_NVG_v1.0.docx` | **LÀM GÌ, KHI NÀO, AI LÀM**? | Xem mốc, lịch tuần, quy trình deploy |

**Cách đọc `.docx`** (chúng là file nén, không đọc trực tiếp được):

```bash
python3 doc/docx2md.py "doc/<tên file>.docx"        # in ra Markdown, giữ heading + bảng
python3 doc/docx2md.py "doc/PRD_...docx" | sed -n '190,290p'   # đọc từng đoạn
```

### Thứ tự ưu tiên khi tài liệu mâu thuẫn

```
PRD  >  AFD  >  TSD  >  CGD  >  BSD  >  IPD
```

- **PRD hiện là v1.3** (mới nhất). Các tài liệu còn lại vẫn ghi "đi kèm PRD v1.2" — đây chỉ là tham chiếu
  chưa cập nhật, **KHÔNG có nghĩa các tài liệu đó lỗi thời**.
- Khi gặp mâu thuẫn thật: theo thứ tự trên, và **báo lại cho Haan** để cập nhật tài liệu gốc — không tự
  chọn một bên rồi im lặng.

### Tài liệu sẽ bổ sung sau

**"Phương án phát triển AI Preliminary Design Engine cho Thiết kế nhà ở" (phiên bản 02)** — tài liệu này
đã tồn tại nhưng chưa nằm trong `doc/`; Haan sẽ bổ sung khi bắt đầu phần thiết kế AI. PRD 5 ghi rõ: khi
có mâu thuẫn kỹ thuật về TK-10→TK-17, tài liệu riêng đó là nguồn đầy đủ hơn PRD.

---

## 3. Architecture

### 3.1 Kiến trúc backend kết hợp 2 lớp — quy tắc quan trọng nhất (TSD 3.2, BSD 1.3)

Đây là quyết định then chốt để làm xong 12 module trong 6 tuần. **Đọc kỹ trước khi viết bất kỳ endpoint nào.**

| Lớp | Công nghệ | Dùng cho |
|---|---|---|
| **Nền tảng dữ liệu** | Supabase — REST tự sinh (PostgREST) + RLS | Toàn bộ CRUD thường: danh sách, chi tiết, tạo/sửa, lọc, tìm kiếm cơ bản |
| **Logic nghiệp vụ tùy chỉnh** | Cloudflare Workers + Hono | Nghiệp vụ nhiều bước không diễn đạt được bằng CRUD |

**Quy tắc chọn lớp** — mỗi lần định thêm một endpoint, tự hỏi:

- Chỉ đọc/ghi 1–vài bảng, và quyền diễn đạt được bằng RLS? → **Gọi thẳng Supabase từ Frontend. KHÔNG viết API.**
- Chỉ tạo endpoint Workers khi thoả **một trong ba**:
  - (a) gọi dịch vụ bên ngoài (Gemini, phần mềm kế toán),
  - (b) ghi nhiều bảng phải toàn vẹn cùng lúc,
  - (c) quy tắc nghiệp vụ phức tạp hơn khả năng của RLS.

Danh sách endpoint tùy chỉnh đã đặc tả sẵn cho từng module: **BSD 4.1 → 4.12**. Không tự phát minh
endpoint mới khi BSD đã có sẵn cái tương đương.

### 3.2 Stack (TSD 1.4)

| Lớp | Lựa chọn |
|---|---|
| Framework | **React 18 + TypeScript**, build bằng **Vite**, kiến trúc **SPA** (KHÔNG Next.js, KHÔNG SSR) |
| Giao diện | **Tailwind CSS** + **shadcn/ui** (Radix) + **Lucide React** (icon) + **Recharts** (biểu đồ) |
| Dữ liệu & trạng thái | **TanStack Query** (dữ liệu máy chủ) + **Zustand** (trạng thái UI thuần) + `@supabase/supabase-js` |
| Biểu mẫu | **React Hook Form** + **Zod** (Zod dùng chung cả 2 lớp) |
| Di động / offline | **PWA**: `vite-plugin-pwa` + Workbox + **Dexie.js** (IndexedDB) — CHỈ cho Kho/công trường |
| Backend tùy chỉnh | **Cloudflare Workers** + **Hono**, API kiểu **REST/JSON** |
| CSDL | **PostgreSQL** trên **Supabase** (managed) |
| Schema/migration | **Drizzle ORM** + `drizzle-kit` |
| Auth | **Supabase Auth** (email/mật khẩu; email giao dịch qua Resend/SendGrid) |
| Lưu tệp / Realtime | **Supabase Storage** / **Supabase Realtime** |
| Tác vụ nền | **Cloudflare Cron Triggers** (cảnh báo định kỳ NEN-04) + **Cloudflare Queues** |
| Hosting | **Cloudflare Pages** (frontend) + **Cloudflare Workers** (backend) + **Supabase Cloud** |
| Kiểm thử | **Vitest** + **React Testing Library** + **Playwright** (E2E) |

### 3.3 Cấu trúc thư mục (TSD 5.2 — monorepo, một repo GitHub duy nhất)

```
NVG/
├── CLAUDE.md         # file này
├── doc/              # 6 tài liệu .docx + docx2md.py — KHÔNG sửa nội dung tài liệu
├── web/              # React 18 + Vite (SPA) — toàn bộ frontend
├── workers/          # Cloudflare Workers + Hono — API tùy chỉnh, cron, queue
├── db/               # Drizzle schema + migration (nguồn duy nhất của cấu trúc bảng)
└── shared/           # Zod schema, TypeScript type, hằng số nghiệp vụ dùng chung web/ + workers/
```

`shared/` chứa: Zod schema dùng chung cho validate cả 2 lớp (TSD 1.3, 2.4), type suy ra từ schema,
và hằng số nghiệp vụ (5 nhóm trạng thái, mã module, mã màu, định dạng số/ngày).

### 3.4 Phân quyền = RLS trong Postgres (TSD 3.3, 4.2, BSD 3.3)

Quy tắc phân quyền viết **trực tiếp thành policy trong CSDL**, không kiểm ở tầng UI hay tầng API — để
dù gọi thẳng Supabase hay qua Workers, quyền luôn được kiểm ở đúng một nơi và không vòng qua được.

Mỗi bảng áp dụng **đúng một trong 4 mẫu chuẩn** (BSD 3.3 ghi sẵn mẫu nào cho bảng nào):

| Mẫu | Logic | Áp dụng cho |
|---|---|---|
| **A** — theo pháp nhân | Chỉ thấy dòng có `company_id` thuộc pháp nhân người dùng (`user_companies`); BGĐ/Admin thấy mọi pháp nhân | Đa số bảng giao dịch |
| **B** — theo người chịu trách nhiệm | Điều kiện A + chỉ người chịu trách nhiệm/phối hợp/quản lý trực tiếp mới sửa; người khác chỉ xem | Nháp báo giá, dự toán đang soạn, hồ sơ nhân sự |
| **C** — theo hạn mức phê duyệt | Chỉ hiện trong Hộp thư Phê duyệt và cho phép duyệt nếu giá trị nằm trong hạn mức vai trò (`approval_limits`) | `price_approvals`, `payment_requests`, `contracts` |
| **D** — hạn chế theo CỘT | Xem được dòng theo A, nhưng cột nhạy cảm (giá vốn, lợi nhuận, lương) chỉ trả giá trị thật cho vai trò được phép — vai trò khác nhận rỗng qua view riêng | `estimates`, `project_budgets`, `employees` |

Mọi lượt xem/sửa dữ liệu **Mẫu D** phải ghi vào `sensitive_access_logs` (BSD 3.4, PRD NEN-07).

> **Lưu ý — BSD tự mâu thuẫn ở 2 bảng**: `employees` ghi Mẫu **D** ở BSD 3.3 nhưng Mẫu **B** ở BSD 4.10;
> `quotes` ngụ ý Mẫu **B** ở BSD 3.3 nhưng ghi Mẫu **C** ở BSD 4.2. Khi BSD 3.3 và BSD 4.x lệch nhau cho
> cùng một bảng: **ưu tiên BSD 4.x** (cụ thể theo module) và **báo lại Haan** để sửa tài liệu.
> Riêng `employees`: cột lương vẫn phải áp dụng hạn chế theo cột như Mẫu D, bất kể chọn mẫu nào cho dòng.

### 3.5 Đa pháp nhân (PRD NEN-01, BSD 2.2)

- Bảng `companies` chứa **NVC / NVS / NVO + "NVG"** — "NVG" là mã tổng hợp chỉ dùng cho báo cáo, **không
  phải pháp nhân giao dịch thật**.
- Bảng **GIAO DỊCH** (cơ hội, dự án, hợp đồng, phiếu kho, chứng từ…) **LUÔN có `company_id`** — đây là ranh
  giới tách P&L từng công ty.
- Bảng **DÙNG CHUNG** (`customers`, `suppliers`, `users`) **KHÔNG có `company_id`** — liên hệ với pháp nhân
  qua bảng giao dịch (một khách hàng có thể xuất hiện ở cơ hội của nhiều pháp nhân).

### 3.6 Thực thể trung tâm — "Hồ sơ 360°" (BSD 2.1, AFD 5.1)

~65 bảng trên 12 module. Các thực thể được tham chiếu xuyên module nhiều nhất — **liên kết đến, KHÔNG sao
chép dữ liệu**: `companies`, `users`, `customers`, `opportunities`, `bidding_projects`/`design_projects`,
`contracts`, `construction_sites`.

---

## 4. Coding convention

### 4.1 Ngôn ngữ

- **TypeScript xuyên suốt** cả 3 lớp (TSD 1.3) — dùng chung type và Zod schema qua `shared/`.
- **Giao diện + nội dung hệ thống: tiếng Việt có dấu 100%** (PRD 6, CGD 4.1) — kể cả khi chật chỗ.
- **Code, tên bảng, tên cột, tên biến: tiếng Anh.**

### 4.2 Cơ sở dữ liệu (BSD 1.4) — áp dụng thống nhất cho MỌI bảng

| Quy ước | Chuẩn |
|---|---|
| Tên bảng / cột | `snake_case`, tiếng Anh, **tên bảng số nhiều** (`customers`, không `customer`) |
| Khóa chính | Cột `id`, kiểu **UUID** sinh tự động — KHÔNG số nguyên tự tăng |
| Khóa ngoại | `<tên_bảng_số_ít>_id` (ví dụ `customer_id` → `customers`) |
| Đa pháp nhân | `company_id` trên mọi bảng nghiệp vụ (trừ bảng dùng chung — xem 3.5) |
| Audit columns | Mọi bảng có `created_at`, `updated_at`, `created_by`, `updated_by` |
| Xóa mềm | Bảng nghiệp vụ quan trọng dùng `deleted_at` (rỗng = chưa xóa), KHÔNG xóa hẳn |
| Phiên bản tài liệu | Bảng cần theo dõi phiên bản có `version` (int tăng dần) + `is_current_version` (bool) |
| Trạng thái | Cột `status` enum, luôn quy về **5 nhóm chuẩn**: `draft` / `pending_approval` / `in_progress` / `completed` / `overdue` |
| Tiền tệ | **`bigint`, đơn vị đồng (VNĐ), KHÔNG số thập phân** |
| Lịch sử | Thay đổi trạng thái/giá trị quan trọng ghi vào **bảng lịch sử riêng**, không ghi đè (BSD 2.3) |

### 4.3 UI tokens (CGD 6.3 – 6.5)

Khai báo thẳng làm CSS variable của shadcn/ui + token Tailwind, **không dùng thư viện màu bên thứ ba**.

| Vai trò | Mã màu |
|---|---|
| Brand Blue — **DUY NHẤT một hành động chính mỗi màn hình**, liên kết, focus | `#0C66E4` |
| Nền chính / nền phụ (vùng trũng) / viền | `#FFFFFF` / `#F7F8F9` / `#DCDFE4` |
| Chữ chính / chữ phụ (KHÔNG dùng đen `#000000`) | `#172B4D` / `#44546F` |
| Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn | `#6B778C` · `#B38600` · `#0C66E4` · `#22A06B` · `#CA3521` |

- Font: **Inter**; body **~14px** (mật độ thông tin có chủ đích — đây là phần mềm quản trị, không phải app tiêu dùng).
- Khoảng cách: **lưới bội số 8px**. Bo góc **4–8px**; **ngoại lệ duy nhất**: nhãn trạng thái (Lozenge) bo tròn hoàn toàn.
- Elevation: bóng đổ **rất nhẹ**, 4 mức (nền trũng → nền mặc định → thẻ nổi → lớp phủ). KHÔNG bóng đậm/3D/gradient.
- Phân cấp bằng **độ đậm + kích thước**, không bằng màu (màu để dành cho trạng thái và hành động chính).
- Dark mode: **KHÔNG bắt buộc cho demo** (CGD 6.7) — làm light mode trước.

### 4.4 Văn phong nội dung (CGD 2, 4)

- Giọng nói: rõ ràng, trực tiếp, chuyên nghiệp, **hỗ trợ chứ không phán xét**, ngắn gọn, nhất quán.
- **KHÔNG dùng đại từ nhân xưng** ("Vui lòng nhập…", "Không thể lưu do…"). **Ngoại lệ duy nhất**: lời chào
  Dashboard dùng tên — "Chào [Tên], …", KHÔNG dùng anh/chị.
- **KHÔNG emoji. KHÔNG IN HOA để nhấn mạnh** (dùng in đậm). KHÔNG nhiều dấu chấm than.
- Ngày `dd/mm/yyyy` · ngày+giờ `dd/mm/yyyy — hh:mm` (24h) · số `1.234.567,89` · tiền `125.000.000 đồng` · `8%`.
- Nút = **động từ mệnh lệnh** ("Lưu", "Gửi phê duyệt"), nêu rõ kết quả khi màn hình có nhiều loại "Tạo".
- Lỗi = `[việc gì không thực hiện được] + [vì sao / cần làm gì]`. **KHÔNG hiện mã HTTP/stack trace** cho
  người dùng — chỉ ghi log. Lỗi vượt quyền phải nói rõ **ai xử lý được**, không chỉ "Không đủ quyền".
- Trạng thái rỗng = `[tình trạng] + [hành động gợi ý]` + nút thao tác. Không để trang trắng.
- Đang tải: dùng **skeleton** đúng hình dạng nội dung, KHÔNG spinner toàn màn hình (AFD 6.7).
- Thư viện nội dung mẫu có sẵn: nhãn trạng thái (CGD 5.1), nút (5.2), thông báo (5.3), email (5.4),
  lỗi (5.5), trạng thái rỗng theo module (5.6) — **dùng lại, đừng nghĩ cách diễn đạt mới**.

### 4.5 Thuật ngữ chuẩn hóa (CGD 4.4) — mỗi khái niệm đúng MỘT từ

| Khái niệm | Dùng | KHÔNG dùng |
|---|---|---|
| Người phụ trách chính một hồ sơ | **Người chịu trách nhiệm** | Người sở hữu, Chủ hồ sơ, Owner |
| Đưa hồ sơ cho người có thẩm quyền | **Gửi phê duyệt** / Trình duyệt | Submit, Gửi duyệt, Gửi xin ý kiến |
| Đồng ý một đề xuất | **Phê duyệt** (rút gọn "Duyệt" CHỈ trên nút) | Approve, Chấp thuận |
| Đưa hồ sơ cho bộ phận tiếp theo | **Bàn giao** | Chuyển giao, Handover, Chuyển tiếp |
| Tài liệu đang có hiệu lực | **Đang hiệu lực** | Mới nhất, Hiện hành, Active |
| Công ty thành viên | **Pháp nhân** / gọi thẳng tên | Công ty con, Chi nhánh, Entity |
| Quá thời hạn xử lý | **Quá hạn** | Trễ hạn, Chậm, Overdue |

### 4.6 7 mẫu bố cục màn hình (AFD 4) — mọi màn hình phải thuộc một trong 7

1. **Dashboard** — lưới thẻ, mỗi thẻ bấm được dẫn tới danh sách đã lọc sẵn.
2. **Danh sách** — cột 1 là mã/tên; cột cố định: người chịu trách nhiệm, trạng thái (có màu), thời hạn. Giữ bộ lọc khi quay lại.
3. **Chi tiết "Hồ sơ 360°"** — quan trọng nhất: header cố định khi cuộn, nội dung chia **Tab** (cùng URL gốc),
   panel phải liệt kê hồ sơ liên quan ở module khác, **tab Lịch sử luôn có**.
4. **Biểu mẫu** — <~10 trường: một trang; dài/nhiều bước: **wizard** có thanh tiến trình, lưu nháp, quay lại
   không mất dữ liệu. Lưu xong → chuyển thẳng vào Chi tiết hồ sơ vừa tạo.
5. **Kanban/Pipeline** — chỉ cho quy trình có số trạng thái cố định (CRM-02). Duyệt tuần tự dùng mẫu 6.
6. **Hộp thư Phê duyệt** — **MỘT mẫu duy nhất cho mọi loại phê duyệt** ở mọi module. Xem nhanh bên phải
   đủ để quyết định; duyệt xong tự sang hồ sơ tiếp theo.
7. **Di động (Kho, công trường)** — bottom navigation 4–5 mục, KHÔNG thu nhỏ layout desktop; luôn hiện
   trạng thái đồng bộ dữ liệu.

**Không tự nghĩ mẫu thứ 8.** Bản đồ màn hình theo module: AFD 7.

### 4.7 Kiểm thử (TSD 2.6, 3.6)

- Giai đoạn demo: **ưu tiên E2E (Playwright) cho luồng nghiệp vụ CHÍNH** (AFD 3), không phủ 100% màn hình.
- Vitest cho logic xử lý dữ liệu và hàm nghiệp vụ trong Workers.
- **Bắt buộc kiểm thử chính sách RLS** bằng kịch bản SQL/Supabase CLI — xác nhận vai trò không xem/sửa được
  dữ liệu ngoài phạm vi, đặc biệt dữ liệu nhạy cảm (giá vốn, lương, lợi nhuận).

---

## 5. Constraints & rules

Đây là **hàng rào cứng**. Vi phạm = làm sai tài liệu đã được duyệt.

### 5.1 Ranh giới AI và phần mềm (PRD 2.3, và mục "Ranh giới KHÔNG làm" của TỪNG module ở PRD 5)

- **KHÔNG** để phần mềm hoặc AI tự quyết định / tự phê duyệt: nội dung chuyên môn, pháp lý, kỹ thuật, nhân
  sự, **giá bán cuối cùng, tỷ lệ lợi nhuận, mức dự phòng**, giải pháp kết cấu/MEP/PCCC, quyết định tuyển
  dụng–lương–kỷ luật, lựa chọn nhà cung cấp, phê duyệt thanh toán.
- **Mọi kết quả AI ở trạng thái NHÁP/ĐỀ XUẤT** cho tới khi người có thẩm quyền xem lại và xác nhận qua đúng
  luồng phê duyệt. Không tự động phát hành thành hồ sơ chính thức.
- **KHÔNG đưa dữ liệu nội bộ nhạy cảm** (bản vẽ, giá vốn, thông tin khách hàng, lợi nhuận, lương) lên nền
  tảng AI công cộng chưa kiểm soát bảo mật. Gemini **gói miễn phí** có thể được Google dùng để cải thiện sản
  phẩm → chỉ gửi phần dữ liệu thật sự cần cho việc phân tích (TSD 3.5).
- Tính năng AI luôn ở mức **phụ trợ tùy chọn** — hết hạn mức API không được chặn luồng nghiệp vụ chính (IPD 6).

### 5.2 Dữ liệu và phân quyền

- **KHÔNG hard-code hạn mức phê duyệt.** Cấu hình qua bảng `approval_limits` (PRD NEN-02). Mức 10 triệu /
  50 triệu trong tài liệu chỉ là giá trị mặc định ban đầu.
- **KHÔNG lưu**: mật khẩu thô, mã OTP, tài khoản ngân hàng cá nhân, tin đồn, nhận xét cảm tính chưa kiểm
  chứng, trao đổi cá nhân không liên quan công việc (PRD 2.2, NEN "Ranh giới").
- **Ghi nhật ký truy cập** với dữ liệu nhạy cảm: giá vốn, lợi nhuận, lương, nội dung thương thảo, dữ liệu
  thuế/ngân hàng (PRD NEN-07).
- **Một nguồn dữ liệu duy nhất**: mỗi nghiệp vụ nhập một lần tại nơi phát sinh; module khác **liên kết**, không
  sao chép, không nhập lại (PRD 2.3, BSD 2.3).

### 5.3 Phạm vi — những thứ KHÔNG được thay thế (PRD 2.2, PRD 9)

Hệ thống chỉ **tích hợp hoặc liên kết dữ liệu**, không thay thế:

- Phần mềm kế toán chính thức, hóa đơn điện tử, chữ ký số/token, eTax, ngân hàng điện tử, máy/phần mềm chấm công.
- Phần mềm thiết kế chuyên môn: AutoCAD, Revit, SketchUp, 3ds Max, V-Ray, Lumion, ETABS, SAP2000, Tekla…
- Phần mềm dự toán chuyên dụng: GXD, Delta, F1, Escon, Acitt.
- **KHÔNG tạo hai bộ số liệu độc lập** với phần mềm kế toán — nó vẫn là nguồn ghi sổ chính thức (PRD KT-08).

### 5.4 Trải nghiệm người dùng

- **KHÔNG bắt nhập liệu hai lần** (phần mềm + Excel/giấy/Zalo) trừ khi pháp luật buộc lưu bản gốc giấy (PRD 2.3).
- **Điều hướng phản ánh phân quyền**: ẩn menu/nút/liên kết khi không có quyền — **KHÔNG hiển thị rồi mới báo
  lỗi** khi bấm (AFD 6.5). Dữ liệu nhạy cảm ẩn cả trong panel liên kết chéo, không chỉ màn hình chính.
- **KHÔNG bao giờ để mất dữ liệu đang nhập**: tự lưu nháp, hỏi xác nhận khi rời trang (AFD 6.3).
- **KHÔNG tạo màu trạng thái mới** ngoài 5 màu chuẩn — trạng thái riêng của module vẫn phải quy về 1 trong 5.
- **KHÔNG dùng màu làm cách duy nhất truyền đạt thông tin** — trạng thái luôn kèm chữ (CGD 6.8, AFD 6.4).
- Không quá **3 cú nhấp** để tới một hồ sơ cụ thể (AFD 1.3).
- Vùng bấm trên di động tối thiểu **~40×40px** (CGD 6.8).

### 5.5 Hạ tầng và bảo mật (TSD 5.6, 5.2)

- **KHÔNG commit secret.** API key, khóa `service_role` của Supabase → **Cloudflare Workers Secrets**.
- Khóa `service_role` (vượt RLS) **chỉ dùng trong Workers**; Frontend chỉ dùng **anon key** bị RLS giới hạn hoàn toàn.
- **KHÔNG sửa cấu trúc bảng tay trên Supabase Dashboard.** Mọi thay đổi qua **migration Drizzle**, commit vào Git.
- HTTPS bắt buộc toàn bộ (tự động qua Cloudflare).
- Trước khi chạy migration trên production: xác nhận đã có bản sao lưu gần nhất (IPD 5.4).

### 5.6 Hai chốt chặn riêng

- **KHÔNG bắt đầu viết code TK-10 → TK-17** (AI Preliminary Design Engine) trước khi tài liệu đặc tả AI v02
  đã có trong `doc/` và đã được đọc. Xem 6.4.
- **Module TC và SX đang ở mức ĐỊNH HƯỚNG** — hai bộ phận liên quan (Chỉ huy–Giám sát công trường, Xưởng sản
  xuất giàn giáo) **chưa có phiếu khảo sát trực tiếp** (PRD 1.2, 10). Khi triển khai hai module này: đánh dấu
  rõ phần nào là suy luận gián tiếp, hỏi lại Haan, **không coi là yêu cầu đã chốt**.

---

## 6. Project decisions & standards

### 6.1 Quyết định công nghệ đã chốt — KHÔNG mở lại trừ khi điều kiện đổi (TSD 6)

| Hạng mục | Đã chọn | Đã loại | Vì sao loại |
|---|---|---|---|
| Kiến trúc trang | **SPA + Vite** | Next.js / SSR | App quản trị nội bộ, không cần SEO; triển khai Cloudflare Pages đơn giản hơn |
| Framework | **React 18** | Vue, Angular | Hệ sinh thái lớn nhất, công cụ AI hỗ trợ tốt nhất → giảm rủi ro tiến độ 6 tuần |
| CSDL | **PostgreSQL** | MongoDB / NoSQL | Dữ liệu quan hệ chặt (Hồ sơ 360°), cần toàn vẹn giao dịch tài chính |
| Nhà cung cấp CSDL | **Supabase** | Neon, PlanetScale, tự dựng VPS | Có sẵn Auth + Storage + Realtime trong cùng nền tảng; không có nhân sự DevOps |
| Backend tùy chỉnh | **Cloudflare Workers** | Supabase Edge Functions | Gộp frontend + backend trên cùng hạ tầng Cloudflare, hiệu năng biên mạng |
| Kiểu API | **REST** | GraphQL | Đơn giản hơn để triển khai/gỡ lỗi trong thời gian ngắn |
| Xác thực | **Supabase Auth** | Auth0, Clerk | Đủ tính năng, không phát sinh nhà cung cấp/chi phí thêm |
| Lưu tệp | **Supabase Storage** | Cloudflare R2 | Dùng lại đúng cơ chế RLS, không phải đồng bộ quyền ở hai nơi |
| Di động | **PWA** | React Native | Đủ cho offline cơ bản (KHO-09), không tốn thời gian phát triển/duyệt app |
| AI/OCR | **Google Gemini (Flash, gói miễn phí)** | Claude API, OpenAI API | Không phát sinh chi phí giai đoạn demo |

Ghi chú: TSD 5.6 có nhắc "khóa Claude API" trong danh sách secret — đây là dấu vết còn sót; nhà cung cấp AI
đã chốt là **Gemini** (TSD 3.5, 6).

### 6.2 Lộ trình 3 giai đoạn (PRD 4) — ngày cụ thể tra IPD 2, KHÔNG chép vào đây

| Giai đoạn | Module | Tiêu chí hoàn thành (PRD 7) |
|---|---|---|
| **GĐ 1** | NEN, CRM, DA, TK (trừ AI), HD, BC cơ bản | Một cơ hội chạy trọn **CRM → DA/TK → HD** trên dữ liệu thật, có lịch sử phiên bản dự toán + người phê duyệt truy vết được |
| **GĐ 2** | TC, MH, KHO, KT, NS, SX (cơ bản), BC đầy đủ | Một công trình chạy trọn **Hợp đồng → Ngân sách → Mua hàng/Kho → Nghiệm thu → Đề nghị thanh toán → Thu tiền → Lãi/lỗ**; BGĐ xem được dashboard gần thực; chấm công 3 khối chạy |
| **GĐ 3** | Hoàn thiện liên kết chéo → **~95%** + AI Design Engine | 12 module liên kết thông suốt, không lỗi chặn luồng chính; kịch bản demo đầu-cuối cho cả NVC/NVO/NVS + Back Office |

**Nguyên tắc nghiệm thu (PRD 7, 4)**: không đo bằng số tính năng đã lập trình xong, mà bằng **nhân sự thực sự
dùng, dữ liệu đúng, báo cáo đối soát được, quy trình trọng yếu chạy xuyên suốt**.

**Khi chậm tiến độ (IPD 4.3)**: ưu tiên luồng nghiệp vụ trọng yếu trong tiêu chí mốc; lùi tính năng phụ
(ví dụ TK-09 thư viện thiết kế, DA-11 hỗ trợ AI bóc tách) — **không lùi mốc**.

### 6.3 Môi trường và quy trình nhánh (TSD 5.3, 5.4, IPD 5)

- **3 môi trường tách biệt, mỗi môi trường một project Supabase riêng**: `dev` (cục bộ: Vite dev + Wrangler dev)
  · `staging` (preview Cloudflare) · `production`.
- Nhánh: `main` = production · `staging` = chờ nghiệm thu · feature branch cho từng tính năng/module.
- Deploy tự động qua tích hợp Git gốc của Cloudflare; migration chạy qua GitHub Actions khi gộp vào nhánh chính.
- Chỉ có một người triển khai → **không cần quy trình duyệt PR nhiều người**; bước Haan tự kiểm tra bản
  preview là kiểm soát chất lượng duy nhất — **giữ kỷ luật bước này kể cả khi vội** (IPD 5.2).

### 6.4 Phân vai Claude Code ↔ Haan (IPD 4)

| Việc | Chính | Còn lại |
|---|---|---|
| Schema, migration, code frontend/backend, kiểm thử, áp dụng UI | **Claude Code** | Haan chạy thử, phản hồi |
| **Xác nhận đúng nghiệp vụ thực tế NVG** | **Haan — không ủy quyền cho AI** | Claude Code liệt kê câu hỏi khi phát hiện mơ hồ |
| Trao đổi với Ban Giám đốc NVG | **Haan** | — |
| Triển khai production | Claude Code thực hiện bước kỹ thuật | **Haan xác nhận trước** |

**Quy tắc làm việc**: chu trình lặp NGẮN — giao một module/một luồng, chạy thử ngay khi có kết quả, phản hồi
cụ thể; không gộp nhiều việc rồi mới kiểm tra một lần (IPD 4.3).

**Khi gặp mơ hồ về nghiệp vụ**: liệt kê câu hỏi cho Haan, **không tự quyết** — đúng tinh thần "con người
luôn là người quyết định cuối cùng" (PRD 2.3).

### 6.5 Quyết định đã xác nhận qua trao đổi — TÀI LIỆU CHƯA CẬP NHẬT

> Sáu điểm dưới đây là chỗ tài liệu mâu thuẫn hoặc bỏ trống, đã hỏi Haan và được chốt.
> Khi tài liệu gốc được cập nhật, xóa mục tương ứng khỏi đây.

1. **Thứ tự ưu tiên tài liệu**: `PRD > AFD > TSD > CGD > BSD > IPD`. PRD v1.3 là bản mới nhất; các tài liệu
   khác ghi "PRD v1.2" chỉ là tham chiếu chưa cập nhật.
2. **AI Preliminary Design Engine (TK-10→TK-17) là tính năng quan trọng, quyết định thành công dự án** — có
   tài liệu đặc tả riêng, và được triển khai **ngay sau khi phần hệ thống cốt lõi đạt 90%**.
   → Điều này **thay thế** IPD 3.3 ("không nằm trong lịch trình, chỉ làm nếu còn thời gian Tuần 6").
3. **Tài liệu đặc tả AI v02 đã tồn tại**, Haan sẽ bổ sung vào `doc/` khi bắt đầu phần thiết kế AI.
   → **Cấm viết code TK-10→TK-17 trước khi tài liệu đó có trong `doc/` và đã đọc.**
   → Điều này **thay thế** IPD 7 ("chưa được soạn thảo").
4. **Repo** = chính thư mục `/home/haan/Documents/Project/NVG`, `doc/` nằm bên trong.
5. **CLAUDE.md không ghi ngày/mốc cụ thể** (tránh lỗi thời) — tra IPD 2 khi cần ngày.
6. **Thêm thư mục `shared/`** song song `web/ workers/ db/` cho Zod schema, type và hằng số dùng chung.
   → TSD 5.2 chỉ khai báo 3 thư mục nhưng TSD 1.3 yêu cầu dùng chung type/Zod; `shared/` lấp khoảng trống này.

### 6.6 Vấn đề còn mở — cần NVG xác nhận, KHÔNG tự quyết

Gộp từ PRD 10, TSD 7, CGD 7, BSD 5, IPD 7:

| Vấn đề | Ảnh hưởng |
|---|---|
| **Phần mềm kế toán chính thức** để tích hợp (MISA SME / AMIS / Fast?) | Chưa thiết kế được payload endpoint `/api/export/accounting-software` (KT-08) |
| **Hạn mức phê duyệt chính thức** theo cấp/loại nghiệp vụ | Đang dùng mức tạm; dữ liệu `approval_limits` phải cấu hình được |
| **Bộ mã vật tư / công trình / nhà cung cấp** thống nhất | NVG chưa có; sẽ tự tạo mẫu trước go-live từng giai đoạn |
| **Khảo sát Xưởng giàn giáo (NVS) + Chỉ huy công trường** | Module TC/SX có thể phải sửa lại một phần |
| **`unit_prices` dùng chung DA/TK/MH?** | Cần xác nhận NVO có cần bảng đơn giá riêng không (BSD 5) |
| **Cơ chế lương/thưởng chi tiết** từng công ty/nhóm nhân sự | Chưa cấu hình được NS-06 |
| **Tên miền chính thức** · **đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5) · **SSO** (chờ NVG có email công ty) | Chưa chặn phát triển |
| **Hạn mức + điều khoản bảo mật gói miễn phí Gemini** | Cần kiểm tra lại tại thời điểm triển khai; cân nhắc gói trả phí khi dùng dữ liệu thật |

---

## 7. Checklist trước khi bắt đầu một module mới

1. Đọc **PRD 5** phần module đó — gồm cả mục **"Ranh giới KHÔNG làm"**.
2. Đọc **BSD 4.x** tương ứng — bảng dữ liệu, **mẫu RLS A/B/C/D**, endpoint tùy chỉnh đã đặc tả.
3. Đọc **AFD 3.x** (hành trình người dùng) + **AFD 7** (bản đồ màn hình của module).
4. Với mỗi thao tác: quyết định **Supabase trực tiếp hay Workers** theo quy tắc ở mục 3.1.
5. Dùng lại **7 mẫu bố cục** (4.6), **thư viện nội dung** CGD 5, **thuật ngữ chuẩn** (4.5), **5 màu trạng thái** (4.3).
6. Gặp mơ hồ về nghiệp vụ → **hỏi Haan**, không tự quyết.
