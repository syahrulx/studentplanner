
import React from 'react';
import { Course, Note } from '../types';
import { Icons } from '../constants';

interface Props {
  courses: Course[];
  notes: Note[];
  onSelectSubject: (id: string) => void;
  onStartQuiz: () => void;
}

const NotesHub: React.FC<Props> = ({ courses, notes, onSelectSubject, onStartQuiz }) => {
  return (
    <div className="p-6 space-y-8 bg-white animate-slide-in pb-10">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black text-uitm-navy tracking-tight">Notes & Quiz</h1>
          <p className="text-[10px] text-uitm-gold font-black uppercase tracking-[0.15em]">Study Challenge Hub</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-2xl text-uitm-gold">
          <Icons.Sparkles className="w-6 h-6" />
        </div>
      </div>

      {/* PROMINENT CHALLENGE CARD */}
      <div 
        onClick={onStartQuiz}
        className="bg-uitm-gold rounded-[2.5rem] p-8 text-white shadow-gold relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all"
      >
        <div className="relative z-10 flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
             <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-md">
                <Icons.Sparkles className="w-6 h-6 text-white" />
             </div>
             <h3 className="text-sm font-black uppercase tracking-widest">Daily Knowledge Check</h3>
          </div>
          <span className="text-[9px] font-black bg-uitm-navy text-white px-3 py-1 rounded-full uppercase tracking-widest">250 XP</span>
        </div>
        <p className="relative z-10 text-xs text-white/90 leading-relaxed font-bold mb-6">
          Ready to test your memory? Build a customized AI quiz based on your study materials.
        </p>
        <button 
          className="relative z-10 w-full bg-uitm-navy py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-premium active:bg-uitm-navy/90"
        >
          Configure Practice Quiz
        </button>
        {/* Abstract shapes */}
        <div className="absolute bottom-[-20%] right-[-10%] w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute top-[-10%] left-[-5%] w-24 h-24 bg-uitm-navy/10 rounded-full blur-xl"></div>
      </div>

      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Select Subject to Study</h3>
        <div className="grid grid-cols-1 gap-4">
          {courses.map(course => {
            const subjectNotes = notes.filter(n => n.subjectId === course.id);
            return (
              <div 
                key={course.id} 
                onClick={() => onSelectSubject(course.id)}
                className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-premium flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-uitm-navy/5 rounded-2xl flex items-center justify-center text-uitm-navy group-hover:bg-uitm-navy group-hover:text-white transition-colors">
                    <span className="text-xs font-black">{course.id.slice(0, 3)}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-uitm-gold/10 text-uitm-gold text-[8px] px-2 py-0.5 rounded font-black uppercase tracking-widest">{course.id}</span>
                      <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{subjectNotes.length} Notes</span>
                    </div>
                    <h4 className="text-sm font-black text-uitm-navy tracking-tight">{course.name}</h4>
                  </div>
                </div>
                <Icons.ArrowRight className="text-gray-200 group-hover:text-uitm-navy transition-all group-hover:translate-x-1" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-10"></div>
    </div>
  );
};

export default NotesHub;
