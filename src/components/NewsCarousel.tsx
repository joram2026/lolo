import React, { useState, useEffect, useMemo } from 'react';
import { NewsItem, CryptoPrice } from '../types';
import { Zap, ChevronLeft, ChevronRight, Sparkles, TrendingUp, ShieldCheck } from 'lucide-react';

const FALLBACK_CRYPTO = [
  { name: 'Bitcoin', symbol: 'BTC', price: 0.00, change24h: 0.00 },
  { name: 'Ethereum', symbol: 'ETH', price: 0.00, change24h: 0.00 },
  { name: 'Solana', symbol: 'SOL', price: 0.00, change24h: 0.00 },
  { name: 'Binance Coin', symbol: 'BNB', price: 0.00, change24h: 0.00 },
  { name: 'XRP', symbol: 'XRP', price: 0.00, change24h: 0.00 }
];

interface NewsCarouselProps {
  cryptoPrices?: CryptoPrice[];
}

export default function NewsCarousel({ cryptoPrices = FALLBACK_CRYPTO }: NewsCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Generate dynamic, daily-updated, encouraging market news based on current crypto prices
  const dailyNews = useMemo(() => {
    const today = new Date();
    // Unique deterministic seed per calendar day in 2026
    const daySeed = today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate();
    const dateStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    // Calculate market indicators from actual dynamic price data
    const activePrices = cryptoPrices.length > 0 ? cryptoPrices : FALLBACK_CRYPTO;
    const avgChange = activePrices.reduce((acc, c) => acc + c.change24h, 0) / activePrices.length;
    const isBullish = avgChange >= 0;
    
    // Find the highest performing coin today
    const sorted = [...activePrices].sort((a, b) => b.change24h - a.change24h);
    const topGainer = sorted[0] || { name: 'Bitcoin', symbol: 'BTC', price: 94000, change24h: 3.4 };
    
    const sources = [
      'Coindesk Live', 'Cointelegraph Daily', 'Bloomberg Crypto', 
      'Secure Tech Intel', 'Blockworks Research', 'Decrypt News'
    ];
    
    const images = {
      market: 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=600&q=80',
      gainer: 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?auto=format&fit=crop&w=600&q=80',
      escrow: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
      macro: 'https://images.unsplash.com/photo-1516245834210-c4c142787335?auto=format&fit=crop&w=600&q=80'
    };

    const selectTemplate = (arr: string[], indexSeed: number) => {
      return arr[Math.abs(indexSeed) % arr.length];
    };

    // 1. Market Sentiment (Category Seed: 0) - Always formulated encouragingly
    const marketTemplatesBullish = [
      `Crypto Market Rally Builds: General index climbs an average +${avgChange.toFixed(2)}% today as solid buying interest and P2P liquidity drive global momentum.`,
      `Investor Sentiment Bullish: Major digital networks register a strong +${avgChange.toFixed(2)}% average increase, reflecting high trader confidence and stable growth.`,
      `Momentum Accelerates: Key tokens break out with a solid average return of +${avgChange.toFixed(2)}%, establishing highly robust support ranges for the next wave.`
    ];
    
    const marketTemplatesBearish = [
      `Resilient Support Zones Hold: Traders leverage today's minor consolidation of ${avgChange.toFixed(2)}% as a healthy accumulation zone for strategic mid-term holdings.`,
      `Smart Money Inflows Rise: Despite temporary 24h market consolidation (${avgChange.toFixed(2)}%), on-chain data shows long-term investors steadily increasing their positions.`,
      `Healthy Consolidation Phase: Indices level off by ${avgChange.toFixed(2)}% today, establishing a highly stable baseline designed to fuel the next major recovery cycle.`
    ];
    
    const marketHeadline = isBullish 
      ? selectTemplate(marketTemplatesBullish, daySeed) 
      : selectTemplate(marketTemplatesBearish, daySeed);

    // 2. Top Gainer Spotlight (Category Seed: 1)
    const gainerTemplates = [
      `Spotlight on ${topGainer.name} (${topGainer.symbol}): Leading today's recovery with a spectacular +${topGainer.change24h.toFixed(2)}% breakout!`,
      `Utility & Demand Surge: Trading velocity for ${topGainer.symbol} climbs +${topGainer.change24h.toFixed(2)}% in 24h, showcasing strong network utility and investor backing.`,
      `${topGainer.name} (${topGainer.symbol}) Outperforms Competitors: Attracting high wallet liquidity with a dynamic +${topGainer.change24h.toFixed(2)}% increase today.`
    ];
    const gainerHeadline = selectTemplate(gainerTemplates, daySeed + 1);

    // 3. Secure Escrow & Local P2P Ecosystem (Category Seed: 2)
    const escrowTemplates = [
      `P2P Security Standard Milestones: Decentralized Escrow completes record Mobile Money swaps today, securing transactions with absolute escrow safety.`,
      `Airtel & MTN Mobile Money Volume Soars: High-performance secure escrow nodes deliver under-2-minute trade completions for seamless local exchange.`,
      `Safeguarding Financial Inclusion: Rapid merchant growth on secure P2P networks establishes deep market liquidity, safeguarding retail deposits from volatility.`
    ];
    const escrowHeadline = selectTemplate(escrowTemplates, daySeed + 2);

    // 4. Macro Positive News (Category Seed: 3)
    const macroTemplates = [
      `On-Chain Transaction Volumes Peak: Decentralized network activity hits record weekly highs, cementing blockchain as a key tool for global payments.`,
      `USDT Stablecoin Supply Reaches New Heights: Circulation holds stable above $115B, providing ample sideline capital to support the digital asset economy.`,
      `Layer-2 Transaction Fees Plunge: Network scaling innovations slash micro-payment fees, unlocking next-gen utility for day-to-day retail users.`
    ];
    const macroHeadline = selectTemplate(macroTemplates, daySeed + 3);

    return [
      {
        id: `daily-market-${daySeed}`,
        title: marketHeadline,
        source: selectTemplate(sources, daySeed),
        time: `Published Today`,
        image: images.market
      },
      {
        id: `daily-gainer-${daySeed}`,
        title: gainerHeadline,
        source: selectTemplate(sources, daySeed + 1),
        time: `Published Today`,
        image: images.gainer
      },
      {
        id: `daily-escrow-${daySeed}`,
        title: escrowHeadline,
        source: 'Secure Intel Network',
        time: `Updated Live`,
        image: images.escrow
      },
      {
        id: `daily-macro-${daySeed}`,
        title: macroHeadline,
        source: selectTemplate(sources, daySeed + 3),
        time: `Published Today`,
        image: images.macro
      }
    ];
  }, [cryptoPrices]);

  // Slideshow interval
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % dailyNews.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [dailyNews.length]);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev === 0 ? dailyNews.length - 1 : prev - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % dailyNews.length);
  };

  const activeSlide = dailyNews[activeIndex] || dailyNews[0];

  return (
    <div id="news-carousel-container" className="relative w-full overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 text-white h-48 sm:h-52">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out"
        style={{ 
          backgroundImage: `url(${activeSlide.image})`,
          filter: 'brightness(0.22) contrast(1.15)'
        }}
      />
      
      {/* Dynamic Heat/Visual Accents */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[10px] uppercase tracking-wider font-bold text-amber-400">
        <Zap size={10} className="animate-pulse" />
        Market News
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-[9px] font-bold text-yellow-400 tracking-wide">
        <Sparkles size={10} className="animate-pulse" />
        Daily Updated
      </div>

      {/* Content Container */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-6 select-none">
        <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1.5">
          <span className="text-slate-300 uppercase tracking-wide">{activeSlide.source}</span>
          <span className="w-1 h-1 rounded-full bg-slate-750"></span>
          <span className="font-mono text-slate-400">{activeSlide.time}</span>
        </div>
        <h3 className="text-xs sm:text-sm font-bold text-slate-100 tracking-tight leading-snug max-w-[95%] md:max-w-[85%] min-h-[40px] flex items-center">
          {activeSlide.title}
        </h3>
        
        {/* Navigation Dots and Arrow Controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1.5">
            {dailyNews.map((_, idx) => (
              <button
                key={idx}
                id={`carousel-dot-${idx}`}
                onClick={() => setActiveIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === activeIndex ? 'w-5 bg-amber-500' : 'w-1.5 bg-slate-700'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          
          <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800/80 rounded-lg p-0.5">
            <button 
              id="carousel-prev"
              onClick={handlePrev}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[10px] font-mono font-bold text-slate-500 px-1 select-none">
              {activeIndex + 1}/{dailyNews.length}
            </span>
            <button 
              id="carousel-next"
              onClick={handleNext}
              className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
