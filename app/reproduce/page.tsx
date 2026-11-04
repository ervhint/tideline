import { Page } from '@/components/Page';
import { ReproduceView } from '@/components/ReproduceView';
import { getAnchorPanel } from '@/lib/data';

export const revalidate = 300;

export default async function Reproduce() {
  const panel = await getAnchorPanel();
  return (
    <Page title="Check It Yourself" lead="Two commands, no key and no account.">
      <ReproduceView {...panel} />
    </Page>
  );
}
