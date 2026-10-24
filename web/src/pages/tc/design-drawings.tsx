/**
 * Bản vẽ thiết kế đã phát hành, nhìn từ công trường (TK-05 ↔ TC-03, migration 0154).
 *
 * Trước đó tab «Hồ sơ – Bản vẽ» chỉ có tài liệu công trường tự tải lên; Thiết kế phát hành bản mới
 * thì công trường không thấy. Nay đọc thẳng phiên bản của hồ sơ thiết kế gắn công trình qua
 * `site_design_drawings` (Mẫu E) — chỉ huy trưởng xem được dù không có quyền Module TK.
 *
 * Bản ĐANG HIỆU LỰC đứng trên, có nhãn; bản cũ xám, ghi «Hết hiệu lực — không dùng để thi công».
 */

import { formatDateTime } from '@nvg/shared';
import { Skeleton } from '@/components/ui/states';
import { useSiteDesignDrawings } from '@/hooks/use-rfis';

export function SiteDesignDrawings({ siteId }: { siteId: string }) {
  const { data, isLoading } = useSiteDesignDrawings(siteId);
  if (isLoading) return <Skeleton className="mb-4 h-24 w-full" />;
  const rows = data ?? [];
  const disciplines = [...new Set(rows.map((r) => r.discipline))];

  return (
    <section
      aria-labelledby="ban-ve-thiet-ke"
      className="mb-6 rounded-card bg-surface p-4"
    >
      <h3 id="ban-ve-thiet-ke" className="font-medium">
        Bản vẽ thiết kế {rows[0] ? `— hồ sơ ${rows[0].design_code}` : ''}
      </h3>
      <p className="mt-0.5 text-sm text-fg-subtle">
        Do Phòng Thiết kế phát hành. Chỉ thi công theo bản đang hiệu lực; có chỗ chưa rõ thì gửi yêu
        cầu làm rõ.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-fg-subtle">Hồ sơ thiết kế chưa phát hành bản vẽ thi công nào.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {disciplines.map((discipline) => {
            const list = rows.filter((r) => r.discipline === discipline);
            return (
              <div key={discipline}>
                <p className="text-sm font-medium text-fg-subtle">{list[0]!.discipline_label}</p>
                <ul className="mt-1 space-y-1">
                  {list.map((r) => (
                    <li key={r.version_id} className={r.is_current ? 'text-fg' : 'text-fg-subtle'}>
                      {r.is_current ? (
                        <strong>Đang hiệu lực — bản {r.version}</strong>
                      ) : (
                        <span>Hết hiệu lực — bản {r.version}, không dùng để thi công</span>
                      )}{' '}
                      · {r.title}
                      {r.file_name ? ` · ${r.file_name}` : ''} · {formatDateTime(r.published_at)}
                      {r.is_current && r.change_reason && (
                        <span className="block text-sm text-fg-subtle">
                          Điều chỉnh: {r.change_reason}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
