const PREFIX = 'examforge:test-session:';

export interface TestSessionSnapshot {
  timeLeft: number;
  currentIndex: number;
  updatedAt: number;
}

function key(testId: string) {
  return `${PREFIX}${testId}`;
}

export function saveTestSession(testId: string, snapshot: Omit<TestSessionSnapshot, 'updatedAt'>) {
  try {
    const payload: TestSessionSnapshot = { ...snapshot, updatedAt: Date.now() };
    localStorage.setItem(key(testId), JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function loadTestSession(testId: string): TestSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(key(testId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TestSessionSnapshot;
    if (typeof parsed.timeLeft !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearTestSession(testId: string) {
  try {
    localStorage.removeItem(key(testId));
  } catch {
    // ignore
  }
}
