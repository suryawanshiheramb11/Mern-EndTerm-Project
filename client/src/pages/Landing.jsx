import { Link } from 'react-router-dom';
import Glyph from '../components/site/Glyph.jsx';
import Reveal from '../components/site/Reveal.jsx';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome.jsx';

/*
 * Public landing page. Colours come from the app's semantic tokens (slate-*, accent, white = raised
 * surface), so light and dark appearances share one set of classes. All figures inside the mockups
 * are sample data, labelled as such; nothing on this page is a claim about customers or usage.
 */

const PILL = {
  paid: 'bg-green-50 text-green-800',
  partial: 'bg-amber-50 text-amber-900',
  overdue: 'bg-red-50 text-red-700',
  new: 'bg-blue-50 text-blue-700',
  progress: 'bg-amber-50 text-amber-900',
  done: 'bg-green-50 text-green-800',
};
const Pill = ({ kind, children }) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[kind]}`}>{children}</span>;

/* ---------------- product mockups (sample data) ---------------- */

function Frame({ title, children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sheet ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        <span className="ml-3 truncate text-xs font-medium text-slate-500">{title}</span>
      </div>
      {children}
    </div>
  );
}

const KPIS = [
  { label: 'Rent collected', value: '₹3,42,500', note: 'This month' },
  { label: 'Beds occupied', value: '88 / 100', note: '88% occupancy' },
  { label: 'Outstanding', value: '₹58,000', note: '9 residents' },
  { label: 'Open complaints', value: '4', note: '1 past deadline' },
];
const BARS = [52, 61, 58, 70, 66, 82];

function DashboardMock() {
  return (
    <Frame title="StayOS · Sunrise PG · Dashboard" className="rise" >
      <div className="space-y-4 p-4 sm:p-5" role="img" aria-label="Sample owner dashboard with rent collected, beds occupied, outstanding rent, open complaints, a six month collection chart and recent payments.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {KPIS.map((k) => (
            <div key={k.label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-medium text-slate-500">{k.label}</p>
              <p className="tnum mt-1 text-lg font-semibold tracking-tight text-slate-900">{k.value}</p>
              <p className="text-[11px] text-slate-500">{k.note}</p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-3 sm:col-span-3">
            <p className="text-xs font-semibold text-slate-700">Collections, last 6 months</p>
            <div className="mt-3 flex h-28 items-end gap-2">
              {BARS.map((h, i) => (
                <span key={i} className={`flex-1 rounded-t-md ${i === BARS.length - 1 ? 'bg-accent' : 'bg-accent-tint'}`} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 sm:col-span-2">
            <p className="text-xs font-semibold text-slate-700">Recent payments</p>
            <ul className="mt-2 space-y-2 text-xs">
              {[['Aarav S.', '₹6,500', 'UPI'], ['Meera K.', '₹3,000', 'Cash'], ['Rohan P.', '₹6,500', 'Card']].map(([n, a, m]) => (
                <li key={n} className="flex items-center justify-between">
                  <span className="text-slate-700">{n}<span className="ml-1.5 text-slate-400">{m}</span></span>
                  <span className="tnum font-semibold text-slate-900">{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Frame>
  );
}

const BED_STATUS = {
  available: { label: 'Available', cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300' },
  occupied: { label: 'Occupied', cls: 'bg-accent text-onaccent' },
  reserved: { label: 'Reserved', cls: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300' },
  maintenance: { label: 'Maintenance', cls: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300' },
};
const BOARD = [['101', 'ooao'], ['102', 'ooor'], ['103', 'aaoo'], ['201', 'oooo'], ['202', 'ormo'], ['203', 'ooaa']];
const KEY = { o: 'occupied', a: 'available', r: 'reserved', m: 'maintenance' };

function BedBoard() {
  return (
    <Frame title="StayOS · Rooms and beds">
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="img" aria-label="Sample room board: six rooms of four beds, showing occupied, available, reserved and maintenance beds.">
          {BOARD.map(([room, beds]) => (
            <div key={room} className="rounded-xl bg-slate-50 p-2.5">
              <p className="mb-2 text-xs font-medium text-slate-500">Room {room}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[...beds].map((b, i) => (
                  <span key={i} className={`grid h-9 place-items-center rounded-lg text-xs font-semibold ${BED_STATUS[KEY[b]].cls}`}>{'ABCD'[i]}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600" aria-hidden="true">
          {Object.values(BED_STATUS).map((v) => (
            <li key={v.label} className="flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${v.cls}`} />{v.label}</li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

function LedgerMock() {
  const rows = [['Aarav Sharma', 'Oct', '₹6,500', 'paid', 'Paid'], ['Meera Kulkarni', 'Oct', '₹3,500 due', 'partial', 'Partial'], ['Rohan Patil', 'Oct', '₹6,825 due', 'overdue', 'Overdue'], ['Isha Menon', 'Oct', '₹6,500', 'paid', 'Paid']];
  return (
    <Frame title="StayOS · Rent">
      <div className="p-4 sm:p-5" role="img" aria-label="Sample rent table with paid, partial and overdue charges.">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="pb-2 font-medium">Resident</th><th className="pb-2 font-medium">Month</th><th className="pb-2 text-right font-medium">Amount</th><th className="pb-2 pl-3 font-medium">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(([n, m, a, k, l]) => (
              <tr key={n}><td className="py-2.5 font-medium text-slate-800">{n}</td><td className="py-2.5 text-slate-500">{m}</td><td className="tnum py-2.5 text-right text-slate-800">{a}</td><td className="py-2.5 pl-3"><Pill kind={k}>{l}</Pill></td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 rounded-lg bg-accent-tint px-3 py-2 text-xs font-medium text-accent-ink">Overdue rent includes a one-time late fee, set per property.</p>
      </div>
    </Frame>
  );
}

function ComplaintsMock() {
  const rows = [['Router in common room offline', 'Room 201 · Aarav S.', 'progress', 'In progress'], ['Tap leaking in bathroom', 'Room 103 · Meera K.', 'new', 'New'], ['Window latch broken', 'Room 202 · Rohan P.', 'done', 'Resolved']];
  return (
    <Frame title="StayOS · Complaints">
      <ul className="divide-y divide-slate-100 p-2 sm:p-3" role="img" aria-label="Sample complaints list with new, in progress and resolved items.">
        {rows.map(([t, w, k, l]) => (
          <li key={t} className="flex items-center justify-between gap-3 px-2 py-3">
            <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{t}</p><p className="text-xs text-slate-500">{w}</p></div>
            <Pill kind={k}>{l}</Pill>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function PhoneRent() {
  return (
    <div className="mx-auto w-full max-w-[290px] rounded-[2.2rem] border border-slate-300 bg-slate-100 p-2.5 shadow-sheet" role="img" aria-label="Sample student rent screen with the amount due, a Pay online button and a list of paid receipts.">
      <div className="rounded-[1.7rem] bg-slate-50 p-4">
        <p className="text-xs font-medium text-slate-500">Rent this month</p>
        <p className="tnum mt-1 text-3xl font-semibold tracking-tight text-slate-900">₹6,500</p>
        <p className="mt-1 text-xs text-slate-500">Due on the 5th</p>
        <div className="mt-4 grid h-11 place-items-center rounded-xl bg-accent text-sm font-semibold text-onaccent">Pay online</div>
        <p className="mt-5 text-xs font-semibold text-slate-700">Receipts</p>
        <ul className="mt-2 divide-y divide-slate-200 rounded-xl bg-white text-sm">
          {['September', 'August', 'July'].map((m) => (
            <li key={m} className="flex items-center justify-between px-3 py-2.5"><span className="text-slate-800">{m}</span><Pill kind="paid">Paid</Pill></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- content ---------------- */

const TYPES = [
  { icon: 'bed', name: 'PG', body: 'Shared and private rooms, monthly rent.' },
  { icon: 'building', name: 'Hostel', body: 'Floors, dorms and many beds.' },
  { icon: 'users', name: 'Co-living', body: 'Residents, staff and shared spaces.' },
  { icon: 'key', name: 'Rental rooms', body: 'A few rooms, still done properly.' },
];

const STEPS = [
  { title: 'Set up your property', body: 'Add rooms and beds in bulk. Set rent, deposit and the late-fee rule once.' },
  { title: 'Bring residents in', body: 'Register a resident, pick an available bed and check them in.' },
  { title: 'Invite them to their portal', body: 'Each student gets their own login for their room, rent and receipts.' },
  { title: 'Collect and track', body: 'Generate the month’s rent in one click. Students pay online or you record cash.' },
];

const FEATURES = [
  { icon: 'bed', title: 'Rooms and beds', body: 'Every bed is available, reserved, occupied or under maintenance. A bed can never be given to two people, even if two wardens click at once.' },
  { icon: 'wallet', title: 'Rent and receipts', body: 'Monthly charges are generated once and only once. Payments get numbered receipts, and mistakes are reversed, never erased.' },
  { icon: 'bell', title: 'Reminders and late fees', body: 'A nudge before the due date, another when rent turns overdue, then weekly until it is paid. An optional late fee is added once.' },
  { icon: 'exit', title: 'Check-out and refunds', body: 'Preview final dues, deduct damages, and the deposit refund is worked out for you. The owner approves and marks it paid.' },
  { icon: 'wrench', title: 'Complaints with deadlines', body: 'Raise, acknowledge, assign, resolve, close. Every step is recorded, and late ones are flagged.' },
  { icon: 'chart', title: 'Reports and CSV', body: 'Occupancy, collections, outstanding rent and expenses, worked out on the server and exportable.' },
  { icon: 'users', title: 'Staff permissions', body: 'Invite wardens and maintenance staff and choose exactly what each can see and do, per property.' },
  { icon: 'shield', title: 'Audit log', body: 'Payments, refunds, check-outs, waivers and permission changes are logged with who did it and when.' },
  { icon: 'receipt', title: 'Expenses', body: 'Record what the property spends by category. Void instead of delete, so the books stay honest.' },
];

const ROLES = [
  { name: 'Owner', line: 'Sees everything, approves what matters.', points: ['All properties, finances and reports', 'Invites staff and sets permissions', 'Approves refunds, waives charges'] },
  { name: 'Warden', line: 'Runs the building day to day.', points: ['Registers residents, assigns beds', 'Records cash and UPI payments', 'Handles complaints, as permitted'] },
  { name: 'Maintenance', line: 'Sees only the work assigned to them.', points: ['A short list of open tasks', 'Updates progress, marks work done', 'No access to money or residents'] },
  { name: 'Student', line: 'Everything about their own stay.', points: ['Room, bed and next rent due', 'Pay online, download receipts', 'Raise complaints, get notified'] },
];

const COMPARE = [
  ['Two people given the same bed', 'Happens', 'Prevented by the system'],
  ['Who has paid, who has not', 'Counted by hand', 'Always up to date'],
  ['Receipts', 'Written one by one', 'Numbered and automatic'],
  ['Rent reminders', 'You remember to call', 'Sent automatically'],
  ['Deposit refund at check-out', 'Worked out on paper', 'Calculated and approved'],
  ['Who changed what', 'Nobody knows', 'Recorded in an audit log'],
  ['What each staff member can see', 'Everything or nothing', 'Set per person'],
];

const ROADMAP = [
  { state: 'Live', items: ['Rooms, beds, residents and stays', 'Rent, payments, receipts and online payment', 'Check-out, refunds and deposits', 'Complaints, expenses, reports, student portal'] },
  { state: 'Next', items: ['WhatsApp and SMS reminders', 'Several properties in one view', 'PDF receipts and mobile apps'] },
];

const FAQ = [
  ['Who is StayOS for?', 'Owners and managers of PGs, hostels, co-living spaces and rental rooms, along with the wardens, maintenance staff and students who live and work there.'],
  ['How do students pay rent?', 'Students log in to their own portal and pay online by UPI or card through Razorpay, in full or in part. Cash and bank payments are recorded by staff. Either way, a numbered receipt is created.'],
  ['Do students need to install an app?', 'No. The student portal runs in any phone browser. Native mobile apps are on the roadmap.'],
  ['Can I control what my staff see?', 'Yes. When you invite a warden or maintenance person you choose their permissions for each property, and the server enforces them, not just the screen.'],
  ['What happens if a payment is entered wrongly?', 'Payments are never edited or deleted. You reverse the wrong one, which keeps a clear trail, and record the right one.'],
  ['What about deposits and refunds?', 'Deposits are tracked separately from rent and never counted as income. At check-out the refund is calculated, then approved and paid by the owner.'],
  ['Can I export my data?', 'Yes. Reports can be exported as CSV.'],
  ['Does it send WhatsApp reminders?', 'Not yet. Reminders are in-app today and by email when email is configured. WhatsApp and SMS are planned.'],
];

const button = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold';
const h2 = 'text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl';

function Showcase({ eyebrow, title, body, points, children, flip }) {
  return (
    <Reveal className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16">
      <div className={flip ? 'lg:order-2' : ''}>
        <p className="text-sm font-semibold text-accent-ink">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h3>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">{body}</p>
        <ul className="mt-6 space-y-3 text-slate-700">
          {points.map((t) => (
            <li key={t} className="flex items-start gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-onaccent"><Glyph name="check" className="h-3.5 w-3.5" /></span>{t}</li>
          ))}
        </ul>
      </div>
      <div className={flip ? 'lg:order-1' : ''}>{children}</div>
    </Reveal>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader home />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: 'radial-gradient(55% 60% at 50% 0%, rgb(var(--accent) / 0.14), transparent 70%)' }} aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
            <h1 className="mx-auto max-w-4xl text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
              Run your PG.<br />Not the paperwork.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
              Beds, rent, receipts, check-outs and complaints in one place, for owners, wardens, maintenance staff and the students who live there.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className={`${button} bg-accent text-onaccent hover:bg-accent-hover`}>Start managing your property <Glyph name="arrow" className="h-4 w-4" /></Link>
              <Link to="/login" className={`${button} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}>Log in</Link>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
              {['14-day free trial', 'Pay by UPI or card', 'Role-based access', 'Works on any phone'].map((t) => (
                <li key={t} className="flex items-center gap-1.5"><Glyph name="check" className="h-4 w-4 text-accent-ink" />{t}</li>
              ))}
            </ul>
            <div className="mx-auto mt-14 max-w-4xl text-left"><DashboardMock /></div>
            <p className="mt-3 text-xs text-slate-500">Sample data shown for illustration.</p>
          </div>
        </section>

        {/* Property types */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Built for every kind of stay</h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TYPES.map((t, i) => (
                <Reveal as="li" delay={i * 70} key={t.name} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-tint text-accent-ink"><Glyph name={t.icon} /></span>
                  <div><p className="font-semibold text-slate-900">{t.name}</p><p className="text-sm text-slate-600">{t.body}</p></div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Product showcase */}
        <section id="product" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>One place for the whole month</Reveal>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">From the first bed assigned to the last deposit returned.</p>
            <Showcase eyebrow="Rooms and beds" title="See every bed at a glance" body="Colour-coded rooms show what is free, taken, reserved or out of service. Check residents in, move them, and the board updates for everyone." points={['Add rooms and beds in bulk', 'Transfers keep a full history', 'No double-booking, ever']}><BedBoard /></Showcase>
            <Showcase flip eyebrow="Rent and payments" title="Know who has paid, to the rupee" body="Generate the month’s rent in one click. Record cash or let students pay online. Partial payments, advances and reversals are all handled." points={['Receipts numbered automatically', 'Late fees added once, never twice', 'Waive or adjust with a reason on record']}><LedgerMock /></Showcase>
            <Showcase eyebrow="Complaints" title="Problems get fixed, not forgotten" body="Students raise an issue from their phone. A warden assigns it, maintenance resolves it, and the deadline shows when it is running late." points={['Each step is on the record', 'Maintenance sees only their tasks', 'Students can reopen if it is not fixed']}><ComplaintsMock /></Showcase>
            <Showcase flip eyebrow="Student portal" title="Students pay on their phone, in a minute" body="Every student has their own login with their room and bed, what is due next, every receipt and a way to raise a complaint. History stays available after check-out." points={['Pay all of it or part of it', 'Reminders before it is due', 'Receipts that print cleanly']}><PhoneRent /></Showcase>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>Up and running in four steps</Reveal>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <Reveal as="li" delay={i * 90} key={s.title} className="rounded-2xl bg-slate-50 p-6">
                  <span className="tnum grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-semibold text-onaccent">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>Everything a hostel does in a month</Reveal>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <Reveal as="li" delay={(i % 3) * 80} key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-tint text-accent-ink"><Glyph name={f.icon} /></span>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{f.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Roles */}
        <section id="roles" className="scroll-mt-16 border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>Everyone sees exactly what they should</Reveal>
            <p className="mx-auto mt-4 max-w-2xl text-center text-lg text-slate-600">Access is set per person and per property, and enforced on the server.</p>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((r, i) => (
                <Reveal as="li" delay={i * 80} key={r.name} className="flex flex-col rounded-2xl bg-slate-50 p-6">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-900">{r.name}</h3>
                  <p className="mt-1 text-slate-600">{r.line}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-slate-200 pt-5 text-sm text-slate-700">
                    {r.points.map((p) => (<li key={p} className="flex items-start gap-2.5"><Glyph name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />{p}</li>))}
                  </ul>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Comparison */}
        <section id="compare" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>Registers and spreadsheets vs StayOS</Reveal>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th scope="col" className="px-5 py-3 font-medium">What you need</th><th scope="col" className="px-5 py-3 font-medium">Notebook or Excel</th><th scope="col" className="px-5 py-3 font-semibold text-accent-ink">StayOS</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {COMPARE.map(([a, b, c]) => (
                    <tr key={a}><th scope="row" className="px-5 py-3.5 font-medium text-slate-800">{a}</th><td className="px-5 py-3.5 text-slate-600">{b}</td><td className="px-5 py-3.5 font-medium text-slate-900"><span className="inline-flex items-center gap-1.5"><Glyph name="check" className="h-4 w-4 text-accent-ink" />{c}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>What is live and what is next</Reveal>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {ROADMAP.map((r, i) => (
                <Reveal delay={i * 100} key={r.state} className="rounded-2xl bg-slate-50 p-6">
                  <p className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${r.state === 'Live' ? 'bg-green-50 text-green-800' : 'bg-accent-tint text-accent-ink'}`}>{r.state}</p>
                  <ul className="mt-4 space-y-2.5 text-slate-700">
                    {r.items.map((i) => (<li key={i} className="flex items-start gap-2.5"><Glyph name={r.state === 'Live' ? 'check' : 'arrow'} className="mt-1 h-4 w-4 shrink-0 text-accent-ink" />{i}</li>))}
                  </ul>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-slate-200">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className={`${h2} text-center`}>Questions, answered</Reveal>
            <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-5">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 text-left font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                    {q}
                    <Glyph name="plus" className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="pb-5 leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="mx-auto max-w-6xl rounded-[2rem] bg-accent px-6 py-16 text-center sm:px-12 sm:py-20">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-onaccent sm:text-5xl">Your next rent day can be the easy one.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-onaccent/90">Try the complete software free for 14 days, then ₹159 a month. Add a property and bring your first resident in today.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className={`${button} bg-white text-accent-ink hover:opacity-90`}>Start your 14-day free trial</Link>
              <Link to="/login" className={`${button} border border-white/60 text-onaccent hover:bg-white/10`}>Log in</Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter home />
    </div>
  );
}
