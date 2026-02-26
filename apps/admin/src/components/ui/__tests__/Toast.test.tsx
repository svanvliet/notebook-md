import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '../Toast';

function TestConsumer({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const { addToast } = useToast();
  return <button onClick={() => addToast(message, type)}>Add Toast</button>;
}

describe('Toast', () => {
  it('useToast adds a toast that appears in the DOM', () => {
    render(
      <ToastProvider>
        <TestConsumer message="Saved!" type="success" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('Add Toast').click();
    });
    expect(screen.getByText(/Saved!/)).toBeInTheDocument();
  });

  it('multiple toasts stack', () => {
    render(
      <ToastProvider>
        <TestConsumer message="First" />
      </ToastProvider>,
    );
    act(() => {
      screen.getByText('Add Toast').click();
      screen.getByText('Add Toast').click();
    });
    // Both instances should appear (they have the same text but different ids)
    expect(screen.getAllByText(/First/)).toHaveLength(2);
  });

  it('throws when useToast is used outside provider', () => {
    expect(() => render(<TestConsumer message="fail" />)).toThrow(
      'useToast must be used within ToastProvider',
    );
  });
});
