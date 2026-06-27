export function getLogoUrl(nomeLogo: string | null | undefined): string | undefined {
  if (!nomeLogo) return undefined
  return `/assets/images/${nomeLogo}`
}
