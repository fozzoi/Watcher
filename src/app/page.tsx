"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Star, Heart, Play, Sparkles } from 'lucide-react';
import { 
  fetchAllDiscoveryContent, 
  searchTMDB, 
  getFullDetails,
  getImageUrl,
  TMDBResult 
} from '@/utils/tmdb';
import { getAllProgress, removeProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MediaCarousel from '@/components/MediaCarousel';
import WatchHistoryCarousel from '@/components/WatchHistoryCarousel';
import MovieCard from '@/components/MovieCard';

const GENRE_DATA = [
  { id: 0, name: 'All', icon: '🎬' },
  { id: 28, name: 'Action', icon: '💥' },
  { id: 12, name: 'Adventure', icon: '🗺️' },
  { id: 16, name: 'Animation', icon: '🎨' },
  { id: 35, name: 'Comedy', icon: '😂' },
  { id: 80, name: 'Crime', icon: '🔪' },
  { id: 27, name: 'Horror', icon: '👻' },
  { id: 10749, name: 'Romance', icon: '💕' },
  { id: 878, name: 'Sci-Fi', icon: '🚀' },
  { id: 53, name: 'Thriller', icon: '😱' },
];

export default function ExplorePage() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>([]);
  const [rawContent, setRawContent] = useState<any>(null);
  
  // Hero section sliding index
  const [heroIndex, setHeroIndex] = useState(0);
  const heroIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load user details
  const loadUserData = useCallback(async () => {
    try {
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const m = mStr ? JSON.parse(mStr) : [];
      const a = aStr ? JSON.parse(aStr) : [];
      setSavedIds(new Set([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]));

      const history = await getAllProgress();
      setWatchHistory(history);
    } catch (e) {
      console.error("Failed to load user data:", e);
    }
  }, []);

  // Fetch explore content
  const fetchContent = useCallback(async (genreId: number = 0, forceRefresh: boolean = false) => {
    setContentLoading(true);
    try {
      const content = await fetchAllDiscoveryContent(genreId, forceRefresh);
      if (content) {
        setRawContent(content);
      }
    } catch (err) {
      console.error("Failed to load explore content:", err);
    } finally {
      setContentLoading(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    loadUserData();
    fetchContent(selectedGenre);
  }, [selectedGenre, loadUserData, fetchContent]);

  // Auto-slide hero section
  useEffect(() => {
    if (!rawContent?.trendingMovies || rawContent.trendingMovies.length === 0) return;
    
    // Clear old interval
    if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    
    heroIntervalRef.current = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(5, rawContent.trendingMovies.length));
    }, 6000);
    
    return () => {
      if (heroIntervalRef.current) clearInterval(heroIntervalRef.current);
    };
  }, [rawContent]);

  // Search handler
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    
    setSearchLoading(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await searchTMDB(query);
        setSearchResults(results.filter(item => item.poster_path));
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  // Toggle watchlist helper
  const toggleWatchlist = async (item: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isPerson = !!(item.profile_path || item.known_for_department);
    const key = isPerson ? 'favoriteArtists' : 'watchlist';
    
    try {
      const currentStr = await AsyncStorage.getItem(key);
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      
      if (currentList.find((i: any) => i.id === item.id)) {
        currentList = currentList.filter((i: any) => i.id !== item.id);
      } else {
        currentList.push(item);
      }
      
      await AsyncStorage.setItem(key, JSON.stringify(currentList));
      setSavedIds(prev => {
        const n = new Set(prev);
        if (n.has(item.id)) n.delete(item.id);
        else n.add(item.id);
        return n;
      });
    } catch (e) {
      console.error("Failed to toggle watchlist:", e);
    }
  };

  const handleRemoveHistoryItem = async (tmdbId: number) => {
    await removeProgress(tmdbId);
    setWatchHistory(prev => prev.filter(item => item.tmdbId !== tmdbId));
  };

  const currentHeroMovie = rawContent?.trendingMovies?.[heroIndex];

  return (
    <div className="explore-container">
      {/* Dynamic Animated Atmospheric Background blobs */}
      <div className="atmos-container">
        <div className="atmos-blob rotate-1" />
        <div className="atmos-blob rotate-2" />
      </div>

      {/* Header Search Section */}
      <div className="explore-header-row animate-fade-in-up">
        <div className="search-bar-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search movies, shows, anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input-field"
          />
        </div>
        
        <button className="ai-btn" onClick={() => router.push('/ai-search')}>
          <Sparkles size={16} />
          <span>Ask AI</span>
        </button>
      </div>

      {/* Search mode results */}
      {query.trim() !== '' ? (
        <div className="search-results-section animate-fade-in-up">
          <h2 className="section-title">
            {searchLoading ? 'Searching...' : `Results for "${query}"`}
          </h2>
          {searchLoading ? (
            <div className="loading-spinner-container">
              <div className="spinner" />
            </div>
          ) : searchResults.length > 0 ? (
            <div className="media-grid">
              {searchResults.map((item) => (
                <MovieCard
                  key={item.id}
                  item={item}
                  isAdded={savedIds.has(item.id)}
                  toggleWatchlist={toggleWatchlist}
                  showTitle={true}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">No results found.</div>
          )}
        </div>
      ) : (
        /* Standard explore mode dashboard */
        <>
          {/* Genre selector */}
          <div className="genres-container animate-fade-in-up">
            {GENRE_DATA.map((genre) => (
              <button
                key={genre.id}
                onClick={() => setSelectedGenre(genre.id)}
                className={`genre-chip ${selectedGenre === genre.id ? 'active' : ''}`}
              >
                <span className="genre-icon">{genre.icon}</span>
                <span className="genre-name">{genre.name}</span>
              </button>
            ))}
          </div>

          {/* Loader or Content */}
          {contentLoading ? (
            <div className="loading-shimmer-explore">
              <div className="shimmer-hero" />
              <div className="shimmer-title" />
              <div className="shimmer-cards-row">
                <div className="shimmer-card" />
                <div className="shimmer-card" />
                <div className="shimmer-card" />
                <div className="shimmer-card" />
              </div>
            </div>
          ) : (
            <>
              {/* Dynamic Hero Section */}
              {currentHeroMovie && (
                <div className="hero-section glass-premium animate-fade-in-up">
                  <div className="hero-banner-wrapper">
                    <img
                      src={getImageUrl(currentHeroMovie.backdrop_path || currentHeroMovie.poster_path, 'original')}
                      alt={currentHeroMovie.title || currentHeroMovie.name}
                      className="hero-backdrop"
                    />
                    <div className="hero-gradient-overlay" />
                  </div>
                  
                  <div className="hero-content">
                    <h1 className="hero-title">{currentHeroMovie.title || currentHeroMovie.name}</h1>
                    <p className="hero-overview">{currentHeroMovie.overview}</p>
                    
                    <div className="hero-meta">
                      <div className="hero-rating">
                        <Star size={16} fill="gold" stroke="gold" />
                        <span>{currentHeroMovie.vote_average?.toFixed(1) || 'N/A'}</span>
                      </div>
                      <span className="hero-year">
                        {(currentHeroMovie.release_date || currentHeroMovie.first_air_date || '').substring(0, 4)}
                      </span>
                    </div>

                    <div className="hero-actions">
                      <button 
                        className="btn-primary" 
                        onClick={() => router.push(`/detail?id=${currentHeroMovie.id}&type=${currentHeroMovie.media_type}`)}
                      >
                        <Play size={18} fill="white" />
                        <span>View Details</span>
                      </button>
                      
                      <button 
                        className="btn-secondary" 
                        onClick={(e) => toggleWatchlist(currentHeroMovie, e)}
                      >
                        <Heart size={18} fill={savedIds.has(currentHeroMovie.id) ? "var(--primary)" : "none"} color={savedIds.has(currentHeroMovie.id) ? "var(--primary)" : "#fff"} />
                        <span>{savedIds.has(currentHeroMovie.id) ? 'In Watchlist' : 'Add Watchlist'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Slides Indicators */}
                  <div className="hero-indicators">
                    {rawContent?.trendingMovies?.slice(0, 5).map((_: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setHeroIndex(idx)}
                        className={`indicator-dot ${heroIndex === idx ? 'active' : ''}`}
                        aria-label={`Slide ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Continue Watching Section */}
              <WatchHistoryCarousel 
                history={watchHistory} 
                onRemove={handleRemoveHistoryItem} 
              />

              {/* Category Carousels */}
              {rawContent && (
                <div className="carousels-container">
                  <MediaCarousel title="Trending Movies" type="trendingMovies" data={rawContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Trending TV Shows" type="trendingTV" data={rawContent.trendingTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Top Rated Masterpieces" type="topRated" data={rawContent.topRated} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Popular in India" type="regional" data={rawContent.regional} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Upcoming Releases" type="upcoming" data={rawContent.upcoming} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Bollywood Blockbusters" type="hindiMovies" data={rawContent.hindiMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Hindi Television" type="hindiTV" data={rawContent.hindiTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Malayalam Cinema" type="malayalamMovies" data={rawContent.malayalamMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Malayalam Shows" type="malayalamTV" data={rawContent.malayalamTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Tamil Cinema" type="tamilMovies" data={rawContent.tamilMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="K-Drama Movies" type="koreanMovies" data={rawContent.koreanMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Korean Series" type="koreanTV" data={rawContent.koreanTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Anime Movies" type="animeMovies" data={rawContent.animeMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Anime Series" type="animeShows" data={rawContent.animeShows} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Animated Features" type="animatedMovies" data={rawContent.animatedMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="Hidden Gems" type="hiddenGems" data={rawContent.hiddenGems} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                  <MediaCarousel title="90s & 2000s Nostalgia" type="nostalgia" data={rawContent.nostalgia} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                </div>
              )}
            </>
          )}
        </>
      )}

      <style jsx>{`
        .explore-container {
          position: relative;
          z-index: 1;
        }

        /* Atmospheric Animated Background */
        .atmos-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          z-index: -1;
          pointer-events: none;
        }

        .atmos-blob {
          position: absolute;
          width: 60vw;
          height: 60vw;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.15;
        }

        .rotate-1 {
          background: radial-gradient(circle, var(--primary) 0%, transparent 70%);
          top: -10vw;
          left: 10vw;
          animation: spin 60s linear infinite;
        }

        .rotate-2 {
          background: radial-gradient(circle, #5b1bf5 0%, transparent 70%);
          bottom: -10vw;
          right: 10vw;
          animation: spin-back 75s linear infinite;
        }

        @keyframes spin {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(50px, -30px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(360deg); }
        }

        @keyframes spin-back {
          0% { transform: translate(0, 0) rotate(360deg); }
          50% { transform: translate(-40px, 40px) rotate(180deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }

        /* Header search row */
        .explore-header-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          width: 100%;
          flex-wrap: wrap;
        }

        .search-bar-container {
          position: relative;
          flex: 1;
        }

        .search-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--foreground-muted);
        }

        .ai-btn {
          background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
          color: white;
          border: none;
          padding: 0 24px;
          height: 48px;
          border-radius: 24px;
          font-weight: 600;
          font-size: 14px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
          box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4);
        }

        .ai-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6);
          filter: brightness(1.1);
        }

        /* Genre Chip Row */
        .genres-container {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 12px;
          margin-bottom: 24px;
          scrollbar-width: none;
        }

        .genres-container::-webkit-scrollbar {
          display: none;
        }

        .genre-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 20px;
          background: var(--badge-bg);
          border: 1px solid var(--badge-border);
          color: var(--foreground-muted);
          font-weight: 600;
          font-size: 13.5px;
          cursor: pointer;
          white-space: nowrap;
          transition: var(--transition-smooth);
        }

        .genre-chip:hover {
          color: var(--foreground);
          background: var(--sidebar-hover);
          border-color: var(--foreground-muted);
        }

        .genre-chip.active {
          background: var(--primary-gradient);
          border-color: transparent;
          color: var(--foreground);
          box-shadow: 0 4px 10px var(--primary-glow);
        }

        /* Hero banner section */
        .hero-section {
          position: relative;
          width: 100%;
          height: 380px;
          border-radius: var(--border-radius-lg);
          overflow: hidden;
          margin-bottom: 35px;
          display: flex;
          align-items: flex-end;
          padding: 40px;
        }

        @media (max-width: 768px) {
          .hero-section {
            height: 320px;
            padding: 24px;
          }
        }

        .hero-banner-wrapper {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1;
        }

        .hero-backdrop {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hero-gradient-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to top, rgba(12, 12, 14, 1) 0%, rgba(12, 12, 14, 0.4) 40%, rgba(12, 12, 14, 0) 100%),
                      linear-gradient(to right, rgba(12, 12, 14, 0.8) 0%, rgba(12, 12, 14, 0) 60%);
        }

        .hero-content {
          position: relative;
          z-index: 2;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .hero-title {
          font-size: 32px;
          font-weight: 800;
          color: var(--foreground);
          line-height: 1.2;
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }

        @media (max-width: 768px) {
          .hero-title {
            font-size: 24px;
          }
        }

        .hero-overview {
          font-size: 14px;
          color: var(--foreground-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }

        .hero-meta {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hero-rating {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 700;
          color: var(--foreground);
        }

        .hero-year {
          color: var(--foreground-muted);
          font-weight: 600;
        }

        .hero-actions {
          display: flex;
          gap: 14px;
          margin-top: 10px;
        }

        .hero-indicators {
          position: absolute;
          right: 40px;
          bottom: 40px;
          display: flex;
          gap: 8px;
          z-index: 5;
        }

        @media (max-width: 768px) {
          .hero-indicators {
            display: none; /* Hide on mobile to save space */
          }
        }

        .indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          border: none;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .indicator-dot.active {
          background: var(--primary);
          width: 24px;
          border-radius: 4px;
          box-shadow: 0 0 6px var(--primary-glow);
        }

        /* Search Results layout */
        .search-results-section {
          margin-top: 10px;
        }

        .section-title {
          font-size: 22px;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 20px;
        }

        /* Shimmer Loading skeletons */
        .loading-shimmer-explore {
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: 100%;
        }

        .shimmer-hero {
          width: 100%;
          height: 380px;
          border-radius: var(--border-radius-lg);
          background: linear-gradient(90deg, var(--card-bg) 25%, var(--sidebar-hover) 50%, var(--card-bg) 75%);
          background-size: 200% 100%;
          animation: loading-shimmer 1.5s infinite;
        }

        .shimmer-title {
          width: 200px;
          height: 24px;
          border-radius: 4px;
          background: linear-gradient(90deg, var(--card-bg) 25%, var(--sidebar-hover) 50%, var(--card-bg) 75%);
          background-size: 200% 100%;
          animation: loading-shimmer 1.5s infinite;
        }

        .shimmer-cards-row {
          display: flex;
          gap: 16px;
        }

        .shimmer-card {
          flex: 1;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          background: linear-gradient(90deg, var(--card-bg) 25%, var(--sidebar-hover) 50%, var(--card-bg) 75%);
          background-size: 200% 100%;
          animation: loading-shimmer 1.5s infinite;
        }

        @keyframes loading-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 80px 0;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid var(--card-border);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .empty-state {
          text-align: center;
          color: var(--foreground-muted);
          padding: 80px 0;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
