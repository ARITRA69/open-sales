import type { TMcpBridge, TMcpTool } from '../../../preload/bridge-types'

/*
 * A pretend MCP server for the browser preview (`?preview=signed-in#/mcp`):
 * the commands as a Mac shows them, one tool connected, and the browser's
 * tools. The real list comes from the main process's tool registry.
 */

const RELAY =
  "'/Applications/Open Sales.app/Contents/MacOS/Open Sales' '/Applications/Open Sales.app/Contents/Resources/stdio-relay.mjs' '/Users/asha/Library/Application Support/Open Sales/mcp-connection.json' 'Open Sales'"

const tool = (
  name: string,
  title: string,
  description: string,
  readOnly = false
): TMcpTool => ({ name, title, description, readOnly })

const BROWSER_TOOLS: TMcpTool[] = [
  tool(
    'browser_tabs',
    'List your browser tabs',
    'Lists the tabs you can use: ones you opened and ones the person handed to you.',
    true
  ),
  tool(
    'browser_open',
    'Open a page in a new tab',
    'Opens a web address in a new tab of yours and waits for it to load.'
  ),
  tool(
    'browser_close',
    'Close one of your tabs',
    'Closes a tab of yours when you’ve finished with it.'
  ),
  tool(
    'browser_navigate',
    'Go somewhere in a tab',
    'Takes one of your tabs to a web address, or back, forward, or reloads it.'
  ),
  tool(
    'browser_read',
    'Read a page’s text',
    'Returns the text a person would read on the page, up to about 20,000 characters at a time.',
    true
  ),
  tool(
    'browser_snapshot',
    'See what’s on a page',
    'Lists the page’s buttons, links, fields, headings and sections, each line as ref role "name".',
    true
  ),
  tool(
    'browser_find',
    'Find something on a page',
    'Finds buttons, links, fields and headings whose name or kind has every word you give, and returns their refs.',
    true
  ),
  tool(
    'browser_click',
    'Click something on a page',
    'Clicks an element by its ref.'
  ),
  tool(
    'browser_type',
    'Type into a field',
    'Types text into a field by its ref, replacing what’s there unless clear is false.'
  ),
  tool(
    'browser_press_key',
    'Press a key',
    'Presses one key in the tab, where the cursor is.'
  ),
  tool(
    'browser_scroll',
    'Scroll a page',
    'Scrolls the page up or down by screens, or brings an element into view by its ref.',
    true
  ),
  tool(
    'browser_screenshot',
    'Take a picture of a page',
    'Returns a picture of what the tab shows now.',
    true
  ),
  tool(
    'browser_wait_for',
    'Wait for a page',
    'Waits until some text shows on the page, or for a number of seconds, up to 10.',
    true
  )
]

/** The pretend MCP server, or null outside the preview. */
export const createPreviewMcp = (search: string): TMcpBridge | null => {
  if (!new URLSearchParams(search).has('preview')) return null

  return {
    getInfo: async () => ({
      serverName: 'open-sales',
      commands: {
        'claude-code': `claude mcp add --scope user open-sales -e ELECTRON_RUN_AS_NODE=1 -- ${RELAY}`,
        codex: `codex mcp add open-sales --env ELECTRON_RUN_AS_NODE=1 -- ${RELAY}`
      },
      connected: ['Claude Code'],
      toolGroups: [
        {
          title: 'Browser',
          about:
            'Opens, reads and works in web pages in the app’s browser, in tabs of its own.',
          more: {
            label: 'What AI may do in the browser',
            href: '#/browser/connect'
          },
          tools: BROWSER_TOOLS
        }
      ]
    })
  }
}
