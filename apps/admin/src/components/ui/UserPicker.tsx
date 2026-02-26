import { useState, useEffect, useRef } from 'react';
import { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import { LoadingSpinner } from './LoadingSpinner';

interface UserOption {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

interface UserPickerProps {
  onSelect: (user: UserOption) => void;
  searchUsers: (q: string) => Promise<UserOption[]>;
  placeholder?: string;
  excludeIds?: string[];
}

export function UserPicker({ onSelect, searchUsers, placeholder = 'Search users...', excludeIds = [] }: UserPickerProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      setLoading(true);
      searchUsers(query)
        .then((results) => setOptions(results.filter((u) => !excludeIds.includes(u.id))))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, searchUsers, excludeIds]);

  return (
    <Combobox
      onChange={(user: UserOption | null) => {
        if (user) {
          onSelect(user);
          setQuery('');
          setOptions([]);
        }
      }}
    >
      <div className="relative">
        <ComboboxInput
          className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={placeholder}
          displayValue={() => query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <LoadingSpinner size="sm" />
          </div>
        )}
        {options.length > 0 && (
          <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 text-sm">
            {options.map((user) => (
              <ComboboxOption
                key={user.id}
                value={user}
                className="cursor-pointer select-none px-3 py-2 data-[focus]:bg-blue-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{user.displayName}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </div>
    </Combobox>
  );
}

export type { UserOption, UserPickerProps };
