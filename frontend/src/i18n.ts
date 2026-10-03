import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/locales/en/translation.json"
import th from "@/locales/th/translation.json"

export const LANGUAGE_STORAGE_KEY = "agenttree-studio-language"
let saved: string | null = null
try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY) } catch { /* Fall back to English. */ }
const initialLanguage = saved === "th" || saved === "en" ? saved : "en"

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, th: { translation: th } },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

i18n.on("languageChanged", (language) => {
  const normalized = language.startsWith("th") ? "th" : "en"
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized) } catch { /* Live switching still works. */ }
  document.documentElement.lang = normalized
})
document.documentElement.lang = initialLanguage

export default i18n
