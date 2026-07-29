// src/aiChat.ts
//
// Bridges the chat UI (AiChat.tsx) to your existing Gemini + TMDB/imdbapi
// layer. Drop this next to your existing src/ai.ts and src/tmdb.ts, and
// adjust the two TODOs below to match your actual function names/signatures
// — I don't have the current contents of src/ai.ts, so this assumes the
// same GoogleGenerativeAI setup you're already using in getGeminiRecommendations.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchMovie, searchPerson } from './tmdb';
// TODO: if your tmdb.ts doesn't export searchMovie/searchPerson yet, add
// thin wrappers around whatever search endpoint you're already using for
// getFullDetails — they just need to take a title/name and return the
// TMDB/imdbapi object (id, poster_path or profile_path, etc).

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY as string);
// TODO: swap in however you currently read the API key in src/ai.ts.

const SYSTEM_INSTRUCTION = `
You are a movie-recommendation chat assistant. Always reply with ONLY valid JSON,
no markdown fences, matching exactly one of these shapes:

{"kind":"text","text":"..."}
{"kind":"movies","text":"one short sentence intro","titles":["Movie Title (Year)", ...]}
{"kind":"actors","text":"one short sentence intro","names":["Actor Name", ...]}
{"kind":"movie_detail","text":"one short sentence intro","title":"Movie Title (Year)"}

Rules:
- Use "movies" when the user wants recommendations, a list, or "movies like X" (3-8 titles).
- Use "actors" when the user asks about actors/directors/cast, or "movies with X" where X is a person (3-6 names).
- Use "movie_detail" when the user asks about one specific film by name.
- Use "text" for anything conversational (greetings, clarifying questions, opinions, no clear movie/actor ask).
- Never invent an "id", "poster_path", or other TMDB fields — only return titles/names as plain text.
  The app resolves those against TMDB itself.
- Keep "text" friendly and under 20 words.
`.trim();

type RawReply =
  | { kind: 'text'; text: string }
  | { kind: 'movies'; text?: string; titles: string[] }
  | { kind: 'actors'; text?: string; names: string[] }
  | { kind: 'movie_detail'; text?: string; title: string };

export type ChatReplyPayload =
  | { role: 'bot'; kind: 'text'; text: string }
  | { role: 'bot'; kind: 'movies'; text?: string; movies: any[] }
  | { role: 'bot'; kind: 'actors'; text?: string; actors: any[] }
  | { role: 'bot'; kind: 'movie_detail'; text?: string; movie: any }
  | { role: 'bot'; kind: 'error'; text: string };

/**
 * Sends the user's message (plus a little history for context) to Gemini,
 * gets back a structured intent, then resolves any titles/names against
 * TMDB so the UI has real poster/profile images to render.
 */
export async function getGeminiChatReply(
  message: string,
  history: { role: string; kind: string; text?: string }[] = [],
  userMemory: string = ''
): Promise<ChatReplyPayload> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash', // TODO: match the model you use in src/ai.ts
    systemInstruction: userMemory
      ? `${SYSTEM_INSTRUCTION}\n\nWhat you know about this user so far (use it to tailor picks, don't repeat it back verbatim): ${userMemory}`
      : SYSTEM_INSTRUCTION,
  });

  const contextLines = history
    .slice(-6)
    .filter((h) => h.kind === 'text' && h.text)
    .map((h) => `${h.role}: ${h.text}`)
    .join('\n');

  const prompt = contextLines
    ? `Recent conversation:\n${contextLines}\n\nUser: ${message}`
    : `User: ${message}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  let parsed: RawReply;
  try {
    // strip accidental ```json fences just in case
    const cleaned = raw.replace(/^```json\s*|```$/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    // Model didn't return JSON — fall back to a plain text bubble.
    return { role: 'bot', kind: 'text', text: raw || "I'm not sure how to answer that." };
  }

  switch (parsed.kind) {
    case 'text':
      return { role: 'bot', kind: 'text', text: parsed.text };

    case 'movies': {
      const movies = await resolveAll(parsed.titles, searchMovie);
      if (!movies.length) return { role: 'bot', kind: 'text', text: "Couldn't find those — try describing it differently?" };
      return { role: 'bot', kind: 'movies', text: parsed.text, movies };
    }

    case 'actors': {
      const actors = await resolveAll(parsed.names, searchPerson);
      if (!actors.length) return { role: 'bot', kind: 'text', text: "Couldn't find that person — try another name?" };
      return { role: 'bot', kind: 'actors', text: parsed.text, actors };
    }

    case 'movie_detail': {
      const movie = await searchMovie(parsed.title);
      if (!movie) return { role: 'bot', kind: 'text', text: `Couldn't find "${parsed.title}".` };
      return { role: 'bot', kind: 'movie_detail', text: parsed.text, movie };
    }

    default:
      return { role: 'bot', kind: 'text', text: "I'm not sure how to answer that." };
  }
}

// Resolves a list of titles/names against TMDB in parallel, dropping misses.
async function resolveAll<T>(queries: string[], resolver: (q: string) => Promise<T | null>): Promise<T[]> {
  const settled = await Promise.all(queries.map((q) => resolver(q).catch(() => null)));
  return settled.filter((r): r is T => !!r);
}

/**
 * Cheap follow-up call that keeps a running 1-3 sentence profile of the
 * user's taste, fed to future chats via the userMemory param above. Call
 * this after a user turn that reveals a preference (a rating, "I loved X",
 * "I hate horror", etc) — no need to call it on every single message.
 * Returns the memory unchanged if nothing new was revealed.
 */
export async function updateUserMemory(existingMemory: string, userMessage: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `
Existing profile of a movie-app user (may be empty): "${existingMemory}"
Their latest message: "${userMessage}"

If this message reveals a lasting taste/preference (genres, actors, directors,
things they dislike, mood patterns) update the profile to a SHORT 1-3 sentence
summary that includes it. If it reveals nothing new and lasting, return the
existing profile unchanged. Reply with ONLY the profile text, no quotes, no JSON.
`.trim();

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return existingMemory;
  }
}