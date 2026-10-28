/**
 * Ngân sách lập ngay trên công trình (0235).
 *
 * Công trình mở từ hợp đồng của cơ hội CRM (0187) không có gói thầu / hồ sơ thiết kế để sinh ngân
 * sách, nên đề nghị mua gắn công trình không có mã chi phí để chọn. Trưởng phòng Thi công hoặc Ban
 * Giám đốc lập ngân sách từ báo giá đã duyệt: máy dựng một dòng tổng với số dự trù 0 đồng và ghi
 * giá trị báo giá làm căn cứ — giá báo khách là GIÁ BÁN, máy không tự suy ra chi phí (CLAUDE.md 5.2).
 * Người lập chia dòng theo nhóm và nhập số.
 *
 * Người không có quyền lập không thấy nút (5.4); CSDL vẫn kiểm (`auth_manages_site_budget`).
 */

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { CostGroup } from '@nvg/shared';
import { COST_GROUPS, COST_GROUP_LABELS, formatCurrency } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { FIELD_BOX } from '@/components/ui/field-box';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import {
  type SiteBudgetLine,
  type SiteBudgetSource,
  useBuildSiteBudget,
  useDeleteSiteBudgetLine,
  useSaveSiteBudgetLine,
  useSiteBudgetLines,
} from '@/hooks/use-construction-sites';
import { toUserMessage } from '@/hooks/use-error-message';

/** Khối thay bảng ngân sách khi công trình chưa có dòng nào. */
export function SiteBudgetSetup({
  siteId,
  source,
}: {
  siteId: string;
  source: SiteBudgetSource | null | undefined;
}) {
  const build = useBuildSiteBudget();
  const [error, setError] = useState<string | null>(null);

  if (!source?.can_manage) {
    return (
      <EmptyState message="Chưa có ngân sách thi công cho công trình này. Trưởng phòng Thi công hoặc Ban Giám đốc lập ngân sách — đề nghị mua gắn công trình cần mã chi phí trong ngân sách mới gửi phê duyệt được." />
    );
  }

  async function run() {
    setError(null);
    try {
      await build.mutateAsync({ siteId });
    } catch (e) {
      setError(toUserMessage(e, 'create'));
    }
  }

  return (
    <section aria-label="Chưa có ngân sách" className="rounded-card bg-surface-sunken p-4">
      <h2 className="font-semibold">Chưa có ngân sách</h2>
      <p className="mt-1 text-sm">
        Đề nghị mua gắn công trình cần mã chi phí trong ngân sách mới gửi phê duyệt được.
      </p>
      {source.blocked_reason ? (
        <p className="mt-2 text-sm text-fg-subtle">{source.blocked_reason}</p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            Căn cứ: báo giá {source.quote_code} của hợp đồng {source.contract_code} — đã duyệt và đã
            gửi khách
            {source.quote_value != null && <>, {formatCurrency(source.quote_value)}</>}. Đây là giá
            bán, chưa phải chi phí: hệ thống tạo một dòng tổng với số dự trù 0 đồng, người lập chia
            dòng theo nhóm và nhập số dự trù.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={build.isPending} onClick={() => void run()}>
              Lập ngân sách từ báo giá
            </Button>
            {error && (
              <span role="alert" className="text-sm text-status-overdue">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface Draft {
  costGroup: CostGroup;
  costCode: string;
  name: string;
  amount: string;
}

function draftOf(line: SiteBudgetLine): Draft {
  return {
    costGroup: line.cost_group,
    costCode: line.cost_code,
    name: line.name,
    amount: String(line.budgeted_amount ?? '0'),
  };
}

const EMPTY_DRAFT: Draft = { costGroup: 'vat_tu', costCode: '', name: '', amount: '' };

function LineForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (d: Draft) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const ready = d.costCode.trim() !== '' && d.name.trim() !== '';

  return (
    <form
      className="space-y-3 rounded-card border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(d);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tên dòng" required>
          <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required />
        </Field>
        <Field label="Mã chi phí" required hint="Đề nghị mua chọn theo mã này.">
          <Input
            value={d.costCode}
            maxLength={64}
            onChange={(e) => setD({ ...d, costCode: e.target.value.toUpperCase() })}
            required
          />
        </Field>
        <Field label="Nhóm chi phí">
          <select
            value={d.costGroup}
            onChange={(e) => setD({ ...d, costGroup: e.target.value as CostGroup })}
            className={`${FIELD_BOX} w-full`}
          >
            {COST_GROUPS.map((g) => (
              <option key={g} value={g}>
                {COST_GROUP_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Số tiền dự trù">
          <MoneyInput
            value={d.amount}
            onChange={(v) => setD({ ...d, amount: v })}
            aria-label="Số tiền dự trù"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={!ready || pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="subtle" onClick={onCancel}>
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

/** Sửa / thêm / xoá dòng ngân sách gắn thẳng công trình. */
export function SiteBudgetEditor({ siteId }: { siteId: string }) {
  const { data, isLoading, error } = useSiteBudgetLines(siteId, true);
  const save = useSaveSiteBudgetLine();
  const remove = useDeleteSiteBudgetLine();
  const [editing, setEditing] = useState<string | null>(null); // id dòng đang sửa, hoặc 'new'.
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SiteBudgetLine | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isLoading) return <TableSkeleton rows={2} />;
  if (error) return <ErrorState message={toUserMessage(error)} />;
  const lines = data ?? [];
  const sourceNote = lines.find((l) => l.notes)?.notes;

  async function submit(lineId: string | null, d: Draft) {
    setFormError(null);
    try {
      await save.mutateAsync({
        siteId,
        lineId,
        costGroup: d.costGroup,
        costCode: d.costCode,
        name: d.name,
        budgetedAmount: d.amount,
      });
      setEditing(null);
    } catch (e) {
      setFormError(toUserMessage(e, lineId ? 'edit' : 'create'));
    }
  }

  return (
    <section aria-label="Sửa ngân sách công trình" className="space-y-3">
      <div>
        <h2 className="font-semibold">Sửa ngân sách công trình</h2>
        {sourceNote && <p className="mt-1 text-sm text-fg-subtle">{sourceNote}</p>}
      </div>

      <ul className="divide-y divide-border rounded-card bg-surface">
        {lines.map((line) =>
          editing === line.id ? (
            <li key={line.id} className="p-2">
              <LineForm
                initial={draftOf(line)}
                submitLabel="Lưu dòng"
                pending={save.isPending}
                error={formError}
                onSubmit={(d) => void submit(line.id, d)}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{line.name}</span>
                <span className="ml-2 text-xs text-fg-subtle">
                  {line.cost_code} · {COST_GROUP_LABELS[line.cost_group]}
                </span>
              </span>
              <span className="tabular-nums">
                {Number(line.budgeted_amount) === 0 ? (
                  <span className="text-status-pending">Chưa nhập số dự trù</span>
                ) : (
                  formatCurrency(line.budgeted_amount)
                )}
              </span>
              <Button
                size="sm"
                variant="subtle"
                aria-label={`Sửa dòng ${line.name}`}
                onClick={() => {
                  setFormError(null);
                  setEditing(line.id);
                }}
              >
                <Pencil aria-hidden />
                Sửa
              </Button>
              <Button
                size="sm"
                variant="subtle"
                aria-label={`Xoá dòng ${line.name}`}
                onClick={() => {
                  setDeleteError(null);
                  setDeleting(line);
                }}
              >
                <Trash2 aria-hidden />
                Xoá
              </Button>
            </li>
          ),
        )}
      </ul>

      {editing === 'new' ? (
        <LineForm
          initial={EMPTY_DRAFT}
          submitLabel="Thêm dòng"
          pending={save.isPending}
          error={formError}
          onSubmit={(d) => void submit(null, d)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            setFormError(null);
            setEditing('new');
          }}
        >
          <Plus aria-hidden />
          Thêm dòng ngân sách
        </Button>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Xoá dòng «${deleting.name}»?`}
          confirmLabel="Xoá dòng"
          danger
          pending={remove.isPending}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove.mutate(
              { siteId, lineId: deleting.id },
              {
                onSuccess: () => setDeleting(null),
                onError: (e) => setDeleteError(toUserMessage(e, 'delete')),
              },
            );
          }}
        >
          <p>
            Mã chi phí {deleting.cost_code} rời khỏi danh sách để chọn ở đề nghị mua. Dòng đã có đề
            nghị mua hoặc chi phí gắn vào thì không xoá được.
          </p>
          {deleteError && (
            <p role="alert" className="mt-2 text-status-overdue">
              {deleteError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
