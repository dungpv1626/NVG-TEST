/**
 * Tab «Yêu cầu làm rõ» của công trình (TC-15, TK-08): gửi câu hỏi bản vẽ / kỹ thuật tới đúng bên trả
 * lời, có hạn; xem câu trả lời. Việc theo dõi «ai đang giữ, chờ bao lâu, thúc» nằm ở Theo dõi đề
 * nghị (TC-10) — cùng một nguồn dữ liệu.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RfiCreateForm, RfiList } from '@/components/rfi/rfi-ui';
import { useRfis } from '@/hooks/use-rfis';

export function SiteRfiPanel({
  siteId,
  hasDesignProject,
  readOnly,
}: {
  siteId: string;
  hasDesignProject: boolean;
  readOnly: boolean;
}) {
  const rfis = useRfis({ siteId });
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className="rounded-sm bg-status-completed-bg px-3 py-2 text-status-completed"
        >
          {notice}
        </p>
      )}
      {!readOnly &&
        (adding ? (
          <>
            <RfiCreateForm
              siteId={siteId}
              hasDesignProject={hasDesignProject}
              onDone={(code) => {
                setAdding(false);
                setNotice(
                  `Đã gửi ${code}. Bên được hỏi đã nhận thông báo; theo dõi và thúc ở mục Đề nghị.`,
                );
              }}
            />
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Đóng biểu mẫu
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              setNotice(null);
              setAdding(true);
            }}
          >
            Gửi yêu cầu làm rõ
          </Button>
        ))}
      <RfiList
        rfis={rfis.data}
        isLoading={rfis.isLoading}
        error={rfis.error}
        emptyMessage="Chưa có yêu cầu làm rõ nào. Gặp chỗ bản vẽ khác thực tế hoặc chưa rõ, gửi ở đây thay vì nhắn Zalo — có người nhận và hạn trả lời."
      />
    </div>
  );
}
