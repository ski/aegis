import { describe, expect, it } from 'vitest';
import { label } from '../src/label.ts';
import { combinePrivileges, declassify, endorse, makePrivilege } from '../src/privilege.ts';

describe('declassification / endorsement as scoped capabilities', () => {
  it('declassify removes only the tags the privilege owns', () => {
    const priv = makePrivilege({ declassifies: ['medical'] });
    const out = declassify(label(['medical', 'salaries']), priv);
    expect([...out.secrecy]).toEqual(['salaries']); // medical lowered, salaries untouched
  });

  it('a privilege cannot lower a tag it does not own (the (a) axiom for IFC)', () => {
    const priv = makePrivilege({ declassifies: ['medical'] });
    const out = declassify(label(['salaries']), priv);
    expect(out.secrecy.has('salaries')).toBe(true);
  });

  it('endorse clears only the taints the privilege owns', () => {
    const priv = makePrivilege({ endorses: ['untrusted-web'] });
    const out = endorse(label([], ['untrusted-web', 'untrusted-email']), priv);
    expect([...out.taints]).toEqual(['untrusted-email']);
  });

  it('declassify does not touch the taint axis (and vice versa)', () => {
    const d = makePrivilege({ declassifies: ['medical'] });
    const out = declassify(label(['medical'], ['untrusted-web']), d);
    expect(out.secrecy.has('medical')).toBe(false);
    expect(out.taints.has('untrusted-web')).toBe(true); // taints untouched by a declassify privilege
  });

  it('combined privileges union what each may declassify/endorse', () => {
    const p = combinePrivileges(makePrivilege({ declassifies: ['medical'] }), makePrivilege({ declassifies: ['salaries'], endorses: ['untrusted-web'] }));
    const out = declassify(label(['medical', 'salaries']), p);
    expect(out.secrecy.size).toBe(0);
    expect(p.endorses.has('untrusted-web')).toBe(true);
  });
});
