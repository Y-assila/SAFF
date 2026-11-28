import { useTranslation } from 'react-i18next'

/**
 * Product previews for the landing page, drawn with the app's real styles (not screenshots, so they
 * follow the language and direction). Decorative: the page text says the same thing.
 */
export function TicketMockup() {
  const { t } = useTranslation()
  return (
    <div aria-hidden="true" className="relative mx-auto w-[18.5rem] select-none rounded-[2.75rem] border border-line bg-midnight p-3 shadow-[0_40px_120px_-40px_rgb(166_255_0/0.25)]">
      <div className="flex flex-col gap-4 rounded-[2.1rem] bg-midnight px-4 pt-6 pb-5">
        <div className="overflow-hidden rounded-3xl bg-surface">
          <div className="flex flex-col px-5 pt-4 pb-3">
            <span className="text-[0.6875rem] font-medium text-muted">{t('ticket.title')} · Salon Atlas</span>
            <span className="display mt-1 text-[5.25rem]"><span dir="ltr">017</span></span>
            <span className="mt-1 text-sm font-semibold">Amine</span>
          </div>
          <div className="flex h-5 items-center">
            <span className="-ms-2.5 size-5 shrink-0 rounded-full bg-midnight" />
            <span className="mx-1 flex-1 border-t-2 border-dashed border-line" />
            <span className="-me-2.5 size-5 shrink-0 rounded-full bg-midnight" />
          </div>
          <div className="flex flex-col gap-3 px-5 pt-3 pb-5">
            <p className="flex items-baseline gap-2">
              <span className="display text-4xl"><span dir="ltr">3</span></span>
              <span className="text-xs font-semibold">{t('ticket.aheadMany')}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-3.5 rounded-full bg-signal" />
            </div>
          </div>
        </div>
        <p className="flex items-center gap-2 px-1 text-[0.6875rem] text-muted">
          <span className="size-1.5 animate-live rounded-full bg-signal" /> {t('ticket.live')}
        </p>
      </div>
    </div>
  )
}

export function BarberMockup() {
  const { t } = useTranslation()
  const rows = [['018', 'Karim', '22'], ['019', 'Yassine', '14'], ['020', 'Omar', '6']] as const
  return (
    <div aria-hidden="true" className="select-none rounded-[2rem] border border-line bg-midnight p-5 sm:p-7">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded-full bg-surface px-2.5 py-1 text-[0.6875rem] font-semibold">{t('queue.inService')}</span>
          <p className="flex items-baseline gap-3">
            <span className="display text-6xl"><span dir="ltr">017</span></span>
            <span className="text-xl font-bold">Amine</span>
          </p>
          <span className="mt-2 flex h-12 items-center justify-center rounded-2xl bg-signal text-sm font-extrabold text-midnight">
            {t('queue.callNext')} · <span dir="ltr" className="ms-1 tabular-nums">018</span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="px-2 pb-1 text-sm font-extrabold">{t('queue.waiting')} <span className="text-graphite">3</span></span>
          {rows.map(([n, name, min], i) => (
            <span key={n} className={`flex h-10 items-center gap-3 rounded-xl px-2.5 text-xs ${i === 0 ? 'bg-surface' : ''}`}>
              <span dir="ltr" className={`w-7 font-extrabold tabular-nums ${i === 0 ? 'text-signal' : 'text-graphite'}`}>{n}</span>
              <span className="flex-1 font-semibold">{name}</span>
              <span className="text-muted">{t('queue.waitedMinutes', { minutes: min })}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
