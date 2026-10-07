/**
 * Tab «Yêu cầu làm rõ» của hồ sơ thiết kế (TK-08): câu hỏi từ các công trình thi công theo hồ sơ
 * này. Phòng Thiết kế trả lời ngay tại đây; công trường nhận thông báo. Câu trả lời cần đổi bản vẽ
 * thì lập yêu cầu thay đổi, rồi phát hành bản điều chỉnh gắn với nó (được cả sau bàn giao).
 */

import { RfiList } from '@/components/rfi/rfi-ui';
import { useRfis } from '@/hooks/use-rfis';

export function DesignRfiPanel({ projectId }: { projectId: string }) {
  const rfis = useRfis({ designProjectId: projectId });
  return (
    <div className="space-y-3">
      <p className="text-fg-subtle">
        Câu hỏi về bản vẽ do công trường gửi, kèm ảnh và kích thước đo. Trả lời trước hạn; quá hạn
        thì công trường thấy và thúc được.
      </p>
      <RfiList
        rfis={rfis.data}
        isLoading={rfis.isLoading}
        error={rfis.error}
        showSite
        emptyMessage="Chưa có yêu cầu làm rõ nào từ công trường."
      />
    </div>
  );
}
