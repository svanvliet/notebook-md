import { render, screen, fireEvent } from '@testing-library/react';
import { SlidePanel } from '../SlidePanel';

describe('SlidePanel', () => {
  it('renders title and children when open', () => {
    render(
      <SlidePanel open onClose={vi.fn()} title="Details">
        <p>Panel content</p>
      </SlidePanel>,
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <SlidePanel open onClose={onClose} title="Details">
        <p>Content</p>
      </SlidePanel>,
    );
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render content when closed', () => {
    render(
      <SlidePanel open={false} onClose={vi.fn()} title="Details">
        <p>Hidden</p>
      </SlidePanel>,
    );
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
