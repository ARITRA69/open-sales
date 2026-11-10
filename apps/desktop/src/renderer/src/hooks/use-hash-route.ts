import { useEffect, useState } from 'react'

const readPath = () =>
  window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((segment) => segment !== '')

const readRoute = <TRoute extends string>(
  routes: readonly TRoute[],
  fallback: TRoute
): TRoute => {
  const [id] = readPath()
  return routes.find((route) => route === id) ?? fallback
}

/**
 * The page named first in the address after `#/`, such as `#/pipeline` or
 * `#/accounts/<id>`. Links and the back and forward buttons change it;
 * anything unknown is `fallback`.
 */
export const useHashRoute = <TRoute extends string>(
  routes: readonly TRoute[],
  fallback: TRoute
) => {
  const [route, setRoute] = useState(() => readRoute(routes, fallback))

  useEffect(() => {
    const handleChange = () => setRoute(readRoute(routes, fallback))
    window.addEventListener('hashchange', handleChange)
    return () => window.removeEventListener('hashchange', handleChange)
  }, [routes, fallback])

  return route
}

/**
 * What follows the page in the address: `['<id>']` for `#/accounts/<id>`,
 * nothing for `#/accounts`. A page reads its own record or section from it.
 */
export const useHashPath = (): readonly string[] => {
  const [path, setPath] = useState(() => readPath().slice(1))

  useEffect(() => {
    const handleChange = () => setPath(readPath().slice(1))
    window.addEventListener('hashchange', handleChange)
    return () => window.removeEventListener('hashchange', handleChange)
  }, [])

  return path
}
