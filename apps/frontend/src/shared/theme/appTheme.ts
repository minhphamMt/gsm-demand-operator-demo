import { createContext } from 'react'

export type AppTheme = 'dark' | 'light'

export type AppThemeContextValue = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

export const AppThemeContext = createContext<AppThemeContextValue | undefined>(undefined)
