# Vấn đề còn mở — cần NVG xác nhận, KHÔNG tự quyết

> Chuyển từ `CLAUDE.md` mục 6.6 ngày 19/09/2026. Gộp từ PRD 10, TSD 7, CGD 7, BSD 5, IPD 7 và hồ sơ khảo sát.
> Ô trống trong phiếu khảo sát là câu hỏi cho Haan, không phải chỗ điền giá trị mặc định.
> Chốt xong một dòng thì chuyển nó xuống mục «Đã chốt».

## Còn mở

- **Phần mềm kế toán chính thức** để tích hợp (MISA SME / AMIS / Fast?)
  → Chưa thiết kế được payload endpoint `/api/export/accounting-software` (KT-08)
- **Hạn mức phê duyệt chính thức** theo cấp/loại nghiệp vụ
  → Đang dùng mức tạm; dữ liệu `approval_limits` phải cấu hình được
- **Bộ mã vật tư / công trình / nhà cung cấp** thống nhất
  → NVG chưa có; sẽ tự tạo mẫu trước go-live từng giai đoạn
- **`unit_prices` dùng chung DA/TK/MH?**
  → Cần xác nhận NVO có cần bảng đơn giá riêng không (BSD 5). Đang triển khai DÙNG CHUNG, tách sẵn theo `company_id`
- **Ai được xem GIÁ VỐN**
  → Đang mở cho TGĐ/CFO/BGĐ/Admin + **DA_DT, TKE, MH** (suy từ TK-07 và MH-04/05). Lợi nhuận vẫn chỉ TGĐ/CFO/BGĐ/Admin. Lương thêm NS và KT; **căn cước/sức khỏe/kỷ luật (`personal`) hẹp hơn lương — không có KT**. Cả bốn nhóm sửa ở cùng hàm `rls_sees_sensitive`
- **Cơ chế lương/thưởng chi tiết** từng công ty/nhóm nhân sự
  → Chưa cấu hình được NS-06. Đã có sẵn HÌNH THỨC trả lương và số công đã chốt; thiếu đúng phần công thức
- **Ai xác nhận bảng chấm công từng khối** (NS-04) — **hai trong ba khối đã CHỐT 02/09/2026**
  → Công trường → chỉ huy trưởng (`approve` trên TC) và xưởng → Phó Giám đốc (`approve` trên SX) nay là NGUYÊN VĂN khảo sát, không còn suy luận. Khối **văn phòng** vẫn là suy luận (`approve` trên NS), cùng gốc với "trưởng đơn vị" của KT-01. Ánh xạ khối → phân hệ nằm ở hàm `timesheet_block_module`
- **Một ngày công bằng mấy giờ** (NS-04) — khảo sát Xưởng KHÔNG trả lời
  → Vẫn lấy **8 giờ** (Bộ luật Lao động 2019 Điều 105). Phiếu để trống cả hình thức chấm công (`[máy chấm công/bảng giấy]`) lẫn cách tính lương (`[ngày công/thời gian/sản phẩm]`), nên chưa loại trừ được ca 12 giờ. Sửa ở `HOURS_PER_WORKDAY` (`@nvg/shared/ns`) **và** hàm `consolidate_timesheets` — có test đối chiếu hai bản
- **Ai duyệt yêu cầu tuyển dụng** (NS-02)
  → Đang đặt Tổng Giám đốc, vì tăng biên chế là quyết định ngân sách của cả công ty. Đổi bằng cấu hình `approval_limits`, không sửa mã
- **"Trưởng đơn vị" ở bước 1 của luồng duyệt chi (KT-01) là AI** — Haan xác nhận 27/08/2026: chưa có thông tin, chờ khảo sát đầy đủ
  → Đang SUY LUẬN: người có quyền `approve` trên module phát sinh khoản chi (`payment_requests.origin_module`). Kéo theo: vai trò TC/MH/KHO được cấp `approve` trên chính phân hệ của mình. Khi Module NS có cây tổ chức, thay điều kiện trong hàm `rls_payment_step_actor` — không phải sửa chỗ nào khác
- **Mốc chia nhóm công nợ quá hạn** (KT-04) — Haan xác nhận 27/08/2026: chưa có mốc, giữ giả định nhưng Quản trị hệ thống phải sửa lại được
  → Đã chuyển thành DỮ LIỆU trong bảng `aging_buckets`, seed 30/60/90 ngày từ `DEFAULT_AGING_BUCKETS`. KHÔNG hard-code ở bất kỳ đâu — cùng quy tắc với `approval_limits` (5.2). Mốc riêng của pháp nhân THAY THẾ mốc chung, không trộn
- **Đo "hiệu suất nhân sự/tổ đội/nhà cung cấp"** (BC-03 phần 4) đo bằng gì
  → CỐ Ý CHƯA làm — TC chưa có bảng phân công tổ đội, MH chưa có sổ đánh giá nhà cung cấp. Khảo sát công trường đã cho ĐƠN VỊ ĐO của tổ đội: **khối lượng hoàn thành × đơn giá hợp đồng**, kỹ thuật hiện trường đo bóc, chỉ huy trưởng kiểm tra trước khi chuyển Kế toán. Ba phần đầu của BC-03 đã xong ở `db/migrations/0059_bc_sales_effectiveness.sql`
- **Bảng `tasks` — bỏ hẳn hay dùng thật?**
  → Có sẵn từ Phase 0 (BUILD_PLAN 1.4), chưa từng được ghi/đọc ở bất kỳ đâu. Trung tâm Thông báo (bảng `notifications`) đã lên hình ở Phase 3G — nút chuông Top Bar giờ đọc thật, đánh dấu đã đọc, điều hướng tới `action_url`. "Việc cần làm" vẫn chỉ là Hộp thư Phê duyệt (`usePendingApprovals`); việc không gắn phê duyệt (vd. nhắc giấy tờ sắp hết hạn) hiện chỉ sinh `notification` một chiều, không có nơi "xử lý xong thì biến mất" đúng AFD 5.4
- **Tên miền chính thức** · **đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5) · **SSO** (chờ NVG có email công ty)
  → Chưa chặn phát triển
- **Hạn mức + điều khoản bảo mật gói miễn phí Gemini**
  → Cần kiểm tra lại tại thời điểm triển khai; cân nhắc gói trả phí khi dùng dữ liệu thật
- **Xưởng — tỷ lệ lỗi và giá trị thất thoát/hư hỏng hằng năm**
  → Phiếu ghi thẳng "Không nên ước lượng một con số để điền vì đây là dữ liệu quan trọng cho quản trị tài sản và định giá cho thuê". **KHÔNG tự điền số mặc định** — cần kiểm kê và đối chiếu 12 tháng gần nhất. Đến khi có, mọi chỉ số liên quan hiện **"Chưa đủ dữ liệu"** (5.2). Ngưỡng cho phép là tham số `defect_rate_threshold`, hiện để RỖNG
- **Xưởng — giao thêm giữa kỳ trong cùng một hợp đồng thuê**
  → Thu hồi nhiều đợt đã làm (migration 0106). Giao thêm thì CHƯA: mỗi đợt giao có ngày bắt đầu tính thuê riêng nên cần bảng đợt giao, không nhét thêm vào `rental_agreement_items` được. Cần biết NVG tính từ ngày giao của từng đợt hay từ ngày ký hợp đồng
- **Công trường — đo tiến độ theo gì**
  → Khảo sát cho thấy đo theo **hạng mục/đầu việc**, xác nhận bằng **khối lượng hoàn thành đã nghiệm thu** (chưa nghiệm thu thì chưa tính). Còn thiếu: mức chi tiết của kế hoạch tiến độ (theo tuần hay theo mũi thi công) và ai là người cập nhật % hoàn thành
- **Công trường — ba con số suy luận của TC**
  → Cửa sổ sửa nhật ký **24 giờ** · ngưỡng cảnh báo ngân sách **90%** · thang đánh giá tổ đội **1–5**. Khảo sát KHÔNG nói tới cả ba; chỉ gián tiếp ủng hộ con số 24 giờ (báo cáo ngày phải gửi trước 20 giờ tối). Cả ba **đã chuyển thành tham số cấu hình được** (migration 0112) nên NVG sửa được mà không phải triển khai lại — nhưng chúng vẫn là giả định chưa ai xác nhận
- **Công trường — hồ sơ nào bắt buộc giữ bản giấy có chữ ký gốc**
  → Phiếu ghi "Hồ sơ gốc bắt buộc phải ký, đóng dấu hoặc lưu bản giấy vẫn phải được quản lý theo quy định; phần mềm lưu bản điện tử để tra cứu". Cần danh sách cụ thể để biết chỗ nào ký điện tử được, chỗ nào chỉ đính kèm bản chụp (liên quan PRD 2.3 "không bắt nhập liệu hai lần")
- **Thời hạn cam kết phản hồi của từng phòng ban** (MỚI — PRD v1.4 Mục 10)
  → Cần BGĐ quyết. **Không có tham số này thì cơ chế cảnh báo quá hạn TC-10 không có căn cứ để chạy** — nguyên văn PRD. Bảng `sla_definitions` đã dựng và **cố ý để RỖNG**: nạp sẵn một con số sẽ tạo đồng hồ đếm ngược trông như đã cam kết, và người duyệt bị gắn nhãn quá hạn theo thời hạn chưa ai ký
- **Bảng giá bồi thường giàn giáo thiếu – hỏng theo mã** (MỚI — SX-19)
  → Cần BGĐ ban hành. Khởi tạo tạm để hệ thống vận hành được, quản trị viên sửa sau — tham số `compensation_price_table`, hiện để RỖNG
- **Ngưỡng tỷ lệ lỗi sản xuất cho phép** (MỚI — SX-12)
  → Theo nhóm sản phẩm / giai đoạn / lô, biến động. Tham số `defect_rate_threshold`, hiện để RỖNG
- **Sản lượng/tháng và phân loại bán hay cho thuê cho TỪNG mã sản phẩm** (MỚI)
  → Catalogue (Phụ lục D) **không có** hai thông tin này. Chặn SX-01 (phân loại mục đích khai thác), SX-06 (kế hoạch theo năng lực thật) và BC-04
- **Phương thức ghi nhận công tại công trường** (MỚI — TC-08, NS-04)
  → Chưa chốt; phương án đang cân nhắc là **chụp ảnh có gắn thời gian và vị trí**. Cần quyết định trước khi xây phần chấm công khối công trường
- **Số bản ghi tối thiểu để hiện một chỉ số** thay vì "Chưa đủ dữ liệu" (MỚI — BSD v1.1 Mục 5)
  → Chưa xác định. Tham số `min_samples_for_metric`, hiện để RỖNG — cố ý không hard-code trong truy vấn báo cáo
- **Rà soát nội bộ — địa chỉ xưởng chính của NVS** (MỚI)
  → Catalogue ghi **hai địa chỉ khác nhau ở hai vị trí trong cùng tài liệu**: Xã Tây Sơn và Xã Vũ Sơn, cùng huyện Kiến Xương. Cần NVS xác nhận trước khi khởi tạo danh mục kho (KHO-01). ⚠️ Kèm theo: Phụ lục D.5 ghi **"Thái Bình"**, nhưng theo quyết định **T9** (mục 8.5) Thái Bình đã sáp nhập vào **Hưng Yên** từ 2025 — seed `warehouses` phải dùng tên đơn vị hành chính hiện hành. Đây là dữ liệu catalogue cũ, không phải lỗi tài liệu
- **Rà soát nội bộ — tính cập nhật của Catalogue** (MỚI)
  → Catalogue phát hành **2022**. Cần NVS xác nhận danh mục sản phẩm còn đúng (có mã nào đã ngừng, mã nào mới) và các chứng chỉ kiểm định còn hiệu lực hay không (SX-13)

## Đã chốt (giữ để tra cứu)

- ~~**Khảo sát Xưởng giàn giáo (NVS) + Chỉ huy công trường**~~ — **ĐÃ CÓ 02/09/2026**
  → Hai phiếu ở `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`. Bốn giả định đã được thay bằng câu trả lời thật (migration 0105/0106). Phần phiếu để trống chuyển thành các dòng **Xưởng** và **Công trường** bên dưới
- ~~**Xưởng — catalogue sản phẩm giàn giáo**~~ — **CÓ MỘT PHẦN 05/09/2026**
  → PRD v1.4 **Phụ lục D** nay có mã, quy cách (mm), nguyên liệu chính, hồ sơ chứng chỉ kiểm định và 3 địa điểm — đủ làm **bộ mã khởi tạo** cho SX-01 và KHO-02. **Vẫn thiếu hai thứ Catalogue KHÔNG có**: sản lượng/tháng và phân loại bán / cho thuê / cả hai, cho TỪNG mã — xem dòng riêng bên dưới
- ~~**Xưởng — định mức nguyên vật liệu ai giữ, lưu ở đâu**~~ — **ĐÃ TRẢ LỜI 05/09/2026**
  → QĐ-5: định mức nằm trên **các file trên máy tính công ty và bản giấy**, do **trưởng bộ phận sản xuất** nắm giữ, và **giá biến động liên tục**. Việc số hoá là hạng mục chuẩn hoá dữ liệu **bắt buộc trước khi vận hành** SX-07. Vẫn cần chính bộ định mức hiện hành — xem dòng bên dưới
- ~~**Xưởng — công trình nội bộ có tính giá thuê nội bộ không**~~ — **ĐÃ CHỐT 05/09/2026**
  → **QĐ-6: việc GHI NHẬN là BẮT BUỘC.** Công trình nội bộ phải lập chứng từ đầy đủ như khách ngoài (SX-21) và ghi nhận giá trị theo giá thuê nội bộ; có thể không phát sinh thanh toán thật giữa các đơn vị, nhưng số liệu phải có để phân bổ đúng chi phí công trình. **Mức giá** do BGĐ quyết — tham số `internal_rental_price`, hiện để RỖNG. `rental_agreements.is_internal` đánh dấu; **báo cáo hợp nhất toàn NVG phải LOẠI TRỪ** các giao dịch này để không đếm hai lần doanh thu
