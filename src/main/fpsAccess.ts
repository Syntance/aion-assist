import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';

/**
 * Frame tracing (ETW) needs the account to be in "Performance Log Users" (or to run as administrator).
 * This offers a one-click fix: one UAC prompt adds the user to that group (found by its well-known SID, so it works
 * on any Windows language); the new membership takes effect after the next Windows sign-in.
 */

const GROUP_SID = 'S-1-5-32-559';

export type FpsAccessResult = 'member' | 'notMember' | 'unknown' | 'granted' | 'cancelled' | 'error';

function currentUser(): string | null {
  const name = userInfo().username;
  const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME || '';
  const full = domain ? `${domain}\\${name}` : name;
  // goes into a PowerShell script: allow only ordinary account-name characters
  return /^[\p{L}\p{N} ._\\@-]{1,128}$/u.test(full) ? full : null;
}

function powershell(script: string, timeoutMs: number): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: timeoutMs }, (err, stdout) => {
      const raw: unknown = err ? (err as { code?: unknown }).code : 0;
      resolve({ code: typeof raw === 'number' ? raw : 1, out: String(stdout).trim() });
    });
  });
}

export async function fpsGroupState(): Promise<'member' | 'notMember' | 'unknown'> {
  const me = currentUser();
  if (!me) return 'unknown';
  const script = `$me='${me.replace(/'/g, "''")}'; $m = Get-LocalGroupMember -SID '${GROUP_SID}' -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $me }; if ($m) { 'member' } else { 'notMember' }`;
  const { out } = await powershell(script, 15_000);
  return out === 'member' ? 'member' : out === 'notMember' ? 'notMember' : 'unknown';
}

/** Shows the Windows UAC prompt once and adds the user to the group. */
export async function grantFpsAccess(): Promise<'granted' | 'cancelled' | 'error'> {
  const me = currentUser();
  if (!me) return 'error';
  const inner = `$me='${me.replace(/'/g, "''")}'; try { Get-LocalGroup -SID '${GROUP_SID}' | Add-LocalGroupMember -Member $me -ErrorAction Stop; exit 0 } catch { if ($_.FullyQualifiedErrorId -like '*MemberExists*') { exit 0 } else { exit 1 } }`;
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const outer = `try { $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'; exit $p.ExitCode } catch { exit 2 }`;
  const { code } = await powershell(outer, 120_000);
  if (code === 0) return 'granted';
  return code === 2 ? 'cancelled' : 'error';
}

/** Signs the user out of Windows (the group change only applies to a new sign-in). */
export function logOffWindows(): void {
  execFile('shutdown.exe', ['/l'], { windowsHide: true }, () => undefined);
}
