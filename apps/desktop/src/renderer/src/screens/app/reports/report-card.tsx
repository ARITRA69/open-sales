import { useId, type ReactNode } from 'react'

import { SparklesIcon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'

type TReportCardProps = {
  title: string
  // What the chart counts, and the filters it reflects.
  note: string
  // Opens the Ask panel about this chart.
  onAsk: () => void
  children: ReactNode
}

/** One chart with its table of numbers, and a way to ask AI about it. */
export const ReportCard = ({
  title,
  note,
  onAsk,
  children
}: TReportCardProps) => {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-card bg-background p-4 shadow-(--shadow-tile)"
      data-slot="report-card"
    >
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold" id={titleId}>
            {title}
          </h2>
          <p className="m-0 text-body-sm text-muted-foreground">{note}</p>
        </div>
        <Button
          leadIcon={SparklesIcon}
          size="sm"
          variant="secondary"
          onClick={onAsk}
        >
          Ask about this
        </Button>
      </header>
      {children}
    </section>
  )
}

type TCurrencyNoteProps = {
  currencies: string[]
  currency: string
  onCurrencyChange: (currency: string) => void
}

/**
 * Shown only when deals are in more than one currency: amounts are never
 * converted, so the charts draw one currency at a time.
 */
export const CurrencyNote = ({
  currencies,
  currency,
  onCurrencyChange
}: TCurrencyNoteProps) =>
  currencies.length < 2 ? null : (
    <div
      className="flex flex-wrap items-center gap-3 rounded-card bg-muted px-3 py-2 text-sm"
      data-slot="currency-note"
    >
      <span className="min-w-0 flex-1">
        These deals are in {currencies.length} currencies. Amounts aren’t
        converted: the tables show each currency, and the charts show one at a
        time.
      </span>
      <Tabs
        active={currencies.indexOf(currency)}
        items={currencies}
        label="Currency for the charts"
        size="sm"
        variant="segmented"
        onChange={(_index, picked) => onCurrencyChange(picked)}
      />
    </div>
  )
