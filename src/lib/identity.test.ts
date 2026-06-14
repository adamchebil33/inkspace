import { describe, expect, it } from 'vitest'
import { USER_COLORS, cleanName, initials, randomUser } from './identity'

describe('identity', () => {
  it('makes initials from a name', () => {
    expect(initials('Curious Otter')).toBe('CO')
    expect(initials('ada')).toBe('A')
    expect(initials('Mary Jane van Dyke')).toBe('MD')
    expect(initials('   ')).toBe('?')
  })

  it('cleans names', () => {
    expect(cleanName('  Ada   Lovelace ')).toBe('Ada Lovelace')
    expect(cleanName('x'.repeat(100))).toHaveLength(24)
  })

  it('generates a named, coloured user', () => {
    const user = randomUser()
    expect(user.name).toMatch(/^\w+ \w+$/)
    expect(USER_COLORS).toContain(user.color)
  })
})
