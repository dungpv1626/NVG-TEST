/**
 * «Sau khi ký» — việc còn lại của hợp đồng đã ký, nói theo vai người đang xem.
 *
 * Ký xong, Kinh doanh chỉ thấy dải tiến trình báo «Tiếp theo: Đã quyết toán — cần mọi công trình
 * đã bàn giao», tức việc của Thi công và Ban Giám đốc, nên không biết mình còn làm gì (anh Dũng
 * 22/10/2026). Khối này liệt kê: công trình đã chuyển cho ai, các đợt thanh toán tới hạn lúc nào
 * (để nhắc khách), khách muốn đổi thì lập phát sinh, và ai quyết toán.
 *
 * Không cho Kinh doanh đánh dấu «khách đã trả»: số đã thu chỉ đổi qua chứng từ Kế toán
 * (`receivable_settlements`, 0043) — một nguồn dữ liệu (CLAUDE.md 5.2).
 */

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CONTRACT_TERM_TYPE_LABELS,
  daysUntil,
  formatCurrency,
  formatDate,
  formatDeadline,
  type StatusGroup,
} from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { StatusLozenge } from '@/components/ui/status-lozenge';
import { useContractTerms, type ContractTermRecord } from '@/hooks/use-contracts';
import {
  useContractCollectionTargets,
  useLinkCollectionTerm,
  type CollectionTarget,
} from '@/hooks/use-collections';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';

/** Đợt sắp tới trong ngần này ngày thì nhắc «sắp đến hạn». */
const SOON_DAYS = 7;

/** `group` rỗng = chưa tới lúc phải để ý — chỉ ghi chữ, không gắn nhãn trạng thái («Nháp» đọc sai nghĩa). */
function roundStatus(term: ContractTermRecord): { group: StatusGroup | null; text: string } {
  if (term.completed_at)
    return { group: 'completed', text: `Đã hoàn thành ${formatDate(term.completed_at)}` };
  if (term.collection_due_at) return { group: 'in_progress', text: 'Đến hạn thu' };
  if (!term.due_date) return { group: null, text: 'Chưa ghi hạn' };
  const days = daysUntil(term.due_date);
  if (days !== null && days < 0) return { group: 'overdue', text: formatDeadline(term.due_date) };
  if (days !== null && days <= SOON_DAYS)
    return { group: 'in_progress', text: formatDeadline(term.due_date) };
  return { group: null, text: `Hạn ${formatDate(term.due_date)}` };
}

/**
 * Căn cứ thu của một đợt (3A, 0195): mốc thi công hoặc biên bản nghiệm thu với chủ đầu tư. Mốc
 * đạt / biên bản ký hai bên thì đợt đến hạn thu và Kế toán được báo. Người chịu trách nhiệm hợp
 * đồng và Kế toán chọn được; người khác chỉ đọc.
 */
function CollectionBasis({
  term,
  contractId,
  targets,
  canLink,
}: {
  term: ContractTermRecord;
  contractId: string;
  targets: CollectionTarget[];
  canLink: boolean;
}) {
  const link = useLinkCollectionTerm();
  const [error, setError] = useState<string | null>(null);
  const currentId = term.site_milestone_id ?? term.acceptance_record_id ?? '';
  const current = targets.find((t) => t.id === currentId);
  const describe = (t: CollectionTarget) =>
    `${t.kind === 'moc' ? 'Mốc' : 'Biên bản'} «${t.label}» — ${
      t.reached
        ? t.kind === 'moc'
          ? 'đã đạt'
          : 'đã ký'
        : t.kind === 'moc'
          ? 'chưa đạt'
          : 'chưa ký'
    }`;

  if (!canLink || term.completed_at) {
    return (
      <span className="block text-xs text-fg-subtle">
        Căn cứ thu: {current ? describe(current) : 'chưa gắn mốc / biên bản'}
      </span>
    );
  }
  return (
    <label className="mt-1 block text-xs text-fg-subtle">
      Căn cứ thu{' '}
      <select
        value={currentId}
        disabled={link.isPending}
        onChange={(e) => {
          const target = targets.find((t) => t.id === e.target.value) ?? null;
          setError(null);
          link.mutate(
            { termId: term.id, contractId, target },
            { onError: (err) => setError(toUserMessage(err, 'edit')) },
          );
        }}
        className="ms-1 h-8 max-w-full rounded-sm border border-border-strong bg-surface px-2 text-sm text-fg"
      >
        <option value="">Không gắn — theo ngày hạn</option>
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.site_code} · {describe(t)}
          </option>
        ))}
      </select>
      {targets.length === 0 && (
        <span className="ms-2">Công trình chưa có mốc / biên bản nghiệm thu để gắn.</span>
      )}
      {error && (
        <span role="alert" className="block text-status-overdue">
          {error}
        </span>
      )}
    </label>
  );
}

export function AfterSignCard({
  contractId,
  customer,
  collected,
  currentValue,
  hasSite,
  opensSite,
  isResponsible,
  canApprove,
  onOpenAmendments,
  hasScan,
}: {
  contractId: string;
  customer: { id: string; name: string } | null;
  collected: bigint;
  currentValue: bigint;
  hasSite: boolean | null | undefined;
  opensSite: boolean;
  isResponsible: boolean;
  canApprove: boolean;
  onOpenAmendments: () => void;
  /** Đã có bản hợp đồng đã ký trên hệ thống (0187 / 0189). */
  hasScan: boolean;
}) {
  const { data: terms = [] } = useContractTerms(contractId);
  const rounds = terms
    .filter((t) => t.term_type === 'tam_ung' || t.term_type === 'tien_do_thanh_toan')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  const nextRound = rounds.find((t) => !t.completed_at);
  const canLinkAsKt = useCan('KT', 'edit');
  const canLink = isResponsible || canLinkAsKt;
  const { data: targets = [] } = useContractCollectionTargets(contractId, rounds.length > 0);

  const steps: { title: string; body: ReactNode; done?: boolean }[] = [];
  steps.push({
    title: hasScan ? 'Lưu bản hợp đồng đã ký — đã xong' : 'Lưu bản hợp đồng đã ký',
    done: hasScan,
    body: hasScan ? (
      'Bản quét nằm ở mục «Bản hợp đồng đã ký» bên dưới — chia sẻ hoặc tạo link gửi khách từ đó.'
    ) : (
      <span>
        Quét bản giấy đã ký, đóng dấu ở mục{' '}
        <a href="#ban-da-ky" className="font-medium text-brand hover:underline">
          «Bản hợp đồng đã ký»
        </a>{' '}
        bên dưới để lưu hồ sơ và gửi khách.
      </span>
    ),
  });
  if (opensSite) {
    steps.push({
      title: hasSite
        ? 'Bàn giao cho Thi công — đã xong'
        : 'Bàn giao cho Thi công — chờ mở công trình',
      done: Boolean(hasSite),
      body: hasSite
        ? 'Công trình đã mở ở bước Chuẩn bị, Trưởng phòng Thi công đã được báo để phân công chỉ huy trưởng. Không cần làm gì thêm.'
        : 'Ban Giám đốc hoặc Thi công bấm «Mở công trình» ở đầu trang.',
    });
  }
  steps.push({
    title: 'Theo dõi các đợt thanh toán',
    body: (
      <>
        <p>
          {nextRound
            ? `Đợt tiếp theo: ${nextRound.description.trim().replace(/[.;:,]+$/, '')}${
                nextRound.amount ? ` — ${formatCurrency(nextRound.amount)}` : ''
              }${nextRound.due_date ? `, ${formatDeadline(nextRound.due_date).toLowerCase()}` : ''}. `
            : rounds.length > 0
              ? 'Mọi đợt đã hoàn thành. '
              : 'Hợp đồng chưa ghi đợt thanh toán nào. '}
          {isResponsible
            ? 'Tới đợt thì nhắc khách và báo Kế toán lập đề nghị thanh toán; số đã thu do Kế toán ghi khi có chứng từ.'
            : 'Số đã thu do Kế toán ghi khi có chứng từ.'}
        </p>
        <p className="mt-1">
          Đã thu {formatCurrency(collected)} / {formatCurrency(currentValue)}.
        </p>
        {rounds.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
            {rounds.map((t) => {
              const s = roundStatus(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-xs text-fg-subtle">
                      {CONTRACT_TERM_TYPE_LABELS[t.term_type]}
                    </span>
                    <span className="block">{t.description}</span>
                    <CollectionBasis
                      term={t}
                      contractId={contractId}
                      targets={targets}
                      canLink={canLink}
                    />
                  </span>
                  {t.amount !== null && (
                    <span className="font-medium tabular-nums">{formatCurrency(t.amount)}</span>
                  )}
                  <span className="flex items-center gap-2">
                    {s.group && <StatusLozenge status={s.group} />}
                    <span className="text-sm text-fg-subtle">{s.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    ),
  });
  steps.push({
    title: 'Khách muốn thêm, bớt hoặc đổi hạng mục',
    body: (
      <div className="flex flex-wrap items-center gap-2">
        <span>Lập phát sinh để Ban Giám đốc duyệt; không sửa hợp đồng đã ký.</span>
        {isResponsible && (
          <Button size="sm" variant="secondary" onClick={onOpenAmendments}>
            Mở tab Phát sinh
          </Button>
        )}
      </div>
    ),
  });
  if (isResponsible && customer) {
    steps.push({
      title: 'Giữ liên lạc với khách',
      body: (
        <span>
          Ghi lại mỗi lần gọi, gặp khách ở{' '}
          <Link
            to={`/crm/khach-hang/${customer.id}`}
            className="font-medium text-brand hover:underline"
          >
            hồ sơ {customer.name}
          </Link>{' '}
          — hệ thống nhắc ngày hẹn tiếp theo trong «Việc hôm nay».
        </span>
      ),
    });
  }
  steps.push({
    title: 'Quyết toán hợp đồng',
    body: canApprove
      ? 'Bấm «Quyết toán hợp đồng» ở đầu trang khi công trình đã sang Bảo hành hoặc Hoàn thành.'
      : 'Ban Giám đốc quyết toán khi công trình đã sang Bảo hành hoặc Hoàn thành — Kinh doanh không phải làm gì ở bước này.',
  });

  return (
    <section id="sau-khi-ky" className="mb-4 rounded-card bg-surface p-4">
      <p className="font-medium">Sau khi ký — việc còn lại</p>
      {isResponsible && (
        <p className="mt-1 text-sm text-fg-subtle">
          Phần soạn và ký của Kinh doanh đã xong. Từ đây chỉ còn theo dõi thu tiền và phát sinh.
        </p>
      )}
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              aria-hidden
              className={
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (s.done
                  ? 'bg-status-completed-bg text-status-completed'
                  : 'bg-surface-sunken text-fg-subtle')
              }
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <div className="mt-0.5 text-sm">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
