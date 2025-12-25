
import React, { useState } from 'react';
import { Icons } from '../constants';

const Onboarding = ({ onFinish }: { onFinish: () => void }) => {
  const [step, setStep] = useState(0);

  const screens = [
    {
      title: "Automate Your Study Tasks",
      subtitle: "FROM WHATSAPP TO PLANNER",
      desc: "Paste your lecturer's WhatsApp messages and let AI extract tasks, deadlines, and course codes instantly.",
      icon: <div className="w-28 h-28 bg-blue-50 text-uitm-navy rounded-[2.5rem] flex items-center justify-center mb-10 shadow-premium"><Icons.MessageCircle /></div>
    },
    {
      title: "Master Your Semester",
      subtitle: "14-WEEK INTELLIGENCE",
      desc: "Visualize your entire semester's stress level based on SOW data. Know when to study hard and when to rest.",
      icon: <div className="w-28 h-28 bg-uitm-gold/10 text-uitm-gold rounded-[2.5rem] flex items-center justify-center mb-10 shadow-premium"><Icons.Calendar /></div>
    },
    {
      title: "AI-Powered Success",
      subtitle: "SMART RECOMMENDATIONS",
      desc: "Get personalized study recommendations and deadline risk alerts designed specifically for Part 4 students.",
      icon: <div className="w-28 h-28 bg-purple-50 text-indigo-600 rounded-[2.5rem] flex items-center justify-center mb-10 shadow-premium"><Icons.Sparkles /></div>
    }
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-between p-10 text-center bg-white overflow-hidden">
      <div className="pt-12 flex flex-col items-center flex-1 justify-center">
        <div className="animate-bounce mb-2">
            {screens[step].icon}
        </div>
        <p className="text-[10px] font-black text-uitm-gold uppercase tracking-[0.2em] mb-3">{screens[step].subtitle}</p>
        <h1 className="text-3xl font-black text-uitm-navy mb-5 leading-[1.1] tracking-tight">{screens[step].title}</h1>
        <p className="text-gray-400 text-sm leading-relaxed max-w-xs font-medium">{screens[step].desc}</p>
      </div>

      <div className="pb-10 w-full space-y-10">
        <div className="flex justify-center gap-2">
          {screens.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-10 bg-uitm-navy' : 'w-2 bg-gray-100'}`} />
          ))}
        </div>
        
        <button 
          onClick={() => step < 2 ? setStep(step + 1) : onFinish()}
          className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-all shadow-premium"
        >
          {step === 2 ? 'Get Started' : 'Continue'}
          <Icons.ArrowRight />
        </button>
      </div>
    </div>
  );
};

export default Onboarding;
