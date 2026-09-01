import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

import { AppThemeContext, type AppTheme } from './appTheme'

const THEME_STORAGE_KEY = 'novafour-ops-theme'

function readStoredTheme(): AppTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme)

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // The in-memory state remains usable when localStorage is unavailable.
    }

    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        setTheme(event.newValue === 'dark' ? 'dark' : 'light')
      }
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}
