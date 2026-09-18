import type { ApprovalPreviewField, ApprovalStatus } from '../contracts';

const MAX_VISIBLE_FIELDS = 4;

const TERMINAL_LABELS: Record<Exclude<ApprovalStatus, 'pending'>, string> = {
  approved: 'Aprobado · Acción autorizada',
  rejected: 'Rechazado · No se realizó la acción',
  expired: 'Vencido · La aprobación ya no está disponible',
  superseded: 'Reemplazado · Hay una solicitud más reciente',
};

export interface ApprovalPresentation {
  mode: 'pending' | 'terminal';
  expanded: boolean;
  summary: string;
  visibleFields: ApprovalPreviewField[];
}

export function deriveApprovalPresentation(
  status: ApprovalStatus,
  inputPreview: readonly ApprovalPreviewField[],
  expanded: boolean,
): ApprovalPresentation {
  const previewFields = inputPreview.slice(0, MAX_VISIBLE_FIELDS);

  if (status === 'pending') {
    return {
      mode: 'pending',
      expanded: true,
      summary: 'Aprobación requerida',
      visibleFields: previewFields,
    };
  }

  return {
    mode: 'terminal',
    expanded,
    summary: TERMINAL_LABELS[status],
    visibleFields: expanded ? previewFields : [],
  };
}
