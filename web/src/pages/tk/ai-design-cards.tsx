/**
 * Danh sách hồ sơ AI Design dạng THẺ (07/10/2026, Haan: giao diện gọn, dễ dùng).
 *
 * Mỗi thẻ là một hồ sơ: ảnh bìa theo thứ tự phối cảnh → mặt bằng tầng 1 có nội thất → tờ mặt bằng
 * tầng 1 của phương án ĐANG HIỆU LỰC (Haan, 08/10/2026), trạng thái bốn bước (đầu
 * bài · mặt bằng · mặt đứng · phối cảnh) bằng chữ, và các cột cố định của mẫu Danh sách — mã/tên,
 * người chịu trách nhiệm, trạng thái, thời hạn (AFD 4.2). Chế độ Bảng vẫn còn cho ai quen đọc dòng.
 *
 * Trạng thái và ảnh chỉ tải khi thẻ lọt vào màn hình: mỗi thẻ là hai lượt gọi Worker, mà danh sách
 * có thể dài.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, LayoutGrid, Search } from 'lucide-react';
import { formatDate, type StatusGroup } from '@nvg/shared';
import { Input } from '@/components/ui/input';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/ui/states';
import {
  useAiCoverImage,
  useAiDesignState,
  type AiCoverKind,
  type AiDesignState,
} from '@/hooks/use-ai-design';
import { useCompanyLookup } from '@/hooks/use-companies';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { cn } from '@/lib/utils';

export interface AiDesignCardRow {
  id: string;
  code: string;
  title: string;
  responsiblePerson: string | null;
  status: StatusGroup;
  deadline: string | null;
  companyId?: string | null;
  customerName: string | null;
}

export function AiDesignCards({
  rows,
  isLoading,
  error,
  onRetry,
}: {
  rows: AiDesignCardRow[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const scope = useCompanyScope();
  const companyOf = useCompanyLookup(scope.isAggregate);

  if (isLoading) return <CardGridSkeleton count={6} />;
  if (error) return <ErrorState message={toUserMessage(error)} onRetry={onRetry} />;

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? rows.filter((row) =>
        [row.code, row.title, row.responsiblePerson ?? '', row.customerName ?? ''].some((text) =>
          text.toLowerCase().includes(needle),
        ),
      )
    : rows;

  return (
    <div className="space-y-4">
      <label className="relative block max-w-xl">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <span className="sr-only">Tìm hồ sơ</span>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo tên, mã, khách hàng hoặc người chịu trách nhiệm…"
          className="pl-9"
        />
      </label>

      {shown.length === 0 ? (
        <EmptyState
          message={
            needle
              ? 'Không có hồ sơ nào khớp từ khoá. Thử từ khoá khác.'
              : 'Chưa có dự án thiết kế nào. Tạo hồ sơ ở mục «Dự án thiết kế» rồi quay lại đây.'
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((row) => (
            <li key={row.id}>
              <ProjectCard
                row={row}
                company={scope.isAggregate ? (companyOf(row.companyId)?.code ?? null) : null}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-fg-subtle">{shown.length} hồ sơ</p>
    </div>
  );
}

const COVER_ALT: Record<AiCoverKind, string> = {
  perspective: 'Ảnh phối cảnh',
  furnished_plan: 'Mặt bằng tầng 1 có nội thất',
  plan: 'Mặt bằng tầng 1',
};

/** Thẻ chỉ tải dữ liệu AI khi đã lọt vào màn hình. */
function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

function ProjectCard({
  row,
  company,
}: {
  row: AiDesignCardRow;
  company: string | null;
}): React.ReactElement {
  const [ref, seen] = useInView<HTMLAnchorElement>();
  const state = useAiDesignState(row.id, seen);
  const cover = useAiCoverImage(row.id, state.data, seen);

  return (
    <Link
      ref={ref}
      to={`/tk/ai-design/${row.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-tk-line bg-tk-panel transition-colors hover:border-tk-bl-line"
    >
      <div className="relative grid h-44 place-items-center overflow-hidden border-b border-tk-line bg-tk-card">
        {cover.url && cover.kind ? (
          // `<img>` chứ không nhúng SVG: chữ trên tờ có phần do mô hình sinh (CLAUDE.md 8.3).
          <img
            src={cover.url}
            alt={`${COVER_ALT[cover.kind]} của ${row.title}`}
            className={cn(
              'h-full w-full bg-white object-cover',
              cover.kind === 'perspective' ? 'object-center' : 'object-top',
            )}
          />
        ) : (
          <div className="text-center text-fg-subtle">
            <LayoutGrid className="mx-auto size-8 text-tk-t3" aria-hidden />
            <p className="mt-2 text-xs">
              {state.isLoading || cover.loading ? 'Đang tải…' : 'Chưa có mặt bằng'}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold group-hover:underline">{row.title}</p>
            <p className="text-xs text-fg-subtle">
              {row.code}
              {company && ` · ${company}`}
              {row.customerName && ` · ${row.customerName}`}
            </p>
          </div>
          <StatusLozenge status={row.status} />
        </div>
        <StepChips state={state.data ?? null} />
        <div className="mt-auto flex flex-wrap justify-between gap-2 pt-1 text-xs text-fg-subtle">
          <span>{row.responsiblePerson ?? 'Chưa phân công'}</span>
          <span>{row.deadline ? `Hạn ${formatDate(row.deadline)}` : 'Chưa có hạn'}</span>
        </div>
      </div>
    </Link>
  );
}

/** Bốn bước, mỗi bước một nhãn chữ — không chỉ màu (CGD 6.8). */
function StepChips({ state }: { state: AiDesignState | null }): React.ReactElement {
  const steps: Array<{ label: string; done: boolean }> = [
    { label: 'Đầu bài', done: Boolean(state?.briefArtifactId) },
    {
      label: state?.plans.length ? `Mặt bằng (${state.plans.length})` : 'Mặt bằng',
      done: Boolean(state?.plans.length),
    },
    { label: 'Mặt đứng', done: Boolean(state?.facadeArtifactId) },
    { label: 'Phối cảnh', done: Boolean(state?.imageSetArtifactId) },
  ];
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Các bước AI Design">
      {steps.map((step) => (
        <li
          key={step.label}
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs',
            step.done ? 'bg-tk-gr-badge text-tk-gr-fg2' : 'bg-tk-chip-mute text-tk-t2',
          )}
        >
          {step.done && <Check className="size-3" aria-hidden />}
          {step.label}
          <span className="sr-only">{step.done ? ' — đã có' : ' — chưa có'}</span>
        </li>
      ))}
    </ul>
  );
}
