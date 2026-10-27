import { Link } from 'react-router-dom';

/*
 * Public landing page. Uses the app's semantic colour tokens (slate-*, accent, white = raised
 * surface) so light and dark appearances both work, and system type like the rest of the product.
 * The one signature element is the bed board: the same room/bed status grid the owner works with.
 */

const GLYPHS = {
  bed: 'M3 19V6m0 8h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5h.01',
  wallet: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zm0 0 2-3h11M17 14h.01',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 19a2 2 0 0 0 4 0',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10',
  wrench: 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-2.3-.7-.7-2.3 2.4-2.4z',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  check: 'm5 12.5 4.5 4.5L19 7.5',
};

function Glyph({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  );
}

const FEATURES = [
  { icon: 'bed', title: 'Rooms and beds, always true', body: 'Every bed is available, reserved, occupied or under maintenance. Two people can never be given the same bed, even if two wardens click at once.' },
  { icon: 'wallet', title: 'Rent that collects itself', body: 'Monthly charges are generated once and only once. Students pay online by UPI or card, in full or in part, and every payment gets a numbered receipt.' },
  { icon: 'bell', title: 'Reminders and late fees', body: 'A nudge before the due date, another when rent turns overdue, then weekly until it is paid. An optional late fee is added once, never twice.' },
  { icon: 'exit', title: 'Check-out without arguments', body: 'Preview the final dues, deduct damages, and the deposit refund is worked out for you. The owner approves it and marks it paid, and nothing moves without that.' },
  { icon: 'wrench', title: 'Complaints that get closed', body: 'Students raise a problem, a warden assigns it, maintenance resolves it. Each step is on the record, with a deadline that shows when it is running late.' },
  { icon: 'chart', title: 'Numbers you can trust', body: 'Occupancy, collections, outstanding rent and expenses, calculated on the server from real records and exportable as CSV.' },
];

const ROLES = [
  { name: 'Owner', line: 'Sees everything, approves what matters.', points: ['All properties, finances and reports', 'Invites staff and sets what each can do', 'Approves refunds and waives charges'] },
  { name: 'Warden', line: 'Runs the building day to day.', points: ['Registers residents and assigns beds', 'Records cash and UPI payments', 'Handles complaints, within the permissions given'] },
  { name: 'Maintenance', line: 'Sees only the work assigned to them.', points: ['A short list of their open tasks', 'Updates progress and marks work done', 'No access to money or resident records'] },
  { name: 'Student', line: 'Everything about their own stay.', points: ['Room, bed and next rent due', 'Pay online and download receipts', 'Raise complaints and get notified'] },
];

const STEPS = [
  { title: 'Set up your property', body: 'Add rooms and beds in bulk. Set rent, deposit and the late-fee rule once.' },
  { title: 'Bring residents in', body: 'Register a resident, choose an available bed and check them in. Invite them to their own portal.' },
  { title: 'Collect rent', body: 'Generate the month’s charges in one click. Students pay online or you record cash. Receipts are automatic.' },
  { title: 'Handle the day-to-day', body: 'Complaints, transfers, check-outs and refunds, each with a clear record of who did what and when.' },
];

// Illustration of the real bed grid: status by position, so it reads at a glance and never changes between renders.
const BED_STATUS = {
  available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300' },
  occupied: { label: 'Occupied', cls: 'bg-accent text-onaccent' },
  reserved: { label: 'Reserved', cls: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300' },
  maintenance: { label: 'Maintenance', cls: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300' },
};
const BOARD = [
  { room: '101', beds: 'ooao' },
  { room: '102', beds: 'ooor' },
  { room: '103', beds: 'aaoo' },
  { room: '201', beds: 'oooo' },
  { room: '202', beds: 'ormo' },
  { room: '203', beds: 'ooaa' },
];
const KEY = { o: 'occupied', a: 'available', r: 'reserved', m: 'maintenance' };

function BedBoard() {
  return (
    <div className="rise rounded-2xl border border-slate-200 bg-white p-4 shadow-sheet sm:p-5" style={{ animation: 'sheet-in 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Sunrise PG · Floor 1 and 2</p>
        <p className="tnum rounded-full bg-accent-tint px-2.5 py-1 text-xs font-semibold text-accent-ink">17 of 24 beds full</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" role="img" aria-label="Six rooms with four beds each. Seventeen beds are occupied, five are available, one is reserved and one is under maintenance.">
        {BOARD.map(({ room, beds }) => (
          <div key={room} className="rounded-xl bg-slate-50 p-2.5">
            <p className="mb-2 text-xs font-medium text-slate-500">Room {room}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {[...beds].map((b, i) => (
                <span key={i} className={`grid h-9 place-items-center rounded-lg text-xs font-semibold ${BED_STATUS[KEY[b]].cls}`}>
                  {'ABCD'[i]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600" aria-hidden="true">
        {Object.entries(BED_STATUS).map(([k, v]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded ${v.cls}`} />
            {v.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneRent() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border border-slate-300 bg-slate-100 p-2.5 shadow-sheet" role="img" aria-label="Student rent screen: rent for the month with a Pay online button and a list of receipts.">
      <div className="rounded-[1.7rem] bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">Rent this month</p>
        <p className="tnum mt-1 text-3xl font-semibold tracking-tight text-slate-900">₹6,500</p>
        <p className="mt-1 text-xs text-slate-500">Due on the 5th · includes any late fee</p>
        <div className="mt-4 grid h-11 place-items-center rounded-xl bg-accent text-sm font-semibold text-onaccent">Pay online</div>
        <p className="mt-5 text-xs font-semibold text-slate-700">Receipts</p>
        <ul className="mt-2 divide-y divide-slate-200 rounded-xl bg-white text-sm">
          {['September', 'August', 'July'].map((m) => (
            <li key={m} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-slate-800">{m}</span>
              <span className="flex items-center gap-1 text-xs font-medium text-green-800">
                <Glyph name="check" className="h-3.5 w-3.5" /> Paid
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const button = 'inline-flex min-h-[44px] items-center justify-center rounded-full px-6 text-[15px] font-semibold';

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="glass sticky top-0 z-40 border-b border-slate-200 bg-slate-50/80 backdrop-blur-xl" style={{ WebkitBackdropFilter: 'saturate(180%) blur(20px)' }}>
        <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-900">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-onaccent"><Glyph name="bed" className="h-4 w-4" /></span>
            StayOS
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Features</a>
            <a href="#roles" className="hover:text-slate-900">Who it is for</a>
            <a href="#how" className="hover:text-slate-900">How it works</a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="inline-flex min-h-[44px] items-center px-3 text-sm font-semibold text-accent-ink hover:underline">Log in</Link>
            <Link to="/register" className="inline-flex min-h-[36px] items-center rounded-full bg-accent px-4 text-sm font-semibold text-onaccent hover:bg-accent-hover">Get started</Link>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70" style={{ background: 'radial-gradient(60% 60% at 70% 0%, rgb(var(--accent) / 0.16), transparent 70%)' }} aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-10 lg:pb-28">
            <div>
              <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-[4.2rem]">
                Run your PG.<br />Not the paperwork.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl">
                StayOS keeps every bed, every rupee and every complaint in one place, for hostel and PG owners, their wardens and the students who live there.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/register" className={`${button} bg-accent text-onaccent hover:bg-accent-hover`}>Start managing your property</Link>
                <Link to="/login" className={`${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}>Log in</Link>
              </div>
              <p className="mt-4 text-sm text-slate-500">Students: sign in with the invite your warden sent you.</p>
            </div>
            <BedBoard />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Everything a hostel does in a month, handled.</h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">Built around how a PG really runs, from the first bed assigned to the last deposit returned.</p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-2xl bg-slate-50 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-tint text-accent-ink"><Glyph name={f.icon} /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Student portal */}
        <section className="border-t border-slate-200">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2">
            <PhoneRent />
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Students pay on their phone. In a minute.</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Each student gets their own login: their room and bed, what is due next, every receipt, and a way to raise a complaint. They can pay the whole month or part of it, and the receipt arrives straight away.
              </p>
              <ul className="mt-6 space-y-3 text-slate-700">
                {['Pay by UPI or card, in full or in part', 'Reminders before it is due, never after it is paid', 'Receipts that print cleanly as PDF', 'History stays available after check-out'].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-onaccent"><Glyph name="check" className="h-3.5 w-3.5" /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-16 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Everyone sees exactly what they should.</h2>
            <p className="mt-4 max-w-2xl text-lg text-slate-600">Access is set per person and per property, and it is enforced on the server, not just hidden in the screen.</p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((r) => (
                <li key={r.name} className="flex flex-col rounded-2xl border border-slate-200 p-6">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-900">{r.name}</h3>
                  <p className="mt-1 text-slate-600">{r.line}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-slate-200 pt-5 text-sm text-slate-700">
                    {r.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5">
                        <Glyph name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">From empty rooms to a full month, in four steps.</h2>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl bg-white p-6 shadow-card">
                  <span className="tnum grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-onaccent">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="px-4 pb-20 sm:px-6 sm:pb-24">
          <div className="mx-auto max-w-6xl rounded-[2rem] bg-accent px-6 py-16 text-center sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-onaccent sm:text-5xl">Your next rent day can be the easy one.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-onaccent/90">Create your owner account, add a property and bring your first resident in today.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className={`${button} bg-white text-accent-ink hover:opacity-90`}>Create your account</Link>
              <Link to="/login" className={`${button} border border-white/60 text-onaccent hover:bg-white/10`}>Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:px-6">
          <p className="font-semibold text-slate-800">StayOS</p>
          <p>Hostel and PG management. Amounts in ₹, dates in IST.</p>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-slate-800">Log in</Link>
            <Link to="/register" className="hover:text-slate-800">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
