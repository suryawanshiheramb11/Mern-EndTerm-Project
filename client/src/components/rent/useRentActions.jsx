import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import ChargeActionModal from './ChargeActionModal.jsx';
import ReceiptModal from './ReceiptModal.jsx';
import ReversePaymentModal from './ReversePaymentModal.jsx';
import { invalidateRent, verifyPayment } from '../../services/rent.js';

// Shared by the Rent page and the resident page so the row actions behave identically.
export default function useRentActions() {
  const queryClient = useQueryClient();
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);

  const onAction = async (next) => {
    setError(null);
    if (next.type === 'verify') {
      try {
        await verifyPayment(next.payment.id);
        await invalidateRent(queryClient);
      } catch (err) {
        setError(err);
      }
      return;
    }
    setAction(next);
  };

  const close = () => setAction(null);
  const modal = (
    <>
      {action?.type === 'receipt' && <ReceiptModal paymentId={action.payment.id} onClose={close} />}
      {action?.type === 'reverse' && <ReversePaymentModal payment={action.payment} onClose={close} />}
      {(action?.type === 'adjust' || action?.type === 'waive') && <ChargeActionModal charge={action.charge} action={action.type} onClose={close} />}
    </>
  );
  return { onAction, modal, error, openReceipt: (payment) => setAction({ type: 'receipt', payment }) };
}
