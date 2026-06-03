const pastCgpa = 3.67;
const pastCredits = 80;
const currentGpa = 0.34;
const currentCredits = 6;

const totalPastPoints = pastCgpa * pastCredits;
const totalCurrentPoints = currentGpa * currentCredits;
const totalPoints = totalPastPoints + totalCurrentPoints;
const totalCredits = pastCredits + currentCredits;
const cgpa = totalPoints / totalCredits;

console.log(`Total Past Points: ${totalPastPoints}`);
console.log(`Total Current Points: ${totalCurrentPoints}`);
console.log(`Total Points: ${totalPoints}`);
console.log(`Total Credits: ${totalCredits}`);
console.log(`CGPA: ${cgpa}`);
console.log(`CGPA Rounded: ${cgpa.toFixed(2)}`);
console.log(`CGPA Truncated: ${(Math.floor(cgpa * 100) / 100).toFixed(2)}`);
