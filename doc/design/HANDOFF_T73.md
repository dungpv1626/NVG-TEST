# Bàn giao phiên — cải tiến mặt bằng «AI Design» (T72–T73)

Cập nhật 25/09/2026. Diễn biến đầy đủ (nguyên nhân gốc, số đo, từng lượt chạy thật, từng chỗ sửa):
**`doc/design/QUYET_DINH_AI.md` mục T72, T73**. Tệp này chỉ là điểm bắt đầu cho phiên sau.

## Hiện trạng

- **Chưa commit gì.** Nhánh `ha_tang_kiem`, ~77 tệp đổi (gồm cả việc T71 trước đó). Không deploy.
- 1.112 phép thử `workers/src/design` xanh; `tsc -b`, eslint, prettier sạch; 44 đột biến
  (`npm run mutation-proof`, `--dry` xác nhận cả 44 áp đúng một chỗ).
- Lời dẫn `kb/ai_design_prompts.yaml` **8.26.0**. `config/models.yaml` 1.4.0 (tuyến
  `ai_text_openai_sol6` = GPT-6 Sol, 2/10 USD).
- **Chưa lượt thật nào ra phương án** trên dự án demo «Biệt thự nhà vườn (demo)»
  (`c815a6e6-7b16-482a-bd61-7a7ea31f82b7`). Chưa lượt thật nào chạy trên 8.26.0.

## Bổ sung 25/09/2026 — T74

Ô thang chỉ mở cửa sang giao thông, khu chung, sân thượng, thang máy (Haan). Lời dẫn nay **8.27.0**
(không còn 8.26.0), 1.115 phép thử xanh, 45 đột biến. Lượt đo thật (i) bên dưới sẽ chạy trên 8.27.0,
nên đo được cả (i) lẫn T74. Chi tiết: `QUYET_DINH_AI.md` mục T74.

## Bổ sung 25/09/2026 — T75

Lời dẫn nay **8.28.0**. Đầu bài thêm kích thước giếng thang máy: **trước lượt đo thật, điền «Giếng thang
máy — bề rộng / chiều sâu» cho dự án demo** (đang khai chừa chỗ, 350 kg), nếu không cổng đầu bài sẽ chặn.

## Bổ sung 25/09/2026 — T76

Lượt thật b5202883 (0,402 USD) không ra phương án — thang máy chắn giữa thang bộ và hành lang. Đã sửa câu
nhắc (`sketch_stair_isolated`) và thêm «Kiểu bố trí thang máy» ở đầu bài. Lời dẫn nay **8.29.0**.

## Bổ sung 25/09/2026 — T77

Lượt thật 4b0268b1 (0,469 USD) không ra phương án — lỗi lối vào báo từng đợt. Đã sửa để báo cùng một
lượt. Lời dẫn nay **8.30.0**. Tổng tiền lượt thật ngày 25/09: 0,871 USD.

## Bổ sung 25/09/2026 — T78

Lượt thật 913bc2ad (0,256 USD) không ra phương án — tầng 1 được chia lại im lặng, giếng thang máy thành
dải, tầng 2 bị ép theo. Đã sửa ba điểm (xem T78 ở `QUYET_DINH_AI.md`). Lời dẫn nay **8.32.0**. Tổng tiền
lượt thật ngày 25/09: 1,127 USD. Chưa lượt thật nào trên 8.32.0.

## Bổ sung 25/09/2026 — T79

Haan đồng ý ba hướng ở mục «Phương án để ra được mặt bằng» dưới đây; đã làm cả ba (xem T79 ở
`QUYET_DINH_AI.md`). Bước nới phòng chưa nới được lượt nào trong ba lượt đã lưu — đừng kỳ vọng nhiều.
Lượt sửa nay trả về chỉ tầng có lỗi; `HOUSE_REVISIONS_MAX = 5`; đổi gốc khi đứng yên. Lượt thật kế là
lượt đầu tiên trên 8.32.0 — cần xin phép.

## Bổ sung 25/09/2026 — T80

Lượt thật c8cefafc (0,394 USD, 4 lời gọi) trên 8.32.0: lỗi giảm 4 → 1 sau ba vòng, vòng 4 bị gạt, rồi
`wrangler dev` sập trước lời gọi 5 (xem T80). Tổng tiền lượt thật ngày 25/09: 1,521 USD. **Trước lượt thật
kế: `ps -eo pid,ppid,args | grep workerd | grep NVG` chỉ được còn tiến trình con của wrangler đang
sống; giết tiến trình mồ côi trước.** Lượt treo đã đánh dấu `failed` tay.

## Bổ sung 25/09/2026 — T81

Lượt thật 4198d692 (0,543 USD, 6 lời gọi): ba vòng cuối đã dựng được cây, chỉ hụt 0,08 và 1,3 m², mà bị
gạt vì đếm lỗi. Đã sửa `setbackRank` xét giai đoạn trước (T81). Tổng tiền lượt thật 25/09: 2,064 USD.
Haan chọn dung sai 3 % ở cổng cho sàn đầu bài (T82, `sketch.floor_tolerance_ratio`).

## Bổ sung 25/09/2026 — T83

Lượt thật e82e3a09 (0,227 USD): runtime sập lần hai, cùng chỗ (ngay sau một lời gọi sửa), kernel
`workerd trap int3`. Đã loại trừ bộ xếp treo / tràn bộ nhớ và tiến trình mồ côi. Tổng tiền 25/09: 2,291
USD. Tái hiện không tốn tiền bằng tuyến `ai_text_replay` + máy chủ giả (nhanh và chậm 120 s/lời gọi):
KHÔNG sập → nghi kết nối TLS/HTTP2 tới OpenAI lúc đóng luồng dài. `workerd` hiện chạy dưới `gdb` (script
bọc trong `node_modules/@cloudflare/workerd-linux-64/bin/`, log `/tmp/claude-1000/workerd-gdb.log`).
**Gỡ hai thứ tạm trước khi commit/deploy**: tuyến `ai_text_replay` trong `config/models.yaml`, và
`mv workerd.real workerd`. Đề xuất: nâng wrangler 4.126 → 4.140 (miniflare hiện là bản alpha). Sau khi
sập, wrangler không tự khởi động lại được runtime — phải kill node wrangler và chạy lại.

## Bổ sung 26/09/2026 — T84 (root cause runtime sập)

Backtrace gdb từ lượt 0f80cd0b: stub RPC `WorkflowInstance` (`PIPELINE.create()`, `workflow.get()`)
không được huỷ → finalizer ghi cảnh báo trong lúc V8 dọn rác → inspector `wrangler dev` lấy stack
trace trong GC → workerd tự huỷ. Sửa ở `workflows/rpc-stub.ts` + 6 chỗ gọi. Wrangler đã lên 4.140.0.
Còn giữ script bọc `workerd` bằng gdb (`node_modules/@cloudflare/workerd-linux-64/bin/`): sau lượt thật
xác nhận hết sập thì `mv workerd.real workerd`. Tuyến `ai_text_replay` đã gỡ. Tổng tiền 25/09: 2,620 USD.

## Việc tiếp theo

1. **Xin Haan cho một lượt thật** GPT-6 Sol (tối đa 4 lời gọi, ~0,3–0,45 USD) để đo (i). Chưa được
   phép — không tự chạy.
2. Trước khi chạy: khởi động lại `wrangler dev` cổng 8788 (kill theo PID, `pkill -f` tự giết shell).
   Kiểm `curl -s localhost:8788/design/health`.
3. Chạy: trang `http://localhost:5173/tk/du-an/c815a6e6-…?tab=thiet-ke-ai`, kiểm model hiện
   «GPT-6 Sol» cạnh nút «Xếp mặt bằng» (trang lớn — dùng `javascript_tool` bấm nút, không `find`).
   Nếu bộ chọn model không hiện, tải lại trang.
4. Theo dõi: script poll đọc `design_ai_run` mới nhất theo `project_id`. **Chờ lượt MỚI xuất hiện
   rồi mới poll** — lần trước poll bắt nhầm lượt cũ đã hỏng.
5. Chẩn đoán: lưu ý định từng lượt thành `workers/src/design/__tests__/fixtures/ai-run-<id>.json`
   (`{_note, digest, intents}`; digest chép từ fixture cùng đầu bài, vd `ai-run-5cd78ef7.json`), phát lại
   qua `evaluateHouse` + `retryPlan` (mẫu: `ai-live-5cd78ef7.test.ts`). Không gọi mô hình.
6. Mỗi chỗ sửa: báo Haan, chờ đồng ý; thêm phép thử phát lại + một đột biến; ghi vào
   `QUYET_DINH_AI.md` và `TIEN_DO_THIET_KE.html` (chèn bằng shell, kiểm tệp vẫn mở đầu bằng
   `<!doctype html>` — đã có lần chèn nhầm lên đầu tệp).

## Các lượt thật gần nhất (cùng đầu bài)

| Lượt | Model / lời dẫn | Tiền | Kết quả |
| --- | --- | --- | --- |
| 9d3cc059 | GPT-6 Sol, 8.24.0 | 0,188 USD | Tầng 2 hành lang chia mẩu → dừng. Sửa (g). |
| 2ddf782a | GPT-6 Sol, 8.25.0 | 0,369 USD | Lượt 4 xếp được cả hai tầng; thiếu ban công mặt sau (bỏ từ lượt 2, chỉ lộ ở cổng cả nhà). Sửa (h). |
| 5cd78ef7 | GPT-6 Sol, 8.25.0 + (h) | 0,409 USD | Lượt 3 chỉ còn phòng thờ không lối vào; lượt 4 vẽ lại cả tầng 2, 6 lỗi. Sửa (i). |

Tầng 1 qua ở mọi lượt gần đây. Chỗ chặn hiện tại là tầng 2 và bệnh «sửa chỗ này hở chỗ kia».

## Những chỗ sửa của T73 (tóm tắt, chi tiết ở QUYET_DINH_AI.md)

- Nguyên nhân gốc «đầu bài 45 m², vẽ 26,8 m²»: lời dẫn cũ bảo mô hình đừng đếm ô. Nay gửi
  `knowledge.min_cells` / `corridor_min_cells` (`ai/sketch-cells.ts`), bác bản phác thiếu ô trước khi
  xếp (`kb/construction_norms.yaml` mục `sketch`).
- Ô thang bộ / thang máy giữ đúng chỗ bản phác (`sketchCores`); thang máy không còn tính là hành lang.
- (g) `sketchNoAccess`: phòng không chạm đường về ô thang → bác trước khi xếp; tầng đã hỏng thì đo
  tiếp giáp < 2 ô và gửi mô hình kèm danh sách phòng phải giữ.
- (h) `checkSketchBalconyDemand`: ban công đầu bài (tầng, mặt) đo trên bản phác mỗi khi lượt hỏng.
- (i) `revisionBase`: lượt sửa đi tiếp từ lượt hỏng nhẹ nhất; câu dặn lượt sửa «chép nguyên phần
  không bị nêu lỗi».
- Dừng sớm khi mô hình nộp lại y nguyên phần đang hỏng (`retry: 'unchanged'`).

## Khoảng trống đã biết

- Vòng sửa trong Workflow (`workflows/ai-design.ts`) không có phép thử chạy trọn; chỉ
  `generateAiPlan` được kiểm (hai tuyến dùng chung `revisionBase`).
- Phép thử giao diện `brief-form-page` hết giờ khi chạy song song cả bộ web — không liên quan, chưa gỡ.
- Ba lượt cũ (458d9a91, 8efa35a6, 9d3cc059) chưa từng vẽ ban công mặt trái đầu bài đòi — lộ ra nhờ (h).

## Phương án để ra được mặt bằng (đề xuất 25/09/2026, sau ba lượt thật cùng ngày đều hỏng)

Ba lượt thật hôm nay có cùng một dạng: bản phác của mô hình GẦN đúng (hai tầng khớp nhau, phòng đủ), lượt
hỏng vì câu nhắc của chương trình sai hoặc thiếu, và ba lượt sửa không đủ. Mỗi lần ta sửa câu nhắc, lượt
sau lộ lỗi câu nhắc kế. Đề xuất, theo thứ tự nên làm:

1. **Chương trình tự vá phòng hụt diện tích trên bản phác** (không gọi lại mô hình): phòng thiếu dưới
   một mức (vd 20%) sau khi căn vách thì bộ xếp nới nó thêm một dải ô lấy của phòng bên còn dư, thử lại,
   tối đa vài lần — mới bỏ bản phác. Đây là lỗi hay gặp nhất (bedroom_2 12,4/15 ở 913bc2ad, bedroom_1
   14,6/15 ở 8efa35a6, master 16 ô cho 25 m² ở fad0c0fa), và mỗi lần nó tốn một lượt sửa. Tất định, không
   tốn tiền, làm được trong một buổi.
2. **Tăng `HOUSE_REVISIONS_MAX` 3 → 5** cho lượt thật: mỗi lượt sửa ~0,06–0,12 USD; cả lượt ≤ 0,7 USD.
   Ba lượt hôm nay đều dừng vì hết lượt sửa khi lỗi đang giảm.
3. **Đổi gốc sửa khi đứng yên**: `revisionBase` gửi lại vòng ít lỗi nhất; hai lượt liền cùng câu nhắc
   mà số lỗi không giảm thì lấy vòng mới nhất làm gốc.
4. Còn xa hơn: chương trình tự vá phòng thiếu lối vào (nới hành lang / đổi chỗ phòng bên) — đã bàn từ
   (i), chưa làm.

Haan đồng ý cả ba ngày 25/09/2026 — đã làm (T79). Chỉ chạy lượt thật kế khi Haan cho phép.

## Bổ sung 26/09/2026 — T85 (nguồn stub thứ hai) và lượt dc949b49

Lượt thật dc949b49: 6 lời gọi, 0,613 USD, runtime không sập, không ra mặt bằng. Cảnh báo RPC vẫn ghi →
kết quả `step.do` chưa huỷ; sửa bằng `disposingStep` (T85, M62). Script gdb bọc `workerd` VẪN GIỮ tới khi
một lượt thật chạy mà `/tmp/claude-1000/workerd-gdb.log` không tăng (hiện 558 byte). Tổng chi 25–26/09:
3,233 USD. Việc treo: đề xuất giữ tầng đã qua (xem T85 cuối).
T86 (giữ tầng đã qua ở lượt sửa, lời dẫn 8.33.0, M63–M66) xong, gồm cả tầng «qua nhờ chia lại» (gửi
mô hình cách chia thật làm bản phác — Haan chọn phương án 1). Chưa lượt thật nào chạy dưới nó.

## Bổ sung 26/09/2026 — T87, lượt Luna 81fd3f57, gỡ gdb

Lượt Luna 0,040 USD, runtime sạch → T85 xác nhận, script gdb ĐÃ GỠ, `wrangler dev` chạy lại bình
thường. T87: lời bác ở cổng danh mục phòng là bậc tệ nhất khi chọn gốc sửa (M67). Tổng chi 25–26/09:
3,273 USD. Chưa lượt thật nào chạy dưới T87.

T89 (câu nhắc phòng hụt sàn khi phòng kề không nhường đủ, lời dẫn 8.34.0, M68) xong, chưa lượt thật.
T90 (lượt Sol 02982bd7 — vòng 3 xếp xong cả nhà; lỗi bản phác tầng bị chia lại đi cùng lỗi cả nhà, M69) xong. Tổng chi 3,776 USD.

## Bổ sung 27–28/09/2026 — T91–T96, lượt Sol 3e0f5e46, chưa commit

T91 (ban công bắt buộc / có thể / cấm, đua từng mặt), T94 (biến thể chương trình — 6 mặt bằng đầu tiên
trên 105 vòng phát lại), lượt Sol 3e0f5e46 (0,422 USD: tầng 1 qua cả 6 vòng, tầng 2 hỏng liên thông). Tổng
chi 25–27/09 ~5,86 USD. Haan xem sáu mặt bằng và chấm ba lỗi nghề → **T96**: thước 3 (trọng số trong nhóm,
sàn nhóm 40 %, C9/C10/E5), cổng «không bịa thêm» (`only_when_asked`, lời dẫn 8.37.0), bộ xếp: khu khách
về phía sảnh, ban công / WC khép kín tách dải, ô thông suốt khách – lối đi, cổng bắt buộc chia lại khu bếp
tầng dưới theo WC ứng viên. Phát lại 111 vòng: 6 → 7 mặt bằng, 4 tiến, 2 lùi. Trang xem: artifact «Bảy mặt
bằng sau T96» (riêng tư). Đột biến M80–M81. **Chưa lượt thật nào chạy dưới T96; toàn bộ T84–T96 chưa
commit** — nhánh `ha_tang_kiem`. Việc kế: (a) commit khi Haan cho; (b) lượt thật dưới T96 khi Haan cho
phép (đầu bài demo đã sửa ban công); (c) B2 bước 3 cho tầng trên (tầng 2 của 3e0f5e46 hỏng liên thông);
(d) WC khép kín ở góc phía hành lang thay vì dải trọn cạnh (5aba737d: WC vẫn trên phòng khách, E5 trừ điểm);
(e) lượt phản biện của mô hình trên đồ thị phòng – cửa (Haan: chưa cần).

## Bổ sung 28/09/2026 — T97, lượt Sol 5584bf0d (lượt thật đầu tiên sau T96), chưa commit

Haan cho chạy một lượt thật dưới T96 (5584bf0d, 0,35 USD, 3 lời gọi): THẤT BẠI — nhưng vì chương trình,
không vì mô hình. Vòng 1 tầng 2 hai phòng không lối vào; vòng 2–3 mô hình chỉ sửa tầng 2 như được dặn mà
tầng 1 «đã giữ» bị bác lại. Hai lỗi có từ T86, xem `QUYET_DINH_AI.md` T97: `mergeRevision` gộp theo mã
phòng (hành lang mới tầng 2 tên `circulation_1` trùng tầng 1), và bản phác chương trình vẽ lại cho tầng giữ
co diện tích vì làm tròn ô. Sửa cả hai; bộ phát lại (`scratchpad/zz-audit.test.ts.keep`) nay truyền `keep`
như đường chạy thật; lượt 5584bf0d thành fixture (digest suy từ `design_brief` bằng `digestOf`). Phát lại
114 vòng: 7 → 8 mặt bằng, 5 tiến, 1 lùi; 5584bf0d vòng 2 qua với 66,6 điểm (nhóm E 20 %, dưới sàn — lượt
thật sẽ còn dùng vòng sửa). Trang xem: artifact «Tám mặt bằng sau T97» (cùng URL). Đột biến M82–M83.
Lưu ý: `npm run mutation-proof` có thể báo «bộ kiểm đang đỏ» với danh sách rỗng khi vitest quá tải
(«Timeout calling onTaskUpdate») — chạy lại khi máy rảnh, không phải lỗi mã. Việc kế: như T96 (a)–(e), và
(f) một lượt thật nữa dưới T97 khi Haan cho phép — lần này lượt sửa mới thật sự đi tới mô hình.

