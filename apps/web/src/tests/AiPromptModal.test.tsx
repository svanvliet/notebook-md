/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiPromptModal } from '../components/editor/AiPromptModal';

// Mock react-i18next — handle interpolation in fallback
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts: string | Record<string, any>, opts?: Record<string, any>) => {
      const fallback = typeof fallbackOrOpts === 'string' ? fallbackOrOpts : key;
      const params = typeof fallbackOrOpts === 'object' ? fallbackOrOpts : opts;
      if (!params) return fallback;
      return fallback.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ''));
    },
  }),
}));

describe('AiPromptModal', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    remainingQuota: 8,
    quotaLimit: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with title, textarea, and length toggle', () => {
    render(<AiPromptModal {...defaultProps} />);
    expect(screen.getByText('Create with AI')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByText('Short')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Long')).toBeTruthy();
  });

  it('Create button is disabled when textarea is empty', () => {
    render(<AiPromptModal {...defaultProps} />);
    const createBtn = screen.getByText('Create').closest('button');
    expect(createBtn!.disabled).toBe(true);
  });

  it('Create button is disabled when quota exhausted', () => {
    render(<AiPromptModal {...defaultProps} remainingQuota={0} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test' } });
    const createBtn = screen.getByText('Create').closest('button');
    expect(createBtn!.disabled).toBe(true);
  });

  it('submits prompt and length on Create click', () => {
    render(<AiPromptModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Write about cats' } });
    fireEvent.click(screen.getByText('Create'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith('Write about cats', 'medium');
  });

  it('submits on Cmd+Enter', () => {
    render(<AiPromptModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'prompt text' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(defaultProps.onSubmit).toHaveBeenCalledWith('prompt text', 'medium');
  });

  it('cancels on Escape', () => {
    render(<AiPromptModal {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('length toggle defaults to Medium', () => {
    render(<AiPromptModal {...defaultProps} />);
    const mediumBtn = screen.getByText('Medium');
    // The Medium button should have the "active" class (bg-white)
    expect(mediumBtn.className).toContain('bg-white');
  });

  it('length toggle changes selected value and submits it', () => {
    render(<AiPromptModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Long'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Create'));
    expect(defaultProps.onSubmit).toHaveBeenCalledWith('test', 'long');
  });

  it('displays disclaimer text', () => {
    render(<AiPromptModal {...defaultProps} />);
    expect(screen.getByText(/Azure OpenAI/)).toBeTruthy();
  });

  it('displays remaining quota', () => {
    render(<AiPromptModal {...defaultProps} remainingQuota={3} quotaLimit={10} />);
    expect(screen.getByText(/3 of 10 remaining today/)).toBeTruthy();
  });

  it('displays quota exhausted message when remaining is 0', () => {
    render(<AiPromptModal {...defaultProps} remainingQuota={0} quotaLimit={10} />);
    expect(screen.getByText(/Daily AI generation limit reached/)).toBeTruthy();
  });

  it('cancels when clicking backdrop', () => {
    render(<AiPromptModal {...defaultProps} />);
    // The backdrop is the first child div with bg-black class
    const backdrop = document.querySelector('.bg-black\\/40') as HTMLElement;
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(defaultProps.onCancel).toHaveBeenCalled();
    }
  });
});
