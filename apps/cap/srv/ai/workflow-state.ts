/**
 * Workflow State Machine & Transition Types
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Deterministic state transitions for orchestrating dashboard generation:
 *   INTERPRET → VALIDATE_REQUEST → PLAN → AUTHORIZE_PLAN → EXECUTE → VALIDATE_RESULT → RESPOND
 *
 * Replaces autonomous recursion with a strict, bounded finite state machine.
 */

export type WorkflowState =
  | 'INITIALIZED'
  | 'INTERPRETING'
  | 'VALIDATING_REQUEST'
  | 'PLANNING'
  | 'AUTHORIZING_PLAN'
  | 'EXECUTING_TOOLS'
  | 'VALIDATING_RESULTS'
  | 'COMPLETED'
  | 'FAILED';

export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  timestamp: string;
  reason?: string;
}

export class WorkflowStateMachine {
  private _currentState: WorkflowState = 'INITIALIZED';
  private readonly _transitions: StateTransition[] = [];

  get currentState(): WorkflowState {
    return this._currentState;
  }

  get transitions(): readonly StateTransition[] {
    return this._transitions;
  }

  transitionTo(nextState: WorkflowState, reason?: string): void {
    const validTransitions: Record<WorkflowState, WorkflowState[]> = {
      INITIALIZED: ['INTERPRETING', 'PLANNING', 'FAILED'],
      INTERPRETING: ['VALIDATING_REQUEST', 'FAILED'],
      VALIDATING_REQUEST: ['PLANNING', 'FAILED'],
      PLANNING: ['AUTHORIZING_PLAN', 'FAILED'],
      AUTHORIZING_PLAN: ['EXECUTING_TOOLS', 'FAILED'],
      EXECUTING_TOOLS: ['VALIDATING_RESULTS', 'FAILED'],
      VALIDATING_RESULTS: ['COMPLETED', 'FAILED'],
      COMPLETED: [],
      FAILED: []
    };

    const allowed = validTransitions[this._currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(
        `[WorkflowStateMachine] Invalid transition from "${this._currentState}" to "${nextState}". ` +
        `Allowed next states: [${allowed.join(', ')}]`
      );
    }

    const transition: StateTransition = {
      from: this._currentState,
      to: nextState,
      timestamp: new Date().toISOString(),
      reason
    };

    this._transitions.push(transition);
    this._currentState = nextState;
  }
}
