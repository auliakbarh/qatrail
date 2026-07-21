import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// M0 seed strings. Add keys per feature. Language persisted in localStorage.
const resources = {
  en: {
    translation: {
      app: "QA Reporting",
      "nav.dashboard": "Dashboard",
      "nav.analytics": "Analytics",
      "nav.settings": "Settings",
      "nav.help": "Help",
      logout: "Logout",
      "login.title": "Sign in",
      "login.subtitle": "Sign in to continue",
      "login.email": "Email",
      "login.password": "Password",
      "login.submit": "Sign in",
      "login.microsoft": "Sign in with Microsoft",
      "login.soon": "soon",
      "login.forgot": "Forgot password?",
      "login.error": "Invalid email or password",
    },
  },
  id: {
    translation: {
      app: "QA Reporting",
      "nav.dashboard": "Dasbor",
      "nav.analytics": "Analitik",
      "nav.settings": "Pengaturan",
      "nav.help": "Bantuan",
      logout: "Keluar",
      "login.title": "Masuk",
      "login.subtitle": "Masuk untuk melanjutkan",
      "login.email": "Email",
      "login.password": "Kata sandi",
      "login.submit": "Masuk",
      "login.microsoft": "Masuk dengan Microsoft",
      "login.soon": "segera",
      "login.forgot": "Lupa kata sandi?",
      "login.error": "Email atau kata sandi salah",
    },
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem("qar_lang") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
