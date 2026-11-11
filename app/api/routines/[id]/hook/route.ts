/** Slice (a): deliberately disabled until forced owner-approval context is reviewed end to end.
 * No secret lookup, body consumption, admission, execution or management is reachable here yet. */
export function POST() {
  return Response.json({ error: "Routine event triggers are not available yet." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
