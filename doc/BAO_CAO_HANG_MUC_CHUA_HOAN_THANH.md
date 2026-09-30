# Báo cáo hạng mục chưa hoàn thành

Đối chiếu hai tài liệu `doc/architecture/SAD.md` và `doc/architecture/SDD.md` với mã nguồn,
ngày rà **30/09/2026**.

**Phạm vi.** Chỉ những gì hai tài liệu trên khẳng định hoặc đánh dấu còn mở. **Không** bao gồm tiến
độ xây dựng 12 phân hệ nghiệp vụ — chỗ đó là việc của `BUILD_PLAN.md`, hai tài liệu kiến trúc cố ý
không mô tả phần nào đã viết xong.

**Cách kiểm.** Mỗi mục dưới đây đều được đối chiếu với mã nguồn, cấu hình hoặc migration; cột *Đã
kiểm bằng gì* ghi lại căn cứ để người đọc tự kiểm lại được. Mục nào chưa kiểm được bằng mã thì nói rõ.

Ba nhóm, vì ba nhóm này do ba người khác nhau gỡ:

| Nhóm | Ai gỡ | Số mục |
| --- | --- | --- |
| **A. Chờ NVG quyết** | Ban Giám đốc / Haan — không phải việc kỹ thuật | 11 |
| **B. Đã thiết kế, chưa dựng** | Đội triển khai | 9 |
| **C. Việc triển khai và vận hành** | Haan, trước khi chạy thật | 6 |

---

## A. Chờ NVG quyết

Đây là mười một mục `TBD` của SAD Mục 15. Chúng **không** phải việc bỏ sót: hệ thống cố ý để rỗng thay
vì nạp số tạm, vì một con số tạm đi vào chứng từ là một con số sai không ai biết.

**Không mục nào trong nhóm này được viết cứng vào mã.** Mục nào là con số (TBD-1, TBD-10) thì
quản trị viên nhập trên màn hình của phân hệ Nền tảng khi đã có quyết định; các mục còn lại là lựa
chọn nhà cung cấp hoặc quy chế, không phải con số.

| Mã | Hạng mục | Chặn việc gì | Hiện trạng |
| --- | --- | --- | --- |
| TBD-1 | Thời hạn cam kết phản hồi của từng phòng ban | Cảnh báo quá hạn của công trường không có căn cứ chạy | **Không cần viết thêm mã.** Quản trị viên nhập trên màn hình *Nền tảng → Thời hạn xử lý*; chỉ TGĐ, CFO, BGĐ, Quản trị được sửa. Đặt được theo vai trò, theo pháp nhân hoặc dòng chung. Bảng cố ý để rỗng cho tới khi Ban Giám đốc chốt số. Trùng rủi ro R-2 |
| TBD-2 | Bộ mã vật tư, công trình, nhà cung cấp | Nhập liệu thật | **Đã chốt và đã áp 30/09/2026** — `doc/BO_MA.md`, migration `0132`. Khách hàng `KH-00001`, nhà cung cấp `NCC-00001`, tài sản `NVC-TS-2026-0001` nay do CSDL cấp. Bộ kiểm thử liên quan đã xanh |
| TBD-3 | Phần mềm kế toán chính thức để tích hợp | Xuất dữ liệu sang kế toán | Một trong hai hệ thống ngoài còn `TBD` trên sơ đồ ngữ cảnh |
| TBD-4 | Công thức lương | Tính lương từ bảng công | Chưa quyết |
| TBD-5 | Ngoại tuyến thật cho Kho, hay chỉ trực tuyến | Thiết kế đồng bộ dữ liệu | Chưa quyết — xem B-9 |
| TBD-6 | Dịch vụ thư điện tử | Nhắc việc qua thư; kéo theo cả hàng đợi gửi hàng loạt | Hệ thống ngoài thứ hai còn `TBD` — xem B-8 |
| TBD-7 | Tên miền chính thức, đầu mối hỗ trợ kỹ thuật | Nội dung thông báo lỗi, cấu hình nguồn được phép gọi | Chưa quyết |
| TBD-8 | Mô hình AI chính thức sau thử nghiệm | Chốt hạn mức, chi phí và điều khoản dữ liệu | Đang thử nhiều tuyến song song trong `config/models.yaml` |
| TBD-9 | Gói dịch vụ mạng biên có hỗ trợ container | Số hoá hồ sơ cũ trên bản vận hành | Cần nâng gói — xem B-3 |
| TBD-10 | Mức trần chi tiêu AI mỗi tháng cho từng pháp nhân, và ngưỡng cảnh báo | Bật ngắt mạch chi phí | Haan đã chốt **sẽ có trần**. Con số sẽ do quản trị viên nhập trên màn hình *Tham số hệ thống*, không nằm trong mã; nhưng cơ chế đọc số đó và chặn lượt chạy **chưa dựng** — xem B-1. Cố ý chưa áp trong lúc phát triển và chạy thử |
| TBD-11 | Nâng gói nền dữ liệu có sao lưu, tạo môi trường vận hành | Nhập dòng dữ liệu thật đầu tiên | Tách ra từ C-1. Tài khoản Supabase đã dùng hết 2 project miễn phí; gói miễn phí không sao lưu và tự dừng sau 7 ngày không dùng |

---

## B. Đã thiết kế, chưa dựng

Tài liệu đã mô tả cách làm; mã nguồn chưa có.

| Mã | Hạng mục | Tài liệu | Đã kiểm bằng gì | Mức |
| --- | --- | --- | --- | --- |
| **B-1** | **Ngắt mạch theo chi phí AI** — cộng chi phí trong kỳ theo pháp nhân, cảnh báo ở ngưỡng, chặn lượt chạy mới khi chạm trần | SAD 11 · SDD 8.8 | Chi phí từng lượt **đã ghi đủ** (`design_ai_call.cost_usd`) và hiện được trên sổ dùng AI, nhưng không có chỗ nào cộng tổng và không có cổng chặn nào đọc tổng đó | Cao |
| **B-2** | **Hạn mức số lượt gọi mỗi người và mỗi dự án** | SAD 9.4, dòng "Hạn mức và ngắt mạch" | Không tìm thấy bất kỳ bộ đếm hay cổng chặn theo số lượt nào trong `workers/src/design/` | Cao |
| **B-3** | **Container số hoá chạy trên mạng biên**, gọi bằng ràng buộc nội bộ | SAD 10 · SDD 8.5, 8.7 | Chỉ có adapter HTTP gọi địa chỉ cấu hình được; khối khai báo container trong `workers/wrangler.jsonc` vẫn là chú thích. Chỗ phải sửa đúng một hàm dựng | Trung bình — phụ thuộc TBD-9 |
| **B-4** | **Tệp CAD đẩy thẳng lên kho đối tượng** thay vì đi qua Worker dưới dạng biểu mẫu nhiều phần | SDD 8.7 | Worker hiện giữ cả tệp trong bộ nhớ nên có hạn kích thước; đích đã chốt nhưng chưa dựng | Trung bình |
| **B-5** | **Mã theo dấu xuyên hệ thống** và **nơi thu lỗi phía trình duyệt** | SDD 5.4 | `web/src` không có thành phần bắt lỗi toàn cục, không có `window.onerror`, không có mã theo dấu nào đi kèm yêu cầu | Cao — chặn việc điều tra sự cố |
| **B-6** | **Sao lưu nhật ký nền tảng ra ngoài thời hạn gói dịch vụ** | SDD 5.4 | Nhật ký bật ở cả hai Worker nhưng không có đường xuất ra kho ngoài | Trung bình |
| **B-7** | **Kiểm thử đầu–cuối cho các luồng nghiệp vụ chính** | SDD 10.2 | `web/e2e/` hiện có **đúng một** tệp kịch bản, cho phần trình diễn Thiết kế. Bốn luồng nghiệp vụ của Giai đoạn 2 chưa có kịch bản nào | Cao |
| **B-8** | **Hàng đợi cho gửi thư hàng loạt** | SAD 5 | Cố ý chưa thêm; mở khi có TBD-6 | Thấp — phụ thuộc TBD-6 |
| **B-9** | **Ngoại tuyến thật cho Kho và công trường** | SAD 11 | Thư viện lưu trữ phía trình duyệt chưa được cài vào dự án. Hiện chỉ có khử ghi trùng khi đồng bộ lại | Thấp — phụ thuộc TBD-5 |

---

## C. Việc triển khai và vận hành

Không phải việc viết mã, nhưng **chặn việc chạy thật**.

| Mã | Hạng mục | Tài liệu | Hiện trạng | Mức |
| --- | --- | --- | --- | --- |
| **C-1** | **Mỗi môi trường một cơ sở dữ liệu riêng** | SAD 10, quy tắc triển khai bắt buộc số 1 | **Đã làm 30/09/2026.** Phát triển chạy trên Supabase tại máy; bản chạy thử / demo giữ project cloud cùng toàn bộ dữ liệu. Bộ kiểm thử `db/` từ chối chạy trên bản demo (cưỡng chế trong mã, có phép thử). Dựng CSDL từ đầu lần đầu đã lộ ba thứ trước đây chỉ có nhờ sửa tay trên cloud — đã đưa vào mã. **Môi trường vận hành chưa có** — tách thành TBD-11 | Xong phần tách; vận hành chờ go-live |
| **C-2** | **Khoá API mô hình riêng theo từng môi trường**, xoay khoá định kỳ | SAD 9.4 | **Đã mở khoá** nhờ C-1, chưa làm: máy phát triển và Worker của bản demo vẫn dùng chung khoá mô hình | Cao |
| **C-3** | **Diễn tập phục hồi từ sao lưu** | SAD 11 | Tài liệu ghi rõ đây là **điều kiện trước khi vận hành thật**; chưa có ghi nhận nào về một lần diễn tập | Cao |
| **C-4** | **Chặn người tự duyệt hồ sơ của mình** | SAD 14, R-3 | Hướng xử lý đã chốt là **bằng cấu hình, không bằng mã**; chưa đặt cấu hình | Trung bình |
| **C-5** | **Ma trận quyền không có chiều pháp nhân** | SAD 14, R-1 | Đã ghi nhận, cố ý chưa xử lý. Hệ quả hiện tại: nhân sự kinh doanh của một pháp nhân dùng chung vai trò với khối khác | Thấp — theo dõi |
| **C-6** | **Phụ thuộc một nhà cung cấp nền dữ liệu** | SAD 14, R-4 | Chấp nhận ở giai đoạn trình diễn; tài liệu hẹn **soát lại trước vận hành thật** | Thấp — theo dõi |

---

## Thứ tự đề nghị

Nếu phải xếp một thứ tự, ba việc đầu tiên nên là:

1. ~~**C-1 tách môi trường.**~~ **Đã làm 30/09/2026.** Việc kế tiếp nó mở khoá là C-2.
2. **B-5 mã theo dấu và nơi thu lỗi.** Chạy thật mà không có hai thứ này thì mọi sự cố đều phải điều tra bằng lời kể của người dùng.
3. **B-1 và B-2 ngắt mạch AI.** Hai mục này cùng một chỗ sửa; làm một lần. Chừng nào còn thử nghiệm mô hình thì đây là rủi ro tiền bạc đang mở.

**B-7 kiểm thử đầu–cuối** không nằm trong ba việc đầu, nhưng nó là thứ duy nhất trong danh sách sẽ
**đắt dần theo thời gian**: càng nhiều luồng nghiệp vụ được dựng xong mà chưa có kịch bản canh, giá
viết bù về sau càng cao.

---

## Ghi chú về cách đọc

- Danh sách này **không phải bản kiểm phủ hết mã nguồn**. Nó trả lời đúng một câu hỏi: hai tài liệu kiến trúc hứa những gì mà mã nguồn chưa có.
- Mục nào đánh dấu *cố ý* là quyết định đã cân nhắc, không phải việc quên: tham số để rỗng, ngoại tuyến chưa làm, hàng đợi chưa thêm.
- Câu hỏi nghiệp vụ còn treo, đầy đủ hơn danh sách nhóm A: `doc/VAN_DE_CON_MO.md`.

## Ghi chú về TBD-2 — kiểm thử

Đã xanh khi chạy từng tệp một: `bo-ma` 6/6, `search` 8/8, `kt` 34/34, `rls` 129/129, `bc` 9/9,
`sx` 13/13, `ns` 41/41, `mh` 41/41; cùng `codes.test.ts` 13/13 và toàn bộ bài kiểm giao diện
490/490.

Chạy **song song** sáu tệp `db/` trên cùng một CSDL thì đỏ hàng loạt; đó là do các tệp giẫm dữ liệu
của nhau, không phải lỗi mã. Riêng bài «KHÔNG ký nhận được hàng mua cho văn phòng» của `mh` đỏ hai lần
khi chạy riêng rồi xanh ở lần thứ ba — bài này **chập chờn**, không liên quan tới bộ mã, nên được theo
dõi riêng.
