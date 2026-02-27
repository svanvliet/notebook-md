import { render, screen, fireEvent } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies variant classes', () => {
    render(<Badge variant="success">OK</Badge>);
    expect(screen.getByText('OK').closest('span')).toHaveClass('bg-green-100');
  });

  it('shows dot when dot=true', () => {
    const { container } = render(<Badge dot variant="error">Err</Badge>);
    const dot = container.querySelector('.rounded-full.bg-red-500');
    expect(dot).toBeInTheDocument();
  });

  it('calls onClick and has button role', () => {
    const onClick = vi.fn();
    render(<Badge onClick={onClick}>Click</Badge>);
    const badge = screen.getByRole('button');
    fireEvent.click(badge);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
