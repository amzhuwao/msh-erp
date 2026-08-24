import { AppError } from "./errors.js";

export function assertGuestIdentity(input: {
  nationality?: string | null;
  nationalId?: string | null;
  passportNumber?: string | null;
}) {
  if (!input.nationality?.trim()) {
    throw new AppError(400, "GST-002", "Nationality is required on registration");
  }
  if (!input.nationalId?.trim() && !input.passportNumber?.trim()) {
    throw new AppError(400, "GST-003", "National ID or passport number is required on registration");
  }
}
