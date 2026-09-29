# Thiết kế B2 — mô hình khai dải phòng, chương trình dựng giao thông và kích thước

> Trạng thái: **Haan duyệt 27/09/2026** — làm theo thứ tự mục 6, dừng ở bước 1 nếu phép đo không hơn hẳn;
> KHÔNG cố định ngưỡng kiểu hành lang theo bề rộng nhà (Haan: «không nên fix cứng quy tắc này») — chương
> trình dựng mọi kiểu rồi chọn theo điểm; chấp nhận khuôn khối chữ nhật cho bản đầu. Căn cứ:
> `PHAN_TICH_THAT_BAI_MAT_BANG.md` (mục 4 root cause, mục 7.4 đo B1).

## 1. Vì sao B2

- 77 % vòng thật hỏng vì giao thông; mô hình vẽ lưới bằng chữ không giữ được liên thông (sửa 143 lỗi, sinh
  154 lỗi mới).
- Diện tích KHÔNG thiếu: mỗi tầng biệt thự demo dư 50–70 m² so với tổng mức tối thiểu + thang + hành lang.
  Nó nằm sai chỗ (dồn cho khách, gara phía trước). Sửa tại chỗ (B1) không dời được — phải dựng lại.
- T43 (chương trình tự đặt hành lang theo 9 vùng) đã thất bại vì chương trình không biết phòng nào cạnh
  phòng nào. B2 giữ phần mô hình làm tốt (TÔPÔ: nhóm, thứ tự, lõi) và bỏ phần nó làm dở (liên thông, kích
  thước).

**Phân vai mới:** mô hình quyết *phòng nào nằm trong dải nào, theo thứ tự nào, lõi ở đâu*; chương trình
quyết *hành lang chạy đâu, mỗi phòng rộng bao nhiêu*. Liên thông và diện tích tối thiểu được bảo đảm bằng
CÁCH DỰNG, không bằng cách kiểm rồi bác.

## 2. Hợp đồng mới — `ai-house-intent` bản 2

Giữ nguyên `rooms` (loại, tầng, diện tích mục tiêu, `ensuite_of`), `relationships`, `entry_room`,
`garage_room`, `rationale`. **Thay `sketches` bằng `layouts`:**

```jsonc
"layouts": [
  {
    "level": 1,
    "bands": [                         // TRƯỚC → SAU (dải đầu giáp đường)
      { "rooms": ["garage_1", "living_1"] },          // TRÁI → PHẢI nhìn từ đường
      { "rooms": ["stair_1", "wc_1", "kitchen_1", "dining_1"] },
      { "rooms": ["bedroom_1", "storage_1"] }
    ],
    "corridor": "auto"                 // auto | side_left | side_right | none — xem 3.2
  }
]
```

- Mỗi phòng một lớp trong dải (không chồng hai phòng trong một dải). Phòng khép kín (`ensuite_of`) nằm
  ngay cạnh phòng mẹ trong cùng dải.
- Ô thang, thang máy, giếng trời là phòng như mọi phòng, nằm trong một dải.
- Mô hình KHÔNG khai kích thước, toạ độ, hành lang. Câu trả lời ngắn hơn bản phác lưới nhiều — token ra
  giảm (bản phác ~7–10 nghìn ký tự).

## 3. Chương trình dựng một tầng

### 3.1 Ngân sách trước

Tổng mức tối thiểu các phòng (sàn đầu bài, không có thì mức nghề `space_norms`) + ô thang + hành lang cần
dựng ≤ sàn xây được? Không → cảnh báo «đầu bài đòi quá sức lô đất» (đã có ở T91), vẫn dựng với mức tối
thiểu co theo tỉ lệ.

### 3.2 Đặt hành lang

- **Khu chung là hành lang:** dải có khách / ăn / bếp nối liền (T91) tự là lối đi.
- **Nhà rộng** (≥ ~7 m): chèn **dải hành lang ngang** giữa hai dải phòng, chọn chỗ chèn ÍT nhất sao cho
  mọi dải phòng ngủ / phòng riêng chạm một dải hành lang hoặc khu chung, và dải hành lang chạm ô thang.
  Hai dải hành lang không liền nhau thì nối bằng một đoạn dọc qua dải giữa (lấy của phòng có dư nhiều nhất).
- **Nhà hẹp** (nhà phố 4–5 m): **hành lang dọc một bên** (`side_left` / `side_right`) chạy từ ô thang về
  các phòng phía trước/sau; phòng xếp một hàng cạnh nó.
- Bề rộng hành lang: `usable.min_side_m.circulation` của `kb/construction_norms.yaml`.

### 3.3 Chia kích thước

Cắt lát (slicing): chiều sâu mỗi dải ∝ nhu cầu diện tích của dải; bề rộng mỗi phòng trong dải ∝ mức tối
thiểu của nó. Phần dư của tầng chia theo tỉ lệ cho mọi phòng — không dồn về một chỗ. Ràng buộc cứng: cạnh
ngắn dùng được (T44), ô thang đủ dài cho số bậc, giếng thang máy đúng kích thước đầu bài. Kết quả là CÂY
`ai-plan-tree` — cổng kiểm `ai/tree/`, đặt cửa, cửa sổ, chấm điểm GIỮ NGUYÊN.

### 3.4 Tầng trên

Ô thang, thang máy, giếng trời ép đúng ô tầng dưới (như T73): dải chứa chúng phải phủ đúng dải toạ độ ấy;
các dải khác co giãn quanh. Khu ướt tầng trên ưu tiên thẳng trục (T71) — chương trình thử đảo thứ tự phòng
TRONG một dải trước khi nhận phương án lệch. Ban công ở dải mép, đúng mặt đầu bài (T91), đua ra theo độ đua
từng mặt.

### 3.5 Còn gì mô hình phải sửa

Lỗi nào chương trình không tự gỡ được thì gửi lại như hiện nay, nhưng chỉ còn loại NGỮ NGHĨA: thứ tự dải
làm WC nằm trên bếp (T71), thiếu phòng đầu bài, lõi đặt ở dải không chứa được, ban công khai ở mặt cấm.

## 4. Không phù hợp / rủi ro

- **Khuôn dải chữ nhật:** mặt bằng chữ L, U, sân trong giữa nhà chỉ làm được bằng phòng `courtyard` /
  `light_well` trong một dải. Nhà NVG hiện có (nhà phố, biệt thự hình chữ nhật) hợp khuôn; lô méo lệch
  nhiều thì không.
- **Khối nhà nhiều nhánh** (biệt thự hai cánh) nằm ngoài phạm vi bản đầu.
- Đổi hợp đồng → lời dẫn viết lại (9.0.0), phép thử liên quan viết lại. Artifact cũ (bản phác) vẫn đọc và
  sửa được — tuyến sửa theo yêu cầu (T53) làm trên CÂY, không đụng hợp đồng.

## 5. Đo trước khi gọi mô hình

Dữ liệu cũ có bản phác, và bản phác chứa sẵn thứ tự dải: **đổi 105 vòng thật sang dạng dải** (nhóm hàng
theo phòng, trái→phải) rồi cho bộ dựng mới chạy — đo được bao nhiêu vòng ra mặt bằng TRƯỚC khi tốn một
đồng nào. Đó là cửa nghiệm thu đầu tiên: phải hơn hẳn 0/105 mới đi tiếp sang lời dẫn và lượt thật.

## 6. Thứ tự làm

1. Bộ dựng dải (3.1–3.3) cho tầng 1 + bộ đổi bản phác → dải; đo trên 105 vòng.
2. Tầng trên (3.4); đo lại.
3. Hợp đồng + lời dẫn 9.0.0 + nối vào `evaluateHouse`; một lượt thật (xin phép riêng).
4. Dọn: đường bản phác chỉ còn để đọc artifact cũ.

## 7. Cần Haan quyết

1. Hướng chung B2 như trên — đồng ý?
2. Nhà rộng dùng dải hành lang ngang, nhà hẹp dùng hành lang dọc một bên — ngưỡng ~7 m có hợp không?
3. Chấp nhận giới hạn khuôn dải chữ nhật cho bản đầu (không chữ L/U, không hai cánh)?
4. Làm theo thứ tự mục 6, và dừng ở bước 1 nếu phép đo không hơn hẳn hiện nay?

## 8. Bước 1 — kết quả đo (27/09/2026)

**Dải phòng một lớp không biểu diễn được bản phác thật.** Đổi bản phác cũ sang dải: dải giữa tầng 1 lượt
02982bd7 có hai hàng phòng chồng nhau (ăn + WC trên; kho + bếp + thang máy dưới) và ô thang cao 4 hàng
xuyên cả hai — khuôn «mỗi dải một hàng phòng» không chứa được, bộ dựng không ra phương án nào. Bản phác
của mô hình đã là một cấu trúc CẮT LÁT nhiều tầng lồng nhau; thay nó bằng dải phẳng là mất tôpô.

**Cách thay thế, giữ nguyên tôpô của mô hình** (thử trên 105 vòng, không gọi mô hình):

1. **Đặt lại diện tích mục tiêu** = mức tối thiểu (sàn đầu bài / mức nghề / diện tích gara theo số xe) +
   phần dư của tầng chia theo tỉ lệ mức tối thiểu. Bước căn vách theo diện tích sẽ dời phần dư đúng chỗ.
2. **Chèn dải hành lang 2 ô vào một đường cắt sạch** của bản phác (đường không phòng nào vắt qua), từng
   tầng, chọn cách tốt nhất. Bước nắn tự co các hàng theo tỉ lệ để trả chỗ cho hành lang.

| | Ra mặt bằng | Vòng tiến | Vòng lùi |
| --- | --- | --- | --- |
| Gốc (hiện nay) | 0 / 105 | — | — |
| (1) đặt lại mục tiêu | **5 / 105** | 10 | 9 |
| (1) + (2) chèn hành lang | **5 / 105** | 21 | 6 |

Năm mặt bằng (3 lượt: 5aba737d ba vòng 74,8 / 74,3 / 74,3 %; 5fda70dc 67,1 %; 4a521f52 61,4 %) — bốn cái
qua ngưỡng 65 %. Phòng ngủ 18–26 m² (sàn 15–20), phòng ngủ chính 33–41 m², phòng khách 75–79 m² (phần dư
chia theo tỉ lệ nên phòng lớn nhận nhiều). Lùi của (1) biến mất khi chọn giữa mục tiêu gốc và mục tiêu mới
theo kết quả — làm trong mã thật sẽ thử cả hai rồi lấy cái tốt hơn, nên không lùi.

## 9. Đưa vào mã chạy thật (T94)

`evaluateHouseBest` (`ai/plan.ts`) + `ai/plan-variants.ts`. So với mục 8, thêm biến thể «phòng cùng loại cùng
mục tiêu» và bỏ ước sức chứa từ sàn (chia lại tổng mô hình khai). Phát lại 105 vòng: **6 mặt bằng**, 19 tiến,
0 lùi. Hợp đồng và lời dẫn CHƯA đổi — chưa cần: mô hình vẽ bản phác như cũ, chương trình lo diện tích và
hành lang. Bước tiếp: một lượt thật để đo trên mô hình, rồi mới quyết có cần bước 2–4 của mục 6.
