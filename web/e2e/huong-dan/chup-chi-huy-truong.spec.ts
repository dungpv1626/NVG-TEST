/**
 * Chụp ảnh màn hình cho hướng dẫn sử dụng của Chỉ huy trưởng (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm lưu / gửi — chỉ mở màn hình.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-chi-huy-truong.spec.ts
 *
 * Chạy trên Supabase tại máy đã nạp dữ liệu demo (`npm run db:demo-data`) — cùng dữ liệu với bản
 * công khai, nên ảnh khớp những gì người dùng thấy.
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/cht';
const EMAIL = 'chihuytruong.nvc@nhavietgroup.test';
const SITE_NAME = 'Nhà xưởng Hưng Thịnh — KCN Phố Nối A';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

async function shot(page: Page, name: string, { keepHelp = false } = {}): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Chờ skeleton biến mất để ảnh không chụp giữa lúc tải.
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  // Bảng «Hướng dẫn» tự mở lần đầu vào mỗi màn hình; chỉ giữ ở ảnh nói về chính nó.
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (!keepHelp && (await gotIt.isVisible())) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('chụp màn hình Chỉ huy trưởng', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/dang-nhap');
  await page.screenshot({ path: `${OUT}/01-dang-nhap.png` });
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await shot(page, '02-trang-chu');

  await page.goto('/tc/cong-trinh');
  await shot(page, '03-danh-sach-cong-trinh');
  await page.getByText(SITE_NAME).first().click();
  await expect(page).toHaveURL(/tc\/cong-trinh\/[0-9a-f-]{36}/);
  const siteUrl = page.url().split('?')[0]!;
  const siteId = siteUrl.split('/').pop()!;

  await page.goto(`${siteUrl}?tab=nhat-ky`);
  await shot(page, '04-nhat-ky');

  await page.goto(`/mh/de-nghi-mua/tao-moi?cong-trinh=${siteId}`);
  await shot(page, '06-de-nghi-vat-tu');

  await page.goto(`${siteUrl}?tab=de-nghi`);
  await shot(page, '07-de-nghi-cua-cong-trinh');

  await page.goto('/tc/de-nghi');
  await shot(page, '08-theo-doi-de-nghi-huong-dan', { keepHelp: true });
  await page.getByRole('button', { name: 'Đã hiểu' }).click();
  await shot(page, '08-theo-doi-de-nghi');

  await page.goto(`${siteUrl}?tab=nghiem-thu`);
  await shot(page, '09-nghiem-thu');
  await page.getByRole('button', { name: 'Lập biên bản nghiệm thu' }).click();
  await shot(page, '10-lap-bien-ban');
  const checklist = page.getByLabel('Danh mục kiểm tra');
  const firstList = await checklist.locator('option').nth(1).getAttribute('value');
  await checklist.selectOption(firstList!);
  await page
    .getByText('Cần ảnh')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, '11-cham-danh-muc');

  await page.goto('/tc/de-nghi');
  await page.getByText('NVC-DNM-2026-0002').first().click();
  await expect(page).toHaveURL(/mh\/de-nghi-mua\/[0-9a-f-]{36}/);
  await shot(page, '12-chi-tiet-de-nghi');
});
