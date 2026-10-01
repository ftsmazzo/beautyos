export class FormError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505";
}
