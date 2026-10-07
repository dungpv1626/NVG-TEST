# Luật cấm và luật trừ điểm nặng — bản để Haan review (AI Design, mặt bằng)

> Lập 04/10/2026 (T115). Liệt kê MỌI chỗ làm một phương án mặt bằng bị BÁC, và các tiêu chí trừ điểm nặng nhất.
> Cột **Tần suất** = số vòng hỏng có dính luật ấy khi phát lại bằng mã hiện tại: «cũ» trên 209 vòng của 49 lượt thật
> trước đây (190 vòng hỏng), «nay» trên 25 vòng của 5 lượt thật 04/10/2026. Một vòng có thể dính nhiều luật.
> Cột **Ý kiến** để trống — Haan ghi: Giữ / Nới (ghi mức mới) / Bỏ / Thành trừ điểm.
>
> Ai xử lý khi vi phạm: **CT** = chương trình tự thử cách khác trước; **MH** = gửi câu nhắc cho mô hình vẽ lại (tốn
> một lời gọi). Luật nằm trong tệp dữ liệu sửa được không cần lập trình; luật trong mã cần sửa mã.

## Tổng quan — luật nào gây hỏng nhiều nhất

| Hạng | Luật | Tần suất cũ / 190 | Nay / 25 |
| --- | --- | --- | --- |
| 1 | B1 — Phòng không chạm hành lang / khu chung nối về thang (`sketch_room_no_access`) | 94 | 12 |
| 2 | C7 — Phòng mở cửa thẳng ra ô thang (`door_from_stair`) | 33 | 6 |
| 3 | D1 — Phòng hụt diện tích tối thiểu đầu bài (`arrange_room_below_brief_area`) | 31 | 2 |
| 4 | C4 — Phòng không đặt được cửa (`room_without_door`) | 28 | 10 |
| 5 | C2 — Phòng không giáp hành lang / khu chung nào đi tới được (`arrange_no_hub_wall`) | 26 | 4 |
| 6 | B4 — Phòng vẽ không thành một chữ nhật (`sketch_room_crooked`) | 21 | 3 |
| 7 | B2 — Ô thang cô lập (`sketch_stair_isolated`) | 19 | 2 |
| 8 | A — Cổng danh mục phòng (`program_brief`) | 15 | 6 |
| 9 | B5 — Xếp phòng kiểu chong chóng (`sketch_pinwheel_at`) | 14 | 1 |
| 10 | M — Cửa phòng thờ phải mở sau lưng bàn thờ (`altar_door_behind`) | 12 | 0 |

Nhóm «lối vào / hành lang / thang» (B1, B2, B3, C2, C4, C5, C6, C7, C8) có mặt ở **127 / 190 vòng hỏng (67 %)**.

---

## 1. Luật bắt buộc Haan đặt — `rules/nvg-mandatory.yaml` (T71)

| Mã | Luật | Ngưỡng | Ai sửa | Tần suất cũ / nay | Ý kiến |
| --- | --- | --- | --- | --- | --- |
| `wc_over_kitchen` | Bếp không nằm dưới WC tầng trên | chồng ≥ 100 cm² | CT rồi MH | 1 / 0 | |
| `wc_over_altar` | Phòng thờ không nằm dưới WC tầng trên | chồng ≥ 100 cm² | CT rồi MH | 0 / 0 | |
| `altar_beside_wc` | Phòng thờ không giáp WC | khe tường ≤ 40 cm, chồng cạnh ≥ 20 cm | CT rồi MH | 2 / 0 | |
| `altar_facing_wc` | Phòng thờ không đối diện WC | lệch ≤ 60 cm, cách ≤ 300 cm | CT rồi MH | 0 / 0 | |
| `balcony_off_open_face` | **T116:** CHẶN khi ban công không có cạnh nào ra mặt thoáng; ban công dài quay cạnh ngắn ra mặt thoáng chỉ trừ điểm nặng (D3 = 2,5). Ban công đua ra không xét | sai lệch mép 30 cm | CT rồi MH | 2 / 0 | |
| `wc_stack` | WC chung thẳng trục — **ưu tiên, không chặn** | — | CT | — | |

## 2. Luật đi lại — `kb/room_vocabulary.yaml` mục `passage`

Không tự sinh mã lỗi riêng; các cổng ở mục 4–5 đọc danh sách này để quyết thế nào là «có lối vào».

| Khoá | Giá trị hiện tại | Nghĩa | Ý kiến |
| --- | --- | --- | --- |
| `through` | hành lang, lõi, thang, khách, ăn, bếp | Phòng được đi xuyên qua; phòng khác phải chạm một trong các phòng này để có lối vào | |
| `entry_through` | gara, sảnh ngoài | Được đi qua để VÀO nhà (bước đầu từ ngoài vào) | |
| `not_a_route` | gara, sảnh ngoài | Không nằm trên đường đi hằng ngày trong nhà (T48) | |
| `everyday` | WC, bếp, ăn, thang | Phải tới được từ khu chung mà không xuyên `not_a_route` | |
| `everyday_from` | khách, ăn | Điểm xuất phát của đường đi hằng ngày | |
| `stair_opens_to` | hành lang, lõi, thang, thang máy, khách, ăn, bếp, sân thượng | Ô thang CHỈ được mở cửa sang các loại này (T74); WC, kho, phòng ngủ… mở ra thang bị bác | |
| `served_from` | kho ← bếp / gara; giặt ← bếp / gara / ban công / sân thượng; kỹ thuật ← gara / kho / bếp; WC ← hốc lavabo / phòng thay đồ; tủ đồ, thay đồ, góc học ← phòng ngủ; thang máy ← hành lang / lõi / thang / khách | Phòng phụ được mở cửa từ các phòng này (ngoài hành lang) | |
| `entry_room_by_building_type` | nhà phố: gara | Loại phòng được mang lối vào chính, ngoài khách / hành lang (Haan (a), 04/10/2026) | |

## 3. Cổng danh mục phòng — `workers/src/design/ai/program.ts` (`checkProposal`), mã `program_brief`

Chạy trước khi xếp tầng nào. Bác thì chưa tầng nào được xếp. **Tần suất: 15 / 6. Ai sửa: MH.**

| Luật | Ý kiến |
| --- | --- |
| Đủ mọi không gian đầu bài khai (đúng loại, đúng tầng nếu đầu bài ghim tầng) | |
| Đúng số phòng ngủ theo thành phần gia đình, đúng tầng đã ghim | |
| Phòng ngủ khép kín đủ số đầu bài khai | |
| Diện tích tối thiểu đầu bài khai là sàn cứng (chương trình tự nâng nếu mô hình khai thấp hơn) | |
| Mọi tầng có thang (nhà ≥ 2 tầng) — **đường v5 bắt mô hình tự khai thang từng tầng** | |
| Thang máy (nếu đầu bài có, kể cả «chừa chỗ») đủ cỡ giếng đầu bài khai, có ở mọi tầng | |
| Loại `only_when_asked` (giếng trời, sân trong, sân thượng, cửa hàng, thang máy) chỉ được có khi đầu bài hỏi tới | |
| Đòi hỏi suy từ câu trả lời đầu bài — 9 dòng `blocking: true` ở `kb/brief_fidelity.yaml`: thờ ở phòng riêng → có phòng thờ; thờ trên sân thượng → có phòng thờ hoặc sân thượng; kinh doanh tại nhà → có cửa hàng / kho; văn phòng tại nhà → phòng làm việc / cửa hàng; WC cho khách → có WC; bếp phụ → 2 bếp; lưu trữ nhiều → có kho; cục nóng trong hộp kỹ thuật → có hộp kỹ thuật / phòng kỹ thuật; phơi ngoài trời → có ban công / sân thượng / sân | |

Các dòng `blocking: false` cùng tệp (bồn nước mái, cục nóng sân thượng, bếp kín, khách ở lại, làm việc tại nhà, sân trong)
chỉ cảnh báo.

## 4. Cổng bản phác — `workers/src/design/ai/arrange/` (soát trước khi xếp)

Bản phác hỏng thì chương trình thử dựng lại bằng **khung xương** (T102) và các vòng khung cũ; không được thì gửi MH.
Rà soát 04/10/2026: khung xương **không dựng được ứng viên** với nhà ống 5 m và với tầng có dải phòng mỏng — nên
thực tế gần như mọi lỗi nhóm này đi thẳng về mô hình.

| # | Mã | Luật | Cũ / nay | Ý kiến |
| --- | --- | --- | --- | --- |
| B1 | `sketch_room_no_access` | Mỗi phòng cần cửa phải chạm (≥ 1 bề rộng cửa vách chung) một hành lang hay khu chung nối về ô thang | 94 / 12 | |
| B2 | `sketch_stair_isolated` | Ô thang phải chạm hành lang / khu chung ở mỗi tầng | 19 / 2 | |
| B3 | `sketch_stair_only` | Phòng không được chỉ vào được qua ô thang | 2 / 1 | |
| B4 | `sketch_room_crooked`, `sketch_not_rectangular` | Mỗi phòng là MỘT chữ nhật ô | 22 / 3 | |
| B5 | `sketch_pinwheel_at`, `sketch_pinwheel` | Không xếp kiểu chong chóng (không có đường chia thẳng xuyên vùng) | 14 / 1 | |
| B6 | `sketch_core_overlap` | Ô thang / thang máy tầng trên phải trùng mốc tầng dưới | 6 / 0 | |
| B7 | `sketch_room_missing`, `sketch_island_room`, `sketch_rooms_too_small` | Thiếu phòng trên bản phác / phòng cô lập / phòng quá nhỏ | 2 / 0 | |
| D1 | `arrange_room_below_brief_area` | Phòng vẽ ra hụt diện tích tối thiểu đầu bài (chương trình bù từ phòng thừa trước) | 31 / 2 | |
| — | `stair_entry_long_side` | Lối lên thang (đầu bậc 1) phải giáp hành lang / khu chung, không chỉ mở được ở cạnh dài (T105) | 4 / 0 | |
| M | `altar_door_behind` | **T116: thôi báo.** Cửa phòng thờ ưu tiên vách khác vách bàn thờ dựa lưng; chỉ còn vách ấy thì vẫn mở, bàn thờ chuyển vách đặc khác (T106) | 12 / 0 | |

## 5. Cổng xếp tầng và cửa — `workers/src/design/ai/arrange/`, `workers/src/design/ai/tree/openings.ts`

| # | Mã | Luật | Cũ / nay | Ai sửa | Ý kiến |
| --- | --- | --- | --- | --- | --- |
| C1 | `door_outside_on_boundary`, `door_no_outside_edge` | Phòng mang cửa ra ngoài phải có cạnh ra mặt thoáng (không giáp ranh / nhà xóm) | 0 / 4 | CT (đổi phòng lối vào) rồi MH | |
| C2 | `arrange_no_hub_wall` | Phòng phải giáp hành lang / khu chung đi tới được để mở cửa | 26 / 4 | MH | |
| C3 | `door_wall_too_short` | Vách đủ chỗ đặt cửa: cửa 0,9 m (WC / phòng nhỏ 0,75 m) + lề 0,1 m mỗi bên | 2 / 3 | CT | |
| C4 | `room_without_door` | Mọi phòng (trừ loại không cần cửa) có ít nhất một cửa | 28 / 10 | CT rồi MH | |
| C5 | `room_unreachable_on_level`, `arrange_unreachable`, `level_no_entrance` | Mọi phòng đi tới được từ cửa ngoài (tầng 1) / từ thang (tầng trên) | 3 / 0 | MH | |
| C6 | `route_through_service` | Đường đi hằng ngày (khách / ăn → WC, bếp, ăn, thang) không xuyên gara / sảnh ngoài (T48) | 5 / 0 | MH | |
| C7 | `door_from_stair` | Phòng không được lấy cửa thẳng từ ô thang (chỉ hành lang, khu chung, sân thượng, thang máy) (T54, T74) | 33 / 6 | MH | |
| C8 | `room_through_private` | Không phải đi xuyên phòng riêng để tới phòng khác | 0 / 0 | MH | |
| C9 | `entrance_wrong_side`, `vehicle_door_wrong_side`, `arrange_entrance_side` | Cửa chính / cửa xe đúng mặt đầu bài khai | 0 / 0 | CT rồi MH | |
| C10 | `ensuite_door_wrong` | WC khép kín chỉ mở cửa vào phòng mẹ | 0 / 0 | CT | |
| C11 | `arrange_stair_too_short` | Ô thang đủ dài cho số bậc theo chiều cao tầng | 5 / 0 | MH | |
| C12 | `arrange_room_too_narrow` | Phòng đủ rộng kê đồ (v5: `kb/furniture.yaml`, vd ban công ≥ 0,9 m) | 1 / 1 | MH | |
| C13 | `arrange_program_exceeds_footprint`, `arrange_zone_overfull` | Tổng diện tích tầng vượt khối xây / dồn quá nhiều phòng một vùng | 0 / 0 | MH | |
| C14 | `stair_missing_on_level`, `stair_not_at_anchor`, `elevator_not_at_anchor`, `light_well_not_at_anchor` | Thang / thang máy / giếng trời chồng đúng mốc tầng dưới | 1 / 0 | CT | |
| — | `tree_*`, `cut_*`, `cell_*`, `leaf_*`, `merge_*`, `outline_*`, `footprint_*`, `snap_collapsed_cell`, `void_on_ground` | Lỗi dựng hình nội bộ (cây chia ô, hình bao tầng) — không phải luật thiết kế | ~0 | CT | — |

## 6. Kiểm đầu bài cần toạ độ — `workers/src/design/ai/plan-demands.ts`

| Mã | Luật | Ý kiến |
| --- | --- | --- |
| `balcony_side_missing`, `balcony_level_missing` | Mặt BẮT BUỘC có ban công phải có một ban công chạy dọc mặt ấy (ban công góc chỉ tính cho mặt có cạnh dài) | |
| `balcony_side_not_wanted`, `balcony_not_wanted` | Mặt CẤM không được có ban công | |
| `elevator_missing`, `elevator_not_aligned`, `elevator_too_small`, `elevator_too_narrow`, `elevator_no_common_hall`, `elevator_not_beside_stair`, `elevator_not_facing_stair` | Thang máy chồng khít mọi tầng, đủ cỡ giếng, mở ra sảnh chung, đúng vị trí đầu bài chọn | |

## 7. Riêng đường v5 (hình chữ nhật) — `workers/src/design/ai/layout.ts`

| Mã | Luật | Ý kiến |
| --- | --- | --- |
| `rect_overlap`, `rect_gap`, `rect_outside_block` | Các phòng một tầng lát kín khối, không chồng, không hở, không ra ngoài vùng xây | |
| `rect_too_small`, `rect_shape` | Phòng không nhỏ hơn mức tối thiểu / không quá dẹt | |
| `layout_unknown_id`, `layout_bad_level` | Mã phòng ngoài danh mục (trừ tiền tố mô hình được thêm), tầng không tồn tại | |
| `cantilever_dropped` | Ban công đua không gắn được vào cạnh ngoài phòng chủ | |
| Kiểm lược đồ | Câu trả lời sai lược đồ bị bỏ cả (đường v5 hiện chưa cắt dòng `assumptions` > 200 ký tự) | |

## 8. Số đo dùng ở cổng — `kb/construction_norms.yaml` mục `openings`

| Khoá | Giá trị | Dùng ở | Ý kiến |
| --- | --- | --- | --- |
| `door.width_m` | 0,9 m | C3: vách tối thiểu 1,1 m mới đặt được cửa | |
| `wc_door.width_m` | 0,75 m (cả kho, tủ đồ, phòng kỹ thuật) | C3 | |
| `door_margin_m` | 0,1 m mỗi bên | C3 | |
| `entrance.width_m` / `share_of_wall` / `max_width_m` | 1,65 m / 55 % vách / 3,8 m | Cửa chính, cửa cuốn gara | |
| `circulation.corridor_clear_m` | 1,2 m | Bề rộng thông thuỷ hành lang chương trình dựng (khung xương), không thu hẹp dưới mức này | |

## 9. Ngưỡng lưu phương án — `kb/plan_quality.yaml`

| Khoá | Giá trị | Nghĩa | Ý kiến |
| --- | --- | --- | --- |
| `accept_percent` | 60 | Dưới 60 điểm thì không lưu, dùng lượt sửa còn lại | |
| `accept_group_floor_percent` | 40 | **Một nhóm dưới 40 % là bác**, dù tổng điểm đạt (T96) — tác dụng như luật cấm | |
| `variant_search_until_percent` | 65 | Dưới mức này chương trình còn thử biến thể | |

## 10. Tiêu chí trừ điểm — thước chấm `kb/plan_quality.yaml`

Điểm tối đa của tiêu chí = trọng số nhóm × trọng số tiêu chí ÷ tổng trọng số trong nhóm (khi mọi tiêu chí trong nhóm
đều đo được). **Đậm = trừ điểm nặng (≥ 4 điểm / 100)**. «Đạt» = mức cho trọn điểm, «Về 0» = mức mất hết điểm (giữa hai
mức nội suy).

| Mã | Nhóm (trọng số) | Tiêu chí | Điểm tối đa | Đạt → Về 0 | Ý kiến |
| --- | --- | --- | --- | --- | --- |
| **A3** | A Đúng chương trình (25) | Phòng thờ ở tầng cao nhất có người ở, không dưới WC, không chung tường WC | **7,7** | — | |
| A1 | A | Lệch diện tích so với chương trình | 3,8 | lệch 10 % → 30 % | |
| A2 | A | Phòng đúng tầng chương trình định (cổng cũng chặn) | 3,8 | 100 % → 70 % | |
| A4 | A | Tầng có phòng ngủ thì có WC | 3,8 | 100 % → 99 % | |
| A5 | A | Số phòng nhỏ hơn mức tối thiểu nghề | 3,8 | 0 → 2 | |
| A6 | A | Số phòng lớn hơn mức tối đa nghề | 1,9 | 0 → 2 | |
| **B1** | B Hình dáng phòng (20) | Số phòng có cạnh ngắn dưới mức tối thiểu loại phòng (mục 11) | **6,7** | 0 → 2 | |
| **B2** | B | Số phòng vượt tỉ lệ dài / rộng tối đa (mục 11) | **6,7** | 0 → 2 | |
| **B4** | B | Chiều cao bậc thang | **6,7** | 15–18 cm (cứng 14–19,5 cm) | |
| **C1** | C Giao thông (30) | Số phòng chỉ tới được bằng cách đi xuyên phòng ngủ khác | **4,1** | 0 → 1 | |
| **C9** | C | Số phòng phải đi xuyên từ cửa chính tới phòng khách | **4,1** | 0 → 1 | |
| C12 | C | Bề rộng lớn nhất của hành lang dạng dải | 3,1 | 1,5 m → 2,4 m | |
| C2 | C | Tỉ lệ diện tích giao thông | 2,1 | 18–36 % (cứng 12–42 %), theo loại hình | |
| C3 | C | Số phòng phải qua từ lối vào tới chân thang | 2,1 | 0 → 2 | |
| C4 | C | Bề rộng nhỏ nhất của hành lang | 2,1 | 1,0 m → 0,9 m | |
| C5 | C | Có cửa hàng thì lối lên thang không qua chỗ bán | 2,1 | — | |
| C6 | C | Số cửa từ khu chung tới WC chung xa nhất | 2,1 | 1 → 3 | |
| C7 | C | Quãng đường tới WC chung xa nhất | 2,1 | 8 m → 20 m | |
| C8 | C | Chiều dài hành lang trên mỗi phòng phục vụ | 2,1 | 2,5 m → 6 m | |
| C10 | C | Số hành lang cụt (mở vào < 2 phòng) | 2,1 | 0 → 1 | |
| C11 | C | Số phòng phải xuyên từ gara vào phòng khách | 2,1 | 0 → 2 | |
| **D2** | D Mặt thoáng (15) | Số phòng ngủ tối hẳn (không cửa sổ ra mặt thoáng, không ra ban công) | **4,3** | 0 → 1 | |
| **D5** | D | Số ban công bố trí lệch (ôm góc, không bám phòng, sai thứ tự ưu tiên) | **4,3** | 0 → 2 | |
| D1 | D | Tỉ lệ phòng ở có cửa sổ ra mặt thoáng | 2,1 | 100 % → 70 %, theo loại hình | |
| D3 | D | Tỉ lệ ban công quay cạnh dài ra mặt thoáng | 2,1 | 100 % → 50 % | |
| D4 | D | Số phòng giặt phơi không có chỗ phơi | 2,1 | 0 → 1 | |
| **E5** | E Dựng được (10) | Tỉ lệ khu ướt tầng trên không đè lên khách / ăn / ngủ / thờ / lối vào tầng dưới | **4,3** | 100 % → 50 % | |
| E2 | E | Tỉ lệ WC tầng trên gần WC tầng dưới / hộp kỹ thuật | 2,9 | 100 % → 50 % | |
| E4 | E | Hộp kỹ thuật liên tục qua các tầng | 2,9 | — | |

Lưu ý: nhóm C (giao thông) nặng nhất (30) và có sàn 40 % — một mặt bằng giao thông kém bị bác dù các nhóm khác tốt.

## 11. Luật kinh nghiệm dùng làm ngưỡng kích thước — `rules/nvg-experience.yaml`, `rules/nvg-measured.yaml`

Mức `warning` — không bác phương án trực tiếp. Nhưng cạnh tối thiểu và tỉ lệ dài / rộng ở đây (a) là ngưỡng của B1, B2
(mỗi tiêu chí 6,7 điểm), và (b) **bộ xếp dùng để loại ứng viên chia ô** («chỉ chia được ô … dài hơn N lần bề ngang» —
trong vết bộ xếp lượt `83e5c327`, đây là lý do bỏ ứng viên phổ biến nhất sau «dải không chia được»).

| Loại phòng | Cạnh ngắn tối thiểu | Diện tích tối thiểu | Dài / rộng tối đa | Số mẫu đo (n) | Ý kiến |
| --- | --- | --- | --- | --- | --- |
| Phòng ngủ | 2,35 m | 9 m² | 1,9 | 9 | |
| Phòng ngủ chính | 3,1 m | 14 m² | (nhóm ở: 2,5) | 4 / 2 | |
| Phòng khách | 3,5 m | 14 m² | (nhóm ở: 2,5) | 5 / 2 | |
| WC | 1,25 m | 3 m² | 2,5 | 5 / 12 | |
| Hành lang | 1,0 m | — | — | 6 | |
| Bếp | 1,8 m | — | (phụ trợ: 3,0) | 0 | |
| Gara | 2,4 m | — | (phụ trợ: 3,0) | 0 | |
| Ban công | 1,0 m | — | (ngoài trời: 4,0) | 5 | |
| Giặt phơi | 1,2 m | — | (phụ trợ: 3,0) | 0 | |
| Kho | 0,85 m | — | (phụ trợ: 3,0) | 1 | |
| Tủ đồ / thay đồ / góc học | 0,9 / 1,5 / 1,8 m | — | — | 0 | |
| Giếng trời | — | tối đa 8 m² | (ngoài trời: 4,0) | 0 | |

Luật kinh nghiệm khác (chỉ cảnh báo): bếp gần phòng ăn; WC tách phòng thờ; WC tách bếp; phòng thờ tầng trên cùng; gara
tầng 1; thang không đối diện cửa chính; bếp có mặt thoáng; gara ở mặt tiếp cận; phòng ngoài trời ở mặt thoáng.

**Số mẫu n = 0** nghĩa là ngưỡng chưa đo trên hồ sơ thật nào — nên xem lại trước tiên.
