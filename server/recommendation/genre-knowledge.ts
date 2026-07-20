export interface GenreKnowledge {
  id: string;
  name: string;
  aliases: readonly string[];
  related: readonly string[];
  moods: readonly string[];
  queryTerms: readonly string[];
  representativeArtists: readonly string[];
}

/**
 * Compact, product-owned genre ontology. It intentionally contains concepts,
 * aliases, and representative examples rather than a copied third-party
 * catalog, so it can live in the request process with no licensing/network
 * dependency. Keep entries concise: the resolver expands this into a bounded
 * hint, never into a track list.
 */
export const GENRE_KNOWLEDGE: readonly GenreKnowledge[] = [
  {
    id: "pop",
    name: "pop",
    aliases: ["pop", "поп", "поп музыка", "pop music"],
    related: ["dance-pop", "indie pop", "synth-pop"],
    moods: ["catchy", "bright", "uplifting"],
    queryTerms: ["modern pop", "melodic pop", "pop hits"],
    representativeArtists: ["Dua Lipa", "The Weeknd", "Моя Мишель"],
  },
  {
    id: "rock",
    name: "rock",
    aliases: ["rock", "рок", "рок музыка", "rok", "rock music"],
    related: ["alternative rock", "indie rock", "hard rock"],
    moods: ["energetic", "driving"],
    queryTerms: ["modern rock", "rock anthems"],
    representativeArtists: ["Foo Fighters", "Arctic Monkeys", "Сплин"],
  },
  {
    id: "indie-rock",
    name: "indie rock",
    aliases: ["indie rock", "инди рок", "инди-рок", "indi rok", "инди"],
    related: ["alternative rock", "post-punk", "dream pop"],
    moods: ["introspective", "energetic"],
    queryTerms: ["indie rock", "indie guitar"],
    representativeArtists: ["Arctic Monkeys", "The Strokes", "Motorama"],
  },
  {
    id: "alternative-rock",
    name: "alternative rock",
    aliases: ["alternative rock", "альтернативный рок", "альтернатива", "alternativny rok"],
    related: ["indie rock", "grunge", "post-grunge"],
    moods: ["intense", "melancholic"],
    queryTerms: ["alternative rock", "modern alternative"],
    representativeArtists: ["Radiohead", "Muse", "Placebo"],
  },
  {
    id: "metal",
    name: "metal",
    aliases: ["metal", "метал", "металл", "heavy metal", "хэви метал", "hevi metal"],
    related: ["metalcore", "thrash metal", "alternative metal"],
    moods: ["heavy", "aggressive", "powerful"],
    queryTerms: ["heavy metal", "modern metal"],
    representativeArtists: ["Metallica", "Bring Me The Horizon", "Architects"],
  },
  {
    id: "punk",
    name: "punk",
    aliases: ["punk", "панк", "панк рок", "punk rock", "pank rok"],
    related: ["pop punk", "hardcore punk", "post-punk"],
    moods: ["rebellious", "fast", "raw"],
    queryTerms: ["punk rock", "modern punk"],
    representativeArtists: ["Green Day", "The Offspring", "Порнофильмы"],
  },
  {
    id: "post-punk",
    name: "post-punk",
    aliases: ["post punk", "post-punk", "постпанк", "пост панк", "post pank"],
    related: ["darkwave", "new wave", "indie rock"],
    moods: ["cold", "melancholic", "driving"],
    queryTerms: ["post-punk", "dark post-punk"],
    representativeArtists: ["Joy Division", "Molchat Doma", "Motorama"],
  },
  {
    id: "hip-hop",
    name: "hip-hop",
    aliases: ["hip hop", "hip-hop", "хип хоп", "хип-хоп", "rap", "рэп", "rep"],
    related: ["trap", "boom bap", "alternative hip-hop"],
    moods: ["rhythmic", "confident"],
    queryTerms: ["hip-hop", "rap tracks"],
    representativeArtists: ["Kendrick Lamar", "J. Cole", "Хаски"],
  },
  {
    id: "trap",
    name: "trap",
    aliases: ["trap", "трэп", "трап", "trep"],
    related: ["hip-hop", "drill", "cloud rap"],
    moods: ["dark", "bass-heavy", "confident"],
    queryTerms: ["trap rap", "dark trap"],
    representativeArtists: ["Travis Scott", "Future", "Miyagi & Andy Panda"],
  },
  {
    id: "rnb",
    name: "R&B",
    aliases: ["r&b", "rnb", "ар энд би", "ритм энд блюз", "rhythm and blues"],
    related: ["neo soul", "soul", "alternative R&B"],
    moods: ["smooth", "sensual", "late-night"],
    queryTerms: ["modern R&B", "alternative R&B"],
    representativeArtists: ["SZA", "Frank Ocean", "The Weeknd"],
  },
  {
    id: "soul",
    name: "soul",
    aliases: ["soul", "соул", "соул музыка", "soul music"],
    related: ["neo soul", "R&B", "funk"],
    moods: ["warm", "emotional", "groovy"],
    queryTerms: ["soul classics", "neo soul"],
    representativeArtists: ["Aretha Franklin", "Marvin Gaye", "Erykah Badu"],
  },
  {
    id: "jazz",
    name: "jazz",
    aliases: ["jazz", "джаз", "dzhaz", "джазовая музыка"],
    related: ["bebop", "cool jazz", "jazz fusion"],
    moods: ["sophisticated", "improvised", "late-night"],
    queryTerms: ["modern jazz", "jazz classics"],
    representativeArtists: ["Miles Davis", "John Coltrane", "BADBADNOTGOOD"],
  },
  {
    id: "blues",
    name: "blues",
    aliases: ["blues", "блюз", "blyuz", "блюзовая музыка"],
    related: ["soul", "blues rock", "rhythm and blues"],
    moods: ["soulful", "melancholic", "raw"],
    queryTerms: ["electric blues", "blues classics"],
    representativeArtists: ["B.B. King", "Muddy Waters", "Gary Clark Jr."],
  },
  {
    id: "classical",
    name: "classical",
    aliases: ["classical", "classical music", "классика", "классическая музыка", "klassika"],
    related: ["neoclassical", "romantic era", "minimalism"],
    moods: ["cinematic", "focused", "calm"],
    queryTerms: ["classical music", "modern classical"],
    representativeArtists: ["Ludovico Einaudi", "Max Richter", "Пётр Чайковский"],
  },
  {
    id: "electronic",
    name: "electronic",
    aliases: ["electronic", "electronic music", "электроника", "электронная музыка", "elektronnaya muzyka"],
    related: ["house", "techno", "ambient"],
    moods: ["synthetic", "rhythmic"],
    queryTerms: ["electronic music", "electronica"],
    representativeArtists: ["The Chemical Brothers", "Bonobo", "Moderat"],
  },
  {
    id: "house",
    name: "house",
    aliases: ["house", "house music", "хаус", "хаус музыка", "haus"],
    related: ["deep house", "progressive house", "disco house"],
    moods: ["danceable", "uplifting", "groovy"],
    queryTerms: ["house music", "deep house"],
    representativeArtists: ["Disclosure", "Fred again..", "Peggy Gou"],
  },
  {
    id: "techno",
    name: "techno",
    aliases: ["techno", "техно", "tehno", "tekno"],
    related: ["minimal techno", "industrial techno", "detroit techno"],
    moods: ["hypnotic", "driving", "dark"],
    queryTerms: ["techno", "hypnotic techno"],
    representativeArtists: ["Charlotte de Witte", "Amelie Lens", "Boris Brejcha"],
  },
  {
    id: "trance",
    name: "trance",
    aliases: ["trance", "транс", "trens", "транс музыка"],
    related: ["progressive trance", "uplifting trance", "psytrance"],
    moods: ["euphoric", "driving", "atmospheric"],
    queryTerms: ["uplifting trance", "progressive trance"],
    representativeArtists: ["Above & Beyond", "Armin van Buuren", "Paul van Dyk"],
  },
  {
    id: "drum-and-bass",
    name: "drum and bass",
    aliases: ["drum and bass", "drum & bass", "dnb", "драм энд бейс", "драм-н-бейс", "dram end beys"],
    related: ["liquid drum and bass", "jungle", "neurofunk"],
    moods: ["fast", "energetic", "bass-heavy"],
    queryTerms: ["drum and bass", "liquid dnb"],
    representativeArtists: ["Netsky", "Pendulum", "Chase & Status"],
  },
  {
    id: "ambient",
    name: "ambient",
    aliases: ["ambient", "эмбиент", "амбиент", "embient", "ambient music"],
    related: ["drone", "dark ambient", "new age"],
    moods: ["calm", "atmospheric", "meditative"],
    queryTerms: ["ambient music", "atmospheric ambient"],
    representativeArtists: ["Brian Eno", "Stars of the Lid", "Biosphere"],
  },
  {
    id: "lo-fi",
    name: "lo-fi",
    aliases: ["lofi", "lo-fi", "лоу фай", "лоу-фай", "лофай", "lou fay"],
    related: ["chillhop", "instrumental hip-hop", "jazzhop"],
    moods: ["calm", "cozy", "focused"],
    queryTerms: ["lofi beats", "chillhop", "lofi study"],
    representativeArtists: ["Nujabes", "Jinsang", "idealism"],
  },
  {
    id: "synthwave",
    name: "synthwave",
    aliases: ["synthwave", "синтвейв", "синт вейв", "sintveyv", "retrowave", "ретровейв"],
    related: ["retrowave", "outrun", "dark synth"],
    moods: ["nostalgic", "neon", "driving"],
    queryTerms: ["synthwave", "retrowave", "outrun"],
    representativeArtists: ["Kavinsky", "The Midnight", "Carpenter Brut"],
  },
  {
    id: "phonk",
    name: "phonk",
    aliases: ["phonk", "фонк", "fonk", "drift phonk", "дрифт фонк"],
    related: ["drift phonk", "memphis rap", "wave"],
    moods: ["dark", "aggressive", "driving"],
    queryTerms: ["phonk", "drift phonk"],
    representativeArtists: ["Kordhell", "DVRST", "INTERWORLD"],
  },
  {
    id: "disco",
    name: "disco",
    aliases: ["disco", "диско", "disko", "nu disco", "ню диско"],
    related: ["nu-disco", "funk", "dance-pop"],
    moods: ["celebratory", "danceable", "bright"],
    queryTerms: ["disco", "nu disco"],
    representativeArtists: ["Chic", "Donna Summer", "Jessie Ware"],
  },
  {
    id: "funk",
    name: "funk",
    aliases: ["funk", "фанк", "fank", "фанк музыка"],
    related: ["soul", "disco", "jazz-funk"],
    moods: ["groovy", "playful", "energetic"],
    queryTerms: ["funk", "modern funk"],
    representativeArtists: ["James Brown", "Parliament", "Vulfpeck"],
  },
  {
    id: "reggae",
    name: "reggae",
    aliases: ["reggae", "регги", "reggi", "регги музыка"],
    related: ["dub", "dancehall", "roots reggae"],
    moods: ["relaxed", "sunny", "groovy"],
    queryTerms: ["reggae", "roots reggae"],
    representativeArtists: ["Bob Marley", "Peter Tosh", "Protoje"],
  },
  {
    id: "afrobeat",
    name: "afrobeat",
    aliases: ["afrobeat", "afrobeats", "афробит", "афробитс", "afro bit"],
    related: ["afrobeats", "highlife", "amapiano"],
    moods: ["danceable", "warm", "rhythmic"],
    queryTerms: ["afrobeats", "afrobeat"],
    representativeArtists: ["Burna Boy", "Wizkid", "Fela Kuti"],
  },
  {
    id: "latin",
    name: "latin",
    aliases: ["latin", "latin music", "латино", "латинская музыка", "reggaeton", "реггетон"],
    related: ["reggaeton", "salsa", "latin pop"],
    moods: ["danceable", "warm", "passionate"],
    queryTerms: ["latin music", "reggaeton", "latin pop"],
    representativeArtists: ["Bad Bunny", "ROSALÍA", "KAROL G"],
  },
  {
    id: "country",
    name: "country",
    aliases: ["country", "кантри", "kantri", "country music"],
    related: ["americana", "bluegrass", "folk"],
    moods: ["storytelling", "warm", "road-trip"],
    queryTerms: ["country music", "modern country"],
    representativeArtists: ["Johnny Cash", "Chris Stapleton", "Kacey Musgraves"],
  },
  {
    id: "folk",
    name: "folk",
    aliases: ["folk", "фолк", "folk music", "фолк музыка", "народная музыка"],
    related: ["indie folk", "singer-songwriter", "americana"],
    moods: ["acoustic", "intimate", "storytelling"],
    queryTerms: ["indie folk", "acoustic folk"],
    representativeArtists: ["Bon Iver", "Fleet Foxes", "Мельница"],
  },
  {
    id: "shoegaze",
    name: "shoegaze",
    aliases: ["shoegaze", "шугейз", "шу гейз", "shugeyz"],
    related: ["dream pop", "noise pop", "post-rock"],
    moods: ["dreamy", "noisy", "melancholic"],
    queryTerms: ["shoegaze", "dreamy shoegaze"],
    representativeArtists: ["Slowdive", "My Bloody Valentine", "Ride"],
  },
  {
    id: "dream-pop",
    name: "dream pop",
    aliases: ["dream pop", "дрим поп", "дрим-поп", "drim pop"],
    related: ["shoegaze", "ethereal wave", "indie pop"],
    moods: ["dreamy", "ethereal", "melancholic"],
    queryTerms: ["dream pop", "ethereal pop"],
    representativeArtists: ["Cocteau Twins", "Beach House", "Cigarettes After Sex"],
  },
  {
    id: "k-pop",
    name: "K-pop",
    aliases: ["k-pop", "kpop", "кей поп", "кей-поп", "к поп"],
    related: ["dance-pop", "electropop", "Korean R&B"],
    moods: ["polished", "energetic", "catchy"],
    queryTerms: ["K-pop", "Korean pop"],
    representativeArtists: ["BTS", "BLACKPINK", "NewJeans"],
  },
  {
    id: "j-pop",
    name: "J-pop",
    aliases: ["j-pop", "jpop", "джей поп", "джей-поп", "японский поп"],
    related: ["city pop", "anime music", "Japanese rock"],
    moods: ["bright", "melodic", "energetic"],
    queryTerms: ["J-pop", "Japanese pop"],
    representativeArtists: ["YOASOBI", "Ado", "Hikaru Utada"],
  },
  {
    id: "soundtrack",
    name: "soundtrack",
    aliases: ["soundtrack", "саундтрек", "саундтреки", "ost", "ост", "музыка из фильма", "музыка из игры"],
    related: ["film score", "game soundtrack", "anime soundtrack"],
    moods: ["cinematic", "atmospheric"],
    queryTerms: ["original soundtrack", "original score"],
    representativeArtists: ["Hans Zimmer", "Joe Hisaishi", "Ludwig Göransson"],
  },
] as const;

interface MoodKnowledge {
  aliases: readonly string[];
  moods: readonly string[];
  queryTerms: readonly string[];
}

const MOOD_KNOWLEDGE: readonly MoodKnowledge[] = [
  { aliases: ["грустная", "грустный", "грусть", "grustnaya", "sad", "melancholic"], moods: ["melancholic", "emotional"], queryTerms: ["melancholic music"] },
  { aliases: ["спокойная", "спокойный", "расслабиться", "spokojnaya", "calm", "relax"], moods: ["calm", "relaxed"], queryTerms: ["calm relaxing music"] },
  { aliases: ["веселая", "весёлый", "радостная", "veselaya", "happy", "uplifting"], moods: ["uplifting", "bright"], queryTerms: ["uplifting music"] },
  { aliases: ["темная", "тёмная", "мрачная", "mracnaya", "dark", "dark mood"], moods: ["dark", "atmospheric"], queryTerms: ["dark atmospheric music"] },
  { aliases: ["для учебы", "для учёбы", "для работы", "фокус", "focus", "study", "work music"], moods: ["focused", "unobtrusive"], queryTerms: ["focus music"] },
  { aliases: ["для тренировки", "тренировка", "workout", "gym", "спорт"], moods: ["energetic", "driving"], queryTerms: ["workout music"] },
  { aliases: ["для сна", "уснуть", "sleep", "sleeping"], moods: ["calm", "soft"], queryTerms: ["sleep music"] },
  { aliases: ["романтика", "романтичная", "любовь", "romantic", "love songs"], moods: ["romantic", "warm"], queryTerms: ["romantic music"] },
] as const;

interface NormalizedGenreAlias {
  genre: GenreKnowledge;
  alias: string;
  words: number;
}

interface NormalizedMoodAlias {
  mood: MoodKnowledge;
  alias: string;
}

export interface GenreRecommendationContext {
  genreIds: string[];
  genreNames: string[];
  relatedGenres: string[];
  moods: string[];
  queryTerms: string[];
  representativeArtists: string[];
  confidence: number;
}

export const MAX_GENRE_HINT_CHARS = 560;

export function normalizeMusicText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Built once when the module loads. Request-time retrieval only normalizes the
// user's prompt and performs boundary checks against these compact arrays.
const NORMALIZED_GENRE_ALIASES: readonly NormalizedGenreAlias[] = GENRE_KNOWLEDGE.flatMap((genre) =>
  genre.aliases.map((rawAlias) => {
    const alias = normalizeMusicText(rawAlias);
    return { genre, alias, words: alias.split(" ").length };
  }),
);

const NORMALIZED_MOOD_ALIASES: readonly NormalizedMoodAlias[] = MOOD_KNOWLEDGE.flatMap((mood) =>
  mood.aliases.map((rawAlias) => ({ mood, alias: normalizeMusicText(rawAlias) })),
);

function containsNormalizedPhrase(paddedInput: string, phrase: string): boolean {
  return phrase.length > 0 && paddedInput.includes(` ${phrase} `);
}

function unique<T>(items: Iterable<T>, limit: number): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Pure, synchronous retrieval. Import-time constants are the only data source. */
export function resolveGenreContext(prompt: string): GenreRecommendationContext | null {
  const normalized = normalizeMusicText(prompt);
  if (!normalized) return null;

  const paddedInput = ` ${normalized} `;

  const genreScores = new Map<string, { genre: GenreKnowledge; score: number }>();
  for (const entry of NORMALIZED_GENRE_ALIASES) {
    if (!containsNormalizedPhrase(paddedInput, entry.alias)) continue;
    const exactBonus = entry.alias === normalized ? 4 : 0;
    const score = entry.words * 3 + exactBonus + Math.min(entry.alias.length / 100, 0.5);
    const prior = genreScores.get(entry.genre.id);
    if (!prior || score > prior.score) genreScores.set(entry.genre.id, { genre: entry.genre, score });
  }

  const scored = [...genreScores.values()]
    .sort((a, b) => b.score - a.score || a.genre.id.localeCompare(b.genre.id));

  const topScore = scored[0]?.score ?? 0;
  const matchedGenres = scored.filter((entry) => entry.score >= topScore - 1.5).slice(0, 2).map((entry) => entry.genre);

  const matchedMoods = unique(
    NORMALIZED_MOOD_ALIASES
      .filter((entry) => containsNormalizedPhrase(paddedInput, entry.alias))
      .map((entry) => entry.mood),
    MOOD_KNOWLEDGE.length,
  );
  if (matchedGenres.length === 0 && matchedMoods.length === 0) return null;

  return {
    genreIds: matchedGenres.map((genre) => genre.id),
    genreNames: matchedGenres.map((genre) => genre.name),
    relatedGenres: unique(matchedGenres.flatMap((genre) => genre.related), 4),
    moods: unique([
      ...matchedGenres.flatMap((genre) => genre.moods),
      ...matchedMoods.flatMap((mood) => mood.moods),
    ], 4),
    queryTerms: unique([
      ...matchedGenres.flatMap((genre) => genre.queryTerms),
      ...matchedMoods.flatMap((mood) => mood.queryTerms),
    ], 6),
    representativeArtists: unique(matchedGenres.flatMap((genre) => genre.representativeArtists), 5),
    confidence: matchedGenres.length > 0 ? Math.min(1, topScore / 10) : 0.55,
  };
}

function appendBounded(parts: string[], label: string, values: string[], maxChars: number): void {
  if (values.length === 0) return;
  const prefix = `${label}: `;
  const accepted: string[] = [];
  for (const value of values) {
    const candidate = `${prefix}${[...accepted, value].join(", ")}`;
    const prospective = [...parts, candidate].join("\n");
    if (prospective.length > maxChars) break;
    accepted.push(value);
  }
  if (accepted.length > 0) parts.push(`${prefix}${accepted.join(", ")}`);
}

/** Formats a small advisory hint; never lets taxonomy size leak into prompt size. */
export function formatGenreHint(
  context: GenreRecommendationContext,
  maxChars = MAX_GENRE_HINT_CHARS,
): string {
  const header = "LOCAL MUSIC CONTEXT (advisory; use within the existing search plan, do not add tool calls solely for this hint):";
  if (maxChars <= header.length) return header.slice(0, Math.max(0, maxChars));
  const parts = [header];
  appendBounded(parts, "Genres", context.genreNames, maxChars);
  appendBounded(parts, "Related", context.relatedGenres, maxChars);
  appendBounded(parts, "Mood", context.moods, maxChars);
  appendBounded(parts, "Useful query terms", context.queryTerms, maxChars);
  appendBounded(parts, "Representative artists (style anchors, not required picks)", context.representativeArtists, maxChars);
  return parts.join("\n").slice(0, maxChars);
}

export function appendGenreHint(systemPrompt: string, context: GenreRecommendationContext | null): string {
  if (!context) return systemPrompt;
  return `${systemPrompt}\n\n${formatGenreHint(context)}`;
}
