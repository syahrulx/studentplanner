
import React from 'react';

const Login = ({ onLogin, onDemo }: { onLogin: () => void, onDemo: () => void }) => {
  return (
    <div className="min-h-screen flex flex-col p-10 bg-white">
      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-14">
          <div className="w-16 h-16 bg-uitm-navy rounded-2xl flex items-center justify-center text-white mb-8 shadow-premium">
              <span className="text-2xl font-black">SP</span>
          </div>
          <h1 className="text-4xl font-black text-uitm-navy mb-3 tracking-tight">Login</h1>
          <p className="text-gray-400 font-medium">Access your personalized study hub.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Student Email</label>
            <input 
              type="email" 
              placeholder="2022456789@student.uitm.edu.my"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]">Password</label>
            <input 
              type="password" 
              placeholder="••••••••"
              className="w-full px-6 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-uitm-navy/20 outline-none transition-all font-semibold text-sm"
            />
          </div>
        </div>

        <button 
          onClick={onLogin}
          className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black mt-10 shadow-premium active:scale-95 transition-all"
        >
          Login
        </button>

        <div className="relative my-12 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
          <span className="relative px-6 bg-white text-[10px] text-gray-400 font-black tracking-widest uppercase">OR</span>
        </div>

        <button 
          onClick={onDemo}
          className="w-full border-2 border-gray-100 text-gray-600 py-5 rounded-[1.5rem] font-black flex items-center justify-center gap-2 bg-white hover:bg-gray-50 transition-all active:scale-95"
        >
          Continue as Demo
        </button>
      </div>

      <div className="mt-10 text-center">
        <span className="text-[9px] text-gray-300 font-black uppercase tracking-[0.2em]">Prototype • AI Simulated Hub</span>
      </div>
    </div>
  );
};

export default Login;
