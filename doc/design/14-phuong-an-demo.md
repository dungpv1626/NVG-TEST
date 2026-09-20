# 14 — Phương án ra bản demo: đơn giản hoá, tự gỡ vướng mắc

> ⚠️ **LỊCH SỬ — bộ giải nội bộ mà phương án này dựng demo đã gỡ hẳn (T58, 19/09/2026).** Sáu trong
> mười cảnh (3–9) không còn; bài Playwright chỉ còn các cảnh không thuộc bộ giải.
>
> **Trạng thái: ĐÃ CHỐT (Haan, 06/09/2026) — đã thi hành đủ bảy bước trong cùng ngày.**
> Tài liệu này THAY mục 13.12 làm thứ tự thi hành; kết quả từng bước ghi ở
> `TIEN_DO_THIET_KE.html` mục 3. Điều kiện "demo xong" ở 14.2 đã đạt: bài Playwright mười cảnh
> (`web/e2e/demo-thiet-ke.spec.ts`, `npm run test:e2e`) xanh trên máy phát triển.
>
> Chỉ đạo gốc: *giải quyết các vướng mắc theo phương châm đơn giản hoá, đạt mục tiêu bằng mọi
> cách; đã đủ thông tin, các vướng mắc tự giải quyết ở phía team dev; ra một bản demo ấn tượng.*

---

## 14.1 Ba nguyên tắc rút ra từ chỉ đạo

1. **Bản demo là thước đo, không phải bảng mốc.** Việc nào không hiện lên trong một cảnh demo
   thì không nằm trên đường găng — dù tài liệu có xếp nó ở Mốc nào.
2. **Team tự chốt, ghi thành DỮ LIỆU có thể đổi.** Mọi câu hỏi đang chờ (16 câu) được trả lời
   bằng một giá trị mặc định đặt trong `kb/`, `rules/`, `config/` hoặc bảng tham số — kèm dòng
   `nguon: team-mac-dinh`. Kiến trúc sư NVG sửa sau bằng cách sửa tệp, không phải sửa mã. Không
   câu nào còn chặn việc viết mã.
3. **Ba nguyên tắc bất biến KHÔNG đơn giản hoá được**: mô hình ngôn ngữ không sinh toạ độ (#2),
   một nguồn hình học (#5), engine không phát hành nội dung KC/DN/PCCC (#9). Đơn giản hoá nằm ở
   *phạm vi* và *cách nối*, không ở ranh giới.

---

## 14.2 Bản demo là gì — mười cảnh

Đề bài dùng ví dụ NVO-028 của `11-design-flow.md` 11.6 (lô 5 × 18 m, 4 tầng, ba thế hệ) —
dữ liệu bịa, hạng 3, không chạm hồ sơ khách. Người xem: Ban Giám đốc và kiến trúc sư NVG.

| # | Cảnh | Người xem thấy gì | Hiện có? |
|---|---|---|---|
| 1 | Đầu bài | Nhập đầu bài trong 5 phút, vẽ thửa từ ảnh trích lục, điểm đầy đủ | **Có** |
| 2 | Khảo sát hiện trạng | Biên bản đo + ảnh hiện trạng đính kèm | Biên bản có, **ảnh chưa** |
| 3 | Chương trình không gian | Danh sách phòng theo tầng, chốt một bản | **Có** |
| 4 | Sinh phương án | Một nút → **3 phương án** (thang hông · thang giữa · bếp mở) trong vài giây, bảng so sánh bằng ngôn ngữ khách | Bộ giải có; **không gọi được từ API** (V-10), không có màn hình |
| 5 | Bản vẽ đọc được | Mặt bằng từng tầng **trông như bản vẽ thật**: trục có bong bóng, kích thước hai lớp, tường đậm, cửa có cung quay, thang có bậc, khung tên A3. Bật/tắt tô màu công năng | **Chưa** — V-9 |
| 6 | Khối 3D | Xoay khối trắng trên trình duyệt, nhãn "Khối sơ bộ" | **Chưa** |
| 7 | Khách đổi ý: 5 tầng | Đổi số tầng → giải lại → mọi tờ, thống kê, khối 3D đổi theo; phương án cũ còn trong lịch sử | Bộ giải làm được; **không có luồng** |
| 8 | Bàn giao | Tải DXF mở trong AutoCAD với lớp `NV-*` quen thuộc; tải XLSX thống kê cửa và diện tích | DXF sơ đồ có; **lớp sai quy ước, không thống kê** |
| 9 | Phối cảnh | Ảnh tham khảo từ khối 3D, có nhãn "chưa phải phương án thi công" | **Chưa** — chặn ở khoá Gemini |
| 10 | Số hoá hồ sơ cũ | Tải một DWG thật → hệ thống đọc ra **52 tờ** với mã, tên, tỷ lệ, bảng cửa, lưới trục | Thuật toán có ở `bench/`, **chưa vào extract.py** |

Cảnh 7 là cảnh quan trọng nhất — nó là "3–5 ngày sửa 15–20 bản vẽ" của khảo sát rút xuống vài
giây, và đã là điều kiện ra của Mốc 5. Cảnh 5 là thứ kiến trúc sư dùng để quyết định có tin hay
không. Cảnh 6 và 9 là thứ khách hàng nhìn.

**Điều kiện "demo xong":** kịch bản mười cảnh chạy được bằng **một bài Playwright** trên máy
phát triển (Vite + Wrangler dev + Docker), và Haan tự đi qua mười cảnh không gặp lỗi chặn.

---

## 14.3 Bốn chỗ cắt lớn — và vì sao cắt được

| Cắt | Thay bằng | Vì sao không mất gì với demo |
|---|---|---|
| **Trình chỉnh sửa mặt bằng Konva** (Mốc 5) | Trình XEM chỉ đọc bằng SVG do Container sinh; sửa = đổi tham số rồi giải lại | TK-13 nói "đổi một thông số quan trọng → phân tích tác động", không nói kéo thả. Cảnh 7 chính là TK-13. Konva là khối việc lớn nhất Mốc 5 mà không mở thêm cảnh nào |
| **Dựng đa giác phòng từ tim tường** (V-8 bậc 2) | Chỉ làm bậc 1: tách tờ, đọc ATTRIB, vào block, kiểm kê | Q-27 đóng tầng thống kê (cần 15 công trình); đa giác phòng của 2 hồ sơ không nuôi được Lớp 2. Cảnh 10 chỉ cần bậc 1 |
| **Cloudflare Containers + R2 + Workflows** cho đường chạy demo | Docker tại chỗ qua `DESIGN_COMPUTE_URL` (đã có); tuyến đồng bộ thay Workflow cho Lớp 3 | Demo chạy trên máy phát triển. Nâng gói là quyết định tiền, không phải điều kiện của bất kỳ cảnh nào. V-2 và Q-9 rời đường găng |
| **Mặt đứng, mặt cắt, phôi KC/DN, biệt thự** | Sau demo | Không cảnh nào cần. Mặt đứng có thể thêm ở bước 4b nếu dư sức — nó chỉ là một phép chiếu khác trên cùng mô hình tờ |

---

## 14.4 Vướng mắc — team tự gỡ

| # | Vướng mắc | Quyết định | Đổi lại ở đâu |
|---|---|---|---|
| V-10 | Lớp 3a→5 không gọi được từ API | Thêm tuyến **đồng bộ** `POST /design/floor-plan/generate`: gọi thẳng `layoutIntent` + `solveFloorPlan` cho từng biến thể trong `LAYOUT_VARIANTS`, ghi artifact + head. Bộ giải 6 ms, Worker chỉ chờ HTTP — không cần Workflow. `DesignPipeline` giữ nguyên cho đường dài sau | Một tệp route; Workflow nối lại khi cần chạy nền |
| V-9 | Ba năng lực nền chưa ai sở hữu | **Mô hình tờ (`SheetModel`) trong Container**: một cấu trúc trung gian gồm nét, cung, chữ, DIMENSION, khối khung tên — sinh từ `FloorPlan` đúng MỘT lần, rồi xuất ra **DXF** (ezdxf) và **SVG** (trình duyệt chỉ hiển thị). Tám yếu tố của 12.8 cài ở đây, một lần | `compute/.../cad/sheet.py` mới; `export.py` và tuyến SVG cùng đọc nó |
| V-8 | Trích xuất thấy 1/6 bản vẽ | Chỉ **bậc 1**: `virtual_entities()` vào block · tách tờ theo INSERT khung tên (đưa thuật toán `bench/khaosat_dxf.py` vào `extract.py`) · đọc ATTRIB → danh mục tờ, lưới trục, bảng cửa. Đa giác phòng: **không làm** | `extract.py`; kết quả mới là `sheets[]` bên cạnh `floor_plans[]` |
| V-7 | Chuẩn diện tích và cấu tạo chưa ai soát | Coi số hiện có là **chuẩn tạm của team**, ghi `nguon: team-mac-dinh` vào `space_norms.yaml`; giao diện hiện đúng câu đã có: "theo quy chuẩn và chuẩn nghề nghiệp" | Kiến trúc sư sửa YAML |
| V-3 | Rule pack chưa ai soát | Như V-7. 27 quy tắc dẫn QCVN/TCVN đã có nguồn từng dòng; sai ở đâu sửa dòng đó | `rules/base/*.yaml` |
| V-4 | Tập giả định mâu thuẫn chưa tối thiểu | Rút gọn bằng **deletion filter** — bỏ từng giả định, giải lại, giữ nếu vẫn vô nghiệm. Mỗi lần giải 6 ms nên rẻ; có kiểm thử canh | `solver/model.py` |
| V-2 | Chưa đo trên hạ tầng thật | **Rời đường găng.** Demo chạy Docker tại chỗ | Đo lại khi nâng gói |

---

## 14.5 Câu hỏi — team tự chốt mặc định

Nguyên tắc: mặc định là **dữ liệu**, có dòng nguồn, kiến trúc sư đổi được mà không cần dev.

| # | Câu hỏi | Mặc định chốt | Ghi ở |
|---|---|---|---|
| Q-24 | Bảng tên lớp khi xuất | **Quy ước `NV-*` của chính NVG** (đo được: `NV-Tuong`, `NV-Cua`, `NV-Dim`, `NV-Truc`, `NV-GhiChu`, `NV-NoiThat`); tên chưa đo được đặt cùng họ (`NV-CuaSo`, `NV-Thang`, `NV-KhungTen`). Người vẽ mở file thấy tên quen là món tạo tin cậy rẻ nhất | `kb/layer_mapping.yaml` mục `export:` |
| Q-25 | Chiều cao tầng | **3,6 m** mặc định, tầng trên cùng 3,9 m; là tham số của từng đầu bài, `FloorPlan.levels[].height_m` mang ra thật (bỏ hằng 3,4 m trong stub) | `kb/construction_norms.yaml` (đã có) |
| Q-18 | Chuẩn diện tích Lớp 2 | Giữ số hiện có làm chuẩn tạm — theo Q-27 không có đường dữ liệu nào khác trong demo | `kb/space_norms.yaml` |
| Q-21 | Chuẩn cấu tạo | Đã thay bằng số đo HS-01 ngày 06/09; phần còn lại giữ | `kb/construction_norms.yaml` |
| Q-23 | Ngưỡng trích xuất đạt | Tách tờ **≥ 90 %** trên ba tập có khối khung tên; lưới trục đủ nhãn; bảng cửa ≥ 90 % dòng của `kt/51`. Tập không có khối khung tên phải **báo rõ** là đi đường gom cụm | `compute/tests/`, đo trên HS-01/HS-02 |
| Q-10 | TCVN có chặn phát hành? | **QCVN = lỗi (chặn), TCVN = cảnh báo** | `rules/base/*.yaml` trường `severity` |
| Q-11 | Lệch diện tích giữa tầng | **Cho phép** — V-5 đã gỡ ràng buộc ép | Không đổi |
| Q-1 | Khung làm việc thiết kế có phải mẫu bố cục thứ 8? | **Không có mẫu mới.** Toàn bộ nằm trong tab "Phương án kiến trúc" của Hồ sơ 360° (mẫu 3), light mode, chữ 14 px như phần còn lại. Bản vẽ là một SVG cuộn/phóng được bên trong tab | `design-detail.tsx` |
| Q-9 | Khi nào nâng Workers Paid | **Không cần cho demo.** Nâng khi đưa ra ngoài máy phát triển | — |
| Q-15 / phối cảnh | Khoá miễn phí không có hạn mức ảnh | Hai tầng: **(a)** ảnh khối từ chính trình duyệt (three.js chụp canvas) luôn có; **(b)** cùng nút gọi `gemini-2.5-flash-image` khi có khoá trả phí. Thiếu (b) demo vẫn có cảnh 9, chỉ kém đẹp | `config/models.yaml` cờ `enabled` |
| Q-26 | Đầu bài của hồ sơ cũ | **Không tái dựng.** Few-shot bắt đầu từ dự án mới (Q-28). Cảnh 10 chỉ là tra cứu | — |
| Q-14 · Q-16 · Q-19 · Q-20 | Danh sách lựa chọn, thửa không vuông | Giữ nguyên | `shared/src/design/brief-form.json` |
| Q-3 · Q-5 | Mâu thuẫn nội bộ tài liệu, số phiên bản | Dọn một lượt ở bước 7, không chặn | `doc/design/README.md` |

Sau bước này, mục 6 của `TIEN_DO_THIET_KE.html` đổi tên thành **"Mặc định team đã chốt — NVG
có thể đổi"**, và không còn câu nào ở trạng thái chờ.

---

## 14.6 Ba điểm đơn giản hoá kỹ thuật

### (a) Tuyến đồng bộ cho Lớp 3, Workflow để sau

`DesignPipeline` (Cloudflare Workflow) đúng cho đường chạy dài có retry, nhưng Lớp 3 giải trong
mili-giây và demo cần kết quả ngay trên màn hình. Một tuyến Hono đồng bộ gọi cùng các hàm bước
(`steps.ts`) là đủ, kiểm thử được dưới Node thuần, và không phụ thuộc runtime Workflow khi chạy
`wrangler dev`. Workflow không bị xoá — nó nối lại khi có việc chạy nền thật (số hoá hàng loạt).

### (b) Một mô hình tờ, hai đầu ra

```
FloorPlan ──► SheetModel (Container, Python) ──► DXF   (ezdxf: LINE/ARC/TEXT/DIMENSION/INSERT+ATTRIB)
                     │
                     └──────────────────────────► SVG   (trình duyệt chỉ hiển thị, không dựng gì)
```

Đây là cách duy nhất giữ được nguyên tắc #5 mà không viết hai bộ mã vẽ. Trình duyệt **không**
có Konva, không có logic hình học; nó nhận SVG đã có sẵn bong bóng trục và kích thước. Tô màu
công năng là một `class` CSS trên đa giác phòng, bật tắt không cần gọi lại máy chủ.

Khung tên là **BLOCK có ATTRIB** theo họ `semantic_kt` (`KHBV`, `TBV`, `TL`, `HM`, `HT`) — đúng
họ mà HS-01 KT dùng. Nhờ đó tệp engine xuất ra được chính `extract.py` đọc lại thành một tờ:
**sinh và đọc dùng chung một quy ước**, và đó là một phép thử vòng tròn tự nhiên.

### (c) Khối 3D: Container đùn, trình duyệt xem

`trimesh` đùn từng phòng theo `height_m` → glTF, lưu thành artifact `arch_model` thật (thay
stub). Trình duyệt dùng three.js (`GLTFLoader`) chỉ để xem — đúng bảng ánh xạ công nghệ của
PRD (TK-15: Three.js). Chụp canvas → PNG là đầu vào của tuyến phối cảnh.

---

## 14.7 Thứ tự thi hành — bảy bước, mỗi bước có tiêu chí đo được

Không có ngày. Mỗi bước kết thúc bằng một cảnh demo chạy được, và cập nhật trang tiến độ ngay.

| Bước | Làm gì | Cảnh mở ra | Tiêu chí xong | Kiểm thử |
|---|---|---|---|---|
| **1. Gỡ kẹt + nền** | Tuyến `POST /floor-plan/generate` (3 biến thể, ghi artifact/head); tab "Phương án" liệt kê biến thể với bảng so sánh; `height_m` phát ra từ bộ giải; ảnh hiện trạng đính kèm biên bản khảo sát (dùng lại `site-image-upload.tsx` + Storage) | 2 · 4 | Từ đầu bài tới 3 `floor_plan` qua API; tuyến DXF hết 409 | vitest tuyến; pytest `height_m` |
| **2. Mô hình tờ** | `sheet.py`: lưới trục + bong bóng hai đầu · chuỗi kích thước hai lớp bốn cạnh · tường đậm · cửa cung quay · cửa sổ nét đôi · thang đủ bậc có mũi tên · ký hiệu mặt cắt · khung tờ A3 + khung tên BLOCK/ATTRIB. Đầu ra DXF (lớp `NV-*`) và SVG. Trình xem SVG trong tab, tô màu công năng | 5 · 8 (DXF) | DXF mở trong AutoCAD/ODA có đủ 8 yếu tố; `extract.py` đọc lại được tờ vừa xuất (mã tờ, tỷ lệ, lưới trục); SVG hiện đúng trong tab | pytest đếm DIMENSION/ARC/INSERT; vòng tròn xuất→đọc; vitest trình xem |
| **3. Thống kê + bàn giao** | `schedules` thật từ `openings[]` và `rooms[]` (hợp đồng đã có) → bảng trên màn hình + XLSX; đặt tên tệp; nút tải trong tab | 8 | Đổi mặt bằng → bảng đổi; XLSX mở được | pytest/vitest |
| **4. Khối 3D** | `trimesh` đùn → glTF → artifact `arch_model` thật; three.js viewer trong tab; nhãn "Khối sơ bộ" do mã chèn | 6 | Xoay được; số tầng và cao độ khớp `FloorPlan` | pytest glTF hợp lệ; vitest nhãn |
| **5. Đổi ý và tác động** | Đổi số tầng / ghim phòng trong đầu bài → giải lại giữ lõi thang và trục; so sánh hai bản; lineage ghi sự kiện; V-4 rút gọn tập giả định; thông báo vô nghiệm bằng tiếng Việt chỉ đúng phòng | 7 | 4 → 5 tầng dưới 10 s, mọi tờ/thống kê/khối 3D sinh lại; bản cũ còn xem được | pytest deletion filter; E2E cảnh 7 |
| **6. Phối cảnh + số hoá** | (a) chụp canvas → ảnh khối luôn có; (b) tuyến `layer5_render` gọi Gemini khi khoá trả phí, nhãn do mã chèn; (c) `extract.py` bậc 1 + màn hình danh mục tờ | 9 · 10 | HS-01 KT → ≥ 47/52 tờ có mã và tên; ảnh có nhãn và đúng số tầng | pytest trên tệp thật ngoài repo (bỏ qua nếu thiếu); vitest |
| **7. Phát hành + kịch bản** | Publish bridge với DXF/PDF thật vào hệ tài liệu; seed dự án demo NVO-028; bài Playwright mười cảnh; dọn Q-3/Q-5 và đính chính README | 1→10 | Bài Playwright xanh; Haan đi qua mười cảnh không lỗi chặn | Playwright |

**4b (nếu dư sức sau bước 4):** mặt đứng bốn hướng — phép chiếu tường và lỗ mở lên cùng
`SheetModel`, dùng lại bộ chú thích của bước 2. Mở thêm một loại tờ với chi phí thấp.

Thứ tự này khác 13.12 ở hai chỗ có chủ đích: **bộ chú thích lên bước 2** (trước khối 3D) vì nó
là thứ kiến trúc sư nhìn vào để tin, và **số hoá hồ sơ cũ xuống bước 6** vì cảnh 10 độc lập với
chín cảnh còn lại.

---

## 14.10 Sau khi thi hành — những gì còn khác với phương án

- **Bước 3 chưa đúc artifact `schedules`, bước 6 chưa đúc `render_result`**: cạnh lineage chỉ
  nhận các bước đã khai trong CHECK của `design_artifact_edge`, và ảnh cần kho tệp nhị phân (R2).
  Bảng thống kê tính lại từ mặt bằng mỗi lần gọi nên không mất gì về nghiệp vụ.
- **Phát hành** đưa một tờ DXF cho mỗi tầng vào kho artifact và MỘT phiên bản tài liệu (tệp
  tầng 1) qua publish bridge; PDF chưa có. Đủ cho cảnh 9, chưa phải bộ hồ sơ.
- **Phương án B** (hành lang bên phải) vô nghiệm trên đề bài demo (V-12) — demo chạy với hai
  phương án A và C.
- **Tỉ lệ giao thông** còn 25–33 % (`ratio_of_floor` 0,12 mỗi tầng). Là dữ liệu, kiến trúc sư
  NVG chỉnh trong `kb/space_norms.yaml`.
- **Q-3, Q-5 (tài liệu)**: chốt mặc định — `doc/design/*.md` là nguồn sự thật cho TK-10→17;
  các bản `.docx` v02/v03/v04 là bản trình bày, không so phiên bản với nhau; ba mâu thuẫn nội bộ
  đã được đính chính ở `README.md` (Đ1–Đ11) và không sửa vào bản gốc.

## 14.8 Hai việc chỉ Haan làm được

1. **Khoá Gemini trả phí** cho tuyến ảnh (`gemini-2.5-flash-image`). Không có thì cảnh 9 dùng
   ảnh khối từ trình duyệt — vẫn có, kém đẹp. Đây là quyết định tiền, không chặn bước nào.
2. **Chốt phương án này** — một chữ "làm" hoặc sửa từng dòng ở 14.4/14.5. Mọi mặc định đều
   đổi được sau bằng dữ liệu, nên chốt sai rẻ hơn chờ.

---

## 14.9 Rủi ro còn lại — không đơn giản hoá được

| Rủi ro | Cách giữ |
|---|---|
| Ảnh Gemini lệch khối so với phương án | Nghiệm thu bằng đối chiếu số tầng, số nhịp, ban công — không bằng cảm nhận (13.13c). Nhãn "chưa phải phương án thi công" do mã chèn |
| Chuẩn diện tích là số của team, không phải của NVG | Giao diện nói thẳng "theo quy chuẩn và chuẩn nghề nghiệp", không nói "theo NVG". Kiến trúc sư đổi YAML là xong |
| Demo chạy trên máy phát triển | Bài Playwright chạy trước mỗi lần trình diễn; Docker image dựng lại sau mỗi đổi `compute/` (bài học 06/09: ảnh cũ làm 2 test đỏ giả) |
| Bộ chú thích là việc lớn nhất | Không có đường vòng. Tách nhỏ theo yếu tố, mỗi yếu tố một kiểm thử đếm thực thể, hiện dần lên SVG để thấy tiến độ |
