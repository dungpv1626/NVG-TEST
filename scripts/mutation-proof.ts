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
  'phân quyền' | 'riêng tư' | 'tiền' | 'tiền gọi mô hình' | 'bản vẽ' | 'số đo' | 'phát hành';

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
    find: '    const bad = found.find((entry) => touchesSide(entry.level, entry.rect, side));',
    replace: '    const bad = found.find(() => false);',
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
    find: '  if (!kept.length) return answer;',
    replace: '  if (kept.length >= 0) return answer;',
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
    find: '  const locked = new Set(keep);',
    replace: '  const locked = new Set<number>();',
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
    bug: 'Ban công gần vuông không quay ra mặt thoáng bị CHẶN — Haan chỉ cho cảnh báo và trừ điểm (T91)',
    find: '        long && rule.blocking,',
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
  return { passed: result.status === 0, failures };
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
