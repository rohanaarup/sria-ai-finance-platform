namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';

/**
 * Foundational tenant/organization entity
 */
entity Organizations : cuid, managed {
  code        : String(20) not null;
  name        : String(100) not null;
  description : String(255);
}

