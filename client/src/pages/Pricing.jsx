import { Link } from 'react-router-dom';
import Glyph from '../components/site/Glyph.jsx';
import Reveal from '../components/site/Reveal.jsx';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome.jsx';
import { PRICING } from '../lib/pricing.js';

// Whole rupees: a flat plan price never shows paise.
const formatINR = (rupees) => `₹${rupees.toLocaleString('en-IN')}`;

const INCLUDED = [
  'Rooms, beds, residents and stays',
  'Rent charges, payments and numbered receipts',
  'Online rent payment for students (UPI and card)',
  'Reminders, overdue alerts and late fees',
  'Check-out, deposits and refunds',
  'Complaints with deadlines and maintenance tasks',
  'Expenses, reports and CSV export',
  'Staff accounts with per-property permissions',
  'Student portal for every resident, at no extra charge',
  'Audit log of sensitive actions',
];

const FAQ = [
  ['How does the free trial work?', `Try the complete software free for ${PRICING.trialDays} days. After that it is ${formatINR(PRICING.perMonthRupees)} per month.`],
  ['What do I get for ₹159?', 'The complete software, with every feature listed above. There are no tiers and no features held back.'],
  ['Do students or staff cost extra?', 'No. Wardens, maintenance staff and students use StayOS at no extra charge.'],
  ['Are there fees on online rent payments?', 'Online payments go through Razorpay, which charges its own fee on each payment under its published rates. StayOS does not add to it.'],
  ['Is the price per bed?', 'No. It is one flat price per month for the complete software.'],
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
          <Reveal as="h1" className="mx-auto max-w-3xl text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">One price. The complete software.</Reveal>
          <Reveal as="p" delay={80} className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 sm:text-xl">Try it free for {PRICING.trialDays} days. No tiers, no per-bed charges, no per-user fees.</Reveal>
        </section>

        <section className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-5">
          <Reveal className="rounded-3xl border border-slate-200 bg-white p-7 shadow-card lg:col-span-3 sm:p-9">
            <p className="text-sm font-semibold text-accent-ink">StayOS</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="tnum text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">{formatINR(PRICING.perMonthRupees)}</span>
              <span className="text-slate-600">per month</span>
            </p>
            <p className="mt-2 text-slate-600">Free for the first {PRICING.trialDays} days, then {formatINR(PRICING.perMonthRupees)} a month. Everything below is included.</p>
            <Link to="/register" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-6 text-[15px] font-semibold text-onaccent hover:bg-accent-hover">Start your {PRICING.trialDays}-day free trial</Link>
            <ul className="mt-8 grid gap-3 border-t border-slate-200 pt-8 text-slate-700 sm:grid-cols-2">
              {INCLUDED.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm"><Glyph name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />{t}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} className="rounded-3xl bg-white p-7 shadow-card sm:p-9 lg:col-span-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Good to know</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-700">
              {[
                ['Free trial', `${PRICING.trialDays} days with the complete software.`],
                ['Flat monthly price', `${formatINR(PRICING.perMonthRupees)} for the complete software.`],
                ['Your team and students', 'Wardens, maintenance staff and students are not charged.'],
                ['Online payments', 'Razorpay charges its own fee on each online payment. StayOS adds nothing.'],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-onaccent"><Glyph name="check" className="h-3.5 w-3.5" /></span>
                  <span><span className="block font-semibold text-slate-900">{t}</span>{d}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal as="h2" className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Pricing questions</Reveal>
            <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
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
      </main>
      <SiteFooter />
    </div>
  );
}
