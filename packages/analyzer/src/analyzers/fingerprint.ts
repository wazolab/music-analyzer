import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface FingerprintResult {
  fingerprint: string;
  duration: number;
}

export async function generateFingerprint(
  audioPath: string
): Promise<FingerprintResult> {
  try {
    const { stdout } = await execFileAsync('fpcalc', ['-json', audioPath]);
    const result = JSON.parse(stdout);

    return {
      fingerprint: result.fingerprint,
      duration: result.duration,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new Error(
        'fpcalc not found. Install with: sudo apt install libchromaprint-tools'
      );
    }
    throw error;
  }
}

let fpcalcInstalled: boolean | null = null;

export async function checkFpcalcInstalled(): Promise<boolean> {
  if (fpcalcInstalled !== null) {
    return fpcalcInstalled;
  }

  try {
    await execFileAsync('fpcalc', ['-v']);
    fpcalcInstalled = true;
  } catch {
    fpcalcInstalled = false;
  }

  return fpcalcInstalled;
}
