import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

/**
 * Localised tagline as live text ("Your turn. On your time." / "دورك، في الوقت المناسب لك.").
 * Second half in Signal Lime, matching the approved brand presentation.
 */
export function Tagline({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={cn('font-medium text-soft', className)}>
      {t('common.taglineLead')} <span className="text-signal">{t('common.taglineTail')}</span>
    </p>
  )
}
