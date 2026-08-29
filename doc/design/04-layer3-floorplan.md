# 04 — Layer 3: Floor Plan Generation

Phần khó nhất và quan trọng nhất. Mọi layer sau đều dẫn xuất từ output của layer này.
Đọc hết trước khi viết code.

**Nơi chạy:** Layer 3a (sinh `LayoutIntent` bằng mô hình ngôn ngữ lớn — LLM, Large
Language Model) chạy trong **Worker/TypeScript**.
Layer 3b và 3c (bộ giải ràng buộc CP-SAT, hình học) chạy trong **Container/Python**. Xem
`02-architecture.md` mục 2.2.

**Layer 3 nhà phố nằm trong Giai đoạn 1** (Mốc 5). Biệt thự để giai đoạn sau.

## 4.1 Vì sao không để LLM sinh toạ độ

Cách tiếp cận trực giác — bảo LLM trả về `{id, x, y, w, h}` cho từng phòng — **hỏng**
vì hai lý do:

1. Các chữ nhật rời rạc do LLM sinh gần như luôn có khe hở và chồng lấn. Vá lại là
   bài toán xếp hình khó, không phải chỉnh sửa nhỏ.
2. LLM yếu về số học hình học. Bắt nó sinh toạ độ chính xác là dùng nó vào đúng việc
   nó làm kém nhất.

**Cách làm đúng: tách vai trò.**

| Ai | Làm gì | Vì sao hợp |
|---|---|---|
| LLM | Sinh **cấu trúc rời rạc**: đặt lõi ở đâu, chia ngang hay dọc, phòng nào ở nhánh nào | Đây là suy luận có tính thiết kế, không cần số |
| Solver | Gán **kích thước chính xác** thoả toàn bộ ràng buộc | Đây là tối ưu tổ hợp, máy làm tốt và tất định |

## 4.2 Hai bước: Massing rồi Slicing

### Bước A — Massing (đặt khối trong lô)

Với nhà phố bước này gần như hiển nhiên (một wing lấp kín lô). Với biệt thự đây là
quyết định lớn nhất.

Biến: vị trí và kích thước của 1–3 wing, khoảng lùi bốn phía, vị trí sân, gara.
Ràng buộc: mật độ xây dựng tối đa, khoảng lùi theo rule pack địa phương, hướng nhà.
Output: hình bao = hợp của các wing → chữ nhật đơn, hình L, U hoặc T.

### Bước B — Slicing tree cho từng wing

1. **Xác định dải lõi trước.** Vị trí cầu thang, WC, hộp kỹ thuật. Đây đúng là quyết
   định đầu tiên của KTS thật — "cầu thang giữa hay cầu thang hông" là biến thể phương
   án chính.
2. **Chia phần còn lại bằng cây cắt ngang/dọc đệ quy.** Mỗi lá là một phòng hoặc
   khoảng rỗng.
3. **Sân trong, giếng trời, thông tầng** = lá kiểu `void`, không phải phòng.
4. Các wing nối nhau qua sảnh/hành lang giao (`wing_links`).

**Tính chất then chốt:** cây chia đệ quy **lấp kín theo cấu trúc**. Không có cách nào
sinh ra khe hở hay chồng lấn. Đây không phải điều kiểm tra được — đó là điều không thể
xảy ra.

**Nhà phố là trường hợp đặc biệt của biệt thự:** một wing, setback = 0. Một code path,
không phải hai hệ thống.

## 4.3 Layer 3a — sinh LayoutIntent bằng LLM

Input đưa vào prompt:
- `SpaceProgram` + adjacency
- Ràng buộc lô đất
- 3–5 mặt bằng tham chiếu từ Knowledge Base, **serialize dưới dạng slicing tree**, không
  phải toạ độ (để LLM học đúng định dạng nó phải sinh ra)
- Tóm tắt rule pack áp dụng cho loại hình này

Output: 3–4 `LayoutIntent` **khác nhau về cấu trúc**, không phải khác nhau về vài con số.
Ví dụ khác biệt thật: lõi hông vs lõi giữa; phòng ngủ ông bà tầng 1 vs tầng lửng; bếp
mở vs bếp kín.

**Tối ưu chi phí:** phần Knowledge Base + rule pack là prefix ổn định dùng lại qua
3–4 variant × nhiều vòng trong cùng phiên. Sắp xếp prompt theo thứ tự **phần tĩnh
trước, phần động sau** để tận dụng prompt caching — cache read chỉ tính 10% giá input
gốc. Nếu trộn lẫn tĩnh/động thì tỉ lệ trúng cache gần bằng 0.

**Validate output trước khi đưa vào solver** theo mục 3.3. Lỗi cấu trúc thì reject và
sinh lại variant, **không gọi LLM để tự sửa** — vòng lặp sửa lỗi bằng LLM đắt, chậm và
không đảm bảo hội tụ.

## 4.4 Layer 3b — CP-SAT

### Vì sao CP-SAT (Constraint Programming — Satisfiability) chứ không phải scipy

| | CP-SAT | scipy.optimize |
|---|---|---|
| Biến nguyên (lưới xây dựng) | Có | Không |
| Ràng buộc tổ hợp | Có | Không |
| Đảm bảo tối ưu / chứng minh vô nghiệm | Có | Không |
| **Giải thích được vì sao vô nghiệm** | **Có — cơ chế assumptions (giả định) trả về conflict set (tập ràng buộc mâu thuẫn)** | **Không** |
| Nhiều tầng nhiều wing trong một model | Có | Không thực tế |

Điểm cuối cùng là điểm quyết định. Cơ chế giả định này cho ra `InfeasibilityReport`
(mục 3.5) — chính là tính năng Impact Analysis mà sản phẩm cần. Không có nó thì hệ
thống chỉ nói được "không hợp lệ" mà không nói được *cái gì xung đột với cái gì*.

### Mô hình hoá

**Đơn vị:** milimét, số nguyên. Lưới module (thường 100mm) để tránh kích thước lẻ.

**Biến chính:**
- Với mỗi nút split trong cây: vị trí đường cắt (số nguyên mm)
- Vị trí và kích thước lõi (dùng chung giữa các tầng)
- Toạ độ các trục kết cấu (dùng chung giữa các tầng)
- Chiều cao mỗi tầng

Toạ độ và kích thước từng phòng **là biến dẫn xuất** từ các đường cắt — không khai báo
độc lập. Đây là lý do không thể có chồng lấn.

**Ràng buộc cứng (severity: error trong rule pack):**
- Diện tích mỗi phòng trong `[min_area, max_area]`
- Kích thước cạnh nhỏ nhất mỗi loại phòng
- Bề rộng hành lang ≥ ngưỡng quy chuẩn
- Mọi phòng có ít nhất một lối vào
- Phòng cần chiếu sáng tự nhiên phải tiếp giáp mặt thoáng
- Tường chịu lực thẳng hàng giữa các tầng
- Lõi chồng đúng vị trí giữa các tầng
- Khoảng lùi theo quy chuẩn địa phương
- Kích thước là bội số của module xây dựng

**Hàm mục tiêu (mềm, có trọng số):**
- Tối thiểu sai lệch so với `target_area_m2`
- **Tối thiểu sai lệch so với thống kê thực nghiệm từ Knowledge Base** — xem
  `06-knowledge-base.md`. Đây là cách đưa "gu NVG" vào mà không cần LLM
- Tôn trọng `ratio_hint` từ LayoutIntent (trọng số thấp)
- Thoả các quan hệ `adjacency` mềm
- Tối thiểu diện tích giao thông

### Giải đồng thời nhiều tầng — bắt buộc

**Không giải từng tầng rồi kiểm tra nhất quán.** Lõi thang, trục tường chịu lực và
hộp kỹ thuật là **biến dùng chung**; nếu giải riêng thì tính nhất quán chỉ là may mắn.

Hệ quả trực tiếp: khi khách đổi từ 3 tầng sang 4 tầng, chỉ cần thêm một khối biến vào
cùng model, giữ nguyên lõi và trục, giải lại. Kết quả tính bằng giây và **đảm bảo cả
4 tầng nhất quán**. Hiện tại Phòng Thiết kế phải sửa tay 15–20 bản vẽ trong 3–5 ngày
cho đúng tình huống này.

### Ngân sách thời gian và giới hạn phần cứng

Container có **~0,5 vCPU**, nên CP-SAT phải chạy `num_search_workers=1`. Đây là hạn chế
thật: CP-SAT bình thường chạy song song nhiều chiến lược tìm kiếm trên nhiều nhân.

- Timeout khởi điểm: 60s cho nhà phố. Đo lại ở Mốc 0.2 và điều chỉnh
- Hết giờ mà chưa tối ưu → trả nghiệm khả thi tốt nhất tìm được, `status: "warning"`
- Không bao giờ để treo vô hạn
- Ghi `solve_time` vào metrics mọi lần chạy — đây là chỉ số quyết định có phải chuyển
  container sang VPS hay không

Vì container đĩa ephemeral và stateless: không cache warm start giữa các lần gọi. Nếu
cần, cache hint nghiệm trong artifact chứ không trên đĩa.

## 4.5 Layer 3c — tinh chỉnh hình học

Sau khi có nghiệm: căn chỉnh tường thẳng hàng, gộp mảnh vụn, làm tròn về module, sinh
danh sách `walls` và `openings` từ polygon phòng.

Output là `FloorPlan` đầy đủ, sẵn sàng cho editor, DXF và 3D.

## 4.6 Editor và kiểm tra realtime

Khi KTS kéo một bức tường, đó là **đổi tỉ lệ một nút trong cây**, không phải di chuyển
một đường thẳng độc lập. Nhờ vậy các phòng lân cận tự co giãn và không bao giờ hở.

Hai tầng kiểm tra:

| Tầng | Nơi chạy | Làm gì |
|---|---|---|
| Nhanh | Trình duyệt, Rust biên dịch sang WebAssembly (WASM) | Chồng lấn, kích thước tối thiểu, bề rộng hành lang. **Chỉ kiểm tra, không giải** |
| Đầy đủ | Máy chủ, bộ giải CP-SAT | Giải lại, đề xuất phương án điều chỉnh, giải thích vô nghiệm |

Cả hai đọc **cùng một rule pack**. Engine là code, luật là dữ liệu — nên không lệch nhau.

CP-SAT không biên dịch sang WebAssembly được; đừng cố đưa bộ giải vào trình duyệt.

**Có thể lùi:** bỏ tầng WASM ở bản đầu, validate qua WebSocket, chấp nhận ~100ms trễ.
Không chặn kiến trúc, nhưng phải giữ rule pack là nguồn chung ngay từ đầu.

## 4.7 Flow chỉnh sửa

```
EDIT → IMPACT ANALYSIS → PROPOSE OPTIONS → REGENERATE → REVIEW
```

Ví dụ: KTS tăng phòng ngủ master từ 14m² lên 18m².

1. Editor gửi ràng buộc mới lên solver
2. Solver chạy với ràng buộc bổ sung. Nếu vô nghiệm → `InfeasibilityReport` với
   conflict set
3. Hệ thống sinh 2–3 phương án điều chỉnh từ `suggested_relaxations`, mỗi phương án
   giải lại và kèm danh sách thay đổi
4. KTS chọn → tạo `FloorPlan` artifact mới → `project_head` trỏ sang bản mới → Layer
   4 và 5 regenerate

Bước 3 là lý do tồn tại của `InfeasibilityReport`. Không có conflict set thì không
sinh được phương án điều chỉnh có ý nghĩa.

## 4.8 Khác biệt khi mở rộng sang biệt thự

Đọc lại khi bắt đầu Mốc 7. Đừng giả định code nhà phố chạy được ngay cho biệt thự.

| | Nhà phố | Biệt thự |
|---|---|---|
| Số wing | 1 | 1–3, hình L/U/T |
| Setback | 0 | Bốn phía, theo quy chuẩn địa phương |
| Số lõi | 1 | 1–2 (chính + phụ/dịch vụ) |
| Void | Hiếm (giếng trời) | Thường xuyên (sân trong) |
| Massing | Hiển nhiên | **Bài toán tối ưu riêng** |
| Nguồn thu hẹp lời giải | Ràng buộc hình học tự thu hẹp | **Chất lượng đầu vào** — phong cách, hướng, quan hệ trong ngoài, ý đồ |
| Rule pack | `applies_to: [nha_pho]` | Bộ rule riêng, nhiều quy tắc mang tính ý đồ hơn |

**Ngưỡng chấp nhận đặt bằng nhau cho mọi loại hình.** Nếu đo thấy biệt thự thấp hơn, cách
xử lý là làm giàu đầu vào ở Layer 1 và bổ sung rule, **không phải hạ ngưỡng**. Hạ ngưỡng
là biến chênh lệch tạm thời thành chuẩn mực vĩnh viễn.
