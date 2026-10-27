import { useState } from 'react';
import Modal from './Modal.jsx';
import ErrorBanner from './ErrorBanner.jsx';

// `onSubmit` may throw; the error is shown inline and the modal stays open. On success it closes.
export default function ModalForm({ title, onClose, onSubmit, submitLabel = 'Save', footerLeft, children }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorBanner error={error} />
        {children}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div>{footerLeft}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-onaccent hover:bg-accent-hover disabled:opacity-60"
            >
              {busy ? 'Saving…' : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
