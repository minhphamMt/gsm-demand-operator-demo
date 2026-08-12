import { DriverRealtime } from './data/DriverRealtime'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PhoneShell } from './components/PhoneShell'
import { Scrim } from './components/Scrim'
import { StatusBar } from './components/StatusBar'
import { BonusDetailScreen } from './screens/BonusDetailScreen'
import { MapScreen } from './screens/MapScreen'
import { NavigateScreen } from './screens/NavigateScreen'
import { LoginScreen } from './screens/LoginScreen'
import { AppInfoSheet } from './sheets/AppInfoSheet'
import { DemandSheet } from './sheets/DemandSheet'
import { DriveTimeSheet } from './sheets/DriveTimeSheet'
import { EarningsSheet } from './sheets/EarningsSheet'
import { DriverAppProvider } from './state/DriverAppContext'
import { RouteProvider } from './state/RouteContext'
import { SelectedCampaignProvider } from './state/SelectedCampaignContext'
import { useAuth } from './state/AuthProvider'
import './driver-app.css'

function Notice({ title, body, onSignOut }: { title: string; body: string; onSignOut?: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 70,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 10,
        padding: '0 28px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ font: "700 18px/1.35 'Be Vietnam Pro',sans-serif", color: '#1b2225' }}>{title}</div>
      <div style={{ font: "400 13.5px/1.55 'Be Vietnam Pro',sans-serif", color: '#5a6266', whiteSpace: 'pre-line' }}>{body}</div>
      {onSignOut && (
        <button
          onClick={onSignOut}
          style={{
            marginTop: 12,
            height: 46,
            borderRadius: 24,
            border: '1.6px solid #12b8c6',
            background: '#fff',
            font: "600 15px/1 'Be Vietnam Pro',sans-serif",
            color: '#0aa7b4',
            cursor: 'pointer',
          }}
        >
          Đăng xuất
        </button>
      )}
    </div>
  )
}

function DriverScreens() {
  return (
    <>
      <DriverRealtime />
      <MapScreen />
      <NavigateScreen />
      <BonusDetailScreen />
      <Scrim />
      <AppInfoSheet />
      <DriveTimeSheet />
      <EarningsSheet />
      <DemandSheet />
    </>
  )
}

function Gate() {
  const { status, profileError, signOut } = useAuth()

  if (status === 'loading') {
    return (
      <PhoneShell caption="Đang tải…">
        <Notice title="Đang tải…" body="Đang khôi phục phiên đăng nhập." />
      </PhoneShell>
    )
  }

  if (status === 'signedOut') {
    return (
      <PhoneShell caption="00 · Đăng nhập">
        <StatusBar />
        <LoginScreen />
      </PhoneShell>
    )
  }

  if (status === 'notADriver') {
    return (
      <PhoneShell caption="Sai vai trò">
        <Notice
          title="Tài khoản này không phải tài xế"
          body={'Ứng dụng này chỉ dành cho hồ sơ có role = DRIVER và đang hoạt động.\n\nTài khoản điều hành dùng Operator Console.'}
          onSignOut={() => void signOut()}
        />
      </PhoneShell>
    )
  }

  if (profileError) {
    return (
      <PhoneShell caption="Không đọc được hồ sơ">
        <Notice title="Không đọc được hồ sơ tài xế" body={profileError} onSignOut={() => void signOut()} />
      </PhoneShell>
    )
  }

  return (
    <PhoneShell>
      <StatusBar />
      <DriverScreens />
    </PhoneShell>
  )
}

export function DriverApp() {
  return (
    <ErrorBoundary>
      <DriverAppProvider>
        <RouteProvider>
          <SelectedCampaignProvider>
            <Gate />
          </SelectedCampaignProvider>
        </RouteProvider>
      </DriverAppProvider>
    </ErrorBoundary>
  )
}
