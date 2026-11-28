import { createContext, useContext, useEffect } from 'react'

/** Customer screens are Midnight; the whole screen turns Signal Lime when it is the customer's turn. */
export type CustomerTone = 'dark' | 'signal'

export const CustomerToneContext = createContext<(tone: CustomerTone) => void>(() => {})

export function useCustomerTone(tone: CustomerTone) {
  const setTone = useContext(CustomerToneContext)
  useEffect(() => {
    setTone(tone)
    return () => setTone('dark')
  }, [setTone, tone])
}
