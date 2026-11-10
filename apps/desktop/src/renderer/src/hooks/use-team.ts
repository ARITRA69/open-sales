import { useCallback, useEffect, useState } from 'react'

import type { TJoinLink, TMember } from '@open-sales/shared'

import type {
  TOpenSalesBridge,
  TTeamResult
} from '../../../preload/bridge-types'

// How often an admin's app checks for people waiting to join.
const CHECK_EVERY_MS = 15_000

type TTeamBridge = TOpenSalesBridge['team']

/**
 * An admin's view of the team: the join link and everyone on the server,
 * waiting people first. `undefined` means still loading. Checks again on an
 * interval and when the window comes back into focus.
 */
export const useTeam = (bridge: TTeamBridge | null, isAdmin: boolean) => {
  const [joinLink, setJoinLink] = useState<TJoinLink | null | undefined>()
  const [members, setMembers] = useState<TMember[] | undefined>()
  const [problem, setProblem] = useState<string | null>(null)

  const take = useCallback(<TData>(result: TTeamResult<TData>) => {
    if (result.ok) {
      setProblem(null)
      return result.data
    }
    setProblem(result.message)
    return undefined
  }, [])

  const loadMembers = useCallback(async () => {
    if (!bridge || !isAdmin) return
    const next = take(await bridge.listMembers())
    if (next) setMembers(next)
  }, [bridge, isAdmin, take])

  useEffect(() => {
    if (!bridge || !isAdmin) return
    let isCurrent = true
    // State is only set in these callbacks, once the main process answers.
    void bridge.getJoinLink().then((result) => {
      if (!isCurrent) return
      const next = take(result)
      if (next !== undefined) setJoinLink(next)
    })
    const lookAtMembers = () =>
      void bridge.listMembers().then((result) => {
        if (!isCurrent) return
        const next = take(result)
        if (next) setMembers(next)
      })
    lookAtMembers()
    const timer = setInterval(lookAtMembers, CHECK_EVERY_MS)
    window.addEventListener('focus', lookAtMembers)
    return () => {
      isCurrent = false
      clearInterval(timer)
      window.removeEventListener('focus', lookAtMembers)
    }
  }, [bridge, isAdmin, take])

  /** Runs a join link change and shows its result, or its problem. */
  const changeLink = async (action: Promise<TTeamResult<TJoinLink | null>>) => {
    const next = take(await action)
    if (next !== undefined) setJoinLink(next)
    return next !== undefined
  }

  return {
    joinLink,
    members,
    pending: members?.filter((member) => member.status === 'pending') ?? [],
    problem,
    // A new link with this trusted domain; the old link stops working.
    resetJoinLink: (allowedDomain: string | null) =>
      bridge ? changeLink(bridge.createJoinLink({ allowedDomain })) : false,
    setTrustedDomain: (allowedDomain: string | null) =>
      bridge ? changeLink(bridge.updateJoinLink({ allowedDomain })) : false,
    turnOffJoinLink: async () => {
      if (!bridge) return
      if (take(await bridge.disableJoinLink()) !== undefined) setJoinLink(null)
    },
    decide: async (memberId: string, decision: 'approve' | 'decline') => {
      if (!bridge) return
      take(await bridge.decideMember(memberId, decision))
      await loadMembers()
    },
    // Looks at the team again, after a role or status changed elsewhere.
    reload: loadMembers
  }
}

export type TTeamControls = ReturnType<typeof useTeam>
