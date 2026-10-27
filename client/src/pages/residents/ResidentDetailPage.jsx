import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import AssignBedModal from '../../components/residents/AssignBedModal.jsx';
import InvitePanel from '../../components/residents/InvitePanel.jsx';
import TransferModal from '../../components/residents/TransferModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, formatPaise } from '../../lib/format.js';
import { canWrite, PERMISSIONS } from '../../lib/permissions.js';
import { ROLE_HOME } from '../../lib/roles.js';
import { getResident, listStays } from '../../services/residents.js';
import { listCharges, listPayments } from '../../services/rent.js';
import { listRefunds } from '../../services/refunds.js';
import CheckoutModal from '../../components/residents/CheckoutModal.jsx';
import RefundStatusPill from '../../components/refunds/RefundStatusPill.jsx';
import BalanceSummary from '../../components/rent/BalanceSummary.jsx';
import RecordPaymentModal from '../../components/rent/RecordPaymentModal.jsx';
import { ChargesTable, PaymentsTable } from '../../components/rent/RentTables.jsx';
import useRentActions from '../../components/rent/useRentActions.jsx';

const END_REASON = { transfer: 'Transferred', checkout: 'Checked out', eviction: 'Evicted', other: 'Ended' };

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-800">{children}</dd>
    </div>
  );
}

export default function ResidentDetailPage() {
  const { residentId } = useParams();
  const { user } = useAuth();
  const [modal, setModal] = useState(null);
  const [checkInInvite, setCheckInInvite] = useState(null);
  const { onAction, modal: actionModal, error: actionError, openReceipt } = useRentActions();
  const showRent = user.role === 'owner' || user.role === 'warden'; // maintenance has no finance access

  const resident = useQuery({ queryKey: ['resident', residentId], queryFn: () => getResident(residentId) });
  const stays = useQuery({
    queryKey: ['stays', { residentId }],
    queryFn: () => listStays({ residentId }),
    enabled: user.role !== 'maintenance', // maintenance staff can't see stay terms
  });

  const charges = useQuery({ queryKey: ['rent-charges', { residentId }], queryFn: () => listCharges({ residentId }), enabled: showRent });
  const payments = useQuery({ queryKey: ['rent-payments', { residentId }], queryFn: () => listPayments({ residentId }), enabled: showRent });

  const refunds = useQuery({ queryKey: ['refunds', { residentId }], queryFn: () => listRefunds({ residentId }), enabled: showRent });
  const refundByStay = new Map((refunds.data?.items ?? []).map((x) => [String(x.stay?.id ?? x.stay), x]));

  if (resident.isLoading) return <p className="text-slate-500">Loading…</p>;
  if (resident.error) return <ErrorBanner error={resident.error} />;

  const r = resident.data;
  const mayStay = canWrite(user, r.property, PERMISSIONS.STAYS_WRITE);
  const mayPay = showRent && canWrite(user, r.property, PERMISSIONS.PAYMENTS_WRITE);
  const mayInvite = canWrite(user, r.property, PERMISSIONS.RESIDENTS_WRITE);
  const all = stays.data?.items ?? [];
  const active = all.find((s) => s.status === 'active');
  const history = all.filter((s) => s.status === 'ended');

  return (
    <div className="space-y-6">
      <div>
        <Link to={`${ROLE_HOME[user.role]}/residents`} className="text-sm text-slate-500 hover:underline">
          ← Residents
        </Link>
        <h1 className="page-title">{r.fullName}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Details</h2>
          <dl>
            <Row label="Phone">{r.phone}</Row>
            <Row label="Email">{r.email ?? '—'}</Row>
            <Row label="Emergency contact">{r.emergencyContact?.name ? `${r.emergencyContact.name} · ${r.emergencyContact.phone ?? ''}` : '—'}</Row>
            <Row label="ID verification">{r.idVerification.status.replace('_', ' ')}</Row>
            <Row label="Status">{r.status}</Row>
            {r.notes && <Row label="Notes">{r.notes}</Row>}
          </dl>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <InvitePanel key={checkInInvite ? 'invited' : 'idle'} resident={r} canInvite={mayInvite} initial={checkInInvite?.invite} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-800">Current stay</h2>
          <ErrorBanner error={stays.error} />
          {stays.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {checkInInvite?.inviteError && <p className="mb-2 text-sm text-red-600">Invite failed: {checkInInvite.inviteError}</p>}
          {active ? (
            <>
              <dl>
                <Row label="Bed">
                  Room {active.room.number} · Bed {active.bed.label}
                  {active.reservationTimer && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Reserved</span>}
                </Row>
                <Row label={active.reservationTimer ? 'Arrives' : 'Since'}>{formatDate(active.checkInDate)}</Row>
                <Row label="Expected check-out">{formatDate(active.expectedCheckOutDate)}</Row>
                <Row label="Monthly rent">{formatPaise(active.monthlyRentPaise)}</Row>
                {active.agreedDiscountPaise > 0 && <Row label="Agreed discount">{formatPaise(active.agreedDiscountPaise)}</Row>}
                <Row label="Deposit">{formatPaise(active.depositPaise)}</Row>
                <Row label="Billing day">{active.billingDay}</Row>
              </dl>
              {mayStay && !active.reservationTimer && (
                <button type="button" onClick={() => setModal({ type: 'transfer', stay: active })} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                  Transfer to another bed
                </button>
              )}
              {mayStay && !active.reservationTimer && (
                <button type="button" onClick={() => setModal({ type: 'checkout', stay: active })} className="ml-2 mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                  Check out
                </button>
              )}
            </>
          ) : (
            !stays.isLoading && (
              <>
                <p className="text-sm text-slate-500">{user.role === 'maintenance' ? 'Stay details are not available for your role.' : 'No active stay.'}</p>
                {mayStay && r.status === 'active' && (
                  <button type="button" onClick={() => setModal({ type: 'assign' })} className="mt-3 rounded-md bg-accent px-3 py-2 text-sm font-medium text-onaccent hover:bg-accent-hover">
                    Assign bed
                  </button>
                )}
              </>
            )
          )}
        </section>
      </div>

      {showRent && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Rent</h2>
            {mayPay && (
              <button type="button" onClick={() => setModal({ type: 'pay' })} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-onaccent hover:bg-accent-hover">
                Record payment
              </button>
            )}
          </div>
          <BalanceSummary residentId={residentId} />
          <ErrorBanner error={charges.error ?? payments.error ?? actionError} />
          <h3 className="text-sm font-medium text-slate-700">Charges</h3>
          <ChargesTable items={charges.data?.items ?? []} showResident={false} isOwner={user.role === 'owner'} onAction={onAction} />
          <h3 className="text-sm font-medium text-slate-700">Payments</h3>
          <PaymentsTable items={payments.data?.items ?? []} showResident={false} isOwner={user.role === 'owner'} onAction={onAction} />
        </section>
      )}

      {user.role !== 'maintenance' && (
        <section>
          <h2 className="mb-2 font-semibold text-slate-800">Stay history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No previous stays.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Bed</th>
                    <th className="px-4 py-2">From</th>
                    <th className="px-4 py-2">To</th>
                    <th className="px-4 py-2">Rent</th>
                    <th className="px-4 py-2">Ended</th>
                    {showRent && <th className="px-4 py-2">Deposit refund</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2">Room {s.room.number} · Bed {s.bed.label}</td>
                      <td className="px-4 py-2">{formatDate(s.checkInDate)}</td>
                      <td className="px-4 py-2">{formatDate(s.actualCheckOutDate)}</td>
                      <td className="px-4 py-2">{formatPaise(s.monthlyRentPaise)}</td>
                      <td className="px-4 py-2">
                        {END_REASON[s.endedReason] ?? 'Ended'}
                        {s.endedNote && <span className="text-slate-400"> — {s.endedNote}</span>}
                      </td>
                      {showRent && (
                        <td className="px-4 py-2">
                          {refundByStay.get(s.id) ? (
                            <span className="inline-flex items-center gap-2">
                              {formatPaise(refundByStay.get(s.id).refundablePaise)} <RefundStatusPill status={refundByStay.get(s.id).status} />
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modal?.type === 'assign' && <AssignBedModal resident={r} onClose={() => setModal(null)} onInvite={setCheckInInvite} />}
      {modal?.type === 'pay' && (
        <RecordPaymentModal propertyId={r.property} residentId={residentId} onClose={() => setModal(null)} onRecorded={openReceipt} />
      )}
      {actionModal}
      {modal?.type === 'checkout' && <CheckoutModal stay={modal.stay} onClose={() => setModal(null)} />}
      {modal?.type === 'transfer' && <TransferModal stay={modal.stay} propertyId={r.property} onClose={() => setModal(null)} />}
    </div>
  );
}
