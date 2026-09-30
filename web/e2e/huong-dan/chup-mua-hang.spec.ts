/**
 * Chụp ảnh màn hình cho hướng dẫn sử dụng của Mua hàng – Vật tư (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Hủy — chỉ mở màn
 * hình và biểu mẫu; hộp thoại hủy được đóng bằng nút «Huỷ».
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-mua-hang.spec.ts
 *
 * Khổ máy tính — Mua hàng lập, so sánh báo giá và đặt hàng trên máy tính văn phòng.
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/mh';
const EMAIL = 'muahang@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string, { keepHelp = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Trang tải phần mã theo lượt (lazy): networkidle tới trước khi trang kịp vẽ tiêu đề.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (!keepHelp && (await gotIt.isVisible())) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function openRequest(page: Page, title: RegExp): Promise<string> {
  await page.goto('/mh/de-nghi-mua');
  await page.getByRole('link', { name: title }).first().click();
  await page.waitForURL(/mh\/de-nghi-mua\/[0-9a-f-]{36}/);
  return page.url().split('?')[0]!;
}

test('chụp màn hình Mua hàng', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '01-dashboard');

  await page.goto('/mh/de-nghi-mua');
  await shot(page, '02-danh-sach-de-nghi');

  await page.goto('/mh/de-nghi-mua/tao-moi');
  await shot(page, '03-lap-de-nghi');

  // Đề nghị cốp pha: đã duyệt, chưa có báo giá — bước việc của Mua hàng.
  const formwork = await openRequest(page, /Cốp pha phủ phim/);
  await shot(page, '04-de-nghi-da-duyet');
  await page.goto(`${formwork}?tab=tong-quan`);
  await shot(page, '05-tong-quan-da-thuc');
  await page.goto(`${formwork}?tab=bao-gia`);
  await page.getByRole('button', { name: 'Nhập báo giá nhận được' }).click();
  await shot(page, '06-nhap-bao-gia');
  await page.getByRole('button', { name: 'Hủy đề nghị' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: `${OUT}/07-hop-thoai-huy.png` });
  await page.getByRole('button', { name: 'Huỷ', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Đề nghị thép hình: đủ vòng — hai báo giá, đã chọn, đã đặt, đã giao đủ.
  const steel = await openRequest(page, /Thép hình H200/);
  await page.goto(`${steel}?tab=bao-gia`);
  await shot(page, '08-so-sanh-bao-gia');

  await page.goto('/mh/don-hang');
  await shot(page, '09-don-hang');
  await page.getByRole('link', { name: /DH-2026-0001|Thép hình H200/ }).first().click();
  await page.waitForURL(/mh\/don-hang\/[0-9a-f-]{36}/);
  const order = page.url().split('?')[0]!;
  await shot(page, '10-giao-nhan');
  await page.goto(`${order}?tab=chung-tu`);
  await shot(page, '11-chung-tu');

  await page.goto('/mh/nha-cung-cap');
  await shot(page, '12-nha-cung-cap');
  await page.getByRole('link', { name: /Thép Đại Phát/ }).first().click();
  await page.waitForURL(/mh\/nha-cung-cap\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: /Thép Đại Phát/ })).toBeVisible();
  await shot(page, '13-danh-gia-ncc');

  await page.goto('/viec-can-lam');
  await shot(page, '14-viec-can-lam');
});
