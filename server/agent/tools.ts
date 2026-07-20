import type { MusicProvider, Track } from "../music/types";
import type { ToolSpec } from "./types";

const searchTrackSpec: ToolSpec = {
  name: "searchTrack",
  description:
    "Search the active music backend for a single track by artist and title. " +
    "Returns {uri,title,artist,album?,durationMs?,artwork?} when found, or null. " +
    "Use to verify a track exists before committing it to a playlist.",
  parameters: {
    type: "object",
    properties: {
      artist: { type: "string", description: "Exact artist name, original script (no transliteration)." },
      title: { type: "string", description: "Track title as officially released." },
    },
    required: ["artist", "title"],
  },
};

const searchTracksSpec: ToolSpec = {
  name: "searchTracks",
  description:
    "Free-text search returning up to `limit` candidate tracks for a whole phrase " +
    "(e.g. the user's exact request like \"kyokai no kanata soundtrack\"). " +
    "Use this FIRST for short, named, or mood-based requests you don't have exact " +
    "track titles for — it returns real, verified tracks you can finalize directly. " +
    "Returns an array of {uri,title,artist,album?,durationMs?,artwork?}.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The full search phrase — often the user's raw request." },
      limit: { type: "integer", description: "How many candidate tracks to return (default 10).", minimum: 1, maximum: 25 },
    },
    required: ["query"],
  },
};

const searchArtistSpec: ToolSpec = {
  name: "searchArtist",
  description:
    "Resolve an artist name to a backend-specific artist id. Returns {id,name} or null. " +
    "Use the returned id with getArtistTopTracks to seed tracks around a named artist.",
  parameters: {
    type: "object",
    properties: { name: { type: "string", description: "Artist name to resolve." } },
    required: ["name"],
  },
};

const getArtistTopTracksSpec: ToolSpec = {
  name: "getArtistTopTracks",
  description:
    "Fetch the top tracks for a resolved artist id. Returns up to `limit` tracks. " +
    "Use searchArtist first to obtain the id.",
  parameters: {
    type: "object",
    properties: {
      artistId: { type: "string", description: "Backend-specific artist id from searchArtist." },
      limit: { type: "integer", description: "How many top tracks to return (default 5).", minimum: 1, maximum: 20 },
    },
    required: ["artistId"],
  },
};

const searchAlbumsSpec: ToolSpec = {
  name: "searchAlbums",
  description:
    "Free-text search returning up to `limit` candidate albums for a phrase " +
    "(e.g. \"Burial — Untrue\"). Use when the user wants a whole album, or to " +
    "find an album before pulling its tracks with getAlbumTracks. " +
    "Returns an array of {uri,title,artist,artwork?,deepLink?}.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The full album search phrase — usually artist + album name." },
      limit: { type: "integer", description: "How many candidate albums to return (default 10).", minimum: 1, maximum: 25 },
    },
    required: ["query"],
  },
};

const getAlbumTracksSpec: ToolSpec = {
  name: "getAlbumTracks",
  description:
    "Fetch the tracks of a resolved album. Pass the `uri` from searchAlbums " +
    "verbatim (its `backend:id` form). Returns up to `limit` tracks you can add " +
    "to a playlist. Use searchAlbums first to obtain the uri.",
  parameters: {
    type: "object",
    properties: {
      uri: { type: "string", description: "Album uri from searchAlbums, e.g. \"sc:12345\" or \"ytm:album:AbC\"" },
      limit: { type: "integer", description: "How many tracks to return (default 30).", minimum: 1, maximum: 50 },
    },
    required: ["uri"],
  },
};

const clarifySpec: ToolSpec = {
  name: "clarify",
  description:
    "Ask the user one clarifying question with exactly 3 concrete options. " +
    "May be called at most once per request — the harness returns the user's chosen answer " +
    "(one of the options, or their own free-text reply).",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "One short clarifying question grounded in the user's actual request." },
      options: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3,
        description: "Exactly 3 short, concrete, mutually distinct options.",
      },
    },
    required: ["question", "options"],
  },
};

const finalizePlaylistSpec: ToolSpec = {
  name: "finalize_playlist",
  description:
    "Commit the final playlist. Call exactly once, as the last agent step — the harness stops " +
    "the loop on this call. `tracks` is the full ordered tracklist.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short evocative playlist title fitting the request." },
      tracks: {
        type: "array",
        description: "Ordered track list. No more than 2-3 tracks per artist.",
        items: {
          type: "object",
          properties: {
            artist: { type: "string" },
            title: { type: "string" },
          },
          required: ["artist", "title"],
        },
        minItems: 1,
      },
    },
    required: ["name", "tracks"],
  },
};

const addToPlaylistSpec: ToolSpec = {
  name: "add_to_playlist",
  description:
    "Append tracks to the playlist being extended. Call one or more times while extending an " +
    "existing playlist; each call queues the given tracks. Do NOT include tracks already in the " +
    "existing playlist — they are shown in the system prompt. The harness merges these into the " +
    "final playlist when you call finalize_playlist. `tracks` is an ordered list of new tracks " +
    "(no more than 2-3 per artist).",
  parameters: {
    type: "object",
    properties: {
      tracks: {
        type: "array",
        description: "New tracks to add to the existing playlist.",
        items: {
          type: "object",
          properties: {
            artist: { type: "string" },
            title: { type: "string" },
          },
          required: ["artist", "title"],
        },
        minItems: 1,
      },
    },
    required: ["tracks"],
  },
};

export const MUSIC_AGENT_TOOLS: ToolSpec[] = [
  searchTrackSpec,
  searchTracksSpec,
  searchArtistSpec,
  getArtistTopTracksSpec,
  searchAlbumsSpec,
  getAlbumTracksSpec,
  clarifySpec,
  finalizePlaylistSpec,
  addToPlaylistSpec,
];

export interface ToolDispatcherDeps {
  music: MusicProvider;
  /** Optional pure in-memory ordering/filter applied to backend candidates. */
  rankTracks?: (tracks: Track[]) => Track[];
  /** Delegates to the single-clarify-question flow (see core/generate-playlist.ts). */
  onClarify: (question: string, options: string[]) => Promise<string>;
}

function trackToResult(t: Track | null): Record<string, unknown> | null {
  if (!t) return null;
  const out: Record<string, unknown> = { uri: t.uri, title: t.title, artist: t.artist };
  if (t.album) out.album = t.album;
  if (typeof t.durationMs === "number") out.durationMs = t.durationMs;
  if (t.artwork) out.artwork = t.artwork;
  return out;
}

function repairToolName(name: string, specs: ToolSpec[]): string {
  if (specs.some((s) => s.name === name)) return name;
  const normalize = (s: string) => s.toLowerCase().replace(/[_\-\s]/g, "");
  const match = specs.find((s) => normalize(s.name) === normalize(name));
  return match ? match.name : name;
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  deps: ToolDispatcherDeps,
): Promise<unknown> {
  name = repairToolName(name, MUSIC_AGENT_TOOLS);
  switch (name) {
    case "searchTrack": {
      const artist = String(args.artist ?? "");
      const title = String(args.title ?? "");
      return trackToResult(await deps.music.searchTrack(artist, title));
    }
    case "searchTracks": {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      const tracks = await deps.music.searchTracks(query, limit);
      return (deps.rankTracks ? deps.rankTracks(tracks) : tracks).map(trackToResult);
    }
    case "searchArtist": {
      return deps.music.searchArtist(String(args.name ?? ""));
    }
    case "getArtistTopTracks": {
      const id = String(args.artistId ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 5;
      const tracks = await deps.music.getArtistTopTracks(id, limit);
      return (deps.rankTracks ? deps.rankTracks(tracks) : tracks).map(trackToResult);
    }
    case "searchAlbums": {
      const query = String(args.query ?? "");
      const limit = typeof args.limit === "number" ? args.limit : 10;
      return (await deps.music.searchAlbums(query, limit)).map((a) => {
        const out: Record<string, unknown> = { uri: a.uri, title: a.title, artist: a.artist };
        if (a.artwork) out.artwork = a.artwork;
        if (a.deepLink) out.deepLink = a.deepLink;
        return out;
      });
    }
    case "getAlbumTracks": {
      const uri = String(args.uri ?? "");
      const id = uri.includes(":") ? uri.split(":").slice(1).join(":") : uri;
      const limit = typeof args.limit === "number" ? args.limit : 30;
      return (await deps.music.getAlbumTracks(id, limit)).map(trackToResult);
    }
    case "clarify": {
      const question = String(args.question ?? "");
      const options = Array.isArray(args.options) ? args.options.map(String).slice(0, 3) : [];
      if (question.length === 0 || options.length === 0) {
        throw new Error(
          `clarify requires non-empty "question" and exactly 3 "options" strings. Received: ${JSON.stringify(args)}.`,
        );
      }
      return deps.onClarify(question, options);
    }
    default: {
      const names = MUSIC_AGENT_TOOLS.map((s) => s.name).join(", ");
      throw new Error(`unknown tool: "${name}". Available tools: ${names}.`);
    }
  }
}

/** Build the `tools` payload for the OpenAI-compatible Chat Completions API (OpenAI/CheapVibeCode/Ollama). */
export function toolsForOpenAIChat(specs: ToolSpec[]): unknown[] {
  return specs.map((s) => ({
    type: "function",
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }));
}

/** Build the `tools` payload for the Anthropic Messages API. */
export function toolsForAnthropic(specs: ToolSpec[]): unknown[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    input_schema: s.parameters,
  }));
}
