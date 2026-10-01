import React, { createContext, useContext, useMemo, useState } from 'react';

export type Lang = 'EN' | 'CZ' | 'UR';
type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = {
  EN: {
    home: 'Home',
    vacancies: 'Vacancies',
    about: 'About us',
    portal: 'Client portal',
    operations: 'Operations',
    admin: 'Admin',
    signIn: 'Sign in',
    signOut: 'Sign out',
    register: 'Create account',
    heroEyebrow: 'VANGUARD GLOBAL MOBILITY • SECURE OPERATIONS',
    heroTitle: 'European mobility, managed with precision.',
    heroSub: 'A secure workspace for applications, employment opportunities, documents, payment review and operational case management.',
    explore: 'Explore vacancies',
    calculator: 'Smart service calculator',
    citizenship: 'Citizenship',
    destination: 'Destination country',
    visa: 'Visa / permit type',
    processing: 'Production option',
    search: 'Search vacancies',
    estimated: 'Estimated service price',
    standard: 'Standard',
    priority: 'Priority',
    express: 'Express',
    aboutTitle: 'About Vanguard',
    team: 'Our team',
    partners: 'Partners by country',
    office: 'Office & field gallery',
    legal: 'Company & legal information',
    license: 'Licence / company documents',
    signInTitle: 'Welcome back',
    registerTitle: 'Create your Vanguard account',
    emailOrPhone: 'Email or phone',
    email: 'Email address',
    phone: 'Phone number',
    password: 'Password',
    fullName: 'Full name',
    noAccount: 'New to Vanguard?',
    haveAccount: 'Already have an account?',
    continue: 'Continue',
    create: 'Create account',
    invalid: 'Please check your details.',
    application: 'Application',
    documents: 'Documents',
    payments: 'Payments',
    status: 'Status',
    save: 'Save',
    cancel: 'Cancel',

    status2Title: 'Stage 2: Document upload & initial payment',
    cancellationWarning: 'Application cancellation timer: payment receipt must be uploaded within 5 days.',
    policeClearanceNotice: 'Upload clear scans or photos of all required documents, including Police Clearance Certificate.',
    status3Title: 'Stage 3: Document processing in progress',
    daysRemaining: 'Days remaining until completion',
    invoice2Btn: 'Generate Invoice #2 (40%)',
    invoice2Notice: 'Notice: Payment of Invoice #2 (40%) must be completed within 14 days.',
    watermarkedDocs: 'Download watermarked documents (Preview)',
    status4Title: 'Stage 4: Final 30% payment & worldwide dispatch',
    status4Notice: 'Final payment stage (30%). This covers worldwide physical delivery via DHL or sending portal authorization logins and passwords to verify visa issuance.',
    invoice3Btn: 'Generate Final Invoice #3 (30%)',
    invoice3Warning: 'Notice: This invoice must be settled before your visa expiration date.',
    partnerEmployers: 'Leading employment partners who actively hire international staff:'
  },
  CZ: {
    home: 'Domů',
    vacancies: 'Volná místa',
    about: 'O nás',
    portal: 'Klientský portál',
    operations: 'Operace',
    admin: 'Administrace',
    signIn: 'Přihlásit',
    signOut: 'Odhlásit',
    register: 'Vytvořit účet',
    heroEyebrow: 'VANGUARD GLOBAL MOBILITY • BEZPEČNÉ OPERACE',
    heroTitle: 'Evropská mobilita řízená s přesností.',
    heroSub: 'Bezpečný pracovní prostor pro žádosti, pracovní příležitosti, dokumenty, kontrolu plateb a správu případů.',
    explore: 'Prohlédnout pozice',
    calculator: 'Chytrá kalkulačka služeb',
    citizenship: 'Občanství',
    destination: 'Cílová země',
    visa: 'Typ víza / povolení',
    processing: 'Rychlost zpracování',
    search: 'Hledat pozice',
    estimated: 'Odhad ceny služby',
    standard: 'Standard',
    priority: 'Priorita',
    express: 'Expres',
    aboutTitle: 'O společnosti Vanguard',
    team: 'Náš tým',
    partners: 'Partneři podle zemí',
    office: 'Kancelář a galerie',
    legal: 'Firemní a právní údaje',
    license: 'Licence / firemní dokumenty',
    signInTitle: 'Vítejte zpět',
    registerTitle: 'Vytvořte účet Vanguard',
    emailOrPhone: 'E-mail nebo telefon',
    email: 'E-mail',
    phone: 'Telefon',
    password: 'Heslo',
    fullName: 'Celé jméno',
    noAccount: 'Jste u Vanguard poprvé?',
    haveAccount: 'Už máte účet?',
    continue: 'Pokračovat',
    create: 'Vytvořit účet',
    invalid: 'Zkontrolujte prosím údaje.',
    application: 'Žádost',
    documents: 'Dokumenty',
    payments: 'Platby',
    status: 'Stav',
    save: 'Uložit',
    cancel: 'Zrušit',

    status2Title: 'Stav 2: Nahrání dokumentů a první platba',
    cancellationWarning: 'Odpočet do zrušení žádosti: doklad o zaplacení musí být nahrán do 5 dnů.',
    policeClearanceNotice: 'Nahrajte prosím skeny nebo fotografie všech požadovaných dokumentů včetně výpisu z rejstříku trestů.',
    status3Title: 'Stav 3: Zpracování dokumentů',
    daysRemaining: 'Zbývající dny do dokončení',
    invoice2Btn: 'Vygenerovat fakturu č. 2 (40%)',
    invoice2Notice: 'Upozornění: Na úhradu faktury č. 2 (40 %) je poskytnuta lhůta 14 dnů.',
    watermarkedDocs: 'Stáhnout dokumenty s vodoznakem',
    status4Title: 'Stav 4: Finální platba 30 % a odeslání',
    status4Notice: 'Finální fáze platby (30 %). Zahrnuje odeslání dokumentů poštou po celém světě (DHL) nebo poskytnutí přístupových údajů ke státním portálům pro ověření víza.',
    invoice3Btn: 'Vygenerovat finální fakturu č. 3 (30%)',
    invoice3Warning: 'Upozornění: Tuto fakturu je nutné uhradit před vypršením platnosti víza.',
    partnerEmployers: 'Významní zaměstnavatelé pravidelně přijímající zahraniční pracovníky:'
  },
  UR: {
    home: 'ہوم',
    vacancies: 'ملازمتیں',
    about: 'ہمارے بارے میں',
    portal: 'کلائنٹ پورٹل',
    operations: 'آپریشنز',
    admin: 'ایڈمن',
    signIn: 'سائن ان',
    signOut: 'سائن آؤٹ',
    register: 'اکاؤنٹ بنائیں',
    heroEyebrow: 'VANGUARD GLOBAL MOBILITY • محفوظ آپریشنز',
    heroTitle: 'یورپی نقل و حرکت، درستگی کے ساتھ منظم۔',
    heroSub: 'درخواستوں، ملازمت کے مواقع، دستاویزات اور کیس مینجمنٹ کے لیے محفوظ پلیٹ فارم۔',
    explore: 'ملازمتیں دیکھیں',
    calculator: 'اسمارٹ سروس کیلکولیٹر',
    citizenship: 'شہریت',
    destination: 'منزل ملک',
    visa: 'ویزہ کی قسم',
    processing: 'پروسیسنگ آپشن',
    search: 'ملازمتیں تلاش کریں',
    estimated: 'تخمینہ قیمت',
    standard: 'معیاری',
    priority: 'ترجیحی',
    express: 'ایکسپریس',
    aboutTitle: 'وینگارڈ کے بارے میں',
    team: 'ہماری ٹیم',
    partners: 'شراکت دار بلحاظ ملک',
    office: 'دفتر اور گیلری',
    legal: 'قانونی معلومات',
    license: 'لائسنس / دستاویزات',
    signInTitle: 'خوش آمدید',
    registerTitle: 'نیا اکاؤنٹ بنائیں',
    emailOrPhone: 'ای میل یا فون',
    email: 'ای میل',
    phone: 'فون نمبر',
    password: 'پاس ورڈ',
    fullName: 'پورا نام',
    noAccount: 'نیا اکاؤنٹ بنائیں؟',
    haveAccount: 'پہلے سے اکاؤنٹ ہے؟',
    continue: 'جاری رکھیں',
    create: 'اکاؤنٹ بنائیں',
    invalid: 'تفصیلات درست کریں۔',
    application: 'درخواست',
    documents: 'دستاویزات',
    payments: 'ادائیگیاں',
    status: 'حیثیت',
    save: 'محفوظ کریں',
    cancel: 'منسوخ کریں',

    status2Title: 'مرحلہ 2: دستاویزات اور ابتدائی ادائیگی',
    cancellationWarning: 'درخواست منسوخی کا کاؤنٹ ڈاؤن: ادائیگی کی رسید 5 دن کے اندر اپ لوڈ کرنا لازمی ہے۔',
    policeClearanceNotice: 'تمام مطلوبہ دستاویزات بشمول پولیس کلیئرنس سرٹیفکیٹ کی اسکین کاپیاں اپ لوڈ کریں۔',
    status3Title: 'مرحلہ 3: دستاویزات کی تیاری جاری ہے',
    daysRemaining: 'تکمیل میں باقی دن',
    invoice2Btn: 'انوائس نمبر 2 بنائیں (40%)',
    invoice2Notice: 'اطلاع: انوائس نمبر 2 کی ادائیگی کے لیے 14 دن فراہم کیے جاتے ہیں۔',
    watermarkedDocs: 'واٹر مارک شدہ دستاویزات ڈاؤن لوڈ کریں',
    status4Title: 'مرحلہ 4: حتمی 30% ادائیگی اور ترسیل',
    status4Notice: 'حتمی ادائیگی کا مرحلہ (30%)۔ اس میں DHL کے ذریعے دستاویزات کی دنیا بھر میں ترسیل یا سرکاری پورٹل کی لاگ ان تفصیلات شامل ہیں۔',
    invoice3Btn: 'حتمی انوائس نمبر 3 بنائیں (30%)',
    invoice3Warning: 'اطلاع: یہ انوائس ویزہ کی آخری تاریخ سے پہلے ادا کرنا ضروری ہے۔',
    partnerEmployers: 'اہم پارٹنرز جو غیر ملکی عملے کو ملازمت دیتے ہیں:'
  }
};

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
}

const LanguageContext = createContext<Ctx | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('vanguard_lang') as Lang) || 'EN');

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('vanguard_lang', l);
    document.documentElement.lang = l.toLowerCase();
    document.documentElement.dir = l === 'UR' ? 'rtl' : 'ltr';
  };

  const t = useMemo(() => ((k: string) => dicts[lang][k] ?? dicts.EN[k] ?? k), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const c = useContext(LanguageContext);
  if (!c) throw new Error('useLanguage must be used within LanguageProvider');
  return c;
};
