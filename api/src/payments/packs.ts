// Server-authoritative pricing. Frontend must NOT control price/credits.
// Keep in sync with /src/game/pricing.ts.
export interface CreditPack {
  id: string
  pesos: number
  credits: number
  label: string
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter',  pesos: 30,  credits: 300,  label: 'Starter' },
  { id: 'casual',   pesos: 75,  credits: 800,  label: 'Casual' },
  { id: 'angry',    pesos: 150, credits: 1700, label: 'Angry' },
  { id: 'furious',  pesos: 300, credits: 3600, label: 'Furious' },
  { id: 'unhinged', pesos: 500, credits: 6500, label: 'Unhinged' },
]

export function findPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id)
}
