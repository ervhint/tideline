// S5 view of the contract records. Pure and type-annotations only, so Node runs it in tests and the site imports it.
export type AttestRecord = { archive_sha256: string; readings: string; block_timestamp: string };
export type DayCheck = { day: string; local: string | null; record: AttestRecord | null };
export type DayState = 'none' | 'anchored' | 'mismatch' | 'no-file';
export type AnchorPanel = {
  state: 'none' | 'anchored' | 'mismatch' | 'failed';
  tag: string;
  text: string;
  day?: string;
  archive?: string;
  chain?: string;
  contractUrl?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const date = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const short = (hash: string) => `${hash.slice(0, 4)}…${hash.slice(-4)}`;
// block_timestamp is in nanoseconds and larger than 2^53, so it stays a string until it is cut to milliseconds.
const recordedAt = (nanos: string) => new Date(Number(BigInt(nanos) / 1_000_000n)).toISOString();

export function dayState({ local, record }: DayCheck): DayState {
  if (!record) return 'none';
  if (!local) return 'no-file';
  return local === record.archive_sha256 ? 'anchored' : 'mismatch';
}

export const FAILED_PANEL: AnchorPanel = { state: 'failed', tag: 'Not Checked', text: 'NEAR testnet did not answer.' };

// A mismatch on any day outranks the latest good one, because the panel promises to say which day.
export function anchorPanel(checks: DayCheck[], contractUrl: string): AnchorPanel {
  const recorded = checks.filter((c) => c.record);
  if (recorded.length === 0) {
    return {
      state: 'none',
      tag: 'Not Yet Anchored',
      text: 'No day has been anchored yet. The last anchored day will show here. If a file and its hash ever differ, this panel says which day.',
    };
  }
  if (recorded.some((c) => dayState(c) === 'no-file')) return FAILED_PANEL;
  const bad = recorded.find((c) => dayState(c) === 'mismatch');
  if (bad) {
    return {
      state: 'mismatch',
      tag: `Mismatch: ${date(bad.day)}`,
      text: `The archive file for ${date(bad.day)} hashes to a different value than the one stored on NEAR testnet. Do not trust that day until the cause is found.`,
      day: bad.day,
      archive: short(bad.local!),
      chain: short(bad.record!.archive_sha256),
      contractUrl,
    };
  }
  const last = recorded.reduce((a, b) => (b.day > a.day ? b : a));
  const at = recordedAt(last.record!.block_timestamp);
  const days = recorded.length === 1 ? '1 day' : `${recorded.length} days`;
  return {
    state: 'anchored',
    tag: `Anchored: ${date(last.day)}`,
    text: `The archive for ${date(last.day)} hashes to the value stored on NEAR testnet. It was recorded on ${date(at)} at ${at.slice(11, 16)} UTC, so it proves the file existed from then on. ${days} recorded so far, all matching.`,
    day: last.day,
    archive: short(last.local!),
    chain: short(last.record!.archive_sha256),
    contractUrl,
  };
}
