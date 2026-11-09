/*
 * How the product presents itself to its users, so a self-hoster can rebrand
 * it. The desktop app's brand.config.json gives the defaults; the server's
 * branding settings will override them once the app connects. See "White
 * label" in CLAUDE.md.
 */
export type TBrand = {
  // Shown wherever the app names itself: window title, sidebar, sign-in.
  productName: string
}
