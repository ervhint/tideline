import { getStatus } from '@/lib/data';
import { freshness } from '@/lib/status_view';
import { StateBanner } from './StateBanner';

// Server side of the "Data Is Late" banner: real freshness now, and the preview as it would read a month from now.
export async function Stale() {
  const s = await getStatus();
  const later = freshness(s.lastFrozenDay, new Date(Date.now() + 30 * 86_400_000));
  return <StateBanner real={{ stale: s.stale, title: s.title, body: s.body }} preview={later} />;
}
