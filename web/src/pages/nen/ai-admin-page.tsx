/**
 * Trợ lý AI của các bộ phận (Đợt 1 — 1G, khối nền K5).
 *
 * Một nơi để Quản trị và lãnh đạo thấy: chức năng AI nào đang TẮT / GIẢ LẬP / CHẠY THẬT, bật tắt
 * từng chức năng, và mỗi tháng đã gọi bao nhiêu lượt, tốn bao nhiêu tiền (bảng `ai_calls`).
 *
 * Hàng rào chi phí (CLAUDE.md 6.4, chủ dự án chốt «AI làm bằng giả lập trước»): công tắc mặc định
 * TRỐNG = tắt. Bật thật cần cả ba: chủ dự án duyệt số lượt + chi phí, Quản trị bật công tắc ở đây,
 * và máy chủ có khoá / binding của nhà cung cấp. Thiếu một thì chức năng vẫn tắt, người dùng tự gõ.
 * «AI Design» có màn hình và sổ chi phí riêng, không nằm ở đây.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useSaveSystemParameter, useSystemParameters } from '@/hooks/use-admin';
import { toUserMessage } from '@/hooks/use-error-message';
import { useAiStatus } from '@/hooks/use-site-surveys';
import type { AiMode } from '@/lib/ai-api';
import { useCan } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { NenNav } from './nen-nav';

const FEATURES = [
  {
    key: 'transcribe' as const,
    param: 'ai.transcribe_enabled',
    label: 'Chuyển giọng nói thành chữ',
    detail: 'Ghi âm khảo sát, nhật ký công trường (sau này: phiếu bảo hành) → chữ.',
    provider: 'Cloudflare Workers AI — Whisper',
  },
  {
    key: 'summary' as const,
    param: 'ai.survey_summary_enabled',
    label: 'Máy viết báo cáo khảo sát',
    detail: 'Từ chữ của các đoạn ghi âm → nháp sáu ô báo cáo; người khảo sát sửa rồi gửi.',
    provider: 'Google Gemini Flash — gói trả phí (không dùng dữ liệu để huấn luyện)',
  },
  {
    key: 'siteLog' as const,
    param: 'ai.site_log_enabled',
    label: 'Máy xếp mục nhật ký công trường',
    detail:
      'Chỉ huy trưởng nói nhật ký → máy xếp việc đã làm, vật tư, vướng mắc, an toàn, quân số, thời tiết; tắt thì đưa nguyên lời đã chép vào ô Nội dung.',
    provider: 'Google Gemini Flash — gói trả phí (không dùng dữ liệu để huấn luyện)',
  },
];

const FEATURE_LABEL: Record<string, string> = {
  transcribe: 'Chuyển giọng nói',
  survey_summary: 'Viết báo cáo khảo sát',
  site_log_draft: 'Xếp mục nhật ký công trường',
};

const MODE_TEXT: Record<AiMode, string> = {
  off: 'Tắt — người dùng tự gõ',
  fake: 'Giả lập — trả kết quả mẫu, không tốn tiền',
  on: 'Đang chạy thật',
};

interface AiCallRow {
  feature: string;
  is_fake: boolean;
  ok: boolean;
  cost_usd: number | string | null;
  created_at: string;
}

interface MonthRow {
  key: string;
  month: string;
  feature: string;
  real: number;
  fake: number;
  failed: number;
  cost: number;
}

function useAiCalls() {
  return useQuery<AiCallRow[], Error>({
    queryKey: ['ai-calls'],
    queryFn: async () => {
      const since = new Date();
      since.setMonth(since.getMonth() - 6);
      const { data, error } = await supabase
        .from('ai_calls')
        .select('feature, is_fake, ok, cost_usd, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);
      return (data ?? []) as AiCallRow[];
    },
  });
}

export function AiAdminPage() {
  const canEdit = useCan('NEN', 'edit');
  const status = useAiStatus();
  const params = useSystemParameters();
  const save = useSaveSystemParameter();
  const calls = useAiCalls();
  const [confirming, setConfirming] = useState<(typeof FEATURES)[number] | null>(null);

  function setSwitch(paramKey: string, on: boolean) {
    const param = (params.data ?? []).find((p) => p.param_key === paramKey);
    if (!param) return;
    save.mutate({
      id: param.id,
      value: on ? 1 : null,
      effectiveFrom: param.effective_from,
      isActive: param.is_active,
    });
  }

  const months = useMemo<MonthRow[]>(() => {
    const map = new Map<string, MonthRow>();
    for (const c of calls.data ?? []) {
      const month = c.created_at.slice(0, 7);
      const key = `${month}|${c.feature}`;
      const row = map.get(key) ?? {
        key,
        month: `${month.slice(5, 7)}/${month.slice(0, 4)}`,
        feature: FEATURE_LABEL[c.feature] ?? c.feature,
        real: 0,
        fake: 0,
        failed: 0,
        cost: 0,
      };
      if (c.is_fake) row.fake += 1;
      else row.real += 1;
      if (!c.ok) row.failed += 1;
      row.cost += Number(c.cost_usd ?? 0);
      map.set(key, row);
    }
    return [...map.values()];
  }, [calls.data]);

  return (
    <>
      <PageHeader
        title="Trợ lý AI"
        description="Bật / tắt từng chức năng AI của các bộ phận và theo dõi số lượt, chi phí mỗi tháng."
        breadcrumbs={[{ label: 'Quản trị hệ thống' }, { label: 'Trợ lý AI' }]}
      />
      <NenNav />

      <section className="mb-6 rounded-card bg-surface p-4">
        <h2 className="font-semibold">Chức năng</h2>
        <p className="mt-1 text-fg-subtle">
          Máy chỉ viết nháp — người phụ trách sửa, Ban Giám đốc duyệt. Bật chạy thật chỉ khi chủ dự
          án đã duyệt số lượt và chi phí; tắt hay lỗi thì người dùng vẫn tự gõ được.
        </p>
        {status.error && (
          <p className="mt-2 text-status-pending">
            Không hỏi được máy chủ AI — trạng thái dưới đây chỉ theo công tắc.
          </p>
        )}
        <ul className="mt-3 divide-y divide-border">
          {FEATURES.map((f) => {
            const param = (params.data ?? []).find((p) => p.param_key === f.param);
            const switchOn = param?.value === 1;
            const mode: AiMode | undefined = status.data?.[f.key];
            return (
              <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{f.label}</p>
                  <p className="text-xs text-fg-subtle">{f.detail}</p>
                  <p className="text-xs text-fg-subtle">Nhà cung cấp: {f.provider}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{mode ? MODE_TEXT[mode] : '—'}</p>
                  <p className="text-xs text-fg-subtle">
                    Công tắc: {switchOn ? 'bật' : 'tắt (để trống)'}
                  </p>
                </div>
                {canEdit && param && (
                  <Button
                    variant="secondary"
                    disabled={save.isPending}
                    onClick={() => (switchOn ? setSwitch(f.param, false) : setConfirming(f))}
                  >
                    {switchOn ? 'Tắt' : 'Bật'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {save.error && (
          <p role="alert" className="mt-2 text-status-overdue">
            {toUserMessage(save.error, 'edit')}
          </p>
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          title={`Bật «${confirming.label}»?`}
          confirmLabel="Bật chức năng"
          danger
          onConfirm={() => {
            setSwitch(confirming.param, true);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        >
          Máy chủ sẽ gửi dữ liệu tới {confirming.provider} và tốn tiền theo mỗi lượt. Chỉ bật khi
          chủ dự án đã duyệt số lượt và chi phí. Số lượt và chi phí hiện ở bảng bên dưới; tắt lại
          bất cứ lúc nào.
        </ConfirmDialog>
      )}

      <section className="overflow-x-auto rounded-card bg-surface">
        <h2 className="px-4 pt-4 font-semibold">Số lượt và chi phí 6 tháng gần nhất</h2>
        {calls.isLoading ? (
          <TableSkeleton rows={3} columns={6} />
        ) : calls.error ? (
          <ErrorState message={toUserMessage(calls.error)} onRetry={() => void calls.refetch()} />
        ) : months.length === 0 ? (
          <EmptyState message="Chưa có lượt gọi AI nào." />
        ) : (
          <table className="mt-2 w-full min-w-[36rem] border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-subtle">
                <th className="px-4 py-2 font-medium">Tháng</th>
                <th className="px-4 py-2 font-medium">Chức năng</th>
                <th className="px-4 py-2 text-right font-medium">Lượt thật</th>
                <th className="px-4 py-2 text-right font-medium">Lượt giả lập</th>
                <th className="px-4 py-2 text-right font-medium">Lỗi</th>
                <th className="px-4 py-2 text-right font-medium">Chi phí (USD)</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{m.month}</td>
                  <td className="px-4 py-2">{m.feature}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.real}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.fake}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{m.failed}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {m.cost.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
