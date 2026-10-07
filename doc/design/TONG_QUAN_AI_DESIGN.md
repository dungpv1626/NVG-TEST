# Tổng quan module «AI Design» (Thiết kế AI, TK-10 → TK-17)

> Bản tóm tắt sơ bộ, viết ngày 07/10/2026 từ mã và tài liệu trên nhánh `ha_tang_kiem` (phần lớn chưa commit).
> Tệp này chỉ **tóm tắt**. Nguồn sự thật vẫn là các tệp ghi ở từng mục; khi mâu thuẫn thì tệp nguồn thắng.
>
> | Muốn biết chi tiết                | Đọc                                                                         |
> | --------------------------------- | --------------------------------------------------------------------------- |
> | Lý do từng quyết định (T1 → T118) | `doc/design/QUYET_DINH_AI.md`                                               |
> | Toàn bộ luật chặn + chấm điểm     | `doc/design/LUAT_CHAN_VA_CHAM_DIEM.md` (bản 25/09, ngưỡng nay đã đổi — mục 4) |
> | Hồ sơ thật NVG đã đo những gì     | `doc/design/13-ho-so-thuc-te.md`                                            |
> | Kế hoạch đường v6 (xếp dải)       | `doc/design/PHUONG_AN_V6.md`                                                |
> | Tiến độ, vướng mắc, câu hỏi chờ   | `TIEN_DO_THIET_KE.html`                                                     |

---

## 1. Mục tiêu

**AI Design là công cụ hỗ trợ phòng thiết kế** (chủ yếu nhà ở dân dụng của NVO): từ **đầu bài và khảo sát hiện
trạng**, nó đưa ra **phương án sơ bộ** để kiến trúc sư lấy về sửa tiếp, rút ngắn khâu ra phương án ban đầu.

Đầu ra mong muốn (T114):

1. Mặt bằng công năng từng tầng: tờ vẽ vector (SVG) và tệp **DXF** để kỹ sư mở trong CAD
2. Ảnh mặt bằng có nội thất
3. Mặt đứng mặt tiền (ảnh + DXF), rồi ảnh mặt đứng có vật liệu
4. Ảnh phối cảnh

Ranh giới:

- **Mọi kết quả là ĐỀ XUẤT / NHÁP.** AI không tự quyết giải pháp kết cấu, điện nước, PCCC, giá bán. Mỗi lần phát
  hành chỉ một bộ môn, kỹ sư có chứng chỉ ký (CLAUDE.md 5.1, 8.2).
- **Module ĐỘC LẬP, không thuộc quy trình Dự án thiết kế** (T114, T118). Nó không phải một bước của dải tiến trình,
  không làm điều kiện mở bước khác. Từ hồ sơ thiết kế chỉ có một lối sang (khối «Công cụ hỗ trợ»). AI Design **chỉ
  đọc** đầu bài và khảo sát; muốn sửa thì sửa ở hồ sơ.
- **Không kiểm quy chuẩn xây dựng** (T30, T42). Màn hình nói rõ điều này.
- Hai bước ảnh (nội thất, phối cảnh) nhận nguồn là bản AI vẽ **hoặc** bản kỹ sư đã sửa / tự vẽ rồi tải lên
  (PNG / JPG / PDF).

---

## 2. Thiết kế hệ thống

### 2.1 Nguyên tắc nền

| Nguyên tắc                                   | Ý nghĩa thực tế                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Mô hình đề xuất, chương trình gán số**     | Mô hình ngôn ngữ chỉ nói «phòng nào, cạnh phòng nào, nằm vùng nào». Mọi toạ độ, kích thước trên bản vẽ do mã tất định gán. |
| **Cổng hỏng thì không lưu** (T39)            | Phương án vi phạm luật chặn không bao giờ vào kho.                                                               |
| **Luật là dữ liệu**                          | Ngưỡng nằm ở YAML (`rules/`, `kb/`), không hard-code. Có phép thử grep canh.                                      |
| **Artifact bất biến**                        | Mỗi phương án là một artifact băm nội dung, có lineage. Sửa = artifact mới.                                       |
| **Hợp đồng JSON Schema ở mọi ranh giới**     | `contracts/*.schema.json` → sinh Zod ở `shared/src/design/*.generated.ts`.                                        |
| **Không bịa số**                             | Chưa đủ dữ liệu thì hiện «Chưa đủ dữ liệu», không hiện 0; đầu bài thiếu số thì không đoán.                        |
| **Riêng tư**                                 | Gửi mô hình đầy đủ trừ danh tính (hạng 2, T12). Khung tên mang mã hồ sơ không gửi.                                |

### 2.2 Kiến trúc

| Thành phần                  | Ở đâu                                                         | Việc                                                                                     |
| --------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Giao diện                   | `web/src/pages/tk/ai-design-page.tsx`, `pages/tk/ai/`          | Trang `/tk/ai-design` (thẻ / bảng), hai cột: thiết lập + một nút chính · tờ vẽ (T117)     |
| API + điều phối             | `workers/src/design/` (Hono, Cloudflare Workflows)             | Gọi mô hình, chạy bộ xếp, cổng, chấm điểm, vẽ, lưu artifact                               |
| Lõi nhánh AI                | `workers/src/design/ai/`                                       | `program.ts`, `arrange/`, `tree/`, `bands/`, `plan-check.ts`, `plan-score.ts`, `draw/`, `dxf/`, `facade/`, `perspective/` |
| Quy tắc                     | `rules/nvg-mandatory.yaml`, `nvg-experience.yaml`, `nvg-measured.yaml` | Luật bắt buộc của Haan + kinh nghiệm / số đo hồ sơ thật                           |
| Tri thức                    | `kb/*.yaml`                                                    | Từ vựng phòng, định mức, thước chấm, lời dẫn, đòi hỏi đầu bài, mặt đứng, mái, nội thất    |
| Container Python            | `compute/`                                                     | Chỉ còn **số hoá hồ sơ cũ** (đọc DWG / DXF). Bộ giải CP-SAT đã gỡ hẳn (T58)                |
| CSDL                        | Supabase, bảng `design_*`                                      | Artifact, lượt chạy, nhật ký gọi AI (`design_ai_call`), RLS theo bộ môn                   |

### 2.3 Mô hình AI dùng

Cấu hình ở `config/models.yaml`; kỹ sư chọn trên giao diện.

- **Mặt bằng (văn bản có lược đồ):** OpenAI GPT-5.6 Luna / Terra / Sol, GPT-6; Anthropic Claude Sonnet / Opus /
  Fable; Google Gemini Pro / Flash. Mặc định hay dùng: **GPT-5.6 Terra**.
- **Ảnh** (nội thất, mặt đứng vật liệu, phối cảnh): `gpt-image-2*`, Gemini image.
- **Phụ trợ:** Gemini Flash chuẩn hoá nhãn phòng, đọc ảnh sổ đỏ ra ranh thửa.
- Chi phí đo thật: một lượt mặt bằng **~0,15–0,46 USD** (2–4 lời gọi). **Không gọi khi Haan chưa cho phép.**

---

## 3. Flow thiết kế

```
 Đầu bài (3 phần, 7 mục)  +  Khảo sát hiện trạng
          │
          ▼
 [0] Cổng đầu bài ── đủ trường bắt buộc? mâu thuẫn? khả thi (≤ 85 % sàn)? ──✗──► dừng, không gọi mô hình
          │
          ▼
 [1] Chương trình không gian ── mô hình khai phòng, diện tích, tầng, quan hệ, lối vào
          │   cổng chương trình (từ vựng, phòng ngủ theo gia đình, đòi hỏi đầu bài…) ✗ → gọi lại mô hình
          ▼
 [2] Hình học từng tầng ── mô hình phác bố cục (cách phác tuỳ đường: lưới / hình chữ nhật / dải)
          │   chương trình nắn → cây chia ô → GÁN MỌI TOẠ ĐỘ, đặt cửa, cửa sổ, thang, bậc tam cấp
          ▼
 [3] Các cổng ── cây, mặt bằng, đòi hỏi đầu bài, luật bắt buộc NVG
          │   lỗi ngữ nghĩa → gửi lại mô hình (≤ 3–5 vòng); lỗi hình học → bộ xếp tự thử
          ▼
 [4] Chấm điểm 0–100 (5 nhóm) ── dưới 60 hoặc một nhóm dưới sàn → dùng vòng sửa còn lại
          │
          ▼
 [5] Lưu artifact: tờ SVG + DXF + tầng mái  ── kỹ sư xem, chọn «Phương án 1, 2, 3…»
          │
          ├──► Ảnh mặt bằng có nội thất (từ ảnh neo, tờ vector vẫn là tờ chính)
          └──► Mặt đứng: khung, lỗ mở, ban công KHOÁ theo mặt bằng; mô hình chỉ chọn mái, vật liệu,
               màu, cổng, rào trong kb/facade_vocabulary.yaml  ──► ảnh vật liệu ──► ảnh phối cảnh
```

### 3.1 Đầu bài — đầu vào duy nhất

`shared/src/design/brief-form.json` 2.0.0, **ba phần, bảy mục, ~94 trường**:

| Phần                | Mục                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------- |
| Chung cho cả nhà    | Công trình và khu đất (29) · Ưu tiên, ngân sách và người quyết định (5)                |
| Mặt bằng công năng  | Gia đình và nếp sinh hoạt (17) · Công năng và lưu trữ (8) · Khối nhà, thang, lối vào, ban công (25) · Kỹ thuật và dự trù (7) |
| Mặt đứng            | Phong cách, vật liệu và mặt ngoài (3, gồm phiếu mặt đứng)                              |

- Mỗi câu có nhãn `for` (`plan` / `facade` / `perspective`): lời gọi nào thấy câu nào — lời dẫn không thừa thông tin.
- **Đầu bài đã khai là ràng buộc kiểm được** (T41, T65): diện tích tối thiểu là sàn cứng; «có phòng thờ riêng» thì
  phải có `altar_room`; thang máy phải chồng khít mọi tầng (kể cả «chừa chỗ»); ban công theo từng mặt.
- **Không khai thì hạn chế bịa** (T96): giếng trời, sân trong, sân thượng, cửa hàng, thang máy chỉ được đề xuất khi
  đầu bài có hỏi tới.
- Chỉ suy từ câu **đã trả lời** — «chưa hỏi» khác «trả lời không».
- Phong thuỷ vào đầu bài là **câu người đã quyết** (ô «Điều kiêng kỵ khác»), không phải ngày sinh để máy luận.
- Quản trị viên sửa được nhãn / thứ tự / ẩn câu và thêm câu hỏi riêng (T63).

### 3.2 Ba đường hình học (bước 2) — đang cùng tồn tại

| Đường                     | Mô hình trả gì                                    | Chương trình làm gì                                                                 | Trạng thái                                  |
| ------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| **Lưới** (mặc định)       | Bản phác lưới ô ~1 m mỗi tầng (T48)               | Bộ xếp `arrange/` nắn về chữ nhật; hỏng thì **dựng khung xương** (lõi thang + hành lang, phòng lấp vào túi, T102) | Đang chạy trên bản demo                     |
| **v5** (`AI_PROMPT_PIPELINE=v5`) | Hình chữ nhật mm từng phòng (T115, cách A) | Đổi ra bản phác 0,5 m rồi đi bộ xếp cũ; luôn vẽ tầng mái                              | Chỉ tại máy; lượt thật không tốt hơn lưới   |
| **v6** (`AI_PROMPT_PIPELINE=v6`) | **Dải** (dải trước / lõi / sau, phòng trong dải) theo **loại nhà** | **Bộ giải dải** `ai/bands/` tính kích thước, ra cây `ai-plan-tree`, đi chung cổng `ai/tree/` | Đang làm tích cực (T116), chỉ tại máy       |

**Loại nhà** (v6, `shared/src/design/house-profile.ts`) suy từ khối xây, KTS ghi đè được:
`ong` (rộng ≤ 6 m, sâu ≥ 2 × rộng, ≥ 1 mặt bên kín) · `pho` · `bt` biệt thự · `vuon` nhà vườn · cờ `kd` kinh doanh.
Số đo (cửa, hành lang, lề) và một số dòng thước chấm khác nhau theo loại nhà.

### 3.3 Vòng sửa

- Chỉ lỗi **ngữ nghĩa** (`REVISABLE_CODES`) gửi lại mô hình; lỗi hình học thì bộ xếp tự thử rồi dừng.
- Tối đa 5 vòng (đường cũ) / 3 vòng (v6); dừng sớm khi cùng bộ lỗi lặp 2 vòng hoặc mô hình nộp lại y nguyên.
- Tầng đã qua thì **khoá** (T86), vòng sau chỉ sửa tầng hỏng.
- Tầng 1 hỏng vì cửa ra ngoài → thử đổi phòng mang cửa chính trước khi gọi lại (T51). v6: dải tầng 1 không vừa thì
  chương trình **tự dựng lại tầng 1** (T116 tiếp 8); tự chèn sảnh đầu thang (tiếp 13).
- Sửa sau khi đã có phương án: hợp đồng `ai-plan-edit` (mô hình trả thao tác trong tập đóng) **vẫn còn trong mã**,
  nhưng ô «Yêu cầu sửa» đã gỡ khỏi giao diện (T117). Kỹ sư sửa bằng DXF trong CAD.

---

## 4. Luật và thang điểm

Ba loại, tách bạch:

| Loại          | Hậu quả                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| **CHẶN**      | Không lưu phương án. Lỗi sửa được thì gửi lại mô hình, còn lại thì dừng. |
| **ĐIỂM**      | Không chặn. Xếp hạng ứng viên, quyết định có dùng vòng sửa còn lại không. |
| **CẢNH BÁO**  | Không chặn, không vào điểm. Hiện cho kỹ sư.                             |

Triết lý (Haan, T49 / T52): **luật cứng chỉ khi «không dựng được / không đi được»**. Định mức và kinh nghiệm nghề chỉ
trừ điểm hoặc cảnh báo. Chỗ bất hợp lý của một bản vẽ cụ thể thì sửa bản vẽ, **đừng biến thành luật** — trừ khi chính
Haan nói «bắt buộc».

### 4.1 Luật chặn (tóm lược)

| Tầng kiểm                | Ví dụ                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Đầu bài                  | Thiếu trường bắt buộc; khai thang máy mà thiếu kích thước giếng; phần chắc chắn phải có > 85 % sàn (T112)   |
| Chương trình không gian  | Loại phòng ngoài từ vựng; tổng m² vượt sàn; số phòng ngủ ≠ nhu cầu gia đình; thiếu thứ đầu bài đòi (phòng thờ riêng, WC khách, kho, gara đủ xe…) |
| Bản phác / bộ xếp        | Phòng không nắn được chữ nhật; xếp chong chóng; phòng không chạm đường về thang; hụt diện tích đầu bài; ô quá hẹp theo cạnh dùng được (vd khách ≥ 2,7 m, ngủ ≥ 2,2 m, WC ≥ 0,9 m) |
| Cây / hình học           | Hình bao thủng; cửa chính sai mặt; phòng không cửa; đi xuyên phòng riêng; đường hằng ngày xuyên gara; **ô thang chỉ mở sang giao thông / khu chung** (T74) |
| Mặt bằng cả nhà          | Lệch tầng thang; sàn bỏ trống; phòng không tới được từ cửa ngoài                                           |
| Đầu bài trên toạ độ      | Thang máy thiếu / nhỏ / lệch tầng; ban công sai mặt, sai tầng                                              |

**Luật bắt buộc của Haan** (`rules/nvg-mandatory.yaml`, T71 — luôn bật):

| Luật                       | Nội dung                                                                    |
| -------------------------- | --------------------------------------------------------------------------- |
| `kitchen_under_wc`         | Bếp không nằm dưới WC tầng trên                                             |
| `altar_under_wc`           | Phòng thờ không nằm dưới WC tầng trên                                       |
| `altar_beside_wc`          | Phòng thờ không chung tường WC                                              |
| `altar_facing_wc`          | Cửa phòng thờ không nhìn thẳng cửa WC                                       |
| `balcony_on_open_face`     | Ban công phải có cạnh ra mặt thoáng (ban công dài quay cạnh ngắn: trừ điểm D3) |
| `wc_stack`                 | WC thẳng trục — **ưu tiên** khi xếp hạng, không chặn                        |

Đợt v6 (T116 tiếp 17–18) thêm, cho nhà ống: WC đè phòng ở / không mặt thoáng cho phòng ngủ chính là CHẶN; WC riêng
được đè khách / ăn; phòng ngủ thứ hai không cửa sổ chỉ trừ điểm.

### 4.2 Thang điểm (`kb/plan_quality.yaml`, `score_version 5`)

- **Ngưỡng nhận 60 %** (65 tới 01/10/2026). Bộ xếp vẫn tìm biến thể tới 65 % nếu không tốn thêm lời gọi.
- **Sàn từng nhóm 40 %**, riêng **nhóm D ≥ 60 %** (07/10/2026): một nhóm hỏng nặng thì nhóm khác không bù được (T96).
- Tiêu chí thiếu dữ liệu → «Chưa đủ dữ liệu», **không** tính 0 và không chia lại trọng số; điểm luôn kèm
  `scored_weight`.
- Điểm **không** gác cổng xuất DXF; nó để xếp hạng và chỉ chỗ yếu, không thay mắt kỹ sư.

| Nhóm | Tên           | Trọng số | Tiêu chí chính                                                                                                   |
| ---- | ------------- | -------: | ---------------------------------------------------------------------------------------------------------------- |
| A    | Đúng chương trình | 25   | A1 lệch diện tích · A3 phòng thờ đúng chỗ · A4 tầng có phòng ngủ thì có WC · A5 / A6 phòng nhỏ / lớn hơn định mức |
| B    | Hình dáng phòng   | 20   | B1 cạnh ngắn dưới mức · B2 tỷ lệ dài / rộng quá mức · B4 chiều cao bậc thang 150–180 mm                           |
| C    | Giao thông        | **30** | C1 đi qua phòng ngủ khác · C2 tỷ lệ giao thông 18–36 % · C3 qua phòng tới chân thang · C4 hành lang ≥ 1,0 m · C5 cửa hàng có lối riêng · C6 / C7 đường tới WC chung · C8 hành lang / phòng phục vụ · C9 cửa chính đón vào đâu · C10 hành lang cụt · C11 gara → khách · C12 hành lang rộng quá · C13 ăn liền bếp |
| D    | Mặt thoáng        | 15   | D1 phòng ở có cửa sổ · D2 phòng ngủ tối hẳn · D3 ban công quay cạnh dài ra ngoài · D4 giặt phơi có chỗ phơi · D5 ban công lệch / chữ L |
| E    | Dựng được         | 10   | E2 WC thẳng trục / gần hộp kỹ thuật · E4 hộp kỹ thuật liên tục · E5 khu ướt không đè phòng khách / ngủ / thờ tầng dưới |

Năm kiểu thang điểm: `lower_better`, `higher_better` (nội suy giữa mức đạt và mức trừ hết), `count` (đếm vi phạm),
`boolean`, `band` (đủ điểm trong khoảng, nửa điểm ở vùng đệm). Trong một nhóm, tiêu chí chia trọng số theo `weight`
riêng — thứ làm hỏng cách ở (đi xuyên phòng ngủ, cửa chính đón vào bếp) nặng gấp đôi thứ chỉ kém tiện.

Nhãn **[ĐO]** = ngưỡng đo từ hồ sơ thật (n nhỏ, là chỉ dấu); **[CHUNG]** = tư duy nghề. Nhiều tiêu chí C9–C13,
D2–D5, E5 sinh ra từ việc **Haan chấm lượt thật** (T96, T105, T107, T113, T116).

**Bộ xếp chọn giữa các phương án của một tầng** theo thứ tự: WC thẳng trục → ô thang đúng chỗ mô hình phác → tổng
(điểm + 0,3 × độ khớp ý định − phạt ghi chú) → mã cây (tất định).

### 4.3 Cảnh báo (không chặn, không vào điểm)

`rules/nvg-experience.yaml` (24 luật: cạnh tối thiểu từng loại phòng, tỷ lệ dài / rộng, bếp gần ăn, WC tách phòng thờ,
gara ở tầng 1 và mặt tiếp cận, thang không đối diện cửa chính…) và `rules/nvg-measured.yaml` (8 luật đo trên hồ sơ).
Kỹ sư chọn bật gói nào; bật thì tiêm vào lời dẫn và hiện cảnh báo. Bộ chấm B1 / B2 luôn đọc ngưỡng từ đây dù có bật
hay không.

---

## 5. Mẫu tham khảo của NVG

### 5.1 Hồ sơ thật đã có

| Mã    | Công trình                                      | Dùng để                                              |
| ----- | ----------------------------------------------- | ---------------------------------------------------- |
| HS-01 | Nhà liền kề 5 tầng + tum, Hưng Yên (172 tờ KT / KC / DN) | Quy ước lớp, khung tên, kích thước cửa, thang |
| HS-02 | Nhà 2 tầng, Thái Bình (93 tờ)                   | Như trên + báo giá, hợp đồng thi công                |
| HS-03 | Liền kề trong ngõ 8 × 7,94 m, 3 tầng            | Bố cục: gara nửa mặt tiền, WC chồng khít cạnh thang   |
| HS-04 | Mái Nhật sân vườn 14 × 9,1 m, 1 tầng            | Bếp – WC dồn một đầu hồi, phòng thờ giữa             |
| HS-05 | Liền kề mái Nhật 23,5 × 5 m, 1 tầng             | Bố cục tuyến tính suốt chiều sâu                      |
| HS-06 | Mái Nhật 2 tầng 12,45 × 8 m                     | Cốt cao độ, bậc tam cấp                               |
| MR Dương | Nhà ống 16,43 × 5 m, 5 tầng, thang máy       | **Oracle của đường v6**: mã hoá tay thành cây chia ô; dựng lại tầng 3 lệch ≤ 30 cm |

Tổng cộng **7 bộ**, 85 phòng đo được kích thước. Tên chủ đầu tư, địa chỉ là dữ liệu hạng 1: **nằm ngoài repo**, trong
`kb/` chỉ gọi bằng mã HS-xx.

### 5.2 Rút ra được gì

- **Từ vựng và quy ước** (n = 1 là đủ): 47 loại tờ (`kb/sheet_catalogue.yaml`), ba họ khung tên, bảng giải mã phông
  TCVN3, tên lớp CAD theo **độ đậm nét** (`NV-Thay`, `NV-Khuat`…) chứ không theo vật thể, nhãn phòng nguyên văn.
- **Số đo**: cửa phòng 900 × 2200, cửa WC 700–750, cửa sổ WC 600 × 600, cửa chính 1650–3800 rộng, bệ cửa sổ +0,90,
  mặt bậc 250 / cổ bậc ~170, hành lang thông thuỷ ~1,0 m. Quy ước NVG: **kích thước cửa là thông thuỷ hoàn thiện**.
- **Kích thước phòng** (`rules/nvg-measured.yaml`, 13-ho-so-thuc-te 13.17): phòng ngủ 9–14 m², cạnh ngắn ≥ 2,39 m;
  phòng ngủ chính 15–17 m²; WC 3–6,5 m²; khách 16–41 m².
- **Ngưỡng định mức** `priors.min_samples` = 5 hồ sơ (Haan hạ từ 15, Q-49). Kho 7 bộ đã qua ngưỡng, nhưng số rút ra
  vẫn chỉ vào **điểm và cảnh báo**, không loại phương án. Số diện tích chuẩn vẫn phải do KTS NVG ấn định (Q-18).
- **Chưa có cặp mẫu «đầu bài → phương án»** để làm few-shot: hồ sơ cũ không có bản phương án. NVG hứa ghi lại từ dự
  án tới (Q-28).

### 5.3 Bài học quan trọng từ hồ sơ thật

- Bản vẽ NVG **không có đa giác phòng trên lớp riêng**; phải dựng từ đồ thị tim tường.
- 83 % hình học nằm trong block; một DXF chứa trọn 22–73 tờ.
- PDF không dùng được làm nguồn (một nửa là bản quét); **`.dwg` là nguồn vector đáng tin duy nhất**.
- Mẫu bố cục nhà ống thật: **thang cuối nhà, hành lang dọc một bên** — đã đưa vào mẫu dải `ong` của v6.

---

## 6. Hiện trạng (07/10/2026)

### 6.1 Đã chạy được

- Trang riêng `/tk/ai-design` (dạng thẻ + bảng), giao diện hai cột làm lại (T117), sáng / tối.
- Đầu bài ba phần, lời dẫn cắt theo nhãn từng câu (T114).
- Đường lưới: ra mặt bằng nhiều tầng, tờ SVG, DXF, tầng mái, bậc tam cấp, thang đánh số bậc; ảnh nội thất; mặt
  đứng + ảnh vật liệu; phối cảnh; nhận bản vẽ kỹ sư tải lên làm nguồn ảnh.
- Bản demo `nvg.tests99.workers.dev` chạy đường lưới (cần Workers Paid cho Worker AI trên cloud).
- Bộ kiểm: ~2.000 phép thử logic xanh; `mutation-proof` có các đột biến tới M191 canh hàng rào mới.

### 6.2 Đang làm: đường v6 (xếp dải theo loại nhà)

Lý do chuyển: rà soát lượt thật T115 (`RA_SOAT_LUOT_THAT_T115.md`) cho thấy khung xương T102 **không dựng được nhà
ống 5 m** và dải mỏng của biệt thự; v5 phát lại chỉ qua 4–5 / 209 vòng so với 19 của lưới.

Lượt thật v6 (nhà ống demo 5 × 18 m, tất cả có phép của Haan, mỗi lượt 0,15–0,39 USD):

| Lượt       | Kết quả                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| 03718834, 619f0438, 36fb8000, 93d212a2, 822e699d | Không ra mặt bằng; mỗi lượt lộ lỗi chương trình → đã sửa (T116 tiếp 3–9) |
| **a68c50bb** | **Lần đầu ra mặt bằng: 55,9 điểm** (dưới ngưỡng 60, nhóm E dưới sàn). Haan chấm 6 điểm → T116 tiếp 10 |
| 41ffe1e5, df9da65a | Không ra; lỗi giếng trời, sảnh đầu thang → đã sửa (tiếp 11–13)                       |
| affaf12b, f0c97c06 | Tầng 1–3 qua ngay lời gọi đầu; hỏng ở kiểm giếng trời / hành lang tầng 4 → đã sửa (tiếp 15–16) |

Sau đợt sửa 3 (tiếp 17–18): bộ dải viết tay `NHAONG_BANDS` qua cổng với **74,6 %** trong một lời gọi (phát lại, không
tốn tiền). **Chưa chạy thật lại** sau đợt này.

### 6.3 Còn mở

- Phát lại trên **đầu bài khác** nhà ống (biệt thự, nhà phố) — cần lượt thật hoặc bộ dải viết tay.
- Các số mang dấu ⚑ (số đo theo loại nhà, dòng thước chấm đổi số chung) **chưa ai duyệt** — chờ Haan / KTS.
- Tiêu chí điểm «hướng bàn thờ lệch / cửa chéo trước bàn thờ» chưa có (cần đo vị trí bàn thờ).
- Ban công đua ra ngoài ranh mất sau khi sửa bằng ô yêu cầu; mặt thoáng khi khối lùi ≥ 2 m.
- KTS duyệt số trong `kb/furniture.yaml`, `kb/roof_plan.yaml`, `kb/house_program.yaml`.
- Trình trích xuất Container chưa dựng được phòng từ hồ sơ MR Dương (`no_rooms`) — oracle đang mã hoá tay.
- Phần lớn thay đổi T115–T118 **chưa commit, chưa deploy**; hợp đồng `contracts/` đã đổi nên khi phát hành phải đưa
  API và giao diện lên cùng lúc.
- Câu hỏi chờ Haan: phần «Câu hỏi chờ Haan» của `TIEN_DO_THIET_KE.html` và `doc/VAN_DE_CON_MO.md`.
