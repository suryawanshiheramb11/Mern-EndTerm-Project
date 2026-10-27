import { useState } from 'react';
import { Link } from 'react-router-dom';
import Glyph from '../components/site/Glyph.jsx';
import Reveal from '../components/site/Reveal.jsx';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome.jsx';
import { formatINR } from '../lib/format.js';
import { PRICING } from '../lib/pricing.js';

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
  ['How is the price worked out?', 'You pay a flat rate for each bed you manage, every month. Every feature is included at every size.'],
  ['Do students or staff cost extra?', 'No. Wardens, maintenance staff and students are free. You only count beds.'],
  ['Are there fees on online rent payments?', 'Online payments go through Razorpay, which charges its own fee on each payment under its published rates. StayOS does not add to it.'],
  ['What counts as a bed?', 'Every active bed in your properties, whether it is occupied or empty.'],
];

export default function Pricing() {
  const [beds, setBeds] = useState(PRICING.defaultBeds);
  const monthly = beds * PRICING.perBedPerMonthRupees;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pb-10 pt-14 text-center sm:px-6 sm:pt-20">
          <Reveal as="h1" className="mx-auto max-w-3xl text-[2.4rem] font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl">Simple pricing. One rate, every feature.</Reveal>
          <Reveal as="p" delay={80} className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 sm:text-xl">Pay per bed. No tiers to compare and no per-user fees.</Reveal>
        </section>

        <section className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-5">
          <Reveal className="rounded-3xl border border-slate-200 bg-white p-7 shadow-card lg:col-span-3 sm:p-9">
            <p className="text-sm font-semibold text-accent-ink">StayOS</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="tnum text-5xl font-semibold tracking-tight text-slate-900 sm:text-6xl">{formatINR(PRICING.perBedPerMonthRupees)}</span>
              <span className="text-slate-600">per bed, per month</span>
            </p>
            <p className="mt-2 text-slate-600">Everything below is included from your first bed.</p>
            <Link to="/register" className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-accent px-6 text-[15px] font-semibold text-onaccent hover:bg-accent-hover">Create your account</Link>
            <ul className="mt-8 grid gap-3 border-t border-slate-200 pt-8 text-slate-700 sm:grid-cols-2">
              {INCLUDED.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm"><Glyph name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" />{t}</li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} className="rounded-3xl bg-white p-7 shadow-card sm:p-9 lg:col-span-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Estimate your month</h2>
            <label htmlFor="beds" className="mt-6 flex items-baseline justify-between text-sm font-medium text-slate-700">
              Beds in your property
              <output htmlFor="beds" className="tnum text-2xl font-semibold text-slate-900">{beds}</output>
            </label>
            <input
              id="beds"
              type="range"
              min={PRICING.minBeds}
              max={PRICING.maxBeds}
              step="5"
              value={beds}
              onChange={(e) => setBeds(Number(e.target.value))}
              className="mt-3 w-full accent-[rgb(var(--accent))]"
            />
            <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{PRICING.minBeds}</span><span>{PRICING.maxBeds}</span></div>
            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Estimated per month</p>
              <p className="tnum mt-1 text-4xl font-semibold tracking-tight text-slate-900">{formatINR(monthly)}</p>
              <p className="mt-1 text-xs text-slate-500">{beds} beds × {formatINR(PRICING.perBedPerMonthRupees)}. Payment gateway fees are separate.</p>
            </div>
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
