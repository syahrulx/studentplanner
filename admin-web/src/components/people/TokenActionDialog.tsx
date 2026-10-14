import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MONTHLY_TOKEN_LIMITS, resolveMonthlyLimit, type AdminUserRow } from '../../lib/api';
import { Button } from '../../ui/Button';
import { Label, TextInput } from '../../ui/Input';
import { Chip, Notice } from '../../ui/page';

export type TokenDialogMode = 'reset' | 'set_limit';

export type TokenDialogState = {
  mode: TokenDialogMode;
  user: AdminUserRow;
  used: number;
};

/**
 * Two-step window for "Reset AI usage" and "Set AI limit".
 * Step 1 = review; step 2 = final confirm (double confirmation).
 * Drawn above the user side panel (z 160) and below SafeActionDialog (z 200).
 */
export function TokenActionDialog({
  state,
  onClose,
  onApply,
}: {
  state: TokenDialogState;
  onClose: () => void;
  onApply: (opts: { limit: number | null }) => Promise<void>;
}) {
  const { mode, user, used } = state;
  const planLimit = MONTHLY_TOKEN_LIMITS[user.subscription_plan] ?? MONTHLY_TOKEN_LIMITS.free;
  const currentLimit = resolveMonthlyLimit(user.subscription_plan, user.ai_token_limit_override);
  const userLabel = user.name || user.student_id || user.id.slice(0, 8);

  const [step, setStep] = useState<1 | 2>(1);
  const [limitInput, setLimitInput] = useState<string>(
    mode === 'set_limit' && user.ai_token_limit_override ? String(user.ai_token_limit_override) : '',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const parsedLimit: number | null = useMemo(() => {
    if (mode !== 'set_limit') return null;
    const trimmed = limitInput.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/[_,\s]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }, [mode, limitInput]);
  const limitInputValid = mode !== 'set_limit' || limitInput.trim() === '' || parsedLimit != null;

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onEsc);
    // Prevent background scroll while the dialog is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, busy]);

  const title = mode === 'reset' ? `Reset this month's AI usage` : `Set custom AI token limit`;

  const goNext = () => {
    setErr('');
    if (mode === 'set_limit' && !limitInputValid) {
      setErr('Enter a positive whole number, or leave blank to clear the override.');
      return;
    }
    setStep(2);
  };

  const apply = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'reset') {
        await onApply({ limit: null });
      } else {
        // Blank input → clear the override (revert to plan default).
        await onApply({ limit: parsedLimit });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const presetCls =
    'rounded-xl bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="token-action-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div id="token-action-title" className="text-base font-black text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {userLabel}
            <Chip>{user.subscription_plan}</Chip>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm">
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-3 text-xs dark:border-slate-800">
            <div>
              <dt className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">This month used</dt>
              <dd className="mt-1 font-black text-slate-900 dark:text-slate-100">{used.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Current limit</dt>
              <dd className="mt-1 font-black text-slate-900 dark:text-slate-100">
                {currentLimit.toLocaleString()}
                {user.ai_token_limit_override ? (
                  <span className="ml-1 text-[10px] font-black uppercase text-brand-600 dark:text-brand-300">(custom)</span>
                ) : null}
              </dd>
            </div>
          </dl>

          {mode === 'reset' ? (
            <Notice tone="warning">
              This will delete all <span className="font-black">ai_token_usage</span> rows for this user in the current
              UTC month. The user's "X / {currentLimit.toLocaleString()}" bar resets to 0 and they can keep using AI
              immediately. Historic totals from previous months are not affected.
            </Notice>
          ) : null}

          {mode === 'set_limit' ? (
            <div>
              <Label htmlFor="token-limit-input" className="mb-1">New monthly limit (tokens)</Label>
              <TextInput
                id="token-limit-input"
                inputMode="numeric"
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && step === 1) goNext();
                }}
                placeholder={`Plan default is ${planLimit.toLocaleString()}`}
                disabled={busy || step === 2}
                className="disabled:opacity-60"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[planLimit, 50_000, 100_000, 200_000, 500_000].map((n) => (
                  <button key={n} type="button" disabled={busy || step === 2} onClick={() => setLimitInput(String(n))} className={presetCls}>
                    {n.toLocaleString()}
                  </button>
                ))}
                <button type="button" disabled={busy || step === 2} onClick={() => setLimitInput('')} className={presetCls}>
                  Clear override
                </button>
              </div>
              <div className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Leave blank to remove the override and fall back to the plan default ({planLimit.toLocaleString()} tokens).
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <Notice tone="danger">
              {mode === 'reset' ? (
                <>
                  Final confirmation. You're about to reset <span className="font-black">{userLabel}</span>'s AI usage for
                  this month to 0.
                </>
              ) : parsedLimit == null ? (
                <>
                  Final confirmation. You're about to remove the custom limit for{' '}
                  <span className="font-black">{userLabel}</span> and revert to the plan default of{' '}
                  <span className="font-black">{planLimit.toLocaleString()}</span> tokens/month.
                </>
              ) : (
                <>
                  Final confirmation. You're about to set <span className="font-black">{userLabel}</span>'s monthly limit to{' '}
                  <span className="font-black">{parsedLimit.toLocaleString()}</span> tokens
                  {parsedLimit < used ? (
                    <>
                      {' '}— note that this is <span className="font-black">below</span> their current usage of{' '}
                      {used.toLocaleString()}, so the user will already be capped
                    </>
                  ) : null}
                  .
                </>
              )}
            </Notice>
          ) : null}

          {err ? <Notice tone="danger">{err}</Notice> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button size="sm" onClick={goNext} disabled={busy || (mode === 'set_limit' && !limitInputValid)}>
              Continue
            </Button>
          ) : mode === 'reset' ? (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex h-9 items-center rounded-2xl bg-amber-600 px-3 text-sm font-semibold text-white shadow-elev1 hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? 'Applying…' : 'Reset usage'}
            </button>
          ) : (
            <Button size="sm" onClick={apply} disabled={busy}>
              {busy ? 'Applying…' : 'Apply limit'}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
