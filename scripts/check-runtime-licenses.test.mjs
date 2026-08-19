import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPECTED_LICENSES, findMissingRuntimeLicenses, isPlatformOptionalPackage, readLicenseRows, validateLicenseTable } from './check-runtime-licenses.mjs'

describe('runtime license table', () => {
  it('covers every direct production dependency', () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    expect(findMissingRuntimeLicenses(packageJson)).toEqual([])
  })

  it('fails when a new runtime dependency is absent from the table', () => {
    const packageJson = { dependencies: { 'known-runtime': '^1.0.0', 'new-runtime': '^2.0.0' } }
    const entries = [['known-runtime', 'MIT']]

    expect(findMissingRuntimeLicenses(packageJson, entries)).toEqual(['new-runtime'])
    expect(() => validateLicenseTable(packageJson, entries)).toThrow('new-runtime')
    expect(EXPECTED_LICENSES.length).toBeGreaterThan(0)
  })

  it('tolerates platform-specific optional packages that are not installed', () => {
    // `sherpa-onnx-win-x64` is a Windows-only optional native binary in the lockfile;
    // `sherpa-onnx-node` itself is a regular (non-optional) package.
    expect(isPlatformOptionalPackage('sherpa-onnx-win-x64')).toBe(true)
    expect(isPlatformOptionalPackage('sherpa-onnx-node')).toBe(false)

    // readLicenseRows must not throw on platforms where the win-x64 binary is absent;
    // it falls back to the authoritative SPDX value declared in the license table.
    const rows = readLicenseRows()
    const winRow = rows.find((row) => row.name === 'sherpa-onnx-win-x64')
    expect(winRow).toBeDefined()
    expect(winRow.actual).toBe(winRow.expected)
  })
})
