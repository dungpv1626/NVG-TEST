/**
 * Hai danh mục nền của Module KHO: vật tư (KHO-02) và kho (KHO-01).
 *
 * Gộp vào một tệp vì cả hai là danh mục thuần: một bảng, một biểu mẫu, không có vòng đời
 * trạng thái. Tách thành hai tệp chỉ để chép lại cùng một khung.
 *
 * ⚠️ Bộ mã vật tư thống nhất của Nhà Việt Group CHƯA có (PRD Mục 10). Ô mã có nút gợi ý ghép
 * theo đúng quy tắc KHO-02 (nhóm – viết tắt – quy cách), nhưng người phụ trách danh mục vẫn
 * là người chốt — phần mềm không tự đặt mã rồi lưu.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { WarehouseType } from '@nvg/shared';
import { MATERIAL_GROUPS, WAREHOUSE_TYPE_LABELS, buildMaterialCode } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/states';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import {
  useMaterials,
  useSaveMaterial,
  useSaveWarehouse,
  useWarehouses,
} from '@/hooks/use-warehouse';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCan } from '@/lib/auth';
import { useCompanyScope } from '@/lib/company-scope';
import { KhoNav } from './kho-nav';

const EM_DASH = '—';

export function MaterialListPage() {
  const canEdit = useCan('KHO', 'edit');
  const { data, isLoading, error } = useMaterials();
  const save = useSaveMaterial();
  const [params] = useSearchParams();
  const [isFormOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [suggested, setSuggested] = useState('');
  // `?ma=` đến từ tìm kiếm toàn hệ thống (AFD 5.3) — vật tư không có trang chi tiết riêng
  // (danh mục thuần, không vòng đời), nên kết quả tìm kiếm trỏ về đây, đã lọc sẵn đúng mã.
  const [query, setQuery] = useState(params.get('ma') ?? '');

  const rows = (data ?? []).filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      m.code.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      (m.specification?.toLowerCase().includes(q) ?? false)
    );
  });

  /**
   * Gợi ý mã theo quy tắc KHO-02 và ĐIỀN LUÔN vào ô mã, miễn là người dùng chưa tự sửa ô đó.
   *
   * Chỉ để ở placeholder thì gợi ý vô dụng — người dùng vẫn phải gõ lại đúng chuỗi đang nhìn
   * thấy, và gõ lại là chỗ sinh ra mã lệch một ký tự, đúng thứ KHO-02 chặn.
   */
  function suggest(form: HTMLFormElement) {
    const values = new FormData(form);
    const next = buildMaterialCode(
      String(values.get('group_code') ?? ''),
      String(values.get('short_name') ?? ''),
      String(values.get('spec_code') ?? ''),
    );
    setSuggested(next);
    setCode((current) => (current === '' || current === suggested ? next : current));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await save.mutateAsync({
        values: {
          code: String(values.get('code') ?? '').trim(),
          group_code: String(values.get('group_code') ?? ''),
          name: String(values.get('name') ?? '').trim(),
          specification: String(values.get('specification') ?? '').trim() || null,
          unit: String(values.get('unit') ?? '').trim(),
          barcode: String(values.get('barcode') ?? '').trim() || null,
          is_scaffolding: values.get('is_scaffolding') === 'on',
        },
      });
      form.reset();
      setCode('');
      setSuggested('');
      setFormOpen(false);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Danh mục vật tư"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Danh mục vật tư' }]}
        description="Một vật tư chỉ dùng một mã duy nhất — tránh trùng tên và nhầm đơn vị tính."
        actions={
          canEdit ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm vật tư'}
            </Button>
          ) : undefined
        }
      />

      {isFormOpen && canEdit && (
        <form
          onSubmit={(e) => void submit(e)}
          onChange={(e) => suggest(e.currentTarget)}
          className="mb-4 space-y-4 rounded-lg border border-border bg-surface p-4"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nhóm vật tư" required>
              <select
                name="group_code"
                required
                defaultValue=""
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
              >
                <option value="">Chọn nhóm</option>
                {Object.entries(MATERIAL_GROUPS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} — {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tên viết tắt" hint="Dùng để ghép mã, ví dụ ONG, HOP, DAY.">
              <Input name="short_name" maxLength={16} />
            </Field>
            <Field label="Quy cách rút gọn" hint="Ví dụ D49X2.0, 50X50.">
              <Input name="spec_code" maxLength={24} />
            </Field>
            <Field
              label="Mã vật tư"
              required
              className="lg:col-span-3"
              hint={
                suggested
                  ? 'Ghép sẵn theo quy tắc nhóm – viết tắt – quy cách. Sửa lại được nếu cần.'
                  : 'Điền ba ô trên để hệ thống ghép mã đúng quy tắc.'
              }
            >
              <Input
                name="code"
                required
                maxLength={64}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono"
                placeholder="THEP-ONG-D49X2.0"
              />
            </Field>
            <Field label="Tên hàng" required className="lg:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="Đơn vị tính" required hint="Nhầm đơn vị là nhầm cả sổ kho.">
              <Input name="unit" required maxLength={32} placeholder="kg, m, bộ, cái…" />
            </Field>
            <Field label="Quy cách đầy đủ" className="lg:col-span-2">
              <Input name="specification" />
            </Field>
            <Field label="Mã vạch trên tem">
              <Input name="barcode" maxLength={64} className="font-mono" />
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_scaffolding" className="size-4" />
            <span>Quản lý theo vòng đời giàn giáo (không tiêu hao một lần)</span>
          </label>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Lưu vật tư
          </Button>
        </form>
      )}

      <Field label="Tìm vật tư" className="mb-3 max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo mã, tên hoặc quy cách…"
        />
      </Field>

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : rows.length === 0 ? (
        <EmptyState message="Chưa có vật tư nào trong danh mục. Thêm vật tư trước khi lập phiếu nhập — hàng chỉ vào kho khi mã đã có trong danh mục." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="border-b border-border text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">
                  Mã
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Nhóm
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Tên hàng
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Quy cách
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Đơn vị
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Mã vạch
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{m.code}</td>
                  <td className="px-4 py-2">{m.group_code}</td>
                  <td className="px-4 py-2">
                    {m.name}
                    {m.is_scaffolding && (
                      <span className="ml-2 text-xs text-fg-subtle">Giàn giáo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{m.specification ?? EM_DASH}</td>
                  <td className="px-4 py-2">{m.unit}</td>
                  <td className="px-4 py-2 font-mono text-xs">{m.barcode ?? EM_DASH}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function WarehouseListPage() {
  const canCreate = useCan('KHO', 'create');
  const scope = useCompanyScope();
  const { data, isLoading, error } = useWarehouses();
  const { data: sites } = useConstructionSites();
  const save = useSaveWarehouse();
  const [isFormOpen, setFormOpen] = useState(false);
  const [warehouseType, setWarehouseType] = useState<WarehouseType>('vat_tu_xay_dung');
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!scope.companyId || scope.isAggregate) {
      setFormError('Kho thuộc về một pháp nhân cụ thể. Chọn NVC, NVO hoặc NVS ở thanh bên.');
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await save.mutateAsync({
        values: {
          company_id: scope.companyId,
          code: String(values.get('code') ?? '').trim(),
          name: String(values.get('name') ?? '').trim(),
          warehouse_type: warehouseType,
          construction_site_id: String(values.get('construction_site_id') ?? '') || null,
          address: String(values.get('address') ?? '').trim() || null,
        },
      });
      form.reset();
      setFormOpen(false);
    } catch (e) {
      setFormError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <KhoNav />
      <PageHeader
        title="Danh mục kho"
        breadcrumbs={[{ label: 'Kho' }, { label: 'Danh mục kho' }]}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setFormOpen((open) => !open)}>
              {isFormOpen ? 'Đóng biểu mẫu' : 'Thêm kho'}
            </Button>
          ) : undefined
        }
      />

      {isFormOpen && canCreate && (
        <form
          onSubmit={(e) => void submit(e)}
          className="mb-4 space-y-4 rounded-lg border border-border bg-surface p-4"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
            >
              {formError}
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mã kho" required>
              <Input name="code" required maxLength={40} placeholder="KHO-VT-01" />
            </Field>
            <Field label="Tên kho" required className="lg:col-span-2">
              <Input name="name" required />
            </Field>
            <Field label="Loại kho" required>
              <select
                value={warehouseType}
                onChange={(e) => setWarehouseType(e.target.value as WarehouseType)}
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3"
              >
                {Object.entries(WAREHOUSE_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Công trình"
              required={warehouseType === 'kho_cong_trinh'}
              hint="Chỉ kho tại công trình mới gắn công trình."
            >
              <select
                name="construction_site_id"
                required={warehouseType === 'kho_cong_trinh'}
                disabled={warehouseType !== 'kho_cong_trinh'}
                className="h-9 w-full rounded-sm border border-border-strong bg-surface px-3 disabled:bg-surface-sunken disabled:opacity-60"
              >
                <option value="">Không gắn công trình</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Địa chỉ">
              <Input name="address" />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Lưu kho
          </Button>
        </form>
      )}

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : error ? (
        <ErrorState message={toUserMessage(error)} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="Chưa có kho nào. Lập kho trước khi nhập hàng — mỗi phiếu kho đều thuộc về một kho cụ thể." />
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((w) => (
            <li key={w.id} className="rounded-lg border border-border bg-surface px-4 py-3">
              <p className="font-medium">
                {w.name} <span className="font-mono text-xs text-fg-subtle">{w.code}</span>
              </p>
              <p className="text-fg-muted">
                {WAREHOUSE_TYPE_LABELS[w.warehouse_type]}
                {w.address ? ` · ${w.address}` : ''}
                {w.manager ? ` · Thủ kho ${w.manager.full_name}` : ''}
                {!w.is_active ? ' · Đã ngừng sử dụng' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
