/**
 * Khối «Chuẩn bị khởi công» — việc của bước Chuẩn bị (TC-01).
 *
 * Trước 0164 công trình mở từ hợp đồng không có chỗ chọn chỉ huy trưởng hay ghi ngày khởi công,
 * trong khi dải tiến trình bảo «Trưởng phòng Thi công phân công và khởi công» — cùng loại lỗi
 * với ô Phân loại của cơ hội. Khởi công cần đủ ba ô này; CSDL kiểm (`stage_readiness`, trigger
 * `construction_sites_ready_to_start`). Chỉ huy trưởng được báo ngay khi được phân công.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { useUpdateConstructionSite } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** Người làm thi công của pháp nhân — cùng điều kiện «Đã phân công chỉ huy trưởng» (0164). */
function useCommanderCandidates(companyId: string) {
  return useQuery<{ id: string; full_name: string }[], Error>({
    queryKey: ['users', 'site-commanders', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_commander_candidates', {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });
}

export const SITE_PREP_ANCHOR = 'chuan-bi-khoi-cong';

export function SitePrepCard({
  site,
  canEdit,
  highlight,
}: {
  site: {
    id: string;
    company_id: string;
    responsible_user_id: string | null;
    planned_start_date: string | null;
    planned_end_date: string | null;
  };
  canEdit: boolean;
  highlight: boolean;
}) {
  const { data: users = [] } = useCommanderCandidates(site.company_id);
  const update = useUpdateConstructionSite();
  const [commander, setCommander] = useState(site.responsible_user_id ?? '');
  const [start, setStart] = useState(site.planned_start_date ?? '');
  const [end, setEnd] = useState(site.planned_end_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => setCommander(site.responsible_user_id ?? ''), [site.responsible_user_id]);
  useEffect(() => setStart(site.planned_start_date ?? ''), [site.planned_start_date]);
  useEffect(() => setEnd(site.planned_end_date ?? ''), [site.planned_end_date]);

  const dirty =
    commander !== (site.responsible_user_id ?? '') ||
    start !== (site.planned_start_date ?? '') ||
    end !== (site.planned_end_date ?? '');

  async function save() {
    setError(null);
    setSaved(false);
    if (start && end && end < start) {
      setError('Ngày hoàn thành dự kiến phải sau ngày khởi công.');
      return;
    }
    try {
      await update.mutateAsync({
        id: site.id,
        changes: {
          responsible_user_id: commander || null,
          planned_start_date: start || null,
          planned_end_date: end || null,
        },
      });
      setSaved(true);
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <section
      id={SITE_PREP_ANCHOR}
      aria-label="Chuẩn bị khởi công"
      className={cn(
        'mb-4 scroll-mt-40 rounded-md border p-4',
        highlight ? 'border-brand bg-brand-subtle' : 'border-border bg-surface',
      )}
    >
      <h2 className="font-semibold">Chuẩn bị khởi công</h2>
      {highlight && (
        <p className="mt-0.5 text-sm">
          Việc của bước này: phân công chỉ huy trưởng và ghi ngày khởi công, ngày hoàn thành dự
          kiến. Đủ ba ô thì bấm «Bắt đầu thi công».
        </p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Chỉ huy trưởng">
          <select
            value={commander}
            disabled={!canEdit}
            onChange={(e) => setCommander(e.target.value)}
            className="h-9 w-full rounded-sm border border-border bg-surface px-3 disabled:bg-surface-sunken"
          >
            <option value="">Chưa phân công</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày khởi công dự kiến">
          <DateInput value={start} disabled={!canEdit} onChange={setStart} />
        </Field>
        <Field label="Ngày hoàn thành dự kiến">
          <DateInput value={end} disabled={!canEdit} onChange={setEnd} />
        </Field>
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant={highlight ? 'primary' : 'secondary'}
            disabled={!dirty || update.isPending}
            onClick={() => void save()}
          >
            Lưu phân công
          </Button>
          {saved && !dirty && (
            <span role="status" className="text-sm">
              Đã lưu. Chỉ huy trưởng nhận được thông báo phân công.
            </span>
          )}
          {error && (
            <span role="alert" className="text-sm text-status-overdue">
              {error}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
