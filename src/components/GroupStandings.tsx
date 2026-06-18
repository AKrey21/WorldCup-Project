import type { GroupTable } from '../lib/groups'

/** The 12 group tables as they stand from the played fixtures. Top two are highlighted. */
export function GroupStandings({ tables }: { tables: GroupTable[] }) {
  if (tables.length === 0) {
    return <p className="text-xs text-neutral-500">No group results yet.</p>
  }
  return (
    <>
      <p className="mb-3 text-[11px] leading-snug text-neutral-500">
        Live standings from the played fixtures — <span className="text-neutral-300">top two</span>{' '}
        (highlighted) advance, plus the eight best third-placed sides. Context for stakes &amp;
        motivation, not a model input. Order: points → goal difference → goals for.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tables.map((g) => (
          <div key={g.group} className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Group {g.group}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
                  <th className="py-0.5 text-left font-medium">Team</th>
                  <th className="py-0.5 text-right font-medium" title="Played">
                    P
                  </th>
                  <th className="py-0.5 text-right font-medium" title="Goal difference">
                    GD
                  </th>
                  <th className="py-0.5 text-right font-medium" title="Points">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {g.teams.map((t) => (
                  <tr key={t.team} className={t.rank <= 2 ? 'text-neutral-100' : 'text-neutral-500'}>
                    <td className="py-0.5">
                      <span className="text-neutral-600">{t.rank}.</span> {t.team}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">{t.played}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {t.gd >= 0 ? '+' : ''}
                      {t.gd}
                    </td>
                    <td className="py-0.5 text-right font-semibold tabular-nums">{t.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  )
}
