
import React, { useState, useMemo } from 'react';
import { Icons } from '../constants';
import { Course, Note } from '../types';

interface Props {
  courses: Course[];
  allNotes: Note[];
  onStart: (config: any) => void;
  onBack: () => void;
  initialSubjectId?: string;
}

const QuizConfig: React.FC<Props> = ({ courses, allNotes, onStart, onBack, initialSubjectId }) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(initialSubjectId || courses[0]?.id || '');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [type, setType] = useState('Mixed');
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState('Medium');

  // Filter notes based on selected subject
  const availableNotes = useMemo(() => {
    return allNotes.filter(n => n.subjectId === selectedSubjectId);
  }, [selectedSubjectId, allNotes]);

  const toggleNote = (id: string) => {
    setSelectedNoteIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleStart = () => {
    if (selectedNoteIds.length === 0) return;
    onStart({
      subjectId: selectedSubjectId,
      noteIds: selectedNoteIds,
      type,
      count,
      difficulty
    });
  };

  return (
    <div className="p-6 bg-white space-y-8 animate-slide-in flex flex-col min-h-screen">
      <header className="flex items-center justify-between pt-2">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <h1 className="text-xl font-black text-uitm-navy tracking-tight">AI Quiz Builder</h1>
        <div className="w-10"></div>
      </header>

      {/* Hero Section */}
      <div className="bg-uitm-navy p-8 rounded-[2.5rem] text-white shadow-premium relative overflow-hidden">
        <div className="relative z-10 flex items-center gap-4 mb-3">
          <Icons.Sparkles className="w-6 h-6 text-uitm-gold" />
          <h2 className="text-lg font-black tracking-tight uppercase tracking-widest">Custom Synthesis</h2>
        </div>
        <p className="relative z-10 text-[11px] text-blue-100 font-medium leading-relaxed opacity-80">
          Pick a subject and select specific notes. The AI will generate a unique assessment based on your chosen topics.
        </p>
        <div className="absolute top-[-30%] right-[-10%] w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
      </div>

      <div className="space-y-8 pb-32">
        {/* Subject Selection */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">1. Select Subject</h3>
          <div className="flex gap-3 overflow-x-auto hide-scrollbar py-2">
            {courses.map(course => (
              <button
                key={course.id}
                onClick={() => {
                  setSelectedSubjectId(course.id);
                  setSelectedNoteIds([]); // Reset notes when subject changes
                }}
                className={`px-6 py-4 rounded-3xl text-xs font-black transition-all whitespace-nowrap border-2 ${
                  selectedSubjectId === course.id 
                    ? 'bg-uitm-navy text-white border-uitm-navy shadow-premium' 
                    : 'bg-white text-gray-400 border-gray-100'
                }`}
              >
                {course.id}
              </button>
            ))}
          </div>
        </section>

        {/* Topic/Notes Selection */}
        <section className="space-y-4">
          <div className="flex justify-between items-end px-2">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">2. Choose Topics</h3>
            <span className="text-[9px] font-black text-uitm-gold uppercase">{selectedNoteIds.length} Selected</span>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {availableNotes.length > 0 ? (
              availableNotes.map(note => (
                <button
                  key={note.id}
                  onClick={() => toggleNote(note.id)}
                  className={`p-5 rounded-[2rem] border-2 text-left transition-all flex items-center justify-between group ${
                    selectedNoteIds.includes(note.id)
                      ? 'bg-uitm-gold/5 border-uitm-gold shadow-sm'
                      : 'bg-white border-gray-50'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`text-[8px] font-black uppercase tracking-widest ${
                      selectedNoteIds.includes(note.id) ? 'text-uitm-gold' : 'text-gray-300'
                    }`}>
                      {note.tag}
                    </span>
                    <span className={`text-sm font-black tracking-tight ${
                      selectedNoteIds.includes(note.id) ? 'text-uitm-navy' : 'text-gray-600'
                    }`}>
                      {note.title}
                    </span>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedNoteIds.includes(note.id) ? 'bg-uitm-gold border-uitm-gold' : 'border-gray-200'
                  }`}>
                    {selectedNoteIds.includes(note.id) && <Icons.CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                </button>
              ))
            ) : (
              <div className="py-10 text-center bg-gray-50 rounded-[2.5rem] border border-dashed border-gray-200">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No notes found for this subject</p>
              </div>
            )}
          </div>
        </section>

        {/* Preferences */}
        <div className="grid grid-cols-2 gap-6">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Type</h3>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)}
              className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xs font-black text-uitm-navy outline-none appearance-none cursor-pointer"
            >
              <option>Mixed</option>
              <option>MCQ</option>
              <option>True/False</option>
            </select>
          </section>
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Difficulty</h3>
            <select 
              value={difficulty} 
              onChange={e => setDifficulty(e.target.value)}
              className="w-full bg-gray-50 border-none rounded-2xl p-4 text-xs font-black text-uitm-navy outline-none appearance-none cursor-pointer"
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </section>
        </div>
      </div>

      {/* Start Button Container */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-6 bg-white/80 backdrop-blur-lg border-t border-gray-100 z-[110]">
        <button 
          onClick={handleStart}
          disabled={selectedNoteIds.length === 0}
          className="w-full bg-uitm-navy text-white py-5 rounded-[2rem] font-black uppercase tracking-[0.2em] shadow-premium active:scale-95 transition-all text-xs disabled:opacity-30 disabled:grayscale"
        >
          {selectedNoteIds.length === 0 ? 'Select Topics to Begin' : 'Prepare AI Challenge'}
        </button>
      </div>
    </div>
  );
};

export default QuizConfig;
