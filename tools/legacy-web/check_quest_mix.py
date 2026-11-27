"""Compare scheduled Ruffle mixed output with original quest MP3s."""

import argparse
from base64 import b64decode
import json
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import fftconvolve


REFERENCES = {
    'title': 'bgm/ulbgm01.mp3',
    'battle': 'bgm/bgm000.mp3',
    'dice': 'se/ulse07.mp3',
    'phase': 'se/ulse12.mp3',
    'lose': 'se/ulse15.mp3',
    'win': 'se/ulse16.mp3',
}
DOWNSAMPLE = 4
TEMPLATE_SECONDS = 0.45


def reconstruct(chunks):
    rates = {chunk['rate'] for chunk in chunks}
    if len(rates) != 1:
        raise ValueError('Expected one AudioContext sample rate')
    rate = rates.pop()
    if type(rate) is not int or not 8000 <= rate <= 192000 or rate % DOWNSAMPLE:
        raise ValueError(f'Unsupported sample rate {rate}')
    start = chunks[0]['when']
    last = 0
    total_samples = 0
    samples = []
    for chunk in chunks:
        offset = round((chunk['when'] - start) * rate)
        values = np.frombuffer(b64decode(chunk['pcm'], validate=True), dtype='<i2')
        if not 0 <= offset <= offset + len(values) <= rate * 80:
            raise ValueError('Capture samples fall outside the supported 80-second window')
        samples.append((offset, values))
        last = max(last, offset + len(values))
        total_samples += len(values)
    output = np.zeros(last, dtype=np.float32)
    present = np.zeros(last, dtype=bool)
    for offset, values in samples:
        output[offset:offset + len(values)] = values / 32767.0
        present[offset:offset + len(values)] = True
    usable = last - last % DOWNSAMPLE
    decimated = output[:usable].reshape(-1, DOWNSAMPLE).mean(axis=1)
    covered = present[:usable].reshape(-1, DOWNSAMPLE).all(axis=1)
    print(f'{len(chunks)} chunks | PCM context {rate} Hz | duration {last / rate:.3f}s | '
          f'gaps {np.count_nonzero(~present) / rate:.3f}s | overlapping {max(0, total_samples - present.sum()) / rate:.3f}s')
    return decimated, covered, rate // DOWNSAMPLE, start


def decode(reference, rate):
    raw = subprocess.check_output([
        'ffmpeg', '-nostdin', '-loglevel', 'error', '-i', str(reference), '-t', '10',
        '-ac', '1', '-ar', str(rate), '-f', 'f32le', 'pipe:1',
    ])
    return np.frombuffer(raw, dtype='<f4')


def compare(signal, covered, rate, reference):
    width = round(rate * TEMPLATE_SECONDS)
    if len(signal) < width or len(reference) < width:
        return []
    sample_step = round(rate * 0.15)
    regions = []
    for offset in range(0, len(reference) - width + 1, sample_step):
        template = reference[offset:offset + width].astype(float)
        template -= template.mean()
        energy = np.linalg.norm(template)
        regions.append((offset, template, energy))
    max_energy = max((energy for _, _, energy in regions), default=0)
    sums = np.r_[0, np.cumsum(signal, dtype=float)]
    sq_sums = np.r_[0, np.cumsum(signal * signal, dtype=float)]
    rolling_variance = sq_sums[width:] - sq_sums[:-width] - (sums[width:] - sums[:-width]) ** 2 / width
    coverage = np.r_[0, np.cumsum(covered)]
    usable = (rolling_variance > width * 0.0005 ** 2) & (coverage[width:] - coverage[:-width] >= width * 0.90)
    scores = []
    for offset, template, energy in regions:
        if energy <= max_energy * 0.15 or energy <= 0.001:
            continue
        dot = fftconvolve(signal, template[::-1], mode='valid')
        score = np.full(len(dot), -1.0)
        score[usable] = dot[usable] / (energy * np.sqrt(rolling_variance[usable]))
        best = int(np.argmax(score))
        if score[best] >= 0.0:
            scores.append((float(score[best]), offset / rate, (best - offset) / rate))
    return sorted(scores, reverse=True)


def main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument('capture', type=Path)
    options.add_argument('--sound-directory', type=Path, required=True, help='Original assets/public/sound directory')
    options.add_argument('--asset', action='append', choices=REFERENCES)
    args = options.parse_args()
    if args.capture.stat().st_size > 48 * 1024 * 1024:
        options.error('capture exceeds the supported file size')
    data = json.loads(args.capture.read_text(encoding='utf-8'))
    if data.get('errors'):
        print(f'Capture hook errors: {data["errors"]}')
    if not data.get('chunks'):
        raise SystemExit('No audio chunks found')
    chunks = sorted(data['chunks'], key=lambda chunk: chunk['when'])
    signal, covered, rate, start = reconstruct(chunks)
    for mark in data.get('marks', []):
        print(f'Mark {mark["name"]}: latest captured AudioContext time {mark["time"]:.3f}s')
    print(f'Analysis interval starts at AudioContext {start:.3f}s')
    for name in args.asset or REFERENCES:
        ref = decode(args.sound_directory / REFERENCES[name], rate)
        peaks = compare(signal, covered, rate, ref)
        if not peaks:
            print(f'{name:6} no qualifying window')
            continue
        best, _, onset = peaks[0]
        matching = sorted((s, w) for s, w, t in peaks if abs(onset - t) < 0.1 and s > 0.28)
        print(f'{name:6} peak {best:.3f} | estimated cue start {start + onset:.3f}s | '
              f'aligned windows {len(matching)} | '
              f'top reference ranges {", ".join(f"{w:.2f}s:{s:.3f}" for s, w in matching[-5:]) or "—"}')


if __name__ == '__main__':
    main()
