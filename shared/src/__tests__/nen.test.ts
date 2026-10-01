import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, newAccountSchema, TEMPORARY_PASSWORD_LENGTH } from '../nen';

const VALID = {
  fullName: '  Nguyễn Văn A ',
  email: ' A.Nguyen@NhaVietGroup.vn ',
  phone: '',
  jobTitle: 'Kế toán viên',
  companyId: '7d1e7b52-5d8e-4f3a-9a77-1f2b3c4d5e6f',
  roleId: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
};

describe('newAccountSchema', () => {
  it('chuẩn hoá họ tên, email; ô trống thành null', () => {
    const out = newAccountSchema.parse(VALID);
    expect(out.fullName).toBe('Nguyễn Văn A');
    expect(out.email).toBe('a.nguyen@nhavietgroup.vn');
    expect(out.phone).toBeNull();
    expect(out.department).toBeNull();
    expect(out.jobTitle).toBe('Kế toán viên');
  });

  it('báo lỗi bằng tiếng Việt khi thiếu họ tên, email sai, chưa chọn vai trò', () => {
    const r = newAccountSchema.safeParse({ ...VALID, fullName: ' ', email: 'abc', roleId: '' });
    expect(r.success).toBe(false);
    const messages = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(messages).toContain('Chưa nhập họ tên.');
    expect(messages).toContain('Email chưa đúng định dạng, ví dụ ten@nhavietgroup.vn.');
    expect(messages).toContain('Chưa chọn vai trò.');
  });
});

describe('generateTemporaryPassword', () => {
  it('đủ dài, có chữ thường, chữ hoa, chữ số, không có ký tự dễ nhầm', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });

  it('nguồn ngẫu nhiên toàn số 0 vẫn đủ ba nhóm ký tự', () => {
    const p = generateTemporaryPassword((n) => new Uint32Array(n));
    expect(p).toMatch(/[a-z]/);
    expect(p).toMatch(/[A-Z]/);
    expect(p).toMatch(/[2-9]/);
  });
});
