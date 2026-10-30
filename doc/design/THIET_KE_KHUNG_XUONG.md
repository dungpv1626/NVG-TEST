# Thiết kế «khung xương trước» — chương trình dựng lõi và hành lang, mô hình chỉ xếp phòng vào khung

> Trạng thái: **đề xuất + đã làm bản đầu (T102, 29/09/2026)** — Haan yêu cầu «đưa ra phương án cải tiến, kể cả tái
> cấu trúc, rồi implement». Căn cứ: `PHAN_TICH_THAT_BAI_MAT_BANG.md` (77 % vòng hỏng vì giao thông), `THIET_KE_B2.md`
> (B2 dừng ở bước 1), và lịch sử 87 lượt chạy thật trong `design_ai_run` (13 ra mặt bằng / 64 hỏng ở giai đoạn
> mặt bằng; từ T48 tới 28/09: 1 / 17).

## 1. Chẩn đoán — góc nhìn kiến trúc sư

Kiến trúc sư nhà ở Việt Nam không bao giờ vẽ mặt bằng bằng cách «tô từng ô một mét». Trình tự nghề là:

1. **Lõi đứng trước** — ô thang (đủ dài cho số bậc), thang máy nếu có, giếng trời, hộp kỹ thuật và **trục ống
   nước** (các WC chồng nhau). Lõi được đặt MỘT LẦN cho cả nhà: nhà phố thì áp một tường bên ở giữa chiều sâu,
   biệt thự thì cạnh sảnh vào. Mọi tầng đều bám đúng ô ấy.
2. **Hành lang từ chiếu nghỉ** — lên tới tầng nào cũng bước ra một sảnh tầng / hành lang nối thẳng với ô thang.
   Hành lang có ba dạng quen: **dải ngang** trước hoặc sau ô thang (nhà rộng), **dải dọc** áp tường bên chạy suốt
   chiều sâu (nhà phố hẹp), hoặc **chữ H / T** (cả hai). Mọi phòng riêng mở cửa ra hành lang hay ra khu chung
   (khách – ăn – bếp là một khu đi xuyên được).
3. **Phòng lấp vào các túi** quanh hành lang: dải trước (phòng khách / phòng ngủ chính có ban công), dải sau
   (bếp / phòng ngủ), cột phụ trợ áp hành lang (WC chung, giặt, kho, thang máy). WC khép kín là một dải dọc một
   cạnh phòng mẹ, quay về trục ống nước; ban công là dải áp mặt thoáng của phòng nó thuộc về.
4. **Kích thước sau cùng** — chia phần dư của tầng theo nhu cầu từng phòng, không dồn về một chỗ.

Hệ thống hiện tại bắt mô hình ngôn ngữ làm cả bốn bước cùng lúc trên một bảng chữ 12 × 16 ô, và bước 2 (liên
thông) là bước nó kém nhất: 52/105 vòng phòng không chạm hành lang, 18 vòng ô thang cô lập, hành lang vỡ thành
3–4 mẩu (lượt 6bbc6d0e: `p2a`, `p2b`, `p2c`, `h2`). Chương trình lại đối xử với các mẩu hành lang ấy như bốn
phòng phải xếp đúng chỗ, và khi bản phác hỏng thì «xếp lại theo vùng» bằng bộ đóng gói mà lối vào chỉ là một khoản
phạt mềm — nên 0/105 vòng tự ra mặt bằng (T94 nâng lên 6/105).

**Mô hình làm tốt:** danh mục phòng đúng đầu bài, diện tích mục tiêu hợp lý, phòng nào ở tầng nào, phòng nào
trước – sau – trái – phải, cặp phòng nào gần nhau, WC tầng trên vẽ đúng trên WC tầng dưới (đo T99). **Mô hình làm
dở:** hành lang liên tục, phòng chạm hành lang đủ dài để đặt cửa, ô thang chạm hành lang, giữ tất cả ràng buộc
cùng lúc khi sửa (143 lỗi gỡ / 154 lỗi mới). **Chương trình làm tốt:** cổng hình học, cửa – cửa sổ – bậc thang, chấm
điểm, tờ vẽ, DXF, sửa theo yêu cầu. **Chương trình làm dở:** DỰNG — chỉ kiểm rồi bác, cách «cứu» duy nhất là chia lại
cả tầng bằng bộ đóng gói mù về giao thông.

## 2. Phương án: khung xương trước (`arrange/skeleton.ts`)

**Phân vai mới.** Mô hình vẫn trả đúng hợp đồng cũ (`ai-house-intent`, bản phác lưới) — bản phác chỉ còn là **gợi ý
vị trí** (phòng nào dải trước / dải sau / cột phụ trợ, thứ tự trái → phải, ban công thuộc phòng nào). Chương trình
**dựng khung**: ô thang đúng mốc, hành lang nối ô thang theo một trong vài dạng quen, rồi lấp phòng vào các túi
theo cách mà **mọi phòng cần cửa đều chạm hành lang hay khu chung NGAY KHI DỰNG** — lối vào là bất biến của cách
dựng, không phải phép kiểm sau.

```
                 y0 (mặt đường)
  ┌──────────────────────────────┐
  │  DẢI TRƯỚC: [bc][phòng][wc] │ ...  ← mỗi cột một cụm: ban công áp mặt thoáng, phòng, WC khép kín quay về hành lang
  ├──────────── HF ─────────────┤      ← dải hành lang ngang (tuỳ chọn)
  │ S │ E │ V │ cột phụ trợ │ … │      ← dải lõi: thang S, thang máy E, dải dọc V áp thang, WC chung / giặt / kho áp V
  ├──────────── HB ─────────────┤      ← dải hành lang ngang (tuỳ chọn)
  │  DẢI SAU: [phòng][wc][bc]   │
  └──────────────────────────────┘
```

Chương trình liệt kê **các biến thể khung** và để cổng + thước chấm chọn (Haan T96: «không fix cứng quy tắc»):

- có / không dải ngang trước `HF`, có / không dải ngang sau `HB` (dải trước của tầng 1 thường không cần: khách –
  ăn – bếp tự là lối đi; dải sau cần khi có hơn một phòng ngủ phía sau);
- dải dọc `V` áp thang, phía không có tường; thang giữa nhà thì thử cả hai phía;
- phòng mô hình đặt ở dải lõi mà cột phụ trợ không chứa nổi thì đẩy sang dải trước / sau (biến thể).

Mọi con số vẫn do chương trình gán bằng cùng bộ hàm cũ (`splitLengths`, `slices`, `chain` của `placed.ts`); cây ra
đi đúng đường `emitCandidate → gateCandidates → best` của mọi ứng viên khác nên **toàn bộ cổng, cửa, cửa sổ, luật
bắt buộc T71, thước 3 và tờ vẽ giữ nguyên**.

### 2.1 Vào đâu trong luồng

`arrangeLevel`: bản phác của mô hình vẫn đi TRƯỚC (qua cổng thì giữ nguyên — T100). Bản phác hỏng → **khung xương**
(mới) → rồi mới tới các vòng khung cũ (`runRings`, chèn hành lang). Tầng xếp được bằng khung xương mang ghi chú
`skeleton_arranged` và đi qua đúng cơ chế «qua nhờ chia lại» của T86 / T90: lỗi bản phác đi cùng câu nhắc, mô hình
nhận lại cách chia thật.

### 2.2 Hành lang là MỘT ngân sách

Mọi lá `circulation` của tầng gộp thành một ngân sách diện tích; các đoạn hành lang của khung (`HF`, `V`, `HB`)
nhận mã của các lá ấy (đoạn lớn nhận mã lớn), thiếu mã thì thêm không gian mới vào chương trình (như `corridorTees`
V-29 đã làm), thừa mã thì chia đoạn dài nhất. Hai đoạn kề nhau nối bằng ô thông suốt vách (`open_flow`).

### 2.3 Cụm phòng (cluster) — thứ mô hình vẽ đúng thì giữ

- **WC khép kín** (`ensuite_of`): dải dọc một cạnh phòng mẹ; thử ba cạnh (trái, phải, phía hành lang) và chọn cạnh
  gần trục ống nước tầng dưới nhất (`anchors.wetRooms`), không nằm trên bếp / phòng thờ (`anchors.service`).
- **Ban công**: dải áp mặt thoáng của phòng nó kề trên bản phác (không có bản phác: phòng ở lớn nhất của dải ấy);
  mặt đầu bài BẮT BUỘC luôn có, mặt CẤM không bao giờ (T91).
- **Phòng phụ trợ** (WC chung, giặt, kho, kỹ thuật): xếp vào cột áp `V`, mỗi phòng chạm `V`. Giặt phơi kề ban công /
  sân thượng khi được (`served_from`).

### 2.4 Kích thước

Theo trục sâu: `[dải trước d_F][HF][lõi = S (cố định)][HB][dải sau d_B]`, `d_F + d_B` chia theo tổng nhu cầu từng
dải, mỗi dải không dưới cạnh dùng được lớn nhất của các phòng trong nó. Trong dải: cột theo tỉ lệ nhu cầu cụm, không
dưới cạnh kỹ thuật của cụm; trong cụm: ban công / phòng / WC theo diện tích. Phần dư của tầng **chia theo tỉ lệ**
(phát hiện then chốt của T93: diện tích không thiếu, chỉ nằm sai chỗ).

### 2.5 Không làm ở bản đầu

- Khối chữ L / U, hai cánh (giới hạn đã chấp nhận ở B2 mục 4).
- Giếng trời không nằm trong dải lõi: khung không dựng được thì rơi về đường cũ, không bác.
- Tầng 1 không có bản phác (không biết ô thang): thử hai vị trí thang (áp tường trái / phải, sau dải trước).
- Đổi hợp đồng / lời dẫn: CHƯA. Đo bằng phát lại trước; giảm việc của mô hình (bỏ vẽ hành lang) là bước sau, cần
  một lượt thật có phép của Haan.

## 3. Đo — cửa nghiệm thu

Phát lại toàn bộ lượt ghi (`fixtures/ai-run-*.json`, 35 lượt, cùng đầu bài biệt thự demo 15 × 20 m, 2 tầng, 24–32
phòng) bằng `evaluateHouseBest`, không gọi mô hình. Đối chứng = mã hiện tại. Nghiệm thu: số vòng ra mặt bằng tăng
rõ (đối chứng 6/105 theo T94) mà **không vòng nào lùi**, vòng 3 lượt 5bc280ff vẫn 85,2 (bản phác qua cổng thì
khung không được chen vào). Kết quả ghi ở `QUYET_DINH_AI.md` T102.

## 4. Sau bản đầu (thứ tự)

1. Lời dẫn 9.0: nói với mô hình rằng chương trình dựng hành lang — bản phác vẫn vẽ nhưng KHÔNG cần vẽ `circulation`,
   câu nhắc lối vào bớt đi; đo bằng một lượt thật (xin phép riêng).
2. Biến thể lõi cả nhà: tầng trên không xếp được với ô thang tầng 1 → thử lại tầng 1 với thang lật sang tường
   đối diện (`plan-variants.ts`).
3. Giếng trời / sân trong trong khung; khối chữ L.

## 5. Kết quả bản đầu (T102, 29/09/2026)

Đối chứng 10 / 126 vòng → khung xương **11 / 126**, không vòng nào lùi; tầng 1 thử khung 655 lần, tầng 2 378 lần. Tầng 2
biệt thự demo vẫn không lấp được vì chương trình phòng quá dày cho một tầng có hành lang (xem `QUYET_DINH_AI.md` T102).
Thêm so với mục 2: ba chế độ hành lang ngang (`none` / `edge` / `mid` hai hàng), thang máy tầng 1 đặt đúng cỡ, ban công
theo mặt đầu bài bắt buộc, dời phòng nhỏ nhất vào túi giữa khi dải không chứa nổi.

## 6. Sau bản đầu — ba đòn bẩy đã thử (T103, 29/09/2026)

Hàng giữa cạnh lõi, hai hàng tự cân (chia hàng + dò chiều sâu), lật gương cả nhà: mỗi cái 0 / 126 vòng thêm, đã gỡ. Ban
công đua 1 m (Q-55) mô phỏng trên ba lượt: 0 vòng thêm, không đổi mã. Lời dẫn 9.0.0 dạy mô hình vẽ hành lang ngay sau ô
thang, trước các phòng — chờ một lượt thật. Chi tiết và số đo: `QUYET_DINH_AI.md` T103.

## 7. Nhánh nhà ống cho lô hẹp — đã thử, đã gỡ (T171, 25/10/2026)

Lô hẹp (bề ngang cạnh ô thang nhỏ hơn cạnh kỹ thuật của một phòng ở — suy từ `kb/`, không ngưỡng trong mã): dải trước / sau
xếp CHỒNG theo chiều sâu, hành lang dọc áp tường nối các hàng, WC khép kín thành hàng riêng phía trong phòng mẹ, tầng 1 dựng ô
thang đúng cỡ tối thiểu và giếng trời kề thang. Đi sau các khung thường, chỉ lên cổng khi chúng hỏng. Phát lại 243 vòng: ngữ
cảnh Workflow THU5 0 → 0; ngữ cảnh mặc định THU5 6 → 4 (lùi), lượt khác không đổi — gỡ khỏi mã. Chặn thật: chỗ ô thang + giếng
trời tầng 1 quyết chiều sâu dải sau của mọi tầng, mà tầng 1 được chọn theo điểm riêng của nó. Bước sau (nếu làm): chọn tầng 1
có biết tầng trên (họ T169), thử vài chỗ lõi theo chiều sâu. Chi tiết và bảng số: `QUYET_DINH_AI.md` T171.

## 8. Khung hai hàng cho tầng trên — đã làm, giữ (T179, 28/10/2026)

`arrange/skeleton-rows.ts`. Khi khung một hàng không ra cây qua cổng ở tầng trên: hành lang T áp đầu bước ra của ô thang (trọn bề
ngang), dải trước một hàng chạm T, dải sau [vùng tự do | V cạnh thang | ô thang + túi cạnh / sau thang]; vùng tự do và túi sau thang là
một hàng chạm T, một cột chạm V, hoặc HAI hàng kẹp hành lang H2 nối vào V. Dựng trong hệ toạ độ chuẩn (đầu bước ra = `y0`) rồi lật
về, nên mọi hướng thang dùng một cách dựng. Phòng giữ hàng theo bản phác, hàng thiếu chỗ thì dời / đổi phòng giữa các hàng. Phát lại
256 vòng: 16 → 25 vòng qua cổng, `1dd74b99` (hồ sơ 9272) v2–v4 qua; khu ướt chưa theo trục ống nước (E5 thấp hơn vòng cũ). Chi tiết:
`QUYET_DINH_AI.md` T179.

## 9. Khung nhà ống «dựng hành lang trước» — đã thử, đã gỡ (T189, 30/10/2026)

Lô hẹp (suy từ `kb/`): ô thang áp tường bên, hành lang dọc cạnh thang, hành lang T trước đầu thang, phòng xếp CHỒNG theo chiều sâu
trước / sau lõi, giếng trời sau thang cùng cột hoặc trong cột phụ trợ; tầng 1 thử 4 chỗ ô thang và một bước quay lui chọn bản tầng 1
cho các tầng trên. Phát lại 278 vòng: 27 → 27 (không được, không mất) — gỡ. Chặn thật là CHIỀU SÂU: AT01 4 × 14 m cần 1.535 cm cho
gara, khách, ô thang chữ U, giếng trời, ăn, WC xếp chồng; THU5 tầng 1 dựng được (81 điểm) nhưng tầng trên còn ~420 cm sau lõi, giếng
trời cạnh hành lang thiếu 5 cm. Chi tiết, số đo và bước sau: `QUYET_DINH_AI.md` T189.
