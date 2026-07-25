"use server";

import { createInitialClinic, registerAccount } from "@/shared/auth";

export async function registerAction(input: unknown) {
  return registerAccount(input);
}

export async function createInitialClinicAction(input: unknown) {
  return createInitialClinic(input);
}
