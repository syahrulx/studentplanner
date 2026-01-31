
import React from 'react';

interface Props {
  onLogin: () => void;
  onSignUp: () => void;
  onForgotPassword: () => void;
}

const Login: React.FC<Props> = ({ onLogin, onSignUp, onForgotPassword }) => {
  return (
    <div className="min-h-screen flex flex-col p-10 bg-white">
      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-14">
          <h1 className="text-4xl font-black text-uitm-navy mb-3 tracking-tight">Login</h1>
          <p className="text-gray-400 font-medium">Access your personalized study hub.</p>
        </div>

        <div className="space-y-6">
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
            <div className="flex justify-end">
              <button 
                onClick={onForgotPassword}
                className="text-[11px] font-bold text-uitm-gold"
              >
                Forgot Password?
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={onLogin}
          className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black mt-10 shadow-premium active:scale-95 transition-all"
        >
          Login
        </button>

        <p className="text-center mt-6 text-sm text-gray-400">
          Don't have an account?{' '}
          <button onClick={onSignUp} className="text-uitm-navy font-black">Sign Up</button>
        </p>
      </div>

      <div className="mt-10 text-center">
        <span className="text-[9px] text-gray-300 font-black uppercase tracking-[0.2em]">Prototype • AI Simulated Hub</span>
      </div>
    </div>
  );
};

export default Login;
