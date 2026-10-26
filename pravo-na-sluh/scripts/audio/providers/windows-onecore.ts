// Адаптер локального синтеза Windows OneCore (только Windows 10/11 с установленными русскими голосами).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { SpeechSegment } from '@pravo/shared';
import { escapeXml, type SynthesisJob, type TtsProvider } from './types.ts';

export function segmentToSsml(seg: SpeechSegment): string {
  const body = seg.pieces
    .map((p) => escapeXml(p.text) + (p.pauseMs ? `<break time="${p.pauseMs}ms"/>` : ''))
    .join(' ');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU"><prosody rate="${seg.rate}">${body}</prosody></speak>`;
}

function runPowerShell(args: string[], log: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let err = '';
    ps.stdout.on('data', (d) => {
      for (const line of d.toString('utf8').split(/\r?\n/)) if (line.startsWith('OK')) log(line);
    });
    ps.stderr.on('data', (d) => (err += d.toString('utf8')));
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`PowerShell завершился с кодом ${code}: ${err.slice(0, 2000)}`))));
  });
}

export const windowsOneCore: TtsProvider = {
  id: 'windows-onecore',
  renderVersion: 'onecore-ssml-v1',
  estimateCostRub: () => 0,
  async synthesize(jobs: SynthesisJob[], voice, log) {
    if (process.platform !== 'win32') throw new Error('Провайдер windows-onecore работает только в Windows');
    const script = path.resolve(import.meta.dirname, 'windows-onecore.ps1');
    const batchSize = 40;
    for (let i = 0; i < jobs.length; i += batchSize) {
      const batch = jobs.slice(i, i + batchSize);
      const jobFile = path.join(path.dirname(batch[0].outWav), `_jobs-${process.pid}-${i}.json`);
      fs.writeFileSync(jobFile, JSON.stringify(batch.map((j) => ({ id: j.segment.id, ssml: segmentToSsml(j.segment), out: j.outWav }))), 'utf8');
      try {
        await runPowerShell(['-File', script, '-JobFile', jobFile, '-Voice', voice.providerVoice], () => {});
      } finally {
        fs.rmSync(jobFile, { force: true });
      }
      log(`  синтезировано ${Math.min(i + batchSize, jobs.length)}/${jobs.length}`);
    }
  },
};
