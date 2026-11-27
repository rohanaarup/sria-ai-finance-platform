namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';

/**
 * One row per model request (G2-04). Metadata only: identifiers, hashes, counts and an estimate.
 * Prompt text and model answers are NEVER stored here (they may contain financial information).
 */
entity ModelCalls : cuid, managed {
  tenantId        : String(100) not null;
  userId          : String(100) not null;
  runId           : String(100);
  task            : String(30) not null;
  promptId        : String(60) not null;
  promptVersion   : String(20) not null;
  promptHash      : String(64) not null;
  provider        : String(40) not null;
  mode            : String(10) not null;   // mock | replay | live
  model           : String(100) not null;
  inputTokens     : Integer not null;
  outputTokens    : Integer not null;
  latencyMs       : Integer not null;
  costEstimateUsd : Decimal(12,6) not null;
  attempts        : Integer not null;
  repairs         : Integer not null;
  redactionCounts : String(500);
  outcome         : String(20) not null;
}
