
import React, { useState } from 'react';
import { UserProfile, Course } from '../types';
import { Icons } from '../constants';

interface Props {
  user: UserProfile;
  courses: Course[];
  onUpdateWorkload: (courseId: string, workload: number[]) => void;
  onFinish: () => void;
}

const ProfileSetup: React.FC<Props> = ({ user, courses, onUpdateWorkload, onFinish }) => {
  const [uploadedCourses, setUploadedCourses] = useState<{[key: string]: boolean}>({
    'CSC584': true,
    'IPS551': true,
    'ICT551': true,
    'ICT502': true,
    'ISP573': true,
    'TAC451': true,
    'CTU551': true,
    'LCC401': true,
  });
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleUpload = (courseId: string) => {
    setIsProcessing(courseId);
    // Simulate AI processing
    setTimeout(() => {
      setUploadedCourses(prev => ({...prev, [courseId]: true}));
      setIsProcessing(null);
    }, 1500);
  };

  return (
    <div className="p-6 pb-32">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onFinish} className="p-2 bg-gray-50 rounded-xl">
          <Icons.ArrowRight className="rotate-180" />
        </button>
        <div>
          <h1 className="text-xl font-black text-uitm-navy">Upload SOW Documents</h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">AI will auto-generate workload</p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-6">
        <div className="flex gap-3">
          <Icons.Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800 mb-1">How it works</p>
            <p className="text-xs text-blue-600">Upload your Scheme of Work (SOW) PDF or image for each subject. Our AI will analyze it and automatically generate your weekly workload map.</p>
          </div>
        </div>
      </div>

      {/* Courses List */}
      <div className="space-y-4">
        <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Your Subjects</h2>
        
        {courses.map(course => {
          const isUploaded = uploadedCourses[course.id];
          const isLoading = isProcessing === course.id;
          
          return (
            <div 
              key={course.id} 
              className={`bg-white rounded-2xl p-5 border shadow-sm transition-all ${isUploaded ? 'border-green-200 bg-green-50/30' : 'border-gray-100'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="bg-uitm-navy text-white px-2 py-1 rounded-lg text-[10px] font-black">{course.id}</span>
                  <span className="text-sm font-bold text-gray-800">{course.name}</span>
                </div>
                {isUploaded && (
                  <div className="flex items-center gap-1 text-green-600">
                    <Icons.CheckCircle className="w-4 h-4" />
                    <span className="text-[9px] font-black uppercase">Done</span>
                  </div>
                )}
              </div>
              
              {isLoading ? (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-2 h-2 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-2 h-2 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                  <span className="text-xs font-bold text-gray-500">AI analyzing SOW document...</span>
                </div>
              ) : isUploaded ? (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-medium">Workload data generated successfully</span>
                  <button 
                    onClick={() => handleUpload(course.id)}
                    className="text-[10px] font-bold text-uitm-navy underline"
                  >
                    Re-upload
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => handleUpload(course.id)}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-2 hover:border-uitm-navy hover:bg-gray-50 transition-all"
                >
                  <Icons.Plus className="w-6 h-6 text-gray-400" />
                  <span className="text-xs font-bold text-gray-500">Upload SOW (PDF or Image)</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* AI Generating Modal */}
      {isGenerating && (
        <div className="fixed inset-0 z-[200] bg-uitm-navy flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center">
              <Icons.Sparkles className="w-10 h-10 text-uitm-gold animate-pulse" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black text-white mb-2">Generating Stress Map</h2>
              <p className="text-sm text-white/60 font-medium">AI is analyzing your SOW data...</p>
            </div>
            <div className="flex gap-1.5 mt-4">
              <div className="w-3 h-3 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
              <div className="w-3 h-3 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
              <div className="w-3 h-3 bg-uitm-gold rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white p-6 border-t border-gray-100 shadow-lg">
        <button 
          onClick={() => {
            setIsGenerating(true);
            setTimeout(() => {
              setIsGenerating(false);
              onFinish();
            }, 2000);
          }}
          disabled={isGenerating}
          className="w-full bg-uitm-navy text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-70"
        >
          Save & Generate Stress Map
          <Icons.Sparkles />
        </button>
      </div>
    </div>
  );
};

export default ProfileSetup;
