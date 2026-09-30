# DESIGN_SYSTEM.md — Ngôn ngữ thị giác NVG

> Tài liệu làm việc của đội triển khai, **không** phải một trong 6 tài liệu chính thức trong `doc/`.
> Nó MỞ RỘNG và ở vài chỗ THAY THẾ **CGD Mục 6**; phần không nhắc tới ở đây thì CGD vẫn hiệu lực.
> Token khai ở `web/src/index.css` (`@theme`). Trang trưng bày mọi thành phần: **`/nen/giao-dien`** —
> sửa token xong thì soát ở đó. Test canh: `web/src/test/design-rules.test.ts`.

## 1. Bản sắc

Tinh thần giữ nguyên CGD 6.1: sạch, phẳng, hạn chế trang trí, mật độ thông tin cao. Bản sắc thương
hiệu là cặp **rừng (forest) & bạc hà (mint)** (Haan chốt, thay Brand Blue `#0C66E4` + cam an toàn `#EA580C`).

---

## 2. Màu

### 2.1 Sáu màu trạng thái — hàng rào cứng nhất, không đổi

| Trạng thái | Sắc CGD   | Chữ thực dùng | Ghi chú                              |
| ---------- | --------- | ------------- | ------------------------------------ |
| Nháp       | `#6B778C` | `#616B7E`     | làm đậm: 3.83 → 4.55                 |
| Chờ duyệt  | `#B38600` | `#906C00`     | làm đậm: 3.09 → 4.51                 |
| Đang xử lý | `#0C66E4` | giữ           | 4.61                                 |
| Hoàn thành | `#22A06B` | `#1C8157`     | làm đậm: 3.11 → 4.53                 |
| Quá hạn    | `#CA3521` | giữ           | 4.56                                 |
| Tranh chấp | `#8270DB` | `#6953D4`     | làm đậm: 3.26 → đạt; thêm ở CGD v1.2 |

- **Không tạo màu thứ 7.** Nhãn trạng thái là chữ 12px → phải đạt 4.5:1 trên nền nhạt của chính nó;
  chỉ làm đậm CHỮ, giữ sắc và nền để không ai phải học lại màu.
- "Đang xử lý" trùng hex với Brand Blue cũ nhưng là token độc lập (`--color-status-progress`).
- **Tím "Tranh chấp"** chỉ cho hồ sơ thu hồi/bồi thường giàn giáo chưa thống nhất với khách (SX-19) —
  trạng thái khoá số liệu gốc. **Không dùng tím ở đâu khác** (nền dòng, nút, chuỗi biểu đồ).
- `StatusLozenge` **cấm** dùng mọi token `brand`/`mint`/`forest`/`tk` — có test canh. Lý do: rừng/mint
  gần xanh "Hoàn thành", lẫn vào nhãn là bắt người dùng phân biệt hai tín hiệu xanh khi quét bảng.

> Mục 2.3 cũ (sửa tương phản nhãn trạng thái) nay gộp vào 2.1.

### 2.2 Trung tính — ám sắc xanh lá nhạt (thay CGD 6.3)

| Token                    | Mã        | Dùng cho                             |
| ------------------------ | --------- | ------------------------------------ |
| `--color-surface`        | `#FFFFFF` | nền thẻ, nền bảng                    |
| `--color-surface-sunken` | `#F2F7F2` | nền trang, vùng trũng                |
| `--color-surface-hover`  | `#F4F8F4` | dòng đang trỏ                        |
| `--color-border`         | `#E7EDE7` | viền mảnh                            |
| `--color-border-strong`  | `#9A9485` | đầu bảng, ô nhập (≥3:1, WCAG 1.4.11) |
| `--color-fg`             | `#1C1C1A` | chữ chính (không dùng `#000000`)     |
| `--color-fg-subtle`      | `#5A574F` | chữ phụ (6.65:1 trên nền trang)      |

- `fg`/`fg-subtle`/`border-strong` cố ý KHÔNG chép giá trị của bản demo tham chiếu — các giá trị đó
  không đạt tương phản. `border-strong` là thứ duy nhất cho biết đâu là ô nhập, phải nhìn thấy được.
- Token hẹp dùng cục bộ: `--color-surface-muted` (search box, nút icon topbar) · `-surface-subtle`
  (ô icon trung tính) · `-surface-empty` + `--color-border-dashed` (khối rỗng) · `--color-chart-neutral`
  / `-chart-positive` (dot PillBadge Dashboard — cố ý lệch hex với màu trạng thái) · `--color-tint-*`
  (ô icon thẻ KPI).

### 2.4 Rừng & bạc hà — màu thương hiệu = màu hành động chính

| Token                    | Mã        | Vai trò                                                        |
| ------------------------ | --------- | -------------------------------------------------------------- |
| `--color-brand`          | `#2C6E4B` | hành động chính, liên kết, focus ring (chữ trắng 6.11:1)       |
| `--color-brand-hover`    | `#1B5138` | hover/active hành động chính                                   |
| `--color-brand-subtle`   | `#D9F2D4` | nền nhạt: badge, hover menu, ô chọn, nav active                |
| `--color-brand-forest`   | `#17352A` | khối logo, nền avatar, chữ nav active                          |
| `--color-brand-mint`     | `#A8E6A1` | nền pill kỳ báo cáo đang chọn — **không làm nền nút** (1.45:1) |
| `--color-brand-mint-ink` | `#123024` | chữ trên nền mint                                              |

**Vẫn DUY NHẤT một hành động chính mỗi màn hình.**

### 2.5 Biểu đồ — dải thương hiệu, không đụng màu trạng thái

Dashboard của Ban Giám đốc và tab «Tổng quan tài chính» (Haan, 30/09/2026). Thư viện: Recharts
(TSD 1.4), bọc trong `web/src/components/charts/` — **không gọi Recharts thẳng từ trang**.

| Token             | Mã        | Dùng cho                                |
| ----------------- | --------- | --------------------------------------- |
| `--color-chart-1` | `#2C6E4B` | chuỗi chính (doanh thu)                 |
| `--color-chart-2` | `#86C9A4` | chuỗi đi cặp (tiền đã thu)              |
| `--color-chart-3` | `#2E7C72` | chuỗi thứ ba, đường dòng tiền ròng      |
| `--color-chart-4` | `#8A9A91` | khoản chi, chuỗi so sánh, công trình lỗ |
| `--color-chart-5` | `#D5E0D8` | nền thanh, kỳ trước                     |

- **Không tô chuỗi biểu đồ bằng 6 màu trạng thái** (§2.1): cột đỏ đọc như «quá hạn». Lỗ, nợ quá hạn
  phân biệt bằng CHỮ («Lỗ 120 triệu», «Quá hạn 31 – 60 ngày»), màu chỉ phụ.
- So kỳ trước dùng mũi tên + chữ («Tăng 23% so với kỳ trước») bằng mực trung tính: tăng tốt hay xấu
  tuỳ chỉ số (chi tiền tăng là xấu).
- Số chính của ô chỉ số: `KPI_VALUE_CLASS` (`text-2xl font-semibold`) — cỡ vừa, rút gọn «2,6 tỷ» và
  ghi đủ «2.600.000.000 đồng» ngay dưới.
- Trục tiền dùng bước tròn 1–2–5 (`niceMoneyTicks`), vạch 0 ghi «0».
- Kỳ chưa có phát sinh: «Chưa đủ dữ liệu», không vẽ trục trống với cột 0; chuỗi bắt đầu từ kỳ có
  phát sinh đầu tiên.
- Mỗi biểu đồ có chú thích bằng chữ và câu tóm tắt cho trình đọc màn hình; tắt hoạt ảnh khi
  `prefers-reduced-motion`.

---

## 3. Chữ (thay CGD 6.4)

**Be Vietnam Pro**, một họ duy nhất — thiết kế cho tiếng Việt nên dấu không chồng ở cỡ nhỏ. Không đổi
sang phông của bản demo tham chiếu.

- **Tự lưu bằng `@fontsource/be-vietnam-pro`**, không `<link>` Google Fonts (bớt request ở mạng yếu,
  vào precache service worker, không gửi IP sang Google). Nét 400…800.
- ⚠️ **Nạp theo NÉT (`400.css`), KHÔNG theo bộ ký tự (`vietnamese-400.css`).** Tệp theo bộ ký tự không
  có `unicode-range`; nạp cả `vietnamese` lẫn `latin` thì `latin` đè, mọi chữ có dấu rơi về phông hệ
  thống — build xanh, chỉ mở trình duyệt mới thấy. Có test canh.
- **Chữ nội dung 14px** — mật độ thông tin là yêu cầu nghiệp vụ.
- Cột tiền và số: `font-variant-numeric: tabular-nums`.

| Token               | Cỡ   | Dùng cho                                           |
| ------------------- | ---- | -------------------------------------------------- |
| `--text-2xs`        | 10px | **chỉ** nhãn module khi thanh điều hướng thu gọn   |
| `--text-xs`         | 12px | nhãn phụ, chú thích, nhãn trạng thái               |
| `--text-base`       | 14px | nội dung, bảng, biểu mẫu                           |
| `--text-md`         | 16px | tiêu đề thẻ                                        |
| `--text-lg`         | 18px | tiêu đề mục                                        |
| `--text-xl`         | 20px | tiêu đề trang                                      |
| `--text-page-title` | 26px | tiêu đề trang Dashboard (`PageHeader size="hero"`) |
| `--text-2xl`        | 24px | số liệu lớn Dashboard                              |
| `--text-3xl`        | 30px | số liệu nổi bật                                    |
| `--text-hero`       | 34px | số liệu hero trên thẻ KPI nổi bật nhất             |

---

## 4. Độ nổi và bo góc — PHẲNG + HAIRLINE

Chiều sâu đến từ viền 1px trên nền có sắc, không từ bóng. Thẻ/nút/khung sườn không dùng box-shadow.

- `--shadow-overlay` — **duy nhất** cho lớp phủ nổi thật (menu Radix, hộp thoại).
- `--shadow-sticky` — header dính khi cuộn ở trang chưa restyle.
- `--shadow-raised`, `--shadow-card` — đang ngưng dùng; không dùng cho component mới, xoá khi mọi trang đã chuyển.
- Bo góc `--radius-sm/md/lg` = **9/10/14px**, `--radius-xl` 16px (panel sidebar). Lozenge/pill `rounded-full`.

### 4.1 Thanh điều hướng thu gọn được

240px mở / 80px thu, ghi nhớ theo máy (`localStorage`).

- **Thu gọn KHÔNG bỏ chữ**: biểu tượng trên, `shortLabel` 10px dưới; chữ xuống dòng, không cắt cụt.
- Tên đọc được luôn là nhãn đầy đủ (`aria-label`); mọi `shortLabel` là một phần của `label` (WCAG 2.5.3, có test canh).
- ⚠️ Mục điều hướng dùng `Link`, **không** `NavLink` — `NavLink` ghi đè `aria-current`, để màu thành cách
  duy nhất báo vị trí. Một nguồn sự thật: `useActiveModule()`.

---

## 5. Chuyển động (bổ sung, CGD chưa có)

`--motion-fast` 120ms (trỏ, nhấn) · `--motion-base` 180ms (đổi tab, mở panel) · `--motion-slow` 240ms
(lớp phủ, hộp thoại). Easing `cubic-bezier(0.2, 0, 0, 1)`.

**Bắt buộc** tôn trọng `prefers-reduced-motion: reduce`. Không scroll-reveal, không thư viện hoạt ảnh —
chuyển động để giải thích thứ vừa đổi, không để gây chú ý.

---

## 6. Không đổi so với CGD

- Chế độ tối: chưa làm cho 11 module (CGD 6.7); riêng Module Thiết kế có — Mục 7.
- Lưới bội số 8px · biểu tượng nét đơn sắc Lucide · vùng bấm di động ≥ 40×40px.
- Trạng thái luôn kèm chữ, không dùng màu làm cách duy nhất truyền đạt (CGD 6.8).

---

## 7. Module Thiết kế — bảng màu riêng, chỉ trong `/tk/*`

Module Thiết kế theo bộ bàn giao thiết kế riêng (`Giao diện chỉnh sửa bản vẽ/design_handoff_trang_thiet_ke/`),
**chỉ trong `/tk/*`** — 11 module còn lại không đổi một pixel. Phạm vi gồm cả khung sườn, **suy từ
đường dẫn** (`useTkScope`, `components/layout/tk-chrome.ts`), không từ cờ; có test canh cả hai chiều.

### 7.1 Hai bộ token song song

- Bộ Thiết kế: `--color-tk-*` (71 token), bản SÁNG ở `@theme` trong `web/src/index.css`, bản TỐI ở
  `web/src/pages/tk/tk-theme.css` dưới `[data-tk-theme='toi']`. Giá trị chép nguyên văn từ bản mẫu.
- Test canh: mọi token có đủ cặp sáng–tối (thiếu là một mảng chữ vô hình, không lỗi); bản tối không khai
  token ngoài danh sách `@theme`.

### 7.2 Chế độ tối ánh xạ lại token dùng chung

`[data-tk-theme='toi']` ánh xạ `--color-surface`, `--color-fg`, `--color-fg-subtle`, `--color-border`…
sang bảng tối, vì màn hình trong module dùng lại `Button`, `EntityTable`, `EmptyState`… **Workspace tối
là tối toàn phần** (giữ thân màn hình sáng thì panel trong suốt nhận nền tối mà giữ chữ tối — không đọc được).

Ba thứ KHÔNG ánh xạ:

- **Sáu màu trạng thái** — hệ đóng, mỗi nhãn tự mang nền và chữ.
- **`--color-border-strong`** dùng `--color-tk-t3` (~3,7:1), không `--color-tk-line2` (~1,2:1 — viền ô nhập biến mất).
- **Tờ bản vẽ giữ nền giấy trắng** — bản vẽ LÀ giấy, đảo màu là hỏng thứ sẽ in ra.

Đặt kèm `color-scheme: dark` cho thanh cuộn, `<select>`, bảng lịch.

### 7.3 Chỗ cố ý lệch khỏi quy tắc chung

- Chữ nội dung: **theo quy tắc chung** (14px Be Vietnam Pro), không theo bản mẫu 13px phông hệ thống.
- Bóng hover trên thẻ: **theo bản mẫu, CHỈ trong `/tk/*`** — `--shadow-tk-panel`, `--shadow-tk-card`
  (nền tối cần bóng đậm hơn bộ `--shadow-*` chung).
- Một hành động chính: nút "Tạo phương án mới" ở chân thẻ AI phương án, không ở header; hành động chính
  của màn hình là "Bàn giao thi công".

### 7.4 Khung sườn Thiết kế

- Ba vùng sát nhau phân cách bằng một đường viền (vỏ chung: panel nổi, khe 12px, bo 16px).
- **Thanh trái tối ở CẢ hai chế độ** (chủ ý của bản mẫu) → dùng bộ `--color-navdark-*` một giá trị,
  không dùng `--color-tk-*`.
- Thanh trên cao 60px, ô tìm kiếm 420px kèm chip `Ctrl K`, nút sáng/tối. Phím `Ctrl K` chạy ở **mọi
  module**; chỉ chip nhắc là riêng Thiết kế.
- ⚠️ **`text-fg` phải khai trên chính phần tử mang `data-tk-theme`** — `body` nằm ngoài phạm vi nên màu
  chữ kế thừa là màu chế độ sáng, biến mất trên nền tối.

### 7.5 Năm họ màu phân loại thẻ

`--color-tk-bl-*` · `-gr-*` · `-am-*` · `-pu-*` · `-rd-*` cho sáu thẻ công cụ trang Tổng quan. Đây là
màu **phân loại**, gần màu trạng thái (tím ~ Tranh chấp, hổ phách ~ Chờ duyệt, đỏ ~ Quá hạn) → **chỉ làm
nền, viền, ô icon BÊN TRONG thẻ**; cấm làm nhãn trạng thái, nền dòng bảng, nút hành động chính.
