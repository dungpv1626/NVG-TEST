# BẢNG TỔNG HỢP THAY ĐỔI TÀI LIỆU — Hệ thống Quản trị Nhà Việt Group (NVG)

**Mục đích của file này:** cung cấp cho Claude Code (và bất kỳ ai đọc lại bộ tài liệu) một bản đối chiếu TRƯỚC – SAU đầy đủ giữa bộ tài liệu cũ và bộ tài liệu hiện hành, để không phải đọc lại toàn bộ 6 tài liệu mới biết cái gì đã đổi.

**Nguyên nhân của đợt cập nhật:** bộ tài liệu cũ được soạn khi CÒN THIẾU 2 phiếu khảo sát (Xưởng sản xuất giàn giáo NVS, và Chỉ huy – Giám sát công trường). Nay đã có khảo sát đầy đủ 11 phiếu / 10 bộ phận, cộng thêm Catalogue sản phẩm Nhà Việt Steel. Toàn bộ phần trước đây là SUY LUẬN GIÁN TIẾP đã được thay bằng yêu cầu từ khảo sát trực tiếp.

---

## 0. Bảng phiên bản

| Tài liệu | Cũ | Mới | Mức độ thay đổi |
|---|---|---|---|
| PRD — Product Requirement Document | v1.3 | **v1.4** | **Lớn** — viết lại 2 module, thêm 1 phụ lục, bỏ mốc thời gian |
| Webapp Flow Document | v1.0 | **v1.1** | **Lớn** — thêm 2 mẫu bố cục, 2 hành trình, viết lại 2 hành trình |
| Backend Schema Document | v1.0 | **v1.1** | **Lớn** — ~65 → ~95 thực thể, thêm 1 mẫu RLS |
| Implementation Plan Document | v1.0 | **v1.1** | **Lớn** — bỏ toàn bộ ngày tháng, tái cấu trúc mốc |
| Tech Stack Document | v1.1 | **v1.2** | Nhỏ — mở rộng offline, bỏ mốc thời gian, thêm 3 vấn đề còn mở |
| Content Guidelines Document | v1.1 | **v1.2** | Nhỏ — thêm 1 trạng thái, thêm nội dung trạng thái rỗng |

> **Lưu ý cho Claude Code:** khi nhận ngữ cảnh, luôn dùng bộ 6 tài liệu ở phiên bản mới nhất trong bảng trên. Bộ cũ (PRD v1.3, Webapp Flow v1.0, Backend Schema v1.0, Implementation Plan v1.0, Tech Stack v1.1, Content Guidelines v1.1) đã lỗi thời ở các điểm liệt kê bên dưới và KHÔNG được dùng làm căn cứ triển khai.

---

## 1. Sáu quyết định gốc tạo ra đợt thay đổi này

Đây là 6 quyết định do đội ngũ chuyển đổi số NVG đưa ra. Mọi thay đổi ở Mục 2–8 đều truy được về một trong sáu quyết định này.

| # | Quyết định | Hệ quả trên tài liệu |
|---|---|---|
| **QĐ-1** | **Loại bỏ toàn bộ mốc thời gian** khỏi tài liệu — mọi ước lượng thời gian chỉ mang tính tương đối | Implementation Plan bỏ hết ngày/tuần; PRD Mục 4 bỏ thời lượng giai đoạn; Tech Stack bỏ mọi cụm "6 tuần"/"1,5 tháng"; cả 6 tài liệu bỏ dòng "Ngày phát hành" |
| **QĐ-2** | **Module SX làm phạm vi đầy đủ** (phương án a): cả sản xuất + định mức + giá thành, không chỉ tài sản cho thuê | SX-01→SX-03 thay bằng SX-01→SX-22; Backend Schema thêm 5 cụm bảng; Implementation Plan tách khối 2.4 và 2.6 |
| **QĐ-3** | **Module TC mở rộng đầy đủ**: bản vẽ hiệu lực, RFI, nhật ký mobile-offline, checklist nghiệm thu + ảnh, khối lượng tổ đội, an toàn/sự cố, cảnh báo văn phòng quá hạn | TC-01→TC-08 thay bằng TC-01→TC-20; Backend Schema Mục 4.6 viết lại |
| **QĐ-4** | **Lấy số liệu nhân sự mới nhất của anh Minh**; coi phiếu công trường là khảo sát của **cả NVC và NVO** | PRD Mục 3 cập nhật; Module TC áp dụng chung 2 pháp nhân, khác biệt xử lý bằng cấu hình chứ không tách module |
| **QĐ-5** | Các ô trống trong khảo sát: catalogue lấy từ PDF; định mức nằm trên file/bản giấy do trưởng bộ phận sản xuất giữ, **giá biến động liên tục**; **tỷ lệ lỗi biến động, phải chỉnh sửa được** theo giai đoạn/lô; chấm công xưởng = máy chấm công, **cách tính lương chưa rõ**; chấm công công trường **chưa rõ**; bảng giá bồi thường **để tạm, admin điều chỉnh sau** | Sinh ra NEN-12 (bảng tham số); sinh ra Phụ lục D của PRD; các mục chưa rõ đưa vào "Vấn đề còn mở" thay vì đoán số |
| **QĐ-6** | **Ghi nhận giá thuê nội bộ là bắt buộc**; mức giá do Ban Giám đốc quyết sau và **cấu hình được** | SX-21; cột `is_internal` trên `rental_agreements`; tham số `internal_rental_price` trong `system_parameters` |

---

## 2. Thay đổi xuyên suốt cả 6 tài liệu

### 2.1 Bỏ mốc thời gian (QĐ-1)

| Trước | Sau |
|---|---|
| "Lộ trình 3 giai đoạn / 6 tuần", "demo 95% trong 1,5 tháng" | "Lộ trình 3 giai đoạn" — chỉ cam kết THỨ TỰ và TIÊU CHÍ HOÀN THÀNH |
| M0 = 17/08/2026, M1 = 30/08/2026, M2 = 13/09/2026, M3 = 25/09/2026 | M0–M3 định nghĩa bằng Definition of Done, không gắn ngày |
| Giai đoạn 1 = Tuần 1–2, Giai đoạn 2 = Tuần 3–4, Giai đoạn 3 = Tuần 5–6 | Khối công việc đánh số theo thứ tự phụ thuộc dữ liệu (1.1→1.4, 2.1→2.9, 3.1→3.4) |
| Mốc phụ 23/08, 06/09, 20/09 | Điểm kiểm tra kích hoạt theo tiến độ công việc ("ngay sau khi hoàn thành Module NEN"…) |
| "Demo Day 25/09/2026" | "Buổi trình diễn diễn ra khi đạt Mốc M3" |
| Ảnh biểu đồ lịch trình 6 tuần trong Implementation Plan | **Đã gỡ bỏ** (ảnh chứa ngày tháng nên không còn đúng) |
| Dòng "Ngày phát hành: …" trên trang bìa 6 tài liệu | Đã gỡ. Giữ lại số phiên bản và lịch sử phiên bản |

> **Ngoại lệ có chủ đích:** Content Guidelines Mục 4.3 vẫn giữ quy tắc định dạng ngày `dd/mm/yyyy`. Đó là quy tắc viết cho GIAO DIỆN, không phải mốc dự án. Chỉ sửa lại ví dụ minh họa cho khỏi trỏ về trang bìa đã xóa.

### 2.2 Sửa lỗi tham chiếu chéo tồn đọng

Bộ cũ có lỗi: 5 tài liệu vẫn ghi "PRD v1.2" trong khi PRD đã lên v1.3. Đã sửa toàn bộ:

| Tài liệu | Tham chiếu cũ | Tham chiếu mới |
|---|---|---|
| Webapp Flow | PRD v1.2 | PRD v1.4 |
| Tech Stack | PRD v1.2, Webapp Flow v1.0 | PRD v1.4, Webapp Flow v1.1, Content Guidelines v1.2, Backend Schema v1.1, Implementation Plan v1.1 |
| Content Guidelines | PRD v1.2, Webapp Flow v1.0, Tech Stack v1.1 | PRD v1.4, Webapp Flow v1.1, Tech Stack v1.2, Backend Schema v1.1, Implementation Plan v1.1 |
| Backend Schema | PRD v1.2, Webapp Flow v1.0, Tech Stack v1.1 | PRD v1.4, Webapp Flow v1.1, Tech Stack v1.2, Content Guidelines v1.2 |
| Implementation Plan | PRD v1.2, Webapp Flow v1.0, Tech Stack v1.1, Content Guidelines v1.1, Backend Schema v1.0 | PRD v1.4, Webapp Flow v1.1, Tech Stack v1.2, Content Guidelines v1.2, Backend Schema v1.1 |

### 2.3 Các con số bị đổi ở nhiều nơi

| Đại lượng | Trước | Sau | Xuất hiện tại |
|---|---|---|---|
| Số phiếu khảo sát / bộ phận | 9 phiếu / 8 bộ phận | **11 phiếu / 10 bộ phận** | PRD Mục 1.2, Phụ lục B; Tech Stack, Content Guidelines (lịch sử phiên bản) |
| Cỡ mẫu bảng xếp hạng vướng mắc | N = 8 | **N = 10** | PRD Mục 1.3 |
| Số mẫu bố cục màn hình | 7 | **9** | Webapp Flow Mục 4; Tech Stack Mục 2.1, 2.2; Content Guidelines Mục 1.2 |
| Số mẫu chính sách RLS | 4 (A/B/C/D) | **5 (A/B/C/D/E)** | Backend Schema Mục 3.3; Implementation Plan khối 3.2 |
| Số thực thể dữ liệu | ~65 | **~95** | Backend Schema Mục 2.1 |
| Số màu trạng thái chuẩn | 5 | **6** (thêm Tím) | Content Guidelines Mục 5.1, 6.3; Webapp Flow Mục 5.5 |
| Mẫu bố cục di động | Webapp Flow Mục 4.7 | **Mục 4.8** (do chèn thêm 4.7 Request Tracker) | Tech Stack Mục 2.5 |

### 2.4 Nguyên tắc mới áp dụng toàn hệ thống

Ba nguyên tắc dưới đây là MỚI và ràng buộc cách triển khai ở mọi module:

1. **Tham số hóa thay vì cố định (NEN-12).** Mọi giá trị NVG cho biết là biến động phải nằm trong bảng `system_parameters`, không hard-code: hạn mức phê duyệt, đơn giá thuê, bảng giá bồi thường, giá thuê nội bộ, ngưỡng tỷ lệ lỗi, thời hạn cam kết phản hồi của từng phòng ban. Đổi tham số **không được áp dụng hồi tố** cho chứng từ đã phát hành — chứng từ lưu snapshot giá tại thời điểm phát hành.

2. **Trách nhiệm hai chiều, có thời hạn.** Không chỉ yêu cầu hiện trường cập nhật; văn phòng cũng phải xử lý trên cùng hệ thống với thời hạn phản hồi cấu hình được. Nếu thiếu điều này, phần mềm chỉ làm tăng việc cho công trường mà không giải quyết điểm nghẽn.

3. **Không hiển thị số ước lượng.** Với chỉ số mà NVG chưa có dữ liệu thật (tỷ lệ lỗi, tỷ lệ thất thoát, năng suất chuẩn), hệ thống hiển thị "chưa đủ dữ liệu" — KHÔNG hiển thị 0 và KHÔNG điền số ước lượng.

---

## 3. PRD v1.3 → v1.4

### 3.1 Bảng xếp hạng vướng mắc (Mục 1.3) — thứ hạng thay đổi

Cỡ mẫu tăng từ N=8 lên N=10 làm **#2 và #3 đảo chỗ**:

| Hạng | Trước (N=8) | Sau (N=10) | Điểm TB mới | % thường xuyên |
|---|---|---|---|---|
| 1 | Tổng hợp báo cáo thủ công bằng Excel | *(không đổi)* | 2.90 | 90% |
| **2** | **Thông tin chỉ nằm trong Zalo rồi trôi mất** | **Mất thời gian đi tìm file hoặc giấy tờ cũ** | 2.70 | 70% |
| **3** | **Mất thời gian đi tìm file hoặc giấy tờ cũ** | **Thông tin chỉ nằm trong Zalo rồi trôi mất** | 2.60 | 70% |
| 4 | Nhập cùng một dữ liệu ở nhiều chỗ | *(không đổi)* | 2.40 | 50% |
| 5 | Hỏi đi hỏi lại mới đủ thông tin | *(không đổi)* | 2.30 | 30% |
| 6 | Số liệu giữa các bộ phận không khớp | *(không đổi)* | 2.00 | 10% |
| 7 | Chờ cấp trên duyệt lâu | *(không đổi)* | 1.90 | 0% |
| 8 | Không biết hồ sơ đang ở khâu nào | *(không đổi)* | 1.90 | 10% |
| 9 | Không chắc file có phải bản mới nhất | *(không đổi)* | 1.90 | 10% |
| 10 | Dồn việc cuối tháng | *(không đổi)* | 1.80 | 0% |

Nguyên nhân đảo chỗ: công trường chấm 3/4 cho "mất thời gian tìm file cũ" — đây là bộ phận có khối lượng hồ sơ lớn nhất và phân tán nhất. **Hệ quả triển khai:** NEN-05 (quản lý phiên bản) và NEN-06 (kho hồ sơ tập trung) tăng mức ưu tiên.

### 3.2 Đối tượng sử dụng (Mục 3) — hai dòng mới, một dòng sửa

| Bộ phận | Trước | Sau |
|---|---|---|
| **Phòng Thi công / Ban công trường** | Mô tả chung, không có số liệu nhân sự cụ thể | **11 người**: 1 trưởng phòng (Nguyễn Công Minh), 2 nhân viên phòng, 3 chỉ huy trưởng, 3 kỹ thuật hiện trường, 2 bảo vệ. Một ban công trường lớn quản **~100 lao động** (~20 của công ty + ~80 tổ đội/thầu phụ) |
| **Xưởng sản xuất giàn giáo (NVS)** | **Không có dòng này** | **18 người**: 1 Phó Giám đốc (Nguyễn Thị Phượng), 1 admin, 4 nhân viên kinh doanh, 1 nhân viên kho, 1 tổ trưởng sản xuất, 10 công nhân cơ khí |

Hai ghi chú mới kèm theo:
- **Cơ cấu NVS:** kinh doanh (4) và kho (1) của NVS nằm NGAY TRONG tổ chức Xưởng → một người dùng NVS có thể cần đồng thời quyền CRM + KHO + SX. Hệ thống phải hỗ trợ **nhiều vai trò cho một người trong cùng một pháp nhân** (NEN-02).
- **Phạm vi phiếu công trường (QĐ-4):** phiếu do Trưởng phòng Thi công điền, mô tả mảng nhà xưởng công nghiệp, nhưng được coi là khảo sát đại diện cho ban công trường của **cả NVC và NVO**. Module TC áp dụng chung; khác biệt quy mô xử lý bằng **cấu hình biểu mẫu và luồng phê duyệt theo pháp nhân**, KHÔNG tách thành hai module.

### 3.3 Module TC — TC-01→TC-08 thay bằng TC-01→TC-20

**Toàn bộ 8 yêu cầu cũ bị thay thế.** Bảng ánh xạ:

| Mã cũ | Nội dung cũ | Mã mới tương ứng |
|---|---|---|
| TC-01 | Nhận ngân sách thi công, lập kế hoạch | TC-01 (mở rộng: thêm hiển thị nội dung còn thiếu trong hồ sơ bàn giao) |
| TC-02 | Nhật ký công trường | TC-05, TC-06, TC-07 (tách thành nhật ký điện tử, ảnh có ngữ cảnh, hoạt động offline) |
| TC-03 | Đề nghị mua vật tư từ công trình | TC-09, TC-10, TC-11 (tách thành lập đề nghị, theo dõi trạng thái, tiếp nhận vật tư) |
| TC-04 | Nghiệm thu khối lượng theo giai đoạn | TC-13, TC-14 (checklist điện tử + danh sách tồn tại) |
| TC-05 | So sánh ngân sách với chi phí | TC-12 |
| TC-06 | Quản lý tổ đội / nhà thầu phụ | TC-17 (mở rộng: đo bóc, xác nhận, chặn khối lượng chưa nghiệm thu khỏi bảng thanh toán) |
| TC-07 | Bảo hành sau bàn giao | TC-20 |
| TC-08 | Lưu nhật ký sự việc, biên bản, cảnh báo rủi ro | TC-20 (gộp vào phần truy vết tranh chấp) |

**Bảy yêu cầu HOÀN TOÀN MỚI, không có tương ứng ở bản cũ:**

| Mã mới | Nội dung | Vì sao mới |
|---|---|---|
| **TC-02** | Quản lý khảo sát và tiếp nhận mặt bằng | Khảo sát nêu là đầu việc chính thức |
| **TC-03** | **Bản vẽ đang có hiệu lực tại hiện trường** + xác nhận bản vẽ trước khi giao việc | Sự cố thực tế: tổ đội thi công theo bản vẽ cũ, phải tháo dỡ làm lại |
| **TC-04** | Phiếu giao việc theo hạng mục/tổ đội | Khảo sát nêu là đầu việc chính thức |
| **TC-10** | **Theo dõi trạng thái đề nghị + cảnh báo quá hạn** (ai đang giữ, chờ bao lâu, hạn xử lý) | **Ưu tiên số một của công trường** |
| **TC-15** | Yêu cầu làm rõ kỹ thuật (RFI) có định tuyến và thời hạn | Thay việc hỏi bản vẽ qua Zalo |
| **TC-16** | Quản lý thay đổi và phát sinh, chụp ảnh TRƯỚC KHI bị che khuất | Khảo sát nêu là nguồn tranh chấp thường gặp |
| **TC-18** | An toàn lao động, sự cố, tình huống suýt tai nạn | Khảo sát nêu là đầu việc chính thức |
| **TC-19** | Giàn giáo và thiết bị mượn tại công trường, theo nguồn cấp | Khớp với SX-21 (giao dịch nội bộ) |

**Ràng buộc định lượng mới:** thời gian nhập liệu hằng ngày của một chỉ huy trưởng **mục tiêu ≤10 phút, ngưỡng chấp nhận tối đa 20 phút**. Đây là **tiêu chí nghiệm thu**, không phải mong muốn — xem PRD Mục 6.

### 3.4 Module SX — SX-01→SX-03 thay bằng SX-01→SX-22

**Trước:** 3 yêu cầu, trong đó SX-01 và SX-02 còn ghi "(Cần xác nhận thêm)".

| Mã cũ | Nội dung cũ | Mã mới tương ứng |
|---|---|---|
| SX-01 | *(Cần xác nhận thêm)* Lệnh sản xuất gắn kế hoạch | SX-04, SX-05, SX-06 |
| SX-02 | *(Cần xác nhận thêm)* Tính giá thành thực tế | SX-22 |
| SX-03 | Quản lý tài sản cho thuê (vị trí hiện tại) | SX-15 → SX-21 (7 yêu cầu) |

**Sau: 22 yêu cầu, chia 4 cụm:**

| Cụm | Mã | Nội dung |
|---|---|---|
| **A — Danh mục và dữ liệu nền** | SX-01 → SX-03 | Danh mục sản phẩm có mã và phân loại bán/thuê; quy cách có phiên bản; danh mục dùng chung với CRM/KHO |
| **B — Kế hoạch và lệnh sản xuất** | SX-04 → SX-08 | Lệnh sản xuất là chứng từ gốc (chặn sản xuất khi chưa duyệt); quản lý thay đổi lệnh; kế hoạch ngày/tuần; **định mức NVL có phiên bản**; đề nghị mua sinh từ lệnh |
| **C — Thực hiện, chất lượng, máy móc** | SX-09 → SX-14 | Tiến độ theo 9 công đoạn thực tế; thu thập dữ liệu năng suất chuẩn; kiểm tra chất lượng 3 lớp; **xử lý hàng lỗi + tỷ lệ lỗi cấu hình được**; hồ sơ chứng chỉ kiểm định; quản lý máy móc |
| **D — Vòng đời tài sản cho thuê** | SX-15 → SX-21 | Sổ cái tài sản thời gian thực; **đơn thuê theo số dư động**; **tính tiền thuê theo số dư ngày**; thu hồi – kiểm đếm – phân loại 4 nhóm; tính bồi thường; sửa chữa hàng thu hồi; **giàn giáo cho công trình nội bộ** |
| **E — Giá thành** | SX-22 | Giá thành kế hoạch vs thực tế; **tính lại được bất kỳ lúc nào theo giá vật tư tại thời điểm chọn** |

**Ba yêu cầu quan trọng nhất để Claude Code chú ý:**
- **SX-16 + SX-17:** một đơn thuê KHÔNG phải một lần giao – một lần trả, mà là chuỗi sự kiện (giao lần đầu → giao thêm → trả bớt → gia hạn → điều chuyển → thu hồi cuối). Tiền thuê tính theo **số dư từng ngày**, không tính gộp.
- **SX-19:** khi hai bên chưa thống nhất bồi thường, **khóa số liệu gốc**, chỉ cho lập chứng từ điều chỉnh mới có người duyệt.
- **SX-21:** công trình nội bộ NVG dùng giàn giáo NVS **vẫn phải lập chứng từ đầy đủ như khách ngoài** và **bắt buộc ghi nhận giá trị theo giá thuê nội bộ** (QĐ-6).

### 3.5 Yêu cầu mới ở các module khác

| Mã | Module | Nội dung | Nguồn |
|---|---|---|---|
| **NEN-12** | NEN | **Bảng tham số hệ thống** — mọi giá trị biến động cấu hình được, có lịch sử, không hồi tố | QĐ-5, QĐ-6 |
| **KHO-11** | KHO | **Chốt số dư ban đầu** trước khi vận hành; sau khi chốt chỉ biến động bằng chứng từ | Xưởng nêu trực tiếp |
| **NS-12** | NS | **Giảm phụ thuộc vào một người** — người dự phòng + SOP + mẫu chuẩn lưu trong hệ thống | Cả Xưởng và Công trường đều nêu |

### 3.6 Yêu cầu cũ được mở rộng đáng kể

| Mã | Trước | Sau |
|---|---|---|
| NEN-02 | Phân quyền theo vai trò/đơn vị/hạn mức | + **Gán nhiều vai trò cho một người trong cùng một pháp nhân** (cho NVS) |
| NEN-04 | Cảnh báo quá hạn, hết hạn giấy tờ, vượt ngân sách, công nợ | + **Đơn thuê giàn giáo quá hạn trả**; + **đề nghị từ công trường quá thời hạn cam kết** |
| NEN-05 | Phiên bản bản vẽ, dự toán, báo giá, hợp đồng | + **quy cách sản phẩm, định mức vật tư, biện pháp thi công**; + thông báo phải đến **người dùng hiện trường đang xem bản cũ trên điện thoại** |
| NEN-09 | Tối ưu di động cho Kho và Công trường | + **Xưởng sản xuất** (ba nhóm nghiệp vụ hiện trường) |
| CRM-11 | Ghi chú ngắn về đặc thù NVS | Viết lại: báo giá thuê phải hiển thị **tồn sẵn có theo mã, hàng dự kiến thu hồi, công nợ khách**; phải ghi đơn giá theo mã, phí vận chuyển, tiền cọc, điều khoản bồi thường |
| MH-10 | Yêu cầu mua nguyên liệu NVS (chung) | + Quy cách kỹ thuật bắt buộc (mác thép, đường kính, độ dày, dung sai, mạ kẽm) vì quyết định khả năng đạt chứng chỉ kiểm định |
| KHO-01 | Danh mục kho | + **Đa địa điểm**, gồm 3 cơ sở của NVS (xem Phụ lục D.5) |
| KHO-06 | Quản lý giàn giáo | Mở rộng thành **11 trạng thái vòng đời**, tổng theo mã phải luôn cân bằng |
| NS-04 | Chấm công 3 khối (chung) | Cụ thể hóa nguồn dữ liệu từng khối: văn phòng = máy chấm công; **xưởng = máy chấm công + xác nhận tổ trưởng**; công trường = tổ trưởng báo → kỹ thuật kiểm → chỉ huy trưởng xác nhận |
| NS-09 | Hồ sơ tổ đội / thầu phụ | + Nhấn mạnh đây là khối lớn nhất về số người (~80/100 tại một công trường lớn), hồ sơ an toàn phải kiểm soát chặt như nhân sự công ty |
| BC-04 | Báo cáo tồn kho, hao hụt | + **4 báo cáo NVS chuyên biệt**: giá thành theo lệnh, hiệu suất khai thác tài sản, thất thoát theo khách/công trình, tỷ lệ lỗi theo công đoạn/lô |
| BC-05 | Cảnh báo rủi ro | + Việc chờ duyệt quá hạn cam kết; + đơn thuê quá hạn trả; + sự cố an toàn chưa đóng |

### 3.7 Phụ lục D — MỚI

Danh mục sản phẩm giàn giáo NVS trích từ Catalogue Nhà Việt Steel, dùng làm **bộ mã sản phẩm khởi tạo** cho SX-01 và KHO-02:

| Mục | Nội dung |
|---|---|
| D.1 | Nhóm giáo xây dựng – hoàn thiện (mạ kẽm): 1M50, 1M70, chữ H, 2M tay còng, giằng chéo, thang, mâm giáo, bánh xe, chân kích, bát kích — kèm quy cách mm |
| D.2 | Nhóm giàn giáo nêm: cây chống Φ48 (5 chiều dài), thanh giằng Φ42 (5 kích thước), ống nối D48/D40, U nêm, chêm giằng, U chống truyền, chống đà, cây chống tăng |
| D.3 | Nhóm cốp pha: phủ phim, nhựa, thép, định hình + phụ kiện bát chuồn, tyren, khóa giáo |
| D.4 | **Hồ sơ chứng chỉ kiểm định** — nguồn dữ liệu cho SX-13: INCOSAF (08025, 08024/GCN-KDXD), Bộ Xây dựng (3904/3905/3906/ATXD), IBST (HĐ 154/2022KNIBS), tiêu chuẩn TCXDVN 296-2004 và TCVN 6052-1995 |
| D.5 | 3 địa điểm: xưởng chính Kiến Xương (Thái Bình), Cơ sở 1 Vũ Lạc (TP Thái Bình), Cơ sở 2 Hồng Hưng (Gia Lộc, Hải Dương) — nguồn cho KHO-01 |

Nguyên liệu đầu vào chính ghi trong catalogue: ống thép Hòa Phát, ống thép 190, ống thép Việt Nhật.

**Ba cảnh báo về dữ liệu trong phụ lục này (Claude Code không được tự lấp):**
1. Catalogue ghi **hai địa chỉ khác nhau** cho xưởng chính ở hai vị trí trong cùng tài liệu (Xã Tây Sơn và Xã Vũ Sơn, cùng huyện Kiến Xương). Chưa xác nhận địa chỉ đúng.
2. Catalogue phát hành từ **2022** — chưa xác nhận danh mục còn đúng và chứng chỉ còn hiệu lực.
3. Catalogue **KHÔNG có sản lượng/tháng và phân loại bán hay cho thuê** cho từng mã. Hai thông tin này thuộc "Vấn đề còn mở".

### 3.8 Các mục khác

| Mục PRD | Thay đổi |
|---|---|
| Mục 2.1 Mục tiêu | + 2 mục tiêu mới: quản lý xuyên suốt vòng đời tài sản giàn giáo; tạo luồng liên thông hai chiều công trường – văn phòng |
| Mục 2.3 Nguyên tắc thiết kế | 8 → **11 nguyên tắc**. Ba nguyên tắc mới: *trách nhiệm hai chiều có thời hạn*, *thiết kế cho hiện trường*, *tham số hóa thay vì cố định* |
| Mục 4 Lộ trình | Bỏ hết thời lượng; SX chuyển từ "Giai đoạn 3, mức định hướng" sang **"Giai đoạn 2, phạm vi đầy đủ"** |
| Mục 6 Phi chức năng | + Ngân sách thao tác hiện trường là **tiêu chí nghiệm thu**; + offline mở rộng cho Xưởng; + danh sách thiết bị NVG cần trang bị |
| Mục 7 Tiêu chí thành công | Bỏ nhãn tuần; Giai đoạn 2 từ 1 luồng tăng thành **4 luồng đầu-cuối bắt buộc** |
| Mục 8.1 Rủi ro | + Rủi ro phạm vi mở rộng (kèm **thứ tự cắt giảm định sẵn**); + rủi ro dữ liệu nền chưa chuẩn hóa; + **rủi ro một chiều** |
| Mục 8.2 Giả định | Bỏ giả định "còn thiếu khảo sát 2 bộ phận"; + giả định các phòng ban **cam kết thời hạn phản hồi** |
| Mục 10 Vấn đề còn mở | Bỏ 2 mục về khảo sát thiếu; chia lại thành **3 nhóm**: cần số liệu / cần BGĐ quyết / cần rà soát nội bộ |

---

## 4. Webapp Flow v1.0 → v1.1

### 4.1 Mẫu bố cục: 7 → 9

| Mẫu | Trạng thái | Ghi chú |
|---|---|---|
| 4.1 Dashboard | Giữ nguyên | |
| 4.2 Danh sách | Giữ nguyên | |
| 4.3 Chi tiết ("Hồ sơ 360°") | Giữ nguyên | |
| 4.4 Biểu mẫu / Wizard | Giữ nguyên | |
| 4.5 Kanban | Mở rộng | + hàng chờ nghiệm thu công trường; + hàng thu hồi chờ xử lý tại xưởng |
| 4.6 Hộp thư Phê duyệt | Mở rộng | + **đồng hồ hạn xử lý**, hồ sơ quá hạn đẩy lên đầu |
| **4.7 Request Tracker** | **MỚI** | Màn hình cho người **GỬI** đề nghị (đối xứng với 4.6 dành cho người **DUYỆT**). Hiển thị bước hiện tại, ai đang giữ, chờ bao lâu, hạn còn lại; có nút "Thúc" ghi vào lịch sử |
| 4.8 Màn hình hiện trường di động | Mở rộng | Từ 2 nhóm (Kho, Công trường) → **3 nhóm** (+ Xưởng). Thêm: nút chụp ảnh không bao giờ ẩn sau menu; ưu tiên chọn từ danh sách thay vì gõ; đồng hồ ngân sách thao tác. **Số mục cũ là 4.7, nay là 4.8** |
| **4.9 Asset Ledger** | **MỚI** | Sổ cái tài sản dạng **ma trận: hàng = mã sản phẩm, cột = trạng thái/vị trí**. Mỗi ô bấm được để xem chứng từ tạo ra con số. Dòng tổng mỗi mã phải luôn cân, không cân thì cảnh báo ngay trên dòng |

### 4.2 Hành trình người dùng: 9 → 11

| Mục | Hành trình | Thay đổi |
|---|---|---|
| 3.1 – 3.3 | Kinh doanh, Dự toán, Thiết kế | Giữ nguyên, riêng 3.3 **thêm bước 6: tab Yêu cầu làm rõ (RFI)** |
| **3.4** | **Chỉ huy trưởng / Ban công trường** | **VIẾT LẠI HOÀN TOÀN**, tách thành 2 hành trình: **A — Nhịp hằng ngày** (4 bước, mục tiêu <10 phút) và **B — Vòng đời một hạng mục** (10 bước). Không còn bắt đầu từ menu mà bắt đầu từ màn hình "Công trường hôm nay" |
| 3.5 | Mua hàng | + Đồng hồ hạn xử lý ngay trên hồ sơ ở bước 1 |
| 3.6 | Thủ kho | + Điều chuyển sang cơ sở NVS |
| 3.7 | Kế toán | + **Bước 6: Đối soát thuê giàn giáo** theo kỳ |
| 3.8 | Hành chính – Nhân sự | Cụ thể hóa chấm công 3 khối; + **bước 4: Danh sách tổ đội / nhà thầu phụ** |
| **3.9** | **Điều hành Xưởng (NVS)** | **MỚI** — 8 bước: Dashboard Xưởng → Lệnh sản xuất → Vật tư → Công đoạn → Chất lượng → Nhập kho thành phẩm → Giá thành → Máy móc |
| **3.10** | **Vòng đời một lô giàn giáo cho thuê** | **VIẾT LẠI HOÀN TOÀN** — 8 bước từ báo giá có kiểm tra tồn → sổ cái → xuất kho → chuỗi sự kiện giao–trả → thu hồi kiểm đếm → đối soát → tranh chấp → tất toán |
| 3.11 | Tổng Giám đốc | + **Bước 4: Bảng Việc đang tắc toàn hệ thống** (nhóm theo phòng ban đang giữ hồ sơ) |

### 4.3 Các mục khác

| Mục | Thay đổi |
|---|---|
| 1.3 Nguyên tắc UX | + **Ngân sách thao tác** cho người dùng hiện trường; + **trạng thái chờ phải hiển thị "đang chờ AI"** |
| 2.2 Bộ chọn pháp nhân | + Trường hợp một người nhiều vai trò tại NVS: sidebar hiển thị **hợp nhất**, không bắt chuyển "chế độ vai trò" |
| 2.3 Menu theo vai trò | + 4 vai trò mới: Chỉ huy trưởng/Kỹ thuật hiện trường, Trưởng phòng Thi công, Điều hành Xưởng/PGĐ NVS, Tổ trưởng sản xuất |
| 5.1 Hồ sơ 360° | Từ 1 trung tâm dữ liệu (Dự án/Công trình) → **3 trung tâm**: + **mã sản phẩm giàn giáo**, + **đơn/hợp đồng thuê** |
| 5.4 Trung tâm thông báo | + Thông báo phát hành bản vẽ mới **không tự biến mất** cho đến khi chỉ huy trưởng xác nhận đã đọc |
| 5.5 Màu trạng thái | 5 → **6 màu**: + **Tím = Tranh chấp** (thu hồi/bồi thường giàn giáo chưa thống nhất, số liệu gốc bị khóa) |
| 6.3 Không mất dữ liệu | + Trên hiện trường, ghi vào bộ nhớ thiết bị **ngay khi chạm**, trước khi có mạng |
| 6.7 Trạng thái | + **"Chưa đủ dữ liệu"** — không hiển thị 0 hoặc số ước lượng |
| 7 Bản đồ màn hình | Bổ sung ~20 màn hình mới (in đậm trong tài liệu), chủ yếu thuộc TC và SX |

---

## 5. Backend Schema v1.0 → v1.1

### 5.1 Quy ước mới (Mục 1.4)

| Quy ước | Nội dung |
|---|---|
| **Số lượng vật lý** | Kiểu `numeric` có phần thập phân, KHÔNG dùng số nguyên — vì vật tư và thép tính theo kg, mét, m² với giá trị lẻ |
| **Dấu thời gian hiện trường** | Mọi bản ghi tạo từ thiết bị di động có thêm `client_created_at`, `synced_at`, `client_generated_id` (chống trùng khi đồng bộ) |
| **Trạng thái** | + giá trị `disputed` vào enum chuẩn |

### 5.2 Mẫu phân quyền RLS: 4 → 5

| Mẫu | Trạng thái | Nội dung |
|---|---|---|
| A — Theo pháp nhân | Giữ nguyên | |
| B — Theo người chịu trách nhiệm | Giữ nguyên | |
| C — Theo hạn mức phê duyệt | Mở rộng | + áp cho `production_orders` |
| D — Dữ liệu nhạy cảm hạn chế cột | Mở rộng | + `product_costs` (giá thành sản phẩm) |
| **E — Theo phạm vi hiện trường** | **MỚI** | Người dùng hiện trường chỉ xem/ghi được dữ liệu thuộc công trình hoặc xưởng mình được phân công (`user_site_assignments`). Áp cho cả thao tác ghi khi đồng bộ từ ngoại tuyến |

### 5.3 Mục 3.5 Quy tắc bất biến của chứng từ — MỚI

Ba nhóm dữ liệu không được sửa trực tiếp sau khi phát hành, mọi thay đổi phải là chứng từ điều chỉnh mới có người duyệt:
1. Chứng từ giao nhận và thu hồi giàn giáo có chữ ký hai bên
2. Biên bản nghiệm thu đã ký với Chủ đầu tư / Tư vấn giám sát
3. Chứng từ kế toán thuộc kỳ đã khóa

Kèm quy tắc: đổi `system_parameters` **không hồi tố** — chứng từ lưu snapshot giá tại thời điểm phát hành.

### 5.4 Thực thể mới theo module

| Module | Bảng mới |
|---|---|
| **NEN** | `system_parameters`, `system_parameter_history`, `sla_definitions`, `user_site_assignments` |
| **CRM** | `quote_rental_lines` |
| **HD** | `rental_contract_terms` |
| **TC** (viết lại Mục 4.6) | `site_handover_checklists`, `site_mobilizations`, `site_drawings`, `drawing_acknowledgements`, `work_assignments`, `site_logs`, `site_log_labor`, `site_log_equipment`, `site_log_works`, `site_photos`, `site_attendance`, `material_requests`, `request_tracking`, `request_reminders`, `site_material_receipts`, `site_cost_entries`, `acceptance_checklists`, `acceptance_records`, `acceptance_checklist_results`, `site_issues`, `rfis`, `site_variations`, `subcontractor_quantities`, `safety_records`, `safety_incidents`, `site_scaffolding_holdings`, `site_handovers`, `warranty_claims` |
| **MH** | `material_specs`; + cột `actual_delivered_date` trên `purchase_orders` |
| **KHO** | `opening_balances` |
| **KT** | `rental_settlements`; + cột `is_internal_transfer` trên `cost_entries` |
| **NS** | `payroll_rules`, `piece_rates`, `subcontractor_workers`, `role_backups` |
| **SX** (viết lại Mục 4.12) | `products`, `product_specs`, `product_drawings`, `product_certificates`, `boms`, `bom_lines`, `production_plans`, `production_orders`, `production_order_versions`, `production_material_issues`, `production_stages`, `production_stage_logs`, `quality_inspections`, `quality_defects`, `machines`, `machine_maintenances`, `machine_incidents`, `rental_agreements`, `rental_agreement_lines`, `scaffolding_movements`, `scaffolding_assets`, `scaffolding_returns`, `scaffolding_return_lines`, `compensation_claims`, `compensation_adjustments`, `repair_orders`, `product_costs`, `cost_recalculation_logs` |

### 5.5 API tùy chỉnh mới đáng chú ý

| Endpoint | Vì sao quan trọng |
|---|---|
| `POST /api/sync/batch` | Nhận lô thao tác ngoại tuyến, khử trùng theo `client_generated_id` |
| `GET /api/sla/overdue` | Nguồn cho Bảng Việc đang tắc (TC-10, BC-05) |
| `GET /api/products/:id/availability` | Tồn sẵn có + hàng dự kiến thu hồi, phục vụ báo giá thuê |
| `POST /api/sites/:id/daily-log` + `close-daily-log` | Nhật ký ngày một lần gọi, tự sinh báo cáo ngày/tuần |
| `GET /api/sites/:id/my-requests` + `POST /api/requests/:id/nudge` | Request Tracker + nút Thúc |
| `POST /api/acceptance-records/:id/complete` | Chặn nếu còn tồn tại chưa đóng hoặc công việc che khuất chưa xác nhận |
| `POST /api/subcontractor-quantities/:id/confirm` | Trả về `is_payable` kèm lý do |
| `GET /api/scaffolding/ledger` | Sổ cái ma trận, hỗ trợ `as_of_date` để xem lại quá khứ |
| `GET /api/rental-agreements/:id/balance` | Số dư khách đang giữ, tính từ chuỗi sự kiện |
| `POST /api/rental-settlements/generate` | Tính tiền thuê theo số dư từng ngày |
| `POST /api/rental-agreements/internal` | Đơn thuê nội bộ, áp giá từ `system_parameters` |
| `POST /api/products/:id/recalculate-cost` | Tính lại giá thành theo giá vật tư tại thời điểm chọn |

### 5.6 Nguyên tắc thiết kế lược đồ bổ sung (Mục 2.3)

- **KHÔNG lưu giá trị đã tính được từ chứng từ.** Số dư khách đang giữ, tồn theo trạng thái, tiền thuê lũy kế đều tính từ bảng sự kiện. Nếu cần tăng tốc thì dùng materialized view có lịch làm mới, KHÔNG dùng cột đếm cập nhật thủ công.
- **Mọi con số hiển thị phải truy ngược được về chứng từ gốc** — áp dụng đặc biệt cho Sổ cái tài sản và báo cáo lãi/lỗ.
- **Giao dịch nội bộ:** `rental_agreements` có cột `is_internal`; báo cáo hợp nhất toàn NVG phải **loại trừ** các giao dịch này để tránh đếm hai lần doanh thu.

---

## 6. Implementation Plan v1.0 → v1.1

| Hạng mục | Trước | Sau |
|---|---|---|
| Mốc M0–M3 | Có ngày cụ thể + tiêu chí | **Chỉ có tiêu chí hoàn thành**, không ngày |
| Mục 2.2 | 3 mốc phụ theo ngày (23/08, 06/09, 20/09) | **4 điểm kiểm tra kích hoạt theo tiến độ công việc** (+1 điểm mới sau cụm tài sản cho thuê) |
| Mục 2.2 (mới) | — | **Bảng 4 luồng đầu-cuối bắt buộc của Mốc M2** — M2 chỉ đạt khi cả 4 cùng chạy |
| Mục 3 | 6 tuần × công việc theo tuần | **17 khối công việc đánh số theo thứ tự phụ thuộc** (1.1–1.4, 2.1–2.9, 3.1–3.4) |
| Thứ tự Giai đoạn 2 | KHO → KT → NS → SX (cơ bản) ở cuối | **Sắp lại**: TC nhóm A–B → MH + TC nhóm C → KHO → **SX cụm D (tài sản cho thuê)** → TC nhóm D–E → SX cụm A/B/C/E → KT → NS → BC. Hai ưu tiên số một của hiện trường xong SỚM, không dồn về cuối |
| Hình 1 (biểu đồ lịch trình) | Có | **Đã gỡ** — chứa ngày tháng |
| Mục 4.2 | 8 loại công việc | + **Kiểm thử ngân sách thao tác hiện trường** (Haan tự bấm giờ); + **Chuẩn hóa dữ liệu nền** (NVG thực hiện) |
| Mục 4.3 | Nhịp theo tuần | Nhịp theo khối công việc; + **thứ tự cắt giảm định sẵn** |
| Mục 5.3 | "Demo Day 25/09/2026" | "Buổi trình diễn khi đạt M3"; + đề xuất 4 kịch bản khớp 4 luồng M2 |
| Mục 6 Rủi ro | Có rủi ro "dữ liệu khảo sát còn thiếu" | **Gỡ** (khảo sát đã đủ). **Thêm 3 rủi ro mới**: phạm vi Giai đoạn 2 tăng mạnh; dữ liệu nền chưa chuẩn hóa; phòng ban không cam kết thời hạn phản hồi |
| Mục 7 | 5 vấn đề còn mở | 8 vấn đề, gắn với khối công việc bị ảnh hưởng |

**Thứ tự cắt giảm nếu buộc phải cắt (Mục 4.3):**
- **Giữ bằng mọi giá:** SX-15 → SX-21 (vòng đời tài sản cho thuê) và TC-05, TC-09, TC-10, TC-13 (liên thông công trường – văn phòng). Đây là ưu tiên số một mà chính hai bộ phận tự nêu.
- **Có thể hoàn thiện dần sau:** SX-07 (định mức), SX-10 (năng suất chuẩn), SX-22 (giá thành) — vì các phần này cần dữ liệu thực tế tích lũy mới có ý nghĩa.

---

## 7. Tech Stack v1.1 → v1.2

| Mục | Trước | Sau |
|---|---|---|
| 1.3 Nguyên tắc | "demo 95% trong 1,5 tháng" | "lộ trình 3 giai đoạn" |
| 1.4 Bảng tổng hợp | "Di động & Offline (Kho)" | **"Di động & Offline (Kho, Xưởng, Công trường)"** |
| 2.1, 2.2 | "7 mẫu bố cục" | **"9 mẫu bố cục"** |
| **2.5** | Ngoại tuyến chỉ cho Kho; tham chiếu Webapp Flow Mục 4.7 | **Ngoại tuyến cho cả 3 nhóm hiện trường**; tham chiếu Mục 4.8. Hàng đợi mở rộng: nhập/xuất kho, **nhật ký và ảnh hiện trường, ghi nhận công đoạn sản xuất, checklist nghiệm thu**. Mỗi thao tác mang `client_generated_id` để khử trùng |
| 2.6, 3.2, 4.1, 4.5, 5.7, 6 | Nhiều cụm "6 tuần", "1,5 tháng" | Thay bằng diễn đạt không gắn thời gian |
| 6 (bảng phương án thay thế) | "PWA đủ đáp ứng KHO-09" | "PWA đủ đáp ứng **KHO-09, TC-07**" |
| **7 Vấn đề còn mở** | 6 mục | **9 mục** — thêm: **chiến lược lưu trữ ảnh hiện trường/sản xuất** (đo dung lượng thật rồi quyết định điểm chuyển sang Cloudflare R2); **hiệu năng sổ cái tài sản** (đo rồi quyết định điểm chuyển sang materialized view); **ngân sách thao tác hiện trường** (đo bằng thiết bị và mạng thật tại công trường) |

**Không thay đổi:** toàn bộ lựa chọn công nghệ (React 18 + TypeScript + Vite, Tailwind + shadcn/ui, Supabase, Cloudflare Workers + Hono, Drizzle ORM, Gemini API), kiến trúc backend kết hợp, ước tính chi phí vận hành.

---

## 8. Content Guidelines v1.1 → v1.2

| Mục | Thay đổi |
|---|---|
| 1.2 | "7 mẫu bố cục" → **"9 mẫu bố cục"**; cập nhật tham chiếu chéo |
| **5.1 Thư viện nhãn trạng thái** | Thêm dòng thứ 6: **Tím / "Tranh chấp"** — hồ sơ thu hồi hoặc bồi thường giàn giáo chưa thống nhất với khách hàng, số liệu gốc bị khóa. Ghi chú "quy về một trong 5 màu" → **"6 màu"** |
| **5.6 Trạng thái rỗng** | Thêm 4 dòng: **SX — Sản xuất**, **SX — Cho thuê**, **SX — Tài sản** (chưa chốt số dư ban đầu), **BC — Báo cáo** ("Chưa đủ dữ liệu để tính chỉ số này…") |
| 6.3 Bảng màu | "5 trạng thái" → **"6 trạng thái"**; thêm **Tranh chấp (tím #8270DB)**. **Ảnh bảng màu vẫn là bản v1.1 nên chưa có màu Tím — chú thích hình đã ghi rõ, lấy bảng chữ làm chuẩn** |
| 4.3, 6.7 | Gỡ các cụm còn gắn mốc thời gian dự án; giữ nguyên quy tắc định dạng ngày `dd/mm/yyyy` cho giao diện |

**Không thay đổi:** toàn bộ Mục 2 (Voice & Tone), Mục 3 (Messaging Strategy), Mục 4.1–4.2, 4.4–4.9 (Style Guide), Mục 5.2–5.5 (thư viện nút, thông báo, email, lỗi), Mục 6.1–6.2, 6.4–6.7 (phong cách Jira, typography, spacing, iconography, dark mode).

---

## 9. Danh sách chặn triển khai — Claude Code KHÔNG được tự điền

Những mục dưới đây chưa có dữ liệu thật. Khi gặp, hệ thống phải để **cấu hình được** với giá trị tạm và hiển thị **"chưa đủ dữ liệu"**, tuyệt đối không đoán số.

### 9.1 Cần NVG cung cấp số liệu

| # | Nội dung | Chặn hạng mục nào |
|---|---|---|
| 1 | Sản lượng/tháng và phân loại bán hay cho thuê cho **từng mã sản phẩm** | SX-01, SX-06, BC-04 |
| 2 | **Bộ định mức nguyên vật liệu hiện hành** (đang trên file/bản giấy do trưởng bộ phận sản xuất giữ) | SX-07, SX-08, SX-22 |
| 3 | **Cơ chế tính lương công nhân xưởng** (xưởng dùng máy chấm công, nhưng cách tính lương chưa rõ) | NS-06, `payroll_rules`, `piece_rates` |
| 4 | **Phương thức ghi nhận công tại công trường** (đang cân nhắc ảnh + timestamp + vị trí) | TC-08, NS-04, `site_attendance` |
| 5 | Dữ liệu 12 tháng về thất thoát và hư hỏng giàn giáo | BC-04 (báo cáo thất thoát) |

### 9.2 Cần Ban Giám đốc quyết — đều là tham số cấu hình được

| # | Tham số | Ghi vào đâu |
|---|---|---|
| 1 | **Mức giá thuê nội bộ** (việc ghi nhận là bắt buộc, mức giá do BGĐ quyết) | `system_parameters`, dùng bởi SX-21 |
| 2 | **Bảng giá bồi thường thiếu – hỏng** theo mã (khởi tạo tạm, admin sửa sau) | `system_parameters`, dùng bởi SX-19 |
| 3 | **Ngưỡng tỷ lệ lỗi sản xuất** theo nhóm sản phẩm / giai đoạn / lô | `system_parameters`, dùng bởi SX-12 |
| 4 | **Thời hạn cam kết phản hồi từng phòng ban** | `sla_definitions`, dùng bởi TC-10, MH-02 |
| 5 | Hạn mức phê duyệt chính thức | `approval_limits` |
| 6 | Phần mềm kế toán chính thức sẽ tích hợp | KT-08, `accounting_exports` |
| 7 | Danh mục mã vật tư / mã công trình / mã nhà cung cấp chính thức | KHO-02 |

> **Không có tham số #4 thì cơ chế cảnh báo quá hạn (TC-10) không có căn cứ để chạy** — đây là điều kiện tiên quyết của khối công việc 2.2 trong Implementation Plan.

### 9.3 Cần rà soát nội bộ

1. Địa chỉ xưởng sản xuất chính của NVS (catalogue ghi mâu thuẫn: Xã Tây Sơn vs Xã Vũ Sơn)
2. Tính cập nhật của Catalogue 2022 (danh mục sản phẩm, hiệu lực chứng chỉ kiểm định)

---

## 10. Checklist đọc nhanh cho Claude Code

Trước khi bắt đầu bất kỳ khối công việc nào, kiểm tra:

- [ ] Dùng đúng bộ tài liệu phiên bản mới (Mục 0), không dùng bản cũ
- [ ] Không hard-code bất kỳ giá trị nào nằm trong `system_parameters` (Mục 2.4, 9.2)
- [ ] Với dữ liệu tài sản cho thuê: số dư tính từ **chuỗi sự kiện**, không lưu cột đếm (Mục 5.6)
- [ ] Với mọi bảng: áp đúng một trong 5 mẫu RLS, chú ý **Mẫu E** cho dữ liệu hiện trường (Mục 5.2)
- [ ] Với thao tác từ thiết bị di động: có đủ `client_created_at`, `synced_at`, `client_generated_id` (Mục 5.1)
- [ ] Với chỉ số chưa có dữ liệu thật: hiển thị "chưa đủ dữ liệu", không hiển thị 0 (Mục 2.4)
- [ ] Với chứng từ đã phát hành: không sửa trực tiếp, chỉ lập chứng từ điều chỉnh (Mục 5.3)
- [ ] Với màn hình hiện trường: kiểm tra ngân sách thao tác ≤20 phút/ngày bằng thiết bị thật (Mục 3.3)
- [ ] Với báo cáo hợp nhất toàn NVG: loại trừ giao dịch `is_internal` (Mục 5.6)
- [ ] Nếu phải cắt giảm phạm vi: theo đúng thứ tự đã định ở Mục 6, không tự chọn
