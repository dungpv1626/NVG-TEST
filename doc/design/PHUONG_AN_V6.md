# Phương án v6 — đối chiếu handoff với kho và kế hoạch làm

> Đầu vào: `~/Documents/Doc/NVG/design/handoff-v6-tong-hop.md` (04/10/2026). Handoff dặn: nếu cấu trúc kho khác mô
> tả thì lập bảng ánh xạ, nêu khác biệt, hỏi trước khi đổi kiến trúc — tài liệu này làm việc ấy. Chưa sửa mã nào.
> Căn cứ số liệu: `RA_SOAT_LUOT_THAT_T115.md`, `TONG_HOP_LUOT_THU_V5.md`, `LUAT_CAM_VA_TRU_DIEM.md`.

## 0. Tóm lại

Đề xuất **làm theo handoff**, với ba điều chỉnh để dùng lại phần đã chạy được của kho:

1. **Bộ giải dải sinh ra cây chia ô `ai-plan-tree` có sẵn**, không viết validator mới. Một mặt bằng dải chính là cây
   chia hai cấp: cắt ngang giữa các dải, cắt dọc trong từng dải, ô sân là `unbuilt_N`. Cây đi thẳng vào đường
   `ai/tree/` đang có (đặt cửa, cổng cửa / đi lại, luật bắt buộc NVG, đòi hỏi đầu bài, chấm điểm, vẽ SVG, xuất DXF) —
   tất cả đã làm việc trên toạ độ cm, không qua lưới. «Validator mm» của handoff (B1) = cổng `ai/tree/` + bộ luật theo
   loại nhà. Đường v6 bỏ hẳn bản phác lưới, cổng `sketch_*` và bộ xếp `arrange/`.
2. **Loại nhà (profile) suy từ đầu bài đang có**, không thêm câu hỏi: `building_type` + bề rộng lô + hình thức kinh
   doanh (mục 2.2).
3. **Bộ oracle phải dựng mới**: kho chưa có mặt bằng thật nào ở dạng toạ độ phòng (chỉ có 85 phòng đo kích thước của
   7 hồ sơ). Cần Haan gửi bản vẽ (mục 5, câu 1).

## 1. Bảng ánh xạ handoff ↔ kho

| Handoff | Trong kho | Trạng thái |
| --- | --- | --- |
| Danh mục phòng có mã, catalog luật có điều kiện, delta (v5) | `ai/house-program.ts`, `ai/layout-prompt.ts`, `contracts/ai-house-layout-delta` | **Có** — giữ |
| Vẽ tầng mái | `kb/roof_plan.yaml`, `ai/roof.ts`, tờ «Mặt bằng — Mái» (T115) | **Có**; thêm `TUM` đặt trên thang |
| Claude / GPT / Gemini qua API | `llm/anthropic.ts`, `llm/openai.ts`, `llm/gemini.ts`, `config/models.yaml` | **Có** |
| Gara là phòng lối vào (nhà ống / phố) | `passage.entry_room_by_building_type`, cửa cuốn + cửa đi (T115, Haan chọn (a)) | **Có một phần** — mới cho «nhà phố», chưa tách ỐNG / PHỐ / KD |
| Mật độ theo chủ nhà | `site.max_density` trong đầu bài | **Có một phần** — ô mật độ đang **ẩn với nhà phố**, nên nhà phố không khai được |
| Luật / thông số theo loại nhà | `rules/*.yaml` có `applies_to` theo `building_type`; `plan_quality.yaml` có `by_building_type` ở C2, D1, D2 | **Có một phần** — chỉ 3 loại, không có ỐNG / KD, không có mức hard / penalty / off theo loại |
| Profile `ong / pho / kd / bt / vuon` | `building_type`: `nha_pho / biet_thu / nha_vuon` | **Chưa** — suy thêm (mục 2.2) |
| Khu chung `hub` (sảnh tầng, chiếu tới) | `passage.through` có `circulation`, `stair`; ô thang là cả khối bậc; có hình học thang (`stairArrival`, T105) | **Chưa** — cần phân biệt vế bậc / chiếu tới |
| Ngữ pháp dải (schema cho model) | — | **Chưa** — hợp đồng mới `contracts/ai-house-bands` (+ delta) |
| Bộ giải dải | Khung xương T102 (`arrange/skeleton.ts`) cùng ý tưởng dải trước / lõi / sau, nhưng xếp phòng thành cột ngang và lấy bản phác làm gợi ý | **Chưa** — viết mới `ai/bands/`, ra `ai-plan-tree` |
| Validator mm | `ai/tree/` (cổng cửa, đi lại), `ai/mandatory.ts`, `ai/plan-demands.ts`, `ai/plan-score.ts` — chạy trên cây cm | **Có** — dùng lại, đọc luật theo profile |
| Cổng khả thi trước khi gọi model | Cổng danh mục chỉ đếm phòng, không thử dựng | **Chưa** |
| Vòng sửa: khoá tầng, dừng sớm, chấp nhận theo tầng | Khoá tầng đã qua (T86); chọn gốc sửa theo bậc lỗi cả nhà (`revisionBase`); không dừng sớm | **Có một phần** |
| Mẫu dải theo loại nhà (`<patterns>`) | — | **Chưa** — đặt ở `kb/`, chỉ chèn mẫu của loại đang thiết kế |
| Bộ oracle bản vẽ thật | `doc/design/13-ho-so-thuc-te.md`, 85 phòng đo được (`mat_bang_cong_nang/phong_do_duoc.csv`) — chỉ kích thước | **Chưa** — cần bản vẽ |
| Công cụ đo `TONG_HOP_LUOT_THU_*`, phát lại 209 vòng | `.sao-luu/t115-phat-lai/` (gen-tong-hop, zz-replay4, zz-today) | **Có** — thêm cột profile, đường v6 |

## 2. Khác biệt và điều chỉnh đề xuất

### 2.1 Validator = đường cây có sẵn (thay cho viết lại trên rect)

- Bộ giải xuất `ai-plan-tree` mỗi tầng → `ai/tree/` dựng ô, đặt cửa, kiểm. Lỗi chồng lấn / khe hở / méo / chong chóng
  không thể có (cây chia luôn lát kín, mỗi lá một chữ nhật).
- Lợi: không nhân đôi luật (một luật một chỗ kiểm cho cả ba đường lưới / v5 / v6), vẽ và DXF chạy ngay, chấm điểm giữ
  nguyên thang đo để so được với lượt cũ.
- Phải sửa trong `ai/tree/`: đọc thông số và mức luật theo profile thay cho số cố định (hành lang, vách cửa, cửa cuốn
  gara, `stair_opens_to` có `hub`, chiếu tới khác vế bậc).
- Cửa: handoff để bộ giải tự đặt cửa. Đề xuất bộ giải chỉ **chọn cặp phòng có cửa** (theo luật 3.2 của handoff +
  `doors_prefer`), còn **vị trí cửa** để `ai/tree/openings.ts` đặt như hiện nay — đã xử lý lề, cửa cuốn + cửa đi, chiều
  mở cánh, cửa sổ.

### 2.2 Suy profile từ đầu bài (Haan chốt T116)

| Profile | Điều kiện |
| --- | --- |
| `ong` | Xét theo **khối xây**, đủ cả ba: bề rộng khối xây ≤ 6 m, chiều sâu ≥ 2 × bề rộng, giáp nhà hoặc ranh ở ít nhất một mặt bên. Lô góc hẹp vẫn là `ong`, thêm một mặt thoáng bên |
| `pho` | `building_type = nha_pho`, không thoả `ong` |
| `kd` (ghép với `ong` / `pho`) | `household.home_business.mode` ∈ {`cua_hang_mat_tien`, `kho_hang`, `san_xuat_nho`} |
| `bt` | `building_type = biet_thu` |
| `vuon` | `building_type = nha_vuon` |
| Ghi đè | **Ô mới trong đầu bài cho KTS ghi đè loại nhà** (thắng mọi suy diễn) |

Một hàm duy nhất ở `shared/` (giao diện hiển thị «Loại nhà: Nhà ống — tự suy / KTS chọn», Worker dùng chọn luật).
Ngưỡng 6 m và tỉ lệ 2 là dữ liệu.

### 2.3 Chỗ handoff đụng quyết định cũ — Haan đã quyết (T116)

| Đề xuất của handoff | Haan quyết |
| --- | --- |
| `balcony_off_open_face` → trừ điểm | **Tách hai**: CHẶN ban công không có cạnh nào ra mặt thoáng; TRỪ ĐIỂM NẶNG ban công dài quay cạnh ngắn ra mặt thoáng |
| Tự đề xuất giếng trời / sân trong | **Giữ T96**: không tự vẽ, chỉ đề xuất bằng lời; nhà ống sâu ≥ 12 m có phòng ở không mặt thoáng → chương trình báo «nên có giếng trời» cho KTS |
| Sàn nhóm 40 % → 25 % | **Quyết bằng số liệu**: chạy oracle + phát lại 209 vòng ở 40 % và 25 %, báo cáo |
| `altar_door_behind` | **Tách hai**: CHẶN cửa / lối đi trên tường sau lưng bàn thờ; TRỪ ĐIỂM hướng lệch hoặc cửa chéo ngay trước mặt bàn thờ; chương trình tự chọn tường đặt bàn thờ trước khi báo lỗi (Haan xác nhận câu chữ) |
| Cục nóng trong hộp kỹ thuật → trừ điểm | **Giữ chặn**, chương trình tự thêm hộp kỹ thuật ~0,6 × 0,8 m cạnh khu ướt, liên tục các tầng |
| Diện tích hụt ≤ 10 % → trừ điểm | **Giữ T41** (sàn cứng); cổng khả thi xử lý trước khi gọi model |
| Mật độ theo chủ nhà | **Mở ô cho nhà phố, không bắt buộc**; trống = không giới hạn ngoài khoảng lùi / vùng xây |

### 2.4 Phạm vi giữ nguyên

Đường lưới và đường v5 giữ sau cờ để so sánh; đường mới `AI_PROMPT_PIPELINE=v6`. Hợp đồng mới đi qua `contracts/` +
`npm run contracts:gen` như mọi ranh giới (CLAUDE.md 8.2). Không bỏ luật nào khỏi kho — mức luật theo profile là dữ
liệu, đường cũ đọc mức cũ.

## 3. Kế hoạch theo bước — mỗi bước có tiêu chí xong đo được không tốn token

Thứ tự theo handoff mục 7; điểm dừng chờ Haan duyệt đánh dấu **DỪNG**.

**Bước 1 — Luật và thông số theo profile (dữ liệu) + bộ oracle**
- `kb/house_profiles.yaml`: danh sách profile, cách suy (2.2), `params` (hành lang, vách cửa, cửa cuốn gara, phòng lối
  vào, gara là lối đi, `hub`), mức `hard / penalty / off` từng luật (handoff 3.4) — trừ các dòng ở 2.3 chưa được xác nhận.
- `passage` theo profile (handoff 3.2), ngưỡng kích thước theo profile (handoff 3.3 ⚑), thước chấm theo profile (3.5 ⚑).
- Mở ô mật độ cho nhà phố (nếu Haan đồng ý ở 2.3).
- Bộ oracle: mã hoá tay các bản vẽ Haan gửi thành dải + rect, mỗi bản kèm profile; phép thử: oracle qua cổng hiện tại
  (đếm bị bác oan) và qua cổng sau khi áp profile (phải 100 %).
- Phát lại 209 vòng cũ với luật mới: số vòng «hỏng oan» được cứu, theo từng luật đổi.
- Xong khi: bảng «luật đã đổi + lý do + số vòng cũ được cứu»; 100 % oracle qua. **DỪNG — Haan duyệt các mục ⚑.**

**Bước 2 — Bộ giải dải `workers/src/design/ai/bands/`**
- Vào: khối xây, danh mục phòng (min_m2, cạnh tối thiểu theo profile), dải, ô cố định (thang, giếng trời tầng 1).
  Ra: `ai-plan-tree` mỗi tầng + cặp cửa, hoặc lỗi cấu trúc có số thiếu (mm, m²) — không bóp méo.
- Thuật toán theo handoff B3: bề rộng ô theo tỉ lệ diện tích, chiều sâu dải theo ô sâu nhất, dải thang cùng y0 mọi tầng,
  bước 100 mm.
- Xong khi: dựng lại mọi oracle từ dải viết tay, lệch ≤ 300 mm; < 50 ms mỗi tầng; tất định.

**Bước 3 — Nối đường v6 + cổng khả thi**
- `ai/plan.ts`: v6 = dải → bộ giải → cây → cổng `ai/tree/` theo profile → chấm. Không gửi model lỗi về phòng chương
  trình tạo. Cắt `assumptions` > 200 ký tự.
- Cổng khả thi: chạy mẫu dải của profile với danh mục phòng của đầu bài **trước khi** gọi model; không vừa → hiện lựa
  chọn nới cho kiến trúc sư (thu phòng khách, gộp bếp ăn, giếng trời thành sân sau, bỏ kho). Cần thêm một ô trên màn
  hình AI Design.
- Xong khi: đường v6 không còn mã `sketch_*`; đầu bài nhà ống demo qua cổng khả thi hoặc ra đúng lựa chọn nới.

**Bước 4 — Hợp đồng dải + lời dẫn v6 + mẫu dải**
- `contracts/ai-house-bands.schema.json` (+ delta), sinh Zod.
- Lời dẫn v6 (handoff B4): giữ catalog luật / tri thức / đầu bài của v5, lọc theo profile; bỏ mọi luật bộ giải bảo
  đảm; mẫu dải `kb/` theo profile (handoff mục 5), chỉ chèn mẫu của loại đang thiết kế.
- Xong khi: phát lại tay — dải viết theo đúng mẫu của từng profile qua trọn đường v6 cho bộ 10 đầu bài.

**Bước 5 — Vòng sửa mới**
- Phân loại lỗi: chương trình tự xử lý / lỗi cấu trúc gửi model / mâu thuẫn đầu bài dừng hỏi kiến trúc sư.
- Chấp nhận khi tầng đang sửa tốt lên (so theo tầng); dừng sớm khi cùng `(luật, phòng)` lặp 2 vòng; tối đa 3 vòng; câu
  lỗi ngắn mô tả hiện trạng; mức suy nghĩ lần đầu `medium`, vòng sửa `low` nếu không mất bộ nhớ đệm.
- Xong khi: phát lại có điều khiển (câu trả lời giả lập) cho thấy dừng đúng, không gửi trùng.

**Bước 6 — Bộ 10 đầu bài và chạy thật**
- Dựng đầu bài + khảo sát demo hợp lý: ≥ 4 ỐNG 4–5 m, ≥ 3 PHỐ 6–8 m, ≥ 2 BT, ≥ 1 VƯỜN / KD (đã có 1 ỐNG, 1 BT).
  Haan duyệt bộ đầu bài trước khi chạy.
- Theo cổng P6 (`RA_SOAT_LUOT_THAT_T115.md`): chỉ xin chạy thật khi phát lại tại máy cho thấy đường v6 qua. Ước:
  10 lượt × ≤ 0,15 USD ≈ 1,5 USD (mục tiêu của handoff; lượt đầu có thể cao hơn).
- Đo theo bảng chỉ tiêu handoff mục 6, bằng công cụ `TONG_HOP_LUOT_THU_*` thêm cột profile và đường v6.

## 4. Rủi ro

| Rủi ro | Cách giảm |
| --- | --- |
| Mặt bằng dải quá «khuôn» so với kiến trúc sư (khối L, phòng thông tầng) | Handoff đã loại khỏi đợt này; ô `"."` cho khối L đơn giản; thước chấm vẫn đo chất lượng |
| Ngưỡng ⚑ chưa đo trên hồ sơ thật | Oracle bước 1 hiệu chỉnh; ngưỡng là dữ liệu, sửa không cần mã |
| `ai/tree/` có chỗ còn viết cứng số (hành lang, vách cửa) | Bước 1 gom về `kb/house_profiles.yaml`; phép thử đột biến cho luật mới (`mutation-proof`) |
| Nới luật làm lượt cũ «qua» nhưng mặt bằng kém | Mọi luật chuyển hard → penalty vẫn trừ điểm; Haan xem tờ vẽ của các vòng được cứu |
| Ba đường song song làm mã phình | Đường lưới và v5 đóng băng (chỉ sửa lỗi); gỡ sau khi v6 đạt chỉ tiêu và Haan đồng ý |

## 5. Câu hỏi cho Haan

1. ~~Bản vẽ oracle~~ — có hồ sơ MR Dương (`KT01-05 - MẶT BẰNG CÔNG NĂNG.dxf`, `KT06-07 - MẶT BẰNG.dxf`). Một công trình
   là chưa đủ để hiệu chỉnh ngưỡng theo loại nhà; các ngưỡng còn lại giữ cờ ⚑ tới khi có thêm bản vẽ.
2. ~~Ngưỡng ỐNG~~ — đã chốt (2.2).
3. ~~Các dòng 2.3~~ — đã quyết.
4. **Validator**: đồng ý dùng đường cây `ai/tree/` có sẵn làm validator mm (2.1)? — hỏi lại trước Bước 3.
5. ~~Bắt đầu Bước 1~~ — đang làm.
