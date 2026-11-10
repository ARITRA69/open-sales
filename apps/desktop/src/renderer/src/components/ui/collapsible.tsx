import type { ComponentProps } from 'react'

import { Collapsible as CollapsiblePrimitive } from 'radix-ui'

/** A section that opens and closes under its trigger. */
export const Collapsible = (
  props: ComponentProps<typeof CollapsiblePrimitive.Root>
) => <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />

export const CollapsibleTrigger = (
  props: ComponentProps<typeof CollapsiblePrimitive.Trigger>
) => <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />

export const CollapsibleContent = (
  props: ComponentProps<typeof CollapsiblePrimitive.Content>
) => <CollapsiblePrimitive.Content data-slot="collapsible-content" {...props} />
