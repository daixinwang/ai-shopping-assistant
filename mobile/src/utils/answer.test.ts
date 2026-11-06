import { describe, expect, it } from 'vitest';
import { parseAnswer } from './answer';

const full = JSON.stringify({
  opening: '为你推荐了 2 款通勤耳机',
  items: [
    { productId: 'p1', description: '降噪稳定，地铁里也清净' },
    { productId: 'p2', description: '续航扎实，一周一充' },
  ],
  followup: ['推荐更平价的', '对比一下前两款'],
});

describe('parseAnswer', () => {
  it('reads a complete answer', () => {
    expect(parseAnswer(full)).toEqual({
      kind: 'json',
      complete: true,
      opening: '为你推荐了 2 款通勤耳机',
      reasons: { p1: '降噪稳定，地铁里也清净', p2: '续航扎实，一周一充' },
      followups: ['推荐更平价的', '对比一下前两款'],
    });
  });

  it('shows the opening while it is still being written', () => {
    const answer = parseAnswer('{"opening": "为你推荐了 2 款');
    expect(answer.kind).toBe('json');
    expect(answer.complete).toBe(false);
    expect(answer.opening).toBe('为你推荐了 2 款');
  });

  it('streams a product reason before the item is closed', () => {
    const cut = full.indexOf('一周一充');
    const answer = parseAnswer(full.slice(0, cut + 2));
    expect(answer.reasons).toEqual({ p1: '降噪稳定，地铁里也清净', p2: '续航扎实，一周' });
  });

  it('keeps follow-ups hidden until the answer is complete', () => {
    const answer = parseAnswer(full.slice(0, full.indexOf('对比')));
    expect(answer.followups).toEqual([]);
  });

  it('tolerates a cut inside a key, an escape or a unicode escape', () => {
    expect(parseAnswer('{"open').opening).toBe('');
    expect(parseAnswer('{"opening": "引号\\"内').opening).toBe('引号"内');
    expect(parseAnswer('{"opening": "a\\u4f').opening).toBe('a');
    expect(parseAnswer('{"opening": "换行\\n第二行"}').opening).toBe('换行\n第二行');
  });

  it('accepts a short preface before the JSON object', () => {
    expect(parseAnswer('好的：{"opening": "为你挑了 1 款", "items": [], "followup": []}').opening).toBe('为你挑了 1 款');
  });

  it('treats prose as a plain-text answer', () => {
    expect(parseAnswer('这款耳机整体口碑不错。')).toEqual({
      kind: 'text', complete: true, opening: '这款耳机整体口碑不错。', reasons: {}, followups: [],
    });
  });

  it('starts empty for an empty stream', () => {
    expect(parseAnswer('')).toMatchObject({ kind: 'text', opening: '' });
    expect(parseAnswer('{')).toMatchObject({ kind: 'json', opening: '', complete: false });
  });
});
