import { useEffect, useRef, useState } from 'react'

import { Globe02Icon } from '@hugeicons/core-free-icons'

import { Button } from '@/components/ui/button'
import { StatePanel } from '@/components/ui/state-panel'
import { useBrand } from '@/hooks/use-brand'

import type {
  TBrowserBridge,
  TBrowserTab
} from '../../../../../preload/bridge-types'
import { useAppOverlay, useLivePageArea } from './use-browser'

type TBrowserWebAreaProps = {
  bridge: TBrowserBridge
  tab: TBrowserTab | null
  // False in the browser preview, where no real page is drawn here.
  hasLiveTabs: boolean
  onNewTab: () => void
  onReload: () => void
}

type TPicture = { of: string; src: string | null }

/**
 * Where the page shows. In the app, the live page is a view laid exactly
 * over this area; this component says where that is, and what to show when
 * there's no page: a start panel for a new tab, or why a page didn't load.
 */
export const BrowserWebArea = ({
  bridge,
  tab,
  hasLiveTabs,
  onNewTab,
  onReload
}: TBrowserWebAreaProps) => {
  const { productName } = useBrand()
  const areaRef = useRef<HTMLDivElement>(null)
  const coverId = useAppOverlay()
  const [picture, setPicture] = useState<TPicture | null>(null)

  const hasPage = Boolean(tab && tab.url && !tab.problem)
  // What a picture is of: this tab's page, and for a live page, this one
  // time a menu or dialog covered it.
  const pictureKey = hasPage
    ? hasLiveTabs
      ? coverId === null
        ? null
        : `${tab!.id} cover ${coverId}`
      : `${tab!.id} ${tab!.url}`
    : null

  useEffect(() => {
    if (pictureKey === null) return
    let isCurrent = true
    void bridge.captureStill().then((src) => {
      if (isCurrent) setPicture({ of: pictureKey, src })
    })
    return () => {
      isCurrent = false
    }
  }, [bridge, pictureKey])

  const isPictureReady = pictureKey !== null && picture?.of === pictureKey
  // The live page gives way to its picture only once the picture is ready,
  // so the area never flashes empty.
  useLivePageArea(bridge, areaRef, hasPage && hasLiveTabs && !isPictureReady)

  return (
    <div
      ref={areaRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      data-slot="browser-web-area"
    >
      {hasPage ? (
        isPictureReady && picture?.src ? (
          <img
            alt=""
            className="size-full object-cover object-top-left"
            src={picture.src}
          />
        ) : null
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          {tab?.problem ? (
            <StatePanel
              action="Try again"
              body={tab.problem}
              className="w-full max-w-120"
              kind="error"
              title="This page didn’t load"
              onAction={onReload}
            />
          ) : (
            <section className="flex w-full max-w-120 flex-col items-center gap-3 text-center">
              <StatePanel
                action={tab ? '' : 'New tab'}
                body={`Look up a company, read a pricing page or check a profile without leaving ${productName}. Your sign-ins stay on this computer.`}
                className="w-full"
                icon={Globe02Icon}
                title={
                  !tab
                    ? 'No tabs open'
                    : tab.control === 'ai'
                      ? 'Nothing here yet'
                      : 'Search or type an address above'
                }
                onAction={onNewTab}
              />
              <p className="m-0 text-body-sm text-muted-foreground">
                Your own Claude Code or Codex can use this browser too, in tabs
                you give it.{' '}
                <Button href="#/browser/connect" variant="link">
                  Connect AI
                </Button>
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
