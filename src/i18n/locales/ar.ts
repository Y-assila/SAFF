import type { Translation } from './en'

// NOTE: Modern Standard Arabic. Needs review by a native Arabic copywriter before launch.
// The tagline "دورك، في الوقت المناسب لك." is the approved brand line.
const ar: Translation = {
  common: {
    appName: 'SAFF',
    taglineLead: 'دورك،',
    taglineTail: 'في الوقت المناسب لك.',
    loading: 'جارٍ التحميل…',
    retry: 'حاول مرة أخرى',
    close: 'إغلاق',
    backHome: 'العودة إلى الرئيسية',
    skipToContent: 'الانتقال إلى المحتوى',
    homeLink: 'SAFF — الرئيسية',
  },
  nav: {
    primary: 'التنقل الرئيسي',
    home: 'الرئيسية',
    howItWorks: 'كيف يعمل',
    forShops: 'للصالونات',
    barberSignIn: 'دخول الحلاق',
    openMenu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
  },
  language: {
    label: 'اللغة',
  },
  landing: {
    title: 'طابور رقمي لصالونات الحلاقة',
    heroLead: 'دورك،',
    heroTail: 'في الوقت المناسب لك.',
    heroBody:
      'امسح رمز QR الخاص بالصالون، وانضم إلى الطابور في ثوانٍ، وتابع مكانك من أي مكان. بدون تطبيق وبدون حساب.',
    ctaHow: 'اكتشف كيف يعمل',
    ctaShops: 'للصالونات',
    how: {
      title: 'كيف يعمل',
      intro: 'أربع خطوات، من باب الصالون إلى الكرسي.',
      steps: {
        scan: {
          title: 'امسح رمز QR الخاص بالصالون',
          body: 'لكل صالون رمز QR دائم خاص به عند المدخل.',
        },
        details: {
          title: 'أدخل اسمك ورقم هاتفك',
          body: 'بدون كلمة مرور وبدون حساب. رسائل واتساب فقط بموافقتك.',
        },
        ticket: {
          title: 'احصل على تذكرتك الرقمية',
          body: 'تحصل على رقم تذكرة ورابط خاص لمكانك في الطابور.',
        },
        track: {
          title: 'تابع دورك عن بُعد',
          body: 'اعرف عدد الأشخاص قبلك وعُد عندما يقترب دورك.',
        },
      },
    },
    shops: {
      title: 'مصمم للحلاقين',
      body: 'لوحة تحكم بسيطة لإدارة طابور اليوم، حسب ترتيب الوصول.',
      points: {
        fair: {
          title: 'عادل من الأساس',
          body: 'يُخدَم الزبائن حسب ترتيب انضمامهم. أرقام التذاكر يحددها النظام.',
        },
        control: {
          title: 'مسار واضح',
          body: 'نادِ الزبون التالي، وابدأ الخدمة ثم أنهِها، كل ذلك بنقرة واحدة.',
        },
        calm: {
          title: 'صالون أكثر هدوءًا',
          body: 'عدد أقل من المنتظرين داخل الصالون، وزبائن يصلون عندما يقترب دورهم.',
        },
      },
      access: 'يقوم فريق SAFF بإنشاء حسابات الصالونات.',
    },
    privacy: {
      title: 'الخصوصية أولًا',
      body: 'لا يُعرض رقم هاتفك علنًا أبدًا، ورابط تذكرتك خاص بك وحدك.',
    },
  },
  placeholder: {
    badge: 'قريبًا',
    shop: {
      title: 'الانضمام إلى الطابور',
      body: 'الانضمام إلى طابور الصالون غير متاح بعد. هذا الجزء من SAFF قيد الإنشاء.',
    },
    ticket: {
      title: 'تذكرتك',
      body: 'تتبع التذكرة غير متاح بعد. هذا الجزء من SAFF قيد الإنشاء.',
    },
    barberSignIn: {
      title: 'دخول الحلاق',
      body: 'حسابات الحلاقين غير متاحة بعد. هذا الجزء من SAFF قيد الإنشاء.',
    },
    dashboard: {
      title: 'لوحة تحكم الطابور',
      body: 'لوحة تحكم الحلاق غير متاحة بعد. هذا الجزء من SAFF قيد الإنشاء.',
    },
  },
  notFound: {
    title: 'الصفحة غير موجودة',
    body: 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
  },
  states: {
    emptyTitle: 'لا يوجد شيء بعد',
    errorTitle: 'حدث خطأ ما',
    errorBody: 'يرجى المحاولة مرة أخرى بعد قليل.',
  },
  footer: {
    rights: '© {{year}} SAFF. جميع الحقوق محفوظة.',
  },
}

export default ar
