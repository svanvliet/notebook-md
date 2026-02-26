import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react';
import { Fragment, type ReactNode } from 'react';

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}

export function SlidePanel({ open, onClose, title, children, wide }: SlidePanelProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-40">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/20" />
        </TransitionChild>
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full">
              <TransitionChild
                as={Fragment}
                enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full"
              >
                <DialogPanel className={`pointer-events-auto ${wide ? 'w-[50vw] min-w-[600px]' : 'w-[400px]'} bg-white shadow-xl flex flex-col h-full`}>
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <DialogTitle className="text-lg font-semibold text-gray-900">{title}</DialogTitle>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-4">
                    {children}
                  </div>
                </DialogPanel>
              </TransitionChild>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
