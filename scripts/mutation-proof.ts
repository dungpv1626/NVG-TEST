import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Bằng chứng đột biến mã nguồn cho NVG (20/09/2026).
 *
 *   npx tsx scripts/mutation-proof.ts          # chạy toàn bộ
 *   npx tsx scripts/mutation-proof.ts --dry    # chỉ kiểm mọi đột biến còn áp được đúng một chỗ
 *   npx tsx scripts/mutation-proof.ts M03 M07  # chạy vài đột biến
 *
 * SỐ BÀI KIỂM KHÔNG CHỨNG MINH BỘ KIỂM CÓ TÁC DỤNG. Ngày 20/09/2026 hai lượt rà soát tìm ra tám
 * lỗi thật ở bước Mặt đứng trong khi 867 bài kiểm của module ấy đang xanh — không bài nào bắt được
 * lỗi nào. Ở đây mỗi mục là một LỖI THẬT được cài vào mã nguồn, đúng loại lỗi mà bộ kiểm hứa sẽ
 * bắt, rồi chạy lại bộ kiểm. Bộ kiểm phải ĐỎ. Vẫn xanh thì script báo «SỐNG SÓT» chứ không giấu.
 *
 * Mỗi đột biến mô phỏng một hậu quả nhìn thấy được: người dùng thấy dữ liệu không được phép thấy,
 * bản vẽ mất nhãn cảnh báo, tiền gọi mô hình tiêu vô ích, hoặc danh tính khách rời khỏi máy chủ.
 * Không có đột biến «đổi dấu ngẫu nhiên» — thứ đó đo độ phủ, còn ở đây cần chứng minh cam kết.
 *
 * KHÔNG chạy phép thử trong `db/`: chúng nối vào Supabase thật và xoá cứng dữ liệu theo tiền tố
 * `[TEST]`, nên không được chạy đi chạy lại hàng chục lượt. Hệ quả phải nhớ: RLS và mọi ràng buộc
 * nằm trong CSDL KHÔNG được chứng minh ở đây. Đó là khoảng trống lớn nhất của tệp này.
 *
 * ⚠️⚠️ Script GHI ĐÈ `workers/src/**` MỘT LƯỢT CHO MỖI ĐỘT BIẾN — nay 23 lượt. Đang có
 * `wrangler dev` chạy thì mỗi lượt là một lần nạp lại Worker với mã đã cài lỗi, và nạp lại GIẾT
 * instance Workflow đang bay của Haan. Đã xảy ra thật ba lần (11/09, 13/09, 20/09). Kiểm
 * `ps aux | grep wrangler` và `SELECT status FROM design_ai_run ORDER BY created_at DESC LIMIT 1`
 * TRƯỚC KHI CHẠY.
 *
 * AN TOÀN: tệp gốc đọc vào bộ nhớ và ghi trả lại trong `finally`, kể cả khi bấm Ctrl+C. Trước và
 * sau khi chạy, script băm toàn bộ mã nguồn và báo lỗi nếu hai bản băm khác nhau.
 */

type Axis =
  | 'phân quyền'
  | 'riêng tư'
  | 'tiền'
  | 'tiền gọi mô hình'
  | 'bản vẽ'
  | 'số đo'
  | 'phát hành'
  | 'giao diện';

type Mutation = {
  id: string;
  axis: Axis;
  file: string;
  /** Lỗi được mô phỏng, viết theo hậu quả thật. */
  bug: string;
  find: string;
  replace: string;
};

const MUTATIONS: Mutation[] = [
  // ── Phân quyền: ai thấy gì ────────────────────────────────────────────────────────────
  {
    id: 'M01',
    axis: 'phân quyền',
    file: 'web/src/lib/auth.tsx',
    bug: 'Không có quyền trên phân hệ nào thì thấy HẾT — gõ thẳng đường dẫn là vào được mọi màn hình',
    find: '  if (!p) return false;',
    replace: '  if (!p) return true;',
  },
  {
    id: 'M02',
    axis: 'phân quyền',
    file: 'web/src/lib/company-scope.ts',
    bug: 'Bỏ lọc pháp nhân: nhân viên NVO thấy cả hồ sơ của NVC và NVS trên mọi danh sách',
    find: "  return (query as { eq(column: string, value: string): Q }).eq('company_id', scope.companyId);",
    replace: '  return query;',
  },
  {
    id: 'M03',
    axis: 'phân quyền',
    file: 'workers/src/design/artifacts.ts',
    bug: 'Kho artifact dùng lại dòng của hồ sơ KHÁC khi trùng mã băm — head trỏ sang hồ sơ người khác',
    find: '    if (existing.data && (existing.data.project_id as string) !== scope.projectId) {',
    replace: '    if (false) {',
  },

  {
    id: 'M24',
    axis: 'phân quyền',
    file: 'shared/src/design/brief-form-overlay.ts',
    bug: 'Quản trị viên ẩn được câu hỏi BẮT BUỘC của hợp đồng (số tầng, bề rộng lô) — biểu mẫu vẫn chạy, chỉ ngắn đi, rồi MỌI đầu bài mới sau đó không chốt được và không màn hình nào nói vì sao',
    find: '      if (LOCKED_PATHS.includes(field.path)) {',
    replace: '      if (false) {',
  },

  // ── Bám đầu bài: cái gia chủ đã khai có thật sự vào mặt bằng không (T65) ─────────────
  {
    id: 'M25',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/brief-demands.ts',
    bug: 'Trường đầu bài BỎ TRỐNG cũng bị hiểu là «có» — mọi hồ sơ chưa điền hết bị bác vì những thứ gia chủ chưa từng nói, và chỗ hỏng nằm ở đúng ranh giới «chưa hỏi khác trả lời không»',
    find: '      return lifestyle?.second_kitchen === true ? { level: null } : null;',
    replace: '      return lifestyle?.second_kitchen !== false ? { level: null } : null;',
  },
  {
    id: 'M26',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Giếng thang máy lệch tầng vẫn qua cổng — cabin không có đường thẳng để chạy, và với lựa chọn «chừa chỗ lắp sau» thì cái chỗ đã chừa là vô dụng',
    find: '      if (shift > ELEVATOR_ALIGN_CM) {',
    replace: '      if (false) {',
  },
  {
    id: 'M27',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Ban công ra mặt nào cũng được dù gia chủ khai CHỈ mặt tiền — số lượng vẫn đủ nên không phép kiểm nào khác lên tiếng',
    find: '        touchesSide(entry.level, entry.rect, side) && !shortEndOnly(entry.rect, side, longRatio),',
    replace: '        false,',
  },
  {
    id: 'M28',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/tree/balcony-projection.ts',
    bug: 'Ban công đua ra ngoài ranh dù đầu bài chưa khai đua bao nhiêu mét — chương trình tự bịa một con số rồi vẽ nó lên bản vẽ kỹ thuật',
    find: '      if (cm <= 0 || !isFlush(rect, footprint, side)) continue;',
    replace: '      if (!isFlush(rect, footprint, side)) continue;',
  },

  // ── Riêng tư: cái gì rời khỏi máy chủ ─────────────────────────────────────────────────
  {
    id: 'M04',
    axis: 'riêng tư',
    file: 'workers/src/design/brief/anonymise.ts',
    bug: 'Số điện thoại khách đi nguyên vào lời dẫn gửi nhà cung cấp mô hình',
    find: '      .replace(/(?<!\\d)\\(?(?:\\+?84|0)\\)?(?:[\\s.()-]?\\d){8,10}(?!\\d)/g, REDACTED)',
    replace: '      .replace(/(?!)/g, REDACTED)',
  },
  {
    id: 'M05',
    axis: 'riêng tư',
    file: 'workers/src/design/brief/anonymise.ts',
    bug: 'Tên khách hàng đi nguyên vào lời dẫn — bộ lược danh tính thành hàm rỗng',
    find: "    out = out.replace(new RegExp(pattern, 'giu'), REDACTED);",
    replace: '    out = out;',
  },

  // ── Tiền: lượt gọi mô hình ────────────────────────────────────────────────────────────
  {
    id: 'M06',
    axis: 'tiền',
    file: 'workers/src/design/ai/facade/image.ts',
    bug: 'Ảnh neo không được gửi kèm — trả tiền một lượt để mô hình vẽ một ngôi nhà khác',
    find: '  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };',
    replace: '  return { system: prompt.system, prompt: prompt.prompt, images: [] };',
  },
  {
    id: 'M07',
    axis: 'tiền',
    file: 'workers/src/design/ai/sheet-image.ts',
    bug: 'Như M06 nhưng cho tờ mặt bằng có nội thất',
    find: '  return { system: prompt.system, prompt: prompt.prompt, images: [anchor] };',
    replace: '  return { system: prompt.system, prompt: prompt.prompt, images: [] };',
  },

  // ── Bản vẽ: số đo và nhãn ─────────────────────────────────────────────────────────────
  {
    id: 'M08',
    axis: 'bản vẽ',
    file: 'shared/src/design/index.ts',
    bug: 'Mã artifact không còn theo nội dung — hai phương án khác nhau dùng chung một mã',
    find: '  const bytes = new TextEncoder().encode(canonicalJson(payload));',
    replace: "  const bytes = new TextEncoder().encode('artifact');",
  },
  {
    id: 'M09',
    axis: 'bản vẽ',
    file: 'shared/src/design/index.ts',
    bug: 'Tờ vẽ AI mất nhãn «bản phác, không dùng để thi công» — người đọc tưởng là hồ sơ thật',
    find: "  aiSheet: 'Đề xuất AI — bản phác, không dùng để thi công',",
    replace: "  aiSheet: '',",
  },
  {
    id: 'M10',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/merge.ts',
    bug: 'Lỗ mở của mặt đứng không còn lấy từ mặt bằng — mặt đứng và mặt bằng nói hai ngôi nhà khác nhau (T16)',
    find: '    openings_front: frame.openings.map((o) => ({ ...o })),',
    replace: '    openings_front: frame.openings.map((o) => ({ ...o, w: o.w + 10 })),',
  },
  {
    id: 'M11',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/elevation-sheet.ts',
    bug: 'Chuỗi kích thước bỏ mất mép hình — tờ mặt đứng in ra tổng nhỏ hơn bề rộng thật',
    find: '  if (out.length > 0 && max !== undefined) out[out.length - 1] = max;',
    replace: '  if (false) out[out.length - 1] = max!;',
  },
  {
    id: 'M12',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/facade/score.ts',
    bug: 'Vòng tự sửa gửi cả tiêu chí do CHƯƠNG TRÌNH quyết cho mô hình — mỗi lượt sửa là tiền thật, và mô hình không sửa nổi cao độ lanh tô hay chiều cao lan can vì nó không cầm những số ấy (T63)',
    find: '    .filter((c) => c.doAi && c.score !== null && c.score < 1)',
    replace: '    .filter((c) => c.score !== null && c.score < 1)',
  },
  {
    id: 'M13',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/review.ts',
    bug: 'Tiêu chí kỹ sư KHÔNG chấm bị tính là chấm 0 — «tôi không có ý kiến» thành «tôi chấm trượt», và bảng điểm vẫn ra một con số trông bình thường (T63)',
    find: '    if (!row) return c;',
    replace: '    if (!row) return { ...c, score: 0 };',
  },
  {
    id: 'M14',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/score.ts',
    bug: 'Mặt tiền KHÔNG CÓ cửa sổ bị xếp thành «thiếu đầu vào» — mẫu số của điểm co lại vì một chuyện bình thường (Haan, 20/09/2026: có nhà cần có cửa sổ, có nhà không)',
    find: '      return windowsOn(concept, refLevel(concept)).length > 0 || KHONG_CUA_SO;',
    replace: '      return true;',
  },
  {
    id: 'M15',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/merge.ts',
    bug: 'Chiều cao lan can kỹ sư điền trong phiếu bị bỏ — tờ vẽ dựng theo quy ước cấu tạo, còn thước chấm đo đúng con số ấy, nên điểm nói về một cái lan can không có trên giấy (T65)',
    find: '      railing_h_cm: brief?.balcony.h_cm ?? null,',
    replace: '      railing_h_cm: null,',
  },

  // ── Phối cảnh (T67) ───────────────────────────────────────────────────────────────────
  {
    id: 'M16',
    axis: 'tiền',
    file: 'workers/src/design/ai/perspective/views.ts',
    bug: 'Góc nghiêng và toàn cảnh chạy khi CHƯA có tờ mặt bằng mái — trả tiền hai lượt để mô hình đoán chiều sâu nhà, và ảnh mâu thuẫn với mặt bằng (T65)',
    find: "    if (has.has('roof_plan')) {",
    replace: '    if (true) {',
  },
  {
    id: 'M18',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/roof-plan.ts',
    bug: 'Vạch lối vào trên tờ mặt bằng mái vẽ bằng nét mảnh TRÙNG bề dày tường — hai cửa biến mất khỏi tờ neo, mô hình không biết xe vào phía nào, và tờ vẽ vẫn trông bình thường (đã dựng sai đúng như vậy ở bản đầu)',
    find: '        class: CLS.roofEntrance,',
    replace: '        class: CLS.roofBelow,',
  },
  {
    id: 'M19',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/perspective/views.ts',
    bug: 'Cho phép vẽ lại LẺ tấm mặt tiền ban ngày — bốn góc kia vẫn dựng theo tấm cũ, nên bộ năm ảnh giao khách là của HAI ngôi nhà, và không có gì trên màn hình nói ra (T67 Đợt C)',
    find: '  return view === SET_ANCHOR_VIEW',
    replace: '  return false',
  },
  {
    id: 'M23',
    axis: 'số đo',
    file: 'workers/src/design/ai/draw/svg.ts',
    bug: 'Ranh thửa mượn tên lớp CSS của lan can — luật sau đè luật trước, lan can của MỌI tờ mặt đứng thành nét đứt sai quy ước, và ảnh chụp vàng không bắt được vì hình y nguyên, chỉ CSS khác (đã xảy ra thật khi dựng T68)',
    find: "  roofLot: 'rlot',",
    replace: "  roofLot: 'rl',",
  },
  {
    id: 'M22',
    axis: 'số đo',
    file: 'workers/src/design/ai/perspective/prompt.ts',
    bug: 'Lời dẫn nói chiều sâu sân nhưng KHÔNG nói hệ quả — vẫn xin «một chiếc ô tô cho sinh động» trong cái sân 3 m ngắn hơn thân xe, nên mô hình nới sân ra cho vừa chiếc xe (đúng tấm ảnh Haan đo được 20/09/2026)',
    find: '    ctx.yard !== null && ctx.yard.frontM > 0 && ctx.yard.frontM < block.scale.carLengthM;',
    replace: '    false as boolean;',
  },
  {
    id: 'M21',
    axis: 'số đo',
    file: 'workers/src/design/ai/perspective/context.ts',
    bug: 'Khoảng sân thu về một bit có-hay-không thay vì số đo bốn mặt — đầu bài khai sân trước 3 m, ảnh phối cảnh vẽ 8–10 m, sai rõ tới mức một thân ô tô đã hơn 4 m mà sân vẫn thừa (Haan, 20/09/2026)',
    find: '    yard: yardOf(plan, lot),',
    replace: '    yard: lot ? { frontM: 0, backM: 0, leftM: 0, rightM: 0 } : null,',
  },
  {
    id: 'M20',
    axis: 'tiền',
    file: 'workers/src/design/workflows/ai-perspective-steps.ts',
    bug: 'Nút «Dừng» không cắt được lời gọi đang bay — màn hình nói «đang dừng» trong khi lượt vẽ vẫn chạy hết bốn phút và vẫn tính tiền, và không có gì đỏ ở đâu (Haan, 20/09/2026: «cứ chạy mãi… thêm nút stop»)',
    find: '      ...(signal ? { signal } : {}),',
    replace: '      ...(false as boolean ? { signal } : {}),',
  },
  {
    id: 'M17',
    axis: 'riêng tư',
    file: 'workers/src/design/ai/perspective/prompt.ts',
    bug: 'Hiện trạng một phía KHÔNG khai vẫn được nói ra — lời dẫn bịa ra nhà hàng xóm hoặc đất trống không tồn tại, và người xem tin ngay vì nó nằm trong ảnh chứ không nằm trong chữ',
    find: '      const phrase = code ? table[code] : undefined;',
    replace: "      const phrase = code ? table[code] : 'an empty plot';",
  },
  // ── Phát hành: bản public dùng được trên máy người dùng ───────────────────────────────
  {
    id: 'M29',
    axis: 'phát hành',
    file: 'web/src/lib/build-env.ts',
    bug: 'Bản phát hành đóng gói địa chỉ API trỏ về máy phát triển (localhost:8788) — build và deploy xanh, tab «AI Design» chỉ chạy trên máy đang mở wrangler dev, mọi máy khác báo «Dịch vụ thiết kế đang không phản hồi» (xảy ra thật 06/09 → 23/09/2026)',
    find: '    if (isMachineLocal(url.hostname)) {',
    replace: '    if (false as boolean) {',
  },
  // ── Bản vẽ: bậc tam cấp (T70) ─────────────────────────────────────────────────────────
  {
    id: 'M30',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/entry-steps.ts',
    bug: 'Số bậc tam cấp làm tròn XUỐNG — chênh cốt 430 mm ra 2 bậc cổ 215, không bước nổi (hồ sơ NVG: 3 bậc)',
    find: '  return Math.max(1, Math.ceil(demand.dropM / norms.riser_m - 1e-9));',
    replace: '  return Math.max(1, Math.floor(demand.dropM / norms.riser_m));',
  },
  {
    id: 'M31',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/entry-steps.ts',
    bug: 'Bậc tam cấp vẽ chìa ra ngoài ranh thửa khi sân trước không đủ sâu — bản vẽ đặt bậc lên vỉa hè hay đất nhà bên',
    find: '    if (room + SLACK_CM < depth) {',
    replace: '    if (false as boolean) {',
  }, // ── Bản vẽ: luật bố trí bắt buộc của Haan (T71) ───────────────────────────────────────
  {
    id: 'M32',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/mandatory.ts',
    bug: 'Bếp nằm ngay dưới WC tầng trên mà vẫn qua cổng — luật Haan đặt «bắt buộc» (T71)',
    find: '      const hit = below.kitchens.find((k) => overlapArea(k.rect, wc.rect) > kitchen.overlapMinCm2);',
    replace: '      const hit = below.kitchens.find(() => false);',
  },
  {
    id: 'M33',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/mandatory.ts',
    bug: 'Cửa phòng thờ nhìn thẳng sang cửa WC qua hành lang mà vẫn qua cổng (T71)',
    find: '      if (lateral > rule.offsetCm || across > rule.maxDistanceCm) continue;',
    replace: '      if (lateral >= 0) continue;',
  },
  {
    id: 'M34',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Bộ xếp chọn phương án WC lệch trục chỉ vì điểm cao hơn, dù có phương án thẳng trục (T71)',
    find: '    Number(q.stacked) - Number(p.stacked) ||',
    replace: '    0 ||',
  },
  {
    id: 'M35',
    axis: 'tiền',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Lỗi sửa được của bản phác bị lỗi hình học của ứng viên khác che mất — lượt dừng sau một lời gọi đã trả tiền, mô hình không được sửa (lượt chạy thật fad0c0fa)',
    find: '    chosen.some((issue) => REVISABLE_CODES.has(issue.code)) || !extra.length',
    replace: '    true',
  },
  {
    id: 'M36',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Mô hình nộp lại y nguyên phần tầng đang hỏng mà chương trình vẫn gọi lượt sau — cùng lời dẫn, cùng kết quả, mất tiền (lượt chạy thật 458d9a91)',
    find: '  if (asked && unchangedWhereFailed(asked, answer, levels)) {',
    replace: '  if (false) {',
  },
  {
    id: 'M37',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Khung khoét mốc tầng trên không khoét ô thang máy — thang máy rơi lệch giếng tầng dưới dù mô hình vẽ đúng ô (lượt chạy thật 011b4adc)',
    find: '    if (target) out.push({ key: lift.key, rect: target });',
    replace: '    void target;',
  },
  {
    id: 'M38',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Bản phác vẽ phòng đầu bài thiếu ô mà không báo mô hình — bộ xếp bỏ bản phác, dời ô thang «cứu» tầng, mô hình không bao giờ biết (nguyên nhân gốc lượt 011b4adc)',
    find: '    ? (sketchNoAccess(input, intent, sketch) ?? sketchBelowBrief(input, intent, sketch))',
    replace: '    ? sketchNoAccess(input, intent, sketch)',
  },
  {
    id: 'M39',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Tầng 1 bỏ bản phác thì dời ô thang khỏi chỗ bản phác vẽ — tầng trên «không ép được mốc», phòng không cửa (lượt chạy thật 0c86c0b1)',
    find: '  if (cores.length) input = { ...input, sketchCores: cores };',
    replace: '  void cores;',
  },
  {
    id: 'M40',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Phòng không có lối vào ngay trên bản phác mà không báo mô hình — bộ xếp «cứu» hoặc hỏng lỗi hình học, mô hình chỉ nhận câu nhắc diện tích (lượt chạy thật 6c35ed79)',
    find: '    if (!hosts.length) cut.push(leaf.id);',
    replace: '    if (false) cut.push(leaf.id);',
  },
  {
    id: 'M41',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Thang máy bị coi là hành lang — dải hành lang mang mã thang máy, cây có một phòng ở hai nút (lượt chạy thật 6c35ed79)',
    find: "              input.groups.vertical.has(type) && !stairTypes.has(type) && type !== 'elevator',",
    replace: '              input.groups.vertical.has(type) && !stairTypes.has(type),',
  },
  {
    id: 'M42',
    axis: 'tiền',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Tầng hỏng vì hành lang chia mẩu nối nhau một ô mà không nói với mô hình — toàn lỗi hình học, lượt dừng sau lời gọi đã trả tiền (lượt chạy thật 9d3cc059)',
    find: "  const weakRaw = sketch ? sketchNoAccess(input, intent, sketch, 'door') : null;",
    replace: '  const weakRaw = null as PlanIssue | null;',
  },
  {
    id: 'M43',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Ban công đầu bài khai chỉ kiểm khi mọi tầng đã xếp xong — mô hình bỏ ban công giữa chừng mà không được nhắc, lỗi lộ ra ở lượt cuối (lượt chạy thật 2ddf782a)',
    find: '  if (!balcony || balcony.forbidden) return;',
    replace: '  return;',
  },
  {
    id: 'M44',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lượt sửa luôn đi tiếp từ lượt mới nhất — một lượt sửa hỏng (một lỗi thành sáu) kéo mọi lượt gọi sau xuống theo (lượt chạy thật 5cd78ef7)',
    find: '  if (!best || setbackRank(current) <= setbackRank(best)) return { best: current, next: current };',
    replace: '  if (true) return { best: current, next: current };',
  },
  {
    id: 'M45',
    axis: 'bản vẽ',
    file: 'workers/src/design/kb/vocabulary.ts',
    bug: 'Cổng lại cho WC, kho, bếp mở cửa thẳng ra ô cầu thang — cửa quét lên bậc, người bước ra hụt chân (T74, Haan 25/09/2026)',
    find: '  if (!allowed || allowed.size === 0) return true;',
    replace: '  if (!allowed || allowed.size >= 0) return true;',
  },
  {
    id: 'M46',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-check.ts',
    bug: 'Hai giếng trời cùng tầng cùng mang tên «Giếng trời» — cổng tên trùng bác cả phương án thay vì chương trình tự đánh số (Haan 25/09/2026)',
    find: '      if (count > 1) {',
    replace: '      if (count > 99) {',
  },
  {
    id: 'M47',
    axis: 'số đo',
    file: 'workers/src/design/ai/brief-demands.ts',
    bug: 'Bỏ qua kích thước giếng thang gia chủ khai — ô thang máy dựng không lọt cabin của hãng mà không cổng nào bác (Haan 25/09/2026)',
    find: "  const sized = typeof width === 'number' && typeof depth === 'number';",
    replace: '  const sized = false;',
  },
  {
    id: 'M48',
    axis: 'tiền gọi mô hình',
    file: 'shared/src/design/brief-completeness.ts',
    bug: 'Đầu bài có thang máy mà chưa có kích thước giếng vẫn qua cổng — tốn tiền gọi mô hình cho một phương án không kiểm được giếng thang',
    find: "      code: 'thang_may_thieu_kich_thuoc',\n      severity: 'nghiem_trong',",
    replace: "      code: 'thang_may_thieu_kich_thuoc',\n      severity: 'canh_bao',",
  },
  {
    id: 'M49',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Ô thang bị thang máy chắn khỏi hành lang mà câu nhắc kể cả tầng và dặn GIỮ NGUYÊN thang máy — mô hình nộp lại y nguyên, ba lượt sửa tiêu phí (lượt thật b5202883)',
    find: '  if (stairs.length && ![...linked].some((id) => !stairIds.has(id))) {',
    replace: '  if (false) {',
  },
  {
    id: 'M50',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Đầu bài khai thang máy cạnh thang bộ mà mặt bằng để thang máy chắn giữa thang bộ và hành lang — cổng không bác (Haan 25/09/2026)',
    find: "    if ((layout === 'canh_thang_bo' || layout === 'doi_dien_thang_bo') && !common) {",
    replace: '    if (false) {',
  },
  {
    id: 'M51',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Bản phác hỏng vì một phòng thiếu lối vào mà câu nhắc im lặng về phòng khác chỉ vào được qua ô thang — mô hình sửa xong thì lộ lỗi kế, hết lượt sửa (lượt thật 4b0268b1)',
    find: '  const also = stairOnly.length',
    replace: '  const also = [].length',
  },
  {
    id: 'M52',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Ép ô thang / thang máy sang tầng trên xoá trọn một phòng mô hình đã vẽ mà câu báo nói «bản phác không vẽ» phòng ấy (lượt thật 913bc2ad)',
    find: '    if (gone.length) {',
    replace: '    if (gone.length && false) {',
  },
  {
    id: 'M53',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng dưới chia lại đã dời ô lõi; lỗi ép mốc ở tầng trên vẫn gửi mô hình như lỗi của bản phác tầng trên, và lỗi tầng dưới không đứng đầu (lượt thật 913bc2ad)',
    find: '      dropped.some((item) => item.coresMoved.length > 0) &&',
    replace: '      false &&',
  },
  {
    id: 'M54',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Giếng thang máy dựng thành dải 1,6 × 6,45 m cho giếng 1,3 × 1,4 m mà cổng vẫn cho qua (lượt thật 913bc2ad)',
    find: '    if (lift.shaftWidthM !== null && lift.shaftDepthM !== null && (tooLong || tooBig)) {',
    replace: '    if (lift.shaftWidthM !== null && lift.shaftDepthM !== null && false) {',
  },
  {
    id: 'M55',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Dòng `min_cells` của giếng thang máy không nói số ô mỗi cạnh — mô hình vẽ giếng 1 × 4 ô (lượt thật 913bc2ad)',
    find: '      min_side_cells: Math.min(across, deep),',
    replace: '      min_side_cells: 1,',
  },
  {
    id: 'M56',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/arrange/sketch.ts',
    bug: 'Nới phòng hụt ô lấy một dải KHÔNG trọn hàng / cột của phòng kề — phòng kề thành hình chữ L, bản phác hỏng (T79)',
    find: '    if (!whole) return;',
    replace: '    if (whole && false) return;',
  },
  {
    id: 'M57',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lượt sửa chỉ trả tầng có lỗi mà chương trình không ghép tầng còn lại từ ý định trước — cả nhà mất tầng (T79)',
    find: '  if (!kept.length) return roof ? { ...answer, roof } : answer;',
    replace: '  if (kept.length >= 0) return roof ? { ...answer, roof } : answer;',
  },
  {
    id: 'M58',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Gửi lại bản tốt nhất mãi dù hai lượt liền không tiến — ba lượt cùng một câu nhắc (T79)',
    find: '  if (stalled) {',
    replace: '  if (stalled && false) {',
  },
  {
    id: 'M59',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Bậc tệ chỉ đếm số lỗi: vòng đã dựng được cây (hai phòng hụt vài phần trăm) bị gạt sau vòng còn lỗi bản phác, câu nhắc diện tích không bao giờ tới mô hình (lượt thật 4198d692)',
    find: '  return -lowest * 10_000 + (atSketch ? 1_000 : 0) + problems;',
    replace: '  return -lowest * 10_000 + problems;',
  },
  {
    id: 'M60',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Cổng sau khi dựng bỏ dung sai 3 % cho sàn đầu bài: phòng 14,92 / 15 m² bị bác, mất lượt sửa (T82, lượt thật 4198d692)',
    find: '    if (need <= 0 || Math.round(room.area_m2 * 10) / 10 >= need * (1 - tolerance)) return [];',
    replace: '    if (need <= 0 || Math.round(room.area_m2 * 10) / 10 >= need) return [];',
  },
  {
    id: 'M61',
    axis: 'phát hành',
    file: 'workers/src/design/workflows/rpc-stub.ts',
    bug: 'Stub RPC của binding Workflow không được huỷ — finalizer ghi cảnh báo trong lúc dọn rác, wrangler dev tự huỷ (T84, ba lần sập 25/09/2026)',
    find: '    (fn as (this: unknown) => void).call(stub);',
    replace: '    void fn;',
  },
  {
    id: 'M62',
    axis: 'phát hành',
    file: 'workers/src/design/workflows/rpc-stub.ts',
    bug: 'Kết quả `step.do` (kết quả RPC từ engine Workflows) bị bỏ rơi cho bộ dọn rác — nguồn thứ hai của cùng cảnh báo làm wrangler dev tự huỷ (T85, lượt dc949b49)',
    find: '        disposeStub(result);',
    replace: '        void result;',
  },
  {
    id: 'M63',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lượt sửa vẽ lại tầng đã qua và bản vẽ lại thay bản cũ — tầng đã qua hỏng lại, tầng hỏng đổi qua lại (T86, lượt dc949b49)',
    find: '  const locked = new Set(keep);\n  // Câu trả lời chỉ còn phần của tầng chưa khoá',
    replace:
      '  const locked = new Set<number>();\n  // Câu trả lời chỉ còn phần của tầng chưa khoá',
  },
  {
    id: 'M64',
    axis: 'bản vẽ',
    file: 'workers/src/design/workflows/ai-design-steps.ts',
    bug: 'Bước gọi mô hình của Workflow bỏ rơi danh sách tầng giữ — T86 chỉ chạy ở tuyến đồng bộ, không ở lượt thật',
    find: '      ...(retrying && keep?.length ? { keep } : {}),',
    replace: '',
  },
  {
    id: 'M65',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng giữ đã bị chương trình chia lại vẫn gửi mô hình bản phác cũ — mô hình vẽ tầng trên theo ô thang, thang máy không có thật (T86 phương án 1)',
    find: '  if (!redraw.size || !intent.sketches) return intent;',
    replace: '  return intent;',
  },
  {
    id: 'M66',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng dưới đã giữ mà câu nhắc vẫn đòi mô hình sửa bản phác của nó — mô hình vẽ lại và làm hỏng tầng đã qua (lượt dc949b49 vòng 3)',
    find: '    const hints = failed.flatMap((item) => (lockedAll(item.dropped) ? item.settled : item.normal));',
    replace: '    const hints = failed.flatMap((item) => item.normal);',
  },
  {
    id: 'M67',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lời bác ở cổng danh mục phòng bị coi là «mọi tầng đã xếp» — lượt sửa đi xa hơn bị gạt, hai lời gọi trả tiền nhận lại câu nhắc cũ (lượt thật 81fd3f57)',
    find: '  const lowest = atProgram ? 0 : levels.length ? Math.min(...levels) : 1_000;',
    replace: '  const lowest = levels.length ? Math.min(...levels) : 1_000;',
  },
  {
    id: 'M68',
    axis: 'tiền',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Phòng hụt sàn đầu bài mà không phòng kề nào nhường đủ, câu nhắc vẫn bảo «lấy của phòng kề» — mô hình đẩy lấn làm hỏng ô thang, tiêu hết lượt sửa (T89, lượt thật bc504189)',
    find: '  if ([...neighbours].some(canGive)) return issue;',
    replace: '  if (neighbours.size) return issue;',
  },
  {
    id: 'M69',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Kiểm cả nhà hỏng vì hệ quả của việc chia lại một tầng, câu nhắc chỉ nói hệ quả — mô hình sửa sai chỗ ba lần, hết lượt (T90, lượt thật 02982bd7)',
    find: '      hints: ownHints.length ? [...replacedHints, ...ownHints].slice(0, HINTS_MAX) : [],',
    replace: '      hints: ownHints,',
  },
  {
    id: 'M70',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Diện tích khai thấp hơn sàn đầu bài lại bị bác ở cổng danh mục — một con số che lỗi thật của bản phác, tốn thêm một lượt gọi (T91, lượt Sonnet 5 e7caa832)',
    find: '  const lifted = liftToBriefFloors(folded.proposal, context.knowledge, input.labels);',
    replace: '  const lifted = { proposal: folded.proposal, notes: [] as string[] };',
  },
  {
    id: 'M71',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Phòng thiếu sàn mà cả tầng hết chỗ bù vẫn bị bác và gửi lại mô hình — gọi lại vô ích, không bao giờ ra mặt bằng (T91)',
    find: '    if (!(deficit > 0) || spare.total >= deficit || waived.has(shortDrawn.ref)) break;',
    replace: '    break;',
  },
  {
    id: 'M72',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/brief-demands.ts',
    bug: 'Ban công ở mặt gia chủ không cho (ngoài mặt bắt buộc và mặt có thể) lọt qua (T91)',
    find: '      ? SIDES.filter((s) => !declared.has(s))',
    replace: '      ? []',
  },
  {
    id: 'M73',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/mandatory.ts',
    bug: 'Ban công dài quay cạnh ngắn ra mặt thoáng bị CHẶN — Haan chỉ cho trừ điểm nặng; chặn khi không cạnh nào thoáng (T116)',
    find: '        blind && rule.blocking,',
    replace: '        rule.blocking,',
  },
  {
    id: 'M74',
    axis: 'phát hành',
    file: 'shared/src/design/brief-completeness.ts',
    bug: 'Ban công đua sang đất nhà người khác chỉ bị cảnh báo, lượt chạy vẫn đi (T91)',
    find: "        code: 'ban_cong_dua_sang_dat_khac',\n        severity: 'nghiem_trong',",
    replace: "        code: 'ban_cong_dua_sang_dat_khac',\n        severity: 'canh_bao',",
  },
  {
    id: 'M75',
    axis: 'tiền',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng 1 hỏng thì bản phác tầng trên không được soát — mô hình sửa xong tầng 1 mới biết tầng 2 hỏng, mỗi tầng một lượt gọi (T92; 37/41 vòng thật có lỗi tầng trên bị che)',
    find: '      if (!pre.issues.length) continue;',
    replace: '      continue;',
  },
  {
    id: 'M76',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Chia lại tầng không ưu tiên giữ ban công ở mặt bản phác đã vẽ — cả nhà hỏng vì «thiếu ban công» mà mô hình đã vẽ (T92, lượt 02982bd7)',
    find: '    Number(q.balconiesKept ?? true) - Number(p.balconiesKept ?? true) ||',
    replace: '',
  },
  {
    id: 'M77',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Chương trình không thử phân lại diện tích mục tiêu trước khi bác — mặt bằng xếp được nhờ chia lại mục tiêu bị bỏ lỡ (T94, lượt 5aba737d, 4a521f52)',
    find: '    if (!candidate) continue;',
    replace: '    if (candidate || !candidate) continue;',
  },
  {
    id: 'M78',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Chương trình không thử chèn dải hành lang vào đường cắt của tầng hỏng (T94, lượt 3ff10f75)',
    find: '    for (const variant of hallVariants(bestIntent, level, `hall_auto_${level}`)) {',
    replace:
      '    for (const variant of hallVariants(bestIntent, level, `hall_auto_${level}`).slice(0, 0)) {',
  },
  {
    id: 'M79',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'So biến thể không đặt «xếp được» lên trước — biến thể hỏng ít lỗi thắng mặt bằng đã xếp được (T94)',
    find: '    if (!!a.ok !== !!b.ok) return !!a.ok;',
    replace: '    if (!!a.ok !== !!b.ok) return !!b.ok;',
  },
  {
    id: 'M80',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/program.ts',
    bug: 'Cổng danh mục không bác không gian đầu bài không hỏi tới — giếng trời, sân thượng mô hình tự bịa lọt qua (T96)',
    find: '        .filter((type) => knowledge.only_when_asked.includes(type) && !asked.has(type)),',
    replace:
      '        .filter((type) => knowledge.only_when_asked.includes(type) && asked.has(type)),',
  },
  {
    id: 'M81',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Sàn theo nhóm không bắt nhóm nào — tổng qua 65 nhờ diện tích trong khi giao thông chấm 0 vẫn được nhận (T96)',
    find: '      (group) => group.scoredWeight > 0 && (group.points / group.scoredWeight) * 100 < floorPercent,',
    replace:
      '      (group) => group.scoredWeight > 0 && (group.points / group.scoredWeight) * 100 < 0,',
  },
  {
    id: 'M82',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Gộp lượt sửa theo MÃ phòng: phòng mới trùng mã phòng tầng giữ xoá mất phòng tầng giữ — hành lang tầng 1 biến mất, bốn phòng «không có lối vào» (lượt thật 5584bf0d, T97)',
    find: '    const clashing = own.rooms.filter((room) => keptIds.has(room.id));',
    replace: '    const clashing = own.rooms.filter(() => false);',
  },
  {
    id: 'M83',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Bản phác chương trình vẽ lại cho tầng giữ không được soát: phòng co vì làm tròn ô, vòng sau bác chính tầng «giữ nguyên» (lượt thật 5584bf0d, T97)',
    find: '    return verify(sketch.level, rows) ? { ...sketch, rows } : sketch;',
    replace: '    return { ...sketch, rows };',
  },
  {
    id: 'M84',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Vòng nới của bộ xếp nới cả vùng bếp / phòng thờ — hướng đầu bài quy định cho chúng (chỉ tới mặt bằng qua chỗ mô hình đặt) bị bỏ âm thầm (T100)',
    find: '    leaf.types.some((type) => keepZone.has(type))',
    replace: '    false',
  },
  {
    id: 'M85',
    axis: 'đầu bài',
    file: 'shared/src/design/brief-completeness.ts',
    bug: 'Đầu bài khai hướng bàn thờ / bếp hai nơi hai hướng mà không cảnh báo — mô hình tự chọn một thay gia chủ (Haan 28/09/2026)',
    find: '    if (distinct.length < 2) continue;',
    replace: '    continue;',
  },
  {
    id: 'M86',
    axis: 'đầu bài',
    file: 'shared/src/design/brief-completeness.ts',
    bug: 'Lối vào chính / lối xe đặt ở mặt không tiếp cận được mà không chặn — mô hình dựng cửa ở mặt không ai đi tới (28/09/2026)',
    find: '      if (side && !access.includes(side)) {',
    replace: '      if (side && access.includes(side) && !side) {',
  },
  {
    id: 'M87',
    axis: 'đầu bài',
    file: 'shared/src/design/brief-completeness.ts',
    bug: 'Phép soát đầu bài đọc cả câu trả lời của ô đang ẩn — chặn «AI Design» bằng một ô người dùng không nhìn thấy để sửa (rà soát 29/09/2026)',
    find: '  const draft = withoutHiddenAnswers(input, config);',
    replace: '  const draft = input;',
  },
  {
    id: 'M88',
    axis: 'đầu bài',
    file: 'workers/src/design/brief/anonymise.ts',
    bug: 'Bản gửi mô hình mang câu trả lời của ô đang ẩn — nhà phố mang khoảng lùi cũ vào khối xây dựng được (rà soát 29/09/2026)',
    find: '  const brief = withoutHiddenAnswers(input.brief, BRIEF_FORM, DIGEST_KEEPS);',
    replace: '  const brief = input.brief;',
  },
  {
    id: 'M89',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/skeleton.ts',
    bug: 'Khung xương (T102) đặt dải dọc V về phía tường thay vì phía trống — không dựng được khung nào, tầng rơi về đường cũ',
    find: "  const vSides: ('lo' | 'hi')[] = wallLeft ? ['hi'] : wallRight ? ['lo'] : ['hi', 'lo'];",
    replace:
      "  const vSides: ('lo' | 'hi')[] = wallLeft ? ['lo'] : wallRight ? ['hi'] : ['hi', 'lo'];",
  },
  {
    id: 'M90',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/pack.ts',
    bug: 'Dải khép kín chung đẩy ban công vào lòng nhà mà không thử hai dải riêng (T103) — cả nhà hỏng vì thiếu ban công mặt trước',
    find: '    if (!onFront && !enclosed) return single;',
    replace: '    if (!onFront) return single;',
  },
  {
    id: 'M91',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Lối vào thang không chọn theo đầu ngắn / góc bậc 1 (T103) — ô mở giữa cạnh dài, chữ «LÊN» bị tường bít',
    find: '        : stairEntry(stairId, rect, doors, reached, isHub, shared);',
    replace: '        : (null as { up: StairUp } | null);',
  },
  {
    id: 'M92',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Giặt phơi không đổi chỗ với phòng kỹ thuật đang chiếm góc thoáng (T103)',
    find: '    if (turned.swapped.length) {',
    replace: '    if (turned.swapped.length && false) {',
  },
  {
    id: 'M93',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Gia chủ muốn khách / ăn / bếp tách riêng mà chương trình vẫn nối bằng ô thông (T103)',
    find: "        currentIsHub && !kept(current, next) ? 'opening' : 'single',",
    replace: "        currentIsHub ? 'opening' : 'single',",
  },
  {
    id: 'M94',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Không giữ biến thể hành lang thu hẹp (T104) — hành lang tầng 1 vẫn rộng 2,4 m',
    find: '  if (input.trimCorridors || input.widenRooms || input.splitClosets) return chosen.evaluation;',
    replace: '  return chosen.evaluation;',
  },
  {
    id: 'M95',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Ban công dài chạm mặt cấm bằng đầu ngắn vẫn bị tính là ở mặt ấy (Q-57, T105) — lượt 894b350d bị bác',
    find: 'function shortEndOnly(rect: Rect, side: Side, longRatio: number | null): boolean {\n  if (longRatio === null) return false;',
    replace:
      'function shortEndOnly(rect: Rect, side: Side, longRatio: number | null): boolean {\n  if (longRatio !== null) return false;',
  },
  {
    id: 'M96',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Ô thang lại làm lối đi khi loang cửa (T105) — hành lang sau tầng 2 «tới được» qua vế bậc',
    find: '    if (input.stairIds.has(current) && !starts.includes(current)) continue;',
    replace: '    if (input.stairIds.has(current) && starts.includes(current) && false) continue;',
  },
  {
    id: 'M97',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/tree/openings.ts',
    bug: 'Bước dựng cửa mở lối thứ hai từ ô thang sang hành lang (T105) — lượt 25fdc90c lại qua cổng',
    find: "            hosts.includes(input.typeOf.get(room) ?? '') &&",
    replace: '            false &&',
  },
  {
    id: 'M98',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Hành lang không tới được lại im lặng (T105) — bộ xếp không bỏ cây, cổng cuối mới bắt',
    find: "    if (l.role !== 'hub' || l.parent || reached.has(id) || input.stairIds.has(id)) continue;",
    replace: '    continue;',
  },
  {
    id: 'M99',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Lối lên thang ở cạnh dài không bị báo (T105) — bậc 1 giáp tường kho vẫn qua',
    find: '      if (entry?.longSide) {',
    replace: '      if (entry?.longSide && false) {',
  },
  {
    id: 'M100',
    axis: 'thước chấm',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Phòng ngủ tối hẳn không bị trừ (D2, T105)',
    find: '    return { value: dark.length, refs: dark.map((room) => room.id) };',
    replace: '    return { value: 0, refs: dark.map((room) => room.id) };',
  },
  {
    id: 'M101',
    axis: 'thước chấm',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Gara phải vòng ra ngoài mới vào phòng khách không bị trừ (C11, T105)',
    find: '    if (!walk) return { value: 9, refs: garages.map((room) => room.id) };',
    replace: '    if (!walk) return { value: 0, refs: [] };',
  },
  {
    id: 'M102',
    axis: 'phát lại',
    file: 'workers/src/design/__tests__/ai-real-context.ts',
    bug: 'Phát lại quên chuẩn hoá mã phòng như đường thật (T105) — mọi số đo lệch với lượt thật',
    find: 'tidyHouse(intent) as HouseIntent',
    replace: 'intent as HouseIntent',
  },
  {
    id: 'M103',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/skeleton.ts',
    bug: 'Khung xương bỏ qua ô thang đứng giữa nhà (T105)',
    find: "wallRight ? ['lo'] : ['hi', 'lo'];",
    replace: "wallRight ? ['lo'] : [];",
  },
  {
    id: 'M104',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/skeleton.ts',
    bug: 'Phòng phụ trợ dải lõi chiếm dải V của nhà phố hẹp (T105) — phòng sau chỉ tới được qua thang',
    find: '      else if (isService(item) && variant.v && variant.pull) service.push(item);',
    replace: '      else if (isService(item) && variant.v) service.push(item);',
  },
  {
    id: 'M105',
    axis: 'câu nhắc',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Câu nhắc tầng trên không nói vị trí ô thang tầng dưới đã dựng (T105, lượt 1330ce12)',
    find: '    const cells = result.stairCells;',
    replace: '    const cells = undefined as typeof result.stairCells;',
  },
  {
    id: 'M106',
    axis: 'thang',
    file: 'workers/src/design/ai/stair-geometry.ts',
    bug: 'Ô thang chữ U chỉ rộng một vế (T105) — thang không vừa tài liệu mà vẫn qua',
    find: '        across: Math.ceil(2 * w + p.gap),',
    replace: '        across: Math.ceil(w + p.gap),',
  },
  {
    id: 'M107',
    axis: 'thang',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Lối vào thang theo loại không kiểm ô đủ chỗ theo chiều vào (T105) — vào ngang vế',
    find: '    if (!stairFits(params, along, across)) continue;',
    replace: '    if (false) continue;',
  },
  {
    id: 'M108',
    axis: 'thang',
    file: 'workers/src/design/ai/stair-choice.ts',
    bug: 'Nhà có người già không được chọn thang U chiếu nghỉ rộng (T105)',
    find: "  if (elderly && has('chu_u_rong') && fitsAcross('chu_u_rong')) {",
    replace: "  if (false && elderly && has('chu_u_rong') && fitsAcross('chu_u_rong')) {",
  },
  {
    id: 'M109',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/stairs.ts',
    bug: 'Phần thang trên mặt cắt vẽ nét liền như dưới mặt cắt (T105, ký hiệu tài liệu)',
    find: '    (piece.n > cut ? out.above : out.treads).push(d);',
    replace: '    out.treads.push(d);',
  },
  {
    id: 'M110',
    axis: 'thang',
    file: 'workers/src/design/workflows/ai-design-steps.ts',
    bug: 'Luồng chạy thật quên gắn loại thang của lượt (T105) — mặt bằng vẽ thang cũ',
    find: '    construction: withHouseProfile(withStairShape(deps.construction, params.digest), params.digest),\n    siteContext',
    replace:
      '    construction: withHouseProfile(deps.construction, params.digest),\n    siteContext',
  },
  {
    id: 'M111',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/program.ts',
    bug: 'WC khép kín của phòng ngủ lại đáp ứng dòng WC chung của đầu bài (T106) — tầng 1 thiếu WC chung mà vẫn qua',
    find: "        !(type === 'wc' && s.ensuite_of),",
    replace: '        true,',
  },
  {
    id: 'M112',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Cửa phòng thờ lại mở ở vách sau lưng bàn thờ theo hướng gia chủ khai (T106)',
    find: '        ? hosts.filter((id) => sideOf(rect.get(room)!, rect.get(id)!) !== altarBack)',
    replace: '        ? hosts',
  },
  {
    id: 'M113',
    axis: 'bám đầu bài',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Khối ban công vuông ở góc lại được tính là ban công mặt trước (T106)',
    find: '  if (!perpendicular.some((other) => touchesSide(level, rect, other))) return false;',
    replace: '  return false;',
  },
  {
    id: 'M114',
    axis: 'lời dẫn',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Mô hình không được báo số ô ô thang theo loại thang (T106, lượt 2c522a90 — vẽ cột thang tầng 2 hẹp 1 ô)',
    find: '            cells: stair.shape.cells,',
    replace: '',
  },
  {
    id: 'M115',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Ba lượt liền hỏng cùng tập lỗi vẫn gọi tiếp tới hết lượt sửa (tổng hợp 37 lượt thật, lượt 6bf43039)',
    find: '  if (history.length < after) return false;',
    replace: '  if (history.length >= 0) return false;',
  },
  {
    id: 'M116',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lượt sửa gửi lại cả tầng đã khoá (câu lượt sửa gấp đôi lượt đầu)',
    find: '  const sent = previous.rooms.filter((room) => !locked.has(room.level));',
    replace: '  const sent = previous.rooms.filter(() => true);',
  },
  {
    id: 'M117',
    axis: 'lời dẫn',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Ban công bị nắn thành khối góc mà vẫn ở mặt ấy bị coi là hệ quả của việc chia lại tầng — lỗi ban công góc (T106) không tới mô hình',
    find: '    return [...onSketch].some(([id, drawn]) => sketchMeets(drawn, side) && !onPlan(id, side));',
    replace: '    return [...onSketch].some(([, drawn]) => sketchMeets(drawn, side));',
  },
  {
    id: 'M118',
    axis: 'lời dẫn',
    file: 'workers/src/design/ai/arrange/sketch.ts',
    bug: 'Lỗi chong chóng không nói chỗ (lượt 6bf43039: ba lượt liền cùng câu, cùng bản vẽ)',
    find: '  const spot = pinwheelSpot(grid, { c0: 0, r0: 0, c1: grid.cols, r1: grid.rows });',
    replace: '  const spot = null as ReturnType<typeof pinwheelSpot>;',
  },
  {
    id: 'M119',
    axis: 'lời dẫn',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Phòng có sàn đầu bài không kèm số ô mỗi cạnh — mô hình vẽ đủ ô thành dải mỏng (lượt bea4c6fa, f1a88ac1)',
    find: '            min_side_cells: minSketchSideCells(space.area_m2, grid.cell_m, wall),',
    replace: '',
  },
  {
    id: 'M120',
    axis: 'thước chấm',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'D4 đo «giáp ban công / sân thượng» trên chữ nhật lọt lòng mà không trừ bề dày tường — giặt phơi giáp sân thượng bị coi là không có chỗ phơi',
    find: '  const near = (d: number) => d >= -1 && d <= gap;',
    replace: '  const near = (d: number) => d >= -1 && d <= 2;',
  },
  {
    id: 'M121',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Danh mục sai đầu bài thì không soát bản phác — mỗi vòng chỉ lộ một nhóm lỗi (lượt bea4c6fa: bốn lời gọi cho bốn lỗi có từ vòng 1)',
    find: '    const pre = precheckSketches(input, context, program, byLevel, minimums, sketches, prompts);',
    replace: '    const pre = { hints: [] as string[], messages: [] as string[] };',
  },
  {
    id: 'M122',
    axis: 'lời dẫn',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Ban công góc ngắn trên bản phác không được khuyên sớm — lộ một lượt gọi sau, khi mọi tầng đã xếp (lượt bea4c6fa)',
    find: '    if (touching.some((t) => !t.corner || t.along >= longRatio * t.across)) continue;',
    replace: '    if (touching.length) continue;',
  },
  {
    id: 'M123',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Chia lại tầng không ghim ban công bắt buộc — ban công mặt trước bị dời sang mặt cấm (lượt bea4c6fa vòng 5–6)',
    find: '  if (ok(rooms)) return result;',
    replace: '  if (ok(rooms) || pins.length) return result;',
  },
  {
    id: 'M124',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/feasibility.ts',
    bug: 'Kiểm khả thi không bao giờ chặn — đầu bài vượt sàn vẫn gọi mô hình năm lượt chắc chắn hỏng (T112)',
    find: '    if (needCells > haveCells * maxShare) out.push({ level, haveCells, needCells, items });',
    replace:
      '    if (needCells > haveCells * maxShare * 2) out.push({ level, haveCells, needCells, items });',
  },
  {
    id: 'M125',
    axis: 'đầu bài',
    file: 'workers/src/design/kb/site-context.ts',
    bug: 'Mặt giáp đất trống lùi 0 m vẫn tính là mặt thoáng — phòng ở, ban công quay ra đất người khác (T112)',
    find: '    if (setbacks && minSetback !== undefined && (setbacks[face] ?? 0) < minSetback) return false;',
    replace: '',
  },
  {
    id: 'M126',
    axis: 'đầu bài',
    file: 'workers/src/design/ai/program.ts',
    bug: 'Phòng ngủ khép kín ghép theo cỡ thuần — WC khép kín gắn phòng giúp việc vẫn qua mức 20 m² của phòng ông bà (T112)',
    find: '    if (index < 0) index = left.length ? 0 : -1;',
    replace: '    index = left.length ? 0 : -1;',
  },
  // ── Lời dẫn: đầu bài cắt theo lời gọi (T114) ──────────────────────────────────────────
  {
    id: 'M127',
    axis: 'lời dẫn',
    file: 'workers/src/design/brief/slice.ts',
    bug: 'Bỏ lọc nhãn `for` — lời gọi mặt bằng nhận lại phong cách, lời gọi mặt đứng nhận cả gia đình, phòng và khảo sát hiện trạng (Haan 03/10/2026: «không bị thừa thông tin không cần thiết»)',
    find: '      if (targets.includes(target)) continue;',
    replace: '      if (targets.length > 0) continue;',
  },
  // ── Riêng tư: bản vẽ kỹ sư tải lên (T114 Đợt 4) ──────────────────────────────────────────
  {
    id: 'M128',
    axis: 'riêng tư',
    file: 'workers/src/design/ai/upload.ts',
    bug: 'Nhận bản vẽ tải lên khi chưa xác nhận đã bỏ khung tên — tên, địa chỉ chủ nhà trên khung tên đi thẳng tới nhà cung cấp mô hình ảnh (dữ liệu hạng 1, T12)',
    find: '  if (body.identityCleared !== true) {',
    replace: '  if (false as boolean) {',
  },
  {
    id: 'M129',
    axis: 'bản vẽ',
    file: 'shared/src/design/house-profile.ts',
    bug: 'Lô hẹp hai bên đều giáp đường vẫn bị coi là nhà ống — luật và thông số nhà ống áp sai loại (T116)',
    find: '  return closed >= rule.min_closed_sides;',
    replace: '  return closed >= 0;',
  },
  {
    id: 'M130',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Ô thang tầng trên không chồng đúng bề ngang ô thang tầng 1 — thang lệch tầng (đường v6, T116)',
    find: '      fixed[at] = stairBelow.x1 - stairBelow.x0;',
    replace: '      fixed[at] = stairBelow.x1 - stairBelow.x0 + 10;',
  },
  {
    id: 'M131',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Gara mang lối vào chính mất cửa đi — khoá khử trùng nuốt cửa người sau cửa cuốn (lượt e34f8f58, T115)',
    find: "        ? `${a}|outside|${kind === 'garage' || kind === 'gate' ? 'xe' : 'nguoi'}`",
    replace: '        ? `${a}|outside`',
  },
  {
    id: 'M132',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-quality.ts',
    bug: 'Thước chấm bỏ lớp loại nhà — nhà ống bị chấm hành lang 0,9 m như nhà phố 1,0 m, WC lệch trục nhẹ như mọi nhà (T116)',
    find: '  const profile = houseProfile ? spec.byBuildingType[houseProfile] : undefined;',
    replace: '  const profile = undefined as Partial<CriterionSpec> | undefined;',
  },
  {
    id: 'M133',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lời dẫn v6 gửi hành lang làm tròn ô lưới (1.500 mm) trái mẫu dải 900 mm — mô hình nghĩ lâu, hành lang to (lượt 619f0438, P0-1)',
    find: '    ...(bands.corridorClearCm ? { corridor_min_mm: bands.corridorClearCm * 10 } : {}),',
    replace: '    ...({}),',
  },
  {
    id: 'M134',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Đường v6 không chặn đầu bài vượt sàn — gọi mô hình cho một nhà chắc chắn không xếp vừa (P0-4)',
    find: '  if (context.bands && context.layout?.loads) return loadsIssue(context.layout.loads, input.labels);',
    replace: '  if (context.bands && context.layout?.loads) return null;',
  },
  {
    id: 'M135',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Ô thiếu bề ngang không mượn phần dư của ô cùng dải — mô hình tốn một vòng sửa vì 100 mm (lượt thật 36fb8000)',
    find: '      if (donors.reduce((sum, d) => sum + slack(d), 0) < short) return;',
    replace: '      if (donors.length >= 0) return;',
  },
  {
    id: 'M136',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Chiều sâu dải mô hình ghi lớn hơn mức cần lại thành mức sàn — ép thang tầng 1, báo thừa sâu oan (lượt thật 36fb8000)',
    find: '  const minDepth = bands.map((band, b) => {\n    return Math.max(\n',
    replace:
      '  const minDepth = bands.map((band, b) => {\n    return Math.max(\n      givenDepth[b]!,\n',
  },
  {
    id: 'M137',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/feasibility.ts',
    bug: 'Cổng khả thi bỏ qua chiều sâu: nhà hẹp không thể xếp vừa theo chiều sâu vẫn gọi mô hình, lời dẫn không gợi ý ghép phòng',
    find: '      needM2 > capM2 || (depth && depth.bestCm > depth.capCm)',
    replace: '      needM2 > capM2',
  },
  {
    id: 'M138',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/feasibility.ts',
    bug: 'Lời dẫn không báo tầng nhà hẹp vượt chiều sâu khi mỗi phòng một dải (lượt thật 36fb8000 tốn ba vòng sửa)',
    find: '  if (!d || d.oneEachCm <= d.capCm) return area;',
    replace: '  if (!d || d.oneEachCm > 0) return area;',
  },
  {
    id: 'M139',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Hành lang cùng mã ở nhiều dải một tầng bị bác «xuất hiện hai lần» — mất một vòng gọi mô hình chỉ để đổi mã (lượt thật 93d212a2)',
    find: "          if (onStorey.has(id) && type === 'circulation') {",
    replace: "          if (onStorey.has(id) && type === 'never') {",
  },
  {
    id: 'M140',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Tầng đặt mốc thang hỏng thì tầng trên đo theo ô thang tầng kế — lỗi chiều sâu giả gửi mô hình (lượt thật 93d212a2)',
    find: '    if (!stairRect && !anchorFailed)',
    replace: '    if (!stairRect)',
  },
  {
    id: 'M141',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Dải tầng 1 không vừa khối mà chương trình không dựng lại — mô hình tốn vòng sửa cho chỗ nó đã hỏng ba lần (lượt thật 93d212a2)',
    find: '    if (rescued) attempt = rescued.attempt;',
    replace: '    if (rescued && Number.isNaN(0)) attempt = rescued.attempt;',
  },
  {
    id: 'M142',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/workflows/ai-design-steps.ts',
    bug: 'Workflow thật không dựng lại tầng 1 (chỉ đường phát lại có) — bản demo vẫn tốn vòng sửa',
    find: '    !intent && proposal.bandsBase',
    replace: '    !intent && proposal.bandsBase && Number.isNaN(0)',
  },
  {
    id: 'M143',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng 1 dựng lại không cần qua cổng ở tầng 1 — nhận cách gara mang cửa chính không được, WC mở ra gara',
    find: '        if (evaluation.rejections.some((rejection) => rejection.level === 1)) return null;',
    replace:
      '        if (evaluation.rejections.some((rejection) => rejection.level === -1)) return null;',
  },
  {
    id: 'M144',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/doors.ts',
    bug: 'Ô thang mở ô thông thẳng ra gara — trái luật ô thang chỉ mở ra hành lang / khu chung (T74)',
    find: '      if (b <= a || !passable(b) || shared(a, b) < input.doorWallCm || stairBlocks(a, b)) continue;',
    replace: '      if (b <= a || !passable(b) || shared(a, b) < input.doorWallCm) continue;',
  },
  {
    id: 'M145',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/doors.ts',
    bug: 'Vách chung trừ trọn tường ngoài ở cả hai đầu — đầu hành lang 900 mm không bao giờ đặt được cửa',
    find: '    return edge - cut(lo, min) - cut(hi, max);',
    replace: '    return edge - 2 * exterior;',
  },
  {
    id: 'M146',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Cạnh tối thiểu (lọt lòng) so với bề rộng theo tim tường — WC 90 cm tim tường chỉ 63 cm lọt lòng mà bộ giải cho qua',
    find: '    id === OPEN_CELL ? 0 : side(id) + allowanceOf(band, c);',
    replace: '    id === OPEN_CELL ? 0 : side(id);',
  },
  {
    id: 'M147',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Ô thang tầng trên dài theo dải của nó thay vì đúng ô thang tầng 1 — thang lệch giữa các tầng',
    find: '        if (stairBelow && id === stairId && d > stairH && input.landingId) {',
    replace:
      '        if (stairBelow && id === stairId && d > stairH && input.landingId && Number.isNaN(0)) {',
  },
  {
    id: 'M148',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Hành lang cùng mã ở nhiều tầng bị coi là một phòng — bác cả tầng trên (phát lại 93d212a2)',
    find: "  const stackedTypes = new Set(['shaft', 'technical', 'light_well', 'circulation']);",
    replace: "  const stackedTypes = new Set(['shaft', 'technical', 'light_well']);",
  },
  {
    id: 'M149',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lượt hỏng ở bộ giải được coi là nhẹ nhất — lượt đã vừa khối chỉ thiếu một phòng bị gạt (lượt thật 822e699d)',
    find: '  if (item.rejections.some((r) => (r.codes ?? []).includes(ANSWER_STAGE_CODE)))',
    replace:
      '  if (item.rejections.some((r) => (r.codes ?? []).includes(ANSWER_STAGE_CODE + "x")))',
  },
  {
    id: 'M150',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Bộ giải hỏng thì lỗi danh mục phòng bị che tới khi hình học vừa — tốn thêm vòng (lượt thật 822e699d)',
    find: '    if (!rescued?.evaluation && !attempt.intent && attempt.bandsBase) {',
    replace:
      '    if (!rescued?.evaluation && !attempt.intent && attempt.bandsBase && Number.isNaN(0)) {',
  },
  {
    id: 'M151',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Dựng lại tầng 1 không xét khoảng thang tầng trên chịu được — hết lượt thử ở các cách đặt thang quá sâu',
    find: '    stairWindow: upperStairWindow(bands, layoutCtx, bandsCtx, footprint, typeOf),',
    replace: '    stairWindow: null,',
  },
  {
    id: 'M152',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Mốc tầng trên so lệch tầng (mốc bỏ tầng hỏng, ứng viên tính cả) — cách dựng lại tốt nhất bị loại oan',
    find: '      .filter((level) => result.trees.has(level))',
    replace:
      '      .concat([...result.trees.keys()].filter((l) => l > 1 && !baseLevels.includes(l)))\n      .filter((level) => result.trees.has(level))',
  },
  {
    id: 'M153',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Dựng lại tầng 1 gây thêm lỗi bộ giải ở tầng trên (thang đổi chỗ) mà vẫn được nhận',
    find: '        if (n > (before.get(level) ?? 0)) return null;',
    replace: '        if (n > (before.get(level) ?? 0) + 99) return null;',
  },
  {
    id: 'M154',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Tầng trên không kiểm đầu ô thang có giáp lối đi — bậc 1 / chỗ bước ra đâm vào tường (Haan chấm lượt a68c50bb)',
    find: '        if (open) continue;',
    replace: '        if (open || !open) continue;',
  },
  {
    id: 'M155',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Giếng trời bị lợp ở tầng trên vẫn được nhận — giếng trời không thông lên trời (Haan chấm lượt a68c50bb)',
    find: '        if (kept || open) continue;',
    replace: '        if (kept || open || true) continue;',
  },
  {
    id: 'M156',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Tầng 1 không chọn đầu thang theo cả nhà — tầng trên không có sảnh ở đầu ấy',
    find: '    preferredSide = scored[0]?.side ?? null;',
    replace: '    preferredSide = scored.at(-1)?.side ?? null;',
  },
  {
    id: 'M157',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Bộ giải hỏng thì lỗi giếng trời không thông tầng bị che tới vòng sau',
    find: '        ...bandsLightWellHints(context, attempt.bandsBase, roundPrompts).map((line) =>',
    replace:
      '        ...bandsLightWellHints(context, attempt.bandsBase, roundPrompts).slice(9).map((line) =>',
  },
  {
    id: 'M158',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/stair-choice.ts',
    bug: 'Nhà ống đầu bài chưa chọn thang vẫn dùng chữ U thay vì loại nhỏ nhất vừa nhà (Haan: «diện tích cầu thang tối thiểu»)',
    find: "  if (houseProfile(digest).profile === 'ong') {",
    replace: "  if (houseProfile(digest).profile === 'never') {",
  },
  {
    id: 'M159',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/tree/index.ts',
    bug: 'Mốc thang tầng trên chỉ lấy phần thang, bỏ ô WC gầm thang — thang tầng trên lệch tầng 1',
    find: '  return under ? unionRect(own, under) : own;',
    replace: '  return own;',
  },
  {
    id: 'M160',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Ô [THANG / WC] tầng 1 không thành WC gầm thang — thang cộng thêm WC, sâu quá khối (Haan: «tận dụng gầm cầu thang»)',
    find: '    under > 0 &&',
    replace: '    under < 0 &&',
  },
  {
    id: 'M161',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Giếng trời cùng mã mọi tầng đổi thành `light_well_1_t2` mà không mang loại gốc — bị bác «không có trong danh mục» (lượt thật 41ffe1e5)',
    find: '          renamedFrom.set(`${id}_t${storey.level}`, id);',
    replace: '',
  },
  {
    id: 'M162',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Mã kèm đường dẫn `knowledge.model_added.gt_t1` không được bỏ tiền tố — cả lời gọi bị bác ở hợp đồng (0,09 USD)',
    find: '    return m ? m[1] : json;',
    replace: '    return json;',
  },
  {
    id: 'M163',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Hai tầng ép mốc thang: tầng trên dồn TRƯỚC thang mà câu nhắc bảo dời phòng phía sau (đổ sai phía — lượt thật 41ffe1e5 mái dồn 10,5 m trước thang)',
    find: '        frontSide = overFront(worst) >= overBack(worst);',
    replace: '        frontSide = overFront(worst) < overBack(worst);',
  },
  {
    id: 'M164',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/rebuild.ts',
    bug: 'Bộ dựng lại tầng 1 đẩy THANG ra sát tường thay vì giữ chỗ mô hình đặt — mọi tầng trên hết chỗ',
    find: '      if (stairX !== null && others.every((id) => modelX.has(id))) {',
    replace: '      if (stairX === -1 && others.every((id) => modelX.has(id))) {',
  },
  {
    id: 'M165',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Lỗi giếng trời của tầng khác chặn luôn cách dựng lại tầng 1 — tầng 1 không được giữ, mô hình sửa lại tầng 1',
    find: '        if (!others.every((issue) => LAYOUT_CHECK_CODES.has(issue.code))) return null;',
    replace: '        return null;',
  },
  {
    id: 'M166',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Giếng trời trong ô xếp chồng chia theo diện tích từng tầng — mỗi tầng một đoạn, «giếng tầng 1 bị che ở mái» (lượt thật df9da65a)',
    find: '            need[wellAt] = anchor.y1 - anchor.y0;',
    replace: '',
  },
  {
    id: 'M167',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Không dựng lại với đoạn giếng trời chung khi phòng cùng ô tầng trên sâu hơn tầng 1 (bồn nước mái 2,1 m)',
    find: '  const aligned = commonWell(first.storeys, isWell, input.stepCm);',
    replace: '  const aligned = null as Rect | null;',
  },
  {
    id: 'M168',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Đầu thang tầng trên không giáp lối đi mà chương trình không tự chèn sảnh — gửi mô hình sửa (Haan: «cho chương trình tự chèn sảnh đầu thang»)',
    find: '    if (!blocked.length) break;',
    replace: '    if (blocked.length >= 0) break;',
  },
  {
    id: 'M169',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Phòng chỉ ra được ô thang sau cổng mà chương trình không thử chèn sảnh đầu thang',
    find: '  if (!levels.length) return null;',
    replace: '  if (levels.length >= 0) return null;',
  },
  {
    id: 'M170',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Giếng trời lặp ở tầng trên ra cây mang mã `light_well_1_t2` — cổng cây bác `leaf_unknown` mọi tầng trên',
    find: "    if (programOf.get(stem)?.type === 'light_well') voids.set(id, `void_${voids.size + 1}`);",
    replace: '',
  },
  {
    id: 'M171',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Phòng không lối vào trên dải không báo khi bộ giải hỏng — lỗi lộ dần từng vòng (handoff đợt 2 mục 1.1)',
    find: '  return issues.flatMap((issue) =>',
    replace: '  return issues.slice(0, 0).flatMap((issue) =>',
  },
  {
    id: 'M172',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/access.ts',
    bug: 'Ô xếp chồng: phần ĐẦU (không phải phần cuối) bị coi là chạm dải phía sau — phòng trước ô [WC / hành lang] tưởng có lối vào',
    find: '          link(last, partsOf(c)[0]!);',
    replace: '          link(back[0]!, partsOf(c)[0]!);',
  },
  {
    id: 'M173',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng «roof» mô hình gửi không bị bỏ — mái lại thành việc của mô hình (handoff đợt 2 mục 2)',
    find: "  return bands.storeys.some((storey) => storey.level === 'roof')",
    replace: "  return bands.storeys.some((storey) => storey.level === 'roof_')",
  },
  {
    id: 'M174',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Thang tầng 1 không còn là mốc — tầng 1 vừa khối mà vẫn bị nêu là tầng lệch (handoff đợt 2 mục 3.3)',
    find: '    if (total(first) > depth) {',
    replace: '    if (total(first) >= 0) {',
  },
  {
    id: 'M175',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: '«stair» / «thang» không đổi thành THANG — câu trả lời bị bác (handoff đợt 2 mục 3.1)',
    find: '    if (cell && STAIR_ALIASES.has(lower)) {',
    replace: '    if (cell && STAIR_ALIASES.has(lower + "_")) {',
  },
  {
    id: 'M176',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Câu trả lời đủ khung dải mà sai hợp đồng bị lấy mẫu lại — vứt bỏ thiết kế đúng hướng (handoff đợt 2 mục 3.2)',
    find: '        storeys.every((s) => Array.isArray((s as { bands?: unknown })?.bands));',
    replace: '        storeys.every((s) => Array.isArray((s as { bands?: unknown })?.cells));',
  },
  {
    id: 'M177',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'So bản sửa theo tổng số lỗi — bản sửa đúng một tầng bị gạt vì tổng nhiều hơn (handoff đợt 2 mục 3.4)',
    find: '    if (delta < 0) return false;',
    replace: '    if (delta < -1000) return false;',
  },
  {
    id: 'M178',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/compact.ts',
    bug: 'Ô gọn «a/b» không bung thành ô xếp chồng (handoff đợt 2 mục 4.2)',
    find: "  if (parts.length <= 1) return { id: parts[0] ?? '', w, stack: [] };",
    replace: "  if (parts.length >= 1) return { id: parts[0] ?? '', w, stack: [] };",
  },
  {
    id: 'M179',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Bề rộng mô hình ghi cho phòng thường lại hiểu theo tim tường — «WC 1.100» thành 82 cm lọt lòng (handoff đợt 2 mục 1.2)',
    find: '        if (idsOf(cell).includes(input.stairToken) || !input.walls) return cell.w;',
    replace: '        if (!isClear(cell) || !input.walls) return cell.w;',
  },
  {
    id: 'M180',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Ô thiếu bề ngang che lỗi chiều sâu / mốc thang — mỗi vòng lộ một lớp lỗi (handoff đợt 2 mục 1.1)',
    find: '  if (issues.length > before && !measure) return null;',
    replace: '  if (issues.length > before) return null;',
  },
  {
    id: 'M181',
    axis: 'riêng tư',
    file: 'workers/src/design/ai/program.ts',
    bug: 'Cạnh tối thiểu theo loại nhà (điều kiện dựng) lọt vào tri thức gửi mô hình',
    find: '        const { min_side_m: _side, max_aspect: _aspect, ...kept } = norms;',
    replace: '        const kept = norms;',
  },
  {
    id: 'M182',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Giếng trời tầng trên rộng hơn trục giếng tầng 1 bị báo «che» dù trục vẫn thông (lượt thật affaf12b: tầng 1–3 đúng mà vẫn hỏng)',
    find: '      if (core.x1 > core.x0 && core.y1 > core.y0) return core;',
    replace: '      if (core.x1 > core.x0 && core.y1 > core.y0) return well;',
  },
  {
    id: 'M183',
    axis: 'phát hành',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Cặp cửa gộp qua các vòng sửa không chặn trần — bộ dải lưu kèm phương án sai hợp đồng (lượt thật affaf12b: 31 cặp > 24)',
    find: '    ].slice(-24),',
    replace: '    ].slice(-240),',
  },
  {
    id: 'M184',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng ghi bằng chữ («Tầng 1») không đổi thành số tầng — hợp đồng bác cả bộ dải đúng (lượt thật f0c97c06)',
    find: '      level: storeyLevel(s.level),',
    replace: '      level: s.level,',
  },
  {
    id: 'M185',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/tree/openings.ts',
    bug: 'Ô thông giữa hai hành lang đòi chừa má như cửa đi — vách 87 cm không đủ, cả tầng 4 không đi tới được (lượt thật affaf12b, f0c97c06)',
    find: '    const room = gap ? gap.to - gap.from - (passageOpening ? 0 : 2 * margin) : 0;',
    replace: '    const room = gap ? gap.to - gap.from - 2 * margin : 0;',
  },
  {
    id: 'M186',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/solve.ts',
    bug: 'Tầng 1 dồn phần dư vào dải giếng trời giữa nhà — tầng trên có phòng sâu trước giếng hết chỗ (mẫu C, handoff đợt 3)',
    find: '    if (window.wellLo !== undefined && wellBandIndex >= 0 && wellBandIndex < stairBandIndex) {',
    replace: '    if (false && window.wellLo !== undefined && wellBandIndex >= 0) {',
  },
  {
    id: 'M187',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'WC chung tầng trên cũng được đè phòng khách / ăn như WC riêng — mùi, tiếng nước xuống chỗ tiếp khách (handoff đợt 3)',
    find: '      const ok = isEnsuite(id) ? ensuite!.below : null;',
    replace: '      const ok = ensuite ? ensuite.below : null;',
  },
  {
    id: 'M188',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Nhà ống: mọi phòng ngủ trừ phòng đầu được miễn mặt thoáng theo thứ tự ghi, không theo phòng chính / rộng nhất — phòng ngủ chính tối',
    find: '    const secondary = new Set(rule.mainBedroomOnly ? bedrooms.slice(1).map(([id]) => id) : []);',
    replace:
      '    const secondary = new Set(rule.mainBedroomOnly ? bedrooms.slice(0, -1).map(([id]) => id) : []);',
  },
  {
    id: 'M189',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/layout.ts',
    bug: 'Lỗi WC / mặt thoáng dừng bước dựng trước khi kiểm đầu thang — chương trình không chèn sảnh, câu nhắc mang lối vào ước sai (df9da65a)',
    find: '  if (wellIssues.length)\n',
    replace: '  if (wellIssues.length || roomIssues.length)\n',
  },
  {
    id: 'M190',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'B1 nhà ống chấm theo ngưỡng nhà phố — hành lang 0,9 m / ban công 0,9 m đúng bảng KTS bị trừ, bộ dải đạt thành không đạt',
    find: '        ctx.profileMinSide?.(room.type) ?? ctx.rules.minDimension(ctx.buildingType, room.type);',
    replace: '        ctx.rules.minDimension(ctx.buildingType, room.type);',
  },
  {
    id: 'M191',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Giữ tầng 1 dựng lại chưa qua cổng khi tầng khác chỉ vướng WC / mặt thoáng — tầng 1 cổng bác vẫn được nhận (93d212a2)',
    find: '        if (!others.every((issue) => PARTIAL_OK_CODES.has(issue.code))) return null;',
    replace:
      '        if (!others.every((issue) => LAYOUT_CHECK_CODES.has(issue.code))) return null;',
  },
  {
    id: 'M192',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Sàn riêng từng nhóm bị bỏ qua — nhóm mặt thoáng 55 % vẫn được nhận (handoff đợt 3 mục 3.4: D ≥ 60 %)',
    find: '      const floor = byGroup[group.code] ?? floorPercent;',
    replace: '      const floor = floorPercent;',
  },
  {
    id: 'M193',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'C1 trừ trọn điểm vì hộp kỹ thuật không có cửa «không tới được» — bộ dải đúng thành dưới ngưỡng, tốn một vòng sửa',
    find: "      if (ctx.inGroup('no_door_required', room.type)) continue;",
    replace: "      if (false && ctx.inGroup('no_door_required', room.type)) continue;",
  },
  {
    id: 'M194',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/workflows/ai-design-steps.ts',
    bug: 'Vòng sửa mặt bằng vẫn chạy tuyến deep (Sol) thay vì tuyến sửa — mỗi vòng sửa đắt gấp đôi (handoff đợt 3 mục 4.1)',
    find: '      route: retrying && deps.revise ? deps.revise.route : params.textRoute,',
    replace: '      route: params.textRoute,',
  },
  {
    id: 'M195',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/llm/openai.ts',
    bug: 'Phần lỗi của vòng sửa nằm chung tin nhắn với đầu bài — bộ nhớ đệm chỉ trúng câu dẫn + lược đồ (1.266 / ~4.000 token, lượt f0c97c06)',
    find: "      input.push({ role: 'user', content: [{ type: 'input_text', text: options.promptTail }] });",
    replace: "      content.push({ type: 'input_text', text: options.promptTail });",
  },
  {
    id: 'M196',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/bands/doors.ts',
    bug: 'Chỗ nối hai ô hành lang đòi đủ vách cửa đi (90 cm) thay vì một lối đi — hai đoạn hành lang lệch nhau không nối được',
    find: '      if (shared(a, b) < (zone ? (input.corridorPassCm ?? input.doorWallCm) : input.doorWallCm))',
    replace: '      if (shared(a, b) < input.doorWallCm)',
  },
  // ── Bản vẽ: mặt đứng chi tiết và lưới trục (T147) ────────────────────────────────────
  {
    id: 'M197',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/draw/axes.ts',
    bug: 'Trục làm tròn về cm nguyên — tim tường 483,5 thành trục 484, hàng trục ghi 4730 cạnh hàng chi tiết 4725 trên cùng một tờ',
    find: '      const exact = (a + b) / 2;',
    replace: '      const exact = Math.round((a + b) / 2);',
  },
  {
    id: 'M198',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/draw/elevation-parts.ts',
    bug: 'Nan lan can rải theo nửa bước kb — tờ vẽ dày gấp đôi số nan thật (M5: nan 20 bước 120)',
    find: '    const count = Math.floor((c - a) / spec.pitchCm);',
    replace: '    const count = Math.floor((c - a) / (spec.pitchCm / 2));',
  },
  // ── Bộ xếp mặt bằng: lượt hỏng 75ba5793 (T153) ───────────────────────────────────────
  // Số M203+: nhánh `ai-design-duong-so-do` (chưa merge) đã dùng M199–M202.
  {
    id: 'M203',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Bộ xếp chừa ô thang theo VÁCH NGĂN — ô thang giáp giếng trời / mặt ngoài hụt 1,5 cm lọt lòng, chính bộ kiểm bác tầng 1 (lượt 75ba5793, 0,5 USD)',
    find: '  const wallCm = Math.round(construction.walls.exterior_m * 100);',
    replace: '  const wallCm = Math.round(construction.walls.partition_m * 100);',
  },
  {
    id: 'M204',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/stranded.ts',
    bug: 'Ô kho 2 m² kẹt góc làm cả tầng 1 đúng bị gửi lại mô hình — bốn vòng sửa tệ dần (lượt 75ba5793)',
    find: '      if (reachable) continue;',
    replace: '      if (reachable || room.target_area_m2 > 0) continue;',
  },
  {
    id: 'M205',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Khoá câu trả lời bỏ bản phác — hai câu trả lời khác hình bị coi là trùng, vòng sửa dừng oan (hoặc ngược lại, trùng mà không nhận ra)',
    find: '    sketches: (intent.sketches ?? []).map((k) => [',
    replace: '    sketches: ([] as NonNullable<HouseIntent["sketches"]>).map((k) => [',
  },
  {
    id: 'M206',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Đổi phòng mang cửa chính vẫn hỏng mà không ghi lỗi của cách thử ấy — báo cáo chỉ nói «phòng khách không có cửa», giấu lỗi thật (ô thang ngắn, lượt 75ba5793)',
    find: '    if (!arrangedLevel(groundResult) && nearest) {',
    replace: '    if (!arrangedLevel(groundResult) && nearest && false) {',
  },
  {
    id: 'M207',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/issues.ts',
    bug: 'Lỗi bản phác ngoài REVISABLE_CODES (phòng không cửa, phòng hẹp) rơi khỏi câu nhắc khi tầng phải chia lại — mô hình chỉ nghe hệ quả (lượt 79669685, canh trên 458d9a91 vòng 1)',
    find: '  ...REVISABLE_CODES,\n  ...BAND_REVISABLE_CODES,\n]);',
    replace: '  ...REVISABLE_CODES,\n]);',
  },
  {
    id: 'M208',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Bản phác coi ban công riêng của phòng ngủ là chỗ mở cửa cho giặt phơi — bộ đặt cửa thì không, lỗi lộ ở cổng với mã không gửi mô hình',
    find: '      return !other.ensuiteOf;',
    replace: '      return true;',
  },
  {
    id: 'M209',
    axis: 'câu nhắc',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Bản phác đã có ban công dọc mặt ấy, tầng không bị chia lại — vẫn gửi câu «chỉ chạm ở góc» sai sự thật',
    find: '    if (!replaced.has(level)) return [{ ...issue, params: { ...issue.params, fitted: level } }];',
    replace: '    if (!replaced.has(level)) return [issue];',
  },
  {
    id: 'M210',
    axis: 'câu nhắc',
    file: 'workers/src/design/ai/plan-demands.ts',
    bug: 'Tầng bị chia lại nắn ban công thành khối góc — câu nhắc vẫn bảo mô hình vẽ lại ban công nó đã vẽ đúng (lượt 79669685)',
    find: '    return [{ ...issue, params: { ...issue.params, reshaped: level } }];',
    replace: '    return [issue];',
  },
  {
    id: 'M211',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/frame.ts',
    bug: 'Thân tầng mặt đứng lấy theo hình bao gồm cả ban công đua — tường và mái dựng lên trên ban công (lượt 6e155ce6)',
    find: '      x0: body?.x0 ?? half(Math.min(...xs)),',
    replace: '      x0: half(Math.min(...xs)),',
  },
  {
    id: 'M212',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/frame.ts',
    bug: 'Ý tưởng mặt đứng đã lưu trước T156 không được nắn lúc vẽ — tờ trên web vẫn dựng tường trên ban công đua',
    find: '  if (!plan) return concept;',
    replace: '  if (!plan || true) return concept;',
  },
  {
    id: 'M213',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/facade/frame.ts',
    bug: 'Phào, diềm mái mô hình đặt theo bề ngang cũ thò ra trên ban công đua',
    find: '    if (!WALL_BANDS.has(element.kind)) return element;',
    replace: '    if (!WALL_BANDS.has(element.kind) || true) return element;',
  },
  {
    id: 'M214',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Tầng trên không kiểm đầu người bước ra của thang — lối ra mở ở cạnh dài, giữa vế bậc (phương án 6 hồ sơ c815a6e6, T157)',
    find: '    if (r && !exits.some((other) => sideOf(r, rect.get(other)!) === need)) {',
    replace: '    if (r && false) {',
  },
  {
    id: 'M215',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Lý do chặn của bộ đặt cửa chỉ xếp sau, không loại — mọi ứng viên vướng thì cây ít tệ nhất vẫn qua với thang không bước ra được',
    find: '    if (!blocking.length) {',
    replace: '    if (true) {',
  },
  {
    id: 'M216',
    axis: 'bộ xếp',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Tầng 1 lối vào thang ở cạnh dài chỉ xếp sau, không loại — kho chắn đầu bậc 1, ô thông mở ngang vế đang lên (lượt e1c432f4, T158)',
    find: "  'stair_entry_long_side',\n]);",
    replace: ']);',
  },
  {
    id: 'M217',
    axis: 'số đo bản vẽ',
    file: 'workers/src/design/ai/draw/plan-sheet.ts',
    bug: 'Mỗi tầng tự chọn tỷ lệ theo khung riêng — tầng có ban công đua ra 1:100 khổ ngang, tầng 1 ra 1:80 khổ đứng (lượt e1c432f4, T158)',
    find: '  const bbox = houseBounds(plan, level);',
    replace: '  const bbox = levelBounds(level);',
  },
  {
    id: 'M218',
    axis: 'bản vẽ',
    file: 'web/src/hooks/use-ai-design.ts',
    bug: 'Xoá phương án chỉ nạp lại /state — phương án đã xoá còn trên dải tới khi /state về (vài giây trên demo), Haan tưởng phải tải lại trang',
    find: '  if (variables.hidden !== false) {',
    replace: '  if (false) {',
  },
  {
    id: 'M219',
    axis: 'bản vẽ',
    file: 'web/src/pages/tk/ai/variant-name.ts',
    bug: 'Tên phương án đánh lại theo vị trí, bỏ nhãn cố định của máy chủ — xoá «Phương án 2» thì bản thứ ba thành «Phương án 2»',
    find: '`${prefix} ${item.label ?? index + 1}`',
    replace: '`${prefix} ${index + 1}`',
  },
  {
    id: 'M220',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/variant-labels.ts',
    bug: 'Bản sửa được đánh số như một phương án mới — «Phương án 4» thay vì «Phương án 2.1», không thấy nó sửa từ đâu',
    find: '    if (root === item.id) {',
    replace: '    if (true) {',
  },
  {
    id: 'M221',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/doors.ts',
    bug: 'Tầng trên thang chữ U: lỗ mở ra đặt giữa cạnh — chỉ trùng vế tới ~1 m, phần còn lại mở ra khoảng thông xuống chân thang (lượt e1c432f4, T158)',
    find: "        place: firstFlightAtLowEnd(input.stairUp) ? 'end' : 'start',",
    replace: '        place: null,',
  },
  {
    id: 'M222',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/draw/stairs.ts',
    bug: 'Tầng trên: nhãn «XUỐNG» đặt ở bậc 1 (chân thang tầng dưới) — chỉ vào khoảng thông tầng, không phải chỗ bước xuống',
    find: '  const label = paper.p(arriving ? (tip ?? first) : first);',
    replace: '  const label = paper.p(first);',
  },
  {
    id: 'M223',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/index.ts',
    bug: 'Đầu thang bị phòng chắn thì bỏ cả cây thay vì khoét sảnh — bộ xếp quay thang, xáo bếp và phòng ăn (lượt e1c432f4, T158)',
    find: '  if (blocked(doors.reasons)) {',
    replace: '  if (false) {',
  },
  {
    id: 'M224',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/stair-landing.ts',
    bug: 'Khoét sảnh mà không dời vách phòng kế tiếp để bù — kho hụt diện tích đầu bài khai, không khoét được (lượt e1c432f4, T158)',
    find: '  for (let j = 1; j < next.length && deficit > 0; j += 1) {',
    replace: '  for (let j = 1; false; j += 1) {',
  },
  {
    id: 'M225',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/tree/sizing.ts',
    bug: 'Bước căn vách nới lại hành lang dải vừa thu hẹp — hành lang tầng 2 d084a46e về 2,14 m (T160)',
    find: '      if (capA >= floor && capA < ceil) ceil = capA;',
    replace: '      if (false) ceil = capA;',
  },
  {
    id: 'M226',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/corridor-trim.ts',
    bug: 'Hành lang mô hình vẽ thành hai ô nối nhau không được thu hẹp — tầng 1 d084a46e giữ 1,84 m (T160)',
    find: '      : node.axis !== axis && leaves(node).every((cell) => input.isCorridor(cell.id));',
    replace: '      : false;',
  },
  {
    id: 'M227',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Biến thể thu hẹp hành lang so điểm CÓ tính A1 — thu hẹp không bao giờ thắng, hành lang giữ bề rộng mô hình đoán (T160)',
    find: '  const withoutAreaFit = (e: HouseEvaluation) => e.ok?.score.percentWithoutAreaFit ?? percentOf(e);',
    replace: '  const withoutAreaFit = (e: HouseEvaluation) => percentOf(e);',
  },
  {
    id: 'M228',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/arrange/ensuite-closet.ts',
    bug: 'WC khép kín dài suốt bề ngang phòng ngủ không tách tủ đồ — WC 5,47 m của d084a46e giữ nguyên (T160)',
    find: '    if (length <= input.maxLength || length - wcLength < input.minCloset) return node;',
    replace: '    return node;',
  },
  {
    id: 'M229',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/stair-geometry.ts',
    bug: 'Phần ô thang dư dồn hết vào chiếu nghỉ — chiếu nghỉ 2,26 m thay vì 1,5 m (T160)',
    find: '  return Math.max(0, Math.floor(length - need));',
    replace: '  return 0;',
  },
  {
    id: 'M230',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Thước không thấy ô giao thông to như một phòng — sảnh 16,9 m² sau thang không bị trừ điểm (C14, T160)',
    find: '      if (Math.min(r.x1 - r.x0, r.y1 - r.y0) <= wide) continue;',
    replace: '      continue;',
  },
  {
    id: 'M231',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Ban công chính mặt tiền mở từ phòng riêng vẫn đạt (D6, T160)',
    find: "      if (!openers.some((type) => ctx.inGroup('shared_access', type))) refs.push(main.id);",
    replace: '      void openers;',
  },
  {
    id: 'M232',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-score.ts',
    bug: 'Ban công hông 12,7 m² lớn hơn ban công mặt tiền 5,3 m² vẫn đạt (D7, T160)',
    find: '      for (const balcony of side) if (balcony.areaM2 > main.areaM2 + 0.05) refs.push(balcony.id);',
    replace: '      void side;',
  },
  {
    id: 'M233',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-check.ts',
    bug: 'Gia chủ chọn ban công chính mở từ giao thông chung mà ban công riêng của phòng ngủ chính vẫn qua cổng (T161)',
    find: "      if (present && !openers.some((id) => from.has(graph.rooms.get(id)?.type ?? ''))) {",
    replace: '      if (present && openers.length < 0) {',
  },
  {
    id: 'M234',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/brief-demands.ts',
    bug: '«Chưa quyết» ban công chính mở từ đâu vẫn thành đòi hỏi — bịa lời gia chủ (T161)',
    find: "  const mainAccess = front && (access === 'chung' || access === 'phong_ngu_chinh') ? access : null;",
    replace:
      "  const mainAccess = front && access ? (access === 'phong_ngu_chinh' ? access : 'chung') : null;",
  },
  {
    id: 'M235',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan-check.ts',
    bug: 'Ban công chính nông hơn độ sâu gia chủ khai vẫn qua cổng (T161)',
    find: '      if (depthM + balcony.mainDepthToleranceM < balcony.mainDepthM - 1e-6) {',
    replace: '      if (depthM + balcony.mainDepthToleranceM < balcony.mainDepthM - 10) {',
  },
  {
    id: 'M236',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Thang thẳng báo mô hình chỉ một đầu ngắn cần lối đi — tầng trên bước ra ở đầu kia bị chắn (T161)',
    find: "  end: 'both_short_ends',",
    replace: "  end: 'one_short_end',",
  },
  {
    id: 'M237',
    axis: 'bản vẽ',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Tầng trên bị chắn đầu bước ra mà tầng 1 không thử vào thang từ cạnh kia — ý định gốc d084a46e bị bác (T161)',
    find: '  if (upperRun.failed && upper.length && groundUp && input.construction.stairs.shape) {',
    replace:
      '  if (upperRun.failed && upper.length && groundUp && !input.construction.stairs.shape) {',
  },

  // ── Luồng hồ sơ và giao diện (doc/MOC_CAI_TIEN_UX.md) ──────────────────────────────────
  {
    id: 'M238',
    axis: 'phân quyền',
    file: 'shared/src/flow.ts',
    bug: 'Dải tiến trình mời bỏ qua Khảo sát và Báo giá — sang thẳng Đàm phán, trong khi CSDL (0155) từ chối',
    find: "      next: ['khao_sat', 'bao_gia'],",
    replace: "      next: ['khao_sat', 'bao_gia', 'dam_phan'],",
  },
  {
    id: 'M239',
    axis: 'giao diện',
    file: 'web/src/pages/kho/inventory-list.tsx',
    bug: 'Lớp màu trỏ vào token không tồn tại — Tailwind bỏ qua im lặng, chữ phụ mang màu chữ chính',
    find: '<p className="mb-2 text-fg-subtle">',
    replace: '<p className="mb-2 text-fg-muted">',
  },
  {
    id: 'M240',
    axis: 'giao diện',
    file: 'web/src/components/ui/section-help.tsx',
    bug: 'Hộp hướng dẫn tự mở lại, che cột Trạng thái / Thời hạn của danh sách',
    find: '  const [open, setOpen] = useState(false);',
    replace: '  const [open, setOpen] = useState(Boolean(autoOpenKey));',
  },
  {
    id: 'M241',
    axis: 'giao diện',
    file: 'web/src/components/layout/top-bar.tsx',
    bug: 'Xanh dương logo dùng làm màu giao diện — đọc nhầm thành trạng thái «Đang xử lý»',
    find: "'bg-brand-forest text-xs font-semibold text-brand-mint'",
    replace: "'bg-brand-blue text-xs font-semibold text-brand-mint'",
  },
  {
    id: 'M242',
    axis: 'giao diện',
    file: 'web/src/index.css',
    bug: 'Nút hành động chính lấy cam logo — chữ trắng trên cam chỉ 2.36:1',
    find: '  --color-brand: #057b47;',
    replace: '  --color-brand: #f39122;',
  },
  {
    id: 'M243',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Cùng một lỗi chính lặp ba lượt mà vẫn gọi mô hình sửa tiếp (lượt thật 1dd74b99: lượt 5 ≈ 0,09 USD trả rỗng)',
    find: '  return tail[0] !== null && tail.every((key) => key === tail[0]);',
    replace: '  return false;',
  },
  {
    id: 'M244',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/ai/plan.ts',
    bug: 'Câu nhắc phòng hụt sàn bỏ mất đường lấy ô qua phòng kề (lượt 2 của 1dd74b99) — mô hình nộp lại cùng phòng',
    find: '        ? prompts.floorLevel.hints[`${issue.code}_chain`]',
    replace: '        ? undefined',
  },
  {
    id: 'M245',
    axis: 'tiền gọi mô hình',
    file: 'shared/src/design/call-cost.ts',
    bug: 'Trần từng lời gọi (T176) không hạ giới hạn token ra — lời gọi Opus 5.5 vẫn được tiêu 128.000 token (2,59 USD) dù mức 0,8',
    find: '  const capped = routeOutputTokens === null ? allowed : Math.min(routeOutputTokens, allowed);',
    replace: '  const capped = routeOutputTokens ?? allowed;',
  },
  {
    id: 'M246',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/llm/anthropic.ts',
    bug: 'Client Claude bỏ qua giới hạn của lời gọi (T176) — `max_tokens` vẫn là 128.000',
    find: '        options.outputCap,',
    replace: '        undefined,',
  },
  {
    id: 'M247',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/workflows/ai-design-steps.ts',
    bug: 'Lời gọi bị trần từng lời gọi chặn (T176) lại thành lỗi nhà cung cấp — ghi dòng nhật ký, lượt không dừng theo mức',
    find: '    if (error instanceof CallCostCapReached) return capStopOutcome(deps, error.stop);',
    replace:
      "    if (error instanceof CallCostCapReached && deps.provider === '') return capStopOutcome(deps, error.stop);",
  },
  {
    id: 'M248',
    axis: 'tiền gọi mô hình',
    file: 'workers/src/design/llm/provider-faults.ts',
    bug: '429 «free_tier, limit: 0» của Gemini lại bị đọc thành «hết tín dụng» (T176) — người dùng đi nạp tiền thay vì bật thanh toán',
    find: "  return lower.includes('free_tier') && /limit:\\s*0(?!\\d)/.test(lower);",
    replace: "  return false && lower.includes('free_tier');",
  },
];

/** Thư mục mã nguồn được băm trước và sau khi chạy. `db/` không đụng tới nên không băm. */
const SRC_DIRS = ['shared/src', 'workers/src', 'web/src'];
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const only = new Set(argv.filter((a) => /^M\d+$/.test(a)));

function hashTree(dirs: readonly string[]): string {
  const hash = createHash('sha256');
  const walk = (d: string) => {
    for (const entry of readdirSync(d).sort()) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(path).update(readFileSync(path));
    }
  };
  for (const dir of dirs) walk(dir);
  return hash.digest('hex');
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  ) {
    count += 1;
  }
  return count;
}

type Outcome = { mutation: Mutation; killed: boolean; caughtBy: string[]; ms: number };

type VitestJson = {
  testResults: { name: string; assertionResults: { status: string; fullName: string }[] }[];
};

/** Bộ kiểm nhanh: `shared/`, `workers/`, `web/` — KHÔNG có `db/` (xem đầu tệp). */
function runSuite(reportFile: string): { passed: boolean; failures: string[] } {
  const result = spawnSync(
    'node_modules/.bin/vitest',
    [
      'run',
      '--project',
      'logic',
      '--project',
      'web',
      'shared/',
      'workers/',
      'web/src',
      '--bail=1',
      '--reporter=json',
      `--outputFile=${reportFile}`,
      // Máy quá tải thì tiến trình con không kịp báo tiến độ («Timeout calling onTaskUpdate») — mọi phép thử xanh mà
      // vitest vẫn thoát mã 1, bộ đo coi là đỏ. Đặt `MUTATION_MAX_WORKERS` để bớt tiến trình (05/10/2026).
      ...(process.env.MUTATION_MAX_WORKERS
        ? [`--maxWorkers=${process.env.MUTATION_MAX_WORKERS}`]
        : []),
    ],
    { encoding: 'utf8' },
  );
  let failures: string[] = [];
  try {
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as VitestJson;
    failures = report.testResults.flatMap((file) =>
      file.assertionResults
        .filter((a) => a.status === 'failed')
        .map((a) => `${file.name.replace(`${process.cwd()}/`, '')} › ${a.fullName}`),
    );
    if (failures.length === 0 && result.status !== 0) {
      // Lỗi nạp module (cú pháp, kiểu) không có assertion nào — ghi tên tệp.
      failures = report.testResults
        .filter((file) => file.assertionResults.length === 0)
        .map((file) => `${file.name.replace(`${process.cwd()}/`, '')} (không nạp được)`);
    }
  } catch {
    failures = result.status === 0 ? [] : ['(không đọc được báo cáo vitest)'];
  }
  // Máy quá tải: báo cáo ghi đủ mọi phép thử xanh (`success`) mà vitest vẫn thoát mã 1 vì tiến trình con trễ báo tiến
  // độ — tin báo cáo (07/10/2026: 2.554/2.554 xanh, bộ đo vẫn dừng ở «bộ kiểm đang đỏ» rỗng).
  let reportGreen = false;
  try {
    const report = JSON.parse(readFileSync(reportFile, 'utf8')) as VitestJson & {
      success?: boolean;
      numTotalTests?: number;
      numFailedTestSuites?: number;
    };
    reportGreen =
      report.success === true &&
      (report.numTotalTests ?? 0) > 0 &&
      (report.numFailedTestSuites ?? 0) === 0;
  } catch {
    reportGreen = false;
  }
  return { passed: result.status === 0 || (reportGreen && failures.length === 0), failures };
}

// ── Kiểm trước: mọi đột biến phải áp được đúng một chỗ ──────────────────────────────────
const selected = MUTATIONS.filter((m) => only.size === 0 || only.has(m.id));
const invalid = selected.filter((m) => occurrences(readFileSync(m.file, 'utf8'), m.find) !== 1);
if (invalid.length) {
  for (const m of invalid) {
    const n = occurrences(readFileSync(m.file, 'utf8'), m.find);
    console.error(`✗ ${m.id} ${m.file}: đoạn cần sửa xuất hiện ${n} lần (phải đúng 1)`);
  }
  console.error('\nMã nguồn đã đổi so với danh sách đột biến — cập nhật `find` rồi chạy lại.');
  process.exit(2);
}
if (DRY) {
  console.log(`✓ ${selected.length} đột biến đều áp được đúng một chỗ.`);
  process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), 'nvg-mutation-'));
const reportFile = join(workDir, 'vitest.json');
const before = hashTree(SRC_DIRS);

// Mốc: bộ kiểm phải xanh trên mã chưa sửa, nếu không mọi «bắt được» đều vô nghĩa.
const baseline = runSuite(reportFile);
if (!baseline.passed) {
  console.error('Bộ kiểm đang đỏ trên mã chưa sửa — sửa trước rồi mới đo đột biến:');
  for (const f of baseline.failures) console.error(`  ${f}`);
  process.exit(2);
}

let pending: { file: string; original: string } | null = null;
const restore = () => {
  if (pending) {
    writeFileSync(pending.file, pending.original);
    pending = null;
  }
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    restore();
    process.exit(130);
  });
}
// Lưới cuối: mọi đường thoát khác (ném ngoài `try`, `process.exit` ở nhánh lỗi) vẫn trả tệp về.
process.on('exit', restore);

const outcomes: Outcome[] = [];
try {
  for (const mutation of selected) {
    const original = readFileSync(mutation.file, 'utf8');
    pending = { file: mutation.file, original };
    const started = Date.now();
    try {
      // Hàm thay thế, KHÔNG phải chuỗi: `$&`, `$1`, `` $` `` trong chuỗi thay thế bị
      // `String.replace` hiểu là mẫu thế, nên một đột biến có `$` sẽ ghi sai mà không ai biết.
      writeFileSync(
        mutation.file,
        original.replace(mutation.find, () => mutation.replace),
      );
      const { passed, failures } = runSuite(reportFile);
      const outcome = { mutation, killed: !passed, caughtBy: failures, ms: Date.now() - started };
      outcomes.push(outcome);
      const mark = outcome.killed ? 'BỊ BẮT ' : 'SỐNG SÓT';
      console.log(`${mark} ${mutation.id} [${mutation.axis}] ${mutation.bug}`);
      if (outcome.killed) console.log(`         ↳ ${failures[0] ?? '(bộ kiểm đỏ)'}`);
    } finally {
      restore();
    }
  }
} finally {
  restore();
  rmSync(workDir, { recursive: true, force: true });
}

const after = hashTree(SRC_DIRS);
if (after !== before) {
  console.error('\n!!! Mã nguồn sau khi chạy KHÁC trước khi chạy. Kiểm tra `git diff` ngay.');
  process.exit(3);
}

const killed = outcomes.filter((o) => o.killed);
const survived = outcomes.filter((o) => !o.killed);
const byAxis = (axis: Axis) => {
  const all = outcomes.filter((o) => o.mutation.axis === axis);
  return `${all.filter((o) => o.killed).length}/${all.length}`;
};

console.log(
  `\nKết quả: ${killed.length}/${outcomes.length} đột biến bị bộ kiểm bắt ` +
    `(phân quyền ${byAxis('phân quyền')} · riêng tư ${byAxis('riêng tư')} · ` +
    `tiền ${byAxis('tiền')} · bản vẽ ${byAxis('bản vẽ')} · phát hành ${byAxis('phát hành')}).`,
);
console.log('Mã nguồn đã được khôi phục nguyên vẹn (băm mã nguồn trước = sau).');
if (survived.length) {
  console.log('\nĐột biến sống sót — bộ kiểm chưa canh được những lỗi này:');
  for (const o of survived) console.log(`  ${o.mutation.id} ${o.mutation.file}: ${o.mutation.bug}`);
  process.exit(1);
}
