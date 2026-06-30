"use client";

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader, HelpCircle, AlertTriangle } from 'lucide-react';
import Hls from 'hls.js';
import { saveProgress } from '@/utils/progress';
import { AsyncStorage } from '@/utils/storage';

function PlayerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const idStr = searchParams.get('id');
  const typeStr = searchParams.get('type') || 'movie';
  const titleStr = searchParams.get('title') || 'Unknown Media';
  const seasonStr = searchParams.get('season');
  const episodeStr = searchParams.get('episode');

  const tmdbId = Number(idStr);
  const season = seasonStr ? Number(seasonStr) : 1;
  const episode = episodeStr ? Number(episodeStr) : 1;

  const [streamData, setStreamData] = useState<{ is_m3u8: boolean; stream_url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState("Watcher Engine");
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Fetch stream endpoint
  useEffect(() => {
    if (!tmdbId) return;
    
    let isMounted = true;
    const fetchStream = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const baseUrl = "https://watcher-api-rho.vercel.app";
        const encodedTitle = encodeURIComponent(titleStr);
        const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${tmdbId}&media_type=${typeStr.toLowerCase()}&title=${encodedTitle}&season=${season}&episode=${episode}`;
        
        console.log("📡 Fetching streaming link:", endpoint);
        setActiveProvider("Watcher Engine");

        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`Failed to fetch streaming details: Status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (isMounted && data.status === "success") {
          setStreamData({
            is_m3u8: !!data.is_m3u8,
            stream_url: data.stream_url
          });
          setActiveProvider(data.is_m3u8 ? "Direct HLS Stream" : "Iframe Fallback Server");
        } else {
          throw new Error(data.message || "Failed to find working stream link");
        }
      } catch (err: any) {
        console.error("❌ Streaming connection error:", err);
        if (isMounted) setError(err.message || "Failed to establish stream connection. Server might be offline.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStream();
    
    // Save Watchlist Progress History item
    const handleSaveProgress = async () => {
      try {
        // Fetch poster from detail if possible, otherwise we save general metadata
        const storedWatchlist = await AsyncStorage.getItem('watchlist');
        let posterPath = "";
        if (storedWatchlist) {
          const list = JSON.parse(storedWatchlist);
          const matched = list.find((i: any) => i.id === tmdbId);
          if (matched) posterPath = matched.poster_path;
        }
        
        await saveProgress({
          tmdbId,
          mediaType: typeStr as 'movie' | 'tv',
          title: titleStr,
          poster: posterPath,
          lastSeason: season,
          lastEpisode: episode,
          position: 0,
          duration: 0,
          updatedAt: Date.now()
        });

        // Save also back to general history database
        const storedHistory = await AsyncStorage.getItem('history');
        let currentHistory = storedHistory ? JSON.parse(storedHistory) : [];
        if (!currentHistory.some((item: any) => item.id === tmdbId)) {
          currentHistory.unshift({
            id: tmdbId,
            title: titleStr,
            media_type: typeStr,
            poster_path: posterPath,
            timestamp: Date.now()
          });
          await AsyncStorage.setItem('history', JSON.stringify(currentHistory));
        }
      } catch (e) {
        console.error("Progress save failed:", e);
      }
    };
    
    handleSaveProgress();

    return () => { 
      isMounted = false; 
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [tmdbId, typeStr, season, episode, titleStr]);

  // Configure HLS.js player
  useEffect(() => {
    if (!streamData || !streamData.is_m3u8 || !videoRef.current) return;

    const video = videoRef.current;
    const url = streamData.stream_url;

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxMaxBufferLength: 30, // 30s max buffer
        enableWorker: true,
        lowLatencyMode: true
      });
      
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log("Autoplay blocked:", e));
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setError("Fatal streaming playback error. Link may have expired.");
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari/iOS support
      video.src = url;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log("Autoplay blocked:", e));
      });
    } else {
      setError("HLS playback is not supported in this browser environment.");
    }
  }, [streamData]);

  const handleExit = () => {
    router.replace(`/detail?id=${tmdbId}&type=${typeStr}`);
  };

  return (
    <div className="player-fullscreen-container">
      {/* Top Floating bar */}
      <div className="player-control-header">
        <button className="exit-btn" onClick={handleExit}>
          <ArrowLeft size={20} />
          <span>Exit Player</span>
        </button>
        <div className="media-info">
          <h3>{titleStr}</h3>
          {typeStr === 'tv' && <span>Season {season}, Episode {episode}</span>}
        </div>
      </div>

      {/* Main player box */}
      <div className="video-player-frame">
        {loading ? (
          <div className="status-overlay">
            <Loader className="spinner" size={40} />
            <p>Connecting to {activeProvider}...</p>
          </div>
        ) : error ? (
          <div className="status-overlay error">
            <AlertTriangle className="error-icon" size={44} />
            <h3>Playback Connection Failed</h3>
            <p>{error}</p>
            <button className="btn-secondary" onClick={handleExit}>Back to Info</button>
          </div>
        ) : streamData ? (
          streamData.is_m3u8 ? (
            <video 
              ref={videoRef}
              className="html5-video-player"
              controls
              autoPlay
              playsInline
            />
          ) : (
            <iframe 
              src={streamData.stream_url} 
              className="iframe-video-player"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
            />
          )
        ) : null}
      </div>

      <style jsx global>{`
        /* Hide layout sidebar & main paddings when playing video */
        .layout-container {
          display: block !important;
        }
        .desktop-sidebar, .mobile-header, .mobile-bottom-tabs {
          display: none !important;
        }
        .main-content {
          margin-left: 0 !important;
          width: 100% !important;
          padding: 0 !important;
        }
      `}</style>

      <style jsx>{`
        .player-fullscreen-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #000;
          z-index: 9999;
          display: flex;
          flex-direction: column;
        }

        .player-control-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 70px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 30px;
          z-index: 100;
          pointer-events: auto;
          transition: opacity 0.3s ease;
        }

        .exit-btn {
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 30px;
          color: var(--foreground);
          padding: 8px 18px;
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .exit-btn:hover {
          background: var(--primary-gradient);
          border-color: transparent;
          box-shadow: 0 0 10px var(--primary-glow);
        }

        .media-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          color: var(--foreground);
          text-align: right;
        }

        .media-info h3 {
          font-size: 15px;
          font-weight: 700;
        }

        .media-info span {
          font-size: 12px;
          color: var(--foreground-muted);
        }

        .video-player-frame {
          flex: 1;
          width: 100%;
          height: 100%;
          position: relative;
        }

        .html5-video-player {
          width: 100%;
          height: 100%;
          object-fit: contain;
          outline: none;
          background: #000;
        }

        .iframe-video-player {
          width: 100%;
          height: 100%;
          border: none;
          background: #000;
        }

        .status-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          z-index: 10;
          color: var(--foreground-muted);
        }

        .status-overlay.error {
          color: var(--foreground);
          padding: 24px;
          text-align: center;
        }

        .error-icon {
          color: var(--primary);
          margin-bottom: 8px;
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .status-overlay h3 {
          font-size: 18px;
          font-weight: 800;
        }

        .status-overlay p {
          font-size: 13.5px;
          max-width: 420px;
          line-height: 1.5;
        }

        .spinner {
          animation: spin 1s linear infinite;
          color: var(--primary);
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px', background: '#000', height: '100vh', width: '100vw' }}>
        <div className="gemini-thinking-spinner" />
      </div>
    }>
      <PlayerContent />
    </Suspense>
  );
}
