import { useRef, type ReactNode } from 'react'

import { AlertDialog, Dialog as DialogPrimitive } from 'radix-ui'

import { useLocale } from '@/hooks/use-locale'
import { cn } from '@/lib/utils'

import { Button } from './button'

const OVERLAY_CLASS = cn(
  'fixed inset-0 z-40 bg-scrim',
  'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
  'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0'
)

const CONTENT_CLASS = cn(
  'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] max-w-[calc(100vw-48px)] -translate-1/2 flex-col overflow-y-auto',
  'rounded-modal bg-background p-5 text-foreground shadow-(--shadow-dialog) outline-none',
  'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=open]:zoom-in-[0.97]',
  'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97]'
)

const TITLE_CLASS = 'm-0 text-heading font-bold'
const DESCRIPTION_CLASS = 'm-0 text-body-lg text-muted-foreground'

/**
 * These dialogs are opened by buttons outside them, which Radix doesn't know
 * to return focus to. This remembers what had focus and puts it back on close.
 */
const useFocusReturn = () => {
  const previousFocus = useRef<HTMLElement | null>(null)

  return {
    onOpenAutoFocus: () => {
      previousFocus.current = document.activeElement as HTMLElement | null
    },
    onCloseAutoFocus: (event: Event) => {
      if (!previousFocus.current?.isConnected) return
      event.preventDefault()
      previousFocus.current.focus()
    }
  }
}

type TDialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  // Buttons along the bottom right: Cancel first, then the main action.
  footer?: ReactNode
  // 720 wide instead of 560.
  wide?: boolean
  className?: string
}

/** A form or a decision that needs the person's full attention. */
export const Dialog = ({
  open,
  defaultOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
  className
}: TDialogProps) => {
  const focusReturn = useFocusReturn()

  return (
    <DialogPrimitive.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY_CLASS} />
        <DialogPrimitive.Content
          {...focusReturn}
          // Tells Radix there's deliberately no description to point at.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            CONTENT_CLASS,
            'gap-4',
            wide ? 'w-160' : 'w-120',
            className
          )}
          data-slot="dialog"
        >
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className={TITLE_CLASS}>
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className={DESCRIPTION_CLASS}>
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          {children}
          {footer ? (
            <div className="flex justify-end gap-2">{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

type TConfirmDialogProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  // A red button, for things that can't be undone.
  danger?: boolean
  // While the action runs the dialog stays open and the button shows a spinner.
  busy?: boolean
  onConfirm?: () => void
  onCancel?: () => void
}

/** Asks "are you sure?" before something that matters. */
export const ConfirmDialog = ({
  open,
  defaultOpen,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = true,
  busy = false,
  onConfirm,
  onCancel
}: TConfirmDialogProps) => {
  const { t } = useLocale()

  const focusReturn = useFocusReturn()

  return (
    <AlertDialog.Root
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={OVERLAY_CLASS} />
        <AlertDialog.Content
          {...focusReturn}
          className={cn(CONTENT_CLASS, 'w-100 gap-1.5')}
          data-slot="confirm-dialog"
        >
          <AlertDialog.Title className={TITLE_CLASS}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={DESCRIPTION_CLASS}>
            {body}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button size="lg" variant="secondary" onClick={onCancel}>
                {cancelLabel ?? t('Cancel')}
              </Button>
            </AlertDialog.Cancel>
            <Button
              loading={busy}
              size="lg"
              variant={danger ? 'danger' : 'primary'}
              onClick={onConfirm}
            >
              {confirmLabel ?? t('Delete')}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
