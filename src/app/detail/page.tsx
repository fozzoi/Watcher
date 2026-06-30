"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Star, 
  Heart, 
  Play, 
  Search, 
  ExternalLink, 
  Film, 
  Tv, 
  Clock, 
  Sparkles,
  Layers,
  Info,
  Calendar,
  ChevronRight,
  X
} from 'lucide-react';
import { 
  getImageUrl, 
  getMediaDetails, 
  getExternalIds, 
  getSimilarMedia, 
  getSeasonEpisodes, 
  getGeminiMoviesSimilarTo, 
  GLOBAL_CONFIG,
  TMDBResult,
  TMDBSeason,
  TMDBEpisode
} from '@/utils/tmdb';
import { getProgress, WatchProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';
import axios from 'axios';

function DetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idStr = searchParams.get('id');
  const typeStr = searchParams.get('type') as 'movie' | 'tv';

  const [movie, setMovie] = useState<TMDBResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [historyProgress, setHistoryProgress] = useState<WatchProgress | null>(null);
  
  // Cast and recommendations
  const [similarMedia, setSimilarMedia] = useState<TMDBResult[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<TMDBResult[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  // TV Seasons & Episodes
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  // Lens Insight Modal / Panel
  const [lensInsight, setLensInsight] = useState<string | null>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);
  const [showLensPanel, setShowLensPanel] = useState(false);

  const tmdbId = Number(idStr);

  const fetchDetails = useCallback(async () => {
    if (!tmdbId || !typeStr) return;
    setLoading(true);
    try {
      // 1. Fetch full details (which automatically appends cast, production companies etc.)
      const details = await getMediaDetails(tmdbId, typeStr);
      setMovie(details);
      
      // 2. Fetch similar TMDB listings
      const similar = await getSimilarMedia(tmdbId, typeStr);
      setSimilarMedia(similar.slice(0, 10));

      // 3. Fetch user progress / continue watching metadata
      const progress = await getProgress(tmdbId);
      if (progress) setHistoryProgress(progress);

      // 4. Default select first season if TV
      if (typeStr === 'tv' && details.seasons && details.seasons.length > 0) {
        const firstSeason = details.seasons.find(s => s.season_number > 0) || details.seasons[0];
        setSelectedSeason(firstSeason.season_number);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tmdbId, typeStr]);

  // Load Watchlist state
  const loadWatchlistState = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setWatchlistIds(new Set(list.map((i: any) => i.id)));
        setIsInWatchlist(list.some((item: any) => item.id === tmdbId));
      }
    } catch (e) {}
  }, [tmdbId]);

  // Load everything
  useEffect(() => {
    fetchDetails();
    loadWatchlistState();
  }, [fetchDetails, loadWatchlistState]);

  // Auto-fetch Gemini recommendation if configured
  useEffect(() => {
    const checkAutoAi = async () => {
      const savedAutoAi = await AsyncStorage.getItem('settings_auto_ai');
      const autoEnabled = savedAutoAi !== null ? JSON.parse(savedAutoAi) : true;
      
      if (autoEnabled && movie) {
        setLoadingAi(true);
        try {
          const aiData = await getGeminiMoviesSimilarTo(movie.title || movie.name || '', typeStr, tmdbId);
          setAiRecommendations(aiData.slice(0, 6));
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingAi(false);
        }
      }
    };
    if (movie) checkAutoAi();
  }, [movie, typeStr, tmdbId]);

  // Load TV show episodes when season changes
  useEffect(() => {
    if (typeStr !== 'tv' || selectedSeason === null) return;
    
    const fetchEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const epData = await getSeasonEpisodes(tmdbId, selectedSeason);
        setEpisodes(epData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingEpisodes(false);
      }
    };
    fetchEpisodes();
  }, [selectedSeason, typeStr, tmdbId]);

  // Handle watchlist toggle
  const toggleWatchlist = async () => {
    if (!movie) return;
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      let currentList = stored ? JSON.parse(stored) : [];
      
      if (currentList.find((i: any) => i.id === movie.id)) {
        currentList = currentList.filter((i: any) => i.id !== movie.id);
        setIsInWatchlist(false);
      } else {
        currentList.push(movie);
        setIsInWatchlist(true);
      }
      
      await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    } catch (e) {
      console.error(e);
    }
  };

  // Lens Insight trigger using Gemini Flash API
  const handleFetchLensInsight = async () => {
    if (!movie) return;
    
    setLensLoading(true);
    setLensError(null);
    setShowLensPanel(true);
    
    try {
      const response = await fetch('https://watcher-api-rho.vercel.app/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lens',
          title: movie.title || movie.name,
          mediaType: typeStr,
          year: (movie.release_date || movie.first_air_date || '').substring(0, 4),
          overview: movie.overview || '',
          customApiKey: GLOBAL_CONFIG.customApiKey,
        }),
      });

      const data = await response.json();
      if (data?.result) {
        setLensInsight(data.result);
      } else {
        setLensError(data?.error || 'No insight returned.');
      }
    } catch (e: any) {
      setLensError(e.message || 'Failed to connect to proxy endpoint.');
    } finally {
      setLensLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-container">
        <div className="spinner" />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="empty-state">
        <Info size={32} />
        <p>Movie details could not be found.</p>
        <button className="btn-secondary" onClick={() => router.push('/')}>Go Home</button>
      </div>
    );
  }

  const titleText = movie.title || movie.name;
  const ratingText = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
  const yearText = (movie.release_date || movie.first_air_date || '').substring(0, 4);

  return (
    <div className="detail-container">
      {/* Backdrop cover and gradient banner */}
      <div className="backdrop-header">
        <img 
          src={getImageUrl(movie.backdrop_path || movie.poster_path, 'original')} 
          alt={titleText} 
          className="backdrop-img" 
        />
        <div className="backdrop-overlay" />
        
        <button className="back-btn glass" onClick={() => router.back()} title="Go Back">
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Media Details Summary Panel */}
      <div className="detail-content-wrapper animate-fade-in-up">
        <div className="main-meta-box">
          <div className="poster-box">
            <img src={getImageUrl(movie.poster_path, 'w500')} alt={titleText} className="poster-img" />
          </div>
          
          <div className="meta-details">
            <h1 className="movie-title">{titleText}</h1>
            {movie.tagline && <p className="tagline">"{movie.tagline}"</p>}
            
            <div className="details-badges">
              <div className="rating-badge">
                <Star size={14} fill="gold" stroke="gold" />
                <span>{ratingText}</span>
              </div>
              <span className="badge year">{yearText}</span>
              {typeStr === 'tv' && movie.number_of_seasons && (
                <span className="badge seasons-count">{movie.number_of_seasons} Seasons</span>
              )}
              {movie.runtime ? (
                <span className="badge runtime">
                  <Clock size={12} />
                  <span>{movie.runtime} min</span>
                </span>
              ) : null}
              {movie.certification && <span className="badge rating">{movie.certification}</span>}
            </div>

            {/* Core Action buttons */}
            <div className="detail-actions">
              {typeStr === 'movie' ? (
                <Link 
                  href={`/player?id=${movie.id}&type=movie&title=${encodeURIComponent(titleText || '')}`}
                  className="btn-primary"
                >
                  <Play size={18} fill="white" />
                  <span>Play Movie</span>
                </Link>
              ) : (
                <button 
                  className="btn-primary"
                  onClick={() => {
                    const el = document.getElementById('episodes-section');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <Play size={18} fill="white" />
                  <span>Choose Episode</span>
                </button>
              )}

              <button 
                className={`btn-secondary ${isInWatchlist ? 'watchlist-added' : ''}`}
                onClick={toggleWatchlist}
              >
                <Heart size={18} fill={isInWatchlist ? "var(--primary)" : "none"} color={isInWatchlist ? "var(--primary)" : "#fff"} />
                <span>Watchlist</span>
              </button>

              <button 
                className="btn-secondary"
                onClick={() => router.push(`/search?prefillQuery=${encodeURIComponent(titleText || '')}`)}
              >
                <Search size={18} />
                <span>Search Torrents</span>
              </button>
            </div>
          </div>
        </div>

        {/* Playback Resume State */}
        {historyProgress && (
          <div className="resume-play-box glass animate-fade-in-up">
            <div className="resume-info">
              <Film size={20} className="resume-icon" />
              <div>
                <h4>Resume Playback</h4>
                <p>
                  {typeStr === 'tv' 
                    ? `Season ${historyProgress.lastSeason}, Episode ${historyProgress.lastEpisode}`
                    : 'Movie'}
                </p>
              </div>
            </div>
            <Link 
              href={`/player?id=${movie.id}&type=${typeStr}&title=${encodeURIComponent(titleText || '')}&season=${historyProgress.lastSeason}&episode=${historyProgress.lastEpisode}`}
              className="btn-primary"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Resume Play
            </Link>
          </div>
        )}

        {/* Synopsis Grid details */}
        <div className="synopsis-box">
          <h2>Synopsis</h2>
          <p className="overview-text">{movie.overview}</p>

          {/* Lens AI button */}
          <button className="lens-ai-btn" onClick={handleFetchLensInsight}>
            <Sparkles size={16} />
            <span>AI lens insights</span>
          </button>
        </div>

        {/* Lens Panel overlay */}
        {showLensPanel && (
          <div className="lens-insight-panel glass-premium animate-fade-in-up">
            <div className="panel-header">
              <div className="panel-title-sec">
                <Sparkles size={18} className="lens-panel-icon" />
                <h3>Gemini Lens Insight</h3>
              </div>
              <button className="panel-close-btn" onClick={() => setShowLensPanel(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="panel-body">
              {lensLoading ? (
                <div className="lens-loader">
                  <div className="shimmer-line" />
                  <div className="shimmer-line short" />
                  <p>Consulting Gemini model...</p>
                </div>
              ) : lensError ? (
                <p className="lens-error">{lensError}</p>
              ) : (
                <div className="lens-markdown-output">
                  {lensInsight?.split('\n').map((line, idx) => {
                    if (line.startsWith('###')) {
                      return <h4 key={idx}>{line.replace('###', '').trim()}</h4>;
                    }
                    if (line.startsWith('##')) {
                      return <h3 key={idx}>{line.replace('##', '').trim()}</h3>;
                    }
                    return <p key={idx}>{line}</p>;
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cast list */}
        {movie.cast && movie.cast.length > 0 && (
          <div className="cast-section">
            <h2>Cast</h2>
            <div className="cast-scroll-container">
              {movie.cast.map((member) => (
                <Link key={member.id} href={`/watchlist?tab=artists&search=${member.name}`} className="cast-card">
                  <div className="cast-avatar">
                    <img 
                      src={getImageUrl(member.profile_path, 'w185')} 
                      alt={member.name} 
                      className="cast-img" 
                      loading="lazy"
                    />
                  </div>
                  <span className="cast-name" title={member.name}>{member.name}</span>
                  <span className="cast-character" title={member.character}>{member.character}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Episodes listing for TV Show */}
        {typeStr === 'tv' && movie.seasons && movie.seasons.length > 0 && (
          <div className="episodes-section" id="episodes-section">
            <div className="section-header-tv">
              <h2>Episodes</h2>
              
              {/* Season dropdown selector */}
              <select 
                value={selectedSeason || 1} 
                onChange={(e) => setSelectedSeason(Number(e.target.value))}
                className="season-dropdown"
              >
                {movie.seasons
                  .filter(s => s.season_number > 0)
                  .map(s => (
                    <option key={s.id} value={s.season_number}>
                      {s.name} ({s.episode_count} Episodes)
                    </option>
                  ))
                }
              </select>
            </div>

            {loadingEpisodes ? (
              <div className="loading-spinner-container" style={{ padding: '30px' }}>
                <div className="spinner" />
              </div>
            ) : episodes.length > 0 ? (
              <div className="episodes-list">
                {episodes.map((ep) => (
                  <div key={ep.id} className="episode-item glass">
                    <div className="ep-still-box">
                      <img 
                        src={getImageUrl(ep.still_path || movie.backdrop_path || movie.poster_path, 'w300')} 
                        alt={ep.name} 
                        className="ep-still-img" 
                        loading="lazy"
                      />
                      
                      <Link 
                        href={`/player?id=${movie.id}&type=tv&title=${encodeURIComponent(titleText || '')}&season=${ep.season_number}&episode=${ep.episode_number}`}
                        className="ep-play-btn"
                      >
                        <Play size={16} fill="white" />
                      </Link>
                    </div>

                    <div className="ep-details">
                      <div className="ep-header">
                        <h3>Episode {ep.episode_number}: {ep.name}</h3>
                        {ep.air_date && (
                          <span className="ep-air-date">
                            <Calendar size={11} />
                            <span>{ep.air_date}</span>
                          </span>
                        )}
                      </div>
                      <p className="ep-overview">{ep.overview || "No episode description available."}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No episodes found for this season.</p>
            )}
          </div>
        )}

        {/* AI Recommendations */}
        {aiRecommendations.length > 0 && (
          <div className="ai-recs-section">
            <div className="ai-recs-header">
              <Sparkles size={16} style={{ color: '#8a2be2' }} />
              <h2>AI Recommended Vibe</h2>
            </div>
            
            <div className="media-grid">
              {aiRecommendations.map((item) => (
                <MovieCard
                  key={item.id}
                  item={item}
                  isAdded={watchlistIds.has(item.id)}
                  toggleWatchlist={async (it, e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const stored = await AsyncStorage.getItem('watchlist');
                    let list = stored ? JSON.parse(stored) : [];
                    if (list.find((i: any) => i.id === it.id)) {
                      list = list.filter((i: any) => i.id !== it.id);
                    } else {
                      list.push(it);
                    }
                    await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                    setWatchlistIds(new Set(list.map((i: any) => i.id)));
                  }}
                  showTitle={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Similar Media Section */}
        {similarMedia.length > 0 && (
          <div className="similar-media-section">
            <h2>Similar Recommendations</h2>
            <div className="media-grid">
              {similarMedia.map((item) => (
                <MovieCard
                  key={item.id}
                  item={item}
                  isAdded={watchlistIds.has(item.id)}
                  toggleWatchlist={async (it, e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const stored = await AsyncStorage.getItem('watchlist');
                    let list = stored ? JSON.parse(stored) : [];
                    if (list.find((i: any) => i.id === it.id)) {
                      list = list.filter((i: any) => i.id !== it.id);
                    } else {
                      list.push(it);
                    }
                    await AsyncStorage.setItem('watchlist', JSON.stringify(list));
                    setWatchlistIds(new Set(list.map((i: any) => i.id)));
                  }}
                  showTitle={true}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .detail-container {
          position: relative;
          margin-top: -30px; /* pull backdrop image all the way up */
          margin-left: -40px;
          margin-right: -40px;
        }

        @media (max-width: 900px) {
          .detail-container {
            margin-top: -20px;
            margin-left: -20px;
            margin-right: -20px;
          }
        }

        /* Backdrop banner */
        .backdrop-header {
          position: relative;
          width: 100%;
          height: 380px;
          overflow: hidden;
          background: #000;
        }

        .backdrop-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0.55;
          filter: blur(2px);
        }

        .backdrop-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to top, rgba(12, 12, 14, 1) 0%, rgba(12, 12, 14, 0.4) 60%, rgba(12, 12, 14, 0.2) 100%);
        }

        .back-btn {
          position: absolute;
          top: 40px;
          left: 40px;
          background: rgba(0, 0, 0, 0.55);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--foreground);
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          transition: var(--transition-smooth);
        }

        .back-btn:hover {
          background: #fff;
          color: #000;
          scale: 1.1;
        }

        @media (max-width: 900px) {
          .back-btn {
            top: 24px;
            left: 24px;
          }
        }

        /* Details layout */
        .detail-content-wrapper {
          padding: 0 40px 100px 40px;
          margin-top: -120px; /* overlap with backdrop banner */
          position: relative;
          z-index: 5;
          display: flex;
          flex-direction: column;
          gap: 35px;
        }

        @media (max-width: 900px) {
          .detail-content-wrapper {
            padding: 0 20px 80px 20px;
            margin-top: -160px;
          }
        }

        .main-meta-box {
          display: flex;
          gap: 30px;
          align-items: flex-end;
        }

        @media (max-width: 768px) {
          .main-meta-box {
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
        }

        .poster-box {
          width: 200px;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          background: #111;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          border: 1px solid var(--card-border);
          flex-shrink: 0;
        }

        .poster-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .meta-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-bottom: 10px;
        }

        .movie-title {
          font-size: 32px;
          font-weight: 800;
          color: var(--foreground);
          line-height: 1.2;
        }

        @media (max-width: 768px) {
          .movie-title {
            font-size: 24px;
          }
        }

        .tagline {
          font-size: 15px;
          font-style: italic;
          color: var(--foreground-muted);
        }

        .details-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        @media (max-width: 768px) {
          .details-badges {
            justify-content: center;
          }
        }

        .rating-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 215, 0, 0.12);
          border: 1px solid rgba(255, 215, 0, 0.25);
          color: #ffd700;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 700;
        }

        .badge {
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 6px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--foreground-muted);
        }

        .badge.runtime {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .detail-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 14px;
        }

        @media (max-width: 768px) {
          .detail-actions {
            justify-content: center;
          }
        }

        .btn-secondary.watchlist-added {
          border-color: rgba(229,9,20,0.3);
          background: rgba(229,9,20,0.06);
          color: var(--primary);
        }

        /* Resume Progress box */
        .resume-play-box {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-radius: var(--border-radius-md);
          border: 1px solid rgba(229,9,20,0.2);
          background: rgba(229,9,20,0.03);
          gap: 20px;
        }

        @media (max-width: 600px) {
          .resume-play-box {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
            text-align: center;
          }
        }

        .resume-info {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .resume-icon {
          color: var(--primary);
        }

        .resume-info h4 {
          font-size: 14.5px;
          font-weight: 700;
          color: var(--foreground);
        }

        .resume-info p {
          font-size: 12.5px;
          color: var(--foreground-muted);
        }

        /* Synopsis section */
        .synopsis-box {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .synopsis-box h2, .cast-section h2, .episodes-section h2, .similar-media-section h2, .ai-recs-section h2 {
          font-size: 20px;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: 0.5px;
        }

        .overview-text {
          font-size: 15px;
          line-height: 1.6;
          color: var(--foreground-muted);
        }

        .lens-ai-btn {
          background: rgba(138,43,226,0.1);
          border: 1.5px dashed rgba(138,43,226,0.35);
          color: #a78bfa;
          padding: 10px 18px;
          border-radius: var(--border-radius-sm);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          align-self: flex-start;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .lens-ai-btn:hover {
          background: rgba(138,43,226,0.25);
          border-color: rgba(138,43,226,0.5);
          transform: translateY(-1px);
        }

        /* Lens panel output */
        .lens-insight-panel {
          border-radius: var(--border-radius-md);
          border: 1px solid rgba(138,43,226,0.25);
          padding: 24px;
          background: rgba(15, 10, 25, 0.4);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .panel-title-sec {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #a78bfa;
        }

        .panel-title-sec h3 {
          font-size: 16px;
          font-weight: 800;
        }

        .panel-close-btn {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
        }

        .lens-loader {
          display: flex;
          flex-direction: column;
          gap: 10px;
          color: var(--foreground-muted);
          font-size: 13px;
        }

        .shimmer-line {
          width: 100%;
          height: 14px;
          border-radius: 4px;
          background: linear-gradient(90deg, #1f1b2c 25%, #302a45 50%, #1f1b2c 75%);
          background-size: 200% 100%;
          animation: lens-shimmer 1.5s infinite;
        }

        .shimmer-line.short {
          width: 70%;
        }

        @keyframes lens-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .lens-markdown-output {
          font-size: 14px;
          color: var(--foreground-muted);
          line-height: 1.6;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .lens-markdown-output h4 {
          font-size: 14.5px;
          font-weight: 700;
          color: var(--foreground);
          margin-top: 8px;
        }

        /* Cast members scrolling */
        .cast-scroll-container {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 10px;
          scrollbar-width: none;
        }

        .cast-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .cast-card {
          flex: 0 0 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
          max-width: 120px;
        }

        .cast-avatar {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          overflow: hidden;
          background: rgba(255,255,255,0.03);
          border: 2px solid rgba(255,255,255,0.08);
          transition: var(--transition-smooth);
        }

        .cast-card:hover .cast-avatar {
          border-color: var(--primary);
          transform: scale(1.05);
        }

        .cast-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .cast-name {
          display: block;
          font-size: 12px;
          font-weight: 700;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
          line-height: 1.3;
        }

        .cast-character {
          display: block;
          font-size: 11px;
          color: var(--foreground-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          width: 100%;
          line-height: 1.3;
          margin-top: -2px;
        }

        /* Episodes section */
        .section-header-tv {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .season-dropdown {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--foreground);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13.5px;
          font-weight: 600;
          outline: none;
          cursor: pointer;
        }

        .season-dropdown option {
          background: #0f0f12;
        }

        .episodes-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .episode-item {
          display: flex;
          padding: 16px;
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          background: rgba(20, 20, 25, 0.3);
          gap: 20px;
        }

        @media (max-width: 600px) {
          .episode-item {
            flex-direction: column;
            gap: 12px;
          }
        }

        .ep-still-box {
          position: relative;
          width: 160px;
          aspect-ratio: 16/9;
          border-radius: var(--border-radius-sm);
          overflow: hidden;
          background: #111;
          flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.03);
        }

        @media (max-width: 600px) {
          .ep-still-box {
            width: 100%;
          }
        }

        .ep-still-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition-smooth);
        }

        .episode-item:hover .ep-still-img {
          scale: 1.05;
        }

        .ep-play-btn {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: var(--transition-smooth);
        }

        .ep-still-box:hover .ep-play-btn {
          opacity: 1;
        }

        .ep-play-btn :global(svg) {
          filter: drop-shadow(0 0 4px var(--primary-glow));
          transition: var(--transition-smooth);
        }

        .ep-play-btn:hover :global(svg) {
          scale: 1.15;
        }

        .ep-details {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }

        .ep-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        @media (max-width: 768px) {
          .ep-header {
            flex-direction: column;
            gap: 4px;
          }
        }

        .ep-header h3 {
          font-size: 15px;
          font-weight: 700;
          color: var(--foreground);
        }

        .ep-air-date {
          font-size: 11px;
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .ep-overview {
          font-size: 13px;
          color: var(--foreground-muted);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        /* AI recs header */
        .ai-recs-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          color: #a78bfa;
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 80px 0;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function DetailPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner" />
      </div>
    }>
      <DetailContent />
    </Suspense>
  );
}
