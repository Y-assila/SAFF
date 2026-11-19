import { useEffect } from 'react'

/** Sets document.title as "<title> · SAFF" (or just "SAFF"). */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · SAFF` : 'SAFF'
  }, [title])
}
