import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { t } from '../i18n'

const looks: Record<'info' | 'warning' | 'error', { icon: IconName; color: string; className: string }> = {
  info: { icon: 'info', color: 'text-accent-text', className: 'infobar-info' },
  warning: { icon: 'warning', color: 'text-[var(--warning-icon)]', className: 'infobar-warning' },
  error: { icon: 'error', color: 'text-[var(--error-icon)]', className: 'infobar-error' },
}

/** Сообщение в строке — InfoBar из WinUI: значок важности, заголовок, текст, действие и крестик. */
export function InfoBar({
  severity,
  title,
  message,
  details,
  action,
  onClose,
}: {
  severity: 'info' | 'warning' | 'error'
  title: string
  message?: string
  /** Подробности под заголовком — например, что нового в обновлении. */
  details?: string
  action?: ReactNode
  onClose?: () => void
}) {
  const look = looks[severity]
  return (
    <div className={`infobar ${look.className}`} role={severity === 'error' ? 'alert' : 'status'}>
      <Icon name={look.icon} className={look.color} />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{title}</span>
        {message && <span className="ml-3 text-primary">{message}</span>}
        {details && <p className="mt-1 line-clamp-4 whitespace-pre-line text-xs text-secondary">{details}</p>}
      </div>
      {action}
      {onClose && (
        <button onClick={onClose} className="icon-btn" aria-label={t('Закрыть')} title={t('Закрыть')}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  )
}
