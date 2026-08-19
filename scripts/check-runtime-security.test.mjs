import { describe, expect, it } from 'vitest'
import { evaluateAudit, filterTolerableProblems, validateExceptions } from './check-runtime-security.mjs'

const now = new Date('2026-07-25T12:00:00Z')

describe('runtime security gate', () => {
  it('rejects incomplete and expired exceptions', () => {
    expect(() => validateExceptions({ schemaVersion: 1, exceptions: [{ package: 'sharp' }] }, now)).toThrow('must include')
    expect(() => validateExceptions({
      schemaVersion: 1,
      exceptions: [{
        package: 'sharp',
        advisory: 'GHSA-example',
        owner: 'release',
        expires: '2026-07-24',
        rationale: 'Compatibility work in progress.',
      }],
    }, now)).toThrow('expired')
  })

  it('requires an active package-and-advisory match', () => {
    const audit = {
      vulnerabilities: {
        sharp: {
          name: 'sharp',
          severity: 'high',
          range: '<0.35.0',
          via: [{ source: 1234, url: 'https://github.com/advisories/GHSA-example' }],
        },
      },
    }
    const active = validateExceptions({
      schemaVersion: 1,
      exceptions: [{
        package: 'sharp',
        advisory: 'GHSA-example',
        owner: 'SysAdminDoc',
        expires: '2026-08-01',
        rationale: 'Pinned upstream compatibility test is pending.',
      }],
    }, now)

    expect(evaluateAudit(audit, [])).toEqual([{
      package: 'sharp',
      severity: 'high',
      range: '<0.35.0',
      advisories: ['1234', 'GHSA-example'],
    }])
    expect(evaluateAudit(audit, active)).toEqual([])
  })

  it('tolerates optional platform-fallback orphans but blocks real graph problems', () => {
    const root = '/home/runner/work/BetterTTS/BetterTTS'
    const lockfile = {
      packages: {
        'node_modules/@emnapi/runtime': { version: '1.11.1', optional: true },
        'node_modules/@img/sharp-wasm32': { version: '0.35.0', optional: true },
        'node_modules/leftover-stranger': { version: '2.0.0' },
        'node_modules/a/node_modules/nested-optional': { version: '0.1.0', optional: true },
      },
    }

    const problems = [
      `extraneous: @emnapi/runtime@1.11.1 ${root}/node_modules/@emnapi/runtime`,
      `extraneous: @img/sharp-wasm32@0.35.0 ${root}/node_modules/@img/sharp-wasm32`,
      `extraneous: leftover-stranger@2.0.0 ${root}/node_modules/leftover-stranger`,
      `missing: required-dep@1.0.0, required by bettertts@0.24.0`,
      `invalid: react@19.0.0, required by app@1.0.0`,
      `extraneous: nested-optional@0.1.0 ${root}/node_modules/a/node_modules/nested-optional`,
    ]

    expect(filterTolerableProblems(problems, lockfile, root)).toEqual([
      `extraneous: leftover-stranger@2.0.0 ${root}/node_modules/leftover-stranger`,
      `missing: required-dep@1.0.0, required by bettertts@0.24.0`,
      `invalid: react@19.0.0, required by app@1.0.0`,
    ])
  })
})
