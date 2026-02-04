import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'

// Usage: bun vlc-logo-args.ts [dbPath]
const dbPath = process.argv[2] || './data/media.db'

if (!existsSync(dbPath)) process.exit(0)

try {
  const db = new Database(dbPath, { readonly: true })
  const get = (k: string) => {
    const row = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(k) as { value: string } | null
    return row?.value
  }

  const enabled = get('logo.enabled') !== 'false'
  const path = get('logo.imagePath')

  if (enabled && path && existsSync(path)) {
    const opacity = get('logo.opacity') || '128'
    const rawPos = parseInt(get('logo.position') || '2', 10)
    const x = parseInt(get('logo.x') || '8', 10)
    const y = parseInt(get('logo.y') || '8', 10)

    // ToastTV Position Enum -> VLC Logo Position ID
    // 0=Top-Left(5), 1=Top-Center(4), 2=Top-Right(6)
    // 3=Mid-Left(1), 4=Center(0), 5=Mid-Right(2)
    // 6=Bot-Left(9), 7=Bot-Center(8), 8=Bot-Right(10)
    const map: Record<number, number> = {
      0: 5,
      1: 4,
      2: 6,
      3: 1,
      4: 0,
      5: 2,
      6: 9,
      7: 8,
      8: 10,
    }
    const vlcPos = map[rawPos] ?? 6

    // Output arguments for VLC CLI
    // Attempting to use logo-x/y as offsets (padding)
    console.log(
      `--sub-source=logo --logo-file=${path} --logo-position=${vlcPos} --logo-opacity=${opacity} --logo-x=${x} --logo-y=${y}`
    )
  }
} catch (e) {
  // Silent fail - output nothing, VLC will start without logo
}
