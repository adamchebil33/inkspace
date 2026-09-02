import { setTheme, useTheme } from '../lib/theme'
import { MoonIcon, SunIcon } from './icons'

/** Switches between the light and dark theme and remembers the choice. */
export function ThemeToggle() {
  const theme = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="tool"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
