import { describe, expect, it } from 'vitest';

import { EMPTY_MATH_BUFFER, mathBackspace, mathInsert, mathMove } from '../src/mathKeyboard';

describe('math keyboard buffer', () => {
  it('types at the cursor and honours the template cursor', () => {
    let b = mathInsert(EMPTY_MATH_BUFFER, 'int(|, x)');
    expect(b).toEqual({ text: 'int(, x)', cursor: 4 });
    b = mathInsert(b, 'x^2');
    expect(b).toEqual({ text: 'int(x^2, x)', cursor: 7 });
  });

  it('deletes a whole function name', () => {
    const b = mathInsert(EMPTY_MATH_BUFFER, '2sin(');
    expect(mathBackspace(b)).toEqual({ text: '2', cursor: 1 });
    expect(mathBackspace({ text: 'x+1', cursor: 3 })).toEqual({ text: 'x+', cursor: 2 });
    expect(mathBackspace({ text: 'x', cursor: 0 })).toEqual({ text: 'x', cursor: 0 });
  });

  it('moves the cursor inside the text', () => {
    expect(mathMove({ text: 'ab', cursor: 1 }, -5).cursor).toBe(0);
    expect(mathMove({ text: 'ab', cursor: 1 }, 5).cursor).toBe(2);
  });
});
