"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Film, AlertCircle } from 'lucide-react';
import { fetchMoreContentByType, TMDBResult } from '@/utils/tmdb';
import { AsyncStorage } from '@/utils/storage';
import MovieCard from '@/components/MovieCard';

function ViewAllContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const title = searchParams.get('title') || 'View All';
  const type = searchParams.get('type') || '';

  const [items, setItems] = useState<TMDBResult[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [hasMore, setHasMore] = useState(true);

  // Load watchlist IDs
  const loadUserData = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      if (stored) {
        const list = JSON.parse(stored);
        setSavedIds(new Set(list.map((i: any) => i.id)));
      }
    } catch (e) {}
  }, []);

  // Fetch initial content list
  const fetchContent = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    try {
      const results = await fetchMoreContentByType(type, 1);
      setItems(results);
      if (results.length < 20) setHasMore(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadUserData();
    fetchContent();
  }, [fetchContent, loadUserData]);

  // Load more pages
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const results = await fetchMoreContentByType(type, nextPage);
      if (results.length === 0) {
        setHasMore(false);
      } else {
        setItems(prev => [...prev, ...results]);
        setPage(nextPage);
        if (results.length < 20) setHasMore(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Toggle watchlist
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
    <div className="viewall-container">
      {/* Header */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <button className="back-btn" onClick={() => router.back()} title="Go Back">
            <ArrowLeft size={20} />
          </button>
          <Film className="header-icon" />
          <h1 className="header-title">{title}</h1>
        </div>
      </div>

      {/* Grid listing */}
      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner" />
        </div>
      ) : items.length > 0 ? (
        <div className="results-wrapper animate-fade-in-up">
          <div className="media-grid">
            {items.map((item) => (
              <MovieCard
                key={item.id}
                item={item}
                isAdded={savedIds.has(item.id)}
                toggleWatchlist={toggleWatchlist}
                showTitle={true}
              />
            ))}
          </div>
          
          {hasMore && (
            <div className="load-more-container">
              <button 
                className="btn-secondary load-more-btn" 
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state animate-fade-in-up">
          <AlertCircle size={40} className="empty-icon" />
          <h2>No items found</h2>
          <p>We couldn't retrieve any details for this category.</p>
        </div>
      )}

      <style jsx>{`
        .viewall-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
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
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .header-title {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .load-more-container {
          display: flex;
          justify-content: center;
          margin-top: 40px;
        }

        .load-more-btn {
          padding: 12px 30px;
          font-size: 14.5px;
          border-radius: 30px;
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

        @keyframes spin {
          to { transform: rotate(360deg); }
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
      `}</style>
    </div>
  );
}

export default function ViewAllPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
        <div className="spinner" />
      </div>
    }>
      <ViewAllContent />
    </Suspense>
  );
}
