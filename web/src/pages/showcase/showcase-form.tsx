/**
 * Thêm / sửa mẫu công trình (Đợt 1 — 1H) — Phòng Thiết kế, TGĐ, Ban Giám đốc.
 *
 * Thông số là thứ bộ lọc «mẫu tương tự» dựa vào (mặt tiền, số tầng, diện tích đất…), nên nhập số
 * thật; ô nào không có thì để trống, đừng ước. Không có ô giá, không có ô tên chủ nhà — khu vực
 * chỉ ghi quận / tỉnh (chủ dự án chốt: link gửi khách không lộ danh tính, không hiện giá).
 */

import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SHOWCASE_KINDS, SHOWCASE_KIND_LABELS, type ShowcaseKind } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { BlockedNotice, CardGridSkeleton } from '@/components/ui/states';
import { toUserMessage } from '@/hooks/use-error-message';
import { useSaveShowcaseItem, useShowcaseItem, type ShowcaseItem } from '@/hooks/use-showcase';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useCompanyScope } from '@/lib/company-scope';
import { useCanEditShowcase } from './showcase-library';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function ShowcaseFormPage() {
  const { id } = useParams<{ id: string }>();
  const existing = useShowcaseItem(id);
  if (id && existing.isLoading) return <CardGridSkeleton count={2} />;
  return <ShowcaseForm item={existing.data ?? null} />;
}

function ShowcaseForm({ item }: { item: ShowcaseItem | null }) {
  const navigate = useNavigate();
  const scope = useCompanyScope();
  const canEdit = useCanEditShowcase();
  const save = useSaveShowcaseItem();
  const str = (v: number | null | undefined) =>
    v === null || v === undefined ? '' : String(v).replace('.', ',');
  const [f, setF] = useState({
    sampleCode: item?.sample_code ?? '',
    title: item?.title ?? '',
    kind: (item?.kind ?? 'nha_pho') as ShowcaseKind,
    style: item?.style ?? '',
    floors: str(item?.floors),
    bedrooms: str(item?.bedrooms),
    landArea: str(item?.land_area),
    frontage: str(item?.frontage),
    depth: str(item?.depth),
    buildingArea: str(item?.building_area),
    span: str(item?.span),
    locationArea: item?.location_area ?? '',
    completedYear: str(item?.completed_year),
    description: item?.description ?? '',
  });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const release = useUnsavedChangesGuard(dirty);

  const set = (k: keyof typeof f, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };
  const num = (v: string): number | null => {
    const t = v.trim().replace(/\./g, '').replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };

  const companyId = item?.company_id ?? (scope.isAggregate ? null : scope.companyId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.title.trim()) return setError('Nhập tên mẫu.');
    if (!companyId)
      return setError('Chọn pháp nhân của mẫu (NVC, NVO hoặc NVS) ở bộ chọn góc trên bên trái.');
    const numbers = {
      floors: num(f.floors),
      bedrooms: num(f.bedrooms),
      land_area: num(f.landArea),
      frontage: num(f.frontage),
      depth: num(f.depth),
      building_area: num(f.buildingArea),
      span: num(f.span),
      completed_year: num(f.completedYear),
    };
    if (Object.values(numbers).some((n) => Number.isNaN(n))) {
      return setError('Các ô thông số chỉ nhập số (dùng dấu phẩy cho số lẻ, ví dụ 5,5).');
    }
    try {
      const savedId = await save.mutateAsync({
        id: item?.id,
        values: {
          company_id: companyId,
          sample_code: f.sampleCode.trim() || null,
          title: f.title.trim(),
          kind: f.kind,
          style: f.style.trim() || null,
          location_area: f.locationArea.trim() || null,
          description: f.description.trim() || null,
          ...numbers,
        },
      });
      setDirty(false);
      release();
      void navigate(`/mau-cong-trinh/${savedId}`, { replace: true });
    } catch (err) {
      setError(toUserMessage(err, item ? 'edit' : 'create'));
    }
  }

  const crumbs = [
    { label: 'Mẫu công trình', to: '/mau-cong-trinh' },
    { label: item ? item.title : 'Thêm mẫu' },
  ];

  if (!canEdit) {
    return (
      <>
        <PageHeader title="Mẫu công trình" breadcrumbs={crumbs} />
        <BlockedNotice
          title="Chỉ Phòng Thiết kế và Giám đốc thêm, sửa được mẫu."
          detail="Cần đưa một công trình vào thư viện thì báo Phòng Thiết kế."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={item ? 'Sửa mẫu công trình' : 'Thêm mẫu công trình'}
        breadcrumbs={crumbs}
      />
      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="max-w-3xl rounded-card bg-surface p-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tên mẫu" required className="sm:col-span-2">
            <Input value={f.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          </Field>
          <Field label="Mã mẫu" optional hint="Ví dụ NV0203 — giữ mã trên website">
            <Input value={f.sampleCode} onChange={(e) => set('sampleCode', e.target.value)} />
          </Field>
          <Field label="Loại hình" required>
            <select
              value={f.kind}
              onChange={(e) => set('kind', e.target.value)}
              className={SELECT_CLASS}
            >
              {SHOWCASE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SHOWCASE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phong cách" optional>
            <Input
              value={f.style}
              placeholder="Hiện đại, tân cổ điển, mái Nhật…"
              onChange={(e) => set('style', e.target.value)}
            />
          </Field>
          <Field label="Khu vực" optional hint="Chỉ quận / tỉnh — không ghi địa chỉ nhà">
            <Input value={f.locationArea} onChange={(e) => set('locationArea', e.target.value)} />
          </Field>
          <Field label="Số tầng" optional>
            <Input
              value={f.floors}
              inputMode="numeric"
              onChange={(e) => set('floors', e.target.value)}
            />
          </Field>
          <Field label="Số phòng ngủ" optional>
            <Input
              value={f.bedrooms}
              inputMode="numeric"
              onChange={(e) => set('bedrooms', e.target.value)}
            />
          </Field>
          <Field label="Năm hoàn thành" optional>
            <Input
              value={f.completedYear}
              inputMode="numeric"
              onChange={(e) => set('completedYear', e.target.value)}
            />
          </Field>
          <Field label="Diện tích đất (m²)" optional>
            <Input
              value={f.landArea}
              inputMode="decimal"
              onChange={(e) => set('landArea', e.target.value)}
            />
          </Field>
          <Field label="Mặt tiền (m)" optional>
            <Input
              value={f.frontage}
              inputMode="decimal"
              onChange={(e) => set('frontage', e.target.value)}
            />
          </Field>
          <Field label="Chiều sâu (m)" optional>
            <Input
              value={f.depth}
              inputMode="decimal"
              onChange={(e) => set('depth', e.target.value)}
            />
          </Field>
          <Field label="Diện tích xây dựng (m²)" optional hint="Nhà xưởng">
            <Input
              value={f.buildingArea}
              inputMode="decimal"
              onChange={(e) => set('buildingArea', e.target.value)}
            />
          </Field>
          <Field label="Khẩu độ (m)" optional hint="Nhà xưởng">
            <Input
              value={f.span}
              inputMode="decimal"
              onChange={(e) => set('span', e.target.value)}
            />
          </Field>
          <Field label="Mô tả" optional className="sm:col-span-3">
            <textarea
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="Điểm nổi bật của công trình — không ghi giá, không ghi tên chủ nhà"
              className="w-full rounded-field border border-border-strong bg-surface px-3 py-2 placeholder:text-fg-subtle"
            />
          </Field>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : item ? 'Lưu thay đổi' : 'Lưu mẫu và thêm ảnh'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate(item ? `/mau-cong-trinh/${item.id}` : '/mau-cong-trinh')}
          >
            Huỷ
          </Button>
        </div>
      </form>
    </>
  );
}
