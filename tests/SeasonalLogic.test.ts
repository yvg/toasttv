
import { describe, expect, test } from 'bun:test'
import { isSeasonalActive } from '../src/utils/date'

describe('Seasonal Logic (isSeasonalActive)', () => {
  test('returns true for permanent items (null dates)', () => {
    expect(isSeasonalActive(null, null)).toBe(true)
  })

  test('handles standard ranges (Start <= End)', () => {
    const start = '03-01'
    const end = '05-31'

    expect(isSeasonalActive(start, end, '04-15')).toBe(true) // Middle
    expect(isSeasonalActive(start, end, '03-01')).toBe(true) // Start boundary
    expect(isSeasonalActive(start, end, '05-31')).toBe(true) // End boundary
    expect(isSeasonalActive(start, end, '02-28')).toBe(false) // Before
    expect(isSeasonalActive(start, end, '06-01')).toBe(false) // After
  })

  test('handles wrap-around ranges (Start > End) e.g. Winter', () => {
    const start = '12-01'
    const end = '02-28'

    expect(isSeasonalActive(start, end, '12-01')).toBe(true) // Start boundary
    expect(isSeasonalActive(start, end, '12-31')).toBe(true) // Late year
    expect(isSeasonalActive(start, end, '01-01')).toBe(true) // Early year
    expect(isSeasonalActive(start, end, '02-28')).toBe(true) // End boundary
    
    expect(isSeasonalActive(start, end, '11-30')).toBe(false) // Before start
    expect(isSeasonalActive(start, end, '03-01')).toBe(false) // After end
  })
})
