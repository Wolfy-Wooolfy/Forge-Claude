export function detectLanguage(text: string): 'ar' | 'en' {
  if (!text) return 'en'
  const arabicChars = (text.match(/[؀-ۿ]/g) ?? []).length
  const total = text.replace(/\s/g, '').length
  return total > 0 && arabicChars / total > 0.3 ? 'ar' : 'en'
}
