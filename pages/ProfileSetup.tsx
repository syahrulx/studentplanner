
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
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-uitm-navy mb-6">Profile Setup</h1>
      
      {/* Student Info */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-gray-100 mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Student Info</h2>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Name</span>
            <span className="font-semibold">{user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Program</span>
            <span className="font-semibold text-right max-w-[200px]">{user.program}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Part</span>
            <span className="font-semibold">{user.part}</span>
          </div>
        </div>
      </div>

      {/* Semester Settings */}
      <div className="bg-white rounded-2xl p-5 shadow-soft border border-gray-100 mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Semester Settings</h2>
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-700 font-medium">Duration</span>
          <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">14 WEEKS</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">CURRENT WEEK</label>
            <select className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm font-semibold">
              {[...Array(14)].map((_, i) => <option key={i} value={i+1}>Week {i+1}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 font-bold block mb-1">START DATE</label>
            <input type="date" className="w-full bg-gray-50 border-none rounded-xl p-3 text-sm font-semibold" defaultValue="2024-03-04" />
          </div>
        </div>
      </div>

      {/* Courses List */}
      <div className="mb-24">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Your Courses (Part 4)</h2>
        <div className="space-y-3">
          {courses.map(course => (
            <div key={course.id} className="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <span className="bg-uitm-navy text-white px-2 py-1 rounded-md text-[10px] font-bold">{course.id}</span>
                <div>
                  <div className="text-sm font-bold text-gray-800">{course.name}</div>
                  <div className="text-[10px] text-gray-400">3 Credit Hours</div>
                </div>
              </div>
              <button 
                onClick={() => setActiveCourse(course)}
                className="text-uitm-gold font-bold text-xs bg-gold-50 px-3 py-2 rounded-xl"
              >
                SOW Workload
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal for SOW */}
      {activeCourse && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-uitm-navy">Week 1-14 Workload: {activeCourse.id}</h2>
              <button onClick={() => setActiveCourse(null)} className="p-2"><Icons.ArrowRight /></button>
            </div>
            <p className="text-xs text-gray-500 mb-6 italic">Move sliders to set the estimated stress level (0-10) per week according to the Scheme of Work (SOW).</p>
            <div className="space-y-6 mb-8">
              {activeCourse.workload.map((level, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <span className="text-xs font-bold text-gray-400 w-12">W{idx + 1}</span>
                  <input 
                    type="range" 
                    min="0" max="10" 
                    value={level} 
                    onChange={(e) => {
                      const newWorkload = [...activeCourse.workload];
                      newWorkload[idx] = parseInt(e.target.value);
                      onUpdateWorkload(activeCourse.id, newWorkload);
                      setActiveCourse({...activeCourse, workload: newWorkload});
                    }}
                    className="flex-1 accent-uitm-navy h-1.5 rounded-full"
                  />
                  <span className="text-xs font-bold text-uitm-navy w-6">{level}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setActiveCourse(null)}
              className="w-full bg-uitm-navy text-white py-4 rounded-2xl font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Fixed Footer */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white p-6 border-t border-gray-100 shadow-lg">
        <button 
          onClick={onFinish}
          className="w-full bg-uitm-navy text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
        >
          Generate Semester Stress Map
          <Icons.Sparkles />
        </button>
      </div>
    </div>
  );
};

export default ProfileSetup;
