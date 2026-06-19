const logoModules = import.meta.glob<string>('../../assets/images/*.png', { eager: true, import: 'default' })

export function getLogoUrl(nomeLogo: string | null | undefined): string | undefined {
  if (!nomeLogo) return undefined
  return logoModules[`../../assets/images/${nomeLogo}`]
}
