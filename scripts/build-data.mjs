// Reproducible data build for the prediction engine.
//
// Pulls the public, CC-licensed international-results dataset
// (github.com/martj42/international_results) and emits two trimmed,
// compact JSON assets that ship with the app — no backend, no live scraping,
// same philosophy as the paste-import tracker.
//
//   src/data/results.json   played matches from CUTOFF on, for fitting
//   src/data/fixtures.json  upcoming World Cup 2026 fixtures, to predict
//
// Re-run any time with:  node scripts/build-data.mjs
// Swap SOURCE_URL (or pass a local path as argv[2]) to use a different source.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SOURCE_URL =
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv'

// Only matches on/after this date feed the fit. Time-decay weighting (in fit.ts)
// already down-weights old games; this just caps the file size.
const CUTOFF = '2014-01-01'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'data')

// Match-importance multipliers. Friendlies are notoriously weak signal
// (rotated squads, no stakes); competitive games carry more.
function importance(tournament) {
  const t = tournament.toLowerCase()
  if (t.includes('friendly')) return 0.5
  if (t.includes('qualification') || t.includes('qualifier')) return 1.0
  if (t.includes('nations league')) return 1.0
  if (
    t.includes('fifa world cup') ||
    t.includes('uefa euro') ||
    t.includes('copa américa') ||
    t.includes('copa america') ||
    t.includes('african cup') ||
    t.includes('afc asian cup') ||
    t.includes('gold cup') ||
    t.includes('confederations')
  )
    return 1.25
  return 0.85 // minor/regional cups
}

// Minimal CSV parser handling quoted fields and embedded commas.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // ignore
    } else field += c
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

async function loadCsv() {
  const localArg = process.argv[2]
  if (localArg) {
    console.log(`Reading local CSV: ${localArg}`)
    return readFile(localArg, 'utf8')
  }
  console.log(`Fetching ${SOURCE_URL}`)
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`)
  return res.text()
}

async function main() {
  const csv = await loadCsv()
  const rows = parseCsv(csv)
  const header = rows[0]
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))

  const results = [] // [date, home, away, hs, as, neutral(0/1), importance]
  const fixtures = [] // { date, home, away, neutral, tournament }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.length < header.length) continue
    const date = row[idx.date]
    const home = row[idx.home_team].trim()
    const away = row[idx.away_team].trim()
    const hsRaw = row[idx.home_score].trim()
    const asRaw = row[idx.away_score].trim()
    const tournament = row[idx.tournament].trim()
    const neutral = row[idx.neutral].trim().toUpperCase() === 'TRUE' ? 1 : 0

    const played = hsRaw !== '' && hsRaw !== 'NA' && asRaw !== '' && asRaw !== 'NA'

    if (played) {
      if (date < CUTOFF) continue
      const hs = Number(hsRaw)
      const as = Number(asRaw)
      if (!Number.isFinite(hs) || !Number.isFinite(as)) continue
      results.push([date, home, away, hs, as, neutral, importance(tournament)])
    } else if (
      tournament.toLowerCase().includes('fifa world cup') &&
      date >= '2026-01-01'
    ) {
      fixtures.push({ date, home, away, neutral, tournament })
    }
  }

  results.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  fixtures.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const teamsPlayed = new Set()
  for (const m of results) {
    teamsPlayed.add(m[1])
    teamsPlayed.add(m[2])
  }

  await mkdir(outDir, { recursive: true })
  await writeFile(
    join(outDir, 'results.json'),
    JSON.stringify({
      source: SOURCE_URL,
      cutoff: CUTOFF,
      columns: ['date', 'home', 'away', 'homeScore', 'awayScore', 'neutral', 'importance'],
      matches: results,
    }),
  )
  await writeFile(
    join(outDir, 'fixtures.json'),
    JSON.stringify({ source: SOURCE_URL, fixtures }, null, 2),
  )

  console.log(`Wrote ${results.length} played matches (${teamsPlayed.size} teams).`)
  console.log(`Wrote ${fixtures.length} upcoming World Cup 2026 fixtures.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
