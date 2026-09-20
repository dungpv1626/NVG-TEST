/**
 * Thêm hồ sơ nhân sự (NS-01) — mẫu bố cục Biểu mẫu một trang (Webapp Flow 4.4).
 *
 * Dưới 10 trường nên KHÔNG dùng wizard. Lưu xong chuyển thẳng vào Chi tiết hồ sơ vừa tạo,
 * đúng yêu cầu của mẫu 4.
 *
 * Lương và căn cước có mặt trong biểu mẫu vì Hành chính – Nhân sự phải nhập chúng, nhưng
 * chúng KHÔNG đọc lại được từ màn hình: sau khi lưu, muốn xem phải bấm nút riêng và mỗi lượt
 * xem được ghi nhật ký (NEN-07). Đó là lý do ô lương ở đây không hiện giá trị cũ khi sửa.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SALARY_TYPE_LABELS, SALARY_TYPES, WORK_BLOCKS, WORK_BLOCK_LABELS } from '@nvg/shared';
import type { SalaryType, WorkBlock } from '@nvg/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { ErrorState } from '@/components/ui/states';
import { useCreateEmployee } from '@/hooks/use-hr';
import { useConstructionSites } from '@/hooks/use-construction-sites';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { toUserMessage } from '@/hooks/use-error-message';
import { useCompanyScope } from '@/lib/company-scope';
import { NsNav } from './ns-nav';

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const scope = useCompanyScope();
  const create = useCreateEmployee();
  const { data: sites } = useConstructionSites();

  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [block, setBlock] = useState<WorkBlock>('van_phong');
  const [department, setDepartment] = useState('');
  const [siteId, setSiteId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [probationEnd, setProbationEnd] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [salaryType, setSalaryType] = useState<SalaryType>('thang');
  const [baseSalary, setBaseSalary] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);

  const isDirty = Boolean(fullName || position || department || phone || idNumber || baseSalary);
  useUnsavedChangesGuard(isDirty && !create.isSuccess);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageError(null);

    if (!scope.companyId || scope.isAggregate) {
      setPageError('Chọn một pháp nhân cụ thể ở bộ chọn góc trên bên trái trước khi thêm nhân sự.');
      return;
    }

    try {
      const id = await create.mutateAsync({
        companyId: scope.companyId,
        fullName,
        position,
        block,
        department: department || null,
        constructionSiteId: block === 'cong_truong' ? siteId || null : null,
        hireDate: hireDate || null,
        probationEndDate: probationEnd || null,
        phone: phone || null,
        idNumber: idNumber || null,
        salaryType,
        baseSalary: baseSalary || null,
      });
      void navigate(`/ns/nhan-su/${id}`, { replace: true });
    } catch (e) {
      setPageError(toUserMessage(e, 'create'));
    }
  }

  return (
    <>
      <NsNav />
      <PageHeader
        title="Thêm nhân sự"
        description="Hồ sơ này theo người đó suốt quá trình làm việc — hợp đồng, chấm công, tài sản đều gắn vào đây."
        breadcrumbs={[
          { label: 'Hành chính – Nhân sự' },
          { label: 'Hồ sơ nhân sự', to: '/ns/nhan-su' },
          { label: 'Thêm nhân sự' },
        ]}
      />

      {pageError && <ErrorState message={pageError} />}

      <form onSubmit={submit} className="max-w-3xl space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ và tên" required>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={128}
            />
          </Field>

          <Field label="Chức danh" required>
            <Input
              id="position"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
              maxLength={128}
            />
          </Field>

          <Field
            label="Khối làm việc"
            hint="Khối quyết định cách chấm công, không phải phòng ban."
            required
          >
            <select
              id="block"
              className="h-9 w-full rounded border border-border bg-bg px-2"
              value={block}
              onChange={(e) => setBlock(e.target.value as WorkBlock)}
            >
              {WORK_BLOCKS.map((b) => (
                <option key={b} value={b}>
                  {WORK_BLOCK_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>

          {block === 'cong_truong' ? (
            <Field label="Công trường">
              <select
                id="site"
                className="h-9 w-full rounded border border-border bg-bg px-2"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">Chưa phân công</option>
                {(sites ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Phòng ban">
              <Input
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                maxLength={128}
              />
            </Field>
          )}

          <Field label="Ngày vào làm">
            <DateInput value={hireDate} onChange={setHireDate} />
          </Field>

          <Field label="Hết hạn thử việc" hint="Hệ thống nhắc đánh giá trước ngày này.">
            <DateInput value={probationEnd} onChange={setProbationEnd} />
          </Field>

          <Field label="Điện thoại">
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={32}
            />
          </Field>
        </section>

        <section className="space-y-4 rounded border border-border bg-bg-subtle p-4">
          <div>
            <h2 className="font-semibold">Thông tin hạn chế</h2>
            <p className="mt-1 text-fg-subtle">
              Chỉ vai trò được phép mới xem lại được, và mỗi lượt xem đều được ghi nhật ký.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Số căn cước">
              <Input
                id="id_number"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                inputMode="numeric"
                maxLength={32}
              />
            </Field>

            <Field label="Hình thức trả lương">
              <select
                id="salary_type"
                className="h-9 w-full rounded border border-border bg-bg px-2"
                value={salaryType}
                onChange={(e) => setSalaryType(e.target.value as SalaryType)}
              >
                {SALARY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SALARY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Mức lương thỏa thuận">
              <MoneyInput value={baseSalary} onChange={setBaseSalary} />
            </Field>
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/ns/nhan-su')}>
            Hủy
          </Button>
        </div>
      </form>
    </>
  );
}
