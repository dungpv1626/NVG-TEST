import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productionEnvProblems, REQUIRED_BUILD_ENV } from '../build-env';

/**
 * Canh hàng rào biến môi trường của bản phát hành (`build-env.ts`). Lỗi thật 23/09/2026: bản public
 * đóng gói `VITE_DESIGN_API_URL=http://localhost:8788`, tab «AI Design» hỏng trên mọi máy trừ máy
 * phát triển, build và deploy đều xanh.
 */

const root = (path: string) => resolve(process.cwd(), path);

const GOOD = {
  VITE_SUPABASE_URL: 'https://abc.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable_x',
  VITE_DESIGN_API_URL: 'https://nvg-api.tests99.workers.dev',
};

describe('productionEnvProblems', () => {
  it('bộ biến đúng thì dựng được', () => {
    expect(productionEnvProblems(GOOD)).toEqual([]);
  });

  it.each([
    'http://localhost:8788',
    // https không cứu được: tên máy vẫn chỉ có nghĩa trên máy đang build.
    'https://localhost:8788',
    'http://127.0.0.1:8788',
    'http://0.0.0.0:8788',
    'http://[::1]:8788',
    'http://192.168.1.5:8788',
    'http://nvg.local',
  ])('địa chỉ trỏ về máy đang build bị chặn: %s', (url) => {
    const problems = productionEnvProblems({ ...GOOD, VITE_DESIGN_API_URL: url });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('VITE_DESIGN_API_URL');
    expect(problems[0]).toContain('trỏ về máy');
  });

  it('địa chỉ Supabase trỏ về máy cũng bị chặn', () => {
    expect(
      productionEnvProblems({ ...GOOD, VITE_SUPABASE_URL: 'http://localhost:54321' }),
    ).toHaveLength(1);
  });

  it.each(REQUIRED_BUILD_ENV)('%s rỗng hoặc thiếu thì bị chặn', (name) => {
    expect(productionEnvProblems({ ...GOOD, [name]: '' })).toHaveLength(1);
    expect(productionEnvProblems({ ...GOOD, [name]: undefined })).toHaveLength(1);
  });

  it('http công khai bị chặn, chuỗi không phải URL bị chặn', () => {
    expect(
      productionEnvProblems({ ...GOOD, VITE_DESIGN_API_URL: 'http://api.example.com' }),
    ).toHaveLength(1);
    expect(productionEnvProblems({ ...GOOD, VITE_DESIGN_API_URL: 'nvg-api' })).toHaveLength(1);
  });
});

describe('cấu hình trong kho', () => {
  it('.env.production khai địa chỉ API công khai', () => {
    const text = readFileSync(root('.env.production'), 'utf8');
    const url = /^VITE_DESIGN_API_URL=(.*)$/m.exec(text)?.[1]?.trim();
    expect(url).toBeTruthy();
    expect(productionEnvProblems({ ...GOOD, VITE_DESIGN_API_URL: url })).toEqual([]);
  });

  // Thêm biến `VITE_*` vào `define` mà quên khai ở đây thì biến mới rỗng vẫn lọt qua hàng rào.
  it('mọi biến trong define của vite.config.ts đều được kiểm', () => {
    const config = readFileSync(root('web/vite.config.ts'), 'utf8');
    const defined = [...config.matchAll(/'import\.meta\.env\.(VITE_[A-Z_]+)'/g)].map((m) => m[1]);
    expect(defined.length).toBeGreaterThan(0);
    expect([...defined].sort()).toEqual([...REQUIRED_BUILD_ENV].sort());
  });
});
