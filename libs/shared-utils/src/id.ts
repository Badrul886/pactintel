import { v7 as uuidv7 } from 'uuid';

/**
 * Generates an application-layer UUIDv7 identifier.
 * Required for all internal primary keys (Blueprint D-05, X-14).
 * Never use database default gen_random_uuid().
 */
export const generateId = (): string => uuidv7();

/**
 * Validates whether a given string is a valid UUID format.
 */
export const isValidUuid = (value: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
};
