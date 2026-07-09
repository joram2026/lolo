import React, { useState, useEffect } from 'react';
import { NewsItem } from '../types';
import { Award, Zap, Shield, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';

const STATIC_NEWS: NewsItem[] = [
  {
    id: 'news-1',
    title: 'USDT Market Cap Hits Record $115 Billion as P2P Demand Surges in East Africa',
    source: 'Coindesk',
    time: '2 hours ago',
    image: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'news-2',
    title: 'Bitcoin Holds Stable at $94,000; Traders Anticipate Next Bullish Breakout',
    source: 'Cointelegraph',
    time: '4 hours ago',
    image: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'news-3',
    title: 'LOLO Escrow Protocol Expands P2P Integrations to Airtel and MTN Mobile Money',
    source: 'LOLO Tech',
    time: '1 day ago',
    image: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'news-4',
    title: 'Ethereum Gas Fees Hit All-Time Lows, Accelerating L2 Rollup Adoption',
    source: 'Blockworks',
    time: '2 days ago',
    image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&w=600&q=80'
  }
];

export default function NewsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % STATIC_NEWS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev === 0 ? STATIC_NEWS.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % STATIC_NEWS.length);
  };

  return (
    <div id="news-carousel-container" className="relative w-full overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 text-white h-48 sm:h-52">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
        style={{ 
          backgroundImage: `url(${STATIC_NEWS[activeIndex].image})`,
          filter: 'brightness(0.3) contrast(1.1)'
        }}
      />
      
      {/* Visual Accent */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10px] uppercase tracking-wider font-bold text-indigo-400">
        <Zap size={10} className="animate-pulse" />
        Hot News
      </div>

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6 select-none">
        <div className="text-[11px] font-semibold text-zinc-400 mb-1 flex items-center gap-2">
          <span>{STATIC_NEWS[activeIndex].source}</span>
          <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
          <span>{STATIC_NEWS[activeIndex].time}</span>
        </div>
        <h3 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight leading-snug max-w-[90%] md:max-w-[80%]">
          {STATIC_NEWS[activeIndex].title}
        </h3>
        
        {/* Navigation Dots and Arrow Controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {STATIC_NEWS.map((_, idx) => (
              <button
                key={idx}
                id={`carousel-dot-${idx}`}
                onClick={() => setActiveIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? 'w-5 bg-indigo-500' : 'w-1.5 bg-zinc-600'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          
          <div className="flex items-center gap-1 bg-black/40 border border-zinc-800/80 rounded-lg p-0.5">
            <button 
              id="carousel-prev"
              onClick={handlePrev}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[10px] font-mono text-zinc-500 px-1">
              {activeIndex + 1}/{STATIC_NEWS.length}
            </span>
            <button 
              id="carousel-next"
              onClick={handleNext}
              className="p-1 text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
