# Kế hoạch: bổ sung cho khớp luồng anh Thi mô tả

**Nguồn yêu cầu:** phiếu Ban Giám đốc (anh Bùi Văn Thi) trong `doc/khao-sat/HoSo_KhaoSat_NVG_full.md`, dòng 592–1056.

**Đối chiếu ngày 29/10/2026** (từng yêu cầu kiểm trong mã, có chạy phép thử): 66 yêu cầu, trong đó 19 Đã có, 36 Một phần, 11 Chưa có.

**Tài liệu này phủ 47 yêu cầu Một phần / Chưa có.** Mã trong ngoặc là mã dòng của bảng đối chiếu:
- NVO1–13: 13 bước nhà ở trọn gói (dòng 705–733);
- NVS1–12: 12 bước giàn giáo (dòng 767–793);
- A1–A13: bảng phê duyệt (822–859);
- M1–M18: tiền, số liệu, hồ sơ (870–938);
- X1–X10: nguyên tắc chung (797–807, 980, 999).

Theo QĐ-1, tài liệu chỉ ghi thứ tự và tiêu chí xong, không ghi mốc thời gian.

**Thứ tự theo đúng ưu tiên anh Thi nêu (dòng 959–965):** thí điểm trọn MỘT vòng trên 1–2 công trình NVC: cơ hội → dự toán và duyệt giá → hợp đồng → bàn giao thi công → ngân sách → chi phí → nghiệm thu → thu tiền → lãi / lỗ. Mở rộng sau khi vòng này chạy được. Vì vậy:
- Giai đoạn A khép vòng tiền của một công trình;
- B là quản trị phê duyệt;
- C là NVS;
- D là số liệu cho Ban Giám đốc;
- E là liên công ty.

Kế hoạch Thi công T5–T9 (`doc/KE_HOACH_THI_CONG_THEO_KHAO_SAT.md`) được gộp vào các mục dưới.

---

## Giai đoạn A — Khép vòng tiền của một công trình (thí điểm)

**Xong giai đoạn khi:** một công trình NVC thử đi trọn vòng trên bằng đúng các vai, và lãi / lỗ ba cấp đối soát được bằng tay.

### A1. Giá bán có giá vốn và lợi nhuận khi duyệt (NVO6, A1, M6)
**ĐÃ LÀM (0244, gói G1, 29/10/2026)** — giá vốn từng hạng mục hoặc từ dự toán đã duyệt (Mẫu D, bảng riêng, chỉ qua
hàm có nhật ký); Kinh doanh không thấy giá vốn / lợi nhuận / % (cùng cách `estimate_cost_breakdown`); người có quyền xem
giá vốn nhập khi Nháp hoặc đang chờ duyệt; `min_margin_percent` theo pháp nhân để TRỐNG, có số thì dưới mức (hoặc chưa đủ
giá vốn) chỉ Tổng Giám đốc duyệt (`low_margin_price`), áp cả dự toán thầu; hộp duyệt hiện doanh thu, giá vốn, lợi nhuận,
%, điều kiện thanh toán, rủi ro. Kèm NVO việc 2: báo giá thiết kế / thi công / trọn gói tách chuỗi phiên bản.
Còn chờ NVG: mức lợi nhuận tối thiểu từng công ty; có cho Kinh doanh xem % lợi nhuận không.
- Báo giá CRM có cột giá vốn từng dòng, hoặc lấy từ dự toán gắn kèm. Gói thầu NVC đã có dự toán với lợi nhuận.
- Hộp duyệt giá hiện doanh thu, giá vốn, lợi nhuận, % lợi nhuận và điều kiện thanh toán.
- Tham số `min_margin_percent` cho từng pháp nhân. Dưới mức này thì phê duyệt chuyển lên Tổng Giám đốc và hiện cảnh báo. Tham số để TRỐNG thì không áp.
- Giá vốn là Mẫu D: Kinh doanh không có quyền xem thì chỉ thấy % lợi nhuận, hoặc không thấy gì (cần quyết).
- **Xong khi:** báo giá dưới mức tối thiểu không qua được người có hạn mức thấp hơn Tổng Giám đốc.
- **Cần NVG:** lợi nhuận tối thiểu từng công ty; Kinh doanh có được xem giá vốn không.

### A2. Gói bàn giao sang Thi công và lãi dự kiến đóng băng (NVO8, M3, T9)
- Bàn giao là danh mục: hợp đồng (phạm vi và tiến độ, KHÔNG có giá với Thi công), bản vẽ đang hiệu lực, BOQ / dự toán, danh mục vật tư, cam kết với khách, danh sách rủi ro.
- Mỗi mục có người giao và người nhận xác nhận. Thiếu mục bắt buộc thì cảnh báo.
- Lúc ký hợp đồng, chụp lại giá bán và ngân sách được duyệt thành **lãi dự kiến** của công trình. Số này bất biến; về sau chỉ thêm bản điều chỉnh có duyệt.
- **Xong khi:** trang lãi / lỗ hiện được «lúc nhận việc» bên cạnh «dự báo».

### A3. Ngân sách có duyệt, mua vượt ngân sách phải duyệt lại (A3, A7, NVO10)
- Sửa dòng ngân sách sau khi khởi công phải qua phê duyệt «điều chỉnh ngân sách», có lý do, và lưu lịch sử.
- Đề nghị mua vượt dòng ngân sách còn lại không bị chặn. Thay vào đó nó vào luồng duyệt riêng, lên cấp cao hơn.
- **Xong khi:** không có đường nào để tổng cam kết vượt ngân sách mà không có người duyệt ghi tên.
- **Cần NVG:** ai duyệt vượt ngân sách; có dung sai (ví dụ 5 %) không.

### A4. Thanh toán gắn căn cứ (A5, M2, NVO10, A4, T5)
- **Xác nhận khối lượng tổ đội / nhà thầu phụ theo đợt** (T5): kỳ này, luỹ kế, chỉ tính phần đã nghiệm thu, tổ trưởng ký, Trưởng phòng Thi công xác nhận.
  - Hai cách khoán (bảng đơn giá / khoán gọn) và tỷ lệ giữ lại bảo hành tùy chọn: anh Dũng đã chốt.
- **Đề nghị thanh toán** cho tổ đội / nhà thầu phụ bắt buộc gắn đợt xác nhận khối lượng hoặc biên bản nghiệm thu.
  - Thanh toán nhà cung cấp gắn đơn hàng và phiếu giao nhận.
  - Không được vượt số còn lại của đơn hàng / hợp đồng khoán.
- **Chọn nhà thầu phụ / tổ đội:**
  - so sánh 2–3 báo giá (dùng lại bảng so giá 4B);
  - đi qua phê duyệt theo hạn mức;
  - xong thì sinh hợp đồng khoán từ mẫu NVO-HĐ-05 / NVC tương ứng.
- **Chuỗi hồ sơ** đi tiếp tới đề nghị thanh toán và chứng từ chi.
- **Xong khi:** từ một khoản chi bấm ngược được tới đề nghị → nghiệm thu / khối lượng → hợp đồng khoán / đơn hàng → dòng ngân sách → người duyệt.
- **Cần NVG:** hạn mức chọn nhà thầu phụ; tổ đội nhỏ có được miễn so sánh giá không.

### A5. Giá trị khối lượng đã làm nhưng chưa nghiệm thu / chưa thu (M8)
- Mỗi đợt nghiệm thu nội bộ hoặc kế hoạch tuần mang giá trị, tính bằng khối lượng × đơn giá hợp đồng.
- Bảng cho từng công trình: đã làm · đã nghiệm thu với khách · đã đề nghị thu · đã thu.
- **Xong khi:** Ban Giám đốc thấy «đã làm mà chưa đòi được tiền» của từng công trình, không cần hỏi Zalo.
- **Cần NVG:** ai định giá khối lượng (QS / Dự án / chỉ huy trưởng), bao lâu một lần.

### A6. Quyết toán và lãi / lỗ thực tế (NVO12, M5)
- Hợp đồng có giá trị quyết toán: giá hợp đồng + phát sinh đã duyệt − giảm trừ.
- Có khoản giữ lại bảo hành và hạn thu khoản đó.
- Hồ sơ hoàn công là mục bắt buộc của bàn giao.
- Lãi / lỗ thực tế = doanh thu quyết toán − chi phí trực tiếp − chi phí bảo hành thực tế − chi phí chung phân bổ (tham số).
- **Xong khi:** công trình đã quyết toán có đủ ba con số (dự kiến, dự báo, thực tế) và chênh lệch giải thích được theo khoản mục.
- **Cần NVG:** cách phân bổ chi phí chung (theo % doanh thu hay theo giờ công); tỷ lệ giữ lại bảo hành mặc định.

### A7. Dòng tiền theo công trình / hợp đồng, công nợ có người đòi (M1, M9)
- Dòng tiền tuần lọc và gộp được theo công trình, hợp đồng, khoản mục.
- Mỗi khoản phải thu có người chịu trách nhiệm thu (mặc định là người chịu trách nhiệm hợp đồng) và mức khả năng thu hồi.
- Tuổi nợ hiện theo người đó.
- **Xong khi:** CFO lọc được «công nợ quá 60 ngày của Kinh doanh A».

---

## Giai đoạn B — Quản trị phê duyệt (giảm phụ thuộc Tổng Giám đốc / CFO)

**Xong giai đoạn khi:** Tổng Giám đốc đi vắng 3 ngày mà không hồ sơ nào kẹt quá thời hạn.

### B1. Ủy quyền duyệt có thời hạn (A12)
- Bảng ủy quyền gồm: người ủy quyền, người nhận, loại phê duyệt, hạn mức, từ ngày tới ngày.
- Hàm kiểm quyền duyệt đọc bảng này. Hết hạn thì quyền tự mất.
- Mọi quyết định theo ủy quyền ghi rõ «thay mặt …».
- **Cần NVG:** ai được nhận ủy quyền (CFO, người phụ trách từng công ty), có giới hạn hạn mức không.

### B2. Quá hạn tự chuyển cấp (A11, X2)
- Hồ sơ chờ duyệt quá thời hạn (`sla_definitions`) thì tự báo lên cấp trên kế tiếp và hiện trên Tổng quan điều hành.
- Áp cho cả đề nghị từ công trường và đề xuất phát sinh.
- Cần cây báo cáo: người quản lý trực tiếp của từng vai / từng người.
- **Cần NVG:** thời hạn thật từng loại phê duyệt; ai là cấp trên của ai ở từng công ty.

### B3. Hạn mức theo dự án (A9)
- Hạn mức có thêm chiều dự án / công trình. Ví dụ chỉ huy trưởng công trình lớn được duyệt mua tới X.
- **Cần NVG:** có công trình nào cần hạn mức riêng không.

### B4. Phê duyệt nhân sự còn thiếu (A6)
- Thêm loại phê duyệt: điều chỉnh lương, điều chuyển, chấm dứt hợp đồng lao động.
- Máy không đề xuất số lương (PRD 2.3), chỉ đưa hồ sơ đi đúng người duyệt.
- Lương là Mẫu D.

### B5. Đầu tư, vay, bảo lãnh (A8)
- Một loại phê duyệt chung «Quyết định tài chính lớn», kèm hồ sơ phương án.
- Ưu tiên thấp.

---

## Giai đoạn C — NVS cho thuê, bán, sản xuất

**Xong giai đoạn khi:** một đơn thuê ngoài, một đơn thuê nội bộ NVC, một đơn bán đi trọn từ báo giá tới tất toán, và sổ giàn giáo đối soát được với Kế toán.

### C1. Đơn thuê nối hợp đồng, báo giá thuê có duyệt (NVS3, NVS1)
- **Đã làm (0245, 29/10/2026, G5):** `contract_id` + «Lập từ hợp đồng cho thuê đã ký»; `rental_quotes` lưu theo khách, dòng mua / thuê, vận chuyển, in; giá dưới bảng giá hoặc vượt `sx.customer_credit_limit` (trống = không kiểm) → Ban Giám đốc duyệt (`rental_quote`).
- `rental_agreements.contract_id`. Lập đơn thuê từ hợp đồng cho thuê đã ký, lấy sẵn khách, hàng và giá, không nhập lại.
- Báo giá thuê lưu được, đi qua phê duyệt khi có giá đặc biệt, in theo mẫu.
- Có hạn mức công nợ khách: vượt thì phải duyệt.
- Nhu cầu của khách ghi theo dòng: mã, số lượng, mua hay thuê, vận chuyển.
- **Cần NVG:** hạn mức công nợ từng khách hoặc chung.

### C2. Thuê nội bộ NVC / NVO — QĐ-6 (NVS11, X6, M16)
- **Đã làm (0245, G5):** cờ `is_internal` do trigger đặt; đề nghị từ tab «Giàn giáo» của công trình → Xưởng → Ban Giám đốc NVS → xuất; giá nội bộ lưu ở `daily_rate` (`price_source = noi_bo`); chi phí vào ngân sách công trình (`THUE_GIAN_GIAO_NB`, `internal_rental_charges`); BC Tổng quan tài chính và Lãi/lỗ khi xem toàn NVG loại phần nội bộ. Còn: tuổi nợ / dòng tiền tuần toàn NVG.
- Đơn thuê có cờ nội bộ, bắt buộc khi khách là pháp nhân trong NVG.
- Giá nội bộ tự áp từ tham số `internal_rental_price`, lưu `unit_price_applied`, không hồi tố.
- Chỉ huy trưởng gửi đề nghị thuê từ công trình; NVS duyệt.
- Tiền thuê nội bộ vào chi phí ngân sách công trình NVC / NVO.
- Báo cáo hợp nhất toàn NVG loại trừ cả doanh thu lẫn chi phí nội bộ.
- **Xong khi:** doanh thu NVS + chi phí NVC của cùng đơn nội bộ triệt tiêu ở số toàn NVG.
- **Cần NVG:** chính sách giá nội bộ (đang để DEMO 70 % giá ngoài).

### C3. Kiểm tồn đúng và điều chuyển khi đang thuê (NVS2, NVS8)
- **Đã làm (0245, G5):** `rental_availability` ba nhóm riêng; `rental_transfers` ký hai bên, chốt tiền đơn nguồn, mở đơn mới, chuyển lô không qua kho. «Hàng đang sửa sắp xong» chưa có ngày dự kiến sửa xong (C4) — hiện cả nhóm đang sửa.
- Kiểm tồn khi báo giá cộng thêm hàng dự kiến thu hồi trước ngày giao và hàng đang sửa sắp xong. Hai nhóm này hiện riêng, không trộn vào tồn chắc chắn.
- Điều chuyển hàng giữa hai công trình của cùng khách, hoặc từ công trình nội bộ này sang công trình khác, mà không qua kho; có biên bản.

### C4. Sửa chữa và hiệu suất tài sản (NVS10, NVS12, M15)
- Phiếu sửa chữa gồm vật tư, nhân công, chi phí, kết quả; sửa xong thì về «còn dùng được».
- Có trạng thái «chờ thanh lý» và «đã thanh lý».
- Báo cáo theo nhóm tài sản: số ngày cho thuê / số ngày sẵn có, doanh thu, chi phí sửa, bồi thường thu được.

### C5. Đơn bán hàng (NVS7)
- Luồng đơn bán → xuất kho → phiếu giao ký nhận → hoá đơn (liên kết phần mềm hoá đơn, không thay) → tiền đặt trước → công nợ.

### C6. Sản xuất (NVS4, NVS5, NVS6) — bị chặn vì thiếu dữ liệu Xưởng
- Định mức vật tư theo mã sản phẩm, có phiên bản.
- Lệnh sản xuất cấp vật tư theo định mức, thiếu thì sinh đề nghị mua.
- Theo dõi công đoạn cắt – hàn – làm sạch – sơn / mạ – kiểm tra, theo tổ, gồm số đạt, lỗi, thời gian.
- Kiểm tra chất lượng từng lô. Hàng đạt nhập kho thành phẩm tự động; lỗi chuyển sửa hoặc phế.
- Giá thành lệnh = vật tư thực xuất + nhân công + phân bổ.
- **Cần NVS:** bộ định mức hiện hành, danh sách công đoạn, tiêu chí đạt / lỗi, tỷ lệ lỗi cho phép, mã nào bán / mã nào cho thuê. Thiếu những dữ liệu này thì không làm được: phiếu Xưởng ghi «không nên ước lượng».

---

## Giai đoạn D — Số liệu cho Ban Giám đốc

### D1. Màn hình buổi sáng đủ 10 mục (X3)
- Thêm vào Tổng quan điều hành những mục còn thiếu:
  - khách hàng mới;
  - năng suất bộ phận;
  - tồn kho;
  - nhân sự – chấm công;
  - chi phí so với dự toán từng công trình.
- Mỗi công ty vẫn một khung như đã chốt.

### D2. Cảnh báo sớm (M6)
- Lợi nhuận dự báo dưới mức tối thiểu (dùng tham số của A1).
- Khối lượng đã làm quá N ngày chưa nghiệm thu (dùng A5).
- Thu chậm so với tiến độ.

### D3. Hiệu quả và năng suất (M11, M12, M13, T7)
- Lợi nhuận theo khách hàng, nhân viên kinh doanh, nhà cung cấp, nhà thầu phụ.
- Chi phí tham gia thầu.
- Máy móc tại công trường (T7): danh sách, ca máy trong nhật ký.
- Năng suất tổ đội = khối lượng xác nhận / công (từ A4 + điểm danh).

### D4. Hồ sơ và rủi ro (M17, M18, T6)
- Kho hồ sơ ghi mượn / trả và vị trí bản gốc.
- Bảo lãnh hợp đồng (tạm ứng, thực hiện, bảo hành) có hạn và được nhắc.
- Biên bản họp có người quyết định và thời điểm.
- Sổ rủi ro theo công trình.
- Sổ an toàn lao động gọn (T6).

### D5. Kho (M14, T8)
- Vật tư chậm luân chuyển, hao hụt, phế liệu.
- Ảnh hiện trường có GPS và hạng mục (T8).

---

## Giai đoạn E — Liên công ty và việc chung

### E1. Nhân sự dùng chung nhiều công ty (X7)
- Ghi thời gian / chi phí theo đơn vị sử dụng để phân bổ.
- **Cần NVG:** cách ghi (theo % cố định hay theo việc).

### E2. Giới thiệu khách giữa công ty (X8)
- Một bước «Chuyển cho NVO / NVC / NVS» trên đầu mối / cơ hội, giữ người giới thiệu để tính hiệu quả.

### E3. Việc chung có người phối hợp (X1)
- Việc có người chịu trách nhiệm, người phối hợp, đầu ra bắt buộc, thời hạn.
- Dùng cho những việc không thuộc hồ sơ nào: họp, sự cố, việc liên phòng ban.

---

## Việc nhỏ và việc chờ bên ngoài

- **Đầu mối ghi luôn ngân sách và thời gian dự kiến** (NVO1).
- **Gửi email thật** (X9): chờ tài khoản Resend và DNS nhavietgroup.vn.
- **Thay giá trị DEMO bằng số thật** (X10): số ngày nhắc, thời hạn xử lý, giá thuê, bồi thường.

  Lưu ý cho người làm phép thử: phép thử CSDL tự đặt lại vài tham số DEMO về trống sau mỗi lượt chạy (thấy ngày 29/10). Sau khi chạy phép thử phải nạp lại kịch bản `mac-dinh`.

---

## Câu hỏi gom lại cho NVG (chặn đúng mục ghi trong ngoặc)

1. Lợi nhuận tối thiểu từng công ty. Kinh doanh có được xem giá vốn không (A1, D2).
2. Ai duyệt mua vượt ngân sách, có dung sai không (A3).
3. Hạn mức chọn nhà thầu phụ. Tổ đội nhỏ có miễn so sánh giá không (A4).
4. Ai định giá khối lượng đã làm, bao lâu một lần (A5).
5. Cách phân bổ chi phí chung. Tỷ lệ giữ lại bảo hành mặc định (A6).
6. Ai được nhận ủy quyền duyệt, giới hạn ra sao (B1).
7. Thời hạn thật từng loại phê duyệt. Cây cấp trên từng công ty (B2).
8. Hạn mức công nợ khách NVS (C1).
9. Chính sách giá thuê nội bộ (C2).
10. Bộ định mức, công đoạn, tiêu chí chất lượng của Xưởng (C6).
11. Cách phân bổ nhân sự dùng chung (E1).

Mục nào chưa có câu trả lời thì làm theo phương án an toàn: tham số để TRỐNG, chỉ cảnh báo, không chặn. Phương án dùng được ghi rõ trong mô tả tham số.

---

## Bổ sung: luồng nhà xưởng NVC (phiếu anh Thi dòng 735–765)

Đối chiếu ngày 29/10/2026 cho 14 bước: 5 Đã có, 9 Một phần, 0 Chưa có. Chuỗi «dự toán thầu → ngân sách → mua hàng → khối lượng → nghiệm thu → thanh toán → quyết toán → lãi / lỗ» (dòng 765) đứt ở ba khâu:
- khối lượng;
- thanh toán nhà thầu phụ;
- quyết toán.

Ba việc mới, chưa có ở các giai đoạn trên:
- **A8 Hồ sơ thanh toán với chủ đầu tư.**
  - Công trường → Thi công → Dự án / QS → Kế toán cùng kiểm trước khi gửi chủ đầu tư.
  - Ghi đủ các số: số đề nghị, số chủ đầu tư duyệt, hoá đơn, đã thu, giữ lại.
- **A9 Bảo lãnh và tiền giữ lại.**
  - Bảo lãnh tạm ứng / thực hiện / bảo hành có hạn và được nhắc trước khi hết.
  - Tiền giữ lại có hạn thu hồi; khi thanh lý hợp đồng thì nhắc thu hồi.
- **A10 Gói thầu có hình thức và quyết định tham gia.**
  - Gói thầu ghi rõ hình thức: chỉ định / chào giá / đấu thầu.
  - Ban Giám đốc duyệt có tham gia hay không, kèm lý do.
  - Cung ứng, Thi công, Kế toán góp ý ngay trên gói thầu.

## Gói việc giao agent (đợt 1)

**Quy tắc chung cho mọi gói:**
- **Migration:** mỗi gói có dải số migration riêng, áp tay bằng psql. Agent KHÔNG sửa `_journal.json`; người gộp thêm mục journal khi gộp.
- **Phép thử:** phép thử CSDL qua khoá chung, `maxForks=1`.
- **Chạy thử trình duyệt:** chỉ khi máy còn hơn 1,5 GB RAM.
- **Cấm:** không commit, không gọi AI trả phí.
- **Chưa có câu trả lời của NVG:** tham số để TRỐNG, chỉ cảnh báo, không chặn.
- **Máy 8 GB:** chạy tối đa hai gói cùng lúc.

| Gói | Nội dung | Mục kế hoạch | Công ty | Migration | Đi cặp |
|---|---|---|---|---|---|
| G1 | Báo giá có giá vốn, lợi nhuận, mức tối thiểu → Tổng Giám đốc; tách báo giá thiết kế / thi công; dự toán thầu có mức tối thiểu và rủi ro | A1 + NVO việc 2 | NVO, NVC | 0244 | Đợt 1a |
| G5 | Đơn thuê nối hợp đồng, báo giá thuê lưu và duyệt, hạn mức công nợ; thuê nội bộ QĐ-6; kiểm tồn có lịch thu hồi; điều chuyển | C1–C3 | NVS (+ NVC / NVO nhận) | 0245 | Đợt 1a |
| G2 | Nhà thầu phụ trọn vòng: so giá → duyệt chọn → hợp đồng khoán → xác nhận khối lượng đợt → đề nghị thanh toán gắn đợt / nghiệm thu, không vượt số còn lại → công nợ, đánh giá | A4 (+ T5) | NVC, NVO | 0246 | Đợt 1b |
| G6 | Gói thầu: hình thức, duyệt tham gia, góp ý Cung ứng / Thi công / Kế toán | A10 | NVC | 0247 | Đợt 1b |
| G3 | Hồ sơ thanh toán chủ đầu tư; bảo lãnh; tiền giữ lại | A8, A9 | NVC (+ NVO) | 0248 | Đợt 1c |
| G4 | Gói bàn giao, điều kiện khởi công, lãi dự kiến chốt lúc ký; ngân sách sửa có duyệt; mua vượt ngân sách phải duyệt lại | A2, A3 | NVC, NVO | 0249 | Đợt 1c |

**Các đợt sau** (lập gói khi xong đợt 1):
- A5 khối lượng chưa nghiệm thu, A6 quyết toán và lãi / lỗ thực tế, A7 dòng tiền theo công trình;
- NVO tỷ lệ chuyển thiết kế → thi công;
- C4 sửa chữa và hiệu suất tài sản, C5 đơn bán;
- B1–B5 phê duyệt;
- D1–D5 số liệu;
- C6 sản xuất (chờ Xưởng);
- E.
