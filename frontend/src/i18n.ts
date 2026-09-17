import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "@/locales/en/translation.json"
import th from "@/locales/th/translation.json"

export const LANGUAGE_STORAGE_KEY = "agenttree-studio-language"
const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
const initialLanguage = saved === "th" || saved === "en" ? saved : "en"

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, th: { translation: th } },
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
})

i18n.on("languageChanged", (language) => {
  const normalized = language.startsWith("th") ? "th" : "en"
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized)
  document.documentElement.lang = normalized
})
document.documentElement.lang = initialLanguage

export default i18n
