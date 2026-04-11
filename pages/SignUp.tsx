
import React from 'react';
import { Icons } from '../constants';

interface Props {
  onBack: () => void;
  onSignUp: () => void;
}

const SignUp: React.FC<Props> = ({ onBack, onSignUp }) => {
  return (
    <div className="min-h-screen flex flex-col p-10 bg-white animate-slide-in">
      {/* Header with Back Button */}
      <button 
        onClick={onBack}
        className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all self-start mb-8"
      >
        <Icons.ArrowRight className="rotate-180 w-5 h-5" />
      </button>

      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-10">
          <h1 className="text-4xl font-black text-uitm-navy mb-3 tracking-tight">Create Account</h1>
          <p className="text-gray-400 font-medium">Join Rencana and ace your studies.</p>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Full Name</label>
            <input 
              type="text" 
              placeholder="Syahrul Izwan"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm placeholder:text-gray-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Student Email</label>
            <input 
              type="email" 
              placeholder="2022456789@student.uitm.edu.my"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm placeholder:text-gray-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm placeholder:text-gray-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Confirm Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm placeholder:text-gray-400"
            />
          </div>
        </div>

        <button 
          onClick={onSignUp}
          className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black mt-8 shadow-premium active:scale-95 transition-all"
        >
          Create Account
        </button>

        <p className="text-center mt-6 text-sm text-gray-400">
          Already have an account?{' '}
          <button onClick={onBack} className="text-uitm-navy font-black">Login</button>
        </p>
      </div>

      <div className="mt-6 text-center">
        <span className="text-[9px] text-gray-300 font-black uppercase tracking-[0.2em]">Prototype • UI Only</span>
      </div>
    </div>
  );
};

export default SignUp;
