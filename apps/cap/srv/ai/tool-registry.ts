/**
 * Tool Registry & Definition Types
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Provides a locked catalog of approved backend tools.
 * Arbitrary tool names, dynamic functions, SQL queries, or shell calls
 * are strictly prohibited from execution.
 */

import { z } from 'zod';

export interface ExecutionContext {
  organizationId: string;
  userId: string;
  userRoles: string[];
  destinationName?: string;
}

export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  name: string;
  description: string;
  paramSchema: z.ZodType<TParams>;
  execute(params: TParams, ctx: ExecutionContext): Promise<TResult>;
}

export class ToolRegistry {
  private readonly _tools = new Map<string, ToolDefinition<any, any>>();

  register<TParams, TResult>(tool: ToolDefinition<TParams, TResult>): this {
    if (this._tools.has(tool.name)) {
      throw new Error(`[ToolRegistry] Tool "${tool.name}" is already registered.`);
    }
    this._tools.set(tool.name, tool);
    return this;
  }

  get<TParams = unknown, TResult = unknown>(name: string): ToolDefinition<TParams, TResult> | undefined {
    return this._tools.get(name);
  }

  has(name: string): boolean {
    return this._tools.has(name);
  }

  listToolNames(): string[] {
    return Array.from(this._tools.keys());
  }

  /**
   * Executes a registered tool with runtime parameter validation.
   * Throws Error if tool is unknown or parameters fail schema checks.
   */
  async execute(name: string, rawParams: unknown, ctx: ExecutionContext): Promise<unknown> {
    const tool = this._tools.get(name);
    if (!tool) {
      throw new Error(`[ToolRegistry] Disallowed tool "${name}". Tool is not in approved registry.`);
    }

    // 1. Strict schema validation of model-proposed parameters
    const parsedParams = tool.paramSchema.parse(rawParams);

    // 2. Execute approved tool
    return await tool.execute(parsedParams, ctx);
  }
}
