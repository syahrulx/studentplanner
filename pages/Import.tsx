
import React, { useState } from 'react';
import { Icons } from '../constants';

const Import = ({ onExtract, onNavigate }: { onExtract: (t: string) => void, onNavigate: (p: any) => void }) => {
  const [activeTab, setActiveTab] = useState('paste');
  const [pastedText, setPastedText] = useState('');

  return (
    <div className="p-6 space-y-8 animate-slide-in">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-black text-uitm-navy tracking-tight">Import WhatsApp</h1>
        <button 
          onClick={() => onNavigate('groups')} 
          className="text-[10px] font-black text-uitm-gold uppercase tracking-[0.1em]"
        >
          Manage Groups
        </button>
      </div>

      <div className="flex bg-gray-50/50 backdrop-blur-sm p-1.5 rounded-2xl border border-gray-100">
        {['Share', 'Paste', 'Upload'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab.toLowerCase())}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 ${activeTab === tab.toLowerCase() ? 'bg-white shadow-premium text-uitm-navy' : 'text-gray-400 opacity-60'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'share' && (
        <div className="bg-blue-50/50 p-8 rounded-[2.5rem] border border-blue-100 space-y-6 shadow-sm">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-uitm-navy shadow-sm">
            <Icons.MessageCircle className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-uitm-navy text-lg tracking-tight">Direct Share Method</h3>
            <p className="text-xs text-gray-500 font-medium">Use the native iOS/Android share sheet for speed.</p>
          </div>
          <ol className="space-y-4 text-xs text-gray-600 font-bold list-decimal list-inside">
            <li className="p-3 bg-white/50 rounded-xl">Open <span className="text-green-600 font-black uppercase">WhatsApp</span></li>
            <li className="p-3 bg-white/50 rounded-xl">Long press task message</li>
            <li className="p-3 bg-white/50 rounded-xl">Tap <span className="text-uitm-navy font-black uppercase">Share</span></li>
            <li className="p-3 bg-white/50 rounded-xl">Select <span className="text-uitm-gold font-black uppercase tracking-widest">Rencana</span></li>
          </ol>
        </div>
      )}

      {activeTab === 'paste' && (
        <div className="space-y-6">
          <div className="relative group">
            <textarea 
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste forwarded message here..."
              className="w-full h-48 bg-gray-50/50 border border-gray-100 rounded-[2rem] p-6 text-sm font-medium focus:bg-white focus:border-uitm-navy/20 outline-none transition-all resize-none shadow-inner leading-relaxed"
            />
          </div>

          <div className="space-y-6">
            <div className="space-y-4">
              <Toggle label="Auto-detect course code" defaultChecked />
              <Toggle label="Auto-detect due date/time" defaultChecked />
            </div>

            <button 
              disabled={!pastedText.trim()}
              onClick={() => onExtract(pastedText)}
              className="w-full bg-[#6a87b1] text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale shadow-premium active:scale-95 transition-all text-sm tracking-tight"
            >
              <Icons.Sparkles className="w-5 h-5 text-uitm-gold" />
              Analyze & Extract
            </button>
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="h-48 border-2 border-dashed border-gray-200 rounded-[2.5rem] flex flex-col items-center justify-center text-gray-400 gap-4 bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer group">
          <div className="p-3 bg-white rounded-xl shadow-sm group-hover:scale-110 transition-transform">
            <Icons.Plus className="w-5 h-5" />
          </div>
          <div className="text-center">
            <span className="text-[10px] font-black uppercase tracking-widest block">Upload Chat History</span>
          </div>
        </div>
      )}

      <div className="h-12"></div>
    </div>
  );
};

const Toggle = ({ label, defaultChecked }: any) => (
  <label className="flex items-center justify-between cursor-pointer group">
    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">{label}</span>
    <div className="relative">
      <input type="checkbox" className="sr-only peer" defaultChecked={defaultChecked} />
      <div className="w-10 h-5 bg-red-500 rounded-full peer peer-checked:bg-green-500 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-5 shadow-inner transition-colors duration-200"></div>
    </div>
  </label>
);

export default Import;
