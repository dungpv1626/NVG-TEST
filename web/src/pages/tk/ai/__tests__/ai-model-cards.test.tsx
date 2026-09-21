/**
 * Ô chọn model dạng thẻ (T60) — bốn lời hứa của nó, canh riêng vì mỗi lời hứa hỏng một kiểu.
 *
 * Ô này đứng ngay trên nút tiêu tiền, nên nó không chỉ là trang trí:
 *  · thu gọn mà vẫn đọc được TÊN MODEL THẬT — nhật ký `design_ai_call` ghi theo tên ấy;
 *  · giá niêm yết hiện trên từng thẻ, trước khi bấm;
 *  · tuyến chưa dùng được vẫn liệt kê, mờ kèm lý do, và KHÔNG bấm được (AFD 6.5);
 *  · chọn xong thì gửi TÊN TUYẾN, không gửi tên model.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AiModelOption } from '@/hooks/use-ai-design';
import { ModelChooser } from '../ai-model-cards';

const option = (over: Partial<AiModelOption>): AiModelOption => ({
  route: 'ai_text_openai',
  provider: 'openai',
  providerLabel: 'OpenAI',
  short: 'GPT-5',
  tag: 'Chất lượng cao',
  blurb: 'Bậc cao nhất của OpenAI.',
  label: 'GPT-5 (OpenAI) — chất lượng cao',
  model: 'gpt-5',
  maxDataClass: 2,
  enabled: true,
  unavailableReason: null,
  imageUsd: null,
  inputPer1mUsd: 1.25,
  outputPer1mUsd: 10,
  ...over,
});

const OPENAI = option({});
const OPENAI_FAST = option({
  route: 'ai_text_openai_fast',
  short: 'GPT-5 mini',
  tag: 'Nhanh, rẻ hơn',
  blurb: 'Bậc tiết kiệm của OpenAI.',
  model: 'gpt-5-mini',
  inputPer1mUsd: 0.25,
  outputPer1mUsd: 2,
});
const CLAUDE = option({
  route: 'ai_text_anthropic',
  provider: 'anthropic',
  providerLabel: 'Anthropic',
  short: 'Claude Opus 5',
  model: 'claude-opus-5',
  blurb: 'Bậc cao nhất của Anthropic.',
});
const GOOGLE_OFF = option({
  route: 'ai_text_gemini',
  provider: 'gemini_paid',
  providerLabel: 'Google',
  short: 'Gemini 3.1 Pro',
  model: 'gemini-3.1-pro-preview',
  enabled: false,
  unavailableReason: 'Chưa cấu hình khoá API của nhà cung cấp này.',
});

function show(options: AiModelOption[], value: string | null, onChange = vi.fn()) {
  render(<ModelChooser kind="text" options={options} value={value} onChange={onChange} />);
  return onChange;
}

describe('Ô chọn model dạng thẻ', () => {
  it('thu gọn sẵn, nhưng tên model THẬT và nhà cung cấp vẫn đọc được', () => {
    show([OPENAI, OPENAI_FAST], 'ai_text_openai');
    expect(screen.getByText(/OpenAI · gpt-5$/)).toBeInTheDocument();
    // Danh sách chưa mở: không thẻ nào trong DOM.
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('mở ra: thẻ của nhà cung cấp đang chọn, có số lượng, giá và câu mô tả', async () => {
    show([OPENAI, OPENAI_FAST, CLAUDE], 'ai_text_openai');
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));

    // Chỉ model của OpenAI — Claude nằm ở thẻ nhà cung cấp khác.
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Các model của OpenAI:')).toBeInTheDocument();
    expect(screen.getByText('2 model')).toBeInTheDocument();
    expect(screen.getByText('Bậc cao nhất của OpenAI.')).toBeInTheDocument();
    // Giá nằm trên chính thẻ, không chỉ ở dòng ghi chú dưới ô — đọc thẻ nào biết giá thẻ ấy.
    expect(screen.getByRole('radio', { name: /gpt-5 ·/ })).toHaveTextContent(
      '1,25 USD vào · 10 USD ra, mỗi triệu token',
    );
    expect(screen.getByRole('radio', { name: /GPT-5 mini/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('đổi nhà cung cấp thì đổi danh sách model', async () => {
    show([OPENAI, OPENAI_FAST, CLAUDE], 'ai_text_openai');
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Anthropic/ }));
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText(/claude-opus-5/)).toBeInTheDocument();
  });

  it('chọn một thẻ thì gửi TÊN TUYẾN và thu danh sách lại', async () => {
    const onChange = show([OPENAI, OPENAI_FAST], 'ai_text_openai');
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));
    await userEvent.click(screen.getByRole('radio', { name: /GPT-5 mini/ }));
    expect(onChange).toHaveBeenCalledWith('ai_text_openai_fast');
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('tuyến chưa dùng được: vẫn liệt kê, nói lý do, và bấm không ăn gì', async () => {
    const onChange = show([OPENAI, GOOGLE_OFF], 'ai_text_openai');
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));
    await userEvent.click(screen.getByRole('tab', { name: /Google/ }));

    const card = screen.getByRole('radio', { name: /Gemini 3.1 Pro/ });
    expect(card).toBeDisabled();
    expect(screen.getByText(/Chưa cấu hình khoá API/)).toBeInTheDocument();
    await userEvent.click(card);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nhà cung cấp không còn tuyến nào bấm được thì nói bằng CHỮ, không chỉ bằng màu', async () => {
    show([OPENAI, GOOGLE_OFF], 'ai_text_openai');
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));
    expect(screen.getByRole('tab', { name: /Google \(chưa dùng được\)/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^OpenAI$/ })).toBeInTheDocument();
  });

  it('gói miễn phí nói rõ không phát sinh tiền; chưa khai giá thì nói chưa có', async () => {
    show(
      [
        option({ route: 'r1', short: 'Miễn phí', billed: false, model: 'm1' }),
        option({
          route: 'r2',
          short: 'Chưa khai giá',
          model: 'm2',
          inputPer1mUsd: null,
          outputPer1mUsd: null,
        }),
      ],
      'r1',
    );
    await userEvent.click(screen.getByRole('button', { name: /Đổi model/ }));
    expect(screen.getByText(/m1 · Gói miễn phí — không phát sinh tiền/)).toBeInTheDocument();
    expect(screen.getByText(/m2 · Chưa có giá niêm yết trong cấu hình/)).toBeInTheDocument();
  });
});
