/**
 * Chụp ảnh màn hình cho hướng dẫn Trưởng phòng Thi công (`doc/demo/huong-dan/`).
 *
 * Không phải bài kiểm: chỉ chạy khi gọi tường minh, và KHÔNG bấm Lưu / Gửi / Xác nhận — chỉ mở
 * màn hình và biểu mẫu. Cần dữ liệu kịch bản `nvc` và `ns`.
 *
 *   HUONG_DAN_CHUP=1 E2E_BASE_URL=http://localhost:5174 \
 *     npx playwright test web/e2e/huong-dan/chup-truong-phong-thi-cong.spec.ts
 */

import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD } from '../../../db/src/seed/data';

const OUT = 'doc/demo/huong-dan/anh/tc';
const EMAIL = 'congtruong.nvc@nhavietgroup.test';

test.skip(!process.env.HUONG_DAN_CHUP, 'Chỉ chạy khi chụp ảnh hướng dẫn (HUONG_DAN_CHUP=1).');
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForLoadState('networkidle');
  // Trang tải phần mã theo lượt (lazy): networkidle tới trước khi trang kịp vẽ tiêu đề.
  await expect(page.locator('main h1').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-skeleton], .animate-pulse')).toHaveCount(0, { timeout: 15_000 });
  const gotIt = page.getByRole('button', { name: 'Đã hiểu' });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('chụp màn hình Trưởng phòng Thi công', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/dang-nhap');
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
  await expect(page.getByRole('heading', { name: /Chào Trưởng phòng/ })).toBeVisible();
  await shot(page, '01-dashboard');

  await page.goto('/tc/cong-trinh');
  await expect(page.getByRole('heading', { name: 'Công trình' })).toBeVisible();
  await shot(page, '02-cong-trinh');
  await page
    .getByRole('link', { name: /Hưng Thịnh/ })
    .first()
    .click();
  await page.waitForURL(/tc\/cong-trinh\/[0-9a-f-]{36}/);
  const base = page.url().split('?')[0]!;
  const tab = async (id: string, name: string) => {
    await page.goto(`${base}?tab=${id}`);
    await expect(page.getByRole('heading', { name: /Hưng Thịnh/ })).toBeVisible();
    await shot(page, name);
  };
  await tab('tong-quan', '03-tong-quan');
  await tab('ngan-sach', '04-ngan-sach');
  await tab('de-nghi', '05-de-nghi');
  await tab('nhat-ky', '06-nhat-ky');
  await tab('nghiem-thu', '07-nghiem-thu');
  await tab('to-doi', '08-to-doi');

  await page.goto('/tc/de-nghi');
  await expect(page.getByRole('heading', { name: 'Theo dõi đề nghị' })).toBeVisible();
  await shot(page, '09-theo-doi-de-nghi');

  await page.goto('/nen/phan-cong');
  await expect(page.getByRole('heading', { name: 'Phân công công trường' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm phân công' }).click();
  // Danh sách người phải tải được với vai trò này (RLS) — không thì ô chọn chỉ có dòng trống.
  await expect
    .poll(async () =>
      page
        .getByLabel(/Người được phân công/)
        .locator('option')
        .count(),
    )
    .toBeGreaterThan(2);
  await shot(page, '10-phan-cong');

  await page.goto('/ns/cham-cong');
  await expect(page.getByRole('heading', { name: 'Chấm công khối công trường' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem bảng công' }).click();
  await expect(page.getByRole('heading', { name: /Bảng công khối Công trường/ })).toBeVisible();
  await shot(page, '11-cham-cong');
});
