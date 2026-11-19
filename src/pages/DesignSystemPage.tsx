import { useState, type ReactNode } from 'react'
import { Logo } from '../components/brand/Logo'
import { Tagline } from '../components/brand/Tagline'
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher'
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '../components/ui'
import { ArrowForwardIcon } from '../components/ui/icons'

/**
 * DEVELOPMENT-ONLY component gallery for reviewing the foundation in all three languages.
 * Registered only when import.meta.env.DEV is true and lazy-loaded, so it is not in production builds.
 * Labels here are developer-facing and intentionally not translated.
 */
const swatches = [
  ['Midnight Black', 'bg-midnight', '#0B0B0F'],
  ['Surface Dark', 'bg-surface', '#17171D'],
  ['Signal Lime', 'bg-signal', '#A6FF00'],
  ['Soft White', 'bg-soft', '#F5F5F5'],
  ['Muted Grey', 'bg-muted', '#A1A1AA'],
  ['Border Grey', 'bg-line', '#292932'],
  ['Graphite', 'bg-graphite', '#777B84'],
  ['Danger (provisional)', 'bg-danger', '#FF6B6B'],
] as const

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-8">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  )
}

export default function DesignSystemPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Design system</h1>
        <LanguageSwitcher />
      </div>

      <Section title="Logo (exact brand-kit files)">
        <div className="flex flex-wrap items-end gap-10">
          <Logo variant="primary" className="h-auto w-full max-w-md" />
          <Logo variant="symbol" className="h-16 w-auto" />
          <Logo variant="symbol" className="h-8 w-auto" />
        </div>
        <Tagline className="text-lg" />
      </Section>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {swatches.map(([name, cls, hex]) => (
            <li key={name} className="flex items-center gap-3">
              <span className={`size-10 shrink-0 rounded-control border border-line ${cls}`} />
              <span className="text-sm">
                {name}
                <span dir="ltr" className="block text-xs text-muted">
                  {hex}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography">
        <p lang="en" dir="ltr" className="text-2xl font-semibold">
          Plus Jakarta Sans — Your turn. On your time.
        </p>
        <p lang="ar" dir="rtl" className="text-2xl font-semibold">
          IBM Plex Sans Arabic — دورك، في الوقت المناسب لك.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button endIcon={<ArrowForwardIcon />}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true)
              window.setTimeout(() => setLoading(false), 1500)
            }}
          >
            Click to load
          </Button>
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid max-w-xl gap-4">
          <Input label="Name" placeholder="Name" autoComplete="off" />
          <Input label="Phone" dir="ltr" inputMode="tel" placeholder="+212 6…" hint="Always shown left-to-right." />
          <Input label="With error" error="This field is required." required />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="signal" dot>
            Next in line
          </Badge>
          <Badge tone="outline">Outline</Badge>
          <Badge tone="danger" dot>
            Danger
          </Badge>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Surface Dark with a Border Grey outline.</CardDescription>
          </Card>
          <Card padding="lg">
            <CardTitle>Large padding</CardTitle>
            <CardDescription>Used for prominent content blocks.</CardDescription>
          </Card>
        </div>
      </Section>

      <Section title="Dialog">
        <div>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Dialog title"
          description="Native <dialog>: focus trap, Escape and backdrop click close it."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </>
          }
        />
      </Section>

      <Section title="States">
        <div className="grid gap-4 md:grid-cols-3">
          <Card padding="none">
            <LoadingState />
          </Card>
          <Card padding="none">
            <EmptyState description="Optional description." />
          </Card>
          <Card padding="none">
            <ErrorState onRetry={() => undefined} />
          </Card>
        </div>
      </Section>
    </div>
  )
}
