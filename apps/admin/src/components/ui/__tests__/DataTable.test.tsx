import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type Column } from '../DataTable';

interface Item {
  id: number;
  name: string;
}

const columns: Column<Item>[] = [
  { key: 'id', header: 'ID', render: (r) => r.id },
  { key: 'name', header: 'Name', render: (r) => r.name },
];

const data: Item[] = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

describe('DataTable', () => {
  it('renders column headers and data rows', () => {
    render(<DataTable columns={columns} data={data} keyField="id" />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable columns={columns} data={[]} keyField="id" emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    const { container } = render(<DataTable columns={columns} data={[]} keyField="id" loading />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('calls onRowClick', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={data} keyField="id" onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('pagination renders page buttons', () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        keyField="id"
        pagination={{ page: 1, totalPages: 3 }}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
