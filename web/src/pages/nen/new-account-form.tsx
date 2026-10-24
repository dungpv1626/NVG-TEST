/**
 * Thêm người dùng (NEN-02, 0150) — biểu mẫu ngắn ngay trên màn hình Người dùng.
 *
 * Một tài khoản mới luôn kèm MỘT cặp pháp nhân – vai trò chính: tài khoản không vai trò đăng
 * nhập vào chỉ thấy màn hình trống. Mật khẩu tạm do hệ thống sinh, hiện đúng một lần sau khi
 * tạo — Quản trị viên chuyển cho người dùng; hệ thống không lưu nó ở đâu để xem lại.
 */

import { useState } from 'react';
import { newAccountSchema, type CreatedAccount } from '@nvg/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useCreateAccount, useRoles } from '@/hooks/use-admin';
import { useCompanies } from '@/hooks/use-companies';

const SELECT_CLASS = 'h-11 w-full rounded-field border border-border-strong bg-surface px-3';

export function NewAccountForm({ onDone }: { onDone: () => void }) {
  const create = useCreateAccount();
  const { data: companies } = useCompanies();
  const { data: roles } = useRoles();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const input = { fullName, email, phone, jobTitle, department, companyId, roleId };
    const parsed = newAccountSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Thông tin chưa hợp lệ.');
      return;
    }
    try {
      setCreated(await create.mutateAsync(input));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được tài khoản. Vui lòng thử lại.');
    }
  }

  async function copy(account: CreatedAccount) {
    try {
      await navigator.clipboard.writeText(
        `Địa chỉ: ${window.location.origin}\nEmail: ${account.email}\nMật khẩu tạm: ${account.temporaryPassword}`,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    return (
      <section
        aria-label="Tài khoản vừa tạo"
        className="mb-4 max-w-2xl space-y-3 rounded border border-border bg-surface p-4"
      >
        <h2 className="font-semibold">Đã tạo tài khoản {created.email}</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
          <dt className="text-fg-subtle">Email đăng nhập</dt>
          <dd>{created.email}</dd>
          <dt className="text-fg-subtle">Mật khẩu tạm</dt>
          <dd>
            <code className="rounded-sm bg-surface-sunken px-2 py-0.5 font-mono text-base">
              {created.temporaryPassword}
            </code>
          </dd>
        </dl>
        <p className="text-fg-subtle">
          Mật khẩu tạm chỉ hiện một lần. Chuyển trực tiếp cho người dùng (không gửi qua nhóm chat
          chung); lần đầu đăng nhập, người dùng đổi mật khẩu ở menu tên mình góc trên bên phải →
          «Đổi mật khẩu».
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" onClick={() => void copy(created)}>
            {copied ? 'Đã sao chép' : 'Sao chép thông tin đăng nhập'}
          </Button>
          <Button type="button" variant="subtle" onClick={onDone}>
            Đóng
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="mb-4 max-w-2xl space-y-3 rounded border border-border bg-surface p-4"
      aria-label="Thêm người dùng"
    >
      {error && (
        <p role="alert" className="rounded-sm bg-status-overdue-bg px-3 py-2 text-status-overdue">
          {error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Họ và tên" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email đăng nhập" required>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Pháp nhân" required>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={SELECT_CLASS}
            required
          >
            <option value="">Chọn pháp nhân</option>
            {(companies ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.short_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vai trò" required hint="Thêm vai trò thứ hai qua đội triển khai.">
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className={SELECT_CLASS}
            required
          >
            <option value="">Chọn vai trò</option>
            {(roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chức danh" optional>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <Field label="Phòng ban" optional>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
        </Field>
        <Field label="Điện thoại" optional>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Đang tạo…' : 'Tạo tài khoản'}
        </Button>
        <Button type="button" variant="subtle" onClick={onDone}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
