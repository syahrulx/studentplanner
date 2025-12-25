
import React, { useState } from 'react';
import { Note, Flashcard } from '../types';
import { Icons } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";

interface Props {
  subjectId: string;
  note: Note | null;
  onSave: (note: Note) => void;
  onGenerateQuiz: () => void;
  onGenerateFlashcards: (flashcards: Flashcard[]) => void;
  onBack: () => void;
}

const NotesEditor: React.FC<Props> = ({ subjectId, note, onSave, onGenerateQuiz, onGenerateFlashcards, onBack }) => {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [tag, setTag] = useState<Note['tag']>(note?.tag || 'Lecture');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: note?.id || Math.random().toString(),
      subjectId,
      title,
      content,
      tag,
      updatedAt: new Date().toISOString().split('T')[0]
    });
  };

  const handleGenFlashcards = async () => {
    if (!content.trim()) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create exactly 5 high-quality flashcards (Question/Answer format) for a student based on these study notes: "${content}". Focus on key terms and core concepts.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING }
              },
              required: ['question', 'answer']
            }
          }
        }
      });
      
      const data = JSON.parse(response.text || '[]');
      const cards: Flashcard[] = data.map((d: any, i: number) => ({
        id: `fc-${i}-${Date.now()}`,
        question: d.question,
        answer: d.answer
      }));
      onGenerateFlashcards(cards);
    } catch (error) {
      console.error("AI Generation failed", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen animate-slide-in pb-24">
      <header className="flex items-center justify-between pt-2 mb-8">
        <button onClick={onBack} className="p-3 bg-gray-50 rounded-2xl text-gray-400 active:scale-90 transition-all">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <div className="flex gap-2">
          <button 
            disabled={isGenerating}
            onClick={handleGenFlashcards}
            className="flex items-center gap-2 bg-uitm-gold/10 text-uitm-gold px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-uitm-gold/20 shadow-sm active:scale-95 disabled:opacity-50 transition-all"
          >
            {isGenerating ? <div className="w-3 h-3 border-2 border-uitm-gold border-t-transparent animate-spin rounded-full"></div> : <Icons.Layers className="w-4 h-4" />}
            Cards
          </button>
          <button 
            onClick={handleSave}
            className="bg-uitm-navy text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-premium active:scale-95"
          >
            Save
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex gap-2 overflow-x-auto hide-scrollbar py-2 border-b border-gray-50">
          {(['Lecture', 'Tutorial', 'Exam', 'Important'] as Note['tag'][]).map(t => (
            <button 
              key={t}
              onClick={() => setTag(t)}
              className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${tag === t ? 'bg-gray-100 text-uitm-navy' : 'text-gray-300'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <input 
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Note Title..."
          className="w-full text-2xl font-black text-uitm-navy bg-transparent outline-none placeholder:text-gray-200 tracking-tight"
        />

        <textarea 
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Start typing your study notes here..."
          className="w-full h-96 text-sm font-medium text-gray-600 bg-transparent outline-none resize-none leading-relaxed placeholder:text-gray-300"
        />
      </div>

      <div className="mt-10 p-6 bg-blue-50/50 rounded-[2rem] border border-blue-100/50 flex items-center gap-4">
        <div className="p-3 bg-white rounded-2xl text-uitm-navy shadow-sm">
          <Icons.Sparkles className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[10px] font-black text-uitm-navy uppercase tracking-widest">AI Synthesis Hub</p>
          <p className="text-[10px] text-gray-500 font-medium">Use the "Cards" button to automatically generate Active Recall flashcards from these notes.</p>
        </div>
      </div>
    </div>
  );
};

export default NotesEditor;
