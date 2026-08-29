-- ============================================================================
-- 0104 — Địa phương mặc định: Thái Bình → Hưng Yên
--
-- Trả lời câu hỏi Q-8. Sau sắp xếp đơn vị hành chính năm 2025, **Thái Bình đã sáp
-- nhập vào tỉnh Hưng Yên** — `thai_binh` không còn là một đơn vị hành chính, nên nó
-- cũng không còn là một giá trị `locality` hợp lệ.
--
-- Biểu mẫu đầu bài từ nay cho chọn đủ **34 đơn vị hành chính** (danh sách nằm ở
-- `shared/src/design/brief-form.json`, mục `locality`), với bốn địa bàn NVG thường
-- thi công — Hưng Yên, Hải Phòng, Ninh Bình, Hà Nội — xếp thành nhóm đầu.
--
-- ## Cùng lúc: đổi nghĩa của chính thiết lập này
--
-- `rule_pack_locality` sinh ra khi biểu mẫu chỉ có MỘT địa phương, nên nó vừa là
-- "mặc định của biểu mẫu" vừa là "gói quy tắc đang chạy". Hai nghĩa đó tách nhau từ
-- khi có 34 lựa chọn: gói quy tắc phải suy từ `locality` của TỪNG đầu bài, không
-- phải từ một thiết lập chung cho cả tenant. Giá trị ở đây nay chỉ còn là **gợi ý
-- điền sẵn** cho hồ sơ mới; engine đọc `brief.locality`.
--
-- Không đổi tên khoá: `design_engine.test.ts` và bảng cấu hình đang đọc nó, và một
-- lần đổi tên khoá cấu hình đắt hơn nhiều so với việc sửa lại phần mô tả.
-- ============================================================================

UPDATE public.design_setting
   SET value = '"hung_yen"'::jsonb,
       description = 'Địa phương gợi ý điền sẵn cho đầu bài mới. Gói quy tắc thực sự áp dụng suy từ design_brief.locality của từng hồ sơ, không phải từ khoá này. Danh sách 34 đơn vị hành chính nằm ở shared/src/design/brief-form.json.',
       updated_at = now()
 WHERE key = 'rule_pack_locality';

-- Đầu bài đang soạn dở: để nguyên `thai_binh` thì hồ sơ mang một mã địa phương không
-- còn tồn tại, và màn hình chỉ hiện được mã thô vì không tuỳ chọn nào khớp.
--
-- ⚠️ **CHỈ bản chưa xác nhận.** Bản đã xác nhận là căn cứ đối chiếu với khách hàng —
--    trigger `design_briefs_immutable_after_confirm` chặn mọi UPDATE lên nó, và đó là
--    hành vi đúng: sửa lại một hồ sơ khách đã ký nhận là làm sai lệch chính thứ nó
--    sinh ra để bảo vệ. Lần chạy đầu của migration này đã bị trigger đó chặn — giữ lại
--    ghi chú để lần sau không ai gỡ điều kiện dưới đây.
--
--    Hồ sơ đã xác nhận giữ `thai_binh` là ĐÚNG: hợp đồng `DesignBrief` chỉ ràng buộc
--    `locality` theo mẫu `^[a-z0-9_]+$`, nên artifact cũ vẫn hợp lệ và vẫn đọc lại được.
--
-- `structured` là jsonb nên sửa được tại chỗ; `completeness_score` là cột sinh đọc từ
-- chính cột này nên nó tự tính lại, không cần đụng tới.
UPDATE public.design_briefs
   SET structured = jsonb_set(structured, '{locality}', '"hung_yen"'::jsonb)
 WHERE structured->>'locality' = 'thai_binh'
   AND confirmed_at IS NULL
   AND deleted_at IS NULL;
