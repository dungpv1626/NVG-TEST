# Kế hoạch tổng — hệ thống «làm hộ» cho từng bộ phận

Tệp này gom mọi thay đổi đã thống nhất với chủ dự án sau đợt cải tiến UX (GĐ0–GĐ2, GĐ4 vòng đầu). Bản trình bày
cho người đọc không chuyên (sơ đồ trước / sau, bảng từng bộ phận) nằm ở tài liệu Claude «Hệ thống Quản trị NVG — Tổng
quan trước và sau thay đổi». Tệp này là bản cho người làm: thứ tự, phụ thuộc, câu hỏi chặn, tiêu chí xong.

Không ghi mốc thời gian (QĐ-1) — chỉ thứ tự và tiêu chí hoàn thành.

## 0. Nguyên tắc giữ suốt các đợt

1. **Máy làm nháp → người phụ trách kiểm, sửa, gửi → sếp duyệt hoặc trả về kèm ý kiến → hệ thống tự sang bước sau.**
   Máy không tự quyết giá bán, nhà cung cấp, chi tiền, nhân sự (PRD 2.3).
2. **AI tốn tiền mặc định tắt**, bật bằng bảng tham số khi chủ dự án duyệt chi phí; mọi lần gọi ghi nhật ký chi phí.
   AI lỗi thì người vẫn tự làm được, luồng không bị chặn. Khi phát triển dùng AI giả lập; gọi thật phải báo trước số
   lượt + số tiền (CLAUDE.md 6.4).
3. **Con số NVG chưa quyết để trống** (ngưỡng, số ngày nhắc, bán kính GPS, giá bồi thường, cách tính công) — hệ thống
   ghi «chưa cấu hình», không tự điền mặc định (CLAUDE.md 5.2).
4. **Mỗi đợt xong phải chạy thử bằng đúng tài khoản từng vai trò trên trình duyệt**, chụp ảnh 1440 px + 390 px, có
   phép thử quyền (nới quyền để thấy đỏ), rồi mới sang đợt sau.
5. Không phát hành lên bản demo khi chủ dự án chưa đồng ý; phát hành theo đúng thứ tự `db:migrate:demo` → `db:seed`
   → `npm run deploy`.

## 1. Bước 0 — chốt phần đã làm

| Việc | Ai | Tiêu chí xong |
| --- | --- | --- |
| Kiểm GĐ1 (luồng, quyền, tiến trình), GĐ2 (Tổng quan điều hành, KSNB), GĐ4 (mẫu hợp đồng) bằng 5 tài khoản thử | Chủ dự án / Haan | Danh sách lỗi hoặc đồng ý |
| Trả lời các câu hỏi CLAUDE.md 9.5 (15 câu) — tối thiểu các câu chặn đợt 1–2: 9, 10, 11, 12, 14 | Haan | Câu trả lời ghi vào CLAUDE.md |
| Gửi 1–2 mẫu hợp đồng Word thật | NVG | Mẫu tải lên được, không chỗ trống lạ |
| Phát hành GĐ1 + GĐ2 + GĐ4 lên demo | Claude Code, khi được đồng ý | Bản demo chạy đúng như máy |

## 2. Khối nền dùng chung — xây trong Đợt 1, các đợt sau dùng lại

| Khối | Gồm | Ghi chú kỹ thuật |
| --- | --- | --- |
| **K1 — Ghi âm → chữ → nháp AI** | Nút ghi âm dùng chung (`components/media/voice-recorder.tsx`); `/ai/transcribe` (Cloudflare Whisper), `/ai/summary` (Gemini Flash gói trả phí, đầu ra JSON theo mẫu); bảng `ai_calls` (nhật ký chi phí); tham số `ai.*_enabled` | Worker `workers/src/ai/`, dùng lại `asUser` và `textClientFor` của `design/`; binding `AI`; `AI_FAKE=1` chỉ trong `.dev.vars` |
| **K2 — Hộp duyệt xem nội dung** | Khung xem trước theo loại hồ sơ (báo cáo + nghe ghi âm, văn bản Word, ảnh nghiệm thu); dải «Bị trả về — ý kiến của …» dùng chung | Mỗi loại mới: `ADD VALUE` enum ở migration riêng; `decide_approval` chép nguyên bản mới nhất rồi thêm nhánh |
| **K3 — Sinh văn bản từ mẫu Word** | Mở rộng bộ điền hợp đồng (0171) sang biên bản nghiệm thu, đề nghị thanh toán, văn bản hành chính: mẫu theo loại văn bản | Dùng lại `shared/src/hd-template.ts`, `web/src/lib/docx-template.ts`; mỗi loại văn bản một danh mục chỗ trống |
| **K4 — Việc cần làm hôm nay + nhắc việc** | Một danh sách việc đến hạn theo người (CRM, khảo sát, báo giá, mốc thi công, đợt thu…); nhắc qua chuông thông báo | Nối các hàm `scan_*` đã có; số ngày nhắc ở bảng tham số |
| **K5 — Quản trị AI** | Công tắc từng chức năng AI, biểu đồ chi phí theo tháng / bộ phận | Đọc `system_parameters` + `ai_calls` |

## 3. Các đợt

### Đợt 1 — Kinh doanh (CRM + khảo sát + hợp đồng)

| Việc | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 1A. CRM đầu mối | Danh sách đầu mối trước cơ hội: nhập nhanh / Excel, lọc trùng theo số điện thoại, trạng thái Mới → Đã liên hệ → Có nhu cầu (tạo cơ hội) / M1 Lưu trữ / Không phù hợp (bắt buộc lý do) | — |
| 1B. Nhật ký chăm sóc | Mỗi lần gọi / Zalo / gặp một dòng (kênh, nội dung, kết quả) + bắt buộc bước tiếp theo và ngày hẹn; dòng thời gian trên hồ sơ khách (PRD CRM-01) | K1 (nói thay gõ — tuỳ chọn) |
| 1C. Việc cần làm hôm nay của Kinh doanh | Hẹn đến hạn, đầu mối chưa liên hệ, khảo sát / báo giá chưa phản hồi quá N ngày, M1 tới hạn nhắc lại | K4 |
| 1D. Khảo sát → báo cáo → BGĐ duyệt | Bắt đầu / kết thúc khảo sát (máy ghi giờ), ghi âm nhiều đoạn, máy điền 6 ô báo cáo, gửi Ban Giám đốc; duyệt → cơ hội sang Báo giá; trả về → sửa, gửi lại. Báo cáo chưa duyệt thì chặn Báo giá | K1, K2 |
| 1E. Hợp đồng gửi duyệt kèm văn bản | Khi pháp nhân có mẫu: phải lập văn bản trước khi gửi; người duyệt xem văn bản trong hộp; ghi bản đã duyệt (`contracts.approved_document_id`); chỉ lập văn bản khi hợp đồng Nháp | K2, K3 |
| 1F. Khách cũ + phễu | Sau bàn giao: lịch chăm sóc, bảo trì, xin giới thiệu → đầu mối mới (CRM-07); báo cáo phễu từ đầu mối theo nguồn / người (mở rộng `bc/sales-effectiveness.tsx`) | 1A, K4 |
| 1G. Quản trị AI | K5 | K1 |
| 1H. Thư viện công trình mẫu (chào khách) | Kho mẫu dùng chung + lọc «mẫu tương tự» theo ô của cơ hội / đầu bài + gom bộ mẫu → link xem trực tuyến gửi khách + ghi vào nhật ký chăm sóc mẫu đã gửi / khách thích. Quy tắc chủ dự án đã chốt ở mục 3.1 dưới đây | 1B (nhật ký), K2 (duyệt xoá) |

**Tiêu chí xong:** Kinh doanh NVC đi trọn từ đầu mối → liên hệ (có nhật ký, hẹn) → cơ hội → khảo sát ghi âm → báo
cáo → TGĐ trả về → sửa → duyệt → báo giá → hợp đồng có văn bản → TGĐ xem văn bản, duyệt; khách bị bỏ quên hiện trong
việc hôm nay. AI chạy giả lập; một vài lượt thật chỉ khi được duyệt chi phí.

**Câu hỏi chặn:** số ngày nhắc (gọi lại, chưa phản hồi, M1); ai nhập data Marketing; có tự chia đầu mối cho Kinh doanh
không (mặc định: không, người nhập là người phụ trách).

#### 3.1 Thư viện công trình mẫu (1H) — quy tắc đã chốt

Nguồn: PRD TK-09 (thư viện thiết kế, đang lùi), phiếu khảo sát Kinh doanh (hồ sơ chào khách: hồ sơ năng lực, brochure,
hình ảnh công trình — hiện rải trên Drive / Zalo), CRM-07 (lấy hình ảnh công trình sau bàn giao). Hệ thống chưa có gì.

| Chủ đề | Chủ dự án chốt |
| --- | --- |
| Dùng nhà khách đã làm làm mẫu | **Được** |
| Cách gửi khách | **Link xem trực tuyến** (không cần đăng nhập); **Kinh doanh đặt thời hạn thu hồi** khi tạo link và thu hồi sớm được |
| Ai đưa mẫu vào | **Phòng Thiết kế** đẩy vào kho — cả mẫu nhà ở NVO, nhà xưởng NVC và sản phẩm NVS; không cần duyệt trước khi dùng |
| Ai xem | **Mọi người trong công ty** (cả ba pháp nhân, mọi vai trò) |
| Ai sửa | Chỉ **Giám đốc** (TGĐ, Ban Giám đốc) và **Phòng Thiết kế** |
| Xoá | Thiết kế đề nghị → **Giám đốc đồng ý** mới xoá (Giám đốc tự xoá được). Xoá mềm, giữ lịch sử |
| Giá | **Không hiện khoảng giá** trên mẫu |
| Tư liệu ban đầu | Chủ dự án gửi sau (hồ sơ năng lực, brochure, ảnh công trình, Catalogue NVS mới) |

Thiết kế kỹ thuật (để làm, chưa viết mã):

- Bảng `showcase_items` (loại hình, pháp nhân, diện tích đất, mặt tiền × sâu, số tầng, phong cách, khẩu độ / diện tích
  nhà xưởng, mô tả, liên kết tuỳ chọn tới `design_projects` / `construction_sites`, `deleted_at`) + `showcase_media`
  (ảnh, phối cảnh, mặt bằng; bucket riêng `showcase`, ảnh nén). **Không có cột giá.** Đây là ngoại lệ có chủ đích với
  Mẫu A: đọc = mọi người đã đăng nhập; ghi = TK hoặc TGĐ / BGĐ (dùng `auth_manages_all_companies()` cho phía Giám đốc).
- Xoá: loại phê duyệt mới `showcase_delete` (enum ở migration riêng); `decide_approval` chép bản mới nhất rồi thêm nhánh;
  không có policy DELETE — đồng ý thì đặt `deleted_at`.
- Link khách: `showcase_shares` (bộ mẫu, người gửi, cơ hội / khách, mã ngẫu nhiên, hạn dùng, thu hồi được) +
  `showcase_share_views` (lượt mở). Trang công khai đi qua **Worker** (`/public/showcase/:token`) — trang đầu tiên của hệ
  thống mở ra ngoài: chỉ trả mẫu trong bộ, chưa xoá, ảnh qua URL ký ngắn hạn; không bao giờ trả tên chủ nhà, địa chỉ chi
  tiết (chỉ quận / tỉnh), khung tên bản vẽ, giá. Gửi link thì ghi một dòng nhật ký chăm sóc (1B); khách thích mẫu nào →
  «tham khảo» trong đầu bài thiết kế.
- Lọc mẫu tương tự: lọc thường theo ô đã có trong cơ hội / đầu bài, không dùng AI.
- Về sau: Đợt 2 tự tạo hồ sơ mẫu nháp từ ảnh mốc hoàn thiện / bàn giao và phối cảnh khách đã duyệt — Thiết kế xác
  nhận rồi mới vào kho; Đợt 5 (5C) lấy danh sách «công trình tương tự» cho hồ sơ thầu NVC (DA-08) từ kho này.
- Phép thử bắt buộc: người ngoài Thiết kế / Giám đốc không sửa, không xoá được; Thiết kế không tự xoá; link hết hạn /
  bị thu hồi trả 404; trang công khai không lộ cột cấm (nới quyền để thấy đỏ).

Hạn link: người gửi chọn khi tạo (ô bắt buộc); hết hạn hoặc bị thu hồi thì trang trả «link đã hết hạn», không lộ
gì thêm. Có nên đặt hạn tối đa (vd 90 ngày) không — chờ chủ dự án, để trống = không giới hạn.

### Đợt 2 — Thi công (Trưởng phòng + Chỉ huy trưởng)

| Việc | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 2A. 7 mốc thi công NVO | Định vị → móng → kết cấu → xây, trát, điện nước âm → chống thấm → hoàn thiện → kiểm tra chất lượng (Quy chuẩn Nhà Việt One). Mỗi mốc có danh sách kiểm tra mẫu + ảnh bắt buộc; đạt mới sang mốc sau; hạng mục quan trọng thêm phụ trách kỹ thuật kiểm. NVC dùng cùng cơ chế với bộ mốc nhà xưởng riêng khi NVG chốt (9.5 câu 15) | Danh sách kiểm tra (đã có nền), K2 |
| 2B. Nhật ký bằng giọng nói | Nói 1–2 phút → máy xếp mục (việc làm, nhân lực, vật tư, vướng mắc, thời tiết) + ảnh; mục tiêu 5–10 phút / ngày (PRD 6) | K1 |
| 2C. Điểm danh theo tổ | Một ảnh cả tổ, chọn tên từ danh sách lao động của công trình, GPS chỉ cảnh báo; đề xuất bảng công cho Nhân sự | Điểm danh ảnh (0139) |
| 2D. Biên bản nghiệm thu tự sinh | Tích danh sách → điền mẫu biên bản → hai bên ký trên điện thoại → chuyển Kế toán | K3, ký điện thoại (đã có ở thu hồi giàn giáo) |
| 2E. Màn hình Trưởng phòng Thi công | Mỗi công trình một dòng: mốc hiện tại, nhật ký hôm nay, việc đang chờ, mốc chờ nghiệm thu | 2A |
| 2F. Phiếu bảo hành | Khách báo → ghi âm / gõ nhanh thành phiếu → tự giao người phụ trách, có hạn xử lý → ảnh xác nhận | K1, K4, bảo hành (0166) |
| 2G. Công trình xong → mẫu nháp | Bàn giao xong: gom ảnh mốc hoàn thiện + phối cảnh khách đã duyệt thành hồ sơ mẫu nháp, thông số tự điền; Thiết kế xác nhận mới vào kho | 1H, 2A |

**Tiêu chí xong:** chỉ huy trưởng NVO cập nhật một ngày ≤ 10 phút trên điện thoại; không sang mốc sau khi mốc trước
chưa đạt; biên bản ký xong xuất hiện ở Kế toán; Trưởng phòng thấy công trình nào chậm không cần gọi.

**Câu hỏi chặn:** cách tính công từ điểm danh, công lao động thời vụ ghi vào đâu, bán kính GPS (9.5 câu 6); mốc thi
công nhà xưởng NVC (9.5 câu 15).

### Đợt 3 — Tài chính và kiểm soát

| Việc | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 3A. Đợt thu gắn mốc | Đợt thanh toán trong hợp đồng gắn vào mốc thi công / biên bản nghiệm thu; nhắc thu theo từng đợt | 2A, 2D |
| 3B. Đề nghị thu tiền tự điền | Biên bản ký → điền mẫu đề nghị thanh toán (số tiền, bằng chữ, căn cứ) → Kế toán kiểm, gửi | K3, 2D |
| 3C. Dòng tiền 4–8 tuần | Cộng đợt thu sắp đến + trừ chi đã duyệt chưa chi, theo tuần; tuần âm cảnh báo | `cash_flow_plans` (đã có nền) |
| 3D. Lãi / lỗ từng công trình | Doanh thu + phát sinh đã duyệt − chi phí thực tế, cập nhật theo chứng từ; không thay phần mềm kế toán (KT-08) | — |
| 3E. Danh sách bất thường (KSNB) | Bỏ qua khảo sát, duyệt sát hạn mức, phát sinh khẩn cấp, chênh lệch kiểm kê, mốc bị bỏ qua | 2A; ngưỡng NVG đặt |

**Tiêu chí xong:** từ một biên bản nghiệm thu đợt, Kế toán có đề nghị thu tiền đúng số trong một bấm; Giám đốc Tài
chính thấy tuần thiếu tiền trước khi tới; KSNB mở danh sách bất thường thấy đúng hồ sơ.

### Đợt 4 — Mua hàng và Kho

| Việc | Nội dung |
| --- | --- |
| 4A. Gom đề nghị mua | Đề nghị từ mọi công trình / xưởng một danh sách, xếp theo ngày cần, gộp cùng loại |
| 4B. Bảng so giá nhà cung cấp | Nhập báo giá → bảng cạnh nhau (giá, giao, vận chuyển, hoá đơn) + giá lần mua trước; người chọn |
| 4C. Nhắc đơn sắp trễ | So ngày hẹn giao với hôm nay, báo Mua hàng + Chỉ huy trưởng |
| 4D. Tồn tối thiểu | Mỗi vật tư một mức tối thiểu (NVG đặt); xuống dưới thì báo |

**Tiêu chí xong:** đề nghị vật tư từ công trình tới đơn hàng có bảng so giá đính kèm khi duyệt; hàng sắp hết được báo
trước khi công trường hỏi.

### Đợt 5 — Các bộ phận còn lại

| Việc | Nội dung | Câu hỏi chặn |
| --- | --- | --- |
| 5A. Thiết kế: khảo sát ghi âm + vòng ý kiến khách | Dùng K1 cho bộ câu hỏi đầu bài; ý kiến khách theo từng vòng, phiên bản tự đánh số | — |
| 5B. AI Design 4 bước | Đầu vào → Mặt bằng (giá ước tính trên nút, so phương án, 3 lý do trừ điểm, sửa bằng ô yêu cầu) → Mặt ngoài (mặt đứng + phối cảnh) → Bộ kết quả (tải cả gói, tên theo mã hồ sơ) | Tránh sửa `contracts/`; nếu sửa thì `contracts:gen` + phát hành API và web cùng lúc |
| 5C. Đấu thầu NVC — soạn hồ sơ dự thầu | Kho hồ sơ năng lực → 8 việc hỗ trợ + soạn bộ hồ sơ dự thầu từ số liệu có sẵn; chi tiết ở mục 3.2 | NVC có tự thiết kế không (9.5 câu 14); câu hỏi 3.2 |
| 5D. NVS cho thuê | Màn hình báo giá thuê tự kiểm tồn, tự tính tiền (PRD CRM-11); phiếu giao khách ký nhận trên điện thoại (dùng lại cách ký của biên bản thu hồi); nhắc hết hạn thuê; bảng giá bồi thường chính thức; sổ giàn giáo lệch thì cảnh báo | Bảng giá bồi thường của NVG |
| 5E. Nhân sự | Bảng công dựng từ điểm danh (nếu chưa xong ở 2C); nhắc hợp đồng lao động | Cách tính công |
| 5F. Hành chính | Nhắc giấy phép, bảo hiểm, đăng kiểm; văn bản mẫu tự điền (K3); tài sản ký nhận | — |

#### 3.2 Đấu thầu NVC — soạn hồ sơ dự thầu từ số liệu có sẵn (5C)

Chủ dự án đồng ý gộp (17/10/2026). Mục tiêu: không soạn lại cái đã có, không trễ hạn, gói sau làm nhanh hơn gói trước.
Phòng Dự án NVC thiếu người, dữ liệu thầu phân tán (phiếu khảo sát).

**Đã có trong mã** (0020, 0021, 0022): gói thầu 9 bước; khối lượng theo phiên bản bản vẽ; dự toán nhiều phiên bản, giá
vốn / lợi nhuận Mẫu D; `bid_documents` 9 nhóm, `submit_bid` chặn khi thiếu mục bắt buộc hoặc chưa có dự toán duyệt; duyệt
giá theo hạn mức; trượt thầu bắt buộc lý do; trúng thầu sinh ngân sách thi công. **Chưa có:** danh mục mẫu (đang gõ tay),
kho hồ sơ năng lực, nhắc hạn, vòng làm rõ (chỉ một ô chữ `clarification_notes`), văn bản thầu tự điền, so giá với gói cũ,
lý do trúng / đối thủ.

Thứ tự làm — **kho hồ sơ năng lực trước**, vì mọi việc sau dùng nó:

| Việc | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 5C-1. Kho hồ sơ năng lực | Pháp lý (đăng ký kinh doanh, chứng chỉ năng lực), báo cáo tài chính theo năm, nhân sự chủ chốt + chứng chỉ hành nghề (đọc từ Nhân sự, không chép), thiết bị + kiểm định, kinh nghiệm (hợp đồng đã ký + thư viện mẫu 1H). Mỗi giấy tờ có ngày hết hạn; gắn vào gói bằng một bấm; báo đỏ nếu hết hạn trước ngày nộp | 1H, NS |
| 5C-2. Quyết định tham gia | Bàn tóm tắt gói (quy mô, hạn, năng lực đáp ứng, gói đang chạy, dòng tiền); Ban Giám đốc bấm Tham gia / Bỏ qua + lý do | K2 |
| 5C-3. Danh mục mẫu theo loại gói | Xây mới / cải tạo / bảo trì…: tạo gói là có sẵn danh mục; mỗi mục xếp loại **máy sinh / gắn từ kho / người viết** | 5C-1 |
| 5C-4. Giao phần việc nội bộ | Cung ứng lấy báo giá, Thi công góp ý biện pháp, Kế toán xem bảo lãnh và dòng tiền — người, hạn, nút «Thúc» | K4, `nudge_approval` / Request Tracker |
| 5C-5. Nhắc hạn + vòng làm rõ | Nhắc trước hạn nộp / hạn làm rõ (số ngày NVG đặt) cho người phụ trách + BGĐ; bảng vòng làm rõ (câu hỏi, trả lời, hạn) và lịch sử gia hạn thay ô chữ | K4 |
| 5C-6. Văn bản thầu tự điền | Đơn dự thầu, giấy uỷ quyền, thư chào giá, bảng kê kinh nghiệm / nhân sự / thiết bị, bảng tổng hợp giá (giá bằng chữ) từ mẫu Word; gói nào chủ đầu tư bắt biểu mẫu riêng thì tải mẫu đó lên | K3, 5C-1 |
| 5C-7. So đơn giá | Đơn giá dự toán cạnh giá các lần dự thầu trước và giá mua thực tế (MH-05); lệch quá ngưỡng (NVG đặt) chỉ cảnh báo | `unit_prices`, `estimate_items` |
| 5C-8. Soạn và xuất bộ hồ sơ | Màn hình «Soạn bộ hồ sơ»: từng mục của danh mục → tự sinh / gắn từ kho / tải bản người viết (biện pháp, tiến độ có bản nháp ghép từ gói tương tự); kiểm thiếu; sau khi giá được duyệt xuất **một tệp .zip** thư mục đánh số theo danh mục hồ sơ mời thầu + mục lục (vòng đầu `.docx` / `.xlsx`, PDF khi có máy chủ chuyển đổi) | 5C-1, 5C-3, 5C-6 |
| 5C-9. Bảo lãnh + rút kinh nghiệm | Bảo lãnh dự thầu (số tiền, ngân hàng, hạn, đã thu hồi chưa); kết quả kèm đơn vị trúng, giá trúng, lý do trúng / trượt; báo cáo tỷ lệ trúng theo loại gói | — |
| 5C-10. Bước «phương án kỹ thuật, biện pháp thi công» | Như kế hoạch cũ; thư viện biện pháp từ các gói đã làm làm nguồn nháp | 9.5 câu 14 |
| (sau) AI đọc hồ sơ mời thầu | Đọc PDF → nháp danh mục yêu cầu + các mốc hạn để người kiểm. Trả phí, mặc định tắt | K1, chủ dự án duyệt chi phí |

**Ranh giới:** máy không ký, không đóng dấu, không nộp lên hệ thống đấu thầu điện tử, không quyết giá dự thầu hay có tham
gia không, không phát hành biện pháp / giải pháp kỹ thuật thay kỹ sư (PRD 2.3). Không thay phần mềm dự toán (GXD, F1… —
chỉ nhập Excel). Giá dự thầu và báo cáo tài chính chỉ người có quyền mới xuất được; không gửi hồ sơ lên AI khi chưa duyệt.

**Tiêu chí xong:** với một gói NVC mẫu, phần hành chính – pháp lý, năng lực – kinh nghiệm và tài chính xuất ra không
phải gõ tay; giấy tờ hết hạn bị báo trước ngày nộp; thiếu mục thì không xuất được bản cuối; người không có quyền không
xuất được bảng giá / báo cáo tài chính (phép thử nới quyền để thấy đỏ).

**Cần từ NVG:** 1–2 bộ hồ sơ dự thầu NVC đã nộp + hồ sơ mời thầu tương ứng (chỉ đọc trên máy, không commit, không gửi
AI); mẫu Word đơn dự thầu / thư chào giá đang dùng; các loại gói thường gặp và giấy tờ từng loại; bảo lãnh dự thầu do Kế
toán hay phòng Dự án theo dõi; có ghi thông tin đối thủ không.

## 4. Việc còn treo từ trước (làm xen khi rảnh, không chặn đợt nào)

- GĐ1: bảng lịch sử bước chung `stage_transitions`; dải tiến trình gói thầu; thanh lưu dính biểu mẫu đầu bài; thẻ PWA
  trên hộp thoại; `ConfirmDialog` qua portal.
- QĐ-6: đánh dấu giao dịch nội bộ để số cả tập đoàn loại được.
- GĐ4: PDF chuẩn (cần máy chủ LibreOffice); AI gợi ý câu chữ điều khoản (trả phí, tắt mặc định).
- Nối Zalo OA / form quảng cáo vào danh sách đầu mối; gửi văn bản cho khách qua đường link / email (cần dịch vụ email).
- Ô «hợp đồng sắp hết hạn» trên Tổng quan điều hành (9.5 câu 8).

## 5. Phụ thuộc — đọc nhanh

```
Bước 0 (kiểm + phát hành) ──► Đợt 1 ──► Đợt 2 ──► Đợt 3
                               │  K1–K5   │  2A, 2D  ▲
                               │          └──────────┘ (đợt thu gắn mốc, đề nghị thu từ biên bản)
                               └──► Đợt 4, Đợt 5 dùng lại K1, K3, K4
Câu hỏi NVG: số ngày nhắc → 1C, K4 · cách tính công + GPS → 2C · mốc NVC → 2A (NVC) · NVC thiết kế → 5C · giá bồi thường → 5D
```

Migration tiếp theo: **0172**.
