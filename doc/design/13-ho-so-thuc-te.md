# 13 — Hồ sơ thật của NVG: đối chiếu tài liệu với hồ sơ đã bàn giao

Ngày 05/09/2026, NVG bàn giao **hai bộ hồ sơ thiết kế hoàn chỉnh**. Đây đúng là thứ mà Mốc 0.1
và vướng mắc V-1 đang chờ — chốt chặn "chưa từng gặp một bản vẽ NVG nào" đã được gỡ.

Ngày 22/09/2026 NVG bàn giao thêm **năm bộ nữa**. Mục 13.1 → 13.15 giữ nguyên là báo cáo về hai
bộ đầu (gọi là HS-01, HS-02); **mục 13.16** ghi đợt đo bốn bộ mới (HS-03 → HS-06), tập trung vào
cầu thang, bậc tam cấp và cốt cao độ. Chỗ nào hai đợt nói khác nhau, mục 13.16 ghi rõ là **khác
nhau** chứ không đè lên — hai công trình làm khác nhau là chuyện thường, và biết chúng khác nhau
có giá trị hơn một con số gộp.

File này là **dữ liệu, không phải đặc tả**: nó ghi hồ sơ thật chứa gì, đo được bằng cách nào, và
chỗ nào bộ tài liệu `doc/design/` cùng mã nguồn đang dựa trên giả định sai. Khi nó mâu thuẫn với
`06-knowledge-base.md`, **file này thắng ở phần mô tả hiện trạng** — vì nó đo, còn kia đoán. Nó
**không** thắng ở phần đặc tả: quyết định làm gì vẫn theo `08-milestones.md` và các đính chính ở
`README.md`.

> **Mọi con số dưới đây đều kèm cách đo.** Mục 13.14 ghi lại đúng các lệnh đã dùng, để lần sau
> kiểm lại được mà không phải tin.

**Nguồn:** `/home/haan/Documents/Doc/NVG/hồ sơ/` — nằm **ngoài repo** và không được chép vào
`kb/samples/` trong đợt phân tích này. Hồ sơ chứa dữ liệu khách hàng thật (hợp đồng, giá, căn
cước) nên thuộc **hạng dữ liệu 1**; không lời gọi mô hình ngôn ngữ nào được mang nội dung của
nó đi khi chưa có cam kết của nhà cung cấp (`01-overview.md` 1.5, quyết định T8).

---

## 13.1 Hai hồ sơ là gì

| | **Hồ sơ A — Dương** | **Hồ sơ B — Mạnh** |
|---|---|---|
| Công trình | Nhà lô liền kề, **5 tầng + phòng KTTM + mái**, "hiện đại" | Nhà **2 tầng**, "hiện đại" |
| Địa điểm | Phường Trần Lãm, tỉnh Hưng Yên | An Bình, Kiến Xương, Thái Bình (cũ) |
| Ngày hồ sơ | 08/2026 | 03/2026 |
| Số tờ | KT 55 · KC 73 · DN 44 = **172** | KT 35 · KC 36 · DN 22 = **93** |
| Ảnh khảo sát | 15 JPG + 3 MP4 | 86 JPG |
| Hợp đồng | HĐTK (bản quét PDF) | HĐTK + **HĐ thi công trọn gói** (PDF + `.doc`) |
| Dự toán | — | Báo giá lần 2 (PDF + **XLSX 9 sheet**) + bảng thi công XLSX |
| Phối cảnh | 3 PNG khổ lớn + 5 JPG | 12 ảnh, tên `aicomplex_angle_*` |

Cộng lại: **265 tờ bản vẽ** trên **6 tập** thuộc **3 bộ môn**.

Hai hồ sơ này là **hai quy mô khác nhau** của cùng một loại hình (nhà ở dân dụng của NVO), nên
chúng đủ để thấy cái gì là bất biến của quy ước NVG và cái gì thay đổi theo quy mô công trình.

## 13.2 Cấu trúc thư mục — **4 thư mục, không phải 9**

Cả hai hồ sơ cùng một hình dạng:

```
Hồ sơ <tên khách>/
├── Ảnh khảo sát hiện trạng/          ảnh + video hiện trạng khu đất
├── Hợp đồng - Báo giá - Phát sinh/   HĐTK, HĐTC, báo giá (PDF + XLSX)
└── Hồ sơ thiết kế thi công/
    ├── Hồ sơ KT-KC-DN/               bản vẽ ba bộ môn (.dwg + .pdf)
    └── Phối cảnh/                    ảnh phối cảnh
```

`06-knowledge-base.md` mục 6.1 giả định **9 thư mục** (`01_Đầu bài–khảo sát` →
`09_Điều chỉnh–hoàn công`) và đặt ra quy tắc "file trong thư mục `08_Hồ sơ phát hành` được ưu
tiên tuyệt đối". **Không thư mục nào trong hai hồ sơ mang tên đó**, và không có thư mục phát
hành riêng. Bước 0 (giải quyết phiên bản) đang dựa vào một cây thư mục không tồn tại.

→ Phân loại thư mục phải là **dữ liệu khớp mẫu trong `kb/`**, không phải danh sách cứng.

## 13.3 Bản đồ theo GIAI ĐOẠN — hồ sơ này là một lát cắt, không phải cả quá trình

Xếp bản vẽ theo bộ môn (KT/KC/DN) là cách hồ sơ được lưu. Nhưng để biết engine đứng ở đâu thì
phải xếp theo **giai đoạn của quá trình làm nhà ở**:

| Giai đoạn | Sản phẩm thường có | Có trong hai hồ sơ? |
|---|---|---|
| Khảo sát hiện trạng | ảnh, video, trích lục, biên bản đo | ✓ ảnh/video (15–86 tấm) · ✗ không có biên bản đo, không có trích lục |
| Đầu bài – hợp đồng thiết kế | phiếu tiếp nhận, HĐTK, báo giá | ✓ HĐTK · **✗ không có phiếu tiếp nhận nào** |
| **Phương án sơ bộ** | **mặt bằng bố trí, phối cảnh trình khách** | ✓ phối cảnh · **✗ KHÔNG có mặt bằng phương án** |
| Thiết kế kỹ thuật thi công | KT + KC + DN đầy đủ | ✓ — đây là 265 tờ, gần như toàn bộ hồ sơ |
| Dự toán – hợp đồng thi công | dự toán, HĐTC | ✓ (hồ sơ B) |
| Thi công – hoàn công | bản vẽ hoàn công, phát sinh | ✗ không có, dù tên thư mục có chữ "Phát sinh" |

**Hai chỗ trống là kết luận quan trọng nhất của mục này.**

**(a) Giai đoạn phương án không để lại bản vẽ.** Đúng chỗ engine định thay thế thì kho không lưu
gì. `06-knowledge-base.md` mục 6.1 nói *"thứ có giá trị nhất không phải bản vẽ, mà là cặp (đầu
bài → mặt bằng kết quả)"* — cặp đó **không tồn tại trong kho**. Cái tồn tại là (không có đầu bài
→ bản vẽ thi công đã hoàn thiện). Bản vẽ thi công đã đi qua nhiều vòng sửa với khách, nên nó
**không phải** đầu ra mà Lớp 3 nhắm tới; nó là đầu ra của cả quy trình.

→ Hệ quả: few-shot cho Lớp 3a lấy được `slicing_tree` từ bản vẽ thi công, nhưng **không** học
được cách đi từ đầu bài tới phương án. Việc tái dựng đầu bài rút gọn (`06-knowledge-base.md` ghi
là `TODO(người)`, ~5–10 phút mỗi công trình) **không phải tuỳ chọn** — không có nó thì kho chỉ
là kho hình học.

**(b) Không có phiếu tiếp nhận nào.** Mốc 2 có một mục là *"di trú dữ liệu phiếu tiếp nhận cũ
sang `design_brief`"* và điều kiện ra *"phiếu tiếp nhận cũ ngừng sử dụng"*. Hai hồ sơ đầy đủ
nhất mà NVG có **không chứa phiếu tiếp nhận**. Điều này khớp với câu trả lời Q-2 (CSDL có 0 dòng
`design_briefs`, không viết script di trú nào) — và nay có thêm bằng chứng từ phía hồ sơ giấy.

## 13.4 Danh mục bản vẽ theo bộ môn

### 13.4.1 KT — kiến trúc (55 tờ hồ sơ A)

Mã tờ `kt/01` … `kt/51`, cộng tờ mục lục `plhs`. Nguồn: trang "phụ lục hồ sơ kiến trúc" và khung
tên từng trang.

| Loại tờ | Số tờ | Ghi chú |
|---|---|---|
| Mặt bằng công năng T1–T5, KTTM, mái | 7 | bố trí công năng, tên phòng |
| Mặt bằng kiến trúc T1–T5, KTTM, mái | 7 | có kích thước, trục, chi tiết cấu tạo |
| Mặt đứng trục A-B, B-A, 1-4, 4-1 | 4 | **cả bốn hướng** |
| Mặt cắt kiến trúc A-A, 4-1 | 2 | |
| Chi tiết thang bộ | 3 | |
| Chi tiết WC 1.1 · 3.1 · 3.2 · 4.1 · 4.2 · 5.1 | 6 | đánh số theo tầng.thứ tự |
| Chi tiết mái kính | 1 | hạng mục riêng của công trình này |
| Mặt bằng lát sàn T1–T5, KTTM | 6 | |
| Ga thoát sàn | 6 | |
| Mặt bằng định vị cửa T1–T5, KTTM | 6 | |
| Chi tiết cửa đi | 9 | |
| Chi tiết cửa sổ | 2 | |
| Bảng thống kê cửa | 1 | |
| Mục lục hồ sơ (`plhs`) | 1 | |

### 13.4.2 KC — kết cấu (73 tờ hồ sơ A / 36 tờ hồ sơ B)

Mã `GC-01…GC-05` (ghi chú chung) + `KC-01…KC-66`. Nguồn: tờ "DANH MỤC BẢN VẼ" trong chính hồ sơ.

| Loại tờ | Ghi chú |
|---|---|
| Ghi chú chung 01–05 | bảng tiêu chuẩn áp dụng, cấp bê tông, lớp bảo vệ cốt thép — xem 13.4.4 |
| Mặt bằng định vị cọc khoan nhồi | hồ sơ A dùng cọc khoan nhồi; hồ sơ B dùng **móng băng + cọc tre** |
| Mặt bằng kết cấu đài móng / móng băng | |
| Mặt bằng định vị cổ móng, cổ cột, giằng chân tường | |
| Chi tiết đài móng ĐC-1…ĐC-5 / chi tiết móng băng | |
| Thống kê thép móng | |
| Mặt bằng định vị + chi tiết bể nước ngầm, bể phốt | thống kê thép bể ngầm |
| Mặt bằng định vị cột từng tầng | |
| Chi tiết thép cột C1 · C2 · C3 + thống kê thép cột | |
| Mặt bằng kết cấu từng tầng | |
| Chi tiết dầm tầng n, chia (01)(02)(03) | tờ đông nhất của bộ KC |
| Mặt bằng thép sàn lớp dưới / lớp trên từng tầng | hồ sơ B tách hai lớp; hồ sơ A gộp một tờ |
| Thống kê thép dầm sàn từng tầng | |
| Mặt bằng thang bộ + mặt cắt thang + chi tiết thép thang | |
| Mặt bằng định vị lanh tô từng tầng + chi tiết lanh tô cửa | |

### 13.4.3 DN — điện nước (44 tờ hồ sơ A / 22 tờ hồ sơ B)

Mã `DN/01`…`DN/20+`, đọc được từ DXF. Cả hai tập PDF đều là **bản quét**, và cả hai tập DN đều
**không có khối khung tên** (13.6 (6)) nên **tên tờ chưa lấy được tự động** — tên nằm trong TEXT
vẽ rời trên lớp khung tên, phải tách vùng tờ trước mới gán đúng được. Đây là ô còn trống, xem
13.13.

Nội dung chữ trong bản vẽ có cấu trúc rõ và có thể phân tách thành từ vựng:

| Ký hiệu | Nghĩa | Ví dụ đọc được |
|---|---|---|
| `cl` / `cn` | cấp lạnh / cấp nóng | `cl/ppr/d50/l=19m` — PPR, Ø50, dài 19 m |
| `tb` / `tr` / `tM` | thoát bệt / thoát rửa / thoát mưa | `tb/pvc/d110/l=15m` |
| `thb` / `thr` | thông hơi bệt / thông hơi rửa | `thb/pvc/d34/l=6m` |
| dây điện | tiết diện + ống + cách đi | `cu/pvc 2(1x4)mm2+e4 - d20 - đi âm tường, trần, sàn` |
| thiết bị đóng cắt | | `mcb-1p-32a-10ka` |
| cao độ ổ cắm | | `a1/+0.4`, `a2/+0.6` |
| thiết bị khác | | `camera trong nhà - wifi` |

→ Đây là **từ vựng chú thích DN có sẵn**, đủ để dựng bảng ký hiệu và ghi chú tự sinh mà không
phải bịa ra quy ước mới.

### 13.4.4 Nội dung "ghi chú chung" của bộ KC — phần lặp lại giữa mọi hồ sơ

Năm tờ `GC-01…GC-05` chứa các bảng giống nhau ở cả hai hồ sơ:

- **Tiêu chuẩn áp dụng**: TCVN 2737-2023 (tải trọng) · TCVN 5574:2018 (BTCT) · TCVN 5575:2024
  (kết cấu thép) · TCVN 5573:2011 (gạch đá) · TCVN 5572:2012 (bản vẽ thi công) ·
  TCVN 9362:2012 (nền nhà) · TCVN 1651:2008 (cốt thép).
- **Cấp bê tông theo cấu kiện**: bê tông lót móng B7.5(M100) · đài cọc và giằng móng B20(M250) ·
  cột, dầm, sàn B20(M250) · thang bộ, bể ngầm, bể phốt B20(M250) · lanh tô B15(M200).
- **Chiều dày lớp bảo vệ**: móng và giằng móng 30 mm · cột, vách 25 mm · dầm, giằng 25 mm ·
  sàn 15 mm (dày ≤150) hoặc 20 mm (dày >150).
- Ghi chú đặc điểm công trình: số tầng, giải pháp kết cấu phần thân, giải pháp nền móng.

Ở hồ sơ B còn ghi rõ một dòng đáng chú ý: *"BÁO CÁO KHẢO SÁT ĐỊA CHẤT — CĐT CHƯA CUNG CẤP"*.

→ Đây là **nội dung lặp lại đúng nghĩa** mà Mốc 6c nói engine nên sinh sẵn cho kỹ sư kiểm. Nó
không chứa quyết định kỹ thuật nào của riêng công trình; nó là bảng tra do kỹ sư soạn một lần.

## 13.5 Khung tên — schema thật, và **hai bộ môn hai mẫu khác nhau**

**Khung tên KT** (đọc từ hồ sơ A):

| Trường | Giá trị mẫu |
|---|---|
| chủ đầu tư | `mr. dương` |
| anh/chị | `anh. dương` |
| tên dự án | `nhà lô liền kề` |
| Địa chỉ | `phường trần lãm - tỉnh hưng yên` |
| tên công trình | `nhà 5 tầng - hiện đại` |
| hạng mục | `KIẾN TRÚC` |
| đơn vị thiết kế | `nhà việt one` (kèm khẩu hiệu, địa chỉ, điện thoại, web, email) |
| giám đốc | `ks. bùi văn thi` |
| chủ nhiệm thiết kế | `kts. nguyễn hoàng nam` |
| chủ trì | `kts. nguyễn minh thành` |
| thiết kế | `kts. đỗ hải linh` |
| kiểm bản vẽ | `kts. nguyễn minh thành` |
| tên bản vẽ | `mặt bằng công năng tầng 1` |
| kí hiệu bản vẽ | `kt/01` |
| tỷ lệ | `1:70` |
| hoàn thành | `08/2026` |

**Khung tên KC** khác: bỏ cặp `tỷ lệ / hoàn thành`, thay bằng **`ngày ht:`**; nhãn tiếng Việt
kèm tiếng Anh (`Chủ đầu tư - client:`, `Tên dự án - project:`); mã tờ dạng `KC-01` thay vì
`kt/01`; và có thêm tờ `DANH MỤC BẢN VẼ` liệt kê toàn bộ, thứ mà bộ KT không có (bộ KT dùng tờ
`plhs` bố cục khác).

**Khổ giấy: A3 toàn bộ** (842 × 1191 pt ở mọi trang của cả 6 tập PDF). Tỷ lệ `1:70` cho mặt
bằng, mặt đứng, mặt cắt; `1:20`–`1:40` cho chi tiết.

→ Ba hệ quả cho bộ xuất DXF: (1) khung tên phải là **BLOCK có ATTRIB**, không phải các đoạn
thẳng rời như `export.py` đang làm; (2) phải có **hai mẫu khung tên** chứ không một; (3) mã tờ
phải theo quy ước từng bộ môn (`kt/NN` viết thường, `KC-NN` viết hoa, `DN/NN`).

## 13.6 Kiểm kê file DXF thật — cả 6 tập

Cả sáu file `.dwg` đã được chuyển sang `.dxf` bằng ODA File Converter và kiểm kê ở mức group
code. Đây là phần bác bỏ nhiều giả định nhất.

| Tập | Lớp khai báo | Block định nghĩa | Thực thể `ENTITIES` | Thực thể **trong BLOCK** | Tỉ lệ trong block |
|---|---|---|---|---|---|
| A · KT | 97 | 4.789 | 6.073 | **82.435** | **93%** |
| A · KC | 15 | 2.248 | 15.208 | 30.913 | 67% |
| A · DN | 120 | 1.169 | 7.783 | 38.933 | 83% |
| B · KT | 94 | 1.749 | 4.442 | **36.473** | **89%** |
| B · KC | 13 | 1.170 | 9.216 | 15.072 | 62% |
| B · DN | 115 | 913 | 4.702 | 34.774 | 88% |
| **Cộng** | | **12.038** | **47.424** | **238.600** | **83%** |

### (1) 83% hình học nằm TRONG BLOCK — trình trích xuất không đi vào đó

`compute/src/design_compute/cad/extract.py` duyệt **duy nhất `doc.modelspace()`**, không gọi
`virtual_entities()`, nên nó nhìn thấy khoảng **một phần sáu** bản vẽ. Ở hai tập kiến trúc — tập
quan trọng nhất — con số còn tệ hơn mức trung bình: **93% và 89%** nằm trong block.

Đây là chỗ hỏng nặng nhất, và nó hỏng **im lặng**: không lỗi, không cảnh báo, chỉ ra ít dữ liệu.

### (2) Không tập nào có lớp ranh phòng — kể cả hai tập KIẾN TRÚC

Đây là kết luận phải kiểm bằng chính bản vẽ kiến trúc chứ không được suy từ bản vẽ điện nước, và
đã kiểm: **không lớp nào trong 97 lớp của A·KT hay 94 lớp của B·KT khớp** `*ROOM*BOUND*`,
`A-AREA*`, `*PHONG*RANH*` hay `KT-PHONG*`.

Lý do sâu hơn một chuyện đặt tên: **NVG đặt tên lớp theo CÁCH NÉT IN RA, không theo VẬT THỂ**.
Lớp có thực thể ở tập A·KT:

```
NV-GhiChu 1787 · NV-Dim 1760 · NV-Thay 519 · !KHUNGTEN 292 · 0 240 · NV-ThietBi 207
NV-Truc 157 · NV-Khuat 138 · NV-Tuong 136 · NV-Hatch 132 · NV-Manh 108 · NV-MoDam 98
NV-BeTong 70 · NV-Cat 60 · NV-NoiThat 55 · NV-HatchNoiThat 53 · NV-MoNhat 43 · NV-Cua 24
```

`Thay` (thấy) · `Khuat` (khuất) · `Manh` (mảnh) · `MoDam` / `MoNhat` (mờ đậm / mờ nhạt) · `Cat`
(cắt) — đó là **độ đậm nét khi in**, không phải loại đối tượng. `NV-Tuong` có tồn tại nhưng chỉ
giữ 136 thực thể; phần lớn tường vẫn nằm trên các lớp độ đậm.

→ Mô hình "một lớp = một vai trò ngữ nghĩa" của `kb/layer_mapping.yaml` **không khớp cách NVG
vẽ**. Đa giác phòng phải dựng từ **đồ thị tim tường** (`shapely.polygonize`) — đúng như
`06-knowledge-base.md` đã kê, chính mã nguồn mới là chỗ đi lệch.

### (3) Ba bộ môn, ba quy ước lớp khác hẳn nhau — và bộ KC khác hẳn hai bộ kia

| Bộ môn | Số lớp | Kiểu đặt tên |
|---|---|---|
| KT | 94–97 | `NV-*` (Thay, Khuat, Manh, Tuong, Cua, Dim, Truc, GhiChu…) trộn với `!*` (`!DIM`, `!TUONG`, `!GHICHU`, `!TRUC`, `!MO.1/2/3`) |
| KC | **13–15** | `A1_ THÉP` · `A2_CẮT BT` · `A3_CẮT TƯỜNG` · `A4_NỘI THẤT` · `A5_CHI TIẾT` · `A6_THẤY ĐẬM` · `A7_THẤY MẢNH` · `A8_NÉT KHUẤT` · `A9_TRỤC` · `A10_TEXT` · `A11_NÉT HATCH` |
| DN | 115–120 | `NV-*` · `NV - *` · `NV_*` · `!*` · `MT *` · `HH *` · `QM *` · `DCE_*` · `AI-*` · `TDT-*` · `KCS_*` |

Bộ **KC dùng đúng 13–15 lớp, đánh số `A1_`…`A11_`, có dấu tiếng Việt đầy đủ** — gọn và nhất
quán hơn hẳn. Bộ KT và DN thì tích tụ 94–120 lớp qua nhiều nguồn, gồm cả lớp mang theo từ block
tải về (`TAILIEUKIENTRUC.NET-…`, `DWGshare.com_3`) và **lớp tiếng Trung** (`B-标注` = ghi kích
thước, `L-立面家具` = nội thất mặt đứng).

→ Không có "quy ước NVG" số ít. Bảng ánh xạ phải **chuẩn hoá tiền tố rồi bỏ dấu** trước khi so
khớp, thay cho danh sách glob phẳng. `fnmatch` hiện tại không bỏ dấu nên `*TUONG*` không bao giờ
khớp `A3_CẮT TƯỜNG`.

### (4) Lớp `0` là lớp lớn nhất — và nó đang nằm trong danh sách bỏ qua

`0` giữ 3.028 thực thể ở `ENTITIES` và 8.869 trong block của riêng B·KC; 17.215 trong block của
A·KT; 5.045 ở `ENTITIES` của A·KC. `kb/layer_mapping.yaml` khai `'0'` trong `ignore`, nên khối
lượng đó biến mất **và còn không lọt vào `layers_unmapped`** để ai đó nhận ra.

Bốn mục khác trong `ignore` cũng đang gây hại: `'*DIM*'` bỏ mất `NV-Dim` (**nguồn kích thước chủ
ý tốt nhất**), `'*TRUC*'` bỏ mất `NV-Truc` (**lưới trục mà chính tài liệu xếp P1-cao**),
`'*KHUNG*TEN*'` bỏ mất khung tên (**chìa khoá tách tờ**), `'*HATCH*'` bỏ mất tín hiệu tô nền
phòng duy nhất.

### (5) Kích thước CÓ SẴN trong bản vẽ — hơn 10.000 thực thể DIMENSION

`DIMENSION` là **loại thực thể nhiều nhất ở `ENTITIES`** của cả hai tập kiến trúc: A·KT 1.723 +
2.333 trong block; B·KT 1.268. Cộng cả sáu tập vượt 10.000.

Đây vừa là tin xấu vừa là tin tốt. Xấu: hệ thống hiện **không có một thực thể DIMENSION nào**
trong toàn bộ kho mã, nên bản vẽ xuất ra thiếu đúng thứ chiếm tỉ trọng lớn nhất của bản vẽ thật.
Tốt: kích thước **chủ ý** của người vẽ đọc được trực tiếp — đó là ground truth tốt hơn việc đo
lại hình học, và là tín hiệu đánh giá tự nhiên (kích thước engine đặt ra so với kích thước NVG đặt).

### (6) Khung tên là BLOCK có ATTRIB — nhưng chỉ ở 3 trên 5 tập

| Tập | Khối khung tên | Số lần chèn | Số tờ |
|---|---|---|---|
| A · KT | `KHUNGTEN-NHAVIETONE` | 52 | 55 |
| A · KC | `KHUNG TÊN NV 2026` | 72 | 73 |
| B · KC | `KHUNG TÊN NV 2026` | 37 | 36 |
| B · KT | *không có khối riêng* — khung tên vẽ trên lớp `Khung ten` (172 thực thể) | — | 35 |
| B · DN | *không có khối riêng* | — | 22 |

→ Tách tờ bằng khung tên **chạy được nhưng không phải luôn luôn**. Phải có đường lùi (gom cụm
hình bao thực thể) và phải **báo ra tập nào đi đường nào**, không im lặng.

Nội dung ATTRIB đọc được, sạch và dùng được ngay:

- **Mã và tên tờ**, một cặp mỗi tờ: `KC-01` ↔ `MẶT BẰNG KẾT CẤU MÓNG BĂNG`, `KC-07` ↔
  `MẶT BẰNG ĐỊNH VỊ BỂ PHỐT`, … — **đây chính là danh mục tờ**, lấy được không cần một phép tính
  hình học nào.
- **Tỷ lệ từng tờ**: `1:70`, `1/50`, `1:20`, `1/20`, `1:40`, `1/55`, `1/35`, `1/100`, `1/10`,
  `1/30`. Hai lối viết (`1:70` và `1/50`) cùng tồn tại trong một tập.
- **Cao độ tầng**: `+0.000`, `+3.900`, `+7.500`, `+11.100`, `+14.700` → **chiều cao tầng 3,6 m**.
  Mã nguồn đang mặc định cứng **3,4 m** trong `stubArchModel` vì `FloorPlan` không phát ra
  `height_m`. Nay có số thật.
- **Bảng thống kê cửa**: `1200x1200` ↔ `CỬA SỔ KHUNG SẮT - PA-NÔ KÍNH - 2 CÁNH`, ký hiệu `S`,
  `S1`. Đủ để mồi bộ mã cấu kiện bằng **mã thật của NVG**, không phải mã bịa.
- **Nhãn bong bóng trục**: `1 2 3 4 5 1* A B C a b` — khối `KI HIEU TRUC` chèn 299 lần (A·KT),
  214 (B·DN), 82 (B·KT); khối `TRUC DINH VI` 107 lần (A·KC), 82 (B·KC).
- Độ dốc mái `i=1.5%`, bộ môn `KIẾN TRÚC`, tiền tố `KT`, ngày `07/2026` và `08/2026`.

Trình trích xuất **không đọc ATTRIB/ATTDEF**, nên toàn bộ phần này hiện bị bỏ.

### (7) Không tập nào có layout khổ giấy thật

Trường layout chỉ chứa tên cấu hình máy in (`none_device`, `PDF reDirect v2`, `pdfFactory Pro`,
`DWG To PDF.pc3`). Mọi tờ nằm **cạnh nhau trong cùng một modelspace**. Giả định "một DXF = một
mặt bằng một tầng" của `DigitiseSource.level` là sai: **một DXF = trọn hồ sơ một bộ môn**, 22–73
tờ.

### (8) Hai bảng mã chữ trong cùng một file, thậm chí trong cùng một loại thực thể

`$DWGCODEPAGE = ANSI_1252`, nhưng thực tế:

- TEXT ở modelspace là **TCVN3 8-bit**: `cÊp l¹nh` = "cấp lạnh", `®i ©m t­êng` = "đi âm tường".
- Phần lớn ATTRIB là **Unicode UTF-8**: `CỬA SỔ KHUNG SẮT - PA-NÔ KÍNH - 2 CÁNH`.
- Nhưng **có ATTRIB vẫn là TCVN3**: `KIÕN TRóC` = "KIẾN TRÚC", ngay trong cùng một file với
  chuỗi Unicode ở trên.
- Tên **lớp** cũng lẫn: `A3_CẮT TƯỜNG` (Unicode) cạnh `NV_THáº¤Y` (byte UTF-8 đọc nhầm cp1252).

→ Việc sửa bảng mã phải làm **theo từng chuỗi**, dựa trên nội dung, không theo file và không theo
loại thực thể. Giải mã mù quáng sẽ **làm hỏng** chuỗi vốn đã đúng — đã gặp thật khi dựng bảng ở
13.14: `MÓNG` bị biến thành `MỂNG`.

### (9) File mang lẫn dữ liệu của công trình khác — không có gì báo

Tập **B·DN** (`2026.03.19 Mr Manh (DienNuoc).dwg`) chứa, bên cạnh 22 tờ của chính nó
(`1/60` × 22, `04/03/2026` × 22, mã `DN/01`…`DN/20`), cả những thứ **không thuộc công trình
này**: `08/2026` × 7, `kt/12` × 6, `KT/01` × 91, `1:70` × 8 — tức là khung tên và tờ kiến trúc
mang ngày tháng của một công trình khác. Bảng thống kê cửa `1200x1200` /
`CỬA SỔ KHUNG SẮT - PA-NÔ KÍNH - 2 CÁNH` xuất hiện **đúng 69 lần ở cả B·DN lẫn A·DN** — cùng một
nguồn sao chép.

Đây là cách làm bình thường của nghề: mở hồ sơ cũ ra làm nền cho hồ sơ mới. Nhưng với việc số
hoá thì nó là cái bẫy: **trích xuất ngây thơ sẽ gán bảng cửa của công trình này cho công trình
kia**, và bản ghi KB sẽ sai mà không lỗi nào nổ ra.

→ Bước tách tờ phải **lọc theo vùng của từng tờ** rồi mới đọc ATTRIB, thay vì gom mọi ATTRIB
trong file. Và bước kiểm tra chéo phải có thêm một phép: *mọi tờ trong một file có cùng ngày và
cùng mã công trình không?* — lệch thì hạ `quality_score` và đưa vào hàng chờ người xác nhận.

## 13.7 PDF không dùng được làm nguồn

**3 trong 6 tập PDF là bản quét thuần ảnh**, không chứa một ký tự nào (0 phông chữ nhúng, ảnh
CCITT stencil):

| Tập | Trang | Có text? | Phông |
|---|---|---|---|
| A · KT | 55 | ✓ | pdfFactory Pro, **phông TCVN3** |
| A · KC | 73 | ✓ | AutoCAD 2022 pdfplot, **phông TCVN3** |
| A · DN | 44 | **✗ bản quét** | — |
| B · KT | 35 | **✗ bản quét** | — |
| B · KC | 38 | ✓ | AutoCAD 2025 pdfplot, **phông TCVN3** |
| B · DN | 22 | **✗ bản quét** | — |

Hợp đồng thiết kế cũng là bản quét (10 trang, 0 ký tự). Bản `.doc` của hợp đồng thi công hồ sơ B
thì đọc được (UTF-16 trong OLE).

→ **`.dwg` là nguồn vector đáng tin duy nhất.** PDF chỉ dùng để đối chiếu bằng mắt, không bao
giờ làm nguồn trích xuất. Điều này khớp với `06-knowledge-base.md` (*"đọc vector, không dùng
vision"*) nhưng mạnh hơn: kể cả 3 tập PDF có text cũng phải giải mã phông TCVN3 ở mức byte mới
đọc được.

Sáu file `.dwg` nằm ở **ba phiên bản định dạng**: `AC1018` (AutoCAD 2004) · `AC1021` (2007) ·
`AC1032` (2018). ODA File Converter đọc được cả ba — nhưng đây là thứ trình chuyển đổi phải
**chịu được**, không phải thứ được giả định là đồng nhất.

## 13.8 Quy ước đặt tên file — tài liệu ghi sai

Bộ tài liệu khẳng định quy ước `NVO026_NhaAnhA_KT_MatBang_V03_11082026` ở **bốn chỗ**:
`03-data-contracts.md` 3.8b · `05-tech-stack.md` 5.5 · `12-ux-ui.md` 12.8 · `11-design-flow.md`
11.6. Thực tế sáu file `.dwg`:

```
2026.08.25   NVO_ KT_ MR DUONG_ THANH PHO_ TB.dwg
2026.08.25   NVO_ KC_ MR DUONG_ THANH PHO_ TB.dwg
2026.08.25   NVO_ DN_ MR DUONG_ THANH PHO_ TB.dwg
2026.03.018   NVO_ KT_ MR MANH_ KIEN XUONG_ TB.dwg     ← "018" thay vì "18"
2026.03.18 - KC A Mạnh.dwg                              ← mẫu khác hẳn
2026.03.19 Mr Manh (DienNuoc).dwg                       ← mẫu khác nữa
```

Khác biệt so với tài liệu: **không có số phiên bản** · ngày đứng **trước** chứ không sau · mã dự
án không xuất hiện · và **không nhất quán ngay trong cùng một hồ sơ** — ba file của hồ sơ B theo
ba mẫu khác nhau, một file còn gõ nhầm `03.018`.

→ **Tên file không dùng được để giải quyết phiên bản.** Thứ tự đúng: băm nội dung để gộp trùng →
ngày ở đầu tên file nếu có → ngày trong ATTRIB khung tên → xếp hàng chờ người xác nhận. Không
đoán.

→ Quy ước `NVO026_...` nên được coi là **quy ước MỚI cho bản vẽ hệ thống xuất ra**, không phải
mô tả hiện trạng. Đây là câu trả lời có bằng chứng cho **Q-7**.

## 13.9 Bảng phủ: mỗi loại tờ thuộc Mốc nào

Ba mức: **CÓ CHỦ** = một Mốc thật sự bao loại tờ đó · **CHỈ TÊN** = Mốc có nhắc nhưng chỉ một
dòng, và các điều kiện cần thì chưa ai làm · **TRỐNG** = không Mốc nào trong cả kế hoạch nhắc tới.

### KT — 14 loại

| Loại tờ | Mốc | Mức |
|---|---|---|
| Mặt bằng công năng | Mốc 5 (`11-design-flow.md` 11.4b) | **CÓ CHỦ** — gần xong nhất |
| Mặt bằng kiến trúc | Mốc 5 (hình học) | CHỈ TÊN — bộ xuất DXF thiếu cả bảy yếu tố của `12-ux-ui.md` 12.8 |
| Mặt đứng | Mốc 6 | CHỈ TÊN — `arch_model.facades[]` là stub trả mảng rỗng |
| Mặt cắt | Mốc 6 | CHỈ TÊN — chặn ở chiều cao tầng, thứ `FloorPlan` không bao giờ phát ra |
| Chi tiết thang bộ | Mốc 6b | CHỈ TÊN — không hợp đồng nào có thực thể thang; `cores[]` chỉ là đa giác |
| Chi tiết WC | Mốc 6b | CHỈ TÊN — cần thiết bị vệ sinh; không có khái niệm thiết bị ở đâu cả |
| Chi tiết mái kính | — | **TRỐNG** — hạng mục riêng từng công trình, để người vẽ là đúng |
| Mặt bằng lát sàn | — | **TRỐNG** — mà lại rẻ: module gạch + điểm bắt đầu + kiểu lát, trên đa giác phòng đã có |
| Ga thoát sàn | — | **TRỐNG** |
| Mặt bằng định vị cửa | — | **TRỐNG** — gần như miễn phí: `openings[].offset_m` đã có, tờ này thuần ghi kích thước |
| Chi tiết cửa đi · cửa sổ | Mốc 6b nói chung | **TRỐNG trên thực tế** — 11 tờ, món tự sinh lớn nhất của KT, không chỗ nào gọi tên |
| Bảng thống kê cửa | Mốc 5 | CHỈ TÊN — hợp đồng `schedules.schema.json` có, **không gì sinh ra nó**, và `openings` chưa có mã loại để gom nhóm |
| Mục lục bản vẽ | — | **TRỐNG** — vặt, nhưng cần có sổ đăng ký tờ trước |

### KC — 15 loại

| Loại tờ | Mốc | Mức |
|---|---|---|
| Ghi chú chung GC-01…05 | Mốc 6c | **CÓ CHỦ** — thuần bảng tra, xem 13.4.4 |
| MB định vị cổ móng / cổ cột | Mốc 6c | CÓ CHỦ — suy từ `structural_grid` |
| Giằng chân tường | Mốc 6c | CÓ CHỦ — chạy theo tuyến tường |
| MB định vị cột từng tầng | Mốc 6c | CÓ CHỦ |
| MB kết cấu từng tầng | Mốc 6c | CÓ CHỦ (chỉ phần tuyến dầm làm nền) |
| MB thang bộ | Mốc 6c | CÓ CHỦ (mặt bằng) |
| **MB định vị lanh tô + chi tiết lanh tô** | — | **TRỐNG** — suy được 100% từ `openings[]`; món tự sinh mạnh nhất của KC, không chỗ nào gọi tên |
| MB định vị cọc khoan nhồi | Mốc 6c | CHỈ TÊN — bố trí cọc là việc kỹ sư |
| KC đài móng / móng băng · chi tiết móng | Mốc 6c | CHỈ TÊN |
| MB + chi tiết bể phốt, bể ngầm | Mốc 6c | CHỈ TÊN — vị trí là kiến trúc, thiết kế là kỹ sư |
| Chi tiết thép cột + thống kê thép cột | ranh giới #9 | **NGƯỜI — loại trừ đúng** |
| Chi tiết dầm (01)(02)(03) | ranh giới #9 | **NGƯỜI** |
| MB thép sàn lớp dưới / lớp trên | ranh giới #9 | **NGƯỜI** |
| Thống kê thép dầm sàn / móng / bể / thang | ranh giới #9 | **NGƯỜI** |
| Chi tiết thép thang bộ | ranh giới #9 | **NGƯỜI** |

### DN — 4 nhóm

| Nhóm tờ | Mốc | Mức |
|---|---|---|
| MB điện từng tầng (chiếu sáng, ổ cắm, điều hoà, camera, mạng) | Mốc 6c (nền + hộp kỹ thuật) | nền CÓ CHỦ, nội dung NGƯỜI |
| MB cấp nước / thoát nước / thoát mưa / thông hơi | Mốc 6c | nền CÓ CHỦ, nội dung NGƯỜI |
| Sơ đồ nguyên lý điện (tủ, MCB) | ranh giới #9 | **NGƯỜI** |
| Ghi chú, bảng ký hiệu, thống kê vật tư DN | Mốc 6c | CÓ CHỦ — thuần bảng tra, từ vựng đã có ở 13.4.3 |

### Thứ xuyên suốt mà không Mốc nào sở hữu

| Hạng mục | Vì sao nghiêm trọng |
|---|---|
| **Khung tờ · khổ giấy · khung tên dạng BLOCK có ATTRIB** | Điều kiện cần của **cả 33 loại tờ ở trên**. `12-ux-ui.md` 12.8 có nhắc "khổ A3" nhưng không Mốc nào dựng không gian giấy |
| **Bộ chú thích**: chuỗi kích thước hai lớp · bong bóng trục · cung quay cửa · nét đôi cửa sổ · bậc thang + mũi tên · hatch · mũi tên hướng bắc · ký hiệu mặt cắt | `12-ux-ui.md` 12.8 đặc tả đủ **tám yếu tố bắt buộc** — nhưng chỉ cho màn hình. Bộ xuất DXF hiện **không có yếu tố nào**: cửa là một đoạn thẳng, thang là một phòng, và trong toàn kho mã **không tồn tại một thực thể DIMENSION nào** |
| Ảnh khảo sát hiện trạng (15–86 tấm mỗi hồ sơ) | Chỉ có `/design/site/extract-boundary` cho ảnh trích lục; ảnh hiện trạng chưa có đường vào |
| Dự toán XLSX (đơn giá, DANH MỤC VẬT TƯ, DMCV) | Xếp ở Mốc 9 cùng QTO — quá muộn. Phần **danh mục** thì rẻ và cần ngay để dựng bộ mã cấu kiện |
| Tổng mặt bằng | **Không hồ sơ nào có**, dù `06-knowledge-base.md` xếp P0 bắt buộc. Câu hỏi cho Haan |

**Đếm lại:** ~45 trên 172 tờ của hồ sơ A rơi vào ô TRỐNG, **cộng với bộ máy mà 127 tờ còn lại
đều phụ thuộc**.

## 13.10 Chỗ mã nguồn đang nhầm

Khác với thiếu sót. Đây là những chỗ mã **chạy không lỗi** nhưng dựa trên giả định mà hồ sơ thật
bác bỏ — nên chúng hỏng im lặng, chỉ biểu hiện thành "ra ít dữ liệu quá".

| # | Nhầm ở đâu | Bằng chứng | Hậu quả |
|---|---|---|---|
| N-1 | `cad/extract.py` `_collect()` duyệt duy nhất `doc.modelspace()`, không `virtual_entities()` | 13.6 (1) — 83% thực thể nằm trong block, riêng hai tập KT là 93% và 89% | Nhìn thấy ~1/6 bản vẽ |
| N-2 | Phòng = LWPOLYLINE khép kín trên lớp `room_boundary` | 13.6 (2) — **đã kiểm trên cả hai tập KIẾN TRÚC**: không lớp nào trong 97 + 94 lớp khớp | `rooms == ()`, cảnh báo `no_rooms`, `quality_score` trượt `rooms_present` → cả bộ hồ sơ bị coi là không dùng được |
| N-3 | `DigitiseSource.level` bắt buộc — một file = một tầng | 13.6 (7) — một DXF = 22–73 tờ xếp cạnh nhau, không layout giấy | Mọi phòng của mọi tầng gộp làm một; `check_across_levels` cho kết quả vô nghĩa |
| N-4 | Không đọc `ATTRIB` / `ATTDEF` | 13.6 (6) — mã tờ, tên tờ, tỷ lệ, cao độ tầng, bảng cửa, nhãn trục đều nằm trong ATTRIB | Mất toàn bộ dữ liệu rẻ nhất và sạch nhất trong file |
| N-5 | Không sửa bảng mã chữ | 13.6 (8) — TCVN3 và Unicode lẫn nhau trong cùng file, cùng loại thực thể | Nhãn phòng thành chữ rác **trước khi** tới bước chuẩn hoá nhãn; mô hình ngôn ngữ nhận rác và trả rác |
| N-6 | `'0'` nằm trong `ignore` | 13.6 (4) — `0` là lớp lớn nhất ở hầu hết các tập | Khối lượng lớn nhất biến mất, **và không lọt vào `layers_unmapped`** nên không ai biết |
| N-7 | `'*DIM*'`, `'*TRUC*'`, `'*KHUNG*TEN*'`, `'*HATCH*'` nằm trong `ignore` | 13.6 (4)(5)(6) | Bỏ đúng bốn thứ giá trị nhất: kích thước chủ ý, lưới trục (tài liệu xếp P1-cao), khung tên (chìa khoá tách tờ), tô nền phòng |
| N-8 | `fnmatch` so khớp không bỏ dấu tiếng Việt | 13.6 (3) — `A3_CẮT TƯỜNG`, `A8_NÉT KHUẤT`, `NV_THẤY` | `*TUONG*` không bao giờ khớp `CẮT TƯỜNG` |
| N-9 | `kb/layer_mapping.yaml` `roles:` dựng theo chuẩn AIA (`A-AREA*`, `A-ROOM*`, `S-COL*`, `C-PROP*`) | 13.6 (2)(3) | **Không mẫu nào khớp một lớp thật nào** trong 6 tập |
| N-10 | `stubArchModel` mặc định cứng chiều cao tầng **3,4 m** vì `FloorPlan` không phát `height_m` | 13.6 (6) — ATTRIB cao độ cho **3,6 m** | Mọi mặt cắt và mặt đứng sinh ra sẽ sai chiều cao ngay từ tờ đầu tiên |
| N-11 | `DESIGN_PIPELINE` khai trong `workers/wrangler.jsonc`, xuất từ `index.ts`, nhưng **không nằm trong `DesignEnv`** và **không route nào khởi động** | đọc mã | Lớp 3a→5 không chạy được từ API; `/design/floor-plan/:id/dxf` luôn 409; điều kiện ra của Mốc 5 **không đo được** |
| ~~N-12~~ | ~~`cad/convert.py` gọi ODA với bộ lọc `"*.DWG"` chữ HOA trong khi tệp NVG là `.dwg` chữ thường~~ | **ĐÃ BÁC 06/09/2026 bằng thí nghiệm trực tiếp** | Bộ lọc của ODA File Converter **không phân biệt hoa thường**: `.dwg` chữ thường qua bộ lọc `*.DWG` chuyển đúng, kể cả tên tệp có dấu tiếng Việt và khoảng trắng (`2026.03.18 - KC A Mạnh.dwg`). Lần chuyển đổi hỏng ở phiên trước có nguyên nhân KHÁC, chưa xác định — nhiều khả năng do cách gọi ở vỏ lệnh, không phải do mã nguồn. `convert.py` **không cần sửa**. Ghi lại vì đây là bài học về việc kết luận từ một lần thử: lần thử đó đổi HAI thứ cùng lúc (đổi tên tệp **và** đổi cách gọi), rồi quy công cho thứ dễ thấy hơn |

> **Điểm chung của N-1 → N-11:** không cái nào ném lỗi. Chúng làm trình trích xuất trả về ít dữ
> liệu hơn thực tế, và cách duy nhất phát hiện là **đối chiếu với bản vẽ thật** — thứ vừa mới có.

## 13.11 Chỗ tài liệu đang sai

| # | Chỗ | Sai gì | Sửa thành |
|---|---|---|---|
| 1 | `06-knowledge-base.md` 6.1 | Cây 9 thư mục `01_…` → `09_…` | 4 thư mục (13.2). Phân loại bằng khớp mẫu trong `kb/`, không liệt kê cứng |
| 2 | `06-knowledge-base.md` 6.1 Bước 0 + 3 chỗ khác | Quy ước tên file `NVO026_…V03_…` | 13.8. Giải quyết phiên bản bằng băm nội dung → ngày đầu tên → ATTRIB → người xác nhận |
| 3 | `06-knowledge-base.md` 6.1 bảng | Ngầm hiểu một bản vẽ = một tầng | Một DXF = trọn một bộ môn. Chèn **Bước 0.5 — tách tờ** trước mọi extractor |
| 4 | `06-knowledge-base.md` 6.1 ưu tiên | Đa giác phòng là P0 | Xếp lại: danh mục tờ · lưới trục · bộ mã cấu kiện = P0; đa giác phòng = P1 |
| 5 | `06-knowledge-base.md` 6.1 | "Vision chỉ dùng cho bản quét từ giấy" | Vẫn đúng, nhưng nay nặng ký: 3/6 tập PDF là bản quét. Thêm: **PDF không bao giờ là nguồn chính** |
| 6 | `06-knowledge-base.md` 6.2 | Đơn vị bản ghi KB là một công trình | Với 93–172 tờ mỗi hồ sơ, đơn vị dùng được là **tờ**. Thêm một lớp tờ vào lược đồ |
| 7 | `06-knowledge-base.md` 6.1 | Tổng mặt bằng "P0 bắt buộc" | Không hồ sơ nào có. Hỏi Haan — có thể chỉ áp dụng cho biệt thự |
| 8 | `06-knowledge-base.md` 6.1 bảng | Không có dòng **hợp đồng**; DN xếp P2 | Thêm hợp đồng. DN là bộ vector sẵn có nhất, và từ vựng chú thích của nó dùng được ngay |
| 9 | `08-milestones.md` Mốc 0.1 điều kiện ra | "4/5 file trích được đa giác ranh phòng" | Xem 13.12 — đổi sang bốn phần đo được |
| 10 | `08-milestones.md` 8.1 | `extraction_success_rate` không có ngưỡng | Đặt ngưỡng theo từng loại dữ liệu, không một con số chung |
| 11 | `08-milestones.md` Mốc 5 | "Bảng thống kê tự sinh" | Hợp đồng có, **không gì sinh ra**; `openings` thiếu mã loại để gom nhóm |
| 12 | `08-milestones.md` Mốc 6 + D25 | Engine sở hữu bộ dựng ảnh | NVG **đã dùng công cụ AI dựng ảnh trong sản xuất** (13.13 câu 1). Đổi vai engine sang *cấp liệu* cho nó |
| 13 | `12-ux-ui.md` 12.8 bảng lớp DXF | Lệch với `kb/layer_mapping.yaml` `export:` — `KT-CUA` vs `KT-CUA-DI`, `KT-CUASO` vs `KT-CUA-SO`; và `KT-THANG` · `KT-KICHTHUOC` · `KT-GHICHU` · `KT-NOITHAT` · `KT-CANHQUAN` không có ở cả hai nơi | Chốt một bảng. Cân nhắc **dùng thẳng quy ước `NV-*` của NVG** |
| 14 | `12-ux-ui.md` 12.8 | Tám yếu tố bắt buộc chỉ đặt cho màn hình | Nói rõ bộ xuất DXF phải thoả cùng danh sách — chính 12.8 đã viết "một định nghĩa hình học duy nhất cho cả hai chế độ" |
| 15 | `01-overview.md` 1.1 | "xuất tệp DXF" không nói rõ mức | DXF hiện tại là sơ đồ, không phải bản vẽ kỹ thuật. Hoặc cam kết theo 12.8, hoặc nói thẳng là sơ đồ |
| 16 | `03-data-contracts.md` 3.4 | `FloorPlan` không phát chiều cao tầng, không có thang, sàn, hoàn thiện, mã loại cấu kiện | Thêm mô hình đứng và bộ mã cấu kiện |
| 17 | `README.md` bảng ánh xạ dòng cuối | Thái Bình → `rules/locality/thai-binh/` | Đã lỗi thời từ 29/08 (Q-8): `rules/locality/` rỗng có chủ đích |

## 13.12 Hướng đi tiếp — đề xuất, chờ Haan chốt

### Điều đầu tiên phải nói: mục tiêu phát biểu thế nào cho đúng

"Thiết kế được toàn bộ các loại bản vẽ" va vào **nguyên tắc bất biến #9** (`01-overview.md` 1.4:
engine không tính tiết diện, không tính tải trọng, không kết luận PCCC) ở khoảng **40 trên 73
tờ** của bộ KC hồ sơ A.

Nhưng ranh giới #9 nói về việc **quyết định con số**, không phải việc **đặt nét lên tờ giấy**.
Chính Mốc 6c đã viết: *"Engine sinh sẵn nội dung lặp lại cho KC và DN … để kỹ sư kiểm tra và
duyệt, không tự phát hành."* Cách phát biểu đứng được:

> **KT** — engine sinh **hoàn chỉnh mọi loại tờ**, kiến trúc sư duyệt và ký.
> **KC và DN** — engine sinh **phôi tờ**: khung tên, nền hình học, lưới trục, cao độ, ghi chú
> chung, chi tiết điển hình lấy từ bảng do kỹ sư soạn, bảng thống kê rỗng đúng mẫu. Kỹ sư có
> chứng chỉ điền nội dung chuyên môn, **quyết định mọi con số**, và ký.

Con số nói được với NVG, tính trên hồ sơ A: KT **13/14 loại tờ** engine sinh trọn (chỉ chi tiết
mái kính để người vẽ) · KC **~33/73 tờ** có phôi dùng được · DN **cả 44 tờ** có nền kiến trúc +
khung tên + bảng ký hiệu. Tức là **không tờ nào trong hồ sơ phải bắt đầu từ màn hình trắng** —
đó là điều đúng và mạnh, khác hẳn với "AI thiết kế toàn bộ hồ sơ".

**Cưỡng chế bằng mã, không bằng tài liệu.** Hai chốt rẻ: (1) tờ phôi mang nhãn do mã chèn
*"Phôi do hệ thống dựng — chưa có chữ ký kỹ sư"*, đúng chỗ `export.py` đang chèn `STAGE_NOTICE`;
(2) mỗi mục trong thư viện chi tiết điển hình mang `authored_by` + số chứng chỉ hành nghề, thiếu
thì không đặt lên tờ KC được.

### Vấn đề thứ tự: kế hoạch đang xếp theo LỚP, mục tiêu lại xếp theo TỜ

Kế hoạch hiện tại đi 3 → 4 → 5 → hồ sơ kỹ thuật → liên bộ môn, tức là xếp theo **lớp của
pipeline**. Mục tiêu mới xếp theo **loại tờ**. Hai cách xếp cho ra hai thứ tự khác nhau, và
chỗ lệch nặng nhất là: **bộ máy mà mọi tờ đều cần** — kích thước, bong bóng trục, không gian
giấy, thư viện ký hiệu — rơi xuống tận Mốc 6b, tức là **sau** mặt đứng và ảnh phối cảnh. Ngược:
6b là điều kiện cần của 6, không phải phần nối tiếp.

Ưu tiên Haan chốt gỡ đúng chỗ lệch này, và gỡ thêm một chỗ nữa: **phối cảnh không còn là việc
khó**. Bản gốc xếp nó cuối vì giả định engine phải tự dựng ảnh; thực tế NVG đã có công cụ AI
đang chạy, nên engine chỉ cần cấp liệu. Việc đó nhỏ, không cần bộ chú thích, và làm được ngay
sau khi có mô hình đứng — nên nó lên sớm chứ không xuống muộn.

### Thứ tự đề xuất — theo ưu tiên Haan chốt 05/09/2026

Haan chốt ba điều: **phần cơ bản trước** (đầu bài, khảo sát hiện trạng) · **bản vẽ dễ trước**
(sketch, phối cảnh, 2D) · **điện nước sau cùng nhưng chắc chắn làm**. Thứ tự dưới đây suy ra
từ đó, cộng với các ràng buộc kỹ thuật đo được ở mục 13.6.

**Bước 0 — Gỡ kẹt (vài ngày, làm trước tiên).** `DESIGN_PIPELINE` đã khai trong
`workers/wrangler.jsonc` và đã xuất từ `index.ts`, nhưng **không nằm trong `DesignEnv`** và
**không route nào khởi động nó**. Lớp 3a→5 hiện không chạy được từ API, nên
`/design/floor-plan/:id/dxf` luôn trả 409 và **điều kiện ra của Mốc 5 không đo được**. Không
đánh giá được gì phía sau chừng nào chưa gỡ. Vướng mắc V-10.

#### Nhóm 1 — Phần cơ bản: đầu bài và khảo sát hiện trạng

Đây là đầu vào của mọi thứ phía sau. Sai ở đây thì mọi bản vẽ sinh ra đều lệch theo mà không
có gì báo.

- **Đầu bài (Lớp 1) — đã xong**, kể cả đọc ảnh trích lục và vẽ thửa đất không vuông vắn.
- **Khảo sát hiện trạng — còn trống.** Hồ sơ thật có 15–86 tấm ảnh và video hiện trạng mỗi
  công trình, nhưng hệ thống mới có đường vào cho **ảnh trích lục** (`/design/site/extract-
  boundary`). Ảnh hiện trạng chưa có chỗ nào nhận. Cần: tải lên, gắn vào hồ sơ, và rút ra được
  ít nhất hiện trạng bốn phía để nuôi `kb/site_context.yaml` — thứ quyết định mặt thoáng, mà
  hiện đang phải khai tay.
- **Chuẩn diện tích và chuẩn cấu tạo còn chờ KTS soát** (V-7, Q-18, Q-21). Chúng quyết định
  TỈ LỆ của mọi bản vẽ vẽ ra, nên thuộc nhóm cơ bản chứ không phải nhóm hoàn thiện.

#### Nhóm 2 — Bản vẽ dễ: sketch, phối cảnh, khối 3D

Làm được sớm vì **không cần bộ chú thích**: đây là hình khối, không phải bản vẽ kỹ thuật.

- **Mô hình đứng.** Phát `height_m` từng tầng — bộ giải đã có biến này nhưng `FloorPlan` không
  mang ra, nên `stubArchModel` mặc định cứng 3,4 m trong khi hồ sơ thật là **3,6 m**. Đây là
  điều kiện cần của cả khối 3D lẫn mặt cắt, và là việc nhỏ.
- **Khối 3D đơn giản.** Đùn khối từ `FloorPlan` bằng `trimesh` → glTF. Bản gốc đã xếp phần này
  vào Mốc 5; giữ nguyên chỗ, chỉ nâng ưu tiên.
- **Phối cảnh — cấp liệu, không tự dựng.** NVG đã có công cụ dựng ảnh AI đang chạy
  (`aicomplex_*`). Việc của engine là xuất **ảnh khối trắng, bản đồ độ sâu, bản đồ pháp tuyến**
  từ khối 3D cho công cụ đó. Đây là một de-scope lớn của Mốc 6, và biến phối cảnh từ việc khó
  thành việc nhỏ. **Chặn ở Q-22** — cần biết công cụ đó là gì trước khi chọn định dạng cấp liệu.

#### Nhóm 3 — Bản vẽ 2D của bộ KT

⚠️ **Đây là chỗ "dễ" có một điều kiện cần không đi tắt được.**

Bảy trong mười ba loại tờ KT về bản chất chỉ là *ghi chú thêm lên mặt bằng đã có* — lát sàn,
ga thoát sàn, định vị cửa, chi tiết cửa đi, chi tiết cửa sổ, thống kê cửa, mục lục. Nghe rất
dễ. Nhưng cả bảy đều cần **bộ chú thích và khung tờ**, thứ hiện chưa tồn tại và chưa Mốc nào
nhận sở hữu (V-9).

Nên thứ tự trong nhóm này là:

1. **Bộ chú thích + khung tờ khổ giấy** — tám yếu tố của `12-ux-ui.md` 12.8, cộng khung tên
   dạng BLOCK có ATTRIB (đúng cách NVG làm, xem 13.6 (6)) và không gian giấy A3. Việc lớn
   nhất trong cả lộ trình, và là việc mở khoá nhiều nhất. Kèm theo: chốt bảng tên lớp (Q-24).
2. **Bộ mã cấu kiện** — thêm mã loại vào `openings`, dựng danh mục cửa/cửa sổ/lanh tô/gạch.
   **Mồi từ ATTRIB của hai hồ sơ** (`1200x1200`, `CỬA SỔ KHUNG SẮT - PA-NÔ KÍNH - 2 CÁNH`) —
   mã thật của NVG, không bịa. Mở khoá bảng thống kê và mọi tờ định vị.
3. **Bảy loại tờ trên**, gần như miễn phí sau (1) và (2).
4. **Mặt đứng và mặt cắt** — sau mô hình đứng thì đây là *một kiểu nhìn khác trên cùng lõi*,
   không phải hệ thống con mới.
5. **Chi tiết thang bộ và chi tiết WC** — cần thang là thực thể hạng nhất và cần thiết bị vệ
   sinh; nặng hơn bốn mục trên.

Hết nhóm này là **NVG lần đầu nhận được một bộ hồ sơ KT nhận ra được, đi ra từ máy**.

#### Nhóm 4 — Phôi tờ KC

Bàn giao nền cho kỹ sư: lưới trục, cao độ, tuyến tường, vị trí lỗ mở, khung tên, ghi chú chung
(bảng TCVN và mác bê tông ở 13.4.4 là nội dung lặp lại đúng nghĩa), và **định vị lanh tô** —
suy được 100% từ `openings[]`, là món tự sinh mạnh nhất của bộ KC. Rẻ, và gỡ tắc ngay cho kỹ
sư thuê ngoài.

Ranh giới bất biến #9 giữ nguyên: engine **không** tính tiết diện, không tính tải trọng. Mọi
chi tiết thép và thống kê thép là việc của kỹ sư.

#### Nhóm 5 — Phôi tờ DN, rồi phát hiện xung đột

Làm sau cùng theo đúng chỉ đạo, **nhưng có tên trong kế hoạch**. Bắt đầu bằng phần rẻ nhất:
nền kiến trúc từng tầng + khung tên + bảng ký hiệu + ghi chú, dùng lại **từ vựng chú thích đã
đọc được từ hồ sơ thật** (13.4.3) thay vì bịa quy ước mới. Nội dung kỹ thuật — mạch điện, tiết
diện ống, sơ đồ nguyên lý — là việc của kỹ sư.

Phát hiện xung đột liên bộ môn để cuối cùng: nó cần mô hình ba chiều của DN, thứ chưa có.


### Ý kiến về trình chỉnh sửa mặt bằng

Mốc 5 đang đặt trình chỉnh sửa Konva trên đường găng. Nó là một khối việc lớn với **không đòn
bẩy nào lên số loại tờ**. Chính `12-ux-ui.md` 12.8 viết *"một định nghĩa hình học duy nhất cho cả
hai chế độ"* — nên dựng **trình xem bản vẽ chỉ đọc trước**, dùng chung mã ngôn ngữ bản vẽ với bộ
xuất DXF, và hoãn phần tương tác chỉnh sửa. Hiện `web/package.json` chưa có Konva lẫn Three.js
nên không mất gì.

### Năm năng lực nền, xếp theo số loại tờ mở khoá được

Đây là câu trả lời cho "làm gì thì mở khoá được nhiều nhất", **không phải** thứ tự thi hành —
thứ tự thi hành theo ưu tiên Haan chốt ở trên.

1. **Mô hình đứng** (cao độ tầng, sàn, thang) — việc nhỏ nhất trong năm, nhưng mở khoá khối 3D,
   phối cảnh, mặt cắt, mặt đứng, chi tiết thang, khung KC và cao độ lát sàn. Hiện chỉ là một
   hằng số 3,4 m viết cứng trong một hàm stub, trong khi số thật đọc được từ hồ sơ là 3,6 m.
2. **Lõi tờ + không gian giấy + khung tên dạng BLOCK có ATTRIB** — mở khoá cả 33 loại tờ. Đồng
   thời là chìa khoá của trích xuất (phần "Trích xuất phải đổi khung tư duy" ngay dưới): sinh ra
   và đọc vào cùng dùng một khái niệm "tờ".
3. **Bộ chú thích** (kích thước, bong bóng trục, ký hiệu, hatch, cung quay cửa, bậc thang) —
   cần cho ~29 trên 33 loại. Việc lớn nhất, và không có đường vòng.
4. **Bộ mã cấu kiện** — mở khoá bảng thống kê, chi tiết cửa, mọi tờ định vị, lanh tô, và QTO
   sau này. Mồi được từ ATTRIB của hai hồ sơ thật, không phải bịa.
5. **Thư viện block + đường chữ tiếng Việt** (TCVN3 ↔ Unicode, phông SHX) — món ngủ quên. Thiếu
   nó thì mọi DXF của engine đọc như sơ đồ, và đó đúng là thứ người vẽ của NVG nhìn vào để đánh giá.

**Đường găng thật (đã xếp theo ưu tiên Haan chốt):**

```
gỡ kẹt pipeline → khảo sát hiện trạng + chuẩn diện tích được soát → mô hình đứng
  → khối 3D và cấp liệu phối cảnh → bộ chú thích + khung tờ → bộ mã cấu kiện
  → phủ hết bản vẽ 2D của KT → phôi tờ KC → phôi tờ DN → phát hiện xung đột
```

**Không nằm trên đường găng:** trình chỉnh sửa mặt bằng tương tác, trình xem ba chiều đầy đủ,
biệt thự, và việc engine tự sở hữu một bộ dựng ảnh.

### Trích xuất phải đổi khung tư duy

Từ "đọc một mặt bằng" sang **"tách tờ trong một modelspace xếp cạnh nhau, đi vào block, đọc
ATTRIB"**.

**Tách tờ bằng khung tên trước, hình học sau.** Ở ba trên năm tập, mỗi tờ mang sẵn một INSERT
khối khung tên với ATTRIB chứa mã tờ, tỷ lệ, ngày (13.6 (6)). Với chúng: tìm mọi INSERT có tên
khối khớp mẫu khung tên (mẫu khai trong `kb/`, không viết vào mã) → hình bao mỗi insert là một
vùng tờ → mã và tên tờ lấy luôn từ ATTRIB. Tuyến tính theo số insert, tất định, không heuristic.

**Hai tập còn lại không có khối khung tên** — khung tên vẽ rời trên một lớp riêng. Với chúng
phải gom cụm hình bao thực thể, và đó mới là heuristic. Nên trình trích xuất phải **báo ra tập
nào đi đường nào**: đường khung tên là kết quả tin được, đường gom cụm là kết quả cần người
xác nhận. Trộn hai loại vào cùng một con số tin cậy là tự bịt mắt.

**Lọc theo vùng tờ TRƯỚC khi đọc ATTRIB.** Gom mọi ATTRIB trong file rồi mới chia là sai — tập
B·DN mang lẫn khung tên của công trình khác (13.6 (9)), nên cách làm đó sẽ gán chéo dữ liệu
giữa hai hồ sơ mà không lỗi nào nổ ra.

**Xếp lại thứ tự thu hoạch** theo giá trị chia cho công:

- **Bậc 1 — rẻ, giá trị cao, không cần hình học:** danh mục tờ (chính là `SheetSet` mà engine
  phải học cách tái tạo) · lưới trục từ ATTRIB bong bóng · danh mục cửa/cửa sổ từ ATTRIB · kiểm
  kê lớp trên mọi DWG · từ vựng chú thích DN.
- **Bậc 2 — việc thật:** giá trị kích thước từ thực thể DIMENSION (là kích thước **chủ ý**, ground
  truth tốt hơn hình học đo lại, và là tín hiệu đánh giá tự nhiên) · đa giác phòng dựng từ tim
  tường bằng `shapely.polygonize` — **đúng như `06-knowledge-base.md` đã kê, mã mới là chỗ đi
  lệch** · nhãn phòng sau khi sửa bảng mã.
- **Bậc 3 — hoãn:** dựng lại mô hình đầy đủ, PDF quét, video.

**Điều kiện ra của Mốc 0.1 nên đổi.** Hiện là *"trích được đa giác ranh phòng và nhãn phòng; KTS
xác nhận đúng trên ≥4/5 file"* — không với tới được ở lượt đầu, và đo sai thứ. Đề xuất bốn phần:

- (a) **danh mục tờ** đúng ≥95% trên cả hai hồ sơ (mã, tên, tỷ lệ), KTS xác nhận;
- (b) **lưới trục** lấy được trên ≥90% tờ mặt bằng;
- (c) **danh mục cửa/cửa sổ** lấy được ≥90%;
- (d) **đa giác phòng** từ đồ thị tường trên ≥60% tờ mặt bằng KT, KTS xác nhận.

Đa giác phòng vẫn là đích; nó thôi làm cổng chặn. Đó là cách gỡ V-1 một cách trung thực.

## 13.13 Ô còn trống — hồ sơ KHÔNG trả lời được, cần hỏi NVG

Ghi ra để không ai điền hộ bằng giá trị mặc định (`CLAUDE.md` 5.2).

| # | Câu hỏi | Vì sao chặn |
|---|---|---|
| 1 | ~~Công cụ dựng ảnh AI mà NVG đang dùng là gì?~~ — **đã trả lời 05/09/2026** | Haan chốt: **giai đoạn dev và test dùng tạm Gemini API**. Tuyến `layer5_render` đã khai trong `config/models.yaml` ở `max_data_class: 3` — **không phải nới lỏng gì**, vì chính bảng hạng của tệp đó đã xếp "ảnh khối" vào hạng 3. **Nhưng đo được ngay: khoá gói miễn phí KHÔNG có hạn mức sinh ảnh** (xem 13.13b), nên tuyến để `enabled: false` |
| 2 | **Tổng mặt bằng có tồn tại không?** Không hồ sơ nào có, dù `06-knowledge-base.md` xếp P0 bắt buộc | Nếu nhà lô không bao giờ có tổng mặt bằng thì extractor cho loại tờ này chỉ dùng cho biệt thự (Mốc 7), không phải Giai đoạn 1 |
| 3 | **Mặt bằng phương án sơ bộ được lưu ở đâu?** Hồ sơ chỉ có bản vẽ thi công đã hoàn thiện (13.3) | Đây là đầu ra mà Lớp 3 nhắm tới. Không có mẫu thì không đánh giá được `kts_acceptance_rate`, và few-shot chỉ học được hình học chứ không học được cách đi từ đầu bài tới phương án |
| 4 | **Ngưỡng `extraction_success_rate` là bao nhiêu thì đạt?** `08-milestones.md` 8.1 khai chỉ số này nhưng không có ngưỡng nào | Đề xuất bốn ngưỡng ở 13.12; cần Haan chốt trước khi lấy làm điều kiện ra |
| 5 | **Bảng lớp khi hệ thống XUẤT bản vẽ theo quy ước nào?** `12-ux-ui.md` 12.8 và `kb/layer_mapping.yaml` đang khai hai bảng khác nhau, và cả hai đều khác quy ước thật của NVG (13.6 (3)) | Người vẽ của NVG mở file engine xuất ra và nhìn tên lớp — dùng đúng `NV-*` của họ là món tạo tin cậy rẻ nhất. Nhưng đó là quyết định của NVG, không phải của tôi |
| 6 | **Tên tờ của bộ DN lấy ở đâu?** Hai tập DN không có khối khung tên | Chặn việc dựng danh mục tờ đầy đủ cho bộ môn này |
| 7 | **Chiều cao tầng 3,6 m có phải chuẩn không?** Đọc được từ cao độ ATTRIB của hồ sơ A (`+0.000 +3.900 +7.500 +11.100 +14.700`) | Mã đang mặc định cứng 3,4 m. 3,6 m là số của **một** công trình, không phải chuẩn NVG. Cần biết nó là tham số theo công trình hay có giá trị mặc định |
| 8 | **Hồ sơ mang lẫn dữ liệu công trình khác — xử lý thế nào?** (13.6 (9)) | Cần biết đây là chuyện thường hay là sự cố của riêng file này, để quyết định kiểm tra chéo chặt tới đâu |

### 13.13b Đo hạn mức sinh ảnh của khoá Gemini (05/09/2026)

Sau khi Haan chốt dùng Gemini cho phối cảnh, đã đo bằng lời gọi thật — prompt không mang một
mẩu dữ liệu NVG nào:

| Lời gọi | Kết quả |
|---|---|
| Liệt kê mô hình | Khoá thấy **6 mô hình sinh ảnh**: `gemini-2.5-flash-image` · `gemini-3-pro-image` · `gemini-3-pro-image-preview` · `gemini-3.1-flash-image` · `gemini-3.1-flash-image-preview` · `gemini-3.1-flash-lite-image` |
| `gemini-2.5-flash-image` sinh ảnh | **429 RESOURCE_EXHAUSTED** |
| `gemini-3.1-flash-image` sinh ảnh | **429 RESOURCE_EXHAUSTED** |
| `gemini-2.5-flash` sinh chữ, ngay sau đó | **OK**, 31 token |

→ Khoá **không** hết hạn mức nói chung; nó **không có hạn mức sinh ảnh**. Đây là dấu hiệu thứ
ba khẳng định gói miễn phí (hai dấu hiệu trước: nhóm `pro` trả 429, `gemini-2.5-pro` trả 404),
và nó **trả lời dứt điểm câu hỏi Q-15**.

→ Hệ quả: chọn Gemini là đúng về kiến trúc, nhưng **chạy được thì phải nâng gói trả phí**. Đó
là quyết định của Haan, không phải việc bật một cờ. Tuyến để `enabled: false` — cùng lý do và
cùng khuôn với `layer3_intent_hard`.

### 13.13c Gemini đổi hình dạng của việc cấp liệu

Hợp đồng `render-request.schema.json` viết theo khuôn ControlNet: mỗi khung nhìn có `clay_png`
+ `depth_png` + `edge_png`. Đó là hình dạng của Stable Diffusion / ComfyUI.

**Gemini nhận ảnh + chữ, không nhận điều kiện hoá depth/normal.** Hai hệ quả trái chiều:

- **Nhẹ hơn:** engine chỉ cần dựng **một ảnh khối tốt**, không cần bộ bản đồ điều kiện. Hợp
  đồng không phải sửa — `depth_png` và `edge_png` vốn đã là **tuỳ chọn** (chỉ `id` và `camera`
  bắt buộc). `backend: "api_service"` cũng đã có sẵn trong enum của `render-result`.
- **Rủi ro:** độ bám hình học yếu hơn. Ảnh có thể đẹp mà **lệch khối so với phương án**. Với
  mục tiêu "khách chốt được phương án chỉ dựa trên gói trình khách" (điều kiện ra Mốc 5), một
  ảnh trôi khỏi mặt bằng còn tệ hơn không có ảnh. Nên phép nghiệm thu của tuyến này không phải
  "ảnh có đẹp không" mà **"ảnh có đúng khối không"** — số tầng, số nhịp, vị trí ban công, tỉ lệ
  đặc rỗng. Cần một bộ đối chiếu, không phải cảm nhận.

Nhãn `"Ảnh tham khảo ý tưởng — chưa phải phương án thi công"` (`01-overview.md` 1.4) vì thế
**quan trọng hơn chứ không kém đi**, và phải do mã chèn như quy định.

## 13.14 Cách đo — để kiểm lại được

Hồ sơ nằm ngoài repo nên các lệnh dưới đây trỏ tới đường dẫn tuyệt đối trên máy Haan.

```bash
HS="/home/haan/Documents/Doc/NVG/hồ sơ"

# Đếm trang, khổ giấy, phông nhúng — phát hiện bản quét
pdfinfo  "<file>.pdf" | grep -E 'Pages|Page size'
pdffonts "<file>.pdf" | tail -n +3 | wc -l      # 0 dòng = bản quét

# Đọc danh mục bản vẽ và khung tên (phông TCVN3, phải giải mã)
pdftotext -layout "<file>.pdf" - | python3 tcvn3.py -

# Phiên bản định dạng DWG
head -c 6 "<file>.dwg"       # AC1018 = 2004 · AC1021 = 2007 · AC1032 = 2018

# Chuyển DWG sang DXF (ODA nằm trong ảnh Docker; máy chủ thiếu xvfb-run)
docker run --rm -v "$IN":/in:ro -v "$OUT":/out nvg-design-compute:latest \
  xvfb-run -a ODAFileConverter /in /out ACAD2018 DXF 0 1 "*.DWG"

# Kiểm kê DXF: lớp, block, tỉ lệ nằm trong block, và TÁCH TỜ theo khung tên
docker run --rm -v "$OUT":/in:ro nvg-design-compute:latest \
  python /app/bench/khaosat_dxf.py /in/<file>.dxf
```

⚠️ Lệnh chuyển đổi ở trên dùng bộ lọc `"*.DWG"` chữ hoa, nhưng **bộ lọc không phân biệt hoa
thường** — tệp `.dwg` chữ thường chuyển đúng, kể cả tên có dấu và khoảng trắng. Đã thử lại
06/09/2026; xem N-12.

Công cụ khảo sát là **`compute/bench/khaosat_dxf.py`**, giữ trong repo chính vì mục này: một
báo cáo không kiểm chứng lại được thì chỉ là lời khẳng định. Nó đọc `kb/text_encoding.yaml` để
giải mã TCVN3 và `kb/title_block.yaml` để biết thẻ nào mang mã tờ, nên nó cũng là **nơi tiêu
thụ** hai tệp dữ liệu đó — cấu hình khai ra mà không ai đọc còn tệ hơn không khai (CLAUDE.md
8.8 điểm 2).

Chạy trên tập điện nước của HS-01 cho: `BLOCKS 41.463 · ENTITIES 7.783` (84% nằm trong block),
100 lớp có thực thể, **44 tờ tách được**, họ quy ước khung tên `semantic_kt`.

### Bảng giải mã phông TCVN3

Hồ sơ dùng phông `.VnTime` / `.VnTimeH` (TCVN 5712 VN3), không phải Unicode. Bảng dưới đây dựng
bằng **đối chiếu thực tế** — mỗi dòng có ít nhất một từ xác nhận được trong chính hồ sơ (ví dụ
`nhµ` = "nhà" nên `0xB5` → `à`). Chữ hoa dùng cùng mã byte, khác ở phông, nên suy ra từ các chữ
cái ASCII trong cùng một từ.

```
A1 Ă  A2 Â  A3 Ê  A4 Ô  A5 Ơ  A6 Ư  A7 Đ
A8 ă  A9 â  AA ê  AB ô  AC ơ  AD ư  AE đ
B5 à  B6 ả  B7 ã  B8 á  B9 ạ
BB ằ  BC ẳ  BD ẵ  BE ắ  C6 ặ
C7 ầ  C8 ẩ  C9 ẫ  CA ấ  CB ậ
CC è  CD ẻ  CE ẻ  CF ẽ  D0 é  D1 ẹ
D2 ề  D3 ể  D4 ễ  D5 ế  D6 ệ
D7 ì  D8 ỉ  D9 ĩ  DD í  DE ị
DF ò  E0 ỏ  E1 õ  E3 ó  E4 ọ
E5 ồ  E6 ổ  E7 ỗ  E8 ố  E9 ộ
EA ờ  EB ở  EC ỡ  ED ớ  EE ợ
EF ù  F0 ủ  F1 ủ  F2 ũ  F3 ú  F4 ụ
F5 ừ  F6 ử  F7 ữ  F8 ứ  F9 ự
FA ỳ  FB ỷ  FC ỹ
```

⚠️ Bảng này dựng từ **hai hồ sơ**, chưa phải toàn bộ bảng TCVN3 chuẩn. Vài ô còn suy ra theo
quy luật nhóm chứ chưa gặp từ xác nhận (`BD`, `CD`, `CE`, `D9`, `E0`, `E1`, `E7`, `EC`, `F0`,
`F2`, `F5`, `FA`, `FC`). Khi số hoá thêm hồ sơ, đối chiếu lại các ô đó trước khi tin.

---

## 13.15 Nguồn dữ liệu nền dựng từ hai hồ sơ (06/09/2026)

Mục 13.1 → 13.14 là **báo cáo**: nó mô tả hồ sơ chứa gì. Mục này ghi lại thứ khác — phần tri
thức đã được **rút ra khỏi hồ sơ và đưa vào `kb/`** để engine dùng lại cho dự án sau.

### Ba tầng dữ liệu, ba ngưỡng mẫu khác nhau

Đây là ranh giới quan trọng nhất của cả đợt. Trộn ba tầng vào nhau sẽ dựng ra một kho tri thức
trông vững mà thật ra là suy diễn từ hai căn nhà.

| Tầng | Ví dụ | Cần bao nhiêu hồ sơ | Hai hồ sơ này |
|---|---|---|---|
| **Từ vựng và quy ước** — tất định | nhãn phòng, tên lớp, mẫu khung tên, bảng mã chữ, danh mục tờ, quy cách cửa | **n = 1 đã đủ** — thấy một lần nghĩa là nó có thật | **Đủ. Đã rút, xem dưới** |
| **Định mức và phân bố** — thống kê | diện tích phòng theo bề rộng lô, tỉ lệ đặc rỗng, năng suất | `kb/space_norms.yaml` tự khai `priors.min_samples: 15` | **Không đủ** |
| **Cặp mẫu đầu bài → phương án** | thứ duy nhất làm few-shot prompt thật | vài chục | **Không tồn tại trong kho** (13.3) |

**Haan trả lời 06/09/2026, và câu trả lời đóng một tầng lại rồi mở tầng kia ra:**

- **Q-27 — sẽ KHÔNG có thêm hồ sơ trong giai đoạn demo.** Bản thiết kế là thông tin nhạy cảm,
  khách hàng hạn chế cung cấp; tận dụng hai bộ đã có. Nên **tầng hai đóng lại**: ngưỡng 15 công
  trình không bao giờ đạt, hook thống kê luôn trả rỗng (đúng thiết kế), và chuẩn diện tích của
  Lớp 2 **không thể suy từ dữ liệu**. Nó phải do kiến trúc sư NVG ấn định — **Q-18 vì thế đổi
  vai, từ "nên soát" thành đường DUY NHẤT** để những con số đó thôi là phỏng đoán.
  ⚠️ Đừng hạ `priors.min_samples` xuống cho khớp số hồ sơ đang có. Hạ xuống 2 thì phân bố tính
  ra từ hai căn nhà, và nó sẽ trông y hệt một con số đã được kiểm chứng.
- **Q-28 — CÓ, từ dự án tới sẽ ghi lại bản vẽ giai đoạn phương án.** Tầng ba bắt đầu tích luỹ
  từ đây. Còn một chi tiết phải chốt trong cách ghi: bản phương án lưu **kèm đầu bài của chính
  nó**, nếu không thì chỉ là thêm một bản vẽ rời và cặp mẫu vẫn không hình thành.

Còn lại là hồ sơ CŨ: chúng không có bản vẽ phương án và sẽ không bao giờ có. Muốn dùng chúng
làm cặp mẫu thì kiến trúc sư phải tái dựng đầu bài rút gọn cho từng bộ (~5–10 phút) — đó là
phần còn mở của Q-26.

### Đã đưa vào `kb/`

| Tệp | Mới hay sửa | Nội dung rút được |
|---|---|---|
| `kb/sheet_catalogue.yaml` | mới | **47 loại tờ** trên ba bộ môn, đọc từ ATTRIB khung tên của 265 tờ thật. Mỗi loại ghi engine sinh được hay không, và vì sao |
| `kb/title_block.yaml` | mới | **Ba họ quy ước khung tên**, hai trong ba nằm ngay trong cùng một hồ sơ. Kèm danh sách ô là dữ liệu hạng 1, để biết mà LOẠI chứ không phải để thu thập |
| `kb/text_encoding.yaml` | mới | Bảng giải mã TCVN3 74 mục + **49 ký tự dấu hiệu** + quy tắc suy bảng mã **theo KIỂU CHỮ, không theo từng chuỗi** |
| `kb/layer_mapping.yaml` | viết lại | Tên lớp thật thay cho phỏng đoán chuẩn AIA; thêm vai trò `grid`/`dimension`/`mep`/`fixture`/`furniture`; gỡ `'0'` khỏi `ignore`; thêm mục `line_weight_layers` |
| `kb/construction_norms.yaml` | sửa | Kích thước cửa và cửa sổ **đo được**, cao độ tầng, và quy ước đo "thông thủy hoàn thiện" |
| `kb/room_vocabulary.yaml` | sửa | Bí danh nguyên văn từ hồ sơ thật + `strip_patterns` để gỡ đuôi diện tích viết liền nhãn |

### Bốn con số bị bác, một con số được xác nhận

Giá trị cũ trong `kb/` là suy luận từ thực hành phổ biến. Đối chiếu hồ sơ thật:

| Mục | Giá trị cũ | Đo được | Kết luận |
|---|---|---|---|
| Cửa phòng | 900 × 2200 | 900 × 2200 (mã `d4`, 6 bộ) | **Đúng** |
| Bề dày tường | 220 / 110 | ghi chú kết cấu có cả `GỜ CHÂN TƯỜNG 110` lẫn `… 220` | **Đúng** |
| Bệ cửa sổ | +0,90 m | cao độ `+0.900` trên mặt cắt | **Đúng** |
| Cửa vào nhà | 1200 × 2400 | 1650 → 3800 rộng, 2500 → 3000 cao | **Sai, đã sửa** |
| Chiều cao cửa sổ | 1500 | 1600 (hai trong ba cỡ) | **Sai, đã sửa** |
| Cửa vệ sinh | dùng chung cửa phòng 900 | 700 × 2100 và 750 × 2200 | **Thiếu hẳn, đã thêm** |
| Cửa sổ vệ sinh | dùng chung cửa sổ phòng | 600 × 600, mở hất, đặt cao | **Thiếu hẳn, đã thêm** |

### Quy ước đo của NVG — dòng chữ quan trọng nhất trong cả bộ hồ sơ

In trên **mọi** tờ chi tiết cửa:

> "kích thước cửa trên bản vẽ là kích thước **thông thủy hoàn thiện**" · "trát hèm tất cả cửa"

Nghĩa là mọi con số cửa trong hồ sơ là **lọt lòng sau hoàn thiện**, không phải lỗ chờ xây thô.
Nhầm hai thứ này thì mọi ô cửa hẹp lại vài centimet — đủ để một lối đi trượt ngưỡng quy chuẩn
mà không ai hiểu vì sao. Đây đúng là loại tri thức chỉ hồ sơ thật mới nói được.

### Ranh giới dữ liệu đã giữ

Hai bộ hồ sơ là **dữ liệu hạng 1**: tên chủ đầu tư, địa chỉ công trình, giá hợp đồng, tên và
chức danh người ký, thư điện tử. Chúng nằm **ngoài repo** và **không được chép** vào
`kb/samples/`.

Thứ đưa vào `kb/` là chỉ số và từ vựng — một bí danh `"PN2"` hay một bề dày tường 220 mm không
mang danh tính ai, nên là hạng 3 và commit được. Hai hồ sơ được gọi là **HS-01** và **HS-02**
trong mọi tệp `kb/`; không tệp nào mang tên khách hàng.

`kb/title_block.yaml` có mục `pii_fields_do_not_store` liệt kê đúng những ô phải bỏ qua khi
trích xuất. Nó tồn tại để **biết mà loại**, không phải để thu thập.

### Việc mã nguồn đã phải sửa theo

Dữ liệu mới mà không có nơi đọc thì tệ hơn không có (CLAUDE.md 8.8 điểm 2). Bốn chỗ đã nối:

1. `cad/layers.py` — thêm hàm `fold()` **gấp dấu tiếng Việt** trước khi so khớp. Trước đó mẫu
   `A2_CAT BT` trượt lớp thật `A2_CẮT BT`, im lặng.
2. `cad/layers.py` — đọc `line_weight_layers`, thêm `is_line_weight()`, và loại nhóm đó khỏi
   `unmapped()`. Lớp đặt theo độ đậm nét **không phải** lớp chưa ánh xạ.
3. `geometry/norms.py` + `geometry/walls.py` — phòng vệ sinh dùng cửa và cửa sổ riêng.
4. `kb/vocabulary.ts` — đọc `strip_patterns`, gỡ **dồn** nhiều đuôi thay vì một lần, để nhãn
   `"SẢNH/ SINH HOẠT CHUNG 11.3m²"` tra được.

Kèm bốn phép thử mới ở `compute/tests/test_cad.py` và hai ở
`workers/src/design/__tests__/normalize-labels.test.ts`, tất cả dùng **nhãn và tên lớp nguyên
văn** từ hồ sơ thật chứ không phải ví dụ tự nghĩ. `165 passed, 2 skipped` phía Python;
`15 passed` phía nhãn phòng.

### Thước đo mới thay cho "1 / ≥28"

`kb/sheet_catalogue.yaml` cho phép nói chính xác:

- **47 loại tờ** trong một bộ hồ sơ nhà ở (16 kiến trúc · 21 kết cấu · 10 điện nước).
- **29 loại là `nen`** — engine chỉ chuẩn bị nền hình học, kỹ sư có chứng chỉ ký. Bất biến #9
  (CLAUDE.md 8.2), không phải hạn chế tạm thời, và **không bao giờ chuyển thành `co` bằng cách
  viết thêm mã**.
- **18 loại engine được phép tự phát hành** (16 kiến trúc + danh mục bản vẽ + ghi chú chung).
  Hiện làm được **1**.

Nên chỉ số trung thực là **1 / 18**, không phải 1 / 47. Con số 47 vẫn cần có mặt, vì nó là thứ
trả lời câu "một bộ hồ sơ đầy đủ gồm những gì".

---

## 13.16 Đợt đo 22/09/2026 — bốn hồ sơ mới: cầu thang, bậc tam cấp, cốt cao độ

Haan gửi thêm **năm bộ hồ sơ** (thư mục `HoSoTapHop Gui Sep`), chỉ định đọc **10 tờ mặt bằng**
của bốn bộ. Câu hỏi đặt ra không phải "hồ sơ chứa gì" nữa — mục 13.1→13.15 đã trả lời — mà là
**"NVG bố trí cầu thang thế nào, xử lý bậc tam cấp thế nào"**, để tờ vẽ engine sinh ra giống hồ
sơ thật hơn.

> ⚠️ **Q-27 đã hết đúng.** Mục 13.15 ghi "sẽ KHÔNG có thêm hồ sơ trong giai đoạn demo" (Haan,
> 06/09/2026). Tính cả đợt này, kho đã có **7 bộ** (2 cũ + 5 mới; 2 trong 5 còn nén `.rar`).
> Ngưỡng `priors.min_samples: 15` vẫn chưa đạt, nên **tầng "định mức và phân bố" vẫn đóng** —
> nhưng lý do đổi từ "không bao giờ có thêm" thành "chưa đủ". Xem câu hỏi Q-31 cuối mục này.

### Bốn hồ sơ và mã dùng trong `kb/`

| Mã | Loại hình | Tầng | Kích thước nhà | Tờ đã đọc |
|---|---|---|---|---|
| **HS-03** | liền kề trong ngõ | 3 | 8.000 × 7.940 | MB nội thất T1/T2/T3 · MB công năng mái |
| **HS-04** | mái Nhật sân vườn | 1 | 14.000 × 9.100 | MB công năng · MB kiến trúc |
| **HS-05** | liền kề mái Nhật | 1 | 23.500 × 5.000 | MB công năng T1 · MB mái bê tông |
| **HS-06** | mái Nhật 2 tầng | 2 | 12.450 × 8.000 (T1) / 9.200 (T2) | MB tổng thể · MB KT T1 · MB KT T2 · MB KT mái |

Tên chủ đầu tư và địa chỉ **không** vào repo (ranh giới hạng 1, mục 13.15). Bốn mã trên là thứ
duy nhất được viết vào `kb/` và `rules/`.

### 13.16.1 Cầu thang — hai kiểu, cùng một mặt bậc

**Mặt bậc 250 mm, không sai một milimet nào**, trên cả bốn vế thang đo được (HS-03 ba tầng vẽ
giống hệt nhau, HS-06 một). Đây là con số chắc nhất của cả đợt: `kb/construction_norms.yaml`
đang khai `stairs.going_m: 0.25` kèm ghi chú "SỐ THAM KHẢO, chọn ở mức thấp của thang nhà ở" —
ghi chú ấy nay sai, **0,25 chính là con số NVG vẽ**.

**HS-03 — thang hai vế chữ U, quay bằng BẬC QUẠT, không có chiếu nghỉ vuông**

| | |
|---|---|
| mặt bậc | **250** |
| bề rộng một vế | **900** |
| khe giữa hai vế | **200**, trong khe đặt **lan can dày 100** |
| ô thang kể cả chỗ quay | **3.200 × 2.000** |
| số bậc mỗi tầng | **19** = 6 (vế lên) + **2 bậc quạt** + 11 (vế xuống) |
| cổ bậc suy từ chênh cốt | **180** (T1→T2, 3.600/20) · **165** (T2→T3, 3.300/20) |

Hai bậc quạt vẽ bằng các nét toả ra từ điểm trong của chỗ quay tới tường, dải quạt rộng đúng
bằng bề rộng vế (900). Đây là cách ăn gian chỗ trên lô hẹp: một chiếu nghỉ vuông 900 × 2.000 sẽ
ăn thêm ~900 mm chiều dài ô thang.

**Bậc được ĐÁNH SỐ trên mặt bằng, 1…19.** Chữ số cao 78 (nhãn phòng 130, nhãn diện tích 86, cốt
cao độ 110 trên cùng tờ). Dãy số vế lên đặt ngoài mép vế 132 mm, dãy vế xuống ngoài 56 mm; hai
số bậc quạt xếp **dọc** ở đầu quay. Engine hiện **không** đánh số bậc.

**HS-06 — thang hai vế song song, khe rộng**

| | |
|---|---|
| mặt bậc | **250** |
| bề rộng một vế | **1.000** |
| khe giữa hai vế | **500** (lỗ thông thuỷ 380 + hai mép 60) |
| ô thang lọt lòng | **2.500 × 3.470** |
| tường quanh ô thang | **110** |

Quy ước vẽ của HS-06, đọc thẳng từ lớp:

- vế đang lên vẽ **nét thấy** (`NV-NetThay`), phần vế phía trên mặt cắt vẽ **nét đứt**
  (`NV-NetDut`); hai phần cắt nhau bằng **đường cắt gãy chéo hình chữ Z**;
- **tay vịn** vẽ liền một nét chạy dọc mép vế, đầu xuất phát **cuộn tròn** (trụ cuộn) — đây là
  dấu duy nhất trên mặt bằng nói bậc số 1 nằm đầu nào;
- **ô thang mở thông 2.500 mm với phòng khách**, ba mặt còn lại kín. Không phòng ở nào lấy cửa
  từ ô thang — xác nhận `stair_not_facing_entry` và luật cứng "phòng ở không lấy cửa từ ô thang".

**Vị trí thang so với lối vào — cả hai hồ sơ đều KHÔNG đặt thang đối diện cửa chính.**
HS-03 đặt thang ở góc trong cùng bên phải, chạy ngang nhà, xa cửa cuốn và cửa đi ở mặt tiền.
HS-06 đặt thang ở dải sau, vuông góc với trục sảnh chính ở đầu hồi tây. Quy tắc
`stair_not_facing_entry` trong `rules/nvg-experience.yaml` đang mang `n: 0` — nay **n = 2**.

### 13.16.2 Bậc tam cấp — "tam cấp" là tên gọi, không phải số bậc

| | HS-04 | HS-05 | HS-06 |
|---|---|---|---|
| chênh cốt sân → nền | 430 (−0.450 → −0.020) | 450 (−0.450 → ±0.000) | **730** (−0.750 → −0.020) |
| số bậc | 3 | 3 | **5** |
| mặt bậc | 300–350 | **300** | **300** |
| cổ bậc suy ra | ~143 | **150** | **146** |
| bề rộng lối lên | 2.220 | 1.090 | 3.110 |

Quy tắc rút ra: **mặt bậc giữ 300; số bậc = chênh cốt ÷ ~150, làm tròn lên.** Không có hồ sơ nào
ghi cổ bậc bằng số trên mặt bằng — nó chỉ suy được từ cốt cao độ chia số bậc, nên **phải có cốt
mới vẽ được bậc**.

Chi tiết đi kèm:

- **HS-05 đánh số bậc 1 2 3 ngay trên mặt bằng**, chữ cao 101 — cùng thói quen với HS-03.
- **HS-06: bậc nằm gọn giữa hai cột hiên 220 × 220** (đế 440 × 440) đặt đúng nút trục; bề rộng
  bậc bằng khoảng thông thuỷ giữa hai cột, không phải bề rộng cửa.
- **HS-04: hai bên bậc có má/bồn rộng 780**, bậc chỉ chiếm phần giữa.
- HS-04 và HS-05 mỗi nhà có **hai** cụm bậc: một ở lối vào chính, một ở cửa bếp/sân sau.

### 13.16.3 Cốt cao độ — HS-06 có bảng chú giải tường minh

Tờ mặt bằng tổng thể HS-06 in hẳn mục "GHI CHÚ CỐT CAO ĐỘ", nguyên văn:

> ±0.000 = **cốt nền nhà hoàn thiện** · −0.750 = **sân bê tông sau khi đã lát gạch** ·
> −0.850 = **đường**

Tức **sân cao hơn đường 100; nền cao hơn sân 750; nền cao hơn đường 850**. Gộp cả bốn hồ sơ:

| Chỗ | Cốt so với ±0.000 | Thấy ở |
|---|---|---|
| đường | −0.850 | HS-06 |
| sân trước / sân sau | **−0.450 … −0.750** | HS-04, HS-05, HS-06 |
| sân sau (bậc trung gian) | −0.300 | HS-05 |
| thềm / hiên | **−0.020** | HS-04, HS-06 |
| khu vệ sinh | **−0.050** … −0.100 | HS-03, HS-05 / HS-04 |
| ban công, sân giặt phơi | **−0.030** so với sàn tầng | HS-06 (+3.870 vs +3.900) |

Hai con số chốt lại được:

- **Sàn WC luôn thấp hơn sàn phòng**, 30–100 mm. HS-03 giữ đúng −0,050 ở cả ba tầng
  (−0.050 · +3.550 · +6.850 so với ±0.000 · +3.600 · +6.900).
- `facade.ground_floor_raise_m: 0.45` **được xác nhận là mức thường gặp** (HS-04 và HS-05 đúng
  0,45); cận trên của khoảng đo được nâng từ 0,75 lên **0,85** nhờ HS-06.

**Chiều cao tầng** mở rộng khoảng đã ghi ở `levels`: HS-03 tầng 1 **3.600** rồi tầng 2 **3.300**;
HS-06 tầng 1 **3.900**. Nên khoảng đo được của NVG là **3,3 – 3,9 m**, và tầng 1 cao hơn tầng
trên khi tầng 1 có gara hoặc mặt tiền kinh doanh.

### 13.16.4 Lỗ mở — bảng thống kê cửa HS-04

HS-04 có bảng thống kê cửa đủ ký hiệu, kích thước và **cao độ bệ**:

| Ký hiệu | Kích thước | Bệ | Là gì |
|---|---|---|---|
| D1 | **2.350 × 2.350** | ±0.000 | cửa chính |
| D2, D3 | **940 × 2.220** | ±0.000 | cửa phòng ngủ |
| — | 810 × 2.220 | ±0.000 | cửa phòng phụ |
| D4 | **750 × 2.220** | −0.100 | cửa vệ sinh |
| S1 | 2.150 × 1.650 | **+0.700** | cửa sổ phòng |
| S2 | 1.650 × 1.650 | **+0.700** | cửa sổ phòng |
| S3 | **700 × 500** | **+1.800** | cửa sổ vệ sinh |

Điều đáng giá nhất không nằm ở kích thước mà ở **sự thẳng hàng**: 0,700 + 1,650 = **+2,350**, đúng
mép trên cửa chính. Tức **mép trên cửa sổ và cửa chính trùng cao độ +2,35 m**, còn cửa phòng thấp
hơn (+2,22). Đây là thứ chỉ hồ sơ thật nói được, và nó quyết định mặt đứng trông có ngay ngắn không.

Đối chiếu với `kb/construction_norms.yaml` (dựng từ HS-01):

| Mục | Đang khai | HS-04 | Kết luận |
|---|---|---|---|
| cửa phòng | 900 × 2.200 | 940 × 2.220 | gần đúng; khoảng thật 900–940 × 2.200–2.220 |
| cửa vệ sinh | 750 × 2.200 | 750 × 2.220 | **xác nhận** |
| cửa sổ vệ sinh, bệ | +1.800 | +1.800 | **xác nhận** (cỡ thì khác: 600×600 vs 700×500) |
| cửa chính, cao | 2.500 (hẹp nhất đo được) | **2.350** | HS-04 thấp hơn cận dưới đang khai |
| cửa sổ, cao | 1.600 | 1.650 (HS-04) · 1.200 (HS-03, HS-05) | khoảng thật **1.200–1.650** |
| bệ cửa sổ | **+0.900** | **+0.700** | ⚠️ **hai hồ sơ hai mức, chưa hoà giải** |

Bệ cửa sổ là chỗ lệch thật sự: HS-01 đo +0,900 trên mặt cắt, HS-04 khai +0,700 trên bảng thống
kê. Không phải sai số đo — hai công trình làm khác nhau. **Không sửa giá trị đang khai**; cần
Phòng Thiết kế cho biết mức mặc định (Q-32).

HS-03 và HS-05 dùng chung một quy cách cửa sổ ghi bằng chữ: **1.200 × 1.200, "cửa sổ khung sắt –
pa-nô kính – 2 cánh"**. HS-03 dùng **cửa cuốn** cho gara.

### 13.16.5 Tường, cột, mái

**Tường.** Đếm giá trị DIMENSION do chính người vẽ ghi: HS-03 có **110 lặp 103 lần** trên 450 kích
thước (220 lặp 34 lần), HS-05 có 110 lặp 8/30. **110 là bề dày mặc định**, 220 dành cho tường bao
và tường chung. Ngược lại HS-04 (nhà vườn một tầng) dùng 220 nhiều hơn 110 (15 so với 6) — tường
bao chiếm phần lớn chu vi khi nhà chỉ một tầng và trải rộng. Xác nhận cặp
`walls.exterior_m: 0.22` / `partition_m: 0.11`. Cột **220 × 220**.

**Mái bằng bê tông.** Độ dốc ghi **I = 1 %** (HS-03, trên cả mái nhà lẫn mái tầng), thu về phễu.
Trên mái HS-03 có **téc nước**, **thái dương năng**, và **ba ô kính lấy sáng** — một ô nằm đúng
trên ô thang. Mặt bằng tầng 2 HS-03 ghi **"thông tầng"**.

**Mái Nhật (HS-06).** Mái 13.820 × 10.570 phủ nhà 12.450 × 9.200 → **đua 600 mm ở hai cạnh, 770 mm
ở hai cạnh kia**. Ban công tầng 2 **đua 1.200 mm** ra ngoài trục Y3. Trên tờ mái có dãy kích thước
**418** lặp 11 lần (khoảng cách lớp lợp hoặc xà gồ) — **không tờ nào ghi chữ xác nhận nó là gì,
nên không suy**. **Không tờ nào ghi độ dốc mái Nhật.**

**Tổng thể (HS-06).** Nhà đặt sát góc sau–phải lô 24.300 × 15.700. Ba dòng ghi chú đáng giữ:
**"khe thoáng để lại 700"** ở mặt giáp ranh · **"cốt sân hiện trạng giữ nguyên"** · hàng rào thoáng
ở mặt đường.

### 13.16.6 Bố cục — ba kiểu mặt bằng, ba cách khác hẳn nhau

- **HS-03, liền kề trong ngõ 8 × 7,94, ba tầng.** Tầng 1: **ĐỂ XE** (cửa cuốn) chiếm nửa mặt tiền
  + P.KHÁCH & BẾP 16 m² + P.NGỦ 01 11 m² + WC 4,2 m². Tầng 2–3 mỗi tầng ba phòng ngủ
  (11 / 12,8 / 13 m²) + WC 4,2 m² + ban công. **WC chồng khít cả ba tầng, ngay cạnh thang**; thang
  ở góc trong cùng, chạy ngang nhà.
- **HS-05, liền kề mái Nhật 23,5 × 5,0, một tầng.** Tuyến tính suốt chiều sâu: sân sau – WC –
  P.BẾP & ĂN 15,5 m² – WC – ba P.NGỦ 11,5 m² mỗi phòng – P.KHÁCH 19 m² – hiên trước.
- **HS-04, mái Nhật sân vườn 14 × 9,1, một tầng.** Bếp và WC dồn về một đầu hồi, phòng thờ ở giữa
  giáp mặt sau, ba phòng ngủ ở đầu kia, phòng khách ở giữa mở ra **hiên có hai cột** phía trước.

Diện tích trên đây đọc từ **nhãn ghi trên bản vẽ**, không phải tính từ đa giác. Không dùng chúng
để sửa `rules/nvg-measured.yaml` — tệp ấy khai rõ "tính từ đa giác, KHÔNG từ nhãn", và trộn hai
cách đo vào một khoảng quan sát là làm hỏng chính con số đã có. Muốn nâng `n` của các quy tắc
diện tích thì phải dựng lại đa giác phòng từ đồ thị tim tường cho bốn hồ sơ này — việc riêng.

### 13.16.7 Ba chỗ engine đang vẽ khác hồ sơ thật

1. **Mặt bậc bị kéo giãn.** `draw/stairs.ts` rải đều `treads` bậc trên chiều dài ô thang
   (`distance = flightLength * step / stepCount`), nên mặt bậc là **hệ quả** của ô thang dài bao
   nhiêu. Hồ sơ thật làm ngược: **giữ mặt bậc 250 và để chiều dài vế chạy theo**. Hệ quả là một ô
   thang hơi ngắn vẫn ra tờ vẽ "đẹp" với bậc sâu 190, còn ngoài đời thì không xây được như vậy —
   `stair-fit.ts` có bắt việc này, nhưng chỉ khi `going_m` được khai.
2. **Không có bậc tam cấp.** Hợp đồng `ai-architectural-floorplan` không có đối tượng nào cho bậc
   ở lối vào, nên tờ vẽ engine sinh ra có cửa chính mở thẳng ra sân mà không có bậc — trong khi
   **cả ba hồ sơ có sân đều chênh 430–730 mm**. Thêm nó là sửa hợp đồng + lời dẫn + bộ vẽ +
   phép thử, tức một đợt việc riêng, không phải hệ quả phụ của đợt đo này (Q-33).
3. **Không đánh số bậc.** Hai trong bốn hồ sơ đánh số bậc trên mặt bằng. Đây là việc thuần bộ vẽ,
   rẻ, và không đụng hợp đồng.

### 13.16.8 Cái KHÔNG tìm thấy

- **`QUY CHUẨN NHÀ VIỆT ONE.docx`** nằm cùng thư mục hồ sơ là quy chuẩn **quy trình và chất
  lượng** (15 quy tắc nghề, 10 chuẩn thương hiệu, trình tự 18 bước vận hành công trình). Nó
  **không chứa một kích thước hình học nào** — không cầu thang, không bậc, không cốt. Đừng tìm
  chuẩn vẽ ở đó. Nội dung của nó thuộc về mô-đun TC/HD, không thuộc `kb/`.
- Không tờ mặt bằng nào ghi **cổ bậc** bằng số.
- Không tờ nào ghi **độ dốc mái Nhật**.
- Tờ `MB KIẾN TRÚC – TẦNG 2` của HS-06 **mất hẳn lớp tường**: 3.064 thực thể mà không có
  `NV-Tuong` lẫn `NV-NetThay` nào, chỉ còn nội thất, ghi chú và trục. Đây là hỏng của bước
  **tách tờ**, không phải của hồ sơ gốc — cùng loại rủi ro với mục 13.6 (9). Ai đo lại phải
  đối chiếu với tệp DXF hợp nhất chứ không chỉ tệp `- tach`.

### 13.16.9 Cách đo — để kiểm lại được

Cùng nguyên tắc với mục 13.14: một báo cáo không kiểm lại được thì chỉ là lời khẳng định. Đợt này
đo bằng `ezdxf` ở ngoài repo (hồ sơ là dữ liệu hạng 1), ba bước:

1. **Duyệt ĐỆ QUY vào block.** Bung một tầng `INSERT` là chưa đủ: bậc thang của HS-06 nằm trong
   block lồng block, và lượt đo đầu trả về đúng bốn bức tường mà không có bậc nào. Mục 13.6 (1)
   nói "83 % hình học nằm trong block" — nó còn nằm **sâu** hơn một tầng.
2. **Dò chùm bậc bằng hình học, không bằng tên lớp.** Gom các đoạn thẳng song song theo offset,
   tìm dãy liên tiếp cách đều 170–470 mm và chồng lấn nhau theo phương song song. Lớp `NV-Thang`
   gần như không tồn tại — NVG đặt tên lớp theo **độ đậm nét** (mục 13.6 (3)), nên tên lớp không
   dùng để tìm thang được. Cách này tìm đúng cả bậc thang lẫn bậc tam cấp, và nhận luôn cả **hàng
   trong bảng chú giải** (bước 411 mm) — phải loại bằng vị trí.
3. **Kết xuất ra PNG rồi đọc bằng mắt** (`ezdxf.addons.drawing`, backend matplotlib) để xác nhận
   thứ vừa đo là cái mình nghĩ. Ba lần trong đợt này con số nói một đằng và hình nói một nẻo; hình
   đúng cả ba lần.

⚠️ **Một cái bẫy mới của bảng mã chữ.** Hàm giải mã TCVN3 ở mục 13.14 áp **vô điều kiện** thì làm
hỏng chuỗi vốn đã là Unicode: `chính` thành `chớnh`, `mái` thành `mõi`, vì `í` (U+00ED = 237) trùng
mã byte với `ớ` trong bảng TCVN3. Phải kiểm trước: chuỗi mang ký tự ngoài Latin-1 (`ả` U+1EA3) thì
**đã là Unicode, không giải mã nữa**. `compute/src/design_compute/cad/text.py` làm đúng việc này
bằng `looks_tcvn3()` theo **kiểu chữ**; công cụ đo ngoài repo thì không, và đã dính.
