import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Users" />);
    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
  });

  it('renders optional description', () => {
    render(<PageHeader title="Users" description="Manage all users" />);
    expect(screen.getByText('Manage all users')).toBeInTheDocument();
  });

  it('renders optional actions', () => {
    render(<PageHeader title="Users" actions={<button>Add</button>} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<PageHeader title="Users" />);
    expect(container.querySelector('p')).toBeNull();
  });
});
