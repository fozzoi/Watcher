"use client";

import React, { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MovieCard from './MovieCard';

interface MediaCarouselProps {
  title: string;
  type?: string;
  data: any[];
  savedIds: Set<number>;
  toggleWatchlist: (item: any, e: React.MouseEvent) => void;
}

export default function MediaCarousel({ title, type, data, savedIds, toggleWatchlist }: MediaCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!data || data.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const { scrollLeft, clientWidth } = scrollContainerRef.current;
      const scrollAmount = clientWidth * 0.8;
      const targetScroll = direction === 'left' 
        ? scrollLeft - scrollAmount 
        : scrollLeft + scrollAmount;
      
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="carousel-section animate-fade-in-up">
      <div className="carousel-header">
        <h2 className="carousel-title">{title}</h2>
        <Link href={`/view-all?title=${encodeURIComponent(title)}&type=${type || ''}`} className="view-all-link">
          See All
        </Link>
      </div>

      <div className="carousel-wrapper">
        <button className="nav-btn prev-btn" onClick={() => scroll('left')} aria-label="Scroll left">
          <ChevronLeft size={24} />
        </button>
        
        <div className="scroll-container" ref={scrollContainerRef}>
          {data.map((item, index) => (
            <div key={`${item.id}-${index}`} className="scroll-item">
              <MovieCard
                item={item}
                isAdded={savedIds.has(item.id)}
                toggleWatchlist={toggleWatchlist}
                showTitle={false}
              />
            </div>
          ))}
        </div>

        <button className="nav-btn next-btn" onClick={() => scroll('right')} aria-label="Scroll right">
          <ChevronRight size={24} />
        </button>
      </div>

      <style jsx>{`
        .carousel-section {
          margin-bottom: 35px;
          position: relative;
        }

        .carousel-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 16px;
        }

        .carousel-title {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #fff;
        }

        .view-all-link {
          font-size: 13px;
          font-weight: 600;
          color: var(--primary);
          transition: var(--transition-smooth);
        }

        .view-all-link:hover {
          filter: brightness(1.2);
          text-decoration: underline;
        }

        .carousel-wrapper {
          position: relative;
          margin: 0 -10px;
        }

        .scroll-container {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding: 10px;
          scrollbar-width: none; /* Firefox */
        }

        .scroll-container::-webkit-scrollbar {
          display: none; /* Chrome/Safari */
        }

        .scroll-item {
          flex: 0 0 160px;
          scroll-snap-align: start;
        }

        @media (min-width: 768px) {
          .scroll-item {
            flex: 0 0 180px;
          }
        }

        .nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(10, 10, 15, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid var(--card-border);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: var(--transition-smooth);
          z-index: 10;
        }

        .carousel-wrapper:hover .nav-btn {
          opacity: 1;
        }

        .nav-btn:hover {
          background: var(--primary-gradient);
          border-color: transparent;
          box-shadow: 0 0 15px var(--primary-glow);
          scale: 1.1;
        }

        .prev-btn {
          left: 15px;
        }

        .next-btn {
          right: 15px;
        }

        @media (max-width: 768px) {
          .nav-btn {
            display: none; /* touch scroll is preferred on mobile */
          }
        }
      `}</style>
    </div>
  );
}
