# DESIGN_SYSTEM.md — Ngôn ngữ thị giác NVG

> Tài liệu làm việc của đội triển khai (như `BUILD_PLAN.md`), **không** phải một trong 6 tài liệu
> chính thức trong `doc/`.
>
> **Quan hệ với CGD:** file này MỞ RỘNG và ở vài chỗ THAY THẾ Mục 6 của
> `ContentGuidelines_Document_NVG_v1.1.docx`. Mọi chỗ lệch đều ghi rõ bên dưới để Haan cập nhật
> CGD lên v1.2. Phần nào không nhắc tới ở đây thì CGD vẫn nguyên hiệu lực.

---

## 1. Vì sao sửa CGD

CGD 6.1 đã yêu cầu "hiện đại, chuyên nghiệp… sạch, phẳng, hạn chế hiệu ứng trang trí" và lấy Jira
làm tham chiếu. Phần lớn tinh thần đó giữ nguyên — tra cứu cơ sở dữ liệu thiết kế cho loại sản phẩm
này trả về đúng phong cách **"Minimalism & Swiss Style"** (sạch, hình học, lưới, sans-serif, dành
cho enterprise app), và bảng màu doanh nghiệp sáng mà nó đề xuất gần trùng khít bảng màu CGD 6.3.

Chỗ CGD còn thiếu là **bản sắc ngành**: giao diện hiện tại có thể là phần mềm quản trị của bất kỳ
công ty nào. Nhà Việt Group là nhà thầu xây dựng — nhà xưởng công nghiệp, nhà ở dân dụng, giàn giáo
kết cấu thép. Bản sắc đó lấy từ chính hiện trường: **xám bê tông** và **cam an toàn**.

---

## 2. Màu

### 2.1 Giữ nguyên — không đụng tới

| Vai trò | Mã | Ghi chú |
|---|---|---|
| Hành động chính | `#0C66E4` | **DUY NHẤT một hành động chính mỗi màn hình.** Không đổi, không thêm màu thứ hai cho nút. |
| Nháp · Chờ duyệt · Đang xử lý · Hoàn thành · Quá hạn | `#6B778C` · `#B38600` · `#0C66E4` · `#22A06B` · `#CA3521` | 5 màu trạng thái. **Không tạo màu thứ 6.** |

### 2.2 Thay thế CGD 6.3 — dải trung tính ám sắc ấm

Xám cũ ám xanh lam (`#F7F8F9`, `#DCDFE4`, `#172B4D`). Thay bằng dải ám sắc **ấm** — cảm giác bê
tông và thép thay vì cảm giác phần mềm văn phòng. Chênh lệch rất nhỏ trên từng ô màu, nhưng phủ
toàn màn hình thì đổi hẳn không khí.

| Token | Cũ (CGD 6.3) | Mới | Dùng cho |
|---|---|---|---|
| `--color-surface` | `#FFFFFF` | `#FFFFFF` | nền thẻ, nền bảng |
| `--color-surface-sunken` | `#F7F8F9` | `#F6F6F4` | nền trang, vùng trũng |
| `--color-surface-hover` | `#F1F2F4` | `#EFEFEC` | dòng đang trỏ tới |
| `--color-border` | `#DCDFE4` | `#DEDCD6` | viền mảnh |
| `--color-border-strong` | *(chưa có)* | `#C4C1B8` | viền cần thấy rõ: đầu bảng, ô nhập |
| `--color-fg` | `#172B4D` | `#1C1C1A` | chữ chính |
| `--color-fg-subtle` | `#44546F` | `#5A574F` | chữ phụ |

Tương phản đã kiểm: `#1C1C1A` trên `#FFFFFF` ≈ 16.9:1 · `#5A574F` trên `#FFFFFF` ≈ 7.0:1 ·
`#5A574F` trên `#F6F6F4` ≈ 6.6:1. Đều vượt mức AA 4.5:1.

### 2.3 Sửa lỗi trợ năng trong bảng màu trạng thái CGD 6.3

Ba trong năm màu chữ của nhãn trạng thái **không đạt** tương phản 4.5:1 trên chính nền nhạt của
nó. Nhãn trạng thái là chữ 12px nên không được tính là "chữ lớn" theo WCAG, tức là vẫn phải đạt
4.5:1. Đã làm đậm vừa đủ chạm ngưỡng, **giữ nguyên sắc màu và nền** để không ai phải học lại màu
nào ứng với trạng thái nào.

| Trạng thái | CGD 6.3 | Mới | Tương phản |
|---|---|---|---|
| Nháp | `#6B778C` | `#616B7E` | 3.83 → **4.55** |
| Chờ duyệt | `#B38600` | `#906C00` | 3.09 → **4.51** |
| Hoàn thành | `#22A06B` | `#1C8157` | 3.11 → **4.53** |

"Đang xử lý" (4.61) và "Quá hạn" (4.56) vốn đã đạt — giữ nguyên.

Cùng lý do, `--color-border-strong` đặt ở `#9A9485` để đạt ≥3:1 trên nền trắng theo WCAG 1.4.11:
viền là thứ DUY NHẤT cho biết đâu là ô nhập liệu, nên nó phải nhìn thấy được chứ không chỉ là
gợi ý thẩm mỹ.

### 2.4 Bổ sung CGD 6.3 — cam an toàn `#EA580C`

Màu **nhận diện**, không phải màu hành động và không phải màu trạng thái.

**CHỈ được dùng ở:**
- dấu thương hiệu và thanh chỉ mục đang chọn trên sidebar
- đường phân mục / vạch nhấn trên Dashboard
- chuỗi dữ liệu biểu đồ khi cần màu thứ hai
- hình minh hoạ trạng thái rỗng
- dấu hiệu đang ở chế độ gộp "Toàn NVG"

**CẤM tuyệt đối:** nhãn trạng thái (Lozenge) · nền dòng bảng · nút bấm · biểu tượng cảnh báo.

> Lý do cấm không phải thẩm mỹ. Cam nằm giữa vàng "Chờ duyệt" `#B38600` và đỏ "Quá hạn" `#CA3521`.
> Một chấm cam cạnh một nhãn vàng là hai tín hiệu người dùng phải phân biệt trong nửa giây khi quét
> bảng 50 dòng. Đặt cam vào vùng trạng thái là phá chính hệ thống trạng thái mà CGD sinh ra để bảo vệ.

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

| Token | Cỡ | Dùng cho |
|---|---|---|
| `--text-xs` | 12px | nhãn phụ, chú thích, nhãn trạng thái |
| `--text-base` | **14px** | nội dung chính, bảng, biểu mẫu |
| `--text-md` | 16px | tiêu đề thẻ |
| `--text-lg` | 18px | tiêu đề mục |
| `--text-xl` | 20px | tiêu đề trang |
| `--text-2xl` | 24px | số liệu lớn trên Dashboard |
| `--text-3xl` | 30px | số liệu nổi bật |

**Chữ nội dung vẫn 14px.** Mật độ thông tin là yêu cầu nghiệp vụ (CGD 6.1), không phải thứ đem ra
đánh đổi cho "thoáng đẹp".

**Số liệu** dùng `font-variant-numeric: tabular-nums` ở mọi cột tiền và số — cột số không thẳng
hàng thì bảng dự toán mất tác dụng.

---

## 4. Độ nổi — tinh chỉnh CGD 6.5

Giữ 4 mức, không đổi triết lý "bóng rất nhẹ". Tinh lại để thẻ tách khỏi nền mà không nặng:

| Token | Dùng cho |
|---|---|
| `--shadow-raised` | thẻ trên nền trũng |
| `--shadow-card` | thẻ cần tách rõ hơn |
| `--shadow-overlay` | menu thả xuống, hộp thoại |
| `--shadow-sticky` | đầu bảng và header dính khi cuộn |

---

## 5. Chuyển động — bổ sung, CGD chưa có

CGD 6.1 cấm "hoạt ảnh phô trương" nhưng không nói gì về chuyển động chức năng. Bổ sung:

| Token | Thời lượng | Dùng cho |
|---|---|---|
| `--motion-fast` | 120ms | trỏ chuột, nhấn nút |
| `--motion-base` | 180ms | đổi tab, mở panel |
| `--motion-slow` | 240ms | lớp phủ, hộp thoại |

Easing chung `cubic-bezier(0.2, 0, 0, 1)` — nhanh lúc đầu, êm lúc dừng.

**Bắt buộc:** toàn bộ nằm dưới `prefers-reduced-motion: reduce`. Không scroll-reveal, không thư
viện hoạt ảnh. Đây là công cụ nhập liệu — chuyển động để **giải thích** thứ vừa đổi, không để gây
chú ý.

---

## 6. Những gì KHÔNG đổi

- Chế độ tối: chưa làm (CGD 6.7). Token khai theo kiểu đổi được để sau này rẻ.
- Bo góc 4–8px, Lozenge bo tròn hoàn toàn (CGD 6.5).
- Lưới bội số 8px (CGD 6.5).
- Biểu tượng dạng đường nét, một màu (CGD 6.2) — Lucide React.
- Vùng bấm ≥ 40×40px trên di động (CGD 6.8).
- Trạng thái luôn kèm chữ, không dùng màu làm cách duy nhất truyền đạt (CGD 6.8).
