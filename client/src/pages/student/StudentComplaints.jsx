import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ComplaintDrawer from '../../components/complaints/ComplaintDrawer.jsx';
import ComplaintsTable from '../../components/complaints/ComplaintsTable.jsx';
import RaiseComplaintModal from '../../components/complaints/RaiseComplaintModal.jsx';
import ErrorBanner from '../../components/ErrorBanner.jsx';
import { listMyComplaints } from '../../services/me.js';

export default function StudentComplaints() {
  const [raising, setRaising] = useState(false);
  const [openId, setOpenId] = useState(null);
  const complaints = useQuery({ queryKey: ['complaints', 'mine'], queryFn: listMyComplaints });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">My complaints</h1>
        <button type="button" onClick={() => setRaising(true)} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700">Raise complaint</button>
      </div>
      <ErrorBanner error={complaints.error} />
      <ComplaintsTable items={complaints.data?.items ?? []} showResident={false} onOpen={setOpenId} />
      {raising && <RaiseComplaintModal onClose={() => setRaising(false)} />}
      {openId && <ComplaintDrawer complaintId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
