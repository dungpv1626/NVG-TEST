# Software Architecture Document (Tài liệu Kiến trúc Phần mềm)

Hệ thống Quản trị Nhà Việt Group

| | |
| --- | --- |
| **Phiên bản** | 2.0 |
| **Ngày soạn** | 27/09/2026 |
| **Trạng thái** | Bản nháp — chờ Haan duyệt |
| **Người soạn** | Đội triển khai — vai trò Kiến trúc sư phần mềm |
| **Phạm vi** | Toàn hệ thống: 12 phân hệ nghiệp vụ và phân hệ Thiết kế AI |

> Tài liệu này mô tả **kiến trúc sẽ xây**: hệ thống gồm những phần nào, các phần nối nhau ra sao,
> dữ liệu đi đường nào, quyết định kiến trúc nào đã chốt và vì sao. Đây là tài liệu thiết kế, không
> phải báo cáo tiến độ — không mô tả phần nào đã viết xong. Phần chưa quyết đánh dấu `TBD`; phần
> suy luận chưa ai xác nhận đánh dấu **Giả định**. Thuật ngữ chuyên ngành giải nghĩa ở Phụ lục A.

---

## 1. Executive Summary (Tóm tắt cho người quyết định)

- Hệ thống quản trị nội bộ cho **ba pháp nhân** — NVC xây dựng công nghiệp, NVO nhà ở dân dụng, NVS giàn giáo — dùng chung một khối Back Office. Thay cho Excel, Word, Zalo và Google Drive.
- **12 phân hệ nghiệp vụ trên một cơ sở dữ liệu duy nhất**, cộng phân hệ Thiết kế AI. Nền tảng là phân hệ NEN: pháp nhân, người dùng, quyền, phê duyệt, tham số, nhật ký.
- **Phân quyền nằm trong cơ sở dữ liệu** (RLS của PostgreSQL), không nằm ở giao diện hay tầng API. Đây là quyết định kiến trúc quan trọng nhất — ADR-002.
- **Không có tầng API tự viết cho nghiệp vụ thường**: giao diện gọi thẳng PostgREST. Chỉ phân hệ Thiết kế AI có endpoint riêng trên Cloudflare Workers — ADR-001.
- Chạy trên **mạng biên Cloudflare và Supabase**, không có máy chủ ứng dụng thường trực.

| Quy mô thiết kế | Giá trị |
| --- | --- |
| Phân hệ | 12 nghiệp vụ + 1 Thiết kế AI |
| Pháp nhân | 3 pháp nhân giao dịch + mã tổng hợp toàn nhóm |
| Vai trò người dùng | 14 |
| Nhóm người dùng | 4 — văn phòng, công trường, xưởng, Ban Giám đốc |
| Thực thể dữ liệu | khoảng 100 (chi tiết ở tài liệu ERD) |
| Endpoint tự viết | chỉ `/design` |

---

## 2. Purpose & Scope (Mục đích và phạm vi tài liệu)

**Mục đích.** Cho người mới đọc trong mười phút để biết: hệ thống gồm gì, các phần nối nhau ra
sao, dữ liệu đi đường nào, quyết định nào đã chốt và vì sao.

| Trong phạm vi | Ngoài phạm vi |
| --- | --- |
| Cấu trúc hệ thống, ranh giới, phụ thuộc | Thiết kế chi tiết từng lớp, từng hàm — xem tài liệu SDD |
| Luồng nghiệp vụ trọng yếu | Đặc tả nghiệp vụ đầy đủ — xem tài liệu Yêu cầu sản phẩm |
| Quyết định kiến trúc và lý do | Lược đồ bảng đầy đủ — xem tài liệu ERD |
| Bảo mật, triển khai, khả năng mở rộng | Hợp đồng API chi tiết — xem tài liệu Đặc tả API |

**Người đọc:** kiến trúc sư, người viết mã, người kiểm thử, chủ dự án.

---

## 3. Architecture Drivers (Yếu tố dẫn dắt kiến trúc)

Những ràng buộc nghiệp vụ định hình kiến trúc. Mỗi yếu tố kéo theo một quyết định kỹ thuật.

| Yếu tố dẫn dắt | Yêu cầu đo được | Ảnh hưởng tới kiến trúc |
| --- | --- | --- |
| Dữ liệu nhạy cảm nhiều tầng | Giá vốn, lợi nhuận, lương chỉ tới đúng nhóm vai trò | RLS là hàng rào duy nhất; cột nhạy cảm đi qua hàm có ghi nhật ký |
| Ba pháp nhân, báo cáo hợp nhất | Tách bạch dữ liệu, vẫn cộng được toàn nhóm | Cột pháp nhân trên mọi bảng giao dịch; loại trừ giao dịch nội bộ khi hợp nhất |
| Người dùng ở công trường | Cập nhật hằng ngày dưới 10–20 phút, mục tiêu 5–10 phút | Bố cục di động thật, tách gói theo màn hình, không nhập hai lần |
| Quy chế NVG chưa ban hành | Hạn mức, ngưỡng, thời hạn phải sửa được khi đang chạy | Cấu hình là dữ liệu, không phải mã — ADR-005 |
| Một người triển khai | Sửa một quy tắc chỉ động vào một chỗ | Điều kiện phân quyền gói trong hàm dùng chung |
| Sai quyền phải bắt được bằng máy | Kiểm thử tự động đăng nhập thật bằng từng vai trò | Phân quyền phải kiểm được từ ngoài, không phụ thuộc giao diện |
| Giao diện tiếng Việt 100% | Kể cả chữ do trình duyệt tự sinh | Cấm dùng điều khiển gốc tự sinh chữ; có kiểm thử canh |

---

## 4. System Context (Ngữ cảnh hệ thống)

![System Context](diagrams/system-context.png)

**Hình 1.** Ai dùng hệ thống và hệ thống nối ra đâu.

- Bốn nhóm người dùng, một hệ thống, bốn hệ thống ngoài. Hai trong bốn hệ thống ngoài còn là `TBD`.
- **Supabase** là nền dữ liệu, không phải một dịch vụ ngoài tuỳ chọn: mất Supabase là mất hệ thống.
- **Mô hình AI** chỉ phục vụ phân hệ Thiết kế AI. Mười hai phân hệ nghiệp vụ không gọi AI.
- Dữ liệu gửi ra nhà cung cấp AI phải bỏ danh tính; khung tên bản vẽ mang mã hồ sơ không được gửi.

---

## 5. High-Level Architecture (Kiến trúc tổng thể)

![High-Level Architecture](diagrams/high-level-architecture.png)

**Hình 2.** Bốn tầng và hai đường dữ liệu.

| Tầng | Thành phần | Trách nhiệm |
| --- | --- | --- |
| Giao diện | Worker phục vụ tệp tĩnh | Ứng dụng một trang, cài được lên điện thoại, tách gói theo màn hình |
| Dữ liệu | **PostgREST** | Đường mặc định: đọc, lọc, ghi cho 12 phân hệ |
| Nghiệp vụ đặc thù | Worker API (Hono) | Chỉ `/design`; cổng vào tác vụ nền theo lịch |
| Lưu trữ | PostgreSQL · Auth · Storage | Dữ liệu, danh tính, tệp — kèm RLS |

**Không có API Gateway, không có hàng đợi, không có bộ nhớ đệm riêng.** Quy mô mục tiêu không đòi
hỏi, và mỗi tầng thêm vào là một tầng nữa có thể hỏng. Khi cần gửi thư điện tử hàng loạt thì bổ
sung hàng đợi — `TBD`, chờ chọn dịch vụ thư.

---

## 6. Logical / Component Architecture (Kiến trúc thành phần)

![Component](diagrams/component.png)

**Hình 3.** Các phân hệ và quan hệ phụ thuộc.

| Phân hệ | Trách nhiệm | Nhóm thực thể chính |
| --- | --- | --- |
| **NEN** | Pháp nhân, người dùng, vai trò, quyền, phê duyệt, tham số, nhật ký, thông báo | Nền tảng dùng chung |
| CRM | Khách hàng, cơ hội, báo giá có phiên bản | Khách hàng, cơ hội, báo giá |
| DA | Gói thầu, bóc tách khối lượng, dự toán | Gói thầu, dự toán, đơn giá |
| TK | Hồ sơ thiết kế, phiên bản bản vẽ đa bộ môn | Dự án thiết kế, đầu bài, phiên bản |
| HD | Hợp đồng, điều khoản, phát sinh | Hợp đồng |
| TC | Công trình, ngân sách, nhật ký thi công, nghiệm thu | Công trình, nhật ký, nghiệm thu |
| MH | Đề nghị mua, so sánh báo giá, đơn hàng, giao nhận | Nhà cung cấp, đề nghị, đơn hàng |
| KHO | Tồn kho, nhập xuất, điều chuyển, kiểm kê, tài sản giàn giáo | Kho, vật tư, chứng từ kho |
| KT | Thanh toán, tạm ứng, công nợ, dòng tiền, lãi lỗ | Đề nghị chi, công nợ, kỳ kế toán |
| NS | Nhân sự, hợp đồng lao động, chấm công, tuyển dụng, tài sản cấp phát | Nhân sự, bảng công |
| SX | Lệnh sản xuất, định mức, cho thuê giàn giáo | Lệnh sản xuất, hợp đồng thuê |
| BC | Báo cáo và Dashboard điều hành | **Không có bảng riêng** |
| Thiết kế AI | Thiết kế sơ bộ nhà ở bằng AI | Artifact, đầu bài, nhật ký gọi mô hình |

Hai ranh giới cứng: **BC không có bảng riêng** (một nguồn dữ liệu duy nhất, báo cáo đọc từ nơi
phát sinh), và **Thiết kế AI không ghi vào hồ sơ phát hành** (kết quả AI là đề xuất; người có thẩm
quyền mới phát hành).

---

## 7. Runtime / Critical Flows (Luồng chạy trọng yếu)

### 7.1 Phê duyệt theo hạn mức

![Phê duyệt](diagrams/sequence-phe-duyet.png)

**Hình 4.** Một hồ sơ đi qua Hộp thư Phê duyệt.

Một Hộp thư Phê duyệt cho mọi loại hồ sơ. Hạn mức đọc từ bảng tham số, nên đổi quy chế là đổi dữ
liệu chứ không sửa mã. Hồ sơ vượt hạn mức tự chuyển lên bước cao hơn.

### 7.2 Đọc dữ liệu có phạm vi và có cột nhạy cảm

![Phạm vi hiện trường](diagrams/sequence-rls-hien-truong.png)

**Hình 5.** Cơ sở dữ liệu tự lọc theo phạm vi người dùng.

Giao diện **không gửi điều kiện lọc người dùng**; cơ sở dữ liệu tự lọc. Quên phân công dẫn tới thấy
ít đi — hỏng theo hướng an toàn.

### 7.3 Thiết kế sơ bộ bằng AI

![Thiết kế AI](diagrams/sequence-thiet-ke-ai.png)

**Hình 6.** Luồng duy nhất đi qua Worker và ra dịch vụ ngoài.

Mô hình đề xuất bố cục; **chương trình gán mọi toạ độ**. Kết quả không qua được cổng kiểm thì không
lưu. Dữ liệu gửi mô hình đã bỏ danh tính.

### 7.4 Tác vụ nền

Bộ hẹn giờ gọi Worker, Worker gọi các hàm quét cảnh báo trong cơ sở dữ liệu rồi ghi nhật ký. Điều
kiện nghiệp vụ đặt trong cơ sở dữ liệu để không tồn tại hai bản quy tắc. Cảnh báo vượt ngân sách
không chờ quét — kích hoạt ngay khi ghi dữ liệu.

---

## 8. Data Architecture (Kiến trúc dữ liệu)

![Luồng dữ liệu](diagrams/data-flow.png)

**Hình 7.** Dữ liệu đi từ đâu tới đâu.

**Quy ước áp cho mọi bảng**

| Chủ đề | Quy tắc |
| --- | --- |
| Định danh | Khoá chính là mã định danh duy nhất; tên bảng số nhiều, tiếng Anh, chữ thường nối gạch dưới |
| Phạm vi | Bảng giao dịch có cột pháp nhân; bảng dùng chung thì không |
| Tiền | Số nguyên đồng, **không thập phân**. Số lượng vật lý là số thực có đơn vị |
| Trạng thái | Quy về sáu nhóm chung cho toàn hệ thống |
| Lịch sử | Thay đổi quan trọng ghi sang **bảng lịch sử riêng**, không ghi đè |
| Xoá | Xoá mềm cho bảng quan trọng; phân công thì kết thúc bằng ngày, không xoá dòng |
| Chứng từ đã ký | Bất biến; sửa bằng chứng từ điều chỉnh có người duyệt, cưỡng chế ở cơ sở dữ liệu |
| Hiện trường | Mốc nghiệp vụ do máy khách đặt, mốc đồng bộ do máy chủ đặt, mã khử trùng khi đồng bộ lại |

**Hồ sơ 360°:** bảy thực thể tham chiếu xuyên phân hệ (pháp nhân, người dùng, khách hàng, cơ hội,
gói thầu hoặc dự án thiết kế, hợp đồng, công trình) được **liên kết, không sao chép**.

---

## 9. Security Architecture (Kiến trúc bảo mật)

### 9.1 Năm mẫu phân quyền — mỗi bảng áp đúng một mẫu

| Mẫu | Logic | Ví dụ áp dụng |
| --- | --- | --- |
| A | Theo pháp nhân; Ban Giám đốc và quản trị viên thấy tất cả | Hầu hết bảng giao dịch |
| B | A cộng điều kiện chỉ người chịu trách nhiệm mới sửa được | Cơ hội, hợp đồng |
| C | Hiện trong Hộp thư Phê duyệt và cho duyệt nếu giá trị trong hạn mức | Đề nghị mua, đề nghị thanh toán |
| D | Hạn chế theo **cột**; trả số thật qua hàm có ghi nhật ký | Giá vốn, lợi nhuận, lương |
| E | Chỉ dữ liệu công trình hoặc xưởng được phân công | Công trình, nhật ký thi công |

### 9.2 Bảng phân quyền theo vai trò

Mười bốn vai trò. «Phê duyệt» là quyền ký xác nhận trong nghiệp vụ; **hạn mức tiền là tham số riêng**
trong bảng cấu hình, không viết cứng theo vai trò. Một người có thể mang nhiều vai trò trong cùng
một pháp nhân.

| Mã | Vai trò | Phạm vi dữ liệu | Quyền chính | Phê duyệt |
| --- | --- | --- | --- | --- |
| R1 | Tổng Giám đốc | Toàn nhóm | Xem mọi phân hệ; quyết định cuối | Mọi phân hệ, không giới hạn hạn mức |
| R2 | Giám đốc Tài chính | Toàn nhóm | Như Ban Giám đốc, cộng toàn quyền phân hệ Kế toán | Mọi phân hệ; toàn quyền Kế toán |
| R3 | Ban Giám đốc | Toàn nhóm | Xem và phê duyệt; không trực tiếp tạo, sửa | Mọi phân hệ |
| R4 | Kinh doanh | Một pháp nhân | Khách hàng, cơ hội, báo giá; soạn hợp đồng từ cơ hội | Không |
| R5 | Dự án – Đấu thầu | Một pháp nhân (NVC) | Khảo sát, bóc tách khối lượng, dự toán, hồ sơ thầu | Không |
| R6 | Thiết kế | Một pháp nhân (NVO) | Hồ sơ thiết kế đa bộ môn, phiên bản bản vẽ, Thiết kế AI | Không |
| R7 | Trưởng phòng Thi công | Nhiều công trình | Kế hoạch, ngân sách, nghiệm thu; tạo đề nghị mua và đề nghị chi | Phân hệ Thi công |
| R8 | Chỉ huy trưởng / Kỹ thuật hiện trường | **Chỉ công trình được phân công** (Mẫu E) | Như Thi công nhưng giới hạn phạm vi công trình | Ký xác nhận tại hiện trường |
| R9 | Mua hàng – Vật tư | Toàn nhóm | Đề nghị mua, so sánh nhà cung cấp, đơn hàng | Phân hệ Mua hàng |
| R10 | Kho | Toàn nhóm | Nhập, xuất, điều chuyển, kiểm kê, tài sản giàn giáo | Phân hệ Kho |
| R11 | Kế toán – Tài chính | Toàn nhóm | Thanh toán, tạm ứng, công nợ, hạch toán | Không |
| R12 | Hành chính – Nhân sự | Toàn nhóm | Tuyển dụng, hồ sơ nhân sự, chấm công ba khối | Bảng chấm công văn phòng và xưởng |
| R13 | Xưởng sản xuất – Cho thuê | Một pháp nhân (NVS) | Lệnh sản xuất, sửa chữa, hợp đồng cho thuê | **Không** — biểu mẫu xưởng do Ban Giám đốc duyệt |
| R14 | Quản trị hệ thống | Toàn nhóm | Phân quyền, hạn mức, danh mục, tham số, nhật ký | Toàn quyền cấu hình |

**Dữ liệu nhạy cảm (Mẫu D).** Nhóm được xem giá vốn, lợi nhuận, lương khai **ở một chỗ duy nhất**
bằng một hàm dùng chung, không rải điều kiện ra từng bảng. Mặc định thiết kế: R1, R2, R3, R14 xem
được; lương thêm R12; giá vốn và lợi nhuận thêm R11. Danh sách này **cấu hình được**, không viết
cứng. Mọi lượt xem hoặc sửa nhóm dữ liệu này ghi một dòng nhật ký truy cập.

### 9.3 Nguyên tắc vận hành

- Trình duyệt chỉ giữ khoá ẩn danh. Khoá đặc quyền `service_role` **chỉ tồn tại trong Worker**.
- Bảng mới tự động bật RLS bằng trigger sự kiện: quên viết chính sách thì bảng **bị chặn hết**, tức là hỏng theo hướng an toàn.
- Ba lớp chặn: ẩn menu theo quyền → chặn đường dẫn gõ tay → RLS. **Chỉ lớp cuối là hàng rào thật**; hai lớp đầu chỉ để người dùng không thấy thứ không dùng được.
- Không lưu: mật khẩu thô, mã xác thực một lần, tài khoản ngân hàng cá nhân.
- Không commit bí mật vào mã nguồn; mọi bí mật nằm trong kho bí mật của Cloudflare Workers.

### 9.4 Bảo mật khi gọi mô hình AI

Đây là **đường duy nhất dữ liệu rời khỏi hệ thống**, nên siết riêng. Rủi ro lớn nhất là lộ khoá API
của nhà cung cấp mô hình: khoá bị lộ có thể bị dùng để gọi trả phí không giới hạn dưới tên NVG.

| Chủ đề | Quy tắc bắt buộc | Vì sao |
| --- | --- | --- |
| Nơi giữ khoá | Khoá API mô hình **chỉ nằm trong kho bí mật của Cloudflare Workers**; không nằm trong mã nguồn, không trong tệp cấu hình, không trong biến môi trường của giao diện | Biến của giao diện bị **đóng cứng vào gói tải về trình duyệt** — đặt khoá ở đó là công khai khoá |
| Đường gọi | Trình duyệt **không bao giờ gọi thẳng** nhà cung cấp mô hình. Mọi lượt gọi đi qua Worker đóng vai trung gian | Giữ khoá ở phía máy chủ; đồng thời kiểm soát được ai gọi, gọi cái gì |
| Quyền gọi | Chỉ người dùng đã đăng nhập và có năng lực đúng bộ môn mới kích hoạt được lượt gọi | Chặn người ngoài dùng hệ thống như cổng gọi AI miễn phí |
| Dữ liệu gửi đi | **Ẩn danh trước khi gửi**: bỏ tên khách hàng, mã hồ sơ, khung tên bản vẽ; chỉ gửi phần thật sự cần cho phép tính | Giảm thiệt hại nếu nhà cung cấp rò rỉ hoặc dùng dữ liệu để huấn luyện |
| Điều khoản nhà cung cấp | Gói miễn phí của một số nhà cung cấp **được phép dùng dữ liệu để huấn luyện** → chỉ dùng cho dữ liệu giả lập; dữ liệu thật phải dùng bản trả phí có cam kết không huấn luyện | Ràng buộc pháp lý và bí mật kinh doanh |
| Nhật ký | Ghi mỗi lượt gọi: ai gọi, dự án nào, mô hình nào, số token, chi phí. **Không bao giờ ghi khoá vào nhật ký** | Truy vết chi phí và lạm dụng; nhật ký là nơi khoá hay bị lộ nhất |
| Hạn mức và ngắt mạch | Giới hạn số lượt mỗi người, mỗi dự án và trần chi phí; vượt trần thì dừng gọi | Chặn thiệt hại tiền khi bị lạm dụng hoặc lỗi vòng lặp |
| Tách môi trường | Khoá riêng cho từng môi trường (phát triển, chạy thử, vận hành); thu hồi và xoay khoá định kỳ, và ngay khi nghi ngờ rò rỉ | Lộ khoá môi trường phát triển không kéo theo môi trường thật |
| Tin cậy đầu ra | Chữ và dữ liệu do mô hình sinh ra là **đầu vào không tin cậy**: kiểm theo hợp đồng dữ liệu, thoát ký tự trước khi dựng bản vẽ hay trang | Chặn chèn mã và dữ liệu rác đi vào hồ sơ |
| Suy giảm có kiểm soát | Mô hình lỗi hoặc hết hạn mức **không được chặn luồng nghiệp vụ chính** | AI là phụ trợ tuỳ chọn, không phải đường sống của hệ thống |

---

## 10. Deployment Architecture (Kiến trúc triển khai)

![Deployment](diagrams/deployment.png)

**Hình 8.** Thành phần chạy ở đâu.

| Môi trường | Giao diện | API | Cơ sở dữ liệu |
| --- | --- | --- | --- |
| Phát triển | Máy trạm của người viết mã | Chạy cục bộ | Project riêng |
| Chạy thử | Worker phục vụ tệp tĩnh | Worker API | Project riêng |
| Vận hành | Worker phục vụ tệp tĩnh | Worker API | Project riêng |

**Thành phần triển khai độc lập: container số hoá hồ sơ cũ**

Hộp nét đứt trong sơ đồ là một dịch vụ Python riêng, không giữ trạng thái, chỉ làm một việc: đọc bản vẽ CAD của hồ sơ cũ và trả về dữ liệu đã bóc tách để nạp vào kho tri thức. Nó **không** nằm trên đường chạy của nghiệp vụ hằng ngày, và luồng thiết kế sơ bộ bằng AI (mục 7.3) không gọi tới nó. Vì vậy nó có vòng đời triển khai riêng, tách khỏi hai Worker:

| Cách chạy | Worker gọi bằng | Điều kiện |
| --- | --- | --- |
| Dịch vụ dựng từ ảnh container, bật khi cần số hoá | Địa chỉ HTTP đặt trong biến cấu hình | Dùng được ở mọi gói dịch vụ |
| Container đặt trên cùng mạng biên với Worker | Ràng buộc nội bộ, không qua Internet công cộng | Cần gói mạng biên có hỗ trợ container — `TBD-9` |

Chỗ phải sửa khi đổi giữa hai cách nằm sau **một ranh giới trừu tượng duy nhất** trong mã: một hàm dựng trong một tệp. Đây là thay đổi cấu hình, không phải thay đổi kiến trúc. Khi địa chỉ chưa được cấu hình, Worker trả lỗi rõ ràng cho riêng chức năng số hoá; các luồng còn lại không bị ảnh hưởng.

**Quy tắc triển khai bắt buộc**

1. **Mỗi môi trường một project cơ sở dữ liệu riêng.** Dùng chung một project giữa phát triển và chạy thử là không chấp nhận được: lệnh cập nhật cấu trúc ở máy sẽ đổi luôn dữ liệu bản công khai, và kiểm thử có thể xoá dữ liệu thật.
2. Phát hành **API trước, giao diện sau** — giao diện mới không được gọi API cũ chưa có hợp đồng tương ứng.
3. Không thêm tham số môi trường phụ khi phát hành Worker: nó sinh ra một Worker thứ hai trong khi bản thật giữ nguyên bản cũ mà **không báo lỗi**.
4. Bản dựng giao diện phải **dừng lại nếu biến cấu hình rỗng hoặc trỏ về máy cục bộ**; nếu không, bản phát hành trắng màn hình trong khi quá trình dựng vẫn báo thành công.
5. Hai bên giao diện và API cùng nhúng **dấu vân tay hợp đồng dữ liệu** và đối chiếu khi chạy, để phát hiện hai bên đang chạy hai phiên bản hợp đồng khác nhau.

---

## 11. Scalability & Reliability (Khả năng mở rộng và độ tin cậy)

| Khía cạnh | Thiết kế | Đánh giá |
| --- | --- | --- |
| Quy mô người dùng | Khoảng 40 nhân sự văn phòng và ban công trường, cộng lao động thời vụ | Xa ngưỡng cần chia tải |
| Khối lượng giao dịch | Khoảng 800 dự án và đơn hàng mỗi năm | Một máy chủ cơ sở dữ liệu dư sức |
| Giao diện | Tệp tĩnh trên mạng biên | Không có điểm nghẽn máy chủ ứng dụng |
| Tác vụ nền | Bộ hẹn giờ, không dùng hàng đợi | Đủ cho các loại quét cảnh báo đã thiết kế |
| Ngoại tuyến | Khử ghi trùng khi đồng bộ lại; ngoại tuyến thật cho Kho còn `TBD` | Quyết định phạm vi chưa chốt |
| Sao lưu | Theo cơ chế của nền dữ liệu, kèm quy trình phục hồi phải được diễn tập | Diễn tập là điều kiện trước khi vận hành thật |
| Điểm hỏng đơn lẻ | Nền dữ liệu Supabase | Chấp nhận ở giai đoạn demo; soát lại trước vận hành thật |

Hướng mở rộng khi cần, theo thứ tự: chỉ mục và truy vấn trước, rồi bộ nhớ đệm cho báo cáo nặng,
sau cùng mới tách dịch vụ. **Quy mô mục tiêu không đòi hỏi mức nào trong ba mức này.**

---

## 12. Technology Stack (Công nghệ)

| Lớp | Công nghệ | Ghi chú |
| --- | --- | --- |
| Giao diện | React 18 · TypeScript · Vite · Tailwind · shadcn/ui | Ứng dụng một trang, không kết xuất phía máy chủ |
| Trạng thái | TanStack Query · Zustand | Có bộ đệm truy vấn ngắn |
| Biểu mẫu | Thành phần biểu mẫu tự viết; kiểm tra dữ liệu bằng mã tường minh | Không dùng thư viện quản lý biểu mẫu — xem tài liệu Thiết kế chi tiết |
| Hợp đồng dữ liệu | JSON Schema viết tay, sinh ra Zod | Chỉ cho Thiết kế AI; dùng chung giao diện và Worker |
| API | Supabase PostgREST · Cloudflare Workers + Hono | Workers chỉ cho Thiết kế AI |
| Dữ liệu | PostgreSQL trên Supabase · Drizzle ORM | Migration là nguồn duy nhất của lược đồ |
| Xác thực · Tệp | Supabase Auth · Supabase Storage | |
| Nền tảng chạy | Cloudflare Workers · Static Assets · Cron Triggers | |
| Số hoá hồ sơ cũ | Python trong container | Dịch vụ riêng, không giữ trạng thái; chỉ Thiết kế AI dùng khi nạp hồ sơ cũ |
| Kiểm thử | Vitest · React Testing Library · Playwright | |
| AI | Đang thử nghiệm Gemini · GPT · Claude | Chỉ cho Thiết kế AI; chưa chốt mô hình cuối |

---

## 13. Architecture Decisions (Quyết định kiến trúc)

Năm quyết định đầu có tài liệu riêng trong `doc/architecture/adr/`, kèm phương án đã loại.

| Mã | Quyết định | Đánh đổi chính |
| --- | --- | --- |
| ADR-001 | PostgREST là đường dữ liệu mặc định; Workers chỉ cho ngoại lệ | Mọi truy vấn phải diễn đạt được bằng PostgREST |
| ADR-002 | Phân quyền bằng RLS trong cơ sở dữ liệu | Quy tắc quyền viết bằng SQL, khó đọc hơn TypeScript |
| ADR-003 | Năm mẫu phân quyền, mỗi bảng đúng một mẫu | Trường hợp lạ phải uốn về một trong năm mẫu |
| ADR-004 | Đa pháp nhân bằng một cột pháp nhân | Lọc sai một chỗ là lộ dữ liệu chéo pháp nhân |
| ADR-005 | Cấu hình là dữ liệu, không phải mã | Chưa cấu hình thì màn hình phải xử lý giá trị rỗng |
| — | Giao diện là ứng dụng một trang trên tệp tĩnh ở mạng biên | Không kết xuất phía máy chủ, không tối ưu tìm kiếm |
| — | Chứng từ đã ký bất biến, cưỡng chế ở cơ sở dữ liệu | Mọi sửa đổi thành luồng điều chỉnh |
| — | Tác vụ nền: bộ hẹn giờ gọi hàm trong cơ sở dữ liệu | Khó gỡ lỗi hơn mã TypeScript |
| — | Ba lớp chặn quyền, chỉ lớp cuối là hàng rào | Quyền khai ở hai nơi, phải giữ đồng bộ |
| — | Kết quả AI luôn là đề xuất | Không tự động hoá được khâu phát hành hồ sơ |

---

## 14. Risks & Trade-offs (Rủi ro và đánh đổi)

| Mã | Rủi ro | Ảnh hưởng | Hướng xử lý |
| --- | --- | --- | --- |
| R-1 | Ma trận quyền không có chiều pháp nhân | Nhân sự kinh doanh của một pháp nhân dùng chung vai trò với khối khác | Ghi nhận; nếu thành vấn đề thì thêm chiều pháp nhân vào ma trận |
| R-2 | Bảng thời hạn cam kết cố ý để rỗng | Cảnh báo quá hạn **chưa có căn cứ để chạy** | Chờ Ban Giám đốc ban hành; không nạp số tạm |
| R-3 | Hệ thống không chặn người tự duyệt hồ sơ của mình | Kiểm soát yếu khi người lập và người duyệt cùng vai trò | Thêm một bước duyệt — bằng cấu hình, không bằng mã |
| R-4 | Phụ thuộc một nhà cung cấp nền dữ liệu | Nhà cung cấp hỏng là hệ thống dừng | Chấp nhận ở giai đoạn demo; soát lại trước vận hành thật |
| R-5 | Thư viện truy cập dữ liệu không coi một số mã phản hồi là lỗi | Truy vấn mơ hồ trả rỗng, màn hình đọc như «chưa có dữ liệu» | Kiểm thử canh thường trực ở mức mã nguồn |
| R-6 | Lộ khoá API mô hình AI | Bị gọi trả phí dưới tên NVG; có thể lộ dữ liệu đã gửi | Toàn bộ quy tắc ở Mục 9.4; trần chi phí và xoay khoá |
| R-7 | Phụ thuộc điều khoản nhà cung cấp AI | Điều khoản dữ liệu và hạn mức có thể đổi | Không khoá chặt vào một nhà cung cấp; hợp đồng dữ liệu tách khỏi mô hình |

---

## 15. Open Issues / TBD (Vấn đề còn mở)

| Mã | Câu hỏi còn mở | Chặn việc gì |
| --- | --- | --- |
| TBD-1 | Thời hạn cam kết phản hồi của từng phòng ban | Cảnh báo quá hạn của công trường |
| TBD-2 | Bộ mã vật tư, công trình, nhà cung cấp | Nhập liệu thật |
| TBD-3 | Phần mềm kế toán chính thức để tích hợp | Xuất dữ liệu sang kế toán |
| TBD-4 | Công thức lương | Tính lương từ bảng công |
| TBD-5 | Ngoại tuyến thật cho Kho hay chỉ trực tuyến | Thiết kế đồng bộ dữ liệu |
| TBD-6 | Dịch vụ thư điện tử | Nhắc việc qua thư, hàng đợi gửi hàng loạt |
| TBD-7 | Tên miền chính thức, đầu mối hỗ trợ kỹ thuật | Nội dung thông báo lỗi, cấu hình nguồn cho phép |
| TBD-8 | Mô hình AI chính thức sau thử nghiệm | Chốt hạn mức, chi phí và điều khoản dữ liệu |
| TBD-9 | Gói dịch vụ mạng biên có hỗ trợ container | Số hoá hồ sơ cũ trên bản vận hành, không qua máy trạm |

Danh sách đầy đủ kèm hiện trạng: `doc/VAN_DE_CON_MO.md`.

---

## 16. Related Documents (Tài liệu liên quan)

| Tài liệu | Trả lời câu hỏi | Đường dẫn |
| --- | --- | --- |
| Tầm nhìn sản phẩm | Vì sao làm, thành công là gì | `doc/san-pham/VISION_BUSINESS_CASE.docx` |
| Yêu cầu sản phẩm | Làm gì, ranh giới không làm | `doc/san-pham/PRD_v2_0.docx` |
| Đặc tả yêu cầu phần mềm | Phạm vi phiên bản, yêu cầu đo được | `doc/san-pham/SRS_v1_0.docx` |
| Sơ đồ quan hệ thực thể (ERD) | Bảng, thực thể, quan hệ, ràng buộc dữ liệu | `doc/architecture/ERD.docx` |
| Đặc tả API | Hợp đồng gọi dữ liệu và endpoint `/design` | `doc/architecture/API_SPEC.docx` |
| Thiết kế chi tiết (SDD) | Từng phần hiện thực thế nào | `doc/architecture/SDD.docx` |
| Quyết định kiến trúc (ADR) | Vì sao chọn kiến trúc đó | `doc/architecture/adr/` |
| Câu hỏi nghiệp vụ còn treo | Cái gì đang chặn cái gì | `doc/VAN_DE_CON_MO.md` |
| Đặc tả Thiết kế AI | Ràng buộc riêng của phân hệ Thiết kế AI | `doc/design/` |
| Hàng rào cho người viết mã | Cái gì không được vượt | `CLAUDE.md` |

---

## Phụ lục A. Chú giải thuật ngữ

Dành cho người mới đọc tài liệu. Thuật ngữ tiếng Anh giữ nguyên vì là tên chuẩn trong mã nguồn.

| Thuật ngữ | Nghĩa |
| --- | --- |
| Phân hệ | Một nhóm chức năng của hệ thống, có mã hai–ba chữ (NEN, CRM, TC…) |
| SPA (Single Page Application) | Ứng dụng một trang: tải một lần rồi chạy trong trình duyệt, không dựng lại trang ở máy chủ |
| PostgREST | Cổng REST mà Supabase tự sinh từ cơ sở dữ liệu — giao diện gọi thẳng để đọc, ghi mà không cần viết máy chủ |
| RLS (Row Level Security) | Phân quyền theo hàng đặt ngay trong cơ sở dữ liệu: quy tắc «ai thấy dòng nào» nằm ở cơ sở dữ liệu, không ở giao diện |
| Điện toán biên (edge) | Chạy mã ở máy chủ gần người dùng, không có máy chủ thường trực; Cloudflare Workers chạy theo mô hình này |
| Cloudflare Workers | Nền tảng thực thi mã xử lý nghiệp vụ tùy chỉnh ở biên |
| Kho bí mật (Secrets) | Nơi lưu khoá và mật khẩu của Worker, mã hoá, không đọc lại được sau khi đặt |
| Migration | Tệp mô tả thay đổi cấu trúc cơ sở dữ liệu, lưu trong mã nguồn; là nguồn duy nhất của lược đồ |
| Cron Trigger | Bộ hẹn giờ chạy tác vụ nền theo lịch |
| JWT | Thẻ xác thực người dùng gắn kèm mỗi lượt gọi (JSON Web Token) |
| CRUD | Bốn thao tác dữ liệu cơ bản: thêm, đọc, sửa, xoá |
| Khoá ẩn danh / service_role | Khoá công khai giới hạn (giao diện dùng) / khoá đặc quyền vượt phân quyền (chỉ trong Worker) |
| Trung gian (proxy) | Worker đứng giữa trình duyệt và dịch vụ ngoài, giữ khoá và kiểm soát lượt gọi |
| Ẩn danh dữ liệu | Bỏ các trường nhận dạng được người hoặc hồ sơ trước khi gửi ra ngoài |
| Artifact (Thiết kế AI) | Kết quả bất biến của một bước Thiết kế AI, khoá bằng mã băm nội dung, có lineage (vết xuất xứ) |
| Bộ môn (discipline) | Kiến trúc, kết cấu, hoặc điện nước — trục phân quyền của phân hệ Thiết kế AI |
| Workflow | Bộ điều phối chạy nhiều bước nền tuần tự, dừng được giữa các bước để người duyệt |
| Hộp thư Phê duyệt | Một màn hình gom mọi hồ sơ chờ duyệt, không phân biệt loại nghiệp vụ |
| Chứng từ bất biến | Chứng từ đã ký hoặc kỳ đã khoá: chỉ sửa bằng chứng từ điều chỉnh có người duyệt, không sửa đè |
| Hồ sơ 360° | Các thực thể trung tâm (pháp nhân, người dùng, khách hàng, cơ hội, hợp đồng, công trình…) liên kết xuyên phân hệ, không sao chép |
| Dấu vân tay hợp đồng | Mã băm của bộ hợp đồng dữ liệu, nhúng ở cả hai bên để phát hiện lệch phiên bản |
