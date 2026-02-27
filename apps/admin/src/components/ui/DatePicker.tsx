import { useState } from 'react';
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Select date' }: DatePickerProps) {
  return (
    <Popover className="relative">
      <PopoverButton className="w-full text-left px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {value ? format(value, 'MMM d, yyyy') : <span className="text-gray-400">{placeholder}</span>}
      </PopoverButton>
      <Transition
        enter="transition ease-out duration-100" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
        leave="transition ease-in duration-75" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
      >
        <PopoverPanel className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
          {({ close }) => (
            <DayPicker
              mode="single"
              selected={value}
              onSelect={(date) => { onChange(date); close(); }}
            />
          )}
        </PopoverPanel>
      </Transition>
    </Popover>
  );
}
