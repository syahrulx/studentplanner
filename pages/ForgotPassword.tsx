
import React, { useState } from 'react';
import { Icons } from '../constants';

interface Props {
  onBack: () => void;
}

const ForgotPassword: React.FC<Props> = ({ onBack }) => {
  const [submitted, setSubmitted] = useState(false);

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

        {!submitted ? (
          <>
            <div className="mb-10">
              <h1 className="text-4xl font-black text-uitm-navy mb-3 tracking-tight">Forgot Password</h1>
              <p className="text-gray-400 font-medium">Enter your email to reset your password.</p>
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
            </div>

            <button 
              onClick={() => setSubmitted(true)}
              className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black mt-10 shadow-premium active:scale-95 transition-all"
            >
              Send Reset Link
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Icons.CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-uitm-navy mb-3">Check Your Email</h2>
            <p className="text-gray-400 font-medium mb-8">
              We've sent a password reset link to your student email.
            </p>
            <button 
              onClick={onBack}
              className="w-full bg-uitm-navy text-white py-5 rounded-[1.5rem] font-black shadow-premium active:scale-95 transition-all"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>

      <div className="mt-10 text-center">
        <span className="text-[9px] text-gray-300 font-black uppercase tracking-[0.2em]">Prototype • UI Only</span>
      </div>
    </div>
  );
};

export default ForgotPassword;
