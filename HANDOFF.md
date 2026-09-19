# Bàn giao phiên làm việc — 19/09/2026 (rạng sáng)

> Ghi chú làm việc, không phải tài liệu dự án. Làm xong việc thì xoá file này.
> Nội dung đã chốt nằm ở `CLAUDE.md` mục 8.5b (T53–T56) và `TIEN_DO_THIET_KE.html`
> (dòng 17–19/09, vướng mắc V-30, V-31).

---

## 1. Việc chờ Haan quyết — đọc trước tiên

| #        | Câu hỏi                                                                                                                                                                                                                                                                                                                                                                                       | Tình trạng                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Q-A**  | **Ban công đua ra ngoài khối, phần đua không tính vào diện tích sàn công năng.** Haan đã chốt **LÀM, thành một đợt riêng** (19/09). Đây là điều kiện để bật chặn luật «ban công quay cạnh dài ra mặt thoáng» — hiện luật ấy chỉ là ghi chú `outdoor_off_face`.                                                                                                                                | **Chưa bắt đầu.** Đụng vào: cây chia lấp kín mặt sàn, đường bao tầng, suy tường, tính diện tích, tờ vẽ, DXF.      |
| **V-31** | **Bản phác của mô hình chưa lần nào qua cổng trên lượt thật** — phát lại `58688ead` (4 lượt) và `fd3b0b86`: tầng nào cũng `sketch_fallback`. Tầng 1 vì một phòng hụt sàn đầu bài (living_1 **53,67** so với 55 m²; phòng ngủ 7,89 so với 15 m²), tầng 2 vì bản phác **thiếu hẳn một phòng** (balcony_3, wc_4). Nghĩa là mọi cơ chế ép Ô (ô thang T38, ô khu vệ sinh T56) chưa từng chạy thật. | Cần Haan chọn: (a) lời dẫn bắt mô hình đếm ô cho khớp diện tích, hay (b) chương trình tự nới ô cho phòng hụt sàn. |
| **V-30** | **Tiêu chí E2 đo khoảng cách TÂM (≤ 1,5 m)**, nên hai khu vệ sinh CHỒNG nhau mà khác cỡ vẫn bị tính là không chồng — đo trên nhà phố mẫu: cùng vùng, hai ô chồng nhau, tâm cách **2,41 m**. Đây là lý do E2 gần như luôn bằng 0.                                                                                                                                                              | Cần Haan quyết có đổi E2 sang **phần chồng nhau của hai hình** không. Sửa THƯỚC nên không tự đổi.                 |
| **Q-D**  | **Lỗ hổng cổng đường đi hằng ngày** — giải thích đầy đủ ở mục 2 bên dưới. Hai cách sửa, cần chọn một.                                                                                                                                                                                                                                                                                         | Chưa làm.                                                                                                         |
| ~~Q-C~~  | Hai phương án bị ẩn: Haan tự xoá. **Đóng.**                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                 |

---

## 2. Q-D giải thích lại — lỗ hổng cổng «đường đi hằng ngày»

Cổng này (T49) hỏi: **từ chỗ cả nhà ngồi, có tới được khu vệ sinh chung, bếp và chân thang mà không
phải đi xuyên gara hay ra ngoài sảnh không.**

Cách cài hiện nay (`ai/tree/passage.ts#everydayRouteViolations`): lấy **mọi** phòng khách **và mọi**
phòng ăn làm điểm xuất phát **cùng một lúc**, bỏ gara và sảnh ngoài khỏi bản đồ, rồi loang. Phòng
nào loang tới được thì coi là đạt.

Chỗ hở nằm ở chữ «cùng một lúc». Nhà có hai khu sinh hoạt ở hai cánh — ví dụ **phòng khách cánh
phải**, **phòng ăn cánh trái**, và hai cánh chỉ nối nhau **qua gara**:

```
   cánh trái                    cánh phải
   [phòng ăn][thang][phòng ngủ]—[GARA]—[phòng khách][bếp][WC]
        ↑ xuất phát 2                       ↑ xuất phát 1
```

- Xuất phát từ phòng khách: tới được bếp, WC của cánh phải. Đạt.
- Xuất phát từ phòng ăn: tới được thang, phòng ngủ của cánh trái. Đạt.
- Gộp hai phép loang lại thì **mọi phòng đều «tới được»**, không phòng nào bị nêu — trong khi người
  ở trong nhà, đi từ phòng khách sang phòng ăn, **vẫn phải xuyên gara**.

Đúng ca Haan chấm ở lượt Claude Sonnet của T53: «cả cánh trái (phòng ăn, thang, phòng ngủ) chỉ vào
được qua gara mà vẫn qua cổng».

**Hai cách sửa, chọn một:**

1. **Một điểm xuất phát**: chỉ lấy `living` (dùng `dining` khi tầng không có phòng khách), và đòi
   phòng ăn cũng phải tới được mà không qua gara. Đơn giản, nhưng phải chọn đúng «phòng khách chính»
   khi nhà có hai phòng khách.
2. **Xét cụm liên thông**: bỏ gara và sảnh ngoài khỏi bản đồ rồi đòi **mọi** khu sinh hoạt chung và
   mọi đích hằng ngày nằm trong **một** cụm. Bắt được cả ca hai phòng khách ở hai cánh, không phụ
   thuộc việc chọn phòng nào làm gốc. Tôi nghiêng về cách này.

Cả hai đều đổi hành vi CHẶN, nên phải đo lại trên các bản phác thật đã lưu trước khi giữ.

---

## 3. Đã làm rạng sáng nay (đều CHƯA commit)

### T56 — ép khu vệ sinh tầng trên chồng trục khu vệ sinh tầng dưới (Q-B)

Haan chốt «dời vách tầng trên». Làm ba mức, từ ngoài vào trong:

1. **Vùng** — khu vệ sinh CHUNG ở tầng trên nhận vùng của khu vệ sinh tầng dưới
   (`arrange/intent.ts`, ghi chú `intent_wet_zone_forced`; mốc vùng thêm vào `anchorZones.wetRooms`).
   Phòng khép kín **không đụng tới**: vùng của nó là vùng phòng mẹ, kéo đi là phòng ngủ mất khu vệ
   sinh riêng.
2. **Phạt tăng dần theo khoảng cách** thay cho bậc có/không (`arrange/pack.ts`). Bậc thang cũ không
   cho bộ xếp lý do nào để kéo phòng từ 4 m xuống 2 m — nó chỉ thấy «vẫn chưa chồng» ở cả hai chỗ.
   Đây là lý do việc nâng trọng số 1 → 5 hôm qua không đổi ca nào.
3. **Bản phác thứ hai** (`sketch.ts#copySketch` + `#stackWetRooms`) — ô khu vệ sinh ép đúng ô tầng
   dưới, đi qua cổng **cùng** bản gốc, bản nào ra mặt bằng điểm cao hơn thì thắng. Nên việc ép
   **không bao giờ làm mất một phương án**. Ba điều kiện để bản ép không hỏng ngay từ lưới ô: phòng
   khép kín còn chung vách với phòng mẹ, không tụt dưới sàn đầu bài khai, không phòng nào bị lấy hết
   ô.
4. Lời dẫn **8.5.0**: ô khu vệ sinh chung nằm trên đúng ô tầng dưới; khép kín thì gần nhất mà phòng
   ngủ cho phép. (Giữ dưới trần độ dài lời dẫn của `token-diet.test.ts`.)

**Đo trên lượt thật đã ghi** (phát lại, không gọi API): khu vệ sinh chung tầng 2 xích lại gần —
`58688ead` 9,31 → **4,04 m**, `fd3b0b86` 9,95 → **5,69 m**. Điểm giữ 70,3 % và 71,2 → 71,1 %.
**E2 vẫn 0 ở mọi bản** — hai chỗ chặn còn lại là V-30 và V-31 ở mục 1.

Phép thử mới: 5 cho `stackWetRooms` (ép được, ba điều kiện bác, đã chồng sẵn thì không đổi), 2 cho
ép vùng (khu vệ sinh chung nhận vùng tầng dưới; khép kín không rời phòng mẹ). Đã xác nhận phép thử
ép vùng **đỏ** khi tắt đoạn mã ấy.

---

## 4. Trạng thái kho mã

- **Chưa commit gì.** `git status` ~205 mục (phần lớn là việc của các đợt trước).
- File sửa **rạng sáng nay**: `CLAUDE.md` · `TIEN_DO_THIET_KE.html` · `HANDOFF.md` ·
  `kb/ai_design_prompts.yaml` · `workers/src/design/ai/arrange/{sketch,index,intent,issues,pack}.ts`
  · `workers/src/design/__tests__/{ai-arrange,ai-arrange-sketch}.test.ts`.
- Kiểm lần cuối: **1.269** phép thử thiết kế + shared, **428** phép thử giao diện, `npx tsc -b` và
  `prettier --check` đều sạch.

## 5. Môi trường — ba chỗ dễ vấp

1. Máy chủ Worker chạy từ thư mục `workers/`:
   `cd workers && npx wrangler dev --config wrangler.jsonc --port 8788`.
2. `workerd` đã tự sập một lần giữa lượt chạy nền (18/09, máy cạn bộ nhớ). Trước khi bấm một lượt
   tính tiền: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8788/` và `free -m`.
3. Vite giữ phiên đăng nhập ở **đúng cổng 5173**.

## 6. Nếu làm tiếp thì làm gì

1. Hỏi Haan bốn câu ở mục 1. **V-31 đáng hỏi trước nhất**: chừng nào bản phác còn rơi về xếp theo
   vùng thì cả T38 lẫn T56 vẫn chỉ nằm trên giấy ở lượt thật.
2. Q-A (ban công đua ra ngoài) đã được chốt LÀM — là đợt lớn nhất đang chờ, nên bắt đầu sau khi
   V-31 có hướng.
3. Chưa có phép đo trên mô hình thật cho T54/T55/T56 — **xin phép trước từng đợt**, nêu rõ số lượt
   và tiền. Ước một lượt Sonnet 5 mức Vừa ≈ 0,3–0,6 USD; dưới 65 điểm thì thêm tối đa 3 lượt sửa.
4. Commit: chạy test phần đã đổi → skill `backend-code-review` → mới commit (quy trình của Haan).
