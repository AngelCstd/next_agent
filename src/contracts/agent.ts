export interface AgentDescriptor {
  name: string;
  displayName: string;
  description: string;
  kind: 'supervisor' | 'specialist';
  /** Tool names only. Never executable references. */
  toolNames: string[];
  status: 'idle' | 'busy';
}

/**
 * The only tool shape an agent ever receives. Pure data: there is nothing
 * callable here, so an agent cannot reach a side effect without going through
 * the ToolInvoker.
 */
export interface ToolHandle {
  name: string;
  description: string;
  /** JSON Schema describing the accepted arguments. */
  argsSchema: unknown;
}
