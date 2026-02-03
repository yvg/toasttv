/**
 * Shuffle Deck
 * 
 * Manages a list of items that are drawn randomly without repetition
 * until the entire deck is exhausted, at which point it reshuffles.
 */

export class ShuffleDeck<T> {
  private deck: T[] = []
  private readonly items: T[]

  constructor(items: T[]) {
    this.items = [...items]
    this.shuffle()
  }

  /**
   * Draw the next item from the deck.
   * If deck is empty, it automatically reshuffles.
   * Returns null if no items exist in the universe.
    */
  draw(): T | null {
    if (this.items.length === 0) return null

    if (this.deck.length === 0) {
      this.shuffle()
    }

    return this.deck.pop() ?? null
  }

  /**
   * Reshuffle everything and reset the deck
   */
  reshuffle(): void {
    this.shuffle()
  }

  /**
   * Update the universe of items (e.g. after a re-scan)
   * This forces a reshuffle.
   */
  setItems(items: T[]): void {
    // We could try to be smart and keep current deck, but simpler to just reset
    this.items.length = 0
    this.items.push(...items)
    this.shuffle()
  }

  private shuffle(): void {
    this.deck = [...this.items]
    // Fisher-Yates Shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.deck[i] as T
      this.deck[i] = this.deck[j] as T
      this.deck[j] = temp
    }
  }
  
  get remaining(): number {
    return this.deck.length
  }
}
