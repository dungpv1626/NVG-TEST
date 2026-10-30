# Kế hoạch «Bộ ý tưởng cho khách» (anh Dũng đồng ý hướng 30/10/2026)

## Vì sao đổi hướng

- AI Design đã định vị là **phác thảo ý tưởng gặp khách**, không phải hồ sơ thiết kế.
- Thử 4 đầu bài sát khách ngày 30/10 thì 0/4 ra mặt bằng.
- Khung nhà ống T189 không gỡ được, vì chặn thật là chiều sâu tối thiểu của lô (xem `QUYET_DINH_AI.md` T189).
- Phối cảnh, mặt đứng và ảnh nội thất đã chạy được trên 9272, nhưng **bị khoá cho tới khi có mặt bằng đạt**.
- Thứ khách cần để hình dung ngôi nhà là nhà trông thế nào và phòng nào ở đâu, không phải tường và cửa đúng từng cm.

## Bộ ý tưởng gồm gì

1. **Phối cảnh mặt tiền và mặt đứng** dựng thẳng từ đầu bài, không cần mặt bằng.
   - Khung lấy từ bề ngang, chiều sâu xây được, số tầng, ban công, mái và phong cách.
   - Cửa sổ và cửa chính xếp theo nếp từng tầng.
2. **Sơ đồ công năng từng tầng**: các khối có tên phòng, theo thứ tự trước → sau.
   - Không kích thước, không tường, không cửa.
   - Do chương trình dựng, không gọi AI, không tốn tiền.
3. **Báo «đầu bài có vừa lô không»** (đi cùng sơ đồ, cùng một phép tính chiều sâu).
   - Không vừa thì nói rõ thiếu bao nhiêu mét.
   - Gợi ý cách nới đầu bài: bỏ hoặc dời giếng trời, thu phòng khách, bếp – ăn chung, thêm tầng.
4. **Gửi khách bằng đường dẫn xem có hạn**: kiến trúc sư duyệt trước, dấu «Phương án ý tưởng — chưa phải thiết kế», không kích thước, không DXF, không tải về.

Mặt bằng AI giữ nguyên làm công cụ cho kiến trúc sư, không còn là điều kiện để có mặt ngoài.

## Các bước

| Bước | Việc | Tốn tiền AI | Ước tính máy làm |
|---|---|---|---|
| B1 | Bộ tính «dải theo chiều sâu» từng tầng. Thứ tự dải theo loại phòng là dữ liệu ở `kb/` (gara / khách trước; thang + WC + giếng trời giữa; bếp – ăn, phòng ngủ sau). Chiều sâu tối thiểu lấy từ cạnh tối thiểu đã có. Ra: thứ tự khối mỗi tầng + thiếu / dư bao nhiêu m. Phép thử: AT01 phải báo thiếu ≈ 1,35 m, THU5 và 9272 vừa. | Không | 1–2 giờ |
| B2 | Sơ đồ công năng SVG (tất định, ký tự thoát như tờ vẽ). Khối hiện ở bước «Đầu vào» của AI Design và trong Bộ kết quả. Không vừa thì hiện báo + gợi ý thay cho sơ đồ, không khoá nút. | Không | 1–2 giờ |
| B3 | `facadeFrameFromBrief`: dựng `FacadeFrame` từ đầu bài, cùng kiểu dữ liệu với khung từ mặt bằng, nên đề xuất, ghép, tờ vẽ và ảnh mặt đứng giữ nguyên. Phối cảnh lấy chiều sâu / sân từ đầu bài. Mở khoá bước Mặt ngoài khi chưa có mặt bằng; có mặt bằng thì vẫn dùng mặt bằng. Kiểm lineage artifact (cha = đầu bài) và hợp đồng — đổi hợp đồng thì đổi `CONTRACTS_FINGERPRINT`. | Không (test bằng client giả) | 2–4 giờ |
| B3b | Ảnh nội thất TỪNG PHÒNG không cần mặt bằng (anh Dũng thêm 30/10): tuyến ảnh mới theo loại phòng + diện tích đầu bài + phong cách (`kb/style_catalogue.yaml`) + nếp sinh hoạt; kiến trúc sư chọn phòng nào vẽ; hợp đồng + sổ chi phí như các tuyến ảnh khác. | Không (client giả) | 2–3 giờ |
| B4 | Chạy THẬT 1–2 bộ (AT01, AT02): mặt đứng + phối cảnh + 2–3 ảnh phòng. Ghi đầu vào và kỳ vọng trước; hỏng thì dừng. **Xin anh Dũng trước khi chạy.** | ≈ 0,3–0,6 USD | 30–45 phút |
| B5 | Đường dẫn xem cho khách (theo mẫu link thư viện mẫu, migration 0258): kiến trúc sư «Duyệt gửi khách», hạn 14 ngày, thu hồi được, đếm lượt xem, chỉ cơ hội đã khảo sát; trang công khai qua Worker, ảnh có dấu, không tải về. | Không | 2–3 giờ |
| B6 | Kiểm trên trình duyệt bằng đúng vai (Kinh doanh, kiến trúc sư, khách mở link), chụp ảnh, cập nhật CLAUDE.md. | Không | 1–2 giờ |

Tổng máy làm: **khoảng 10–17 giờ** (gồm B3b), tức 2–2,5 ngày làm việc. Chưa tính thời gian chờ anh Dũng xem từng mốc.

Điểm dừng báo anh Dũng:
- sau B2: xem sơ đồ và lời báo «không vừa»;
- trước B4: xin chạy thật;
- sau B6: chạy thử toàn bộ.

## Không làm ở đợt này (đề xuất làm sau)

(Ảnh nội thất từng phòng đã chuyển vào đợt này — B3b.)

- **Ảnh nội thất từng phòng không cần mặt bằng.** Ảnh nội thất hiện nay vẽ từ tờ mặt bằng (T57), nên phải có tuyến mới «ảnh phòng theo phong cách». Ước tính 2–3 giờ cộng 1 lượt thật. Đợt này bộ ý tưởng dùng phối cảnh ngoài, chưa có ảnh nội thất.
- Chế độ Kinh doanh (đầu bài rút gọn 12–15 câu, trần tiền tháng).
- WC dưới gầm thang, giếng trời trong hàng phòng cho mặt bằng AI (T189 bước sau).

## Rủi ro đã biết

- **Sơ đồ khối có thể trông «vừa» dù thực tế chật.** Vì vậy B1 phải báo thiếu / dư, và thứ tự dải là nếp chung chứ không phải phương án được kiểm.
- **Mặt đứng từ đầu bài không khớp mặt bằng sau này.** Bộ ý tưởng ghi rõ là ý tưởng; khi kiến trúc sư có mặt bằng thì dựng lại mặt đứng từ mặt bằng.
- **Hợp đồng hoặc lineage artifact có thể đòi mặt bằng làm cha.** Nếu phải đổi hợp đồng thì phát hành API cùng giao diện (CLAUDE.md 6.3).
