# Vấn đề còn mở — cần NVG xác nhận, KHÔNG tự quyết

> Chuyển từ `CLAUDE.md` mục 6.6 ngày 19/09/2026. Gộp từ PRD 10, TSD 7, CGD 7, BSD 5, IPD 7 và hồ sơ khảo sát.
> Ô trống trong phiếu khảo sát là câu hỏi cho Haan, không phải chỗ điền giá trị mặc định.
> Chốt xong một dòng thì chuyển nó xuống mục «Đã chốt».
>
> **Mã `#N`** là số của bảng «Quyết định còn cần Haan chốt» trong `BUILD_PLAN.md` — **mã nguồn trỏ
> theo số này** ("câu hỏi N"), nên đừng đánh lại số. Dòng nào chưa từng được đánh số thì ghi
> `(chưa có mã)`. Đây là danh sách ĐẦY ĐỦ; `BUILD_PLAN.md` giữ bản rút gọn cùng số.
>
> **Haan chốt 20/09/2026:** câu nào chưa được trả lời thì **tạm hoãn — chưa cần có trong bản demo**.
> Các dòng đã hoãn gom ở mục «Tạm hoãn» phía dưới, không xoá để lúc mở lại không phải dựng lại từ đầu.

## Còn mở

### Tích hợp, mã hoá, đơn giá

- **#4 — Bộ mã vật tư / công trình / nhà cung cấp** thống nhất — **ĐÃ CÓ BẢN ĐỀ XUẤT 20/09/2026, chờ Haan duyệt**
  → Haan giao đội triển khai tự đề xuất. Bản đề xuất đầy đủ: **`doc/BO_MA.md`** — công trình `NVC-CT-2026-0001`, vật tư `THEP-ONG-D49X2.0` (theo KHO-02), nhà cung cấp `NCC-00001`. Nguyên tắc nền: bảng giao dịch mang pháp nhân, **bảng dùng chung thì không** (`materials`/`suppliers`/`customers` không có `company_id`). Chưa áp vào mã nguồn; mục 6 của tài liệu đó liệt kê đúng những gì sẽ đổi khi duyệt, kèm ba câu hỏi ngắn cần Haan xác nhận
- **#3 — `unit_prices` dùng chung DA/TK/MH?**
  → Cần xác nhận NVO có cần bảng đơn giá riêng không (BSD 5). Đang triển khai DÙNG CHUNG, tách sẵn theo `company_id`

### Dữ liệu nhạy cảm và phân quyền

- **(chưa có mã) — Ai được xem GIÁ VỐN**
  → Đang mở cho TGĐ/CFO/BGĐ/Admin + **DA_DT, TKE, MH** (suy từ TK-07 và MH-04/05). Lợi nhuận vẫn chỉ TGĐ/CFO/BGĐ/Admin. Lương thêm NS và KT; **căn cước/sức khỏe/kỷ luật (`personal`) hẹp hơn lương — không có KT**. Cả bốn nhóm sửa ở cùng hàm `rls_sees_sensitive`
- **#20 — Kế toán đọc hồ sơ nhân sự tới đâu**
  → Đang cho nhóm `salary` (có KT) nhưng không cho nhóm `personal`. Sửa ở `rls_employee_readable`
- **(chưa có mã) — NEN-07 "mọi lượt xem" đọc theo chữ hay theo tinh thần**
  → Chỉ huy trưởng xem ngân sách công trình mình **không** ghi `sensitive_access_logs` (cố ý, tránh phình bảng). Đọc theo chữ thì phải ghi
- **(chưa có mã) — Mua hàng được đọc phía Thi công tới đâu**
  → Đang cho đọc **tối thiểu**: mã/tên/địa chỉ công trình + `site_cost_codes`, **không kèm số tiền**. AFD 2.3 không nhắc phân hệ Thi công cho Mua hàng

### Nhân sự, chấm công, phê duyệt

- **(chưa có mã) — "Trưởng đơn vị" ở bước 1 của luồng duyệt chi (KT-01) là AI** — Haan hỏi lại cho rõ 20/09/2026, **câu hỏi viết lại bên dưới**
  → **Tình huống cụ thể:** một đề nghị thanh toán 30 triệu trả nhà cung cấp thép, phát sinh từ đơn mua hàng của công trình X thuộc NVC. Luồng KT-01 là *trưởng đơn vị → kế toán → CFO/TGĐ*. **Ai ký ở ô "trưởng đơn vị"?** Bốn khả năng: (a) chỉ huy trưởng công trình X · (b) trưởng phòng Mua hàng — phòng lập đơn · (c) trưởng phòng Thi công — phòng quản lý công trình · (d) giám đốc pháp nhân NVC. **Câu hỏi thứ hai:** luôn là một người cho mọi khoản chi, hay đổi theo nơi phát sinh (công trường / xưởng / văn phòng)?
  → **Mã đang chạy phương án (b)**: người có quyền `approve` trên chính phân hệ phát sinh khoản chi (`payment_requests.origin_module`) — chi từ đơn mua hàng thì Mua hàng ký, chi từ công trình thì Thi công ký. Kéo theo: vai trò TC/MH/KHO được cấp `approve` trên phân hệ của mình. Đổi câu trả lời chỉ phải sửa điều kiện trong hàm `rls_payment_step_actor`, không lan sang chỗ khác
- **#37 — Vai trò thứ 15 "Tổ trưởng sản xuất"** (AFD v1.1 mục 2.3) chưa tạo
  → Chờ đợt SX cụm C

### Kế toán, kho, mua hàng

- **(chưa có mã) — Mốc chia nhóm công nợ quá hạn** (KT-04) — Haan xác nhận 27/08/2026: chưa có mốc, giữ giả định nhưng Quản trị hệ thống phải sửa lại được
  → Đã chuyển thành DỮ LIỆU trong bảng `aging_buckets`, seed 30/60/90 ngày từ `DEFAULT_AGING_BUCKETS`. KHÔNG hard-code ở bất kỳ đâu — cùng quy tắc với `approval_limits` (5.2). Mốc riêng của pháp nhân THAY THẾ mốc chung, không trộn
- **#14 — Hàng từ kho chung xuất cho công trình ghi chi phí lúc nào?**
  → Hiện không về được ngân sách công trình nào. Đây là quyết định kế toán, không phải kỹ thuật
- **#15 — Ngưỡng tồn lâu** (KHO-08)
  → Đang lấy 90 ngày, là giả định
- **#16 — Kho tự duyệt chênh lệch kiểm kê tới 10 triệu**
  → Vừa đếm vừa duyệt là kiểm soát yếu. Sửa bằng cấu hình `approval_limits`
- **#1 — KHO-09 làm việc ngoại tuyến thật hay online-first?**
  → Hiện mới có `client_generated_id` chống ghi trùng. ⚠️ Khảo sát Xưởng nói mạng "đôi lúc không ổn định" — đây mới là chỗ offline có giá trị, khác công trường (mạng ổn định)
- **#11 — Một đề nghị mua đặt được nhiều nhà cung cấp không?**
  → Hiện một đề nghị → một đơn
- **#13 — Bảng giá khung MH-09** — theo tháng hay quý, điều chỉnh phải báo trước bao lâu?
  → Chặn MH-09, hiện cố ý chưa làm

### Hợp đồng, dự toán, công trình

- **#8 — Một hợp đồng mở được nhiều công trình không?**
  → Hiện chặn ở một. Đổi bằng một tham số
- **#25 — Dòng dự toán chi tiết có được dùng nhóm `chi_phi_chung`/`du_phong`/`loi_nhuan` không?**
  → Phần mất tiền đã vá (migration `0080`), còn lại là câu hỏi UX
- **#24 — `move_site_stage` có nên báo khi chuyển bước, cho ai?**
  → Hiện không báo ở bước nào — chưa vá

### Báo cáo

- **#34 — Số bản ghi tối thiểu để hiện một chỉ số** thay vì "Chưa đủ dữ liệu" (BSD v1.1 Mục 5)
  → Chưa xác định. Tham số `min_samples_for_metric`, hiện để RỖNG — cố ý không hard-code trong truy vấn báo cáo

### Hạ tầng, tác vụ nền

- **#23 — Bảng `tasks` — bỏ hẳn hay dùng thật?**
  → Có sẵn từ Phase 0 (BUILD_PLAN 1.4), chưa từng được ghi/đọc ở bất kỳ đâu. Trung tâm Thông báo (bảng `notifications`) đã lên hình ở Phase 3G — nút chuông Top Bar giờ đọc thật, đánh dấu đã đọc, điều hướng tới `action_url`. "Việc cần làm" vẫn chỉ là Hộp thư Phê duyệt (`usePendingApprovals`); việc không gắn phê duyệt (vd. nhắc giấy tờ sắp hết hạn) hiện chỉ sinh `notification` một chiều, không có nơi "xử lý xong thì biến mất" đúng AFD 5.4
- **(chưa có mã) — Bảng `audit_logs` chưa có nguồn ghi nào, nối vào đâu?**
  → Đo trên CSDL thật 20/09/2026: `sensitive_access_logs` có 2.434 dòng, `audit_logs` có **0**, và không một hàm nào trong CSDL chứa lệnh ghi vào bảng đó (chú thích ở migration `0049` nói `adjust_timesheet` ghi vào đây — đối chiếu lại thì không đúng). Cùng nhóm với bảng `tasks` (#23): có bảng, có RLS, chưa ai dùng. Lịch sử hiện nằm rải ở bảng lịch sử riêng của từng loại hồ sơ, nên tra "hôm qua ai sửa gì" phải mở từng hồ sơ — đúng thứ NEN-03 muốn tránh. Cần Haan quyết nghiệp vụ nào ghi vào đây trước khi nối
- **(chưa có mã) — "Hồ sơ thiếu chứng từ" (NEN-04) nghĩa là gì**
  → Áp cho loại hồ sơ nào (đề nghị chi đã trả nhưng thiếu hoá đơn? đơn hàng đã nhận nhưng thiếu phiếu giao nhận?), thiếu CỘT dữ liệu nào, bao lâu thì nhắc, nhắc ai. **Chưa rõ thì chưa viết được migration** — đây là loại cảnh báo thứ 5 của tác vụ nền
- **(chưa có mã) — Nhắc công nợ "sắp đến hạn" báo trước mấy ngày**
  → PRD NEN-04 không nêu số nào (giấy tờ NS có mốc 90/60/30/7 rõ, công nợ thì không). Hiện cố ý thu hẹp: chỉ `phai_thu`, chỉ khi ĐÃ quá hạn
- **#7 — Tên miền chính thức** · **đầu mối hỗ trợ kỹ thuật** (điền vào mẫu lỗi CGD 5.5) · **SSO** (chờ NVG có email công ty)
  → Chưa chặn phát triển
- **(chưa có mã) — Hạn mức + điều khoản bảo mật gói miễn phí Gemini**
  → Cần kiểm tra lại tại thời điểm triển khai; cân nhắc gói trả phí khi dùng dữ liệu thật

### Xưởng (NVS)

- **#32 — Ngưỡng tỷ lệ lỗi sản xuất cho phép** (SX-12)
  → Theo nhóm sản phẩm / giai đoạn / lô, biến động. Tham số `defect_rate_threshold`, hiện để RỖNG
- **#31 — Bảng giá bồi thường giàn giáo thiếu – hỏng theo mã** (SX-19)
  → Cần BGĐ ban hành. Khởi tạo tạm để hệ thống vận hành được, quản trị viên sửa sau — tham số `compensation_price_table`, hiện để RỖNG
- **#35 — Rà soát nội bộ: địa chỉ xưởng chính của NVS**
  → Catalogue ghi **hai địa chỉ khác nhau ở hai vị trí trong cùng tài liệu**: Xã Tây Sơn và Xã Vũ Sơn, cùng huyện Kiến Xương. Cần NVS xác nhận trước khi khởi tạo danh mục kho (KHO-01). ⚠️ Kèm theo: Phụ lục D.5 ghi **"Thái Bình"**, nhưng theo quyết định **T9** (mục 8.5) Thái Bình đã sáp nhập vào **Hưng Yên** từ 2025 — seed `warehouses` phải dùng tên đơn vị hành chính hiện hành. Đây là dữ liệu catalogue cũ, không phải lỗi tài liệu
- **#36 — Rà soát nội bộ: tính cập nhật của Catalogue**
  → Catalogue phát hành **2022**. Cần NVS xác nhận danh mục sản phẩm còn đúng (có mã nào đã ngừng, mã nào mới) và các chứng chỉ kiểm định còn hiệu lực hay không (SX-13)

### Công trường

- **#10 — Công trường đo tiến độ theo gì**
  → Khảo sát cho thấy đo theo **hạng mục/đầu việc**, xác nhận bằng **khối lượng hoàn thành đã nghiệm thu** (chưa nghiệm thu thì chưa tính). Còn thiếu: mức chi tiết của kế hoạch tiến độ (theo tuần hay theo mũi thi công) và ai là người cập nhật % hoàn thành
- **#9 — Công trường: ba con số suy luận của TC**
  → Cửa sổ sửa nhật ký **24 giờ** · ngưỡng cảnh báo ngân sách **90%** · thang đánh giá tổ đội **1–5**. Khảo sát KHÔNG nói tới cả ba; chỉ gián tiếp ủng hộ con số 24 giờ (báo cáo ngày phải gửi trước 20 giờ tối). Cả ba **đã chuyển thành tham số cấu hình được** (migration 0112) nên NVG sửa được mà không phải triển khai lại — nhưng chúng vẫn là giả định chưa ai xác nhận
- **#29 — Công trường: hồ sơ nào bắt buộc giữ bản giấy có chữ ký gốc**
  → Phiếu ghi "Hồ sơ gốc bắt buộc phải ký, đóng dấu hoặc lưu bản giấy vẫn phải được quản lý theo quy định; phần mềm lưu bản điện tử để tra cứu". Cần danh sách cụ thể để biết chỗ nào ký điện tử được, chỗ nào chỉ đính kèm bản chụp (liên quan PRD 2.3 "không bắt nhập liệu hai lần"). **Chặn thiết kế màn hình** nghiệm thu và nhật ký TC
- **#33 — Phương thức ghi nhận công tại công trường** (TC-08, NS-04)
  → Chưa chốt; phương án đang cân nhắc là **chụp ảnh có gắn thời gian và vị trí**. Cần quyết định trước khi xây phần chấm công khối công trường. Thực chất chỉ cần khoanh 1 trong 4 lựa chọn đang để trống ở phiếu khảo sát công trường (bảng giấy / Excel / Zalo / máy chấm công)
- **#30 — Thời hạn cam kết phản hồi của từng phòng ban** (PRD v1.4 Mục 10)
  → Cần BGĐ quyết. **Không có tham số này thì cơ chế cảnh báo quá hạn TC-10 không có căn cứ để chạy** — nguyên văn PRD. Bảng `sla_definitions` đã dựng và **cố ý để RỖNG**: nạp sẵn một con số sẽ tạo đồng hồ đếm ngược trông như đã cam kết, và người duyệt bị gắn nhãn quá hạn theo thời hạn chưa ai ký

## Tạm hoãn — chưa cần có trong bản demo (Haan chốt 20/09/2026)

Không phải câu hỏi đã trả lời, mà là câu hỏi **chưa tới lượt**. Giữ nguyên ở đây để lúc mở lại không
phải dựng lại từ đầu. Chỗ nào trong mã phụ thuộc thì vẫn hiện **"Chưa đủ dữ liệu"**, không điền số
mặc định (5.2).

- **#2 — Phần mềm kế toán chính thức** để tích hợp (MISA SME / AMIS / Fast?)
  → Chưa thiết kế được payload endpoint `/api/export/accounting-software` (KT-08). Cột `posted_at`/`posted_reference` đã sẵn, nên khi chốt phần mềm thì chỉ thêm bộ chuyển đổi, không đụng cấu trúc bảng
- **#6 — Cơ chế lương/thưởng chi tiết** từng công ty/nhóm nhân sự (NS-06)
  → Đã có HÌNH THỨC trả lương và số công; thiếu đúng phần công thức (`payroll_rules`, `piece_rates`). Haan hoãn **toàn bộ phần tính lương** trong giai đoạn này. Số ngày công vẫn chạy và vẫn đúng — chỉ chưa quy ra tiền
- **(chưa có mã) — Đo "hiệu suất nhân sự/tổ đội/nhà cung cấp"** (BC-03 phần 4)
  → Haan: chưa cần làm ngay. Khảo sát công trường đã cho sẵn ĐƠN VỊ ĐO của tổ đội khi mở lại: **khối lượng hoàn thành × đơn giá hợp đồng**, kỹ thuật hiện trường đo bóc, chỉ huy trưởng kiểm tra trước khi chuyển Kế toán. Ba phần đầu của BC-03 đã xong (`db/migrations/0059_bc_sales_effectiveness.sql`)
- **#28 — Bốn ô trống của Xưởng**: catalogue sản phẩm giàn giáo (sản lượng/tháng + phân loại bán hay cho thuê từng mã) · bộ định mức vật tư hiện hành · tỷ lệ lỗi bình quân · giá trị thất thoát 12 tháng
  → Haan: hoãn, chưa cần có trong demo. Đây là việc **kiểm kê thật**, không trả lời trong một buổi; phiếu khảo sát ghi thẳng "không nên ước lượng một con số để điền". Chặn SX cụm A/B/C/E và BC-04 khi mở lại
- **#26 — Xưởng: giao thêm giữa kỳ trong cùng một hợp đồng thuê**
  → Haan: hoãn, chưa cần có trong demo. Thu hồi nhiều đợt **đã làm** (migration 0106). Giao thêm thì chưa: mỗi đợt giao có ngày bắt đầu tính thuê riêng nên cần bảng đợt giao, không nhét thêm vào `rental_agreement_items` được

## Mâu thuẫn tài liệu chờ Haan xử lý

Mã đã tự chọn theo thứ tự ưu tiên `PRD > AFD > TSD > CGD > BSD > IPD`; cần Haan duyệt hoặc sửa tài liệu gốc.

| Chỗ | Tài liệu nói | Mã đang làm |
| --- | --- | --- |
| `employees` | Mẫu D (BSD 3.3) vs Mẫu B (BSD 4.10) | Dòng theo B, cột lương hạn chế như D |
| `quotes` | Mẫu B (BSD 3.3) vs Mẫu C (BSD 4.2) | Theo BSD 4.x |
| `suppliers` | BSD 4.7 gán Mẫu A | Là bảng dùng chung, **không có `company_id`** — BSD sai, cần sửa |
| Quyền soạn hợp đồng | AFD 2.3 chỉ cho "xem" | Ai sở hữu hồ sơ nguồn thì soạn được — AFD 3.1/3.2 lại bắt chính họ soạn |
| `design_briefs` | BSD 4.4 ghi một trường | Là bảng có phiên bản |
| `design_versions` | BSD 4.4 ghi `file_url` | Trỏ sang bảng `documents` |
| `design_surveys`, `design_reviews` | BSD không liệt kê | Đã tạo vì PRD yêu cầu |

Ngoài ra ma trận `permissions` là (vai trò × module), **không có chiều pháp nhân** — nhân viên kinh
doanh NVS đang phải dùng chung vai trò `SX` (CLAUDE.md 6.5 mục 6).

## Đã chốt (giữ để tra cứu)

- ~~**Khảo sát Xưởng giàn giáo (NVS) + Chỉ huy công trường**~~ — **ĐÃ CÓ 02/09/2026**
  → Hai phiếu ở `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`. Bốn giả định đã được thay bằng câu trả lời thật (migration 0105/0106). Phần phiếu để trống chuyển thành các dòng **Xưởng** và **Công trường** bên trên
- ~~**Xưởng — catalogue sản phẩm giàn giáo**~~ — **CÓ MỘT PHẦN 05/09/2026**
  → PRD v1.4 **Phụ lục D** nay có mã, quy cách (mm), nguyên liệu chính, hồ sơ chứng chỉ kiểm định và 3 địa điểm — đủ làm **bộ mã khởi tạo** cho SX-01 và KHO-02. **Vẫn thiếu hai thứ Catalogue KHÔNG có**: sản lượng/tháng và phân loại bán / cho thuê / cả hai, cho TỪNG mã — xem #28
- ~~**Xưởng — định mức nguyên vật liệu ai giữ, lưu ở đâu**~~ — **ĐÃ TRẢ LỜI 05/09/2026**
  → QĐ-5: định mức nằm trên **các file trên máy tính công ty và bản giấy**, do **trưởng bộ phận sản xuất** nắm giữ, và **giá biến động liên tục**. Việc số hoá là hạng mục chuẩn hoá dữ liệu **bắt buộc trước khi vận hành** SX-07. Vẫn cần chính bộ định mức hiện hành — xem #28
- ~~**Xưởng — công trình nội bộ có tính giá thuê nội bộ không**~~ — **ĐÃ CHỐT 05/09/2026**
  → **QĐ-6: việc GHI NHẬN là BẮT BUỘC.** Công trình nội bộ phải lập chứng từ đầy đủ như khách ngoài (SX-21) và ghi nhận giá trị theo giá thuê nội bộ; có thể không phát sinh thanh toán thật giữa các đơn vị, nhưng số liệu phải có để phân bổ đúng chi phí công trình. **Mức giá** do BGĐ quyết — tham số `internal_rental_price`, hiện để RỖNG. `rental_agreements.is_internal` đánh dấu; **báo cáo hợp nhất toàn NVG phải LOẠI TRỪ** các giao dịch này để không đếm hai lần doanh thu
- ~~**#5 — Hạn mức phê duyệt chính thức theo vai trò/loại nghiệp vụ**~~ — **ĐÃ CHỐT 20/09/2026**
  → Haan: dùng đúng bộ mức đội triển khai đề xuất, chạy thật rồi quản trị viên sửa. Bộ đang chạy: **22 dòng, 11 loại nghiệp vụ** trong `approval_limits` (nguồn `DEFAULT_APPROVAL_LIMITS` ở `@nvg/shared/roles`) — đề nghị chi 10 triệu (KT) → 200 triệu (CFO) → không giới hạn (TGĐ); đề nghị mua cùng bậc; hợp đồng 200 triệu (DA_ĐT) → TGĐ; dự toán và báo giá 500 triệu → TGĐ; chênh lệch kiểm kê 10 triệu (Kho) → CFO. Sửa trên màn hình **Hạn mức phê duyệt** (`/nen/han-muc`), không phải triển khai lại
- ~~**#17 — Ai xác nhận bảng chấm công khối VĂN PHÒNG**~~ (NS-04) — **ĐÃ CHỐT 20/09/2026**
  → Haan: **Hành chính – Nhân sự**. Trùng đúng thứ mã đang làm (`timesheet_block_module` trả `NS` cho khối văn phòng), nên không phải sửa gì — chỉ hết là suy luận. Hai khối kia đã chốt 02/09/2026: công trường → chỉ huy trưởng (`approve` trên TC), xưởng → Phó Giám đốc (`approve` trên SX)
- ~~**#18 — Một ngày công bằng mấy giờ**~~ (NS-04) — **ĐÃ CHỐT 20/09/2026**
  → Haan: **8 giờ**, đúng Bộ luật Lao động 2019 Điều 105 — ca 12 giờ đã được loại trừ. Giá trị thật nằm ở tham số `hours_per_workday` (`system_parameters`, sửa được ở `/nen/tham-so`); `HOURS_PER_WORKDAY` ở `@nvg/shared/ns` chỉ là giá trị dự phòng khi tham số chưa cấu hình. Phần **tính lương** từ số công thì hoãn — xem #6
- ~~**#19 — Ai duyệt yêu cầu tuyển dụng**~~ (NS-02) — **ĐÃ CHỐT 20/09/2026**
  → Haan: **Hành chính – Nhân sự**, không phải Tổng Giám đốc như giả định cũ. Đã đổi bằng **migration `0130`** (một dòng dữ liệu trong `approval_limits`, không đụng hàm nào) và cập nhật `DEFAULT_APPROVAL_LIMITS`. ⚠️ Hệ quả kiểm soát: hệ thống **không chặn người tự duyệt hồ sơ của chính mình**, nên yêu cầu do chính HCNS lập thì HCNS duyệt được. Muốn TGĐ giữ bước cuối thì thêm một dòng bước 2 ở `/nen/han-muc`
