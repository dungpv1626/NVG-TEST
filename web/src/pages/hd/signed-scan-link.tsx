/** Mở bản hợp đồng đã ký (ảnh / PDF, 0187) bằng đường dẫn có hạn — kho riêng tư theo quyền hợp đồng. */

import { useState } from 'react';
import { DOCUMENT_BUCKET } from '@/hooks/use-contract-templates';
import { supabase } from '@/lib/supabase';

export function SignedScanLink({
  path,
  label = 'Xem bản đã ký',
}: {
  path: string;
  label?: string;
}) {
  const [error, setError] = useState(false);
  async function open() {
    setError(false);
    const { data, error: e } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(path, 300);
    if (e || !data) return setError(true);
    window.open(data.signedUrl, '_blank', 'noopener');
  }
  return (
    <span>
      <button
        type="button"
        className="font-medium text-brand underline-offset-2 hover:underline"
        onClick={() => void open()}
      >
        {label}
      </button>
      {error && <span className="ml-2 text-status-overdue">Chưa mở được tệp — thử lại.</span>}
    </span>
  );
}
