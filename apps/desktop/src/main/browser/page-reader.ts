import type { TRefs } from './browser-controller'
import type { TCdp } from './cdp'
import { oneLine } from './fence'
import {
  attributesOf,
  protectedKind,
  type TFieldFacts
} from './protected-fields'

/*
 * How AI reads a page: its text, and a list of the things on it that can be
 * clicked or typed into. Each of those gets a short reference (`e12`) that
 * stays the same between readings until the page goes somewhere else. The
 * list comes from the browser's accessibility tree, so no script runs in the
 * page to make it.
 */

/** One accessibility node, as the browser reports it. */
export type TAxNode = {
  nodeId: string
  ignored?: boolean
  role?: { value?: string }
  name?: { value?: string }
  value?: { value?: unknown }
  properties?: Array<{ name: string; value?: { value?: unknown } }>
  childIds?: string[]
  backendDOMNodeId?: number
}

/** One line of what AI is shown. */
export type TSnapshotLine = {
  // Only things AI can act on have one.
  ref: string | null
  role: string
  name: string
  value: string | null
  states: string[]
  depth: number
}

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'option',
  'treeitem',
  'listbox'
])

// Shown for bearings, with no reference.
const LANDMARK_ROLES = new Set([
  'heading',
  'main',
  'navigation',
  'banner',
  'contentinfo',
  'search',
  'form',
  'dialog',
  'alertdialog',
  'alert',
  'Iframe'
])

/** Roles whose value is what's typed in them. */
export const TEXT_ROLES = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton'
])

const STATE_PROPERTIES = [
  'disabled',
  'checked',
  'expanded',
  'selected',
  'required'
]

const MAX_NAME = 80

const refFor = (refs: TRefs, backendNodeId: number) => {
  const known = refs.byNode.get(backendNodeId)
  if (known) return known
  const ref = `e${refs.next++}`
  refs.byNode.set(backendNodeId, ref)
  refs.byRef.set(ref, backendNodeId)
  return ref
}

const statesOf = (node: TAxNode) =>
  (node.properties ?? []).flatMap((property) => {
    if (!STATE_PROPERTIES.includes(property.name)) return []
    const value = property.value?.value
    if (value === true || value === 'true') return [property.name]
    if (property.name === 'checked' && value === 'mixed')
      return ['partly checked']
    if (
      property.name === 'expanded' &&
      (value === false || value === 'false')
    ) {
      return ['collapsed']
    }
    return []
  })

/**
 * Turns the accessibility tree into the lines AI sees. `protectedNodes` are
 * the fields it may not type into: their values are left out.
 */
export const buildSnapshot = (
  nodes: TAxNode[],
  refs: TRefs,
  protectedNodes: Set<number> = new Set()
): TSnapshotLine[] => {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const childIds = new Set(nodes.flatMap((node) => node.childIds ?? []))
  const roots = nodes.filter((node) => !childIds.has(node.nodeId))
  const lines: TSnapshotLine[] = []

  const visit = (node: TAxNode, depth: number) => {
    const role = node.role?.value ?? ''
    const name = oneLine(String(node.name?.value ?? ''), MAX_NAME)
    const isInteractive = INTERACTIVE_ROLES.has(role)
    const isKept =
      !node.ignored &&
      (isInteractive ||
        (LANDMARK_ROLES.has(role) &&
          (name ||
            role === 'Iframe' ||
            role === 'main' ||
            role === 'dialog' ||
            role === 'alertdialog' ||
            role === 'form')))

    if (isKept) {
      const backendNodeId = node.backendDOMNodeId
      const isProtected =
        backendNodeId !== undefined && protectedNodes.has(backendNodeId)
      const rawValue = node.value?.value
      lines.push({
        ref:
          isInteractive && backendNodeId !== undefined
            ? refFor(refs, backendNodeId)
            : null,
        role: role === 'Iframe' ? 'frame' : role,
        name,
        value:
          isProtected || rawValue === undefined || rawValue === ''
            ? null
            : oneLine(String(rawValue), MAX_NAME),
        states: [
          ...statesOf(node),
          ...(isProtected ? ['AI can’t type here'] : []),
          ...(role === 'Iframe' ? ['embedded frame, not read'] : [])
        ],
        depth
      })
    }
    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId)
      if (child) visit(child, isKept ? depth + 1 : depth)
    }
  }
  for (const root of roots) visit(root, 0)
  return lines
}

/** A line as text: `  e12 link "Pricing" [expanded]`. */
export const formatLine = (line: TSnapshotLine) =>
  [
    '  '.repeat(Math.min(line.depth, 6)) + (line.ref ?? '-'),
    line.role,
    line.name ? JSON.stringify(line.name) : '',
    line.value === null ? '' : `value=${JSON.stringify(line.value)}`,
    line.states.length > 0 ? `[${line.states.join(', ')}]` : ''
  ]
    .filter(Boolean)
    .join(' ')

/** The lines that mention every word asked for. */
export const findLines = (lines: TSnapshotLine[], query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return lines.filter((line) => {
    const text = `${line.role} ${line.name} ${line.value ?? ''}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
}

/** What the page's own markup says about one element. */
export const describeField = async (
  cdp: TCdp,
  backendNodeId: number
): Promise<TFieldFacts> => {
  const { node } = await cdp.send<{
    node: { nodeName: string; attributes?: string[] }
  }>('DOM.describeNode', { backendNodeId })
  const attributes = attributesOf(node.attributes)
  const tag = node.nodeName.toLowerCase()
  return {
    tag,
    type: attributes.type ?? null,
    autocomplete: attributes.autocomplete ?? null,
    name: attributes.name ?? null,
    id: attributes.id ?? null,
    label: attributes['aria-label'] ?? attributes.placeholder ?? null,
    // A frame is a different page: what's focused inside it can't be seen.
    inOtherSiteFrame: tag === 'iframe' || tag === 'frame'
  }
}

// Asking about every field one at a time is slow on a page with hundreds.
const MAX_FIELDS_CHECKED = 80

/** The page's things to click and type into, with references. */
export const readSnapshot = async (cdp: TCdp, refs: TRefs) => {
  const { nodes } = await cdp.send<{ nodes: TAxNode[] }>(
    'Accessibility.getFullAXTree'
  )
  const fields = nodes
    .filter(
      (node) =>
        !node.ignored &&
        TEXT_ROLES.has(node.role?.value ?? '') &&
        node.backendDOMNodeId !== undefined
    )
    .map((node) => node.backendDOMNodeId!)

  const protectedNodes = new Set<number>(fields.slice(MAX_FIELDS_CHECKED))
  await Promise.all(
    fields.slice(0, MAX_FIELDS_CHECKED).map(async (backendNodeId) => {
      try {
        if (protectedKind(await describeField(cdp, backendNodeId))) {
          protectedNodes.add(backendNodeId)
        }
      } catch {
        // If it can't be checked, its value isn't shown.
        protectedNodes.add(backendNodeId)
      }
    })
  )
  return buildSnapshot(nodes, refs, protectedNodes)
}

/**
 * A place to run small reading scripts beside the page, where the page's own
 * scripts can't change what they see.
 */
export const isolatedContext = async (cdp: TCdp): Promise<number> => {
  const { frameTree } = await cdp.send<{
    frameTree: { frame: { id: string } }
  }>('Page.getFrameTree')
  const { executionContextId } = await cdp.send<{ executionContextId: number }>(
    'Page.createIsolatedWorld',
    { frameId: frameTree.frame.id, worldName: 'reader' }
  )
  return executionContextId
}

/** The text a person would read on the page. */
export const readText = async (cdp: TCdp): Promise<string> => {
  const contextId = await isolatedContext(cdp)
  const { result } = await cdp.send<{ result: { value?: unknown } }>(
    'Runtime.evaluate',
    {
      expression: 'document.body ? document.body.innerText : ""',
      contextId,
      returnByValue: true
    }
  )
  return typeof result.value === 'string' ? result.value : ''
}
