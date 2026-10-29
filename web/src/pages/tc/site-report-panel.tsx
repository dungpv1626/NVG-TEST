/**
 * Tab «Báo cáo tuần» của công trình (T4, migration 0242).
 *
 * Máy dựng báo cáo từ dữ liệu ĐÃ CÓ (nhật ký, kế hoạch tuần, mốc, đề nghị, tồn tại, điểm danh, phát
 * sinh). Chỉ huy trưởng chỉ thêm ba ô nhận định rồi «Gửi báo cáo» → số liệu chụp lại, bất biến, báo
 * Trưởng phòng Thi công và các giám đốc. Kỳ đã gửi thì hiện đúng bản đã gửi, không dựng lại.
 */

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  SITE_REPORT_KIND_LABELS,
  addDaysIso,
  formatDate,
  formatDateTime,
  monthStartOf,
  toNvgDateInput,
  weekStartOf,
  type SiteReportKind,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { TEXTAREA_BOX } from '@/components/ui/field-box';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CardGridSkeleton, ErrorState } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useSendSiteReport,
  useSiteReport,
  useSiteReportData,
  useSiteReports,
} from '@/hooks/use-site-plan';
import { cn } from '@/lib/utils';
import { SiteReportView, periodLabel, printSiteReport } from './site-report-view';

const KINDS = ['tuan', 'thang'] as const;

const capitalize = (t: string) => t.charAt(0).toLocaleUpperCase('vi') + t.slice(1);

function periodStart(kind: SiteReportKind, date: string) {
  return kind === 'tuan' ? weekStartOf(date) : monthStartOf(date);
}

function shift(kind: SiteReportKind, start: string, step: number) {
  if (kind === 'tuan') return addDaysIso(start, 7 * step);
  const [y, m] = start.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + step, 1));
  return t.toISOString().slice(0, 10);
}

interface Comments {
  highlights: string;
  problems: string;
  nextPlan: string;
}
const EMPTY: Comments = { highlights: '', problems: '', nextPlan: '' };

function draftKey(siteId: string, kind: string, start: string) {
  return `nvg.bao-cao-nhap.${siteId}.${kind}.${start}`;
}

export function SiteReportPanel({ siteId, readOnly }: { siteId: string; readOnly: boolean }) {
  const today = toNvgDateInput(new Date());
  const [kind, setKind] = useState<SiteReportKind>('tuan');
  const [start, setStart] = useState(() => periodStart('tuan', today));
  const current = periodStart(kind, today);

  const { data: sent = [] } = useSiteReports({ siteId });
  const sentHere = sent.find((r) => r.kind === kind && r.period_start === start);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          options={KINDS}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setStart(periodStart(k, today));
          }}
          getLabel={(k) => SITE_REPORT_KIND_LABELS[k]}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="subtle"
            aria-label="Kỳ trước"
            onClick={() => setStart(shift(kind, start, -1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-[11rem] text-center text-sm font-medium">
            {capitalize(
              periodLabel({ kind, period_start: start, period_end: addDaysIso(start, 6) }),
            )}
          </span>
          <Button
            variant="subtle"
            aria-label="Kỳ sau"
            disabled={start >= current}
            onClick={() => setStart(shift(kind, start, 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {sentHere ? (
        <SentReport id={sentHere.id} />
      ) : (
        <DraftReport
          key={`${kind}.${start}`}
          siteId={siteId}
          kind={kind}
          start={start}
          readOnly={readOnly}
        />
      )}

      {sent.length > 0 && (
        <section className="rounded-card bg-surface p-4">
          <h3 className="mb-2 font-semibold">Báo cáo đã gửi</h3>
          <ul className="divide-y divide-border text-sm">
            {sent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <Link to={`/tc/bao-cao/${r.id}`} className="font-medium text-brand hover:underline">
                  {SITE_REPORT_KIND_LABELS[r.kind]} {formatDate(r.period_start)} –{' '}
                  {formatDate(r.period_end)}
                </Link>
                <span className="text-fg-subtle">
                  {r.code} · gửi {formatDateTime(r.sent_at)}
                  {r.sender ? ` · ${r.sender.full_name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SentReport({ id }: { id: string }) {
  const { data, isLoading, error } = useSiteReport(id);
  if (isLoading) return <CardGridSkeleton count={2} />;
  if (error || !data) return <ErrorState message={toUserMessage(error)} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-status-completed-bg px-4 py-3 text-sm">
        <span>
          Đã gửi lúc {formatDateTime(data.sent_at)}
          {data.sender ? ` — ${data.sender.full_name}` : ''}. Số liệu chụp lúc gửi, không đổi về
          sau.
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            printSiteReport(data.data, data, {
              code: data.code,
              sentAt: data.sent_at,
              sender: data.sender?.full_name ?? null,
            })
          }
        >
          <Printer className="size-4" aria-hidden />
          In báo cáo
        </Button>
      </div>
      <SiteReportView data={data.data} comments={data} />
    </div>
  );
}

function DraftReport({
  siteId,
  kind,
  start,
  readOnly,
}: {
  siteId: string;
  kind: SiteReportKind;
  start: string;
  readOnly: boolean;
}) {
  const { data, isLoading, error, refetch } = useSiteReportData(siteId, kind, start);
  const send = useSendSiteReport();
  const [sendError, setSendError] = useState<string | null>(null);
  const key = draftKey(siteId, kind, start);
  const [c, setC] = useState<Comments>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Comments>) } : EMPTY;
    } catch {
      return EMPTY;
    }
  });
  useEffect(() => {
    try {
      if (c.highlights || c.problems || c.nextPlan) sessionStorage.setItem(key, JSON.stringify(c));
      else sessionStorage.removeItem(key);
    } catch {
      // Trình duyệt chặn bộ nhớ phiên — vẫn gửi được, chỉ không giữ nháp.
    }
  }, [key, c]);

  if (isLoading) return <CardGridSkeleton count={3} />;
  if (error || !data)
    return <ErrorState message={toUserMessage(error)} onRetry={() => void refetch()} />;

  const comments = { highlights: c.highlights, problems: c.problems, next_plan: c.nextPlan };

  async function submit() {
    setSendError(null);
    try {
      await send.mutateAsync({
        siteId,
        kind,
        date: start,
        highlights: c.highlights,
        problems: c.problems,
        nextPlan: c.nextPlan,
      });
      try {
        sessionStorage.removeItem(key);
      } catch {
        // bỏ qua
      }
    } catch (e) {
      setSendError(toUserMessage(e, 'create'));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-subtle">
        Bản xem trước — máy tổng hợp từ dữ liệu đã ghi, cập nhật tới lúc gửi. Không cần nhập thêm số
        nào.
      </p>

      {!readOnly && (
        <section className="rounded-card bg-surface p-4">
          <h3 className="mb-2 font-semibold">Nhận định của chỉ huy trưởng</h3>
          <div className="grid gap-3">
            <Field label="Kết quả nổi bật">
              <textarea
                rows={2}
                value={c.highlights}
                onChange={(e) => setC((v) => ({ ...v, highlights: e.target.value }))}
                className={cn(TEXTAREA_BOX, 'w-full')}
              />
            </Field>
            <Field label="Vướng mắc cần văn phòng xử lý">
              <textarea
                rows={2}
                value={c.problems}
                onChange={(e) => setC((v) => ({ ...v, problems: e.target.value }))}
                className={cn(TEXTAREA_BOX, 'w-full')}
              />
            </Field>
            <Field label={kind === 'tuan' ? 'Kế hoạch tuần sau' : 'Kế hoạch tháng sau'}>
              <textarea
                rows={2}
                value={c.nextPlan}
                onChange={(e) => setC((v) => ({ ...v, nextPlan: e.target.value }))}
                className={cn(TEXTAREA_BOX, 'w-full')}
              />
            </Field>
          </div>
          {sendError && (
            <p
              role="alert"
              className="mt-3 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {sendError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={send.isPending} onClick={() => void submit()}>
              {send.isPending ? 'Đang gửi…' : 'Gửi báo cáo'}
            </Button>
            <Button variant="secondary" onClick={() => printSiteReport(data, comments)}>
              <Printer className="size-4" aria-hidden />
              In bản xem trước
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            Gửi tới Trưởng phòng Thi công và Ban Giám đốc. Đã gửi thì số liệu và nhận định không sửa
            được — cần bổ sung thì ghi ở báo cáo kỳ sau.
          </p>
        </section>
      )}

      {readOnly && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => printSiteReport(data, null)}>
            <Printer className="size-4" aria-hidden />
            In bản xem trước
          </Button>
        </div>
      )}

      <SiteReportView data={data} />
    </div>
  );
}
