
/**
 * Date Utility for Seasonal Logic
 */

export function getCurrentDateString(): string {
  return new Date().toISOString().split('T')[0] ?? '' // YYYY-MM-DD
}

export function getCurrentMMDD(): string {
  const now = new Date()
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  return `${m}-${d}`
}

/**
 * Checks if a seasonal date range is active for a given date (default: today).
 * Dates must be in 'MM-DD' format.
 * Handles wrap-around ranges where start > end (e.g. 12-01 to 02-28).
 */
export function isSeasonalActive(start: string | null, end: string | null, checkDateMMDD?: string): boolean {
  if (!start || !end) return true // Always active if no dates
  
  const current = checkDateMMDD ?? getCurrentMMDD()
  
  if (start <= end) {
    // Normal range: 03-01 to 05-31
    return current >= start && current <= end
  } else {
    // Wrap-around: 12-01 to 02-28
    return current >= start || current <= end
  }
}

/**
 * Formats YYYY-MM-DD or MM-DD to DD/MM for display
 */
export function formatDisplayDate(dateStr: string | null): string {
    if (!dateStr) return ''
    // Handle YYYY-MM-DD or MM-DD
    const parts = dateStr.split('-')
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}` // DD/MM
    }
    if (parts.length === 2) {
        return `${parts[1]}/${parts[0]}` // DD/MM
    }
    return dateStr
}
