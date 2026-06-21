import { GreenhouseAdapter } from './greenhouse.js';
import { LeverAdapter }      from './lever.js';
import { AshbyAdapter }      from './ashby.js';
import { WellfoundAdapter }  from './wellfound.js';
import { InstahyreAdapter }  from './instahyre.js';
import { NaukriAdapter }     from './naukri.js';

const ADAPTERS = [
  GreenhouseAdapter,
  LeverAdapter,
  AshbyAdapter,
  WellfoundAdapter,
  InstahyreAdapter,
  NaukriAdapter,
];

/**
 * Return the first adapter whose matches(url) returns true, or null if none found.
 * @param {string} url
 */
export function pickAdapter(url) {
  for (const Adapter of ADAPTERS) {
    if (Adapter.matches(url)) return new Adapter();
  }
  return null;
}
