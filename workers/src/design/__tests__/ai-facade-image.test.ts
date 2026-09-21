/**
 * Ảnh mặt đứng có vật liệu (T59 Đợt E) — phần thuần, KHÔNG chạm mạng.
 *
 * Canh ba điều mà một lỗi sẽ không trông giống lỗi:
 *  · lời gọi mang ĐÚNG MỘT ảnh neo — mảng rỗng vẫn ra ảnh, vẫn tính tiền, và vẽ một ngôi nhà khác (T21);
 *  · lời dẫn nói đúng vật liệu, màu, mái, cổng của ý tưởng ĐÃ LƯU — mô hình ảnh chỉ tô, không chọn;
 *  · lời dẫn không mang dấu vết nào của hồ sơ (T12) — hàm không nhận mã hồ sơ.
 */

import { aiFacadeImageSchema } from '@nvg/shared/design';
import { describe, expect, it } from 'vitest';
import { assembleFacadeImage, facadeImageCallOptions, facadeImagePrompt } from '../ai/facade/image';
import { facadeVocab, TOWNHOUSE_FACADE, VILLA_FACADE } from './ai-facade-fixtures';
import { prompts } from './ai-real-context';

describe('Lời dẫn ảnh mặt đứng', () => {
  it('ghép từ ý tưởng đã lưu: vật liệu theo cụm tiếng Anh của danh mục, mã màu hex, mái, lan can', () => {
    const { prompt, system } = facadeImagePrompt(TOWNHOUSE_FACADE, facadeVocab, prompts);
    expect(system).toMatch(/ATTACHED DRAWING IS THE\s+AUTHORITY/);
    expect(prompt).toContain('- body: smooth exterior paint on render, cream white');
    expect(prompt).toContain('- base: granite stone cladding, charcoal grey');
    expect(prompt).toContain('primary #F1EAD8');
    expect(prompt).toContain(prompts.facadeImage.roofs.flat!);
    expect(prompt).toContain('Balcony railing: frameless glass balustrade');
    expect(prompt).toContain('none — the house stands on the street line');
    expect(prompt).toContain('1 canopy, 1 cladding, 1 louvre');
    expect(prompt).toContain(prompts.facadeImage.styles.hien_dai!);
  });

  it('nhà có sân trước: cổng và rào đi vào lời dẫn kèm kích thước và vật liệu', () => {
    const { prompt } = facadeImagePrompt(VILLA_FACADE, facadeVocab, prompts);
    // MÉT, không phải cm (T68): cùng một lời dẫn mà chỗ nói cm chỗ nói m là mời mô hình đọc
    // nhầm một bậc mười — khối nhà đã nói bằng mét từ đầu.
    expect(prompt).toMatch(/sliding gate 3.6 m wide, 1.8 m high in ornamental wrought iron, black/);
    expect(prompt).toMatch(/1.6 m high fence/);
    expect(prompt).not.toMatch(/\d+ cm/);
    expect(prompt).toContain(prompts.facadeImage.roofs.thai!);
  });

  it('thiếu MỘT trong hai số đo cổng thì vẫn nói số còn lại, không mất cả hai', () => {
    // Hợp đồng chỉ bắt buộc `gate.type`. Điều kiện cũ là `gate.w && gate.h`, nên khai thiếu chiều
    // cao là mất luôn bề rộng — và một cái cổng không có số đo nào thì mô hình vẽ nó to bằng cả
    // mặt tiền.
    const noHeight = {
      ...VILLA_FACADE,
      gate: { ...VILLA_FACADE.gate!, h: undefined },
    } as typeof VILLA_FACADE;
    const { prompt } = facadeImagePrompt(noHeight, facadeVocab, prompts);
    expect(prompt).toMatch(/gate 3.6 m wide/);
  });

  it('không còn chỗ điền nào sót lại, và không viết chữ lên ảnh', () => {
    const { prompt, system } = facadeImagePrompt(VILLA_FACADE, facadeVocab, prompts);
    expect(prompt).not.toMatch(/\{[a-z_]+\}/);
    expect(system).toMatch(/Write NO text/);
  });
});

describe('Lời gọi mô hình ảnh', () => {
  it('mang ĐÚNG MỘT ảnh neo', () => {
    const options = facadeImageCallOptions(
      facadeImagePrompt(TOWNHOUSE_FACADE, facadeVocab, prompts),
      { mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' },
    );
    expect(options.images).toHaveLength(1);
    expect(options.images?.[0]?.mimeType).toBe('image/png');
  });
});

describe('Artifact ảnh mặt đứng', () => {
  it('đúng hợp đồng, trỏ ý tưởng mặt đứng, chưa đóng dấu', () => {
    const payload = assembleFacadeImage({
      facadeRef: `sha256:${'f'.repeat(64)}`,
      uri: 'supabase://design-renders/p/facade-image/x.png',
      mime: 'image/png',
      widthPx: 1536,
      heightPx: 1024,
      prompt: 'x'.repeat(2000),
      anchor: { sha256: 'a'.repeat(64), bytes: 1234, mime: 'image/png' },
      route: 'ai_image_gemini',
      provider: 'gemini_paid',
      model: 'gemini-3.1-flash-image',
      promptVersion: prompts.version,
      latencyMs: 20000,
    });
    expect(aiFacadeImageSchema.safeParse(payload).success).toBe(true);
    expect(payload.watermark_applied).toBe(false);
    expect(payload.prompt_excerpt).toHaveLength(1200);
  });
});
