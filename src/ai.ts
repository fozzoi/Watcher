import axios from 'axios';
import { searchTMDB, TMDBResult } from './tmdb';

// 🟢 YOUR KEY
const GEMINI_API_KEY = "AIzaSyBcSSG5lcIn1XascRuhNoipQjzWr4ZnkGc"; 

// ✅ FIX: Use 'gemini-flash-latest' 
// This is the stable alias for the high-speed, free-tier model.
const MODEL_NAME = "gemini-flash-latest"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;

export const getGeminiRecommendations = async (userPrompt: string): Promise<TMDBResult[]> => {
  try {
    const systemInstruction = `
      You are a movie recommendation engine. 
      The user will describe a mood, plot, or vibe.
      Return a JSON array of exactly 10 movie titles that match.
      Do not include years. Do not include introductory text. Just the array.
      
      Example Input: "Scary movies in space"
      Example Output: ["Alien", "Event Horizon", "Sunshine", "Pandorum", "Life", "Apollo 18", "Gravity", "Interstellar", "Moon", "The Martian"]
    `;

    const payload = {
      contents: [{
        parts: [{ text: `${systemInstruction}\n\nUser Input: "${userPrompt}"` }]
      }]
    };

    console.log(`Sending request to ${MODEL_NAME}...`);

    const response = await axios.post(GEMINI_URL, payload);
    
    if (!response.data.candidates || response.data.candidates.length === 0) {
      console.warn("AI returned no candidates.");
      return [];
    }

    const aiText = response.data.candidates[0].content.parts[0].text;
    
    // Clean JSON
    const cleanJson = aiText.replace(/```json|```/g, '').trim();
    
    let movieTitles: string[] = [];
    try {
        movieTitles = JSON.parse(cleanJson);
    } catch (e) {
        console.error("Failed to parse AI JSON:", cleanJson);
        return [];
    }

    const moviePromises = movieTitles.map(async (title) => {
      const results = await searchTMDB(title);
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    return movies.filter((m): m is TMDBResult => m !== null);

  } catch (error: any) {
    if (error.response) {
        // Log detailed API error
        console.error(`AI Error ${error.response.status}:`, JSON.stringify(error.response.data));
    } else {
        console.error("AI Connection Error:", error.message);
    }
    return [];
  }
};