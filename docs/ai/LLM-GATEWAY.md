# LLM gateway (G2-04)

Every model call in the platform goes through one component, `LLMGateway` (`apps/cap/srv/ai/gateway/`). Feature code never talks to a provider directly.

## What happens to one request

1. **Route**: pick the provider and model for the task (`AI_MODEL_GOAL`).
2. **Redact**: replace amounts, long ids, e-mails, phone/card/IBAN numbers and secrets with placeholders such as `[AMOUNT_1]`. Fiscal years and allowed company codes pass through.
3. **Budget**: refuse when the per-run or per-tenant-per-day token limit would be exceeded.
4. **Call** with a hard timeout (explicit AbortController, not `AbortSignal.timeout`).
5. **Retry** only on rate-limit and server errors, with backoff and jitter; a circuit breaker stops hammering a failing provider.
6. **Validate**: the answer must parse and fit the Zod schema plus business rules. Up to two repair attempts, then a safe rejection (`MALFORMED`).
7. **Meter**: one `ModelCalls` row with prompt id/version/hash, token counts, latency, cost estimate, redaction counts and outcome. **No prompt text and no answers are stored.**

## Providers

| Mode | Use | Network |
|---|---|---|
| mock | default test double | none |
| replay | recorded answers, deterministic tests | none |
| openai / azure-openai / gemini-api | OpenAI-compatible HTTP | live |
| anthropic | tool-forced structured output | live |

Live providers refuse to start unless `AI_PROVIDER_APPROVED=true`. Record the approval first in `PROVIDER-APPROVAL.md` (currently NOT APPROVED).

## Goal understanding

`GoalService.understand()` turns text into an `AgentGoal` (`packages/contracts/src/agent-goal.ts`). Layers: input checks, injection guard, the semantic glossary decides metrics and unsupported terms, delimited data blocks, strict schema, `harden()` re-checks every field in code, and the model has no tools. Only `create_dashboard` and `answer_question` are executable today; other task types are understood but refused honestly.

## Limits (honest)

- Live adapters were tested against local HTTP stand-ins only, not real providers.
- Redaction is a safety net built on patterns; the real protection is that the model sees no data rows.
- Provider choice (D-08) and data terms/residency (D-09) are open.
