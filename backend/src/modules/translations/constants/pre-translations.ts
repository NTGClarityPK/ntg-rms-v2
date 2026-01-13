/**
 * Pre-translated standard data for signup seed data
 * These translations are used instead of calling Gemini API for faster signup
 */

export interface PreTranslation {
  en: string;
  ar: string;
  ku: string;
  fr: string;
}

export const PRE_TRANSLATIONS: Record<string, PreTranslation> = {
  // Categories
  'Main Dishes': {
    en: 'Main Dishes',
    ar: 'الأطباق الرئيسية',
    ku: 'خواردنی سەرەکی',
    fr: 'Plats principaux',
  },
  'Delicious main course options': {
    en: 'Delicious main course options',
    ar: 'خيارات الأطباق الرئيسية اللذيذة',
    ku: 'هەڵبژاردنی خواردنی سەرەکی بەتام',
    fr: 'Options de plats principaux délicieux',
  },
  'Sides & Appetizers': {
    en: 'Sides & Appetizers',
    ar: 'المقبلات والأطباق الجانبية',
    ku: 'خواردنی لاوەکی و پێشخواردن',
    fr: 'Accompagnements et apéritifs',
  },
  'Perfect sides and appetizers to complement your meal': {
    en: 'Perfect sides and appetizers to complement your meal',
    ar: 'مقبلات وأطباق جانبية مثالية لتكمل وجبتك',
    ku: 'خواردنی لاوەکی و پێشخواردنی بەنرخ بۆ تەواوکردنی نان',
    fr: 'Accompagnements et apéritifs parfaits pour compléter votre repas',
  },

  // Add-on Groups
  'Extra Toppings (Sample)': {
    en: 'Extra Toppings (Sample)',
    ar: 'إضافات إضافية (عينة)',
    ku: 'زیادە (نموونە)',
    fr: 'Garnitures supplémentaires (Échantillon)',
  },
  'Customization Options (Sample)': {
    en: 'Customization Options (Sample)',
    ar: 'خيارات التخصيص (عينة)',
    ku: 'هەڵبژاردنی تایبەت (نموونە)',
    fr: 'Options de personnalisation (Échantillon)',
  },

  // Add-ons
  'Extra Cheese': {
    en: 'Extra Cheese',
    ar: 'جبن إضافي',
    ku: 'پنیری زیادە',
    fr: 'Fromage supplémentaire',
  },
  'Extra Sauce': {
    en: 'Extra Sauce',
    ar: 'صلصة إضافية',
    ku: 'سۆسی زیادە',
    fr: 'Sauce supplémentaire',
  },
  'Extra Spicy': {
    en: 'Extra Spicy',
    ar: 'حار جداً',
    ku: 'زۆر تون',
    fr: 'Très épicé',
  },
  'No Onions': {
    en: 'No Onions',
    ar: 'بدون بصل',
    ku: 'بەبێ پیاز',
    fr: 'Sans oignons',
  },
  'Well Done': {
    en: 'Well Done',
    ar: 'مطهو جيداً',
    ku: 'بە باشی',
    fr: 'Bien cuit',
  },

  // Variation Groups
  'Size': {
    en: 'Size',
    ar: 'الحجم',
    ku: 'قەبارە',
    fr: 'Taille',
  },
  'Spice Level': {
    en: 'Spice Level',
    ar: 'مستوى التوابل',
    ku: 'ئاستی تون',
    fr: 'Niveau d\'épices',
  },

  // Variations
  'Small': {
    en: 'Small',
    ar: 'صغير',
    ku: 'بچووک',
    fr: 'Petit',
  },
  'Medium': {
    en: 'Medium',
    ar: 'متوسط',
    ku: 'ناوەند',
    fr: 'Moyen',
  },
  'Large': {
    en: 'Large',
    ar: 'كبير',
    ku: 'گەورە',
    fr: 'Grand',
  },
  'Mild': {
    en: 'Mild',
    ar: 'خفيف',
    ku: 'کەم',
    fr: 'Doux',
  },
  'Hot': {
    en: 'Hot',
    ar: 'حار',
    ku: 'تون',
    fr: 'Épicé',
  },
  'Extra Hot': {
    en: 'Extra Hot',
    ar: 'حار جداً',
    ku: 'زۆر تون',
    fr: 'Très épicé',
  },

  // Food Items
  'Sample Burger': {
    en: 'Sample Burger',
    ar: 'برجر عينة',
    ku: 'بێرگەری نموونە',
    fr: 'Burger échantillon',
  },
  'A delicious sample burger': {
    en: 'A delicious sample burger',
    ar: 'برجر عينة لذيذ',
    ku: 'بێرگەری نموونەی بەتام',
    fr: 'Un délicieux burger échantillon',
  },
  'Sample Pizza': {
    en: 'Sample Pizza',
    ar: 'بيتزا عينة',
    ku: 'پیتزای نموونە',
    fr: 'Pizza échantillon',
  },
  'A tasty sample pizza': {
    en: 'A tasty sample pizza',
    ar: 'بيتزا عينة لذيذة',
    ku: 'پیتزای نموونەی بەتام',
    fr: 'Une pizza échantillon savoureuse',
  },
  'Sample Fries': {
    en: 'Sample Fries',
    ar: 'بطاطا مقلية عينة',
    ku: 'فرای نموونە',
    fr: 'Frites échantillon',
  },
  'Crispy sample fries': {
    en: 'Crispy sample fries',
    ar: 'بطاطا مقلية عينة مقرمشة',
    ku: 'فرای نموونەی کرەسپی',
    fr: 'Frites échantillon croustillantes',
  },
  'Garlic Bread': {
    en: 'Garlic Bread',
    ar: 'خبز بالثوم',
    ku: 'نانێکی سیر',
    fr: 'Pain à l\'ail',
  },
  'Freshly baked garlic bread': {
    en: 'Freshly baked garlic bread',
    ar: 'خبز بالثوم طازج من الفرن',
    ku: 'نانێکی سیری تازە پێشتراو',
    fr: 'Pain à l\'ail fraîchement cuit',
  },

  // Buffets
  'All-Day Family Buffet': {
    en: 'All-Day Family Buffet',
    ar: 'بوفيه العائلة طوال اليوم',
    ku: 'بوفێی خێزانی هەموو ڕۆژ',
    fr: 'Buffet familial toute la journée',
  },
  'Unlimited access to our full menu selection including burgers, pizza, fries, and more. Perfect for groups and families!': {
    en: 'Unlimited access to our full menu selection including burgers, pizza, fries, and more. Perfect for groups and families!',
    ar: 'وصول غير محدود إلى قائمة الطعام الكاملة بما في ذلك البرجر والبيتزا والبطاطا المقلية والمزيد. مثالي للمجموعات والعائلات!',
    ku: 'دەستگەیشتنی بێسنوور بە هەموو خواردنەکان لەوانە بێرگەر و پیتزا و فرای و زیاتر. بۆ کۆمەڵ و خێزان بەنرخ!',
    fr: 'Accès illimité à notre sélection complète de menus, y compris des burgers, des pizzas, des frites et plus encore. Parfait pour les groupes et les familles!',
  },
  'Weekend Special Buffet': {
    en: 'Weekend Special Buffet',
    ar: 'بوفيه نهاية الأسبوع الخاص',
    ku: 'بوفێی تایبەتی کۆتایی هەفتە',
    fr: 'Buffet spécial week-end',
  },
  'Premium weekend buffet with all our signature dishes and special items. Available Saturday and Sunday!': {
    en: 'Premium weekend buffet with all our signature dishes and special items. Available Saturday and Sunday!',
    ar: 'بوفيه نهاية الأسبوع المميز مع جميع أطباقنا المميزة والعناصر الخاصة. متاح السبت والأحد!',
    ku: 'بوفێی کۆتایی هەفتەی بەنرخ لەگەڵ هەموو خواردنە تایبەتەکان. لە شەممە و یەکشەممە بەردەستە!',
    fr: 'Buffet week-end premium avec tous nos plats signature et articles spéciaux. Disponible samedi et dimanche!',
  },

  // Combo Meals
  'Classic Burger Combo': {
    en: 'Classic Burger Combo',
    ar: 'كومبو البرجر الكلاسيكي',
    ku: 'کۆمبۆی بێرگەری کلاسیک',
    fr: 'Combo burger classique',
  },
  'Delicious burger paired with crispy golden fries. A perfect meal combination at a great value!': {
    en: 'Delicious burger paired with crispy golden fries. A perfect meal combination at a great value!',
    ar: 'برجر لذيذ مع بطاطا مقلية ذهبية مقرمشة. مزيج وجبة مثالي بقيمة رائعة!',
    ku: 'بێرگەری بەتام لەگەڵ فرای زێڕینی کرەسپی. کۆمبۆی نانی بەنرخ بە بەها!',
    fr: 'Burger délicieux accompagné de frites dorées croustillantes. Une combinaison de repas parfaite à un excellent rapport qualité-prix!',
  },
  'Pizza & Garlic Bread Combo': {
    en: 'Pizza & Garlic Bread Combo',
    ar: 'كومبو البيتزا والخبز بالثوم',
    ku: 'کۆمبۆی پیتزا و نانی سیر',
    fr: 'Combo pizza et pain à l\'ail',
  },
  'Tasty pizza served with freshly baked garlic bread. A classic Italian combination!': {
    en: 'Tasty pizza served with freshly baked garlic bread. A classic Italian combination!',
    ar: 'بيتزا لذيذة تقدم مع خبز بالثوم طازج من الفرن. مزيج إيطالي كلاسيكي!',
    ku: 'پیتزای بەتام لەگەڵ نانی سیری تازە پێشتراو. کۆمبۆی ئیتاڵی کلاسیک!',
    fr: 'Pizza savoureuse servie avec du pain à l\'ail fraîchement cuit. Une combinaison italienne classique!',
  },

  // Branch
  'Main Branch': {
    en: 'Main Branch',
    ar: 'الفرع الرئيسي',
    ku: 'لقی سەرەکی',
    fr: 'Branche principale',
  },

  // Menus
  'All Day': {
    en: 'All Day',
    ar: 'طوال اليوم',
    ku: 'هەموو ڕۆژ',
    fr: 'Toute la journée',
  },
  'Breakfast': {
    en: 'Breakfast',
    ar: 'الإفطار',
    ku: 'نانی بەیانی',
    fr: 'Petit-déjeuner',
  },
  'Lunch': {
    en: 'Lunch',
    ar: 'الغداء',
    ku: 'نانی نیوەڕۆ',
    fr: 'Déjeuner',
  },
  'Dinner': {
    en: 'Dinner',
    ar: 'العشاء',
    ku: 'نانی ئێوارە',
    fr: 'Dîner',
  },
  "Kids' Special": {
    en: "Kids' Special",
    ar: 'قائمة الأطفال الخاصة',
    ku: 'تایبەتی منداڵان',
    fr: 'Menu Enfants',
  },
};

