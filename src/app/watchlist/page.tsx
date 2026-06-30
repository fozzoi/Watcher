"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Bookmark, 
  History, 
  Heart, 
  Trash2, 
  RefreshCw, 
  Download, 
  Upload, 
  ArrowUpDown, 
  X, 
  FileText, 
  Image as ImageIcon, 
  Link2,
  AlertCircle
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';
import { getImageUrl, searchTMDB, GLOBAL_CONFIG } from '@/utils/tmdb';
import axios from 'axios';

export default function WatchListPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'watchlist' | 'history' | 'artists'>('watchlist');
  
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  
  // UI Dialog States
  const [isLinkModalVisible, setIsLinkModalVisible] = useState(false);
  const [syncLinkInput, setSyncLinkInput] = useState('');
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'rating' | 'date'>('default');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  
  // Import Summary Alert State
  const [importSummary, setImportSummary] = useState<{
    visible: boolean;
    total: number;
    added: number;
    existing: number;
    missed: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      const storedMovies = await AsyncStorage.getItem('watchlist');
      const storedArtists = await AsyncStorage.getItem('favoriteArtists');
      const storedWatched = await AsyncStorage.getItem('history');
      
      if (storedMovies) setWatchlist(JSON.parse(storedMovies));
      if (storedArtists) setArtists(JSON.parse(storedArtists));
      if (storedWatched) setHistory(JSON.parse(storedWatched));
    } catch (error) {
      console.error('Failed to load library data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRemove = async (id: number, type: 'watchlist' | 'artists' | 'history') => {
    try {
      if (type === 'watchlist') {
        const newList = watchlist.filter(item => item.id !== id);
        setWatchlist(newList);
        await AsyncStorage.setItem('watchlist', JSON.stringify(newList));
      } else if (type === 'artists') {
        const newList = artists.filter(item => item.id !== id);
        setArtists(newList);
        await AsyncStorage.setItem('favoriteArtists', JSON.stringify(newList));
      } else if (type === 'history') {
        const newList = history.filter(item => item.id !== id);
        setHistory(newList);
        await AsyncStorage.setItem('history', JSON.stringify(newList));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sync / Import Movies List
  const handleSyncMovies = async (titles: { title: string; year: string | null }[]) => {
    let addedCount = 0;
    let existingCount = 0;
    let missedTitles: string[] = [];
    
    const stored = await AsyncStorage.getItem('watchlist');
    let currentList = stored ? JSON.parse(stored) : [];

    for (let i = 0; i < titles.length; i++) {
      setSyncProgress(`Searching ${i + 1}/${titles.length}: ${titles[i].title}`);
      try {
        const results = await searchTMDB(titles[i].title);
        const match = results.find(m => m.poster_path);
        if (match) {
          const exists = currentList.some((item: any) => item.id === match.id);
          if (!exists) {
            currentList.unshift(match);
            addedCount++;
          } else {
            existingCount++;
          }
        } else {
          missedTitles.push(titles[i].title);
        }
      } catch (e) {
        missedTitles.push(titles[i].title);
      }
    }
    
    await AsyncStorage.setItem('watchlist', JSON.stringify(currentList));
    setWatchlist(currentList);
    setSyncProgress('');
    return { addedCount, existingCount, missedTitles };
  };

  // Hit Gemini proxy backend for extracting titles
  const triggerExtraction = async (action: string, payload: any) => {
    setIsImportMenuOpen(false);
    setSyncing(true);
    setSyncProgress('Extracting with AI...');
    
    try {
      const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
        action,
        ...payload,
        customApiKey: GLOBAL_CONFIG.customApiKey
      });
      
      if (response.data.results && response.data.results.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(response.data.results);
        setImportSummary({
          visible: true,
          total: response.data.results.length,
          added: addedCount,
          existing: existingCount,
          missed: missedTitles
        });
      } else {
        alert("The AI couldn't detect any movie titles on that page.");
      }
    } catch (e: any) {
      alert(`Sync Failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  // Sync URL Setup
  const handleAddLink = async () => {
    setIsImportMenuOpen(false);
    try {
      const savedUrl = await AsyncStorage.getItem('sync_url');
      setSyncLinkInput(savedUrl || '');
    } catch (e) {}
    setIsLinkModalVisible(true);
  };

  const handleSaveAndSyncLink = async () => {
    const trimmedUrl = syncLinkInput.trim();
    if (!trimmedUrl) {
      alert("Please enter a valid URL.");
      return;
    }
    setIsLinkModalVisible(false);
    try {
      await AsyncStorage.setItem('sync_url', trimmedUrl);
      triggerExtraction('extract_url', { url: trimmedUrl });
    } catch (e) {}
  };

  // Parse movies from text files
  const extractMoviesFromText = (text: string) => {
    const lines = text.split('\n');
    const results: { title: string; year: string | null }[] = [];
    const yearRegex = /(?:\s*\(?(\d{4})\)?\s*)$/;

    for (let line of lines) {
      let cleanLine = line.trim();
      if (!cleanLine) continue;

      cleanLine = cleanLine.replace(/^[\d\.\-\*]+\s*/, '');
      const match = cleanLine.match(yearRegex);
      let year = null;
      let title = cleanLine;

      if (match) {
        year = match[1];
        title = cleanLine.replace(yearRegex, '').trim();
        title = title.replace(/[\,\-]\s*$/, '').trim();
      }

      if (title) results.push({ title, year });
    }
    return results;
  };

  // HTML5 File inputs change handlers
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setSyncProgress('Reading file...');

    try {
      const text = await file.text();
      let extractedMovies: Array<{ title: string; year: string | null }> = [];

      try {
        const parsedJson = JSON.parse(text);
        if (Array.isArray(parsedJson)) {
          extractedMovies = parsedJson.map((item: any) => ({
            title: item.title || item.name || '',
            year: item.year ? String(item.year) : null
          })).filter((item: any) => item.title !== '');
        } else if (parsedJson.title || parsedJson.name) {
          extractedMovies = [{ 
            title: parsedJson.title || parsedJson.name, 
            year: parsedJson.year ? String(parsedJson.year) : null 
          }];
        }
      } catch (jsonError) {
        setSyncProgress('Parsing text file Locally...');
        extractedMovies = extractMoviesFromText(text);
      }

      if (extractedMovies.length > 0) {
        const { addedCount, existingCount, missedTitles } = await handleSyncMovies(extractedMovies);
        setImportSummary({
          visible: true,
          total: extractedMovies.length,
          added: addedCount,
          existing: existingCount,
          missed: missedTitles
        });
      } else {
        alert("No valid movie titles found in the file.");
      }
    } catch (err: any) {
      alert(`Error reading file: ${err.message}`);
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncing(true);
    setSyncProgress('Processing Image...');

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      triggerExtraction('extract_image', { 
        imageBase64: base64Data,
        mimeType: file.type || 'image/jpeg'
      });
    };
    reader.onerror = () => {
      alert('Failed to read image');
      setSyncing(false);
    };
    reader.readAsDataURL(file);
  };

  // Sorting Handler
  const getSortedItems = (items: any[]) => {
    const sorted = [...items];
    if (sortBy === 'title') {
      sorted.sort((a, b) => {
        const tA = a.title || a.name || '';
        const tB = b.title || b.name || '';
        return sortDirection === 'asc' ? tA.localeCompare(tB) : tB.localeCompare(tA);
      });
    } else if (sortBy === 'rating') {
      sorted.sort((a, b) => {
        const rA = a.vote_average || 0;
        const rB = b.vote_average || 0;
        return sortDirection === 'asc' ? rA - rB : rB - rA;
      });
    } else if (sortBy === 'date') {
      sorted.sort((a, b) => {
        const dA = a.release_date || a.first_air_date || '';
        const dB = b.release_date || b.first_air_date || '';
        return sortDirection === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
      });
    }
    return sorted;
  };

  const activeItems = activeTab === 'watchlist' 
    ? getSortedItems(watchlist) 
    : activeTab === 'history' 
    ? getSortedItems(history) 
    : getSortedItems(artists);

  return (
    <div className="watchlist-container">
      {/* Header section */}
      <div className="header-row animate-fade-in-up">
        <h1 className="header-title">My Library</h1>
        
        <div className="header-actions">
          {/* Sort trigger button */}
          <div className="sort-menu-container">
            <button className="icon-btn" onClick={() => {
              if (sortBy === 'default') setSortBy('title');
              else if (sortBy === 'title') setSortBy('rating');
              else if (sortBy === 'rating') setSortBy('date');
              else setSortBy('default');
              setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
            }} title="Change Sort Mode">
              <ArrowUpDown size={18} />
              <span className="sort-label">Sort: {sortBy}</span>
            </button>
          </div>

          {/* Import sync options button */}
          <div className="import-menu-container">
            <button className="icon-btn btn-primary" onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}>
              <RefreshCw size={16} />
              <span>Sync & Import</span>
            </button>

            {isImportMenuOpen && (
              <div className="import-dropdown glass-premium">
                <button onClick={handleAddLink}>
                  <Link2 size={16} />
                  <span>Sync via Watchlist URL</span>
                </button>
                <button onClick={() => fileInputRef.current?.click()}>
                  <FileText size={16} />
                  <span>Import TXT/JSON List</span>
                </button>
                <button onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon size={16} />
                  <span>Extract from Image/Poster</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden Web File Inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".txt,.json" 
        onChange={handleFileChange} 
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleImageChange} 
      />

      {/* Tab Navigation */}
      <div className="tabs-row animate-fade-in-up">
        <button 
          className={`tab-btn ${activeTab === 'watchlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('watchlist')}
        >
          <Bookmark size={16} />
          <span>Watchlist</span>
          <span className="count-badge">{watchlist.length}</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} />
          <span>History</span>
          <span className="count-badge">{history.length}</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === 'artists' ? 'active' : ''}`}
          onClick={() => setActiveTab('artists')}
        >
          <Heart size={16} />
          <span>Artists</span>
          <span className="count-badge">{artists.length}</span>
        </button>
      </div>

      {/* Syncing loader */}
      {syncing && (
        <div className="sync-banner animate-fade-in-up">
          <div className="spinner-small" />
          <span>{syncProgress}</span>
        </div>
      )}

      {/* Library Content Grid */}
      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner" />
        </div>
      ) : activeItems.length > 0 ? (
        <div className="media-grid animate-fade-in-up">
          {activeItems.map((item) => {
            const isArtist = activeTab === 'artists';
            const mediaType = item.media_type || (isArtist ? 'person' : 'movie');
            const titleText = item.title || item.name || 'Unknown';
            const imagePath = isArtist ? item.profile_path : item.poster_path;
            
            return (
              <div key={item.id} className="library-card-wrapper">
                <Link href={isArtist ? `/cast?id=${item.id}` : `/detail?id=${item.id}&type=${mediaType}`} className="card-link">
                  <div className="card-image-box">
                    <img 
                      src={getImageUrl(imagePath, 'w342')} 
                      alt={titleText} 
                      className="card-img"
                      loading="lazy"
                    />
                    
                    {/* Delete item button */}
                    <button 
                      className="remove-btn" 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRemove(item.id, activeTab);
                      }}
                      title="Remove from library"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3 className="card-title" title={titleText}>{titleText}</h3>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state animate-fade-in-up">
          <AlertCircle size={40} className="empty-icon" />
          <h2>Your {activeTab} is empty</h2>
          <p>Go to the Explore tab to search and add content.</p>
        </div>
      )}

      {/* Backup sync account link modal */}
      {isLinkModalVisible && (
        <div className="modal-overlay" onClick={() => setIsLinkModalVisible(false)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Watchlist Sync Account</h2>
              <button className="modal-close" onClick={() => setIsLinkModalVisible(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-desc">
              Link your Letterboxd RSS Feed URL or custom Vercel database endpoint to sync watchlist entries automatically.
            </p>
            <input 
              type="text" 
              placeholder="https://example.com/rss/feed"
              value={syncLinkInput}
              onChange={(e) => setSyncLinkInput(e.target.value)}
              className="modal-input"
            />
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsLinkModalVisible(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveAndSyncLink}>Save & Sync</button>
            </div>
          </div>
        </div>
      )}

      {/* Summary dialog overlay */}
      {importSummary?.visible && (
        <div className="modal-overlay" onClick={() => setImportSummary(null)}>
          <div className="modal-content glass-premium" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sync Completion Summary</h2>
              <button className="modal-close" onClick={() => setImportSummary(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="summary-details">
              <div className="summary-stat">
                <span>Total Detected:</span> <strong>{importSummary.total}</strong>
              </div>
              <div className="summary-stat">
                <span>Added:</span> <strong style={{ color: '#22c55e' }}>+{importSummary.added}</strong>
              </div>
              <div className="summary-stat">
                <span>Existing in Library:</span> <strong>{importSummary.existing}</strong>
              </div>
              {importSummary.missed.length > 0 && (
                <div className="summary-missed">
                  <span className="missed-label">Unresolved Titles:</span>
                  <div className="missed-scroll">
                    {importSummary.missed.map((title, idx) => (
                      <div key={idx} className="missed-item">{title}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setImportSummary(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .watchlist-container {
          position: relative;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: 0.5px;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .icon-btn {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--card-border);
          border-radius: 20px;
          padding: 8px 16px;
          color: var(--foreground);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .icon-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .icon-btn.btn-primary {
          background: var(--primary-gradient);
          border-color: transparent;
        }

        .sort-label {
          text-transform: capitalize;
        }

        .import-menu-container {
          position: relative;
        }

        .import-dropdown {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 10px;
          width: 220px;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          z-index: 50;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }

        .import-dropdown button {
          background: transparent;
          border: none;
          padding: 12px 16px;
          color: var(--foreground-muted);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .import-dropdown button:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--foreground);
        }

        /* Tabs bar */
        .tabs-row {
          display: flex;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--card-border);
          padding: 4px;
          border-radius: 30px;
          margin-bottom: 30px;
          max-width: 500px;
        }

        .tab-btn {
          flex: 1;
          background: transparent;
          border: none;
          height: 40px;
          border-radius: 20px;
          color: var(--foreground-muted);
          font-size: 13.5px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
          position: relative;
        }

        .tab-btn:hover {
          color: var(--foreground);
        }

        .tab-btn.active {
          background: rgba(255, 255, 255, 0.06);
          color: var(--foreground);
          box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.05);
        }

        .count-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--foreground-muted);
        }

        .tab-btn.active .count-badge {
          background: var(--primary);
          color: var(--foreground);
        }

        /* Sync banner */
        .sync-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(229, 9, 20, 0.1);
          border: 1px solid rgba(229, 9, 20, 0.2);
          padding: 10px 18px;
          border-radius: var(--border-radius-md);
          margin-bottom: 20px;
          font-size: 13px;
          font-weight: 600;
          color: #fca5a5;
        }

        .spinner-small {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.2);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Grid elements */
        .library-card-wrapper {
          width: 100%;
          transition: var(--transition-smooth);
        }

        .library-card-wrapper:hover {
          transform: translateY(-4px);
        }

        .card-link {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .card-image-box {
          position: relative;
          width: 100%;
          aspect-ratio: 2/3;
          border-radius: var(--border-radius-md);
          overflow: hidden;
          background: #151518;
          border: 1px solid var(--card-border);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }

        .library-card-wrapper:hover .card-image-box {
          border-color: var(--card-hover-border);
        }

        .card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: var(--transition-smooth);
        }

        .library-card-wrapper:hover .card-img {
          scale: 1.05;
        }

        .remove-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          z-index: 10;
          transition: var(--transition-smooth);
        }

        .library-card-wrapper:hover .remove-btn {
          opacity: 1;
        }

        .remove-btn:hover {
          background: rgba(239, 68, 68, 0.9);
          border-color: transparent;
          color: var(--foreground);
        }

        .card-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--foreground-muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          text-align: center;
        }

        .library-card-wrapper:hover .card-title {
          color: var(--foreground);
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
          opacity: 0.4;
          margin-bottom: 8px;
        }

        /* Modal popup dialogs */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          width: 100%;
          max-width: 460px;
          border-radius: var(--border-radius-lg);
          padding: 28px;
          border: 1px solid var(--card-border);
          box-shadow: 0 15px 40px rgba(0,0,0,0.6);
          display: flex;
          flex-direction: column;
          gap: 18px;
          animation: scaleUp 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h2 {
          font-size: 18px;
          font-weight: 800;
          color: var(--foreground);
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--foreground-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .modal-desc {
          font-size: 13.5px;
          color: var(--foreground-muted);
          line-height: 1.5;
        }

        .modal-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: var(--foreground);
          padding: 12px 16px;
          font-size: 14px;
          width: 100%;
          outline: none;
        }

        .modal-input:focus {
          border-color: var(--primary);
          background: rgba(255, 255, 255, 0.08);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 10px;
        }

        .summary-details {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .summary-stat {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          color: var(--foreground-muted);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding-bottom: 8px;
        }

        .summary-stat strong {
          color: var(--foreground);
        }

        .summary-missed {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .missed-label {
          font-size: 13px;
          font-weight: 700;
          color: #fca5a5;
        }

        .missed-scroll {
          max-height: 120px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: var(--border-radius-sm);
          padding: 8px 12px;
        }

        .missed-item {
          font-size: 12px;
          color: var(--foreground-muted);
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.02);
        }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          padding: 100px 0;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.1);
          border-left-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
