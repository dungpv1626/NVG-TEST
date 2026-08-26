/**
 * Các trường của hồ sơ khách hàng (PRD CRM-01) — dùng chung cho màn hình Tạo mới và Sửa.
 *
 * Tách ra vì hai màn hình nhập CÙNG một bộ trường: nếu chép sang hai nơi thì lần bổ sung
 * trường tiếp theo sẽ chỉ vào một nơi, và hai biểu mẫu của cùng một hồ sơ lệch nhau âm thầm.
 * Phần khác nhau thật sự giữa hai màn hình là quyền, mã hồ sơ và nơi chuyển đến sau khi lưu —
 * những thứ đó nằm ở từng trang, không nằm ở đây.
 */

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ActiveUser } from '@/hooks/use-active-users';

/** Nguồn khách theo PRD CRM-01. */
const SOURCES = [
  'Giới thiệu',
  'BNI',
  'Facebook',
  'Website',
  'Môi giới bất động sản công nghiệp',
  'Mời thầu',
  'Khác',
];

export interface CustomerFormValues {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  source: string;
  taxCode: string;
  address: string;
  needs: string;
  notes: string;
  /** Rỗng = chưa xác định. Chỉ hiện ở màn hình Sửa — xem `responsibleOptions`. */
  responsibleUserId: string;
}

export const EMPTY_CUSTOMER_FORM: CustomerFormValues = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  source: '',
  taxCode: '',
  address: '',
  needs: '',
  notes: '',
  responsibleUserId: '',
};

/**
 * Chuyển giá trị biểu mẫu sang đúng dạng lưu xuống CSDL.
 *
 * Chuỗi rỗng thành `null` chứ không lưu nguyên: một ô để trống và một ô chứa chuỗi rỗng
 * hiển thị giống hệt nhau trên màn hình nhưng lọc/đếm ra kết quả khác nhau.
 *
 * KHÔNG bao gồm `code`: mã hồ sơ do CSDL cấp lúc tạo và bất biến sau đó (migration 0019).
 */
export function customerPayload(form: CustomerFormValues) {
  const orNull = (v: string) => v.trim() || null;
  return {
    name: form.name.trim(),
    contact_person: orNull(form.contactPerson),
    phone: orNull(form.phone),
    email: orNull(form.email),
    source: form.source || null,
    tax_code: orNull(form.taxCode),
    address: orNull(form.address),
    needs: orNull(form.needs),
    notes: orNull(form.notes),
    responsible_user_id: form.responsibleUserId || null,
  };
}

export function CustomerFields({
  value,
  onChange,
  /**
   * Danh sách người chịu trách nhiệm chọn được. Bỏ trống thì ô chọn KHÔNG hiện — màn hình
   * Tạo mới luôn gán người tạo làm người chịu trách nhiệm, việc chuyển giao là thao tác
   * riêng ở màn hình Sửa.
   */
  responsibleOptions,
  responsibleHint,
}: {
  value: CustomerFormValues;
  onChange: (field: keyof CustomerFormValues, next: string) => void;
  responsibleOptions?: ActiveUser[];
  responsibleHint?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Tên khách hàng" required className="sm:col-span-2">
        <Input value={value.name} onChange={(e) => onChange('name', e.target.value)} autoFocus />
      </Field>

      <Field label="Người liên hệ">
        <Input
          value={value.contactPerson}
          onChange={(e) => onChange('contactPerson', e.target.value)}
        />
      </Field>

      <Field label="Điện thoại">
        <Input
          value={value.phone}
          onChange={(e) => onChange('phone', e.target.value)}
          inputMode="tel"
        />
      </Field>

      <Field label="Email">
        <Input
          type="email"
          value={value.email}
          onChange={(e) => onChange('email', e.target.value)}
        />
      </Field>

      <Field label="Nguồn khách">
        <select
          value={value.source}
          onChange={(e) => onChange('source', e.target.value)}
          className="h-9 w-full rounded-sm border border-border bg-surface px-3"
        >
          <option value="">Chưa xác định</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Mã số thuế">
        <Input value={value.taxCode} onChange={(e) => onChange('taxCode', e.target.value)} />
      </Field>

      {responsibleOptions && (
        <Field label="Người chịu trách nhiệm" hint={responsibleHint}>
          <select
            value={value.responsibleUserId}
            onChange={(e) => onChange('responsibleUserId', e.target.value)}
            className="h-9 w-full rounded-sm border border-border bg-surface px-3"
          >
            <option value="">Chưa phân công</option>
            {responsibleOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Địa chỉ" className="sm:col-span-2">
        <Input value={value.address} onChange={(e) => onChange('address', e.target.value)} />
      </Field>

      <Field label="Nhu cầu" className="sm:col-span-2">
        <textarea
          value={value.needs}
          onChange={(e) => onChange('needs', e.target.value)}
          rows={3}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2"
        />
      </Field>

      <Field label="Ghi chú" className="sm:col-span-2">
        <textarea
          value={value.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          rows={3}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2"
        />
      </Field>
    </div>
  );
}
