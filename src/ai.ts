import axios from 'axios';
import { searchTMDB, TMDBResult, GLOBAL_CONFIG } from './tmdb';

export const getGeminiRecommendations = async (userPrompt: string): Promise<TMDBResult[]> => {
  try {
    const response = await axios.post(
      'https://watcher-api-rho.vercel.app/api/gemini',
      {
        action: 'search',
        userPrompt: userPrompt,
        customApiKey: GLOBAL_CONFIG.customApiKey
      },
      { timeout: 25000 }
    );
    
    if (!response.data.results || response.data.results.length === 0) return [];

    const moviePromises = response.data.results.map(async (item: any) => {
      const results = await searchTMDB(item.title, 1, { priority: 'high' });
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    return movies.filter((m): m is TMDBResult => m !== null);

  } catch (error: any) {
    console.error("AI Proxy Error:", error.message);
    return [];
  }
};