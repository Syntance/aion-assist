import koffi from 'koffi';
import { FpsCounter } from '@core/capture/fpsCounter';

/**
 * Game FPS from Windows' own event tracing (ETW): the DXGI "Present" events of the game's process, the same
 * data PresentMon and similar tools read. Purely passive: no handle to the game process is opened and
 * nothing is injected or hooked. Needs the user to be an administrator or in the "Performance Log Users"
 * group (the app does not elevate); without that the trace cannot start and the state becomes 'denied'.
 */

export type FpsState = 'off' | 'running' | 'denied' | 'error';

const SESSION = 'AionAssistFps';
const PROPS_SIZE = 120;
const ERROR_ACCESS_DENIED = 5;
const ERROR_ALREADY_EXISTS = 183;
const EVENT_TRACE_CONTROL_STOP = 1;
const PRESENT_START = 42; // Microsoft-Windows-DXGI: Present::Start

const advapi = koffi.load('advapi32.dll');
const FILTER = koffi.struct('FPS_EVENT_FILTER_DESCRIPTOR', { Ptr: 'void *', Size: 'uint32', Type: 'uint32' });
// (registered by name; the function signatures below refer to them)
koffi.struct('FPS_ENABLE_TRACE_PARAMETERS', {
  Version: 'uint32',
  EnableProperty: 'uint32',
  ControlFlags: 'uint32',
  SourceId: koffi.array('uint8', 16),
  EnableFilterDesc: koffi.pointer(FILTER),
  FilterDescCount: 'uint32',
});
const EventRecordCb = koffi.proto('void __stdcall FpsEventRecordCb(void *record)');
koffi.struct('FPS_EVENT_TRACE_LOGFILEW', {
  LogFileName: 'str16',
  LoggerName: 'str16',
  CurrentTime: 'int64',
  BuffersRead: 'uint32',
  ProcessTraceMode: 'uint32',
  CurrentEvent: koffi.array('uint8', 88),
  LogfileHeader: koffi.array('uint8', 280),
  BufferCallback: 'void *',
  BufferSize: 'uint32',
  Filled: 'uint32',
  EventsLost: 'uint32',
  EventRecordCallback: koffi.pointer(EventRecordCb),
  IsKernelTrace: 'uint32',
  Context: 'void *',
});

const StartTraceW: (handle: bigint[], name: string, props: Buffer) => number = advapi.func(
  'uint32 __stdcall StartTraceW(_Out_ uint64 *handle, str16 name, void *props)',
);
const ControlTraceW: (handle: bigint, name: string | null, props: Buffer, code: number) => number = advapi.func(
  'uint32 __stdcall ControlTraceW(uint64 handle, str16 name, void *props, uint32 code)',
);
const EnableTraceEx2: (
  handle: bigint,
  provider: Buffer,
  code: number,
  level: number,
  any: bigint,
  all: bigint,
  timeout: number,
  params: unknown,
) => number = advapi.func(
  'uint32 __stdcall EnableTraceEx2(uint64 handle, void *provider, uint32 code, uint8 level, uint64 any, uint64 all, uint32 timeout, FPS_ENABLE_TRACE_PARAMETERS *params)',
);
const OpenTraceW: (logfile: unknown) => bigint = advapi.func('uint64 __stdcall OpenTraceW(_Inout_ FPS_EVENT_TRACE_LOGFILEW *logfile)');
const ProcessTrace: {
  async: (handles: bigint[], count: number, start: null, end: null, done: (err: unknown, rc: number) => void) => void;
} = advapi.func('uint32 __stdcall ProcessTrace(uint64 *handles, uint32 count, void *start, void *end)');
const CloseTrace: (handle: bigint) => number = advapi.func('uint32 __stdcall CloseTrace(uint64 handle)');

/** Microsoft-Windows-DXGI {CA11C036-0102-4A2D-A6AD-F03CFED5D3C9} in memory layout. */
const DXGI_PROVIDER = Buffer.from([0x36, 0xc0, 0x11, 0xca, 0x02, 0x01, 0x2d, 0x4a, 0xa6, 0xad, 0xf0, 0x3c, 0xfe, 0xd5, 0xd3, 0xc9]);

function properties(): Buffer {
  const b = Buffer.alloc(PROPS_SIZE + (SESSION.length + 1) * 2 + 8);
  b.writeUInt32LE(b.length, 0); // Wnode.BufferSize
  b.writeUInt32LE(0x20000, 44); // Wnode.Flags = WNODE_FLAG_TRACED_GUID
  b.writeUInt32LE(2, 40); // Wnode.ClientContext = system time, so event times are FILETIME (100 ns)
  b.writeUInt32LE(0x100, 64); // LogFileMode = EVENT_TRACE_REAL_TIME_MODE
  b.writeUInt32LE(1, 68); // FlushTimer = 1 s
  b.writeUInt32LE(PROPS_SIZE, 116); // LoggerNameOffset
  return b;
}

export class FpsMeter {
  state: FpsState = 'off';
  /** The Windows result code of the last failed start / filter call (0 = none), for the log. */
  lastCode = 0;
  /** The name of the running session: an orphan of an earlier run (a crash or an update) must not block a new one. */
  private name = SESSION;
  private readonly counter = new FpsCounter();
  private session: bigint | null = null;
  private trace: bigint | null = null;
  private pid: number | null = null;
  private callback: ReturnType<typeof koffi.register> | null = null;

  /** The process whose frames are counted (the game's window owner); the trace is filtered to it. */
  setPid(pid: number | null): void {
    if (pid === null || pid === this.pid) return;
    this.pid = pid;
    this.counter.reset();
    if (this.session !== null) this.enableFilter(pid);
  }

  value(now: number): number | null {
    return this.state === 'running' ? this.counter.value(now) : null;
  }

  start(): void {
    if (this.session !== null) return;
    try {
      this.name = SESSION;
      this.lastCode = 0;
      ControlTraceW(0n, SESSION, properties(), EVENT_TRACE_CONTROL_STOP); // a leftover session of an earlier run
      const out: bigint[] = [0n];
      let rc = StartTraceW(out, this.name, properties());
      if (rc === ERROR_ALREADY_EXISTS) {
        // the leftover session could not be stopped (another token owns it): start one under a name of our own
        this.name = `${SESSION}_${process.pid}`;
        rc = StartTraceW(out, this.name, properties());
      }
      if (rc !== 0) {
        this.lastCode = rc;
        this.state = rc === ERROR_ACCESS_DENIED ? 'denied' : 'error';
        return;
      }
      this.session = out[0] ?? null;
      if (this.session === null) {
        this.state = 'error';
        return;
      }
      this.callback = koffi.register((record: unknown) => {
        const header = Buffer.from(koffi.decode(record, 'uint8_t', 48));
        if (header.readUInt16LE(40) !== PRESENT_START) return;
        this.counter.add(Number(header.readBigInt64LE(16)) / 10_000, Date.now());
      }, koffi.pointer(EventRecordCb));
      const logfile = {
        LogFileName: null,
        LoggerName: this.name,
        CurrentTime: 0,
        BuffersRead: 0,
        ProcessTraceMode: 0x100 | 0x10000000, // real time | event record
        CurrentEvent: new Array<number>(88).fill(0),
        LogfileHeader: new Array<number>(280).fill(0),
        BufferCallback: null,
        BufferSize: 0,
        Filled: 0,
        EventsLost: 0,
        EventRecordCallback: this.callback,
        IsKernelTrace: 0,
        Context: null,
      };
      this.trace = OpenTraceW(logfile);
      ProcessTrace.async([this.trace], 1, null, null, () => {
        // the trace ended (stopped by us or by the system)
        if (this.state === 'running') this.state = 'error';
      });
      this.state = 'running';
      if (this.pid !== null) this.enableFilter(this.pid);
      else this.enableFilter(0); // nothing matches pid 0 until the game window is known
    } catch (err) {
      console.warn(`[fps] could not start: ${(err as Error).message}`);
      this.stop();
      this.state = 'error';
    }
  }

  stop(): void {
    try {
      if (this.session !== null) ControlTraceW(this.session, null, properties(), EVENT_TRACE_CONTROL_STOP);
      if (this.trace !== null) CloseTrace(this.trace);
    } catch {
      /* shutting down */
    }
    if (this.callback !== null) {
      try {
        koffi.unregister(this.callback);
      } catch {
        /* already gone */
      }
    }
    this.session = null;
    this.trace = null;
    this.callback = null;
    this.counter.reset();
    this.state = 'off';
  }

  /** (Re)enables the DXGI provider for one process id. */
  private enableFilter(pid: number): void {
    if (this.session === null) return;
    const pids = Buffer.alloc(4);
    pids.writeUInt32LE(pid, 0);
    const params = {
      Version: 2,
      EnableProperty: 0,
      ControlFlags: 0,
      SourceId: new Array<number>(16).fill(0),
      EnableFilterDesc: [{ Ptr: pids, Size: 4, Type: 0x80000004 }], // EVENT_FILTER_TYPE_PID
      FilterDescCount: 1,
    };
    const rc = EnableTraceEx2(this.session, DXGI_PROVIDER, 1, 4, 0xffffffffffffffffn, 0n, 0, params);
    if (rc !== 0) {
      this.lastCode = rc;
      this.state = rc === ERROR_ACCESS_DENIED ? 'denied' : 'error';
    }
  }
}
