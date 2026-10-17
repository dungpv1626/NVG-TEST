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

**Tiêu chí xong:** Kinh doanh NVC đi trọn từ đầu mối → liên hệ (có nhật ký, hẹn) → cơ hội → khảo sát ghi âm → báo
cáo → TGĐ trả về → sửa → duyệt → báo giá → hợp đồng có văn bản → TGĐ xem văn bản, duyệt; khách bị bỏ quên hiện trong
việc hôm nay. AI chạy giả lập; một vài lượt thật chỉ khi được duyệt chi phí.

**Câu hỏi chặn:** số ngày nhắc (gọi lại, chưa phản hồi, M1); ai nhập data Marketing; có tự chia đầu mối cho Kinh doanh
không (mặc định: không, người nhập là người phụ trách).

### Đợt 2 — Thi công (Trưởng phòng + Chỉ huy trưởng)

| Việc | Nội dung | Phụ thuộc |
| --- | --- | --- |
| 2A. 7 mốc thi công NVO | Định vị → móng → kết cấu → xây, trát, điện nước âm → chống thấm → hoàn thiện → kiểm tra chất lượng (Quy chuẩn Nhà Việt One). Mỗi mốc có danh sách kiểm tra mẫu + ảnh bắt buộc; đạt mới sang mốc sau; hạng mục quan trọng thêm phụ trách kỹ thuật kiểm | Danh sách kiểm tra (đã có nền), K2 |
| 2B. Nhật ký bằng giọng nói | Nói 1–2 phút → máy xếp mục (việc làm, nhân lực, vật tư, vướng mắc, thời tiết) + ảnh; mục tiêu 5–10 phút / ngày (PRD 6) | K1 |
| 2C. Điểm danh theo tổ | Một ảnh cả tổ, chọn tên từ danh sách lao động của công trình, GPS chỉ cảnh báo; đề xuất bảng công cho Nhân sự | Điểm danh ảnh (0139) |
| 2D. Biên bản nghiệm thu tự sinh | Tích danh sách → điền mẫu biên bản → hai bên ký trên điện thoại → chuyển Kế toán | K3, ký điện thoại (đã có ở thu hồi giàn giáo) |
| 2E. Màn hình Trưởng phòng Thi công | Mỗi công trình một dòng: mốc hiện tại, nhật ký hôm nay, việc đang chờ, mốc chờ nghiệm thu | 2A |
| 2F. Phiếu bảo hành | Khách báo → ghi âm / gõ nhanh thành phiếu → tự giao người phụ trách, có hạn xử lý → ảnh xác nhận | K1, K4, bảo hành (0166) |

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
| 5C. Đấu thầu NVC | Bước «phương án kỹ thuật, biện pháp thi công»; danh mục hồ sơ thầu theo loại gói; nhắc hạn nộp; so đơn giá với gói cũ (chỉ cảnh báo) | NVC có tự thiết kế không (9.5 câu 14) |
| 5D. NVS cho thuê | Màn hình báo giá thuê tự kiểm tồn, tự tính tiền (PRD CRM-11); nhắc hết hạn thuê; bảng giá bồi thường chính thức; sổ giàn giáo lệch thì cảnh báo | Bảng giá bồi thường của NVG |
| 5E. Nhân sự | Bảng công dựng từ điểm danh (nếu chưa xong ở 2C); nhắc hợp đồng lao động | Cách tính công |
| 5F. Hành chính | Nhắc giấy phép, bảo hiểm, đăng kiểm; văn bản mẫu tự điền (K3); tài sản ký nhận | — |

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
