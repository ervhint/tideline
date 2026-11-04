import { Button } from '@/components/Button';
import { ModelView } from '@/components/ModelView';
import { Page } from '@/components/Page';
import { getMarket } from '@/lib/data';

export const revalidate = 300; // re-read the published data every 5 minutes

export default async function Model() {
  const { market, asOf, live, elasticity } = await getMarket();
  return (
    <Page title="Move a Number, See the Threshold">
      <ModelView market={market} asOf={asOf} live={live} elasticity={elasticity} />
      <Button href="/reproduce/" variant="secondary">Check It Yourself</Button>
    </Page>
  );
}
