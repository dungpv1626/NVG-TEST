/**
 * T84 (26/09/2026) — stub RPC từ binding Workflow phải được huỷ. Ba lần `wrangler dev` sập ngày
 * 25/09/2026 có backtrace: finalizer của stub không huỷ ghi cảnh báo trong lúc V8 dọn rác, inspector
 * lấy stack trace → cấp phát trong GC → workerd tự huỷ. Xem `workflows/rpc-stub.ts`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { disposeStub, disposingStep, instanceIdOf } from '../workflows/rpc-stub';

const DISPOSE = (Symbol as unknown as { dispose?: symbol }).dispose;

describe('disposeStub / instanceIdOf', () => {
  it('runtime này có Symbol.dispose — điều kiện để huỷ được stub thật', () => {
    expect(typeof DISPOSE).toBe('symbol');
  });

  it('gọi [Symbol.dispose] của stub đúng một lần, với `this` là stub', () => {
    const calls: unknown[] = [];
    const stub = {
      id: 'wf_1',
      [DISPOSE!]() {
        calls.push(this);
      },
    };
    expect(instanceIdOf(stub)).toBe('wf_1');
    expect(calls).toEqual([stub]);
    disposeStub(stub);
    expect(calls).toHaveLength(2);
  });

  it('không có gì để huỷ (bản giả trong test, null, số) thì bỏ qua, không ném', () => {
    expect(() => disposeStub({ id: 'x' })).not.toThrow();
    expect(() => disposeStub(null)).not.toThrow();
    expect(() => disposeStub(42)).not.toThrow();
    expect(instanceIdOf({ id: 'plain' })).toBe('plain');
  });

  it('dispose ném (stub đã huỷ) thì nuốt — mã gọi không cần biết', () => {
    const stub = {
      id: 'wf_2',
      [DISPOSE!]() {
        throw new Error('already disposed');
      },
    };
    expect(() => disposeStub(stub)).not.toThrow();
  });
});

describe('disposingStep — kết quả `step.do` là kết quả RPC (T85)', () => {
  it('huỷ kết quả của `do` rồi trả nguyên dữ liệu; phương thức khác đi thẳng', async () => {
    const disposed: unknown[] = [];
    const result = {
      arranged: 1,
      [DISPOSE!]() {
        disposed.push(this);
      },
    };
    const calls: string[] = [];
    const raw = {
      async do(name: string, callback: () => Promise<unknown>) {
        calls.push(name);
        await callback();
        return result;
      },
      async sleep(name: string) {
        calls.push(`sleep:${name}`);
      },
    };
    const step = disposingStep(raw);
    const got = await step.do('xep', async () => 'x');
    expect(got).toBe(result);
    expect(disposed).toEqual([result]);
    await step.sleep('cho');
    expect(calls).toEqual(['xep', 'sleep:cho']);
    // Kết quả không phải đối tượng (chuỗi, undefined): không có gì để huỷ.
    const plain = disposingStep({ do: async () => undefined });
    await expect(plain.do()).resolves.toBeUndefined();
  });
});

describe('mọi chỗ nhận stub Workflow đều huỷ nó', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__') walk(path);
      } else if (name.endsWith('.ts')) files.push(path);
    }
  };
  walk(root);

  it('`PIPELINE.create(` luôn nằm trong `instanceIdOf(` — không giữ stub để đọc `.id` rồi bỏ rơi', () => {
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/[A-Z_]+_PIPELINE\.create\(/g)) {
        const lineStart = text.lastIndexOf('\n', match.index!) + 1;
        // Bỏ qua dòng chú thích (tệp `rpc-stub.ts` tự kể lại root cause).
        if (/^\s*(\*|\/\/)/.test(text.slice(lineStart, match.index))) continue;
        const before = text.slice(Math.max(0, match.index! - 40), match.index);
        if (!/instanceIdOf\(\s*await\s+c\.env\.$/.test(before)) {
          bad.push(`${file.slice(root.length + 1)}: ${before.trim().slice(-30)}…${match[0]}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(files.some((file) => /PIPELINE\.create\(/.test(readFileSync(file, 'utf8')))).toBe(true);
  });

  it('mọi `run()` của Workflow bọc `step` bằng `disposingStep` ngay dòng đầu', () => {
    const runs = files.filter((file) =>
      /extends WorkflowEntrypoint</.test(readFileSync(file, 'utf8')),
    );
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (const file of runs) {
      const text = readFileSync(file, 'utf8');
      expect(text).toMatch(
        /override async run\([^)]*rpcStep: WorkflowStep\) \{\n(\s*\/\/.*\n)*\s*const step = disposingStep\(rpcStep\);/,
      );
    }
  });

  it('`workflow.get(` trong tuyến trạng thái huỷ stub ở `finally`', () => {
    const routes = readFileSync(join(root, 'ai', 'routes.ts'), 'utf8');
    const start = routes.indexOf('async function workflowDead(');
    const body = routes.slice(start, routes.indexOf('\n}\n', start));
    expect(body).toContain('instance = await workflow.get(instanceId)');
    expect(body).toMatch(/finally \{[\s\S]*disposeStub\(state\);\s*disposeStub\(instance\);/);
  });
});
