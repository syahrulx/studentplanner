import type { Course, SubjectGradeConfig, GradeResult } from '../types';
import { calculateGrade } from './gradeCalculator';

export interface SemesterData {
  semesterId: number;
  label: string;
  totalCredits: number;
  totalGradePoints: number;
  gpa: number;
  subjects: {
    course: Course;
    config: SubjectGradeConfig;
    result: GradeResult;
  }[];
}

export interface CGPAResult {
  semesters: SemesterData[];
  totalCredits: number;
  totalGradePoints: number;
  cgpa: number;
}

export function calculateCGPA(courses: Course[], configs: SubjectGradeConfig[]): CGPAResult {
  const semestersMap = new Map<number, SemesterData>();
  
  let globalCredits = 0;
  let globalPoints = 0;

  // Group by semester
  for (const course of courses) {
    const semId = course.semester_id ?? 1;
    if (!semestersMap.has(semId)) {
      semestersMap.set(semId, {
        semesterId: semId,
        label: `Semester ${semId}`,
        totalCredits: 0,
        totalGradePoints: 0,
        gpa: 0,
        subjects: [],
      });
    }

    const config = configs.find(c => c.subjectId === course.id);
    if (!config) continue; // Skip courses with no grade config setup yet

    const result = calculateGrade(config);
    
    // Only count towards GPA/CGPA if there's actual data or an override grade
    if (result.hasData) {
      const credits = course.creditHours;
      const points = result.grade.point * credits;
      
      const sem = semestersMap.get(semId)!;
      sem.totalCredits += credits;
      sem.totalGradePoints += points;
      
      globalCredits += credits;
      globalPoints += points;
    }

    semestersMap.get(semId)!.subjects.push({ course, config, result });
  }

  // Calculate semester GPAs
  const semesters = Array.from(semestersMap.values())
    .sort((a, b) => a.semesterId - b.semesterId)
    .map(sem => {
      sem.gpa = sem.totalCredits > 0 ? sem.totalGradePoints / sem.totalCredits : 0;
      return sem;
    });

  const cgpa = globalCredits > 0 ? globalPoints / globalCredits : 0;

  return {
    semesters,
    totalCredits: globalCredits,
    totalGradePoints: globalPoints,
    cgpa,
  };
}
