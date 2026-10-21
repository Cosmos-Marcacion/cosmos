import { registerPlugin } from '@capacitor/core';

import type { fingercosmosPlugin } from './definitions';

const fingercosmos = registerPlugin<fingercosmosPlugin>('fingercosmos', {
  web: () => import('./web').then((m) => new m.fingercosmosWeb()),
});

export * from './definitions';
export { fingercosmos };
