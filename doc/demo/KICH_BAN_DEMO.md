# Kịch bản demo — Hệ thống Quản trị Nhà Việt Group

**Bản nháp 30/09/2026** — hoàn thiện Thứ 7 03/10 sau khi có phần AI Design và ảnh chụp màn hình;
tổng duyệt Chủ nhật 04/10.

| | |
| --- | --- |
| **Địa chỉ** | `https://nvg.tests99.workers.dev` |
| **Khán giả** | Ban lãnh đạo NVG và trưởng các bộ phận |
| **Thời lượng** | 75 phút: 55 phút trình diễn, 20 phút hỏi đáp |
| **Người trình bày** | Haan |
| **Thiết bị** | Máy tính nối máy chiếu · một điện thoại đã đăng nhập tài khoản chỉ huy trưởng |

## Thông điệp cốt lõi

> **Một nơi duy nhất cho mọi công việc — không cần tìm trên Zalo, không cần làm lại trên Excel.**

Kể **vấn đề trước, tính năng sau**. Mỗi cảnh mở bằng một việc người trong phòng đang làm khổ sở hôm
nay (lấy từ phiếu khảo sát 12 bộ phận), rồi mới cho thấy hệ thống làm việc đó thế nào. Không liệt kê
tính năng; không nói thuật ngữ kỹ thuật.

Ba điều người xem phải mang về:

1. **Lãnh đạo thấy số thật, bấm là ra chứng từ gốc** — không chờ ai tổng hợp.
2. **Công trường và văn phòng nói chuyện trên cùng một hồ sơ** — đề nghị không còn «gửi rồi không ai trả lời».
3. **Quy chế nằm trong tay lãnh đạo, không nằm trong phần mềm** — hạn mức phê duyệt và thời hạn xử lý tự sửa được trên màn hình quản trị.

---

## Chuẩn bị

**Một ngày trước (Thứ 7):**

- [ ] Chạy trọn `doc/demo/KIEM_THU_QA.md` trên bản demo; mọi ca trong kịch bản phải Đạt.
- [ ] Sao lưu CSDL bản demo (`.sao-luu/`) — gói miễn phí không có sao lưu tự động.
- [ ] Đăng nhập sẵn và đọc qua hướng dẫn tự mở một lần trên máy trình diễn (để bảng hướng dẫn không bật lên giữa buổi).
- [ ] Điện thoại: đăng nhập chỉ huy trưởng, thêm biểu tượng ra màn hình chính, kiểm tra camera cho phép trình duyệt dùng.

**Một giờ trước:**

- [ ] Mạng: wifi phòng họp + điểm phát di động dự phòng.
- [ ] Mở sẵn các thẻ trình duyệt, mỗi vai trò một cửa sổ ẩn danh riêng: Tổng Giám đốc · Giám đốc Tài chính · Mua hàng · Kho · Quản trị viên.
- [ ] Phóng chữ trình duyệt 125% cho máy chiếu.
- [ ] Tắt thông báo hệ điều hành trên máy trình diễn.

---

## Mở đầu — 5 phút

**Nói:** Hôm nay NVG chạy trên Excel, Word, Zalo và Google Drive. Khảo sát 12 bộ phận cho thấy ba
vướng mắc lặp lại ở gần như mọi phòng: số liệu giữa các bộ phận không khớp; không biết hồ sơ đang ở
đâu, ai đang giữ; và mỗi báo cáo cho lãnh đạo là một lần tổng hợp tay.

**Chiếu:** màn hình đăng nhập → Dashboard của Tổng Giám đốc.

---

## Cảnh 1 — Lãnh đạo nhìn toàn cảnh, bấm là ra gốc (12 phút)

**Tài khoản:** Tổng Giám đốc.

| Bước | Thao tác | Nói |
| --- | --- | --- |
| 1 | Dashboard: điểm qua thẻ Chờ phê duyệt, Quá hạn, cơ hội, hợp đồng, dòng tiền, công nợ, giàn giáo cho thuê | «Đây là màn hình đầu tiên anh thấy mỗi sáng. Không ai phải tổng hợp — mỗi con số tính thẳng từ chứng từ.» |
| 2 | Bấm thẻ Lãi/lỗ theo công trình | «Nhà xưởng Hưng Thịnh: hợp đồng 6,5 tỷ, đã nghiệm thu 1,3 tỷ, chi phí đã phát sinh ~842 triệu.» |
| 3 | Chỉ cột «Đã nghiệm thu» và «Lãi/lỗ thực tế» | «Doanh thu ghi theo khối lượng đã nghiệm thu với chủ đầu tư — không phải cả hợp đồng.» |
| 4 | Bấm tên công trình → tab Ngân sách | «Từng mã chi phí: dự toán, đã cam kết, đã chi.» |
| 5 | Từ công trình → hợp đồng → gói thầu → cơ hội | «Mọi thứ nối với nhau. Hỏi "vì sao giá này", bấm ngược về bản dự toán đã duyệt và người duyệt.» |

**Đường lui:** thẻ nào hiện «Chưa đủ dữ liệu» — nói thật: hệ thống không hiện số khi chưa đủ căn cứ,
thà để trống còn hơn một con số sai trông như đã duyệt.

---

## Cảnh 2 — Một ngày của chỉ huy trưởng (18 phút) — cảnh quan trọng nhất

**Thiết bị:** điện thoại (chỉ huy trưởng) + máy tính (Giám đốc Tài chính, Mua hàng).

**Mở bằng vấn đề:** Khảo sát công trường — việc tốn công nhất của chỉ huy trưởng không phải lập đề
nghị mà là **hỏi lại**: gửi đề nghị vật tư rồi không biết ai đang giữ, đã bao lâu, phải gọi Zalo để giục.

| Bước | Thiết bị · vai trò | Thao tác | Nói |
| --- | --- | --- | --- |
| 1 | Điện thoại · CHT | Mở công trình; chỉ nút «Chụp ảnh hiện trường» ở đầu trang | «Chỉ huy trưởng chỉ thấy công trình được giao. Nút chụp ảnh luôn ngay trên cùng.» |
| 2 | Điện thoại · CHT | Thanh dưới → **Điểm danh** → chụp trực tiếp, cho phép vị trí → Gửi điểm danh | «Thay ảnh Timemark gửi Zalo: giờ, ngày, công trình, người in lên ảnh; giờ là giờ máy chủ. Chưa nối với chấm công — màn hình nói rõ điều đó.» |
| 3 | Điện thoại · CHT | Chụp **trực tiếp** 1–2 ảnh trong phòng họp, gõ một dòng, Lưu | «Nhật ký có ảnh, không cần gửi Zalo song song.» |
| 4 | Điện thoại · CHT | Thanh dưới → Theo dõi đề nghị | «Ba đề nghị: một đã về kho, một chờ duyệt, một chờ mua. Ai đang giữ, chờ bao lâu, quá hạn chưa.» |
| 5 | Điện thoại · CHT | Chỉ đề nghị xi măng: «Quá hạn», người giữ là Giám đốc Tài chính | «Hạn xử lý do Ban Giám đốc khai — không phải phần mềm tự đặt.» |
| 6 | Điện thoại · CHT | Bấm **Thúc** | «Không cần gọi điện. Lần nhắc được ghi lại, không nhắc dồn được.» |
| 7 | Máy tính · Giám đốc Tài chính | Chuông thông báo → Hộp thư Phê duyệt → Duyệt | «Người giữ nhận ngay, bấm là vào đúng hồ sơ.» |
| 8 | Điện thoại · CHT | Kéo làm mới Theo dõi đề nghị | «Đã chuyển sang Mua hàng — công trường thấy ngay, không ai phải báo.» |
| 9 | Điện thoại · CHT | Nghiệm thu → «Nghiệm thu cốt thép trước khi đổ bê tông» → chấm mục, chụp ảnh mục bắt buộc → Lập biên bản | «Mỗi mục kiểm có ảnh. Biên bản đã ký không sửa được — cần đính chính thì lập biên bản điều chỉnh.» |
| 10 | Máy tính · Quản trị viên | Quản trị hệ thống → Thời hạn xử lý; → Hạn mức phê duyệt | «Thời hạn và hạn mức do Ban Giám đốc quyết, quản trị viên nhập trên màn hình — không cần sửa phần mềm.» |

**Đường lui:** mạng điện thoại chập chờn → dùng Chrome trên máy tính thu cỡ điện thoại; ảnh tải chậm →
bỏ qua bước 2, dùng nhật ký đã có ảnh.

---

## Cảnh 3 — NVS cho thuê giàn giáo (8 phút)

**Tài khoản:** Kho (hoặc Xưởng NVS).

**Mở bằng vấn đề:** Giàn giáo đang ở đâu, khách nào đang giữ bao nhiêu, trả về bao nhiêu hư hỏng — hiện
theo dõi bằng Excel và sổ tay.

| Bước | Thao tác | Nói |
| --- | --- | --- |
| 1 | Tài sản cho thuê → danh sách hợp đồng | «Hai công trình đang thuê.» |
| 2 | Mở hợp đồng Đông Đô | «Đã trả một phần — tiền thuê tính theo ngày thuê thật của từng đợt trả, không tính tay.» |
| 3 | Kho → Giàn giáo | «Lô tại kho, lô đang cho thuê, lô hỏng chờ sửa — tách riêng, truy được từng sự kiện.» |

**Nói thật phần chưa có:** sổ tài sản giàn giáo theo thời điểm, giao thêm giữa kỳ, biên bản thu hồi
có chữ ký hai bên, đối soát tất toán sang Kế toán — nằm ở lộ trình (cuối buổi).

---

## Cảnh 4 — NVO thiết kế và AI Design (10 phút)

**Tài khoản:** Thiết kế NVO. *(Hoàn thiện Thứ 7 sau khi Haan bàn giao AI Design.)*

| Bước | Thao tác | Nói |
| --- | --- | --- |
| 1 | Dự án thiết kế → đầu bài, khảo sát | «Đầu bài 98 câu trong sáu mục — thứ kiến trúc sư hỏi chủ nhà, giờ có cấu trúc.» |
| 2 | AI Design → hồ sơ dựng sẵn: mặt bằng từng tầng | «AI đề xuất bố cục; mọi số đo trên bản vẽ do chương trình gán.» |
| 3 | Mặt đứng, phối cảnh | «Kết quả AI luôn là đề xuất — kỹ sư có chứng chỉ mới phát hành.» |
| 4 | *(Nếu mạng tốt)* chạy một lượt thật | Quá 3 phút hoặc hỏng → quay về hồ sơ dựng sẵn, không chờ. |
| 5 | Phiên bản bản vẽ đã phát hành → dự toán → hợp đồng | «Từ bản vẽ tới hợp đồng, một luồng.» |

**Nói rõ:** AI Design là **phụ trợ tuỳ chọn** — nhà cung cấp mô hình ngừng hay chi phí tăng thì phòng
Thiết kế vẫn làm trọn việc bằng tay trên hệ thống; có trần chi tiêu tự động.

---

## Kết — lộ trình, nói thật phần chưa có (2 phút)

| Nhóm | Đã có trong buổi này | Còn lại |
| --- | --- | --- |
| Công trường | Nhật ký ảnh, theo dõi đề nghị, «Thúc», nghiệm thu checklist | Màn hình soạn danh mục kiểm tra, bàn giao mặt bằng, giao việc tổ đội, phát sinh, an toàn, chấm công hiện trường |
| Giàn giáo NVS | Cho thuê, thu hồi nhiều đợt, tiền thuê theo ngày | Sổ tài sản theo thời điểm, giao thêm giữa kỳ, biên bản thu hồi ký hai bên, bồi thường theo bảng giá, đối soát tất toán |
| Xưởng | Khung lệnh sản xuất | Định mức, công đoạn, chất lượng, giá thành |
| Kế toán | Đề nghị chi bốn bước, công nợ, dòng tiền | Xuất sang phần mềm kế toán chính thức |

**Việc cần Ban Giám đốc quyết** để đi tiếp: thời hạn cam kết của từng phòng ban, bảng giá bồi thường
giàn giáo, phần mềm kế toán để tích hợp, gói hạ tầng có sao lưu trước khi nhập dữ liệu thật.

---

## Hỏi đáp thường gặp

| Câu hỏi | Trả lời |
| --- | --- |
| Dữ liệu có an toàn không? Ai xem được lương, giá vốn? | Phân quyền nằm trong cơ sở dữ liệu, không nằm ở màn hình. Lương, giá vốn, lợi nhuận chỉ vài vai trò được xem, và mọi lượt xem đều được ghi lại. |
| AI có tự quyết gì không? | Không. Mọi kết quả AI là đề xuất; giá bán, lợi nhuận, giải pháp kỹ thuật, phê duyệt do người có thẩm quyền quyết. |
| Mất mạng ở công trường thì sao? | Nội dung đang gõ không mất; lưu lại khi có mạng. Làm việc hoàn toàn ngoại tuyến cho Kho đang chờ quyết định phạm vi. |
| Dữ liệu cũ trên Excel đưa vào thế nào? | Theo từng danh mục: khách hàng, nhà cung cấp, vật tư có bộ mã thống nhất; nạp một lần trước khi dùng thật. |
| Chi phí vận hành? | Hạ tầng hiện ở gói miễn phí để trình diễn; vận hành thật cần gói có sao lưu. AI tính theo lượt dùng, có trần chi tiêu. |
| Bao lâu thì dùng thật được? | Theo thứ tự: chốt các quyết định ở trên → tạo môi trường vận hành → nạp danh mục → chạy thử một công trình thật. |
