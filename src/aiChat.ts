// src/aiChat.ts
//
// Bridges the chat UI (AiChat.tsx) to your backend at watcher-api.
// Uses the same proxy pattern as src/ai.ts — all Gemini calls go through
// https://watcher-api-rho.vercel.app/api/gemini so we benefit from the
// smart model-fallback system and never expose keys on the client.

import axios from 'axios';
import { searchTMDB, searchPeople, GLOBAL_CONFIG } from './tmdb';

const API_URL = 'https://watcher-api-rho.vercel.app/api/gemini';

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
 * Sends the user's message (plus a little history for context) to the backend,
 * gets back a structured intent, then resolves any titles/names against
 * TMDB so the UI has real poster/profile images to render.
 */
export async function getGeminiChatReply(
  message: string,
  history: { role: string; kind: string; text?: string }[] = [],
  userMemory: string = '',
  watchedTitles: string[] = []
): Promise<ChatReplyPayload> {
  const response = await axios.post(API_URL, {
    action: 'chat',
    message,
    history,
    userMemory,
    watchedTitles: watchedTitles.slice(0, 50), // send up to 50 most recent
    customApiKey: GLOBAL_CONFIG.customApiKey,
  });

  const parsed: RawReply = response.data.reply;
  console.log('🤖 RAW GEMINI REPLY:', JSON.stringify(parsed, null, 2));

  switch (parsed.kind) {
    case 'text':
      return { role: 'bot', kind: 'text', text: parsed.text };

    case 'movies': {
      // searchTMDB returns an array; take the first (best) match for each title
      const movies = await resolveFirst(parsed.titles, (q) => {
        const cleanQuery = q.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        return searchTMDB(cleanQuery, 1);
      });
      if (!movies.length) {
        const fallbackMsg = parsed.text ? `${parsed.text}\n\n(Note: I couldn't find TMDB posters for those titles.)` : "Couldn't find those in the database — try describing it differently?";
        return { role: 'bot', kind: 'text', text: fallbackMsg };
      }
      return { role: 'bot', kind: 'movies', text: parsed.text, movies };
    }

    case 'actors': {
      // searchPeople returns an array; take the first (best) match for each name
      const actors = await resolveFirst(parsed.names, (q) => {
        const cleanQuery = q.replace(/\s*\(\d{4}\)\s*$/, '').trim();
        return searchPeople(cleanQuery, 1);
      });
      if (!actors.length) {
        const fallbackMsg = parsed.text ? `${parsed.text}\n\n(Note: I couldn't find TMDB profiles for those actors.)` : "Couldn't find that person in the database — try another name?";
        return { role: 'bot', kind: 'text', text: fallbackMsg };
      }
      return { role: 'bot', kind: 'actors', text: parsed.text, actors };
    }

    case 'movie_detail': {
      const cleanQuery = parsed.title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
      const results = await searchTMDB(cleanQuery, 1);
      const movie = results[0] ?? null;
      if (!movie) {
        const fallbackMsg = parsed.text ? `${parsed.text}\n\n(Note: I couldn't find TMDB details for "${parsed.title}".)` : `Couldn't find details for "${parsed.title}" in the database.`;
        return { role: 'bot', kind: 'text', text: fallbackMsg };
      }
      return { role: 'bot', kind: 'movie_detail', text: parsed.text, movie };
    }

    default:
      return { role: 'bot', kind: 'text', text: "I'm not sure how to answer that." };
  }
}

// Resolves a list of titles/names against TMDB, taking the first result per query.
// resolver returns T[] (e.g. searchTMDB/searchPeople); we pick index 0 from each.
async function resolveFirst<T>(queries: string[], resolver: (q: string) => Promise<T[]>): Promise<T[]> {
  const settled = await Promise.all(
    queries.map((q) => resolver(q).then((arr) => arr[0] ?? null).catch(() => null))
  );
  return settled.filter((r): r is T => r != null);
}

/**
 * Keeps a rolling 1-3 sentence taste profile of the user.
 * Routes through the backend proxy to avoid direct Gemini calls on client.
 */
export async function updateUserMemory(existingMemory: string, userMessage: string): Promise<string> {
  try {
    const response = await axios.post(API_URL, {
      action: 'update_memory',
      existingMemory,
      userMessage,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    });
    return response.data.memory ?? existingMemory;
  } catch {
    return existingMemory;
  }
}