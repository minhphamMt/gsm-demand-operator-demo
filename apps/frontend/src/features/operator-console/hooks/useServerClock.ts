import { useEffect, useState } from 'react'

export function useServerClock(serverTime: string | undefined, isServerUnavailable: boolean) {
  const [serverNow, setServerNow] = useState<string>()

  useEffect(() => {
    if (!serverTime && !isServerUnavailable) return
    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN
    const clientStartedAt = Date.now()
    const serverStartedAt = Number.isFinite(parsedServerTime) ? parsedServerTime : clientStartedAt
    const serverOffsetMs = serverStartedAt - clientStartedAt
    const synchronize = () => setServerNow(new Date(Date.now() + serverOffsetMs).toISOString())
    synchronize()
    const timer = window.setInterval(synchronize, 1_000)
    return () => window.clearInterval(timer)
  }, [isServerUnavailable, serverTime])

  return serverNow
}
