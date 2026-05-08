/** Ensures only one Services/Events surface shows the campus picker at a time (tabs may both mount). */

let lockOwnerKey: string | null = null;

export function tryAcquireBrowseCampusModal(userId: string, universityId: string): boolean {
  const k = `${userId}:${universityId}`;
  if (lockOwnerKey !== null) return false;
  lockOwnerKey = k;
  return true;
}

export function releaseBrowseCampusModal(userId: string, universityId: string): void {
  const k = `${userId}:${universityId}`;
  if (lockOwnerKey === k) lockOwnerKey = null;
}
