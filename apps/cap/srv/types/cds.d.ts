/**
 * Global declarations for SAP CAP runtime and CQL constructs
 */
declare module '@sap/cds' {
  /** Minimal CAP Request type for handler parameters */
  interface Request {
    data: Record<string, unknown>;
    user: { id: string; [key: string]: unknown } | null;
    error(code: number, message: string): void;
    [key: string]: unknown;
  }

  /** ApplicationService base class */
  class ApplicationService {
    on(event: string, handler: (req: Request) => Promise<unknown> | unknown): void;
    init(): Promise<void>;
  }

  // Keep cds as `any` so existing files using cds.connect, cds.disconnect, etc.
  // continue to compile without narrowing errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cds: any;
  export default cds;
  export type { Request };
  export { ApplicationService };
}

declare const SELECT: any;
declare const INSERT: any;
declare const UPDATE: any;
declare const DELETE: any;

