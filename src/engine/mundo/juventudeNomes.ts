// [fase 4 · frente JUVENTUDE] Identidade plausível dos jovens gerados: país
// pela força da cena em cada macro-região, nome e sobrenome do país (grupos
// linguísticos) e nick no estilo da cena. Puro e determinístico (hash do seed).
// Leve de propósito: entra no bundle da migração do save (sem a base bo3).
import { hashStr } from '../../state/hash';
import type { MacroRegion } from '../../data/regions';

// país de origem por macro-região, pesado pelo tamanho da cena de CS do país
export const YOUTH_COUNTRIES: Record<MacroRegion, [string, number][]> = {
  europe: [
    ['dk', 10], ['fr', 10], ['pl', 10], ['se', 8], ['ua', 8], ['de', 6], ['fi', 6], ['tr', 5], ['pt', 4], ['no', 3],
    ['es', 3], ['cz', 3], ['gb', 3], ['nl', 2], ['be', 2], ['bg', 2], ['rs', 2], ['lt', 2], ['lv', 2], ['ee', 2],
    ['sk', 2], ['ro', 2], ['hu', 1], ['il', 1], ['ba', 1], ['hr', 1], ['it', 1],
  ],
  cis: [['ru', 20], ['kz', 6], ['by', 4], ['uz', 1], ['am', 1], ['ge', 1], ['az', 1]],
  americas: [['br', 20], ['us', 8], ['ar', 7], ['cl', 3], ['ca', 3], ['mx', 2], ['uy', 1], ['pe', 1], ['co', 1]],
  asia: [['cn', 8], ['mn', 7], ['id', 3], ['sa', 3], ['kr', 2], ['jp', 2], ['ph', 2], ['ae', 1], ['jo', 1], ['in', 1], ['my', 1], ['th', 1], ['vn', 1]],
  oceania: [['au', 8], ['nz', 2]],
  africa: [['za', 6], ['eg', 2], ['ma', 2], ['tn', 1], ['ng', 1]],
};

type Lang = 'pt' | 'es' | 'en' | 'nordic' | 'fr' | 'de' | 'pl' | 'cz' | 'ru' | 'ua' | 'tr' | 'balt' | 'balkan' | 'cn' | 'mn' | 'kr' | 'jp' | 'sea' | 'ar' | 'za' | 'it' | 'hu' | 'ro' | 'he';

const LANG_OF: Record<string, Lang> = {
  br: 'pt', pt: 'pt',
  ar: 'es', cl: 'es', mx: 'es', uy: 'es', pe: 'es', co: 'es', es: 'es',
  us: 'en', ca: 'en', gb: 'en', au: 'en', nz: 'en',
  dk: 'nordic', se: 'nordic', no: 'nordic', fi: 'nordic',
  fr: 'fr', be: 'fr',
  de: 'de', nl: 'de', at: 'de', ch: 'de',
  pl: 'pl', cz: 'cz', sk: 'cz',
  ru: 'ru', by: 'ru', kz: 'ru', uz: 'ru', am: 'ru', ge: 'ru', az: 'ru',
  ua: 'ua', tr: 'tr', lt: 'balt', lv: 'balt', ee: 'balt',
  bg: 'balkan', rs: 'balkan', ba: 'balkan', hr: 'balkan',
  cn: 'cn', mn: 'mn', kr: 'kr', jp: 'jp', id: 'sea', ph: 'sea', my: 'sea', th: 'sea', vn: 'sea', in: 'sea',
  sa: 'ar', ae: 'ar', jo: 'ar', eg: 'ar', ma: 'ar', tn: 'ar',
  za: 'za', ng: 'za', it: 'it', hu: 'hu', ro: 'ro', il: 'he',
};

const FIRST: Record<Lang, string[]> = {
  pt: ['Lucas', 'Gabriel', 'Matheus', 'Pedro', 'Rafael', 'Gustavo', 'Felipe', 'Vinícius', 'João', 'Enzo', 'Kauã', 'Arthur', 'Caio', 'Diogo', 'Tiago', 'Rodrigo'],
  es: ['Mateo', 'Santiago', 'Nicolás', 'Joaquín', 'Tomás', 'Benjamín', 'Agustín', 'Facundo', 'Diego', 'Martín', 'Lautaro', 'Emiliano', 'Bruno', 'Ignacio'],
  en: ['Jack', 'Liam', 'Ethan', 'Noah', 'Mason', 'Tyler', 'Ryan', 'Connor', 'Owen', 'Logan', 'Caleb', 'Aiden', 'Brandon', 'Josh'],
  nordic: ['Emil', 'Oliver', 'Magnus', 'Mathias', 'Viktor', 'Elias', 'Oskar', 'Rasmus', 'Aleksi', 'Joonas', 'Isak', 'Lukas', 'Nikolaj', 'Tobias'],
  fr: ['Théo', 'Hugo', 'Nathan', 'Enzo', 'Lucas', 'Mathis', 'Kylian', 'Rayan', 'Clément', 'Maxime', 'Louis', 'Yanis'],
  de: ['Niklas', 'Leon', 'Jonas', 'Finn', 'Luca', 'Tim', 'Julian', 'Moritz', 'Daan', 'Sem', 'Lars', 'Felix'],
  pl: ['Jakub', 'Kacper', 'Mateusz', 'Szymon', 'Filip', 'Bartosz', 'Michał', 'Wiktor', 'Oskar', 'Dawid', 'Paweł'],
  cz: ['Tomáš', 'Jakub', 'Ondřej', 'Matěj', 'Adam', 'Vojtěch', 'Lukáš', 'Dominik', 'Marek', 'Patrik'],
  ru: ['Artem', 'Danil', 'Nikita', 'Kirill', 'Maksim', 'Ilya', 'Egor', 'Timur', 'Dmitry', 'Aleksey', 'Ruslan', 'Vladislav'],
  ua: ['Bohdan', 'Oleksandr', 'Denys', 'Andriy', 'Yurii', 'Mykola', 'Taras', 'Vladyslav', 'Ivan', 'Dmytro'],
  tr: ['Emre', 'Burak', 'Mert', 'Kaan', 'Arda', 'Yusuf', 'Eren', 'Berk', 'Can', 'Onur'],
  balt: ['Rokas', 'Mantas', 'Kārlis', 'Rihards', 'Karl', 'Markus', 'Lukas', 'Dovydas', 'Artjom'],
  balkan: ['Nikola', 'Luka', 'Stefan', 'Marko', 'Aleksandar', 'Ivan', 'Filip', 'Georgi', 'Dimitar'],
  cn: ['Wei', 'Haoran', 'Zihan', 'Yuxuan', 'Jiahao', 'Mingze', 'Tianyu', 'Zhiyuan', 'Chenxi', 'Junjie'],
  mn: ['Temuulen', 'Bat-Erdene', 'Enkhjin', 'Tuguldur', 'Munkh-Orgil', 'Anand', 'Bilguun', 'Tsogt'],
  kr: ['Jihoon', 'Minjun', 'Seojun', 'Dohyun', 'Hyunwoo', 'Jiwon', 'Taeyang', 'Sungmin'],
  jp: ['Kenta', 'Haruto', 'Yuto', 'Ren', 'Sota', 'Riku', 'Kaito', 'Daiki'],
  sea: ['Rizki', 'Arif', 'Nguyen', 'Minh', 'Aditya', 'Joshua', 'Paolo', 'Farhan', 'Kittisak', 'Rohan'],
  ar: ['Omar', 'Youssef', 'Faisal', 'Abdullah', 'Karim', 'Ahmed', 'Hamza', 'Ayoub', 'Khalid', 'Saad'],
  za: ['Thabo', 'Sipho', 'Liam', 'Tunde', 'Kwame', 'Ruan', 'Jaden', 'Lwazi'],
  it: ['Marco', 'Lorenzo', 'Alessandro', 'Matteo', 'Andrea', 'Davide'],
  hu: ['Bence', 'Máté', 'Dániel', 'Levente', 'Ádám', 'Balázs'],
  ro: ['Andrei', 'Mihai', 'Alexandru', 'Ștefan', 'Vlad', 'Radu'],
  he: ['Noam', 'Itai', 'Yonatan', 'Omer', 'Daniel', 'Ariel'],
};
const LAST: Record<Lang, string[]> = {
  pt: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Almeida', 'Costa', 'Ferreira', 'Rocha', 'Barbosa', 'Moreira', 'Teixeira', 'Carvalho', 'Pereira', 'Lima'],
  es: ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Sánchez', 'Romero', 'Díaz', 'Castro', 'Benítez', 'Herrera'],
  en: ['Smith', 'Johnson', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Walker', 'Mitchell', 'Harris', 'Clarke', 'Bennett', 'Hayes'],
  nordic: ['Hansen', 'Nielsen', 'Andersson', 'Johansson', 'Lindqvist', 'Virtanen', 'Korhonen', 'Berg', 'Holm', 'Kristensen', 'Mäkinen', 'Olsen'],
  fr: ['Martin', 'Bernard', 'Dubois', 'Laurent', 'Moreau', 'Girard', 'Lefèvre', 'Fournier', 'Mercier', 'Chevalier'],
  de: ['Müller', 'Schmidt', 'Weber', 'Wagner', 'Becker', 'Hoffmann', 'de Vries', 'Jansen', 'Bakker', 'Koch'],
  pl: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Kaczmarek'],
  cz: ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Horváth', 'Veselý'],
  ru: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Sokolov', 'Volkov', 'Morozov', 'Orlov', 'Lebedev', 'Kozlov', 'Aliyev'],
  ua: ['Kovalenko', 'Shevchenko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Oliynyk', 'Savchenko'],
  tr: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan'],
  balt: ['Kazlauskas', 'Petrauskas', 'Bērziņš', 'Ozoliņš', 'Tamm', 'Saar', 'Jankauskas', 'Kalniņš'],
  balkan: ['Petrović', 'Jovanović', 'Ivanov', 'Georgiev', 'Horvat', 'Kovačević', 'Nikolić', 'Dimitrov'],
  cn: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Zhao', 'Huang', 'Zhou', 'Wu'],
  mn: ['Batbold', 'Ganbaatar', 'Enkhbayar', 'Tsogtbaatar', 'Dorj', 'Bold', 'Otgonbayar'],
  kr: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon'],
  jp: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto'],
  sea: ['Putra', 'Pratama', 'Tran', 'Santos', 'Reyes', 'Wijaya', 'Rahman', 'Sharma', 'Srisuk'],
  ar: ['Haddad', 'Al-Harbi', 'Mansour', 'Saidi', 'Benali', 'Farouk', 'Al-Qahtani', 'Nasser', 'Khalil'],
  za: ['Nkosi', 'Dlamini', 'van der Merwe', 'Adeyemi', 'Mensah', 'Botha', 'Naidoo', 'Mokoena'],
  it: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano'],
  hu: ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga'],
  ro: ['Popescu', 'Ionescu', 'Popa', 'Dumitru', 'Stan', 'Stoica'],
  he: ['Cohen', 'Levi', 'Mizrahi', 'Peretz', 'Biton', 'Friedman'],
};

// nick no estilo da cena: raiz + sufixo curto (m0NESY, donk, jL, sh1ro, b1t…)
const NICK_ROOTS = [
  'kyro', 'naxz', 'volt', 'riku', 'jaxx', 'pyro', 'nova', 'frost', 'dash', 'exo', 'blaze', 'swift', 'aze', 'kibo', 'vexx',
  'm1ko', 'sond', 'ture', 'kez', 'byte', 'sied', 'raze', 'quad', 'lynx', 'orbz', 'myth', 'zeno', 'kova', 'tenz', 'flick',
  'spark', 'nyx', 'rvn', 'dize', 'wisp', 'koa', 'snax', 'arix', 'ghoul', 'jin', 'maru', 'qz', 'sero', 'twix', 'yel',
  'donq', 'shr', 'bit', 'moxi', 'reez', 'zyw', 'fl1p', 'hunt', 'kade', 'lxr', 'nex', 'ozy', 'pk', 'rhx', 'siuh',
  'tabs', 'unk', 'vrz', 'wonk', 'xant', 'yuzu', 'zorte', 'ax1s', 'b0rk', 'crys', 'deko', 'eny', 'fear', 'grim', 'hax',
];
const NICK_SUFFIX = ['', '', '', 'zy', 'ko', 'ix', 'er', '1', 'o', 'y', 'x', 'k', 'ey', 'on', 'sk', 'z', '0', 'ly'];

const unit = (seed: string) => (hashStr(seed) % 100_000) / 100_000;
const pick = <T,>(xs: T[], seed: string): T => xs[hashStr(seed) % xs.length];

/** País sorteado pela força da cena dentro da macro-região. */
export function youthCountry(region: MacroRegion, seed: string): string {
  const list = YOUTH_COUNTRIES[region] ?? YOUTH_COUNTRIES.europe;
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = unit(`cc:${seed}`) * total;
  for (const [cc, w] of list) { r -= w; if (r < 0) return cc; }
  return list[0][0];
}

/** Nome, sobrenome e nick coerentes com o país. */
export function youthIdentity(seed: string, country: string): { nick: string; name: string } {
  const lang = LANG_OF[country] ?? 'en';
  const first = pick(FIRST[lang], `fn:${seed}`);
  const last = pick(LAST[lang], `ln:${seed}`);
  let nick = pick(NICK_ROOTS, `nr:${seed}`) + pick(NICK_SUFFIX, `ns:${seed}`);
  // de vez em quando o nick vem do próprio nome (como "fer", "coldzera", "Ax1Le")
  if (unit(`nn:${seed}`) < 0.18) nick = first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 3 + (hashStr(`nl:${seed}`) % 3)) + pick(['', '1', 'zin', 'x', 'y', 'ek'], `nx:${seed}`);
  return { nick, name: `${first} ${last}` };
}
