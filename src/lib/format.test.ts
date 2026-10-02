import { expect, test } from 'vitest';
import { formatTime, livePosition } from './format';

test('formatTime', () => {
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(65.9)).toBe('1:05');
  expect(formatTime(3723)).toBe('1:02:03');
  expect(formatTime(NaN)).toBe('0:00');
  expect(formatTime(-3)).toBe('0:00');
});

test('livePosition extrapolates only while playing and caps at duration', () => {
  expect(livePosition({ playing: true, currentTime: 10, duration: 100 }, 1000, 3000)).toBe(12);
  expect(livePosition({ playing: false, currentTime: 10, duration: 100 }, 1000, 3000)).toBe(10);
  expect(livePosition({ playing: true, currentTime: 99, duration: 100 }, 0, 10_000)).toBe(100);
  expect(livePosition({ playing: true, currentTime: 5, duration: 0 }, 0, 1000)).toBe(6);
});
