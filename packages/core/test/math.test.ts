import { describe, expect, it } from 'vitest';

import { hasMath, mathSources, plainText, splitMathSegments } from '../src/math';

describe('splitMathSegments', () => {
  it('returns the plain text as one segment', () => {
    expect(splitMathSegments('Hello world')).toEqual([
      { type: 'text', value: 'Hello world', block: false },
    ]);
  });

  it('returns nothing for an empty text', () => {
    expect(splitMathSegments('')).toEqual([]);
  });

  it('splits inline math from the text around it', () => {
    expect(splitMathSegments('What is $x^2$?')).toEqual([
      { type: 'text', value: 'What is ', block: false },
      { type: 'math', value: 'x^2', block: false },
      { type: 'text', value: '?', block: false },
    ]);
  });

  it('splits block math from the text around it', () => {
    expect(splitMathSegments('Energy:\n$$E = mc^2$$\nThat is it.')).toEqual([
      { type: 'text', value: 'Energy:\n', block: false },
      { type: 'math', value: 'E = mc^2', block: true },
      { type: 'text', value: '\nThat is it.', block: false },
    ]);
  });

  it('keeps the escaped dollar sign as text', () => {
    expect(splitMathSegments('It costs \\$5 today')).toEqual([
      { type: 'text', value: 'It costs $5 today', block: false },
    ]);
  });

  it('keeps an escaped dollar sign next to math', () => {
    expect(splitMathSegments('\\$5 and $x$')).toEqual([
      { type: 'text', value: '$5 and ', block: false },
      { type: 'math', value: 'x', block: false },
    ]);
  });

  it('keeps a dollar sign that is never closed as text', () => {
    expect(splitMathSegments('It costs $5')).toEqual([
      { type: 'text', value: 'It costs $5', block: false },
    ]);
  });

  it('keeps an empty math as text', () => {
    expect(splitMathSegments('a $ b')).toEqual([{ type: 'text', value: 'a $ b', block: false }]);
  });

  it('keeps a dollar sign that is closed on another line as text', () => {
    expect(splitMathSegments('a $x\ny$ b')).toEqual([
      { type: 'text', value: 'a $x\ny$ b', block: false },
    ]);
  });

  it('keeps an unfinished block as text', () => {
    expect(splitMathSegments('a $$x')).toEqual([{ type: 'text', value: 'a $$x', block: false }]);
  });

  it('reads the heat equation of the tests', () => {
    const segments = splitMathSegments(
      '$\\frac{dT}{dt} = \\frac{\\partial T}{\\partial t} + \\vec{V}\\cdot\\nabla T$',
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual({
      type: 'math',
      value: '\\frac{dT}{dt} = \\frac{\\partial T}{\\partial t} + \\vec{V}\\cdot\\nabla T',
      block: false,
    });
  });

  it('reads a question with math and a long answer', () => {
    const segments = splitMathSegments(
      'Diffusion term representing molecular heat conduction in $\\nabla^2 T$',
    );

    expect(segments[0]).toEqual({
      type: 'text',
      value: 'Diffusion term representing molecular heat conduction in ',
      block: false,
    });
    expect(segments[1]).toEqual({ type: 'math', value: '\\nabla^2 T', block: false });
  });

  it('never returns an empty segment', () => {
    const segments = splitMathSegments('$$a$$$$b$$');
    for (const segment of segments) {
      expect(segment.value).not.toBe('');
    }
  });
});

describe('hasMath', () => {
  it('is false for a plain text', () => {
    expect(hasMath('Just words')).toBe(false);
  });

  it('is false for an escaped dollar sign', () => {
    expect(hasMath('It costs \\$5')).toBe(false);
  });

  it('is true for inline math', () => {
    expect(hasMath('What is $x$?')).toBe(true);
  });

  it('is true for block math', () => {
    expect(hasMath('$$x$$')).toBe(true);
  });
});

describe('plainText', () => {
  it('drops the math and keeps the text', () => {
    expect(plainText('What is $x^2$?')).toBe('What is ?');
  });

  it('keeps the escaped dollar signs', () => {
    expect(plainText('It costs \\$5 and $x$')).toBe('It costs $5 and ');
  });
});

describe('mathSources', () => {
  it('returns the LaTeX of every math part', () => {
    expect(mathSources('a $b$ c $$d$$ e')).toEqual(['b', 'd']);
  });

  it('returns nothing for a plain text', () => {
    expect(mathSources('a b c')).toEqual([]);
  });
});
