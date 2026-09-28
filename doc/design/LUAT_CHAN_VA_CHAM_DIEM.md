# Luật chặn và luật chấm điểm của «AI Design» — hiện trạng

Rút từ mã và dữ liệu ngày 25/09/2026, nhánh `ha_tang_kiem` (chưa commit, lời dẫn 8.26.0). Tệp này chỉ
**liệt kê**. Nguồn sự thật vẫn là các tệp ghi ở từng mục, mã và dữ liệu đổi thì tệp này cũ đi.

Ba loại, tách bạch:

| Loại                   | Hậu quả                                                                   | Ở đâu |
| ---------------------- | ------------------------------------------------------------------------- | ----- |
| **CHẶN** (`blocking`)  | Không lưu phương án. Mã «sửa được» thì gửi lại mô hình, còn lại thì dừng. | Mục 1 |
| **ĐIỂM**               | Không chặn. Xếp hạng ứng viên; dưới 65 % thì dùng lượt sửa còn lại.       | Mục 2 |
| **CẢNH BÁO / GHI CHÚ** | Không chặn, không vào điểm (trừ ngưỡng B1/B2 đọc từ `rules/`).            | Mục 3 |

Vòng sửa: tối đa `HOUSE_REVISIONS_MAX = 5` lượt gọi lại (`ai/plan.ts`; 3 → 5 ngày 25/09/2026, lượt sửa chỉ
trả tầng có lỗi, gửi lại bản tốt nhất hai lần không tiến thì đổi gốc — T79). Chỉ mã trong
`REVISABLE_CODES` (`ai/arrange/issues.ts:86`) được gửi lại mô hình. Mã khác là lỗi hình học: bộ xếp tự
thử hết cách rồi dừng. Mô hình nộp lại y nguyên phần đang hỏng thì dừng sớm (`retry: 'unchanged'`).
Cột **Gửi lại** dưới đây: ✔ = trong `REVISABLE_CODES`.

---

## 1. Luật CHẶN

### 1.0 Cổng đầu bài: trước khi gọi mô hình

`shared/src/design/brief-completeness.ts` `checkBriefConsistency`, mức `nghiem_trong` chặn ở `brief/gate.ts`.
Mới 25/09/2026: `thang_may_thieu_kich_thuoc` — khai thang máy (làm ngay / chừa chỗ) mà chưa điền bề rộng và
chiều sâu lọt lòng giếng theo hãng thang. Chương trình không còn đoán kích thước giếng theo tải.

Liệt kê theo thứ tự lượt chạy đi qua.

### 1.1 Cổng chương trình không gian: bước 1, trước khi vẽ

`ai/program.ts` `checkProposal`. Không có mã, trả câu chữ. Bác thì gọi lại mô hình ở bước chương trình.

| Kiểm                                    | Bác khi                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mã tạm                                  | Một mã dùng hai lần                                                                                                     |
| Từ vựng                                 | Loại không gian không có trong `kb/room_vocabulary.yaml`                                                                |
| Tầng                                    | Phòng đặt ở tầng lớn hơn số tầng                                                                                        |
| Khép kín (`ensuite_of`)                 | Trỏ mã không có; trỏ chính nó; loại con ngoài `ensuite_child_types`; phòng mẹ không phải phòng ngủ; khác tầng mẹ        |
| Mỗi tầng                                | Tầng rỗng; tổng m² (kể phòng khép kín) vượt sàn xây được; thiếu thang khi nhà nhiều tầng                                |
| Không gian bắt buộc của đầu bài         | Thiếu loại; sai số dòng; sai tầng ghim; lệch diện tích ghim quá `area_tolerance_ratio` = 0,2                            |
| Phòng ngủ theo gia đình                 | Số phòng ngủ ≠ số thành viên cần; dư phòng ngủ; thiếu phòng khép kín; thiếu nhu cầu riêng của thành viên                |
| Thang máy (T65)                         | Đầu bài khai thang máy (kể cả «chừa chỗ»): tầng nào thiếu ô, hoặc ô nhỏ hơn mức theo tải                                |
| Ban công (T65)                          | Khai không làm mà vẫn có; khai mọi tầng mà tầng ≥ 2 thiếu; khai mặt mà không có cái nào                                 |
| Bảng `demands.spaces`, `blocking: true` | Xem bảng 1.1a                                                                                                           |
| Chỗ để xe                               | Khai số xe mà không có gara; gara nhỏ hơn `garage_min_m2` (15 m²/ô tô · 2,5 m²/xe máy; theo cỡ xe: 15 / 16,5 / 17 / 18) |

**1.1a Đòi hỏi suy từ đầu bài, loại CHẶN** (`kb/brief_fidelity.yaml` mục `demands.spaces`):

| Mã                      | Câu trả lời                                              | Phải có                         |
| ----------------------- | -------------------------------------------------------- | ------------------------------- |
| `phong_tho_rieng`       | thờ cúng = phòng thờ riêng                               | `altar_room`                    |
| `tho_san_thuong`        | thờ cúng = trên sân thượng                               | `altar_room` hoặc `terrace`     |
| `kinh_doanh_tai_nha`    | kinh doanh ∈ {cửa hàng mặt tiền, sản xuất nhỏ, kho hàng} | `shop` hoặc `storage`           |
| `van_phong_tai_nha`     | kinh doanh = văn phòng tại nhà                           | `study` hoặc `shop`             |
| `wc_cho_khach`          | cần WC cho khách                                         | `wc`                            |
| `bep_phu`               | có bếp phụ                                               | 2 `kitchen`                     |
| `kho_do_nhieu`          | lưu trữ = nhiều                                          | `storage`                       |
| `hop_ky_thuat_cuc_nong` | cục nóng điều hoà = hộp kỹ thuật                         | `shaft` hoặc `technical`        |
| `cho_phoi_ngoai_troi`   | phơi đồ ngoài trời (hoặc cả hai)                         | `balcony`/`terrace`/`courtyard` |

Chỉ suy từ câu **đã** trả lời. Câu chưa hỏi không sinh đòi hỏi.

### 1.2 Bản phác lưới và bộ xếp: bước 2, dựng từng tầng

`ai/arrange/issues.ts` `ARRANGE_ISSUE_CODES`. Mã chỉ báo lên khi **cả tầng** không xếp được theo cách nào.

| Mã                                  | Nghĩa                                                                                                     | Gửi lại |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | :-----: |
| `sketch_room_missing`               | Bản phác không vẽ phòng có trong chương trình                                                             |    ✔    |
| `sketch_not_rectangular`            | Phòng trên bản phác không nắn được về chữ nhật                                                            |    ✔    |
| `sketch_pinwheel`                   | Xếp kiểu chong chóng, không có đường chia chạy suốt                                                       |    ✔    |
| `sketch_rooms_too_small`            | Quá nhiều phòng trên một đường chia, khối không đủ chỗ cho ô nhỏ nhất                                     |    ✔    |
| `sketch_island_room`                | Phòng lọt hẳn trong phòng khác                                                                            |    ✔    |
| `sketch_room_no_access`             | Phòng không chạm đường về ô thang, hoặc chỉ chạm bằng đoạn tường < 2 ô (T73 g)                            |    ✔    |
| `sketch_stair_isolated`             | Ô thang không chạm hành lang / phòng chung nào (vd thang máy chắn giữa) — 25/09                           |    ✔    |
| `sketch_stair_only`                 | Phòng chỉ vào được qua ô thang trên bản phác — chỉ đi kèm khi tầng đã hỏng vì lý do khác, tự nó không bác |    ✔    |
| `sketch_core_overlap`               | Ép ô thang / thang máy về đúng ô tầng dưới đã dựng xoá trọn một phòng bản phác vẽ — nói rõ hàng, cột (T78) |    ✔    |
| `arrange_room_below_brief_area`     | Phòng (trên bản phác hoặc sau khi chia) hụt diện tích tối thiểu đầu bài khai — sau khi dựng tha 3 % (T82) |    ✔    |
| `arrange_zone_overfull`             | Dồn quá nhiều phòng vào một vùng                                                                          |    ✔    |
| `arrange_program_exceeds_footprint` | Tổng m² lọt lòng của tầng vượt khối xây                                                                   |    ✔    |
| `arrange_entrance_side`             | Phòng mang cửa chính / cửa xe không ra được mặt đầu bài khai                                              |    ✔    |
| `arrange_room_too_narrow`           | Ô chia ra hẹp hơn cạnh **dùng được** hoặc dài quá tỷ lệ cứng (bảng 1.2a)                                  |         |
| `arrange_stair_too_short`           | Ô thang không đủ dài cho số bậc                                                                           |         |
| `arrange_anchor_conflict`           | Không đặt được ô thang trùng tầng dưới mà vẫn giữ phòng quanh nó                                          |         |
| `arrange_no_hub_wall`               | Phòng không giáp giao thông / sinh hoạt chung để mở cửa; phòng khép kín không chung vách mẹ               |         |
| `arrange_no_parti`                  | Không dựng được cây nào từ ý định                                                                         |         |
| `arrange_unreachable`               | Phòng không đi tới được                                                                                   |         |

Bác bản phác thiếu ô **trước khi xếp**: số ô tối thiểu mỗi phòng = `minSketchCells` (`ai/sketch-cells.ts`),
được lùi `sketch.area_slack_ratio` = 0,1. Hành lang: `corridor_min_cells` theo `circulation.corridor_clear_m` = 1,2 m.

**1.2a Cạnh dùng được và tỷ lệ cứng** (`kb/construction_norms.yaml` mục `usable`). Đây là giới hạn đồ
đạc, không phải kinh nghiệm (V-28):

| Loại             | Cạnh ngắn tối thiểu (m) | Dài/rộng tối đa |
| ---------------- | ----------------------: | --------------: |
| living           |                     2,7 |             3,2 |
| dining           |                     2,1 |             3,2 |
| kitchen          |                     1,5 |               — |
| bedroom          |                     2,2 |             2,5 |
| master_bedroom   |                     2,6 |             2,5 |
| study            |                     1,8 |             3,0 |
| altar_room       |                     1,8 |             3,0 |
| wc               |                     0,9 |             6,0 |
| laundry          |                     1,0 |               — |
| storage          |                     0,8 |               — |
| balcony          |                     0,9 |               — |
| garage (có ô tô) |               2,4 (2,8) |               — |
| elevator         |            theo đầu bài |               — |
| stair            |                       — |             4,0 |

Thang: bậc cao 0,17 m, mặt bậc 0,25 m, hai vế cần rộng ≥ 1,6 m.

**Phòng hụt ô, bộ xếp tự nới (T79, 25/09/2026).** Phòng vẽ đủ ô (trong `area_slack_ratio`) mà căn vách vẫn
hụt mức đầu bài thì bộ xếp nới nó thêm một dải ô lấy của phòng kề còn dư (không lấy của ô lõi, hành lang,
phòng sẽ hụt), tối đa `sketch.grow_tries` lần, rồi mới bỏ bản phác. Ghi chú `sketch_room_grown`.

**Tầng dưới «được cứu» (T78, 25/09/2026).** Bản phác một tầng không qua cổng thì bộ xếp chia lại tầng ấy
theo vùng của bản phác (ghi chú `sketch_fallback`), ưu tiên cây giữ ô thang / thang máy đúng chỗ bản phác
(`atSketch`) nhưng không bắt buộc. Khi một tầng TRÊN hỏng, câu nhắc gửi mô hình kèm lỗi sửa được của bản phác
tầng dưới (`sketch_below_replaced` + lỗi kèm số ô); nếu tầng trên hỏng vì bị ép theo ô lõi mà bản chia lại
đã dời (`sketch_core_overlap`, `arrange_anchor_conflict`) thì lỗi ép ấy không gửi mô hình, lỗi tầng dưới
đứng đầu. Ghim cứng ô lõi đã thử và bỏ (24 lượt phát lại đỏ).

### 1.3 Cổng cấu trúc cây: dựng hình học của tầng

`ai/tree/issues.ts` `TREE_ISSUE_CODES`, mọi mã đều chặn.

| Nhóm                        | Mã                                                                                                                                                                                                  | Gửi lại |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Khối xây                    | `footprint_empty`, `footprint_outside_buildable`                                                                                                                                                    |         |
| Cây chia                    | `tree_id_reused`, `tree_self_child`, `tree_child_reused`, `tree_no_root`, `tree_many_roots`, `tree_orphan_node`, `cut_outside_cell`, `cut_too_close`, `cell_collapsed`, `snap_collapsed_cell`       |         |
| Lá / phòng                  | `leaf_unknown`, `leaf_duplicate`, `room_missing_on_level`                                                                                                                                           |         |
| Ghép phòng                  | `merge_unknown_room`, `merge_room_not_leaf`, `merge_target_is_leaf`, `merge_not_allowed` (hành lang, thang, WC luôn ô riêng)                                                                        |         |
| Hình bao                    | `outline_disconnected`, `outline_has_hole` (khoảng trống kín giữa nhà phải là giếng trời/void), `outline_too_complex`                                                                               |         |
| Cửa ra ngoài                | `door_no_outside_edge`, `door_outside_on_boundary`                                                                                                                                                  | ✔       |
| Mặt lối vào                 | `entrance_wrong_side`, `vehicle_door_wrong_side`                                                                                                                                                    | ✔       |
| Cửa trong                   | `door_wall_too_short`, `room_without_door`, `ensuite_door_wrong`                                                                                                                                    |         |
| Đi lại                      | `level_no_entrance`, `room_unreachable_on_level`, `room_through_private` (chỉ vào được qua phòng riêng)                                                                                             |         |
| Đường đi hằng ngày (T48)    | `route_through_service`: từ khu sinh hoạt chung tới phòng phải xuyên gara / sảnh ngoài                                                                                                              | ✔       |
| Cửa từ ô thang (T74, 25/09) | `door_from_stair`: ô thang chỉ mở cửa sang hành lang, sảnh, khách, ăn, sân thượng, thang máy (`passage.stair_opens_to`); mọi phòng khác chặn. Bộ xếp cũng báo mã này khi phòng chỉ còn giáp ô thang | ✔       |
| Thang và giếng              | `void_on_ground`, `stair_missing_on_level`, `stair_room_unknown`, `stair_not_at_anchor`, `light_well_not_at_anchor`, `elevator_not_at_anchor`                                                       |         |

### 1.4 Cổng mặt bằng: cả nhà, đã có toạ độ

`ai/plan-check.ts`.

| Mã                                                     | Nghĩa                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `room_duplicate`, `room_merge_self`, `room_unknown`    | Phòng trùng, ghép vào chính nó, không có trong chương trình                    |
| `room_wrong_level`, `room_wrong_type`, `room_missing`  | Sai tầng, sai loại, thiếu phòng so với chương trình                            |
| `room_rect_empty`, `room_outside_outline`              | Chữ nhật rỗng / lộn ngược; lấn ra ngoài hình bao (cả ô thang, ô trống)         |
| `room_area_mismatch`                                   | m² khai lệch m² đo được. **Tự sửa trước khi kiểm** (`restateRoomFacts`), 25/09 |
| `floor_not_covered`                                    | Còn phần sàn trong hình bao không thuộc phòng / thang / ô trống nào            |
| `room_name_duplicate`                                  | Hai phòng cùng tầng cùng nhãn. **Tự đánh số trước khi kiểm**, 25/09            |
| `room_without_door`, `no_entrance`, `room_unreachable` | Không cửa; tầng 1 không cửa ra ngoài; không đi tới được từ cửa ngoài nhà       |
| `stair_missing`, `stair_not_aligned`                   | Thiếu thang khi còn tầng trên; ô thang lệch tầng dưới                          |

### 1.5 Đầu bài trên mặt bằng đã có toạ độ (T65)

`ai/plan-demands.ts`. Ban công còn được đo trên **bản phác** mỗi khi lượt hỏng (T73 h).

| Mã                          | Nghĩa                                                                                | Gửi lại |
| --------------------------- | ------------------------------------------------------------------------------------ | :-----: |
| `elevator_missing`          | Tầng không có ô thang máy (kể cả «chừa chỗ lắp sau»)                                 |    ✔    |
| `elevator_too_small`        | Ô nhỏ hơn rộng × sâu giếng gia chủ khai (`vertical.elevator_shaft_*_m`)              |    ✔    |
| `elevator_too_narrow`       | Cạnh ngắn < số nhỏ hơn trong hai kích thước giếng khai                               |    ✔    |
| `elevator_oversized`        | Giếng thành dải / quá to: dài > 1,6 × ngắn, hoặc > 2,5 × rộng × sâu khai (T78)       |    ✔    |
| `elevator_not_aligned`      | Giếng thang máy không chồng khít qua các tầng                                        |    ✔    |
| `balcony_not_wanted`        | Khai không làm ban công mà vẫn có                                                    |    ✔    |
| `elevator_not_beside_stair` | Đầu bài khai thang máy giữa lòng / cạnh thang bộ mà hai ô không chung vách (≥ 0,8 m) |    ✔    |
| `elevator_not_facing_stair` | Đầu bài khai đối diện thang bộ mà hai ô lại chung vách                               |    ✔    |
| `elevator_no_common_hall`   | Cạnh / đối diện: thang máy và thang bộ không cùng giáp một hành lang / sảnh          |    ✔    |
| `balcony_level_missing`     | Khai ban công mọi tầng (từ tầng 2), tầng nào thiếu                                   |    ✔    |
| `balcony_side_missing`      | Khai ban công ở mặt X, không cái nào ở mặt ấy                                        |    ✔    |
| `balcony_side_not_wanted`   | Khai chỉ mặt tiền, có ban công mặt khác                                              |    ✔    |

### 1.6 Luật bố trí BẮT BUỘC của Haan (T71): luôn bật

`rules/nvg-mandatory.yaml`, mã đọc: `ai/mandatory.ts`. Mọi mã đều gửi lại mô hình được.

| Mã                      | Luật                                                                      | Dung sai đo                           |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| `wc_over_kitchen`       | Bếp không nằm dưới WC tầng ngay trên                                      | chồng ≥ 100 cm²                       |
| `wc_over_altar`         | Phòng thờ không nằm dưới WC tầng ngay trên                                | chồng ≥ 100 cm²                       |
| `altar_beside_wc`       | Phòng thờ không chung tường với WC cùng tầng                              | cách ≤ 40 cm, chồng dọc tường ≥ 20 cm |
| `altar_facing_wc`       | Cửa phòng thờ không nhìn thẳng sang cửa WC qua cùng một phòng             | lệch tim ≤ 60 cm, cách ≤ 300 cm       |
| `balcony_off_open_face` | Ban công có ít nhất một cạnh dài nằm trên mặt thoáng                      | lùi ≤ 30 cm so với mép hình bao       |
| `wc_stack` (ưu tiên)    | WC chung tầng trên thẳng trục WC / hộp kỹ thuật tầng dưới. **Không chặn** | tâm cách tâm ≤ 1,5 m (lấy từ E2)      |

Ngoại lệ duy nhất: khi kỹ sư **sửa bằng ô yêu cầu** (`ai/edit/apply.ts`), vi phạm bắt buộc **đã có sẵn** trên
bản gốc hạ xuống `finding` (`relaxMandatory`), và `door_from_stair` được giữ (`LEGACY_RELAXED`). Vi phạm mới do
lượt sửa tạo ra vẫn chặn.

---

## 2. Luật CHẤM ĐIỂM

`kb/plan_quality.yaml` (score_version 1), mã: `ai/plan-score.ts`.

- **Ngưỡng nhận `accept_percent` = 65** (% trên phần trọng số chấm được). Dưới ngưỡng: gửi mô hình các
  tiêu chí mất điểm nhất bằng lượt sửa còn lại; hết lượt thì lưu phương án điểm cao nhất và ghi rõ là dưới ngưỡng.
- Trong một nhóm, các tiêu chí **chấm được** chia đều trọng số nhóm. Tiêu chí thiếu dữ liệu ra «Chưa đủ dữ
  liệu», không ra 0, và trọng số của nó **không** chia lại (điểm luôn kèm `scored_weight`).
- Thang điểm: `lower_better` / `higher_better` nội suy giữa `pass` và `zero`. `count` đếm vi phạm. `boolean` 0 hoặc 1.
  `band` đủ điểm trong [low, high], **nửa điểm** trong vùng đệm, 0 ngoài [hard_low, hard_high].

| Nhóm                  | Trọng số |
| --------------------- | -------: |
| A — Đúng chương trình |       25 |
| B — Hình dáng phòng   |       20 |
| C — Giao thông        |       30 |
| D — Mặt thoáng        |       15 |
| E — Dựng được         |       10 |

| Mã  | Tiêu chí                                                                     | Kiểu          | Đủ điểm                        | Mất hết                 | n / nhãn      |
| --- | ---------------------------------------------------------------------------- | ------------- | ------------------------------ | ----------------------- | ------------- |
| A1  | Lệch diện tích so với chương trình (bình quân có trọng số)                   | lower_better  | ≤ 10 %                         | ≥ 30 %                  | 0 · CHUNG     |
| A2  | Phòng đúng tầng: **không tính điểm**, cổng `room_wrong_level` đã chặn        | —             | —                              | —                       | —             |
| A3  | Phòng thờ ở tầng cao nhất có người ở, không dưới WC, không chung tường WC    | boolean       | đạt                            | không đạt               | 2 · ĐO        |
| A4  | Tầng có phòng ngủ thì có WC                                                  | higher_better | 1,0                            | 0,99 (thực tế nhị phân) | 3 · ĐO        |
| A5  | Số phòng nhỏ hơn định mức nghề (`kb/space_norms.yaml`)                       | count         | 0                              | 2                       | 0 · CHUNG     |
| A6  | Số phòng lớn hơn định mức nghề                                               | count         | 0                              | 2                       | 0 · CHUNG     |
| B1  | Số phòng có cạnh ngắn dưới mức của loại (ngưỡng từ `rules/`, mục 3.1)        | count         | 0                              | 2                       | 5 · ĐO ngưỡng |
| B2  | Số phòng vượt tỷ lệ dài/rộng của loại (ngưỡng từ `rules/`)                   | count         | 0                              | 2                       | 5 · ĐO ngưỡng |
| B4  | Chiều cao bậc thang (cao tầng ÷ số bậc)                                      | band          | 0,150–0,180 m                  | ngoài 0,140–0,195       | 2 · ĐO        |
| C1  | Số phòng chỉ tới được qua một phòng ngủ khác (trừ khép kín)                  | count         | 0                              | 1                       | 3 · ĐO        |
| C2  | Diện tích giao thông / sàn lọt lòng                                          | band          | 0,18–0,36 (nhà vườn 0,18–0,25) | ngoài 0,12–0,42         | 6 · ĐO        |
| C3  | Số phòng phải đi qua từ lối vào tới chân thang                               | count         | 0                              | 2                       | 2 · ĐO        |
| C4  | Bề rộng lọt lòng nhỏ nhất của hành lang                                      | higher_better | ≥ 1,0 m                        | ≤ 0,9 m                 | 6 · ĐO        |
| C5  | Có `shop` thì có lối vào tới thang không qua chỗ bán                         | boolean       | đạt                            | không đạt               | 1 · ĐO        |
| C6  | Số cửa từ chỗ sinh hoạt chung tới WC chung xa nhất                           | count         | ≤ 1                            | 3                       | 0 · CHUNG     |
| C7  | Quãng đi từ chỗ sinh hoạt chung tới WC chung xa nhất                         | lower_better  | ≤ 8 m                          | ≥ 20 m                  | 0 · CHUNG     |
| C8  | Chiều dài hành lang trên mỗi phòng nó phục vụ                                | lower_better  | ≤ 2,5 m                        | ≥ 6 m                   | 0 · CHUNG     |
| D1  | Tỷ lệ phòng ở có cửa sổ ra mặt thoáng (nhà phố: chỉ phòng khách + ngủ chính) | higher_better | 1,0                            | 0,7 (nhà phố 0,99)      | 5 · ĐO        |
| E2  | Tỷ lệ WC từ tầng 2 gần WC tầng dưới / hộp kỹ thuật (≤ 1,5 m tâm–tâm)         | higher_better | 1,0                            | 0,5                     | 5 · ĐO        |
| E4  | Hộp kỹ thuật liên tục qua các tầng (lệch ≤ 0,15 m)                           | boolean       | đạt                            | không đạt               | 5 · ĐO        |

Đã **bỏ** vì hồ sơ đã xây phủ định: E1 (tường trùng tuyến), E3 (m tường/m²), B3 (phòng vụn), D2 (bề rộng mặt
thoáng/diện tích). Chưa có: B5 (kê đồ tối thiểu, chờ `kb/furniture.yaml`).

### 2.1 Cách bộ xếp chọn giữa các cây của một tầng

`ai/arrange/index.ts` `rank` + `compareRanked`. Xếp theo thứ tự ưu tiên, bậc trên thắng tuyệt đối bậc dưới:

1. **WC chung thẳng trục** (`wc_stack`, T71) trước mọi phương án lệch.
2. **Ô thang / thang máy đúng chỗ bản phác** (`atSketch`, T73).
3. **Tổng** = điểm chuẩn hoá 0–100 + `blend` 0,3 × 100 × độ khớp ý định − 0,5 × số ghi chú.
   Độ khớp = 0,5 × phòng đúng vùng + 0,3 × quan hệ đạt + 0,2 × phòng ra mặt đường
   (gần ≤ 6 m, xa ≥ 8 m; `kb/plan_quality.yaml` mục `intent_fit`).
4. Độ khớp ý định, rồi khoản phạt của bộ xếp, rồi mã cây (để kết quả tất định).

---

## 3. CẢNH BÁO và GHI CHÚ: không chặn

### 3.1 Luật kinh nghiệm / đo đạc (`rules/nvg-experience.yaml`, `rules/nvg-measured.yaml`)

Mọi dòng có `severity: warning`. Kỹ sư tích gói nào thì luật ấy được **tiêm vào lời dẫn** và **hiện cảnh báo**.
Bộ chấm **luôn** đọc ngưỡng `min_dimension` / `aspect_ratio_max` ở đây cho B1/B2, dù gói có tích hay không.

| id                                | Vị từ                     | Đối tượng        |     Mức |   n |
| --------------------------------- | ------------------------- | ---------------- | ------: | --: |
| room_min_dimension_bedroom        | min_dimension             | bedroom          |  2,35 m |   9 |
| room_min_dimension_master_bedroom | min_dimension             | master_bedroom   |   3,1 m |   4 |
| room_min_dimension_living         | min_dimension             | living           |   3,5 m |   5 |
| room_min_dimension_circulation    | min_dimension             | circulation      |   1,0 m |   6 |
| room_min_dimension_wc             | min_dimension             | wc               |  1,25 m |   5 |
| room_min_dimension_balcony        | min_dimension             | balcony          |   1,0 m |   5 |
| room_min_dimension_kitchen        | min_dimension             | kitchen          |   1,8 m |   0 |
| room_min_dimension_garage         | min_dimension             | garage           |   2,4 m |   0 |
| room_min_dimension_dressing_room  | min_dimension             | dressing_room    |   1,5 m |   0 |
| room_min_dimension_study_area     | min_dimension             | study_area       |   1,8 m |   0 |
| room_min_dimension_laundry        | min_dimension             | laundry          |   1,2 m |   0 |
| room_min_dimension_closet         | min_dimension             | closet           |   0,9 m |   0 |
| room_min_dimension_storage        | min_dimension             | storage          |  0,85 m |   1 |
| room_min_area_bedroom             | min_area                  | bedroom          |  9,0 m² |   9 |
| room_min_area_wc                  | min_area                  | wc               |  3,0 m² |  12 |
| min_area_living                   | min_area                  | living           | 14,0 m² |   2 |
| min_area_master_bedroom           | min_area                  | master_bedroom   | 14,0 m² |   2 |
| lightwell_max_area                | max_area                  | light_well       |  8,0 m² |   0 |
| room_aspect_ratio_max_bedroom     | aspect_ratio_max          | bedroom          |     1,9 |   9 |
| room_aspect_ratio_max_wc          | aspect_ratio_max          | wc               |     2,5 |  12 |
| aspect_ratio_max_habitable        | aspect_ratio_max          | habitable        |     2,5 |   0 |
| aspect_ratio_max_service          | aspect_ratio_max          | service          |     3,0 |   0 |
| aspect_ratio_max_outdoor          | aspect_ratio_max          | outdoor          |     4,0 |   0 |
| kitchen_near_dining               | adjacency (adjacent)      | kitchen / dining |       — |   0 |
| wc_separate_from_kitchen          | adjacency (separate)      | wc / kitchen     |       — |   0 |
| wc_separate_from_altar_room       | adjacency (separate)      | wc / altar_room  |       — |   2 |
| altar_room_top_floor              | floor_preference (top)    | altar_room       |       — |   2 |
| garage_ground_floor               | floor_preference (ground) | garage           |       — |   0 |
| stair_not_facing_entry            | stair_faces_entry         | stair            |       — |   2 |
| kitchen_requires_ventilation      | requires_daylight         | kitchen          |       — |   0 |
| garage_on_access_face             | requires_face (access)    | garage           |       — |   0 |
| outdoor_on_open_face              | requires_face (open)      | outdoor          |       — |   0 |

### 3.2 Đòi hỏi đầu bài loại CẢNH BÁO (`blocking: false`, suy đoán nghề, T52)

Hiện thành `brief_demand_<mã>` (`finding`): `bon_nuoc_mai` (cần sân thượng), `bep_kin_chien_xao` (bếp kín, có
mặt thoáng), `khach_o_lai` (phòng ngủ/làm việc dùng để ngủ), `lam_viec_tai_nha` (study/study_area). Cùng loại
còn năm cảnh báo `demands.warnings`: đi lại khó mà không có thang máy · đi lại khó mà còn bậc · dự trù nâng tầng
mà thang không lên mái · nền thấp hơn đường nơi ngập · thiếu số bậc tam cấp.

### 3.3 Ghi chú chương trình tự sửa (`INTENT_NOTE_CODES`)

`intent_zone_defaulted`, `intent_room_dropped`, `intent_relationship_dropped`, `intent_relationship_conflict`,
`intent_open_not_merged`, `intent_merge_capped`, `intent_ensuite_zone_forced`, `intent_entry_defaulted`,
`intent_entry_invalid`, `intent_garage_defaulted`, `intent_anchor_zone_forced`, `intent_wet_zone_forced`,
`outdoor_off_face`. Cùng loại còn các ghi chú khi dựng lỗ mở: `door_added`, `door_dropped`, `door_rerouted`,
`window_none`, `window_skipped`, `balcony_projected`, `wc_off_axis`, `arrange_relaxed`, `arrange_hall_inserted`…
Mỗi ghi chú trừ 0,5 vào tổng xếp hạng ở 2.1, không vào điểm.

---

## 4. Chỗ đáng xem lại (phát hiện khi lập danh sách, chưa sửa)

1. **Một luật ban công nằm ở ba chỗ, ba mức khác nhau**: `balcony_off_open_face` CHẶN (T71),
   `outdoor_off_face` GHI CHÚ, `outdoor_on_open_face` CẢNH BÁO. Chú thích ở `ai/arrange/issues.ts` còn ghi
   `outdoor_off_face` «chưa chặn», trong khi T71 đã chặn bằng mã kia. Chú thích này đã cũ.
2. **Ba mức bề rộng hành lang**: 1,0 m (C4 và `room_min_dimension_circulation`, trừ điểm/cảnh báo), 1,2 m
   (`circulation.corridor_clear_m`, bộ xếp và số ô tối thiểu trên bản phác). Có thể là cố ý (bộ xếp đòi rộng
   hơn mức trừ điểm), nhưng chưa thấy chỗ nào ghi lý do.
3. **Hai bộ ngưỡng cạnh tối thiểu song song**: `usable.min_side_m` CHẶN (vd phòng ngủ 2,2 m) và `rules/`
   trừ điểm (phòng ngủ 2,35 m). Đây là cố ý theo V-28, ghi ra để khỏi đọc nhầm là trùng.
4. ~~Chặn nhưng không gửi lại mô hình~~ — **đã sửa 25/09/2026**: `balcony_not_wanted` và bốn mã `elevator_*`
   nay trong `REVISABLE_CODES`.
5. Chú thích đầu `ai/rule-warnings.ts` còn nói đọc `rules/base/`. Thư mục đó đã xoá ở T30/T42.
