/**
 * Đọc ảnh trích lục/sổ đỏ ra ranh giới thửa đất — đi qua Worker vì bước này gọi Gemini
 * (điều kiện (a) của CLAUDE.md 3.1). Kết quả chỉ là dữ liệu NHÁP: người gọi tự điền vào bảng
 * đỉnh của biểu mẫu Đầu bài, người dùng vẫn xem/sửa/lưu như mọi trường khác.
 */

import { useMutation } from '@tanstack/react-query';
import type { Point, SiteBoundaryExtractionEdge } from '@nvg/shared/design';
import { designApiUpload } from '@/lib/design-api';
import type { AiCallUsage } from './use-ai-design';

export interface SiteBoundaryExtractionResult {
  boundaryM: Point[];
  edges: SiteBoundaryExtractionEdge[];
  /** Chỉ số các cạnh dùng góc SUY RA (ảnh không ghi rõ), không phải góc đọc được. */
  assumedAngleIndices: number[];
  closureErrorM: number;
  closureErrorDeg: number;
  closedShapeConfidence: 'high' | 'medium' | 'low';
  warnings: { code: string; detail: string }[];
  sourceUri: string;
  /** Số token và chi phí của lượt đọc ảnh. Vắng ở máy chủ cũ. */
  usage?: AiCallUsage | null;
}

export function useExtractSiteBoundary() {
  return useMutation<SiteBoundaryExtractionResult, Error, { projectId: string; file: File }>({
    mutationFn: ({ projectId, file }) => {
      const form = new FormData();
      form.append('projectId', projectId);
      form.append('file', file);
      return designApiUpload<SiteBoundaryExtractionResult>('/design/site/extract-boundary', form);
    },
  });
}
