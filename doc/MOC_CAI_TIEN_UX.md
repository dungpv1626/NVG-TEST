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
