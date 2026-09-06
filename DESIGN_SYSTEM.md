# DESIGN_SYSTEM.md — Ngôn ngữ thị giác NVG

> Tài liệu làm việc của đội triển khai (như `BUILD_PLAN.md`), **không** phải một trong 6 tài liệu
> chính thức trong `doc/`.
>
> **Quan hệ với CGD:** file này MỞ RỘNG và ở vài chỗ THAY THẾ Mục 6 của
> `ContentGuidelines_Document_NVG_v1.1.docx`. Mọi chỗ lệch đều ghi rõ bên dưới để Haan cập nhật
> CGD lên v1.2. Phần nào không nhắc tới ở đây thì CGD vẫn nguyên hiệu lực.

---

## 1. Vì sao sửa CGD

CGD 6.1 yêu cầu "hiện đại, chuyên nghiệp… sạch, phẳng, hạn chế hiệu ứng trang trí", lấy Jira
làm tham chiếu — tinh thần đó giữ nguyên (tra cứu cơ sở dữ liệu thiết kế trả về đúng phong cách
**"Minimalism & Swiss Style"**, và bảng màu doanh nghiệp nó đề xuất gần trùng CGD 6.3).

Chỗ CGD còn thiếu là **bản sắc ngành**: giao diện có thể là của bất kỳ công ty nào, trong khi NVG
là nhà thầu xây dựng (nhà xưởng, nhà ở dân dụng, giàn giáo kết cấu thép). Bản sắc từng lấy từ hiện
trường (xám bê tông + cam an toàn), nay đổi sang rừng/bạc hà — xem 1.1 và Mục 2.

### 1.1 Cập nhật — đổi bản sắc thị giác sang "rừng & bạc hà"

Xác nhận với Haan (chủ đích, không phải sơ suất): thay Brand Blue `#0C66E4` + cam an toàn
`#EA580C` bằng cặp thương hiệu mới **rừng (forest) + bạc hà (mint)**, theo phong cách một bản demo
tham chiếu ("dashboard soft light style"). Từng điểm:

- **Các màu trạng thái GIỮ NGUYÊN Y HỆT**, không đổi hex, không đổi `StatusLozenge`. Đây vẫn là hàng rào cứng nhất của hệ thống màu — test canh tại
  `web/src/test/design-rules.test.ts` ("Ranh giới màu thương hiệu (rừng & bạc hà) với màu trạng
  thái"): `status-lozenge.tsx` không được dùng token `brand`/`mint`/`forest`.
- **Font GIỮ NGUYÊN Be Vietnam Pro** — bản demo tham chiếu dùng Plus Jakarta Sans nhưng Haan chọn
  không đổi font, vì Be Vietnam Pro đã được chọn riêng cho tiếng Việt (xem Mục 3, không đổi).
- Bo góc chuyển sang lớn/mềm hơn (9/10/14/16px, thay 4/6/8px) và độ nổi chuyển sang **phẳng +
  hairline** (bỏ bóng ở thẻ/nút, chỉ giữ cho lớp phủ nổi thật sự) — xem Mục 2.2 và Mục 4.
- Phạm vi áp dụng: token đổi ngay cho toàn hệ thống (mọi màn hình đọc chung `web/src/index.css`);
  bố cục/markup khớp pixel với bản demo chỉ làm ngay cho khung sườn (Sidebar/TopBar/AppShell) +
  Dashboard — các module khác polish dần sau.

---

## 2. Màu

### 2.1 Giữ nguyên — không đụng tới

| Vai trò                                                           | Mã                                                                    | Ghi chú                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn · Tranh chấp | `#6B778C` · `#B38600` · `#0C66E4` · `#22A06B` · `#CA3521` · `#8270DB` | 6 màu trạng thái. **Không tạo màu thứ 7.** Riêng "Đang xử lý" trùng hex với Brand Blue cũ — đó là hai token ĐỘC LẬP (`--color-status-progress` và `--color-brand`), trùng ngẫu nhiên; đổi `--color-brand` KHÔNG kéo theo đổi "Đang xử lý". |

> Brand Blue `#0C66E4` làm "hành động chính" — hàng rào đã bị dỡ bỏ có chủ đích, xem 1.1 và 2.4.

> **Tím "Tranh chấp" `#8270DB` là màu trạng thái thứ sáu**, thêm ở Content Guidelines v1.2 theo
> khảo sát Xưởng giàn giáo (PRD v1.4 SX-19). Nó chỉ dùng cho hồ sơ thu hồi/bồi thường giàn giáo
> chưa thống nhất với khách — trạng thái KHOÁ SỐ LIỆU GỐC, không phải "một sắc thái của quá hạn".
> Ràng buộc y hệt cam an toàn trước đây: **không dùng tím ở đâu khác** — không làm nền dòng bảng,
> không làm màu nút, không làm chuỗi biểu đồ; đặt tím vào chỗ khác là phá hệ thống trạng thái.
>
> Giá trị CHỮ thực dùng là `#6953D4`, không phải `#8270DB`: bản gốc chỉ đạt 3.26:1 trên nền nhạt
> `#EAE6FF` của chính nó, dưới ngưỡng 4.5:1 mà nhãn 12px bắt buộc phải đạt. Đây là lần thứ tư
> phải làm đậm một màu của CGD 6.3 — cùng lý do và cùng cách xử lý với Nháp/Chờ duyệt/Hoàn thành
> (xem chú thích trong `web/src/index.css`). Sắc và nền giữ nguyên để không ai phải học lại màu.

### 2.2 Thay thế CGD 6.3 — dải trung tính ám sắc XANH LÁ nhạt

Cập nhật 1.1: dải ấm (bê tông/thép) trước đó đổi tiếp sang dải ám sắc **xanh lá nhạt**, khớp nền
của bản demo tham chiếu.

| Token                    | Trước 1.1 | Hiện tại               | Dùng cho                           |
| ------------------------ | --------- | ---------------------- | ---------------------------------- |
| `--color-surface`        | `#FFFFFF` | `#FFFFFF`              | nền thẻ, nền bảng                  |
| `--color-surface-sunken` | `#F6F6F4` | `#F2F7F2`              | nền trang, vùng trũng              |
| `--color-surface-hover`  | `#EFEFEC` | `#F4F8F4`              | dòng đang trỏ tới                  |
| `--color-border`         | `#DEDCD6` | `#E7EDE7`              | viền mảnh                          |
| `--color-border-strong`  | `#9A9485` | `#9A9485` (giữ nguyên) | viền cần thấy rõ: đầu bảng, ô nhập |
| `--color-fg`             | `#1C1C1A` | `#1C1C1A` (giữ nguyên) | chữ chính                          |
| `--color-fg-subtle`      | `#5A574F` | `#5A574F` (giữ nguyên) | chữ phụ                            |

`fg`/`fg-subtle`/`border-strong` KHÔNG đổi theo bản demo dù nó có giá trị tương ứng riêng
(`#14231C`/`#7E8E85`/`#C6D8C9`) — đã tự kiểm và cả ba đều **không đạt** ngưỡng bắt buộc: chữ phụ
`#7E8E85` chỉ 3.45:1 trên nền trắng (cần ≥4.5:1), viền `#C6D8C9` chỉ 1.49:1 trên nền trắng (cần
≥3:1). Giữ nguyên giá trị cũ đã kiểm thay vì chép nguyên bản demo.

Tương phản đã kiểm lại với nền mới: `#1C1C1A` trên `#F2F7F2` ≈ 15.74:1 · `#5A574F` trên `#F2F7F2` ≈
6.65:1. Đều vượt mức AA 4.5:1.

Token hẹp, dùng cục bộ, mới thêm theo bản demo (không thay thế 4 token nền/viền ở trên):
`--color-surface-muted` `#F5F8F5` (search box, nút icon topbar) · `--color-surface-subtle`
`#F3F7F3` (ô icon trung tính) · `--color-surface-empty` `#F7FAF7` (nền khối rỗng) ·
`--color-border-dashed` `#DEE8DF` (viền khối rỗng) · `--color-chart-neutral` `#9BAAA1` và
`--color-chart-positive` `#3E8B5E` (dot của PillBadge trên Dashboard — cố tình lệch hex với
status-draft/status-completed, hai hệ màu độc lập) · `--color-tint-amber(-bg)`/`--color-tint-teal
(-bg)`/`--color-tint-forest-bg` (ô icon từng loại thẻ KPI trên Dashboard).

### 2.3 Sửa lỗi trợ năng trong bảng màu trạng thái CGD 6.3

Ba trong năm màu chữ của nhãn trạng thái **không đạt** tương phản 4.5:1 trên chính nền nhạt của
nó. Nhãn trạng thái là chữ 12px nên không được tính là "chữ lớn" theo WCAG, tức là vẫn phải đạt
4.5:1. Đã làm đậm vừa đủ chạm ngưỡng, **giữ nguyên sắc màu và nền** để không ai phải học lại màu
nào ứng với trạng thái nào.

| Trạng thái | CGD 6.3   | Mới       | Tương phản      |
| ---------- | --------- | --------- | --------------- |
| Nháp       | `#6B778C` | `#616B7E` | 3.83 → **4.55** |
| Chờ duyệt  | `#B38600` | `#906C00` | 3.09 → **4.51** |
| Hoàn thành | `#22A06B` | `#1C8157` | 3.11 → **4.53** |

"Đang xử lý" (4.61) và "Quá hạn" (4.56) vốn đã đạt — giữ nguyên.

Cùng lý do, `--color-border-strong` đặt ở `#9A9485` để đạt ≥3:1 trên nền trắng theo WCAG 1.4.11:
viền là thứ DUY NHẤT cho biết đâu là ô nhập liệu, nên nó phải nhìn thấy được chứ không chỉ là
gợi ý thẩm mỹ.

### 2.4 Rừng & bạc hà — màu thương hiệu (thay cam an toàn `#EA580C`, cập nhật 1.1)

Cam an toàn từng là màu **nhận diện tách biệt** khỏi hành động (Brand Blue). Từ 1.1, hai vai trò
đó **gộp làm một**: rừng/bạc hà vừa là màu hành động chính, vừa là màu nhận diện thương hiệu — bản
demo tham chiếu tự nó dùng đúng một cặp màu cho cả logo lẫn nút/pill nhấn, nên tách hai token riêng
như trước không còn cần thiết.

| Token                    | Mã                     | Vai trò                                                                                                        |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--color-brand`          | `#2C6E4B` (forest-600) | Hành động chính, liên kết, focus ring — **vẫn DUY NHẤT một hành động chính mỗi màn hình**, không rải khắp nơi. |
| `--color-brand-hover`    | `#1B5138` (forest-700) | Hover/active của hành động chính.                                                                              |
| `--color-brand-subtle`   | `#D9F2D4` (mint-100)   | Nền nhạt: badge, hover menu, ô chọn, nav active.                                                               |
| `--color-brand-forest`   | `#17352A`              | Khối logo, nền avatar, chữ nav active.                                                                         |
| `--color-brand-mint`     | `#A8E6A1`              | Nền pill kỳ báo cáo đang chọn (segmented control).                                                             |
| `--color-brand-mint-ink` | `#123024`              | Chữ trên nền mint.                                                                                             |

`--color-brand` chọn forest-600 chứ không phải forest đậm hay mint: chữ trắng trên `#2C6E4B` đạt
6.11:1 (≥4.5:1) — đủ sáng để đọc là "màu hành động", đủ tối để giữ chữ trắng. Chữ trắng trên mint
`#A8E6A1` chỉ 1.45:1 — không dùng làm nền nút.

**CẤM tuyệt đối (không đổi so với trước 1.1):** nhãn trạng thái (Lozenge) không được dùng bất kỳ
token `brand`/`mint`/`forest` nào — canh bằng test ở `web/src/test/design-rules.test.ts`. Lý do
giữ nguyên tinh thần cấm cam trước đây: rừng/mint và xanh lá "Hoàn thành" (`#1C8157`) là hai sắc
xanh gần nhau, để chúng lẫn vào cùng một nhãn là buộc người dùng phân biệt hai tín hiệu xanh trong
nửa giây khi quét bảng — đúng vấn đề mà quy tắc cam an toàn từng ngăn.

---

## 3. Chữ — thay thế CGD 6.4

**Đổi Inter → Be Vietnam Pro**, một họ duy nhất, tự lưu trong dự án.

Lý do: toàn bộ giao diện là tiếng Việt có dấu 100% (PRD Mục 6) ở cỡ 14px. Be Vietnam Pro được
thiết kế cho tiếng Việt nên dấu đặt cân và không chồng lên nhau ở cỡ nhỏ — chỗ mà phông phương Tây
phải chế thêm dấu. Nó cũng có nét hình học hiện đại hơn Inter, hợp bối cảnh xây dựng.

> Nói rõ nguồn: cơ sở dữ liệu phông của skill `ui-ux-pro-max` **không có kết quả phù hợp** cho ràng
> buộc này (ba kết quả đầu là Fira Code/Sans, Outfit, Poppins — không nhắm tới dấu tiếng Việt).
> Đây là lựa chọn dựa trên ràng buộc ngôn ngữ, không phải kết quả tra cứu.

**Tự lưu bằng `@fontsource/be-vietnam-pro`**, thay cho thẻ `<link>` tới Google Fonts. Bỏ được một
request tới bên thứ ba ở mọi lần tải (đáng kể với mạng 3G ngoài công trường), phông vào luôn
precache của service worker, và không gửi địa chỉ IP người dùng sang Google.

> ⚠️ **Nạp tệp theo NÉT (`400.css`), KHÔNG theo bộ ký tự (`vietnamese-400.css`).** Tệp theo bộ ký
> tự của fontsource không có `unicode-range`; nạp cả `vietnamese-400` lẫn `latin-400` là khai hai
> `@font-face` cùng family/nét/kiểu không phân định phạm vi, và theo quy tắc CSS thì khai báo sau
> đè khai báo trước — `latin` thắng, mọi chữ có dấu rơi về phông hệ thống. Đã gặp thật trong lúc
> dựng; typecheck và build đều xanh, chỉ mở trình duyệt mới thấy. Có test canh
> (`web/src/test/design-rules.test.ts`).

**Thang chữ** — khai tường minh, không đặt cỡ tuỳ chỗ:

| Token               | Cỡ       | Dùng cho                                                                                                    |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `--text-2xs`        | 10px     | **chỉ một chỗ**: nhãn module khi thanh điều hướng thu gọn (xem 4.1). Không dùng cho câu chữ đọc thành đoạn  |
| `--text-xs`         | 12px     | nhãn phụ, chú thích, nhãn trạng thái                                                                        |
| `--text-base`       | **14px** | nội dung chính, bảng, biểu mẫu                                                                              |
| `--text-md`         | 16px     | tiêu đề thẻ                                                                                                 |
| `--text-lg`         | 18px     | tiêu đề mục                                                                                                 |
| `--text-xl`         | 20px     | tiêu đề trang                                                                                               |
| `--text-2xl`        | 24px     | số liệu lớn trên Dashboard                                                                                  |
| `--text-3xl`        | 30px     | số liệu nổi bật                                                                                             |
| `--text-page-title` | 26px     | tiêu đề trang Dashboard (`PageHeader size="hero"`, cập nhật 1.1 — mọi trang khác vẫn dùng `--text-xl` 20px) |
| `--text-hero`       | 34px     | số liệu hero trên thẻ KPI nổi bật nhất của Dashboard (cập nhật 1.1)                                         |

Cập nhật 1.1: thêm nét 700/800 (`@fontsource/be-vietnam-pro/700.css`, `800.css`) để phục vụ hai
cỡ chữ đậm ở trên — dùng qua `font-bold`/`font-extrabold`, không cần token trọng lượng riêng vì
chỉ 2 chỗ dùng.

**Chữ nội dung vẫn 14px.** Mật độ thông tin là yêu cầu nghiệp vụ (CGD 6.1), không phải thứ đem ra
đánh đổi cho "thoáng đẹp".

**Số liệu** dùng `font-variant-numeric: tabular-nums` ở mọi cột tiền và số — cột số không thẳng
hàng thì bảng dự toán mất tác dụng.

---

## 4. Độ nổi — PHẲNG + HAIRLINE (cập nhật 1.1, thay bản "bóng rất nhẹ" trước đó)

Bản demo tham chiếu không dùng box-shadow ở bất kỳ đâu trên thẻ/nút/khung sườn — chiều sâu đến
từ viền 1px trên nền có sắc (`--color-surface` trên `--color-surface-sunken`). Đã áp dụng cho
Button, các thẻ trong phạm vi restyle (Dashboard, KpiCard), và `BlockedNotice`/`EmptyState`/
`ErrorState` ở trang trưng bày.

| Token                              | Còn dùng ở đâu                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--shadow-overlay`                 | **Duy nhất** cho lớp phủ NỔI THẬT SỰ (menu thả xuống Radix, hộp thoại) — nó portal ra ngoài luồng tài liệu, viền mảnh không đủ tách nó khỏi nội dung phía sau.                  |
| `--shadow-sticky`                  | Đầu bảng/header dính khi cuộn ở các trang chưa restyle đợt này.                                                                                                                 |
| `--shadow-raised`, `--shadow-card` | Giữ định nghĩa (chưa xoá) vì nhiều trang ngoài phạm vi Dashboard/khung sườn còn tham chiếu — ngưng dùng ở component mới, dọn hẳn khi mọi trang đã chuyển sang phẳng + hairline. |

Bo góc cũng đổi theo bản demo: `--radius-sm/md/lg` từ 4/6/8px lên **9/10/14px**, thêm
`--radius-xl` 16px cho panel sidebar. `rounded-full` (Lozenge, pill) không đổi — utility có sẵn
của Tailwind, không phải token.

---

### 4.1 Thanh điều hướng thu gọn được (06/09/2026)

Thanh trái có hai bề rộng: **240px** mở và **80px** thu, đổi bằng nút ở góc trên thanh, ghi nhớ
theo máy (`localStorage`, cùng lý lẽ với chế độ sáng/tối của Module Thiết kế). Thu gọn trả lại
160px cho vùng nội dung — đáng kể ở bản vẽ, bảng dự toán nhiều cột và lưới thẻ.

Ba ràng buộc:

- **Thu gọn KHÔNG bỏ chữ.** Mỗi mục xếp dọc: biểu tượng trên, `shortLabel` 10px dưới. Một cột
  toàn biểu tượng bắt người dùng học 12 hình mới, và `title` chỉ hiện sau khi rê chuột đứng
  yên — vô dụng lúc đang quét mắt tìm chỗ bấm.
- **Chữ xuống dòng, không cắt cụt.** "Khách …" không nói được mục đó là gì.
- **Tên đọc được luôn là nhãn đầy đủ** (`aria-label`), dù trên màn hình chỉ thấy nhãn ngắn. Mọi
  `shortLabel` là một phần của `label` nên không phạm WCAG 2.5.3 — có test canh.

⚠️ Mục điều hướng dùng `Link`, **không** `NavLink`: `NavLink` tự tính trạng thái hoạt động theo
đường dẫn của chính nó và ghi đè `aria-current` truyền vào, nên có những đường dẫn mà mục vẫn
sáng pill nền mint mà `aria-current` bị bỏ trống — khi đó màu là cách DUY NHẤT nói cho biết đang
ở đâu, đúng thứ CGD 6.8 cấm. Một nguồn sự thật: `useActiveModule()`.

---

## 5. Chuyển động — bổ sung, CGD chưa có

CGD 6.1 cấm "hoạt ảnh phô trương" nhưng không nói gì về chuyển động chức năng. Bổ sung:

| Token           | Thời lượng | Dùng cho            |
| --------------- | ---------- | ------------------- |
| `--motion-fast` | 120ms      | trỏ chuột, nhấn nút |
| `--motion-base` | 180ms      | đổi tab, mở panel   |
| `--motion-slow` | 240ms      | lớp phủ, hộp thoại  |

Easing chung `cubic-bezier(0.2, 0, 0, 1)` — nhanh lúc đầu, êm lúc dừng.

**Bắt buộc:** toàn bộ nằm dưới `prefers-reduced-motion: reduce`. Không scroll-reveal, không thư
viện hoạt ảnh. Đây là công cụ nhập liệu — chuyển động để **giải thích** thứ vừa đổi, không để gây
chú ý.

---

## 6. Những gì KHÔNG đổi

- Chế độ tối: **chưa làm cho 11 module** (CGD 6.7). Riêng Module Thiết kế có bảng màu và chế độ
  tối của riêng nó — xem Mục 7.
- Lozenge bo tròn hoàn toàn (CGD 6.5) — riêng bo góc thẻ/nút/input đã đổi ở cập nhật 1.1, xem Mục 4.
- Lưới bội số 8px (CGD 6.5).
- Biểu tượng dạng đường nét, một màu (CGD 6.2) — Lucide React.
- Vùng bấm ≥ 40×40px trên di động (CGD 6.8).
- Trạng thái luôn kèm chữ, không dùng màu làm cách duy nhất truyền đạt (CGD 6.8).

---

## 7. Module Thiết kế — bảng màu riêng, có phạm vi (06/09/2026)

Module Thiết kế dựng lại giao diện theo **bộ bàn giao thiết kế** riêng
(`Giao diện chỉnh sửa bản vẽ/design_handoff_trang_thiet_ke/`, Haan cung cấp). Đây là module bán
được AI Preliminary Design Engine hay không, nên nó có ngôn ngữ thị giác của một công cụ thiết
kế chứ không của một màn hình hồ sơ. Haan chốt phạm vi: **chỉ trong `/tk/*`**, 11 module còn
lại không đổi một pixel.

**Cập nhật 06/09/2026 — phạm vi gồm cả khung sườn.** Bản đầu chỉ đổi vùng nội dung, giữ nguyên
thanh trái và thanh trên sáng màu. Mở ra xem thì đọc thành "một trang tối dán vào một ứng dụng
sáng": hai trong ba dải trên màn hình không thuộc bản mẫu. Haan chốt lại: khung sườn cũng mặc
vỏ Thiết kế, nhưng **chỉ khi đường dẫn nằm trong `/tk/*`** — ra module khác là trở lại vỏ chung.
Phạm vi suy từ đường dẫn (`useTkScope`, `components/layout/tk-chrome.ts`), không từ một cờ ai đó
bật rồi quên tắt; có test canh cả hai chiều rò và co.

### 7.1 Hai bộ token song song

|         | Bộ chung                                          | Bộ Module Thiết kế                                               |
| ------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Tiền tố | `--color-surface`, `--color-fg`, `--color-brand`… | `--color-tk-*` (71 token)                                        |
| Khai ở  | `@theme` trong `web/src/index.css`                | cũng ở `@theme`, bản SÁNG                                        |
| Bản tối | không có                                          | `web/src/pages/tk/tk-theme.css`, bộ chọn `[data-tk-theme='toi']` |
| Phạm vi | toàn hệ thống                                     | chỉ nhánh DOM mang `data-tk-theme`                               |

Giá trị chép **nguyên văn** từ hằng `LIGHT`/`DARK` của bản mẫu. Sáu token chỉ phục vụ thanh
điều hướng (`--side`, `--nav-*`, `--logo-*`, `--hero-line`) **không chép sang** — đợt này không
dựng lại khung sườn, và khai một hệ màu không ai đọc tới thì tệ hơn không khai.

Hai test canh trong `web/src/test/design-rules.test.ts`: mọi token phải có đủ cả bản sáng lẫn
bản tối (thiếu một token là một mảng chữ vô hình trên nền tối, không lỗi, không cảnh báo), và
bản tối không được khai token nào ngoài danh sách `@theme`.

### 7.2 Bắc cầu sang token dùng chung — và một giả định đã sai

`[data-tk-theme='toi']` còn **ánh xạ lại token trung tính dùng chung** (`--color-surface`,
`--color-fg`, `--color-fg-subtle`, `--color-border`…) sang bảng màu tối. Cần thiết vì mọi màn
hình trong module dùng lại `Breadcrumb`, `Button`, `EntityTable`, `EmptyState`… của cả 12 module.

> Kế hoạch ban đầu định giữ thân các màn hình con ở nền **sáng** như "tờ giấy đặt trên bàn tối",
> ánh xạ chỉ áp cho phần vỏ. Mở trình duyệt xem thì hỏng: các panel đó phần lớn trong suốt hoặc
> dùng `--color-surface-sunken`, nên chúng nhận nền tối mà giữ nguyên màu chữ của chế độ sáng —
> bảng Chương trình không gian không đọc được một dòng nào. **Workspace tối là tối toàn phần.**
> Ghi lại vì đây là loại lỗi chỉ mắt người bắt được, typecheck và test đều xanh.

Ba điều KHÔNG ánh xạ:

- **Sáu màu trạng thái.** Hệ màu đóng; mỗi nhãn tự mang nền pastel và chữ đậm của nó nên vẫn đọc
  được trên nền tối. Đổi chúng là phá hàng rào cứng nhất của hệ màu.
- **`--color-border-strong` KHÔNG lấy `--color-tk-line2`.** `#25342f` trên `#111a17` chỉ đạt
  ~1,2:1, dưới hẳn ngưỡng 3:1 của WCAG 1.4.11 — viền ô nhập và nút phụ sẽ biến mất. Dùng
  `--color-tk-t3` (~3,7:1).
- **Tờ bản vẽ giữ nền giấy trắng.** SVG do Container sinh mang mực `#172B4D` trên giấy trắng;
  bản vẽ LÀ giấy, đảo màu nó là làm hỏng thứ người dùng sẽ in ra.

`color-scheme: dark` đặt kèm cho phần trình duyệt tự vẽ (thanh cuộn, danh sách `<select>`, bảng
lịch) — không có nó thì một thanh cuộn trắng chạy dọc giữa màn hình tối.

### 7.3 Hai chỗ cố ý lệch khỏi Mục 3 và Mục 4

| Bản mẫu                                           | Quy tắc chung                               | Xử lý                                                                                                        |
| ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Chữ nội dung 13px, phông hệ thống                 | 14px + Be Vietnam Pro (Mục 3)               | **Theo quy tắc chung.** Dấu tiếng Việt ở 13px phông hệ thống là đúng thứ đã chọn Be Vietnam Pro để tránh     |
| Bóng hover `0 14px 30px rgba(0,0,0,.26)` trên thẻ | phẳng + hairline, bỏ bóng ở thẻ/nút (Mục 4) | **Theo bản mẫu, CHỈ trong `/tk/*`.** Ngoại lệ có phạm vi, không nới quy tắc chung                            |
| Nút chính "Tạo phương án mới" ở header dự án      | mỗi màn hình đúng MỘT hành động chính (2.4) | Nút đó nằm ở **chân thẻ AI phương án**, không ở header — hành động chính của màn hình là "Bàn giao thi công" |

Hai mức bóng của bản mẫu khai thành `--shadow-tk-panel` và `--shadow-tk-card`. Bộ `--shadow-*`
chung tính cho nền sáng (đen 6–14%) nên đặt lên nền tối thì không tách được lớp nào — nền càng
tối, bóng phải càng đậm.

### 7.4 Khung sườn trong phạm vi Thiết kế

Ba khác biệt so với vỏ chung, đều chỉ sống trong `/tk/*`:

| Vùng       | Vỏ chung                            | Vỏ Thiết kế (bản mẫu §5.1–5.3)                                                              |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Bố cục     | panel nổi, khe hở 12px, bo góc 16px | ba vùng sát nhau, phân cách bằng đúng một đường viền                                        |
| Thanh trái | nền `--color-surface` sáng          | bảng màu tối CỐ ĐỊNH `--color-navdark-*`                                                    |
| Thanh trên | cao 48px, bo góc từ `lg:`           | cao 60px, sát mép, ô tìm kiếm 420px kèm chip `Ctrl K`, nút chuyển sáng/tối, tên + chức danh |

⚠️ **Thanh trái tối ở CẢ hai chế độ**, đúng như bản mẫu §4.3 ghi là chủ ý. Nên nó dùng bộ
`--color-navdark-*` chỉ có một giá trị, không dùng `--color-tk-*` (bộ đó đổi theo chế độ và có
test đòi đủ cặp sáng–tối).

⚠️ **`text-fg` phải khai trên chính phần tử mang `data-tk-theme`.** `body` nằm ngoài phạm vi đó,
nên `color: var(--color-fg)` của nó đã tính ra màu chữ chế độ SÁNG trước khi vào tới đây; thành
phần nào không tự đặt màu sẽ kế thừa màu ấy và biến mất trên nền tối. Đã xảy ra thật với tên
người dùng ở thanh trên (06/09/2026).

Phím tắt `Ctrl K` gắn cho **mọi module**, chỉ cái chip nhắc là riêng của Thiết kế: phím tắt là
hành vi, và một phím chỉ chạy ở một module là thứ người dùng không đoán được.

### 7.5 Năm họ màu phân loại thẻ

`--color-tk-bl-*` (xanh dương) · `-gr-*` (xanh lá) · `-am-*` (hổ phách) · `-pu-*` (tím) ·
`-rd-*` (đỏ) — gán cho sáu thẻ công cụ của trang Tổng quan.

⚠️ Đây là màu **phân loại**, không phải màu trạng thái. Tím `#6d5ce0` nằm sát "Tranh chấp", hổ
phách sát "Chờ duyệt", đỏ sát "Quá hạn". Nên chúng **chỉ được làm nền, viền và ô icon BÊN TRONG
thẻ** — cấm làm nhãn trạng thái, nền dòng bảng hay màu nút hành động chính. `StatusLozenge`
không đọc một token `tk` nào; có test canh.
