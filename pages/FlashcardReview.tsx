
import React, { useState } from 'react';
import { Flashcard } from '../types';
import { Icons } from '../constants';

interface Props {
  flashcards: Flashcard[];
  onBack: () => void;
}

const FlashcardReview: React.FC<Props> = ({ flashcards, onBack }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<string[]>([]);

  const card = flashcards[currentIdx];
  const progress = ((currentIdx + 1) / flashcards.length) * 100;

  const handleNext = (wasMastered: boolean) => {
    if (wasMastered) setMastered(prev => [...prev, card.id]);
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIdx < flashcards.length - 1) {
        setCurrentIdx(prev => prev + 1);
      } else {
        onBack();
      }
    }, 150);
  };

  if (!flashcards.length) return null;

  return (
    <div className="p-6 bg-white space-y-12 animate-slide-in h-screen flex flex-col">
      <header className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-xl font-black text-uitm-navy tracking-tight">Active Recall</h1>
          <span className="text-[10px] text-uitm-gold font-black uppercase tracking-widest">W11 Practice</span>
        </div>
        <div className="w-10"></div>
      </header>

      {/* Progress Bar */}
      <div className="space-y-2 px-4">
        <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest">
          <span>Card {currentIdx + 1} of {flashcards.length}</span>
          <span>{mastered.length} Mastered</span>
        </div>
        <div className="h-1.5 bg-gray-50 rounded-full overflow-hidden">
          <div className="h-full bg-uitm-gold transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center relative perspective-1000">
        <div 
          onClick={() => setIsFlipped(!isFlipped)}
          className={`relative w-full aspect-[4/5] max-h-[450px] transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
        >
          {/* Front Side */}
          <div className="absolute inset-0 bg-white border-2 border-gray-50 shadow-premium rounded-[3rem] p-10 flex flex-col items-center justify-center text-center backface-hidden">
            <div className="w-16 h-16 bg-blue-50 text-uitm-navy rounded-2xl flex items-center justify-center mb-8">
              <Icons.Layers className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-uitm-navy tracking-tight leading-tight">
              {card.question}
            </h2>
            <p className="mt-10 text-[10px] font-black text-gray-300 uppercase tracking-widest animate-pulse">Tap to Reveal Answer</p>
          </div>

          {/* Back Side */}
          <div className="absolute inset-0 bg-uitm-navy border-2 border-uitm-navy shadow-premium rounded-[3rem] p-10 flex flex-col items-center justify-center text-center backface-hidden rotate-y-180">
            <div className="w-16 h-16 bg-uitm-gold text-white rounded-2xl flex items-center justify-center mb-8 shadow-gold">
              <Icons.Sparkles className="w-8 h-8" />
            </div>
            <p className="text-lg font-bold text-white leading-relaxed">
              {card.answer}
            </p>
            <div className="absolute bottom-10 inset-x-10 flex gap-4">
               <button 
                 onClick={(e) => { e.stopPropagation(); handleNext(false); }}
                 className="flex-1 bg-white/10 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10"
               >
                 Review Again
               </button>
               <button 
                 onClick={(e) => { e.stopPropagation(); handleNext(true); }}
                 className="flex-1 bg-uitm-gold text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-gold"
               >
                 Mastered
               </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pb-10 text-center space-y-2">
        <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Swipe gestures coming soon</p>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};

export default FlashcardReview;
