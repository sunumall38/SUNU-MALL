// Copie de `frontend/src/lib/phone.ts` — à déplacer dans `packages/shared`.
const SENEGAL_COUNTRY_CODE = "221";

/** Exemple affiché sous les champs téléphone. */
export const SENEGAL_PHONE_EXAMPLE = "77 123 45 67";

/**
 * Normalise un numéro sénégalais au format E.164 (+221XXXXXXXXX), avec les
 * mêmes règles que le backend (`apps/users/phone.py`). Renvoie null si le
 * numéro n'a pas 9 chiffres une fois l'indicatif retiré.
 */
export function normalizeSenegalPhone(value: string): string | null {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(SENEGAL_COUNTRY_CODE)) digits = digits.slice(SENEGAL_COUNTRY_CODE.length);
  else if (digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length === 9 ? `+${SENEGAL_COUNTRY_CODE}${digits}` : null;
}

export const SENEGAL_PHONE_ERROR = `Numéro sénégalais à 9 chiffres, par exemple ${SENEGAL_PHONE_EXAMPLE}`;
