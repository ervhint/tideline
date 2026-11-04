// Side-change alarm (U8, FR-16): compares two thesis.json files and lists what moved. Pure: no network, no clock.
// A reading counts as changed when its side differs. The verdict is listed too when its label differs (id "Verdict").

export function sideChanges(before, after, at) {
  if (!before || !after) return [];
  const was = new Map(before.readings.map((r) => [r.id, r]));
  const out = [];
  for (const r of after.readings) {
    const p = was.get(r.id);
    if (p && p.side !== r.side) out.push({ at, id: r.id, name: r.name, from: p.side, to: r.side, detail: r.detail });
  }
  if (before.verdict?.verdict !== after.verdict?.verdict) {
    out.push({ at, id: 'Verdict', name: 'Verdict', from: before.verdict?.verdict, to: after.verdict?.verdict, detail: `score ${after.verdict?.score}, ${after.verdict?.missing} not measured` });
  }
  return out;
}

// One Telegram message for all changes of a run.
export function alarmMessage(changes) {
  const lines = changes.map((c) => {
    const note = c.from === 'Not Measured' || c.to === 'Not Measured' ? ' (measurement started or stopped, not a market move)' : '';
    return `${c.name}: ${c.from} -> ${c.to}${note}\n${c.detail ?? ''}`.trim();
  });
  return `Tideline: ${changes.length === 1 ? 'a reading changed side' : `${changes.length} readings changed side`}\n\n${lines.join('\n\n')}`;
}
