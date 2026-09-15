import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [input, sourceCommit, minimumSeconds = '1'] = process.argv.slice(2);
if (!input || !/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) throw Error('Expected video path, source SHA, optional minimum seconds');
const file = resolve(input), ffmpeg = process.env.PERFECT_FFMPEG ?? 'ffmpeg', ffprobe = process.env.PERFECT_FFPROBE ?? 'ffprobe';
const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-count_frames', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 4_000_000 }));
const video = probe.streams.find(s => s.codec_type === 'video');
assert.ok(video, 'No video stream');
const duration = Number(probe.format.duration);
assert.ok(Number.isFinite(duration) && duration >= Number(minimumSeconds), 'Recording is too short');
assert.ok(video.width >= 800 && video.height >= 550, 'Recording dimensions are too small');
assert.ok(Number(video.nb_read_frames) > 0, 'No decodable frames');
execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 300000 });
const frames = join(dirname(file), basename(file) + '-frames');
await mkdir(frames, { recursive: true });
const times = [...new Set([0.25, duration * 0.25, duration * 0.5, duration * 0.75, Math.max(0, duration - 0.25)].map(t => Math.min(duration - 0.02, t)))];
for (let i = 0; i < times.length; i++)
  execFileSync(ffmpeg, ['-v', 'error', '-ss', String(times[i]), '-i', file, '-frames:v', '1', '-y', join(frames, `frame-${i}.png`)], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 60000 });
const bytes = await readFile(file);
const result = {
  passed: true, sourceCommit, file: basename(file), bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  durationSeconds: duration, width: video.width, height: video.height,
  averageFrameRate: video.avg_frame_rate, nominalFrameRate: video.r_frame_rate,
  decodedFrames: Number(video.nb_read_frames), codec: video.codec_name,
  recordingMethod: 'Unaccelerated real screen capture; no interpolation or synthetic timeline',
  frameTimesSeconds: times, fullDecodeErrors: [],
  inspection: 'Decoded original frames exported. Independent visual inspection is still required; this report does not approve appearance or interaction quality.',
};
await writeFile(file + '.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
