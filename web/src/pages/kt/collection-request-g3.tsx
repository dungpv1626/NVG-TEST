/**
 * Hồ sơ thanh toán gửi chủ đầu tư — phần G3 (0248) trên trang Đề nghị thu tiền:
 *
 *   · «Kiểm nội bộ trước khi gửi»: bốn bước công trường → Thi công → Dự án / QS → Kế toán, ai ký, lúc nào,
 *     lý do trả lại. Kế toán bấm «Gửi kiểm nội bộ»; từng bước ký ở trang «Kiểm hồ sơ thanh toán».
 *   · «Chủ đầu tư duyệt»: sau khi gửi, ghi số được duyệt + ngày + bản quét. 0253 (anh Dũng): tiền giữ lại bảo
 *     hành KHÔNG trừ ở đây nữa — nó là một đợt thanh toán của hợp đồng (căn cứ «Khi hết hạn bảo hành»), trừ
 *     thêm ở hồ sơ là đếm hai lần trên dòng tiền.
 *   · Bảng số: đề nghị → duyệt → giữ lại → công nợ → đã thu.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatDate, formatDateTime, toMoney, type MoneyValue } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/ui/money-input';
import {
  COLLECTION_CHECK_STEPS,
  collectionScanUrl,
  useCollectionChecks,
  useRecordOwnerApproval,
  type CollectionRequestRecord,
} from '@/hooks/use-collection-requests';
import { toUserMessage } from '@/hooks/use-error-message';

/** Hồ sơ phải kiểm xong mới gửi được (và chưa kiểm xong). */
export function checkBlocksSending(r: CollectionRequestRecord): boolean {
  return r.check_required && r.check_status !== 'da_kiem';
}

/** Đang kiểm / đã kiểm thì nội dung khoá (CSDL cũng chặn). */
export function checkLocksContent(r: CollectionRequestRecord): boolean {
  return r.check_status === 'dang_kiem' || r.check_status === 'da_kiem';
}

export function CollectionCheckSection({
  r,
  canEdit,
  onStart,
  pending,
}: {
  r: CollectionRequestRecord;
  canEdit: boolean;
  onStart: () => void;
  pending: boolean;
}) {
  const { data: checks = [] } = useCollectionChecks(r.id);
  if (!r.construction_site_id && !r.check_required) return null;
  const round = checks.filter((c) => c.round_no === r.check_round);
  const earlier = checks.filter((c) => c.round_no !== r.check_round);
  const canStart =
    canEdit &&
    r.status === 'nhap' &&
    r.construction_site_id !== null &&
    (r.check_status === null || r.check_status === 'tra_lai');

  const summary =
    r.check_status === 'da_kiem'
      ? 'Đã qua đủ bốn bước kiểm — in, ký và gửi chủ đầu tư.'
      : r.check_status === 'dang_kiem'
        ? `Đang chờ bước «${COLLECTION_CHECK_STEPS[(r.check_step ?? 1) - 1]}».`
        : r.check_status === 'tra_lai'
          ? 'Bị trả lại — sửa theo lý do bên dưới rồi gửi kiểm lại (kiểm lại từ bước 1).'
          : r.check_required
            ? 'Hồ sơ gắn công trình của pháp nhân này phải qua bốn bước kiểm trước khi gửi chủ đầu tư.'
            : 'Không bắt buộc với pháp nhân này — gửi kiểm được nếu cần người khác soát.';

  return (
    <section aria-labelledby="kiem-noi-bo" className="mb-4 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="kiem-noi-bo" className="font-semibold">
            Kiểm nội bộ trước khi gửi
          </h2>
          <p className="text-sm text-fg-subtle">{summary}</p>
        </div>
        {canStart && (
          <Button variant="secondary" onClick={onStart} disabled={pending}>
            {r.check_status === 'tra_lai' ? 'Gửi kiểm lại' : 'Gửi kiểm nội bộ'}
          </Button>
        )}
      </div>
      {r.check_round > 0 && (
        <ol className="mt-3 space-y-2">
          {COLLECTION_CHECK_STEPS.map((label, i) => {
            const step = i + 1;
            const done = round.find((c) => c.step_no === step);
            const current = r.check_status === 'dang_kiem' && r.check_step === step;
            return (
              <li key={label} className="flex gap-3">
                <span
                  aria-hidden
                  className={
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                    (done?.decision === 'dat'
                      ? 'bg-status-completed-bg text-status-completed'
                      : done?.decision === 'tra_lai'
                        ? 'bg-status-overdue-bg text-status-overdue'
                        : current
                          ? 'bg-status-progress-bg text-status-progress'
                          : 'bg-surface-sunken text-fg-subtle')
                  }
                >
                  {done?.decision === 'dat' ? '✓' : step}
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{label}</p>
                  <p className="text-fg-subtle">
                    {done
                      ? `${done.decision === 'dat' ? 'Đạt' : 'Trả lại'} · ${done.decider?.full_name ?? ''} · ${formatDateTime(done.decided_at)}`
                      : current
                        ? 'Đang chờ'
                        : 'Chưa tới bước này'}
                  </p>
                  {done?.note && <p className="mt-0.5">{done.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {earlier.some((c) => c.decision === 'tra_lai') && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-fg-subtle">Các lần trả lại trước</summary>
          <ul className="mt-1 space-y-1">
            {earlier
              .filter((c) => c.decision === 'tra_lai')
              .map((c) => (
                <li key={c.id}>
                  Vòng {c.round_no} · {COLLECTION_CHECK_STEPS[c.step_no - 1]} ·{' '}
                  {c.decider?.full_name ?? ''} · {formatDateTime(c.decided_at)}: {c.note}
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function remaining(rp: { amount: MoneyValue; settled_amount: MoneyValue } | null): bigint {
  if (!rp) return 0n;
  const left = toMoney(rp.amount) - toMoney(rp.settled_amount);
  return left > 0n ? left : 0n;
}

/** Bảng số của hồ sơ: đề nghị → duyệt → giữ lại → công nợ → đã thu. */
export function CollectionAmounts({ r }: { r: CollectionRequestRecord }) {
  const requested = toMoney(r.amount);
  const approved = r.owner_approved_amount === null ? null : toMoney(r.owner_approved_amount);
  const retention = r.retention_amount === null ? null : toMoney(r.retention_amount);
  const collected =
    (r.receivable ? toMoney(r.receivable.settled_amount) : 0n) +
    (r.retention_receivable ? toMoney(r.retention_receivable.settled_amount) : 0n);
  const rows: { label: string; value: string }[] = [
    { label: 'Giá trị đề nghị', value: formatCurrency(requested) },
    {
      label: 'Chủ đầu tư duyệt',
      value:
        approved === null
          ? 'Chưa ghi'
          : `${formatCurrency(approved)}${r.owner_approved_date ? ` · ngày ${formatDate(r.owner_approved_date)}` : ''}`,
    },
    {
      label: 'Giữ lại bảo hành',
      value:
        retention === null
          ? 'Chưa ghi'
          : retention === 0n
            ? 'Không giữ lại'
            : `${formatCurrency(retention)}${r.retention_rate !== null ? ` (${String(r.retention_rate).replace('.', ',')}%)` : ''}`,
    },
    {
      label: 'Hoá đơn',
      value: r.invoice_number
        ? `Số ${r.invoice_number}${r.invoice_date ? ` · ngày ${formatDate(r.invoice_date)}` : ''}`
        : 'Chưa ghi',
    },
  ];
  if (r.receivable) {
    rows.push({
      label: 'Công nợ phải thu',
      value: `${formatCurrency(r.receivable.amount)} · còn ${formatCurrency(remaining(r.receivable))}`,
    });
  }
  if (r.retention_receivable) {
    rows.push({
      label: 'Khoản giữ lại',
      value: `${formatCurrency(r.retention_receivable.amount)} · còn ${formatCurrency(
        remaining(r.retention_receivable),
      )}${r.retention_receivable.due_date ? ` · hạn thu hồi ${formatDate(r.retention_receivable.due_date)}` : ' · chưa có hạn (chờ khai bảo hành)'}`,
    });
  }
  if (r.receivable || r.retention_receivable) {
    rows.push({ label: 'Đã thu', value: formatCurrency(collected) });
  }
  return (
    <section aria-labelledby="so-tien-ho-so" className="mb-4 rounded-card bg-surface p-4">
      <h2 id="so-tien-ho-so" className="font-semibold">
        Số tiền của hồ sơ
      </h2>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-fg-subtle">{row.label}</dt>
            <dd className="tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>
      {r.status === 'da_ghi_cong_no' && (
        <p className="mt-2 text-sm">
          <Link to="/kt/cong-no" className="text-brand underline">
            Mở Công nợ
          </Link>
          {r.retention_receivable && (
            <>
              {' · '}
              <Link to="/kt/bao-lanh-giu-lai" className="text-brand underline">
                Mở Bảo lãnh và giữ lại
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function OwnerApprovalSection({
  r,
  canEdit,
  onDone,
}: {
  r: CollectionRequestRecord;
  canEdit: boolean;
  onDone: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const record = useRecordOwnerApproval();
  const [approved, setApproved] = useState(
    r.owner_approved_amount === null ? String(r.amount) : String(r.owner_approved_amount),
  );
  const [date, setDate] = useState(r.owner_approved_date ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (r.status !== 'da_gui' && !r.owner_approval_scan_path) return null;
  const editable = canEdit && r.status === 'da_gui';
  const approvedMoney = approved ? toMoney(approved) : 0n;

  async function submit() {
    setError(null);
    if (approvedMoney <= 0n) return setError('Vui lòng nhập số chủ đầu tư duyệt lớn hơn 0.');
    if (!date) return setError('Vui lòng nhập ngày chủ đầu tư duyệt.');
    if (!file) return setError('Vui lòng chọn bản chủ đầu tư duyệt (ảnh hoặc PDF).');
    try {
      await record.mutateAsync({
        id: r.id,
        file,
        approvedAmount: approved,
        approvedDate: date,
        retentionRate: null,
        retentionAmount: null,
      });
      setFile(null);
      onDone('Đã ghi số chủ đầu tư duyệt.');
    } catch (e) {
      setError(toUserMessage(e, 'edit'));
    }
  }

  return (
    <section aria-labelledby="chu-dau-tu-duyet" className="mb-4 rounded-card bg-surface p-4">
      <h2 id="chu-dau-tu-duyet" className="font-semibold">
        Chủ đầu tư duyệt
      </h2>
      <p className="mt-1 text-sm text-fg-subtle">
        Khi hồ sơ duyệt của chủ đầu tư gửi về: ghi số được duyệt, quét bản duyệt. Công nợ ghi theo
        đúng số được duyệt. Tiền giữ lại bảo hành không trừ ở đây — nó là đợt «giữ lại bảo hành» của
        hợp đồng, đến hạn khi hết bảo hành (xem «Bảo lãnh và giữ lại»).
      </p>
      {r.owner_approval_scan_path && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() =>
            void collectionScanUrl(r.owner_approval_scan_path!).then(
              (url) => url && window.open(url, '_blank'),
            )
          }
        >
          Mở bản chủ đầu tư duyệt
        </Button>
      )}
      {editable && (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Số chủ đầu tư duyệt (đồng)" required>
            <MoneyInput value={approved} onChange={setApproved} />
          </Field>
          <Field label="Ngày duyệt" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <p className="text-sm sm:col-span-2">Công nợ sẽ ghi {formatCurrency(approvedMoney)}.</p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {file ? 'Chọn tệp khác' : 'Chọn bản chủ đầu tư duyệt'}
            </Button>
            {file && <span className="text-sm text-fg-subtle">{file.name}</span>}
            <Button variant="primary" onClick={() => void submit()} disabled={record.isPending}>
              Ghi số chủ đầu tư duyệt
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-status-overdue sm:col-span-2">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
