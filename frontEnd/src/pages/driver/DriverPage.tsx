import { DriverExperience } from '@/features/driver-offers/components/DriverExperience'
import { useAuth } from '@/features/auth'

export function DriverPage() {
  const auth = useAuth()
  if (auth.status !== 'authenticated') return null
  return <DriverExperience driverId="me" onSignOut={() => void auth.signOut()} />
}
