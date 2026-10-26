import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ModalForm from '../ModalForm.jsx';
import ErrorBanner from '../ErrorBanner.jsx';
import { Field } from '../AuthForm.jsx';
import { formatDate, formatPaise, formatPeriod } from '../../lib/format.js';
import { generateCharges, invalidateRent } from '../../services/rent.js';

const SKIP_REASON = {
  already_exists: 'Already billed',
  resident_already_billed: 'Already billed (earlier bed)',
  reservation: 'Reservation, not yet in residence',
  before_check_in: 'Checks in after this month',
};

export default function GenerateChargesModal({ propertyId, defaultPeriod, onClose }) {
  const queryClient = useQueryClient();
  const [periodKey, setPeriodKey] = useState(defaultPeriod);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  // The preview is always the server's dry run, never a client-side guess.
  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) return undefined;
    let current = true;
    generateCharges({ propertyId, periodKey, dryRun: true })
      .then((res) => current && setPreview(res))
      .catch((err) => current && setError(err));
    return () => {
      current = false;
    };
  }, [propertyId, periodKey]);

  const onSubmit = async () => {
    await generateCharges({ propertyId, periodKey });
    await invalidateRent(queryClient);
  };

  return (
    <ModalForm title="Generate rent charges" onClose={onClose} onSubmit={onSubmit} submitLabel={preview?.created ? `Create ${preview.created} charge(s)` : 'Generate'}>
      <Field label="Month" type="month" required value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
      <ErrorBanner error={error} />
      {preview && (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            {preview.created} to create, {preview.skipped} already billed or skipped for {formatPeriod(periodKey)}.
          </p>
          {preview.items.length > 0 && (
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-sm">
              {preview.items.map((i) => (
                <li key={i.stayId} className="flex justify-between gap-3 px-3 py-1.5">
                  <span>{i.residentName}</span>
                  {i.action === 'create' ? (
                    <span className="text-slate-700">
                      {formatPaise(i.amountPaise)} · due {formatDate(i.dueDate)}
                    </span>
                  ) : (
                    <span className="text-slate-400">{SKIP_REASON[i.reason] ?? 'Skipped'}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">Running this again for the same month never creates duplicates. Deposits are not billed as rent.</p>
        </div>
      )}
    </ModalForm>
  );
}
