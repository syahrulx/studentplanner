
import React, { useState, useEffect } from 'react';
import { Icons } from '../constants';

interface Props {
  onComplete: (score: number) => void;
}

const QuizGameplay: React.FC<Props> = ({ onComplete }) => {
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);

  const questions = [
    {
      q: "Which pattern is used to decouple an abstraction from its implementation?",
      opts: ["Singleton", "Bridge", "Factory", "Adapter"],
      correct: 1
    },
    {
      q: "In Spring Boot, which annotation is used to mark a class as a web controller?",
      opts: ["@Service", "@Component", "@RestController", "@Repository"],
      correct: 2
    },
    {
      q: "True or False: Hibernate is a provider for the Java Persistence API (JPA).",
      opts: ["True", "False"],
      correct: 0
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleNext();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [currentQ]);

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(prev => prev + 1);
      setSelectedOpt(null);
      setTimeLeft(15);
    } else {
      onComplete(score + (selectedOpt === questions[currentQ].correct ? 10 : 0));
    }
  };

  const handleOptionClick = (idx: number) => {
    if (selectedOpt !== null) return;
    setSelectedOpt(idx);
    if (idx === questions[currentQ].correct) {
      setScore(prev => prev + 10);
    }
    setTimeout(handleNext, 1000);
  };

  return (
    <div className="p-6 bg-white space-y-10 animate-slide-in h-screen flex flex-col">
      <header className="flex items-center justify-between pt-2">
        <div className="bg-uitm-navy/5 px-4 py-2 rounded-xl">
           <span className="text-[10px] font-black text-uitm-navy uppercase tracking-widest">Q {currentQ + 1}/{questions.length}</span>
        </div>
        <div className="flex items-center gap-2">
           <Icons.Sparkles className="text-uitm-gold w-4 h-4" />
           <span className="text-sm font-black text-uitm-navy tracking-tighter">Score: {score}</span>
        </div>
      </header>

      {/* Timer Bar */}
      <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden">
        <div 
          className="h-full bg-uitm-gold transition-all duration-1000" 
          style={{ width: `${(timeLeft / 15) * 100}%` }}
        ></div>
      </div>

      <div className="flex-1 flex flex-col justify-center space-y-12">
        <h2 className="text-2xl font-black text-uitm-navy tracking-tight text-center leading-tight">
          {questions[currentQ].q}
        </h2>

        <div className="grid grid-cols-1 gap-4">
          {questions[currentQ].opts.map((opt, i) => (
            <button 
              key={i}
              onClick={() => handleOptionClick(i)}
              className={`p-6 rounded-[2.5rem] border font-bold text-sm transition-all text-left flex items-center justify-between ${
                selectedOpt === i ? (i === questions[currentQ].correct ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700') : 'bg-white border-gray-100 text-gray-600 hover:border-uitm-navy/20'
              }`}
            >
              {opt}
              {selectedOpt === i && (
                i === questions[currentQ].correct ? <Icons.CheckCircle className="w-5 h-5" /> : <Icons.Plus className="w-5 h-5 rotate-45" />
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[9px] text-gray-300 font-black uppercase text-center tracking-[0.2em] pb-10">
        AI simulated live environment
      </p>
    </div>
  );
};

export default QuizGameplay;
