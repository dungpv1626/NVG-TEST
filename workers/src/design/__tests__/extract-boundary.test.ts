/**
 * `extractSiteBoundary` — Gemini đọc ảnh trích lục ra danh sách cạnh, rồi dựng ranh giới bằng
 * `polygonFromEdges`.
 *
 * Không gọi mạng thật: `GeminiClient` giả trả về đúng hình dạng đã hứa với schema gửi đi, để
 * test canh được đúng lớp nghiệp vụ của tệp này — chuyển cạnh thành `boundary_m`, gộp cảnh
 * báo — chứ không canh chất lượng mô hình.
 */

import { describe, expect, it, vi } from 'vitest';
import { extractSiteBoundary } from '../site/extract-boundary';
import { ContractError } from '../contracts';
import type { GeminiClient } from '../llm/gemini';
import { LlmCallFailed } from '../llm/gemini';

function fakeLlm(response: Record<string, unknown> | Error) {
  const generateJson = vi.fn(async (_route: string, _dataClass: number, _options: unknown) => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { client: { generateJson } as unknown as GeminiClient, generateJson };
}

function edge(over: Partial<Record<string, unknown>> = {}) {
  return {
    index: 0,
    label_raw: '8',
    length_m: 8,
    length_source: 'labeled',
    turn_deg: 90,
    turn_source: 'labeled',
    boundary_label: null,
    confidence: 'high',
    ...over,
  };
}

const RECTANGLE_RESPONSE = {
  frontage_edge_index: 0,
  edges: [
    edge({ index: 0, length_m: 8 }),
    edge({ index: 1, length_m: 12 }),
    edge({ index: 2, length_m: 8 }),
    edge({ index: 3, length_m: 12 }),
  ],
  closed_shape_confidence: 'high',
  warnings: [],
  notes: null,
};

describe('extractSiteBoundary', () => {
  it('dựng đúng ranh giới từ cạnh Gemini đọc được, gọi đúng route và dataClass = 2', async () => {
    const { client, generateJson } = fakeLlm(RECTANGLE_RESPONSE);
    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(generateJson).toHaveBeenCalledWith(
      'site_boundary_extract',
      2,
      expect.objectContaining({
        images: [{ mimeType: 'image/jpeg', dataBase64: expect.any(String) }],
      }),
    );
    expect(result.boundaryM).toHaveLength(4);
    expect(result.boundaryM[0]).toEqual([0, 0]);
    expect(result.closureErrorM).toBeCloseTo(0, 6);
    expect(result.warnings).toEqual([]);
  });

  it('đầu ra sai hợp đồng (thiếu trường bắt buộc) thì ném ContractError', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: 0,
      edges: [edge(), edge({ index: 1 }), edge({ index: 2 })],
      // thiếu closed_shape_confidence
      warnings: [],
      notes: null,
    });

    await expect(
      extractSiteBoundary(client, { mimeType: 'image/jpeg', bytes: new Uint8Array([1]) }),
    ).rejects.toThrow(ContractError);
  });

  it('cạnh không khép kín thì thêm cảnh báo boundary_not_closed, không ném lỗi', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: 0,
      edges: [
        edge({ index: 0, length_m: 8, turn_deg: 85 }),
        edge({ index: 1, length_m: 8, turn_deg: 85 }),
        edge({ index: 2, length_m: 8, turn_deg: 85 }),
        edge({ index: 3, length_m: 8, turn_deg: 85 }),
      ],
      closed_shape_confidence: 'medium',
      warnings: [],
      notes: null,
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.warnings.some((w) => w.code === 'boundary_not_closed')).toBe(true);
  });

  it('góc thiếu thì thêm cảnh báo angles_assumed', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: 0,
      edges: [
        edge({ index: 0, length_m: 8, turn_deg: 90 }),
        edge({ index: 1, length_m: 12, turn_deg: 90 }),
        edge({ index: 2, length_m: 8, turn_deg: 90 }),
        edge({ index: 3, length_m: 12, turn_deg: null, turn_source: 'unknown' }),
      ],
      closed_shape_confidence: 'medium',
      warnings: [],
      notes: null,
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.assumedAngleIndices).toEqual([3]);
    expect(result.warnings.some((w) => w.code === 'angles_assumed')).toBe(true);
  });

  it('dưới ba cạnh trong đầu ra thì hợp đồng đã chặn trước khi tới polygonFromEdges', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: 0,
      edges: [edge(), edge({ index: 1 })],
      closed_shape_confidence: 'high',
      warnings: [],
      notes: null,
    });

    await expect(
      extractSiteBoundary(client, { mimeType: 'image/jpeg', bytes: new Uint8Array([1]) }),
    ).rejects.toThrow(ContractError);
  });

  it('Gemini lỗi mạng thì lỗi đó truyền nguyên lên, KHÔNG bị nuốt', async () => {
    const failure = new LlmCallFailed('mạng lỗi', true);
    const { client } = fakeLlm(failure);

    await expect(
      extractSiteBoundary(client, { mimeType: 'image/jpeg', bytes: new Uint8Array([1]) }),
    ).rejects.toThrow(LlmCallFailed);
  });

  it('có bảng toạ độ (≥3 điểm) thì ưu tiên dựng từ toạ độ, bỏ qua edges', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: 0,
      // Cố ý sai lệch hoàn toàn so với toạ độ thật (mô phỏng đúng lỗi quan sát được: đọc hình
      // vẽ sơ đồ bằng mắt cho diện tích sai) — phải KHÔNG được dùng.
      edges: [
        edge({ index: 0, length_m: 50 }),
        edge({ index: 1, length_m: 50 }),
        edge({ index: 2, length_m: 50 }),
        edge({ index: 3, length_m: 50 }),
      ],
      vertex_coordinates: [
        { index: 1, label_raw: '1', x: 0, y: 0 },
        { index: 2, label_raw: '2', x: 10, y: 0 },
        { index: 3, label_raw: '3', x: 10, y: 8 },
        { index: 4, label_raw: '4', x: 0, y: 8 },
      ],
      closed_shape_confidence: 'high',
      warnings: [],
      notes: null,
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.boundaryM).toHaveLength(4);
    expect(result.closureErrorM).toBe(0);
    expect(result.assumedAngleIndices).toEqual([]);
  });

  it('có bảng toạ độ hợp lệ nhưng edges sai hợp đồng (length_m=0, giữ chỗ) — vẫn ra kết quả, không ném ContractError', async () => {
    const { client } = fakeLlm({
      frontage_edge_index: null,
      // Đúng lỗi quan sát được thật: Gemini coi edges là phụ khi đã có vertex_coordinates, điền
      // giữ chỗ length_m=0 — vi phạm "exclusiveMinimum: 0" của hợp đồng nếu kiểm CHẶT như cũ.
      edges: [
        edge({ index: 0, length_m: 0 }),
        edge({ index: 1, length_m: 0 }),
        edge({ index: 2, length_m: 0 }),
      ],
      vertex_coordinates: [
        { index: 1, label_raw: '1', x: 1191661.37, y: 601544.78 },
        { index: 2, label_raw: '2', x: 1191660.96, y: 601545.06 },
        { index: 3, label_raw: '3', x: 1191653.03, y: 601550.79 },
        { index: 4, label_raw: '4', x: 1191657.77, y: 601556.63 },
      ],
      closed_shape_confidence: 'high',
      warnings: [],
      notes: null,
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.boundaryM).toHaveLength(4);
    // edges lỗi bị lọc bỏ hết (khoan dung từng phần tử) — mảng trả về rỗng, không phải mảng sai.
    expect(result.edges).toEqual([]);
  });

  it('bảng toạ độ dưới 3 điểm thì rơi về đường edges như bình thường', async () => {
    const { client } = fakeLlm({
      ...RECTANGLE_RESPONSE,
      vertex_coordinates: [{ index: 1, label_raw: '1', x: 0, y: 0 }],
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.boundaryM).toHaveLength(4);
    expect(result.boundaryM[0]).toEqual([0, 0]);
  });

  it('cảnh báo do chính Gemini trả về vẫn được giữ nguyên trong kết quả', async () => {
    const { client } = fakeLlm({
      ...RECTANGLE_RESPONSE,
      warnings: [{ code: 'anh_mo', detail: 'Góc dưới bên phải ảnh bị mờ, khó đọc số đo.' }],
    });

    const result = await extractSiteBoundary(client, {
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });
    expect(result.warnings).toContainEqual({
      code: 'anh_mo',
      detail: 'Góc dưới bên phải ảnh bị mờ, khó đọc số đo.',
    });
  });
});
