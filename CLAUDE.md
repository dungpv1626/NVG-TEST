# CLAUDE.md — Hệ thống Phần mềm Quản trị Nhà Việt Group (NVG)

> File này là **bản đồ + hàng rào**, không thay thế tài liệu. Mọi khẳng định dưới đây đều truy được về
> tài liệu gốc trong `doc/` (ghi kèm mã tài liệu + số mục). Khi cần chi tiết đầy đủ, **đọc tài liệu gốc**.

---

## 1. Dự án là gì

Hệ thống quản trị nội bộ (web) cho **Nhà Việt Group** — tập đoàn 3 pháp nhân + Back Office dùng chung:

| Pháp nhân                | Mảng                                                    | Quy mô                   |
| ------------------------ | ------------------------------------------------------- | ------------------------ |
| **NVC** — Nhà Việt Cons  | Nhà xưởng công nghiệp, tổng thầu                        | ~30 dự án/năm            |
| **NVO** — Nhà Việt One   | Thiết kế + thi công trọn gói nhà ở dân dụng             | ~70 dự án/năm            |
| **NVS** — Nhà Việt Steel | Sản xuất, thương mại, cho thuê giàn giáo/kết cấu thép   | ~700 đơn hàng/năm        |
| **Back Office**          | Hành chính–Nhân sự, Cung ứng–Vật tư, Kế toán, Tài chính | dùng chung toàn hệ thống |

~40 nhân sự văn phòng/ban công trường + 50–200 lao động thời vụ. Hiện trạng: toàn bộ vận hành thủ công
trên Excel / Word / Zalo / Google Drive / email — không có nguồn dữ liệu chung (PRD 1.2).

**12 module**: `NEN` nền tảng · `CRM` khách hàng–cơ hội · `DA` dự án–đấu thầu · `TK` thiết kế ·
`HD` hợp đồng · `TC` thi công–ngân sách · `MH` mua hàng–vật tư · `KHO` kho · `KT` kế toán–tài chính ·
`NS` nhân sự–hành chính · `BC` báo cáo–dashboard · `SX` sản xuất–cho thuê giàn giáo.

Mục tiêu: bản **demo ~95% hoàn chỉnh**, chia 3 giai đoạn (PRD 4).

> **KHÔNG ghi mốc thời gian vào bất kỳ tài liệu nào của dự án** (QĐ-1, 05/09/2026). Bộ tài
> liệu v1.4 đã gỡ toàn bộ ngày/tuần và chỉ cam kết **THỨ TỰ** cùng **TIÊU CHÍ HOÀN THÀNH**.
> Ngoại lệ duy nhất có chủ đích: quy tắc định dạng ngày `dd/mm/yyyy` cho giao diện (CGD 4.3)
> — đó là quy tắc viết cho người dùng, không phải mốc dự án.

---

## 2. Document location

Toàn bộ tài liệu nguồn nằm trong `doc/` dưới dạng `.docx`.

| Mã      | File                                        | Trả lời câu hỏi                         | Đọc khi                                                   |
| ------- | ------------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| **PRD** | `PRD_He_thong_Quan_tri_NVG_v1_4.docx`       | Hệ thống làm được **GÌ**?               | Cần yêu cầu chức năng, business rule, ranh giới KHÔNG làm |
| **AFD** | `Webapp_Flow_Document_NVG_v1_1.docx`        | Người dùng đi **ĐẾN ĐÂU**, như thế nào? | Dựng màn hình, điều hướng, hành trình người dùng          |
| **TSD** | `TechStack_Document_NVG_v1_2.docx`          | Xây **BẰNG GÌ**, ở **ĐÂU**?             | Chọn thư viện, hạ tầng, CI/CD, môi trường                 |
| **CGD** | `ContentGuidelines_Document_NVG_v1_2.docx`  | Hệ thống **NÓI/HIỂN THỊ** thế nào?      | Viết microcopy, đặt tên nút, màu, font, khoảng cách       |
| **BSD** | `BackendSchema_Document_NVG_v1_1.docx`      | Dữ liệu **TỔ CHỨC** ra sao?             | Thiết kế bảng, quan hệ, RLS, API tùy chỉnh                |
| **IPD** | `ImplementationPlan_Document_NVG_v1_1.docx` | **LÀM GÌ, AI LÀM, theo THỨ TỰ nào**?    | Xem mốc, thứ tự khối công việc, quy trình deploy          |

### `doc/CHANGELOG_NVG_docs.md` — đọc TRƯỚC khi mở bất kỳ tài liệu nào

Bộ tài liệu được cập nhật đồng loạt ngày 05/09/2026 sau khi có đủ **11 phiếu khảo sát / 10 bộ
phận** (trước đó thiếu phiếu Xưởng giàn giáo và Chỉ huy công trường). File CHANGELOG là bản đối
chiếu TRƯỚC–SAU đầy đủ giữa bộ cũ và bộ hiện hành, kèm sáu quyết định gốc (QĐ-1 → QĐ-6) tạo ra
đợt thay đổi.

Nó tồn tại để **không phải đọc lại cả sáu tài liệu mới biết cái gì đã đổi**. Mở nó trước, rồi
mới mở tài liệu gốc ở đúng mục cần.

Mức độ thay đổi, để biết chỗ nào phải đọc kỹ: **TC đi từ 8 lên 20 yêu cầu**, **SX từ 3 lên 22**,
BSD từ ~65 lên ~95 thực thể, mẫu bố cục 7 → 9, mẫu RLS 4 → 5, màu trạng thái 5 → 6.

### Hồ sơ khảo sát vận hành — nguồn YÊU CẦU GỐC, đứng dưới PRD

`doc/khao-sat/HoSo_KhaoSat_NVG_full.md` — phiếu khảo sát của **12 bộ phận** do chính người
làm việc điền (Ban Giám đốc, Kinh doanh, Thiết kế, Dự toán, HCNS, Kế toán, Mua hàng, Kho,
**Xưởng sản xuất giàn giáo**, **Chỉ huy – Giám sát công trường**). Hai phiếu in đậm về ngày
02/09/2026 và là thứ đã gỡ chốt chặn ĐỊNH HƯỚNG của Module TC/SX (mục 5.6).

Đây là **dữ liệu thô, không phải đặc tả**: nó nói NVG đang làm gì và vướng gì, còn hệ thống
phải làm gì thì PRD quyết. Khi phiếu và PRD lệch nhau, PRD thắng — nhưng **báo lại Haan**,
vì lệch ở đây thường nghĩa là PRD viết trước khi biết chuyện.

Ba chỗ trong phiếu phải đọc kỹ trước khi động vào TC/SX: mục **3** (luồng nhận – làm – giao),
mục **6** (câu hỏi chuyên sâu của riêng bộ phận), mục **7** (ba vướng mắc lớn nhất + "việc gì
KHÔNG nên đưa lên phần mềm"). Mục 7 là ranh giới do chính người dùng vạch ra.

⚠️ Nhiều ô trong phiếu còn để trống dạng `[...]` hoặc ghi rõ là chưa thống kê được. **Ô trống
là câu hỏi cho Haan, không phải chỗ để điền giá trị mặc định** — xem mục 6.6.

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

Đây là quyết định then chốt để làm xong 12 module trong phạm vi đã cam kết. **Đọc kỹ trước khi viết bất kỳ endpoint nào.**

| Lớp                           | Công nghệ                                 | Dùng cho                                                                |
| ----------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| **Nền tảng dữ liệu**          | Supabase — REST tự sinh (PostgREST) + RLS | Toàn bộ CRUD thường: danh sách, chi tiết, tạo/sửa, lọc, tìm kiếm cơ bản |
| **Logic nghiệp vụ tùy chỉnh** | Cloudflare Workers + Hono                 | Nghiệp vụ nhiều bước không diễn đạt được bằng CRUD                      |

**Quy tắc chọn lớp** — mỗi lần định thêm một endpoint, tự hỏi:

- Chỉ đọc/ghi 1–vài bảng, và quyền diễn đạt được bằng RLS? → **Gọi thẳng Supabase từ Frontend. KHÔNG viết API.**
- Chỉ tạo endpoint Workers khi thoả **một trong ba**:
  - (a) gọi dịch vụ bên ngoài (Gemini, phần mềm kế toán),
  - (b) ghi nhiều bảng phải toàn vẹn cùng lúc,
  - (c) quy tắc nghiệp vụ phức tạp hơn khả năng của RLS.

Danh sách endpoint tùy chỉnh đã đặc tả sẵn cho từng module: **BSD 4.1 → 4.12**. Không tự phát minh
endpoint mới khi BSD đã có sẵn cái tương đương.

### 3.2 Stack (TSD 1.4)

| Lớp                  | Lựa chọn                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | **React 18 + TypeScript**, build bằng **Vite**, kiến trúc **SPA** (KHÔNG Next.js, KHÔNG SSR)                                                          |
| Giao diện            | **Tailwind CSS** + **shadcn/ui** (Radix) + **Lucide React** (icon) + **Recharts** (biểu đồ)                                                           |
| Dữ liệu & trạng thái | **TanStack Query** (dữ liệu máy chủ) + **Zustand** (trạng thái UI thuần) + `@supabase/supabase-js`                                                    |
| Biểu mẫu             | **React Hook Form** + **Zod** (Zod dùng chung cả 2 lớp)                                                                                               |
| Di động / offline    | **PWA**: `vite-plugin-pwa` + Workbox cho **TOÀN BỘ** ứng dụng (xem 6.5 mục 7) · **Dexie.js** (IndexedDB) chỉ cho Kho/công trường khi làm offline thật |
| Backend tùy chỉnh    | **Cloudflare Workers** + **Hono**, API kiểu **REST/JSON**                                                                                             |
| CSDL                 | **PostgreSQL** trên **Supabase** (managed)                                                                                                            |
| Schema/migration     | **Drizzle ORM** + `drizzle-kit`                                                                                                                       |
| Auth                 | **Supabase Auth** (email/mật khẩu; email giao dịch qua Resend/SendGrid)                                                                               |
| Lưu tệp / Realtime   | **Supabase Storage** / **Supabase Realtime**                                                                                                          |
| Tác vụ nền           | **Cloudflare Cron Triggers** (cảnh báo định kỳ NEN-04) + **Cloudflare Queues**                                                                        |
| Hosting              | **Cloudflare Workers** — frontend chạy dạng Static Assets, backend là Worker riêng (xem 6.5 mục 8) + **Supabase Cloud**                               |
| Kiểm thử             | **Vitest** + **React Testing Library** + **Playwright** (E2E)                                                                                         |

### 3.3 Cấu trúc thư mục (TSD 5.2 — monorepo, một repo GitHub duy nhất)

```
NVG/
├── CLAUDE.md         # file này
├── doc/              # 6 tài liệu .docx + docx2md.py — KHÔNG sửa nội dung tài liệu
│   ├── design/       # 15 file đặc tả AI Preliminary Design Engine (mục 8)
│   └── khao-sat/     # hồ sơ khảo sát vận hành 12 bộ phận (mục 2)
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

Mỗi bảng áp dụng **đúng một trong 5 mẫu chuẩn** (BSD 3.3 ghi sẵn mẫu nào cho bảng nào):

| Mẫu                                 | Logic                                                                                                                                                                         | Áp dụng cho                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **A** — theo pháp nhân              | Chỉ thấy dòng có `company_id` thuộc pháp nhân người dùng (`user_companies`); BGĐ/Admin thấy mọi pháp nhân                                                                     | Đa số bảng giao dịch                                                        |
| **B** — theo người chịu trách nhiệm | Điều kiện A + chỉ người chịu trách nhiệm/phối hợp/quản lý trực tiếp mới sửa; người khác chỉ xem                                                                               | Nháp báo giá, dự toán đang soạn, hồ sơ nhân sự                              |
| **C** — theo hạn mức phê duyệt      | Chỉ hiện trong Hộp thư Phê duyệt và cho phép duyệt nếu giá trị nằm trong hạn mức vai trò (`approval_limits`)                                                                  | `price_approvals`, `payment_requests`, `contracts`                          |
| **D** — hạn chế theo CỘT            | Xem được dòng theo A, nhưng cột nhạy cảm (giá vốn, lợi nhuận, lương) chỉ trả giá trị thật cho vai trò được phép — vai trò khác nhận rỗng qua view riêng                       | `estimates`, `project_budgets`, `employees`, `product_costs`                |
| **E** — theo PHẠM VI HIỆN TRƯỜNG    | Chỉ xem/ghi được dữ liệu thuộc công trình/xưởng mình được phân công (`user_site_assignments`); cấp quản lý xem toàn đơn vị. Áp cả cho thao tác ghi khi đồng bộ từ ngoại tuyến | `site_logs`, `acceptance_records`, và các bảng hiện trường TC/SX khi ra đời |

Mọi lượt xem/sửa dữ liệu **Mẫu D** phải ghi vào `sensitive_access_logs` (BSD 3.4, PRD NEN-07).

> **Mẫu E — dấu hiệu "cấp quản lý" KHÔNG phải quyền `approve`.** Khảo sát giao chính chỉ huy
> trưởng ký xác nhận bảng chấm công khối công trường, nên họ CÓ `approve` trên phân hệ TC. Lấy
> `approve` làm dấu hiệu quản lý thì đúng người cần giới hạn lại được miễn trừ và Mẫu E không áp
> lên ai. Phạm vi được khai thành thuộc tính của vai trò: cột **`roles.site_scoped`**, đúng cách
> AFD 2.3 phân biệt hai vai trò ("Công trình CỦA TÔI" so với "TẤT CẢ công trình").
>
> Vai trò hiện trường đầu tiên là **`CHT`** — Chỉ huy trưởng / Kỹ thuật hiện trường (migration
> `0114`/`0115`). Quyền của nó giống hệt `TC`; khác biệt duy nhất là phạm vi.
>
> ⚠️ **Quên phân công phải dẫn tới thấy ÍT đi, không phải thấy nhiều hơn.** Đừng cài kiểu "có
> bản ghi phân công thì mới bị giới hạn" — một chỉ huy trưởng mới, chưa được phân công, sẽ thấy
> toàn bộ công trình của pháp nhân. Người được ghi ở `construction_sites.responsible_user_id`
> được coi như đã phân công (một nguồn dữ liệu duy nhất, PRD 2.3).

> **Lưới an toàn có sẵn của Supabase**: dự án này có event trigger `ensure_rls` (hàm
> `public.rls_auto_enable`) TỰ ĐỘNG bật RLS cho mọi bảng mới tạo trong schema `public`.
> Nó chỉ BẬT RLS, không tạo policy — nên bảng mới mà quên viết policy sẽ **chặn hết**
> (fail-safe), không phải lộ hết. Vẫn phải viết policy cho từng bảng; lệnh
> `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` trong migration là dư nhưng giữ lại để
> migration tự mô tả đầy đủ, không phụ thuộc hành vi ngầm của nền tảng.

> **Lưu ý — BSD tự mâu thuẫn ở 3 chỗ**:
>
> - `employees` ghi Mẫu **D** ở BSD 3.3 nhưng Mẫu **B** ở BSD 4.10.
> - `quotes` ngụ ý Mẫu **B** ở BSD 3.3 nhưng ghi Mẫu **C** ở BSD 4.2.
> - `audit_logs` ghi Mẫu **C** ở BSD 4.1 — nhưng Mẫu C nói về hạn mức tiền của hồ sơ chờ duyệt,
>   không áp dụng được cho nhật ký. **Đã triển khai theo đúng mục đích NEN-07**: chỉ
>   TGĐ/CFO/BGĐ/ADMIN đọc được, KHÔNG AI ghi/sửa/xóa được từ trình duyệt (chỉ ghi qua hàm
>   `SECURITY DEFINER` hoặc Workers). Áp dụng tương tự cho `sensitive_access_logs`.
>
> Khi BSD 3.3 và BSD 4.x lệch nhau cho cùng một bảng: **ưu tiên BSD 4.x** (cụ thể theo module)
> và **báo lại Haan** để sửa tài liệu. Riêng `employees`: cột lương vẫn phải áp dụng hạn chế
> theo cột như Mẫu D, bất kể chọn mẫu nào cho dòng.

### 3.5 Đa pháp nhân (PRD NEN-01, BSD 2.2)

- Bảng `companies` chứa **NVC / NVS / NVO + "NVG"** — "NVG" là mã tổng hợp chỉ dùng cho báo cáo, **không
  phải pháp nhân giao dịch thật**.
- Bảng **GIAO DỊCH** (cơ hội, dự án, hợp đồng, phiếu kho, chứng từ…) **LUÔN có `company_id`** — đây là ranh
  giới tách P&L từng công ty.
- Bảng **DÙNG CHUNG** (`customers`, `suppliers`, `users`) **KHÔNG có `company_id`** — liên hệ với pháp nhân
  qua bảng giao dịch (một khách hàng có thể xuất hiện ở cơ hội của nhiều pháp nhân).

> **KHÔNG lọc `company_id = <id của NVG>`.** Vì NVG không phải pháp nhân giao dịch, không dòng nào
> trong bảng giao dịch mang mã đó — lọc như vậy cho ra danh sách RỖNG ở mọi màn hình. Lỗi này đã
> xảy ra thật: Giám đốc Tài chính và Quản trị viên chỉ được gán vào NVG nên mở màn hình nào cũng
> trắng, trong khi phân quyền hoàn toàn đúng.
>
> Chọn "Toàn NVG" (AFD 2.2) thì **bỏ hẳn điều kiện lọc** và để RLS quyết định phạm vi — dùng
> `useCompanyScope()` + `withCompanyScope()` (`web/src/lib/company-scope.ts`), đừng viết lại điều
> kiện ở từng hook. Bỏ lọc KHÔNG mở thêm quyền cho ai (có test khẳng định điều đó); màn hình gộp
> phải hiện thêm cột **Pháp nhân** để không đọc nhầm số của công ty khác.

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

#### "100% tiếng Việt" bao gồm cả chữ do TRÌNH DUYỆT tự sinh

Đây là chỗ đã lọt lưới thật, nhiều lần. Nhân sự NVG có người không đọc được tiếng Anh, nên một
câu tiếng Anh hiện lên đúng lúc họ đang bị chặn thao tác là bế tắc hoàn toàn — họ không biết
mình sai gì và cũng không đọc được hướng dẫn sửa.

Nguy hiểm ở chỗ **những chữ này không nằm trong mã nguồn**, nên đọc code không thấy, `grep`
không ra, và trên máy của người lập trình (thường để tiếng Việt hoặc quen tiếng Anh) chúng
trông vẫn bình thường. Chúng theo **ngôn ngữ của TRÌNH DUYỆT**, không theo `lang` của trang, và
không có thuộc tính HTML nào ép được.

Bốn nguồn đã gặp:

| Nguồn                                              | Biểu hiện trên Chrome tiếng Anh                             | Cách xử lý                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Ràng buộc biểu mẫu (`required`, `min`, `pattern`…) | "Please fill out this field."                               | `setCustomValidity` bằng câu tiếng Việt — đã gom vào `Input`, xem `web/src/lib/validation-message.ts` |
| `<input type="date">`                              | Ô hiện `mm/dd/yyyy`; bảng lịch hiện "September", "Su Mo Tu" | Dùng `DateInput` — ô chữ `dd/mm/yyyy` + bảng lịch tự dựng bằng tiếng Việt                             |
| `<input type="number">`                            | Nút tăng/giảm, thông báo `step`/`min` tiếng Anh             | Dùng `MoneyInput` cho tiền; ô số khác dùng `inputMode`                                                |
| `window.confirm` / `alert`                         | Nút "OK" / "Cancel" tiếng Anh                               | Không ép được — hạn chế dùng; việc quan trọng thì dựng hộp thoại riêng                                |

**Quy tắc:** trước khi dùng bất kỳ điều khiển gốc nào của trình duyệt, hỏi "cái này có tự sinh
chữ không?". Có thì phải kiểm bằng cách **đặt Chrome sang tiếng Anh rồi mở màn hình đó** —
không phải bằng cách đọc lại code.

Có test canh sẵn trong `web/src/test/design-rules.test.ts`.

### 4.2 Cơ sở dữ liệu (BSD 1.4) — áp dụng thống nhất cho MỌI bảng

| Quy ước                | Chuẩn                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tên bảng / cột         | `snake_case`, tiếng Anh, **tên bảng số nhiều** (`customers`, không `customer`)                                                                                                |
| Khóa chính             | Cột `id`, kiểu **UUID** sinh tự động — KHÔNG số nguyên tự tăng                                                                                                                |
| Khóa ngoại             | `<tên_bảng_số_ít>_id` (ví dụ `customer_id` → `customers`)                                                                                                                     |
| Đa pháp nhân           | `company_id` trên mọi bảng nghiệp vụ (trừ bảng dùng chung — xem 3.5)                                                                                                          |
| Audit columns          | Mọi bảng có `created_at`, `updated_at`, `created_by`, `updated_by`                                                                                                            |
| Xóa mềm                | Bảng nghiệp vụ quan trọng dùng `deleted_at` (rỗng = chưa xóa), KHÔNG xóa hẳn                                                                                                  |
| Phiên bản tài liệu     | Bảng cần theo dõi phiên bản có `version` (int tăng dần) + `is_current_version` (bool)                                                                                         |
| Trạng thái             | Cột `status` enum, luôn quy về **6 nhóm chuẩn**: `draft` / `pending_approval` / `in_progress` / `completed` / `overdue` / `disputed`                                          |
| Tiền tệ                | **`bigint`, đơn vị đồng (VNĐ), KHÔNG số thập phân**                                                                                                                           |
| Số lượng vật lý        | **`numeric` có phần thập phân**, KHÔNG số nguyên — thép và vật tư tính theo kg, mét, m² với giá trị lẻ. Đơn vị tính lưu ở bảng danh mục, không nhúng vào tên cột              |
| Bản ghi từ hiện trường | Thêm `client_created_at` (người dùng BẤM lúc nào — mốc NGHIỆP VỤ), `synced_at` (máy chủ tự đặt, không nhận từ trình duyệt), `client_generated_id` (khử trùng khi đồng bộ lại) |
| Lịch sử                | Thay đổi trạng thái/giá trị quan trọng ghi vào **bảng lịch sử riêng**, không ghi đè (BSD 2.3)                                                                                 |

### 4.3 UI tokens (CGD 6.3 – 6.5)

Khai báo thẳng làm CSS variable của shadcn/ui + token Tailwind, **không dùng thư viện màu bên thứ ba**.

| Vai trò                                                                     | Mã màu                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Brand Blue — **DUY NHẤT một hành động chính mỗi màn hình**, liên kết, focus | `#0C66E4`                                                             |
| Nền chính / nền phụ (vùng trũng) / viền                                     | `#FFFFFF` / `#F7F8F9` / `#DCDFE4`                                     |
| Chữ chính / chữ phụ (KHÔNG dùng đen `#000000`)                              | `#172B4D` / `#44546F`                                                 |
| Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn · **Tranh chấp**       | `#6B778C` · `#B38600` · `#0C66E4` · `#22A06B` · `#CA3521` · `#8270DB` |

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

| Khái niệm                         | Dùng                                         | KHÔNG dùng                         |
| --------------------------------- | -------------------------------------------- | ---------------------------------- |
| Người phụ trách chính một hồ sơ   | **Người chịu trách nhiệm**                   | Người sở hữu, Chủ hồ sơ, Owner     |
| Đưa hồ sơ cho người có thẩm quyền | **Gửi phê duyệt** / Trình duyệt              | Submit, Gửi duyệt, Gửi xin ý kiến  |
| Đồng ý một đề xuất                | **Phê duyệt** (rút gọn "Duyệt" CHỈ trên nút) | Approve, Chấp thuận                |
| Đưa hồ sơ cho bộ phận tiếp theo   | **Bàn giao**                                 | Chuyển giao, Handover, Chuyển tiếp |
| Tài liệu đang có hiệu lực         | **Đang hiệu lực**                            | Mới nhất, Hiện hành, Active        |
| Công ty thành viên                | **Pháp nhân** / gọi thẳng tên                | Công ty con, Chi nhánh, Entity     |
| Quá thời hạn xử lý                | **Quá hạn**                                  | Trễ hạn, Chậm, Overdue             |

### 4.6 9 mẫu bố cục màn hình (AFD 4) — mọi màn hình phải thuộc một trong 9

1. **Dashboard** — lưới thẻ, mỗi thẻ bấm được dẫn tới danh sách đã lọc sẵn.
2. **Danh sách** — cột 1 là mã/tên; cột cố định: người chịu trách nhiệm, trạng thái (có màu), thời hạn. Giữ bộ lọc khi quay lại.
3. **Chi tiết "Hồ sơ 360°"** — quan trọng nhất: header cố định khi cuộn, nội dung chia **Tab** (cùng URL gốc),
   panel phải liệt kê hồ sơ liên quan ở module khác, **tab Lịch sử luôn có**.
4. **Biểu mẫu** — <~10 trường: một trang; dài/nhiều bước: **wizard** có thanh tiến trình, lưu nháp, quay lại
   không mất dữ liệu. Lưu xong → chuyển thẳng vào Chi tiết hồ sơ vừa tạo.
5. **Kanban/Pipeline** — chỉ cho quy trình có số trạng thái cố định (CRM-02). Duyệt tuần tự dùng mẫu 6.
6. **Hộp thư Phê duyệt** — **MỘT mẫu duy nhất cho mọi loại phê duyệt** ở mọi module. Xem nhanh bên phải
   đủ để quyết định; duyệt xong tự sang hồ sơ tiếp theo.
7. **Request Tracker** (MỚI ở AFD v1.1 §4.7) — màn hình cho người **GỬI** đề nghị, đối xứng với mẫu 6
   dành cho người **DUYỆT**. Mỗi dòng hiện: bước hiện tại, ai đang giữ, đã chờ bao lâu, hạn còn lại;
   thanh tiến trình chỉ ra bước đang tắc; nút "Thúc" ghi vào lịch sử hồ sơ. Đây là cách thay việc gọi
   điện và nhắn Zalo nhiều lần — **ưu tiên số một của công trường** (TC-10).
8. **Di động (Kho, Xưởng, công trường)** — bottom navigation 4–5 mục, KHÔNG thu nhỏ layout desktop; luôn
   hiện trạng thái đồng bộ dữ liệu. Mở rộng ở AFD v1.1 từ hai nhóm lên **ba** (thêm Xưởng), và thêm ba
   ràng buộc: nút chụp ảnh luôn trong tầm ngón cái, **không bao giờ ẩn sau menu** (ảnh là chứng cứ chính
   của cả ba nhóm); ưu tiên chọn từ danh sách gợi ý thay vì gõ tay (người dùng đeo găng, ngoài nắng, bụi
   và ồn); đồng hồ **ngân sách thao tác** trên màn hình chốt ngày.
   ⚠️ Mục này **đổi số từ 4.7 sang 4.8** ở AFD v1.1 do chèn thêm Request Tracker — comment cũ trỏ "4.7"
   trong mã nguồn đã được sửa theo.
9. **Asset Ledger — Sổ cái tài sản luân chuyển** (MỚI ở AFD v1.1 §4.9) — ma trận **hàng = mã sản phẩm,
   cột = trạng thái/vị trí** (kho, xưởng, đang trên đường, tại từng khách, tại từng công trình nội bộ,
   đang sửa, chờ thanh lý, thiếu chưa thu hồi). Mỗi ô bấm được để mở danh sách chứng từ tạo ra con số đó.
   **Dòng tổng của mỗi mã phải luôn cân; không cân thì cảnh báo ngay trên dòng đó**, không để người dùng
   tự phát hiện. Có bộ lọc thời gian để xem lại sổ cái tại một ngày trong quá khứ (SX-15, KHO-06).

**Không tự nghĩ mẫu thứ 10.** Bản đồ màn hình theo module: AFD 7.

> **Ngân sách thao tác hiện trường là TIÊU CHÍ NGHIỆM THU, không phải mong muốn** (PRD v1.4 Mục 6).
> Thao tác cập nhật hằng ngày của một chỉ huy trưởng hoặc người phụ trách xưởng **không vượt quá 10–20
> phút, mục tiêu 5–10 phút**. Khảo sát nói rõ hệ quả nếu vượt: người dùng quay lại Excel và Zalo, và
> khi đó phần mềm chỉ làm tăng việc cho công trường mà không gỡ được điểm nghẽn nào.

### 4.7 Kiểm thử (TSD 2.6, 3.6)

- Giai đoạn demo: **ưu tiên E2E (Playwright) cho luồng nghiệp vụ CHÍNH** (AFD 3), không phủ 100% màn hình.
- Vitest cho logic xử lý dữ liệu và hàm nghiệp vụ trong Workers.
- **Bắt buộc kiểm thử chính sách RLS** bằng kịch bản SQL/Supabase CLI — xác nhận vai trò không xem/sửa được
  dữ liệu ngoài phạm vi, đặc biệt dữ liệu nhạy cảm (giá vốn, lương, lợi nhuận).

#### Chạy test: CHỈ phần liên quan tới thay đổi, không chạy toàn bộ

Bộ test đầy đủ mất ~100 giây vì phần trong `db/` gọi Supabase từ xa. Chạy đầy đủ theo phản xạ
vừa chậm vừa dễ tạo báo động giả, và tốn thêm một lượt chạy lại mới biết là giả.

> Một nguồn báo động giả đã được sửa tận gốc (27/08/2026): hạn 5 giây mặc định của Vitest quá
> ngắn cho test gọi 5–10 lượt RPC nối tiếp, nên mạng chậm hơn thường lệ là đỏ vì HẾT GIỜ chứ
> không phải vì nghiệp vụ sai. Nhóm `logic` nay đặt `testTimeout: 30s` trong `vitest.config.ts`.
> Vẫn còn nguồn thứ hai chưa sửa được: **rate limit của Supabase Auth** khi đăng nhập nhiều
> tài khoản liên tiếp. Gặp test đỏ ở `db/`, hãy chạy lại đúng tệp đó TRƯỚC khi kết luận là lỗi
> thật — nhưng nếu vẫn đỏ ở cùng chỗ thì đó là lỗi thật, đừng đổ cho mạng.

| Đổi ở đâu                               | Chạy gì                                                             | Thời gian                |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| `web/`, `shared/` (phần giao diện dùng) | `npx vitest run --project web`                                      | ~4 giây, không chạm CSDL |
| Logic thuần trong `shared/`             | `npx vitest run --project logic shared/src/__tests__/<tệp>.test.ts` | vài giây                 |
| Migration / RLS trong `db/`             | `npx vitest run --project logic db/src/__tests__/<module>.test.ts`  | tuỳ module               |

Luôn kèm `npx tsc -b` và `npx prettier --check <tệp đã đổi>` — nhanh, và bắt được thứ test không bắt.

Chạy `npm test` đầy đủ CHỈ khi Haan yêu cầu, hoặc ngay trước khi commit một đợt lớn.

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
- **NEN-12 — tham số hoá thay vì cố định.** Mọi giá trị NVG cho biết là **biến động** phải nằm trong bảng
  `system_parameters`, không hard-code: đơn giá thuê giàn giáo, bảng giá bồi thường, giá thuê nội bộ,
  ngưỡng tỷ lệ lỗi, thời hạn cam kết phản hồi của từng phòng ban (`sla_definitions`).
  → **Ba bảng cấu hình song song, đừng gộp:** `approval_limits` (hạn mức, có bước duyệt và loại nghiệp
  vụ) · `aging_buckets` (mốc tuổi nợ, có thứ tự và khoảng ngày) · `system_parameters` (phần còn lại).
  Hai bảng đầu có lược đồ riêng đúng hình dạng dữ liệu của chúng và đã có kiểm thử — Haan đã chốt giữ
  nguyên (05/09/2026).
  → **Đổi tham số KHÔNG hồi tố.** Chứng từ đã phát hành phải LƯU LẠI giá trị đã áp dụng (ví dụ
  `unit_price_applied`), không đọc lại tham số hiện hành khi hiển thị lịch sử. Cưỡng chế nằm ở phía
  chứng từ, không ở bảng tham số.
  → **`coalesce` đặt ở NƠI GỌI, không giấu trong hàm đọc.** `system_parameter_number()` trả `NULL` khi
  chưa cấu hình và cố ý không tự dựng lại mặc định — bài học migration 0046: mặc định dựng lại trong SQL
  khiến việc xoá hết cấu hình trông như thể cấu hình vẫn còn hiệu lực.
- **Quy tắc bất biến của chứng từ đã phát hành (BSD v1.1 3.5).** Ba nhóm không sửa trực tiếp được, mọi
  thay đổi phải là **chứng từ điều chỉnh mới có người duyệt**: chứng từ giao nhận/thu hồi giàn giáo có
  chữ ký hai bên · biên bản nghiệm thu đã ký với Chủ đầu tư/Tư vấn giám sát · chứng từ kế toán thuộc kỳ
  đã khoá. Cưỡng chế ở **CSDL** (`frozen_after_signed`, `close_accounting_period`), không ở giao diện —
  ẩn nút Sửa không chặn được một câu PATCH thẳng vào PostgREST.
- **KHÔNG hiển thị số ước lượng.** Chỉ số mà NVG chưa có dữ liệu thật (tỷ lệ lỗi, tỷ lệ thất thoát, năng
  suất chuẩn) hiện **"Chưa đủ dữ liệu"** — KHÔNG hiện `0`, KHÔNG điền số mặc định. Câu chuẩn dùng lại ở
  `EMPTY_STATES.notEnoughData` (`@nvg/shared`), có test canh trong `web/src/test/design-rules.test.ts`.
  Khảo sát Xưởng viết thẳng: _"không nên ước lượng một con số để điền vì đây là dữ liệu quan trọng cho
  quản trị tài sản và định giá cho thuê"_. Hiện `0` là báo cáo sai theo hướng lạc quan nhất — "tỷ lệ lỗi
  0%" đọc như xưởng không có lỗi nào, chứ không đọc như chưa đếm.
- **Trách nhiệm hai chiều, có thời hạn.** Không chỉ yêu cầu hiện trường cập nhật; văn phòng cũng phải xử
  lý trên cùng hệ thống với thời hạn phản hồi cấu hình được (`sla_definitions`). Thiếu vế thứ hai thì
  phần mềm chỉ làm tăng việc cho công trường mà không gỡ được điểm nghẽn.
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
- **KHÔNG tạo màu trạng thái mới** ngoài 6 màu chuẩn — trạng thái riêng của module vẫn phải quy về 1 trong 6.
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

- ~~**KHÔNG bắt đầu viết code TK-10 → TK-17** trước khi tài liệu đặc tả AI đã có trong `doc/`.~~
  **Chốt chặn này đã GỠ ngày 28/08/2026** — bộ tài liệu đặc tả nằm ở `doc/design/` (14 file) và đã
  được đọc. Hàng rào cho module thiết kế nay ở **mục 8**; đọc `doc/design/README.md` trước, vì nó
  chứa các đính chính chỗ tài liệu mô tả sai hiện trạng.
- ~~**Module TC và SX đang ở mức ĐỊNH HƯỚNG** — hai bộ phận liên quan chưa có phiếu khảo sát trực tiếp.~~
  **Chốt chặn này đã GỠ ngày 02/09/2026** — hai phiếu còn thiếu đã về:
  **Xưởng sản xuất giàn giáo** (Nguyễn Thị Phượng, Phó giám đốc) và **Chỉ huy – Giám sát công
  trường** (Nguyễn Công Minh, Trưởng phòng thi công). Bản đầy đủ (12 bộ phận) ở
  `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`.
  → TC và SX nay có nguồn yêu cầu trực tiếp như 10 bộ phận còn lại. Bốn chỗ suy luận trong mã
  nguồn đã được thay bằng câu trả lời thật (migration `0105`, `0106`; xem BUILD_PLAN 3A/3F).
  → **Vẫn còn chỗ trống, nhưng là trống KHÁC**: phiếu để ngỏ một số ô cần số liệu (tỷ lệ lỗi,
  giá trị thất thoát/năm, đơn giá công đoạn, một ngày công bằng mấy giờ ở xưởng). Người điền ghi
  thẳng "không nên ước lượng một con số để điền" — **đừng tự điền hộ**, hỏi Haan. Danh sách ở mục
  6.6 và `TIEN_DO.html`.

> ⚠️ **Gỡ chốt chặn KHÔNG có nghĩa hai module đã xong — phạm vi vừa nở ra rất nhiều.** PRD v1.4
> thay **toàn bộ** TC-01→TC-08 bằng **TC-01→TC-20**, và SX-01→SX-03 bằng **SX-01→SX-22**. Trong
> đó bảy yêu cầu TC là hoàn toàn mới (bản vẽ đang hiệu lực, phiếu giao việc, theo dõi trạng thái
> đề nghị, RFI, quản lý phát sinh, an toàn lao động, giàn giáo tại công trường), và SX chuyển từ
> "Giai đoạn 3, mức định hướng" sang **"Giai đoạn 2, phạm vi đầy đủ"** (QĐ-2).
>
> Mã nguồn hiện có mới phủ phần lõi của phạm vi CŨ. Đối chiếu phần còn thiếu ở `BUILD_PLAN.md`
> trước khi bắt đầu bất kỳ việc gì thuộc hai module này.
>
> **Nếu buộc phải cắt, cắt theo đúng thứ tự IPD v1.1 §4.3 — không tự chọn:**
> · **Giữ bằng mọi giá:** SX-15 → SX-21 (vòng đời tài sản cho thuê) và TC-05, TC-09, TC-10,
> TC-13 (liên thông công trường – văn phòng). Đây là ưu tiên số một mà chính hai bộ phận tự nêu.
> · **Hoàn thiện dần sau:** SX-07 (định mức), SX-10 (năng suất chuẩn), SX-22 (giá thành) — các
> phần này cần dữ liệu thực tế tích luỹ mới có ý nghĩa.

---

## 6. Project decisions & standards

### 6.1 Quyết định công nghệ đã chốt — KHÔNG mở lại trừ khi điều kiện đổi (TSD 6)

| Hạng mục          | Đã chọn                                 | Đã loại                        | Vì sao loại                                                                   |
| ----------------- | --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Kiến trúc trang   | **SPA + Vite**                          | Next.js / SSR                  | App quản trị nội bộ, không cần SEO; triển khai lên Cloudflare đơn giản hơn    |
| Framework         | **React 18**                            | Vue, Angular                   | Hệ sinh thái lớn nhất, công cụ AI hỗ trợ tốt nhất → giảm rủi ro tiến độ       |
| CSDL              | **PostgreSQL**                          | MongoDB / NoSQL                | Dữ liệu quan hệ chặt (Hồ sơ 360°), cần toàn vẹn giao dịch tài chính           |
| Nhà cung cấp CSDL | **Supabase**                            | Neon, PlanetScale, tự dựng VPS | Có sẵn Auth + Storage + Realtime trong cùng nền tảng; không có nhân sự DevOps |
| Backend tùy chỉnh | **Cloudflare Workers**                  | Supabase Edge Functions        | Gộp frontend + backend trên cùng hạ tầng Cloudflare, hiệu năng biên mạng      |
| Kiểu API          | **REST**                                | GraphQL                        | Đơn giản hơn để triển khai/gỡ lỗi trong thời gian ngắn                        |
| Xác thực          | **Supabase Auth**                       | Auth0, Clerk                   | Đủ tính năng, không phát sinh nhà cung cấp/chi phí thêm                       |
| Lưu tệp           | **Supabase Storage**                    | Cloudflare R2                  | Dùng lại đúng cơ chế RLS, không phải đồng bộ quyền ở hai nơi                  |
| Di động           | **PWA**                                 | React Native                   | Đủ cho offline cơ bản (KHO-09), không tốn thời gian phát triển/duyệt app      |
| AI/OCR            | **Google Gemini (Flash, gói miễn phí)** | Claude API, OpenAI API         | Không phát sinh chi phí giai đoạn demo                                        |

Ghi chú: TSD 5.6 có nhắc "khóa Claude API" trong danh sách secret — đây là dấu vết còn sót; nhà cung cấp AI
đã chốt là **Gemini** (TSD 3.5, 6).

### 6.2 Lộ trình 3 giai đoạn (PRD 4) — chỉ THỨ TỰ và TIÊU CHÍ, KHÔNG có ngày

| Giai đoạn | Module                                                 | Tiêu chí hoàn thành (PRD 7)                                                                                               |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **GĐ 1**  | NEN, CRM, DA, TK (trừ AI), HD, BC cơ bản               | Một cơ hội chạy trọn **CRM → DA/TK → HD** trên dữ liệu thật, có lịch sử phiên bản dự toán + người phê duyệt truy vết được |
| **GĐ 2**  | TC, MH, KHO, KT, NS, **SX phạm vi ĐẦY ĐỦ**, BC đầy đủ  | **Bốn** luồng đầu-cuối phải CÙNG chạy được — xem bảng dưới                                                                |
| **GĐ 3**  | Hoàn thiện liên kết chéo → **~95%** + AI Design Engine | 12 module liên kết thông suốt, không lỗi chặn luồng chính; kịch bản demo đầu-cuối cho cả NVC/NVO/NVS + Back Office        |

**Bốn luồng bắt buộc của Mốc M2** (IPD v1.1 2.2 — M2 chỉ đạt khi cả bốn cùng chạy):

1. Công trình chạy trọn **Hợp đồng → Ngân sách → Mua hàng/Kho → Nghiệm thu → Đề nghị thanh toán →
   Thu tiền → Lãi/lỗ**.
2. **Đơn thuê giàn giáo** chạy trọn: báo giá có kiểm tồn → xuất kho → chuỗi sự kiện giao–trả → thu hồi
   và kiểm đếm → đối soát → tất toán (ưu tiên số một của NVS).
3. **Lệnh sản xuất** chạy trọn: lệnh có phiên bản → cấp vật tư theo định mức → công đoạn → chất lượng →
   nhập kho thành phẩm → giá thành.
4. **Vận hành công trường hằng ngày** chạy trọn: nhật ký điện tử → đề nghị vật tư có hạn xử lý →
   nghiệm thu bằng checklist.

**Nguyên tắc nghiệm thu (PRD 7, 4)**: không đo bằng số tính năng đã lập trình xong, mà bằng **nhân sự thực sự
dùng, dữ liệu đúng, báo cáo đối soát được, quy trình trọng yếu chạy xuyên suốt**.

⚠️ **SX đã chuyển từ "GĐ 3, mức định hướng" sang "GĐ 2, phạm vi đầy đủ"** (QĐ-2, PRD v1.4 Mục 4) — cả
sản xuất, định mức và giá thành, không chỉ tài sản cho thuê.

**Khi phải cắt (IPD v1.1 4.3)**: **thứ tự cắt đã định sẵn**, không tự chọn — xem mục 5.6. Ưu tiên luồng
nghiệp vụ trọng yếu trong tiêu chí mốc; lùi tính năng phụ (ví dụ TK-09 thư viện thiết kế, DA-11 hỗ trợ AI
bóc tách).

### 6.3 Môi trường và quy trình nhánh (TSD 5.3, 5.4, IPD 5)

> ⚠️ **THỰC TẾ HIỆN NAY KHÁC TÀI LIỆU: chỉ có MỘT project Supabase.** Đã kiểm ngày 27/08/2026
> bằng cách đối chiếu chunk `auth-*.js` của bản đang chạy với `.env` ở máy — cả hai cùng trỏ
> tới project ref `awaiwegmuykhctnysvou`. Nghĩa là **máy phát triển và bản chạy thử công khai
> (`nvg.tests99.workers.dev`) dùng chung một cơ sở dữ liệu.**
>
> Bốn hệ quả phải nhớ chừng nào còn như vậy:
>
> 1. Chạy `npm run db:migrate` ở máy là **đổi luôn CSDL của bản đang chạy** — không có bước
>    nghiệm thu ở giữa. Migration sai thì bản công khai sai ngay.
> 2. Bộ test trong `db/` chạy trên **chính CSDL đó**, và `cleanupTestData` **XOÁ CỨNG**. Hiện
>    an toàn vì chỉ xoá theo tiền tố `[TEST]` và `year >= 2090`, nhưng đây là thứ không được
>    phép tồn tại khi đã có dữ liệu thật.
> 3. Dữ liệu demo nạp ở máy hiện luôn trên bản công khai.
> 4. "Xác nhận sao lưu trước migration production" (IPD 5.4) hiện **không có ý nghĩa** — không
>    có production tách biệt để sao lưu.
>
> **Hạn chót phải tách: TRƯỚC khi NVG nhập dòng dữ liệu thật đầu tiên.** Danh sách việc cụ thể
> ở `BUILD_PLAN.md` mục 4E. Giữ một CSDL trong giai đoạn demo là chấp nhận được và đã được
> Haan chốt (27/08/2026); đừng tự tách sớm, cũng đừng quên tách.

- **3 môi trường tách biệt, mỗi môi trường một project Supabase riêng**: `dev` (cục bộ: Vite dev + Wrangler dev)
  · `staging` (preview Cloudflare) · `production`.
- Nhánh: `main` = production · `staging` = chờ nghiệm thu · feature branch cho từng tính năng/module.
- Deploy tự động qua tích hợp Git gốc của Cloudflare; migration chạy qua GitHub Actions khi gộp vào nhánh chính.
- Chỉ có một người triển khai → **không cần quy trình duyệt PR nhiều người**; bước Haan tự kiểm tra bản
  preview là kiểm soát chất lượng duy nhất — **giữ kỷ luật bước này kể cả khi vội** (IPD 5.2).

### 6.4 Phân vai Claude Code ↔ Haan (IPD 4)

| Việc                                                           | Chính                               | Còn lại                                         |
| -------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| Schema, migration, code frontend/backend, kiểm thử, áp dụng UI | **Claude Code**                     | Haan chạy thử, phản hồi                         |
| **Xác nhận đúng nghiệp vụ thực tế NVG**                        | **Haan — không ủy quyền cho AI**    | Claude Code liệt kê câu hỏi khi phát hiện mơ hồ |
| Trao đổi với Ban Giám đốc NVG                                  | **Haan**                            | —                                               |
| Triển khai production                                          | Claude Code thực hiện bước kỹ thuật | **Haan xác nhận trước**                         |

**Quy tắc làm việc**: chu trình lặp NGẮN — giao một module/một luồng, chạy thử ngay khi có kết quả, phản hồi
cụ thể; không gộp nhiều việc rồi mới kiểm tra một lần (IPD 4.3).

**Khi gặp mơ hồ về nghiệp vụ**: liệt kê câu hỏi cho Haan, **không tự quyết** — đúng tinh thần "con người
luôn là người quyết định cuối cùng" (PRD 2.3).

> **KHÔNG gọi API AI trả phí khi Haan chưa yêu cầu hoặc chưa cho phép** (08/09/2026). Áp cho
> OpenAI, Anthropic, Google Gemini, trên mọi đường: `curl` thẳng tới nhà cung cấp, gọi qua các
> endpoint `/design/**/ai-*`, script trong thư mục tạm. Kể cả khi chỉ để kiểm tên model hay xác
> nhận một bản sửa.
>
> Vì sao: Haan trả tiền theo token. Một lượt lập chương trình không gian tốn **0,08–0,23 USD** và
> 13.000–20.000 token; một bộ ảnh của Đợt 4 là **mười một lượt**.
>
> Cần một phép đo thật thì **nói trước: mấy lượt, tuyến nào, ước chừng bao nhiêu tiền, để chứng
> minh điều gì** — rồi chờ đồng ý. Đưa khoá không phải là cho phép; "sửa lỗi này" hay "làm tiếp"
> cũng không phải. Cho phép một lượt không phải cho phép cả loạt. Khi chưa được phép vẫn làm
> được: dựng đúng payload rồi đọc bằng mắt, viết kiểm thử với client giả, đối chiếu bảng
> `design_ai_call` của những lượt đã chạy.

### 6.5 Quyết định đã xác nhận qua trao đổi — TÀI LIỆU CHƯA CẬP NHẬT

> Các điểm dưới đây là chỗ tài liệu mâu thuẫn hoặc bỏ trống, đã hỏi Haan và được chốt.
> Khi tài liệu gốc được cập nhật, xóa mục tương ứng khỏi đây.

1. **Thứ tự ưu tiên tài liệu**: `PRD > AFD > TSD > CGD > BSD > IPD`. ~~PRD v1.3 là bản mới nhất; các tài
   liệu khác ghi "PRD v1.2" chỉ là tham chiếu chưa cập nhật.~~ **Đã hết hiệu lực 05/09/2026**: bộ tài liệu
   được cập nhật đồng loạt và mọi tham chiếu chéo nay đều trỏ đúng phiên bản hiện hành.
2. **AI Preliminary Design Engine (TK-10→TK-17) là tính năng quan trọng, quyết định thành công dự án** — có
   tài liệu đặc tả riêng, và được triển khai **ngay sau khi phần hệ thống cốt lõi đạt 90%**.
   → Điều này **thay thế** IPD 3.3 ("không nằm trong lịch trình, chỉ làm nếu còn thời gian").
3. ~~**Tài liệu đặc tả AI v02 đã tồn tại**, Haan sẽ bổ sung vào `doc/`.~~
   **Đã xong 28/08/2026**: bộ tài liệu (14 file) nằm ở `doc/design/`. Hàng rào chuyển sang **mục 8**.
   → Điều này **thay thế** IPD 7 ("chưa được soạn thảo").
   → ⚠️ Số phiên bản còn lệch: mục này ghi "v02", thư mục nguồn có `v03.docx`/`v04.docx`/PDF `v2`,
   còn `doc/design/00-README.md` nhắc tới `v05.docx` không tồn tại. Đang chờ Haan xác nhận (Q-5).
4. **Repo** = chính thư mục `/home/haan/Documents/Project/NVG`, `doc/` nằm bên trong.
5. **CLAUDE.md không ghi ngày/mốc cụ thể** (tránh lỗi thời) — tra IPD 2 khi cần ngày.
6. **Thêm thư mục `shared/`** song song `web/ workers/ db/` cho Zod schema, type và hằng số dùng chung.
   → TSD 5.2 chỉ khai báo 3 thư mục nhưng TSD 1.3 yêu cầu dùng chung type/Zod; `shared/` lấp khoảng trống này.
7. **PWA áp dụng cho TOÀN BỘ ứng dụng, không chỉ Kho/công trường.** Nhân sự phải cài được lên
   màn hình chính điện thoại và dùng thoải mái ở mọi module.
   → Điều này **mở rộng** TSD 3.2 và TSD 1.4 (ghi "PWA — chỉ cho Kho/công trường").
   → Kéo theo: mọi màn hình phải có bố cục di động thật (thanh điều hướng dưới theo AFD 4.7),
   KHÔNG thu nhỏ bố cục máy tính.
   → **KHÔNG kéo theo offline-first.** Service worker chỉ cache khung ứng dụng (mã, phông,
   biểu tượng); phản hồi Supabase **cố ý không cache** vì dữ liệu được RLS bảo vệ theo từng
   người, để lại bản sao trong máy là đọc được sau khi đăng xuất (PRD 5.2, NEN-07).
   Offline thật cho Kho vẫn là quyết định còn treo (KHO-09, xem 6.6).

8. **Frontend chạy trên Cloudflare Workers (Static Assets), KHÔNG phải Cloudflare Pages.**
   → Điều này **thay thế** dòng Hosting ở TSD 1.4 và mục 3.2 ("Cloudflare Pages cho frontend").
   → Lý do: Cloudflare hiện hướng dự án mới sang Workers thay cho Pages, và Haan đã tạo sẵn
   service `nvg` trên Workers. `_headers` và `_redirects` được hỗ trợ y như Pages nên không
   mất gì khi đổi.
   → Cấu hình: `web/wrangler.jsonc`. Deploy: `npm run deploy:web`.
   → ⚠️ **Deploy KHÔNG bao giờ kèm `--env production`.** Mỗi wrangler environment tạo ra một
   Worker RIÊNG tên `{name}-{env}`, nên lệnh đó sinh ra `nvg-production` là một Worker thứ
   hai, còn `nvg` thật vẫn giữ bản cũ. Chữ "production" trên URL bảng điều khiển chỉ là nhãn
   mặc định của môi trường gốc.
   → ⚠️ Ứng dụng một trang phải khai `assets.not_found_handling: "single-page-application"`.
   Workers KHÔNG tự đoán kiểu dự án như Pages; thiếu dòng đó thì mở thẳng một đường dẫn sâu
   (`/hd/hop-dong/<id>`) sẽ ra 404.
   → `wrangler deploy` KHÔNG tự nạp `.env` lên Cloudflare — tệp đó chỉ dùng khi chạy ở máy.
   Secret chỉ lên khi truyền tường minh `--secrets-file`, nên đừng dùng cờ đó với `.env` gốc
   repo (trong đó có `service_role` và mật khẩu CSDL).
9. **Ngôn ngữ thị giác đã nâng cấp — xem `DESIGN_SYSTEM.md` ở gốc repo.**
   → File đó MỞ RỘNG và ở vài chỗ THAY THẾ **CGD Mục 6**. Haan dùng nó để cập nhật CGD lên v1.2.
   → Điểm chính: dải trung tính ám sắc ấm (bê tông) thay xám ám xanh · thêm **cam an toàn
   `#EA580C`** làm màu NHẬN DIỆN · phông **Be Vietnam Pro** tự lưu thay Inter qua Google Fonts ·
   thang chữ và thang chuyển động khai tường minh.
   → ⚠️ **Cam KHÔNG được dùng ở nhãn trạng thái, nền dòng bảng hay nút.** Nó nằm giữa vàng "Chờ
   duyệt" và đỏ "Quá hạn"; đặt vào vùng trạng thái là phá hệ thống 5 màu. Chỉ dùng cho: thanh
   chỉ mục sidebar, vạch nhấn, chuỗi biểu đồ, hình trạng thái rỗng, dấu hiệu gộp "Toàn NVG".
   → **Ba màu chữ nhãn trạng thái của CGD 6.3 đã được làm đậm** vì bản gốc không đạt tương phản
   4.5:1 (Nháp 3.83 · Chờ duyệt 3.09 · Hoàn thành 3.11). Sắc màu và nền giữ nguyên.
   → Trang trưng bày mọi thành phần ở mọi trạng thái: **`/nen/giao-dien`**. Sửa token màu xong thì
   mở trang đó để soát, đừng đi qua 20 màn hình nghiệp vụ.
   → ⚠️ **Cập nhật mới hơn điểm này**: cam an toàn `#EA580C` và Brand Blue `#0C66E4` (làm hành
   động chính) đã được thay bằng cặp **rừng (forest) & bạc hà (mint)** — xem `DESIGN_SYSTEM.md`
   Mục 1.1/2.4 bản mới nhất. **5 màu trạng thái ở điểm này vẫn giữ nguyên không đổi.** Font vẫn
   là Be Vietnam Pro (không đổi sang font của bản demo tham chiếu).

10. **Vai trò thứ 13 — `SX` "Xưởng sản xuất – Cho thuê"** (02/09/2026, theo phiếu khảo sát Xưởng).
    → Điều này **mở rộng** danh sách 12 vai trò suy từ AFD 2.3 + PRD Phụ lục C.
    → Vì sao: Xưởng là một đơn vị có bộ máy riêng ("1 Phó giám đốc, 1 admin, 4 nhân viên kinh
    doanh, 1 nhân viên kho, 1 tổ trưởng sản xuất, 10 công nhân cơ khí"). Trước đó Module SX
    phải mượn vai trò **Kho** — đúng ở chỗ Kho quản lý vòng đời vật lý giàn giáo, sai ở chỗ
    Kho không lập kế hoạch sản xuất và không ký bảng công khối xưởng.
    → Vai trò này **KHÔNG có `approve`**: mọi biểu mẫu xưởng trong phiếu đều ghi người duyệt
    là "Phó Giám đốc/Ban Giám đốc" — vai trò BGĐ đã sẵn có `SX: xem + phê duyệt`.
    → Kéo theo: bảng chấm công **khối xưởng** nay do người có `approve` trên phân hệ SX xác
    nhận, không còn gộp vào HCNS (`timesheet_block_module`).
    → ⚠️ Ma trận `permissions` là (vai trò × module), KHÔNG có chiều pháp nhân. Nên "4 nhân
    viên kinh doanh của NVS" hiện phải dùng chung vai trò này với xưởng — tách được chỉ khi
    thêm chiều pháp nhân vào ma trận. Chưa chặn gì, nhưng đừng nhầm là đã mô hình hoá đúng.

11. **Vai trò thứ 14 — `CHT` "Chỉ huy trưởng / Kỹ thuật hiện trường"** (05/09/2026, theo AFD v1.1 2.3).
    → Quyền **giống hệt `TC`**, kể cả `approve` (khảo sát giao chính chỉ huy trưởng ký xác nhận
    bảng công khối công trường — migration 0106). Khác biệt duy nhất là **PHẠM VI**: cột
    `roles.site_scoped` bật, nên chỉ thấy công trình được phân công (mẫu RLS E).
    → Vai trò `TC` được đổi nhãn thành **"Trưởng phòng Thi công"** cho khớp AFD v1.1 — cùng mã,
    cùng quyền, chỉ đổi chữ hiển thị.
    → Vì sao phải tách: nếu không, Mẫu E không có đối tượng nào để áp (xem hộp cảnh báo ở mục 3.4).
    → AFD v1.1 còn thêm hai vai trò nữa **CHƯA làm**: _Trưởng phòng Thi công_ đã dùng lại `TC`,
    nhưng _Tổ trưởng sản xuất_ (bố cục di động "Việc của tổ hôm nay") thì chưa có — nó thuộc đợt SX.

12. **Sáu quyết định gốc của đợt tài liệu v1.4** (`doc/CHANGELOG_NVG_docs.md` mục 1) — mọi thay đổi
    trong bộ tài liệu mới đều truy được về một trong sáu:
    | #        | Quyết định                                                                                                                                                                                                                                                                                                                                                                 |
    | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | **QĐ-1** | **Loại bỏ toàn bộ mốc thời gian** khỏi tài liệu; chỉ cam kết thứ tự và tiêu chí hoàn thành                                                                                                                                                                                                                                                                                 |
    | **QĐ-2** | **Module SX làm phạm vi ĐẦY ĐỦ**: cả sản xuất + định mức + giá thành, không chỉ tài sản cho thuê                                                                                                                                                                                                                                                                           |
    | **QĐ-3** | **Module TC mở rộng đầy đủ**: bản vẽ hiệu lực, RFI, nhật ký mobile-offline, checklist nghiệm thu + ảnh, khối lượng tổ đội, an toàn/sự cố, cảnh báo văn phòng quá hạn                                                                                                                                                                                                       |
    | **QĐ-4** | Phiếu công trường được coi là khảo sát của **cả NVC và NVO**; khác biệt xử lý bằng **cấu hình**, KHÔNG tách thành hai module                                                                                                                                                                                                                                               |
    | **QĐ-5** | Các ô trống trong khảo sát: catalogue lấy từ PDF (PRD Phụ lục D); định mức nằm trên file/bản giấy do **trưởng bộ phận sản xuất** giữ, **giá biến động liên tục**; **tỷ lệ lỗi biến động, phải chỉnh sửa được**; chấm công xưởng = máy chấm công nhưng **cách tính lương chưa rõ**; chấm công công trường **chưa rõ**; bảng giá bồi thường **để tạm, admin điều chỉnh sau** |
    | **QĐ-6** | **Ghi nhận giá thuê nội bộ là BẮT BUỘC**; mức giá do Ban Giám đốc quyết sau và **cấu hình được**                                                                                                                                                                                                                                                                           |

### 6.6 Vấn đề còn mở — cần NVG xác nhận, KHÔNG tự quyết

Gộp từ PRD 10, TSD 7, CGD 7, BSD 5, IPD 7:

| Vấn đề                                                                                                                                    | Ảnh hưởng                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phần mềm kế toán chính thức** để tích hợp (MISA SME / AMIS / Fast?)                                                                     | Chưa thiết kế được payload endpoint `/api/export/accounting-software` (KT-08)                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Hạn mức phê duyệt chính thức** theo cấp/loại nghiệp vụ                                                                                  | Đang dùng mức tạm; dữ liệu `approval_limits` phải cấu hình được                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Bộ mã vật tư / công trình / nhà cung cấp** thống nhất                                                                                   | NVG chưa có; sẽ tự tạo mẫu trước go-live từng giai đoạn                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ~~**Khảo sát Xưởng giàn giáo (NVS) + Chỉ huy công trường**~~ — **ĐÃ CÓ 02/09/2026**                                                       | Hai phiếu ở `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`. Bốn giả định đã được thay bằng câu trả lời thật (migration 0105/0106). Phần phiếu để trống chuyển thành các dòng **Xưởng** và **Công trường** bên dưới                                                                                                                                                                                                                                                                          |
| **`unit_prices` dùng chung DA/TK/MH?**                                                                                                    | Cần xác nhận NVO có cần bảng đơn giá riêng không (BSD 5). Đang triển khai DÙNG CHUNG, tách sẵn theo `company_id`                                                                                                                                                                                                                                                                                                                                                                     |
| **Ai được xem GIÁ VỐN**                                                                                                                   | Đang mở cho TGĐ/CFO/BGĐ/Admin + **DA_DT, TKE, MH** (suy từ TK-07 và MH-04/05). Lợi nhuận vẫn chỉ TGĐ/CFO/BGĐ/Admin. Lương thêm NS và KT; **căn cước/sức khỏe/kỷ luật (`personal`) hẹp hơn lương — không có KT**. Cả bốn nhóm sửa ở cùng hàm `rls_sees_sensitive`                                                                                                                                                                                                                     |
| **Cơ chế lương/thưởng chi tiết** từng công ty/nhóm nhân sự                                                                                | Chưa cấu hình được NS-06. Đã có sẵn HÌNH THỨC trả lương và số công đã chốt; thiếu đúng phần công thức                                                                                                                                                                                                                                                                                                                                                                                |
| **Ai xác nhận bảng chấm công từng khối** (NS-04) — **hai trong ba khối đã CHỐT 02/09/2026**                                               | Công trường → chỉ huy trưởng (`approve` trên TC) và xưởng → Phó Giám đốc (`approve` trên SX) nay là NGUYÊN VĂN khảo sát, không còn suy luận. Khối **văn phòng** vẫn là suy luận (`approve` trên NS), cùng gốc với "trưởng đơn vị" của KT-01. Ánh xạ khối → phân hệ nằm ở hàm `timesheet_block_module`                                                                                                                                                                                |
| **Một ngày công bằng mấy giờ** (NS-04) — khảo sát Xưởng KHÔNG trả lời                                                                     | Vẫn lấy **8 giờ** (Bộ luật Lao động 2019 Điều 105). Phiếu để trống cả hình thức chấm công (`[máy chấm công/bảng giấy]`) lẫn cách tính lương (`[ngày công/thời gian/sản phẩm]`), nên chưa loại trừ được ca 12 giờ. Sửa ở `HOURS_PER_WORKDAY` (`@nvg/shared/ns`) **và** hàm `consolidate_timesheets` — có test đối chiếu hai bản                                                                                                                                                       |
| **Ai duyệt yêu cầu tuyển dụng** (NS-02)                                                                                                   | Đang đặt Tổng Giám đốc, vì tăng biên chế là quyết định ngân sách của cả công ty. Đổi bằng cấu hình `approval_limits`, không sửa mã                                                                                                                                                                                                                                                                                                                                                   |
| **"Trưởng đơn vị" ở bước 1 của luồng duyệt chi (KT-01) là AI** — Haan xác nhận 27/08/2026: chưa có thông tin, chờ khảo sát đầy đủ         | Đang SUY LUẬN: người có quyền `approve` trên module phát sinh khoản chi (`payment_requests.origin_module`). Kéo theo: vai trò TC/MH/KHO được cấp `approve` trên chính phân hệ của mình. Khi Module NS có cây tổ chức, thay điều kiện trong hàm `rls_payment_step_actor` — không phải sửa chỗ nào khác                                                                                                                                                                                |
| **Mốc chia nhóm công nợ quá hạn** (KT-04) — Haan xác nhận 27/08/2026: chưa có mốc, giữ giả định nhưng Quản trị hệ thống phải sửa lại được | Đã chuyển thành DỮ LIỆU trong bảng `aging_buckets`, seed 30/60/90 ngày từ `DEFAULT_AGING_BUCKETS`. KHÔNG hard-code ở bất kỳ đâu — cùng quy tắc với `approval_limits` (5.2). Mốc riêng của pháp nhân THAY THẾ mốc chung, không trộn                                                                                                                                                                                                                                                   |
| **Đo "hiệu suất nhân sự/tổ đội/nhà cung cấp"** (BC-03 phần 4) đo bằng gì                                                                  | CỐ Ý CHƯA làm — TC chưa có bảng phân công tổ đội, MH chưa có sổ đánh giá nhà cung cấp. Khảo sát công trường đã cho ĐƠN VỊ ĐO của tổ đội: **khối lượng hoàn thành × đơn giá hợp đồng**, kỹ thuật hiện trường đo bóc, chỉ huy trưởng kiểm tra trước khi chuyển Kế toán. Ba phần đầu của BC-03 đã xong ở `db/migrations/0059_bc_sales_effectiveness.sql`                                                                                                                                |
| **Bảng `tasks` — bỏ hẳn hay dùng thật?**                                                                                                  | Có sẵn từ Phase 0 (BUILD_PLAN 1.4), chưa từng được ghi/đọc ở bất kỳ đâu. Trung tâm Thông báo (bảng `notifications`) đã lên hình ở Phase 3G — nút chuông Top Bar giờ đọc thật, đánh dấu đã đọc, điều hướng tới `action_url`. "Việc cần làm" vẫn chỉ là Hộp thư Phê duyệt (`usePendingApprovals`); việc không gắn phê duyệt (vd. nhắc giấy tờ sắp hết hạn) hiện chỉ sinh `notification` một chiều, không có nơi "xử lý xong thì biến mất" đúng AFD 5.4                                 |
| **Tên miền chính thức** · **đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5) · **SSO** (chờ NVG có email công ty)                     | Chưa chặn phát triển                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Hạn mức + điều khoản bảo mật gói miễn phí Gemini**                                                                                      | Cần kiểm tra lại tại thời điểm triển khai; cân nhắc gói trả phí khi dùng dữ liệu thật                                                                                                                                                                                                                                                                                                                                                                                                |
| ~~**Xưởng — catalogue sản phẩm giàn giáo**~~ — **CÓ MỘT PHẦN 05/09/2026**                                                                 | PRD v1.4 **Phụ lục D** nay có mã, quy cách (mm), nguyên liệu chính, hồ sơ chứng chỉ kiểm định và 3 địa điểm — đủ làm **bộ mã khởi tạo** cho SX-01 và KHO-02. **Vẫn thiếu hai thứ Catalogue KHÔNG có**: sản lượng/tháng và phân loại bán / cho thuê / cả hai, cho TỪNG mã — xem dòng riêng bên dưới                                                                                                                                                                                   |
| ~~**Xưởng — định mức nguyên vật liệu ai giữ, lưu ở đâu**~~ — **ĐÃ TRẢ LỜI 05/09/2026**                                                    | QĐ-5: định mức nằm trên **các file trên máy tính công ty và bản giấy**, do **trưởng bộ phận sản xuất** nắm giữ, và **giá biến động liên tục**. Việc số hoá là hạng mục chuẩn hoá dữ liệu **bắt buộc trước khi vận hành** SX-07. Vẫn cần chính bộ định mức hiện hành — xem dòng bên dưới                                                                                                                                                                                              |
| **Xưởng — tỷ lệ lỗi và giá trị thất thoát/hư hỏng hằng năm**                                                                              | Phiếu ghi thẳng "Không nên ước lượng một con số để điền vì đây là dữ liệu quan trọng cho quản trị tài sản và định giá cho thuê". **KHÔNG tự điền số mặc định** — cần kiểm kê và đối chiếu 12 tháng gần nhất. Đến khi có, mọi chỉ số liên quan hiện **"Chưa đủ dữ liệu"** (5.2). Ngưỡng cho phép là tham số `defect_rate_threshold`, hiện để RỖNG                                                                                                                                     |
| ~~**Xưởng — công trình nội bộ có tính giá thuê nội bộ không**~~ — **ĐÃ CHỐT 05/09/2026**                                                  | **QĐ-6: việc GHI NHẬN là BẮT BUỘC.** Công trình nội bộ phải lập chứng từ đầy đủ như khách ngoài (SX-21) và ghi nhận giá trị theo giá thuê nội bộ; có thể không phát sinh thanh toán thật giữa các đơn vị, nhưng số liệu phải có để phân bổ đúng chi phí công trình. **Mức giá** do BGĐ quyết — tham số `internal_rental_price`, hiện để RỖNG. `rental_agreements.is_internal` đánh dấu; **báo cáo hợp nhất toàn NVG phải LOẠI TRỪ** các giao dịch này để không đếm hai lần doanh thu |
| **Xưởng — giao thêm giữa kỳ trong cùng một hợp đồng thuê**                                                                                | Thu hồi nhiều đợt đã làm (migration 0106). Giao thêm thì CHƯA: mỗi đợt giao có ngày bắt đầu tính thuê riêng nên cần bảng đợt giao, không nhét thêm vào `rental_agreement_items` được. Cần biết NVG tính từ ngày giao của từng đợt hay từ ngày ký hợp đồng                                                                                                                                                                                                                            |
| **Công trường — đo tiến độ theo gì**                                                                                                      | Khảo sát cho thấy đo theo **hạng mục/đầu việc**, xác nhận bằng **khối lượng hoàn thành đã nghiệm thu** (chưa nghiệm thu thì chưa tính). Còn thiếu: mức chi tiết của kế hoạch tiến độ (theo tuần hay theo mũi thi công) và ai là người cập nhật % hoàn thành                                                                                                                                                                                                                          |
| **Công trường — ba con số suy luận của TC**                                                                                               | Cửa sổ sửa nhật ký **24 giờ** · ngưỡng cảnh báo ngân sách **90%** · thang đánh giá tổ đội **1–5**. Khảo sát KHÔNG nói tới cả ba; chỉ gián tiếp ủng hộ con số 24 giờ (báo cáo ngày phải gửi trước 20 giờ tối). Cả ba **đã chuyển thành tham số cấu hình được** (migration 0112) nên NVG sửa được mà không phải triển khai lại — nhưng chúng vẫn là giả định chưa ai xác nhận                                                                                                          |
| **Công trường — hồ sơ nào bắt buộc giữ bản giấy có chữ ký gốc**                                                                           | Phiếu ghi "Hồ sơ gốc bắt buộc phải ký, đóng dấu hoặc lưu bản giấy vẫn phải được quản lý theo quy định; phần mềm lưu bản điện tử để tra cứu". Cần danh sách cụ thể để biết chỗ nào ký điện tử được, chỗ nào chỉ đính kèm bản chụp (liên quan PRD 2.3 "không bắt nhập liệu hai lần")                                                                                                                                                                                                   |
| **Thời hạn cam kết phản hồi của từng phòng ban** (MỚI — PRD v1.4 Mục 10)                                                                  | Cần BGĐ quyết. **Không có tham số này thì cơ chế cảnh báo quá hạn TC-10 không có căn cứ để chạy** — nguyên văn PRD. Bảng `sla_definitions` đã dựng và **cố ý để RỖNG**: nạp sẵn một con số sẽ tạo đồng hồ đếm ngược trông như đã cam kết, và người duyệt bị gắn nhãn quá hạn theo thời hạn chưa ai ký                                                                                                                                                                                |
| **Bảng giá bồi thường giàn giáo thiếu – hỏng theo mã** (MỚI — SX-19)                                                                      | Cần BGĐ ban hành. Khởi tạo tạm để hệ thống vận hành được, quản trị viên sửa sau — tham số `compensation_price_table`, hiện để RỖNG                                                                                                                                                                                                                                                                                                                                                   |
| **Ngưỡng tỷ lệ lỗi sản xuất cho phép** (MỚI — SX-12)                                                                                      | Theo nhóm sản phẩm / giai đoạn / lô, biến động. Tham số `defect_rate_threshold`, hiện để RỖNG                                                                                                                                                                                                                                                                                                                                                                                        |
| **Sản lượng/tháng và phân loại bán hay cho thuê cho TỪNG mã sản phẩm** (MỚI)                                                              | Catalogue (Phụ lục D) **không có** hai thông tin này. Chặn SX-01 (phân loại mục đích khai thác), SX-06 (kế hoạch theo năng lực thật) và BC-04                                                                                                                                                                                                                                                                                                                                        |
| **Phương thức ghi nhận công tại công trường** (MỚI — TC-08, NS-04)                                                                        | Chưa chốt; phương án đang cân nhắc là **chụp ảnh có gắn thời gian và vị trí**. Cần quyết định trước khi xây phần chấm công khối công trường                                                                                                                                                                                                                                                                                                                                          |
| **Số bản ghi tối thiểu để hiện một chỉ số** thay vì "Chưa đủ dữ liệu" (MỚI — BSD v1.1 Mục 5)                                              | Chưa xác định. Tham số `min_samples_for_metric`, hiện để RỖNG — cố ý không hard-code trong truy vấn báo cáo                                                                                                                                                                                                                                                                                                                                                                          |
| **Rà soát nội bộ — địa chỉ xưởng chính của NVS** (MỚI)                                                                                    | Catalogue ghi **hai địa chỉ khác nhau ở hai vị trí trong cùng tài liệu**: Xã Tây Sơn và Xã Vũ Sơn, cùng huyện Kiến Xương. Cần NVS xác nhận trước khi khởi tạo danh mục kho (KHO-01). ⚠️ Kèm theo: Phụ lục D.5 ghi **"Thái Bình"**, nhưng theo quyết định **T9** (mục 8.5) Thái Bình đã sáp nhập vào **Hưng Yên** từ 2025 — seed `warehouses` phải dùng tên đơn vị hành chính hiện hành. Đây là dữ liệu catalogue cũ, không phải lỗi tài liệu                                         |
| **Rà soát nội bộ — tính cập nhật của Catalogue** (MỚI)                                                                                    | Catalogue phát hành **2022**. Cần NVS xác nhận danh mục sản phẩm còn đúng (có mã nào đã ngừng, mã nào mới) và các chứng chỉ kiểm định còn hiệu lực hay không (SX-13)                                                                                                                                                                                                                                                                                                                 |

---

## 7. Checklist trước khi bắt đầu một module mới

1. Đọc **PRD 5** phần module đó — gồm cả mục **"Ranh giới KHÔNG làm"**.
2. Đọc **BSD 4.x** tương ứng — bảng dữ liệu, **mẫu RLS A/B/C/D**, endpoint tùy chỉnh đã đặc tả.
3. Đọc **AFD 3.x** (hành trình người dùng) + **AFD 7** (bản đồ màn hình của module).
4. Với mỗi thao tác: quyết định **Supabase trực tiếp hay Workers** theo quy tắc ở mục 3.1.
5. Dùng lại **9 mẫu bố cục** (4.6), **thư viện nội dung** CGD 5, **thuật ngữ chuẩn** (4.5), **6 màu trạng thái** (4.3).
6. Gặp mơ hồ về nghiệp vụ → **hỏi Haan**, không tự quyết.

---

## 8. Module Thiết kế AI (TK-10 → TK-17)

> Mục này là **hàng rào cứng** cho riêng module thiết kế. Nó **không** thay thế mục 1–7;
> nơi nào mục này im lặng thì áp dụng quy tắc chung của các mục trên.

### 8.1 Tài liệu và thứ tự ưu tiên

Tài liệu đặc tả nằm ở **`doc/design/`** (14 file, copy vào repo 28/08/2026, cộng
`13-ho-so-thuc-te.md` viết 05/09/2026). Bộ này là
**nguồn sự thật cho việc triển khai TK-10 → TK-17**, thắng các bản `.docx` trình bày cho
khách hàng.

**Đọc `doc/design/README.md` TRƯỚC** — nó chứa **11 đính chính** những chỗ tài liệu mô tả
sai hiện trạng hoặc đã lỗi thời, cộng bảng ánh xạ sang bảng và enum đang chạy. Sáu điểm đầu
(Đ1–Đ6) đối chiếu với nền tảng kỹ thuật; **năm điểm sau (Đ7–Đ11) đối chiếu với hồ sơ thật của
NVG** và là những chỗ sai nặng hơn. Làm theo nguyên văn tài liệu mà bỏ qua bảng đính chính sẽ
dựng sai nền tảng.

Trước khi đụng vào phần số hoá hồ sơ cũ hoặc bộ xuất CAD, đọc thêm
**`doc/design/13-ho-so-thuc-te.md`** — hồ sơ thật của NVG chứa gì, đo được bằng cách nào, và
mười một chỗ mã nguồn đang dựa trên giả định sai.

Chốt chặn của mục 5.6 (**cấm viết code TK-10→TK-17 trước khi tài liệu có trong repo**) đã
được **gỡ** kể từ 28/08/2026.

Ngoài phạm vi TK-10→TK-17, thứ tự `PRD > AFD > TSD > CGD > BSD > IPD` vẫn giữ nguyên.

### 8.2 Chín nguyên tắc bất biến

Vi phạm bất kỳ điểm nào là lỗi kiến trúc, không phải lỗi phong cách.

1. **Không có bước nào đi thẳng từ chữ sang ảnh.** Mọi ảnh dẫn xuất từ hình học đã giải.
2. **Mô hình ngôn ngữ không bao giờ sinh toạ độ hay kích thước.** Nó sinh _cấu trúc_ (cây
   chia không gian, lựa chọn rời rạc); **bộ giải gán số**.
3. **Mọi ranh giới giữa các lớp có JSON Schema** trong `contracts/`. Không có hợp đồng thì
   không viết code cho lớp đó — dừng và hỏi.
4. **Quy tắc kiến trúc là dữ liệu, không phải mã nguồn.** Rule pack YAML. Không hard-code
   một ngưỡng quy chuẩn nào ở bất kỳ đâu (`if corridor_width < 0.9` là sai).
5. **Một nguồn hình học.** Container sinh glTF; trình duyệt chỉ đọc. Không dựng hình bằng
   JavaScript.
6. **Artifact bất biến, băm nội dung, có lineage.** Không `UPDATE`, không ghi đè. Sửa = tạo
   artifact mới + đổi `design_head`.
7. **Mọi bảng của module mang `tenant_id`** — kể cả khi hiện chỉ có một tenant.
8. **Mọi artifact và tài liệu mang `discipline`** — kể cả khi Giai đoạn 1 chỉ sinh kiến trúc.
9. **Engine không tự sinh và không tự phát hành nội dung kết cấu, điện nước, phòng cháy
   chữa cháy.** Nó chuẩn bị nền hình học; kỹ sư có chứng chỉ hành nghề ký và chịu trách
   nhiệm. Mỗi lần phát hành mang **đúng một** bộ môn.

#### Ngoại lệ có kiểm soát — NHÁNH AI (T10–T14)

Chín điểm trên viết cho **bộ giải nội bộ**, và ở đó chúng không nới điểm nào. Nhánh AI là một
đường ĐỘC LẬP chạy song song (T10, T14): người dùng chọn «Bộ giải nội bộ» hay «AI» ngay trên
trang thiết kế, và hai đường không dùng chung ràng buộc. Bốn điểm dưới đây được nới **chỉ cho
nhánh AI**, không điểm nào nới cho bộ giải.

| Điểm | Nới thế nào ở nhánh AI                                                                                                                                              | Ranh giới còn lại                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Ảnh nội thất và mặt cắt sinh từ chữ + dữ liệu phòng, không có hình học nguồn                                                                                        | Mang nhãn riêng _"Ảnh minh hoạ — không theo hình học đã giải"_, khác nhãn của ảnh dẫn xuất                                                                                                                                                                                                                |
| 2    | Mô hình sinh **diện tích** (chương trình không gian) và **toạ độ chữ nhật** (mặt bằng)                                                                              | Kết quả là **đề xuất**, không bao giờ thành `floor_plan` chuẩn và không đi vào luồng phát hành. Bộ giải CP-SAT và Lớp 3a tất định không đổi một dòng                                                                                                                                                      |
| 4    | Lời dẫn gửi cho mô hình **KHÔNG tiêm ngưỡng quy chuẩn** — mô hình chỉ nhận đầu bài                                                                                  | Ngưỡng vẫn là dữ liệu ở `rules/`, và vẫn được đọc — nhưng để **đối chiếu SAU**, sinh cảnh báo, không để ràng buộc mô hình                                                                                                                                                                                 |
| 5    | **Mô hình khai NỘI DUNG bản vẽ dạng dữ liệu**, bộ vẽ tất định của nhánh AI (`ai/draw/`, TypeScript trong Worker) đặt lên giấy; Container không dựng gì cho nhánh AI | Bộ vẽ ấy KHÔNG phải Container và KHÔNG dùng lại một dòng nào của bộ giải. Cảnh báo quy chuẩn đo trên dữ liệu phòng, không đo trên tờ vẽ. Chữ do mô hình sinh (tên phòng, nhãn) là nội dung KHÔNG TIN ĐƯỢC — thoát ký tự khi dựng SVG, và hiển thị qua `<img>` để trình duyệt không chạy kịch bản trong đó |

⚠️ **Điểm 5 đã đổi ngày 09/09/2026 (T15).** Trước đó mô hình TỰ VIẾT chuỗi SVG, và Worker phải lược
nội dung nguy hiểm trong đó (`ai/svg-guard.ts`, đã gỡ cùng đường mã ấy). Đo thật hôm ấy: Gemini Flash trả về bản phác **không cửa, không chuỗi
kích thước, vách không bề dày, 13/25 phòng có tên** — đọc được nhưng không phải bản vẽ dùng được.
Dữ liệu thì **kiểm được** (thiếu cửa, cửa đặt ngoài tường, tường không bao kín phòng đều bắt được
và bắt mô hình sửa); một tệp SVG thì chỉ đếm được ký tự.

**Vì sao nới điểm 4 và 5** (T14, 09/09/2026 — Haan quyết): nhánh AI có giá trị đúng ở chỗ nó
KHÔNG bị bó bởi cùng bộ ràng buộc với bộ giải. Tiêm ngưỡng quy chuẩn vào lời dẫn rồi bác kết
quả khi lệch là dựng lại bộ giải bằng một công cụ dở hơn. Đổi lại, kết quả AI **không được
phép** đi vào hồ sơ phát hành, và mọi chỗ lệch quy chuẩn QUỐC GIA đều phải hiện thành **cảnh
báo** cho kiến trúc sư — không chặn, không tự sửa (Haan: _"nếu đúng là quy chuẩn VN tiêu
chuẩn, được áp dụng toàn quốc thì oke, hãy sinh cảnh báo khi vi phạm"_).

⚠️ Cảnh báo CHỈ lấy từ `rules/base/` (`locality: null` — QCVN 01:2021/BXD và TCVN, áp dụng
toàn quốc). Gói `rules/locality/` KHÔNG dùng ở nhánh AI: quy định riêng của một tỉnh không phải
thứ để cảnh báo trên một đề xuất tham khảo, và hiện chưa tỉnh nào có gói.

### 8.3 Hai runtime — biết mã đang viết chạy ở đâu

|          | **Worker (TypeScript)**                                           | **Container (Python)**                                           |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Chạy gì  | Giao diện, API, gọi mô hình ngôn ngữ, đọc/ghi artifact, điều phối | Bộ giải CP-SAT, hình học, đọc/ghi tệp CAD, dựng mô hình ba chiều |
| Vì sao   | Nghẽn ở vào/ra, cùng codebase                                     | OR-Tools, trimesh, ezdxf, shapely chỉ có ở Python                |
| Gọi nhau | Worker → Container qua HTTP                                       | Container **không gọi ngược** Worker                             |

**Nhầm chỗ là lỗi kiến trúc.** Đừng gọi mô hình ngôn ngữ từ Container. Đừng cài thư viện
hình học phía TypeScript.

Container phải **không giữ trạng thái** và **không dùng giao diện lập trình đặc thù
Cloudflare bên trong** — đó là thứ cho phép đổi chỗ triển khai mà không viết lại.

### 8.4 Ánh xạ thư mục — tài liệu giả định monorepo khác

| Tài liệu                                        | Repo                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/contracts/*.schema.json`              | `contracts/` ở gốc (nguồn gốc, viết tay)                                                         |
| → sinh zod                                      | `shared/src/design/*.generated.ts`, xuất qua `@nvg/shared/design`                                |
| → sinh Pydantic                                 | **KHÔNG sinh.** Python nạp thẳng `contracts/*.schema.json`, validate bằng `jsonschema` — xem 8.8 |
| `apps/web/src/modules/design/`                  | `workers/src/design/`                                                                            |
| `services/design-compute/`                      | `compute/` ở gốc — Python, **không** phải npm workspace                                          |
| `rules/`, `config/models.yaml`, `tests/golden/` | giữ nguyên ở gốc                                                                                 |

Bộ sinh zod: `scripts/contracts-gen.mjs`. `npm run contracts:gen` để sinh,
`npm run contracts:check` để so bản sinh với bản đã commit. **Không sửa tay
`shared/src/design/*.generated.ts`** — sửa JSON Schema rồi sinh lại.

### 8.5 Quyết định đã chốt (28/08/2026) — không mở lại trừ khi điều kiện đổi

| #   | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Lý do / đánh đổi                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Vite SPA + Worker Hono**, KHÔNG Next.js                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Tài liệu ghi "Next.js — kế thừa, không đổi" là **mô tả sai** nền tảng. Không nội dung nào cần Next.js                                                                                                                                                                                                                                                                                         |
| T2  | **Container Python + OR-Tools CP-SAT** cho Layer 3b                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Cơ chế giả định của CP-SAT trả về **tập ràng buộc mâu thuẫn nhỏ nhất** — đó là thứ tạo ra tính năng phân tích tác động. Thay thế phương án cũ trong BUILD_PLAN ("thuật toán tự xây bằng TypeScript")                                                                                                                                                                                          |
| T3  | Giai đoạn dev **giữ gói Cloudflare Free** → `compute/` chạy bằng **Docker tại chỗ**, Worker gọi `localhost:8080` qua interface `ComputeBackend`                                                                                                                                                                                                                                                                                                                                                                   | Containers không có trên gói Free. Khi nâng gói chỉ đổi một tệp sang `getContainer()`                                                                                                                                                                                                                                                                                                         |
| T4  | **R2 cho artifact** (dữ liệu máy đọc) + **Supabase Storage cho hồ sơ phát hành** (đi qua `documents`/`document_versions`). Cài đặt qua interface `ArtifactStore`, adapter `supabase://` dùng ngay, adapter `r2://` viết sẵn                                                                                                                                                                                                                                                                                       | R2 cần bật thanh toán. Cùng khuôn với `RenderBackend` mà tài liệu đã dùng                                                                                                                                                                                                                                                                                                                     |
| T5  | Bảng module mang **cả `tenant_id` lẫn `company_id`**                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `tenant_id` giữ đúng nguyên tắc 7 và sẵn sàng bán lại; `company_id` để artifact truy được về pháp nhân — bắt buộc theo mục 3.5                                                                                                                                                                                                                                                                |
| T6  | Quyền chuỗi qua bảng mới **`role_capabilities(role_id, capability)`**, khởi động chỉ với `design.*`                                                                                                                                                                                                                                                                                                                                                                                                               | Ma trận `permissions` hiện chỉ tới mức module, không phân biệt được ba bộ môn. **Không sửa** ma trận cũ — 12 module đang chạy trên đó                                                                                                                                                                                                                                                         |
| T7  | **Dùng lại enum `design_discipline`** sẵn có. Ánh xạ: `KT→kien_truc`, `KC→ket_cau`, `DN→dien_nuoc`                                                                                                                                                                                                                                                                                                                                                                                                                | Một bộ từ vựng duy nhất. Enum này đã có index phụ thuộc                                                                                                                                                                                                                                                                                                                                       |
| T8  | Giai đoạn demo, mô hình ngôn ngữ **chỉ chạy dữ liệu giả lập hoặc ẩn danh**                                                                                                                                                                                                                                                                                                                                                                                                                                        | Đầu bài khách hàng là dữ liệu hạng 1; gói Gemini miễn phí có thể được dùng để huấn luyện (mục 5.1). Lớp chặn `data_class` vẫn dựng ngay từ khung                                                                                                                                                                                                                                              |
| T9  | Rule pack: **mọi giá trị QCVN 01:2021/BXD nằm ở `base/`** (kể cả khoảng lùi, mật độ); `locality/<tỉnh>/` chỉ ra đời khi có văn bản quy hoạch của tỉnh để trích vào `source` — hiện chưa tỉnh nào có. Đầu bài chọn được **34 đơn vị hành chính**, nhóm đầu là Hưng Yên · Hải Phòng · Ninh Bình · Hà Nội                                                                                                                                                                                                            | Thái Bình đã sáp nhập vào Hưng Yên (2025). Gói địa phương chép lại số của quy chuẩn quốc gia là bản sao thứ hai của cùng con số — sửa quy chuẩn thì bản sao không đổi theo, và không có gì báo                                                                                                                                                                                                |
| T10 | **Nhánh AI chạy SONG SONG bộ giải CP-SAT**, không thay thế. Người dùng chọn «Bộ giải nội bộ» hay «AI» + model ngay trên trang thiết kế                                                                                                                                                                                                                                                                                                                                                                            | Bộ giải cho phương án hợp quy chuẩn, tất định, xuất được hồ sơ; AI cho tốc độ và ý tưởng. Ép chọn một là mất một nửa giá trị. 1.211 phép thử đang xanh không được vỡ                                                                                                                                                                                                                          |
| T11 | Đầu ra AI **cả hai dạng**: mặt bằng là **dữ liệu có cấu trúc**, còn phối cảnh/nội thất/mặt đứng/mặt cắt là **ảnh**                                                                                                                                                                                                                                                                                                                                                                                                | Dữ liệu có cấu trúc thì đọc được, so sánh được, cảnh báo được. Ảnh thì không — nhưng ảnh là thứ khách hàng hiểu ngay                                                                                                                                                                                                                                                                          |
| T12 | Dữ liệu gửi cho nhà cung cấp: **đầy đủ TRỪ danh tính** (lược tên khách, điện thoại, địa chỉ, mã hồ sơ, ngân sách; giữ kích thước thật, gia đình, nhu cầu, phong cách, chữ tự do) → hạng 2                                                                                                                                                                                                                                                                                                                         | API TRẢ PHÍ của cả ba cam kết không dùng để huấn luyện. **Chính sách bám vào KHOÁ, không vào lời hứa** — nên `gemini_paid` là nhà cung cấp riêng với khoá riêng, tách hẳn gói miễn phí hạng 3                                                                                                                                                                                                 |
| T13 | Ảnh đợt đầu làm **cả bốn loại**: mặt bằng có nội thất, phối cảnh ngoại thất nhiều góc, nội thất từng phòng, mặt đứng + mặt cắt                                                                                                                                                                                                                                                                                                                                                                                    | Anthropic không có mô hình ảnh — ô chọn ảnh chỉ có OpenAI và Google                                                                                                                                                                                                                                                                                                                           |
| T14 | **Nhánh AI là DÒNG RIÊNG, độc lập hoàn toàn với bộ giải** (09/09/2026). Đầu vào **chỉ đầu bài + khảo sát**, không tiêm ngưỡng quy chuẩn vào lời dẫn. Đầu ra **không** thành `floor_plan` chuẩn, **không** đi qua Container, **không** dùng lại SVG/DXF/glTF/thống kê/phát hành. **Mô hình TỰ VẼ tờ bản vẽ** — Haan đã thử thực tế và đánh giá làm tốt; ảnh trình khách dựng từ chính tờ đó (ảnh→ảnh, giữ bất biến 1). Lệch quy chuẩn QUỐC GIA (`rules/base/`) hiện thành **cảnh báo**, không chặn và không tự sửa | Thay phương án Đợt 3 cũ (Container snap → sửa → `evaluate_violations` → `floor_plan`). Lý do đổi: bó nhánh AI bằng đúng ràng buộc của bộ giải là dựng lại bộ giải bằng công cụ dở hơn — mất chính thứ làm nhánh AI có giá trị. Đánh đổi đã biết và chấp nhận: **kết quả AI không xuất được DXF cho người vẽ, không lên hồ sơ phát hành, không có bảng thống kê**. Muốn hồ sơ thì chạy bộ giải |

### 8.5b Bộ giải AI thay thế bộ giải nội bộ (09/09/2026) — Haan quyết

**Hiện trạng khiến phải đổi**: bộ giải CP-SAT nội bộ **không đạt qua thử nghiệm thực tế**. Bộ giải
bằng AI là bắt buộc, và khi nó làm tốt thì **bộ giải nội bộ sẽ bị xoá**. Vì thế hai bên **không
được liên quan gì đến nhau** — đây là ràng buộc kiến trúc, không phải sở thích.

| #   | Quyết định                                                                                                                                                                                                                                                                                      | Lý do / đánh đổi                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T15 | **AI thiết kế, chương trình cầm bút.** Mô hình khai TOÀN BỘ nội dung bản vẽ dạng dữ liệu (từng đoạn tường + bề dày, cửa/cửa sổ + chiều mở, thang, tên + diện tích); bộ vẽ SVG tất định trong Worker (`ai/draw/`) đặt lên giấy. Chuỗi kích thước do bộ vẽ SUY từ toạ độ tường, không hỏi mô hình | Thay T14 «mô hình tự vẽ SVG». Dữ liệu kiểm được, tệp vẽ thì không. Bắt mô hình khai lại chuỗi kích thước là thêm ~30% token và thêm một cách sai mới — một chuỗi cộng không ra tổng là bản vẽ không kiến trúc sư nào tin |
| T16 | Phối cảnh qua bước trung gian **ý tưởng mặt đứng**: AI đề xuất mái, vật liệu, màu, cổng, ban công dạng dữ liệu + mặt đứng chính vẽ bằng cùng bộ vẽ; kiến trúc sư sửa được **trước khi trả tiền ảnh**. Ảnh chính diện ban ngày là **ảnh neo**, bốn góc còn lại dựng ảnh→ảnh từ nó                | Đầu bài **không có** trường mái/vật liệu/màu/cổng/ban công — đo 09/09: cả hợp đồng chỉ có `style` (1 trong 9) và một ô ghi chú. Đưa chừng đó cho mô hình ảnh thì năm tấm ra năm ngôi nhà khác nhau                       |
| T17 | Giao diện: **tab riêng «Thiết kế AI»** với dải bốn bước. Hai tab của bộ giải giữ nguyên tới ngày dọn                                                                                                                                                                                            | Trộn hai nhánh vào cùng màn hình thì con số hiện ra không rõ của bên nào, và ngày dọn phải gỡ từng khối khỏi panel bên kia                                                                                               |
| T18 | **Hai bước**: chương trình không gian (AI, viết lại sạch) rồi mặt bằng                                                                                                                                                                                                                          | Lượt gọi nhỏ hơn nên ít bị cắt giữa chừng, chỗ sai dễ khoanh, và kiến trúc sư duyệt danh sách phòng trước khi vẽ                                                                                                         |
| T19 | Tường mô hình khai sai sau **một lượt sửa** → **chương trình suy tường từ phòng** (cạnh chung = vách, cạnh biên = tường bao), ghi rõ trên tờ «Tường do chương trình suy từ phòng, không phải của AI»                                                                                            | Tờ vẽ vẫn dùng được, và chỗ suy hộ vẫn nhìn thấy. Trả về một tờ vẽ hỏng rồi bắt bấm lại là tốn thêm một lượt tính tiền                                                                                                   |

> **Ranh giới độc lập là thứ có KIỂM THỬ canh, không phải trí nhớ.**
> `workers/src/design/__tests__/ai-independence.test.ts` đọc từng dòng `import` của
> `design/ai/**`, `design/rules/**`, `web/src/pages/tk/ai/**` và các tệp lẻ của nhánh, rồi đỏ khi
> có tệp nào trỏ sang `program/`, `layout/`, `render/`, `compute-backend`, `workflows/steps`,
> `design-pipeline`, hay sang panel/hook của bộ giải phía web. Nó canh **cả chiều ngược lại**:
> bộ giải cũng không được import `ai/`.
>
> Nhánh AI **được phép** dùng hạ tầng chung — `auth-scope`, `artifacts`, `llm/`, `rules/`, `kb/`,
> `brief/anonymise`, `shared/` — vì đó là những thứ ở lại sau khi bộ giải ra đi.
>
> ⚠️ **`design/rules/` KHÔNG thuộc bộ giải.** Bộ đọc gói quy tắc từng nằm trong `program/` và đã
> chuyển ra ngoài ngày 09/09/2026: cả hai nhánh cùng đọc nó, nên để trong thư mục của bộ giải là
> hôm xoá sẽ kéo theo nhánh AI.

### 8.6 Đính chính hạ tầng Cloudflare — tài liệu đã lỗi thời

1. **"~0,5 vCPU, 4 GiB" không phải giới hạn cứng.** Containers có sáu hạng, từ `lite`
   (1/16 vCPU) tới `standard-4` (**4 vCPU, 12 GiB**), cộng hạng tuỳ chỉnh mở cho mọi tài
   khoản. Con số tài liệu dùng đúng bằng `standard-1`. Nên `num_search_workers=1` là **lựa
   chọn tiết kiệm, không phải ràng buộc**, và kịch bản "đo thấy chậm thì phải chuyển VPS"
   mất phần lớn lý do — nâng hạng là đủ.
2. **Worker gọi Container qua Durable Object binding**, không phải "service binding": khai
   `containers[]` + `durable_objects.bindings` + `migrations.new_sqlite_classes`, gọi bằng
   `getContainer(env.DESIGN_COMPUTE, id).fetch(...)`.
3. **Containers không có trên gói Workers Free** — cần Workers Paid.

### 8.7 Ranh giới cứng khi viết mã

- **Cấm hard-code ngưỡng quy chuẩn** ở bất kỳ đâu — có kiểm thử grep canh.
- **`compute/solver/` cấm import phần gọi mô hình ngôn ngữ.** Bộ giải phải tất định.
- **Vị từ hình học chỉ cài đặt MỘT nơi: Container.** Worker đọc rule pack để hiển thị cho
  người dùng nhưng **không tự đánh giá rule** — nếu không sẽ có hai bản thực thi lệch nhau.
  Đây cũng là lý do hoãn tầng WebAssembly.
- **Xuất DXF một chiều.** Không nhập ngược tệp CAD đã sửa — sẽ mất toàn bộ siêu dữ liệu
  ràng buộc và không có cách nào biết ràng buộc nào đã bị phá.
- **Quy ước lớp bản vẽ là DỮ LIỆU**, ở `kb/layer_mapping.yaml` — cùng lý lẽ với rule pack.
  Cấm viết tên lớp (`"A-AREA-ROOM"`) vào mã trích xuất: quy ước của NVG lệch nhau giữa các
  thời kỳ và người vẽ, nên đó là thứ sẽ đổi mãi. Trình trích xuất trả về `layers_unmapped`
  để bổ sung dần; lớp cố ý bỏ qua khai ở mục `ignore` **tách bạch** với lớp chưa ánh xạ —
  trộn hai loại vào nhau thì danh sách cần xử lý dài tới mức hết người đọc.
- **Container KHÔNG quy chuẩn hoá nhãn phòng.** `"PN2"` → `bedroom` là việc của mô hình ngôn
  ngữ ở Worker (`06-knowledge-base.md` 6.1). Trích xuất giữ nguyên văn — đặt bảng từ đồng
  nghĩa vào Python là biến tri thức đang thay đổi thành mã nguồn, và phá ranh giới ở 8.3.
- **Không tạo lại thứ đã có**: dự án (`design_projects`), khách hàng (`customers`), người
  dùng (`users`), hệ tài liệu (`documents` + `document_versions`). Tham chiếu, không sao chép.
- **Nhãn cảnh báo do mã nguồn chèn**, không phụ thuộc người dùng nhớ bật và không tắt được
  từ giao diện: ảnh phối cảnh mang _"Ảnh tham khảo ý tưởng — chưa phải phương án thi công"_;
  bảng khối lượng mang _"Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng"_; lưới trục
  do hệ thống đề xuất mang _"Đề xuất — kỹ sư kết cấu quyết định"_.

### 8.8 Tám quy ước của Lớp 1–3 — đọc trước khi thêm bảng, endpoint hay quy tắc

Bốn điểm đầu đã đứng vững bằng kiểm thử trên CSDL thật; điểm 8 đo trên hồ sơ thật của NVG. Chúng là hệ quả trực tiếp của
mục 8.2, ghi lại ở đây để không phải suy lại từ đầu.

1. **Khoá chính của `design_artifact` CHÍNH LÀ mã băm nội dung** (`sha256:` + 64 hex), không
   phải UUID. Nhờ đó "cùng input + cùng cấu hình → cùng artifact" là ràng buộc do CSDL giữ,
   không phải quy ước phải nhớ. Bảng **không có** policy UPDATE/DELETE: tính bất biến do
   CSDL cưỡng chế, không do kỷ luật lập trình. Sửa = tạo artifact mới + đổi `design_head`.

2. **Quyền của module chia theo BỘ MÔN, không theo lớp.** `design.project.all` ·
   `design.read|write|publish.<discipline>` · `design.settings.write` — danh sách đầy đủ ở
   `DESIGN_CAPABILITIES` (`@nvg/shared/design`). Ví dụ trong tài liệu (`design.brief.read`,
   `design.floorplan.write`) là ví dụ, không phải danh sách chốt; chia theo lớp thì mỗi
   policy phải liệt kê đủ sáu lớp mà vẫn không trả lời được câu hỏi duy nhất CSDL cần trả
   lời — "người này có được ghi bộ môn này của dự án này không". **Cấu hình khai ra mà không
   policy nào đọc tới còn tệ hơn không khai: nó tạo cảm giác đã phân quyền.**

3. **Ba chiều RLS gói trong hai hàm** — `rls_design_readable` / `rls_design_writable`. Mọi
   policy của module gọi chúng; không bảng nào chép lại điều kiện. Hai hàm đó dựng TIẾP trên
   `rls_design_project_readable/writable` của Module TK, nên gỡ quyền TK của một người là gỡ
   luôn quyền ở đây — không phải nhớ gỡ ở hai nơi.

4. **Phạm vi tenant suy từ pháp nhân**: `companies.tenant_id`, chứ không có bảng nối
   người dùng ↔ tenant. Phạm vi tenant của một người ĐÃ được xác định bởi các pháp nhân họ
   được gán; thêm bảng nối thứ hai là tạo hai nguồn sự thật có thể nói khác nhau. Chú ý
   `auth_tenant_ids()` cố ý **không** dùng `auth_sees_all_companies()`: "xem mọi pháp nhân"
   là phạm vi TRONG một tenant, không phải giấy thông hành sang tenant khác.

5. **Chỉ đường cắt thuộc KẾT CẤU CHÍNH mới dùng chung giữa các tầng** (`structural_depth`,
   mặc định 2 tầng cây đầu). Dùng chung mọi đường cắt mà các tầng cùng phương nghe chặt chẽ
   hơn nhưng ép hai tầng có số phòng khác nhau phải có cùng diện tích ở từng dải — và cái
   hiện ra là vô nghiệm với tập ràng buộc trỏ vào hai phòng chẳng liên quan gì tới nhau.
   Nhà thật có vài tuyến tường chịu lực, còn vách ngăn thì mỗi tầng một khác. **Lõi thang
   KHÔNG dựa vào cơ chế này** — nó có ràng buộc trùng khít riêng (`stair_alignment`), nên
   vẫn thẳng hàng dù nằm sâu bao nhiêu trong cây.

6. **Cây chia không gian lấp KÍN mặt sàn.** Tổng diện tích phòng của một tầng luôn bằng
   đúng diện tích hình bao — không có khái niệm "phần còn lại để trống"; muốn để trống thì
   khai một lá `void`. Hệ quả: `max_area` của chương trình không gian là **khoản phạt**, không
   phải ràng buộc cứng (nó đến từ `kb/space_norms.yaml`, không từ quy chuẩn). Quy chuẩn nào
   thật sự chặn diện tích tối đa thì khai thành quy tắc `max_area` mức `error` trong rule pack.

7. **Ngưỡng quy chuẩn ở `rules/`; quy ước cấu tạo và bối cảnh thửa ở `kb/`.** Container đọc
   lúc chạy: `layer_mapping.yaml` (tên lớp bản vẽ, cả đọc lẫn GHI) và
   `construction_norms.yaml` (bề dày tường, kích thước cửa, cao độ tầng). Worker đọc rồi gửi
   kèm lời gọi: `site_context.yaml` (hiện trạng bốn phía → mặt thoáng) và
   `room_vocabulary.yaml` (nhãn tiếng Việt, nhóm mã phòng). Số ở `kb/` quyết định bản vẽ
   TRÔNG thế nào; số ở `rules/` quyết định phương án có hợp lệ hay không. Đừng trộn hai loại.

   Ba tệp thêm ngày 06/09/2026, rút từ hai hồ sơ thật — chi tiết ở `13-ho-so-thuc-te.md`
   mục 13.15: `sheet_catalogue.yaml` (**47 loại tờ** của một bộ hồ sơ, và loại nào engine
   được phép tự phát hành) · `title_block.yaml` (**ba** họ quy ước khung tên, kèm danh sách
   ô là dữ liệu hạng 1 phải LOẠI) · `text_encoding.yaml` (giải mã TCVN3).

   Thêm 06/09/2026: vị từ **`requires_face`** (`face: access | open`) trong `rules/` — phòng
   phải giáp một MẶT cụ thể của hình bao, không nhận phương án thay thế. Khác `requires_daylight`
   ở đúng chỗ đó, và đó là toàn bộ lý do nó tồn tại: một chỗ để xe lấy sáng qua giếng trời vẫn
   là chỗ để xe mà ô tô không vào được. Nó là ràng buộc CẤU TRÚC (suy từ cây chia, không phụ
   thuộc toạ độ), nên mức `warning` cố ý không thêm gì vào mô hình — chỗ sửa được là Lớp 3a,
   xếp phòng vào dải giáp đúng mặt ngay từ ý đồ. Đi kèm là mục `outdoor` của
   `construction_norms.yaml`: cạnh giáp mặt thoáng của ban công là **lan can**, không phải
   tường, và phép suy "đoạn nào là lan can" nằm ở **một nơi** (`geometry/outdoor.py`) dùng chung
   cho tờ bản vẽ và khối ba chiều. Phải xét theo ĐOẠN, không theo cả bức: tường mặt tiền chạy
   chung cho ban công và phòng bên cạnh.

   ⚠️ **Trước khi ghi một con số vào `kb/`, hỏi nó thuộc tầng nào.** Từ vựng và quy ước thì
   **n = 1 đã đủ** — thấy một lần nghĩa là nó có thật. Định mức và phân bố thì **cần 15 công
   trình** (`space_norms.yaml`, `priors.min_samples`); ghi vào từ hai hồ sơ là biến trùng hợp
   thành chuẩn. Hiện `kb/` **chưa có** hồ sơ nào đủ cho tầng thứ hai.

8. **Bản vẽ NVG KHÔNG mô tả phòng bằng đa giác khép kín trên một lớp riêng.** Đo trên hai hồ
   sơ thật ngày 05/09/2026, gồm **cả hai tập kiến trúc**: không lớp nào trong 97 + 94 lớp khớp
   `*ROOM*BOUND*`, `A-AREA*` hay `KT-PHONG*`. Lý do sâu hơn chuyện đặt tên — **NVG đặt tên lớp
   theo ĐỘ ĐẬM NÉT KHI IN, không theo vật thể** (`NV-Thay`, `NV-Khuat`, `NV-Manh`, `NV-MoDam`,
   `NV-Cat`), và ba bộ môn dùng ba quy ước khác hẳn nhau. Nên mô hình "một lớp = một vai trò
   ngữ nghĩa" không có đối tượng để khớp; đa giác phòng phải dựng từ **đồ thị tim tường**.
   → Kéo theo ba điều bắt buộc khi đụng vào trình trích xuất: **phải đi vào block**
   (`virtual_entities()` — 83% hình học nằm trong đó, riêng bản vẽ kiến trúc là 89–93%);
   **phải đọc `ATTRIB`** (mã tờ, tên tờ, tỷ lệ, cao độ tầng, bảng cửa, nhãn trục đều nằm ở đó);
   và **một tệp DXF là trọn hồ sơ một bộ môn, 22–73 tờ xếp cạnh nhau trong cùng modelspace**,
   không phải một tầng. Đầy đủ ở `doc/design/13-ho-so-thuc-te.md`.
   ⚠️ Cả ba chỗ sai này **hỏng im lặng** — không lỗi, không cảnh báo, chỉ trả ít dữ liệu hơn
   thực tế. Cách duy nhất phát hiện là đối chiếu với bản vẽ thật.

Ranh giới runtime: Worker gọi Container qua `POST /solve`, và **vô nghiệm trả mã 200** kèm
`InfeasibilityReport`. Nó là kết quả hạng nhất, không phải lỗi — trả 4xx sẽ khiến lớp gọi
coi là hỏng hóc và giấu mất lời giải thích. Chỉ 422 (sai hợp đồng, không thử lại) và 503
(hết giờ, đáng thử lại) mới là lỗi thật. `POST /export/dxf` là **một chiều**: không có, và
sẽ không có, endpoint nhập ngược tệp CAD đã sửa tay.

### 8.9 Theo dõi tiến độ — bắt buộc

Module có file tiến độ riêng **`TIEN_DO_THIET_KE.html`** ở gốc repo, tách khỏi
`TIEN_DO.html` (file kia theo dõi 12 module nghiệp vụ).

**Xong bất kỳ việc nào là cập nhật ngay, không gom lại một lượt.** Gặp vướng mắc chưa gỡ
được thì ghi vào phần "Vướng mắc" **ngay lúc gặp**, kể cả khi đang đi tiếp việc khác — ghi
đủ bốn ý: gặp ở đâu, đã thử gì, đang chặn cái gì, cần gì để gỡ.

Câu hỏi cần Haan trả lời ghi vào phần "Câu hỏi chờ Haan" của cùng file đó, **không** để
trôi trong lịch sử trao đổi.
