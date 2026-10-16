# Mốc cải tiến UX và luồng nghiệp vụ

Tệp này ghi lại điểm xuất phát của đợt cải tiến sau review toàn dự án, và những gì đã thay đổi
từ đó. Theo QĐ-1 tệp không ghi ngày, chỉ ghi thứ tự và tiêu chí hoàn thành.

## 1. Mốc

| | |
| --- | --- |
| Tag git | `moc-truoc-cai-tien-ux` (annotated) |
| Commit gốc | `ef2eb13`, bản mới nhất của `anhoangha/NVG` (PR #27) |
| Nhánh làm việc | `cai-tien-ux` (`main` giữ nguyên) |
| Sao lưu CSDL máy | `backup/moc-truoc-cai-tien-ux.sql`, không commit |
| Ảnh «trước» | `backup/anh-truoc/{ia,ui,flow,ai}/`, 214 ảnh của đợt review, không commit |

**Xem thay đổi so với mốc**

```bash
git diff --stat moc-truoc-cai-tien-ux..cai-tien-ux   # tệp nào đã đổi
git log --oneline moc-truoc-cai-tien-ux..cai-tien-ux # từng bước
```

**Khôi phục CSDL máy về mốc.** Lệnh này xoá dữ liệu hiện tại của CSDL máy:

```bash
docker exec -i supabase_db_nvg psql -U postgres -d postgres < backup/moc-truoc-cai-tien-ux.sql
```

Ảnh và tệp trong Supabase Storage không nằm trong bản sao lưu này.

## 2. Tám vấn đề chủ dự án nêu

1. Tổng giám đốc và bộ phận kiểm soát không nhìn ra vấn đề ngay. Cần một tổng quan toàn bộ.
2. Giao diện có nhiều lớp đè lên nhau. Bỏ hẳn chế độ tối.
3. Chuyển bước sai quyền: Kinh doanh đi qua được mọi bước. Chuyển bước không đồng bộ giữa các module.
4. Không biết tiến độ đang ở đâu, bước tiếp theo, bước sau nữa và bước cuối là gì.
5. Hợp đồng chưa có mẫu: tải mẫu Word lên, tự điền và xem trước, sửa trên chính mẫu.
6. Thu thập yêu cầu khách bằng giọng nói, chuyển thành chữ, AI tổng hợp thành báo cáo sửa được. Tải tệp lên ở mọi nơi cần.
7. AI Design chưa gọn và chưa công thái học.
8. Khảo sát: tạo, AI tổng hợp, người chốt, rồi máy tự ghi kết thúc. Hiện tại nhập tay (CRM) hoặc lấy giờ tạo (TK).

## 3. Hiện trạng tại mốc (đã kiểm chứng)

- **Quyền và bước.**
  - `move_opportunity_stage` cho nhảy giữa mọi bước đang mở, và Kanban kéo được tới «Ký hợp đồng».
  - `sign_contract`, `close_contract` và `open_site_from_contract` chỉ kiểm quyền sửa HD, nên KD ghi ký, quyết toán và mở công trình được cho mọi hợp đồng.
  - `decide_approval` không chặn tự duyệt.
- **Đồng bộ.**
  - Ký hay huỷ hợp đồng, trúng hay trượt thầu, bàn giao thiết kế đều không đổi bước của cơ hội.
  - `handover_design_to_construction` mở công trình khi hợp đồng còn nháp.
- **Tiến trình.** Mỗi module tự làm dải bước riêng. Không màn hình nào hiện bước sau nữa hay bước cuối.
- **Điều hướng.** `defaultRoute` của vai trò có nạp nhưng không dùng. «Việc cần làm» thực chất là hộp thư phê duyệt.
- **Giao diện.**
  - Lớp màu trỏ vào token không tồn tại (`text-fg-muted` 21 tệp, `bg-bg`/`bg-bg-subtle` 8 tệp).
  - Panel sticky trượt dưới header.
  - Hộp hướng dẫn tự mở ở 16 trang.
  - Có khoảng 10 biến thể ô chọn, 35 bảng thô và 73 banner tự dựng.
- **Tải tệp.** `documents`/`document_versions` lưu `file_url` giả. Không có thành phần đính kèm dùng chung.
- **Điểm danh bằng ảnh** (0139) chạy được, test 5/5 đạt. Chỉ là bằng chứng có mặt: chưa nối chấm công, chưa điểm danh theo tổ, chưa kiểm bán kính.

## 4. Quyết định đã chốt

- Chuyển giọng nói thành chữ: Cloudflare Workers AI Whisper. AI tổng hợp: Gemini Flash trả phí, tắt mặc định.
- Mẫu hợp đồng: tệp `.docx` có chỗ trống, hệ thống tự điền. AI chỉ gợi ý câu chữ dưới dạng nháp.
- Khảo sát: đổi luồng cho cả khảo sát kinh doanh (CRM) lẫn khảo sát thiết kế (TK).
- Kinh doanh chỉ soạn, sửa và gửi phê duyệt hồ sơ mình chịu trách nhiệm. Ghi ký, quyết toán và mở công trình cần quyền phê duyệt HD. Không ai được tự phê duyệt hồ sơ do chính mình gửi.
- Thêm trang «Tổng quan điều hành» riêng và vai trò «Kiểm soát nội bộ», chỉ xem.
- Điểm danh: thêm điểm danh theo tổ, kiểm bán kính GPS (chỉ cảnh báo), báo cáo có mặt, đề xuất chấm công có người xác nhận.

## 5. Giai đoạn

| Giai đoạn | Nội dung | Tiêu chí hoàn thành |
| --- | --- | --- |
| 0 | Lưu mốc | Có tag, nhánh, bản sao lưu và tệp này |
| 1 | Quyền và thứ tự bước, đồng bộ liên module, dải tiến trình và chuỗi hồ sơ, bỏ chế độ tối, sửa lớp đè và token màu | KD không nhảy bước và không ký được; ký hợp đồng thì cơ hội tự đồng bộ; không tự duyệt được; mọi hồ sơ trong chuỗi hiện bước tiếp theo, sau đó và cuối; ảnh 1440 và 390 px không còn đè |
| 2 | Tổng quan điều hành và vai trò Kiểm soát nội bộ | TGĐ/CFO/BGĐ/KSNB vào thẳng trang điều hành; mỗi ô dẫn tới đúng danh sách; KSNB không ghi được gì |
| 3 | Khảo sát chốt bằng máy, đính kèm dùng chung, giọng nói thành chữ và AI tổng hợp | Thời điểm kết thúc khảo sát do máy ghi khi chốt; tải tệp thật ở các hồ sơ chính; AI hỏng vẫn chốt được |
| 3b | Hoàn thiện điểm danh | Điểm danh cả tổ; cảnh báo ngoài bán kính; báo cáo có mặt; đề xuất chấm công có người xác nhận |
| 4 | Mẫu hợp đồng Word | Tải mẫu, tự điền, xem trước, xuất `.docx`, lưu phiên bản |
| 5 | Làm lại hành trình AI Design thành 4 bước | Có giá ước tính trước khi chạy; so sánh được phương án; dùng được trên hồ sơ đã bàn giao |

## 6. Đã thay đổi

Ghi sau mỗi giai đoạn: tóm tắt thay đổi và danh sách commit.

### Giai đoạn 0
- `992fd93`: `db:migrate` chạy được trên Windows, đường dẫn thư mục migration lấy qua `fileURLToPath`.
- Thêm tệp này và dòng `backup/` vào `.gitignore`.

### Giai đoạn 1 — luồng, quyền, đồng bộ, tiến trình, giao diện

Commit: `d3331c6` · `bafc3aa` · `3dfb721` · `098ca01` (và commit ghi mục này).

**Đã làm**

- **Thứ tự bước cơ hội (0155).** Đi tới chỉ sang bước kế tiếp khi đủ điều kiện (`stage_readiness` —
  một nguồn cho CSDL và giao diện); lùi phải nêu lý do; «Ký hợp đồng» không chuyển tay. Định giá chấp
  nhận báo giá CRM, gói thầu hoặc hồ sơ thiết kế (NVC định giá qua DA).
- **Không tự duyệt (0156).** Người gửi không tự ĐỒNG Ý hồ sơ của mình ở mọi loại phê duyệt và các bước
  đề nghị chi; tự hủy vẫn được; đơn nghỉ nhập hộ xét theo nhân viên trong đơn; hộp thư bỏ hồ sơ của mình.
- **Tách vai hợp đồng (0157).** Sửa/gửi = người chịu trách nhiệm; ghi ký, quyết toán, hủy sau duyệt =
  quyền phê duyệt HD (Ban Giám đốc — trước đây BGĐ lại KHÔNG ghi ký được); quyết toán khi công trình đã
  bàn giao; mở công trình = phê duyệt HD hoặc TC; soạn hợp đồng khi nguồn đã sẵn sàng.
- **Đồng bộ liên module (0158).** Hợp đồng đã ký đẩy cơ hội gốc sang «Ký hợp đồng»; hủy / trượt thầu báo
  người phụ trách cơ hội; chuyển bước thiết kế bằng tay không nhảy cóc; bàn giao thiết kế gắn hợp đồng đã
  ký, chưa có thì chặn hoặc cảnh báo theo tham số `tk.handover_requires_signed_contract`.
- **Chuỗi hồ sơ (0159).** `record_chain` — Cơ hội → Gói thầu/Thiết kế → Hợp đồng → Công trình, chỉ gồm
  hồ sơ người xem có quyền; chặn hợp đồng thứ hai cho cùng cơ hội.
- **Dải tiến trình** (`StepTrack`, `shared/src/flow.ts`) trên chi tiết cơ hội, hợp đồng, công trình: đang
  ở bước mấy, ai làm gì, tiếp theo cần gì, sau đó, bước cuối. Dải «Chuỗi hồ sơ» bấm được từng mắt xích.
- **Nút theo vai.** Hợp đồng: Kinh doanh chỉ thấy nút soạn/gửi. Cơ hội: nút chuyển bước theo luồng, mờ
  kèm lý do; ẩn «Soạn hợp đồng» khi đã có hợp đồng. Kanban: cột không thả được hiện mờ kèm lý do.
- **Giao diện.** Gỡ hẳn chế độ tối; sửa 95 lớp màu trỏ vào token không tồn tại (chữ phụ có lại phân cấp);
  hộp hướng dẫn thôi tự mở che dữ liệu; trang công trình trên điện thoại chỉ còn MỘT thanh dưới; ô tìm
  kiếm không cụt chữ.
- **Demo và test đi đúng vai:** TGĐ ký hợp đồng, Trưởng phòng Thi công mở công trình, Chỉ huy trưởng lập
  đề nghị chi. Test mới: `flow-guard.test.ts`, `flow.test.ts`, chuỗi hồ sơ trong `golden-path.test.ts`,
  hàng rào token màu và «không còn chế độ tối» trong `design-rules.test.ts`; đột biến M238–M240.

**Bổ sung sau phản hồi chủ dự án (0160)** — «chuyển sang Phân loại mà tab không nhảy tới chỗ làm; phân
loại, khảo sát vẫn dễ bị bỏ qua». Kiểm lại thấy trường Phân loại (M1–M4) không có chỗ nhập ở đâu cả.
Chủ dự án chốt: rời Xác minh cần Phân loại M2–M4 + Loại công trình, M1 «Lưu trữ» đứng lại; khảo sát bắt
buộc trước Báo giá, được bỏ qua kèm lý do (lưu trên cơ hội, `survey_waived_reason`).

- `0160_viec_tung_buoc_co_hoi.sql`: `stage_readiness` thêm điều kiện `classified`, `survey_done` và cột
  `waivable`; `waive_opportunity_survey`; ba cột miễn khảo sát chỉ đổi qua hàm.
- Giao diện: ô «Phân loại» trên tab Tổng quan (`classification-card.tsx`, có giải thích M1–M4); mở hồ sơ
  hay vừa chuyển bước thì tự sang tab nơi làm việc của bước (`defaultTab` của `EntityDetail`); dòng «Cần»
  có liên kết «Phân loại» / «Mở Khảo sát» / «Lập báo giá»; chuyển sang Báo giá khi chưa khảo sát thì hỏi
  lý do bỏ qua.
- Test: nhóm «Việc của từng bước cơ hội» trong `flow-guard.test.ts`; demo NVC có phân loại và biên bản
  khảo sát.

**Bổ sung lần hai (0161)** — chạy thử thấy khảo sát xong không sang được Báo giá: lưu biên bản không làm mới
điều kiện bước; «Đã khảo sát lúc» ghi được ngày chưa tới; và 0155 đòi có báo giá để VÀO bước Báo giá (ngược
thứ tự). Sửa: vào Báo giá chỉ cần phân loại + khảo sát, Đàm phán mới cần báo giá đã gửi; CSDL từ chối
«đã khảo sát» ở tương lai; lưu phân loại M2–M4 / biên bản đã khảo sát thì tự sang bước kế và mở tab;
«Soạn hợp đồng» chỉ hiện khi giá đã gửi khách.

**Rà chuỗi bước — chặng Báo giá → Đàm phán (0162).** Chạy thử bằng đúng vai: thẻ báo giá chỉ ghi «Chờ duyệt»
mà không nói ai giữ; duyệt xong người Kinh doanh không được báo; gửi khách xong vẫn phải tự tìm nút sang Đàm
phán; lập phiên bản mới thì bản cũ kẹt «Chờ duyệt» trong Hộp thư TGĐ. Sửa: `approval_waiting_on` + dòng «Đang
chờ: vai trò — tên · bao lâu»; thông báo `quote_approved` / `quote_rejected`; trigger đồng bộ sang Đàm phán
(báo giá gửi khách, gói thầu nộp, thiết kế gửi khách duyệt — chỉ từ Báo giá); đóng phê duyệt của bản bị thay.

**Rà chuỗi bước — chặng Đàm phán → Hợp đồng (0163).** «Gửi phê duyệt» hợp đồng không cho biết trước còn thiếu
gì; chờ duyệt không biết ai giữ; duyệt xong người soạn không được báo. Sửa: điều kiện bước của hợp đồng đọc từ
`stage_readiness`, liên kết «Ghi điều khoản», mở thẳng tab Điều khoản khi còn Nháp, dòng «Đang chờ», thông
báo `contract_approved` / `contract_rejected`.

**Rà chuỗi bước — chặng Ký → Công trình (0164).** Bước Chuẩn bị không có chỗ phân công chỉ huy trưởng / ghi
ngày khởi công, «Bắt đầu thi công» đi thẳng; TGĐ thấy nút «Mở công trình» nhưng hàm từ chối (đòi quyền sửa);
mở từ hợp đồng thì người Kinh doanh thành chỉ huy công trình. Sửa: điều kiện bước của công trình, khối «Chuẩn
bị khởi công» chỉ cho chọn người Thi công, Ban Giám đốc mở được công trình, chỉ huy trưởng được báo, mở xong
sang thẳng công trình, mỗi bước mở đúng tab (Nhật ký / Nghiệm thu / Bảo hành).

**Rà chuỗi bước — Nghiệm thu → Bảo hành → Kết thúc, «Thúc», quyền xem hợp đồng (0165, 0166).** Thêm nút
«Thúc» cho mọi phê duyệt đang chờ (`nudge_approval`). Chủ dự án giữ nguyên: Thi công không xem Module Hợp
đồng — panel công trình nói rõ đã có hợp đồng. Chạy thử chặng cuối: vừa bàn giao đã «Kết thúc công trình»
được ngay — nay cần khai bảo hành, hết hạn mọi hạng mục, không còn yêu cầu bảo hành mở. Sửa kèm lỗi có sẵn:
sửa ngày bắt đầu bảo hành không tính lại ngày hết hạn.

**Chưa làm trong giai đoạn này (đẩy sau)**

- Bảng lịch sử bước chung `stage_transitions` cho hợp đồng / gói thầu / công trình (cơ hội đã có lịch sử).
- Dải tiến trình cho gói thầu và đề nghị chi (đề nghị chi đã có dải bước riêng); hồ sơ thiết kế giữ dải
  6 bước của module.
- Thanh lưu dính đáy của biểu mẫu đầu bài, lớp thẻ PWA trên hộp thoại, `ConfirmDialog` qua portal.

**Kiểm chứng tại máy:** test CSDL xanh trừ `env-guard` (lỗi `spawnSync('npx')` trên Windows, có từ
trước); test web không phát sinh lỗi mới so với mốc (~20 test vốn đỏ trên máy này vì quá thời gian);
`npm run mutation-proof` không chạy được trên máy này vì bộ web chưa xanh — ba đột biến mới đã đo tay,
cả ba bị bắt.

**Câu hỏi cho Haan** (mặc định đang dùng ghi sau mỗi câu)

1. NVO có được thi công trước khi ký hợp đồng? — đang: cảnh báo, chặn được bằng tham số.
2. TGĐ gửi hồ sơ thì ai duyệt? — đang: người khác có hạn mức; chưa có ngoại lệ cho TGĐ.
3. Yêu cầu tuyển dụng do Nhân sự lập và Nhân sự duyệt — có cần người khác duyệt? — đang: cho phép.
4. Trượt thầu có tự đánh dấu Mất cơ hội? — đang: chỉ báo người phụ trách.
5. Mở công trình từ hợp đồng: Ban Giám đốc hoặc Trưởng phòng Thi công / Chỉ huy trưởng — đúng chưa?

### Giai đoạn 2 — Tổng quan điều hành và Kiểm soát nội bộ

**Đã làm** (0167–0169)

- Vai trò Kiểm soát nội bộ (KSNB) chỉ xem toàn hệ thống; không xem lương / hồ sơ cá nhân (mặc định, chờ Haan). Rà
  mọi chỗ dùng `sees_all_companies`: hai bảng cho ghi chỉ vì cờ đó — đã chặn bằng `auth_manages_all_companies()`.
- `useIsResponsible` không còn coi «xem mọi pháp nhân» là «quản lý mọi hồ sơ».
- Đăng nhập đi tới trang mặc định của vai trò (cột `default_route` trước đây bị bỏ qua); lãnh đạo và KSNB vào
  `/tong-quan`.
- Trang «Tổng quan điều hành»: 10 ô cảnh báo tính ở CSDL xuyên pháp nhân, xếp theo mức (có vấn đề → cần chú ý →
  ổn), mỗi ô kể tối đa 5 hồ sơ, kèm khối tài chính của Dashboard.
- Kèm theo: `/kt/cong-no?chieu=phai-tra` mở thẳng tab Phải trả.

**Kiểm chứng:** `ksnb.test.ts` 6/6 — đo lại bằng cách nới chính sách danh mục kiểm tra: phép thử ĐỎ (lần đầu nó xanh
sai lý do vì dữ liệu thử vi phạm ràng buộc khác — đã sửa). Ảnh chụp: KSNB, TGĐ vào `/tong-quan`; Kinh doanh vào
trang cơ hội, gõ `/tong-quan` bị đưa về Dashboard.

**Bổ sung — ba công ty cạnh nhau (0170).** Chủ dự án: «Tổng giám đốc phải nắm cả 3 công ty». Bản đầu gộp số, không
nói công ty nào có vấn đề. Nay một trang bốn tầng: việc chờ quyết định; bảng cảnh báo (hàng = vấn đề, cột = NVC /
NVS / NVO, bấm ô mở đúng danh sách của công ty đó, mảng ổn gom một dòng); hoạt động từng công ty; tài chính tháng
này theo công ty. Đã chụp 1440 px và 390 px. Hạn chế: cột «Cả tập đoàn» chưa loại giao dịch nội bộ (chưa có dữ
liệu đánh dấu, QĐ-6).

**Bổ sung — vẽ bằng hình.** Chủ dự án: «còn nhiều chữ quá». Bảng chữ đổi thành: thẻ sức khoẻ có vòng tròn theo
mức, bản đồ cảnh báo ô màu kèm số / ✓ (rê để xem hồ sơ cụ thể), biểu đồ cột tài chính và quy mô theo công ty.
Mức vẫn đọc được bằng chữ qua nhãn trợ năng (CGD 6.8).

**Bổ sung — làm rõ vai trò Tổng quan điều hành / Dashboard / Báo cáo.** Hai trang trùng ô «Quá hạn» và khối tài
chính. Chủ dự án chọn làm rõ vai trò: Dashboard của lãnh đạo bỏ ô «Quá hạn» (thay bằng ô và liên kết sang Tổng quan
điều hành); khối tài chính giữ ở Dashboard vì là xu hướng theo kỳ, còn trang điều hành so sánh ba công ty trong
tháng; báo cáo sâu ở `/bc/...`.

**Bổ sung — phân cấp thông tin.** Chủ dự án: Dashboard «nhìn quá nhiều thứ cùng cấp bậc nên bị loạn — TGĐ nhìn ít
nhưng ra vấn đề ngay». Dashboard của lãnh đạo: khối Tiêu điểm (một câu kết luận, ≤ 5 dòng vấn đề, hai số phụ), mọi
số liệu theo kỳ gập lại. Bản đồ cảnh báo chỉ hiện mảng có vấn đề.

**Bổ sung — số liệu theo kỳ không phải chuyển từng công ty.** Chủ dự án: phần chi tiết theo kỳ không thấy rõ là của
công ty nào, phải chuyển bộ chọn từng công ty, TGĐ không nhớ hết. Tài chính theo kỳ của lãnh đạo nay luôn hiện cả ba
công ty (số tập đoàn, thanh chia và số từng công ty, biểu đồ tháng theo công ty); thẻ phân hệ ghi rõ đang xem công
ty nào.

**Bổ sung — mỗi công ty một khung.** Chủ dự án: vấn đề không phải xem đủ ba công ty mà là nhìn MỘT nơi nắm tình
hình MỘT công ty — trang không cần chia theo chủ đề. Dashboard của lãnh đạo nay chỉ còn chọn kỳ + ba khung công ty
(tình trạng, chờ duyệt, tiền trong kỳ, đang chạy); bỏ lưới thẻ phân hệ, khối Tiêu điểm, khối tài chính tách công ty.
Tổng quan điều hành dùng cùng khung, giữ bản đồ cảnh báo và biểu đồ quy mô để so sánh.

**Câu hỏi cho Haan:** KSNB có được xem lương / hồ sơ cá nhân? (đang: không). Mốc «hợp đồng sắp hết hạn» bao nhiêu
ngày? (đang: chưa có ô này). Mốc «phê duyệt chờ lâu» 3 ngày (giả định cũ của Dashboard) — giữ hay đặt SLA theo loại?

