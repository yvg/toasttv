/**
 * ShuffleDeck Tests
 * 
 * Tests for the shuffle deck utility.
 */

import { describe, expect, test } from 'bun:test'
import { ShuffleDeck } from '../src/utils/ShuffleDeck'

describe('ShuffleDeck', () => {
  test('draw() returns items from deck', () => {
    const deck = new ShuffleDeck([1, 2, 3])
    
    const drawn = new Set<number>()
    for (let i = 0; i < 3; i++) {
      const item = deck.draw()
      expect(item).not.toBeNull()
      drawn.add(item as number)
    }
    
    // All items should have been drawn
    expect(drawn.size).toBe(3)
    expect(drawn.has(1)).toBe(true)
    expect(drawn.has(2)).toBe(true)
    expect(drawn.has(3)).toBe(true)
  })

  test('draw() reshuffles when deck is empty', () => {
    const deck = new ShuffleDeck([1, 2])
    
    // Draw all items
    deck.draw()
    deck.draw()
    expect(deck.remaining).toBe(0)
    
    // Next draw should reshuffle and return an item
    const item = deck.draw()
    expect(item).not.toBeNull()
    expect([1, 2]).toContain(item as number)
  })

  test('draw() returns null for empty universe', () => {
    const deck = new ShuffleDeck<number>([])
    
    expect(deck.draw()).toBeNull()
  })

  test('remaining tracks deck size', () => {
    const deck = new ShuffleDeck([1, 2, 3, 4])
    expect(deck.remaining).toBe(4)
    
    deck.draw()
    expect(deck.remaining).toBe(3)
    
    deck.draw()
    expect(deck.remaining).toBe(2)
  })

  test('reshuffle() resets the deck', () => {
    const deck = new ShuffleDeck([1, 2, 3])
    
    deck.draw()
    deck.draw()
    expect(deck.remaining).toBe(1)
    
    deck.reshuffle()
    expect(deck.remaining).toBe(3)
  })

  test('setItems() updates universe and reshuffles', () => {
    const deck = new ShuffleDeck([1, 2, 3])
    
    deck.setItems([10, 20, 30, 40])
    expect(deck.remaining).toBe(4)
    
    const drawn = new Set<number>()
    for (let i = 0; i < 4; i++) {
      drawn.add(deck.draw() as number)
    }
    
    expect(drawn.has(10)).toBe(true)
    expect(drawn.has(20)).toBe(true)
    expect(drawn.has(30)).toBe(true)
    expect(drawn.has(40)).toBe(true)
    expect(drawn.has(1)).toBe(false)
  })

  test('draw() exhausts all items before repeating', () => {
    const deck = new ShuffleDeck(['a', 'b', 'c'])
    
    const firstRound: string[] = []
    for (let i = 0; i < 3; i++) {
      firstRound.push(deck.draw() as string)
    }
    
    // Each item appeared exactly once
    expect(new Set(firstRound).size).toBe(3)
    
    // Second round also has each item exactly once
    const secondRound: string[] = []
    for (let i = 0; i < 3; i++) {
      secondRound.push(deck.draw() as string)
    }
    expect(new Set(secondRound).size).toBe(3)
  })
})
