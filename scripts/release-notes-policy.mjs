export function assertReleaseNotes(body, name = 'Release notes') {
  if (!body.trim()) throw new Error(`${name}: release notes are empty`)
  if (body.trim().split(/\s+/).length > 200) throw new Error(`${name}: keep release notes within 200 words`)
  if ((body.match(/^\s*[-*] /gm) || []).length > 8) throw new Error(`${name}: use at most eight user-facing bullets`)
  if (/^#{1,6}\s+.*\b(validation|verification|tests?|testing|build results|development report)\b/im.test(body)
    || /github\.com\/[^\s)]+\/actions\/runs\/|\b\d+\s+tests?\s+passed\b|\.(?:test|spec)\.[cm]?[jt]sx?\b|```/i.test(body)) {
    throw new Error(`${name}: keep test/build reports in PRs and technical documentation`)
  }
}
