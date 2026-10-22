/**
 * Gửi một tệp đi từ máy người dùng: điện thoại mở bảng chia sẻ của máy (Zalo, email, Drive…)
 * kèm chính tệp; máy tính (hoặc máy không hỗ trợ) thì tải tệp về để đính kèm tay.
 *
 * Tệp được tải về trình duyệt trước rồi mới chia sẻ — đường dẫn ký của kho tự hết hạn, gửi
 * đường dẫn đó cho người khác là gửi một link sắp hỏng (link cho khách có trang riêng, 0189).
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export async function shareOrDownload(
  url: string,
  fileName: string,
  title: string,
): Promise<ShareOutcome> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không tải được tệp.');
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: blob.type || 'application/pdf' });

  // Chỉ máy cảm ứng (điện thoại, máy tính bảng) mở bảng chia sẻ: Chrome trên Windows cũng có
  // `navigator.share` nhưng người dùng máy tính chờ một tệp tải về để đính kèm, không phải bảng
  // chia sẻ của hệ điều hành.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      // Người dùng đóng bảng chia sẻ — không phải lỗi.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }

  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return 'downloaded';
}

/** Tên tệp an toàn từ số hợp đồng / mã hồ sơ: bỏ dấu, thay ký tự lạ bằng gạch ngang. */
export function safeFileName(base: string): string {
  return (
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tai-lieu'
  );
}
