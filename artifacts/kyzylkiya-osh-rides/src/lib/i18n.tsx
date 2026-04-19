import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Language = "kg" | "ru";

type Dict = Record<string, string>;

const STORAGE_KEY = "mak.lang";

const translations: Record<Language, Dict> = {
  kg: {
    "lang.kg": "КЫР",
    "lang.ru": "РУС",
    "lang.toggle.aria": "Тилди алмаштыруу",

    "header.brand": "МАК",
    "header.brand.full": "Мени Алып Кет",
    "header.today": "Бүгүн",
    "header.stats": "{trips} сапар • {seats} орун",
    "header.title": "Кыргызстан боюнча сапарлар",
    "header.subtitle": "Каалаган багытты тандап, тез машина табыңыз",

    "tabs.passenger": "Мен жүргүнчүмүн",
    "tabs.driver": "Мен айдоочумун",

    "passenger.title": "Багытты тандаңыз",
    "passenger.description": "Кыргызстандын ичиндеги каалаган шаар же айыл боюнча машина табыңыз.",
    "passenger.origin.label": "Кайсы жерден чыгасыз?",
    "passenger.origin.placeholder": "Чыгуу пунктун тандаңыз",
    "passenger.destination.label": "Каякка барасыз?",
    "passenger.destination.placeholder": "Баруу пунктун тандаңыз",
    "passenger.address.label": "Так кайсы жерден алып кетсин?",
    "passenger.address.placeholder": "көчө, объект же конкреттүү жер",
    "passenger.address.hint": "OpenStreetMap маалымат базасынан көчө/объект тандаңыз",
    "passenger.notes.label": "Кошумча эскертүү",
    "passenger.notes.placeholder": "мисалы: үй номери, көрүнгөн белги, жүк бар",
    "passenger.seats.label": "Канча орун керек?",
    "passenger.seats.placeholder": "Орун тандаңыз",
    "passenger.seats.value": "{n} орун",
    "passenger.submit": "Машина табуу",
    "passenger.submit.loading": "Жөнөтүлүүдө...",

    "passenger.toast.created.title": "Заявка жөнөтүлдү",
    "passenger.toast.created.desc": "Азыр сизге машина издеп жатабыз.",
    "passenger.toast.error.title": "Ката кетти",
    "passenger.toast.error.desc": "Заявканы түзүү мүмкүн болгон жок. Кайра аракет кылыңыз.",

    "passenger.found.title": "Машина табылды",
    "passenger.found.subtitle": "{route} сапарыңыз тастыкталды",
    "passenger.found.driver": "Айдоочу",
    "passenger.found.age-short": "жаш",
    "passenger.found.experience": "Айдоо стажы: {n} жыл",
    "passenger.found.car": "Унаа",
    "passenger.found.plate": "Номери",
    "passenger.found.seats": "Орундар",
    "passenger.found.seats-value": "{n} орун",
    "passenger.found.call": "Чалуу: {phone}",
    "passenger.found.search-other": "Башка сапар издөө",

    "passenger.waiting.title": "Айдоочу изделүүдө",
    "passenger.waiting.desc": "Заявкаңыз ушул багыттагы айдоочуларга көрсөтүлүүдө. Адатта 2-5 мүнөт талап кылынат.",

    "passenger.error.origin": "Кайсы жерден чыгарыңызды тандаңыз",
    "passenger.error.destination": "Каякка барарыңызды тандаңыз",
    "passenger.error.address": "Так даректи жазыңыз",
    "passenger.error.same": "Чыгуу жана баруу пункттары башка болушу керек",
    "passenger.error.notes": "500 белгиден ашпасын",

    "driver.live": "On line",
    "driver.active.title": "Активдүү заявкалар",
    "driver.filter.title": "Багыт боюнча чыпкалоо",
    "driver.filter.from": "Кайдан",
    "driver.filter.to": "Каякка",
    "driver.filter.all-from": "Бардык чыгуу пункттары",
    "driver.filter.all-to": "Бардык баруу пункттары",
    "driver.empty.title": "Бул багытта активдүү заявка жок",
    "driver.empty.desc": "Жаңы жүргүнчүлөрдү күтүп жатабыз...",
    "driver.card.address": "Алып кетүү дареги",
    "driver.card.seats": "{n} орун",
    "driver.card.accept": "Заказды кабыл алуу",

    "driver.dialog.title": "Заявканы кабыл алуу",
    "driver.dialog.desc": "Жүргүнчү сизди табышы үчүн маалыматыңызды жазыңыз.",
    "driver.dialog.name": "Атыңыз",
    "driver.dialog.name.placeholder": "мисалы: Азамат",
    "driver.dialog.phone": "Телефон номери",
    "driver.dialog.phone.placeholder": "+996 555 000 000",
    "driver.dialog.submit": "Ырастап, маалыматты жөнөтүү",
    "driver.dialog.submit.loading": "Ырасталууда...",

    "driver.toast.accepted.title": "Заказ кабыл алынды",
    "driver.toast.accepted.desc": "Жүргүнчүгө сиздин маалыматыңыз көрсөтүлдү.",
    "driver.toast.error.title": "Ката кетти",
    "driver.toast.error.desc": "Заказды кабыл алуу мүмкүн болгон жок. Балким, аны башка айдоочу алган.",
    "driver.error.name": "Атыңыз өтө кыска",
    "driver.error.phone": "Туура телефон номерин жазыңыз",
    "driver.error.age": "Жашыңызды туура жазыңыз (18-80)",
    "driver.error.experience": "Стажыңызды туура жазыңыз",
    "driver.error.car-make": "Унаанын маркасын жазыңыз",
    "driver.error.car-year": "Чыгарылган жылын жазыңыз",
    "driver.error.car-plate": "Мамлекеттик номерин жазыңыз",
    "driver.error.car-color": "Унаанын түсүн жазыңыз",
    "driver.error.car-seats": "Орундардын саны 1-8",
    "driver.profile.as": "Сиз: {name} • {phone}",
    "driver.profile.change": "Өзгөртүү",
    "driver.onboard.title": "Айдоочу катары катталыңыз",
    "driver.onboard.desc": "Өзүңүз жана унааңыз тууралуу маалыматты бир жолу гана жазыңыз. Андан кийин буйрутмалар бир баскычта кабыл алынат.",
    "driver.onboard.submit": "Сактоо жана уланту",
    "driver.dialog.age": "Жашыңыз",
    "driver.dialog.age.placeholder": "мисалы: 32",
    "driver.dialog.experience": "Айдоо стажы (жыл)",
    "driver.dialog.experience.placeholder": "мисалы: 8",
    "driver.dialog.car-make": "Унаанын маркасы жана модели",
    "driver.dialog.car-make.placeholder": "мисалы: Honda Fit",
    "driver.dialog.car-year": "Чыгарылган жылы",
    "driver.dialog.car-year.placeholder": "мисалы: 2014",
    "driver.dialog.car-plate": "Мамлекеттик номери",
    "driver.dialog.car-plate.placeholder": "мисалы: 01KG777ABC",
    "driver.dialog.car-color": "Түсү",
    "driver.dialog.car-color.placeholder": "мисалы: ак",
    "driver.dialog.car-seats": "Канча орун (айдоочудан тышкары)",
    "driver.dialog.car-seats.placeholder": "мисалы: 4",
    "driver.section.driver": "Айдоочу тууралуу",
    "driver.section.car": "Унаа тууралуу",
    "combobox.search": "Шаарды издөө...",
    "combobox.empty": "Эч нерсе табылган жок",
    "combobox.add": "Кошуу",
    "passenger.depart.label": "Качан чыгууну каалайсыз?",
    "passenger.depart.today": "Бүгүн",
    "passenger.depart.tomorrow": "Эртең",
    "passenger.depart.from": "Эртеси",
    "passenger.depart.to": "Эң кеч",
    "passenger.depart.hint": "Айдоочу ушул убакыт аралыгында сизди алат",
    "passenger.error.depart-required": "Чыгуу убактысын тандаңыз",
    "passenger.error.depart-order": "«Чейин» убактысы кечирээк болушу керек",
    "driver.card.depart": "Чыгуу: {from} – {to}",

    "time.now": "азыр эле",
    "time.minutes": "{n} мүнөт мурун",
    "time.hours": "{n} саат мурун",
    "time.days": "{n} күн мурун",

    "address.searching": "Изделүүдө...",
    "address.empty": "Эч нерсе табылган жок",
    "address.error": "Издөө учурунда ката кетти",
    "address.use-as-is": "Жазылганды колдонуу",
  },
  ru: {
    "lang.kg": "КЫР",
    "lang.ru": "РУС",
    "lang.toggle.aria": "Сменить язык",

    "header.brand": "МАК",
    "header.brand.full": "Мени Алып Кет",
    "header.today": "Сегодня",
    "header.stats": "{trips} поездок • {seats} мест",
    "header.title": "Поездки по Кыргызстану",
    "header.subtitle": "Выберите маршрут и быстро найдите машину",

    "tabs.passenger": "Я пассажир",
    "tabs.driver": "Я водитель",

    "passenger.title": "Выберите маршрут",
    "passenger.description": "Найдите машину в любой город или село Кыргызстана.",
    "passenger.origin.label": "Откуда выезжаете?",
    "passenger.origin.placeholder": "Выберите пункт отправления",
    "passenger.destination.label": "Куда едете?",
    "passenger.destination.placeholder": "Выберите пункт назначения",
    "passenger.address.label": "Откуда именно забрать?",
    "passenger.address.placeholder": "улица, объект или конкретное место",
    "passenger.address.hint": "Выберите улицу или объект из базы OpenStreetMap",
    "passenger.notes.label": "Дополнительная заметка",
    "passenger.notes.placeholder": "например: номер дома, ориентир, есть багаж",
    "passenger.seats.label": "Сколько мест нужно?",
    "passenger.seats.placeholder": "Выберите количество мест",
    "passenger.seats.value": "{n} мест",
    "passenger.submit": "Найти машину",
    "passenger.submit.loading": "Отправляется...",

    "passenger.toast.created.title": "Заявка отправлена",
    "passenger.toast.created.desc": "Сейчас ищем для вас машину.",
    "passenger.toast.error.title": "Произошла ошибка",
    "passenger.toast.error.desc": "Не удалось создать заявку. Попробуйте ещё раз.",

    "passenger.found.title": "Машина найдена",
    "passenger.found.subtitle": "Поездка {route} подтверждена",
    "passenger.found.driver": "Водитель",
    "passenger.found.age-short": "лет",
    "passenger.found.experience": "Стаж: {n} лет",
    "passenger.found.car": "Автомобиль",
    "passenger.found.plate": "Госномер",
    "passenger.found.seats": "Мест",
    "passenger.found.seats-value": "{n} мест",
    "passenger.found.call": "Позвонить: {phone}",
    "passenger.found.search-other": "Искать другую поездку",

    "passenger.waiting.title": "Поиск водителя",
    "passenger.waiting.desc": "Ваша заявка показана водителям этого направления. Обычно занимает 2–5 минут.",

    "passenger.error.origin": "Выберите пункт отправления",
    "passenger.error.destination": "Выберите пункт назначения",
    "passenger.error.address": "Напишите точный адрес",
    "passenger.error.same": "Пункты отправления и назначения должны различаться",
    "passenger.error.notes": "Не более 500 символов",

    "driver.live": "On line",
    "driver.active.title": "Активные заявки",
    "driver.filter.title": "Фильтр по маршруту",
    "driver.filter.from": "Откуда",
    "driver.filter.to": "Куда",
    "driver.filter.all-from": "Все пункты отправления",
    "driver.filter.all-to": "Все пункты назначения",
    "driver.empty.title": "По этому маршруту нет активных заявок",
    "driver.empty.desc": "Ждём новых пассажиров...",
    "driver.card.address": "Адрес посадки",
    "driver.card.seats": "{n} мест",
    "driver.card.accept": "Принять заказ",

    "driver.dialog.title": "Принять заявку",
    "driver.dialog.desc": "Введите ваши данные, чтобы пассажир мог вас найти.",
    "driver.dialog.name": "Ваше имя",
    "driver.dialog.name.placeholder": "например: Азамат",
    "driver.dialog.phone": "Номер телефона",
    "driver.dialog.phone.placeholder": "+996 555 000 000",
    "driver.dialog.submit": "Подтвердить и отправить",
    "driver.dialog.submit.loading": "Подтверждается...",

    "driver.toast.accepted.title": "Заказ принят",
    "driver.toast.accepted.desc": "Пассажиру показана ваша информация.",
    "driver.toast.error.title": "Произошла ошибка",
    "driver.toast.error.desc": "Не удалось принять заказ. Возможно, его уже забрал другой водитель.",
    "driver.error.name": "Имя слишком короткое",
    "driver.error.phone": "Введите корректный номер телефона",
    "driver.error.age": "Укажите корректный возраст (18-80)",
    "driver.error.experience": "Укажите корректный стаж",
    "driver.error.car-make": "Укажите марку автомобиля",
    "driver.error.car-year": "Укажите год выпуска",
    "driver.error.car-plate": "Укажите госномер",
    "driver.error.car-color": "Укажите цвет",
    "driver.error.car-seats": "Количество мест: 1-8",
    "driver.profile.as": "Вы: {name} • {phone}",
    "driver.profile.change": "Изменить",
    "driver.onboard.title": "Зарегистрируйтесь как водитель",
    "driver.onboard.desc": "Заполните информацию о себе и автомобиле один раз. После этого заявки принимаются в один клик.",
    "driver.onboard.submit": "Сохранить и продолжить",
    "driver.dialog.age": "Ваш возраст",
    "driver.dialog.age.placeholder": "например: 32",
    "driver.dialog.experience": "Стаж вождения (лет)",
    "driver.dialog.experience.placeholder": "например: 8",
    "driver.dialog.car-make": "Марка и модель",
    "driver.dialog.car-make.placeholder": "например: Honda Fit",
    "driver.dialog.car-year": "Год выпуска",
    "driver.dialog.car-year.placeholder": "например: 2014",
    "driver.dialog.car-plate": "Госномер",
    "driver.dialog.car-plate.placeholder": "например: 01KG777ABC",
    "driver.dialog.car-color": "Цвет",
    "driver.dialog.car-color.placeholder": "например: белый",
    "driver.dialog.car-seats": "Количество мест (без водителя)",
    "driver.dialog.car-seats.placeholder": "например: 4",
    "driver.section.driver": "О водителе",
    "driver.section.car": "Об автомобиле",
    "combobox.search": "Поиск города...",
    "combobox.empty": "Ничего не найдено",
    "combobox.add": "Добавить",
    "passenger.depart.label": "Когда хотите выехать?",
    "passenger.depart.today": "Сегодня",
    "passenger.depart.tomorrow": "Завтра",
    "passenger.depart.from": "С",
    "passenger.depart.to": "До",
    "passenger.depart.hint": "Водитель заберёт вас в этом промежутке времени",
    "passenger.error.depart-required": "Выберите время выезда",
    "passenger.error.depart-order": "«До» должно быть позже «С»",
    "driver.card.depart": "Выезд: {from} – {to}",

    "time.now": "только что",
    "time.minutes": "{n} мин назад",
    "time.hours": "{n} ч назад",
    "time.days": "{n} дн назад",

    "address.searching": "Ищем...",
    "address.empty": "Ничего не найдено",
    "address.error": "Ошибка во время поиска",
    "address.use-as-is": "Использовать как есть",
  },
};

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  toggle: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLang(): Language {
  if (typeof window === "undefined") return "kg";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "kg" || stored === "ru") return stored;
  return "kg";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readInitialLang);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang === "kg" ? "ky" : "ru";
  }, [lang]);

  const setLang = (next: Language) => setLangState(next);
  const toggle = () => setLangState((current) => (current === "kg" ? "ru" : "kg"));

  const t = (key: string, vars?: Record<string, string | number>) => {
    const dict = translations[lang];
    let value = dict[key] ?? translations.kg[key] ?? key;
    if (vars) {
      for (const [name, replacement] of Object.entries(vars)) {
        value = value.replaceAll(`{${name}}`, String(replacement));
      }
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useTranslation must be used inside <LanguageProvider>");
  }
  return ctx;
}
