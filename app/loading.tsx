import { Banner } from '@/components/Banner';

// Shown while a page reads its data on the server (Next.js loading convention). No numbers until the real ones arrive.
export default function Loading() {
  return (
    <main className="wrap page-lift">
      <Banner tone="neutral" title="Loading the Numbers">
        Reading the published files. Nothing is shown until they arrive.
      </Banner>
    </main>
  );
}
