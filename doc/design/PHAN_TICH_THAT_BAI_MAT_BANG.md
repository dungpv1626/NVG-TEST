# Phân tích thất bại — sinh mặt bằng «AI Design» (27/09/2026)

Mục đích: tổng hợp mọi kiểu lỗi đã gặp, rà lại luồng từ đầu bài tới bản vẽ, tìm chỗ thật sự làm hỏng
nhiều lần — TRƯỚC khi chọn giải pháp. Chưa sửa gì theo tài liệu này.

## 1. Dữ liệu

- 30 lượt thật có fixture (`workers/src/design/__tests__/fixtures/ai-run-*.json`), từ 16/09 tới 26/09,
  qua GPT-5.6 Terra / Luna, GPT-6 Sol, Claude Sonnet 5; tổng **105 vòng** (lời gọi ra ý định đọc được).
- Mỗi vòng được phát lại bằng **chương trình hiện tại** (T84–T90) — tức «nếu hôm nay mô hình trả đúng câu
  ấy thì chương trình nói gì». Không gọi mô hình.
- Riêng 25–26/09: 11 lượt thật, **5,381 USD**, không lượt nào ra phương án.

**Kết quả phát lại: 0 / 105 vòng ra mặt bằng.**

## 2. Các kiểu lỗi

### 2.1 Theo nhóm (một vòng có thể dính nhiều nhóm)

| Nhóm | Số vòng dính | Tỉ lệ | Vòng hỏng CHỈ vì nhóm này |
| --- | --- | --- | --- |
| **Lối vào / giao thông** — phòng không chạm hành lang, ô thang không nối hành lang, cửa mở từ ô thang, phòng không có cửa | **81** | **77 %** | 33 |
| **Ban công** — thiếu ban công ở mặt đầu bài khai, ban công không quay cạnh dài ra mặt thoáng | 43 | 40 % | 8 |
| **Diện tích / kích thước** — phòng dưới sàn đầu bài, ô thang ngắn, khai diện tích thấp hơn đầu bài | 22 | 20 % | 15 |
| Hình dạng bản phác / lõi — chong chóng, không chữ nhật, vẽ đè ô lõi, thang máy lệch | 13 | 12 % | 0 |
| Luật bắt buộc T71 — WC trên bếp, phòng thờ cạnh WC | 7 | 6 % | 0 |
| Mặt lối vào chính / cửa xe sai mặt | 6 | 5 % | 0 |

### 2.2 Theo mã (số vòng có mã)

| Mã | Vòng | Nghĩa |
| --- | --- | --- |
| `sketch_room_no_access` | 52 | phòng trên bản phác không chạm hành lang / phòng chung nối về ô thang |
| ban công thiếu mặt trái (kiểm trên bản phác) | 25 | |
| `sketch_stair_isolated` | 18 | ô thang không chạm hành lang — lên tới tầng là kẹt |
| `door_from_stair` | 17 | phòng chỉ vào được qua ô thang |
| `balcony_off_open_face` | 17 | ban công không quay cạnh dài ra mặt thoáng |
| ban công thiếu mặt sau (kiểm trên bản phác) | 17 | |
| `room_without_door` | 16 | sau khi xếp, phòng không đặt được cửa |
| `arrange_room_below_brief_area` | 13 | phòng dưới sàn đầu bài |
| `arrange_no_hub_wall` | 12 | phòng không giáp phòng giao thông để mở cửa |
| `wc_over_kitchen`, `sketch_pinwheel` | 6 mỗi mã | |

### 2.3 Hỏng ở giai đoạn nào

| Giai đoạn hỏng đầu tiên | Vòng |
| --- | --- |
| Cổng danh mục phòng (chưa xếp gì) | 4 |
| Tầng 1 | 39 |
| Tầng 2 | 58 |
| Kiểm cả nhà (đã xếp đủ tầng) | 4 |

### 2.4 Vòng sửa không hội tụ

Trên **76 vòng sửa**: mô hình gỡ **143** lỗi, giữ nguyên 71, và **làm phát sinh 154 lỗi MỚI**. Mỗi vòng
sửa gỡ được khoảng một nửa số lỗi cũ và tạo ra nhiều lỗi mới hơn thế — tổng số lỗi không giảm. 7/76 vòng
làm hỏng lại một tầng thấp hơn vốn đã qua (T86 giảm chỗ này, chưa hết). Cùng hiện tượng ở mọi model: Luna,
Sol, Sonnet 5 đều hỏng vì cùng những nhóm lỗi trên; model đắt không đổi được bức tranh.

## 3. Luồng hiện tại

```
Đầu bài (98 câu, 6 mục)
  → digest (đầu bài rút gọn, gửi mô hình)
  → [MÔ HÌNH, một lời gọi] ý định cả nhà:
        danh sách phòng + diện tích mục tiêu + quan hệ + lối vào
        + BẢN PHÁC LƯỚI Ô ~1 m MỌI TẦNG (12 × 16 ô ở nhà demo)
  → chương trình: đánh mã type_n, gộp thang
  → cổng danh mục phòng (T41: đủ phòng đầu bài, diện tích khai ≥ sàn đầu bài)      ← bác thì dừng
  → từng tầng, tầng 1 trước:
        nắn bản phác (hàng thiếu ô, mép «.», phòng không chữ nhật → cắt phần lồi)
        ép ô lõi (thang, thang máy) về đúng ô tầng dưới
        kiểm bản phác: lối vào (≥ 2 ô tường chung với hành lang/phòng chung), sàn đầu bài, ban công đúng mặt
        dựng cây chia từ bản phác → căn vách → đặt cửa, cửa sổ → cổng hình học
        bản phác hỏng → chương trình CHIA LẠI tầng «giữ vùng» (có khi dời lõi, dời ban công)
  → ghép cả nhà, kiểm liên tầng (thang máy thẳng, ban công đúng mặt, WC trên bếp…)
  → chấm điểm, ≥ 65 % thì nhận
  → hỏng: câu nhắc tiếng Anh theo mã lỗi → mô hình vẽ lại (tối đa 5 lượt sửa)
```

**Phân vai thực tế:** mô hình giải TOÀN BỘ bài toán bố trí — phòng nào ở đâu, hành lang chạy đâu, lõi đặt
đâu, ban công mặt nào, diện tích từng ô — dưới dạng một bảng chữ. Chương trình **kiểm** rất chặt, nhưng
**gần như không dựng**: không tự thêm hành lang, không tự nối phòng cụt, không tự đặt ban công, không tự nới
phòng khi phòng kề chạm sàn. Cách «cứu» duy nhất là chia lại cả tầng, và cách ấy âm thầm dời thứ mô hình
đã vẽ đúng.

## 4. Root cause

### Gốc chính — bài toán khó nhất giao cho đúng thành phần kém nhất ở việc đó

Lỗi số một (77 % vòng) là **mạng giao thông**: mỗi phòng phải chạm hành lang hoặc phòng chung bằng ≥ 2 ô
tường liền, hành lang phải nối về ô thang, ô thang phải chạm hành lang ở mọi tầng, tầng trên bám lõi tầng
dưới. Đây là ràng buộc **liên thông topo trên lưới 2D**, phải giữ đồng thời với diện tích từng phòng, ô lõi
cố định, khu ướt thẳng trục, ban công ba mặt.

Mô hình ngôn ngữ vẽ lưới này **từng hàng chữ một**, không «nhìn» được hình, không kiểm liên thông được. Nó
làm đúng từng yêu cầu riêng lẻ (Sonnet vòng 2 thêm đúng hành lang, đúng hai ban công) nhưng không giữ được
tất cả cùng lúc: sửa một chỗ thì ô bị dịch ở chỗ khác → lỗi mới. Số đo 143 gỡ / 154 mới là chữ ký của việc
này. Suy nghĩ dài hơn (Sonnet 65–90k token) không đổi được bản chất.

Trong khi đó bài toán liên thông lại là loại **chương trình giải chắc chắn và rẻ** (tìm đường, chèn dải hành
lang, gắn phòng vào trục). Hiện chương trình chỉ dùng năng lực ấy để BẮT lỗi.

### Các gốc phụ — làm vòng sửa đắt và chậm hội tụ hơn

1. **Mỗi vòng chỉ lộ lỗi của giai đoạn hỏng đầu tiên.** Cổng danh mục bác thì chưa xếp tầng nào; tầng 1
   hỏng thì tầng 2 chưa xét. Vòng 2 lượt Sonnet: chỉ vì khai 16 thay 17 m², lỗi thật (hành lang cụt tầng 1)
   phải chờ thêm một vòng — mỗi vòng Sonnet ~1 USD.
2. **Lỗi «con số» bị đối xử như lỗi thiết kế.** Khai diện tích thấp hơn sàn đầu bài 1 m² dừng cả lượt,
   trong khi diện tích thật đo từ bản phác và vẫn bị kiểm sàn.
3. **«Cứu» bằng chia lại tầng làm mất dấu vết.** Chương trình chia lại khi bản phác hỏng, dời lõi / ban công
   mô hình đã vẽ đúng, rồi báo lỗi hệ quả (lượt Sol 02982bd7: «thiếu ban công sau» — ban công có, bị dời).
   T78, T86, T90 đã vá từng mặt; cơ chế gốc vẫn còn.
4. **Nhiều yêu cầu đầu bài cùng dồn vào một bản vẽ chữ.** Nhà demo đòi: thang máy chồng khít và cạnh thang
   bộ, ban công 3 mặt (trước, trái, sau) đua ra ngoài ranh, phòng ông bà tầng 1 20 m², phòng khách 45 m²,
   bếp không dưới WC… Mỗi yêu cầu đúng, nhưng tổng số ràng buộc đồng thời vượt khả năng vẽ-bằng-chữ.

### Không phải gốc

- **Không phải do model.** Cả bốn model hỏng cùng nhóm lỗi; model đắt nhất (Sonnet 5, 1,6 USD) cũng thế.
- **Không phải do runtime.** T84/T85 đã hết sập; lượt chạy sạch vẫn không ra mặt bằng.
- **Không phải do câu nhắc chưa đủ rõ.** 90 quyết định T-số đã tinh chỉnh câu nhắc; mô hình hiểu và làm theo
  (Luna đổi hướng đúng câu nhắc T89, Sonnet sửa đúng mọi lỗi được nêu) — nhưng sửa xong lại phá chỗ khác.

## 5. Hướng giải pháp để bàn (chưa chọn)

- **A. Chương trình tự sửa giao thông** trước khi bác: nối phòng cụt bằng dải hành lang lấy từ phòng kề còn
  dư, nối ô thang với hành lang gần nhất. Giữ nguyên cách mô hình vẽ; chỉ đổi «bác» thành «sửa rồi báo».
- **B. Đổi phân vai:** mô hình chỉ quyết phân vùng, quan hệ kề, thứ tự dải phòng; chương trình DỰNG trục
  giao thông và gắn phòng vào trục (liên thông bảo đảm bằng cách dựng, không bằng cách kiểm).
- **C. Giảm lãng phí vòng sửa** (làm được ngay, rẻ): tự nâng diện tích khai lên sàn đầu bài, báo lỗi mọi
  giai đoạn trong một vòng, thôi dời lõi / ban công khi chia lại.
- **D. Nới yêu cầu cứng không phải của gia chủ** — cần Haan xác nhận từng mục.

A và C sửa được trong khung hiện tại; B là đổi kiến trúc, bền hơn nhưng lớn hơn.

## 6. Hướng D — các luật cứng có thể nới (27/09/2026, chờ Haan chọn)

Nguồn của từng luật đang CHẶN, và số vòng (trên 105) nó chặn. «Chỉ vướng» = vòng không còn lỗi nào khác
— cận trên, vì chương trình dừng ở tầng hỏng đầu tiên, nới một luật có thể lộ lỗi phía sau.

| Luật | Nguồn | Vòng dính | Chỉ vướng |
| --- | --- | --- | --- |
| Phòng phải có lối / cửa ra hành lang, phòng chung | chương trình («không đi được») | 65 | 16 |
| Ô thang phải chạm hành lang ở mỗi tầng | chương trình («không đi được») | 18 | 9 |
| Ban công: MỖI mặt đã chọn phải có ban công | cách chương trình ĐỌC câu «Ban công đặt ở mặt nào» (T65) | 36 | 1 |
| Ban công quay cạnh dài ra mặt thoáng | Haan (T71) | 17 | 3 |
| Không mở cửa từ ô thang | Haan (T74) | 17 | 0 |
| Sàn diện tích đầu bài (dung sai 3 %) | gia chủ + Haan (T82) | 17 | 15 |
| WC trên bếp, phòng thờ cạnh WC | Haan (T71) | 7 | 0 |
| Mặt lối vào / cửa xe, thang máy cạnh thang bộ | gia chủ | 9 | 0 |
| Hình học bản phác, lõi (chong chóng, vẽ đè lõi…) | giới hạn của chương trình, không phải luật | 17 | 0 |

Phòng hay bị báo không lối vào: phòng ngủ 48, WC 37, đoạn hành lang cụt 30, phòng thờ 22 — cần cửa ra
hành lang thật, KHÔNG nên nới. Phòng phụ: giặt phơi 20, phòng làm việc 17, kho 11, kỹ thuật 4.

Mức hụt diện tích đo được: 3,5 %, 5,9 %, 7,8 % (ba lần) — rồi nhảy lên 15–40 % (vẽ thiếu thật).

Ước tính nếu nới ba mục (ban công theo mặt → «được phép», cạnh ngắn ra mặt thoáng → cảnh báo, dung sai
diện tích 10 %): 9/105 vòng hết lỗi, ở 4/30 lượt — trong đó lượt GPT-6 Sol 02982bd7 vòng 3 (đã xếp xong
cả nhà) sẽ ra phương án. Nới D KHÔNG chạm được nhóm lỗi lớn nhất (lối vào, 77 %) vì đó là luật «không
đi được» — nhóm ấy cần hướng A/B/C.

### Đã làm (T91, 27/09/2026)

Haan quyết cả bốn mục (xem `QUYET_DINH_AI.md` T91). Phát lại 105 vòng sau khi làm: 3 vòng đi xa hơn, 1 vòng
lùi, 0 vòng ra mặt bằng — đúng như ước tính: D chỉ gỡ phần rìa; nhóm lối vào (77 %) cần hướng A/B/C.

### Hướng C đã làm (T92, 27/09/2026)

Tầng 1 hỏng thì bản phác tầng trên vẫn được soát (37/41 vòng thật có lỗi tầng trên bị che); chia lại tầng
ưu tiên giữ ban công đúng mặt. Nâng diện tích khai lên sàn đã làm ở T91. Vẫn 0/105 vòng ra mặt bằng khi
phát lại — C làm vòng sửa hội tụ nhanh hơn (mô hình thấy đủ lỗi), không tự tạo ra mặt bằng; lợi ích chỉ
đo được bằng lượt thật.

## 7. Hướng B — phương án chi tiết (27/09/2026, chờ Haan duyệt trước khi làm)

### 7.1 Bài học từ lịch sử — B không được lặp lại T43

- **T43 (14/09):** chương trình đã từng DỰNG giao thông — mô hình chỉ khai vùng (9 ô) + quan hệ, bộ giải
  thử ba khung `zones` / `spine` (hành lang dọc) / `band` (hành lang ngang) (`arrange/frames.ts`). Kết quả:
  tầng 2 biệt thự 15 phòng **vẫn không dựng được đường vào** (V-29). Chương trình tự đặt hành lang nhưng
  không biết phòng nào nên nằm cạnh phòng nào.
- **T48 (16/09):** chuyển sang mô hình vẽ bản phác lưới vì 9 vùng quá thô. Bản phác giữ được TÔPÔ tốt (nhóm
  phòng, dải phòng, vị trí lõi) nhưng mô hình không giữ được liên thông (mục 4).
- **T73:** chặn chương trình «cứu» tầng bằng chia lại, vì chia lại dời lõi và phá thứ mô hình vẽ đúng.

Nên B phải **giữ tôpô của bản phác** và chỉ để chương trình lo đúng phần liên thông.

### 7.2 Ba cách, xếp theo mức đổi

**B1 — Chương trình tự sửa giao thông TRÊN bản phác** (không đổi hợp đồng, không đổi lời dẫn). Trước khi
kiểm lối vào: dựng mạng giao thông của bản phác (hành lang, khách/ăn/bếp, ô thang); phòng nào không chạm
mạng bằng ≥ 2 ô thì chương trình mở một dải hành lang 2 ô từ mạng tới phòng ấy, đi qua phòng còn dư diện
tích (thước `roomMinimumM2` của T91), chọn đường ngắn nhất và ít làm méo phòng nhất; ô thang cô lập thì nối
tương tự. Sau đó phòng bị cắt được nắn chữ nhật như hiện nay. Ghi chú nói rõ đã mở hành lang ở đâu.
Rủi ro: dải cắt ngang phòng làm phòng thành chữ L → nắn lại có thể làm hụt diện tích hoặc hỏng chỗ khác.

**B2 — Mô hình khai DẢI PHÒNG, chương trình chèn hành lang** (đổi hợp đồng `ai-house-intent` + lời dẫn).
Mỗi tầng mô hình khai các dải phòng theo thứ tự (trước → sau), mỗi dải là một hàng phòng MỘT lớp (trái →
phải, bề rộng gợi ý) và vị trí ô thang. Chương trình chèn dải hành lang giữa các dải, nối về ô thang, rồi
định kích thước. Liên thông bảo đảm bằng cách dựng — mọi phòng một lớp đều chạm hành lang. Rủi ro: khuôn
dải ép mọi nhà vào một kiểu mặt bằng; nhà phố hẹp và biệt thự nhiều phòng đòi hai kiểu khác nhau.

**B3 — Chương trình dựng hoàn toàn, mô hình chỉ chọn trong các phương án chương trình sinh** — quay về
gần T43, đã thất bại (V-29). Không đề xuất.

### 7.3 Đề xuất: làm B1 trước, ĐO bằng phát lại, rồi mới quyết B2

B1 không đổi hợp đồng nên đo được ngay trên 105 vòng thật đã ghi, không tốn tiền: bao nhiêu vòng hết lỗi
lối vào sau khi chương trình tự mở hành lang, bao nhiêu vòng vỡ chỗ khác. Nếu B1 gỡ được phần lớn nhóm 77 %
thì dừng ở đó; nếu không, số đo cho biết vì sao — và đó là căn cứ cho B2.

### 7.4 Đo B1 (T93, 27/09/2026) — ĐÃ LÀM, ĐO, GỠ

Đã viết bộ tự mở hành lang trên bản phác (`arrange/access-repair.ts`): phòng mất lối vào → lấy một dải
dọc trọn một cạnh của phòng kề (phòng kề vẫn chữ nhật, không hụt mức tối thiểu), làm hành lang mới nối
về mạng giao thông. Phát lại 105 vòng: chỉ mở được hành lang ở **11 vòng**, số vòng còn lỗi lối vào
**không đổi (83)**, 0 vòng ra mặt bằng. Đã gỡ mã.

Vì sao (vết trên 397 lần thử nối): phòng kề không phải loại được lấy ô (ô thang, khu chung, ban công, WC…)
334 lần; nhường thì phòng kề **hụt dưới mức tối thiểu** 292 lần; phần còn lại quá hẹp 235 lần; phòng kề
không chữ nhật 127 lần.

**Phát hiện then chốt — ngân sách diện tích:** mỗi tầng còn dư 50–70 m² so với tổng mức tối thiểu các
phòng + thang + hành lang (biệt thự demo: sàn 192 m², tối thiểu phòng 109–119 m², giao thông 21–27 m²).
Diện tích KHÔNG thiếu — nó nằm SAI CHỖ: mô hình phân phần dư cho phòng khách, gara phía trước, còn dải
phòng ngủ phía sau (chỗ cần hành lang) vẽ sát sàn. Sửa tại chỗ không dời được phần dư; phải BỐ TRÍ LẠI.
Đây đúng là việc B2 làm: chương trình dựng dải hành lang TRƯỚC, rồi chia phần còn lại cho phòng theo mức
tối thiểu + phần dư — liên thông và diện tích cùng được bảo đảm bằng cách dựng.
