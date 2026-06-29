const MONTHLY_LIMIT_REGEX = /monthly ai token limit/i;
export const MONTHLY_TOKEN_LIMIT_CODE = 'MONTHLY_TOKEN_LIMIT';

type ErrorLike =
  | string
  | null
  | undefined
  | {
      code?: string | null;
      message?: string | null;
      error?: { code?: string | null; message?: string | null } | null;
    };

function errorString(err: ErrorLike): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const direct = err.message ?? '';
  const nested = err.error?.message ?? '';
  return [direct, nested].filter(Boolean).join(' ');
}

function errorCode(err: ErrorLike): string {
  if (!err || typeof err === 'string') return '';
  return (err.code ?? err.error?.code ?? '').trim();
}

export function isMonthlyLimitError(err: ErrorLike): boolean {
  const code = errorCode(err);
  if (code === MONTHLY_TOKEN_LIMIT_CODE) return true;
  return MONTHLY_LIMIT_REGEX.test(errorString(err));
}

export class MonthlyLimitError extends Error {
  constructor(message = 'Monthly AI token limit reached.') {
    super(message);
    this.name = 'MonthlyLimitError';
  }
}
