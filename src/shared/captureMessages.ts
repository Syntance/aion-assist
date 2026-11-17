import type { GameEvent } from '@core/protocol/events';
import type { CaptureState } from './types';

export type MainToCapture =
  | {
      type: 'init';
      opcodes: Record<string, string> | null;
      discover: boolean;
      watchNames?: string[];
      /** Discovery only: file for raw server->client segments (Abyss raw_tcp.log format). */
      rawTcpPath?: string | null;
    }
  | { type: 'mark' }
  | { type: 'note'; line: string };

export type CaptureToMain =
  | { type: 'events'; events: GameEvent[] }
  | { type: 'status'; state: CaptureState; detail: string | null; port: number | null; flow?: string | null }
  | { type: 'discovery'; lines: string[] };
