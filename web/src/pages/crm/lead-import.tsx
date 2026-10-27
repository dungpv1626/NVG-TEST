/**
 * Nhập đầu mối từ Excel / CSV (việc treo của Đợt 1) — danh sách Marketing thu được, danh bạ hội chợ…
 *
 * Ba bước trên một trang: chọn tệp → kiểm cột (máy đoán theo tiêu đề, người dùng sửa được) → xem từng dòng rồi nhập.
 * Kiểm đúng như biểu mẫu «Ghi đầu mối» (`shared/src/lead-import.ts`); số điện thoại đã có ở đầu mối / khách hàng nào thì
 * nói ra (cùng hàm `contact_duplicates` của biểu mẫu) và để BỎ CHỌN sẵn — không gọi trùng khách của đồng nghiệp.
 * Mỗi dòng ghi qua đúng đường của biểu mẫu (RLS `leads_insert`, mã và người phụ trách do CSDL đặt); dòng hỏng không
 * kéo dòng khác hỏng theo.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_SOURCES,
  LEAD_IMPORT_FIELDS,
  LEAD_IMPORT_FIELD_LABELS,
  buildLeadImportRows,
  guessLeadColumns,
  type LeadColumnMap,
  type LeadImportField,
  type LeadImportRow,
} from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { BlockedNotice } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useCan, useIsOrgManager } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { readSheetFile, type SheetTable } from '@/lib/sheet-read';
import { supabase } from '@/lib/supabase';
import { CrmNav } from './crm-nav';

const BREADCRUMBS = [
  { label: 'Khách hàng & Cơ hội' },
  { label: 'Đầu mối', to: '/crm/dau-moi' },
  { label: 'Nhập từ Excel' },
];

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';
/** Tệp quá dài thì chia nhỏ — tra trùng từng số và ghi từng dòng. */
const MAX_ROWS = 500;

interface Duplicate {
  kind: string;
  code: string;
  name: string;
  company_code: string | null;
  owner_name: string | null;
}

type Outcome = { ok: true; code: string } | { ok: false; message: string };

export function LeadImportPage() {
  const scope = useCompanyScope();
  const canCreateCrm = useCan('CRM', 'create');
  // Lãnh đạo đi chào khách cũng ghi được đầu mối (policy `leads_insert`), như biểu mẫu Ghi đầu mối.
  const isLeader = useIsOrgManager();
  const canCreate = canCreateCrm || isLeader;
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<SheetTable | null>(null);
  const [map, setMap] = useState<LeadColumnMap>({});
  const [defaultSource, setDefaultSource] = useState('');
  const [duplicates, setDuplicates] = useState<Map<string, Duplicate[]>>(new Map());
  const [checking, setChecking] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [outcomes, setOutcomes] = useState<Map<number, Outcome>>(new Map());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => (table ? buildLeadImportRows(table, map, defaultSource || null) : []),
    [table, map, defaultSource],
  );
  const pending = rows.filter((r) => !outcomes.get(r.line)?.ok);
  const releaseGuard = useUnsavedChangesGuard(table !== null && pending.length > 0 && !importing);

  const dupOf = (r: LeadImportRow) => duplicates.get((r.phone ?? '').replace(/\D/g, '')) ?? [];
  const selectable = (r: LeadImportRow) => r.errors.length === 0 && !outcomes.get(r.line)?.ok;
  const selected = rows.filter((r) => selectable(r) && !excluded.has(r.line));

  async function onFile(file: File) {
    setError(null);
    setOutcomes(new Map());
    try {
      const sheet = (await readSheetFile(file)).filter(
        (row, i) => i === 0 || row.some((c) => c.trim()),
      );
      if (sheet.length < 2) throw new Error('Tệp không có dòng dữ liệu nào dưới dòng tiêu đề.');
      if (sheet.length - 1 > MAX_ROWS) {
        throw new Error(
          `Tệp có ${sheet.length - 1} dòng — mỗi lần nhập tối đa ${MAX_ROWS} dòng. Chia tệp rồi nhập từng phần.`,
        );
      }
      const guessed = guessLeadColumns(sheet[0]!);
      setFileName(file.name);
      setTable(sheet);
      setMap(guessed);
      await checkDuplicates(buildLeadImportRows(sheet, guessed, null));
    } catch (e) {
      setTable(null);
      setError(toUserMessage(e));
    }
  }

  /** Tra trùng với đầu mối / khách hàng đã có — mỗi số một lần, sau đó bỏ chọn sẵn các dòng trùng. */
  async function checkDuplicates(list: LeadImportRow[]) {
    setChecking(true);
    const found = new Map<string, Duplicate[]>();
    const digitsList = [...new Set(list.map((r) => (r.phone ?? '').replace(/\D/g, '')))].filter(
      (d) => d.length >= 8,
    );
    for (const digits of digitsList) {
      const { data } = await supabase.rpc('contact_duplicates', {
        p_phone: digits,
        p_exclude_lead: null,
      });
      if (data && (data as Duplicate[]).length > 0) found.set(digits, data as Duplicate[]);
    }
    setDuplicates(found);
    setExcluded(
      new Set(list.filter((r) => found.has((r.phone ?? '').replace(/\D/g, ''))).map((r) => r.line)),
    );
    setChecking(false);
  }

  function toggle(line: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  async function runImport() {
    if (!scope.companyId) return;
    setImporting(true);
    const next = new Map(outcomes);
    for (const r of selected) {
      const { data, error: insertError } = await supabase
        .from('leads')
        .insert({
          company_id: scope.companyId,
          full_name: r.fullName,
          phone: r.phone,
          email: r.email,
          area: r.area,
          source: r.source,
          source_detail: r.sourceDetail,
          need: r.need,
          project_type: r.projectType,
          notes: r.notes,
        })
        .select('code')
        .single();
      next.set(
        r.line,
        insertError
          ? { ok: false, message: toUserMessage(insertError, 'create') }
          : { ok: true, code: (data as { code: string }).code },
      );
      setOutcomes(new Map(next));
    }
    setImporting(false);
    void queryClient.invalidateQueries({ queryKey: ['leads'] });
    if ([...next.values()].every((o) => o.ok)) releaseGuard();
  }

  if (scope.isAggregate || !scope.companyId) {
    return (
      <>
        <PageHeader title="Nhập đầu mối từ Excel" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Chọn pháp nhân trước khi nhập đầu mối"
          detail="Đầu mối thuộc về công ty sẽ chăm sóc khách. Chọn NVC, NVO hoặc NVS ở bộ chọn góc trên bên trái."
        />
      </>
    );
  }
  if (!canCreate) {
    return (
      <>
        <PageHeader title="Nhập đầu mối từ Excel" breadcrumbs={BREADCRUMBS} />
        <BlockedNotice
          title="Vai trò hiện tại không có quyền ghi đầu mối."
          detail="Kinh doanh và Ban Giám đốc ghi được đầu mối. Liên hệ quản lý trực tiếp nếu cần được cấp quyền."
        />
      </>
    );
  }

  const header = table?.[0] ?? [];
  const done = [...outcomes.values()].filter((o) => o.ok).length;
  const failed = [...outcomes.values()].filter((o) => !o.ok).length;

  return (
    <>
      <PageHeader title="Nhập đầu mối từ Excel" breadcrumbs={BREADCRUMBS} />
      <CrmNav />
      <div className="space-y-4">
        <section className="rounded-card bg-surface p-4">
          <h2 className="font-semibold">1. Chọn tệp</h2>
          <p className="mt-1 text-fg-subtle">
            Tệp .xlsx hoặc .csv, dòng đầu là tiêu đề cột (vd Họ tên, Điện thoại, Email, Khu vực,
            Nguồn, Loại công trình, Ghi chú). Máy đọc trang tính đầu tiên. Người nhập là người phụ
            trách các đầu mối.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onFile(file);
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant={table ? 'secondary' : 'primary'}
              onClick={() => fileRef.current?.click()}
            >
              {table ? 'Chọn tệp khác' : 'Chọn tệp Excel'}
            </Button>
            {fileName && <span className="text-fg-subtle">{fileName}</span>}
          </div>
          {error && <p className="mt-2 text-status-overdue">{error}</p>}
        </section>

        {table && (
          <section className="rounded-card bg-surface p-4">
            <h2 className="font-semibold">2. Kiểm cột</h2>
            <p className="mt-1 text-fg-subtle">Máy đoán cột theo tiêu đề — sửa nếu đoán sai.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LEAD_IMPORT_FIELDS.map((field: LeadImportField) => (
                <Field key={field} label={LEAD_IMPORT_FIELD_LABELS[field]}>
                  <select
                    className={SELECT_CLASS}
                    value={map[field] ?? ''}
                    onChange={(e) =>
                      setMap((m) => ({
                        ...m,
                        [field]: e.target.value === '' ? undefined : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">Không có cột này</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>
                        Cột {i + 1}: {h || '(không tên)'}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field
                label="Nguồn mặc định"
                hint="Dùng cho dòng không ghi nguồn (vd cả tệp là khách thu từ Facebook)."
              >
                <select
                  className={SELECT_CLASS}
                  value={defaultSource}
                  onChange={(e) => setDefaultSource(e.target.value)}
                >
                  <option value="">Không đặt</option>
                  {CUSTOMER_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>
        )}

        {table && (
          <section className="rounded-card bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">3. Xem lại và nhập</h2>
              <Button
                variant="primary"
                disabled={selected.length === 0 || importing || checking}
                onClick={() => void runImport()}
              >
                {importing ? 'Đang nhập…' : `Nhập ${selected.length} đầu mối`}
              </Button>
            </div>
            <p className="mt-1 text-fg-subtle">
              {checking
                ? 'Đang tra số điện thoại trùng với đầu mối / khách hàng đã có…'
                : `${rows.length} dòng · ${rows.filter((r) => r.errors.length > 0).length} dòng thiếu thông tin · ${duplicates.size} số đã có trên hệ thống (bỏ chọn sẵn).`}
            </p>
            {outcomes.size > 0 && (
              <p role="status" className="mt-2 font-medium">
                Đã nhập {done} đầu mối
                {failed > 0 ? `, ${failed} dòng không nhập được (xem cột Kết quả)` : ''}.{' '}
                <Link to="/crm/dau-moi" className="text-brand hover:underline">
                  Mở danh sách đầu mối
                </Link>
              </p>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-left text-fg-subtle">
                    <th className="w-10 py-2">Nhập</th>
                    <th className="py-2">Dòng</th>
                    <th className="py-2">Tên</th>
                    <th className="py-2">Điện thoại / email</th>
                    <th className="py-2">Nguồn</th>
                    <th className="py-2">Kết quả kiểm</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const outcome = outcomes.get(r.line);
                    const dups = dupOf(r);
                    return (
                      <tr key={r.line} className="border-b border-line-soft align-top">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            aria-label={`Nhập dòng ${r.line}`}
                            className="size-5"
                            disabled={!selectable(r) || importing}
                            checked={selectable(r) && !excluded.has(r.line)}
                            onChange={() => toggle(r.line)}
                          />
                        </td>
                        <td className="py-2">{r.line}</td>
                        <td className="py-2">{r.fullName || '—'}</td>
                        <td className="py-2">{r.phone ?? r.email ?? '—'}</td>
                        <td className="py-2">
                          {r.source || '—'}
                          {r.sourceDetail ? ` (${r.sourceDetail})` : ''}
                        </td>
                        <td className="py-2">
                          <ul className="space-y-0.5">
                            {outcome?.ok && (
                              <li className="text-status-completed">Đã nhập — {outcome.code}</li>
                            )}
                            {outcome && !outcome.ok && (
                              <li className="text-status-overdue">{outcome.message}</li>
                            )}
                            {r.errors.map((m) => (
                              <li key={m} className="text-status-overdue">
                                {m}
                              </li>
                            ))}
                            {dups.map((d) => (
                              <li key={`${d.kind}-${d.code}`} className="text-status-pending">
                                Đã có: {d.kind === 'lead' ? 'đầu mối' : 'khách hàng'} {d.code} —{' '}
                                {d.name}
                                {d.company_code ? ` (${d.company_code})` : ''}
                                {d.owner_name ? `, ${d.owner_name} phụ trách` : ''}
                              </li>
                            ))}
                            {r.warnings.map((m) => (
                              <li key={m} className="text-fg-subtle">
                                {m}
                              </li>
                            ))}
                            {!outcome &&
                              r.errors.length === 0 &&
                              dups.length === 0 &&
                              r.warnings.length === 0 && (
                                <li className="text-fg-subtle">Nhập được</li>
                              )}
                          </ul>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
