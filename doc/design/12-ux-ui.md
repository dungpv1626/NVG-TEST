# 12 — Đặc tả giao diện và trải nghiệm

Đối tượng: người viết giao diện phần Worker và Claude Code. Đây là **nguồn sự thật cho
mọi quyết định thị giác và tương tác** của module thiết kế.

Viết tắt dùng trong tài liệu này: **KTS** kiến trúc sư, **KT** kiến trúc, **KC** kết cấu,
**DN** điện nước, **DXF** Drawing Exchange Format là định dạng trao đổi bản vẽ. Bảng đầy
đủ ở `10-glossary.md`.

---

## 12.1 Vì sao module thiết kế có giao diện riêng

Phần còn lại của phần mềm quản trị là **giao diện nghiệp vụ**: biểu mẫu, bảng dữ liệu,
báo cáo. Người dùng vào, làm một việc, đi ra.

Module thiết kế là **công cụ chuyên nghiệp**: KTS ngồi trong đó nhiều giờ liền, thao tác
lặp lại hàng trăm lần một ngày, và thứ họ nhìn là bản vẽ kỹ thuật chứ không phải dữ liệu.
Hai loại giao diện này có yêu cầu ngược nhau ở nhiều điểm.

| | Phần nghiệp vụ | Module thiết kế |
|---|---|---|
| Mật độ thông tin | Thoáng, nhiều khoảng trắng | Dày, tận dụng từng pixel |
| Vùng chú ý | Phân tán theo nội dung | Tập trung tuyệt đối vào khu vẽ |
| Vị trí thành phần | Có thể thay đổi theo trang | **Bất biến** — hình thành trí nhớ cơ bắp |
| Chuột và bàn phím | Chủ yếu chuột | Bàn phím ngang chuột |
| Chế độ tối | Tuỳ chọn | **Bắt buộc** — làm việc lâu, phòng thiết kế thường để đèn thấp |

### Tách ở mức nào

**Kế thừa:** thanh điều hướng ngoài cùng, đăng nhập, hồ sơ người dùng, thông báo, và toàn
bộ luồng ra vào giữa các module.

**Riêng:** mọi thứ bên trong khung làm việc thiết kế — bảng token màu, mật độ, thư viện
thành phần, phím tắt.

Điểm nối là một khung `DesignWorkspace` chiếm toàn bộ vùng nội dung. Bên ngoài khung dùng
hệ giao diện chung; bên trong dùng hệ trong tài liệu này. Không trộn lẫn ở giữa.

---

## 12.2 Bốn nguyên tắc

**1. Bản vẽ là trung tâm, mọi thứ khác là chu vi.** Khu vẽ chiếm phần lớn màn hình và có
nền tương phản nhất với các bảng xung quanh. Không có panel nào nổi đè lên khu vẽ trừ
thanh chuyển chế độ xem. Không có hoạt ảnh trên khu vẽ.

**2. Vị trí cố định, không thu gọn tuỳ tiện.** Thanh công cụ trái, bảng lớp và tầng, khu
vẽ, bảng thuộc tính — bốn vùng luôn ở đúng chỗ. Panel trượt ra trượt vào hợp với ứng dụng
dùng thỉnh thoảng, không hợp công cụ dùng hàng ngày.

**3. Màu chỉ mang thông tin, không trang trí.** Trong khu vẽ, màu duy nhất có nghĩa là
màu trạng thái ràng buộc và màu phần tử đang chọn. Phòng ốc tô nền rất nhạt vì màu ở đó
không mang thông tin — nó chỉ phân biệt ranh giới.

**4. Trạng thái ràng buộc luôn nhìn thấy được.** Không giấu sau tab, không chỉ hiện khi
bấm nút. KTS phải biết mình đang vi phạm gì tại thời điểm đang vẽ, không phải sau khi vẽ
xong.

---

## 12.3 Token màu

Hai nhóm token **tách biệt và không dùng lẫn**: nhóm giao diện cho các bảng điều khiển, và
nhóm khu vẽ cho bản vẽ. Lý do tách: khu vẽ mô phỏng giấy và mực, đảo màu theo quy luật
khác với giao diện.

Tiền tố `--dsn-` để phân biệt với token của phần mềm quản trị.

### Nhóm giao diện

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `--dsn-page` | `#f4f4f1` | `#141413` | Nền ngoài cùng khung làm việc |
| `--dsn-panel` | `#ffffff` | `#1b1b19` | Nền các bảng điều khiển |
| `--dsn-raised` | `#fcfcfb` | `#232320` | Ô nhập, thẻ nổi trong bảng |
| `--dsn-border` | `#e5e4df` | `#2e2e2b` | Đường phân cách mặc định, 0,5px |
| `--dsn-border-strong` | `#d3d2cd` | `#3a3a36` | Viền ô nhập, trạng thái di chuột |
| `--dsn-text` | `#2c2c2a` | `#eae8e3` | Chữ chính |
| `--dsn-text-2` | `#575651` | `#b8b6af` | Chữ phụ, giá trị |
| `--dsn-text-3` | `#8a8880` | `#7d7b74` | Nhãn nhóm, chú thích, icon nghỉ |
| `--dsn-accent` | `#2563eb` | `#4d8ef7` | Lựa chọn đang hoạt động |
| `--dsn-accent-bg` | `#eaf1fd` | `#16273f` | Nền mục đang chọn |

### Nhóm trạng thái ràng buộc

| Token | Sáng nền / chữ | Tối nền / chữ | Nghĩa |
|---|---|---|---|
| `--dsn-ok-*` | `#eef6f1` / `#0f6e56` | `#12291f` / `#9fe1cb` | Đạt quy chuẩn |
| `--dsn-warn-*` | `#fdf3e3` / `#854f0b` | `#2a1e12` / `#fac775` | Lệch kinh nghiệm, bỏ qua được |
| `--dsn-error-*` | `#fdecec` / `#a32d2d` | `#2b1414` / `#f09595` | Vi phạm quy chuẩn, chặn phát hành |

Ba mức này ánh xạ trực tiếp sang trường `severity` và `source` trong rule pack
(`07-rule-pack.md`). Không tạo mức thứ tư trên giao diện.

### Nhóm khu vẽ

| Token | Sáng | Tối | Dùng cho |
|---|---|---|---|
| `--dsn-canvas` | `#f4f4f1` | `#0d0d0c` | Nền ngoài công trình |
| `--dsn-paper` | `#fdfcf9` | `#17171a` | Nền trong phòng |
| `--dsn-ink` | `#1c1c1a` | `#e8e6e0` | **Nét tường — đảo màu** |
| `--dsn-line` | `#a9a7a1` | `#5a5852` | Nét cửa, cửa sổ, nét phụ |
| `--dsn-furniture` | `#8d8b85` | `#7e7c76` | Nội thất, thiết bị vệ sinh |
| `--dsn-grid` | `#c8c7c2` | `#33322e` | Nét trục gạch chấm, bong bóng trục |
| `--dsn-dim` | `#7a7872` | `#8a8880` | Chuỗi kích thước và chữ số |
| `--dsn-room` | `#3d3c39` | `#cfcdc7` | Nhãn tên phòng |
| `--dsn-green` | `#9cbb86` | `#5d7a4c` | Cây xanh, cảnh quan |

**Quy tắc đảo màu quan trọng:** ở chế độ sáng bản vẽ là mực đen trên giấy trắng; ở chế độ
tối là **nét sáng trên nền gần đen**. Không làm mờ nét tường đi cho "dịu mắt" — nét tường
là thứ KTS nhìn nhiều nhất và phải luôn là phần tử tương phản cao nhất khung hình.

Nền phòng ở chế độ tối ngả xanh lạnh (`#17171a`) chứ không xám trung tính, vì xám trung
tính trên nền gần đen trông bẩn.

### Nhóm bộ môn

Chỉ dùng cho nhãn và bộ lọc, **không dùng để tô bản vẽ**.

| Bộ môn | Sáng nền / chữ | Tối nền / chữ |
|---|---|---|
| KT — kiến trúc | `#eaf1fd` / `#185fa5` | `#16273f` / `#85b7eb` |
| KC — kết cấu | `#f3eefd` / `#534ab7` | `#221f3a` / `#afa9ec` |
| DN — điện nước | `#e6f5f0` / `#0f6e56` | `#12291f` / `#5dcaa5` |

---

## 12.4 Chữ và số

| Loại | Cỡ | Cân | Dùng cho |
|---|---|---|---|
| Nhãn nhóm | 11px | 400 | "Lớp", "Tầng", "Phương án" |
| Nội dung bảng | 12px | 400 | Mục trong danh sách, nhãn trường |
| Giá trị số | 12px | 400 | Kích thước, diện tích |
| Tiêu đề bảng | 13px | 500 | "Thuộc tính" |
| Tiêu đề dự án | 13px | 500 | Trên thanh đầu |
| Chữ trong bản vẽ | 11px | 400 | Nhãn phòng, chữ số kích thước |

Không dùng cỡ dưới 11px ở bất kỳ đâu. Chỉ hai cân chữ: 400 và 500.

### Quy ước số

- **Đơn vị hiển thị theo ngữ cảnh:** milimét cho kích thước cấu kiện (`3700 mm`), mét cho
  kích thước lô đất và chuỗi kích thước bản vẽ (`5,00 m`), mét vuông cho diện tích
  (`21,8 m²`).
- **Dấu phẩy làm dấu thập phân**, theo quy ước Việt Nam. Dấu chấm không dùng làm dấu phân
  nhóm hàng nghìn trong bản vẽ — chuỗi kích thước viết `11400`, không viết `11.400`.
- Diện tích làm tròn một chữ số thập phân. Kích thước cấu kiện làm tròn về milimét nguyên.
- **Mọi số hiển thị phải đi qua hàm làm tròn.** Phép toán dấu phẩy động rò rỉ đuôi số.

---

## 12.5 Bố cục màn hình chỉnh sửa

```
┌──────────────────────────────────────────────────────────────────┐
│ Thanh đầu · 44px                                                 │
│ logo · dự án · nhãn bộ môn │ hoàn tác · lưu · xuất DXF · duyệt   │
├────┬───────────┬────────────────────────────────┬────────────────┤
│    │           │                                │                │
│ 40 │   240px   │        Khu vẽ · linh hoạt      │     280px      │
│ px │           │                                │                │
│    │  Lớp      │   ┌──────────────┐             │  Thuộc tính    │
│ th │  ────     │   │ 2D 3D ⬡ ☀ ⌗ 📷│  thanh nổi  │  ──────────    │
│ an │  Phương án│   └──────────────┘             │  Kiểm tra      │
│ h  │  ────     │                                │  ràng buộc     │
│ cô │  Tầng     │        bản vẽ                  │                │
│ ng │           │                                │                │
│ cụ │           │                                │                │
├────┴───────────┴────────────────────────────────┴────────────────┤
│ Thanh trạng thái · 32px                                          │
│ chế độ │ lưới · bắt điểm │ thời gian giải · rule pack │ tỉ lệ     │
└──────────────────────────────────────────────────────────────────┘
```

**Chiều rộng tối thiểu 1280px.** Dưới ngưỡng đó hiển thị thông báo yêu cầu màn hình rộng
hơn — **không** thu gọn thành bố cục hẹp. Máy tính bảng và điện thoại chỉ xem, không sửa.

### Thanh công cụ dọc — 40px

Icon đơn sắc, một cột, không nhãn chữ. Có gợi ý chữ khi di chuột kèm phím tắt.

Chọn · Tường · Cửa đi · Cửa sổ · Cầu thang · Kích thước · Ghi chú · Văn bản

Thứ tự này theo quy ước phần mềm CAD nên KTS nhận ra ngay mà không cần học.

### Cột bảng trái — 240px

Ba nhóm xếp dọc, phân cách bằng đường 0,5px:

- **Lớp** — cây có thể mở đóng, mỗi lớp có nút bật tắt hiển thị và khoá. Nhóm theo bộ môn.
- **Phương án** — 3–4 phương án do hệ thống sinh, mỗi mục hiện tên gợi nhớ và trạng thái
  ràng buộc rút gọn. Ví dụ "A · Thang hông — đạt, 76,4 m²".
- **Tầng** — **danh sách dọc, không phải tab ngang.** Danh sách dọc chứa được cả mặt cắt
  A-A, B-B và mặt đứng trong cùng một chỗ; tab ngang hết chỗ ngay khi công trình có bốn
  tầng.

### Bảng phải — 280px

Hai phần **cùng hiển thị, không tách tab**:

- **Thuộc tính** phần tử đang chọn — nhãn bên trái, giá trị bên phải, nhóm theo mục.
- **Kiểm tra ràng buộc** — luôn hiện, kể cả khi không chọn gì.

Khi có nhiều vi phạm, phần ràng buộc cuộn trong chính nó; phần thuộc tính giữ nguyên chiều
cao. Không để hai phần tranh chỗ nhau.

### Thanh trạng thái — 32px

Chế độ Thiết kế / Trình bày · Lưới · Bắt điểm · **Thời gian giải lần cuối** · **Phiên bản
rule pack** · Tỉ lệ.

Thời gian giải và phiên bản rule pack hiện thường trực, không giấu trong menu. Phiên bản
rule pack là thông tin có ý nghĩa pháp lý — KTS cần biết bản vẽ này sinh ra dưới bộ quy
chuẩn nào.

---

## 12.6 Thư viện thành phần

| Thành phần | Đặc tả |
|---|---|
| Mục danh sách | Cao 28px, bo 5px, chữ 12px. Đang chọn: nền `--dsn-accent-bg`, chữ `--dsn-accent`. Di chuột: nền `--dsn-raised` |
| Ô nhập số | Cao 26px, viền 0,5px `--dsn-border-strong`, bo 5px, chữ 12px căn phải, đơn vị nhạt màu bên phải |
| Nút thứ cấp | Cao 28px, viền 0,5px, nền trong suốt, bo 6px |
| Nút chính | Nền `--dsn-accent`, chữ trắng. **Tối đa một nút chính mỗi màn hình** |
| Nhãn bộ môn | Cao 20px, bo 4px, chữ 11px, dùng nhóm màu bộ môn |
| Thẻ ràng buộc | Bo 6px, đệm 7px, icon 14px bên trái, tiêu đề 11px, dòng nguồn quy tắc 11px nhạt hơn |
| Thanh nổi chế độ xem | Nền `--dsn-panel`, viền 0,5px, bo 8px, đặt giữa cạnh trên khu vẽ, cách 9px |
| Gợi ý khi di chuột | Nền `--dsn-text` đảo, chữ 11px, hiện sau 400ms, luôn kèm phím tắt nếu có |

### Thẻ ràng buộc — chi tiết vì nó chở nghĩa quan trọng nhất

Mỗi thẻ gồm ba phần bắt buộc:

1. **Icon** — dấu tích tròn, tam giác cảnh báo, hoặc chữ thập tròn
2. **Nội dung vi phạm** — sinh từ mẫu câu theo `rule_id`, không gọi mô hình ngôn ngữ
3. **Nguồn quy tắc** — ghi rõ `QCVN 01:2021/BXD` hay `Kinh nghiệm NVG`

Phần thứ ba là bắt buộc, không phải trang trí. Nó cho KTS biết ngay vi phạm này **chặn
phát hành** hay **bỏ qua được**. Không phân biệt thì hoặc KTS bỏ qua tất cả, hoặc bị chặn
bởi thứ không bắt buộc rồi ngừng dùng hệ thống.

Với thẻ lỗi chặn phát hành, thêm nút "Xem phương án điều chỉnh" mở danh sách nới lỏng lấy
từ `suggested_relaxations` trong `InfeasibilityReport` (`03-data-contracts.md` mục 3.5).

---

## 12.7 Tương tác trên khu vẽ

### Quy tắc nền tảng

Khi KTS kéo một bức tường, hệ thống hiểu đó là **đổi tỉ lệ một nút trong cây chia không
gian**, không phải di chuyển một đường thẳng độc lập. Các phòng lân cận tự co giãn theo và
mặt bằng không bao giờ hở hay chồng lấn.

Hệ quả cho giao diện: **không có thao tác nào tạo ra mặt bằng không hợp lệ.** Không cần
thông báo lỗi kiểu "các phòng bị chồng nhau" vì tình huống đó không xảy ra được.

### Phản hồi khi kéo

| Thời điểm | Hiện gì |
|---|---|
| Bắt đầu kéo | Tường chuyển màu `--dsn-accent`; hai phòng liền kề hiện diện tích trực tiếp trên phòng |
| Trong khi kéo | Diện tích cập nhật liên tục; nếu chạm giới hạn quy chuẩn thì tường chuyển màu lỗi và dừng lại |
| Thả | Gửi lên máy chủ giải lại; thanh trạng thái hiện "đang giải"; bản vẽ giữ nguyên cho tới khi có kết quả |

Giai đoạn 1 kiểm tra trên máy chủ. Nếu độ trễ vượt khoảng 150ms và KTS phàn nàn, khi đó
mới cân nhắc tầng kiểm tra trong trình duyệt — xem `02-architecture.md` mục 2.9.

### Phím tắt

Theo quy ước phần mềm CAD để KTS không phải học lại.

| Phím | Việc |
|---|---|
| `Esc` | Bỏ chọn, huỷ thao tác đang làm |
| `Space` giữ + kéo | Di chuyển khung nhìn |
| Con lăn | Phóng to thu nhỏ tại vị trí con trỏ |
| `F` | Vừa khung nhìn với bản vẽ |
| `1` … `9` | Chuyển tầng |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Hoàn tác, làm lại |
| `Ctrl+S` | Lưu phiên bản |
| `G` | Bật tắt lưới |
| `S` | Bật tắt bắt điểm |
| `Tab` | Nhập số liệu chính xác cho phần tử đang chọn |
| `Ctrl+1` / `Ctrl+2` | Chuyển 2D / 3D |

Mọi phím tắt hiện trong gợi ý di chuột của nút tương ứng. Có màn hình tra cứu phím tắt mở
bằng `?`.

---

## 12.8 Ngôn ngữ bản vẽ

Bản vẽ phải đọc được như bản vẽ kỹ thuật thật, không phải sơ đồ minh hoạ. Bảy yếu tố bắt
buộc:

| Yếu tố | Quy cách |
|---|---|
| Nét trục | Gạch dài chấm ngắn, màu `--dsn-grid`, vượt ra ngoài công trình cả hai đầu |
| Bong bóng trục | Đường tròn bán kính 11, **hai đầu mỗi trục**. Chữ số 1, 2, 3 cho trục dọc; chữ cái A, B, C cho trục ngang |
| Chuỗi kích thước | **Hai lớp** — lớp trong ghi từng khoảng, lớp ngoài ghi tổng. Đủ cả bốn cạnh |
| Nét tường | Đậm 2,4× nét thường, màu `--dsn-ink`. Tường chịu lực và tường ngăn cùng độ đậm ở giai đoạn sơ bộ |
| Cửa đi | Cung quay đúng chiều mở, kèm nét cánh cửa |
| Cửa sổ | Nét đôi trên bề dày tường |
| Cầu thang | Vẽ đủ bậc, kèm nét đứt chiều lên và mũi tên |
| Ký hiệu mặt cắt | Chữ cái kèm tam giác chỉ hướng nhìn, đặt ở hai biên bản vẽ |

**Một định nghĩa hình học duy nhất cho cả hai chế độ.** Bản vẽ sinh từ `FloorPlan` một
lần, hai chế độ chỉ khác bảng màu. Không viết hai bộ mã vẽ — đây là hệ quả trực tiếp của
nguyên tắc bất biến số 5 ở `01-overview.md`.

### Ánh xạ sang lớp DXF khi xuất

Mỗi loại phần tử trên màn hình tương ứng một lớp trong tệp DXF. Bảng này là hợp đồng giữa
giao diện và bộ xuất CAD (`05-tech-stack.md` mục 5.5).

| Phần tử trên màn hình | Lớp DXF |
|---|---|
| Tường | `KT-TUONG` |
| Cửa đi | `KT-CUA` |
| Cửa sổ | `KT-CUASO` |
| Cầu thang | `KT-THANG` |
| Nội thất | `KT-NOITHAT` |
| Nét trục và bong bóng | `KT-TRUC` |
| Chuỗi kích thước | `KT-KICHTHUOC` |
| Nhãn phòng, ghi chú | `KT-GHICHU` |
| Cây xanh, cảnh quan | `KT-CANHQUAN` |
| Lưới cột kết cấu | `KC-COT` |

Tệp xuất ra mang khung tên và mã phiên bản theo quy ước hiện hành của Nhà Việt Group —
dạng `NVO026_NhaAnhA_KT_MatBang_V03_11082026` — khổ A3, riêng tổng mặt bằng khổ A1 hoặc
A2. Số phiên bản do hệ quản lý tài liệu cấp qua publish bridge, giao diện không tự đặt.

---

## 12.9 Trạng thái rỗng, đang xử lý, lỗi

### Đang giải mặt bằng

Bộ giải chạy vài giây tới vài chục giây. **Không dùng vòng quay che toàn màn hình.**

- Bản vẽ hiện tại giữ nguyên, giảm độ đậm còn 50%
- Thanh trạng thái hiện "Đang giải · 3 giây" với đồng hồ đếm lên
- Nút huỷ luôn có
- Quá 30 giây: đổi thông báo thành "Bài toán này mất nhiều thời gian hơn thường lệ" — nói
  sự thật thay vì để người dùng đoán

### Vô nghiệm

**Đây là kết quả hợp lệ, không phải lỗi hệ thống.** Không dùng màu và giọng văn của lỗi
kỹ thuật.

Hiện trong bảng phải: câu giải thích rõ ràng, danh sách ràng buộc xung đột, và các phương
án nới lỏng bấm được. Khu vẽ giữ phương án gần nhất còn hợp lệ.

### Chưa có phương án

Khu vẽ hiện khung lô đất theo kích thước trong đầu bài, kèm một câu mời và một nút sinh
phương án. Không hiện "Chưa có dữ liệu".

### Lỗi kỹ thuật

Nói chuyện gì xảy ra rồi nói làm gì tiếp. Một câu, không tiền tố "Lỗi:", không ngôi thứ
nhất, không hiện chuỗi ngoại lệ thô.

---

## 12.10 Hiển thị ranh giới trách nhiệm

Ranh giới ở `01-overview.md` mục 1.4 phải nhìn thấy được trên giao diện, không chỉ nằm
trong tài liệu.

| Nội dung | Nhãn bắt buộc |
|---|---|
| Ảnh phối cảnh | "Ảnh tham khảo ý tưởng — chưa phải phương án thi công" |
| Bảng khối lượng sơ bộ | "Khối lượng sơ bộ — không dùng làm căn cứ ký hợp đồng" |
| Lưới trục kết cấu do hệ thống đề xuất | "Đề xuất — kỹ sư kết cấu quyết định" |

Nhãn do mã nguồn chèn, không phụ thuộc người dùng nhớ bật, và không tắt được từ giao diện.

**Nút phát hành theo từng bộ môn.** Người không có quyền `design.publish.<bộ môn>` thì nút
không hiện. Không hiện nút mờ rồi báo lỗi khi bấm — người dùng không nên thấy thao tác họ
không được làm.

---

## 12.11 Tiếp cận

- **Tương phản nét tường trên nền phòng tối thiểu 7:1** ở cả hai chế độ. Đây là ngưỡng
  chặt hơn tiêu chuẩn thông thường, vì đọc bản vẽ nhiều giờ liền.
- **Không mã hoá nghĩa chỉ bằng màu.** Mọi trạng thái ràng buộc có icon và chữ đi kèm.
  Khoảng 8% nam giới có rối loạn nhận màu, và ngành xây dựng đa số là nam.
- Mọi thao tác dùng chuột phải có đường đi bằng bàn phím. Vòng lấy nét dày 2px màu
  `--dsn-accent`.
- Nút chỉ có icon phải có `aria-label`.
- Bản vẽ có mô tả văn bản thay thế nêu tên công trình, tầng đang xem và danh sách phòng.
- Tôn trọng `prefers-reduced-motion`: tắt mọi chuyển động, giữ lại chuyển màu.

---

## 12.12 Những gì không làm

| Không | Vì sao |
|---|---|
| Chuyển sắc, đổ bóng, hiệu ứng kính mờ | Làm mờ ranh giới nét vẽ, gây mỏi mắt khi nhìn lâu |
| Hoạt ảnh trên khu vẽ | Bản vẽ kỹ thuật phải đứng yên để đo và so sánh |
| Giấu trạng thái ràng buộc sau tab | KTS vẽ xong mới biết vi phạm là quá muộn |
| Panel trượt ra trượt vào | Phá trí nhớ vị trí, tốn một thao tác mỗi lần dùng |
| Nút chỉ có icon mà không có gợi ý chữ | KTS mới vào không đoán được |
| Quá một nút chính mỗi màn hình | Mất trọng tâm hành động |
| Tô màu bản vẽ theo bộ môn | Màu trong khu vẽ chỉ dành cho trạng thái ràng buộc |
| Thu gọn thành bố cục hẹp dưới 1280px | Công cụ chuyên nghiệp cần diện tích; bố cục hẹp tạo ảo giác dùng được |
| Dùng lại token màu của phần mềm quản trị cho khu vẽ | Khu vẽ đảo màu theo quy luật khác |
| Đặt số phiên bản bản vẽ từ giao diện | Số phiên bản do hệ quản lý tài liệu cấp |

---

## 12.13 Việc còn để ngỏ

| Vấn đề | Ghi chú |
|---|---|
| Dòng lệnh kiểu AutoCAD | KTS quen gõ lệnh. Cân nhắc thêm ô lệnh ở thanh trạng thái sau Mốc 5, khi biết họ dùng phím tắt tới đâu |
| Giao diện phối hợp liên bộ môn | Thuộc Mốc 6c. Cần thiết kế riêng cách hiển thị chồng lớp ba bộ môn và đánh dấu xung đột |
| Giao diện nhập chú giải kho hồ sơ cũ | Thuộc Mốc 3. Màn hình riêng, mật độ khác, không dùng bố cục bốn vùng ở mục 12.5 |
| Luồng cho khách vãng lai trên website | Thuộc Mốc 8. Đơn giản hơn nhiều, không dùng bố cục này |
