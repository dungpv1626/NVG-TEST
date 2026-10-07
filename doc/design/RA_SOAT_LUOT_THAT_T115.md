# Rà soát lượt thật «AI Design» và phương án sửa trước khi chạy tiếp (T115)

> Haan yêu cầu (04/10/2026): «việc chạy thật đang tốn rất nhiều tiền mà chưa ra được kết quả mong muốn — rà soát lại
> toàn bộ lỗi gần đây và lên phương án fix triệt để trước khi chạy thật». Tài liệu này KHÔNG gọi mô hình: mọi số đo là
> phát lại câu trả lời đã ghi bằng mã hiện tại. Dữ liệu và bộ phát lại ở `.sao-luu/t115-phat-lai/`.

## 1. Số liệu

| Nguồn | Lượt | Ra mặt bằng | Ghi chú |
| --- | --- | --- | --- |
| Lượt thật 04/10/2026 | 5 (2 đầu bài × lưới / v5, thêm 1 lượt v5 chạy lại) | 0 | ~2,0 USD |
| Bộ ghi cũ (49 lượt, 209 vòng), phát lại bằng mã hiện tại | 49 | 8 lượt (19 / 209 vòng) | `r-h-a.txt` |

Nhóm lỗi trong 190 vòng hỏng của bộ ghi cũ (một vòng có thể dính nhiều nhóm):

| Nhóm | Vòng | Tỉ lệ |
| --- | --- | --- |
| A — lối vào, hành lang, thang (phòng không chạm hành lang, chỉ vào qua ô thang, ô thang cô lập) | 127 | 67 % |
| B — hình bản phác (phòng không chữ nhật, chong chóng, đè thang) | 37 | 19 % |
| C — diện tích / kích thước dưới mức đầu bài | 32 | 17 % |
| F — luật bắt buộc (ban công, phòng thờ, WC) | 17 | 9 % |
| D — danh mục phòng | 15 | 8 % |
| E — cửa ra ngoài / lối vào chính | 2 | 1 % |

Năm lượt hôm nay phát lại bằng mã hiện tại (đã gồm mọi sửa trong ngày, `today-replay.txt`): **vẫn 0 / 25 vòng qua**;
lỗi còn lại gần hết thuộc nhóm A.

## 2. Nguyên nhân gốc — xếp theo tác động

### G1. Lưới an toàn «khung xương» (T102) không phủ được hai dạng nhà phổ biến nhất

T102 viết ra đúng để chương trình tự dựng hành lang khi bản phác hỏng lối vào (77 % vòng thật khi ấy). Vết bộ xếp
(`trace`) cho thấy nó **không dựng được ứng viên nào** ở cả hai đầu bài hôm nay:

- **Nhà ống** (`e34f8f58`, `fee82b18`, khối 5 m): khung đặt các phòng của dải trước thành **cột cạnh nhau theo bề
  ngang**. Gara (≥ 3,1 m) cạnh phòng khách (≥ 3 m) không vừa 5 m → «dải trước không chia được» ở mọi biến thể →
  tầng 1 có 0 ứng viên; tầng 1 hỏng nên tầng 2–4 không có mốc thang và không được dựng khung luôn. Với nhà ống, lưới an
  toàn chưa từng hoạt động — mọi thứ trông vào mô hình.
- **Biệt thự** (`83e5c327`, khối 12,5 × 16 m): ô thang tầng 2 ghim theo chỗ mô hình đặt ở tầng 1, để lại dải sau lõi
  chỉ sâu 2,4–3,1 m; phòng ngủ trong dải ấy cần bề ngang 6,8–9,2 m → 0 ứng viên ở cả 12 lần thử.

Đây là lý do nhóm A chiếm 67 % và câu nhắc sửa không hội tụ: chương trình bắt mô hình sửa đúng việc chương trình đã
định tự làm.

### G2. Chương trình bắt mô hình làm việc chương trình làm được

- Ô thang tầng trên: vị trí đã biết (chồng đúng ô thang tầng 1), nhưng mô hình phải tự vẽ. Đường lưới: câu «"st2" is
  fixed on sketch rows 8–12 … draw it exactly there» lặp đủ 4 vòng ở `83e5c327`. Đường v5: «Tầng 2 / 3 / 4 không có
  thang» ở `124a1fa2` và `139e1a3f` — mô hình quên khai thang tầng trên, cả lượt bác ở cổng danh mục.
- Phòng hụt diện tích vài phần trăm, phòng khép kín lệch phòng mẹ: chương trình đã nâng diện tích được (ghi chú
  «chương trình nâng lên»), nhưng nhiều chỗ khác vẫn gửi về mô hình.

### G3. Vòng sửa tốn tiền mà không tiến

- 6 / 16 lời gọi sửa hôm nay (~37 %) ra bản **tệ hơn** và bị gạt («Your last revision was worse … set aside»): mất
  tiền mà không dùng được.
- Lỗi xoay vòng: sửa phòng này thì vỡ phòng khác (tầng 2 của `83e5c327`: crooked → chong chóng → crooked → lối vào →
  crooked).
- Không có điểm dừng sớm: lượt luôn tiêu đủ 5 lời gọi dù hai lời gọi cuối nhận đúng câu nhắc cũ.

### G4. Lỗi chương trình làm hỏng lượt — tìm được nhờ chạy thật

| Lỗi | Hậu quả | Trạng thái |
| --- | --- | --- |
| Hai dòng thành viên cùng vai trò → trùng mã phòng ngủ `ngu_con` | v5 nhà ống bác suốt 4 vòng | Đã sửa, có phép thử |
| Khoá khử trùng nuốt cửa đi của gara-lối-vào | Nhà phố không vào nhà qua gara được | Đã sửa (chỉ nhà phố — Haan (a)) |
| Dải `hall_auto_*` chương trình chèn lọt vào câu nhắc | Mô hình xoá sảnh, mặt bằng xấu dần | Đã sửa |
| Ô ẩn bị bỏ khỏi bản gửi đi (nhà phố không khai được khoảng lùi) | Khối nhà sai | Đã sửa (Haan: chủ nhà quyết) |
| Đường v5 không cắt `assumptions` > 200 ký tự (đường lưới có cắt) | Lời gọi đầu `139e1a3f` bị bác oan, 0,057 USD | **Chưa sửa** |
| Phép thử đọc `prompt` thay vì cả `promptTail` (T115) | Hai phép thử đỏ / xanh vô nghĩa | Đã sửa |

### G5. Đo trước khi chạy thật chưa đủ

- Bộ ghi cũ gần như không có nhà ống gara mặt tiền, không có lượt v5 gốc: mọi thay đổi hôm nay «không hại, không lợi»
  trên phát lại nhưng không nói gì về ca đang hỏng.
- Phát lại v5 bằng cách đổi bản phác cũ sang hình chữ nhật là cận dưới lỏng — không đo được v5.
- Lượt thật được dùng như phép thử (mỗi lượt ~0,35–0,47 USD) thay vì chỉ để XÁC NHẬN thứ phát lại đã cho thấy qua.

## 3. Phương án — theo thứ tự, mỗi bước có tiêu chí xong đo được miễn phí

Nguyên tắc: **không chạy thật cho tới khi phát lại tại máy cho thấy bước sửa giải được đúng ca đang hỏng.** Lượt thật
chỉ để xác nhận, không để dò.

**P1 — Bộ ca chuẩn và bộ phát lại v5 gốc** (nền cho mọi bước sau)
- Đưa 5 lượt hôm nay vào bộ ghi (lưới và v5 gốc), kèm `digest` dựng từ đầu bài hiện hành; bộ phát lại v5 cộng dồn
  delta như đường thật (`zz-today.test.ts` làm sẵn, chuyển thành phép thử chính thức).
- Bộ ca đầu bài đại diện: nhà ống 4–5 m có gara, nhà phố 6–8 m, biệt thự — câu trả lời ghi sẵn của từng ca.
- Xong khi: một lệnh in tỉ lệ vòng qua theo nhóm lỗi cho cả bộ cũ lẫn bộ ca, chạy dưới ~20 phút.

**P2 — Thang tầng trên do chương trình đặt**
- Ô thang (và giếng thang máy) tầng 2 trở lên chồng đúng ô tầng 1; chương trình tự thêm nếu mô hình không khai, không
  gửi lỗi «không có thang» / «st2 is fixed …» về mô hình nữa. Lời dẫn nói rõ: chỉ vẽ thang ở tầng 1.
- Xong khi: bộ ca không còn lỗi loại ấy; vòng 1 của `124a1fa2`, `139e1a3f` qua được cổng danh mục.

**P3 — Khung xương cho nhà ống** (tác động lớn nhất)
- Thêm dạng khung dải dọc: một hành lang dọc theo một tường biên chạy từ mặt tiền tới thang và tới các phòng phía
  sau; phòng xếp nối nhau trước → sau (gara → khách → thang + bếp ăn → WC / kho / giếng trời). Phòng trong dải trước
  được xếp chồng theo chiều sâu khi bề ngang không đủ cho hai cột.
- Xong khi: từ chính bản phác vòng 1 của `e34f8f58` và `fee82b18`, cả bốn tầng có ứng viên qua cổng; phát lại bộ cũ
  không lùi.

**P4 — Khung xương cho biệt thự có dải mỏng**
- Dải trước / sau quá mỏng thì cho phòng tràn vào túi giữa của dải lõi; chọn vị trí ô thang tầng 1 có xét tầng trên
  dựng được không (thử vài vị trí trong phạm vi bản phác, giữ vị trí cả nhà qua).
- Xong khi: tầng 2 của `83e5c327` có ứng viên; phát lại bộ cũ không lùi.

**P5 — Vòng sửa tiết kiệm**
- Dừng sớm: hai lời gọi liền không giảm bậc lỗi thì dừng, báo kỹ sư (tiết kiệm ~35 % tiền một lượt hỏng).
- Cắt chữ quá trần ở đường v5 như đường lưới, không bác cả câu trả lời.
- Câu nhắc chỉ còn lỗi chương trình không tự sửa được, mỗi lỗi kèm gợi ý toạ độ cụ thể (rect đề xuất), không giảng luật.
- Xong khi: phát lại bộ ca cho số lời gọi trung bình mỗi lượt hỏng ≤ 3; không lời gọi nào bị bác vì chữ dài.

**P6 — Cổng trước khi chạy thật**
- Chỉ xin chạy thật khi: (a) bộ ca tại máy có ít nhất một phương án qua cổng từ câu trả lời ghi sẵn của chính đầu bài
  ấy, hoặc (b) lỗi còn lại chỉ thuộc nhóm mô hình thật sự vẽ sai (không thuộc G1–G4).
- Mỗi lượt thật kèm: giả thuyết cần xác nhận, tuyến, trần chi phí; xong ghi kết quả vào bộ ghi để thành ca phát lại.

## 4. Cần Haan quyết

1. Thứ tự đề xuất **P1 → P2 → P3 → P5 → P4**: P3 và P2 gỡ phần lớn nhóm A ở nhà ống (loại hình NVO làm nhiều nhất);
   P4 sau vì biệt thự còn ca qua được ở bộ ghi cũ.
2. **Dồn sức vào một đường.** Đề xuất giữ v5 (hình chữ nhật): lời dẫn ngắn hơn ~20 % token, tránh trọn nhóm B (bản phác
   không chữ nhật / chong chóng, 19 %). Đường lưới giữ nguyên làm đối chứng, không cải tiến thêm. Hai đường dùng chung
   bộ xếp, nên P2–P5 có lợi cho cả hai.
3. Đồng ý cổng P6 làm quy tắc: không chạy thật khi phát lại tại máy chưa cho thấy ca ấy qua.
