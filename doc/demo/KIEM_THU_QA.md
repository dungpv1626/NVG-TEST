# Ca kiểm thử QA — bản demo `nvg.tests99.workers.dev`

Bộ ca kiểm thử bằng tay, chạy trên **bản demo sau đợt phát hành Thứ 7 03/10/2026**, trước buổi tổng
duyệt. Bổ sung cho kiểm thử tự động (Vitest `web`/`logic`/`db`, smoke Playwright) — bộ tự động chứng
minh logic và phân quyền; bộ này chứng minh **người dùng thật làm được việc thật trên màn hình thật**.

**Cách ghi kết quả:** cột Kết quả điền `Đạt` / `Không đạt` / `Bỏ qua`. Không đạt thì ghi mã lỗi và
ảnh chụp vào cột Ghi chú; lỗi chặn kịch bản demo sửa trước khi tổng duyệt.

**Môi trường:** Chrome máy tính 1440 px; điện thoại thật (hoặc Chrome cỡ 390 × 844). Mỗi vai trò
một cửa sổ ẩn danh riêng — tránh lẫn phiên đăng nhập.

## Tài khoản

Mật khẩu chung của tài khoản demo: xem `db/src/seed/data.ts` (`SEED_PASSWORD`).

| Vai trò | Tài khoản | Pháp nhân |
| --- | --- | --- |
| Tổng Giám đốc | `tgd@nhavietgroup.test` | toàn NVG |
| Giám đốc Tài chính | `cfo@nhavietgroup.test` | toàn NVG |
| Kinh doanh NVC | `kinhdoanh.nvc@nhavietgroup.test` | NVC |
| Dự án – Đấu thầu | `dauthau.nvc@nhavietgroup.test` | NVC |
| Thiết kế NVO | `thietke.nvo@nhavietgroup.test` | NVO |
| Trưởng phòng Thi công | `congtruong.nvc@nhavietgroup.test` | NVC |
| Chỉ huy trưởng | `chihuytruong.nvc@nhavietgroup.test` | NVC — chỉ công trình được giao |
| Mua hàng | `muahang@nhavietgroup.test` | NVC, NVS, NVO |
| Kho | `kho@nhavietgroup.test` | NVC, NVS |
| Kế toán | `ketoan@nhavietgroup.test` | NVC, NVS, NVO |
| Nhân sự | `nhansu@nhavietgroup.test` | NVC, NVS, NVO |
| Xưởng NVS | `sanxuat.nvs@nhavietgroup.test` | NVS |

---

## A. Đăng nhập và điều hướng

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| A-01 | Mọi vai trò trên | Đăng nhập | Vào đúng trang mặc định của vai trò; tên và pháp nhân đúng ở góc trên | | |
| A-02 | Mọi vai trò | Xem menu trái | Chỉ có phân hệ vai trò được xem; không có mục bấm vào rồi bị chặn | | |
| A-03 | Bất kỳ | Sai mật khẩu | Báo lỗi tiếng Việt, không lộ mã lỗi | | |
| A-04 | Bất kỳ | Tải lại trang ở một đường dẫn sâu (vd. chi tiết công trình) | Mở lại đúng trang, không 404, vẫn đăng nhập | | |
| A-05 | Bất kỳ | Ô tìm kiếm trên cùng: gõ «Hưng Thịnh» | Ra khách hàng, cơ hội, công trình liên quan; bấm mở đúng hồ sơ | | |
| A-06 | Mỗi màn hình chính | Lần đầu vào màn hình | Bảng «Hướng dẫn» tự mở một lần; bấm «Đã hiểu» thì lần sau không tự mở; nút «Hướng dẫn» mở lại được | | |

## B. Phân quyền — ranh giới phải đứng vững trước khách

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| B-01 | Chỉ huy trưởng | Danh sách công trình | Chỉ thấy công trình được giao (Nhà xưởng Hưng Thịnh) | | |
| B-02 | Chỉ huy trưởng | Dashboard | KHÔNG có thẻ Dòng tiền, Công nợ phải thu, Lãi/lỗ | | |
| B-03 | Kinh doanh | Gõ thẳng `/bc/lai-lo` | Bị chặn, câu báo nói rõ ai được xem | | |
| B-04 | Kho | Mở tồn kho | Không thấy đơn giá / giá vốn | | |
| B-05 | Kế toán | Hồ sơ nhân sự | Xem được lương khi bấm; không thấy căn cước, sức khoẻ | | |
| B-06 | Mua hàng | Chi tiết công trình | Thấy tên công trình, KHÔNG mở được nhật ký, ngân sách | | |
| B-07 | Kinh doanh NVC | Chọn pháp nhân NVO | Không có — chỉ pháp nhân của mình | | |
| B-08 | Tổng Giám đốc | Chọn «Toàn NVG» | Danh sách gộp đủ ba pháp nhân, có cột Pháp nhân, không rỗng | | |

## C. NVC — nhà xưởng từ cơ hội tới lãi/lỗ

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| C-01 | Kinh doanh | Mở cơ hội «Nhà xưởng sản xuất linh kiện 2.400 m²» | Giai đoạn Đàm phán → Ký hợp đồng; lịch sử chuyển giai đoạn đủ mốc | | |
| C-02 | Dự án – Đấu thầu | Mở gói thầu | Bóc khối lượng, dự toán 6,5 tỷ, đã duyệt giá, trúng thầu; phê duyệt ghi người duyệt | | |
| C-03 | Dự án – Đấu thầu | Mở hợp đồng | Giá trị và khách hàng tự điền từ dự toán; số hợp đồng; điều khoản | | |
| C-04 | Bất kỳ được xem | Từ hợp đồng truy ngược | Hợp đồng → gói thầu → cơ hội → khách hàng, mỗi bước một cú bấm | | |
| C-05 | Trưởng phòng Thi công | Công trình → Ngân sách | Dòng ngân sách từ dự toán; vật tư có số thực tế từ phiếu nhập/xuất | | |
| C-06 | Tổng Giám đốc | Báo cáo Lãi/lỗ | Có cột «Đã nghiệm thu» (1,3 tỷ); lãi thực tế = đã nghiệm thu − đã phát sinh, KHÔNG phải cả hợp đồng | | |
| C-07 | Tổng Giám đốc | Bấm tên công trình trong báo cáo | Mở đúng công trình, xem được từng mã chi phí | | |

## D. Công trường hằng ngày — trên điện thoại

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| D-01 | Chỉ huy trưởng (điện thoại) | Mở công trình | Tab Nhật ký mở sẵn, nút «Chụp ảnh hiện trường» thấy ngay; thanh thao tác nhanh ở đáy | | |
| D-02 | Chỉ huy trưởng (điện thoại) | Chụp 2 ảnh, gõ nội dung, Lưu | Mở camera sau; mục mới có 2 ảnh; bấm ảnh xem cỡ đầy đủ | | |
| D-03 | Chỉ huy trưởng | Gõ nội dung rồi tải lại trang trước khi Lưu | Nội dung còn nguyên (nháp giữ trong phiên) | | |
| D-04 | Chỉ huy trưởng | Thanh thao tác → «Đề nghị vật tư» | Biểu mẫu Mua hàng mở sẵn công trình; bắt buộc ngày cần hàng | | |
| D-05 | Chỉ huy trưởng | Theo dõi đề nghị | Ba đề nghị ở ba bước; ai đang giữ kèm tên; «Chờ N ngày» | | |
| D-06 | Chỉ huy trưởng | Bấm «Thúc» đề nghị xi măng | Báo đã thúc; nút đổi thành giờ thúc lại được; «Đã thúc 1 lần» | | |
| D-07 | Giám đốc Tài chính | Chuông thông báo | Có thông báo «Công trường … thúc đề nghị …», bấm dẫn tới Hộp thư | | |
| D-08 | Mua hàng | Mở đề nghị cốp pha (đã duyệt) | Dòng «Công trường đã thúc» nếu đã thúc; danh sách đề nghị có cột Công trình | | |
| D-09 | Tổng Giám đốc | Khai thời hạn «duyệt đề nghị mua» ở Nền tảng → Thời hạn xử lý | Trên máy chỉ huy trưởng, đề nghị chờ duyệt hiện Hạn xử lý thay cho «Chưa có thời hạn cam kết» | | |
| D-10 | Chỉ huy trưởng | Nghiệm thu → chọn «Nghiệm thu cốt thép trước khi đổ bê tông» | Bốn mục, ba nút chữ mỗi mục, nút chụp ảnh ở mục cần ảnh | | |
| D-11 | Chỉ huy trưởng | Lập biên bản thiếu ảnh mục bắt buộc | Báo mục nào thiếu ảnh, KHÔNG lập biên bản | | |
| D-12 | Chỉ huy trưởng | Có mục «Không đạt» mà trống ô Tồn tại | Báo phải ghi tồn tại | | |
| D-13 | Chỉ huy trưởng | Lập đủ, lưu | Biên bản hiện kết quả từng mục kèm ảnh; không có nút sửa | | |
| D-14 | Chỉ huy trưởng | Cả luồng D-01→D-06 bấm giờ | Dưới 10 phút (ngân sách thao tác hiện trường, PRD Mục 6) | | |
| D-15 | Chỉ huy trưởng (điện thoại) | Thanh thao tác → «Điểm danh» | Tab Điểm danh; câu «chưa liên kết với bảng chấm công» ở đầu tab; nút «Chụp ảnh điểm danh» | | |
| D-16 | Chỉ huy trưởng (điện thoại) | Chụp ảnh, cho phép vị trí, Gửi điểm danh | Ảnh có dải «Điểm danh · giờ» + thứ ngày, công trình, tên, vị trí; danh sách có lượt mới, «Xem vị trí trên bản đồ» mở đúng chỗ | | |
| D-17 | Chỉ huy trưởng (điện thoại) | Từ chối quyền vị trí rồi điểm danh | Vẫn gửi được; ảnh và danh sách ghi «Không có vị trí — điện thoại không cho phép lấy vị trí» | | |
| D-18 | Chỉ huy trưởng | Tìm nút sửa / xoá một lượt điểm danh | Không có | | |
| D-19 | Trưởng phòng Thi công | Mở tab Điểm danh của công trình | Thấy lượt điểm danh của chỉ huy trưởng, nhóm theo ngày, giờ là giờ máy chủ | | |

## E. Mua hàng và Kho

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| E-01 | Mua hàng | Mở đề nghị thép hình (hoàn thành) | Hai báo giá, so sánh; chọn nhà giá cao hơn có ghi căn cứ; đơn hàng; giao nhận | | |
| E-02 | Kho | Tồn kho kho công trình Phố Nối A | Thép H200: nhập 18.000 kg, xuất 12.000 kg, còn 6.000 kg | | |
| E-03 | Kho | Chứng từ kho | Phiếu nhập truy về phiếu giao nhận và đơn hàng | | |

## F. Kế toán và phê duyệt

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| F-01 | Kế toán | Đề nghị thanh toán | Đợt 1 tổ đội Hùng Cường đã chi; đợt 2 đang ở bước Tài chính kiểm | | |
| F-02 | Giám đốc Tài chính | Duyệt bước kiểm đợt 2 | Hồ sơ sang Hộp thư phê duyệt đúng hạn mức | | |
| F-03 | Kế toán | Công nợ phải thu | Hưng Thịnh: 1,3 tỷ, đã thu 800 triệu, còn 500 triệu | | |
| F-04 | Tổng Giám đốc | Hộp thư Phê duyệt | Có hồ sơ chờ; duyệt xong hồ sơ biến khỏi hộp thư | | |
| F-05 | Người lập đề nghị | Tự duyệt hồ sơ của mình | Không có nút / bị từ chối | | |

## G. NVS — cho thuê giàn giáo

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| G-01 | Kho / Xưởng | Tài sản cho thuê | Hai hợp đồng đang thuê (Đông Đô, Thành An) | | |
| G-02 | Kho | Mở hợp đồng Đông Đô | Đã trả một phần; doanh thu theo ngày thuê của đợt trả; số còn đang thuê đúng | | |
| G-03 | Kho | Thu hồi thêm một đợt | Ghi đạt / hư hỏng / mất; không trả vượt số đang thuê | | |
| G-04 | Kho | Giàn giáo | Lô tại kho, lô đang cho thuê, lô hỏng chờ sửa tách riêng | | |

## H. Dashboard và báo cáo

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| H-01 | Tổng Giám đốc | Dashboard | Số liệu khác 0 ở cơ hội, hợp đồng, dòng tiền, công nợ, giàn giáo cho thuê | | |
| H-02 | Tổng Giám đốc | Bấm từng thẻ | Mở đúng danh sách đã lọc | | |
| H-03 | Tổng Giám đốc | Chỉ số chưa có dữ liệu | Hiện «Chưa đủ dữ liệu», KHÔNG hiện 0 | | |
| H-04 | Tổng Giám đốc | Lãi/lỗ → In / Xuất tệp | Bản in và tệp CSV có cột Đã nghiệm thu, số khớp màn hình | | |

## I. AI Design (bổ sung Thứ 7, sau khi Haan bàn giao)

| Mã | Vai trò | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| I-01 | Thiết kế NVO | Mở hồ sơ AI Design dựng sẵn | Mặt bằng từng tầng, mặt đứng, phối cảnh hiện đủ | | |
| I-02 | Thiết kế NVO | Tải tờ DXF | Mở được bằng phần mềm CAD | | |
| I-03 | Thiết kế NVO | Chạy một lượt thật | Tiến độ hiện từng bước; hỏng hoặc quá 3 phút thì chuyển sang hồ sơ dựng sẵn | | |
| I-04 | Bất kỳ | Chuỗi «(demo)» hay «Test» trong tên hồ sơ | Không còn | | |

## J. Phi chức năng

| Mã | Thao tác | Kỳ vọng | Kết quả | Ghi chú |
| --- | --- | --- | --- | --- |
| J-01 | Chrome đặt ngôn ngữ **tiếng Anh**, mở các biểu mẫu, bỏ trống ô bắt buộc, chọn ngày | Mọi chữ trình duyệt tự sinh vẫn là tiếng Việt | | |
| J-02 | Điện thoại 390 px: đi qua D-01 → D-13 | Không tràn ngang; vùng bấm ≥ 40 px; không thao tác nào cần phóng to | | |
| J-03 | Tắt mạng giữa lúc ghi nhật ký, bật lại | Không mất nội dung đã gõ; báo lỗi tiếng Việt khi lưu không được | | |
| J-04 | Tải trang lần đầu trên 4G | Khung hiện dưới 3 giây, dữ liệu hiện bằng khung xám chứ không vòng xoay toàn màn hình | | |
| J-05 | Ảnh điện thoại 6–8 MB | Tải lên được; nếu quá 20 MB thì báo rõ | | |
| J-06 | Hai người cùng thúc một đề nghị trong 4 giờ | Người thứ hai được báo giờ thúc lại được | | |

---

**Tổng kết:** số ca Đạt / Không đạt / Bỏ qua, danh sách lỗi đã sửa, lỗi còn mở và cách tránh trong buổi
demo — ghi vào cuối tệp này sau lượt chạy.
