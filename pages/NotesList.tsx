import React from 'react';
import { Note } from '../types';
import { Icons } from '../constants';

interface Props {
  subjectId: string;
  notes: Note[];
  onBack: () => void;
  onSelectNote: (note: Note) => void;
  onAddNote: () => void;
  onTutorialStep?: (step: number) => void;
}

const NotesList: React.FC<Props> = ({ subjectId, notes, onBack, onSelectNote, onAddNote, onTutorialStep }) => {
  return (
    <div className="p-6 space-y-6 bg-white animate-slide-in pb-24">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all"
          >
            <Icons.ArrowRight className="rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-uitm-navy tracking-tight">{subjectId} Notes</h1>
            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em]">Study Repository</p>
          </div>
        </div>
        <button 
          onClick={onAddNote}
          className="w-12 h-12 bg-uitm-navy text-white rounded-2xl flex items-center justify-center shadow-premium active:scale-90 transition-all"
        >
          <Icons.Plus />
        </button>
      </header>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar py-2">
        {['Lecture'].map((tag) => (
          <button
            key={tag}
            className={`px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
              tag === 'Lecture' 
                ? 'bg-uitm-navy text-white shadow-premium' 
                : 'bg-gray-50 text-gray-400 border border-gray-100'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-30">
            <Icons.List className="w-12 h-12 text-gray-300 mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest">No notes yet</p>
          </div>
        ) : (
          notes.map((note, index) => (
            <div
              key={note.id}
              id={index === 0 ? 'note-item' : undefined}
              onClick={() => { onTutorialStep?.(14); onSelectNote(note); }}
              className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-premium group active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`text-[8px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest ${
                  note.tag === 'Lecture' ? 'bg-blue-50 text-blue-600' : 'bg-uitm-gold/10 text-uitm-gold'
                }`}>
                  {note.tag}
                </span>
                <span className="text-[10px] text-gray-300 font-bold">{note.updatedAt}</span>
              </div>
              <h4 className="text-lg font-black text-uitm-navy tracking-tight mb-2">{note.title}</h4>
              <p className="text-xs text-gray-400 font-medium line-clamp-2 leading-relaxed">
                {note.content}
              </p>
              
              {/* Decorative subtle circle */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gray-50/50 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotesList;