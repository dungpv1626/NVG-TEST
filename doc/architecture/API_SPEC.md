# API Specification (Đặc tả Giao diện Lập trình)

Hệ thống Quản trị Nhà Việt Group

| | |
| --- | --- |
| **Phiên bản** | 1.0 |
| **Ngày soạn** | 28/09/2026 |
| **Trạng thái** | Bản nháp — chờ Haan duyệt |
| **Người soạn** | Đội triển khai — vai trò Kiến trúc sư phần mềm |
| **Phạm vi** | Quy ước gọi dữ liệu qua nền tảng dữ liệu, và đặc tả các endpoint tự viết |

> Tài liệu này là **hợp đồng giữa giao diện và máy chủ**: gọi cái gì, gửi gì, nhận gì, lỗi ra sao.
> Hệ thống có **hai đường dữ liệu** — phần lớn nghiệp vụ đi thẳng qua nền tảng dữ liệu, chỉ phân hệ
> Thiết kế AI có endpoint tự viết. Cấu trúc bảng xem tài liệu ERD; cách hiện thực phía gọi xem tài
> liệu Thiết kế chi tiết.

---

## 0. Chú giải

| Thuật ngữ | Nghĩa |
| --- | --- |
| Endpoint | Một địa chỉ máy chủ nhận yêu cầu, gồm phương thức và đường dẫn |
| REST | Kiểu giao tiếp dùng phương thức HTTP trên tài nguyên có địa chỉ |
| PostgREST | Cổng REST mà nền tảng dữ liệu tự sinh từ cơ sở dữ liệu |
| JWT | Thẻ xác thực người dùng, gắn vào mỗi yêu cầu (JSON Web Token) |
| Khoá ẩn danh | Khoá công khai giới hạn, giao diện dùng; tự nó không cho quyền gì |
| `service_role` | Khoá đặc quyền vượt phân quyền; **chỉ tồn tại trong Worker** |
| RLS | Phân quyền theo hàng trong cơ sở dữ liệu |
| CORS | Cơ chế trình duyệt cho phép trang ở nguồn này gọi máy chủ ở nguồn khác |
| Hợp đồng dữ liệu | Bản mô tả hình dạng dữ liệu bắt buộc ở một ranh giới (JSON Schema) |
| Dấu vân tay hợp đồng | Mã băm của toàn bộ bộ hợp đồng, để phát hiện hai bên lệch phiên bản |
| Artifact | Kết quả bất biến của một bước Thiết kế AI |
| Bộ môn | Kiến trúc, kết cấu, hoặc điện nước |

---

## 1. Hai đường dữ liệu

![Kiến trúc tổng thể](diagrams/high-level-architecture.png)

**Hình 1.** Đường mặc định và đường ngoại lệ.

| Đường | Dùng cho | Xác thực | Phân quyền |
| --- | --- | --- | --- |
| **Nền tảng dữ liệu (PostgREST)** | Toàn bộ nghiệp vụ thường của 12 phân hệ | Thẻ JWT của người dùng + khoá ẩn danh | RLS trong cơ sở dữ liệu |
| **Worker tự viết** | Chỉ `/design` (Thiết kế AI) và tác vụ nền theo lịch | Thẻ JWT của người dùng | RLS cộng kiểm năng lực theo bộ môn |

**Quy tắc chọn đường.** Đọc ghi một hoặc vài bảng và quyền diễn đạt được bằng RLS ⇒ gọi thẳng nền
tảng dữ liệu, **không viết endpoint**. Chỉ viết endpoint khi gọi dịch vụ ngoài, cần giữ khoá, ghi
nhiều bảng phải toàn vẹn, hoặc quy tắc phức tạp hơn RLS.

---

## 2. Gọi dữ liệu qua nền tảng dữ liệu

### 2.1 Địa chỉ và xác thực

| Hạng mục | Quy ước |
| --- | --- |
| Địa chỉ gốc | Lấy từ biến cấu hình lúc dựng; bản dựng dừng nếu biến rỗng hoặc trỏ về máy cục bộ |
| Khoá | Giao diện **chỉ dùng khoá ẩn danh**. Khoá đặc quyền không bao giờ có mặt trong mã giao diện |
| Thẻ người dùng | Thư viện khách tự gắn thẻ JWT sau khi đăng nhập vào mọi yêu cầu |
| Hệ quả | Mọi truy vấn chạy **dưới danh tính người gọi**, nên RLS luôn áp dụng |

### 2.2 Quy ước truy vấn

| Việc | Quy ước |
| --- | --- |
| Chọn cột | Khai danh sách cột tường minh, không lấy tất cả |
| Lấy kèm bảng liên quan | **Bắt buộc chỉ đích danh khoá ngoại** khi bảng đích có nhiều đường liên kết |
| Lọc theo pháp nhân | Thêm điều kiện pháp nhân khi ở chế độ một pháp nhân; **bỏ hẳn điều kiện** ở chế độ toàn nhóm |
| Sắp xếp, phân trang | Dùng tham số sắp xếp và khoảng bản ghi của PostgREST |
| Ghi có quy trình | Đổi trạng thái, phiên bản, số hiệu chứng từ thì **gọi hàm trong cơ sở dữ liệu**, không ghi thẳng cột |

> **Bẫy đã biết.** Nếu lấy kèm một bảng mà không chỉ đích danh khoá ngoại, máy chủ trả mã «nhiều
> lựa chọn» (300). Thư viện khách **không coi đó là lỗi**, nên màn hình nhận mảng rỗng và hiện
> «chưa có dữ liệu» — sai câm, không có thông báo nào. Có kiểm thử đọc mã nguồn canh việc này.

### 2.3 Lỗi và cách dịch sang ngôn ngữ người dùng

| Mã | Nghĩa kỹ thuật | Hiển thị cho người dùng |
| --- | --- | --- |
| `23505` | Trùng khoá duy nhất | Giá trị đã tồn tại, nêu rõ trường nào |
| `23503` | Vi phạm khoá ngoại | Bản ghi liên quan không tồn tại hoặc đã bị xoá |
| `42501` | Không đủ quyền | Vượt quyền, kèm **ai xử lý được** |
| `PGRST116` | Truy vấn một bản ghi nhưng không có dòng nào | Thường là **RLS đã lọc mất**, không phải bản ghi không tồn tại |
| 300 | Lấy kèm mơ hồ | Lỗi lập trình — phải sửa truy vấn, không hiện cho người dùng |

**Không bao giờ hiển thị mã lỗi kỹ thuật hoặc vết gọi hàm.** Chi tiết kỹ thuật chỉ ghi nhật ký.

---

## 3. Endpoint tự viết — phân hệ Thiết kế AI

Toàn bộ endpoint tự viết nằm dưới tiền tố `/design`. Ngoài nhóm này, hệ thống **không có** endpoint
nghiệp vụ tự viết nào khác.

### 3.1 Quy ước chung của nhóm

| Hạng mục | Quy ước |
| --- | --- |
| Định dạng | JSON cho cả yêu cầu và phản hồi, trừ các endpoint trả tệp |
| Xác thực | Tiêu đề `Authorization: Bearer <thẻ JWT>`; thiếu thẻ trả **401** |
| Danh tính khi chạy | Worker chạy truy vấn **dưới phiên người gọi**, nên RLS vẫn áp dụng |
| Kiểm quyền bộ môn | Trước mỗi lượt đọc và ghi kết quả thiết kế, Worker hỏi cơ sở dữ liệu bằng **đúng hàm mà chính sách dùng** |
| Kiểm dữ liệu | Dữ liệu vào và ra đều kiểm theo hợp đồng ở Mục 4 |
| Nguồn được gọi | Danh sách nguồn cho phép là **dữ liệu cấu hình**, không dùng dấu sao |

### 3.2 Mã lỗi

| Mã | Khi nào | Ghi chú |
| --- | --- | --- |
| 200 | Thành công | |
| 400 | Dữ liệu vào không khớp hợp đồng | Kèm danh sách chỗ sai |
| 401 | Thiếu hoặc sai thẻ xác thực | «Chưa đăng nhập» |
| 403 | Không đủ quyền **ghi** ở bộ môn đó | |
| 404 | Không đủ quyền **đọc**, hoặc hồ sơ không tồn tại | Cố ý gộp hai trường hợp: **không lộ việc hồ sơ có tồn tại** |
| 409 | Xung đột phiên bản kết quả | |
| 5xx | Lỗi máy chủ hoặc dịch vụ ngoài | Luồng nghiệp vụ chính không được phụ thuộc |

### 3.3 Nhóm nền — hồ sơ, đầu bài, thửa đất

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | `/design/health` | Kiểm tra sống; trả dấu vân tay hợp đồng đang chạy |
| POST | `/design/brief/form` | Đọc hoặc ghi cấu hình biểu mẫu đầu bài (quản trị viên sửa nhãn, gợi ý, thứ tự, ẩn câu hỏi) |
| POST | `/design/brief/confirm` | Chốt đầu bài, đúc thành kết quả bất biến |
| POST | `/design/site/extract-boundary` | Đọc ảnh giấy tờ đất, trả ranh thửa có cấu trúc |
| POST | `/design/kb/digitise` | Nạp bản vẽ cũ, khởi động quy trình số hoá nền |
| POST | `/design/kb/retrieve` | Lấy hồ sơ tham chiếu để đưa vào câu nhắc mô hình |
| POST | `/design/kb/annotate` | Ghi chú, gắn nhãn cho bản ghi tham chiếu |

### 3.4 Nhóm mặt bằng

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | `/design/ai/models` | Danh mục mô hình và tuyến khả dụng |
| GET | `/design/ai/state/:duAn` | Trạng thái tổng hợp của một dự án |
| POST | `/design/ai/program` | Sinh chương trình không gian (chạy đồng bộ) |
| POST | `/design/ai/plan/runs` | Khởi động lượt sinh mặt bằng (chạy nền, nhiều phương án) |
| GET | `/design/ai/runs/:id` | Theo dõi tiến độ một lượt chạy |
| POST | `/design/ai/runs/:id/cancel` | Huỷ lượt chạy |
| POST | `/design/ai/plan/edit` | Áp thao tác sửa của kỹ sư lên cây chia đã lưu |
| POST | `/design/ai/plan/choose` | Chọn một phương án làm bản hiệu lực |
| POST | `/design/ai/plan/hide` | Ẩn một phương án |
| GET | `/design/ai/plan/:duAn/review` | Bảng chấm chất lượng phương án |
| GET | `/design/ai/plan/:duAn/sheet` | Tờ bản vẽ mặt bằng dạng vector |
| GET | `/design/ai/plan/:duAn/dxf` | Xuất tệp bản vẽ mở được bằng phần mềm CAD |
| GET | `/design/ai/plan/:duAn/anchor` | Ảnh neo dùng làm gốc cho mô hình ảnh |
| POST · GET | `/design/ai/plan/:duAn/sheet-image` | Sinh và đọc tờ mặt bằng có nội thất |
| GET | `/design/ai/calls/:duAn/prompts` | Danh sách lượt gọi mô hình của dự án |
| GET | `/design/ai/calls/:duAn/:luot/prompt` | Nội dung câu nhắc của một lượt gọi |

### 3.5 Nhóm mặt đứng

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| GET | `/design/ai/facade/vocabulary` | Từ vựng mặt đứng cho phép (mái, vật liệu, màu, cổng, rào) |
| GET · POST | `/design/ai/facade/brief/:duAn` | Phiếu yêu cầu mặt đứng do kỹ sư điền |
| POST | `/design/ai/facade/runs` | Khởi động lượt dựng mặt đứng |
| GET | `/design/ai/facade/:duAn` | Các phương án mặt đứng của dự án |
| POST | `/design/ai/facade/choose` · `/hide` | Chọn hoặc ẩn một phương án |
| POST | `/design/ai/facade/review/:duAn` | Kỹ sư chấm lại theo bảng tiêu chí |
| GET | `/design/ai/facade/:duAn/sheet` · `/dxf` · `/anchor` | Tờ vector, tệp bản vẽ, ảnh neo |
| POST · GET | `/design/ai/facade/:duAn/image` | Sinh và đọc ảnh mặt đứng có vật liệu |

### 3.6 Nhóm phối cảnh

| Phương thức | Đường dẫn | Mục đích |
| --- | --- | --- |
| POST | `/design/ai/perspective/runs` | Khởi động lượt dựng ảnh phối cảnh |
| GET | `/design/ai/perspective/:duAn` | Bộ ảnh phối cảnh của dự án |
| GET | `/design/ai/perspective/:duAn/view/:goc` | Một góc nhìn cụ thể |
| GET | `/design/ai/perspective/:duAn/roof-anchor` | Ảnh neo phần mái |
| POST | `/design/ai/perspective/choose` · `/hide` · `/redraw` | Chọn, ẩn, vẽ lại |

### 3.7 Tiêu đề phản hồi đặc thù

Các tiêu đề dưới đây phải được khai trong danh sách tiêu đề cho phép đọc, nếu không trình duyệt
không đọc được chúng.

| Tiêu đề | Ý nghĩa |
| --- | --- |
| `X-NVG-Contracts` | Dấu vân tay bộ hợp đồng mà máy chủ đang chạy |
| `Content-Disposition` | Tên tệp khi tải bản vẽ |
| `X-Sheet-*` · `X-Anchor-*` | Số đo tờ vẽ và ảnh neo, để giao diện dựng đúng tỉ lệ |

---

## 4. Hợp đồng dữ liệu

### 4.1 Cách vận hành

- Hợp đồng viết tay bằng JSON Schema trong `contracts/` — **một nơi duy nhất**.
- Một lệnh sinh ra bộ kiểm cho phía TypeScript, đặt trong gói dùng chung; **bản sinh không sửa tay**, và máy kiểm đối chiếu bản sinh với bản đã lưu.
- Phía Python đọc **thẳng cùng tệp JSON Schema**, không sinh mã riêng — nên không có hai bản định nghĩa.
- Cả giao diện và Worker nhúng **dấu vân tay** của bộ hợp đồng. Worker trả trong tiêu đề phản hồi; giao diện đối chiếu và hiện cảnh báo khi lệch. Kiểm nhanh bằng endpoint kiểm tra sống.

### 4.2 Danh mục hợp đồng

| Hợp đồng | Mô tả |
| --- | --- |
| `design-brief` | Đầu bài thiết kế đã chốt |
| `ai-brief-digest` | Bản đầu bài và khảo sát **đã ẩn danh** để gửi mô hình |
| `ai-space-program` · `ai-space-program-proposal` | Chương trình không gian đã lưu và bản do mô hình đề xuất |
| `ai-house-intent` | Ý định cả nhà do mô hình khai |
| `ai-plan-intent` | Ý định bố cục một tầng |
| `ai-plan-tree` | Cây chia không gian một tầng |
| `ai-plan-rooms` | Mặt bằng dạng phòng và lỗ mở |
| `ai-floor-plan` · `ai-floor-plan-proposal` | Mặt bằng đầy đủ và từng phương án đề xuất |
| `ai-plan-edit` | Thao tác sửa mặt bằng của kỹ sư — **tập đóng** |
| `ai-plan-sheet-image` | Tờ mặt bằng có nội thất |
| `ai-facade-brief` | Phiếu yêu cầu mặt đứng |
| `ai-facade-concept` · `ai-facade-proposal` | Ý tưởng và đề xuất mặt đứng |
| `ai-facade-image` | Ảnh mặt đứng có vật liệu |
| `ai-facade-review` | Kết quả kỹ sư chấm lại mặt đứng |
| `ai-image-set` | Bộ ảnh phối cảnh của cùng một ngôi nhà |
| `cad-extraction` | Kết quả trích một bản vẽ cũ |
| `kb-record` | Một bộ hồ sơ công trình cũ đã số hoá |
| `site-boundary-extraction` | Ranh thửa đất đọc từ giấy tờ |

**Quy tắc bắt buộc:** thêm một ranh giới mới giữa hai môi trường chạy thì **phải có hợp đồng trước**,
không truyền dữ liệu tự do rồi chuẩn hoá sau.

---

## 5. Tác vụ nền theo lịch

Không phải endpoint gọi từ giao diện, nhưng cùng nằm trên Worker.

| Hạng mục | Thiết kế |
| --- | --- |
| Kích hoạt | Bộ hẹn giờ của nền tảng, lịch khai trong cấu hình Worker |
| Việc của Worker | Gọi lần lượt các hàm quét trong cơ sở dữ liệu; **không chứa lô-gic nghiệp vụ** |
| Nội dung quét | Nhắc hạn giấy tờ, nhắc công nợ, nhắc hồ sơ chờ duyệt quá hạn |
| Ngoại lệ | Cảnh báo vượt ngân sách phát ngay khi ghi dữ liệu, không chờ quét |
| Thêm tác vụ | Viết hàm trong migration, khai tên hàm vào danh sách quét, khai lịch trong cấu hình |

---

## 6. Bảo mật khi gọi dịch vụ ngoài

Tóm tắt; quy tắc đầy đủ ở mục Bảo mật của tài liệu Kiến trúc.

- Khoá của nhà cung cấp mô hình **chỉ nằm trong kho bí mật của Worker**; không bao giờ đặt vào biến cấu hình của giao diện, vì biến đó bị đóng cứng vào gói tải về trình duyệt.
- Trình duyệt **không bao giờ gọi thẳng** nhà cung cấp mô hình; mọi lượt gọi đi qua Worker.
- Dữ liệu **ẩn danh trước khi gửi**; chỉ gửi phần cần cho phép tính.
- Ghi nhật ký mỗi lượt gọi (ai gọi, mô hình nào, chi phí); **không bao giờ ghi khoá vào nhật ký**.
- Có trần chi phí và ngắt mạch; mô hình hỏng hoặc hết hạn mức **không được chặn luồng nghiệp vụ chính**.
- Dữ liệu mô hình trả về là **đầu vào không tin cậy**: kiểm theo hợp đồng, thoát ký tự trước khi dựng bản vẽ hay trang.
