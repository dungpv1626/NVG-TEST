import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_MAX_BYTES,
  base64Bytes,
  emailFakeMode,
  maskEmail,
  parseEmailRequest,
  resendPayload,
} from '../email';

const ID = '3ef36ba6-471b-450f-b2c7-46626549e729';
const ok = {
  entity_type: 'quotes',
  entity_id: ID,
  to: ' khach@example.com ',
  subject: 'Báo giá NVC-BG-1',
  body: 'Kính gửi Quý khách',
  attachment: { name: 'Bao gia NVC-BG-1 v1.pdf', content_base64: 'JVBERi0xLjQK' },
};

describe('emailFakeMode', () => {
  it('giả lập khi thiếu khoá, thiếu địa chỉ gửi, hoặc EMAIL_FAKE=1', () => {
    expect(emailFakeMode({})).toBe(true);
    expect(emailFakeMode({ RESEND_API_KEY: 're_x' })).toBe(true);
    expect(emailFakeMode({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.vn', EMAIL_FAKE: '1' })).toBe(
      true,
    );
    expect(emailFakeMode({ RESEND_API_KEY: 're_x', EMAIL_FROM: 'a@b.vn' })).toBe(false);
  });
});

describe('parseEmailRequest', () => {
  it('nhận yêu cầu đúng, cắt khoảng trắng', () => {
    const r = parseEmailRequest(ok);
    expect(r.ok && r.value.to).toBe('khach@example.com');
  });
  it('từ chối loại hồ sơ khác, email sai, thiếu tiêu đề, tệp không phải PDF', () => {
    expect(parseEmailRequest({ ...ok, entity_type: 'contracts' }).ok).toBe(false);
    expect(parseEmailRequest({ ...ok, to: 'khong-phai-email' }).ok).toBe(false);
    expect(parseEmailRequest({ ...ok, subject: '  ' }).ok).toBe(false);
    expect(
      parseEmailRequest({ ...ok, attachment: { name: 'a.exe', content_base64: 'AAAA' } }).ok,
    ).toBe(false);
    expect(parseEmailRequest(null).ok).toBe(false);
  });
  it('nhận tệp Word (bản sửa trong Word không đổi được sang PDF)', () => {
    const r = parseEmailRequest({
      ...ok,
      attachment: { name: 'Bao gia.docx', content_base64: 'UEsDBA==' },
    });
    expect(r.ok).toBe(true);
  });
  it('từ chối tệp quá 8 MB', () => {
    const big = 'A'.repeat(Math.ceil(((ATTACHMENT_MAX_BYTES + 3) * 4) / 3));
    const r = parseEmailRequest({ ...ok, attachment: { name: 'x.pdf', content_base64: big } });
    expect(r.ok).toBe(false);
  });
  it('đếm byte base64', () => {
    expect(base64Bytes('JVBERi0xLjQK')).toBe(9);
    expect(base64Bytes('QQ==')).toBe(1);
  });
});

describe('resendPayload', () => {
  it('kèm tệp, trả lời về người gửi, gửi dạng chữ thường', () => {
    const r = parseEmailRequest(ok);
    if (!r.ok) throw new Error(r.error);
    const p = resendPayload(
      { EMAIL_FROM: 'Nhà Việt Group <baogia@nhavietgroup.vn>' },
      r.value,
      'kd@nhavietgroup.vn',
    );
    expect(p).toMatchObject({
      to: ['khach@example.com'],
      reply_to: 'kd@nhavietgroup.vn',
      text: 'Kính gửi Quý khách',
      attachments: [{ filename: 'Bao gia NVC-BG-1 v1.pdf', content: 'JVBERi0xLjQK' }],
    });
  });
  it('che email trong log', () => {
    expect(maskEmail('khach@example.com')).toBe('k***@example.com');
  });
});
