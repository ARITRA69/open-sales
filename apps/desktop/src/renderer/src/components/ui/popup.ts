/*
 * The look and motion shared by everything that pops up from a control: menus,
 * select lists and small popovers. Radix keeps the element mounted until the
 * closing animation ends, so they fade and shrink back into their trigger.
 */
export const POPUP_CLASS = [
  'z-50 min-w-40 rounded-card bg-popover p-1 text-popover-foreground shadow-(--shadow-menu) outline-none',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150',
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100',
  'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1'
].join(' ')

/** One row in a popup. Rows are 40 tall so they're easy to hit. */
export const POPUP_ITEM_CLASS = [
  'flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-panel px-2 text-sm font-medium whitespace-nowrap text-foreground no-underline outline-none select-none',
  'transition-colors duration-150',
  'data-highlighted:bg-muted data-[selected=true]:bg-muted',
  // Radix and cmdk both set aria-disabled="true", but write data-disabled differently.
  'aria-disabled:cursor-default aria-disabled:text-faint'
].join(' ')
