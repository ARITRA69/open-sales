import { useEffect, useState } from 'react'

const readRoute = <TRoute extends string>(
  routes: readonly TRoute[],
  fallback: TRoute
): TRoute => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return routes.find((route) => route === id) ?? fallback
}

/**
 * The page named in the address after `#/`, such as `#/pipeline`. Links and
 * the back and forward buttons change it; anything unknown is `fallback`.
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
