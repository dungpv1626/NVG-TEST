/**
 * Điều chỉnh ngân sách sau khởi công (G4, 0249 — phiếu khảo sát: «điều chỉnh ngân sách phải có
 * nguyên nhân, trách nhiệm, ảnh hưởng và phê duyệt»).
 *
 * Công trình đã khởi công thì không sửa thẳng dòng ngân sách nữa (CSDL chặn mọi đường). Ban công
 * trường / Trưởng phòng Thi công gửi đề nghị kèm bốn ý; người duyệt theo hạn mức «Điều chỉnh ngân
 * sách». Danh sách bên dưới là lịch sử — số cũ, số mới, ai duyệt.
 */

import { useState } from 'react';
import type { CostGroup } from '@nvg/shared';
import { COST_GROUPS, COST_GROUP_LABELS, formatCurrency, formatDateTime } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FIELD_BOX, TEXTAREA_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useSiteBudgetLines } from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';
import {
  useBudgetAdjustments,
  useCanRequestBudgetAdjustment,
  useRequestBudgetAdjustment,
  type BudgetAdjustment,
} from '@/hooks/use-site-handover';

const STATUS_TEXT: Record<BudgetAdjustment['status'], { label: string; className: string }> = {
  cho_duyet: { label: 'Chờ duyệt', className: 'text-status-pending' },
  da_duyet: { label: 'Đã duyệt', className: 'text-status-completed' },
  tu_choi: { label: 'Bị từ chối', className: 'text-status-overdue' },
  huy: { label: 'Đã hủy', className: 'text-fg-subtle' },
};

const ACTION_TEXT: Record<BudgetAdjustment['action'], string> = {
  sua: 'Sửa số dự trù',
  them: 'Thêm dòng',
  xoa: 'Xoá dòng',
};

function signed(v: number): string {
  return `${v >= 0 ? '+' : '−'}${formatCurrency(Math.abs(v))}`;
}

function RequestForm({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const { data: lines = [] } = useSiteBudgetLines(siteId, true);
  const request = useRequestBudgetAdjustment();
  const [lineId, setLineId] = useState<string>(''); // '' = thêm dòng mới
  const [action, setAction] = useState<'sua' | 'xoa'>('sua');
  const [costGroup, setCostGroup] = useState<CostGroup>('vat_tu');
  const [costCode, setCostCode] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [cause, setCause] = useState('');
  const [responsibility, setResponsibility] = useState('');
  const [impact, setImpact] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isNew = lineId === '';
  const chosen = lines.find((l) => l.id === lineId);
  const fourDone = [reason, cause, responsibility, impact].every((t) => t.trim() !== '');
  const ready =
    fourDone &&
    (isNew ? costCode.trim() !== '' && name.trim() !== '' : action === 'xoa' || amount !== '');

  return (
    <form
      className="space-y-3 rounded-card border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        setError(null);
        request.mutate(
          {
            siteId,
            lineId: isNew ? null : lineId,
            action: isNew ? 'them' : action,
            costGroup: isNew ? costGroup : (chosen?.cost_group ?? 'vat_tu'),
            costCode: isNew ? costCode : (chosen?.cost_code ?? ''),
            name: isNew ? name : (chosen?.name ?? ''),
            newAmount: action === 'xoa' && !isNew ? '0' : amount,
            reason,
            cause,
            responsibility,
            impact,
          },
          { onSuccess: onDone, onError: (e) => setError(toUserMessage(e, 'create')) },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Dòng ngân sách">
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            className={`${FIELD_BOX} w-full`}
          >
            <option value="">Thêm dòng mới</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.cost_code} — {l.name} ({formatCurrency(l.budgeted_amount)})
              </option>
            ))}
          </select>
        </Field>
        {!isNew && (
          <Field label="Loại điều chỉnh">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as 'sua' | 'xoa')}
              className={`${FIELD_BOX} w-full`}
            >
              <option value="sua">Sửa số dự trù</option>
              <option value="xoa">Xoá dòng (chưa có cam kết, chi phí)</option>
            </select>
          </Field>
        )}
        {isNew && (
          <>
            <Field label="Tên dòng" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Mã chi phí" required>
              <Input
                value={costCode}
                maxLength={64}
                onChange={(e) => setCostCode(e.target.value.toUpperCase())}
                required
              />
            </Field>
            <Field label="Nhóm chi phí">
              <select
                value={costGroup}
                onChange={(e) => setCostGroup(e.target.value as CostGroup)}
                className={`${FIELD_BOX} w-full`}
              >
                {COST_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {COST_GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {(isNew || action === 'sua') && (
          <Field label="Số dự trù mới" required>
            <MoneyInput value={amount} onChange={setAmount} aria-label="Số dự trù mới" />
          </Field>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['Lý do', reason, setReason, 'Vì sao cần điều chỉnh'],
            [
              'Nguyên nhân',
              cause,
              setCause,
              'Giá vật tư tăng, đổi thiết kế, khối lượng phát sinh…',
            ],
            ['Trách nhiệm', responsibility, setResponsibility, 'Bộ phận / người chịu trách nhiệm'],
            ['Ảnh hưởng', impact, setImpact, 'Ảnh hưởng tới lãi, tiến độ, hợp đồng'],
          ] as const
        ).map(([label, value, set, hint]) => (
          <Field key={label} label={label} required hint={hint}>
            <textarea
              value={value}
              onChange={(e) => set(e.target.value)}
              rows={2}
              className={TEXTAREA_BOX}
              required
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={!ready || request.isPending}>
          Gửi phê duyệt
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Hủy
        </Button>
        {error && (
          <span role="alert" className="text-sm text-status-overdue">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

export function BudgetAdjustmentPanel({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useBudgetAdjustments(siteId);
  const { data: canRequest } = useCanRequestBudgetAdjustment(siteId);
  const [open, setOpen] = useState(false);

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const rows = data ?? [];

  return (
    <section aria-label="Điều chỉnh ngân sách" className="space-y-3">
      <div>
        <h2 className="font-semibold">Điều chỉnh ngân sách</h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Công trình đã khởi công: thêm, sửa, xoá dòng ngân sách phải gửi phê duyệt kèm lý do,
          nguyên nhân, trách nhiệm và ảnh hưởng.
        </p>
      </div>
      {canRequest &&
        (open ? (
          <RequestForm siteId={siteId} onDone={() => setOpen(false)} />
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Đề nghị điều chỉnh ngân sách
          </Button>
        ))}
      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded-card bg-surface">
          {rows.map((a) => {
            const st = STATUS_TEXT[a.status];
            return (
              <li key={a.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {a.code ?? 'Đề nghị'} · {ACTION_TEXT[a.action]} {a.cost_code} — {a.name}
                  </span>
                  <span className={`font-semibold ${st.className}`}>{st.label}</span>
                </div>
                <p className="tabular-nums">
                  {formatCurrency(a.old_amount)} → {formatCurrency(a.new_amount)} (
                  {signed(Number(a.delta))})
                </p>
                <p className="text-fg-subtle">
                  Lý do: {a.reason} · Nguyên nhân: {a.cause} · Trách nhiệm: {a.responsibility} · Ảnh
                  hưởng: {a.impact}
                </p>
                <p className="text-xs text-fg-subtle">
                  Gửi {formatDateTime(a.requested_at)}
                  {a.decided_at && ` · xử lý ${formatDateTime(a.decided_at)}`}
                  {a.decision_note && ` · ${a.decision_note}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
