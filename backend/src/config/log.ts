/** Strip `user:password@` from a Mongo URI before logging it. */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/[^:@/]+:[^@/]+@/, "//***:***@");
}
