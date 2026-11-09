const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

type TJoinPageArgs = {
  // Null when the link is wrong, reset or turned off.
  workspaceName: string | null
  isValid: boolean
  joinUrl: string
  // The desktop app's link scheme, e.g. "open-sales" (APP_URL_SCHEME).
  appScheme: string
}

/**
 * The one web page the server has: what a join link opens in a browser. It
 * hands the link to the desktop app, and says how to paste it in by hand.
 */
export const renderJoinPage = ({
  workspaceName,
  isValid,
  joinUrl,
  appScheme
}: TJoinPageArgs) => {
  const appUrl = `${appScheme}://join?link=${encodeURIComponent(joinUrl)}`
  const team = escapeHtml(workspaceName ?? 'the team')
  const body = isValid
    ? `<h1>Join ${team}</h1>
      <p>Open the desktop app to join. You’ll pick a name and password there.</p>
      <a class="button" href="${escapeHtml(appUrl)}">Open the app</a>
      <p class="small">Nothing happened? Open the app yourself and paste this link where it asks for your server:</p>
      <input readonly value="${escapeHtml(joinUrl)}" onclick="this.select()" aria-label="Join link">`
    : `<h1>This link doesn’t work any more</h1>
      <p>It may have been reset or turned off. Ask your admin for the new one.</p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${isValid ? `Join ${team}` : 'Join link'}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f6f6; color: #1c1c1c;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { box-sizing: border-box; width: min(400px, calc(100% - 32px)); background: #fff; border-radius: 12px; padding: 28px;
    box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 8px 26px rgba(0,0,0,.09); }
  h1 { font-size: 20px; margin: 0 0 6px; letter-spacing: -0.02em; }
  p { margin: 0 0 16px; color: #696969; }
  .small { font-size: 12px; margin: 16px 0 8px; }
  .button { display: block; text-align: center; background: #1c1c1c; color: #fff; text-decoration: none;
    font-weight: 600; border-radius: 999px; padding: 9px 16px; }
  .button:hover { background: #383838; }
  input { box-sizing: border-box; width: 100%; font: inherit; font-size: 12px; padding: 7px 10px; border: 0;
    border-radius: 8px; background: #f6f6f6; color: #1c1c1c; }
</style>
</head>
<body><main>${body}</main></body>
</html>`
}
