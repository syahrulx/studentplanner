
import React from 'react';
import { Icons } from '../constants';

const Groups = ({ onBack }: { onBack: () => void }) => {
  return (
    <div className="p-6 space-y-8 bg-white">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-gray-50 rounded-xl"><Icons.ArrowRight className="rotate-180" /></button>
        <h1 className="text-xl font-bold text-uitm-navy">Source Groups</h1>
      </div>

      <div className="space-y-4">
        <GroupCard title="Lecturer Group" count={12} color="bg-blue-500" />
        <GroupCard title="Class Group (ISE 4A)" count={28} color="bg-green-500" />
        <GroupCard title="Personal Archive" count={5} color="bg-gray-400" />
      </div>

      <section className="bg-uitm-navy p-6 rounded-3xl text-white">
        <div className="flex items-center gap-2 mb-4">
          <Icons.Sparkles />
          <h3 className="font-bold">Smart Keyword Rules</h3>
        </div>
        <p className="text-[10px] text-blue-200 uppercase tracking-widest mb-4 font-bold">Auto-Extraction Triggers</p>
        <div className="flex flex-wrap gap-2">
          {['Assignment', 'Submit', 'Due', 'Quiz', 'Submission', 'Misi'].map(tag => (
            <span key={tag} className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold">{tag}</span>
          ))}
        </div>
        <button className="w-full mt-6 bg-uitm-gold py-3 rounded-xl font-bold text-white shadow-lg">Edit Rules</button>
      </section>

      <button className="w-full border-2 border-dashed border-gray-100 py-5 rounded-3xl text-gray-400 font-bold flex items-center justify-center gap-2">
        <Icons.Plus /> Create New Group
      </button>
    </div>
  );
};

const GroupCard = ({ title, count, color }: any) => (
  <div className="bg-white border border-gray-100 p-5 rounded-3xl shadow-soft flex items-center justify-between">
    <div className="flex items-center gap-4">
      <div className={`w-3 h-12 ${color} rounded-full`}></div>
      <div>
        <h4 className="font-bold text-gray-800">{title}</h4>
        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{count} Messages Imported</p>
      </div>
    </div>
    <Icons.ArrowRight />
  </div>
);

export default Groups;
