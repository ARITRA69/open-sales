/** "Asha Menon" → "AM", "Cher" → "C". For avatars. */
export const getInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1)
  return letters.map((word) => word[0].toUpperCase()).join('')
}
