"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, Star, ArrowLeft, X, Shuffle, AlertCircle } from 'lucide-react';
import { getGeminiRecommendations, TMDBResult } from '@/utils/tmdb';
import MovieCard from '@/components/MovieCard';
import { AsyncStorage } from '@/utils/storage';

const STATIC_VIBES = [
  "🤯 Mind-bending Thriller", "🚀 Stunning Sci-Fi", "👻 Elevated Horror",
  "🌧️ Cozy Rainy Day", "🕵️ Noir Mystery", "🏎️ High Octane Action",
  "🤣 Feel-good Comedy", "⚔️ Epic Fantasy", "💔 Tragic Romance",
  "🧠 Psychological Drama", "🎨 Visually Stunning", "🧟 Zombie Apocalypse"
];

export default function AiSearchPage() {
  const router = useRouter();
  
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState<TMDBResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Shuffle vibes
    const shuffled = [...STATIC_VIBES].sort(() => 0.5 - Math.random());
    setChips(shuffled.slice(0, 6));
    loadWatchlistIds();
  }, []);

  const loadWatchlistIds = async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setSavedIds(new Set(list.map((i: any) => i.id)));
      }
    } catch (e) {}
  };

  const handleGenerate = async (queryOverride?: string) => {
    const query = queryOverride || prompt;
    if (!query.trim()) return;

    setPrompt(query);
    setHasSearched(true);
    setLoading(true);
    setResults([]);

    try {
      const movies = await getGeminiRecommendations(query);
      setResults(movies);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRandom = () => {
    const randomPrompts = [
      "Suggest obscure but amazing movie recommendations with complex plots.",
      "Give me a selection of movies that will blow my mind.",
      "Suggest high rating cult classic movies."
    ];
    const randomQ = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
    handleGenerate(randomQ);
  };

  const handleClear = () => {
    setPrompt('');
    setResults([]);
    setHasSearched(false);
  };

  const toggleWatchlist = async (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const currentStr = await AsyncStorage.getItem('watchlist');
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      
      if (currentList.find((i: any) => i.id === item.id)) {
        currentList = currentList.filter((i: any) => i.id !== item.id);
      } else {
        currentList.push(item);
      }
      
      await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
      setSavedIds(prev => {
        const n = new Set(prev);
        if (n.has(item.id)) n.delete(item.id);
        else n.add(item.id);
        return n;
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="ai-search-container">
      {/* Header row */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <button className="back-btn" onClick={() => router.back()} title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <Sparkles className="header-icon" />
          <h1 className="header-title">AI Recommendations</h1>
        </div>
      </div>

      <div className={`search-body ${!hasSearched ? 'idle' : 'searched'} animate-fade-in-up`}>
        {/* Branding header visible only in idle state */}
        {!hasSearched && (
          <div className="branding-section">
            <div className="logo-glow-box">
              <Sparkles size={40} className="logo-spark" />
            </div>
            <h2>What's the vibe today?</h2>
            <p>Tell the Gemini AI what you feel like watching in natural language.</p>
          </div>
        )}

        {/* Query Input wrapper */}
        <div className="search-input-wrapper">
          <Search className="input-search-icon" size={20} />
          <input
            type="text"
            placeholder="E.g., Obscure sci-fi movies with time travel paradoxes..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
            className="search-input-field"
          />
          <div className="input-actions">
            {prompt.length > 0 && (
              <button className="clear-btn" onClick={handleClear} aria-label="Clear input">
                <X size={18} />
              </button>
            )}
            <button className="lucky-btn" onClick={handleRandom} title="Feeling Lucky">
              <Shuffle size={16} />
            </button>
          </div>
        </div>

        {/* Suggestion Chips */}
        {!hasSearched && (
          <div className="chips-grid">
            {chips.map((chip, index) => (
              <button 
                key={index} 
                className="chip glass"
                onClick={() => handleGenerate(chip.substring(2).trim())}
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Results Block */}
        {hasSearched && (
          <div className="results-wrapper">
            {loading ? (
              <div className="loader-container">
                <div className="gemini-thinking-spinner" />
                <p className="loading-text">Gemini is thinking and matching metadata...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="results-box">
                <h2 className="results-title">AI Recommendations</h2>
                <div className="media-grid">
                  {results.map((item) => (
                    <MovieCard
                      key={item.id}
                      item={item}
                      isAdded={savedIds.has(item.id)}
                      toggleWatchlist={toggleWatchlist}
                      showTitle={true}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <AlertCircle size={32} className="empty-icon" />
                <p>Gemini couldn't find any recommendations matching your vibe. Try details like genres, directors or similar movies.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .ai-search-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .back-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px;
          border-radius: 50%;
          transition: var(--transition-smooth);
        }

        .back-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .header-icon {
          color: #8a2be2;
          filter: drop-shadow(0 0 8px rgba(138, 43, 226, 0.5));
        }

        .header-title {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .search-body {
          display: flex;
          flex-direction: column;
          transition: var(--transition-smooth);
        }

        .search-body.idle {
          justify-content: center;
          align-items: center;
          padding-top: 80px;
          text-align: center;
        }

        .search-body.searched {
          padding-top: 10px;
        }

        .branding-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-bottom: 30px;
        }

        .logo-glow-box {
          width: 72px;
          height: 72px;
          border-radius: var(--border-radius-lg);
          background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(138, 43, 226, 0.4);
        }

        .logo-spark {
          color: #fff;
          filter: drop-shadow(0 0 6px #fff);
        }

        .branding-section h2 {
          font-size: 24px;
          font-weight: 800;
          color: #fff;
        }

        .branding-section p {
          font-size: 14.5px;
          color: var(--foreground-muted);
          max-width: 400px;
          line-height: 1.5;
        }

        .search-input-wrapper {
          position: relative;
          width: 100%;
          max-width: 600px;
          margin-bottom: 24px;
        }

        .input-search-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
        }

        .input-actions {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .clear-btn, .lucky-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: var(--transition-smooth);
        }

        .clear-btn:hover, .lucky-btn:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .lucky-btn {
          color: #8a2be2;
        }

        .lucky-btn:hover {
          background: rgba(138, 43, 226, 0.1);
        }

        /* Chips Grid */
        .chips-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          width: 100%;
          max-width: 600px;
        }

        @media (min-width: 600px) {
          .chips-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .chip {
          padding: 14px 18px;
          border-radius: var(--border-radius-md);
          color: var(--foreground-muted);
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition-smooth);
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--card-border);
          text-align: center;
        }

        .chip:hover {
          color: #fff;
          border-color: rgba(138, 43, 226, 0.3);
          background: rgba(138, 43, 226, 0.05);
          box-shadow: 0 4px 15px rgba(138, 43, 226, 0.1);
          transform: translateY(-2px);
        }

        /* Results section */
        .results-wrapper {
          width: 100%;
          margin-top: 10px;
        }

        .results-title {
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 20px;
        }

        .loader-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 0;
          gap: 20px;
        }

        .gemini-thinking-spinner {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3.5px solid rgba(138, 43, 226, 0.15);
          border-top-color: #8a2be2;
          animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text {
          font-size: 14px;
          color: var(--foreground-muted);
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 80px 20px;
          gap: 16px;
          color: var(--foreground-muted);
        }

        .empty-icon {
          color: var(--foreground-muted);
          opacity: 0.4;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}
