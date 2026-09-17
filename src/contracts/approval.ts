import type { ISO8601, UUID } from './common';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'superseded';

/** One display row. Built from a per-action allowlist, never auto-serialized. */
export interface ApprovalPreviewField {
  label: string;
  value: string;
  emphasis?: 'normal' | 'warning';
}

export interface ApprovalRequest {
  id: UUID;
  conversationId: UUID;
  taskId: UUID;
  action: string;
  /** Bumping this invalidates approvals issued against the old contract. */
  actionVersion: number;
  requestedByAgent: string;
  status: ApprovalStatus;
  summary: string;
  inputPreview: ApprovalPreviewField[];
  /**
   * sha256 over canonical JSON of
   * { action, actionVersion, conversationId, taskId, material }
   * where material is the action's declared material fields.
   * Binds the decision to concrete arguments; a mismatch supersedes.
   */
  payloadHash: string;
  createdAt: ISO8601;
  expiresAt: ISO8601;
  resolvedAt?: ISO8601;
  /** Supabase subject id of the deciding human. Never a token. */
  resolvedBy?: string;
  rejectionReason?: string;
}

export interface ApprovalDecision {
  decision: 'approve' | 'reject';
  reason?: string;
  /** Protects against double submission. */
  idempotencyKey: UUID;
}
