
import React, { useEffect, useState } from 'react';
import { Icons } from '../constants';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  targetId: string;
  action: string;
  copyText?: string;
  isFixedInfo?: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  // Welcome Intro
  { id: 0, title: "Welcome to GradeUp! 🎓", description: "Your AI-powered study companion is ready to help you ace your semester. Let's take a quick tour!", targetId: 'tutorial-welcome', action: "Start Tour", isFixedInfo: true },
  
  // Dashboard Explanation - SOW tap flow
  { id: 1, title: "SOW Intelligence", description: "Your AI has analyzed your entire semester schedule! Tap this card to reveal your personalized Stress Map and see upcoming critical weeks.", targetId: 'dash-pulse-card', action: "Tap the card" },
  { id: 2, title: "Workload Graph 📊", description: "This AI-generated graph visualizes your academic stress levels. Taller bars indicate high-workload weeks. W13 is flagged as your 'Critical Wave' - start preparing early!", targetId: 'stress-graph', action: "Got it!" },
  { id: 3, title: "Your Stats", description: "Tap any card to explore! Total Tasks opens your Planner, Progress shows your Weekly Summary, and Rank reveals the Leaderboard.", targetId: 'dash-stats', action: "Got it!" },
  { id: 4, title: "Priority Task", description: "Never miss a deadline! The AI highlights your most urgent task here, showing you exactly when it's due and its risk level.", targetId: 'dash-priority', action: "Got it!" },
  
  // Add Task Flow
  { id: 5, title: "Add New Task", description: "This is your main action button to add tasks.", targetId: 'nav-center-btn', action: "Tap the + button" },
  { id: 6, title: "AI Planner", description: "Let AI extract tasks from your WhatsApp messages!", targetId: 'ai-planner-option', action: "Tap AI Planner" },
  { id: 7, title: "Try It!", description: "Copy this message and paste it in the chat:", targetId: 'ai-chat-input', action: "Paste & Send", copyText: "Lab Assignment: Submit by Monday, 29 January 2026" },
  { id: 8, title: "View All Tasks", description: "Tap 'All' to see all your tasks!", targetId: 'tab-all', action: "Tap All" },
  { id: 9, title: "Task Added! ✨", description: "Here's your newly added task!", targetId: 'new-task-item', action: "Got it!" },
  
  // Notes & Study Features
  { id: 10, title: "Notes Hub", description: "Take notes and generate study materials.", targetId: 'nav-notes', action: "Tap Notes" },
  { id: 11, title: "Quiz Challenge 🎯", description: "Create AI-generated quizzes to test yourself!", targetId: 'quiz-btn', action: "Got it!" },
  { id: 12, title: "Open a Subject", description: "Tap any subject to view its notes.", targetId: 'subject-card', action: "Tap a subject" },
  { id: 13, title: "Select a Note", description: "Tap a note to open the editor.", targetId: 'note-item', action: "Tap a note" },
  { id: 14, title: "AI Flashcards 📚", description: "Tap 'Cards' button to generate AI flashcards!", targetId: 'flashcard-btn', action: "Tap Cards" },
  
  // Finish
  { id: 15, title: "You're Ready! 🎉", description: "Explore GradeUp and ace your studies!", targetId: 'tutorial-end', action: "Finish" },
];

const TOTAL_STEPS = 16; // Now 0-15

interface Props {
  step: number;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}

const Tutorial: React.FC<Props> = ({ step, onNext, onSkip, onFinish }) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [copied, setCopied] = useState(false);
  const currentStep = TUTORIAL_STEPS.find(s => s.id === step);
  
  useEffect(() => {
    if (!currentStep) return;
    setCopied(false);
    setTargetRect(null);
    
    if (currentStep.isFixedInfo || !currentStep.targetId) return;
    
    const findTarget = () => {
      const target = document.getElementById(currentStep.targetId);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
      }
    };
    setTimeout(findTarget, 250);
    const interval = setInterval(findTarget, 200);
    return () => clearInterval(interval);
  }, [step, currentStep]);
  
  if (!currentStep) return null;
  
  const isFirstStep = step === 1; // Now SOW Intelligence
  const isLastStep = step === TOTAL_STEPS;
  const isCopyStep = step === 7;
  const isFixedInfo = currentStep.isFixedInfo;
  // Info steps with target element (Got it button)
  const isInfoStep = [0, 2, 3, 4, 9, 11].includes(step); 
  // Step 2: Graph, 3: Stats, 4: Priority, 9: New Task, 11: Quiz, 14: Flashcards
  
  const showHighlight = !isLastStep && targetRect && !isCopyStep && !isInfoStep && !isFixedInfo;
  
  const tooltipAbove = targetRect && targetRect.top > 350;

  const handleCopy = async () => {
    if (currentStep.copyText) {
      await navigator.clipboard.writeText(currentStep.copyText);
      setCopied(true);
    }
  };

  return (
    <>
      {/* Pulsing gold border highlight */}
      {showHighlight && (
        <>
          <div className="fixed inset-0 z-[299] bg-black/30 pointer-events-none" />
          <div 
            className="fixed z-[300] pointer-events-none rounded-2xl"
            style={{ 
              left: targetRect.left - 8, 
              top: targetRect.top - 8, 
              width: targetRect.width + 16, 
              height: targetRect.height + 16,
              border: '5px solid #D4AF37',
              boxShadow: '0 0 0 4px rgba(212, 175, 55, 0.4), 0 0 30px rgba(212, 175, 55, 0.6)'
            }}
          />
        </>
      )}
      
      {/* Floating tooltip for tap steps */}
      {showHighlight && (
        <div 
          className="fixed z-[301] pointer-events-auto"
          style={{
            left: Math.max(16, Math.min(targetRect.left - 40, window.innerWidth - 250)),
            top: tooltipAbove ? targetRect.top - 100 : targetRect.top + targetRect.height + 16,
          }}
        >
          <div className="bg-uitm-navy text-white rounded-2xl px-4 py-3 shadow-xl max-w-[230px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 bg-uitm-gold rounded-full flex items-center justify-center text-[10px] font-bold text-uitm-navy">{step}</span>
              <span className="text-xs font-bold">{currentStep.title}</span>
            </div>
            <p className="text-[11px] text-white/70 mb-2">{currentStep.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-uitm-gold font-bold">👆 {currentStep.action}</span>
              <button onClick={onSkip} className="text-[9px] text-white/50 uppercase">Skip</button>
            </div>
            <div className={`absolute left-8 w-3 h-3 bg-uitm-navy rotate-45 ${tooltipAbove ? '-bottom-1.5' : '-top-1.5'}`} />
          </div>
        </div>
      )}
      
      {/* Info card for "Got it!" steps WITH target element */}
      {isInfoStep && targetRect && (
        <div className="fixed z-[300]" style={{
          left: Math.max(16, Math.min(targetRect.left - 20, window.innerWidth - 280)),
          top: targetRect.top > 300 ? targetRect.top - 140 : targetRect.top + targetRect.height + 16,
        }}>
          {/* Blocks interaction with the app */}
          <div className="fixed inset-0 bg-black/40 pointer-events-auto" style={{zIndex: -1}} />
          
          <div 
            className="fixed pointer-events-none rounded-3xl"
            style={{ 
              left: targetRect.left - 8, 
              top: targetRect.top - 8, 
              width: targetRect.width + 16, 
              height: targetRect.height + 16,
              zIndex: 299,
              border: '5px solid #D4AF37',
              boxShadow: '0 0 0 4px rgba(212, 175, 55, 0.4), 0 0 30px rgba(212, 175, 55, 0.6)'
            }}
          />
          <div className="bg-white rounded-2xl p-4 shadow-xl max-w-[260px] border-2 border-uitm-gold relative z-[301]">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 bg-uitm-gold rounded-full flex items-center justify-center text-xs font-bold text-white">{step}</span>
              <span className="text-sm font-black text-uitm-navy">{currentStep.title}</span>
            </div>
            <p className="text-xs text-gray-600 mb-3">{currentStep.description}</p>
            <div className="flex gap-2">
              <button onClick={onNext} className="flex-1 py-2 bg-uitm-navy text-white rounded-xl text-xs font-bold active:scale-95">
                {currentStep.action} →
              </button>
              <button onClick={onSkip} className="px-3 py-2 text-xs text-gray-400">Skip</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Welcome screen - Small centered card matching tutorial tooltip style */}
      {isFixedInfo && step === 0 && (
        <>
          {/* Semi-transparent backdrop */}
          <div className="fixed inset-0 z-[400] bg-black/40" />
          
          {/* Centered card */}
          <div className="fixed inset-0 z-[401] flex items-center justify-center p-6 text-center">
            <div className="bg-uitm-navy rounded-[2rem] p-8 shadow-2xl max-w-sm w-full border-2 border-uitm-gold/30 relative">
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-uitm-gold rounded-2xl flex items-center justify-center text-xl font-bold text-uitm-navy shadow-lg">
                  0
                </div>
                <h2 className="text-xl font-black text-white tracking-tight">Welcome to GradeUp! 🎓</h2>
              </div>
              
              <p className="text-sm text-white/80 mb-8 leading-relaxed">
                Your AI-powered study companion is ready to help you ace your semester. Let's take a quick tour!
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={onNext} 
                  className="w-full py-4 bg-uitm-gold text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-gold active:scale-95 transition-all"
                >
                  Start Tour →
                </button>
                <button 
                  onClick={onSkip} 
                  className="w-full py-2 text-xs font-bold text-white/40 uppercase tracking-widest hover:text-white/60 transition-colors"
                >
                  Skip Tutorial
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* Fixed position info card (for other fixed steps) */}
      {isFixedInfo && step !== 0 && (
        <div className="fixed inset-x-4 top-24 z-[300]">
          <div className="bg-white rounded-2xl p-5 shadow-xl max-w-sm mx-auto border-2 border-uitm-gold">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-8 h-8 bg-uitm-gold rounded-xl flex items-center justify-center text-sm font-bold text-white">{step}</span>
              <span className="text-base font-black text-uitm-navy">{currentStep.title}</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{currentStep.description}</p>
            <div className="flex gap-2">
              <button onClick={onNext} className="flex-1 py-3 bg-uitm-navy text-white rounded-xl text-sm font-bold active:scale-95">
                {currentStep.action} →
              </button>
              <button onClick={onSkip} className="px-4 py-3 text-sm text-gray-400">Skip</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Copy text step */}
      {isCopyStep && (
        <div className="fixed inset-x-4 top-20 z-[300]">
          <div className="bg-white rounded-2xl p-4 shadow-xl max-w-sm mx-auto border-2 border-uitm-gold">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 bg-uitm-gold rounded-full flex items-center justify-center text-xs font-bold text-white">{step}</span>
              <span className="text-sm font-black text-uitm-navy">{currentStep.title}</span>
            </div>
            <p className="text-xs text-gray-600 mb-3">{currentStep.description}</p>
            
            <div className="bg-gray-100 rounded-xl p-3 mb-3">
              <p className="text-xs text-gray-700 font-medium mb-2">"{currentStep.copyText}"</p>
              <button 
                onClick={handleCopy}
                className={`w-full py-2 rounded-lg text-xs font-bold ${copied ? 'bg-green-500 text-white' : 'bg-uitm-navy text-white'}`}
              >
                {copied ? '✓ Copied!' : '📋 Tap to Copy'}
              </button>
            </div>
            
            <p className="text-[10px] text-gray-400 text-center mb-2">
              Paste in chat → AI extracts the task!
            </p>
            
            <div className="flex gap-2">
              <button onClick={onNext} className="flex-1 py-2 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold">
                Continue →
              </button>
              <button onClick={onSkip} className="px-3 py-2 text-xs text-gray-400">Skip</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Full modal for first/last step */}
      {(false || isLastStep) && ( // isFirstStep no longer uses modal, SOW uses card
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-6">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${isLastStep ? 'bg-green-100' : 'bg-uitm-navy'}`}>
              {isLastStep 
                ? <Icons.CheckCircle className="w-8 h-8 text-green-600" />
                : <Icons.Sparkles className="w-8 h-8 text-uitm-gold" />
              }
            </div>
            <h2 className="text-xl font-black text-uitm-navy mb-2">{currentStep.title}</h2>
            <p className="text-sm text-gray-500 mb-6">{currentStep.description}</p>
            
            <button 
              id={isFirstStep ? 'tutorial-start' : 'tutorial-end'}
              onClick={isLastStep ? onFinish : onNext}
              className={`w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 ${isLastStep ? 'bg-green-500' : 'bg-uitm-navy'}`}
            >
              {currentStep.action}
              <Icons.ArrowRight className="w-4 h-4" />
            </button>
            
            {/* 
            {isFirstStep && (
              <button onClick={onSkip} className="mt-3 text-xs text-gray-400">Skip Tutorial</button>
            )} 
            */}
          </div>
        </div>
      )}
    </>
  );
};

export default Tutorial;
export { TUTORIAL_STEPS };
