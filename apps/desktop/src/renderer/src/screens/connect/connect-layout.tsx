import type { ReactNode } from 'react'

import { useBrand } from '@/hooks/use-brand'

type TConnectLayoutProps = {
  title: string
  intro?: ReactNode
  children: ReactNode
}

/** The quiet, single-column page for connecting and signing in. */
export const ConnectLayout = ({
  title,
  intro,
  children
}: TConnectLayoutProps) => {
  const { productName } = useBrand()

  return (
    <div className="flex h-screen min-h-180 flex-col bg-background text-foreground antialiased">
      {/* Drags the window, and leaves room for the traffic lights. */}
      <div aria-hidden className="sales-drag-region h-11 flex-none" />
      <main className="flex flex-1 justify-center overflow-y-auto px-6 pt-16 pb-10">
        <div className="flex w-90 flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-body-sm font-semibold text-muted-foreground">
              {productName}
            </span>
            <h1 className="m-0 text-title-xl font-bold">{title}</h1>
            {intro ? (
              <p className="m-0 text-sm text-muted-foreground">{intro}</p>
            ) : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** The message shown above a form's button when the server says no. */
export const FormProblem = ({ message }: { message: string | null }) =>
  message ? (
    <p className="m-0 text-sm text-destructive" role="alert">
      {message}
    </p>
  ) : null
