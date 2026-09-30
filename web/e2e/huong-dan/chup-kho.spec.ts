/**
 * Chụp ảnh màn hình cho hướng dẫn sử dụng của Kho (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Nhập kho — chỉ mở
 * màn hình và biểu mẫu.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-kho.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/kho';
const EMAIL = 'kho@nhavietgroup.test';

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

async function login(page: Page): Promise<void> {
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
}

test('chụp màn hình Kho (máy tính)', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto('/kho/quet-ma');
  await page.getByLabel('Mã vạch hoặc mã vật tư').fill('THEP-HINH-H200');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Thép hình H200x200').first()).toBeVisible();
  await shot(page, '01-quet-ma');

  await page.goto('/kho/ton-kho');
  await shot(page, '02-ton-kho');

  await page.goto('/kho/phieu');
  await shot(page, '03-phieu-kho');
  await page.getByRole('button', { name: 'Lập phiếu' }).click();
  await shot(page, '04-lap-phieu-nhap');
  await page.getByLabel('Loại phiếu').selectOption({ label: 'Xuất kho' });
  await shot(page, '05-lap-phieu-xuat');

  // Đơn thép: đợt giao đã nhập kho → hiện mã phiếu nhập, không còn nút.
  await page.goto('/mh/don-hang');
  await page
    .getByRole('link', { name: /Thép hình H200/ })
    .first()
    .click();
  await page.waitForURL(/mh\/don-hang\/[0-9a-f-]{36}/);
  await shot(page, '06-nhap-tu-giao-nhan');

  await page.goto('/kho/kiem-ke');
  await shot(page, '07-kiem-ke');

  await page.goto('/kho/vat-tu');
  await shot(page, '08-danh-muc-vat-tu');

  // Giàn giáo là của Nhà Việt Steel.
  await page.getByRole('button', { name: 'Chọn pháp nhân' }).click();
  await page.getByRole('menuitem', { name: /Nhà Việt Steel/ }).click();
  await page.goto('/kho/gian-giao');
  await shot(page, '09-gian-giao');
  await page.getByRole('button', { name: 'Lập biên bản' }).nth(2).click();
  await page.screenshot({ path: `${OUT}/10-bien-ban-gian-giao.png` });
});

test.describe('điện thoại', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  test('chụp màn hình Kho (điện thoại)', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);
    await page.goto('/kho/quet-ma');
    await page.getByLabel('Mã vạch hoặc mã vật tư').fill('THEP-HINH-H200');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Thép hình H200x200').first()).toBeVisible();
    await shot(page, '11-quet-ma-dien-thoai');
  });
});
