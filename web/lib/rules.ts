// Voting rules from the shared plan. The contract enforces them; the UI only explains them.
// Spending limits and payment shares come from get_config, not from here.
export const RULES = {
  fundAtYes: 3,
  rejectAtNo: 2,
  deliveryAgree: 2,
} as const;
