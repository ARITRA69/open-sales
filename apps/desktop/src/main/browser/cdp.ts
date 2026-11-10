import { ToolError } from './fence'

/*
 * The Chrome DevTools Protocol, which is how AI reads and drives a tab. It
 * is attached only while a tab is AI's, and every command has a time limit:
 * a page that never answers must not hang the AI tool's call.
 */

/** What the rest of the browser code needs from the protocol. */
export type TCdp = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- protocol results are untyped
  send: <TResult = any>(method: string, params?: object) => Promise<TResult>
  // Returns a function that stops listening.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- protocol events are untyped
  onEvent: (listener: (method: string, params: any) => void) => () => void
}

/** Electron's `webContents.debugger`, or a fake in tests. */
export type TDebugger = {
  attach: (protocolVersion?: string) => void
  detach: () => void
  isAttached: () => boolean
  sendCommand: (method: string, params?: object) => Promise<unknown>
  on: (
    event: 'message' | 'detach',
    listener: (...args: never[]) => void
  ) => unknown
  removeListener: (
    event: 'message' | 'detach',
    listener: (...args: never[]) => void
  ) => unknown
}

const COMMAND_TIMEOUT_MS = 8000

export const createCdp = (
  target: TDebugger,
  timeoutMs: number = COMMAND_TIMEOUT_MS
) => {
  const listeners = new Set<(method: string, params: unknown) => void>()
  const detachListeners = new Set<() => void>()

  const handleMessage = (_event: unknown, method: string, params: unknown) => {
    for (const listener of [...listeners]) listener(method, params)
  }
  const unhook = () => {
    // Whoever connects next sets the page up again from scratch.
    listeners.clear()
    target.removeListener('message', handleMessage as never)
    target.removeListener('detach', handleDetach as never)
  }
  function handleDetach() {
    unhook()
    for (const listener of [...detachListeners]) listener()
  }

  const cdp: TCdp = {
    send: <TResult>(method: string, params?: object) =>
      new Promise<TResult>((resolve, reject) => {
        if (!target.isAttached()) {
          reject(new ToolError('The tab isn’t connected for AI right now.'))
          return
        }
        const timer = setTimeout(
          () =>
            reject(
              new ToolError(
                'The page didn’t answer in time. It may be busy; check it before trying again.'
              )
            ),
          timeoutMs
        )
        target.sendCommand(method, params).then(
          (result) => {
            clearTimeout(timer)
            resolve(result as TResult)
          },
          (error: unknown) => {
            clearTimeout(timer)
            reject(
              error instanceof ToolError
                ? error
                : new ToolError(
                    `The page refused that (${method}): ${error instanceof Error ? error.message : String(error)}`
                  )
            )
          }
        )
      }),
    onEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }

  return {
    cdp,
    isAttached: () => target.isAttached(),
    /** Connects. False when something else, such as DevTools, holds the tab. */
    attach: () => {
      if (target.isAttached()) return true
      try {
        target.attach('1.3')
      } catch {
        return false
      }
      target.on('message', handleMessage as never)
      target.on('detach', handleDetach as never)
      return true
    },
    detach: () => {
      unhook()
      if (!target.isAttached()) return
      try {
        target.detach()
      } catch {
        // Already gone with its page.
      }
    },
    /** The connection dropped without being asked to, e.g. DevTools opened. */
    onDetach: (listener: () => void) => {
      detachListeners.add(listener)
      return () => detachListeners.delete(listener)
    }
  }
}

export type TCdpConnection = ReturnType<typeof createCdp>
