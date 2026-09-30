/**
 * Chụp ảnh màn hình cho hướng dẫn sử dụng của Kế toán (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Xác nhận — chỉ mở
 * màn hình và biểu mẫu.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-ke-toan.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/kt';
const EMAIL = 'ketoan@nhavietgroup.test';

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

async function openPayment(page: Page, title: RegExp): Promise<string> {
  await page.goto('/kt/de-nghi-thanh-toan');
  await page.getByRole('link', { name: title }).first().click();
  await page.waitForURL(/kt\/de-nghi-thanh-toan\/[0-9a-f-]{36}/);
  return page.url().split('?')[0]!;
}

test('chụp màn hình Kế toán', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '01-dashboard');

  await page.goto('/kt/de-nghi-thanh-toan');
  await shot(page, '02-danh-sach-de-nghi-chi');

  // Đợt 2 tổ đội: đang ở bước Kiểm tra dòng tiền — dải bước nói ai đang giữ.
  const second = await openPayment(page, /đợt 2/);
  await shot(page, '03-dai-buoc');
  await page.goto(`${second}?tab=phan-bo`);
  await shot(page, '04-phan-bo');

  // Đợt 1: đã chi, chờ đánh dấu hạch toán.
  const first = await openPayment(page, /đợt 1/);
  await page.goto(`${first}?tab=tong-quan`);
  await shot(page, '05-da-chi');

  // Đơn thép đã giao đủ → tab Chứng từ → Lập đề nghị thanh toán (không lưu).
  await page.goto('/mh/don-hang');
  await page
    .getByRole('link', { name: /Thép hình H200/ })
    .first()
    .click();
  await page.waitForURL(/mh\/don-hang\/[0-9a-f-]{36}/);
  await page.goto(`${page.url().split('?')[0]}?tab=chung-tu`);
  await shot(page, '06-chung-tu-don-hang');
  await page.getByRole('link', { name: 'Lập đề nghị thanh toán' }).click();
  await page.waitForURL(/tao-moi\?don-hang=/);
  await expect(page.getByRole('heading', { name: 'Lập đề nghị chi' })).toBeVisible();
  await shot(page, '07-de-nghi-tu-don-hang');

  await page.goto('/kt/de-nghi-thanh-toan/tao-moi');
  await shot(page, '08-lap-de-nghi-chi');

  await page.goto('/kt/tam-ung');
  await shot(page, '09-tam-ung');

  await page.goto('/kt/cong-no');
  await shot(page, '10-cong-no');
  await page.getByRole('button', { name: 'Ghi nhận thu' }).first().click();
  await page.screenshot({ path: `${OUT}/11-ghi-nhan-thu.png` });

  await page.goto('/kt/dong-tien');
  await shot(page, '12-dong-tien');

  await page.goto('/kt/ky-ke-toan');
  await shot(page, '13-ky-ke-toan');

  await page.goto('/bc/tong-quan');
  await shot(page, '14-tong-quan-tai-chinh');
});
