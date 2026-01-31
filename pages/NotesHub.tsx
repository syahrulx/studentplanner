
import React from 'react';
import { Course, Note } from '../types';
import { Icons } from '../constants';

interface Props {
  courses: Course[];
  notes: Note[];
  onSelectSubject: (id: string) => void;
  onStartQuiz: () => void;
  onTutorialStep?: (step: number) => void;
}

const NotesHub: React.FC<Props> = ({ courses, notes, onSelectSubject, onStartQuiz, onTutorialStep }) => {
  return (
    <div className="bg-[#F8FAFC] min-h-screen pb-32 animate-slide-in relative">
      {/* Header */}
      <header className="px-6 pt-10 pb-6 flex items-center justify-between sticky top-0 bg-[#F8FAFC]/80 backdrop-blur-md z-30">
        <div>
          <h1 className="text-xl font-black text-uitm-navy tracking-tight leading-none mb-1">
            Notes & Quiz
          </h1>
          <p className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-widest">Knowledge Hub</p>
        </div>
        <div className="p-2.5 bg-white rounded-2xl border border-gray-100 shadow-sm text-uitm-gold">
          <Icons.Sparkles className="w-5 h-5" />
        </div>
      </header>

      <div className="px-6 space-y-6">
        {/* PROMINENT CHALLENGE CARD - COMPACT */}
        <div 
          id="quiz-btn"
          onClick={onStartQuiz}
          className="bg-uitm-navy rounded-[2rem] p-5 text-white shadow-lg relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between"
        >
          {/* Abstract Background Decoration */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-uitm-gold opacity-10 blur-[40px]"></div>

          <div className="relative z-10 flex-1 pr-4">
             <div className="flex items-center gap-2 mb-1">
                <Icons.Sparkles className="w-3.5 h-3.5 text-uitm-gold" />
                <span className="text-[9px] font-black text-uitm-gold uppercase tracking-widest">Daily Focus</span>
             </div>
             <h3 className="text-base font-black uppercase tracking-tight leading-none mb-1">Knowledge Check</h3>
             <p className="text-[10px] text-blue-100/60 font-medium leading-relaxed line-clamp-1">
               AI-generated quizzes from your uploaded notes.
             </p>
          </div>

          <div className="relative z-10 bg-white text-uitm-navy p-2.5 rounded-xl shadow-md active:scale-95 transition-transform">
             <Icons.ArrowRight className="w-4 h-4" />
          </div>
        </div>

        {/* Subjects Grid */}
        <div className="space-y-3">
          <h3 className="text-[9px] font-black text-[#8E9AAF] uppercase tracking-[0.2em] ml-2">Your Subjects</h3>
          <div className="grid grid-cols-1 gap-3">
            {courses.map((course, index) => {
              const subjectNotes = notes.filter(n => n.subjectId === course.id);
              return (
                <div 
                  key={course.id}
                  id={index === 0 ? 'subject-card' : undefined}
                  onClick={() => { onTutorialStep?.(13); onSelectSubject(course.id); }}
                  className="bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all cursor-pointer hover:border-gray-200 hover:shadow-md"
                >
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-uitm-navy group-hover:text-white transition-colors">
                            <Icons.BookOpen className="w-3.5 h-3.5" />
                         </div>
                         <h2 className="text-base font-black text-uitm-navy tracking-tight">{course.id}</h2>
                      </div>
                      <span className="text-[8px] text-gray-400 bg-gray-50 px-2 py-1 rounded-lg font-black uppercase tracking-widest group-hover:bg-uitm-navy/5 group-hover:text-uitm-navy transition-colors">{subjectNotes.length} Notes</span>
                    </div>
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-11">{course.name}</h4>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesHub;
