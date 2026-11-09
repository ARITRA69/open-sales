import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teaches tailwind-merge the custom scale in styles/globals.css, so
// `text-body-sm` and `text-foreground` don't knock each other out.
const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: ['body-sm', 'body-lg', 'heading', 'title-xl', 'display'],
      radius: ['sm', 'panel', 'row', 'card', 'dialog', 'modal']
    }
  }
})

export const cn = (...inputs: ClassValue[]) => mergeClasses(clsx(inputs))
