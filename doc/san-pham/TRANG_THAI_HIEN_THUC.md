# Trạng thái hiện thực theo phân hệ

Hệ thống Phần mềm Quản trị Nhà Việt Group

| | |
| --- | --- |
| **Loại** | Tài liệu nội bộ đội triển khai |
| **Phiên bản** | 1.0 |
| **Ngày soạn** | 27/09/2026 |
| **Trạng thái** | Nội bộ — KHÔNG đưa ra ngoài NVG, không kèm khi trình Ban Giám đốc |

> Tài liệu này tách khỏi bộ tài liệu sản phẩm (Tầm nhìn, Yêu cầu sản phẩm, Đặc tả yêu cầu phần mềm)
> để phần tiến độ nội bộ không lẫn vào tài liệu đưa cho người ngoài. Số liệu đo trên mã nguồn tại
> ngày soạn; đổi liên tục nên chỉ dùng để theo dõi nội bộ, không cam kết với NVG.

---

## 1. Trạng thái theo phân hệ

«Lõi» là phạm vi cốt lõi đã chạy được; phần mở rộng của Thi công và Sản xuất còn đang làm.

| Phân hệ | Hiện thực | Ghi chú |
| --- | --- | --- |
| NEN — Nền tảng | Một phần | Phân quyền, phê duyệt, tham số, hồ sơ, tìm kiếm xong; nhắc việc nền (bảng việc chưa dùng), cập nhật thời gian thực, thư điện tử còn lại |
| CRM — Khách hàng | Đã xong | — |
| DA — Dự án, đấu thầu | Lõi xong | Đối chiếu dự toán ↔ thực tế (DA-10) và hỗ trợ AI đọc bản vẽ (DA-11) chưa |
| TK — Thiết kế | Lõi xong | TK-01→TK-09 xong; thư viện thiết kế (TK-09) lùi được; AI Design ở bảng riêng dưới |
| HD — Hợp đồng | Đã xong | — |
| TC — Thi công, hiện trường | Một phần | Lõi cũ xong; phần lớn phạm vi mở rộng chưa (nhật ký TC-05, đề nghị vật tư TC-09, cảnh báo quá hạn TC-10, nghiệm thu TC-13, RFI TC-15, an toàn TC-18, nhận vật tư, khối lượng tổ đội, bàn giao) |
| MH — Mua hàng | Lõi xong | Giá khung (MH-09) và nguyên liệu giàn giáo (MH-10) chưa |
| KHO — Kho | Lõi xong | Ngoại tuyến thật (KHO-09), kho đa địa điểm (KHO-01), số dư đầu (KHO-11) chưa |
| KT — Kế toán | Lõi xong | Nối phần mềm kế toán (KT-08) hoãn, chờ NVG chốt công cụ; đối soát thuê giàn giáo theo kỳ chưa |
| NS — Nhân sự | Lõi xong | Công thức lương (NS-06) hoãn chờ quy chế; hồ sơ tổ đội (NS-09), người dự phòng (NS-12) chưa |
| BC — Báo cáo | Một phần | Dashboard và báo cáo cơ bản xong; bốn báo cáo chuyên biệt của NVS (BC-04) và phần hiệu suất (BC-03) chưa |
| SX — Sản xuất, cho thuê | Một phần | Vòng đời tài sản cho thuê SX-15→SX-21 (ưu tiên số một) và cụm sản xuất SX-04→SX-14 đang làm; giá thành SX-22 làm sau |
| AI Design | Một phần | Đầu bài, chương trình không gian, sinh mặt bằng, mặt đứng, ảnh, xuất bản vẽ chạy được; đang mở rộng số hoá hồ sơ cũ và kho tham chiếu; trình chỉnh sửa kéo–thả cắt có chủ đích |

## 2. Ưu tiên nếu phải thu hẹp phạm vi

| Nhóm | Yêu cầu | Lý do |
| --- | --- | --- |
| Giữ bằng mọi giá | Vòng đời tài sản cho thuê (SX-15→SX-21); luồng công trường – văn phòng (TC-05, TC-09, TC-10, TC-13) | Ưu tiên số một của Xưởng và Công trường |
| Làm sau khi có dữ liệu thật | Định mức, năng suất, giá thành sản xuất (SX-07, SX-10, SX-22) | Phụ thuộc số liệu NVG chưa có |
| Nâng cao, không bắt buộc cho demo | AI đọc bản vẽ (DA-11); thư viện thiết kế (TK-09); ngoại tuyến thật cho Kho (KHO-09); công thức lương xưởng (NS-06); trình chỉnh sửa mặt bằng kéo–thả | Ngoài lõi demo, hoặc chờ NVG chốt tham số |

## 3. Phụ thuộc ngoài, chặn tiến độ

| Phụ thuộc | Ảnh hưởng |
| --- | --- |
| Phần mềm kế toán chính thức chưa chốt | KT-08 chưa nối được |
| Khoá dịch vụ thư điện tử chưa có | Nhắc việc qua thư điện tử của NEN-04 |
| Tham số chưa chốt (hạn mức, thời hạn phản hồi, giá bồi thường, tỷ lệ lỗi) | Cảnh báo quá hạn, bồi thường chạy trên giá trị tạm |
| Một cơ sở dữ liệu dùng chung phát triển và bản chạy thử | Phải tách môi trường trước khi nhập dữ liệu thật |
