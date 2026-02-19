import { useEffect, useRef, useCallback } from 'react';

/**
 * Integrates a modal with browser history so the back button closes it.
 * When the modal opens, a history entry is pushed.
 * When the user presses back, the modal closes via onClose.
 * When the user closes via UI (X button), history.back() is called.
 *
 * @returns closeModal — call this from UI close buttons instead of onClose directly
 */
export function useModalHistory(isOpen: boolean, onClose: () => void) {
  const historyPushed = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Push history entry when modal opens
  useEffect(() => {
    if (isOpen && !historyPushed.current) {
      historyPushed.current = true;
      window.history.pushState({ modal: true }, '');
    }
  }, [isOpen]);

  // Listen for popstate (back button) to close modal
  useEffect(() => {
    if (!isOpen) {
      historyPushed.current = false;
      return;
    }

    const handlePopState = () => {
      historyPushed.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isOpen]);

  // Close via UI — triggers history.back() which fires popstate → onClose
  const closeModal = useCallback(() => {
    if (historyPushed.current) {
      historyPushed.current = false;
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);

  return closeModal;
}
