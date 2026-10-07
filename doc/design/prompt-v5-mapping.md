# Ánh xạ bàn giao «prompt pipeline v5» → mã thật (bước T1)

> Nguồn: `handoff-claude-code-prompt-pipeline-v5.md` (03/10/2026) và `handoff-floorplan-prompt-review.md`
> (01/10/2026). Khảo sát ngày 04/10/2026 trên nhánh `ha_tang_kiem`, lời dẫn **9.7.0**. Chưa sửa mã.
> Số đo dựng lại từ lượt thật **0b7e4957** (biệt thự Hưng Yên 15 × 20 m, chính là ca fixture của bàn giao),
> không gọi mô hình.

## 1. Tài liệu tham chiếu

| Tệp bàn giao nhắc                    | Có trên máy? |
| ------------------------------------ | ------------ |
| `prompt-mat-bang-v5.md` (ĐÍCH: system prompt, catalog luật, schema, prompt sửa, cache) | **Không** |
| `prompt-modules-v4-tiet-kiem-token.md` | **Không** |
| `prompt-thiet-ke-mat-bang-tong-quat.md` (v3) | **Không** |
| `handoff-floorplan-prompt-review.md` | Có (`~/Documents/Doc/NVG/`) |

Không có tệp đích thì T5–T7 (catalog luật, system prompt, schema `plan.json`/`delta.json`) không làm đúng được.

## 2. Thành phần bàn giao → mã thật

| Bàn giao | Mã thật | Ghi chú |
| --- | --- | --- |
| Ngôn ngữ Python, `prompting/*.py` | **TypeScript** trong Worker, `workers/src/design/ai/` | Số liệu nghề ở `kb/*.yaml`, `rules/*.yaml` (đúng tinh thần mục 5 bàn giao) |
| `survey_data` | Đầu bài `design_brief` → digest `AiBriefDigest`; hợp đồng `contracts/design-brief.schema.json`; biểu mẫu `shared/src/design/brief-form.json` (+ lớp phủ T63) | |
| `normalize_brief()` / `compress_brief()` | `brief/narrative.ts` (`briefNarrative`), `brief/slice.ts` (T114, cắt theo nhãn `for`) | Văn xuôi đầu bài 4.114 ký tự |
| `build_program()` | `ai/program.ts#programKnowledge` → `bedrooms`, `brief_spaces`; `ai/brief-demands.ts` | Phòng ngủ có nhóm `for`, **chưa có mã phòng cố định** |
| `resolve_site()` | `ai/buildable.ts`, `ai/plan.ts#planContext` (`siteFaces`, `faceTags`, `block_m`) | Khối 12,5 × 16 m; mặt `open`/`blind`/`harsh_sun`/`cool_wind` đã có (T112) |
| `resolve_stair()` | `ai/stair-geometry.ts`, `stair-choice.ts`, `planContext#stairGeometry` → `stair_min_m` | Loại thang theo đầu bài (T105) |
| `feasibility()` | `ai/feasibility.ts` + `workflows/ai-design-steps.ts#infeasibleBrief` | **Đã chặn trước lời gọi** khi vượt sàn xây được (T112) |
| `select_knowledge()` | `ai/plan.ts#modelKnowledgeOf` (`HouseModelKnowledge`) | Còn gửi **cả 26 loại phòng** và 26 dải diện tích |
| `select_rules()` / catalog `when` | `kb/ai_design_prompts.yaml` `floor_level.system`, cờ `[[cờ|…]]` (`houseSystem`, T112) | Chỉ 3 cờ (thang máy, sân thượng, ông bà chưa ghim tầng); luật đánh số tay 1–10 |
| `assemble_prompt()` | `ai/plan.ts#callHouseModel` | System tĩnh; user = `<brief>` + `<knowledge>`; vòng sửa **nối vào cuối** cùng tiền tố |
| `provider_adapter` | `workers/src/design/llm/{openai,anthropic,gemini}.ts`, `router.ts`, `schema-dialect.ts` | Ba hãng đã có; lược đồ dịch theo hãng đã có |
| Cache | OpenAI tự cache; **không** `prompt_cache_key`; Anthropic **không** `cache_control`; `cached_tokens` đọc được nhưng **không lưu** vào `design_ai_call` | |
| Schema đầu ra | `contracts/ai-house-intent.schema.json` (`rooms`, `relationships`, `sketches.rows`, `entry_room`, `garage_room`) | 5.422 ký tự |
| `validate()` | Cổng trong `ai/plan.ts#evaluateHouse` + `ai/tree/*`, `plan-check.ts`, `plan-demands.ts`, `mandatory.ts`; câu nhắc `floor_level.hints` | Lỗi có mã + câu nhắc chỉ hàng/cột |
| `autofix()` | **Bộ xếp** `ai/arrange/` (nắn bản phác, khung xương T102, thu hành lang T104, nới phòng T113, quay lui tầng 1) | Mạnh hơn nhiều so với autofix trong bàn giao |
| repair loop / delta | `REVISABLE_CODES`, `HOUSE_REVISIONS_MAX`; `mergeRevision` — mô hình chỉ trả **tầng hỏng** (T86) | Đã là delta theo tầng, chưa theo phòng |
| `derive()` | `ai/house.ts`, `arrange/doors.ts` — cửa, cửa sổ, kề nhau do chương trình suy | |
| `render()` | `ai/draw/` (SVG vector tất định), `ai/dxf/` | Vẽ từ **cây chia**, không từ lưới |
| `log_metrics()` | `ai/call-log.ts` → `design_ai_call` (token vào/ra, chi phí, phiên bản lời dẫn) | Thiếu cột cached / reasoning |
| A/B | Phát lại `fixtures/ai-run-*.json` (51 lượt, 209 vòng) | Đo bộ xếp miễn phí; **không** đo được lời dẫn mới — cần lượt thật |

## 3. Khác biệt lớn (bàn giao mục 0.3: dừng và hỏi)

1. **Hình học.** Bàn giao muốn mô hình xuất `rect` mm, chương trình chỉ kiểm + autofix. Kho đang làm ngược:
   mô hình phác lưới thô, **chương trình gán mọi toạ độ** (T48, nguyên tắc 2 ở CLAUDE.md 8.3). Cả T102–T113
   (khung xương, thu hành lang, nới phòng, thước chấm, phát lại) dựa trên bản phác. Hai cách hợp lý:
   - **A — rect thay lưới ở đầu vào, giữ bộ xếp:** mô hình trả rect, chương trình raster ra bản phác cho bộ xếp
     hiện có (đúng nhánh T10 «`to_rows()`» của bàn giao). Rủi ro thấp, đo được bằng phát lại.
   - **B — rect là toạ độ cuối, bỏ bộ xếp:** viết lại cổng/vẽ, mất T102–T113. Lý do T37→T48 bỏ toạ độ mô
     hình: chồng lấn, sót sàn.
2. **Tầng mái** (`level: "roof"`). Bàn giao ghi «chủ dự án đã chốt luôn vẽ». Trái với T96 (Haan: «không khai
   trong đầu bài thì hạn chế bịa thêm», sân thượng ở `only_when_asked`). Ca Hưng Yên khai cục nóng ở sân
   thượng nên đòi hỏi `cuc_nong_san_thuong` mở `terrace`, nhưng chưa có tầng mái để đặt nó.
   **Haan chốt 04/10/2026: luôn vẽ tầng mái.**
3. **Haan chốt 04/10/2026: giữ quy tắc cũ cho phong thuỷ và kết cấu.** **Phong thuỷ** (review P1-13: đòi năm sinh để máy tính Bát trạch) trái PRD 2.3 / T62: phong thuỷ vào
   đầu bài dưới dạng câu ràng buộc người đã quyết.
4. **Kết cấu** (review P1-11, nhịp ≤ `max_span_m`): kho không tự kiểm kết cấu (CLAUDE.md 8.2.6, T30).

## 4. Số đo hiện trạng (ca Hưng Yên, lời dẫn 9.5–9.7)

| Phần | Ký tự | Ghi chú |
| --- | ---: | --- |
| System | 5.217 | tiếng Anh |
| Schema | 5.422 | 644 ký tự mô tả, còn lại là cấu trúc |
| Văn xuôi đầu bài | 4.114 | còn: trữ nước, mức hoàn thiện, ngành nghề, «Một cánh. Một lõi.», «Tiếp cận từ: mặt trước, bên trái» |
| Tri thức JSON | ~3.500 | lớn nhất: `min_cells` 790, `room_types` 617, `room_area_m2` 507, `bedrooms` 497, `served_from` 327 |

Token thật (`design_ai_call`, lượt 0b7e4957 và các lượt demo 30/09–02/10):

| Lời gọi | Vào | Ra | Chi phí |
| --- | ---: | ---: | ---: |
| Lượt chính | 4.460–5.030 | 8.300–14.000 | 0,11–0,30 USD |
| Mỗi vòng sửa | 6.050–7.450 | 4.700–13.400 | 0,07–0,29 USD |

Phần ra **nhìn thấy** chỉ ~5.200 ký tự (≈ 1.500–1.800 token; bản phác 1.400 ký tự); phần còn lại là token suy
nghĩ. Chỉ tiêu «ra ≤ 1.600 không tính thinking» gần đạt sẵn; tiền nằm ở **suy nghĩ** và ở việc vòng sửa
**gửi lại cả ý định trước**.

## 5. Mục review đã xử lý / còn mở

| Mã | Trạng thái |
| --- | --- |
| P0-01 phòng làm việc đếm hai lần | Đã sửa (T112): con có `study_area` trong phòng, `study` riêng |
| P0-02 WC khép kín mở ra hành lang | Đã sửa (9.4.0): «opens only from its parent bedroom» |
| P0-03 ban công đua | Đã có, cách khác: chương trình nới ô ra ngoài (`tree/balcony-projection.ts`, T91) |
| P0-04 sân thượng / tum | **Mở** — Haan chốt luôn vẽ tầng mái (3.2) |
| P0-05 `open_pairs` khác tầng | Đã sửa (chỉ còn `dining–kitchen`) |
| P0-06 bếp ↔ WC ngược chiều | Đã sửa (9.4.0) |
| P1-01 mã phòng ngủ cố định | Một phần: có `for`, mô hình tự đặt mã |
| P1-02 tối thiểu gồm phần `inside` | Đã sửa (luật 3) |
| P1-03 phòng giúp việc 15 m² lớn bất thường | **Mở** |
| P1-04 nắng/gió thành luật | Đã sửa (`faces`) |
| P1-05 mặt sau lùi 0 m | Đã sửa (`blind`) |
| P1-06 giếng trời | Theo T96: chỉ đề xuất trong `assumptions` |
| P1-07 lưới 1 m thô | **Mở** — xem 3.1 |
| P1-08 «tiếp cận từ» hai nghĩa | Một phần: đã có `main_entrance_side` / `vehicle_entrance_side`, câu cũ vẫn in |
| P1-09 «Một cánh / Một lõi» | **Mở** (vẫn in vào đầu bài) |
| P1-12 cửa nội bộ | Khác thiết kế: chương trình suy cửa (T40) |
| P1-14 cốt gara, dốc xe | **Mở** |
| P1-16 ban công phơi | Đã có (`drying_balcony`) |
| P1-17 tự kiểm, lỗi có cấu trúc | Đã có |
| P2-01 luật/loại thừa | Một phần: còn `elevator`, `shop`, `light_well`, `courtyard` trong `room_types` / `served_from` |
| P2-02 dữ liệu không ảnh hưởng mặt bằng | Một phần (T114 bỏ phong cách) |
| P2-03 `adjacent` trùng bản phác | **Mở** (luật Access vẫn đòi khai `adjacent`) |

## 6. Quyết định của Haan (04/10/2026)

1. Hình học theo **cách A**: mô hình khai hình chữ nhật mm, chương trình kiểm, đổi ra bản phác và đưa vào bộ
   xếp hiện có. Ưu tiên **chất lượng mặt bằng trước, token sau**.
2. Luôn vẽ tầng mái.
3. Giữ quy tắc cũ: phong thuỷ là câu ràng buộc người đã quyết; không kiểm kết cấu.
4. Chạy lượt thật để so sánh SAU khi xong các cải tiến.

## 7. Đối chiếu với `prompt-mat-bang-v5.md` (nhận 04/10/2026, sau khi T115 đã làm)

| Mục tài liệu đích | Hiện trạng T115 | Còn phải làm |
| --- | --- | --- |
| Rect mm `[x, y, w, h]`, bước 100; raster 500 mm (mục 7.1) | Đã có (`ai/layout.ts`, lưới 0,5 m) | Gốc toạ độ: tài liệu lấy **góc lô**, T115 lấy góc khối xây được |
| `footprints` từng tầng, mô hình tự chọn khối trong vùng xây, mặt thành thoáng nếu lùi ≥ 2 m | Mô hình chừa được dải trống ở mép (sân); mặt thoáng cố định theo khảo sát | Khai `footprints`; mặt thoáng suy lại theo khối thật |
| `doors: [[a, b]]`, `"OUT"` | Quan hệ `door` | Đổi dạng cặp, `OUT` |
| `cantilevers` — ban công đua không chiếm sàn | Ban công vẽ trong khối rồi nới ra ngoài: **vẫn ăn 1 m sàn** (lượt 182665ea: ban công trước sâu 2 m, đua 1 m) | Ban công đua dựng từ `from_room` + mặt + độ đua, ngoài khối |
| `knowledge.program` — danh mục phòng có mã do chương trình cấp; mô hình chỉ thêm GT / THANG / SANH / BC | Mô hình tự khai danh mục (T41/T45: phần đầu bài không khai là chỗ sáng tạo) | **Trái quyết định cũ — hỏi Haan** |
| Luật là catalog có `when`, đánh số; lỗi báo theo số luật | Lời dẫn có cờ `[[…]]`; lỗi báo bằng mã câu nhắc | Tách `rules` khỏi lời dẫn hệ thống, đánh số, câu nhắc kèm số luật |
| Lời dẫn hệ thống ngắn: thứ tự 6 bước, `design_notes` | Lời dẫn dài (luật + cách vẽ + đi lại) | Viết lại theo mục 2 |
| Tri thức: `site` (lô, vùng xây, mật độ, mặt có điều kiện, cao độ, ghi chú tam cấp), thang (số bậc), ban công, chỗ đỗ, `min_side_mm`, **nội thất + khoảng trống**, `feasibility` từng tầng, ưu tiên | Có một phần (khối, mặt, thang, `min_rooms`); chặn khi vượt sàn | Thêm nội thất / khoảng trống (dữ liệu `kb/`, chờ KTS duyệt), cao độ, chỗ đỗ, khả thi dạng câu |
| Brief rút gọn: lời gia chủ + mong muốn chưa mã hoá | Văn xuôi đầy đủ | Rút gọn sau khi tri thức đủ |
| Ngân sách giao thông ≤ 12 % là LUẬT | Chỉ trừ điểm (T49: định mức chỉ trừ điểm) | **Trái T49 — hỏi Haan** |
| Tầng mái trong danh mục (TUM, ST_DH, ST_NUOC, PHOI, ST) | Đã có (`kb/roof_plan.yaml`, chương trình tự đặt khu thiếu) | Đưa vào `program` khi làm mục danh mục |
| Vòng sửa trả **delta** (`rooms_upsert` …) | Trả lại cả tầng hỏng | Lược đồ delta + gộp |
| Bộ nhớ đệm (mục 9) | Đã có (OpenAI `prompt_cache_key`, Anthropic `cache_control`, tiền tố giữ nguyên) | — |
| `structure.bay_mm` | Không làm (Haan chốt 04/10: không kiểm kết cấu) | — |

**Cập nhật 04/10/2026 (T115 tiếp):** đã làm theo tài liệu đích các mục hợp đồng (mục 5), danh mục `program` (Haan:
«theo v5, có nới»), lời dẫn mục 2, catalog luật có `when` (mục 3), tri thức mục 4 (trừ cao độ đầy đủ), ban công đua
`cantilevers`, vòng sửa delta (mục 6). Còn lại: mặt thành thoáng khi khối lùi ≥ 2 m; `footprints` khai riêng; ngân sách
giao thông giữ trừ điểm (Haan chốt). Chi tiết ở `QUYET_DINH_AI.md` T115.
