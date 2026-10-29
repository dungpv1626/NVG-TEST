# Kế hoạch: Thi công theo phiếu khảo sát công trường

Nguồn: `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`.
- Phiếu «Chỉ huy – Giám sát công trường» do anh Nguyễn Công Minh, Trưởng phòng Thi công, điền. Phạm vi là nhà xưởng NVC, khoảng 100 người, trong đó 80 người thuộc tổ đội / nhà thầu phụ.
- Mục 3 trong phiếu Ban Giám đốc của anh Bùi Văn Thi.

Theo QĐ-1, tài liệu chỉ ghi thứ tự và tiêu chí xong, không ghi mốc thời gian.

## Đã có, khớp với phiếu

- Nhật ký ngày: nhập một lần, nói thay gõ (0190).
- Đề nghị vật tư có ngày cần; người gửi thấy đang chờ ai và bấm «Thúc» được (TC-10, 0165).
- Nghiệm thu theo mốc có danh mục kiểm tra và ảnh; mốc sau chỉ mở khi mốc trước đạt (0182). Biên bản ký hai bên, sau đó báo Kế toán (0192).
- Bản vẽ và tài liệu công trường có phiên bản, bản đang hiệu lực đứng riêng; bản vẽ Thiết kế phát hành được đưa sang công trường (0154).
- RFI / yêu cầu làm rõ, tổ đội (phạm vi khoán, đánh giá), điểm danh tổ và bảng công thời vụ (0232), phiếu bảo hành (0193), bảng theo dõi của Trưởng phòng (0191), ngân sách công trình (0235).

## Ràng buộc từ phiếu, mọi việc dưới đây phải theo

- Công trường cập nhật mỗi ngày tối đa 10–20 phút, mục tiêu 5–10 phút, ưu tiên thao tác trên điện thoại. Chọn từ gợi ý thay vì gõ.
- Phiếu mục 7 ghi những gì KHÔNG đưa lên phần mềm:
  - phần mềm không thay việc kiểm tra tại chỗ, chỉ ghi checklist, ảnh và người xác nhận;
  - việc khẩn cấp xử lý trước, hồ sơ làm sau;
  - bản giấy bắt buộc ký hoặc đóng dấu vẫn lưu bản giấy;
  - không bắt nhập hai lần.
- Văn phòng cũng phải có thời hạn xử lý: mỗi đề nghị gửi từ công trường mang SLA (`sla_definitions`) và hiện «đang chờ ai».
- Thứ tự thí điểm theo đúng lời anh Minh: báo cáo ngày, giao việc, vật tư, bản vẽ, nghiệm thu, phát sinh trước; khối lượng, thanh toán, an toàn sau.

## Các việc, theo thứ tự đề xuất

### T1. Phát sinh lập từ công trường — ĐÃ LÀM (0241)
- **Vấn đề:** hiện phát sinh chỉ có ở tab Phát sinh của hợp đồng, mà Thi công không xem được phân hệ Hợp đồng.
- **Làm:** chỉ huy trưởng lập «Đề xuất phát sinh / biên bản hiện trường» trên điện thoại, gồm:
  - mô tả, nguyên nhân (chủ đầu tư yêu cầu / thiết kế đổi / hiện trường khác hồ sơ);
  - ảnh và số đo hiện trạng;
  - khối lượng ước tính;
  - ảnh hưởng tiến độ.
- **Luồng sau khi lập:** đề xuất sang Dự án / Kinh doanh để lập báo giá phát sinh, rồi soạn phụ lục bằng bộ soạn 0229, rồi khách xác nhận.
  - Thi công thấy trạng thái và ai đang giữ, không thấy giá.
  - Cờ «khẩn cấp — đã làm trước» bắt buộc ghi người cho phép, rồi hoàn thiện hồ sơ sau.
- **Xong khi:** một phát sinh đi trọn từ công trường tới phụ lục đã ký, bằng đúng các vai, và Thi công không lộ giá trị.

### T2. Danh sách tồn tại có người xử lý và hạn — ĐÃ LÀM (0241)
- **Vấn đề:** hiện tồn tại chỉ là ô chữ `outstanding_issues` của biên bản nghiệm thu.
- **Làm:**
  - mỗi tồn tại là một dòng: hạng mục, ảnh trước, người xử lý (tổ đội hoặc người nội bộ), hạn;
  - đóng dòng bắt buộc có ảnh sau sửa;
  - tồn tại quá hạn hiện ở cột «Cần chú ý» của bảng theo dõi.
- **Xong khi:** nghiệm thu ghi được tồn tại, theo dõi được tới lúc đóng, và quá hạn thì báo.

### T3. Kế hoạch tuần và giao việc cho tổ đội
- **Làm:**
  - đầu tuần, chỉ huy trưởng lập đầu việc của tuần: tổ, khối lượng mục tiêu, mốc liên quan;
  - nhật ký ngày đánh dấu đầu việc nào đã làm, chọn từ danh sách, không gõ lại.
- **Xong khi:** cập nhật hằng ngày vẫn trong 5–10 phút (đo bằng chạy thử trên điện thoại).

### T4. Báo cáo tuần / tháng tự tổng hợp
- **Làm:**
  - máy dựng báo cáo từ nhật ký, kế hoạch tuần, mốc, đề nghị đang chờ, tồn tại, điểm danh, phát sinh;
  - chỉ huy trưởng chỉ thêm vài câu nhận định rồi gửi Trưởng phòng Thi công;
  - có bản in / PDF;
  - tóm tắt bằng AI là tùy chọn, có công tắc riêng, mặc định tắt.
- **Xong khi:** báo cáo tuần ra không cần nhập thêm số nào.

### T5. Xác nhận khối lượng tổ đội / nhà thầu phụ theo đợt
- **Vấn đề:** đây là chỗ hay tranh chấp nhất theo phiếu.
- **Làm:**
  - **Bảng khối lượng mỗi đợt:** hạng mục trong phạm vi khoán, khối lượng kỳ này, luỹ kế, đơn giá khoán.
  - **Chỉ tính phần đã nghiệm thu:** phần chưa đạt hoặc chưa nghiệm thu bị loại, kèm lý do.
  - **Ký và duyệt:** chỉ huy trưởng lập; tổ trưởng ký trên điện thoại hoặc qua bản giấy quét; Trưởng phòng Thi công xác nhận.
  - **Đề nghị thanh toán:** sinh sẵn từ đợt đã xác nhận, đi qua đề nghị thanh toán có sẵn (0228). Tỷ lệ giữ lại bảo hành là tham số, để trống.
  - **Sổ theo dõi mỗi tổ:** giá trị khoán, đã xác nhận, đã trả, còn lại.
- **Xong khi:** một tổ đội đi trọn khoán → nghiệm thu → xác nhận khối lượng → đề nghị thanh toán → Kế toán chi, và số liệu đối soát khớp.

### T6. Sổ an toàn lao động (gọn)
- **Làm:** bốn loại ghi chép:
  - huấn luyện đầu vào (tổ, số người, ảnh);
  - cấp phát bảo hộ;
  - vi phạm (ảnh, biện pháp khắc phục);
  - sự cố và tình huống suýt tai nạn. Loại này báo ngay Trưởng phòng Thi công và Ban Giám đốc, theo dõi tới khi khắc phục xong.
- Không làm thành hệ thống HSE đầy đủ.
- **Xong khi:** một sự cố ghi trên điện thoại tới đúng người trong vòng một phút (thông báo tức thời 0188).

### T7. Máy móc tại công trường
- **Làm:**
  - danh sách máy: của công ty / NVS / thuê ngoài, ngày đến, ngày đi;
  - ca máy chọn trong nhật ký;
  - làm căn cứ đối chiếu tiền thuê máy;
  - giàn giáo NVS vẫn theo luồng thuê có sẵn.

### T8. Ảnh có thời gian, vị trí, hạng mục
- **Làm:**
  - chụp trong ứng dụng thì ghi GPS (như điểm danh) và cho chọn hạng mục / mốc;
  - album ảnh theo hạng mục, giúp bớt việc «gom ảnh từ Zalo».

### T9. Gói bàn giao Dự án → Thi công
- **Làm:** mở rộng khối «Chuẩn bị khởi công» thành danh mục bàn giao: hợp đồng (chỉ phạm vi và tiến độ, không giá), bản vẽ, BOQ, các cam kết, danh sách rủi ro. Mỗi mục có người giao, người nhận.
- **Giữ:** Mẫu D cho dự toán nội bộ.

### Để sau
- Làm việc khi mạng yếu: phiếu ghi sóng «ổn định»; KHO-09 vẫn đang treo.

## Câu hỏi cho NVG — anh Dũng đã chốt

1. Khoán tổ đội: có CẢ HAI cách — theo bảng đơn giá từng hạng mục, hoặc khoán gọn. Chọn cách khi thêm tổ đội. Giữ lại tiền bảo hành là TÙY CHỌN: tỷ lệ đặt cho từng tổ, để trống nghĩa là không giữ.
2. Làm phát sinh trước, hồ sơ sau khi khẩn cấp: phải có người có quyền CAO HƠN chỉ huy trưởng cho phép (Trưởng phòng Thi công hoặc Ban Giám đốc). Chỉ huy trưởng không tự cho phép mình.
3. Tồn tại chưa đóng: CHỈ CẢNH BÁO, không chặn bàn giao.
4. Báo cáo tuần gửi Trưởng phòng Thi công và các giám đốc.
5. 8 mốc nhà xưởng NVC: tạm dùng đề xuất của Claude Code.
6. Biên bản in theo mẫu của NVC.
