/**
 * Chạy Lớp 2 một lượt: gom ba nguồn tri thức rồi gọi engine.
 *
 * Tách khỏi cả `workflows/design-pipeline.ts` lẫn `index.ts` vì CẢ HAI đều cần đúng chuỗi
 * việc này. Chép sang hai chỗ thì có ngày chương trình không gian sinh từ nút bấm khác với
 * chương trình sinh từ đường ống — cùng đầu bài, hai kết quả, và không ai biết bản nào đúng.
 *
 * Bản thân engine (`engine.ts`) vẫn là hàm thuần. Tệp này là phần KHÔNG thuần: đọc cấu hình
 * đã nhúng, hỏi CSDL, gọi mô hình ngôn ngữ. Ranh giới đó giữ cho engine kiểm thử được mà
 * không cần dựng CSDL hay mạng.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { siteGeometry, type DesignBrief, type SpaceProgram } from '@nvg/shared/design';
import type { DesignEnv } from '../env';
import { roomVocabulary } from '../kb/vocabulary-data';
import { geminiClient } from '../llm/factory';
import { buildSpaceProgram } from './engine';
import { plausibilityRules } from './plausibility-data';
import { resolveProgramIntent } from './intent';
import { resolveNeeds } from './needs';
import { spaceNorms } from './norms-data';
import { readRoomAreaPriors } from './priors';
import { rulePackFor } from '../rules/rule-pack-data';

export interface Layer2Run {
  payload: SpaceProgram;
  /** Điều engine phải nói ra nhưng không đủ để dừng lại. */
  warnings: string[];
  /** Đoạn chữ trong đầu bài chưa quy được về không gian nào. */
  unresolved: string[];
  /**
   * Đề xuất của AI ở Lớp 2a, viết ra để người đọc kiểm lại được.
   *
   * `null` khi mô hình không tham gia (chưa có khoá, hết hạn mức, trả sai cấu trúc). Đây là
   * thứ duy nhất nói cho kiến trúc sư biết vì sao bếp được ưu ái hơn kho — thiếu nó thì AI
   * tham gia mà không ai kiểm được, và "con người quyết định cuối cùng" (PRD 2.3) chỉ còn là
   * một câu trong tài liệu.
   */
  aiSuggestion: { rationale: string; generous: string[]; modest: string[] } | null;
  /**
   * Cấu hình đã dùng — băm thành `params_hash` của cạnh lineage.
   *
   * Phải chứa ĐỦ thứ quyết định đầu ra, nếu không "đã tính rồi thì không tính lại" sẽ trả về
   * kết quả cũ sau khi ai đó sửa chuẩn diện tích.
   */
  params: Record<string, unknown>;
}

export async function runLayer2(
  env: DesignEnv,
  db: SupabaseClient,
  brief: DesignBrief,
  briefRef: string,
  tenantId: string,
): Promise<Layer2Run> {
  const norms = spaceNorms();
  const rules = rulePackFor(brief.locality);

  // Nhu cầu riêng của từng nhóm thành viên tách làm hai đường, và ranh giới ở đây quan trọng:
  //
  //  · Biểu mẫu hiện hành cho chọn từ danh sách, nên phần lớn giá trị ĐÃ LÀ mã không gian
  //    chuẩn. Chúng đi thẳng vào engine. Cho chúng chạy qua bước quy đổi là nhờ bảng bí danh
  //    dịch một mã về chính nó — đúng cho tới ngày có mã phòng mà tên tiếng Anh không nằm
  //    trong bí danh của chính nó, rồi im lặng biến mất.
  //  · Phần còn lại là chữ tự do (hợp đồng cho phép, và bước dán đầu bài từ tin nhắn sẽ sinh
  //    ra nhiều), mới cần quy đổi.
  //
  // `priorities` KHÔNG đi vào đây. Đó là thứ tự ưu tiên thiết kế ("lấy sáng tự nhiên"), không
  // phải một không gian — đưa vào thì lần chạy nào cũng đọng lại một danh sách "chưa quy được"
  // không bao giờ vơi, và một cảnh báo luôn nổ là một cảnh báo bị bỏ qua.
  const vocabulary = roomVocabulary();
  const known = new Set(vocabulary.codes);
  const declared: string[] = [];
  const freeText: string[] = [];
  for (const phrase of (brief.family ?? []).flatMap((m) => m.needs ?? [])) {
    const text = phrase?.trim();
    if (!text) continue;
    (known.has(text) ? declared : freeText).push(text);
  }

  const needs = await resolveNeeds(freeText, vocabulary, geminiClient(env));

  // Thống kê thực nghiệm: rỗng ở quy mô kho hiện tại, và đó là hành vi đúng
  // (06-knowledge-base 6.0b). Hỏng khi đọc thì KHÔNG chặn — Lớp 2 vẫn chạy bằng chuẩn nghề
  // nghiệp, chỉ là chất lượng thấp hơn, đúng điều kiện vào của Mốc 4.
  let priors = null;
  try {
    priors = await readRoomAreaPriors(db, norms, {
      tenantId,
      buildingType: brief.building_type,
      siteWidthM: brief.site.width_m,
      floors: brief.floors,
    });
  } catch (error) {
    needs.notes.push(
      `Chưa đọc được thống kê thực nghiệm nên đang dùng chuẩn nghề nghiệp: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // ── Lớp 2a: hỏi mô hình ngôn ngữ phòng nào nên rộng rãi ────────────────────────────
  //
  // Gửi đi là BẢN TÓM TẮT ĐÃ ẨN DANH, không phải đầu bài — xem `intent.ts`. Diện tích sàn
  // trong bản tóm tắt lấy từ hình học thửa, làm tròn tới 10 m²; nó chỉ để mô hình biết "cỡ
  // nào", vì một cái bếp trong căn 90 m²/tầng và trong căn 180 m²/tầng không cùng mức ưu ái.
  //
  // Không chặn luồng: hết hạn mức hay trả sai cấu trúc thì `intent` là `null` và chương trình
  // vẫn soạn xong bằng chuẩn nghề (PRD 5.1).
  const geometry = siteGeometry(brief.site);
  const { intent, notes: intentNotes } = await resolveProgramIntent(
    brief,
    geometry.buildable.widthM * geometry.buildable.depthM,
    vocabulary,
    geminiClient(env),
  );

  const result = buildSpaceProgram({
    brief,
    briefRef,
    rules,
    norms,
    priors,
    // Không gian AI đề xuất thêm đi CHUNG đường với mã khai tường minh: engine vẫn kiểm mã có
    // trong từ vựng và có chuẩn diện tích, nên một đề xuất lạ bị nói ra chứ không lọt vào.
    extraSpaces: [...declared, ...needs.spaces, ...(intent?.add_spaces ?? [])],
    plausibility: plausibilityRules(),
    intent,
  });

  return {
    payload: result.payload,
    warnings: [...result.warnings, ...needs.notes, ...intentNotes],
    unresolved: needs.unresolved,
    aiSuggestion: intent
      ? {
          rationale: intent.rationale ?? '',
          generous: intent.emphasis.filter((e) => e.level === 'generous').map((e) => e.space_type),
          modest: intent.emphasis.filter((e) => e.level === 'modest').map((e) => e.space_type),
        }
      : null,
    params: {
      norms_version: norms.version,
      locality: brief.locality,
      // Chế độ quy tắc đã chạy, KHÔNG phải địa phương đã chọn: hai thứ này khác nhau chừng
      // nào còn tỉnh chưa có gói riêng, và bản kết quả phải nói được mình dựa trên bộ số nào.
      rule_pack_locality: rules.localityMissing ? null : brief.locality,
      priors_band: priors?.bandId ?? null,
      // Đưa ĐÚNG thứ AI đã đề xuất vào tham số, không chỉ cờ "có dùng AI hay không".
      //
      // ⚠️ Cạnh lineage chỉ lưu `params_hash`, không lưu nguyên văn tham số — nên mục này
      // KHÔNG làm đề xuất đọc lại được từ CSDL; nó chỉ bảo đảm một đề xuất khác cho ra một
      // artifact khác, thay vì im lặng trả về bản đã tính với mức nhấn mạnh cũ. Phần đọc lại
      // được cho người là `aiSuggestion` ở trên, hiện thẳng trên màn hình.
      program_intent: intent
        ? { emphasis: intent.emphasis, add_spaces: intent.add_spaces ?? [] }
        : null,
      plausibility_version: plausibilityRules().version,
    },
  };
}
